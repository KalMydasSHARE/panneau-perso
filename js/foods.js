'use strict';
/* KalMydas PERSO : base d'aliments et repères nutritionnels.
   Aliments : data/ciqual.js (construit par _donnees/build_base.cjs) : Ciqual 2025 de l'Anses, base suisse des valeurs nutritives V 7.1 de l'OSAV,
   quelques trous comblés par l'USDA (SR Legacy) sur des aliments rapprochés à la main, et 181 aliments Ciqual 2020 retirés en 2025, gardés pour les
   repas déjà notés. Valeurs pour 100 g. Chaque valeur garde sa source, sa fiabilité et ses drapeaux. Rien n'est tapé à la main ici.
   Une valeur absente est inconnue (absente de `v`), jamais comptée comme zéro. */

const MACROS = [['kcal', 'Calories', 'kcal'], ['p', 'Protéines', 'g'], ['c', 'Glucides', 'g'], ['f', 'Lipides', 'g'], ['fib', 'Fibres', 'g']];
const EXTRAS = [['sug', 'Sucres', 'g'], ['sat', 'AG saturés', 'g'], ['salt', 'Sel', 'g']]; // suivis, sans cible à atteindre
// Détail repliable de la journée : suivis, avec un repère seulement quand data/drv.js en donne un
const DETAILS = [['na', 'Sodium', 'mg'], ['ph', 'Phosphore', 'mg'], ['chol', 'Cholestérol', 'mg'], ['alc', 'Alcool', 'g'], ['eau', 'Eau des aliments', 'g'], ['amid', 'Amidon', 'g'],
  ['mufa', 'AG mono-insaturés', 'g'], ['pufa', 'AG polyinsaturés', 'g'], ['la', 'Acide linoléique (oméga-6)', 'g'], ['ala', 'ALA (oméga-3 végétal)', 'g'], ['epa', 'EPA (oméga-3)', 'g'], ['dha', 'DHA (oméga-3)', 'g']];
// À ne pas dépasser (OMS) : sel moins de 5 g ; graisses saturées 10 % de l'énergie, soit kcal x 0,10 / 9 g
const LIMITS = { salt: 5, sat: 22 }; // 22 g = valeur de secours pour 2000 kcal
const limitOf = k => (k === 'sat' && typeof targets === 'function' ? Math.round((0.10 * targets().kcal) / 9) : LIMITS[k]);

/* [clé, nom, unité, repère de secours, groupe, hors de la moyenne]. Les repères réels viennent de data/drv.js selon le profil (profil.js) :
   la 4e colonne ne sert que si data/drv.js ne se charge pas. La choline est suivie mais hors de la moyenne des micros : la plupart des aliments
   n'ont pas de valeur publiée (212 sur 4 881), la compter ferait baisser la moyenne à tort. */
