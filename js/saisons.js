'use strict';
/* KalMydas PERSO : fruits et légumes de saison en Suisse (1er novembre 2026). Mois où l'aliment vient des champs suisses ou de leur stockage
   (pommes, carottes, choux, courges l'hiver), d'après les calendriers de saison suisses (WWF Suisse, Agridea, Union maraîchère suisse).
   Table écrite de mémoire à partir de ces calendriers, pas relevée ligne à ligne : ordre de grandeur. Agrumes, kiwi, kaki, grenade, figue :
   saison européenne (importés d'Europe en hiver). Banane, avocat, mangue, ananas et autres fruits lointains : toujours importés, ni bonus
   ni malus. Une conserve, un surgelé, un fruit sec ou un jus ne compte pas : seul le frais a une saison.
   Clé : aliment de base de la liste à cocher (data/arbre_aliments.js), sans la famille. */
const SAISONS = {
  'legumes-fruits.tomate': [6, 7, 8, 9, 10], 'legumes-fruits.poivron': [7, 8, 9, 10], 'legumes-fruits.concombre': [5, 6, 7, 8, 9], 'legumes-fruits.courgette': [6, 7, 8, 9],
  'legumes-fruits.aubergine': [7, 8, 9], 'legumes-fruits.courge-et-potiron': [9, 10, 11, 12, 1, 2], 'legumes-fruits.piment': [7, 8, 9, 10],
  'legumes-feuilles-et-salades.laitue-et-salades-vertes': [4, 5, 6, 7, 8, 9, 10, 11], 'legumes-feuilles-et-salades.epinard': [3, 4, 5, 9, 10, 11], 'legumes-feuilles-et-salades.roquette': [4, 5, 6, 7, 8, 9, 10],
  'legumes-feuilles-et-salades.mache': [10, 11, 12, 1, 2, 3], 'legumes-feuilles-et-salades.chicoree-et-endive': [10, 11, 12, 1, 2, 3, 4], 'legumes-feuilles-et-salades.cresson': [3, 4, 5, 9, 10, 11],
  'legumes-feuilles-et-salades.bette': [6, 7, 8, 9, 10], 'legumes-feuilles-et-salades.tetragone-et-bredes': [6, 7, 8, 9],
  'legumes-racines.carotte': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'legumes-racines.radis': [4, 5, 6, 7, 8, 9, 10], 'legumes-racines.betterave': [7, 8, 9, 10, 11, 12, 1, 2, 3],
  'legumes-racines.celeri-rave': [9, 10, 11, 12, 1, 2, 3, 4], 'legumes-racines.navet': [9, 10, 11, 12, 1, 2, 3], 'legumes-racines.panais': [10, 11, 12, 1, 2, 3], 'legumes-racines.topinambour': [10, 11, 12, 1, 2, 3],
  'legumes-racines.salsifis': [10, 11, 12, 1, 2, 3], 'legumes-racines.rutabaga': [10, 11, 12, 1, 2, 3], 'legumes-racines.crosne': [11, 12, 1, 2],
  'bulbes-tiges-et-pousses.oignon': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'bulbes-tiges-et-pousses.echalote': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'bulbes-tiges-et-pousses.poireau': [9, 10, 11, 12, 1, 2, 3, 4],
  'bulbes-tiges-et-pousses.fenouil': [6, 7, 8, 9, 10, 11], 'bulbes-tiges-et-pousses.asperge': [4, 5, 6], 'bulbes-tiges-et-pousses.celeri-branche': [7, 8, 9, 10], 'bulbes-tiges-et-pousses.artichaut': [6, 7, 8, 9],
  'bulbes-tiges-et-pousses.cardon': [10, 11, 12],
  'choux.brocoli-et-romanesco': [6, 7, 8, 9, 10], 'choux.chou-rouge': [9, 10, 11, 12, 1, 2, 3, 4], 'choux.chou-blanc-vert-et-frise': [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4], 'choux.chou-fleur': [6, 7, 8, 9, 10],
  'choux.chou-chinois-et-pak-choi': [8, 9, 10, 11, 12], 'choux.chou-kale-et-chou-plume': [10, 11, 12, 1, 2, 3], 'choux.chou-de-bruxelles': [10, 11, 12, 1, 2], 'choux.chou-rave': [5, 6, 7, 8, 9, 10],
  'legumes-a-cosse-frais.haricot-vert-et-haricot-beurre': [6, 7, 8, 9], 'legumes-a-cosse-frais.mais-doux': [8, 9], 'legumes-a-cosse-frais.petits-pois': [6, 7], 'legumes-a-cosse-frais.pois-mange-tout': [5, 6, 7],
  'legumes-a-cosse-frais.edamame': [8, 9],
  'champignons.cepe-et-bolet': [8, 9, 10], 'champignons.girolle-et-chanterelle': [7, 8, 9], 'champignons.morille': [4, 5],
  'fruits-a-pepins.pomme': [8, 9, 10, 11, 12, 1, 2, 3, 4], 'fruits-a-pepins.poire': [8, 9, 10, 11, 12, 1, 2], 'petits-fruits-et-baies.raisin': [9, 10], 'petits-fruits-et-baies.fraise': [5, 6, 7],
  'petits-fruits-et-baies.framboise': [6, 7, 8, 9], 'petits-fruits-et-baies.myrtille': [7, 8, 9], 'petits-fruits-et-baies.mure': [8, 9], 'petits-fruits-et-baies.groseille-et-cassis': [6, 7, 8],
  'fruits-a-noyau.cerise': [6, 7], 'fruits-a-noyau.abricot': [7, 8], 'fruits-a-noyau.peche-et-nectarine': [7, 8, 9], 'fruits-a-noyau.prune-mirabelle-et-pruneau': [8, 9],
  'melons-et-pasteques.melon': [7, 8, 9], 'melons-et-pasteques.pasteque': [7, 8], 'fruits-a-coque.chataigne-et-marron': [10, 11, 12],
  'agrumes.citron-et-citron-vert': [11, 12, 1, 2, 3, 4], 'agrumes.orange': [11, 12, 1, 2, 3, 4], 'agrumes.mandarine-et-clementine': [11, 12, 1, 2], 'agrumes.pamplemousse-et-pomelo': [11, 12, 1, 2, 3, 4],
  'fruits-exotiques.kiwi': [11, 12, 1, 2, 3, 4], 'fruits-exotiques.kaki': [10, 11, 12], 'fruits-exotiques.grenade': [10, 11, 12, 1], 'fruits-exotiques.figue': [8, 9, 10]
};
const SAISON_PAS_FRAIS = /conserve|appertis|surgel|séch|sech|déshydrat|deshydrat|jus\b|nectar|confiture|compote|sirop|poudre|confit|lyophilis/i;
const MOIS_NOMS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// mois de saison d'un aliment frais, ou null (pas un fruit ni un légume de la table, ou pas frais)
function saisonDe(id) {
  const A = typeof arbreIx === 'function' ? arbreIx() : null, k = A ? A.itemDe.get(id) : null; if (!k) return null;
  const m = SAISONS[k.split('.').slice(1).join('.')]; if (!m) return null;
  const f = foodById(id); if (f && SAISON_PAS_FRAIS.test(f.n)) return null;
  return m;
}
/* Saison d'un repas ce mois-ci : fruits et légumes frais de saison (oui) et hors saison (non), sans les pincées (moins de 15 g). */
function saisonRepas(items, mois = new Date().getMonth() + 1) {
  const oui = [], non = [];
  for (const i of items) { if (!(i.g >= 15)) continue; const m = saisonDe(i.food); if (!m) continue; const n = shortName((foodById(i.food) || { n: i.food }).n); (m.includes(mois) ? oui : non).push(n); }
  return { oui: [...new Set(oui)], non: [...new Set(non)] };
}
// même chose pour un repas de la bibliothèque, gardé par mois (le menu le demande pour chaque repas à chaque calcul)
const SAISON_CACHE = new Map();
function saisonDuRepas(m) { const k = `${m.id}|${new Date().getMonth()}`; let v = SAISON_CACHE.get(k); if (!v) { v = saisonRepas(m.ing.map(([food, g]) => ({ food, g }))); SAISON_CACHE.set(k, v); } return v; }
// bonus pour le menu : un peu pour chaque produit de saison (deux au plus), un peu plus de malus pour chaque produit hors saison
const saisonBonus = s => 0.01 * Math.min(2, s.oui.length) - 0.02 * Math.min(2, s.non.length); // léger : combler les besoins passe d'abord
