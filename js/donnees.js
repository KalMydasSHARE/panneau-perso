'use strict';
/* KalMydas PERSO : chargement des données du menu, sans bloquer l'écran du verrou.
   data/repas.js (bibliothèque de repas), data/regimes.js (drapeaux de régime et d'allergènes), data/arbre_aliments.js (liste à cocher),
   data/reserves.js (modèle de réserve). Données publiques, aucune donnée de Kal : elles se lisent pendant qu'il tape son mot de passe,
   comme data/ciqual.js. start() (app.js) attend DONNEES_PRET. Si la page les a déjà (tests), rien à faire.
   DONNEES_CHARGE garde le temps de chaque fichier (mesure affichée dans Sources et méthode). */
const DONNEES_FICHIERS = [['REPAS', 'data/repas.js'], ['FOODFLAGS', 'data/regimes.js'], ['ARBRE', 'data/arbre_aliments.js'], ['RESERVES', 'data/reserves.js']];
const DONNEES_CHARGE = { ms: {}, err: [] };
// une constante d'un script classique n'est pas une propriété de window : on la teste par son nom
const donneeOk = nom => (nom === 'REPAS' ? typeof REPAS : nom === 'FOODFLAGS' ? typeof FOODFLAGS : nom === 'ARBRE' ? typeof ARBRE : typeof RESERVES) !== 'undefined';
const DONNEES_PRET = Promise.all(DONNEES_FICHIERS.map(([nom, src]) => donneeOk(nom) ? Promise.resolve() : new Promise(res => {
  const t0 = performance.now(), s = document.createElement('script');
  s.src = src;
  s.onload = () => { DONNEES_CHARGE.ms[src] = Math.round(performance.now() - t0); res(); };
  s.onerror = () => { DONNEES_CHARGE.err.push(src); res(); };
  document.head.append(s);
})));
const REPAS_OK = () => typeof REPAS !== 'undefined';
const FLAGS_OK = () => typeof FOODFLAGS !== 'undefined';
const ARBRE_OK = () => typeof ARBRE !== 'undefined';
const RESERVES_OK = () => typeof RESERVES !== 'undefined';
// Les textes de data/reserves.js sont écrits sans apostrophe (« d un », « n est ») : on les remet à l'affichage, sans toucher au fichier
const apos = s => String(s || '').replace(/\baujourd hui\b/gi, 'aujourd\'hui').replace(/(?<![\p{L}\p{N}])(jusqu|lorsqu|puisqu|qu|[dlnsjcDLNSJ])\s(?=[aeiouyhéèêëàâîïôûœAEIOUYHÉÈÊÀÂÎÔÛŒ])/gu, '$1\''); // lettre seule, après une lettre accentuée aussi // « C » seul (vitamine C) n'est jamais une élision
