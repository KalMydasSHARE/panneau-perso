'use strict';
/* KalMydas PERSO : menu du jour. Se calcule tout seul à l'ouverture, sans attendre un premier repas noté.
   Bibliothèque : data/repas.js (447 repas complets, valeurs calculées avec data/ciqual.js). Préférences : js/preferences.js.
   Ce qui compte : ce qui est déjà mangé et prévu aujourd'hui, les compléments, le budget de calories et de protéines du profil, les besoins
   restants, l'urgence des réserves estimées (js/reserves.js, donc les jours d'avant), la diversité (ni le même repas ni les mêmes ingrédients
   principaux que les trois derniers jours), le temps de préparation voulu, le jeûne en cours.
   Méthode : pour les créneaux encore ouverts, une combinaison est cherchée (départ glouton, montée créneau par créneau, 8 départs tirés avec
   une graine du jour) qui maximise la couverture des repères (pondérée par l'urgence) en tenant le budget. Même jour et mêmes données : même
   résultat. Le calcul est gardé tant que les données ne changent pas. Estimations, pas un avis médical. */

const MN_CRENEAUX = [
  { k: 'petit-dejeuner', meal: 'Petit-déjeuner', de: 5, a: 11, part: 0.25 },
  { k: 'dejeuner', meal: 'Déjeuner', de: 11, a: 15, part: 0.35 },
  { k: 'collation', meal: 'Collation', de: 15, a: 18.5, part: 0.10, facultatif: true },
  { k: 'diner', meal: 'Dîner', de: 17, a: 24, part: 0.30 }
];
const MN_PORTIONS = [['petite', 0.75], ['normale', 1], ['grande', 1.35]];
const MN_TEMPS = [5, 10, 20, 40];
const MN_SESSION = { autres: {}, matinEncore: null }; // matinEncore : « petit » ou « repas » après un premier petit truc // « Autre proposition » : repas passés pour la journée, en mémoire seulement
const MN_UI = { ouverts: new Set() }; // créneaux dont on a demandé les trois propositions
const MN_REPET = 0.04; // malus quand deux créneaux du même jour partagent un ingrédient principal

/* ---------- vecteurs des repas ---------- */
let MN_K = null;
function mnKeys() {
  if (MN_K) return MN_K;
  const mic = MICROS_AVG.map(m => m[0]), keys = [...mic, 'fib', 'kcal', 'p', 'salt', 'sat'];
  return (MN_K = { keys, nMic: mic.length, nCov: mic.length + 1, iK: mic.length + 1, iP: mic.length + 2, iSalt: mic.length + 3, iSat: mic.length + 4 });
}
// Ingrédient « banal » : ni la matière grasse, ni le sel, ni les épices, ni la boisson ne font un ingrédient principal
const mnBanal = f => /matières grasses|graisses et huiles|aides culinaires|eaux et autres boissons|boissons/i.test(f.g || '') || /^(eau|sel|huile|vinaigre|poivre|sucre|bouillon)/i.test(f.n);
// Ingrédient comparé par son aliment de base (« Poulet » regroupe ses 37 formes) quand la liste à cocher le connaît
const mnCle = id => { const A = arbreIx(); return (A && A.itemDe.get(id)) || id; };
function mnRepasInfo() {
  const nb = ciqualFoods().length;
  if (mnRepasInfo.c && mnRepasInfo.n === nb) return mnRepasInfo.c;
  const K = mnKeys(), m = new Map();
  for (const r of REPAS.repas) {
    const vec = new Float64Array(K.keys.length), inconnus = new Set();
    const ing = r.ing.map(([id, g]) => ({ id, g, f: foodById(id) }));
    for (const x of ing) {
      if (!x.f) { inconnus.add('aliment absent'); continue; }
      for (let i = 0; i < K.keys.length; i++) { const v = x.f.v[K.keys[i]]; if (v === undefined) inconnus.add(K.keys[i]); else vec[i] += (v * x.g) / 100; }
    }
    const kT = vec[K.iK], pT = vec[K.iP];
    const main = [...new Set(ing.filter(x => x.f && !mnBanal(x.f) && (((x.f.v.kcal || 0) * x.g) / 100 >= 0.25 * kT || (pT > 5 && ((x.f.v.p || 0) * x.g) / 100 >= 0.4 * pT))).map(x => mnCle(x.id)))];
    m.set(r.id, { r, vec, inconnus, main, kcal: kT });
  }
  mnRepasInfo.n = nb;
  return (mnRepasInfo.c = m);
}
/* Ingrédients principaux de ce qui est noté ou prévu un jour, repas par repas, avec la même règle que pour la bibliothèque :
   au moins 25 % des calories du repas, ou 40 % de ses protéines, hors matière grasse, sel, épices et boissons. */
