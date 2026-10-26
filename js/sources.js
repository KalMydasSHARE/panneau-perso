'use strict';
/* KalMydas PERSO : Nutrition, page « Sources et méthode ». Citations exigées par les licences, versions, méthode du panneau,
   ce qui est vérifié et ce qui ne l'est pas. Les chiffres de la base sont comptés ici, à l'ouverture, pas recopiés. */

// Citations exigées ou demandées par les licences, recopiées de _donnees/SOURCES.md et SOURCES_DRV.md
const CITATIONS = [
  ['Ciqual 2025 (Anses), source principale', 'Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025. https://doi.org/10.57745/RDMHWY',
    'Version 1.0, publiée le 19 novembre 2025 (fichiers du 3 novembre 2025). Licence Ouverte Etalab 2.0 : citer la source et la version, ne pas altérer les données.'],
  ['Base de données suisse des valeurs nutritives (OSAV)', 'Base de données suisse des valeurs nutritives, V 7.1 (01.07.2026), Office fédéral de la sécurité alimentaire et des affaires vétérinaires OSAV, naehrwertdaten.ch',
    'Citation de la source obligatoire (opendata.swiss, « terms_by »). Onglet « Aliments génériques » seulement. Usage privé ; la page juridique générale du site demande une autorisation écrite pour reproduire : à clarifier avec l\'OSAV avant toute publication.'],
  ['USDA FoodData Central, SR Legacy', 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central: SR Legacy, April 2018. fdc.nal.usda.gov',
    'Domaine public, citation recommandée. Sert seulement à combler une case inconnue d\'un aliment rapproché à la main (choline surtout), jamais à la place d\'une valeur publiée.'],
  ['Ciqual 2020 (Anses), aliments retirés', 'Anses. 2020. Ciqual French food composition table. https://doi.org/10.5281/zenodo.4770202',
    'Licence CC BY 4.0. Seulement les 181 aliments retirés en 2025, gardés pour que les repas déjà notés restent lisibles. Ils ne sont plus proposés dans la recherche.'],
  ['Repères : EFSA (par défaut)', 'EFSA, 2017. Dietary reference values for nutrients: Summary report. EFSA supporting publication 2017:e15121. doi:10.2903/sp.efsa.2017.e15121 ; EFSA, DRV Finder (lu le 23 octobre 2026) ; EFSA, Overview on Tolerable Upper Intake Levels, version 11 (août 2025)',
    '« Reproduction is authorised provided the source is acknowledged ». Limites hautes : vue d\'ensemble version 11 et avis de 2023 et 2024 (liste complète plus bas).'],
  ['Repères : DGE/ÖGE', 'DGE/ÖGE, Referenzwerte für die Nährstoffzufuhr, 3e édition, 1re livraison 2025 (erratum « Stand Mai 2026 »). dge.de/wissenschaft/referenzwerte',
    'Valeurs lues sur les pages publiques, une par nutriment. Pas de licence ouverte trouvée : seules les valeurs sont reprises, avec la source. La Suisse ne participe plus depuis mi-2022.'],
  ['Repères : Suisse (OSAV)', 'OSAV, Valeurs nutritionnelles de référence suisses, « Dietary Reference Values for Switzerland - Version of June 2022 ». blv.admin.ch/fr/valeurs-nutritionnelles',
    'Reprend l\'EFSA pour presque tous les adultes de 18 à 65 ans. Les limites hautes suivent l\'EFSA.'],
  ['Limites sel, sucres, graisses saturées : OMS', 'OMS, Healthy diet (fiche du 26 janvier 2026) ; Guideline: sodium intake for adults and children (2012) ; Guideline: sugars intake for adults and children (2015) ; Saturated fatty acid and trans-fatty acid intake for adults and children: WHO guideline (2023)',
    'Sel moins de 5 g ; graisses saturées 10 % de l\'énergie au plus.']
];

// Chiffres de la base, comptés une fois
function baseStats() {
  if (baseStats.c && baseStats.n === ciqualFoods().length) return baseStats.c;
  const fs = ciqualFoods(), by = {};
  for (const f of fs) { const o = by[f.src] || (by[f.src] = { n: 0, sansE: 0, sel: 0, cho: 0 }); o.n++; if (f.v.kcal === undefined) o.sansE++; if (saltMismatch(f)) o.sel++; if (f.v.cho !== undefined) o.cho++; }
  const z = s => by[s] || { n: 0, sansE: 0, sel: 0, cho: 0 };
  baseStats.n = fs.length;
  return (baseStats.c = { total: fs.length, C: z('C'), S: z('S'), C20: z('C20'),
    usda: fs.reduce((a, f) => a + Object.values(f.q || {}).filter(c => c === 'u').length, 0),
    doubt: fs.filter(f => Object.values(f.fl || {}).some(x => x.includes('x'))), twins: fs.filter(f => f.twins).length });
}

