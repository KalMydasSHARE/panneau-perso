'use strict';
/* KalMydas PERSO : Nutrition, la journée. Calories et macros, 23 micronutriments, eau, jeûne, compléments, recettes, produits emballés.
   Aliments : data/ciqual.js (Ciqual 2025 de l'Anses, base suisse des valeurs nutritives de l'OSAV, trous comblés par l'USDA), plus tes propres
   aliments et les produits repris d'Open Food Facts. Une valeur absente est inconnue, jamais zéro : l'écran dit quand un total en dépend. */

const N = () => STATE.nutri;
const MEALS = ['Petit-déjeuner', 'Déjeuner', 'Collation', 'Dîner'];
const norm = normFood;
const allFoods = () => [...N().foods, ...ciqualFoods()];
// index refait si la liste de mes aliments change (autre coffre ouvert, ajout, suppression) ou si la base vient d'arriver
const foodIndex = () => { const nc = ciqualFoods().length; if (!foodIndex.m || foodIndex.a !== N().foods || foodIndex.n !== N().foods.length || foodIndex.c !== nc) { foodIndex.m = new Map(allFoods().map(f => [f.id, f])); foodIndex.a = N().foods; foodIndex.n = N().foods.length; foodIndex.c = nc; } return foodIndex.m; };
// nom sans accents ni majuscules, calculé une fois par aliment (la recherche tourne à chaque frappe sur près de 5 000 aliments)
const normNames = new WeakMap();
const normName = f => { let s = normNames.get(f); if (s === undefined || s.n !== f.n) { s = { n: f.n, v: norm(f.n) }; normNames.set(f, s); } return s.v; };
const foodById = id => foodIndex().get(id);
function targets() { // repères du profil (data/drv.js), puis calories et macros du profil, puis réglages manuels
  const auto = N().autoOff ? null : autoTargets();
  return { ...DEFAULT_TARGETS, ...rdaSet(), ...(auto || {}), ...(N().targets || {}) };
}
const KEYS = [...MACROS, ...EXTRAS, ...MICROS, ...DETAILS].map(m => m[0]);

function entryN(e) {
  if (e.n) return e.n;
  const f = foodById(e.food);
  if (!f) return {};
  const o = {}; for (const k in f.v) o[k] = f.v[k] * e.g / 100;
  return o;
}
/* t[k] = total ; t.unk[k] = nombre d'aliments dont la valeur est inconnue ; t.unkG[k] = leurs grammes ; t.g = grammes d'aliments notés ;
   t.doubt[k] = part du total qui vient d'une valeur marquée douteuse ; t.miss = repas dont l'aliment n'est plus dans la base. */
function totalsOf(entries, sups) {
  const t = Object.fromEntries(KEYS.map(k => [k, 0])); t.unk = {}; t.unkG = {}; t.doubt = {}; t.g = 0; t.miss = 0;
  for (const e of entries || []) {
    const n = entryN(e), f = e.food ? foodById(e.food) : null;
    for (const k in n) if (k in t) t[k] += n[k];
    if (e.food && !f) t.miss++;
    if (!f) continue;
    t.g += e.g;
    for (const k of KEYS) {
      if (f.v[k] === undefined) { t.unk[k] = (t.unk[k] || 0) + 1; t.unkG[k] = (t.unkG[k] || 0) + e.g; } else if (isDoubt(f, k)) t.doubt[k] = (t.doubt[k] || 0) + n[k];
    }
  }
  for (const s of N().supps) {
    const c = (sups || {})[s.id] || 0; if (!c) continue;
    for (const k in s.v) if (k in t) t[k] += s.v[k] * c * (k === 'b9' && s.b9acide ? 1.7 : 1); // acide folique : 1 µg = 1,7 µg DFE (EFSA)
  }
  return t;
}
const dayTotals = d => totalsOf(N().log[d], N().supLog[d]);
function microPct(t, tg) { return sum(MICROS_AVG, m => (tg[m[0]] > 0 ? Math.min(1, (t[m[0]] || 0) / tg[m[0]]) : 1)) / MICROS_AVG.length * 100; }
/* Nutriments dont le total du jour repose en bonne part sur de l'inconnu ou du douteux : au moins 20 % du poids des aliments notés sans valeur,
   ou au moins 20 % du total venu d'une valeur douteuse. La choline est à part (presque toujours inconnue, son encart le dit). */
function fragile(t) {
  if (!t.g) return [];
  const out = [];
  for (const [k, label] of [...MACROS, ...EXTRAS, ...MICROS.filter(m => !m[5])].map(m => [m[0], m[1]])) {
    const u = (t.unkG[k] || 0) / t.g, x = t[k] > 0 ? (t.doubt[k] || 0) / t[k] : 0;
    if (u >= 0.2) out.push({ k, label, why: `${fmtPct(u * 100, 0)} du poids noté sans valeur`, unk: true });
    else if (x >= 0.2) out.push({ k, label, why: `${fmtPct(x * 100, 0)} du total vient d'une valeur douteuse`, unk: false });
  }
  return out;
}

/* Limites hautes de sécurité (data/drv.js, champ ul). Portée « total » : aliments et compléments ; portée « compléments » : compléments seuls.
   Vitamine A : la limite vise le rétinol préformé ; la base ne sépare pas le rétinol du bêta-carotène, donc seuls les compléments comptent.
   Niacine : 10 mg pour l'acide nicotinique (forme non précisée comptée ainsi, par prudence), 900 mg pour le nicotinamide.
   Grossesse et allaitement : null veut dire que la limite adulte ne s'applique pas (pas d'alerte, pas de feu vert non plus). */
function ulAlerts(d) {
  if (!DRV_OK() || !STATE) return [];
  const p = PF(), etat = p.sex === 'f' ? (p.etat || '') : '', sups = N().supLog[d] || {};
  const fromSup = {}, b3 = { acide: 0, nam: 0 };
  for (const s of N().supps) {
    const c = sups[s.id] || 0; if (!c) continue;
    for (const k in s.v) fromSup[k] = (fromSup[k] || 0) + s.v[k] * c;
    if (s.v.b3) b3[s.b3forme === 'nicotinamide' ? 'nam' : 'acide'] += s.v.b3 * c;
  }
  const t = dayTotals(d), out = [];
  for (const m of MICROS) {
    const n = DRV.nutriments[DRV_KEY[m[0]] || m[0]], u = n && n.ul; if (!u) continue;
    const lim = etat === 'all' ? u.allaitement : etat ? u.grossesse : u.valeur;
    if (lim === null || lim === undefined) continue;
    const base = { k: m[0], nom: m[1], unite: m[2], type: u.type, note: u.note || '' };
    if (m[0] === 'b3') {
      const forme = N().supps.some(s => (sups[s.id] || 0) && s.v.b3 && !s.b3forme) ? 'acide nicotinique ou forme non précisée' : 'acide nicotinique';
      if (b3.acide > lim) out.push({ ...base, val: b3.acide, lim, portee: 'complements', forme });
      if (u.autre && b3.nam > u.autre.valeur) out.push({ ...base, val: b3.nam, lim: u.autre.valeur, portee: 'complements', forme: 'nicotinamide' });
      continue;
    }
    const supOnly = u.portee === 'complements' || m[0] === 'vA';
    const val = supOnly ? fromSup[m[0]] || 0 : t[m[0]];
    if (val > lim) out.push({ ...base, val, lim, portee: supOnly ? 'complements' : 'total', fromSup: fromSup[m[0]] || 0 });
  }
  return out;
}
const ulText = a => `${fmtNum(a.val)} ${a.unite}${a.portee === 'complements' ? ' venant des compléments' : ''}, au-dessus ${a.type === 'NS' ? 'du niveau sûr' : 'de la limite haute'} de l'EFSA (${fmtNum(a.lim)} ${a.unite}${a.forme ? ', ' + a.forme : ''})`;
function nutriDay(d) { // utilisé aussi par le Plan et le Panneau
  const entries = N().log[d] || [], sups = N().supLog[d] || {};
  if (!entries.length && !Object.keys(sups).length) return null;
  const t = dayTotals(d), tg = targets();
  return { t, targets: tg, micro: microPct(t, tg), entries };
}
function suggest(t, tg) {
  const miss = MICROS_AVG.filter(m => (t[m[0]] || 0) / tg[m[0]] < 0.7).map(m => ({ k: m[0], name: m[1], rest: tg[m[0]] - (t[m[0]] || 0) }));
  if (!miss.length) return [];
  return allFoods().filter(f => realFood(f) && !f.twinOf).map(f => {
    const grams = typicalGrams(f), parts = miss.map(m => ({ ...m, share: Math.min(1, ((f.v[m.k] || 0) * grams / 100) / m.rest) })).filter(x => x.share >= 0.15);
    return { f, grams, parts, score: sum(parts, x => x.share) - ((f.v.kcal || 0) * grams / 100) / 1500 };
  }).filter(x => x.parts.length).sort((a, b) => b.score - a.score).slice(0, 6);
}
// un aliment qu'on peut recommander : micros presque tous connus, ni produit enrichi, ni poudre, ni aliment infantile, ni aliment retiré
const realFood = f => !f.hidden && (f.known === undefined || f.known >= 18) && !/enrichi|poudre|extrait|substitut|complément|lyophilis|déshydrat/i.test(f.n) && !/infantiles|aides culinaires|denrées alimentaires spéciales/i.test(f.g || '');
/* Recherche (js/recherche.js) : tous les mots doivent figurer dans le nom, sans accents ni majuscules, au singulier, avec les synonymes suisses ;
   une faute tolérée si rien ne sort. Ce que tu as déjà noté passe en tête, le cuit avant le cru pour le riz, les pâtes, la viande, les légumes.
   Les aliments Ciqual 2020 retirés ne sont pas proposés (les repas déjà notés les retrouvent par foodById). Un nom présent dans Ciqual et dans la
   base suisse ne sort qu'une fois. searchFoods.info garde ce que la recherche a compris (mots corrigés, proposition). */