const MICROS = [
  ['vA', 'Vitamine A', 'µg', 750, 'Vitamines'], ['vC', 'Vitamine C', 'mg', 110, 'Vitamines'], ['vD', 'Vitamine D', 'µg', 15, 'Vitamines'],
  ['vE', 'Vitamine E', 'mg', 13, 'Vitamines'], ['vK', 'Vitamine K', 'µg', 70, 'Vitamines'], ['b1', 'B1 thiamine', 'mg', 1.1, 'Vitamines'],
  ['b2', 'B2 riboflavine', 'mg', 1.6, 'Vitamines'], ['b3', 'B3 niacine', 'mg', 17, 'Vitamines'], ['b5', 'B5 pantothénique', 'mg', 5, 'Vitamines'],
  ['b6', 'B6', 'mg', 1.7, 'Vitamines'], ['b9', 'B9 folates', 'µg', 330, 'Vitamines'], ['b12', 'B12', 'µg', 4, 'Vitamines'],
  ['ca', 'Calcium', 'mg', 950, 'Minéraux'], ['fe', 'Fer', 'mg', 11, 'Minéraux'], ['mg', 'Magnésium', 'mg', 350, 'Minéraux'], ['zn', 'Zinc', 'mg', 11.7, 'Minéraux'],
  ['k', 'Potassium', 'mg', 3500, 'Minéraux'], ['se', 'Sélénium', 'µg', 70, 'Minéraux'], ['i', 'Iode', 'µg', 150, 'Minéraux'], ['cu', 'Cuivre', 'mg', 1.6, 'Minéraux'],
  ['mn', 'Manganèse', 'mg', 3, 'Minéraux'], ['o3', 'Oméga-3', 'g', 1.8, 'Acides gras'], ['cho', 'Choline', 'mg', 400, 'Autres', true]
];
const MICROS_AVG = MICROS.filter(m => !m[5]); // micros comptés dans la moyenne du jour
const DEFAULT_TARGETS = { kcal: 2400, p: 140, c: 250, f: 80, fib: 25 };
// Nom et unité de chaque clé de la base, pour la fiche d'un aliment
const NUTRI_NAMES = Object.fromEntries([...MACROS, ...EXTRAS, ...MICROS, ...DETAILS].map(m => [m[0], [m[1], m[2]]]));
const SRC_LABEL = { C: 'Ciqual 2025', C20: 'Ciqual 2020 (retiré)', S: 'Base suisse', u: 'USDA', OFF: 'Open Food Facts', MOI: 'à toi' };
const CONF_LABEL = { A: 'fiabilité A', B: 'fiabilité B', C: 'fiabilité C', D: 'fiabilité D', '?': 'sans code de fiabilité', m: 'valeurs publiées', a: 'calcul automatisé', r: 'calcul recette', e: 'estimation' };

/* Chargement de la base (1,5 Mo) sans bloquer l'écran du verrou : le fichier se lit pendant qu'on tape le mot de passe.
   start() (app.js) attend CIQUAL_PRET avant d'afficher. Si la page a déjà chargé data/ciqual.js (tests), rien à faire. */
const CIQUAL_CHARGE = { ms: null, err: null };
const CIQUAL_PRET = typeof CIQUAL !== 'undefined' ? Promise.resolve() : new Promise(res => {
  const t0 = performance.now(), s = document.createElement('script');
  s.src = 'data/ciqual.js';
  // la mise en objets (environ 80 ms) se fait aussi ici, pendant la saisie du mot de passe, pas au premier écran
  s.onload = () => { CIQUAL_CHARGE.ms = Math.round(performance.now() - t0); setTimeout(() => { try { ciqualFoods(); } catch (e) { console.error(e); } CIQUAL_CHARGE.pret = Math.round(performance.now() - t0); res(); }, 0); };
  s.onerror = () => { CIQUAL_CHARGE.err = 'data/ciqual.js introuvable'; res(); };
  document.head.append(s);
});

const CIQUAL_OK = () => typeof CIQUAL !== 'undefined';

/* Base mise en objets, une seule fois. Les valeurs inconnues (null) sont absentes de `v`.
   q[k] : fiabilité de la valeur (voir CIQUAL.meta.conf), fl[k] : drapeaux (p au moins, t traces, <x sous la limite, x douteux, ...). */
let _ciqualFoods = null;
function ciqualFoods() {
  if (_ciqualFoods) return _ciqualFoods;
  if (typeof CIQUAL === 'undefined') return []; // pas encore chargée : on ne garde pas une liste vide
  const keys = CIQUAL.keys, groups = CIQUAL.groups;
  _ciqualFoods = CIQUAL.foods.map(([code, n, g, vals, conf, src, flags]) => {
    const v = {}, q = {}, fl = {};
    keys.forEach((k, i) => { if (vals[i] !== null) { v[k] = vals[i]; if (conf) q[k] = conf[i]; } });
    for (const t of (flags || '').split(' ')) { const j = t.indexOf(':'); if (j > 0) fl[t.slice(0, j)] = (fl[t.slice(0, j)] || '') + t.slice(j + 1); }
    const id = typeof code === 'string' ? code : 'c' + code; // 'c22000' comme dans l'ancienne table, 's290' pour la base suisse
    return { id, n, g: groups[g], v, q, fl, src: src || 'C', base: true, hidden: src === 'C20',
      usda: CIQUAL.usda ? CIQUAL.usda[code] : undefined, known: MICROS.filter(m => v[m[0]] !== undefined).length };
  });
  // Même nom dans Ciqual 2025 et dans la base suisse : une seule ligne dans la recherche, l'autre reste accessible depuis la fiche.
  // On garde en tête celle qui a le plus de valeurs connues (Ciqual à égalité).
  const byName = new Map();
  for (const f of _ciqualFoods) { if (f.hidden) continue; const k = normFood(f.n); (byName.get(k) || byName.set(k, []).get(k)).push(f); }
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => Object.keys(b.v).length - Object.keys(a.v).length || (a.src === 'C' ? -1 : 1));
    list[0].twins = list.slice(1); for (const t of list.slice(1)) t.twinOf = list[0];
  }
  return _ciqualFoods;
}
const normFood = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe');

