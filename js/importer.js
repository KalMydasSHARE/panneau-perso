'use strict';
/* KalMydas PERSO : import de relevés. Banque ou courtier, en un geste : on dépose le fichier téléchargé depuis l'e-banking.
   Formats lus : CAMT.053 / CAMT.052 (ISO 20022, le format des banques suisses), MT940, OFX / QFX, CSV (séparateur et colonnes devinés).
   Tout se passe dans le navigateur. Rien n'est envoyé nulle part. Les doublons sont écartés, on peut relancer le même relevé. */

const DEFAULT_RULES = [
  ['coop', 'Courses'], ['migros', 'Courses'], ['denner', 'Courses'], ['aldi', 'Courses'], ['lidl', 'Courses'], ['manor', 'Courses'], ['carrefour', 'Courses'], ['leclerc', 'Courses'], ['spar ', 'Courses'],
  ['mcdonald', 'Restaurants'], ['starbucks', 'Restaurants'], ['restaurant', 'Restaurants'], ['uber eats', 'Restaurants'], ['just eat', 'Restaurants'], ['café', 'Restaurants'], ['boulangerie', 'Restaurants'],
  ['sbb', 'Transport'], ['cff', 'Transport'], ['tpg', 'Transport'], ['bls', 'Transport'], ['uber', 'Transport'], ['shell', 'Transport'], ['avia', 'Transport'], ['agrola', 'Transport'], ['parking', 'Transport'], ['mobility', 'Transport'],
  ['netflix', 'Abonnements'], ['spotify', 'Abonnements'], ['apple.com', 'Abonnements'], ['google', 'Abonnements'], ['disney', 'Abonnements'], ['swisscom', 'Abonnements'], ['sunrise', 'Abonnements'], ['salt mobile', 'Abonnements'], ['youtube', 'Abonnements'], ['openai', 'Abonnements'], ['anthropic', 'Abonnements'],
  ['css ', 'Santé'], ['helsana', 'Santé'], ['sanitas', 'Santé'], ['visana', 'Santé'], ['groupe mutuel', 'Santé'], ['axa', 'Santé'], ['pharmacie', 'Santé'], ['apotheke', 'Santé'], ['médecin', 'Santé'], ['dentiste', 'Santé'],
  ['loyer', 'Logement'], ['miete', 'Logement'], ['régie', 'Logement'], ['regie', 'Logement'], ['charges', 'Logement'], ['impôt', 'Impôts'], ['steuer', 'Impôts'], ['administration fiscale', 'Impôts'],
  ['frais de tenue', 'Frais bancaires'], ['gebühr', 'Frais bancaires'], ['commission', 'Frais bancaires'], ['frais', 'Frais bancaires'],
  ['salaire', 'Salaire'], ['lohn', 'Salaire'], ['dividende', 'Autre entrée'], ['intérêt', 'Autre entrée'], ['zins', 'Autre entrée']
];
const normTxt = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
function guessCat(desc, amt) {
  const d = ' ' + normTxt(desc) + ' ';
  for (const r of [...(A().rules || []), ...DEFAULT_RULES]) { if (d.includes(normTxt(r[0]))) return r[1]; }
  return amt >= 0 ? 'Autre entrée' : 'Autre dépense';
}