function searchFoods(q, limit = 12, opts = {}) {
  // préférences (js/preferences.js) : ce que j'exclus est masqué si je l'ai choisi, l'aimé passe devant, l'évité derrière
  const cx = !opts.tous && typeof prefsCtx === 'function' && FLAGS_OK() && STATE ? prefsCtx() : null, filtre = !!(cx && cx.actif);
  const r = rechercheAliments(q, allFoods(), { limit: filtre ? limit * 3 : limit, nameOf: normName, freq: foodFreq() });
  searchFoods.info = { compris: r.compris, proposition: r.proposition, masques: 0 };
  if (!filtre) return r.list;
  let list = r.list;
  if (cx.p.masquer) { const avant = list.length; list = list.filter(f => cx.v(f.id).v !== 'exclu'); searchFoods.info.masques = avant - list.length; }
  const rang = f => { const v = cx.v(f.id); return v.aime ? 0 : v.v === 'eviter' ? 2 : 1; };
  return list.map((f, i) => [f, i]).sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1]).map(x => x[0]).slice(0, limit);
}
// nombre de fois que chaque aliment a été noté sur les 90 derniers jours
function foodFreq() {
  const m = new Map(), from = addDays(today(), -90);
  for (const d in N().log) { if (d < from) continue; for (const e of N().log[d]) if (e.food) m.set(e.food, (m.get(e.food) || 0) + 1); }
  return m;
}
// Repas proposé selon l'heure ; heure typique de chaque repas pour les anciennes saisies sans heure
const mealNow = (d = new Date()) => MEALS[d.getHours() < 10 ? 0 : d.getHours() < 15 ? 1 : d.getHours() < 18 ? 2 : 3];
const MEAL_H = { 'Petit-déjeuner': 8, 'Déjeuner': 12.5, 'Collation': 16, 'Dîner': 19.5 };
const entryHour = e => (e.t ? new Date(e.t).getHours() + new Date(e.t).getMinutes() / 60 : MEAL_H[e.meal] ?? 12);
/* Aliments habituels à cette heure : fois notés dans la même tranche (plus ou moins 2 h) sur 30 jours, les plus récents pèsent plus.
   Si le repas choisi n'est pas celui de l'heure (un petit-déjeuner noté l'après-midi), on prend l'heure de ce repas. Vide le premier jour. */
function habituels(meal, n = 10) {
  const now = new Date(), hour = meal === mealNow(now) ? now.getHours() + now.getMinutes() / 60 : MEAL_H[meal] ?? 12, td = today(), from = addDays(td, -30), sc = new Map();
  for (const d in N().log) {
    if (d < from || d > td) continue;
    const age = daysBetween(d, td);
    for (const e of N().log[d]) {
      if (!e.food) continue;
      const dh = Math.abs(entryHour(e) - hour), diff = Math.min(dh, 24 - dh);
      if (diff <= 2 || e.meal === meal) sc.set(e.food, (sc.get(e.food) || 0) + (diff <= 2 ? 1 : 0.5) * (1 + (30 - age) / 30));
    }
  }
  return [...sc.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => foodById(id)).filter(f => f && !f.hidden).slice(0, n);
}
// Quantité proposée pour un aliment : la dernière notée, sinon une portion de maison sourcée, sinon la portion habituelle
const defaultG = f => N().lastG[f.id] || (portionsOf(f)[0] || {}).g || typicalGrams(f);

/* Noter des aliments : une seule écriture, un seul message avec « Annuler » (et « Modifier » pour un seul aliment).
   Pendant un jeûne, le message propose de le terminer. */
function logEntries(d, entries, msg, extra = []) {
  if (!entries.length) return;
  const restores = [garde(N().log, d), garde(N(), 'lastG'), ...extra];
  const now = Date.now();
  (N().log[d] = N().log[d] || []).push(...entries.map(e => ({ ...e, id: uid(), t: now })));
  for (const e of entries) if (e.food && e.g) N().lastG[e.food] = e.g;
  save(); rerender();
  const acts = [];
  if (entries.length === 1 && entries[0].food) { const last = N().log[d][N().log[d].length - 1]; acts.push({ label: 'Modifier', run: () => editEntry(d, last) }); }
  if (N().fast && d === today()) acts.push({ label: 'Finir le jeûne', run: () => endFast() });
  undoable(msg, restores, { actions: acts });
}
const shortName = n => n.split(',')[0].replace(/\s*\(.*?\)/g, '').trim();
const covClass = r => (r >= 1 ? 'ok' : r >= 0.5 ? 'mid' : 'low');
function sourcesModal(m) {
  const k = m[0], tg = targets()[k];
  // pas de valeur douteuse dans le classement ; un aliment présent dans les deux bases ne compte qu'une fois
  const list = ciqualFoods().filter(f => realFood(f) || (k === 'cho' && !f.hidden)).filter(f => f.v[k] > 0 && !isDoubt(f, k) && !(f.twinOf && f.twinOf.v[k] !== undefined))
    .map(f => { const g = typicalGrams(f); return { f, g, per100: f.v[k], portion: (f.v[k] * g) / 100 }; })
    .sort((a, b) => b.portion - a.portion).slice(0, 25);
  modal(`Où trouver : ${m[1]}`, h('div', null, h('p', { class: 'muted' }, `Ton repère : ${fmtNum(tg)} ${m[2]} par jour (${refLabel(k)}). Classés par apport dans une portion habituelle.`),
    k === 'cho' ? h('p', { class: 'unk small' }, 'La choline n\'est publiée que pour 212 aliments (USDA surtout). Un aliment absent de cette liste n\'en est pas forcément dépourvu.') : null,
    h('div', { class: 'list' }, list.map(x => h('div', { class: 'item click', onclick: () => foodSheet(x.f, x.g) }, h('div', { class: 'grow' }, x.f.n,
      h('small', { class: 'muted' }, ` · ${fmtNum(x.g)} g · ${fmtKcal(x.f.v.kcal)} kcal aux 100 g · ${foodSrc(x.f)}${valueNote(x.f, k) ? ' · ' + valueNote(x.f, k) : ''}`)),
      h('div', { class: 'right' }, h('b', null, `${fmtNum(x.portion)} ${m[2]}`), h('small', { class: 'muted' }, ` ${fmtPct((x.portion / tg) * 100, 0)}`)))))), []);
}

/* Fiche d'un aliment : tous les nutriments, pour 100 g et pour la portion, avec la source et la fiabilité de chaque valeur. */
const SHEET_GROUPS = [['Énergie et macros', ['kcal', 'p', 'c', 'sug', 'amid', 'fib', 'f', 'sat', 'mufa', 'pufa', 'alc', 'eau']],
  ['Acides gras détaillés', ['la', 'ala', 'epa', 'dha', 'o3', 'chol']], ['Vitamines', ['vA', 'vC', 'vD', 'vE', 'vK', 'b1', 'b2', 'b3', 'b5', 'b6', 'b9', 'b12', 'cho']],
  ['Minéraux', ['salt', 'na', 'ca', 'ph', 'fe', 'mg', 'zn', 'k', 'se', 'i', 'cu', 'mn']]];
function foodSheet(f, grams, onPick) {
  const st = { g: grams || N().lastG[f.id] || typicalGrams(f) };
  const conf = foodConf(f), body = h('div');
  const unit = k => (typeof CIQUAL !== 'undefined' && CIQUAL.meta.units[k]) || (NUTRI_NAMES[k] || [])[1] || '';
  function draw() {
    const rows = SHEET_GROUPS.map(([title, ks]) => h('div', { class: 'group' }, h('small', { class: 'muted up' }, title),
      h('table', { class: 'sheet' }, h('thead', null, h('tr', null, h('th', null, ''), h('th', null, '100 g'), h('th', null, `${fmtNum(st.g)} g`), h('th', null, 'source'))),
        h('tbody', null, ks.map(k => {
          const v = f.v[k], name = (NUTRI_NAMES[k] || [k])[0], note = f.base ? valueNote(f, k) : '';
          // « moins de x » et « traces » : comptés zéro, mais affichés comme publiés
          const fl = (f.fl && f.fl[k]) || '', lim = fl.match(/<([\d.]+)/), show = gr => (v === undefined ? (gr === 100 ? 'inconnu' : '?')
            : v === 0 && lim ? `< ${fmtNum3((+lim[1] * gr) / 100)} ${unit(k)}` : v === 0 && fl.includes('t') ? 'traces' : `${fmtNum3((v * gr) / 100)} ${unit(k)}`);
          const nt = v === undefined ? '' : note; // sur téléphone, la note passe sous le nom (voir style.css)
          return h('tr', { class: v === undefined ? 'unknown' : isDoubt(f, k) ? 'doubt' : '' }, h('td', null, name, nt ? h('small', { class: 'note-m' }, nt) : null),
            h('td', null, show(100)), h('td', null, show(st.g)),
            h('td', { class: 'note-d' }, h('small', { class: 'muted' }, nt)));
        })))));
    const g = inp('text', String(st.g), { inputmode: 'decimal', class: 'lim', onchange: e => { st.g = num(e.target.value) || 100; draw(); } });
    fill(body, 
      h('p', { class: 'muted small' }, f.g ? `${f.g} · ` : '', h('b', null, foodSrc(f)), conf ? ` · ${conf.label}` : '', f.usda ? ` · trous comblés par l'USDA (fiche ${f.usda})` : '',
        f.hidden ? ' · retiré de Ciqual en 2025, gardé pour tes anciens repas' : ''),
      h('div', { class: 'row wrap' }, h('span', null, 'Portion'), g, h('small', null, 'g')),
      f.v.kcal === undefined ? h('p', { class: 'unk small' }, 'Énergie non publiée par la source : cet aliment ne compte pas dans tes calories. Le total du jour le signale.') : null,
      saltMismatch(f) ? h('p', { class: 'unk small' }, `Sel et sodium ne concordent pas (sodium x 2,5 = ${fmtNum3((f.v.na * 2.5) / 1000)} g de sel) : deux analyses différentes chez la source. Le panneau suit le sel.`) : null,
      Object.keys(f.fl || {}).some(k => (f.fl[k] || '').includes('x')) ? h('p', { class: 'neg small' }, 'Une valeur au moins est marquée douteuse : publiée ainsi par la source, gardée telle quelle, sortie des suggestions.') : null,
      ...rows,
      h('small', { class: 'muted' }, f.base ? 'Fiabilité : A à D pour Ciqual (A, données françaises représentatives ; D, sources de plus de 10 ans). Base suisse : valeur publiée, calcul ou estimation. Une valeur inconnue n\'est jamais comptée zéro.' : 'Valeurs saisies ou reprises de l\'étiquette. Vide = inconnu.'),
      f.twins && f.twins.length ? h('div', { class: 'row wrap', style: { marginTop: '.6rem' } }, h('small', { class: 'muted' }, 'Même aliment dans une autre base :'), f.twins.map(x => h('button', { class: 'btn small ghost', onclick: () => { close(); foodSheet(x, st.g, onPick); } }, `Voir ${foodSrc(x)}`))) : null,
      f.twinOf ? h('div', { class: 'row wrap', style: { marginTop: '.6rem' } }, h('button', { class: 'btn small ghost', onclick: () => { close(); foodSheet(f.twinOf, st.g, onPick); } }, `Voir ${foodSrc(f.twinOf)}`)) : null);
  }
  draw();
  const close = modal(f.n, body, onPick ? [{ label: 'Choisir cet aliment', run: () => onPick(f, st.g) }] : []);
}
const nfNum3 = new Intl.NumberFormat('fr-CH', { maximumSignificantDigits: 3 });
const fmtNum3 = n => (Number.isFinite(n) ? (Math.abs(n) >= 100 ? fmtNum(n) : nfNum3.format(n)) : '?');