function mainsNotes(d) {
  const out = new Set(), groupes = new Map();
  for (const e of [...(N().log[d] || []), ...(N().plan[d] || [])]) {
    if (e.repas && REPAS_OK()) { const mi = mnRepasInfo().get(e.repas); if (mi) { mi.main.forEach(k => out.add(k)); continue; } }
    if (!e.food) continue;
    const f = foodById(e.food); if (!f) continue;
    (groupes.get(e.meal) || groupes.set(e.meal, []).get(e.meal)).push({ f, g: e.g });
  }
  for (const es of groupes.values()) {
    const kT = sum(es, x => ((x.f.v.kcal || 0) * x.g) / 100), pT = sum(es, x => ((x.f.v.p || 0) * x.g) / 100);
    for (const x of es) if (!mnBanal(x.f) && (((x.f.v.kcal || 0) * x.g) / 100 >= 0.25 * kT || (pT > 5 && ((x.f.v.p || 0) * x.g) / 100 >= 0.4 * pT))) out.add(mnCle(x.f.id));
  }
  return out;
}
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mnGraine = s => hashStr(2166136261, s) >>> 0;
const mnNom = k => { const m = MICROS.find(x => x[0] === k), n = m ? m[1] : k === 'fib' ? 'Fibres' : k; return /^[A-Z]\d/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1); };
const mnPct = x => `${Math.round(x * 100)} %`;
const mnListe = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}`);

// Compléments pris au moins 4 jours sur les 7 d'avant : comptés pour une journée à venir (dose habituelle)
function complementsHabituels(date) {
  const out = {};
  for (const s of N().supps) { let n = 0, tot = 0; for (let i = 1; i <= 7; i++) { const c = (N().supLog[addDays(date, -i)] || {})[s.id] || 0; if (c) { n++; tot += c; } } if (n >= 4) out[s.id] = Math.max(1, Math.round(tot / n)); }
  return out;
}

/* ---------- état des créneaux ---------- */
function mnCreneaux(date, mode) {
  if (mode === 'journee') return MN_CRENEAUX.map(c => ({ ...c, etat: 'ouvert' }));
  const now = new Date(), hNow = date === today() ? now.getHours() + now.getMinutes() / 60 : date < today() ? 99 : 0;
  const eaten = new Set((N().log[date] || []).map(e => e.meal)), plan = N().plan[date] || [];
  const f = N().fast, finJeune = f ? f.start + f.goal * 3600000 : 0;
  return MN_CRENEAUX.map(c => {
    const fin = parseD(date).getTime() + c.a * 3600000;
    const etat = eaten.has(c.meal) ? 'mange' : plan.some(e => e.meal === c.meal) ? 'prevu' : hNow >= c.a ? 'passe' : finJeune > now.getTime() && fin <= finJeune ? 'jeune' : 'ouvert';
    // le matin : un petit truc d'abord ; après lui, encore un petit truc ou un repas, au choix (26 octobre 2026)
    if (c.k === 'petit-dejeuner') {
      const encore = etat === 'mange' && MN_SESSION.matinEncore && date === today() && hNow < c.a;
      const matin = encore ? MN_SESSION.matinEncore : (N().menu.matin || 'petit');
      if (encore || etat === 'ouvert') return { ...c, etat: 'ouvert', encore, matin, part: matin === 'petit' ? 0.1 : c.part, apresJeune: finJeune > now.getTime() ? finJeune : 0 };
    }
    return { ...c, etat, apresJeune: etat === 'ouvert' && finJeune > now.getTime() ? finJeune : 0 };
  });
}

// Petit truc du matin : une collation, ou un petit-déjeuner de 350 kcal au plus
const MN_PETIT_KCAL = 350;
function mnPourCreneau(r, s, info) {
  if (s.k !== 'petit-dejeuner' || s.matin !== 'petit') return r.creneau === s.k;
  return r.creneau === 'collation' || (r.creneau === 'petit-dejeuner' && info.get(r.id).kcal <= MN_PETIT_KCAL);
}
/* ---------- le calcul ---------- */
function menuCalcule(date, mode = 'reste') {
  const t0 = performance.now(), K = mnKeys(), L = K.keys.length, info = mnRepasInfo(), cx = prefsCtx(), tgO = targets(), R = reservesEtat();
  const tg = new Float64Array(L);
  K.keys.forEach((k, i) => { tg[i] = k === 'salt' ? limitOf('salt') : k === 'sat' ? limitOf('sat') : tgO[k] || 0; });
  // poids : 1 + 2 x urgence de la réserve (0 à 1) ; sans réserves chargées, tout pèse 1
  // visée : 100 % du repère ; un nutriment qui a une réserve et dont la moyenne des 7 derniers jours était basse vise jusqu'à 150 %
  // (le modèle compte l'excès d'un jour pour remplir la réserve, jusqu'à gainMax)
  const w = new Float64Array(K.nCov), cap = new Float64Array(K.nCov), u = {};
  for (let i = 0; i < K.nCov; i++) {
    const x = R && R.n[K.keys[i]]; u[K.keys[i]] = x ? x.u : null; w[i] = 1 + 2 * (x ? x.u.valeur : 0);
    cap[i] = 1 + (x && x.etat && x.etat.plafond > 0 ? Math.min(0.5, x.u.u2 || 0) : 0);
  }
  const wSum = w.reduce((a, b) => a + b, 0);
  // ce qui est déjà là : mangé et prévu aujourd'hui, compléments (habituels pour un jour à venir)
  const T = new Float64Array(L), slots = mnCreneaux(date, mode);
  const tot = mode === 'journee' ? totalsOf([], complementsHabituels(date)) : totalsOf([...(N().log[date] || []), ...(N().plan[date] || [])], N().supLog[date]);
  K.keys.forEach((k, i) => { T[i] = tot[k] || 0; });
  const mange = mode !== 'journee' && (N().log[date] || []).length > 0;
  // limites hautes qui valent pour le total (aliments et compléments)
  const ul = [];
  if (DRV_OK()) for (let i = 0; i < K.nMic; i++) { const k = K.keys[i]; if (k === 'vA' || k === 'b3') continue; const n = DRV.nutriments[DRV_KEY[k] || k], x = n && n.ul; if (!x || x.portee === 'complements') continue; const etat = PF().sex === 'f' ? PF().etat || '' : ''; const lim = etat === 'all' ? x.allaitement : etat ? x.grossesse : x.valeur; if (lim > 0) ul.push([i, lim]); }
  // budget : un créneau sauté (heure passée) ne se rattrape pas en entier au suivant ; un jeûne garde tout le budget
  const tk = tg[K.iK], tp = tg[K.iP], partVive = sum(slots.filter(s => s.etat !== 'passe'), s => s.part);
  const kBas = tk * 0.92 * Math.min(1, partVive); // seuil bas des calories : on ne pousse pas à rattraper un repas sauté
  function scoreS(S) {
    let cov = 0;
    for (let i = 0; i < K.nCov; i++) cov += tg[i] > 0 ? (w[i] * Math.min(cap[i], S[i] / tg[i])) / cap[i] : w[i];
    cov /= wSum;
    const kc = S[K.iK], p = S[K.iP]; let pen = 0;
    if (kc > tk * 1.05) pen += (2.5 * (kc - tk * 1.05)) / tk; else if (kc < kBas) pen += (kBas - kc) / tk;
    if (p < tp * 0.95) pen += (0.6 * (tp * 0.95 - p)) / tp;
    if (S[K.iSalt] > tg[K.iSalt]) pen += (0.3 * (S[K.iSalt] - tg[K.iSalt])) / tg[K.iSalt];
    if (S[K.iSat] > tg[K.iSat]) pen += (0.3 * (S[K.iSat] - tg[K.iSat])) / tg[K.iSat];
    for (const [i, lim] of ul) if (S[i] > lim) pen += (0.5 * (S[i] - lim)) / lim;
    return cov - pen;
  }
  // diversité : repas et ingrédients principaux des trois jours d'avant et de ce jour
  const recentRepas = new Set(), recentMain = new Set();
  for (let i = 0; i <= 3; i++) {
    const d = addDays(date, -i);
    for (const e of [...(N().log[d] || []), ...(N().plan[d] || [])]) if (e.repas) recentRepas.add(e.repas);
    for (const k of mainsNotes(d)) recentMain.add(k);
  }
  const ouverts = slots.filter(s => s.etat === 'ouvert'), sumPart = sum(ouverts, s => s.part) || 1;
  const maxMin = N().menu.maxMin || 40, sansCuisson = !!N().menu.sansCuisson;
  const need = new Float64Array(K.nCov); for (let i = 0; i < K.nCov; i++) need[i] = Math.max(0, tg[i] * cap[i] - T[i]);
  const kRest = tk - T[K.iK];
  let nbOk = 0;
  for (const s of ouverts) {
    let cands = [];
    for (const r of REPAS.repas) {
      if (!mnPourCreneau(r, s, info)) continue;
      const vr = verdictRepas(r, cx); if (vr.v === 'exclu') continue;
      nbOk++;
      if (r.min > maxMin || (sansCuisson && r.cuisson) || recentRepas.has(r.id)) continue;
      const mi = info.get(r.id);
      cands.push({ r, vr, mi, overlap: mi.main.filter(k => recentMain.has(k)).length });
    }
    const sansRepet = cands.filter(c => !c.overlap);
    s.diversiteStricte = sansRepet.length >= 6;
    if (s.diversiteStricte) cands = sansRepet; // assez de choix : jamais les mêmes ingrédients principaux que les trois derniers jours (sinon, un malus)
    s.nbCandidats = cands.length;
    const share = s.part / sumPart, slotK = Math.max(120, kRest * share);
    for (const c of cands) {
      c.bonus = (c.vr.aime ? 0.03 : 0) - (c.vr.v === 'eviter' ? 0.05 : 0) - (c.vr.v === 'a_verifier' ? 0.01 : 0) - 0.03 * c.overlap;
      let best = -Infinity;
      for (const [, coef] of MN_PORTIONS) {
        let rich = 0;
        for (let i = 0; i < K.nCov; i++) rich += w[i] * (need[i] > 0 ? Math.min(1, (c.mi.vec[i] * coef) / (need[i] * share)) : 1);
        const pre = rich / wSum - (0.8 * Math.abs(c.mi.kcal * coef - slotK)) / slotK + c.bonus;
        if (pre > best) best = pre;
      }
      c.pre = best;
    }
    cands.sort((a, b) => b.pre - a.pre || (a.r.id < b.r.id ? -1 : 1));
    s.cands = cands.slice(0, 30);
    s.opts = [];
    // un créneau garde sa taille : au-delà de 35 % d'écart avec sa part du budget, petit malus (pas de collation de 500 kcal pour un dîner de 300)
    for (const c of s.cands) for (const [nom, coef] of MN_PORTIONS) {
      const v = new Float64Array(L); for (let i = 0; i < L; i++) v[i] = c.mi.vec[i] * coef;
      const ecart = Math.max(0, Math.abs(v[K.iK] - slotK) - 0.35 * slotK) / tk;
      s.opts.push({ c, nom, coef, v, bonus: c.bonus - 0.6 * ecart, main: c.mi.main });
    }
    if (s.facultatif) s.opts.push(null);
  }
  // recherche de la meilleure combinaison
  const n = ouverts.length, partage = (ch, s, o) => { let k = 0; for (let t = 0; t < n; t++) if (t !== s && ch[t]) for (const m of o.main) if (ch[t].main.includes(m)) k++; return k; };
  const sumOf = (ch, skip) => { const S = Float64Array.from(T); for (let s = 0; s < n; s++) if (s !== skip && ch[s]) { const v = ch[s].v; for (let i = 0; i < L; i++) S[i] += v[i]; } return S; };
  const total = ch => { let sc = scoreS(sumOf(ch, -1)); for (let s = 0; s < n; s++) if (ch[s]) sc += ch[s].bonus - (MN_REPET * partage(ch, s, ch[s])) / 2; return sc; };
  const S = new Float64Array(L);
  const step = (ch, s) => {
    if (!ouverts[s].opts.length) return false;
    const part = sumOf(ch, s); let best = -Infinity, bo = ch[s];
    for (const o of ouverts[s].opts) {
      if (o) for (let i = 0; i < L; i++) S[i] = part[i] + o.v[i]; else S.set(part);
      const sc = scoreS(S) + (o ? o.bonus - MN_REPET * partage(ch, s, o) : 0);
      if (sc > best + 1e-12) { best = sc; bo = o; }
    }
    const changed = bo !== ch[s]; ch[s] = bo; return changed;
  };
  const ascent = ch => { for (let pass = 0; pass < 6; pass++) { let any = false; for (let s = 0; s < n; s++) if (step(ch, s)) any = true; if (!any) break; } return ch; };
  let best = ascent(ouverts.map(() => null)), bestSc = total(best);
  const rnd = mulberry32(mnGraine(`${date}|${mode}`));
  for (let k = 0; k < 8 && n > 1; k++) {
    const ch = ouverts.map(s => (s.opts.length ? s.opts[Math.floor(rnd() * s.opts.length)] : null));
    ascent(ch); const sc = total(ch);
    if (sc > bestSc + 1e-9) { best = ch; bestSc = sc; }
  }
  // classement de chaque créneau, les autres créneaux gardant leur meilleur choix
  ouverts.forEach((s, si) => {
    const part = sumOf(best, si), parRepas = new Map();
    for (const o of s.opts) {
      if (!o) continue;
      for (let i = 0; i < L; i++) S[i] = part[i] + o.v[i];
      const sc = scoreS(S) + o.bonus - MN_REPET * partage(best, si, o), cur = parRepas.get(o.c.r.id);
      if (!cur || sc > cur.sc + 1e-12) parRepas.set(o.c.r.id, { o, sc });
    }
    const rang = [...parRepas.values()].sort((a, b) => b.sc - a.sc || (a.o.c.r.id < b.o.c.r.id ? -1 : 1));
    // le choix de la combinaison passe en tête (il est aussi le meilleur ici, sauf égalité)
    if (best[si]) { const j = rang.findIndex(x => x.o.c.r.id === best[si].c.r.id); if (j > 0) rang.unshift(rang.splice(j, 1)[0]); if (rang[0]) rang[0].o = best[si]; }
    s.saute = !best[si];
    s.rang = rang.map(x => mnOption(x.o, s, { tg, T, u, R, mange, K }));
  });
  // ce que donnerait la journée avec les premiers choix
  const Sj = sumOf(best, -1), lows = [];
  let covSum = 0, nb90 = 0;
  for (let i = 0; i < K.nMic; i++) { const r = tg[i] > 0 ? Math.min(1, Sj[i] / tg[i]) : 1; covSum += r; if (r >= 0.9) nb90++; else lows.push({ k: K.keys[i], r }); }
  lows.sort((a, b) => a.r - b.r);
  return { date, mode, slots, ouverts: ouverts.length, nbOk, budget: { kcal: kRest, p: tp - T[K.iP], tk, tp }, mange,
    jour: { kcal: Sj[K.iK], p: Sj[K.iP], cov: covSum / K.nMic, nb90, nMic: K.nMic, lows }, ms: performance.now() - t0 };
}
// Une proposition prête à afficher : portion, calories, les 3 micros les mieux couverts, une phrase honnête
function mnOption(o, s, ctx) {
  const { K, tg, T, u, R } = ctx, m = o.c.r, mic = [];
  for (let i = 0; i < K.nMic; i++) if (tg[i] > 0) mic.push({ k: K.keys[i], i, part: o.v[i] / tg[i] });
  mic.sort((a, b) => b.part - a.part || (a.k < b.k ? -1 : 1));
  const top = mic.slice(0, 3).map(x => ({ ...x, inconnu: o.c.mi.inconnus.has(x.k) }));
  let phrase = '';
  const urg = mic.filter(x => x.part >= 0.25 && u[x.k] && u[x.k].u2 >= 0.15).sort((a, b) => u[b.k].u2 - u[a.k].u2 || b.part - a.part)[0];
  if (urg && R && R.n[urg.k].tendance.moyenne !== null) phrase = `Proposé parce que ces derniers jours, ton apport en ${mnNom(urg.k)} était bas (moyenne : ${mnPct(R.n[urg.k].tendance.moyenne)}) et que ce repas en apporte ${mnPct(urg.part)} du repère.`;
  else if (ctx.mange) {
    // le manque qui compte le plus : écart du jour x part apportée, un peu plus de poids aux micros souvent en manque (REPAS.md, section 4)
    const souvent = new Set(['vD', 'i', 'fe', 'ca', 'mg', 'zn', 'se', 'b12', 'b9', 'k', 'o3']), poids = x => x.gap * Math.min(1, x.part) * (souvent.has(x.k) ? 1.25 : 1);
    const g = mic.filter(x => x.part >= 0.2).map(x => ({ ...x, gap: Math.max(0, 1 - T[x.i] / tg[x.i]) })).filter(x => x.gap >= 0.4).sort((a, b) => poids(b) - poids(a) || (a.k < b.k ? -1 : 1))[0];
    if (g) phrase = `Il te manque encore ${mnPct(g.gap)} de ton repère de ${mnNom(g.k)} aujourd'hui ; ce repas en apporte ${mnPct(Math.min(g.part, 9.99))}.`;
  }
  if (!phrase) phrase = `Bon apport en ${mnListe(top.map(x => mnNom(x.k)))} pour environ ${fmtK(o.v[K.iK])} kcal.`;
  const inc = top.filter(x => x.inconnu);
  if (inc.length) phrase += ` Au moins pour ${mnListe(inc.map(x => mnNom(x.k)))} (un ingrédient sans valeur publiée).`;
  return { m, vr: o.c.vr, portion: o.nom, coef: o.coef, kcal: o.v[K.iK], p: o.v[K.iP], top, phrase, meal: s.meal, slot: s.k };
}

