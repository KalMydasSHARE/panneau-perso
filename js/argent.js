'use strict';
/* KalMydas PERSO : Argent. Comptes, transactions, dettes avec plan de sortie, budget. */

const A = () => STATE.argent;
const CAT_OUT = ['Logement', 'Courses', 'Restaurants', 'Transport', 'Santé', 'Abonnements', 'Loisirs', 'Vêtements', 'Impôts', 'Frais bancaires', 'Autre dépense'];
const CAT_IN = ['Salaire', 'Kal Mydas', 'Trading', 'Remboursement reçu', 'Autre entrée'];
const ACC_TYPES = [['banque', 'Banque'], ['courtier', 'Courtier, bourse'], ['crypto', 'Crypto'], ['kalmydas', 'Kal Mydas'], ['cash', 'Espèces'], ['autre', 'Autre']];
const accById = id => A().accounts.find(a => a.id === id);
const accRate = a => (a ? a.rate || 1 : 1);
const accVal = a => a.bal * accRate(a);
const txBase = t => t.amt * accRate(accById(t.acc));
const debtsTotal = () => sum(A().debts, d => Math.max(0, d.rest));
const assetsTotal = () => sum(A().accounts, accVal);
const netWorth = () => assetsTotal() - debtsTotal();

function applyTx(t, s) {
  const a = accById(t.acc), b = accById(t.acc2), d = A().debts.find(x => x.id === t.debt);
  if (t.kind === 'in' && a) a.bal = r2(a.bal + s * t.amt);
  if ((t.kind === 'out' || t.kind === 'debt') && a) a.bal = r2(a.bal - s * t.amt);
  if (t.kind === 'xfer' && a && b) { a.bal = r2(a.bal - s * t.amt); b.bal = r2(b.bal + s * t.amt * accRate(a) / accRate(b)); }
  if (t.kind === 'debt' && d) d.rest = r2(d.rest - s * t.amt * accRate(a));
}
function snap() {
  const s = A().snaps, d = today(), n = r2(netWorth()), l = s[s.length - 1];
  if (l && l.d === d) l.net = n; else s.push({ d, net: n });
}
function commit() { snap(); save(); rerender(); }

function monthStats(mk) {
  let inc = 0, out = 0, debt = 0; const cats = {};
  for (const t of A().tx) {
    if (monthKey(t.date) !== mk) continue;
    const v = txBase(t);
    if (t.kind === 'in') inc += v;
    else if (t.kind === 'out') { out += v; const c = t.cat || 'Autre dépense'; cats[c] = (cats[c] || 0) + v; }
    else if (t.kind === 'debt') debt += v;
  }
  return { inc, out, debt, margin: inc - out, cats };
}
function kalStats() {
  const list = A().accounts.filter(a => a.type === 'kalmydas');
  const dep = sum(list, a => (a.deposit || 0) * accRate(a)), val = sum(list, accVal);
  return { list, dep, val, gain: val - dep, pct: dep > 0 ? ((val - dep) / dep) * 100 : 0 };
}
// montant dans la devise du compte ; USDC ou KAL ne sont pas des codes ISO, Intl les refuse : on écrit alors le code à la main
const fmtCur = (n, cur) => { try { return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: cur || 'CHF' }).format(n); } catch { return `${fmtNum(n)} ${cur}`; } };
const signed = (n, round) => (n > 0 ? '+' : '') + fmtMoney(n, round);

/* ---------- dettes : calculs ---------- */
function payoffMonths(P, rate, pay) {
  if (P <= 0) return 0;
  if (pay <= 0) return Infinity;
  const r = rate / 1200;
  if (r === 0) return P / pay;
  if (pay <= P * r) return Infinity;
  return -Math.log(1 - (P * r) / pay) / Math.log(1 + r);
}
function neededPay(P, rate, n) {
  if (P <= 0) return 0;
  n = Math.max(1, n);
  const r = rate / 1200;
  return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
}
function addMonthsDate(s, n) { const d = parseD(s); d.setMonth(d.getMonth() + Math.ceil(n)); return ymd(d); }
function debtPlan(d) {
  const rest = Math.max(0, d.rest);
  const proj = payoffMonths(rest, d.rate || 0, d.pay || 0);
  const out = { rest, proj, projDate: Number.isFinite(proj) ? addMonthsDate(today(), proj) : null, need: null, late: null };
  if (d.target && rest > 0) {
    const n = Math.max(1, Math.ceil(monthsBetween(today(), d.target)));
    out.n = n; out.need = neededPay(rest, d.rate || 0, n);
    out.late = Number.isFinite(proj) ? proj - n : Infinity;
  }
  return out;
}
function capacity() { // marge mensuelle moyenne des trois derniers mois ayant des entrees
  const now = monthKey(today()); const vals = [];
  for (let i = 1; i <= 6 && vals.length < 3; i++) { const m = monthStats(addMonths(now, -i)); if (m.inc > 0 || m.out > 0) vals.push(m.margin); }
  if (!vals.length) { const m = monthStats(now); if (m.inc > 0 || m.out > 0) vals.push(m.margin); }
  return vals.length ? sum(vals) / vals.length : null;
}