let nDay = today();
// mealAt : moment où le repas a été choisi à la main (le repas suit l'heure tant qu'on n'y touche pas) ; sel : ligne choisie au clavier
// plate : l'assiette en cours (aliments posés avec « + », notés d'un coup) ; en mémoire seulement, vidée au verrouillage
const ADD = { meal: mealNow(), mealAt: 0, q: '', pick: null, g: '', mode: 'food', off: [], offBusy: false, focusG: false, focusQ: false, sel: -1, plate: [] };

MODULES.nutri = {
  title: 'Nutrition',
  subs: [['jour', 'Journée'], ['tendances', 'Tendances'], ['reserves', 'Réserves'], ['recettes', 'Repas et recettes'], ['planning', 'Plan de repas'], ['corps', 'Poids'], ['aliments', 'Aliments'], ['preferences', 'Préférences'], ['objectifs', 'Objectifs'], ['sources', 'Sources et méthode']],
  render(root, sub) { ({ jour: vueNJour, tendances: vueTendances, reserves: vueReserves, recettes: vueRecettes, planning: vuePlanning, corps: vueCorps, aliments: vueAliments, preferences: vuePreferences, objectifs: vueNObjectifs, sources: vueSources }[sub] || vueNJour)(root); }
};

/* ----- journée ----- */
const entryKcal = e => { const k = entryN(e).kcal; return k === undefined ? '?' : fmtK(k); };
/* Journée : d'abord ce qui sert à noter (ajout, ce que j'ai mangé), puis les chiffres. Sur téléphone, le champ de recherche est dans le premier écran. */
function vueNJour(root) {
  const d = nDay, tg = targets(), t = dayTotals(d), entries = N().log[d] || [], mp = microPct(t, tg), frag = fragile(t), ul = ulAlerts(d);
  const unkMark = k => (t.unk[k] ? h('small', { class: 'unk', title: `Valeur inconnue pour ${t.unk[k]} aliment(s)` }, ' ?') : null);
  const bar = (k, label) => h('div', { class: 'macro' }, h('div', { class: 'row between' }, h('small', null, label, unkMark(k)), h('small', null, `${fmtG(t[k])} / ${fmtG(tg[k])} g`)), progress((t[k] / tg[k]) * 100, k === 'p' ? 'gold' : ''));
  const limit = (k, label) => { const L = limitOf(k); return h('div', { class: 'macro' }, h('div', { class: 'row between' }, h('small', null, `${label} (à ne pas dépasser)`, unkMark(k)), h('small', { class: t[k] > L ? 'neg' : '' }, `${fmtG(t[k])} / ${fmtG(L)} g`)), progress((t[k] / L) * 100, t[k] > L ? 'bad' : t[k] > L * 0.8 ? 'warn' : '')); };
  const quick = entries.filter(e => e.n).length;
  put(root, dayNav(d, v => { nDay = v; ADD.pick = null; rerender(); }),
    !CIQUAL_OK() ? h('section', { class: 'card' }, h('p', { class: 'neg' }, `Base d'aliments non chargée (${CIQUAL_CHARGE.err || 'raison inconnue'}). Les repas notés ne comptent pas leurs valeurs. Recharge la page.`)) : null,
    ul.length ? h('section', { class: 'card alertcard' }, h('h3', null, 'Limite haute dépassée'), ul.map(a => h('p', { class: a.type === 'NS' ? 'unk' : 'neg' }, h('b', null, a.nom), ` : ${ulText(a)}.`, a.note ? h('small', { class: 'muted' }, ` ${a.note}`) : null)),
      h('small', { class: 'muted' }, 'Limites de l\'EFSA pour un adulte en bonne santé. Ce n\'est pas un avis médical : parles-en à ton médecin si cela se répète.')) : null,
    d === today() && typeof menuCarte === 'function' ? menuCarte() : null,
    dayBand(t, tg, mp),
    addPanel(d),
    eatenCard(d, entries),
    d === today() && typeof rsvEncart === 'function' ? rsvEncart() : null,
    h('div', { class: 'cols' },
      h('section', { class: 'card' }, h('div', { class: 'row between' },
        h('div', null, h('h3', null, 'Calories et macros'), h('div', { class: 'big' }, fmtK(t.kcal), t.unk.kcal ? h('span', { class: 'unk' }, ' ?') : null, h('small', { class: 'muted' }, ` / ${fmtK(tg.kcal)} kcal`)), h('small', { class: 'muted' }, t.kcal < tg.kcal ? `reste ${fmtK(tg.kcal - t.kcal)} kcal` : `${fmtK(t.kcal - tg.kcal)} kcal au-dessus`)),
        ring((t.kcal / tg.kcal) * 100, fmtPct((t.kcal / tg.kcal) * 100, 0))),
        t.unk.kcal ? h('p', { class: 'unk small' }, `${t.unk.kcal} aliment(s) sans énergie publiée (${fmtK(t.unkG.kcal)} g) : pas comptés, le vrai total est plus haut.`) : null,
        bar('p', 'Protéines'), bar('c', 'Glucides'), bar('f', 'Lipides'), bar('fib', 'Fibres'),
        limit('sat', 'AG saturés'), limit('salt', 'Sel'), h('small', { class: 'muted' }, `Sucres : ${fmtG(t.sug)} g`, unkMark('sug')), detailsBox(t)),
      h('section', { class: 'card gold' }, h('div', { class: 'row between' }, h('div', null, h('h3', null, 'Micronutriments'), h('p', { class: 'muted' }, 'Part moyenne de tes repères couverte aujourd\'hui. Touche un micro pour voir où le trouver.')),
        ring(mp, fmtPct(mp, 0), 'micros')), microLows(t, tg),
        quick ? h('small', { class: 'muted' }, `${quick} saisie(s) rapide(s) sans micros : elles ne comptent que pour les calories et macros.`) : null)),
    plateBar(d),
    frag.length ? h('section', { class: 'card' }, h('h3', null, 'À lire avec prudence'), h('p', { class: 'muted small' }, 'Ces totaux reposent en bonne part sur des valeurs inconnues ou douteuses. Les chiffres affichés sont alors trop bas ou incertains.'),
      h('div', { class: 'chips' }, frag.map(x => h('span', { class: `chip ${x.unk ? '' : 'bad'}`, title: x.why }, `${x.label} : ${x.why}`)))) : null,
    t.miss ? h('p', { class: 'neg small' }, `${t.miss} repas pointe(nt) vers un aliment introuvable : il ne compte pas.`) : null,
    h('div', { class: 'cols3' }, waterCard(d), supplementsCard(d, ul), fastingCard()),
    foldCard('n.micros', 'Tous les micronutriments', () => microGrid(t, tg)),
    suggestPanel(t, tg, entries.length > 0));
}
// Bande compacte en haut : calories, macros, micros d'un coup d'œil
function dayBand(t, tg, mp) {
  return h('section', { class: 'card band' }, h('div', { class: 'row between wrap' },
    h('div', null, h('b', { class: 'big' }, fmtK(t.kcal)), t.unk.kcal ? h('span', { class: 'unk', title: 'Une partie des aliments n\'a pas d\'énergie publiée' }, ' ?') : null, h('small', { class: 'muted' }, ` / ${fmtK(tg.kcal)} kcal`)),
    h('small', { class: 'muted' }, `Protéines ${fmtG(t.p)} / ${fmtG(tg.p)} g · glucides ${fmtG(t.c)} g · lipides ${fmtG(t.f)} g · micros ${fmtPct(mp, 0)}`)),
  progress((t.kcal / tg.kcal) * 100, t.kcal > tg.kcal * 1.1 ? 'warn' : 'gold'));
}
// Ce que j'ai mangé, par repas, avec « Copier vers… » et la suppression qui s'annule
function eatenCard(d, entries) {
  return h('section', { class: 'card' }, h('div', { class: 'row between wrap' }, h('h3', null, 'Ce que j\'ai mangé'),
    h('button', { class: 'btn small ghost', onclick: () => copyFrom(d) }, 'Copier un autre jour')),
    entries.length ? MEALS.map(m => {
      const es = entries.filter(e => e.meal === m), unk = es.some(e => !e.n && entryN(e).kcal === undefined);
      return es.length ? h('div', { class: 'group' }, h('div', { class: 'row between wrap' }, h('small', { class: 'muted up' }, `${m} · ${fmtK(sum(es, e => entryN(e).kcal || 0))}${unk ? ' + ?' : ''} kcal`),
        h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: () => copyTo(d, m, es) }, 'Copier vers…'), h('button', { class: 'btn small ghost', onclick: () => saveAsRecipe(es, m) }, 'En faire une recette'))),
      es.map(e => { const f = e.food ? foodById(e.food) : null; return h('div', { class: 'item' }, h('div', { class: `grow${f ? ' click' : ''}`, onclick: f ? () => foodSheet(f, e.g) : null, title: f ? 'Voir la fiche' : null }, e.name, h('small', { class: 'muted' }, e.n ? ' · saisie rapide' : ` · ${f ? quantiteTexte(f, e.g) : fmtNum(e.g) + ' g'}${f ? ' · ' + foodSrc(f) : ''}`)), h('div', { class: 'right' }, `${entryKcal(e)} kcal`),
        h('button', { class: 'icon', 'aria-label': `Changer la quantité de ${e.name}`, onclick: () => editEntry(d, e) }, '✎'),
        h('button', { class: 'icon', 'aria-label': `Retirer ${e.name}`, onclick: () => removeEntry(d, e) }, '×')); })) : null; })
      : h('div', { class: 'empty' }, 'Rien de noté ce jour.'));
}
function removeEntry(d, e) {
  const r = garde(N().log, d);
  N().log[d] = (N().log[d] || []).filter(x => x !== e); if (!N().log[d].length) delete N().log[d];
  save(); rerender(); undoable(`${shortName(e.name)} retiré`, r);
}
function microLows(t, tg) {
  const low = MICROS_AVG.map(m => ({ m, r: (t[m[0]] || 0) / tg[m[0]] })).sort((a, b) => a.r - b.r).slice(0, 4);
  return h('div', { class: 'list' }, h('small', { class: 'muted up' }, 'Les plus en retard'), low.map(x => h('div', { class: 'item click', onclick: () => sourcesModal(x.m) }, h('div', { class: 'grow' }, h('b', null, x.m[1]), t.unk && t.unk[x.m[0]] ? h('small', { class: 'unk', title: 'Valeur absente de la base pour certains aliments' }, ' ?') : null, progress(x.r * 100, covClass(x.r))), h('div', { class: 'right' }, fmtPct(Math.min(x.r, 9.99) * 100, 0)))));
}
function microGrid(t, tg) {
  const groups = [...new Set(MICROS.map(m => m[4]))];
  return h('div', null, groups.map(g => h('div', { class: 'group' }, h('small', { class: 'muted up' }, g),
    h('div', { class: 'micros' }, MICROS.filter(m => m[4] === g).map(m => { const v = t[m[0]] || 0, r = v / tg[m[0]], u = t.unk && t.unk[m[0]];
      return h('div', { class: 'micro click', onclick: () => sourcesModal(m) }, h('div', { class: 'row between' }, h('b', null, m[1]), h('small', { class: covClass(r) + '-t' }, fmtPct(r * 100, 0))), progress(r * 100, covClass(r)),
        h('small', { class: 'muted' }, `${fmtNum(v)} / ${fmtNum(tg[m[0]])} ${m[2]}`), u ? h('small', { class: 'unk' }, ` · donnée absente pour ${u} aliment(s)`) : null,
        h('small', { class: 'src' }, refLabel(m[0]) + (m[5] ? ' · hors de la moyenne' : ''))); })))),
    h('small', { class: 'muted' }, 'Vitamine A comptée en RAE (bêta-carotène divisé par 12, comme les bases d\'aliments) : son repère est donc celui de la DGE/ÖGE, quelle que soit la source choisie. Détail dans Sources et méthode.'));
}
/* Détail repliable : nutriments utiles sans cible, avec un repère seulement si data/drv.js en donne un */
function detailsBox(t) {
  const row = (k, label, unit, ref) => h('div', { class: 'row between drow' }, h('small', null, label, t.unk[k] ? h('span', { class: 'unk', title: `Valeur inconnue pour ${t.unk[k]} aliment(s)` }, ' ?') : null),
    h('small', null, `${fmtNum3(t[k])} ${unit}`, ref ? h('span', { class: 'muted' }, ` / ${fmtNum(ref.v)} ${unit} (${ref.label})`) : null));
  const epadha = (t.epa || 0) + (t.dha || 0), ep = DRV_OK() && DRV.nutriments.epadha ? drvRef('epadha') : null;
  return h('details', { class: 'more' }, h('summary', null, 'Plus de détails : sodium, phosphore, cholestérol, alcool, eau, acides gras'),
    DETAILS.map(([k, label, unit]) => row(k, label, unit, detailRef(k))),
    h('div', { class: 'row between drow' }, h('small', null, 'EPA + DHA'), h('small', null, `${fmtNum(epadha * 1000)} mg`, ep ? h('span', { class: 'muted' }, ` / ${fmtNum(ep.v)} mg (${DRV_SRC[ep.s]}, ${DRV_TYPE[ep.type] || ep.type})`) : null)),
    h('small', { class: 'muted' }, 'Sans repère quand aucune des sources lues n\'en donne un. Sel et sodium viennent parfois d\'analyses différentes : le panneau suit le sel.'));
}
function suggestPanel(t, tg, any) {
  return foldCard('n.suggest', 'Quoi manger pour combler', () => { const s = any ? suggest(t, tg) : []; return [ // calcul lourd (toute la base) : seulement carte ouverte
    !any ? h('div', { class: 'empty' }, 'Note ton premier repas : je te dis ensuite quels aliments comblent ce qui manque.') :
    !s.length ? h('div', { class: 'empty' }, 'Tous tes micros sont au-dessus de 70 %. Rien à rattraper.') :
    h('div', { class: 'list' }, s.map(x => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, x.f.n), h('small', { class: 'muted' }, ` · ${fmtNum(x.grams)} g`),
      h('div', { class: 'chips' }, x.parts.map(p => h('span', { class: 'chip ok' }, `${p.name} +${fmtK(p.share * 100)} %`)))),
      h('button', { class: 'btn small', onclick: () => { ADD.mode = 'food'; ADD.pick = x.f.id; ADD.g = String(x.grams); ADD.q = x.f.n; ADD.focusG = true; rerender(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }, 'Ajouter')))),
    h('small', { class: 'muted' }, 'Chaque pourcentage est la part du manque restant comblée par la portion indiquée. Seuls les aliments dont les micros sont presque tous connus sont proposés.')]; });
}

