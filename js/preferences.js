'use strict';
/* KalMydas PERSO : préférences alimentaires. Profil (végétalien, sans porc...), allergies et intolérances (mode strict ou souple),
   liste à cocher de 776 nœuds (data/arbre_aliments.js) avec quatre états, saisie en clair (« pas de champignons »).
   Les drapeaux de chaque aliment viennent de data/regimes.js : '0' absent, '1' présent, '?' inconnu, 't' traces de lactose.
   Méthode et limites : _donnees/REGIMES.md. Ce n'est pas un avis médical : en cas d'allergie grave, lire l'étiquette.
   Tout est rangé dans le coffre chiffré (STATE.nutri.prefs) et part avec l'export du coffre. */

const PR = () => N().prefs || (N().prefs = defaultPrefs());
const ETATS = [['ok', 'Accepté', '✓'], ['eviter', 'À éviter', '–'], ['exclu', 'Exclu', '✕'], ['aime', 'Aimé', '♥']];
const ETAT_NOM = Object.fromEntries(ETATS.map(e => [e[0], e[1].toLowerCase()]));

/* ---------- drapeaux ---------- */
let _flagIx = null, _flagDef = null;
const flagIx = () => _flagIx || (_flagIx = FLAGS_OK() ? Object.fromEntries(FOODFLAGS.meta.ordre.map((t, i) => [t, i])) : {});
const flagDef = t => (_flagDef || (_flagDef = FLAGS_OK() ? Object.fromEntries(FOODFLAGS.meta.drapeaux.map(d => [d.k, d])) : {}))[t];
const flagNom = t => (flagDef(t) || { l: t }).l;
// état d'un drapeau pour un aliment ; un aliment hors base (Open Food Facts, à toi) n'a pas de drapeau : inconnu
function flagOf(id, t) { if (!FLAGS_OK()) return '?'; const s = FOODFLAGS.f[id], i = flagIx()[t]; return s && i !== undefined ? s[i] : '?'; }
const profilDe = k => (FLAGS_OK() && k ? FOODFLAGS.meta.profils.find(p => p.k === k) : null) || null;
const ALLERG_UE = () => (FLAGS_OK() ? FOODFLAGS.meta.allergies : []);
const INTOL = () => (FLAGS_OK() ? FOODFLAGS.meta.intolerances : []);
const flagValide = t => FLAGS_OK() && flagIx()[t] !== undefined;

/* ---------- arbre de la liste à cocher ---------- */
let _arbre = null;
function arbreIx() {
  if (_arbre || !ARBRE_OK()) return _arbre;
  const parent = new Map(), itemDe = new Map(), noeud = new Map(), ids = new Map();
  (function walk(ns, p, d) {
    for (const x of ns) {
      parent.set(x.k, p); noeud.set(x.k, { ...x, d });
      if (x.e) walk(x.e, x.k, d + 1); else for (const id of x.ids) itemDe.set(id, x.k);
    }
  })(ARBRE.racine, null, 0);
  // aliments d'un nœud (lui et ses descendants), calculé à la demande
  const idsDe = k => { if (ids.has(k)) return ids.get(k); const x = noeud.get(k); const out = x.e ? x.e.flatMap(c => idsDe(c.k)) : x.ids.slice(); ids.set(k, out); return out; };
  return (_arbre = { parent, itemDe, noeud, idsDe });
}
const nomNoeud = k => { const A = arbreIx(); const x = A && A.noeud.get(k); return x ? x.l : k; };
// chemin lisible : « Viandes › Porc »
function cheminNoeud(k) { const A = arbreIx(), out = []; for (let x = k; x; x = A.parent.get(x)) out.unshift(A.noeud.get(x).l); return out.join(' › '); }
// état posé le plus proche : l'aliment lui-même, puis son nœud, puis les parents
function etatArbre(id, noeuds) { const A = arbreIx(); if (!A) return null; for (let k = A.itemDe.get(id); k; k = A.parent.get(k)) if (noeuds[k]) return noeuds[k]; return null; }
function etatNoeud(k, noeuds) { const A = arbreIx(); for (let x = k; x; x = A.parent.get(x)) if (noeuds[x]) return { e: noeuds[x], de: x }; return { e: 'ok', de: null }; }

/* ---------- verdict d'un aliment ----------
   Ordre : un aliment ou un nœud exclu à la main, puis les drapeaux à exclure (profil, allergies, intolérances, drapeaux exclus depuis la liste).
   Un drapeau '1' exclut. Un '?' sur une allergie ou une intolérance exclut en mode strict ; sinon l'aliment est « à vérifier ».
   Un '?' sur un drapeau du profil donne toujours « à vérifier » (le mode strict vise les allergies). 't' (lactose mesuré bas) n'exclut pas. */
