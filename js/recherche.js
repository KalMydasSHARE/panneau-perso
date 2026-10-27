'use strict';
/* KalMydas PERSO : recherche d'aliments qui pardonne, portions de maison, version cuite. Tout se calcule ici, sur l'appareil : aucun appel réseau.
   1. Chaque mot tapé est lu sans accents ni majuscules, au singulier, et avec ses synonymes (yogourt = yaourt, coca = cola, patate = pomme de terre).
   2. Si rien ne sort, une faute de frappe est tolérée (une lettre pour un mot de 5 lettres et plus, deux à partir de 8) et l'écran dit ce qui a été compris.
   3. Classement : ce que tu as déjà noté souvent, puis le nom qui commence par le mot cherché, le mot entier, la version cuite des aliments qu'on
      mange cuits (riz, pâtes, viande, poisson, légumes cuits) quand « cru » n'est pas tapé, enfin les noms courts. */

// Mot tapé (sans accents) -> façons de l'écrire dans les bases. Une alternative de plusieurs mots exige tous ses mots.
const SYNONYMES = {
  yogourt: ['yaourt', 'yogourt'], yoghourt: ['yaourt', 'yogourt'], yoghurt: ['yaourt', 'yogourt'], yogurt: ['yaourt', 'yogourt'], yaourt: ['yaourt', 'yogourt'],
  birchermuesli: ['birchermuesli', 'muesli'], birchermusli: ['birchermuesli', 'muesli'], bircher: ['birchermuesli', 'bircher'], musli: ['muesli'],
  coca: ['cola'], coke: ['cola'], cocacola: ['cola'],
  redbull: ['energisante'], monster: ['energisante'], energy: ['energisante'], burn: ['energisante'], schnitzel: ['escalope'], wienerli: ['saucisse'],
  spaghetti: ['spaghetti', 'pates'], nouille: ['nouille', 'pates'], macaroni: ['macaroni', 'pates'], penne: ['penne', 'pates'], tagliatelle: ['tagliatelle', 'pates'], coquillette: ['coquillette', 'pates'], pate: ['pate'],
  patate: ['pomme de terre'], pdt: ['pomme de terre'], cervelat: ['cervelas', 'cervelat'], steak: ['steak', 'bifteck'], ovo: ['ovomaltine', 'ovo'],
  ketchup: ['ketchup'], chips: ['chips'], frite: ['frite'], ble: ['ble'], fromage: ['fromage']
};
// Aliments qu'on pèse en général cuits : le cuit passe devant le cru quand on ne tape pas « cru »
const CUIT_GROUPES = /viande|poisson|oeufs$/;
const CUIT_TETES = /^(riz|pates?|semoule|quinoa|boulgour|ble|orge|millet|polenta|lentille|haricot|pois chiche|pois casse|petits? pois|feve|brocoli|epinard|chou|poireau|courgette|aubergine|pomme de terre|patate douce|champignon|asperge|fenouil|blette|potiron|courge|celeri|navet|endive|poulet|dinde|boeuf|porc|veau|agneau|canard|lapin|cheval|steak|saumon|cabillaud|thon, frais|truite|colin|merlu|lieu)/;
const MOTS_CUIT = new Set(['cuit', 'cuite', 'cuits', 'cuites', 'bouilli', 'bouillie', 'vapeur', 'grille', 'grillee', 'poele', 'poelee', 'roti', 'rotie', 'etuvee', 'saute', 'sautee', 'braise', 'braisee', 'dur', 'poche', 'brouille', 'coque']);
const MOTS_CRU = new Set(['cru', 'crue', 'crus', 'crues']);
const PETITS_MOTS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'ou', 'a', 'au', 'aux', 'd', 'l', 'en']);
const tokens = s => s.split(/[^a-z0-9]+/).filter(Boolean);
// mots qui finissent par s ou x au singulier : on ne les coupe pas (pois ne doit pas trouver poivron)
const INVARIABLES = new Set(['pois', 'noix', 'jus', 'mais', 'radis', 'anis', 'cassis', 'ananas', 'brebis', 'frais', 'gras', 'riz', 'paris', 'souris', 'lis', 'bis', 'tapas', 'couscous', 'chips', 'fois', 'epais', 'croix', 'perdrix', 'prix']);
const singulier = w => (w.length > 3 && /[sx]$/.test(w) && !INVARIABLES.has(w) ? w.slice(0, -1) : w);
// tête du nom : ce qui vient avant la première virgule, sans « cru » ni parenthèses (« Pomme, chair et peau, crue » -> pomme)
const tete = n => tokens(n.split(',')[0].replace(/\s*\(.*?\)/g, '')).filter(t => !PETITS_MOTS.has(t) && !MOTS_CRU.has(t) && !MOTS_CUIT.has(t));

