'use strict';
/* KalMydas PERSO : prix d'un repas pour une personne (1er novembre 2026). Données : data/prix.js (PRIX), prix relevés sur coop.ch, migros.ch et
   denner.ch, par aliment de base de la liste à cocher (data/arbre_aliments.js), en CHF par kg tel que vendu, avec le produit et la date.
   Le prix le plus bas des trois magasins est pris. Un ingrédient pesé cuit (riz, pâtes, légumineuses, viande) est ramené au poids acheté
   avec un rendement moyen. Un ingrédient sans prix relevé ne compte pas : l'écran le dit (« au moins »). Ordre de grandeur, pas un ticket de caisse. */

const PRIX_OK = () => typeof PRIX !== 'undefined';
const PRIX_MAG = { m: 'Migros', c: 'Coop', d: 'Denner' };
const fmtCHF = n => `CHF ${(Math.round(n * 20) / 20).toFixed(2)}`; // arrondi aux 5 centimes, comme en caisse
/* Rendement à la cuisson : grammes cuits pour 1 g acheté. Céréales et légumineuses sèches gonflent ; viande et poisson perdent de l'eau.
   Valeurs moyennes des tables de rendement (USDA, Ciqual) : riz 2,5 ; pâtes 2,3 ; légumineuses 2,5 ; viande et poisson 0,75. */
function prixRendement(f, a) {
  const n = norm(f.n || '');
  if (!/\b(cuit|cuite|cuits|cuites|bouilli|bouillie|vapeur|grille|grillee|roti|rotie|poele|poelee|braise|frit|frite)\b/.test(n)) return 1;
  if (a && a.v === 'sec') return /\bpate|spaghetti|nouille|macaroni|tagliatelle/.test(n) ? 2.3 : 2.5;
  if (/^(viandes|poissons|volailles|charcuteries)/.test((a && a.fam) || '') || /\b(boeuf|veau|porc|poulet|dinde|agneau|saumon|thon|cabillaud|poisson|steak|filet)\b/.test(n)) return 0.75;
  return 1;
}
// prix d'un aliment : { kg, mag, produit } au plus bas des trois magasins, ou null
function prixAliment(id) {
  if (!PRIX_OK()) return null;
  const A = arbreIx(), k = A ? A.itemDe.get(id) : null, a = k ? PRIX.a[k] : null;
  if (!a) return null;
  let best = null;
  for (const m of ['m', 'c', 'd']) { const p = a[m]; if (p && p[0] > 0 && (!best || p[0] < best.kg)) best = { kg: p[0], mag: m, produit: p[1] }; }
  return best ? { ...best, a } : null;
}
/* Prix d'une liste d'ingrédients [{ food, g }] : total (le moins cher de chaque ingrédient), total par magasin quand il a tout,
   part des grammes qui ont un prix (sel, eau et épices comptés à part, ils ne pèsent presque rien). */
function prixRepas(items) {
  if (!PRIX_OK() || !items || !items.length) return null;
  let chf = 0, gP = 0, gT = 0; const parMag = { m: 0, c: 0, d: 0 }, complet = { m: true, c: true, d: true }, sans = [];
  for (const i of items) {
    const f = foodById(i.food); if (!f || !(i.g > 0)) continue;
    const p = prixAliment(i.food), leger = i.g < 6; // une pincée de sel, d'épices : ne compte pas dans la part
    if (!leger) gT += i.g;
    if (!p) { if (!leger) sans.push(shortName(f.n)); for (const m in complet) complet[m] = false; continue; }
    const kgAchete = i.g / 1000 / prixRendement(f, p.a);
    chf += kgAchete * p.kg; if (!leger) gP += i.g;
    for (const m of ['m', 'c', 'd']) { const x = p.a[m]; if (x && x[0] > 0) parMag[m] += kgAchete * x[0]; else complet[m] = false; }
  }
  if (!gT && !chf) return null;
  return { chf, part: gT ? gP / gT : 1, sans, parMag: Object.fromEntries(Object.entries(parMag).filter(([m]) => complet[m])) };
}
function prixLigne(px) {
  const mags = Object.entries(px.parMag).sort((a, b) => a[1] - b[1]);
  return h('div', { class: 'prix' }, h('small', { class: 'block' }, h('b', null, `${px.part < 1 ? 'Au moins ' : 'Environ '}${fmtCHF(px.chf)}`), ' pour une personne, au prix le plus bas de chaque ingrédient.'),
    mags.length ? h('small', { class: 'muted block' }, `Tout dans un seul magasin : ${mags.map(([m, v]) => `${PRIX_MAG[m]} ${fmtCHF(v)}`).join(' · ')}.`) : null,
    px.sans.length ? h('small', { class: 'unk block' }, `Sans prix relevé : ${px.sans.slice(0, 4).join(', ')}${px.sans.length > 4 ? '…' : ''}.`) : null,
    h('small', { class: 'muted block' }, `Prix lus sur les sites de Migros, Coop et Denner${PRIX.meta && PRIX.meta.date ? ` le ${dateLabel(PRIX.meta.date)}` : ''}, hors promotions quand c'est possible. Ordre de grandeur.`));
}