function prefsCtx() {
  const p = PR(), sig = JSON.stringify(p) + (FLAGS_OK() ? 'f' : '') + (ARBRE_OK() ? 'a' : '');
  if (prefsCtx.c && prefsCtx.c.sig === sig) return prefsCtx.c;
  const prof = profilDe(p.profil), allerg = p.allergies.filter(flagValide), exListe = p.flagsExclus.filter(flagValide);
  const exProf = prof ? prof.exclut : [], ex = [...new Set([...exProf, ...allerg, ...exListe])], ev = [...new Set([...(prof ? prof.eviter : []), ...p.flagsEviter.filter(flagValide)])];
  const cache = new Map(), rcache = new Map();
  function calc(id) {
    const man = p.aliments[id] || etatArbre(id, p.noeuds);
    const out = { v: 'ok', pourquoi: [], doute: [], allerg: [], aime: man === 'aime' };
    // produit à toi ou d'Open Food Facts : aucun drapeau connu ; jamais masqué, toujours « à vérifier » sur l'étiquette quand une règle s'applique
    const f = foodById(id);
    if (f && !f.base) { if (man === 'exclu') { out.v = 'exclu'; out.pourquoi = ['ta liste']; } else if (ex.length) { out.v = 'a_verifier'; out.doute = ex.slice(); out.horsBase = true; } return out; }
    for (const t of allerg) { const s = flagOf(id, t); if (s === '1') out.allerg.push(t); } // pour le badge « contient »
    if (man === 'exclu') { out.v = 'exclu'; out.pourquoi = ['ta liste']; return out; }
    const un = ex.filter(t => flagOf(id, t) === '1');
    if (un.length) { out.v = 'exclu'; out.pourquoi = un; return out; }
    const doute = ex.filter(t => flagOf(id, t) === '?');
    const strictD = p.strict ? doute.filter(t => allerg.includes(t)) : [];
    if (strictD.length) { out.v = 'exclu'; out.pourquoi = strictD; out.strict = true; return out; }
    out.doute = doute;
    if (doute.length) out.v = 'a_verifier';
    const evi = ev.filter(t => flagOf(id, t) !== '0');
    if (man === 'eviter' || evi.length) { out.eviter = true; if (out.v === 'ok') { out.v = 'eviter'; out.pourquoi = evi.length ? evi : ['ta liste']; } }
    return out;
  }
  const actif = !!(prof && (prof.exclut.length || prof.eviter.length)) || allerg.length > 0 || exListe.length > 0 || ev.length > 0 || Object.keys(p.noeuds).length > 0 || Object.keys(p.aliments).length > 0 || p.repasNon.length > 0 || p.cru || p.shelton || p.seul;
  return (prefsCtx.c = { sig, p, prof, allerg, ex, actif, v: id => { let r = cache.get(id); if (!r) { r = calc(id); cache.set(id, r); } return r; }, rcache });
}
const verdictAliment = id => prefsCtx().v(id);

/* ---------- verdict d'un repas complet (data/repas.js) ----------
   Le repas prend le pire verdict de ses ingrédients (exclu, à vérifier, à éviter, accepté) ; il est « aimé » si un ingrédient aimé pèse au moins
   20 % des grammes. En plus, ses propres étiquettes (régimes compatibles, allergènes présents, déduits par _donnees/regles_repas.cjs) doivent
   tenir : un allergène exclu doit être absent des deux côtés. */
const FLAG_VERS_REPAS = { gluten: 'gluten', crustaces: 'crustaces', oeuf: 'oeufs', poisson: 'poisson', arachide: 'arachides', soja: 'soja', lait: 'lait', fruits_coque: 'fruits_a_coque', celeri: 'celeri', moutarde: 'moutarde', sesame: 'sesame', sulfites: 'sulfites', lupin: 'lupin', mollusques: 'mollusques' };
const PROFIL_VERS_REPAS = { pescetarien: 'pescetarien', vegetarien: 'vegetarien', vegetalien: 'vegetalien', sans_porc: 'sans_porc', sans_alcool: 'sans_alcool', sans_gluten: 'sans_gluten', sans_lactose: 'sans_lactose', sans_oeufs: 'sans_oeufs', sans_fruits_coque: 'sans_fruits_a_coque' };
const RANG_V = { ok: 0, eviter: 1, a_verifier: 2, exclu: 3 };
function verdictRepas(m, cx = prefsCtx()) {
  let r = cx.rcache.get(m.id); if (r) return r;
  r = { v: 'ok', pourquoi: [], doute: [], allerg: [], aime: false, eviter: false };
  const exclu = txt => { r.v = 'exclu'; r.pourquoi.push(txt); };
  const p = cx.p;
  if (p.repasNon.includes(m.id)) exclu('tu as dit ne pas aimer ce repas');
  if (p.cru && !m.cru) exclu('pas cru');
  if (p.shelton && !m.shelton) exclu(m.combi ? `mal combiné : ${m.combi.join(', ')}` : 'mal combiné');
  if (p.seul && !m.seul) exclu('plus d\'un aliment');
  const rg = PROFIL_VERS_REPAS[p.profil];
  if (rg && !m.regimes.includes(rg)) exclu(`étiquette du repas : pas ${(REPAS.regimes[rg] || rg).toLowerCase()}`);
  for (const t of new Set([...cx.ex])) {
    if (FLAG_VERS_REPAS[t] && m.allergenes.includes(FLAG_VERS_REPAS[t])) exclu(`étiquette du repas : ${flagNom(t).toLowerCase()}`);
    if (t === 'lactose' && !m.regimes.includes('sans_lactose')) exclu('étiquette du repas : lactose');
    if (t === 'alcool' && m.alcool) exclu('étiquette du repas : alcool');
  }
  let gTot = 0, gAime = 0;
  for (const [id, g] of m.ing) {
    const vi = cx.v(id); gTot += g; if (vi.aime) gAime += g;
    if (vi.v === 'exclu') exclu(`${shortName((foodById(id) || { n: id }).n)} : ${vi.pourquoi.map(t => (t === 'ta liste' ? t : flagNom(t).toLowerCase())).join(', ')}`);
    for (const t of vi.doute) if (!r.doute.includes(t)) r.doute.push(t);
    for (const t of vi.allerg) if (!r.allerg.includes(t)) r.allerg.push(t);
    if (vi.eviter) r.eviter = true;
  }
  if (r.v !== 'exclu') { if (r.doute.length) r.v = 'a_verifier'; else if (r.eviter) r.v = 'eviter'; }
  r.aime = gTot > 0 && gAime / gTot >= 0.2;
  cx.rcache.set(m.id, r);
  return r;
}
// Un allergène exclu ne doit jamais être dans un repas proposé : contrôle utilisé par les tests sur toute la bibliothèque
function repasTientAllergies(m, p = PR()) {
  for (const t of p.allergies) {
    if (FLAG_VERS_REPAS[t] && m.allergenes.includes(FLAG_VERS_REPAS[t])) return false;
    if (t === 'lactose' && !m.regimes.includes('sans_lactose')) return false;
    if (t === 'alcool' && m.alcool) return false;
    for (const [id] of m.ing) { const s = flagOf(id, t); if (s === '1' || (p.strict && s === '?')) return false; }
  }
  return true;
}