/* ---------- module ---------- */
let curMonth = monthKey(today());
const setMonth = m => { curMonth = m; rerender(); };
const TXF = { kind: 'out', date: today(), amt: '', cat: '', acc: '', acc2: '', debt: '', note: '' };
const TXQ = { kind: 'all', q: '' };

MODULES.argent = {
  title: 'Argent',
  subs: [['vue', "Vue d'ensemble"], ['comptes', 'Comptes'], ['tx', 'Transactions'], ['dettes', 'Dettes'], ['budget', 'Budget']],
  render(root, sub) {
    ({ vue: vueArgent, comptes: vueComptes, tx: vueTx, dettes: vueDettes, budget: vueBudget }[sub] || vueArgent)(root);
  }
};

/* ----- vue d'ensemble ----- */
function vueArgent(root) {
  const net = netWorth(), ms = monthStats(monthKey(today())), k = kalStats(), debts = A().debts.filter(d => d.rest > 0);
  root.append(
    h('div', { class: 'grid4' },
      stat('Patrimoine net', money(net, true), 'comptes moins dettes'),
      stat('Sur tes comptes', money(assetsTotal(), true), `${A().accounts.length} compte(s) et plateforme(s)`),
      stat('Dettes restantes', money(debtsTotal(), true), debts.length ? `${debts.length} dette(s) en cours` : 'aucune dette en cours'),
      stat(`Marge de ${MOIS[parseD(today()).getMonth()]}`, money(ms.margin, true), ms.inc > 0 ? `${fmtPct((ms.margin / ms.inc) * 100, 0)} des entrées` : "pas d'entrée saisie ce mois")),
    kalPanel(k),
    ...[tradingPanel()].filter(Boolean), /* null ferait écrire « null » à l écran */
    h('div', { class: 'cols' },
      h('section', { class: 'card' }, h('h3', null, 'Patrimoine net dans le temps'),
        lineChart(A().snaps.slice(-90).map(s => ({ x: shortDate(s.d), y: s.net })))),
      h('section', { class: 'card' }, h('h3', null, 'Entrées et dépenses, six mois'),
        barPairs(Array.from({ length: 6 }, (_, i) => { const m = addMonths(monthKey(today()), i - 5), s = monthStats(m); return { label: MOIS[Number(m.slice(5)) - 1].slice(0, 3), a: s.inc, b: s.out }; })),
        h('div', { class: 'legend' }, h('i', { class: 'sw in' }), ' entrées ', h('i', { class: 'sw out' }), ' dépenses'))),
    h('section', { class: 'card' }, h('h3', null, 'Où est ton argent'), platforms()));
}
function kalPanel(k) {
  const body = !k.list.length
    ? h('p', { class: 'muted' }, 'Ajoute un compte de type « Kal Mydas » (onglet Comptes) avec ton dépôt et sa valeur actuelle. Tu verras ton gain et ton pourcentage ici.')
    : h('div', null,
      h('div', { class: 'kal-nums' },
        h('div', null, h('small', null, 'Déposé dans l\'app'), h('div', { class: 'huge' }, money(k.dep, true))),
        h('div', null, h('small', null, 'Gain en direct'), h('div', { class: `huge ${k.gain >= 0 ? 'pos' : 'neg'}` }, h('span', { class: 'amt' }, signed(k.gain, true)))),
        h('div', null, h('small', null, 'Pourcentage'), h('div', { class: `huge ${k.gain >= 0 ? 'pos' : 'neg'}` }, h('span', { class: 'amt' }, (k.pct > 0 ? '+' : '') + fmtPct(k.pct))))),
      h('p', { class: 'muted' }, 'Valeur actuelle ', money(k.val, true), '.'),
      h('div', { class: 'row wrap' }, k.list.map(a => a.auto
        ? h('div', { class: 'chip-row' }, h('b', null, a.name), h('small', { class: 'muted' }, a.chain ? `lu à ${new Date(a.chain.at).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })}` : ''),
          h('button', { class: 'btn small', onclick: () => syncKal(false) }, 'Actualiser'))
        : h('div', { class: 'chip-row' }, h('b', null, a.name),
          h('button', { class: 'btn small', onclick: () => kalValue(a) }, 'Nouvelle valeur'),
          h('button', { class: 'btn small ghost', onclick: () => kalDeposit(a) }, 'Nouveau dépôt')))),
      chainDetail());
  return h('section', { class: 'card gold' }, h('div', { class: 'row between' }, h('h3', null, 'Kal Mydas, en direct'),
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => ((STATE.settings.wallets || []).length ? syncKal(false) : editWallets()) }, 'Lire sur Base'), h('button', { class: 'btn small ghost', onclick: editWallets }, 'Mes adresses'))), body);
}
function kalValue(a) {
  const v = inp('text', String(a.bal), { inputmode: 'decimal' });
  modal(`Valeur actuelle de ${a.name}`, field(`Valeur (${a.cur || 'CHF'})`, v), [{ label: 'Enregistrer', run: () => { a.bal = r2(num(v.value)); commit(); } }]);
}
function kalDeposit(a) {
  const v = inp('text', '', { inputmode: 'decimal', placeholder: '0' });
  modal(`Nouveau dépôt dans ${a.name}`, [field('Montant déposé', v, 'Il s\'ajoute au dépôt total et à la valeur. Si tu en as retiré, mets un montant négatif.')],
    [{ label: 'Ajouter', run: () => { const n = num(v.value); if (!n) return false; a.deposit = r2((a.deposit || 0) + n); a.bal = r2(a.bal + n); commit(); } }]);
}
function platforms() {
  const list = A().accounts.slice().sort((x, y) => accVal(y) - accVal(x)), tot = Math.max(1, sum(list, a => Math.max(0, accVal(a))));
  if (!list.length) return h('div', { class: 'empty' }, 'Aucun compte. Ajoute tes banques, courtiers, wallets et espèces dans l\'onglet Comptes.');
  return h('div', { class: 'list' }, list.map(a => h('div', { class: 'item' },
    h('div', { class: 'grow' }, h('b', null, a.name), h('small', { class: 'muted' }, ' ', typeLabel(a.type)), progress((Math.max(0, accVal(a)) / tot) * 100)),
    h('div', { class: 'right' }, money(accVal(a), true), h('small', { class: 'muted' }, fmtPct((Math.max(0, accVal(a)) / tot) * 100, 0))))));
}
const typeLabel = t => (ACC_TYPES.find(x => x[0] === t) || [0, 'Autre'])[1];