/* ---------- cache : même jour, mêmes données, même résultat ---------- */
const MN_CACHE = new Map();
function menuDuJour(date = today(), mode = 'reste') {
  if (!REPAS_OK() || !FLAGS_OK() || !CIQUAL_OK() || !STATE) return null;
  const slots = mnCreneaux(date, mode).map(s => s.etat + (s.apresJeune ? '+' : '') + (s.matin || '') + (s.encore ? '*' : '')).join(','), R = reservesEtat(), plans = [];
  for (let i = -3; i <= 0; i++) plans.push(JSON.stringify(N().plan[addDays(date, i)] || []));
  const sig = [date, mode, slots, prefsCtx().sig, JSON.stringify(N().menu), JSON.stringify(targets()), R ? R.sig : '', plans.join(''), ciqualFoods().length, N().fast ? N().fast.start + N().fast.goal : 0].join('|');
  const key = date + '|' + mode, c = MN_CACHE.get(key);
  if (c && c.sig === sig) return c.res;
  const res = menuCalcule(date, mode);
  MN_CACHE.set(key, { sig, res }); window.__menuMs = res.ms;
  return res;
}

/* ---------- gestes ---------- */
const mnEntrees = (m, coef, meal) => m.ing.map(([id, g]) => { const f = foodById(id); return { meal, food: id, name: f ? f.n : id, g: Math.round(g * coef * 10) / 10, repas: m.id }; });
function mnManger(o, d = today()) { if (o.slot === 'petit-dejeuner') MN_SESSION.matinEncore = null; logEntries(d, mnEntrees(o.m, o.coef, o.meal), `${o.m.nom} noté au ${o.meal.toLowerCase()}`); }
function mnPrevoir(o, d = today()) {
  const r = garde(N().plan, d);
  (N().plan[d] = N().plan[d] || []).push(...mnEntrees(o.m, o.coef, o.meal).map(e => ({ ...e, id: uid() })));
  save(); rerender(); undoable(`${o.m.nom} prévu ${d === today() ? 'aujourd\'hui' : dateLabel(d)} (${o.meal.toLowerCase()})`, r);
}
function mnAutre(o, d = today()) {
  const k = `${d}|${o.slot}`; (MN_SESSION.autres[k] = MN_SESSION.autres[k] || new Set()).add(o.m.id);
  rerender(); toast(`${o.m.nom} passé pour aujourd'hui`);
}
function mnPasPourMoi(o) {
  const m = o.m, A = arbreIx(), body = h('div', { class: 'form' });
  let close = () => {};
  const ingr = m.ing.map(([id]) => foodById(id)).filter(f => f && !mnBanal(f));
  const nonRepas = () => { const r = garde(PR(), 'repasNon'); PR().repasNon.push(m.id); save(); rerender(); undoable(`${m.nom} : plus proposé`, r); };
  const plusCourt = MN_TEMPS.filter(t => t < m.min).pop();
  fill(body, h('small', { class: 'muted' }, 'Pourquoi ? Le menu s\'en souvient (tout se change dans Préférences).'),
    h('button', { class: 'btn ghost', onclick: () => { close(); nonRepas(); } }, 'Je n\'aime pas ce repas'),
    h('small', { class: 'muted' }, 'Je n\'aime pas un ingrédient : il sort de toutes les propositions'),
    h('div', { class: 'chips' }, ingr.map(f => { const k = A && A.itemDe.get(f.id); return h('button', { class: 'chip pick', onclick: () => { close(); if (k) poserEtatNoeud(k, 'exclu'); else poserEtatAliment(f.id, 'exclu'); } }, k ? nomNoeud(k) : shortName(f.n)); })),
    plusCourt ? h('button', { class: 'btn ghost', onclick: () => { close(); const r = garde(N(), 'menu'); N().menu = { ...N().menu, maxMin: plusCourt }; save(); rerender(); undoable(`Temps de préparation : ${plusCourt} min au plus`, r); } }, `Trop long (${m.min} min) : ${plusCourt} min au plus`) : h('small', { class: 'muted' }, `${m.min} minutes : c'est déjà le plus court.`));
  close = modal(`Pas pour moi : ${m.nom}`, body, []);
}
// Fiche d'un repas : ingrédients et grammes de la portion, préparation, allergènes, régimes, nutriments, et tous les gestes
function mnDetail(o, opts = {}) {
  const m = o.m, st = { coef: o.coef }, body = h('div', { class: 'form' }), cx = prefsCtx(), K = mnKeys(), info = mnRepasInfo().get(m.id), tg = targets();
  const draw = () => {
    const kc = info.kcal * st.coef;
    const mic = MICROS_AVG.map(x => ({ x, part: tg[x[0]] > 0 ? (info.vec[K.keys.indexOf(x[0])] * st.coef) / tg[x[0]] : 0 })).sort((a, b) => b.part - a.part).slice(0, 6);
    fill(body,
      h('small', { class: 'muted' }, `${(REPAS.meta.creneaux[m.creneau] || m.creneau)} · ${m.min} min · ${(REPAS.meta.cuisines[m.cuisine] || m.cuisine).toLowerCase()} · ${REPAS.meta.budget[m.budget] || m.budget}${m.cru ? ' · cru' : m.cuisson ? '' : ' · sans cuisson'}${m.shelton ? ' · bien combiné' : ''}${m.sport ? ' · riche en protéines' : ''}`),
      m.nature !== 'recette de l\'assistant' ? h('small', { class: 'unk block' }, 'Plat composé de la source : valeurs calculées par Ciqual ou l\'OSAV pour le plat entier, recette moyenne.') : h('small', { class: 'muted block' }, 'Modèle de repas écrit par l\'assistant ; les valeurs viennent de la base d\'aliments.'),
      seg(MN_PORTIONS.map(([n, c]) => [String(c), `${n} · ${fmtK(info.kcal * c)} kcal`]), String(st.coef), v => { st.coef = +v; draw(); }),
      h('div', { class: 'list' }, m.ing.map(([id, g]) => { const f = foodById(id), v = cx.v(id), gg = Math.round(g * st.coef * 10) / 10; return h('div', { class: 'item' },
        h('div', { class: 'grow' }, f ? f.n : id, h('small', { class: 'muted' }, ` · ${f ? quantiteTexte(f, gg) : fmtNum(gg) + ' g'}`),
          v.v === 'a_verifier' ? h('small', { class: 'unk' }, ` · à vérifier : ${v.doute.map(t => flagNom(t).toLowerCase()).join(', ')}`) : null,
          v.aime ? h('small', { class: 'pos' }, ' · aimé') : null, v.eviter ? h('small', { class: 'unk' }, ' · à éviter') : null),
        f ? h('button', { class: 'icon info', 'aria-label': `Fiche de ${f.n}`, onclick: () => foodSheet(f, gg) }, 'ⓘ') : null); })),
      m.prep ? h('p', { class: 'small' }, m.prep) : null,
      h('p', { class: 'small' }, h('b', null, `${fmtK(kc)} kcal`), ` · protéines ${fmtG(info.vec[K.iP] * st.coef)} g · ${mic.map(x => `${x.x[1]} ${mnPct(x.part)}${info.inconnus.has(x.x[0]) ? ' (au moins)' : ''}`).join(' · ')}`),
      o.phrase ? h('small', { class: 'muted block' }, o.phrase) : null,
      h('small', { class: 'block' }, h('b', null, 'Allergènes : '), m.allergenes.length ? m.allergenes.map(a => REPAS.allergenes[a] || a).join(', ') : 'aucun des 14 d\'après les ingrédients'),
      h('small', { class: 'muted block' }, `Régimes : ${m.regimes.map(r => REPAS.regimes[r] || r).join(', ')}.`),
      h('small', { class: 'muted block' }, m.shelton ? 'Combinaisons (Shelton) : bien combiné.' : `Combinaisons (Shelton) : ${(m.combi || []).join(', ')}.`),
      h('small', { class: 'unk block' }, REPAS.meta.avertissement));
  };
  draw();
  const cur = () => ({ ...o, coef: st.coef, portion: (MN_PORTIONS.find(p => p[1] === st.coef) || ['normale'])[0] });
  const acts = [];
  if (opts.menu) acts.push({ label: 'Pas pour moi', cls: 'btn ghost', run: () => { setTimeout(() => mnPasPourMoi(o), 0); } }, { label: 'Autre proposition', cls: 'btn ghost', run: () => mnAutre(o) });
  acts.push({ label: 'Prévoir', cls: opts.date && opts.date !== today() ? 'btn' : 'btn ghost', run: () => mnPrevoir(cur(), opts.date) });
  if (!opts.date || opts.date === today()) acts.push({ label: 'Je le mange', run: () => mnManger(cur()) }); // un repas de demain se prévoit, il ne se mange pas
  modal(m.nom, body, acts);
}