/* ---------- textes courts ---------- */
function prefsResume() {
  const p = PR(), prof = profilDe(p.profil), parts = [];
  parts.push(prof ? prof.l : 'Aucun profil (tout permis)');
  if (p.allergies.length) parts.push(`${p.allergies.length > 3 ? p.allergies.length + ' allergies ou intolérances' : 'sans ' + p.allergies.map(t => flagNom(t).toLowerCase()).join(', ')}${p.strict ? ' (strict)' : ''}`);
  const nx = Object.values(p.noeuds).filter(e => e === 'exclu').length + Object.values(p.aliments).filter(e => e === 'exclu').length;
  const na = Object.values(p.noeuds).filter(e => e === 'aime').length + Object.values(p.aliments).filter(e => e === 'aime').length;
  if (p.cru) parts.push('cru');
  if (p.shelton) parts.push('bien combiné');
  if (p.seul) parts.push('un seul aliment');
  if (nx) parts.push(`${nx} exclu${nx > 1 ? 's' : ''} dans ta liste`);
  if (na) parts.push(`${na} aimé${na > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
// Badges d'un aliment dans la recherche : allergène présent (« contient »), à vérifier, exclu, aimé, à éviter
function prefBadges(f) {
  if (!FLAGS_OK()) return null;
  const cx = prefsCtx(); if (!cx.actif) return null;
  const v = cx.v(f.id), out = [];
  if (v.allerg.length) out.push(h('span', { class: 'chip bad', title: 'Allergène présent d\'après les règles de data/regimes.js. Lis toujours l\'étiquette.' }, `contient : ${v.allerg.map(t => flagNom(t).toLowerCase()).join(', ')}`));
  if (v.v === 'exclu' && !v.allerg.length) out.push(h('span', { class: 'chip bad' }, `exclu : ${v.pourquoi.map(t => (t === 'ta liste' ? t : flagNom(t).toLowerCase())).join(', ')}`));
  if (v.v === 'a_verifier') out.push(h('span', { class: 'chip unk', title: 'Recette inconnue : le drapeau n\'est ni prouvé absent ni présent' }, `à vérifier : ${v.doute.map(t => flagNom(t).toLowerCase()).join(', ')}`));
  if (v.v === 'eviter') out.push(h('span', { class: 'chip' }, 'à éviter'));
  if (v.aime) out.push(h('span', { class: 'chip ok' }, 'aimé'));
  return out.length ? h('span', { class: 'chips inline' }, out) : null;
}

/* ---------- poser un état ---------- */
// Cascade : un état posé sur une famille vaut pour toute la famille ; les états posés plus bas et sur ses aliments sont effacés.
function poserEtatNoeud(k, e) {
  const A = arbreIx(); if (!A) return;
  const p = PR(), rs = [garde(p, 'noeuds'), garde(p, 'aliments')];
  const desc = []; (function walk(x) { for (const c of (A.noeud.get(x).e || [])) { desc.push(c.k); walk(c.k); } })(k);
  for (const d of desc) delete p.noeuds[d];
  for (const id of A.idsDe(k)) delete p.aliments[id];
  const herite = A.parent.get(k) ? etatNoeud(A.parent.get(k), p.noeuds).e : 'ok';
  if (e === herite) delete p.noeuds[k]; else p.noeuds[k] = e;
  save(); rerender();
  const x = A.noeud.get(k), acts = [];
  // un nœud qui porte un drapeau : proposer de l'étendre aux plats qui en contiennent
  if (x.tag && (e === 'exclu' || e === 'eviter') && flagValide(x.tag)) acts.push({ label: `Aussi les plats avec ${flagNom(x.tag).toLowerCase()}`, run: () => poserFlag(x.tag, e) });
  else if (x.aussi && x.aussi.length && e !== 'ok') acts.push({ label: `Aussi les ${x.aussi.length} plats qui en contiennent`, run: () => { const r = garde(p, 'aliments'); for (const id of x.aussi) p.aliments[id] = e; save(); rerender(); undoable(`${x.aussi.length} plats : ${ETAT_NOM[e]}`, r); } });
  undoable(`${x.l} : ${ETAT_NOM[e]}${desc.length ? ', toute la famille' : ''}`, rs, { actions: acts });
}
function poserEtatAliment(id, e) {
  const p = PR(), r = garde(p, 'aliments'), herite = etatArbre(id, p.noeuds) || 'ok';
  if (e === herite) delete p.aliments[id]; else p.aliments[id] = e;
  save(); rerender(); undoable(`${shortName((foodById(id) || { n: id }).n)} : ${ETAT_NOM[e]}`, r);
}
// Drapeau exclu ou évité depuis la liste ou la saisie en clair. Une allergie ou une intolérance de la liste UE va dans les allergies.
function poserFlag(t, e) {
  const p = PR(), rs = ['allergies', 'flagsExclus', 'flagsEviter'].map(k => garde(p, k));
  const out = list => list.filter(x => x !== t);
  p.allergies = out(p.allergies); p.flagsExclus = out(p.flagsExclus); p.flagsEviter = out(p.flagsEviter);
  if (e === 'exclu') { if ([...ALLERG_UE(), ...INTOL()].includes(t)) p.allergies.push(t); else p.flagsExclus.push(t); }
  else if (e === 'eviter') p.flagsEviter.push(t);
  save(); rerender(); undoable(`${flagNom(t)} : ${e === 'ok' ? 'plus de règle' : ETAT_NOM[e] + ' partout, plats compris'}`, rs);
}
function choisirProfil(k) {
  const p = PR(), r = garde(p, 'profil');
  p.profil = k === 'omnivore' ? null : k; save(); rerender();
  const prof = profilDe(k); undoable(`Profil : ${prof ? prof.l : 'aucun'}`, r);
}
function basculerAllergie(t) {
  const p = PR(), rs = [garde(p, 'allergies'), garde(p, 'flagsExclus')];
  if (p.allergies.includes(t)) p.allergies = p.allergies.filter(x => x !== t); else { p.allergies.push(t); p.flagsExclus = p.flagsExclus.filter(x => x !== t); }
  save(); rerender(); undoable(`${flagNom(t)} : ${p.allergies.includes(t) ? 'exclu' : 'permis'}`, rs);
}

/* ---------- saisie en clair : « pas de champignons », « j'aime le saumon », « allergique aux arachides » ---------- */
const PREF_VERBES = [
  [/^(je suis )?(allergique|intolerante?|allergie|intolerance)s? (a la |a l |aux |au |a |de |du |des )?/, 'exclu', true],
  [/^(pas de |pas d |pas |sans |jamais de |jamais d |jamais |je ne veux pas de |je ne veux pas d |je ne veux pas |je ne veux plus de |je ne mange pas de |je ne mange pas d |je ne mange pas |je ne mange plus de |je n aime pas |j aime pas |je deteste |deteste |non a |exclure )/, 'exclu'],
  [/^(j evite |j evite de manger |eviter |evite |moins de |moins d |peu de |peu d |pas trop de |pas trop d |limiter )/, 'eviter'],
  [/^(j aime |j adore |aime |adore |beaucoup de |beaucoup d |favoriser |plus souvent |je veux |j en veux )/, 'aime'],
  [/^(ok pour |j accepte |accepter |remettre |permis )/, 'ok']
];
const PREF_ARTICLES = new Set(['le', 'la', 'les', 'l', 'du', 'de', 'des', 'd', 'au', 'aux', 'a', 'un', 'une', 'en', 'mon', 'ma', 'mes']);
const motsPref = s => normFood(s).replace(/['’-]/g, ' ').split(/[^a-z0-9]+/).filter(w => w && !PREF_ARTICLES.has(w)).map(singulier);
function lirePreference(txt) {
  let s = normFood(String(txt || '').trim()).replace(/['’]/g, ' ').replace(/\s+/g, ' '), etat = null, allergie = false;
  for (const [re, e, al] of PREF_VERBES) { const m = s.match(re); if (m) { etat = e; allergie = !!al; s = s.slice(m[0].length); break; } }
  const mots = motsPref(s); if (!mots.length) return null;
  const cible = trouverCible(mots, allergie);
  return { etat, cible, mots: mots.join(' '), allergie };
}
// Le nœud dont le nom colle le mieux ; sinon un drapeau (gluten, lactose, alcool...). Rien de deviné au-delà.
function trouverCible(mots, allergie) {
  const A = arbreIx(), q = mots.join(' ');
  const flags = FLAGS_OK() ? FOODFLAGS.meta.drapeaux.map(d => ({ k: d.k, m: motsPref(d.l).join(' ') })) : [];
  const fl = flags.find(f => f.m === q || f.k === q.replace(/ /g, '_'));
  if (allergie && fl) return { type: 'flag', k: fl.k, l: flagNom(fl.k) };
  if (A) {
    let best = null, bs = 99;
    for (const [k, x] of A.noeud) {
      const lm = motsPref(x.l), l = lm.join(' ');
      let s = 99;
      if (l === q) s = 0 + x.d * 0.01;
      else if (lm[0] === mots[0] && mots.every(w => lm.includes(w))) s = 1 + lm.length * 0.1 + x.d * 0.01;
      else if (mots.every(w => lm.some(t => t === w || t.startsWith(w)))) s = 2 + lm.length * 0.1 + x.d * 0.01;
      if (s < bs) { bs = s; best = k; }
    }
    if (best && (bs < 1 || !fl)) return { type: 'noeud', k: best, l: cheminNoeud(best), n: A.noeud.get(best).n };
  }
  if (fl) return { type: 'flag', k: fl.k, l: flagNom(fl.k) };
  return null;
}
function appliquerPreference(lu) {
  if (!lu || !lu.cible) return false;
  if (lu.cible.type === 'flag') { if (lu.etat === 'aime') { toast(`« ${lu.cible.l} » est une règle : aimer ne s'applique qu'à un aliment de la liste.`); return false; } poserFlag(lu.cible.k, lu.etat || 'exclu'); return true; }
  poserEtatNoeud(lu.cible.k, lu.etat);
  if (lu.allergie) { const t = arbreIx().noeud.get(lu.cible.k).tag; if (t && flagValide(t)) poserFlag(t, 'exclu'); }
  return true;
}

/* ---------- écran Préférences ---------- */
const PRF_UI = { open: new Set(), q: '', texte: '', arbre: false };
// Comptes par nœud selon le verdict de chaque aliment (exclus, à éviter, aimés), refaits quand les préférences changent
function comptesNoeuds() {
  const cx = prefsCtx(), A = arbreIx(); if (!A) return new Map();
  if (comptesNoeuds.sig === cx.sig) return comptesNoeuds.m;
  const m = new Map(), add = (k, c) => { const o = m.get(k) || { exclu: 0, eviter: 0, aime: 0, verif: 0 }; o.exclu += c.exclu; o.eviter += c.eviter; o.aime += c.aime; o.verif += c.verif; m.set(k, o); };
  for (const [k, x] of A.noeud) {
    if (x.e) continue;
    const c = { exclu: 0, eviter: 0, aime: 0, verif: 0 };
    for (const id of x.ids) { const v = cx.v(id); if (v.v === 'exclu') c.exclu++; else if (v.v === 'eviter') c.eviter++; else if (v.v === 'a_verifier') c.verif++; if (v.aime) c.aime++; }
    for (let y = k; y; y = A.parent.get(y)) add(y, c);
  }
  comptesNoeuds.sig = cx.sig; comptesNoeuds.m = m;
  return m;
}
function controleEtat(nom, courant, explicite, onpick) {
  return h('div', { class: 'etats', role: 'group', 'aria-label': `État de ${nom}` }, ETATS.map(([e, l, ic]) => h('button', { type: 'button', class: `etat e-${e}${courant === e ? (explicite ? ' on' : ' herite') : ''}`, 'aria-pressed': courant === e ? 'true' : 'false',
    title: `${l}${courant === e && !explicite ? ' (hérité de la famille)' : ''}`, 'aria-label': `${l} : ${nom}`, onclick: () => onpick(e) }, ic)));
}
function ligneNoeud(k, cpt) {
  const A = arbreIx(), x = A.noeud.get(k), p = PR(), st = etatNoeud(k, p.noeuds), c = cpt.get(k) || {}, ouvert = PRF_UI.open.has(k);
  const plus = x.e || x.ids.length > 1;
  return h('div', { class: `noeud d${x.d}` },
    h('div', { class: 'noeud-ligne' },
      plus ? h('button', { class: 'icon tog', 'aria-expanded': ouvert ? 'true' : 'false', 'aria-label': `${ouvert ? 'Replier' : 'Ouvrir'} ${x.l}`, onclick: () => { if (ouvert) PRF_UI.open.delete(k); else PRF_UI.open.add(k); rerender(); } }, ouvert ? '▾' : '▸') : h('span', { class: 'tog-vide' }),
      h('div', { class: 'grow' }, h('span', null, x.l), h('small', { class: 'muted' }, ` ${x.n} aliment${x.n > 1 ? 's' : ''}`),
        c.exclu ? h('small', { class: 'neg' }, ` · ${c.exclu} exclu${c.exclu > 1 ? 's' : ''}`) : null, c.eviter ? h('small', { class: 'unk' }, ` · ${c.eviter} à éviter`) : null, c.aime ? h('small', { class: 'pos' }, ` · ${c.aime} aimé${c.aime > 1 ? 's' : ''}`) : null),
      controleEtat(x.l, st.e, st.de === k, e => poserEtatNoeud(k, e))),
    ouvert ? (x.e ? h('div', { class: 'enfants' }, x.e.map(ch => ligneNoeud(ch.k, cpt))) : h('div', { class: 'enfants' }, x.ids.map(id => ligneAliment(id)))) : null);
}
function ligneAliment(id) {
  const f = foodById(id), p = PR(), man = p.aliments[id], her = etatArbre(id, p.noeuds) || 'ok', v = verdictAliment(id);
  const nom = f ? f.n : id;
  return h('div', { class: 'noeud aliment' }, h('div', { class: 'noeud-ligne' }, h('span', { class: 'tog-vide' }),
    h('div', { class: 'grow' }, h('small', null, nom), v.v === 'exclu' && !man && her !== 'exclu' ? h('small', { class: 'neg' }, ` · exclu : ${v.pourquoi.map(t => flagNom(t).toLowerCase()).join(', ')}`) : null,
      v.v === 'a_verifier' ? h('small', { class: 'unk' }, ` · à vérifier : ${v.doute.map(t => flagNom(t).toLowerCase()).join(', ')}`) : null),
    controleEtat(nom, man || her, !!man, e => poserEtatAliment(id, e))));
}
// Ma façon de manger : cru, combinaisons de Shelton (26 octobre 2026). Le menu du jour et la bibliothèque ne proposent plus que ces repas.
function basculerFacon(k, nom) { const p = PR(), r = garde(p, k); p[k] = !p[k]; save(); rerender(); undoable(`${nom} : ${p[k] ? 'oui' : 'non'}`, r); }
function carteFacon(p) {
  if (!REPAS_OK()) return null;
  const n = f => REPAS.repas.filter(f).length;
  const chip = (k, nom, nb, def) => h('button', { type: 'button', class: `chip pick${p[k] ? ' sel' : ''}`, 'aria-pressed': p[k] ? 'true' : 'false', title: def, onclick: () => basculerFacon(k, nom) }, `${p[k] ? '✓ ' : ''}${nom} · ${nb} repas`);
  return h('section', { class: 'card' }, h('h3', null, 'Ma façon de manger'),
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Ma façon de manger' },
      chip('cru', 'Cru', n(m => m.cru), 'Aucune cuisson, chaque ingrédient cru. Coché : le menu et la bibliothèque ne proposent que ces repas.'),
      chip('shelton', 'Bien combiné (Shelton)', n(m => m.shelton), 'Jamais un féculent avec une protéine, un fruit acide ou du sucre, une seule protéine, les fruits sans légumes, melon et lait seuls. Règles de naturopathie, pas un consensus médical.'),
      chip('seul', 'Un seul aliment', n(m => m.seul), 'Un fruit, un légume, un fromage, une viande… seul. Coché : le menu ne propose que des repas d\'un seul aliment.')),
    h('small', { class: 'muted block' }, `Cru et bien combiné ensemble : ${n(m => m.cru && m.shelton)} repas.`));
}
// Repas pour toi (27 octobre 2026) : ce que tes choix donnent, tout de suite. Ce que tu aimes passe devant, puis un ordre fixe du jour qui mélange.
const PRF_POUR = { n: 0, moment: '' }; // 0 : la taille de départ (5 sur téléphone, 8 sinon)
function carteRepasPourToi() {
  if (!REPAS_OK() || typeof mnRepasInfo !== 'function') return null;
  const cx = prefsCtx(), info = mnRepasInfo(), p = cx.p, mo = PRF_POUR.moment;
  if (!PRF_POUR.n) PRF_POUR.n = estTelephone() ? 5 : 8;
  const garde = REPAS.repas.filter(m => (mo === 'seul' ? m.seul : !!m.seul === !!p.seul)
    && (!mo || mo === 'seul' || (m.seul ? m.creneaux.includes(mo) : m.creneau === mo)) && verdictRepas(m, cx).v !== 'exclu');
  const graine = Number(today().replace(/-/g, '')), melange = id => { let x = graine; for (const c of id) x = (x * 31 + c.charCodeAt(0)) % 2147483647; return x; };
  // ici, un repas « avec ce que tu aimes » en contient, même un peu : la plus grande part passe devant (le menu garde sa règle des 20 %)
  const partAime = m => { let t = 0, a = 0; for (const [id, g] of m.ing) { t += g; if (cx.v(id).aime) a += g; } return t ? a / t : 0; };
  const aimeDe = new Map(garde.map(m => [m.id, partAime(m)]));
  const tri = garde.map(m => ({ m, a: aimeDe.get(m.id), r: verdictRepas(m, cx).v === 'ok' ? 0 : 1, x: melange(m.id) }))
    .sort((a, b) => (b.a > 0) - (a.a > 0) || a.r - b.r || b.a - a.a || a.x - b.x).map(o => o.m);
  const nAime = garde.filter(m => aimeDe.get(m.id) > 0).length;
  const ligne = m => {
    const vr = verdictRepas(m, cx), mi = info.get(m.id), cr = m.seul ? m.creneaux[0] : m.creneau, meal = MN_CRENEAUX.find(c => c.k === cr).meal;
    const o = { m, vr, coef: 1, portion: 'normale', meal, slot: cr, kcal: mi.kcal, p: mi.vec[mnKeys().iP], top: [], phrase: '' };
    return h('div', { class: 'item' }, h('div', { class: 'grow click', onclick: () => mnDetail(o), title: 'Voir les ingrédients' }, h('b', null, m.nom),
      h('small', { class: 'muted' }, ` · ${m.seul ? 'un seul aliment' : meal.toLowerCase()}${aimeDe.get(m.id) > 0 ? ' · ♥' : ''} · ${fmtK(mi.kcal)} kcal · ${fmtG(o.p)} g prot.`),
      vr.v === 'a_verifier' ? h('small', { class: 'unk block' }, `À vérifier : ${vr.doute.map(t => flagNom(t).toLowerCase()).join(', ')}`) : null),
      h('button', { class: 'btn small', 'aria-label': `Je le mange : ${m.nom}`, onclick: () => mnManger(o) }, 'Je le mange'));
  };
  return h('section', { class: 'card' }, h('h3', null, 'Repas pour toi'),
    h('small', { class: 'muted block' }, garde.length ? `${garde.length} repas tiennent tes choix${nAime ? `, dont ${nAime} avec ce que tu aimes (en premier)` : ''}. Mets ♥ sur un aliment plus bas : ses repas passent devant.` : 'Aucun repas ne tient tous tes choix. Retire un exclu ou une façon de manger.'),
    seg([['', 'Tous'], ...MN_CRENEAUX.map(c => [c.k, c.meal]), ['seul', 'Un seul aliment']], mo, v => { PRF_POUR.moment = v; PRF_POUR.n = 0; rerender(); }),
    h('div', { class: 'list' }, tri.slice(0, PRF_POUR.n).map(ligne)),
    tri.length > PRF_POUR.n ? h('button', { class: 'btn small ghost', onclick: () => { PRF_POUR.n += 12; rerender(); } }, `Voir plus (${tri.length - PRF_POUR.n} de plus)`) : null);
}
function vuePreferences(root) {
  if (!FLAGS_OK() || !ARBRE_OK()) return put(root, h('section', { class: 'card' }, h('h3', null, 'Préférences'), h('p', { class: 'neg' }, `Données des régimes non chargées (${DONNEES_CHARGE.err.join(', ') || 'chargement en cours'}). Recharge la page.`)));
  const p = PR(), prof = profilDe(p.profil), cpt = comptesNoeuds(), A = arbreIx();
  const comptes = (FOODFLAGS.meta.profils_comptes || {})[prof ? prof.k : 'omnivore'];
  const bibRepas = REPAS_OK() ? REPAS.repas.filter(m => !!m.seul === !!p.seul) : [], nRepas = REPAS_OK() ? bibRepas.filter(m => verdictRepas(m).v !== 'exclu').length : null;
  // saisie en clair
  const lu = PRF_UI.texte.trim() ? lirePreference(PRF_UI.texte) : null;
  const apercu = h('small', { class: 'muted block', 'aria-live': 'polite' }, !PRF_UI.texte.trim() ? 'Exemples : « pas de champignons », « j\'aime le saumon », « j\'évite le porc », « allergique aux arachides ».'
    : !lu || !lu.cible ? 'Pas trouvé dans la liste. Cherche plus bas, dans la liste à cocher.'
    : !lu.etat ? `Trouvé : ${lu.cible.l}. Dis « pas de », « j'évite » ou « j'aime ».`
    : `Compris : ${lu.cible.l}${lu.cible.n ? ` (${lu.cible.n} aliments)` : ''} → ${ETAT_NOM[lu.etat]}${lu.cible.type === 'flag' ? ', plats compris' : ''}. Entrée pour appliquer.`);
  const texte = inp('text', PRF_UI.texte, { 'aria-label': 'Dire ce que je veux ou ne veux pas', placeholder: 'Pas de champignons, j\'aime le saumon…', 'data-noenter': '1',
    oninput: e => { PRF_UI.texte = e.target.value; const l2 = PRF_UI.texte.trim() ? lirePreference(PRF_UI.texte) : null; apercu.textContent = !PRF_UI.texte.trim() ? '' : !l2 || !l2.cible ? 'Pas trouvé dans la liste. Cherche plus bas, dans la liste à cocher.' : !l2.etat ? `Trouvé : ${l2.cible.l}. Dis « pas de », « j'évite » ou « j'aime ».` : `Compris : ${l2.cible.l}${l2.cible.n ? ` (${l2.cible.n} aliments)` : ''} → ${ETAT_NOM[l2.etat]}${l2.cible.type === 'flag' ? ', plats compris' : ''}. Entrée pour appliquer.`; },
    onkeydown: e => { if (e.key !== 'Enter') return; e.preventDefault(); const l2 = lirePreference(PRF_UI.texte); if (l2 && l2.cible && l2.etat) { PRF_UI.texte = ''; e.target.value = ''; appliquerPreference(l2); } else toast('Dis « pas de… », « j\'évite… » ou « j\'aime… » suivi d\'un aliment de la liste'); } });
  // recherche dans l'arbre
  const nq = normFood(PRF_UI.q.trim()), mq = nq ? motsPref(nq) : [];
  const trouves = mq.length ? [...A.noeud.values()].filter(x => { const lm = motsPref(x.l); return mq.every(w => lm.some(t => t.startsWith(w))); }).sort((a, b) => a.d - b.d || a.l.localeCompare(b.l)).slice(0, 30) : [];
  const alimTrouves = mq.length >= 1 && nq.length >= 3 ? searchFoods(PRF_UI.q, 12, { tous: true }) : [];
  put(root,
    h('section', { class: 'card gold' }, h('h3', null, 'Mon profil alimentaire'),
      h('div', { class: 'chips profils', role: 'group', 'aria-label': 'Profil alimentaire' }, FOODFLAGS.meta.profils.map(x => {
        const on = (p.profil || 'omnivore') === x.k;
        return h('button', { type: 'button', class: `chip pick${on ? ' sel' : ''}`, 'aria-pressed': on ? 'true' : 'false', title: `${x.def} Source : ${x.source}.`, onclick: () => { if (!on) choisirProfil(x.k); } }, x.l);
      })),
      h('p', { class: 'small' }, h('b', null, prof ? prof.l : 'Omnivore'), ` : ${(prof || profilDe('omnivore') || { def: '' }).def} `, h('small', { class: 'muted' }, `Source : ${(prof || profilDe('omnivore') || { source: '' }).source}.`)),
      comptes ? h('small', { class: 'muted block' }, `Dans la base : ${fmtK(comptes.ok)} aliments sûrs, ${fmtK(comptes.a_verifier)} à vérifier, ${fmtK(comptes.exclu)} exclus${comptes.a_eviter ? `, ${fmtK(comptes.a_eviter)} à éviter` : ''} (profil seul).`) : null,
      nRepas !== null ? h('small', { class: 'muted block' }, `Bibliothèque : ${nRepas} ${p.seul ? "repas d'un seul aliment" : "repas complets"} sur ${bibRepas.length} tiennent toutes tes préférences.`) : null),
    carteFacon(p),
    carteRepasPourToi(),
    foldCard('prefs-allergies', `Allergies et intolérances${p.allergies.length ? ` · ${p.allergies.length}` : ''}`, [
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Allergies et intolérances' }, [...ALLERG_UE(), ...INTOL()].map(t => {
        const on = p.allergies.includes(t), d = flagDef(t) || {};
        return h('button', { type: 'button', class: `chip pick${on ? ' sel-bad' : ''}`, 'aria-pressed': on ? 'true' : 'false', title: `${d.def || ''} Source : ${d.source || ''}.`, onclick: () => basculerAllergie(t) }, `${on ? '✕ ' : ''}${flagNom(t)}`);
      })),
      h('div', { class: 'row wrap' }, h('small', { class: 'muted' }, 'Mode :'), seg([['souple', 'Souple'], ['strict', 'Strict']], p.strict ? 'strict' : 'souple', v => { const r = garde(p, 'strict'); p.strict = v === 'strict'; save(); rerender(); undoable(`Mode ${v}`, r); })),
      h('small', { class: 'muted block' }, p.strict ? 'Strict : un aliment dont la recette est inconnue pour cet allergène (« ? ») est écarté aussi. À prendre pour une allergie grave.'
        : 'Souple : un aliment présent (« 1 ») est écarté ; un aliment à recette inconnue (« ? ») reste proposé avec la mention « à vérifier ».'),
      h('p', { class: 'unk small' }, FOODFLAGS.meta.avertissement)], { open: p.allergies.length > 0 }),
    h('section', { class: 'card' }, h('h3', null, 'Ce que je veux ou ne veux pas'),
      h('div', { class: 'form' }, texte, apercu),
      h('div', { class: 'row wrap', style: { marginTop: '.6rem' } }, inp('search', PRF_UI.q, { 'aria-label': 'Chercher dans la liste à cocher', placeholder: 'Chercher dans la liste (poulet, tomate, coriandre…)', oninput: e => { PRF_UI.q = e.target.value; rerender(); } }),
        h('button', { class: 'btn small ghost', onclick: () => { if (!Object.keys(p.noeuds).length && !Object.keys(p.aliments).length) return toast('Rien à remettre'); const rs = [garde(p, 'noeuds'), garde(p, 'aliments')]; p.noeuds = {}; p.aliments = {}; save(); rerender(); undoable('Liste remise à zéro : tout accepté', rs); } }, 'Tout accepter')),
      h('div', { class: 'legende small muted' }, ETATS.map(([e, l, ic]) => h('span', null, h('b', { class: `e-${e}` }, ic), ` ${l}`)), h('span', null, 'Un état posé sur une famille vaut pour toute la famille.')),
      mq.length ? h('div', { class: 'arbre' }, trouves.length ? trouves.map(x => h('div', null, h('small', { class: 'muted' }, cheminNoeud(x.k)), ligneNoeud(x.k, cpt))) : h('div', { class: 'empty' }, 'Aucune famille ni aliment de base à ce nom.'),
        alimTrouves.length ? h('div', null, h('small', { class: 'muted up' }, 'Aliments précis'), alimTrouves.map(f => ligneAliment(f.id))) : null)
        : h('details', { class: 'arbre-pli', open: PRF_UI.arbre, ontoggle: e => { PRF_UI.arbre = e.target.open; } }, h('summary', null, `Liste à cocher : ${ARBRE.racine.length} familles`), h('div', { class: 'arbre' }, ARBRE.racine.map(x => ligneNoeud(x.k, cpt)))),
      h('label', { class: 'daybox', style: { marginTop: '.6rem' } }, h('input', { type: 'checkbox', checked: p.masquer, onchange: e => { p.masquer = e.target.checked; save(); rerender(); } }), 'Masquer dans la recherche d\'aliments ce que j\'exclus'),
      p.repasNon.length ? h('div', { class: 'row wrap', style: { marginTop: '.5rem' } }, h('small', { class: 'muted' }, `${p.repasNon.length} repas refusé${p.repasNon.length > 1 ? 's' : ''} (« Pas pour moi »).`),
        h('button', { class: 'btn small ghost', onclick: () => { const r = garde(p, 'repasNon'); p.repasNon = []; save(); rerender(); undoable('Repas refusés remis dans les propositions', r); } }, 'Les remettre')) : null));
}
// Une ligne pour le profil (Réglages) et l'accueil : un geste mène aux préférences
function prefsLigne() {
  return h('div', { class: 'row wrap', style: { marginTop: '.7rem' } }, h('small', { class: 'muted grow' }, `Préférences alimentaires : ${FLAGS_OK() ? prefsResume() : 'données non chargées'}`), h('a', { class: 'btn small ghost', href: '#/nutri/preferences' }, 'Régler'));
}
