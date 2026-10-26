'use strict';
/* KalMydas PERSO : comptes de trading (courtiers MT4 et MT5, sociétés de financement type FTMO).
   On dépose le rapport d'historique du terminal : le panneau en tire les dépôts, les retraits, le résultat des trades et le solde.
   Dépôt net = dépôts moins retraits. Gain = solde moins dépôt net.
   MT4 : Historique du compte, clic droit, Rapport détaillé (HTML). MT5 : onglet Historique, clic droit, Rapport (HTML ou XLSX en CSV). */

const MT_BAL = /^(balance|solde|saldo)$/i, MT_CRED = /^(credit|crédit|bonus)$/i, MT_TRADE = /^(buy|sell|achat|vente)$/i;
const cellTexts = tr => [...tr.cells].map(c => c.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').trim());
const isMtDate = s => /^\d{4}[.\-]\d{2}[.\-]\d{2}/.test(s || '');
const mtDay = s => s.slice(0, 10).replace(/\./g, '-');
const mtNum = s => { const n = parseAmount(s); return Number.isFinite(n) ? n : null; };

function mtFromRows(rows) {
  const ops = [], trades = [];
  let balance = null, hdr = null;
  rows.forEach(c => {
    const low = c.map(x => x.toLowerCase());
    if (low.includes('deal') && low.includes('profit') && low.includes('type')) { // en-tête MT5 : on repère les colonnes par leur nom
      hdr = {}; low.forEach((x, i) => { if (!(x in hdr)) hdr[x] = i; }); return;
    }
    if (hdr && isMtDate(c[0])) { // ligne de deals MT5
      const ti = c.findIndex((x, i) => i > 0 && (MT_BAL.test(x) || MT_CRED.test(x) || MT_TRADE.test(x) || /^(charge|correction|commission|interest|dividend|tax|fee)/i.test(x)));
      if (ti < 0) return;
      const type = c[ti], nums = c.slice(ti + 1).map(mtNum).filter(v => v !== null), day = mtDay(c[0]);
      if (MT_BAL.test(type)) { if (nums.length >= 1) ops.push({ date: day, amt: nums[nums.length >= 2 ? nums.length - 2 : 0] }); if (nums.length >= 2) balance = nums[nums.length - 1]; return; }
      if (MT_CRED.test(type)) return; // crédit ou bonus du courtier : ni dépôt ni résultat
      if (c.length === Object.keys(hdr).length) {
        const g = k => (hdr[k] !== undefined ? mtNum(c[hdr[k]]) || 0 : 0), res = g('profit') + g('commission') + g('fee') + g('swap') + g('taxes');
        const dir = hdr.direction !== undefined ? c[hdr.direction].toLowerCase() : '';
        trades.push({ date: day, res, closed: MT_TRADE.test(type) ? /out/.test(dir) : true });
        const b = hdr.balance !== undefined ? mtNum(c[hdr.balance]) : null; if (b !== null) balance = b;
      }
      return;
    }
    if (!hdr && isMtDate(c[1]) && c.length >= 5) { // ligne de rapport MT4 : ticket, heure, type, ...
      const type = c[2];
      if (MT_BAL.test(type)) { const v = mtNum(c[c.length - 1]); if (v !== null) ops.push({ date: mtDay(c[1]), amt: v }); }
      else if (MT_TRADE.test(type) && c.length >= 14 && isMtDate(c[8])) { // trade clos : l'heure de clôture est remplie
        const res = (mtNum(c[10]) || 0) + (mtNum(c[11]) || 0) + (mtNum(c[12]) || 0) + (mtNum(c[13]) || 0);
        trades.push({ date: mtDay(c[8]), res, closed: true });
      }
      return;
    }
    if (!hdr) { const i = low.findIndex(x => /^(balance|solde):?$/.test(x)); if (i >= 0 && c[i + 1] && mtNum(c[i + 1]) !== null) balance = mtNum(c[i + 1]); } // récapitulatif MT4
  });
  if (!ops.length && !trades.length) return null;
  const closed = trades.filter(t => t.closed), dep = sum(ops.filter(o => o.amt > 0), o => o.amt), wd = -sum(ops.filter(o => o.amt < 0), o => o.amt), pnl = sum(trades, t => t.res);
  const dates = [...ops, ...trades].map(x => x.date).sort();
  return { dep: r2(dep), wd: r2(wd), pnl: r2(pnl), n: closed.length, from: dates[0], to: dates[dates.length - 1], balance: balance !== null ? r2(balance) : r2(dep - wd + pnl), balanceRead: balance !== null };
}
function parseTradingReport(text) {
  const head = text.slice(0, 6000);
  if (/<table/i.test(text) && /(Closed Transactions|Closed P\/L|\bDeals?\b|Trade History Report|Historique des trades|Transactions fermées|Detailed Statement)/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return mtFromRows([...doc.querySelectorAll('tr')].map(cellTexts));
  }
  if (/\bDeal\b/.test(head) && /\bDirection\b/.test(head) && /\bProfit\b/.test(head)) { // export CSV d'un rapport MT5
    const delim = [';', '\t', ','].map(d => [d, (head.split(d).length - 1)]).sort((a, b) => b[1] - a[1])[0][0];
    return mtFromRows(splitCSV(text.replace(/^﻿/, ''), delim).map(r => r.map(x => x.trim())));
  }
  return null;
}
function applyTrading(acc, t, opts) {
  acc.deposit = r2(t.dep - t.wd);
  if (opts.balance && t.balanceRead) acc.bal = r2(t.balance);
  acc.trading = { dep: t.dep, wd: t.wd, pnl: t.pnl, n: t.n, from: t.from, to: t.to, at: Date.now() };
}

/* Encart de la vue d'ensemble : tous les comptes de trading, côte à côte */
function tradingPanel() {
  const list = A().accounts.filter(a => a.trading);
  if (!list.length) return null;
  const rows = list.map(a => { const net = a.trading.dep - a.trading.wd, gain = a.bal - net; return { a, net, gain, rate: accRate(a) }; });
  const totNet = sum(rows, r => r.net * r.rate), totBal = sum(rows, r => r.a.bal * r.rate), totGain = totBal - totNet;
  return h('section', { class: 'card' }, h('h3', null, 'Comptes de trading'),
    h('div', { class: 'list' }, rows.map(r => h('div', { class: 'item' },
      h('div', { class: 'grow' }, h('b', null, r.a.name), h('small', { class: 'muted' }, ` déposé net ${fmtNum(r.net)} · retiré ${fmtNum(r.a.trading.wd)} · ${r.a.trading.n} trades, résultat ${sgn(r.a.trading.pnl)} · au ${shortDate(r.a.trading.to)}`)),
      h('div', { class: `right ${r.gain >= 0 ? 'pos' : 'neg'}` }, h('span', { class: 'amt' }, `${fmtNum(r.a.bal)} (${sgn(r.gain)}${r.net > 0 ? ` · ${fmtPct((r.gain / r.net) * 100)}` : ''})`))))),
    h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, 'Total, en CHF')), h('div', { class: `right ${totGain >= 0 ? 'pos' : 'neg'}` }, h('span', { class: 'amt' }, `${fmtNum(totBal)} (${sgn(totGain)}${totNet > 0 ? ` · ${fmtPct((totGain / totNet) * 100)}` : ''})`))),
    h('small', { class: 'muted' }, 'Gain = solde moins dépôt net. Pour une société de financement (FTMO), ce que tu as vraiment mis est le prix du défi : corrige le dépôt dans Modifier si tu veux le suivre ainsi.'));
}
const ACCOUNT_PRESET = [['Revolut', 'banque'], ['Raiffeisen', 'banque'], ['PU Prime', 'courtier'], ['JustMarkets', 'courtier'], ['RaiseFX', 'courtier'], ['RoboForex', 'courtier'], ['FTMO', 'courtier'], ['VT Markets', 'courtier'], ['Axi', 'courtier'], ['TauroMarket', 'courtier'], ['Valetax', 'courtier']];