/* ---------- la carte « Menu du jour » ---------- */
const MN_ETAT_TXT = { mange: 'noté', passe: 'heure passée', jeune: 'pendant ton jeûne', prevu: 'prévu' };
const mnPortionTxt = o => (o.portion === 'normale' ? 'Portion normale' : o.portion === 'petite' ? 'Petite portion' : 'Grande portion');
// Proposition complète : nom, portion, phrase, micros, et les cinq gestes (compact : Panneau, « Je le mange », « Autre », « Voir »)
function mnLigne(o, d, compact) {
  const vr = o.vr;
  return h('div', { class: 'prop first' },
    h('div', { class: 'prop-head' }, h('button', { class: 'prop-nom', onclick: () => mnDetail(o, { menu: true, date: d }), 'aria-label': `Voir les ingrédients : ${o.m.nom}` }, h('b', null, o.m.nom)),
      h('small', { class: 'muted block' }, `${mnPortionTxt(o)} · ${fmtK(o.kcal)} kcal · ${fmtG(o.p)} g de protéines · ${o.m.min} min`)),
    h('small', { class: 'why' }, o.phrase),
    h('div', { class: 'chips' }, o.top.map(x => h('span', { class: 'chip ok', title: x.inconnu ? 'Au moins : un ingrédient n\'a pas de valeur publiée' : 'Part de ton repère du jour' }, `${MICROS.find(m => m[0] === x.k)[1]} ${x.part > 3 ? (x.inconnu ? 'au moins 300 %' : 'plus de 300 %') : (x.inconnu ? 'au moins ' : '') + mnPct(x.part)}`)),
      vr.v === 'a_verifier' ? h('span', { class: 'chip unk', title: FOODFLAGS.meta.avertissement }, `à vérifier : ${vr.doute.map(t => flagNom(t).toLowerCase()).join(', ')}`) : null,
      vr.aime ? h('span', { class: 'chip ok' }, 'avec ce que tu aimes') : null, vr.v === 'eviter' ? h('span', { class: 'chip' }, 'contient un aliment à éviter') : null),
    h('div', { class: 'row wrap prop-actions' },
      h('button', { class: 'btn small', 'aria-label': `Je le mange : ${o.m.nom}, ${mnPortionTxt(o).toLowerCase()}`, onclick: () => mnManger(o, d) }, 'Je le mange'),
      compact ? null : h('button', { class: 'btn small ghost', 'aria-label': `Prévoir : ${o.m.nom}`, onclick: () => mnPrevoir(o, d) }, 'Prévoir'),
      h('button', { class: 'btn small ghost', 'aria-label': `Autre proposition que ${o.m.nom}`, onclick: () => mnAutre(o, d) }, 'Autre'),
      compact ? null : h('button', { class: 'btn small ghost', 'aria-label': `Pas pour moi : ${o.m.nom}`, onclick: () => mnPasPourMoi(o) }, 'Pas pour moi'),
      h('button', { class: 'btn small ghost', 'aria-label': `Voir les ingrédients : ${o.m.nom}`, onclick: () => mnDetail(o, { menu: true, date: d }) }, compact ? 'Voir' : 'Ingrédients')));
}
// Proposition en une ligne : nom (la fiche s'ouvre d'un geste), calories, « Je le mange »
function mnLigneCourte(o, d) {
  return h('div', { class: 'prop court' }, h('div', { class: 'grow' }, h('button', { class: 'prop-nom', onclick: () => mnDetail(o, { menu: true, date: d }), 'aria-label': `Voir les ingrédients : ${o.m.nom}` }, o.m.nom),
    h('small', { class: 'muted' }, ` · ${fmtK(o.kcal)} kcal`)),
    h('button', { class: 'btn small', 'aria-label': `Je le mange : ${o.m.nom}, ${mnPortionTxt(o).toLowerCase()}`, onclick: () => mnManger(o, d) }, 'Je le mange'));
}
// Explication honnête d'un micro qui reste bas malgré la meilleure combinaison (REPAS.md, section 4)
function mnExplique(k) {
  const vegan = PR().profil === 'vegetalien', supB12 = N().supps.some(s => s.v.b12 > 0);
  if (k === 'b12') return vegan && !supB12 ? 'aucun aliment végétal n\'en contient naturellement ; les sociétés de nutrition conseillent un complément de B12 à toute personne végétalienne (bibliothèque, REPAS.md section 4).' : 'peu de repas en apportent assez avec tes préférences.';
  if (k === 'vD') return 'elle vient surtout du soleil ; sans poisson gras ni œufs en quantité, la nourriture atteint rarement 15 µg.';
  if (k === 'i') return vegan ? 'le sel iodé suisse, le nori et la boisson d\'avoine enrichie aident, mais restent courts.' : 'le sel iodé, le poisson et les laitages en apportent ; la bibliothèque n\'en met pas toujours assez.';
  if (k === 'fe' && PF().sex === 'f' && !PF().menopause) return 'repère de 16 mg avant la ménopause : difficile à atteindre, surtout sans viande.';
  return 'aucune combinaison de la bibliothèque, avec tes préférences, ne l\'atteint aujourd\'hui.';
}
function mnResumeJour(res) {
  const j = res.jour;
  return h('div', { class: 'mn-jour' },
    h('small', { class: 'muted block' }, `Avec les premières propositions : environ ${fmtK(j.kcal)} kcal sur ${fmtK(res.budget.tk)}, ${fmtG(j.p)} g de protéines sur ${fmtG(res.budget.tp)}, micros couverts en moyenne ${mnPct(j.cov)} (${j.nb90} sur ${j.nMic} à 90 % ou plus).`),
    j.lows.length ? h('small', { class: 'muted block' }, `Restent bas malgré tout : ${j.lows.slice(0, 4).map(x => `${mnNom(x.k)} ${mnPct(x.r)}`).join(', ')}.`) : null,
    j.lows.slice(0, 2).filter(x => ['b12', 'vD', 'i', 'fe'].includes(x.k)).map(x => h('small', { class: 'muted block' }, `${MICROS.find(m => m[0] === x.k)[1]} : ${mnExplique(x.k)}`)));
}
function menuCarte({ compact = false } = {}) {
  const td = today();
  if (!REPAS_OK() || !FLAGS_OK()) return h('section', { class: 'card' }, h('h3', null, 'Menu du jour'), h('p', { class: 'neg small' }, `Bibliothèque de repas non chargée (${DONNEES_CHARGE.err.join(', ') || 'chargement'}). Recharge la page.`));
  const res = menuDuJour(td, 'reste'); if (!res) return null;
  const b = res.budget, ouverts = res.slots.filter(s => s.etat === 'ouvert');
  const head = h('div', { class: 'row between wrap' }, h('h3', null, 'Menu du jour'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small ghost', onclick: () => mnJourneeModal() }, 'Journée entière'), compact ? null : h('a', { class: 'btn small ghost', href: '#/nutri/preferences' }, 'Préférences'),
      // la recherche d'aliment reste à un geste, même sous le menu
      compact ? null : h('button', { class: 'btn small ghost', onclick: () => {
        const q = document.getElementById('n-search');
        if (q) { q.scrollIntoView({ block: 'center' }); q.focus({ preventScroll: true }); } else { ADD.mode = 'food'; ADD.pick = null; render.focusSel = '#n-search'; rerender(); const q2 = document.getElementById('n-search'); if (q2) q2.scrollIntoView({ block: 'center' }); }
      } }, 'Noter autre chose')));
  const budget = h('small', { class: 'muted block' }, b.kcal > 0 ? `Il te reste ${fmtK(b.kcal)} kcal et ${fmtG(Math.max(0, b.p))} g de protéines aujourd'hui${res.mange ? '' : ' (rien de noté pour l\'instant)'}. ${prefsResume()}.`
    : `Budget du jour atteint (${fmtK(-b.kcal)} kcal au-dessus) : seules les propositions les plus légères. ${prefsResume()}.`);
  // après un premier petit truc, avant 11 h : encore un petit truc, ou un repas
  const pd = res.slots.find(s => s.k === 'petit-dejeuner'), hNow = new Date().getHours() + new Date().getMinutes() / 60;
  const choixMatin = pd && pd.etat === 'mange' && !MN_SESSION.matinEncore && hNow < pd.a ? h('div', { class: 'mn-slot matin-suite' }, h('small', { class: 'muted block' }, 'Ce matin, tu as déjà mangé. La suite ?'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: () => { MN_SESSION.matinEncore = 'petit'; rerender(); } }, 'Encore un petit truc'),
      h('button', { class: 'btn small ghost', onclick: () => { MN_SESSION.matinEncore = 'repas'; rerender(); } }, 'Un repas'))) : null;
  if (!ouverts.length) return h('section', { class: 'card menu-card' }, head, budget, choixMatin, h('p', { class: 'muted small' }, res.slots.some(s => s.etat === 'prevu') ? 'Le reste de la journée est prévu.' : 'Plus de créneau à proposer aujourd\'hui. Regarde la journée entière de demain.'),
    compact ? null : res.slots.filter(s => s.etat === 'prevu').map(s => mnPrevuLigne(s, td)));
  // propositions d'un créneau : la première complète, les deux suivantes en une ligne ; replié : la première en une ligne
  const slotBloc = (s, plein) => {
    const skip = MN_SESSION.autres[`${td}|${s.k}`], list = s.rang.filter(o => !skip || !skip.has(o.m.id)).slice(0, compact ? 1 : 3);
    return h('div', { class: 'mn-slot' }, h('div', { class: 'row between wrap' }, h('h4', null, s.k === 'petit-dejeuner' && s.matin === 'petit' ? (s.encore ? 'Encore un petit truc' : 'Un petit truc pour commencer') : s.encore ? 'Petit-déjeuner' : s.meal),
      h('small', { class: 'muted' }, s.apresJeune ? `après ton jeûne (fin à ${hm(s.apresJeune)})` : s.facultatif ? (s.saute ? 'facultative : ton budget tient sans elle' : 'facultative') : '')),
      !s.rang.length ? h('p', { class: 'unk small' }, s.nbCandidats === 0 ? `Aucun repas de la bibliothèque ne tient tes préférences et ton temps (${N().menu.maxMin} min au plus) pour ce créneau.` : 'Rien à proposer.')
        : !list.length ? h('p', { class: 'small muted' }, 'Tu as passé toutes les propositions. ', h('button', { class: 'btn small ghost', onclick: () => { delete MN_SESSION.autres[`${td}|${s.k}`]; rerender(); } }, 'Revoir les premières')) : null,
      list.length ? (plein ? [mnLigne(list[0], td, compact), list.slice(1).map(o => mnLigneCourte(o, td))] : mnLigneCourte(list[0], td)) : null);
  };
  if (compact) {
    const s = ouverts[0], suite = ouverts.slice(1).map(x => x.meal.toLowerCase());
    return h('section', { class: 'card menu-card' }, head, budget, choixMatin, slotBloc(s, true),
      h('div', { class: 'row wrap' }, h('a', { class: 'btn small ghost', href: '#/nutri/jour' }, suite.length ? `Ensuite : ${mnListe(suite)}` : 'Voir la journée')));
  }
  return h('section', { class: 'card menu-card' }, head, budget, choixMatin,
    res.slots.filter(s => s.etat !== 'ouvert' && s.etat !== 'passe').map(s => s.etat === 'prevu' ? mnPrevuLigne(s, td) : h('small', { class: 'muted block' }, `${s.meal} : ${MN_ETAT_TXT[s.etat]}`)),
    // le prochain créneau en entier ; les suivants en une ligne, un geste pour les déplier
    ouverts.map((s, i) => { const plein = i === 0 || MN_UI.ouverts.has(s.k), bloc = slotBloc(s, plein);
      if (i > 0 && s.rang.length) bloc.append(h('button', { class: 'btn small ghost', 'aria-expanded': plein ? 'true' : 'false', onclick: () => { if (plein) MN_UI.ouverts.delete(s.k); else MN_UI.ouverts.add(s.k); rerender(); } }, plein ? 'Replier' : `Plus de choix pour le ${s.meal.toLowerCase()}`));
      return bloc; }),
    h('small', { class: 'muted block mn-jour' }, `Journée avec ces propositions : environ ${fmtK(res.jour.kcal)} kcal, micros couverts en moyenne ${mnPct(res.jour.cov)}${res.jour.lows.length ? `, restent bas : ${res.jour.lows.slice(0, 3).map(x => mnNom(x.k)).join(', ')}` : ''}. Estimations, pas un avis médical.`),
    h('details', { class: 'more' }, h('summary', null, 'Détail de la journée et réglages du menu'), mnResumeJour(res),
      h('div', { class: 'row wrap' }, h('small', { class: 'muted' }, 'Temps de préparation :'), seg(MN_TEMPS.map(t => [String(t), `${t} min`]), String(N().menu.maxMin || 40), v => { const r = garde(N(), 'menu'); N().menu = { ...N().menu, maxMin: +v }; save(); rerender(); undoable(`Temps de préparation : ${v} min au plus`, r); }),
        h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: !!N().menu.sansCuisson, onchange: e => { N().menu = { ...N().menu, sansCuisson: e.target.checked }; save(); rerender(); } }), 'Sans cuisson'),
        h('small', { class: 'muted' }, 'Le matin :'), seg([['petit', 'Un petit truc d\'abord'], ['repas', 'Un repas']], N().menu.matin || 'petit', v => { const r = garde(N(), 'menu'); N().menu = { ...N().menu, matin: v }; save(); rerender(); undoable(v === 'petit' ? 'Le matin : un petit truc d\'abord' : 'Le matin : un repas', r); })),
      h('small', { class: 'muted block' }, 'Estimations faites avec la base d\'aliments et des modèles de repas écrits par l\'assistant : ce n\'est pas un avis médical. En cas d\'allergie grave, lis toujours l\'étiquette.')));
}
function mnPrevuLigne(s, d) {
  const es = (N().plan[d] || []).filter(e => e.meal === s.meal);
  return h('div', { class: 'redo-line' }, h('div', { class: 'grow' }, h('small', { class: 'muted' }, `${s.meal} prévu · `), [...new Set(es.map(e => shortName(e.name)))].slice(0, 4).join(', ')),
    h('button', { class: 'btn small', 'aria-label': `Je le mange : ${s.meal} prévu`, onclick: () => notePlan(d, s.meal) }, 'Je le mange'));
}