// Pour chaque mot tapé : la liste des alternatives, chacune une liste de mots à trouver dans le nom.
function motsCherches(q) {
  return normFood(q.trim()).replace(/\bred\s+bull\b/g, 'redbull').replace(/['’-]/g, ' ').split(/[\s,;]+/).filter(w => /[a-z0-9]/.test(w)).map(w => { // un signe seul (/, +) ne cherche rien
    const s = singulier(w), alts = new Set([s]);
    for (const k of [w, s]) for (const a of SYNONYMES[k] || []) alts.add(a);
    return [...alts].map(a => a.split(' '));
  });
}
const contient = (n, terme) => terme.some(alt => alt.every(w => n.includes(w)));

// Distance d'édition (inversion de deux lettres comptée comme une faute), arrêt dès qu'on dépasse max
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let p2 = null, p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const c = [i]; let low = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      c.push(v); if (v < low) low = v;
    }
    if (low > max) return max + 1;
    p2 = p; p = c;
  }
  return p[b.length];
}
// Vocabulaire des noms (mot -> nombre d'aliments qui l'ont), refait si la liste change
function vocabulaire(foods, nameOf) {
  if (vocabulaire.m && vocabulaire.n === foods.length) return vocabulaire.m;
  const m = new Map();
  for (const f of foods) { if (f.hidden || f.twinOf) continue; for (const t of new Set(tokens(nameOf(f)))) if (t.length >= 3) m.set(t, (m.get(t) || 0) + 1); }
  vocabulaire.m = m; vocabulaire.n = foods.length;
  return m;
}
// Le mot le plus courant à une ou deux fautes de w (null si aucun). permis : nombre de fautes tolérées.
function motProche(w, voc, permis) {
  let best = null, bd = permis + 1, bc = 0;
  for (const [t, c] of voc) {
    if (t === w || Math.abs(t.length - w.length) > permis) continue;
    const d = distance(w, t, permis);
    if (d < bd || (d === bd && c > bc)) { best = t; bd = d; bc = c; }
  }
  return bd <= permis ? best : null;
}
const fautesPermises = w => (w.length >= 8 ? 2 : w.length >= 4 ? 1 : 0); // seulement quand rien ne sort

/* Recherche. foods : tous les aliments ; nameOf(f) : nom sans accents ; freq : Map id -> nombre de fois noté.
   Rend { list, compris (mots corrigés [tapé, compris]), proposition (un mot à proposer quand il sort très peu de chose) }. */