/* ----- eau, compléments, jeûne ----- */
// Eau bue : un geste, un message avec « Annuler ». Le verre se règle dans Réglages (250 ml par défaut).
const glassMl = () => (STATE.settings.glass > 0 ? STATE.settings.glass : 250);
function addWater(d, ml) {
  const r = garde(N().water, d), before = N().water[d] || 0;
  N().water[d] = Math.max(0, before + ml); if (!N().water[d]) delete N().water[d];
  if ((N().water[d] || 0) === before) return;
  save(); rerender();
  undoable(`${ml > 0 ? '+' : '−'} ${Math.abs(ml)} ml : ${fmtNum(waterOf(d) / 1000)} L sur ${fmtNum(waterTarget() / 1000)}`, r);
}
function waterCard(d) {
  const ml = N().water[d] || 0, tgt = waterTarget(), tot = waterOf(d), fw = tot - ml, r = drvRef('eau'), gl = glassMl();
  return h('section', { class: 'card' }, h('h3', null, 'Eau'), h('div', { class: 'big' }, `${fmtNum(tot / 1000)} `, h('small', { class: 'muted' }, `/ ${fmtNum(tgt / 1000)} L`)), progress((tot / tgt) * 100, tot >= tgt ? 'ok' : ''),
    h('small', { class: 'muted' }, waterTotalMode() ? `Bu ${fmtNum(ml / 1000)} L + eau des aliments notés ${fmtNum(fw / 1000)} L. Repère ${r ? DRV_SRC[r.s] : ''} : eau totale, boissons et aliments.`
      : DRV_OK() ? 'Boissons seules. Repère DGE/ÖGE : boissons, sans l\'eau des aliments.' : 'Repère de secours : 35 ml par kg.'),
    h('div', { class: 'row wrap', style: { marginTop: '.6rem' } }, h('button', { class: 'btn small', onclick: () => addWater(d, gl) }, `+ 1 verre (${gl} ml)`), h('button', { class: 'btn small ghost', onclick: () => addWater(d, 500) }, '+ 500 ml'),
      ml > 0 ? h('button', { class: 'btn small ghost', 'aria-label': `Retirer ${gl} ml`, onclick: () => addWater(d, -Math.min(gl, ml)) }, `− ${gl}`) : null));
}
function supplementsCard(d, ul) {
  const log = N().supLog[d] || {}; // pas de fiche vide créée en regardant un jour
  const setc = (s, n) => { if (n > 0) log[s.id] = n; else delete log[s.id]; if (Object.keys(log).length) N().supLog[d] = log; else delete N().supLog[d]; save(); rerender(); };
  const al = (ul || ulAlerts(d)).filter(a => a.portee === 'complements' || a.fromSup > 0);
  return h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Compléments'), h('button', { class: 'btn small ghost', onclick: () => editSupps() }, 'Gérer')),
    N().supps.length ? h('div', { class: 'list' }, N().supps.map(s => { const c = log[s.id] || 0; return h('div', { class: 'item' }, h('div', { class: 'grow' }, s.name), h('button', { class: 'icon', 'aria-label': `${s.name} : une prise de moins`, onclick: () => setc(s, c - 1) }, '−'), h('b', null, String(c)), h('button', { class: 'icon', 'aria-label': `${s.name} : une prise de plus`, onclick: () => setc(s, c + 1) }, '+')); }))
      : h('div', { class: 'empty' }, 'Vitamine D, magnésium, oméga-3 : ajoute tes compléments avec leur étiquette, leurs micros comptent dans la journée.'),
    al.map(a => h('div', { class: `${a.type === 'NS' ? 'unk' : 'neg'} small` }, `${a.nom} : ${ulText(a)}`)));
}
function editSupps() {
  const rows = h('div', { class: 'list' });
  const draw = () => rows.replaceChildren(...N().supps.map(s => h('div', { class: 'item' }, h('div', { class: 'grow' }, s.name, h('small', { class: 'muted' }, ` · ${Object.keys(s.v).length} nutriment(s)`)),
    h('button', { class: 'btn small ghost', onclick: () => editSupp(s, draw) }, 'Modifier'), h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Supprimer ${s.name} ?`)) { N().supps = N().supps.filter(x => x !== s); save(); draw(); rerender(); } } }, 'Supprimer'))));
  draw();
  modal('Mes compléments', h('div', null, rows, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => editSupp(null, draw) }, '+ Ajouter un complément'))), []);
}
function editSupp(s, after) {
  const name = inp('text', s ? s.name : '', { placeholder: 'Ex. Vitamine D3, 1 capsule' }), fields = {};
  const mk = m => { fields[m[0]] = inp('text', s && s.v[m[0]] !== undefined ? String(s.v[m[0]]) : '', { inputmode: 'decimal', placeholder: '0' }); return field(`${m[1]} (${m[2]})`, fields[m[0]]); };
  // forme de la B3 (limite haute 10 mg pour l'acide nicotinique, 900 mg pour le nicotinamide) et forme de la B9 (acide folique : 1,7 µg DFE par µg)
  const b3f = sel([['', 'B3 : forme non précisée (comptée comme acide nicotinique)'], ['acide', 'B3 : acide nicotinique'], ['nicotinamide', 'B3 : nicotinamide']], (s && s.b3forme) || '');
  const b9a = h('input', { type: 'checkbox', checked: !!(s && s.b9acide) });
  modal(s ? `Modifier ${s.name}` : 'Nouveau complément', h('div', { class: 'form' }, field('Nom et unité', name), h('small', { class: 'muted' }, 'Quantités apportées par UNE prise (une capsule, une cuillère), comme sur l\'étiquette. Laisse vide ce qui n\'y est pas.'),
    h('div', { class: 'grid-form' }, MICROS.map(mk)), field('Forme de la vitamine B3', b3f, 'Change la limite haute : 10 mg ou 900 mg'),
    h('label', { class: 'daybox' }, b9a, 'La B9 de l\'étiquette est de l\'acide folique (comptée x 1,7 pour la couverture, telle quelle pour la limite)')),
    [{ label: 'Enregistrer', run: () => { if (!name.value.trim()) return false; const v = {}; for (const k in fields) { const x = num(fields[k].value); if (x > 0) v[k] = x; }
      const extra = { b3forme: b3f.value || undefined, b9acide: b9a.checked || undefined };
      if (s) { s.name = name.value.trim(); s.v = v; Object.assign(s, extra); } else N().supps.push({ id: uid(), name: name.value.trim(), v, ...extra }); save(); if (after) after(); rerender(); } }]);
}
/* Jeûne. Il part de l'heure vraie : le dernier repas noté (heure gardée depuis le 23 octobre 2026), maintenant, ou une heure choisie.
   Début modifiable après coup ; noter un repas pendant un jeûne propose de le terminer. */
const hm = ts => new Date(ts).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
const toLocalDT = ts => { const x = new Date(ts); return `${ymd(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
const durTxt = ms => { const m = Math.max(0, Math.round(ms / 60000)); return `${Math.floor(m / 60)} h ${pad(m % 60)}`; };
// heure du dernier repas noté avec son heure, s'il date de moins de 24 h et pas du futur
function lastMealAt(now = Date.now()) {
  let best = 0;
  for (const d of [today(), addDays(today(), -1)]) for (const e of N().log[d] || []) if (e.t && e.t <= now && e.t > best) best = e.t;
  return best && now - best < 86400000 ? best : 0;
}
function startFast(start, goal) {
  const r = garde(N(), 'fast'); N().fast = { start, goal }; save(); rerender();
  undoable(`Jeûne commencé à ${hm(start)}`, r);
}
function endFast() {
  const f = N().fast; if (!f) return;
  const rs = [garde(N(), 'fast'), garde(N(), 'fasts')];
  N().fasts.push({ start: f.start, end: Date.now(), goal: f.goal }); N().fast = null; save(); rerender();
  undoable(`Jeûne terminé : ${durTxt(Date.now() - f.start)}`, rs);
}
function pickFastTime(title, ts, onok) {
  const x = inp('datetime-local', toLocalDT(ts), { max: toLocalDT(Date.now()) });
  modal(title, field('Début', x, 'Date et heure de ton dernier repas'), [{ label: 'Valider', run: () => { const v = new Date(x.value).getTime(); if (!Number.isFinite(v) || v > Date.now()) { toast('Une heure passée, pas dans le futur'); return false; } onok(v); } }]);
}
let fastTimer = null;
function fastingCard() {
  const f = N().fast, goals = [12, 14, 16, 18, 20, 24];
  const el = h('div');
  const draw = () => {
    if (f) {
      const mins = Math.floor((Date.now() - f.start) / 60000), goalMin = f.goal * 60;
      fill(el, h('div', { class: 'big' }, `${Math.floor(mins / 60)} h ${pad(mins % 60)}`, h('small', { class: 'muted' }, ` / ${f.goal} h`)), progress((mins / goalMin) * 100, mins >= goalMin ? 'ok' : 'gold'),
        h('small', { class: 'muted' }, `Depuis ${hm(f.start)}${new Date(f.start).getDate() !== new Date().getDate() ? ' hier' : ''}. `, mins >= goalMin ? 'Objectif atteint.' : `Fin prévue à ${hm(f.start + goalMin * 60000)}.`),
        h('div', { class: 'row wrap', style: { marginTop: '.6rem' } }, h('button', { class: 'btn small', onclick: endFast }, 'Terminer le jeûne'),
          h('button', { class: 'btn small ghost', onclick: () => pickFastTime('Modifier le début', f.start, v => { const r = garde(N(), 'fast'); N().fast.start = v; save(); rerender(); undoable(`Début du jeûne : ${hm(v)}`, r); }) }, 'Modifier le début'),
          h('button', { class: 'btn small ghost', onclick: () => { const r = garde(N(), 'fast'); N().fast = null; save(); rerender(); undoable('Jeûne effacé', r); } }, 'Effacer')));
    } else {
      const g = sel(goals.map(x => [String(x), `${x} heures`]), String(N().fastGoal || 16), { 'aria-label': 'Durée visée', onchange: e => { N().fastGoal = +e.target.value; save(); } });
      const last = N().fasts[N().fasts.length - 1], lm = lastMealAt();
      fill(el, h('div', { class: 'row wrap' }, g,
          lm ? h('button', { class: 'btn small', onclick: () => startFast(lm, +g.value) }, `Depuis ${hm(lm)}, ton dernier repas`) : null,
          h('button', { class: `btn small${lm ? ' ghost' : ''}`, onclick: () => startFast(Date.now(), +g.value) }, 'Maintenant'),
          h('button', { class: 'btn small ghost', onclick: () => pickFastTime('Commencer le jeûne', lm || Date.now(), v => startFast(v, +g.value)) }, 'Autre heure')),
        last ? h('small', { class: 'muted' }, `Dernier jeûne : ${durTxt(last.end - last.start)}`) : h('small', { class: 'muted' }, 'Jeûne intermittent : le chrono peut partir de ton dernier repas.'),
        N().fasts.length > 1 ? h('details', { class: 'more' }, h('summary', null, 'Jeûnes passés'), h('div', { class: 'list' }, N().fasts.slice(-10).reverse().map(x => h('div', { class: 'item' }, h('small', { class: 'grow' }, `${shortDate(ymd(new Date(x.start)))} ${hm(x.start)} à ${hm(x.end)}`), h('b', null, durTxt(x.end - x.start)), h('small', { class: x.end - x.start >= x.goal * 3600000 ? 'pos' : 'muted' }, ` / ${x.goal} h`))))) : null);
    }
  };
  draw(); clearInterval(fastTimer); if (f) fastTimer = setInterval(() => { if (el.isConnected) draw(); else clearInterval(fastTimer); }, 30000);
  return h('section', { class: 'card' }, h('h3', null, 'Jeûne'), el);
}

/* ----- ajout d'un repas : aliment, recette ou produit emballé ----- */
function addPanel(d) {
  const picked = ADD.pick ? foodById(ADD.pick) : null;
  const tabs = seg([['food', 'Aliment'], ['recipe', 'Recette'], ['off', 'Produit emballé']], ADD.mode, v => { ADD.mode = v; ADD.pick = null; ADD.q = ''; rerender(); });
  const head = h('div', { class: 'row between wrap' }, h('h3', null, 'Ajouter un repas'), h('div', { class: 'row wrap' }, h('button', { class: 'btn small ghost', onclick: () => mealText(d) }, 'Écrire le repas'), h('button', { class: 'btn small ghost', onclick: () => quickEntry(d) }, 'Saisie rapide')));
  const meal = sel(MEALS, ADD.meal, { 'aria-label': 'Repas', onchange: e => { ADD.meal = e.target.value; ADD.mealAt = Date.now(); rerender(); } });
  if (ADD.mode === 'recipe') return h('section', { class: 'card' }, head, tabs, h('div', { class: 'row wrap' }, meal),
    N().recipes.length ? h('div', { class: 'list' }, N().recipes.map(r => { const tt = recipeTotals(r); return h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, r.name), h('small', { class: 'muted' }, ` · ${fmtK(tt.kcal)} kcal, ${fmtNum(tt.p)} g prot. par portion`)), h('button', { class: 'btn small', onclick: () => addRecipe(r, d, ADD.meal) }, 'Ajouter')); })) : h('div', { class: 'empty' }, 'Aucune recette. Crée-en une dans l\'onglet Recettes, ou transforme un repas en recette.'));
  if (ADD.mode === 'off') return h('section', { class: 'card' }, head, tabs, offPanel(d, meal));
  let list = [];
  const q = h('input', { type: 'search', id: 'n-search', value: ADD.q, autocomplete: 'off', 'aria-label': 'Chercher un aliment', placeholder: 'Chercher un aliment (saumon, lentilles, œuf dur...)',
    oninput: e => { ADD.q = e.target.value; ADD.pick = null; ADD.sel = -1; drawRes(); },
    onkeydown: e => { // flèches pour parcourir les résultats, Entrée pour choisir
      if (!list.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ADD.sel = (ADD.sel + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length; drawRes(); }
      else if (e.key === 'Enter') { e.preventDefault(); choose(list[Math.max(0, ADD.sel)]); }
    } });
  const res = h('div', { class: 'results' });
  const hab = habituels(ADD.meal);
  const recent = hab.length ? hab : [...new Set(Object.keys(N().log).sort().reverse().flatMap(k => N().log[k].map(e => e.food).filter(Boolean)))].slice(0, 8).map(foodById).filter(Boolean);
  const choose = f => { ADD.pick = f.id; ADD.q = f.n; ADD.g = String(defaultG(f)); ADD.sel = -1; ADD.focusG = true; rerender(); };
  const addNow = (f, grams) => logEntries(d, [{ meal: ADD.meal, food: f.id, name: f.n, g: grams }], `${shortName(f.n)} : ${quantiteTexte(f, grams)} au ${ADD.meal.toLowerCase()}`);
  function drawRes() {
    const nq = ADD.q.trim();
    list = nq && !ADD.pick ? searchFoods(nq) : [];
    const info = nq && searchFoods.info ? searchFoods.info : {};
    if (!nq) return fill(res, recent.length ? h('small', { class: 'muted' }, hab.length ? `Habituel à cette heure (${ADD.meal.toLowerCase()}) : + ajoute la dernière quantité` : 'Récents : + ajoute la dernière quantité') : null,
      recent.length ? h('div', { class: 'tiles' }, recent.map(f => { const g = defaultG(f); return h('div', { class: 'tile' },
        h('button', { class: 'tile-name', onclick: () => choose(f), title: f.n }, h('span', null, shortName(f.n)), h('small', { class: 'muted' }, quantiteTexte(f, g))),
        h('button', { class: 'tile-add', 'aria-label': `Ajouter ${f.n}, ${fmtNum(g)} g, au ${ADD.meal.toLowerCase()}`, onclick: () => addNow(f, g) }, '+')); })) : null);
    if (ADD.pick) return fill(res);
    fill(res, info.compris && info.compris.length ? h('small', { class: 'unk' }, `Compris : ${info.compris.map(([a, b]) => `« ${b} » pour « ${a} »`).join(', ')}`) : null,
      info.proposition ? h('div', { class: 'row' }, h('small', { class: 'muted' }, 'Vouliez-vous dire'), h('button', { class: 'btn small ghost', onclick: () => { ADD.q = info.proposition; ADD.sel = -1; rerender(); } }, `« ${info.proposition} » ?`)) : null,
      h('div', { class: 'list', role: 'listbox', 'aria-label': 'Aliments trouvés' }, list.map((f, i) => pickLine(f, () => choose(f), (x, g) => { ADD.pick = x.id; ADD.q = x.n; ADD.g = String(g); ADD.focusG = true; rerender(); }, i === ADD.sel, () => plateAdd(f, defaultG(f))))),
      list.length ? h('small', { class: 'muted' }, 'Le + pose l\'aliment sur l\'assiette (dernière quantité notée) : plusieurs aliments, un seul « Noter ».') : null,
      info.masques ? h('small', { class: 'muted block' }, `${info.masques} aliment${info.masques > 1 ? 's' : ''} masqué${info.masques > 1 ? 's' : ''} par tes préférences (Nutrition, Préférences).`) : null,
      !list.length ? h('small', { class: 'muted' }, 'Aucun aliment. Essaie « Produit emballé », crée-le dans l\'onglet Aliments, ou fais une saisie rapide.') : null);
  }
  drawRes();
  const g = inp('text', ADD.g, { id: 'n-grams', inputmode: 'decimal', placeholder: 'grammes', 'aria-label': 'Quantité en grammes', oninput: e => { ADD.g = e.target.value; },
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); ADD.focusQ = true; add(); } } });
  const add = () => {
    const grams = num(ADD.g || g.value); if (!picked || grams <= 0) return toast('Choisis un aliment et une quantité');
    const f = picked; ADD.pick = null; ADD.q = ''; ADD.g = '';
    addNow(f, grams);
  };
  if (ADD.focusG && picked) { ADD.focusG = false; setTimeout(() => { if (g.isConnected) { g.focus(); g.select(); } }, 0); }
  if (ADD.focusQ) { ADD.focusQ = false; setTimeout(() => { if (q.isConnected) q.focus({ preventScroll: true }); }, 0); }
  const ck = picked ? versionCuite(picked, allFoods(), normName) : null, ports = picked ? portionsOf(picked) : [];
  const setG = v => { ADD.g = String(v); g.value = ADD.g; g.focus(); };
  return h('section', { class: 'card add-card' }, head, tabs, redoBlock(d), h('div', { class: 'row wrap' }, meal, q), res,
    picked ? h('div', { class: 'pick-row' },
      h('div', { class: 'row wrap' }, h('b', { class: 'grow' }, picked.n), h('button', { class: 'btn small ghost', onclick: () => foodSheet(picked, num(ADD.g) || 100) }, 'Fiche'), h('button', { class: 'icon', 'aria-label': 'Choisir un autre aliment', onclick: () => { ADD.pick = null; ADD.focusQ = true; rerender(); } }, '×')),
      ck ? h('p', { class: 'small unk' }, 'Pesé cru ? Si tu as pesé cuit, prends plutôt ', h('button', { class: 'btn small ghost', onclick: () => { ADD.pick = ck.id; ADD.q = ck.n; ADD.g = String(defaultG(ck)); ADD.focusG = true; rerender(); } }, shortName(ck.n) + ', cuit'), ' : les grammes changent du simple au double.') : null,
      ports.length ? h('div', { class: 'chips' }, ports.flatMap(p => [1, 2].map(k => h('button', { class: 'chip pick', title: `USDA, fiche ${p.fdc} : ${p.us}`, onclick: () => setG(r2(p.g * k)) }, `${k === 1 ? p.label : '2 x ' + p.label} · ${fmtNum(p.g * k)} g`))), h('small', { class: 'muted' }, `Portions : ${PORTIONS_SRC}`)) : null,
      h('div', { class: 'row wrap' }, g, h('small', { class: 'muted' }, 'g'),
        [50, 100].map(n => h('button', { class: 'btn small ghost', onclick: () => setG(num(g.value) + n) }, `+ ${n} g`)),
        h('button', { class: 'btn ghost', onclick: () => { const v = num(ADD.g || g.value); if (v <= 0) return toast('Mets une quantité'); const f = picked; ADD.pick = null; ADD.q = ''; ADD.g = ''; ADD.focusQ = true; plateAdd(f, v); } }, 'Sur l\'assiette'),
        h('button', { class: 'btn', onclick: add }, `Ajouter au ${ADD.meal.toLowerCase()}`))) : null);
}
/* ----- assiette : plusieurs aliments posés, notés d'un coup (une écriture, un message « Annuler ») ----- */
// le champ de recherche se vide et garde le focus : on tape tout de suite l'aliment suivant
function plateAdd(f, g) {
  ADD.plate.push({ food: f.id, name: f.n, g: r2(g) });
  ADD.q = ''; ADD.sel = -1; ADD.focusQ = true;
  rerender();
}
const plateKcal = () => sum(ADD.plate, e => entryN(e).kcal || 0);
function plateLog(d) {
  if (!ADD.plate.length) return;
  const items = ADD.plate.slice(), back = () => { ADD.plate = items; };
  ADD.plate = [];
  logEntries(d, items.map(e => ({ meal: ADD.meal, food: e.food, name: e.name, g: e.g })), `${items.length} aliment(s) notés au ${ADD.meal.toLowerCase()}`, [back]);
}
function plateBar(d) {
  if (!ADD.plate.length) return null;
  const unk = ADD.plate.some(e => entryN(e).kcal === undefined);
  return h('div', { class: 'plate-bar', role: 'region', 'aria-label': 'Assiette' },
    h('button', { class: 'plate-sum', onclick: () => plateModal(d), 'aria-label': `Assiette : ${ADD.plate.length} aliment(s), voir et modifier` }, h('b', null, `Assiette : ${ADD.plate.length}`), h('small', null, `${fmtK(plateKcal())}${unk ? ' + ?' : ''} kcal`)),
    h('button', { class: 'btn small', onclick: () => plateLog(d) }, `Noter au ${ADD.meal.toLowerCase()}`),
    h('button', { class: 'icon', 'aria-label': 'Vider l\'assiette', onclick: () => { const items = ADD.plate.slice(); ADD.plate = []; rerender(); UNDO.fn = () => { ADD.plate = items; }; UNDO.until = Date.now() + 10000; toast('Assiette vidée', { undo: true }); } }, '×'));
}
function plateModal(d) {
  const body = h('div', { class: 'form' });
  const meal = sel(MEALS, ADD.meal, { 'aria-label': 'Repas', onchange: e => { ADD.meal = e.target.value; ADD.mealAt = Date.now(); } });
  const draw = () => fill(body, field('Repas', meal), ADD.plate.length ? h('div', { class: 'list' }, ADD.plate.map((e, i) => { const f = foodById(e.food); return h('div', { class: 'item' },
    h('div', { class: 'grow' }, e.name, h('small', { class: 'muted' }, ` · ${f ? quantiteTexte(f, e.g) : fmtNum(e.g) + ' g'} · ${entryKcal(e)} kcal`)),
    inp('text', String(e.g), { inputmode: 'decimal', class: 'lim', 'aria-label': `Grammes de ${e.name}`, onchange: ev => { const v = num(ev.target.value); if (v > 0) e.g = v; draw(); rerender(); } }), h('small', null, 'g'),
    h('button', { class: 'icon', 'aria-label': `Retirer ${e.name} de l'assiette`, onclick: () => { ADD.plate.splice(i, 1); draw(); rerender(); } }, '×')); })) : h('div', { class: 'empty' }, 'Assiette vide.'),
    h('small', { class: 'muted' }, `Total : ${fmtK(plateKcal())} kcal.`));
  draw();
  modal('Mon assiette', body, [{ label: 'Noter', run: () => { if (!ADD.plate.length) return; plateLog(nDay); } }]);
}
/* « Refaire » : les repas d'hier et du même jour la semaine passée, en un geste. Un repas déjà noté aujourd'hui à l'identique n'est pas reproposé.
   Plus le plan de repas du jour, s'il y en a un. */
function redoBlock(d) {
  const mine = N().log[d] || [], lines = [];
  const already = (m, es) => es.every(e => mine.some(x => x.meal === m && (e.food ? x.food === e.food : x.name === e.name)));
  const seen = new Set();
  for (const [src, label] of [[addDays(d, -1), 'Hier'], [addDays(d, -7), `${JOURS_LONG[dow(addDays(d, -7))]} dernier`]]) {
    for (const m of MEALS) {
      const es = (N().log[src] || []).filter(e => e.meal === m), key = m + '|' + es.map(e => e.food || e.name).sort().join(',');
      if (!es.length || already(m, es) || seen.has(key)) continue;
      seen.add(key); lines.push({ label, m, es });
    }
  }
  lines.sort((a, b) => (b.m === ADD.meal) - (a.m === ADD.meal) || MEALS.indexOf(a.m) - MEALS.indexOf(b.m));
  const pl = N().plan[d] || [];
  if (!lines.length && !pl.length) return null;
  const strip = e => ({ meal: e.meal, food: e.food, name: e.name, g: e.g, n: e.n, recipe: e.recipe });
  return h('div', { class: 'redo' },
    pl.length ? h('div', { class: 'redo-line' }, h('div', { class: 'grow' }, h('small', { class: 'muted' }, 'Prévu aujourd\'hui · '), [...new Set(pl.map(e => shortName(e.name)))].slice(0, 4).join(', '), pl.length > 4 ? '…' : ''),
      h('div', { class: 'row wrap' }, [...new Set(pl.map(e => e.meal))].length > 1 ? [...new Set(pl.map(e => e.meal))].map(m => h('button', { class: 'btn small ghost', onclick: () => notePlan(d, m) }, `Noter : ${m.toLowerCase()}`)) : null,
        h('button', { class: 'btn small', onclick: () => notePlan(d, null) }, 'Tout noter'))) : null,
    lines.slice(0, 4).map(x => { const kc = sum(x.es, e => entryN(e).kcal || 0), unk = x.es.some(e => !e.n && entryN(e).kcal === undefined);
      return h('div', { class: 'redo-line' }, h('div', { class: 'grow' }, h('small', { class: 'muted' }, `${x.label} · ${x.m} · `), [...new Set(x.es.map(e => shortName(e.name)))].slice(0, 4).join(', '), x.es.length > 4 ? '…' : '', h('small', { class: 'muted' }, ` · ${fmtK(kc)}${unk ? ' + ?' : ''} kcal`)),
        h('button', { class: 'btn small', 'aria-label': `Refaire le ${x.m.toLowerCase()} de ${x.label.toLowerCase()}`, onclick: () => logEntries(d, x.es.map(strip), `${x.m} refait : ${x.es.length} aliment(s)`) }, 'Refaire')); }));
}
function notePlan(d, m) {
  const pl = N().plan[d] || [], es = pl.filter(e => !m || e.meal === m); if (!es.length) return;
  const rp = garde(N().plan, d);
  N().plan[d] = pl.filter(e => !es.includes(e)); if (!N().plan[d].length) delete N().plan[d];
  logEntries(d, es.map(e => ({ meal: e.meal, food: e.food, name: e.name, g: e.g, n: e.n })), `${es.length} aliment(s) du plan notés`, [rp]);
}
/* Ligne de résultat : nom, groupe, source, fiabilité, micros connus, et un bouton pour la fiche. Partagée par la journée, les recettes, le plan. */
function foodMeta(f) {
  const c = foodConf(f), parts = [f.g || (f.code ? 'produit emballé' : 'à toi')];
  if (f.base || f.code) parts.push(foodSrc(f));
  if (c) parts.push(c.label);
  if (f.known !== undefined) parts.push(`micros ${f.known}/${MICROS.length}`);
  if (f.v.kcal === undefined) parts.push('énergie inconnue');
  if (f.twins && f.twins.length) parts.push('aussi en ' + f.twins.map(foodSrc).join(', ').toLowerCase());
  return parts.join(' · ');
}
function pickLine(f, onChoose, onPick, selected, onPlate) {
  return h('div', { class: 'pick-wrap' }, h('button', { class: `pick-line${selected ? ' sel' : ''}`, role: 'option', 'aria-selected': selected ? 'true' : 'false', onclick: onChoose }, h('span', null, f.n), h('small', { class: 'muted' }, foodMeta(f)), typeof prefBadges === 'function' && STATE ? prefBadges(f) : null),
    h('button', { class: 'icon info', title: 'Fiche de l\'aliment', 'aria-label': `Fiche de ${f.n}`, onclick: () => foodSheet(f, null, onPick) }, 'ⓘ'),
    onPlate ? h('button', { class: 'icon plate-add', title: 'Sur l\'assiette', 'aria-label': `Poser ${f.n} sur l'assiette, ${fmtNum(defaultG(f))} g`, onclick: onPlate }, '+') : null);
}
function editEntry(d, e) {
  if (e.n) return toast('Une saisie rapide se supprime et se refait');
  const f = foodById(e.food), g = inp('text', String(e.g), { inputmode: 'decimal' }), m = sel(MEALS, e.meal);
  const ports = portionsOf(f);
  modal(e.name, h('div', { class: 'form' }, field('Quantité (g)', g),
    ports.length ? h('div', { class: 'chips' }, ports.map(p => h('button', { class: 'chip pick', type: 'button', onclick: () => { g.value = String(p.g); g.focus(); } }, `${p.label} · ${fmtNum(p.g)} g`))) : null,
    field('Repas', m)), [{ label: 'Enregistrer', run: () => {
    const v = num(g.value); if (v <= 0) return false;
    const r = [garde(N().log, d), garde(N(), 'lastG')];
    e.g = v; e.meal = m.value; N().lastG[e.food] = v; save(); rerender(); undoable(`${shortName(e.name)} : ${fmtNum(v)} g`, r);
  } }]);
}
// Saisie rapide : calories d'abord (le champ a le focus), repas choisi dans la fenêtre, nom facultatif, Entrée valide
function quickEntry(d) {
  const f = { name: inp('text', '', { placeholder: 'Facultatif. Ex. Restaurant, plat du jour' }), kcal: inp('text', '', { inputmode: 'decimal' }), p: inp('text', '', { inputmode: 'decimal' }), c: inp('text', '', { inputmode: 'decimal' }), f: inp('text', '', { inputmode: 'decimal' }) };
  const m = sel(MEALS, ADD.meal);
  modal('Saisie rapide', h('div', { class: 'form' }, h('div', { class: 'two' }, field('Calories', f.kcal), field('Repas', m)), h('div', { class: 'grid-form' }, field('Protéines (g)', f.p), field('Glucides (g)', f.c), field('Lipides (g)', f.f)), field('Nom', f.name),
    h('small', { class: 'muted' }, 'Sans détail de micros : ça compte pour les calories et les macros seulement. Entrée pour ajouter.')),
    [{ label: 'Ajouter', run: () => { if (num(f.kcal.value) <= 0) { toast('Mets au moins les calories'); return false; } logEntries(d, [{ meal: m.value, name: f.name.value.trim() || 'Saisie rapide', n: { kcal: num(f.kcal.value), p: num(f.p.value), c: num(f.c.value), f: num(f.f.value) } }], `Saisie rapide : ${fmtK(num(f.kcal.value))} kcal au ${m.value.toLowerCase()}`); } }], { focus: f.kcal });
}
const copyable = e => ({ meal: e.meal, food: e.food, name: e.name, g: e.g, n: e.n, recipe: e.recipe });
// Copier un autre jour : chaque aliment a sa case, tout est coché au départ ; on décoche ce qui n'était pas ce repas
function copyFrom(d) {
  const src = sel([[addDays(d, -1), 'Hier'], [addDays(d, -2), 'Avant-hier'], [addDays(d, -7), 'Il y a une semaine']], addDays(d, -1), { onchange: () => draw() });
  const box = h('div'); let picks = new Set();
  const draw = () => {
    const from = N().log[src.value] || []; picks = new Set(from.map(e => e.id));
    fill(box, from.length ? MEALS.map(m => { const es = from.filter(e => e.meal === m); return es.length ? h('div', { class: 'group' }, h('small', { class: 'muted up' }, m),
      es.map(e => { const f = e.food ? foodById(e.food) : null; return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: ev => { if (ev.target.checked) picks.add(e.id); else picks.delete(e.id); } }),
        h('span', { class: 'grow' }, e.name, h('small', { class: 'muted' }, ` · ${e.n ? 'saisie rapide' : f ? quantiteTexte(f, e.g) : fmtNum(e.g) + ' g'}`))); })) : null; }) : h('div', { class: 'empty' }, 'Rien de noté ce jour-là.'));
  };
  draw();
  modal('Copier un autre jour', h('div', { class: 'form' }, field('Depuis', src), box, h('small', { class: 'muted' }, 'Les aliments cochés s\'ajoutent au même repas, ce jour-ci.')),
    [{ label: 'Copier la sélection', run: () => { const from = (N().log[src.value] || []).filter(e => picks.has(e.id)); if (!from.length) { toast('Rien de coché'); return false; } logEntries(d, from.map(copyable), `${from.length} aliment(s) copiés`); } }]);
}
// Copier un repas vers un autre jour (demain par défaut quand on regarde aujourd'hui) et un autre repas si l'on veut
function copyTo(d, m, es) {
  const day = inp('date', d === today() ? addDays(d, 1) : today()), ms = sel(MEALS, m);
  modal(`Copier : ${m}`, h('div', { class: 'form' }, field('Vers le jour', day), field('Repas', ms), h('small', { class: 'muted' }, `${es.length} aliment(s) : ${[...new Set(es.map(e => shortName(e.name)))].join(', ')}`)),
    [{ label: 'Copier', run: () => { const to = day.value || today(); logEntries(to, es.map(e => ({ ...copyable(e), meal: ms.value })), `${es.length} aliment(s) copiés vers ${to === today() ? 'aujourd\'hui' : dateLabel(to)}`); } }]);
}