/* ---------- journée entière : la meilleure combinaison des quatre créneaux ---------- */
function mnJourneeModal() {
  const body = h('div', { class: 'form' }), td = today(), rienAuj = !(N().log[td] || []).length && !(N().plan[td] || []).length;
  let d = rienAuj && new Date().getHours() < 11 ? td : addDays(td, 1);
  const draw = () => {
    const res = menuDuJour(d, 'journee'); if (!res) return fill(body, h('p', { class: 'neg' }, 'Bibliothèque non chargée.'));
    const sup = complementsHabituels(d), nsup = Object.keys(sup).length;
    fill(body, seg([[td, 'Aujourd\'hui'], [addDays(td, 1), 'Demain']], d, v => { d = v; draw(); }),
      d === td && !rienAuj ? h('small', { class: 'unk block' }, 'Tu as déjà noté ou prévu des repas aujourd\'hui : cette journée repart de zéro. Le menu du jour, lui, tient compte de ce qui est noté.') : null,
      res.slots.map(s => { const o = s.rang[0]; return h('div', { class: 'redo-line' }, h('div', { class: 'grow' }, h('small', { class: 'muted' }, `${s.meal} · `), o ? h('b', null, o.m.nom) : (s.facultatif ? 'pas de collation' : 'rien qui tienne tes préférences'),
        o ? h('small', { class: 'muted' }, ` · ${o.portion} · ${fmtK(o.kcal)} kcal`) : null, s.saute && o ? h('small', { class: 'muted' }, ' (facultative)') : null),
        o ? h('button', { class: 'btn small ghost', 'aria-label': `Voir : ${o.m.nom}`, onclick: () => mnDetail(o, { date: d }) }, 'Voir') : null); }),
      h('p', { class: 'small' }, h('b', null, `Couverture attendue : ${mnPct(res.jour.cov)}`), ` des repères de micros en moyenne, ${res.jour.nb90} sur ${res.jour.nMic} à 90 % ou plus ; ${fmtK(res.jour.kcal)} kcal sur ${fmtK(res.budget.tk)}, ${fmtG(res.jour.p)} g de protéines sur ${fmtG(res.budget.tp)}.`),
      res.jour.lows.length ? h('div', null, h('small', { class: 'muted up' }, 'Restent bas malgré tout'), h('ul', { class: 'plain' }, res.jour.lows.map(x => h('li', { class: 'small' }, `${MICROS.find(m => m[0] === x.k)[1]} ${mnPct(x.r)} : ${mnExplique(x.k)}`)))) : h('p', { class: 'pos small' }, 'Tous les micros atteignent 90 % de leur repère.'),
      h('small', { class: 'muted block' }, `${nsup ? `Compléments habituels comptés (pris au moins 4 jours sur 7) : ${N().supps.filter(s => sup[s.id]).map(s => s.name).join(', ')}.` : 'Aucun complément compté.'} Les portions sont 0,75, 1 ou 1,35 fois la recette. Estimations, pas un avis médical.`));
    body.__res = res;
  };
  draw();
  modal('Journée entière', body, [{ label: 'Prévoir cette journée', run: () => {
    const res = body.__res; if (!res) return false;
    const es = res.slots.filter(s => s.rang[0] && !(s.facultatif && s.saute)).flatMap(s => mnEntrees(s.rang[0].m, s.rang[0].coef, s.meal).map(e => ({ ...e, id: uid() })));
    if (!es.length) { toast('Rien à prévoir'); return false; }
    const r = garde(N().plan, res.date); N().plan[res.date] = [...(N().plan[res.date] || []), ...es]; save(); rerender();
    undoable(`Journée prévue : ${res.date === today() ? 'aujourd\'hui' : dateLabel(res.date)} (Plan de repas)`, r);
  } }]);
}