/* ----- comptes ----- */
function vueComptes(root) {
  root.append(h('div', { class: 'row between' }, h('h2', null, 'Comptes et plateformes'), h('button', { class: 'btn', onclick: () => editAccount() }, '+ Ajouter')));
  if (!A().accounts.length) root.append(h('div', { class: 'empty' }, "Rien pour l'instant. Ajoute chaque endroit où tu as de l'argent : banque, courtier, crypto, Kal Mydas, espèces.", h('div', null, h('button', { class: 'btn small', onclick: () => { for (const [name, type] of ACCOUNT_PRESET) A().accounts.push({ id: uid(), name, type, bal: 0, cur: 'CHF', rate: 1, deposit: 0, note: '' }); commit(); } }, 'Ajouter mes banques et courtiers'))));
  root.append(h('div', { class: 'list' }, A().accounts.map(a => {
    const gain = a.deposit > 0 ? a.bal - a.deposit : null;
    return h('div', { class: 'card item acc' },
      h('div', { class: 'grow' },
        h('b', null, a.name), h('small', { class: 'muted' }, ' ', typeLabel(a.type), a.cur && a.cur !== 'CHF' ? ` · ${a.cur}` : ''),
        gain !== null ? h('div', { class: gain >= 0 ? 'pos' : 'neg' }, h('small', null, 'Dépôt '), money(a.deposit * accRate(a), true), h('small', null, ' · gain '), h('span', { class: 'amt' }, signed(gain * accRate(a), true), ' (', fmtPct((gain / a.deposit) * 100), ')')) : null,
        a.note ? h('div', { class: 'muted small' }, a.note) : null),
      h('div', { class: 'right' }, h('div', { class: 'big' }, h('span', { class: 'amt' }, fmtCur(a.bal, a.cur))),
        a.cur && a.cur !== 'CHF' ? h('small', { class: 'muted' }, '≈ ', money(accVal(a), true)) : null),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => kalValue(a) }, 'Solde'),
        h('button', { class: 'btn small ghost', onclick: () => editAccount(a) }, 'Modifier'),
        h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Supprimer ${a.name} ? Les transactions restent mais ne touchent plus ce compte.`)) { A().accounts = A().accounts.filter(x => x !== a); commit(); } } }, 'Supprimer')));
  })));
}
function editAccount(a) {
  const n = !a, o = a || { name: '', type: 'banque', bal: 0, cur: 'CHF', rate: 1, deposit: 0, note: '' };
  const f = {
    name: inp('text', o.name, { placeholder: 'Ex. UBS courant' }), type: sel(ACC_TYPES, o.type), bal: inp('text', String(o.bal), { inputmode: 'decimal' }),
    cur: inp('text', o.cur || 'CHF', { maxlength: 5 }), rate: inp('text', String(o.rate || 1), { inputmode: 'decimal' }),
    deposit: inp('text', String(o.deposit || 0), { inputmode: 'decimal' }), note: inp('text', o.note || '')
  };
  modal(n ? 'Nouveau compte' : `Modifier ${o.name}`, h('div', { class: 'form' },
    field('Nom', f.name), field('Type', f.type), field('Solde actuel', f.bal),
    h('div', { class: 'two' }, field('Devise', f.cur), field('Taux vers CHF', f.rate, '1 si CHF')),
    field('Dépôt total mis dedans', f.deposit, 'Optionnel. Sert à calculer le gain et le pourcentage (Kal Mydas, courtier, crypto).'),
    field('Note', f.note)),
    [{ label: 'Enregistrer', run: () => {
      if (!f.name.value.trim()) return false;
      const v = { name: f.name.value.trim(), type: f.type.value, bal: r2(num(f.bal.value)), cur: (f.cur.value.trim() || 'CHF').toUpperCase(), rate: num(f.rate.value) || 1, deposit: r2(num(f.deposit.value)), note: f.note.value.trim() };
      if (v.cur === 'CHF') v.rate = 1;
      if (n) A().accounts.push({ id: uid(), ...v }); else Object.assign(a, v);
      commit();
    } }]);
}

/* ----- transactions ----- */
function vueTx(root) {
  const box = h('section', { class: 'card' });
  const draw = () => {
    const F = TXF, accs = [['', '(aucun compte)'], ...A().accounts.map(a => [a.id, a.name])];
    const cats = [...new Set([...CAT_OUT, ...CAT_IN, ...A().tx.map(t => t.cat).filter(Boolean)])];
    const dl = h('datalist', { id: 'cats' }, cats.map(c => h('option', { value: c })));
    const f = {
      date: inp('date', F.date), amt: inp('text', F.amt, { inputmode: 'decimal', placeholder: '0.00' }), cat: inp('text', F.cat, { list: 'cats', placeholder: F.kind === 'in' ? 'Salaire' : 'Courses' }),
      acc: sel(accs, F.acc), acc2: sel(accs, F.acc2), debt: sel([['', '(choisir)'], ...A().debts.map(d => [d.id, d.name])], F.debt), note: inp('text', F.note, { placeholder: 'Note, lieu, détail' })
    };
    const read = () => { F.date = f.date.value; F.amt = f.amt.value; F.cat = f.cat.value; F.acc = f.acc.value; F.acc2 = f.acc2.value; F.debt = f.debt.value; F.note = f.note.value; };
    box.replaceChildren(h('div', { class: 'row between' }, h('h3', null, 'Ajouter'), h('button', { class: 'btn small', onclick: importDialog }, 'Importer un relevé')),
      seg([['out', 'Dépense'], ['in', 'Entrée'], ['xfer', 'Virement'], ['debt', 'Dette']], F.kind, k => { read(); F.kind = k; draw(); }),
      h('div', { class: 'form grid-form' },
        field('Date', f.date), field('Montant', f.amt),
        F.kind === 'xfer' || F.kind === 'debt' ? null : field('Catégorie', f.cat),
        field(F.kind === 'xfer' ? 'Du compte' : 'Compte', f.acc),
        F.kind === 'xfer' ? field('Vers le compte', f.acc2) : null,
        F.kind === 'debt' ? field('Dette remboursée', f.debt) : null,
        field('Note', f.note)), dl,
      h('button', { class: 'btn', onclick: () => {
        read();
        const amt = r2(num(F.amt));
        if (amt <= 0) return toast('Mets un montant');
        if (F.kind === 'xfer' && (!F.acc || !F.acc2 || F.acc === F.acc2)) return toast('Choisis deux comptes différents');
        if (F.kind === 'debt' && !F.debt) return toast('Choisis la dette');
        const t = { id: uid(), date: F.date || today(), kind: F.kind, amt, cat: F.kind === 'debt' ? 'Remboursement dette' : F.kind === 'xfer' ? 'Virement' : F.cat.trim() || (F.kind === 'in' ? 'Autre entrée' : 'Autre dépense'), acc: F.acc, acc2: F.kind === 'xfer' ? F.acc2 : '', debt: F.kind === 'debt' ? F.debt : '', note: F.note.trim() };
        applyTx(t, 1); A().tx.push(t); F.amt = ''; F.note = ''; F.cat = ''; curMonth = monthKey(t.date); commit(); toast('Ajouté');
      } }, 'Ajouter'));
  };
  draw();
  const ms = monthStats(curMonth);
  const list = A().tx.filter(t => monthKey(t.date) === curMonth && (TXQ.kind === 'all' || t.kind === TXQ.kind) && (!TXQ.q || `${t.cat} ${t.note}`.toLowerCase().includes(TXQ.q.toLowerCase())))
    .sort((x, y) => (y.date + y.id).localeCompare(x.date + x.id));
  const q = inp('search', TXQ.q, { placeholder: 'Chercher', oninput: e => { TXQ.q = e.target.value; clearTimeout(q._t); q._t = setTimeout(() => { rerender(); setTimeout(() => { const el = $('input[type=search]'); if (el) { el.focus(); el.setSelectionRange(99, 99); } }, 0); }, 250); } });
  root.append(box,
    h('div', { class: 'row between wrap' }, monthNav(curMonth, setMonth),
      h('div', { class: 'row' }, sel([['all', 'Tout'], ['out', 'Dépenses'], ['in', 'Entrées'], ['xfer', 'Virements'], ['debt', 'Dettes']], TXQ.kind, { onchange: e => { TXQ.kind = e.target.value; rerender(); } }), q)),
    h('div', { class: 'grid4' }, stat('Entrées', money(ms.inc, true), '', 'pos'), stat('Dépenses', money(ms.out, true), '', 'neg'), stat('Dettes remboursées', money(ms.debt, true)), stat('Marge', money(ms.margin, true))),
    list.length ? h('div', { class: 'list' }, list.map(t => {
      const a = accById(t.acc), b = accById(t.acc2), d = A().debts.find(x => x.id === t.debt);
      const sign = t.kind === 'in' ? '+' : t.kind === 'xfer' ? '' : '−';
      return h('div', { class: 'card item' },
        h('small', { class: 'muted date' }, shortDate(t.date)),
        h('div', { class: 'grow' }, h('b', null, t.cat), t.note ? h('span', { class: 'muted' }, ' · ', t.note) : null,
          h('div', { class: 'muted small' }, t.kind === 'xfer' ? `${a ? a.name : '?'} vers ${b ? b.name : '?'}` : t.kind === 'debt' ? `${d ? d.name : 'dette supprimée'}${a ? ' · ' + a.name : ''}` : a ? a.name : '')),
        h('div', { class: `right ${t.kind === 'in' ? 'pos' : t.kind === 'out' ? 'neg' : ''}` }, h('span', { class: 'amt' }, `${sign}${fmtNum(t.amt)}`, h('small', null, ' ', a && a.cur ? a.cur : 'CHF'))),
        h('button', { class: 'icon', 'aria-label': 'Supprimer', onclick: () => { if (confirm('Supprimer cette transaction ? Le solde du compte est remis comme avant.')) { applyTx(t, -1); A().tx = A().tx.filter(x => x !== t); commit(); } } }, '🗑'));
    })) : h('div', { class: 'empty' }, 'Aucune transaction ce mois-ci.'));
}

/* ----- dettes ----- */
function vueDettes(root) {
  const debts = A().debts, live = debts.filter(d => d.rest > 0).sort((x, y) => (y.rate || 0) - (x.rate || 0) || x.rest - y.rest);
  const need = sum(live, d => (debtPlan(d).need || 0)), pay = sum(live, d => d.pay || 0), cap = capacity();
  const allDates = live.map(d => debtPlan(d).projDate).filter(Boolean).sort();
  root.append(h('div', { class: 'row between' }, h('h2', null, 'Dettes'), h('button', { class: 'btn', onclick: () => editDebt() }, '+ Ajouter une dette')));
  if (live.length) {
    root.append(h('section', { class: 'card gold' }, h('h3', null, 'Plan de sortie'),
      h('div', { class: 'grid4' },
        stat('Reste à payer', money(debtsTotal(), true)),
        stat('Mensualités prévues', money(pay, true), 'total de tes mensualités'),
        stat('Nécessaire pour tenir les dates', money(need, true), need ? 'par mois, toutes dettes' : 'pas de date cible posée'),
        stat('Dernière dette finie', allDates.length ? shortDate(allDates[allDates.length - 1]) : '–', live.some(d => !Number.isFinite(debtPlan(d).proj)) ? 'une dette ne baisse pas' : 'au rythme actuel')),
      cap !== null ? h('p', null, 'Ta marge moyenne est ', h('b', null, money(cap, true)), ' par mois. ',
        need > 0 ? (cap >= need ? h('span', { class: 'pos' }, 'Elle couvre ce qu\'il faut pour tenir tes dates.') : h('span', { class: 'neg' }, `Il manque ${fmtMoney(need - cap, true)} par mois pour tenir tes dates : baisse les dépenses (onglet Budget) ou repousse une date.`)) : null)
        : h('p', { class: 'muted' }, 'Saisis quelques mois d\'entrées et de dépenses : le plan comparera ta marge à ce qu\'il faut rembourser.'),
      h('p', { class: 'muted' }, 'Ordre conseillé pour payer en plus : ', live.map((d, i) => `${i + 1}. ${d.name}${d.rate ? ` (${fmtNum(d.rate)} %)` : ''}`).join('  '), '. On attaque d\'abord le taux le plus haut.')));
  }
  if (!debts.length) root.append(h('div', { class: 'empty' }, 'Aucune dette. Ajoute chaque dette avec son reste à payer, son taux et la date où tu veux en être sorti.'));
  root.append(h('div', { class: 'list' }, debts.map(d => {
    const p = debtPlan(d), done = d.init > 0 ? clamp(((d.init - Math.max(0, d.rest)) / d.init) * 100, 0, 100) : 0;
    let verdict;
    if (p.rest <= 0) verdict = h('span', { class: 'chip ok' }, 'Remboursée');
    else if (p.need === null) verdict = h('span', { class: 'chip' }, 'Pas de date cible');
    else if (p.late <= 0.5) verdict = h('span', { class: 'chip ok' }, 'Dans les temps');
    else verdict = h('span', { class: 'chip bad' }, Number.isFinite(p.late) ? `En retard de ${Math.ceil(p.late)} mois` : 'Ne baisse pas');
    return h('div', { class: 'card debt' },
      h('div', { class: 'row between' }, h('div', null, h('b', null, d.name), d.who ? h('small', { class: 'muted' }, ' · ', d.who) : null), verdict),
      h('div', { class: 'big' }, money(Math.max(0, d.rest), true), h('small', { class: 'muted' }, ' restant sur ', fmtMoney(d.init, true))),
      progress(done, 'gold'),
      h('div', { class: 'facts' },
        h('div', null, h('small', null, 'Taux'), h('b', null, fmtPct(d.rate || 0))),
        h('div', null, h('small', null, 'Ta mensualité'), h('b', null, money(d.pay || 0, true))),
        h('div', null, h('small', null, d.target ? `Pour finir le ${shortDate(d.target)}` : 'Date cible'), h('b', null, p.need !== null ? h('span', null, money(p.need, true), ' /mois') : '–')),
        h('div', null, h('small', null, 'À ton rythme'), h('b', null, p.rest <= 0 ? '–' : p.projDate ? `fini le ${shortDate(p.projDate)}` : 'jamais'))),
      d.note ? h('div', { class: 'muted small' }, d.note) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => payDebt(d) }, 'Rembourser'),
        h('button', { class: 'btn small ghost', onclick: () => editDebt(d) }, 'Modifier'),
        h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Supprimer la dette ${d.name} ?`)) { A().debts = A().debts.filter(x => x !== d); commit(); } } }, 'Supprimer')));
  })));
}
function editDebt(d) {
  const n = !d, o = d || { name: '', who: '', init: 0, rest: 0, rate: 0, pay: 0, target: '', note: '' };
  const f = { name: inp('text', o.name), who: inp('text', o.who, { placeholder: 'À qui je dois' }), init: inp('text', String(o.init), { inputmode: 'decimal' }), rest: inp('text', String(o.rest), { inputmode: 'decimal' }), rate: inp('text', String(o.rate || 0), { inputmode: 'decimal' }), pay: inp('text', String(o.pay || 0), { inputmode: 'decimal' }), target: inp('date', o.target || ''), note: inp('text', o.note || '') };
  modal(n ? 'Nouvelle dette' : `Modifier ${o.name}`, h('div', { class: 'form' },
    field('Nom', f.name), field('Créancier', f.who), h('div', { class: 'two' }, field('Montant de départ', f.init), field('Reste à payer', f.rest, 'Vide : égal au départ')),
    h('div', { class: 'two' }, field('Taux annuel %', f.rate), field('Ta mensualité', f.pay)),
    field('Date où tu veux être sorti', f.target), field('Note', f.note)),
    [{ label: 'Enregistrer', run: () => {
      if (!f.name.value.trim()) return false;
      const init = r2(num(f.init.value)); const rest = f.rest.value.trim() === '' ? init : r2(num(f.rest.value));
      const v = { name: f.name.value.trim(), who: f.who.value.trim(), init: Math.max(init, rest), rest, rate: num(f.rate.value), pay: r2(num(f.pay.value)), target: f.target.value, note: f.note.value.trim() };
      if (n) A().debts.push({ id: uid(), ...v }); else Object.assign(d, v);
      commit();
    } }]);
}
function payDebt(d) {
  const amt = inp('text', String(d.pay || ''), { inputmode: 'decimal' }), date = inp('date', today());
  const acc = sel([['', '(sans toucher un compte)'], ...A().accounts.map(a => [a.id, a.name])], '');
  modal(`Rembourser ${d.name}`, h('div', { class: 'form' }, field('Montant', amt), field('Depuis le compte', acc), field('Date', date)),
    [{ label: 'Valider', run: () => {
      const v = r2(num(amt.value)); if (v <= 0) return false;
      const t = { id: uid(), date: date.value || today(), kind: 'debt', amt: v, cat: 'Remboursement dette', acc: acc.value, acc2: '', debt: d.id, note: d.name };
      applyTx(t, 1); A().tx.push(t); commit(); toast('Remboursement noté');
    } }]);
}