/* ----- produits emballés : Open Food Facts ----- */
const OFF_KEYS = { vA: ['vitamin-a', 1e6], vC: ['vitamin-c', 1e3], vD: ['vitamin-d', 1e6], vE: ['vitamin-e', 1e3], vK: ['vitamin-k', 1e6], b1: ['vitamin-b1', 1e3], b2: ['vitamin-b2', 1e3], b3: ['vitamin-pp', 1e3], b5: ['pantothenic-acid', 1e3], b6: ['vitamin-b6', 1e3], b9: ['vitamin-b9', 1e6], b12: ['vitamin-b12', 1e6],
  ca: ['calcium', 1e3], fe: ['iron', 1e3], mg: ['magnesium', 1e3], zn: ['zinc', 1e3], k: ['potassium', 1e3], se: ['selenium', 1e6], i: ['iodine', 1e6], cu: ['copper', 1e3], mn: ['manganese', 1e3], o3: ['omega-3-fat', 1] };
function offToFood(p) {
  const n = p.nutriments || {}, val = k => (typeof n[k + '_100g'] === 'number' ? n[k + '_100g'] : null), v = {};
  const kcal = val('energy-kcal') !== null ? val('energy-kcal') : val('energy') !== null ? val('energy') / 4.184 : null;
  if (kcal === null && val('proteins') === null) return null;
  if (kcal !== null) v.kcal = kcal; // énergie absente de l'étiquette : inconnue, pas zéro
  for (const [k, o] of [['p', 'proteins'], ['c', 'carbohydrates'], ['f', 'fat'], ['fib', 'fiber'], ['sug', 'sugars'], ['sat', 'saturated-fat']]) if (val(o) !== null) v[k] = val(o);
  if (val('salt') !== null) v.salt = val('salt'); else if (val('sodium') !== null) v.salt = val('sodium') * 2.5;
  for (const [k, [o, mult]] of Object.entries(OFF_KEYS)) if (val(o) !== null) v[k] = val(o) * mult;
  const brand = (p.brands || '').split(',')[0].trim(), pn = (p.product_name || '').trim(), name = (brand && !norm(pn).includes(norm(brand)) ? [pn, brand] : [pn]).filter(Boolean).join(' · ');
  if (!name) return null;
  return { id: 'off' + p.code, n: name, g: '', v, code: p.code, known: MICROS.filter(m => v[m[0]] !== undefined).length };
}
async function offFetch(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Open Food Facts : HTTP ${r.status}`);
  return r.json();
}
const OFF_FIELDS = 'code,product_name,brands,nutriments';
/* Recherche par nom. Page servie par serveur_local.cjs (LANCER_PANNEAU) : elle passe par la route locale /api/off-recherche, qui interroge
   Open Food Facts depuis l'ordinateur (leurs serveurs refusent qu'une page web lise la réponse). Sinon, essai direct, puis le message honnête. */
const relaisLocal = () => location.protocol.startsWith('http') && /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname);
async function offSearch(q) { // relais local, puis deux serveurs : le principal, puis le moteur de recherche d'Open Food Facts
  const enc = encodeURIComponent(q);
  if (relaisLocal()) {
    let r = null;
    try { r = await fetch(`/api/off-recherche?q=${enc}`, { headers: { Accept: 'application/json' } }); } catch { r = null; }
    if (r && r.ok) { const j = await r.json(); offSearch.via = j.source || 'relais'; return (j.products || []).map(p => ({ ...p, brands: Array.isArray(p.brands) ? p.brands.join(', ') : p.brands })).map(offToFood).filter(Boolean); }
    if (r && r.status !== 404) { let m = ''; try { m = (await r.json()).erreur || ''; } catch { /* réponse sans texte */ } throw new Error(m || `relais local : HTTP ${r.status}`); }
  }
  const tries = [
    async () => (await offFetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${enc}&search_simple=1&action=process&json=1&page_size=15&fields=${OFF_FIELDS}`)).products || [],
    async () => ((await offFetch(`https://search.openfoodfacts.org/search?q=${enc}&page_size=15&fields=${OFF_FIELDS}`)).hits || []).map(p => ({ ...p, brands: Array.isArray(p.brands) ? p.brands.join(', ') : p.brands }))
  ];
  let last = null;
  for (const t of tries) { try { return (await t()).map(offToFood).filter(Boolean); } catch (e) { last = e; } }
  // Vérifié le 23 octobre 2026 : le serveur principal répond 503 à toute recherche par nom, et le moteur search.openfoodfacts.org répond
  // sans l'autorisation (CORS) qui permettrait à une page web de lire sa réponse. Le code-barres, lui, marche.
  throw new Error(relaisLocal() ? 'le serveur du panneau n\'a pas la route de recherche : relance LANCER_PANNEAU. Le code-barres marche : tape les chiffres sous le code'
    : "la recherche par nom d'Open Food Facts ne marche pas depuis une page web. Ouvre le panneau par LANCER_PANNEAU (relais sur ton ordinateur), ou tape les chiffres du code-barres");
}
// Code inconnu : Open Food Facts répond 404 (produit absent), ce n'est pas une panne
async function offCode(code) {
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`, { headers: { Accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Open Food Facts : HTTP ${r.status}`);
  const j = await r.json(); return j.status === 1 ? offToFood(j.product) : null;
}
function keepFood(f) { // on garde le produit dans « mes aliments » pour le retrouver sans réseau
  if (!N().foods.some(x => x.id === f.id)) { N().foods.push(f); foodIndex.m = null; save(); }
  return f;
}
const isCode = t => /^\d{8,14}$/.test(t);
const pickFood = f => { ADD.mode = 'food'; ADD.pick = f.id; ADD.q = f.n; ADD.g = String(N().lastG[f.id] || 100); ADD.focusG = true; rerender(); };
function offPanel(d, meal) {
  const q = inp('search', ADD.q, { placeholder: 'Nom du produit ou code-barres', 'aria-label': 'Nom du produit ou code-barres', onkeydown: e => { if (e.key === 'Enter') go(); } });
  const box = h('div', { class: 'results' });
  const status = h('small', { class: 'muted' }, relaisLocal() ? 'La recherche par nom passe par ton ordinateur (le serveur du panneau), qui la transmet à Open Food Facts : le texte cherché part chez eux, et chez personne d\'autre. Le code-barres part chez eux directement. Un code-barres déjà gardé se retrouve sans réseau.'
    : 'La recherche passe par Open Food Facts (base collaborative) : le texte cherché leur est envoyé. Un code-barres déjà gardé se retrouve sans réseau.');
  let unknown = ''; // code-barres que personne ne connaît : on propose de le créer depuis l'étiquette
  async function go() {
    const t = q.value.trim().replace(/\s+/g, ''); if (!t) return;
    ADD.q = t; unknown = '';
    if (isCode(t)) { // déjà gardé dans mes aliments : rien ne part sur le réseau
      const mine = N().foods.find(f => f.code === t);
      if (mine) { ADD.off = [mine]; status.textContent = 'Produit déjà dans tes aliments : rien n\'a été envoyé.'; return draw(); }
    }
    status.textContent = 'Recherche…';
    try {
      ADD.off = isCode(t) ? [await offCode(t)].filter(Boolean) : await offSearch(t);
      if (!ADD.off.length && isCode(t)) unknown = t;
      status.textContent = ADD.off.length ? `${ADD.off.length} produit(s). Les micros absents de l'étiquette restent inconnus.` : isCode(t) ? 'Open Food Facts ne connaît pas ce code-barres.' : 'Aucun produit trouvé.';
    } catch (e) { ADD.off = []; if (isCode(t)) unknown = t; status.textContent = `Recherche impossible : ${e.message}`; }
    draw();
  }
  function draw() {
    box.replaceChildren(h('div', { class: 'list' }, ADD.off.map(f => h('button', { class: 'pick-line', onclick: () => { keepFood(f); pickFood(f); } }, h('span', null, f.n), h('small', { class: 'muted' }, ` · ${fmtKcal(f.v.kcal)} kcal aux 100 g · micros ${f.known}/${MICROS.length}`)))),
      unknown ? h('div', { class: 'redo-line col' }, h('small', null, `Code ${unknown} : tu peux le créer toi-même avec l'étiquette du paquet. Il reste dans tes aliments, lisible sans réseau, et rien n'est envoyé.`),
        h('button', { class: 'btn small', onclick: () => labelFood(unknown, pickFood) }, 'Créer depuis l\'étiquette')) : null);
  }
  draw();
  // Scanner : seulement si le navigateur sait lire un code-barres (Chrome sur Android, Safari récent ; pas Chrome sur Windows)
  const scan = 'BarcodeDetector' in window ? h('button', { class: 'btn small ghost', onclick: () => scanBarcode(code => { q.value = code; go(); }) }, 'Scanner') : null;
  return h('div', null, h('div', { class: 'row wrap' }, meal, q, h('button', { class: 'btn small', onclick: go }, 'Chercher'), scan), status,
    scan ? null : h('small', { class: 'muted block' }, 'Pas de lecture par la caméra dans ce navigateur : tape les chiffres sous le code-barres.'), box);
}
/* Produit inconnu : fiche remplie depuis l'étiquette, dans l'ordre où elle se lit (pour 100 g). Énergie en kcal, ou en kJ si c'est ce qui est écrit.
   Vide = inconnu, jamais zéro. Le produit garde son code-barres : la prochaine fois, il se retrouve sans réseau. */