function rechercheAliments(q, foods, { limit = 12, nameOf, freq } = {}) {
  let termes = motsCherches(q);
  const out = { list: [], compris: [], proposition: null };
  if (!termes.length) return out;
  const brut = normFood(q).match(/\b(cru|crue|crus|crues|cuit|cuite|cuits|cuites)\b/), tapePrepare = /farci|preemballe|sauce|bolognaise|carbonara|plat|prepare/.test(normFood(q));
  const passe = ts => {
    const hits = [];
    for (const f of foods) {
      if (f.hidden || f.twinOf) continue;
      const n = nameOf(f);
      if (!ts.every(t => contient(n, t))) continue;
      hits.push({ f, s: score(f, n, ts) });
    }
    return hits;
  };
  function score(f, n, ts) {
    const tk = tokens(n), first = ts[0].map(a => a[0]);
    let s = (first.some(w => n.startsWith(w)) ? 0 : 10) + n.length / 100 + (f.base ? 0.5 : 0);
    if (ts.every(t => t.some(alt => alt.every(w => tk.includes(w) || tk.includes(w + 's') || tk.includes(w + 'x'))))) s -= 2; // mots entiers
    if (/aliment moyen|moyenne/.test(n)) s -= 0.3;
    // l'aliment lui-même avant ses dérivés : « pomme » donne la pomme avant la pomme de terre
    const hd = tete(n), simple = ts.filter(t => t.some(alt => alt.length === 1));
    if (hd.length && hd.length === ts.length && simple.length === ts.length && hd.every(x => ts.some(t => t.some(alt => x === alt[0] || x === alt[0] + 's' || x === alt[0] + 'x')))) s -= 4;
    if (!tapePrepare && /farci|preemballe|sauce|bolognaise|carbonara|plat |prepare/.test(n)) s += 2; // plats tout faits après l'aliment simple
    if (!brut && (CUIT_GROUPES.test(normFood(f.g || '')) || CUIT_TETES.test(n))) {
      if (tk.some(t => MOTS_CUIT.has(t))) s -= 2; else if (tk.some(t => MOTS_CRU.has(t))) s += 2;
    }
    const c = freq ? freq.get(f.id) || 0 : 0;
    if (c) s -= Math.min(8, 3 + 1.5 * Math.log2(1 + c)); // déjà noté : en tête
    return s;
  }
  let hits = passe(termes);
  if (!hits.length) { // rien : on tolère une faute par mot, en le disant
    const voc = vocabulaire(foods, nameOf), mots = normFood(q.trim()).replace(/['’-]/g, ' ').split(/[\s,;]+/).filter(Boolean);
    let change = false;
    const corr = mots.map(w => {
      const s = singulier(w);
      if (s.length < 3 || SYNONYMES[w] || SYNONYMES[s] || [...voc.keys()].some(t => t.startsWith(s))) return w; // mot connu ou début de mot : on le garde
      const p = motProche(s, voc, fautesPermises(s));
      if (p) { out.compris.push([w, p]); change = true; return p; }
      return w;
    });
    if (change) { termes = motsCherches(corr.join(' ')); hits = passe(termes); if (!hits.length) out.compris = []; }
  } else { // un mot qui n'existe nulle part en entier, et un mot courant à une faute près (pome -> pomme) : on propose, on ne remplace pas
    const voc = vocabulaire(foods, nameOf), mots = normFood(q.trim()).split(/\s+/).filter(Boolean);
    for (const w of mots) {
      const s = singulier(w);
      if (s.length < 4 || voc.has(w) || voc.has(s) || SYNONYMES[w] || SYNONYMES[s]) continue;
      const p = motProche(s, voc, 1);
      if (p && p.slice(0, 3) === s.slice(0, 3) && !p.startsWith(s) && (voc.get(p) || 0) >= 5) { out.proposition = mots.map(x => (x === w ? p : x)).join(' '); break; }
    }
  }
  out.list = hits.sort((a, b) => a.s - b.s).slice(0, limit).map(x => x.f);
  return out;
}

/* Portions de maison (js/portions.js, grammes lus dans l'USDA). Rien pour un aliment sans correspondance sûre. */
const _portions = new WeakMap();
let _portRe = null;
function portionsOf(f) {
  if (typeof PORTIONS === 'undefined' || !f || !f.base) return [];
  if (_portions.has(f)) return _portions.get(f);
  if (!_portRe) _portRe = PORTIONS.map(r => ({ re: new RegExp(r.re), r }));
  const n = normFood(f.n), hit = _portRe.find(x => x.re.test(n)), out = hit ? hit.r.p.map(([label, g, us]) => ({ label, g, us, fdc: hit.r.fdc })) : [];
  _portions.set(f, out);
  return out;
}
// Libellé d'une quantité : « 2 x 1 gros œuf (100 g) » si la quantité tombe juste sur une portion, sinon « 100 g »
function quantiteTexte(f, g) {
  const p = portionsOf(f).find(x => g > 0 && Math.abs(g / x.g - Math.round(g / x.g)) < 0.01 && Math.round(g / x.g) <= 12);
  if (!p) return `${fmtNum(g)} g`;
  const k = Math.round(g / p.g);
  return `${k === 1 ? p.label : `${k} x ${p.label}`} (${fmtNum(g)} g)`;
}

/* Version cuite d'un aliment cru qu'on mange en général cuit (riz cru -> riz cuit). null si rien de sûr. */
const _cuite = new WeakMap();
function versionCuite(f, foods, nameOf) {
  if (!f || !f.base) return null;
  if (_cuite.has(f)) return _cuite.get(f);
  const n = nameOf(f), tk = tokens(n);
  let out = null;
  if (tk.some(t => MOTS_CRU.has(t)) && (CUIT_GROUPES.test(normFood(f.g || '')) || CUIT_TETES.test(n))) {
    const head = n.split(',')[0].replace(/\s+(crue?s?)$/, '').trim();
    const cand = foods.filter(x => !x.hidden && !x.twinOf && x !== f && nameOf(x).startsWith(head) && tokens(nameOf(x)).some(t => MOTS_CUIT.has(t)) && !/preemballe|farci|sauce|plat/.test(nameOf(x)));
    cand.sort((a, b) => (/aliment moyen/.test(nameOf(b)) ? 1 : 0) - (/aliment moyen/.test(nameOf(a)) ? 1 : 0) || nameOf(a).length - nameOf(b).length);
    out = cand[0] || null;
  }
  _cuite.set(f, out);
  return out;
}