/* ----- lecture des nombres et des dates ----- */
function parseAmount(s) {
  if (s === null || s === undefined) return NaN;
  let x = String(s).trim().replace(/[A-Za-z€$£\s '’]/g, '');
  if (!x) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(x)) { neg = true; x = x.slice(1, -1); }
  if (x.endsWith('-')) { neg = true; x = x.slice(0, -1); }
  if (x.startsWith('-')) { neg = !neg; x = x.slice(1); } else if (x.startsWith('+')) x = x.slice(1);
  const lc = x.lastIndexOf(','), ld = x.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) x = lc > ld ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (lc >= 0) x = /,\d{1,2}$/.test(x) ? x.replace(/,/g, m => '.').replace(/\.(?=.*\.)/g, '') : x.replace(/,/g, '');
  const n = parseFloat(x);
  return Number.isFinite(n) ? (neg ? -n : n) : NaN;
}
function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/)) && !/[.\/-]/.test(s.slice(0, 8))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/))) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  if ((m = s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2})\b/))) return `20${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return null;
}

/* ----- CAMT.053 / CAMT.052 ----- */
function parseCamt(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('XML illisible');
  const all = (el, n) => [...el.getElementsByTagNameNS('*', n)], one = (el, n) => (el ? all(el, n)[0] : undefined);
  const rows = [];
  for (const e of all(doc, 'Ntry')) {
    const sts = one(e, 'Sts'); if (sts && /PDNG|INFO/i.test(sts.textContent.trim())) continue; // seules les écritures comptabilisées
    const amtEl = one(e, 'Amt'), cd = one(e, 'CdtDbtInd'); if (!amtEl || !cd) continue;
    let amt = Math.abs(parseFloat(amtEl.textContent)); if (/DBIT/i.test(cd.textContent)) amt = -amt;
    const rv = one(e, 'RvslInd'); if (rv && /true|1/i.test(rv.textContent)) amt = -amt;
    const bd = one(e, 'BookgDt'), vd = one(e, 'ValDt');
    const date = parseDate((bd && (one(bd, 'Dt') || one(bd, 'DtTm')) || {}).textContent) || parseDate((vd && (one(vd, 'Dt') || one(vd, 'DtTm')) || {}).textContent);
    if (!date) continue;
    const parts = [];
    for (const n of ['Nm', 'Ustrd', 'AddtlTxInf', 'AddtlNtryInf']) all(e, n).forEach(x => { const t = x.textContent.trim(); if (t && !parts.includes(t)) parts.push(t); });
    const ref = (one(e, 'AcctSvcrRef') || one(e, 'NtryRef') || {}).textContent;
    rows.push({ date, amt, desc: parts.join(' · ') || 'Mouvement', ref: ref ? ref.trim() : '' });
  }
  return rows;
}

/* ----- MT940 ----- */
function parseMT940(text) {
  const rows = [], lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^:61:(\d{6})(\d{4})?(RC|RD|C|D)[A-Z]?([\d,]+)/);
    if (!m) continue;
    let amt = parseAmount(m[4]); if (!Number.isFinite(amt)) continue;
    if (m[3][m[3].length - 1] === 'D') amt = -amt;
    if (m[3][0] === 'R') amt = -amt; // annulation
    const yy = +m[1].slice(0, 2), date = `${yy < 70 ? 2000 + yy : 1900 + yy}-${m[1].slice(2, 4)}-${m[1].slice(4, 6)}`;
    let ref = (lines[i].match(/\/\/(\S+)/) || [])[1] || '', desc = '';
    for (let j = i + 1; j < lines.length && !/^:(61|62|60)/.test(lines[j]); j++) { if (/^:86:/.test(lines[j])) desc = lines[j].slice(4); else if (!/^:/.test(lines[j]) && desc) desc += ' ' + lines[j]; }
    rows.push({ date, amt, desc: desc.replace(/\?\d{2}/g, ' ').replace(/\s+/g, ' ').trim() || 'Mouvement', ref });
  }
  return rows;
}

/* ----- OFX / QFX ----- */
function parseOFX(text) {
  const rows = [];
  for (const b of text.split(/<STMTTRN>/i).slice(1)) {
    const f = t => { const m = b.match(new RegExp(`<${t}>\\s*([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
    const amt = parseAmount(f('TRNAMT')), date = parseDate(f('DTPOSTED'));
    if (!Number.isFinite(amt) || !date) continue;
    rows.push({ date, amt, desc: [f('NAME'), f('MEMO')].filter(Boolean).join(' · ') || 'Mouvement', ref: f('FITID') });
  }
  return rows;
}

/* ----- CSV : séparateur et colonnes devinés ----- */
function splitCSV(text, delim) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}
const HDR = { date: /(date|datum|buchung|valeur|valuta|booking|booked)/i, desc: /(libell|texte|text|descr|beschreib|mitteil|detail|motif|b[ée]n[ée]ficiaire|empf|zahlungszweck|nom|name|memo|reference|r[ée]f[ée]rence)/i,
  amount: /(montant|betrag|amount|net|valeur nette)/i, debit: /(d[ée]bit|belastung|sortie|retrait|ausgang)/i, credit: /(cr[ée]dit|gutschrift|entr[ée]e|d[ée]p[ôo]t|eingang)/i, bad: /(solde|saldo|balance|devise|currency|w[äa]hrung)/i };