/* ----- budget ----- */
function vueBudgetSuivi(root) {
  const ms = monthStats(curMonth), prev = monthStats(addMonths(curMonth, -1)), B = A().budgets;
  const cats = [...new Set([...Object.keys(B), ...Object.keys(ms.cats)])].sort((x, y) => (ms.cats[y] || 0) - (ms.cats[x] || 0));
  const totalB = sum(Object.values(B)), top = Object.entries(ms.cats).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const nc = inp('text', '', { placeholder: 'Nouvelle catégorie' });
  root.append(h('div', { class: 'row between wrap' }, h('h2', null, 'Budget du mois'), monthNav(curMonth, setMonth)),
    h('div', { class: 'grid4' }, stat('Dépensé', money(ms.out, true), prev.out ? `${signed(ms.out - prev.out, true)} vs mois d'avant` : ''), stat('Budget posé', money(totalB, true), totalB ? `${fmtPct(totalB ? (ms.out / totalB) * 100 : 0, 0)} utilisé` : 'aucun plafond'), stat('Entrées', money(ms.inc, true)), stat('Marge', money(ms.margin, true))),
    top.length ? h('section', { class: 'card gold' }, h('h3', null, 'Pour dépenser moins'),
      h('p', null, 'Tes trois plus grosses catégories ce mois : ', top.map(([c, v]) => `${c} (${fmtMoney(v, true)})`).join(', '), '.'),
      h('p', null, 'Baisser chacune de 10 % te fait garder ', h('b', null, money(sum(top, x => x[1]) * 0.1, true)), ' de plus par mois, soit ', money(sum(top, x => x[1]) * 1.2, true), ' sur un an.')) : null,
    h('section', { class: 'card' }, h('h3', null, 'Par catégorie'),
      cats.length ? h('div', { class: 'list' }, cats.map(c => {
        const spent = ms.cats[c] || 0, lim = B[c] || 0, pct = lim ? (spent / lim) * 100 : 0, diff = spent - (prev.cats[c] || 0);
        const l = inp('text', lim ? String(lim) : '', { inputmode: 'decimal', placeholder: 'plafond', class: 'lim', onchange: e => { const v = r2(num(e.target.value)); B[c] = v > 0 ? v : 0; commit(); } });
        return h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, c), h('small', { class: 'muted' }, ' ', prev.cats[c] !== undefined || spent ? `${signed(diff, true)} vs mois d'avant` : ''), progress(lim ? pct : 0, pct > 100 ? 'bad' : pct > 80 ? 'warn' : ''), ),
          h('div', { class: 'right' }, money(spent, true), h('small', { class: 'muted' }, lim ? ` sur ` : ''), l));
      })) : h('div', { class: 'empty' }, 'Les catégories apparaissent avec tes dépenses du mois.'),
      h('div', { class: 'row' }, nc, h('button', { class: 'btn small', onclick: () => { const c = nc.value.trim(); if (c && !(c in B)) { B[c] = 0; commit(); } } }, 'Ajouter la catégorie'))));
}