// Fiabilité d'ensemble d'un aliment : le code le plus fréquent parmi ses valeurs connues (l'énergie, calculée par l'Anses, est mise à part)
function foodConf(f) {
  if (!f.q) return null;
  const n = {};
  for (const k in f.q) { const c = f.q[k]; if (k === 'kcal' || c === '-' || c === 'u') continue; n[c] = (n[c] || 0) + 1; }
  const best = Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b))[0];
  return best ? { c: best, label: CONF_LABEL[best] || best } : null;
}
const foodSrc = f => SRC_LABEL[f.src] || (f.code ? SRC_LABEL.OFF : SRC_LABEL.MOI);
// Qualité d'une valeur, en mots courts pour l'écran
function valueNote(f, k) {
  const q = f.q && f.q[k], fl = (f.fl && f.fl[k]) || '';
  const parts = [];
  if (q === 'u') parts.push(f.usda ? `USDA, fiche ${f.usda}` : 'USDA'); else if (q && 'ABCD'.includes(q)) parts.push('fiabilité ' + q);
  else if (q === 'a') parts.push('calcul automatisé'); else if (q === 'e') parts.push('estimation'); else if (q === 'r') parts.push('calcul recette'); else if (q === 'm') parts.push('valeur publiée');
  if (fl.includes('p')) parts.push('au moins (un composant inconnu)');
  if (fl.includes('t')) parts.push('traces');
  const lim = fl.match(/<([\d.]+)/); if (lim) parts.push(`moins de ${lim[1].replace('.', ',')}`); else if (fl.includes('<')) parts.push('sous la limite de mesure');
  if (fl.includes('n')) parts.push('N x 6,25');
  if (fl.includes('e')) parts.push('vitamine E sans précision');
  if (fl.includes('f')) parts.push('folates totaux, pas en DFE');
  if (fl.includes('c')) parts.push('calculé par le panneau');
  if (fl.includes('x')) parts.push('valeur douteuse');
  return parts.join(', ');
}
const isDoubt = (f, k) => !!(f.fl && f.fl[k] && f.fl[k].includes('x'));
// Sel et sodium qui ne concordent pas (sel attendu = sodium x 2,5) : même règle que _donnees/verif_base.cjs (AUDIT.md 4.3) :
// sodium d'au moins 200 mg, rapport sel / attendu hors de 0,85 à 1,15, et écart de plus de 0,2 g
function saltMismatch(f) {
  const s = f.v.salt, na = f.v.na; if (s === undefined || na === undefined || na < 200) return false;
  const e = (na * 2.5) / 1000, r = s / e;
  return (r < 0.85 || r > 1.15) && Math.abs(s - e) > 0.2;
}
const fmtKcal = v => (v === undefined || v === null ? '?' : fmtK(v)); // kcal entières : les tables ne sont pas précises au dixième

// Portion habituelle, pour les suggestions : 100 g sauf matières grasses, produits sucrés, oléagineux
function typicalGrams(f) {
  if (/matières grasses|aides culinaires|graisses et huiles/i.test(f.g || '')) return 10;
  if (/produits sucrés|sucreries/i.test(f.g || '')) return 20;
  if (/noix|amande|graine|cacahu|noisette|pistache|cajou|pignon|sésame|tournesol|courge|chia|lin/i.test(f.n)) return 30;
  return 100;
}