function vueSources(root) {
  const st = baseStats();
  const sec = (title, ...kids) => h('section', { class: 'card' }, h('h3', null, title), ...kids);
  const li = items => h('ul', { class: 'plain' }, items.filter(Boolean).map(x => h('li', null, x)));
  put(root, h('h2', null, 'Sources et méthode'),
    h('section', { class: 'card gold' }, h('h3', null, 'À savoir avant tout'),
      h('p', null, 'Tous les chiffres de la nutrition sont des estimations. La composition d\'un aliment varie (variété, saison, cuisson) et une table donne une moyenne. Un repère vaut pour une population en bonne santé, pas pour une personne. Ce n\'est pas un avis médical : pour un trouble, une grossesse, un traitement ou un complément à forte dose, demande à ton médecin ou à un diététicien.')),
    sec('Ce que contient la base', CIQUAL_OK() ? li([
      `${fmtNum(st.total)} aliments : ${fmtNum(st.C.n)} Ciqual 2025, ${fmtNum(st.S.n)} base suisse, ${fmtNum(st.C20.n)} Ciqual 2020 retirés (repas anciens seulement). Construite le ${shortDate(CIQUAL.meta.build)}.`,
      `${CIQUAL.keys.length} nutriments pour 100 g. Chaque valeur garde sa source, sa fiabilité (A à D pour Ciqual ; publiée, calculée ou estimée pour la base suisse) et ses drapeaux (traces, sous la limite de mesure, au moins, douteuse).`,
      `${fmtNum(st.usda)} cases inconnues comblées par l'USDA, toutes sur des aliments rapprochés à la main.`,
      `${fmtNum(st.twins)} aliments ont le même nom dans Ciqual et dans la base suisse : une seule ligne dans la recherche (celle qui a le plus de valeurs), l'autre reste visible depuis la fiche. Aucune moyenne entre sources.`,
      CIQUAL_CHARGE.ms !== null ? `Chargement de la base sur cet appareil : ${fmtNum(CIQUAL_CHARGE.ms)} ms pour lire le fichier, ${fmtNum(CIQUAL_CHARGE.pret || CIQUAL_CHARGE.ms)} ms en tout, pendant la saisie du mot de passe.` : null
    ]) : h('p', { class: 'neg' }, `Base non chargée (${CIQUAL_CHARGE.err || 'raison inconnue'}).`)),
    sec('Citations et licences', CITATIONS.map(([t, c, n]) => h('div', { class: 'group' }, h('b', null, t), h('p', { class: 'cite' }, c), h('small', { class: 'muted' }, n)))),
    sec('Méthode du panneau', li([
      'Une valeur non publiée reste inconnue, jamais zéro. Un total qui dépend d\'aliments sans valeur porte un « ? », et la journée prévient quand au moins un cinquième du poids noté est sans valeur.',
      '« Traces » et « moins de x » comptent zéro, avec leur drapeau visible dans la fiche. Une somme incomplète (vitamine K, oméga-3) est marquée « au moins ».',
      'Énergie : seulement celle publiée par l\'Anses ou l\'OSAV. Le panneau ne la recalcule jamais. Un aliment sans énergie publiée ne compte pas dans les calories, et l\'écran le dit.',
      'Vitamine A : les trois bases publient des équivalents d\'activité rétinol (RAE : rétinol + bêta-carotène / 12). Le repère EFSA est en équivalents rétinol (bêta-carotène / 6), une autre unité. Le panneau garde les valeurs publiées telles quelles et prend donc le repère en RAE de la DGE/ÖGE (850 µg pour un homme adulte, 700 µg pour une femme), quelle que soit la source choisie pour le reste.',
      'Repères : EFSA par défaut, DGE/ÖGE ou OSAV au choix (Réglages, Mon profil), selon le sexe, l\'âge, la grossesse ou l\'allaitement, la ménopause et les phytates. Si la source choisie ne donne rien pour un cas, l\'EFSA est prise et l\'écran le dit. La source de chaque repère est écrite sous chaque micro.',
      'Thiamine et niacine EFSA : repère par mégajoule, calculé avec tes calories du jour. Zinc : selon les phytates (600 mg par défaut). Oméga-3 total : somme des deux repères EFSA (ALA 0,5 % de l\'énergie et EPA + DHA 250 mg), construite par la table, publiée nulle part.',
      'Choline : repère EFSA de 400 mg. Publiée pour peu d\'aliments, elle est suivie mais sortie de la moyenne des micros.',
      'Eau : EFSA et OSAV comptent l\'eau totale (boissons et eau des aliments) ; le panneau ajoute alors l\'eau des aliments notés. DGE/ÖGE compte les boissons seules.',
      'Limites hautes de l\'EFSA : alerte quand aliments et compléments dépassent une limite qui vaut pour le total (vitamines D, E, B6, calcium, zinc, iode, sélénium, cuivre ; fer et manganèse en niveau sûr), ou quand les compléments seuls dépassent une limite qui ne vise qu\'eux (magnésium, acide folique, niacine). Vitamine A : la limite vise le rétinol préformé, que la base ne sépare pas du bêta-carotène ; seuls les compléments comptent, le foie et les abats non. Niacine : 10 mg pour l\'acide nicotinique (forme non précisée comptée ainsi), 900 mg pour le nicotinamide.',
      'Acide folique d\'un complément : compté x 1,7 pour la couverture (équivalents DFE de l\'EFSA) quand tu le précises, tel quel pour la limite haute.',
      'Sel : limite OMS de 5 g. Graisses saturées : 10 % de tes calories du jour, divisé par 9. Les sucres affichés sont les sucres totaux ; la limite OMS vise les sucres libres, elle n\'est donc pas appliquée.'
    ])),
    sec('Ce qui a été vérifié', li([
      'Ciqual 2025 : 132 075 valeurs du fichier XML comparées au fichier Excel officiel de la même édition, toutes identiques. MD5 des fichiers égaux à ceux de l\'entrepôt de l\'Anses.',
      'Base suisse : 60 aliments, 1 619 valeurs comparées à l\'API officielle de l\'OSAV le 23 octobre 2026, aucune différence.',
      'USDA : 306 valeurs comblées comparées à l\'API officielle FoodData Central, toutes identiques après arrondi.',
      '84 valeurs relues à la main dans les fichiers officiels (œuf, pomme, gruyère, saumon, brocoli, foie de bœuf, poulet).',
      'Énergie Ciqual recalculée avec les facteurs de l\'Anses : aucun écart au-delà de 5 %. Aucune valeur négative, aucun doublon de code.',
      'Repères : chaque valeur EFSA adulte recomparée au fichier du DRV Finder (95 égales, 4 écarts d\'écriture seulement). Toutes les sources lues le 23 octobre 2026 sur le site de l\'organisme.'
    ])),
    sec('Ce qui n\'est pas vérifié, et les limites connues', li([
      `${fmtNum(st.C.sansE + st.C20.sansE + st.S.sansE)} aliments sans énergie publiée (${fmtNum(st.C.sansE)} Ciqual 2025, ${fmtNum(st.C20.sansE)} Ciqual 2020) : ils ne comptent pas dans les calories.`,
      `${fmtNum(st.C.sel + st.C20.sel)} aliments Ciqual dont le sel et le sodium ne concordent pas (analyses différentes chez l'Anses) : les deux valeurs sont gardées, le panneau suit le sel.`,
      `Valeur douteuse gardée telle quelle (la licence interdit de la corriger) et sortie des suggestions : ${st.doubt.map(f => f.n).join(', ') || 'aucune'}, B5 de 135 mg pour 100 g, environ 60 fois les autres boissons énergisantes.`,
      'Gelée royale (Ciqual) : B3, B5 et B12 très hautes, source ancienne, aucune deuxième source pour trancher.',
      'Rapprochements avec l\'USDA faits à la main (148 lignes, sur le nom, l\'espèce, la partie, l\'état cru ou cuit) : relus par personne d\'autre.',
      `Choline : connue pour ${fmtNum(st.C.cho + st.S.cho + st.C20.cho)} aliments seulement. Un « ? » sur la choline est la règle, pas l'exception.`,
      'Site ciqual.anses.fr hors service le jour de la construction : contrôle fait sur les fichiers officiels, pas sur le site. Ciqual 2020 non recontrôlé en ligne.',
      'Folates de la base suisse : définition (folates totaux ou DFE) non écrite dans le fichier. Vitamine E et B3 de Ciqual : base exacte non vérifiée. La B3 ne compte pas le tryptophane : la couverture affichée est plus basse que la réalité.',
      'Vitamine K : le repère EFSA vise la K1 seule, le panneau additionne K1 et K2 : couverture un peu haute.',
      'Justifications de la DGE (classeur payant) et textes complets des avis EFSA chez l\'éditeur (accès refusé) : non lus ; valeurs contrôlées sur les pages publiques, les résumés et le DRV Finder.',
      'La justesse des analyses elles-mêmes : seules la fidélité aux sources et la cohérence sont vérifiées.'
    ])),
    DRV_OK() ? h('section', { class: 'card' }, h('details', { class: 'more' }, h('summary', null, `Toutes les sources des repères (${Object.keys(DRV.sources).length})`),
      h('ul', { class: 'plain' }, Object.entries(DRV.sources).map(([id, s]) => h('li', null, h('small', null, `${s.titre}${s.date ? ', ' + s.date : ''}${s.doi ? ', doi:' + s.doi : ''}${s.url ? ', ' + s.url : ''}`, h('span', { class: 'muted' }, ` [${id}]`))))))) : null,
    h('small', { class: 'muted' }, 'Détail complet, chiffres à l\'appui : dossier _donnees du panneau (SOURCES.md, AUDIT.md, SOURCES_DRV.md, DRV_AUDIT.md).'));
}