/* ----- budget : le plan du mois (revenus, charges fixes, plafonds, dettes, épargne) puis le suivi ----- */
const PL = () => (A().plan = A().plan || { income: [], fixed: {}, save: 0 });
let budTab = 'plan';
function history3() { // moyenne des trois derniers mois complets qui ont des mouvements
  const now = monthKey(today()), months = [];
  for (let i = 1; i <= 6 && months.length < 3; i++) { const m = addMonths(now, -i), s = monthStats(m); if (s.inc > 0 || s.out > 0) months.push(s); }
  if (!months.length) return null;
  const n = months.length, cats = {};
  months.forEach(s => { for (const [c, v] of Object.entries(s.cats)) cats[c] = (cats[c] || 0) + v / n; });
  return { n, inc: sum(months, s => s.inc) / n, out: sum(months, s => s.out) / n, cats };
}
function vueBudget(root) {
  root.append(seg([['plan', 'Mon plan du mois'], ['suivi', 'Suivi du mois']], budTab, v => { budTab = v; rerender(); }));
  if (budTab === 'suivi') return vueBudgetSuivi(root);
  const pl = PL(), B = A().budgets, hist = history3();
  const catNames = [...new Set([...Object.keys(B), ...(hist ? Object.keys(hist.cats) : [])])];
  const incTotal = sum(pl.income, i => i.amt), isFixed = c => !!pl.fixed[c];
  const fixedTot = sum(catNames.filter(isFixed), c => B[c] || 0), varTot = sum(catNames.filter(c => !isFixed(c)), c => B[c] || 0);
  const live = A().debts.filter(d => d.rest > 0);
  const debtTot = sum(live, d => d.pay || 0), debtNeed = sum(live, d => debtPlan(d).need || 0);
  const rest = incTotal - fixedTot - varTot - debtTot - (pl.save || 0);
  const pct = n => (incTotal > 0 ? (n / incTotal) * 100 : 0);

  // 1. ce que dit l'historique
  root.append(h('section', { class: 'card gold' }, h('h3', null, 'Point de départ'),
    hist ? h('div', null,
      h('p', null, `Sur tes ${hist.n} derniers mois saisis : entrées moyennes `, money(hist.inc, true), ', dépenses moyennes ', money(hist.out, true), '.'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn', onclick: () => { if (hist.inc > 0) pl.income = [{ id: uid(), name: 'Entrées moyennes', amt: r2(hist.inc) }]; for (const [c, v] of Object.entries(hist.cats)) { B[c] = r2(v); if (/logement|loyer|abonnement|imp[oô]t|frais bancaires|assurance/i.test(c)) pl.fixed[c] = true; } commit(); toast('Plan rempli avec ta moyenne'); } }, 'Remplir avec ma moyenne'),
        h('button', { class: 'btn ghost', onclick: () => { for (const [c, v] of Object.entries(hist.cats)) if (!isFixed(c)) B[c] = r2(v * 0.9); commit(); toast('Variables à 90 % de ta moyenne'); } }, 'Serrer les variables de 10 %')))
      : h('p', { class: 'muted' }, 'Pas encore de mois complet saisi. Pose ton plan à la main, ou importe tes mouvements (onglet Transactions, Importer) pour partir de la réalité.')));

  // 2. revenus
  const ni = inp('text', '', { placeholder: 'Nom (salaire, Kal Mydas...)' }), na = inp('text', '', { inputmode: 'decimal', placeholder: 'Montant par mois' });
  root.append(h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Revenus par mois'), h('b', null, money(incTotal, true))),
    pl.income.length ? h('div', { class: 'list' }, pl.income.map(i => h('div', { class: 'item' }, h('div', { class: 'grow' }, i.name),
      inp('text', String(i.amt), { inputmode: 'decimal', class: 'lim', onchange: e => { i.amt = r2(num(e.target.value)); commit(); } }),
      h('button', { class: 'icon', 'aria-label': 'Supprimer', onclick: () => { pl.income = pl.income.filter(x => x !== i); commit(); } }, '×')))) : h('div', { class: 'empty' }, 'Ajoute ce que tu touches chaque mois, net.'),
    h('div', { class: 'row' }, ni, na, h('button', { class: 'btn small', onclick: () => { if (!ni.value.trim() || !num(na.value)) return; pl.income.push({ id: uid(), name: ni.value.trim(), amt: r2(num(na.value)) }); commit(); } }, 'Ajouter'))));

  // 3. dépenses : fixes puis variables
  const catRow = c => {
    const avg = hist && hist.cats[c] ? hist.cats[c] : 0;
    return h('div', { class: 'item' },
      h('label', { class: 'daybox', title: 'Charge fixe : même montant chaque mois' }, h('input', { type: 'checkbox', checked: isFixed(c), onchange: e => { if (e.target.checked) pl.fixed[c] = true; else delete pl.fixed[c]; commit(); } }), 'fixe'),
      h('div', { class: 'grow' }, h('b', null, c), avg ? h('small', { class: 'muted' }, ` moyenne réelle ${fmtMoney(avg, true)}`) : null),
      inp('text', B[c] ? String(B[c]) : '', { inputmode: 'decimal', placeholder: 'par mois', class: 'lim', onchange: e => { B[c] = Math.max(0, r2(num(e.target.value))); commit(); } }));
  };
  const nc = inp('text', '', { placeholder: 'Nouvelle ligne (loyer, assurance...)' }), nca = inp('text', '', { inputmode: 'decimal', placeholder: 'Par mois' });
  const sorted = catNames.slice().sort((a, b) => (isFixed(b) ? 1 : 0) - (isFixed(a) ? 1 : 0) || (B[b] || 0) - (B[a] || 0));
  root.append(h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Dépenses par mois'), h('b', null, money(fixedTot + varTot, true))),
    h('small', { class: 'muted' }, `Fixes ${fmtMoney(fixedTot, true)} · variables ${fmtMoney(varTot, true)}. Coche « fixe » pour loyer, assurances, abonnements.`),
    sorted.length ? h('div', { class: 'list' }, sorted.map(catRow)) : h('div', { class: 'empty' }, 'Ajoute tes lignes : logement, assurance maladie, courses, transport...'),
    h('div', { class: 'row' }, nc, nca, h('button', { class: 'btn small', onclick: () => { const c = nc.value.trim(); if (!c) return; B[c] = Math.max(0, r2(num(nca.value))); commit(); } }, 'Ajouter'))));

  // 4. dettes et épargne
  const sv = inp('text', pl.save ? String(pl.save) : '', { inputmode: 'decimal', placeholder: '0', class: 'lim', onchange: e => { pl.save = Math.max(0, r2(num(e.target.value))); commit(); } });
  root.append(h('section', { class: 'card' }, h('h3', null, 'Dettes et épargne'),
    h('div', { class: 'item' }, h('div', { class: 'grow' }, 'Mensualités de dettes', h('small', { class: 'muted' }, debtNeed > debtTot ? ` il faut ${fmtMoney(debtNeed, true)} pour tenir tes dates` : ' (onglet Dettes)')), h('b', null, money(debtTot, true))),
    h('div', { class: 'item' }, h('div', { class: 'grow' }, 'Épargne par mois', h('small', { class: 'muted' }, incTotal > 0 && pl.save ? ` ${fmtPct(pct(pl.save), 0)} de tes revenus` : '')), sv)));

  // 5. bilan
  const bucket = (label, n, goal, low) => h('div', { class: 'macro' }, h('div', { class: 'row between' }, h('small', null, label), h('small', null, `${fmtPct(pct(n), 0)} (repère ${goal} %)`)), progress(pct(n), low ? (pct(n) > goal ? 'warn' : '') : (pct(n) >= goal ? 'ok' : 'mid')));
  const top = catNames.filter(c => !isFixed(c)).sort((a, b) => (B[b] || 0) - (B[a] || 0)).slice(0, 3);
  root.append(h('section', { class: `card ${rest < 0 ? '' : 'gold'}` }, h('h3', null, 'Bilan du plan'),
    h('div', { class: 'grid4' }, stat('Revenus', money(incTotal, true)), stat('Dépenses, dettes, épargne', money(fixedTot + varTot + debtTot + (pl.save || 0), true)),
      stat('Reste à répartir', h('span', { class: rest < 0 ? 'neg' : 'pos' }, h('span', { class: 'amt' }, signed(rest, true))), rest < 0 ? 'le plan dépasse tes revenus' : 'non affecté')),
    incTotal > 0 ? h('div', null, bucket('Besoins (charges fixes)', fixedTot, 50, true), bucket('Envies (variables)', varTot, 30, true), bucket('Épargne et dettes', debtTot + (pl.save || 0), 20, false),
      h('small', { class: 'muted' }, 'Repère 50 / 30 / 20 : un point de comparaison, pas une loi. Ta situation peut demander autre chose.')) : null,
    rest < 0 ? h('p', { class: 'neg' }, `Il manque ${fmtMoney(-rest, true)} par mois.`, top.length ? ` Pistes : ${top.map(c => `${c} (${fmtMoney(B[c] || 0, true)})`).join(', ')}. Baisser ces trois lignes de 15 % libère ${fmtMoney(sum(top, c => B[c] || 0) * 0.15, true)}.` : '') : null,
    rest > 0 && incTotal > 0 ? h('div', { class: 'row wrap' }, h('p', null, `${fmtMoney(rest, true)} ne sont pas affectés.`),
      h('button', { class: 'btn small', onclick: () => { pl.save = r2((pl.save || 0) + rest); commit(); } }, 'Les mettre en épargne')) : null,
    debtNeed > debtTot ? h('p', { class: 'neg' }, `Tes mensualités de dettes (${fmtMoney(debtTot, true)}) sont sous ce qu'il faut pour tenir tes dates (${fmtMoney(debtNeed, true)}).`) : null));
}