function guessColumns(header) {
  const col = { date: -1, desc: [], amount: -1, debit: -1, credit: -1 };
  header.forEach((h0, i) => {
    const hname = normTxt(h0);
    if (!hname || HDR.bad.test(hname)) return;
    const hasD = HDR.debit.test(hname), hasC = HDR.credit.test(hname);
    if (hasD && hasC) { if (col.amount < 0) col.amount = i; } // « Credit/Debit Amount » : un montant signé
    else if (hasD) { if (col.debit < 0) col.debit = i; }
    else if (hasC) { if (col.credit < 0) col.credit = i; }
    else if (HDR.amount.test(hname) && col.amount < 0) col.amount = i;
    else if (HDR.date.test(hname)) { if (col.date < 0 || /compta|buchung|booking|booked|transaction|completed/.test(hname)) col.date = i; }
    else if (HDR.desc.test(hname)) col.desc.push(i);
  });
  return col;
}
function parseCSV(text, forced) {
  const first = text.split('\n').slice(0, 12).join('\n');
  const delim = [';', '\t', ',', '|'].map(d => [d, (first.match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const all = splitCSV(text.replace(/^﻿/, ''), delim);
  let h0 = all.findIndex(r => r.length >= 3 && r.filter(c => HDR.date.test(normTxt(c)) || HDR.amount.test(normTxt(c)) || HDR.debit.test(normTxt(c)) || HDR.credit.test(normTxt(c))).length >= 2);
  if (h0 < 0) h0 = 0;
  const header = all[h0], body = all.slice(h0 + 1);
  const col = forced || guessColumns(header);
  const stI = header.findIndex(x => /^(state|status|statut|etat|état)$/i.test((x || '').trim()));
  const rows = [];
  for (const r of body) {
    if (stI >= 0 && /revert|pending|declin|fail|cancel|refus|annul|attente/i.test(r[stI] || '')) continue; // mouvements qui n'ont pas eu lieu
    const date = parseDate(r[col.date]);
    let amt = col.amount >= 0 ? parseAmount(r[col.amount]) : NaN;
    if (!Number.isFinite(amt)) { const dd = col.debit >= 0 ? parseAmount(r[col.debit]) : NaN, cc = col.credit >= 0 ? parseAmount(r[col.credit]) : NaN; if (Number.isFinite(dd) && dd !== 0) amt = -Math.abs(dd); else if (Number.isFinite(cc)) amt = Math.abs(cc); }
    if (!date || !Number.isFinite(amt) || amt === 0) continue;
    const row = { date, amt, desc: (col.desc.length ? col.desc : [r.length > 1 ? 1 : 0]).map(i => (r[i] || '').trim()).filter(Boolean).join(' · ') || 'Mouvement', ref: '' };
    if (r.some(x => /^(exchange|transfer|topup|top-up|virement interne)$/i.test((x || '').trim()))) row.cat = '(ignorer)'; // change ou virement entre tes propres poches : ni revenu ni dépense
    rows.push(row);
  }
  return { rows, header, col };
}

function parseStatement(text, forcedCols) {
  const tr = parseTradingReport(text);
  if (tr) return { format: 'rapport de trading MT4 / MT5', trading: tr, rows: [] };
  if (/<(\w+:)?Document|BkToCstmrStmt|BkToCstmrAcctRpt/i.test(text.slice(0, 4000))) return { format: 'CAMT (ISO 20022)', rows: parseCamt(text) };
  if (/^:20:|\n:61:/m.test(text)) return { format: 'MT940', rows: parseMT940(text) };
  if (/<OFX>|OFXHEADER|<STMTTRN>/i.test(text.slice(0, 6000))) return { format: 'OFX', rows: parseOFX(text) };
  const c = parseCSV(text, forcedCols);
  return { format: 'CSV', rows: c.rows, header: c.header, col: c.col };
}
async function readFileText(file) {
  const buf = await file.arrayBuffer(), u = new Uint8Array(buf);
  if (u[0] === 0xff && u[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf); // rapports MetaTrader 5
  if (u[0] === 0xfe && u[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); } // exports suisses souvent en Windows-1252
}

/* ----- fenêtre d'import ----- */
function importDialog() {
  if (!A().accounts.length) return toast("Crée d'abord le compte (onglet Comptes)");
  const st = { acc: A().accounts[0].id, text: null, name: '', res: null, cols: null, adjust: false, learn: true };
  const body = h('div', { class: 'form' });
  const file = h('input', { type: 'file', accept: '.xml,.camt,.sta,.mt940,.940,.ofx,.qfx,.csv,.txt,.tsv', onchange: async e => { const f = e.target.files[0]; if (!f) return; st.name = f.name; try { st.text = await readFileText(f); st.cols = null; analyse(); } catch (err) { toast(`Lecture impossible : ${err.message}`); } } });
  let close;
  function analyse() {
    let res; try { res = parseStatement(st.text, st.cols); } catch (err) { body.replaceChildren(h('p', { class: 'neg' }, `Fichier non lu : ${err.message}`)); return; }
    st.res = res; draw();
  }
  const catList = () => [...new Set([...CAT_OUT, ...CAT_IN, 'Remboursement dette', ...Object.keys(A().budgets), ...A().tx.map(t => t.cat).filter(Boolean)])];
  function plan() { // lignes préparées : doublons écartés, catégorie devinée
    if (!st.res) return [];
    const have = new Set(A().tx.map(t => t.ref).filter(Boolean)), seen = {}, out = [];
    for (const r of st.res.rows) {
      const base = r.ref ? `${st.acc}|r|${r.ref}` : `${st.acc}|${r.date}|${r.amt}|${normTxt(r.desc).slice(0, 60)}`;
      seen[base] = (seen[base] || 0) + 1;
      const ref = `${base}|${seen[base]}`;
      out.push({ ...r, ref, dup: have.has(ref), cat: r.cat || guessCat(r.desc, r.amt) });
    }
    return out;
  }
  function drawTrading() {
    const t = st.res.trading, a = accById(st.acc), net = t.dep - t.wd;
    body.replaceChildren(
      field('Compte concerné', sel(A().accounts.map(x => [x.id, x.name]), st.acc, { onchange: e => { st.acc = e.target.value; draw(); } })), file,
      h('p', null, h('b', null, st.name), ` · ${st.res.format} · du ${shortDate(t.from)} au ${shortDate(t.to)}`),
      h('div', { class: 'grid4' }, stat('Dépôts', money(t.dep, true)), stat('Retraits', money(t.wd, true)), stat('Résultat des trades', h('span', { class: t.pnl >= 0 ? 'pos' : 'neg' }, h('span', { class: 'amt' }, signed(t.pnl, true))), `${t.n} trades clos, frais et swaps compris`), stat('Solde du rapport', money(t.balance, true), t.balanceRead ? 'lu dans le rapport' : 'calculé : dépôts moins retraits plus résultat')),
      h('p', null, `Dépôt net ${fmtMoney(net, true)}, gain ${signed(t.balance - net, true)}${net > 0 ? ` (${fmtPct(((t.balance - net) / net) * 100)})` : ''}. Le rapport doit couvrir tout l'historique du compte, du premier dépôt à aujourd'hui.`),
      h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: st.tbal !== false, onchange: e => { st.tbal = e.target.checked; } }), 'Mettre aussi le solde du compte à jour'));
  }
  function draw() {
    if (st.res && st.res.trading) return drawTrading();
    const rows = st.rows = plan(), fresh = rows.filter(r => !r.dup);
    const cats = catList();
    body.replaceChildren(
      field('Compte concerné', sel(A().accounts.map(a => [a.id, a.name]), st.acc, { onchange: e => { st.acc = e.target.value; draw(); } })),
      file,
      st.res ? h('div', null,
        h('p', null, h('b', null, st.name), ` · format ${st.res.format} · ${rows.length} mouvement(s), du `, rows.length ? shortDate(rows.map(r => r.date).sort()[0]) : '?', ' au ', rows.length ? shortDate(rows.map(r => r.date).sort().pop()) : '?', `. ${rows.length - fresh.length} déjà présent(s), ${fresh.length} nouveau(x) : entrées `, money(sum(fresh.filter(r => r.amt > 0), r => r.amt), true), ', sorties ', money(Math.abs(sum(fresh.filter(r => r.amt < 0), r => r.amt)), true), '.'),
        st.res.format === 'CSV' && (st.res.col.date < 0 || (st.res.col.amount < 0 && st.res.col.debit < 0 && st.res.col.credit < 0)) ? colPicker() : null,
        rows.length ? h('div', { class: 'scroll imp-table' }, h('table', { class: 'week' }, h('tbody', null, rows.slice(0, 300).map(r => h('tr', { class: r.dup ? 'dup' : '' },
          h('td', null, shortDate(r.date)), h('td', { class: 'name' }, r.desc.slice(0, 70)), h('td', { class: r.amt > 0 ? 'pos' : '' }, fmtNum(r.amt)),
          h('td', null, r.dup ? h('small', { class: 'muted' }, 'déjà là') : sel([...cats, '(ignorer)'], r.cat, { onchange: e => { r.cat = e.target.value; } }))))))) : h('div', { class: 'empty' }, 'Aucun mouvement reconnu dans ce fichier.'),
        rows.length > 300 ? h('small', { class: 'muted' }, `Les ${rows.length - 300} lignes suivantes sont importées avec leur catégorie devinée.`) : null,
        h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: st.learn, onchange: e => { st.learn = e.target.checked; } }), 'Retenir mes changements de catégorie pour la prochaine fois'),
        h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: st.adjust, onchange: e => { st.adjust = e.target.checked; } }), 'Ajuster le solde du compte avec ces mouvements (laisse décoché si le solde est déjà juste)'))
        : h('small', { class: 'muted' }, 'Dans ton e-banking, télécharge le relevé en CAMT.053 (le format des banques suisses), MT940, OFX ou CSV, puis dépose-le ici. Courtier : l\'export CSV des mouvements d\'espèces (dépôts, retraits, dividendes, frais). Le fichier reste sur ton ordinateur.'));
  }
  function colPicker() {
    const hd = st.res.header || [], opt = [['-1', '(aucune)'], ...hd.map((x, i) => [String(i), x || `colonne ${i + 1}`])];
    const c = st.res.col, mk = (label, key, multi) => field(label, sel(opt, String(multi ? (c.desc[0] ?? -1) : c[key]), { onchange: e => { const v = +e.target.value; st.cols = { ...c, [key]: multi ? (v < 0 ? [] : [v]) : v }; analyse(); } }));
    return h('div', { class: 'card' }, h('small', { class: 'muted' }, "Colonnes non reconnues : indique-les."), h('div', { class: 'grid-form' }, mk('Date', 'date'), mk('Libellé', 'desc', true), mk('Montant (signé)', 'amount'), mk('Débit', 'debit'), mk('Crédit', 'credit')));
  }
  draw();
  close = modal('Importer un relevé', body, [{ label: 'Importer', run: () => {
    if (!st.res) return false;
    if (st.res.trading) { applyTrading(accById(st.acc), st.res.trading, { balance: st.tbal !== false }); commit(); toast('Compte de trading mis à jour'); return; }
    const fresh = st.rows.filter(r => !r.dup && r.cat !== '(ignorer)');
    if (!fresh.length) { toast('Rien de nouveau à importer'); return false; }
    for (const r of fresh) {
      const t = { id: uid(), date: r.date, kind: r.amt > 0 ? 'in' : 'out', amt: Math.abs(r.amt), cat: r.cat, acc: st.acc, acc2: '', debt: '', note: r.desc.slice(0, 120), ref: r.ref, imp: 1 };
      if (st.adjust) applyTx(t, 1);
      A().tx.push(t);
    }
    if (st.learn) { // une règle par libellé dont la catégorie a changé
      const rules = (A().rules = A().rules || []);
      for (const r of st.rows) { if (r.dup || r.cat === '(ignorer)') continue; const g = guessCat(r.desc, r.amt); if (r.cat !== g) { const kw = normTxt(r.desc).split(' ').filter(w => w.length > 3 && !/^(paiement|carte|debit|credit|virement|achat|payment|card|purchase)$/.test(w)).slice(0, 2).join(' '); /* le marchand, pas le mot générique du relevé */ if (kw && !rules.some(x => x[0] === kw)) rules.unshift([kw, r.cat]); } }
    }
    A().tx.sort((a, b) => a.date.localeCompare(b.date));
    commit(); toast(`${fresh.length} mouvement(s) importé(s)`);
  } }]);
}