const ETIQUETTE = [['kcal', 'Énergie', 'kcal'], ['f', 'Matières grasses', 'g'], ['sat', 'dont acides gras saturés', 'g'], ['c', 'Glucides', 'g'], ['sug', 'dont sucres', 'g'], ['fib', 'Fibres', 'g'], ['p', 'Protéines', 'g'], ['salt', 'Sel', 'g']];
function labelFood(code, after) {
  const old = N().foods.find(f => f.code === code), fields = {};
  const name = inp('text', old ? old.n : '', { placeholder: 'Nom et marque, comme sur le paquet' });
  const kj = inp('text', '', { inputmode: 'decimal', placeholder: 'si seuls les kJ sont écrits' });
  const mk = ([k, label, unit]) => { fields[k] = inp('text', old && old.v[k] !== undefined ? String(r2(old.v[k])) : '', { inputmode: 'decimal', placeholder: 'inconnu' }); return field(`${label} (${unit})`, fields[k]); };
  modal('Créer depuis l\'étiquette', h('div', { class: 'form' },
    h('small', { class: 'muted' }, `Code-barres ${code}. Valeurs pour 100 g, dans l'ordre de l'étiquette. Laisse vide ce qui n'y est pas.`),
    field('Nom', name), h('div', { class: 'grid-form' }, mk(ETIQUETTE[0]), field('Ou énergie (kJ)', kj), ETIQUETTE.slice(1).map(mk)),
    h('details', { class: 'more' }, h('summary', null, 'Vitamines et minéraux de l\'étiquette (facultatif)'), h('div', { class: 'grid-form' }, MICROS.map(mk)))),
    [{ label: 'Enregistrer', run: () => {
      if (!name.value.trim()) { toast('Donne-lui un nom'); return false; }
      const v = {}; for (const k in fields) { const s = fields[k].value.trim(); if (s !== '') v[k] = num(s); }
      if (v.kcal === undefined && kj.value.trim() !== '') v.kcal = num(kj.value) / 4.184;
      if (v.kcal === undefined && v.p === undefined) { toast('Au moins l\'énergie ou les protéines'); return false; }
      const rec = { n: name.value.trim(), g: '', v, code, src: 'MOI', known: MICROS.filter(m => v[m[0]] !== undefined).length };
      const u = garde(N(), 'foods');
      let f = old; if (f) Object.assign(f, rec); else { f = { id: 'lbl' + code, ...rec }; N().foods.push(f); }
      foodIndex.m = null; save();
      undoable(`${rec.n} gardé dans tes aliments`, u);
      if (after) after(f); else rerender();
    } }], { focus: name });
}
async function scanBarcode(onCode) {
  const video = h('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', borderRadius: '12px' } });
  let stream, stop = false;
  const off = () => { stop = true; if (stream) stream.getTracks().forEach(t => t.stop()); };
  const close = modal('Scanner un code-barres', h('div', null, video, h('small', { class: 'muted' }, 'Place le code-barres devant la caméra. Rien n\'est enregistré.')), [{ label: 'Fermer', cls: 'btn ghost', run: off }]);
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    if (!video.isConnected) return off(); // fenêtre fermée pendant la demande d'accès
    video.srcObject = stream;
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    // fenêtre fermée par la croix, Échap ou un clic à côté : la caméra s'éteint aussi
    const loop = async () => { if (!video.isConnected) off(); if (stop) return; try { const c = await det.detect(video); if (c.length) { stop = true; stream.getTracks().forEach(t => t.stop()); close(); onCode(c[0].rawValue); return; } } catch { /* image pas prête */ } setTimeout(loop, 300); };
    loop();
  } catch (e) { toast(`Caméra indisponible : ${e.message}`); close(); }
}