/* ---------- bibliothèque de repas complets (onglet Recettes) ---------- */
const MN_BIB = { creneau: '', q: '', n: 20, exclus: false, cru: false, shelton: false };
function vueBibliotheque() {
  if (!REPAS_OK() || !FLAGS_OK()) return h('section', { class: 'card' }, h('p', { class: 'neg' }, 'Bibliothèque de repas non chargée.'));
  const cx = prefsCtx(), info = mnRepasInfo(), q = motsPref(MN_BIB.q);
  const tous = REPAS.repas.filter(m => (!MN_BIB.creneau || m.creneau === MN_BIB.creneau) && (!MN_BIB.cru || m.cru) && (!MN_BIB.shelton || m.shelton) && (!q.length || q.every(w => motsPref(m.nom).some(t => t.startsWith(w)))));
  const ok = tous.filter(m => verdictRepas(m, cx).v !== 'exclu'), list = (MN_BIB.exclus ? tous : ok).slice(0, MN_BIB.n);
  const list2 = h('div', { class: 'list' }, list.map(m => { const vr = verdictRepas(m, cx), mi = info.get(m.id), meal = MN_CRENEAUX.find(c => c.k === m.creneau).meal;
    const o = { m, vr, coef: 1, portion: 'normale', meal, slot: m.creneau, kcal: mi.kcal, p: mi.vec[mnKeys().iP], top: [], phrase: '' };
    return h('div', { class: `item${vr.v === 'exclu' ? ' dim' : ''}` }, h('div', { class: 'grow click', onclick: () => mnDetail(o), title: 'Voir les ingrédients' }, h('b', null, m.nom),
      h('small', { class: 'muted' }, ` · ${meal.toLowerCase()}${m.cru ? ' · cru' : ''}${m.shelton ? ' · bien combiné' : ''} · ${m.min} min · ${fmtK(mi.kcal)} kcal · ${fmtG(o.p)} g prot.`),
      vr.v === 'exclu' ? h('small', { class: 'neg block' }, `Exclu : ${vr.pourquoi.slice(0, 2).join(' ; ')}`) : vr.v === 'a_verifier' ? h('small', { class: 'unk block' }, `À vérifier : ${vr.doute.map(t => flagNom(t).toLowerCase()).join(', ')}`) : null),
      vr.v === 'exclu' ? null : h('button', { class: 'btn small', 'aria-label': `Je le mange : ${m.nom}`, onclick: () => mnManger(o) }, 'Je le mange'),
      h('button', { class: 'btn small ghost', 'aria-label': `Voir : ${m.nom}`, onclick: () => mnDetail(o) }, 'Voir')); }));
  return h('section', { class: 'card' }, h('h3', null, 'Repas complets'),
    h('small', { class: 'muted block' }, `${ok.length} repas sur ${tous.length} tiennent tes préférences (${prefsResume()}). Valeurs pour une portion normale.`),
    seg([['', 'Tous'], ...MN_CRENEAUX.map(c => [c.k, c.meal])], MN_BIB.creneau, v => { MN_BIB.creneau = v; MN_BIB.n = 20; rerender(); }),
    h('div', { class: 'row wrap' }, inp('search', MN_BIB.q, { 'aria-label': 'Chercher un repas', placeholder: 'Chercher un repas (lentilles, saumon, rösti…)', oninput: e => { MN_BIB.q = e.target.value; MN_BIB.n = 20; rerender(); } }),
      h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: MN_BIB.exclus, onchange: e => { MN_BIB.exclus = e.target.checked; rerender(); } }), 'Montrer aussi les exclus'),
      h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: MN_BIB.cru, onchange: e => { MN_BIB.cru = e.target.checked; MN_BIB.n = 20; rerender(); } }), 'Cru seulement'),
      h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: MN_BIB.shelton, onchange: e => { MN_BIB.shelton = e.target.checked; MN_BIB.n = 20; rerender(); } }), 'Bien combiné')),
    list2, (MN_BIB.exclus ? tous : ok).length > MN_BIB.n ? h('button', { class: 'btn small ghost', onclick: () => { MN_BIB.n += 40; rerender(); } }, `Voir plus (${(MN_BIB.exclus ? tous : ok).length - MN_BIB.n} de plus)`) : null,
    h('small', { class: 'unk block' }, REPAS.meta.avertissement));
}
