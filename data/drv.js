'use strict';
/* KalMydas PERSO : valeurs de référence nutritionnelles (DRV), adultes.
   Construit le 2026-10-23. Chaque nombre a été relu à sa source ce jour-là (voir _donnees/SOURCES_DRV.md et _donnees/DRV_AUDIT.md).
   Données pures : aucune fonction, aucun calcul. Le branchement est décrit dans _donnees/GLUE_DRV.md.

   STRUCTURE
   DRV.groupes : les quatre tranches d'âge adultes, dans cet ordre : index 0 = 18 à 24 ans, 1 = 25 à 50, 2 = 51 à 64, 3 = 65 et plus.
   DRV.nutriments[clé] : la clé est celle de l'app (js/foods.js : MACROS, EXTRAS, MICROS) quand elle existe.
     .nom, .unite        unité de l'app (µg, mg, g, ml ; « %E » = pourcentage de l'énergie ; « g/kg » = par kg de poids).
     .defaut             la source à utiliser par défaut ('efsa' presque partout ; raison dans DRV_AUDIT.md, section 3).
     .efsa / .dge / .ch / .oms   un bloc par source, même forme :
        .type     PRI (apport de référence pour la population), AR (besoin moyen), AI (apport adéquat), RI (plage d'apport de référence),
                  SAI (apport sûr et adéquat, EFSA sodium), ALAP (« aussi bas que possible », sans chiffre),
                  EZ (DGE empfohlene Zufuhr, équivalent d'un PRI), SW (DGE Schätzwert, équivalent d'un AI),
                  RW (valeur indicative, DGE Richtwert ou OMS), LIM (limite à ne pas dépasser).
        .m, .f    tableau de 4 valeurs, une par tranche d'âge (homme, femme). Une valeur peut être :
                  un nombre ; [min, max] pour une plage ; un texte comme '>= 30' ou '< 10' quand la source donne un seuil ;
                  null quand la source ne donne rien pour ce cas (la raison est dans .note).
        .grossesse, .allaitement   option, même logique ; un objet {t1, t2, t3} quand la valeur change selon le trimestre.
        .ar       besoin moyen (AR) quand la source le donne.
        .parMJ    thiamine et niacine EFSA : valeur par mégajoule ; valeur du jour = parMJ x dépense en MJ (1 MJ = 238,83 kcal).
        .parPhytate  zinc : valeurs selon l'apport de phytates (mg/j).
        .src      identifiants de DRV.sources, avec le tableau ou la page.
        .note     ce qu'il faut savoir pour lire la valeur.
     .ul         limite haute de sécurité, quand elle existe (null sinon, raison dans .ul_note) :
        .type     'UL' (tolerable upper intake level) ou 'NS' (niveau sûr, « safe level of intake » d'EFSA, quand un UL n'a pas pu être fixé),
        .valeur, .unite, .grossesse, .allaitement (null = l'UL ne s'applique pas à ce cas),
        .portee   'total' = aliments + compléments + aliments enrichis ;
                  'complements' = seulement la forme ajoutée (compléments, eau, aliments enrichis), jamais ce qui est naturellement dans les aliments,
        .forme    la forme chimique visée quand elle compte (ex. rétinol préformé, acide folique).
     .ecart      la différence EFSA et DGE, en clair.
   DRV.energieRef : besoins moyens en énergie EFSA (MJ/j) par décennie et niveau d'activité, utiles pour thiamine et niacine.
   DRV.conversions : facteurs de conversion utiles à l'app.
   DRV.sources : chaque source, titre exact, adresse, date de la source. Lecture de toutes les sources : 2026-10-23.
   Ce fichier ne contient aucun avis médical. Ce sont des repères pour une population en bonne santé. */

const DRV = {
  version: '2026-10-23',
  lu_le: '2026-10-23',
  groupes: [
    { id: '18-24', min: 18, max: 24 },
    { id: '25-50', min: 25, max: 50 },
    { id: '51-64', min: 51, max: 64 },
    { id: '65+', min: 65, max: 200 }
  ],
  note_groupes: 'EFSA donne un seul groupe adulte (18 ans et plus), sauf le calcium (18 à 24 ans, puis 25 et plus). DGE découpe en 19 à 24, 25 à 50, 51 à 64, 65 et plus : à 18 ans, DGE classe dans 15 à 18 ans, la table reprend ici la valeur 19 à 24. La table suisse (OSAV) découpe en 18 à 65 ans et plus de 65 ans.',

  nutriments: {

    /* ---------- VITAMINES ---------- */

    vA: {
      nom: 'Vitamine A', unite: 'µg', defaut: 'efsa',
      efsa: { type: 'PRI', unite: 'µg RE', m: [750, 750, 750, 750], f: [650, 650, 650, 650], grossesse: 700, allaitement: 1300, ar: { m: 570, f: 490 },
        src: ['EFSA_DRV_2017:tableaux 8 à 11', 'EFSA_FINDER'],
        note: 'Équivalent rétinol EFSA : 1 µg RE = 1 µg rétinol = 6 µg bêta-carotène = 12 µg autres caroténoïdes provitamine A. Avec ce repère, l app doit compter le bêta-carotène divisé par 6 (elle divise aujourd hui par 12, voir GLUE_DRV.md).' },
      dge: { type: 'EZ', unite: 'µg RAE', m: [850, 850, 850, 800], f: [700, 700, 700, 700], grossesse: 800, allaitement: 1300,
        src: ['DGE_VITA'], note: 'Équivalent d activité rétinol : 1 µg RAE = 1 µg rétinol = 12 µg bêta-carotène = 24 µg autres caroténoïdes. C est la conversion que l app utilise aujourd hui (bêta-carotène divisé par 12).' },
      ch: { type: 'PRI', unite: 'µg RE', m: [750, 750, 750, [900, 1000]], f: [650, 650, 650, [700, 800]], grossesse: 700, allaitement: 1300, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 3000, unite: 'µg RE', grossesse: 3000, allaitement: 3000, portee: 'total',
        forme: 'vitamine A préformée seulement (rétinol et esters de rétinyle), aliments et compléments ; le bêta-carotène ne compte pas',
        src: ['EFSA_UL_2025:tableau 3', 'EFSA_UL_VITA_2024'],
        note: 'Vaut aussi pour la femme enceinte et après la ménopause (EFSA 2024). Pas d UL pour le bêta-carotène ; les fumeurs doivent éviter les compléments de bêta-carotène.' },
      ecart: 'Unités différentes : EFSA en RE (bêta-carotène divisé par 6), DGE en RAE (divisé par 12). On ne compare pas 750 RE et 850 RAE. Si l app garde la division par 12, le repère cohérent est celui de DGE ; si elle passe à 6, celui d EFSA.'
    },

    vC: {
      nom: 'Vitamine C', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'PRI', m: [110, 110, 110, 110], f: [95, 95, 95, 95], grossesse: 105, allaitement: 155, ar: { m: 90, f: 80 }, src: ['EFSA_DRV_2017:tableaux 8 à 11', 'EFSA_FINDER'] },
      dge: { type: 'EZ', m: [110, 110, 110, 110], f: [95, 95, 95, 95], grossesse: 105, allaitement: 125, src: ['DGE_VITC'],
        note: 'Fumeurs : 155 mg (homme), 135 mg (femme). Grossesse : à partir du 4e mois.' },
      ch: { type: 'PRI', m: [110, 110, 110, [90, 110]], f: [95, 95, 95, [75, 95]], grossesse: 105, allaitement: 155, src: ['BLV_2022'] },
      ul: null, ul_note: 'EFSA : pas assez de données pour fixer un UL (EFSA_UL_2025, tableau 3).',
      ecart: 'Identiques hors allaitement (EFSA 155, DGE 125). DGE ajoute une valeur pour les fumeurs.'
    },

    vD: {
      nom: 'Vitamine D', unite: 'µg', defaut: 'efsa',
      efsa: { type: 'AI', m: [15, 15, 15, 15], f: [15, 15, 15, 15], grossesse: 15, allaitement: 15, src: ['EFSA_DRV_2017:tableaux 9 et 11', 'EFSA_FINDER'],
        note: 'Suppose une synthèse par la peau minimale. Avec du soleil, le besoin alimentaire baisse ou devient nul. 1 µg = 40 UI.' },
      dge: { type: 'SW', m: [20, 20, 20, 20], f: [20, 20, 20, 20], grossesse: 20, allaitement: 20, src: ['DGE_VITD'],
        note: 'Seulement quand la peau ne fabrique pas de vitamine D. L alimentation courante en apporte 2 à 4 µg ; le reste vient du soleil ou d un complément.' },
      ch: { type: 'AI', m: [15, 15, 15, 20], f: [15, 15, 15, 20], grossesse: 15, allaitement: 15, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 100, unite: 'µg', grossesse: 100, allaitement: 100, portee: 'total', forme: 'D2, D3 et calcidiol (1 µg calcidiol monohydraté = 2,5 µg D3)',
        src: ['EFSA_UL_2025:tableau 3', 'EFSA_UL_VITD_2023'] },
      ecart: 'EFSA 15 µg, DGE 20 µg (DGE vise le cas sans soleil).'
    },

    vE: {
      nom: 'Vitamine E', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'AI', unite: 'mg alpha-tocophérol', m: [13, 13, 13, 13], f: [11, 11, 11, 11], grossesse: 11, allaitement: 11, src: ['EFSA_DRV_2017:tableaux 9 et 11', 'EFSA_FINDER'],
        note: 'Alpha-tocophérol seulement. Les autres tocophérols et tocotriénols ne comptent pas. EFSA ne lie pas cette valeur à l énergie ni aux acides gras polyinsaturés.' },
      dge: { type: 'SW', unite: 'mg RRR-alpha-tocophérol', m: [8, 8, 8, 8], f: [8, 8, 8, 8], grossesse: 8, allaitement: 13, src: ['DGE_VITE'],
        note: 'Révisé en 2024 (3e édition 2025). 1 mg RRR-alpha-tocophérol = 2 mg all-rac-alpha-tocophérol (forme de synthèse des compléments).' },
      ch: { type: 'AI', m: [13, 13, 13, [12, 15]], f: [11, 11, 11, [11, 15]], grossesse: 11, allaitement: 11, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 300, unite: 'mg alpha-tocophérol', grossesse: 300, allaitement: 300, portee: 'total', forme: 'toutes les formes stéréo-isomères de l alpha-tocophérol',
        src: ['EFSA_UL_2025:tableau 3', 'EFSA_UL_VITE_2024'],
        note: 'Ne s applique pas aux personnes sous anticoagulant ou antiagrégant (aspirine comprise) : avis médical.' },
      ecart: 'Gros écart : EFSA 13 mg (homme) et 11 mg (femme) ; DGE 8 mg pour tous. La base de calcul DGE n est pas publiée en ligne (chapitre payant).'
    },

    vK: {
      nom: 'Vitamine K', unite: 'µg', defaut: 'efsa',
      efsa: { type: 'AI', unite: 'µg phylloquinone (K1)', m: [70, 70, 70, 70], f: [70, 70, 70, 70], grossesse: 70, allaitement: 70, src: ['EFSA_DRV_2017:tableaux 9 et 11', 'EFSA_K_2017', 'EFSA_FINDER'],
        note: 'K1 seulement : EFSA juge les données sur les ménaquinones (K2) insuffisantes. L app compte K1 + K2 : la couverture affichée est donc un peu plus haute que la base EFSA.' },
      dge: { type: 'SW', m: [70, 70, 80, 80], f: [60, 60, 65, 65], grossesse: 60, allaitement: 60, src: ['DGE_VITK'] },
      ch: { type: 'AI', m: [70, 70, 70, [80, 120]], f: [70, 70, 70, [65, 90]], grossesse: 70, allaitement: 70, src: ['BLV_2022'] },
      ul: null, ul_note: 'EFSA : pas assez de données (EFSA_UL_2025, tableau 3).',
      ecart: 'EFSA 70 pour tous ; DGE 70 (homme) et 60 (femme), puis 80 et 65 dès 51 ans.'
    },

    b1: {
      nom: 'B1 thiamine', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'PRI', parMJ: { m: 0.1, f: 0.1 }, ar: { parMJ: 0.072 }, m: [null, null, null, null], f: [null, null, null, null], grossesse: null, allaitement: null,
        src: ['EFSA_DRV_2017:tableaux 8 à 11', 'EFSA_FINDER'],
        note: 'EFSA : 0,1 mg par MJ (0,4 mg pour 1000 kcal), même relation en grossesse et allaitement. Valeur du jour = 0,1 x dépense en MJ. Exemple, homme 18 à 29 ans, activité modérée (11,2 MJ) : 1,12 mg ; femme même âge (9,0 MJ) : 0,90 mg. Les cases par âge restent vides : elles dépendent de la dépense.' },
      dge: { type: 'EZ', m: [1.3, 1.2, 1.2, 1.1], f: [1.0, 1.0, 1.0, 1.0], grossesse: { t2: 1.2, t3: 1.3 }, allaitement: 1.3, src: ['DGE_B1'],
        note: 'Calculé par DGE sur sa dépense de référence (activité 1,4).' },
      ch: { type: 'PRI', parMJ: { m: 0.1, f: 0.1 }, m: [null, null, null, [1.1, 1.2]], f: [null, null, null, [1.0, 1.1]], src: ['BLV_2022'] },
      ul: null, ul_note: 'Pas assez de données (EFSA_UL_2025, tableau 3).',
      ecart: 'Même ordre de grandeur. EFSA suit la dépense réelle ; DGE donne un chiffre fixe par âge.'
    },

    b2: {
      nom: 'B2 riboflavine', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'PRI', m: [1.6, 1.6, 1.6, 1.6], f: [1.6, 1.6, 1.6, 1.6], grossesse: 1.9, allaitement: 2.0, ar: { m: 1.3, f: 1.3 }, src: ['EFSA_DRV_2017:tableaux 8 à 11', 'EFSA_FINDER'] },
      dge: { type: 'EZ', m: [1.4, 1.4, 1.3, 1.3], f: [1.1, 1.1, 1.0, 1.0], grossesse: { t2: 1.3, t3: 1.4 }, allaitement: 1.4, src: ['DGE_B2'] },
      ch: { type: 'PRI', m: [1.6, 1.6, 1.6, 1.3], f: [1.6, 1.6, 1.6, [1.0, 1.1]], grossesse: 1.9, allaitement: 2.0, src: ['BLV_2022'] },
      ul: null, ul_note: 'Pas assez de données (EFSA_UL_2025, tableau 3).',
      ecart: 'EFSA plus haut : 1,6 pour tous contre 1,4 (homme) et 1,1 (femme) chez DGE.'
    },

    b3: {
      nom: 'B3 niacine', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'PRI', unite: 'mg NE', parMJ: { m: 1.6, f: 1.6 }, ar: { parMJ: 1.3 }, m: [null, null, null, null], f: [null, null, null, null], grossesse: null, allaitement: null,
        src: ['EFSA_DRV_2017:tableaux 8 à 11', 'EFSA_FINDER'],
        note: 'EFSA : 1,6 mg NE par MJ (6,6 mg NE pour 1000 kcal), même relation en grossesse et allaitement. 1 mg NE = 1 mg niacine = 60 mg tryptophane. Exemple, homme 18 à 29 ans, activité modérée (11,2 MJ) : 17,9 mg NE ; femme (9,0 MJ) : 14,4 mg NE. Ciqual donne la vitamine B3 sans le tryptophane : la couverture affichée sous-estime l apport en NE.' },
      dge: { type: 'EZ', unite: 'mg NE', m: [16, 15, 15, 14], f: [13, 12, 11, 11], grossesse: { t2: 14, t3: 16 }, allaitement: 16, src: ['DGE_B3'] },
      ch: { type: 'PRI', parMJ: { m: 1.6, f: 1.6 }, m: [null, null, null, [14, 16]], f: [null, null, null, [11, 14]], src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 10, unite: 'mg', grossesse: null, allaitement: null, portee: 'complements', forme: 'acide nicotinique libre (compléments, aliments enrichis)',
        autre: { valeur: 900, unite: 'mg', forme: 'nicotinamide' },
        src: ['EFSA_UL_2025:tableau 3', 'SCF_UL_2006:niacine'],
        note: 'Deux UL selon la forme : acide nicotinique libre 10 mg, nicotinamide 900 mg. La niacine liée des aliments n est pas visée. Grossesse et allaitement : données insuffisantes, ces UL ne s appliquent pas.' },
      ecart: 'Même ordre de grandeur. EFSA suit la dépense ; DGE chiffre fixe.'
    },

    b5: {
      nom: 'B5 acide pantothénique', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'AI', m: [5, 5, 5, 5], f: [5, 5, 5, 5], grossesse: 5, allaitement: 7, src: ['EFSA_DRV_2017:tableaux 9 et 11', 'EFSA_FINDER'] },
      dge: { type: 'SW', m: [5, 5, 5, 5], f: [5, 5, 5, 5], grossesse: 5, allaitement: 7, src: ['DGE_B5'] },
      ch: { type: 'AI', m: [5, 5, 5, 5], f: [5, 5, 5, 5], grossesse: 5, allaitement: 7, src: ['BLV_2022'] },
      ul: null, ul_note: 'Pas assez de données (EFSA_UL_2025, tableau 3).',
      ecart: 'Aucun.'
    },

    b6: {
      nom: 'B6', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'PRI', m: [1.7, 1.7, 1.7, 1.7], f: [1.6, 1.6, 1.6, 1.6], grossesse: 1.8, allaitement: 1.7, ar: { m: 1.5, f: 1.3 }, src: ['EFSA_DRV_2017:tableaux 8 à 11', 'EFSA_FINDER'] },
      dge: { type: 'EZ', m: [1.6, 1.6, 1.6, 1.6], f: [1.4, 1.4, 1.4, 1.4], grossesse: { t1: 1.5, t2: 1.8, t3: 1.8 }, allaitement: 1.6, src: ['DGE_B6'] },
      ch: { type: 'PRI', m: [1.7, 1.7, 1.7, [1.4, 1.7]], f: [1.6, 1.6, 1.6, [1.2, 1.5]], grossesse: 1.8, allaitement: 1.7, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 12, unite: 'mg', grossesse: 12, allaitement: 12, portee: 'total', src: ['EFSA_UL_2025:tableau 3', 'EFSA_UL_B6_2023'],
        note: 'Abaissé de 25 à 12 mg en 2023 (atteinte des nerfs). En pratique, seuls les compléments très dosés le dépassent.' },
      ecart: 'Faible : EFSA 1,7 et 1,6 ; DGE 1,6 et 1,4.'
    },

    b9: {
      nom: 'B9 folates', unite: 'µg', defaut: 'efsa',
      efsa: { type: 'PRI', unite: 'µg DFE', m: [330, 330, 330, 330], f: [330, 330, 330, 330], grossesse: 600, grossesse_type: 'AI', allaitement: 500, ar: { m: 250, f: 250 },
        src: ['EFSA_DRV_2017:tableaux 8 à 11', 'EFSA_FINDER'],
        note: 'DFE EFSA : µg folates des aliments + 1,7 x µg acide folique. Un complément d acide folique compte donc 1,7 fois.' },
      dge: { type: 'EZ', unite: 'µg équivalents folate', m: [300, 300, 300, 300], f: [300, 300, 300, 300], grossesse: 550, allaitement: 450, src: ['DGE_B9'],
        note: 'DGE : 1 µg équivalent = 1 µg folate alimentaire = 0,5 µg acide folique (facteur 2). Femme qui peut ou veut être enceinte : 400 µg d acide folique en plus, dès 4 semaines avant et pendant le premier trimestre.' },
      ch: { type: 'PRI', m: [330, 330, 330, [300, 400]], f: [330, 330, 330, [300, 400]], grossesse: 550, allaitement: 450, src: ['BLV_2022'], note: 'Grossesse OSAV : 550 µg plus 400 µg en complément.' },
      ul: { type: 'UL', valeur: 1000, unite: 'µg', grossesse: 1000, allaitement: 1000, portee: 'complements',
        forme: 'acide folique, (6S)-5-méthyltétrahydrofolate glucosamine et L-5-méthyltétrahydrofolate calcium ajoutés (compléments, aliments enrichis)',
        src: ['EFSA_UL_2025:tableau 3', 'EFSA_UL_B9_2023'], note: 'Les folates naturels des aliments ne comptent pas dans cet UL.' },
      ecart: 'EFSA 330 contre DGE 300 ; facteurs de conversion de l acide folique différents (1,7 contre 2).'
    },

    b12: {
      nom: 'B12', unite: 'µg', defaut: 'efsa',
      efsa: { type: 'AI', m: [4, 4, 4, 4], f: [4, 4, 4, 4], grossesse: 4.5, allaitement: 5, src: ['EFSA_DRV_2017:tableaux 9 et 11', 'EFSA_FINDER'] },
      dge: { type: 'SW', m: [4, 4, 4, 4], f: [4, 4, 4, 4], grossesse: 4.5, allaitement: 5.5, src: ['DGE_B12'] },
      ch: { type: 'AI', m: [4, 4, 4, [2.4, 3.0]], f: [4, 4, 4, [2.4, 3.0]], grossesse: 4.5, allaitement: 5, src: ['BLV_2022'] },
      ul: null, ul_note: 'Pas d effet indésirable défini (EFSA_UL_2025, tableau 3).',
      ecart: 'Aucun hors allaitement.'
    },

    choline: {
      nom: 'Choline', unite: 'mg', defaut: 'efsa', suivi_app: false,
      efsa: { type: 'AI', m: [400, 400, 400, 400], f: [400, 400, 400, 400], grossesse: 480, allaitement: 520, src: ['EFSA_DRV_2017:tableaux 9 et 11', 'EFSA_FINDER'] },
      dge: null, dge_note: 'DGE ne publie pas de valeur pour la choline (aucune page dans dge.de/wissenschaft/referenzwerte).',
      ch: null, ch_note: 'Absente du fichier OSAV 2022.',
      ul: null, ul_note: 'Aucun UL dans la vue d ensemble EFSA 2025.',
      note: 'Ciqual ne publie pas la choline : l app ne peut pas la suivre.'
    },

    /* ---------- MINÉRAUX ---------- */

    ca: {
      nom: 'Calcium', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'PRI', m: [1000, 950, 950, 950], f: [1000, 950, 950, 950], grossesse: { '18-24': 1000, '25+': 950 }, allaitement: { '18-24': 1000, '25+': 950 }, ar: { '18-24': 860, '25+': 750 },
        src: ['EFSA_DRV_2017:tableaux 4 à 7', 'EFSA_FINDER'] },
      dge: { type: 'EZ', m: [1000, 1000, 1000, 1000], f: [1000, 1000, 1000, 1000], grossesse: 1000, allaitement: 1000, src: ['DGE_CA'] },
      ch: { type: 'PRI', m: [1000, 950, 950, [1000, 1200]], f: [1000, 950, 950, [1000, 1200]], grossesse: { '18-24': 1000, '25+': 950 }, allaitement: { '18-24': 1000, '25+': 950 }, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 2500, unite: 'mg', grossesse: 2500, allaitement: 2500, portee: 'total', src: ['EFSA_UL_2025:tableau 1', 'EFSA_UL_CA_2012'] },
      ecart: 'EFSA 950 dès 25 ans, DGE 1000.'
    },

    fe: {
      nom: 'Fer', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'PRI', m: [11, 11, 11, 11], f: { avantMenopause: 16, apresMenopause: 11 }, grossesse: 16, allaitement: 16, ar: { m: 6, f_avant: 7, f_apres: 6 },
        src: ['EFSA_DRV_2017:tableaux 4 à 7', 'EFSA_FINDER'],
        note: 'Femme : 16 mg avant la ménopause (couvre environ 95 % des femmes), 11 mg après, comme l homme. L outil DRV Finder d EFSA range la femme « 40 ans et plus » à 11 mg ; l avis EFSA parle de ménopause, pas d âge.' },
      dge: { type: 'EZ', m: [11, 11, 11, 11], f: { avantMenopause: [16, 16, 16, null], apresMenopause: [null, 14, 14, 14] }, grossesse: 27, allaitement: 16, src: ['DGE_FE'],
        note: 'Femme qui n a pas de règles (pilule prise sans pause, périménopause précoce) : 11 mg. La valeur allaitement vaut aussi après l accouchement sans allaitement.' },
      ch: { type: 'PRI', m: [11, 11, 11, [8, 10]], f: { avantMenopause: 16, apresMenopause: 11, plus65: [8, 10] }, grossesse: 30, allaitement: 20, src: ['BLV_2022'] },
      ul: { type: 'NS', valeur: 40, unite: 'mg', grossesse: 40, allaitement: 40, portee: 'total', src: ['EFSA_UL_2025:tableau 2', 'EFSA_UL_FE_2024'],
        note: 'Niveau sûr, pas un UL : EFSA n a pas pu fixer d UL. Fixé à partir de 20 à 25 mg de complément ajoutés à environ 15 mg venant des aliments.' },
      ecart: 'Homme identique (11). Femme après la ménopause : EFSA 11, DGE 14. Grossesse : EFSA 16, DGE 27, OSAV 30.'
    },

    mg: {
      nom: 'Magnésium', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'AI', m: [350, 350, 350, 350], f: [300, 300, 300, 300], grossesse: 300, allaitement: 300, src: ['EFSA_DRV_2017:tableaux 5 et 7', 'EFSA_FINDER'] },
      dge: { type: 'SW', m: [350, 350, 350, 350], f: [300, 300, 300, 300], grossesse: 300, allaitement: 300, src: ['DGE_MG'] },
      ch: { type: 'AI', m: [350, 350, 350, [350, 420]], f: [300, 300, 300, [300, 320]], grossesse: 300, allaitement: 300, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 250, unite: 'mg', grossesse: 250, allaitement: 250, portee: 'complements',
        forme: 'sels de magnésium facilement dissociables (chlorure, sulfate, aspartate, lactate) et oxyde de magnésium, dans compléments, eau ou aliments enrichis',
        src: ['EFSA_UL_2025:tableau 1', 'SCF_UL_2006:magnésium', 'EFSA_FINDER'], note: 'Le magnésium naturel des aliments et boissons ne compte pas.' },
      ecart: 'Aucun.'
    },

    zn: {
      nom: 'Zinc', unite: 'mg', defaut: 'efsa', defautPhytate: 600,
      efsa: { type: 'PRI', parPhytate: { 300: { m: 9.4, f: 7.5 }, 600: { m: 11.7, f: 9.3 }, 900: { m: 14.0, f: 11.0 }, 1200: { m: 16.3, f: 12.7 } },
        m: [11.7, 11.7, 11.7, 11.7], f: [9.3, 9.3, 9.3, 9.3], grossesse: '+1,6 mg', allaitement: '+2,9 mg',
        ar: { 300: { m: 7.5, f: 6.2 }, 600: { m: 9.3, f: 7.6 }, 900: { m: 11.0, f: 8.9 }, 1200: { m: 12.7, f: 10.2 } },
        src: ['EFSA_DRV_2017:tableaux 4 à 7', 'EFSA_FINDER'],
        note: 'Les cases m et f reprennent le niveau 600 mg de phytates (choix de la table, voir DRV_AUDIT.md). Grossesse et allaitement : à ajouter à la valeur de la femme.' },
      dge: { type: 'EZ', parPhytate: { 330: { m: 11, f: 7 }, 660: { m: 14, f: 8 }, 990: { m: 16, f: 10 } }, m: [14, 14, 14, 14], f: [8, 8, 8, 8],
        grossesse: { t1: { 330: 7, 660: 9, 990: 11 }, t23: { 330: 9, 660: 11, 990: 13 } }, allaitement: { 330: 11, 660: 13, 990: 14 }, src: ['DGE_ZN'],
        note: 'Phytates faibles (330 mg) : peu de céréales complètes et de légumineuses, protéines surtout animales. Moyens (660 mg) : alimentation mixte avec céréales complètes et légumineuses. Élevés (990 mg) : beaucoup de céréales complètes non germées et de légumineuses, protéines surtout végétales. Les cases m et f reprennent le niveau moyen.' },
      ch: { type: 'PRI', parPhytate: { 300: { m: 9.4, f: 7.5 }, 600: { m: 11.7, f: 9.3 }, 900: { m: 14.0, f: 11.0 }, 1200: { m: 16.3, f: 12.7 } }, plus65: { m: [11, 14, 16], f: [7, 8, 10] }, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 25, unite: 'mg', grossesse: 25, allaitement: 25, portee: 'total', src: ['EFSA_UL_2025:tableau 1', 'SCF_UL_2006:zinc'] },
      ecart: 'Même logique (selon les phytates), niveaux proches. Alimentation mixte : EFSA 11,7 et 9,3 ; DGE 14 et 8.'
    },

    k: {
      nom: 'Potassium', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'AI', m: [3500, 3500, 3500, 3500], f: [3500, 3500, 3500, 3500], grossesse: 3500, allaitement: 4000, src: ['EFSA_DRV_2017:tableaux 5 et 7', 'EFSA_FINDER'] },
      dge: { type: 'SW', m: [4000, 4000, 4000, 4000], f: [4000, 4000, 4000, 4000], grossesse: 4000, allaitement: 4400, src: ['DGE_K'] },
      ch: { type: 'AI', m: [3500, 3500, 3500, [4000, 4700]], f: [3500, 3500, 3500, [4000, 4700]], grossesse: 3500, allaitement: 4000, src: ['BLV_2022'] },
      ul: null, ul_note: 'Pas assez de données (EFSA_UL_2025, tableau 1).',
      ecart: 'EFSA 3500, DGE 4000.'
    },

    se: {
      nom: 'Sélénium', unite: 'µg', defaut: 'efsa',
      efsa: { type: 'AI', m: [70, 70, 70, 70], f: [70, 70, 70, 70], grossesse: 70, allaitement: 85, src: ['EFSA_DRV_2017:tableaux 5 et 7', 'EFSA_FINDER'] },
      dge: { type: 'SW', m: [70, 70, 70, 70], f: [60, 60, 60, 60], grossesse: 60, allaitement: 75, src: ['DGE_SE'] },
      ch: { type: 'AI', m: [70, 70, 70, [55, 70]], f: [70, 70, 70, [55, 60]], grossesse: 70, allaitement: 85, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 255, unite: 'µg', grossesse: 255, allaitement: 255, portee: 'total', src: ['EFSA_UL_2025:tableau 1', 'EFSA_UL_SE_2023'],
        note: 'Abaissé de 300 à 255 µg en 2023. Risque surtout avec des compléments très dosés ou des noix du Brésil tous les jours.' },
      ecart: 'Femme : EFSA 70, DGE 60.'
    },

    i: {
      nom: 'Iode', unite: 'µg', defaut: 'efsa',
      efsa: { type: 'AI', m: [150, 150, 150, 150], f: [150, 150, 150, 150], grossesse: 200, allaitement: 200, src: ['EFSA_DRV_2017:tableaux 5 et 7', 'EFSA_FINDER'] },
      dge: { type: 'EZ', m: [150, 150, 150, 150], f: [150, 150, 150, 150], grossesse: 220, allaitement: 230, src: ['DGE_I'],
        note: 'Révisé en 2025. Grossesse : complément de 100 à 150 µg par jour en plus du sel iodé ; allaitement : 100 µg.' },
      ch: { type: 'AI', m: [150, 150, 150, 150], f: [150, 150, 150, 150], grossesse: 250, allaitement: 250, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 600, unite: 'µg', grossesse: 600, allaitement: 600, portee: 'total', src: ['EFSA_UL_2025:tableau 1', 'SCF_UL_2006:iode'] },
      ecart: 'Adulte identique (150). Grossesse : EFSA 200, DGE 220, OSAV 250.'
    },

    cu: {
      nom: 'Cuivre', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'AI', m: [1.6, 1.6, 1.6, 1.6], f: [1.3, 1.3, 1.3, 1.3], grossesse: 1.5, allaitement: 1.5, src: ['EFSA_DRV_2017:tableaux 5 et 7', 'EFSA_FINDER'] },
      dge: { type: 'SW', m: [[1.0, 1.5], [1.0, 1.5], [1.0, 1.5], [1.0, 1.5]], f: [[1.0, 1.5], [1.0, 1.5], [1.0, 1.5], [1.0, 1.5]], grossesse: null, allaitement: null, src: ['DGE_CU_MN'],
        note: 'Plage de 2000, non révisée ; pas de valeur à part pour grossesse et allaitement.' },
      ch: { type: 'AI', m: [1.6, 1.6, 1.6, [0.9, 1.5]], f: [1.3, 1.3, 1.3, [0.9, 1.5]], grossesse: 1.5, allaitement: 1.5, src: ['BLV_2022'] },
      ul: { type: 'UL', valeur: 5, unite: 'mg', grossesse: null, allaitement: null, portee: 'total', src: ['EFSA_UL_2025:tableau 1', 'SCF_UL_2006:cuivre', 'EFSA_CU_2023'],
        note: 'Grossesse et allaitement : non défini (EFSA_FINDER). EFSA a fixé en 2023 une dose journalière admissible de 0,07 mg par kg de poids.' },
      ecart: 'EFSA donne une valeur (1,6 et 1,3), DGE une plage (1,0 à 1,5).'
    },

    mn: {
      nom: 'Manganèse', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'AI', m: [3, 3, 3, 3], f: [3, 3, 3, 3], grossesse: 3, allaitement: 3, src: ['EFSA_DRV_2017:tableaux 5 et 7', 'EFSA_FINDER'] },
      dge: { type: 'SW', m: [[2, 5], [2, 5], [2, 5], [2, 5]], f: [[2, 5], [2, 5], [2, 5], [2, 5]], grossesse: null, allaitement: null, src: ['DGE_CU_MN'], note: 'Plage de 2000, non révisée.' },
      ch: { type: 'AI', m: [3, 3, 3, 3], f: [3, 3, 3, 3], grossesse: 3, allaitement: 3, src: ['BLV_2022'] },
      ul: { type: 'NS', valeur: 8, unite: 'mg', grossesse: 8, allaitement: 8, portee: 'total', src: ['EFSA_UL_2025:tableau 2', 'EFSA_UL_MN_2023'],
        note: 'Niveau sûr, pas un UL : fixé sur les plus gros consommateurs (95e centile) d apports alimentaires naturels.' },
      ecart: 'EFSA 3, DGE plage 2 à 5.'
    },

    /* ---------- MACRONUTRIMENTS, FIBRES, EAU ---------- */

    p: {
      nom: 'Protéines', unite: 'g/kg', defaut: 'efsa',
      efsa: { type: 'PRI', m: [0.83, 0.83, 0.83, 0.83], f: [0.83, 0.83, 0.83, 0.83], grossesse: { t1: '+1 g/j', t2: '+9 g/j', t3: '+28 g/j' }, allaitement: { avant6mois: '+19 g/j', apres6mois: '+13 g/j' }, ar: { m: 0.66, f: 0.66 },
        src: ['EFSA_DRV_2017:tableau 3', 'EFSA_FINDER'],
        note: 'Par kg de poids. Même valeur pour la personne âgée. EFSA : chez l adulte, deux fois le PRI (1,66 g/kg) est considéré comme sûr ; pas assez de données pour fixer un UL.' },
      dge: { type: 'EZ', m: [0.8, 0.8, 0.8, 1.0], f: [0.8, 0.8, 0.8, 1.0], grossesse: { t2: 0.9, t3: 1.0 }, allaitement: 1.2, src: ['DGE_P'],
        note: '65 ans et plus : 1,0 g/kg est un Schätzwert (estimation). En cas de surpoids, calculer avec le poids normal.' },
      ch: { type: 'PRI', m: [0.83, 0.83, 0.83, [1.0, 1.2]], f: [0.83, 0.83, 0.83, [1.0, 1.2]], src: ['BLV_2022'] },
      ul: null, ul_note: 'Pas assez de données (EFSA_UL_2025, tableau 4). Deux fois le PRI est jugé sûr (EFSA_DRV_2017, section 3.4).',
      ecart: 'Adulte presque identique (0,83 contre 0,8). Dès 65 ans, DGE monte à 1,0 et l OSAV à 1,0 à 1,2.'
    },

    c: {
      nom: 'Glucides', unite: '%E', defaut: 'efsa',
      efsa: { type: 'RI', m: [[45, 60], [45, 60], [45, 60], [45, 60]], f: [[45, 60], [45, 60], [45, 60], [45, 60]], grossesse: [45, 60], allaitement: [45, 60], src: ['EFSA_DRV_2017:tableau 2', 'EFSA_FINDER'] },
      dge: { type: 'RW', m: ['> 50', '> 50', '> 50', '> 50'], f: ['> 50', '> 50', '> 50', '> 50'], src: ['DGE_KH'], note: 'DGE : plus de 50 % de l énergie dans une alimentation mixte complète (valeur de 2000).' },
      ch: { type: 'RI', m: [[45, 60], [45, 60], [45, 60], [45, 65]], f: [[45, 60], [45, 60], [45, 60], [45, 65]], src: ['BLV_2022'] },
      ul: null, ul_note: 'Pas d UL (EFSA_FINDER).',
      ecart: 'Compatibles : 45 à 60 % contre plus de 50 %.'
    },

    f: {
      nom: 'Lipides', unite: '%E', defaut: 'efsa',
      efsa: { type: 'RI', m: [[20, 35], [20, 35], [20, 35], [20, 35]], f: [[20, 35], [20, 35], [20, 35], [20, 35]], grossesse: [20, 35], allaitement: [20, 35], src: ['EFSA_DRV_2017:tableau 2', 'EFSA_FINDER'] },
      dge: { type: 'RW', m: [30, 30, 30, 30], f: [30, 30, 30, 30], grossesse: [30, 35], allaitement: [30, 35], src: ['DGE_FETT'], note: 'Plus de 30 % possible si activité forte (PAL au-dessus de 1,7).' },
      oms: { type: 'LIM', m: ['<= 30', '<= 30', '<= 30', '<= 30'], f: ['<= 30', '<= 30', '<= 30', '<= 30'], src: ['OMS_FICHE_2026'] },
      ch: { type: 'RI', m: [[20, 35], [20, 35], [20, 35], [20, 35]], f: [[20, 35], [20, 35], [20, 35], [20, 35]], src: ['BLV_2022'] },
      ul: null,
      ecart: 'EFSA plage 20 à 35 % ; DGE et OMS autour de 30 %.'
    },

    sat: {
      nom: 'AG saturés', unite: '%E', defaut: 'oms', limite: true,
      efsa: { type: 'ALAP', m: [null, null, null, null], f: [null, null, null, null], src: ['EFSA_DRV_2017:section 3.3', 'EFSA_FINDER'],
        note: 'EFSA : aussi bas que possible dans une alimentation qui couvre les besoins. Pas de chiffre, pas d UL.' },
      oms: { type: 'LIM', m: [10, 10, 10, 10], f: [10, 10, 10, 10], src: ['OMS_AGS_2023'],
        note: 'OMS : réduire à 10 % de l énergie (recommandation forte) ; descendre sous 10 % (recommandation conditionnelle). Remplacer surtout par des graisses polyinsaturées.' },
      ch: { type: 'LIM', m: ['< 10', '< 10', '< 10', '< 10'], f: ['< 10', '< 10', '< 10', '< 10'], src: ['BLV_2022'] },
      ecart: 'EFSA ne donne pas de chiffre ; la limite chiffrée vient de l OMS. Défaut : OMS. En grammes : 10 % x kcal / 9.'
    },

    sug: {
      nom: 'Sucres libres', unite: '%E', defaut: 'oms', limite: true,
      oms: { type: 'LIM', m: [10, 10, 10, 10], f: [10, 10, 10, 10], src: ['OMS_SUCRES_2015'],
        note: 'Moins de 10 % de l énergie (recommandation forte) ; moins de 5 % (conditionnelle). Sucres libres = sucres ajoutés + sucres du miel, des sirops et des jus de fruits. Pas les sucres des fruits entiers ni du lait.' },
      efsa: { type: 'ALAP', m: [null, null, null, null], f: [null, null, null, null], src: ['EFSA_SUCRES_2022'], note: 'EFSA 2022 : sucres ajoutés et libres aussi bas que possible ; ni UL ni niveau sûr.' },
      ch: { type: 'LIM', m: ['<= 10', '<= 10', '<= 10', '<= 10'], f: ['<= 10', '<= 10', '<= 10', '<= 10'], src: ['BLV_2022'] },
      attention: 'L app suit les « Sucres » de Ciqual, donc les sucres totaux (fruits et lait compris). On ne peut pas les comparer à une limite de sucres libres. Afficher sans alerte, ou ajouter plus tard une saisie des sucres ajoutés.',
      ecart: 'EFSA sans chiffre, OMS 10 %.'
    },

    fib: {
      nom: 'Fibres', unite: 'g', defaut: 'efsa',
      efsa: { type: 'AI', m: [25, 25, 25, 25], f: [25, 25, 25, 25], grossesse: 25, allaitement: 25, src: ['EFSA_DRV_2017:tableau 2', 'EFSA_FINDER'],
        note: '25 g suffisent pour un transit normal ; EFSA note des bénéfices au-delà (cœur, diabète de type 2, poids).' },
      dge: { type: 'RW', m: ['>= 30', '>= 30', '>= 30', '>= 30'], f: ['>= 30', '>= 30', '>= 30', '>= 30'], grossesse: '>= 30', allaitement: '>= 30', src: ['DGE_FIB'],
        note: 'Densité visée : 14,6 g pour 1000 kcal (3,5 g par MJ), la même pour les deux sexes.' },
      oms: { type: 'RW', m: ['>= 25', '>= 25', '>= 25', '>= 25'], f: ['>= 25', '>= 25', '>= 25', '>= 25'], src: ['OMS_FICHE_2026'], note: 'Fibres naturellement présentes dans les aliments.' },
      ch: { type: 'AI', m: ['>= 30', '>= 30', '>= 30', [25, 30]], f: ['>= 30', '>= 30', '>= 30', [25, 30]], grossesse: 30, allaitement: 30, src: ['BLV_2022'] },
      ul: null,
      ecart: 'EFSA et OMS 25 g, DGE et OSAV 30 g.'
    },

    eau: {
      nom: 'Eau', unite: 'ml', defaut: 'efsa',
      efsa: { type: 'AI', base: 'eau totale : boissons + eau des aliments', m: [2500, 2500, 2500, 2500], f: [2000, 2000, 2000, 2000], grossesse: 2300, allaitement: 2700,
        src: ['EFSA_DRV_2017:tableau 2 et section 3.5', 'EFSA_FINDER'],
        note: 'Climat tempéré et activité modérée (PAL 1,6). Chaleur et sport : bien plus. EFSA ne donne pas de chiffre pour les boissons seules.' },
      dge: { type: 'RW', base: 'boissons seules', m: [1470, 1410, 1230, 1310], f: [1470, 1410, 1230, 1310], grossesse: 1470, allaitement: 1710, src: ['DGE_EAU'],
        note: 'Même valeur pour les deux sexes. DGE donne aussi l eau totale : 2700, 2600, 2250, 2250 ml (eau d oxydation comprise).' },
      ch: { type: 'AI', m: [2500, 2500, 2500, [1400, 1500]], f: [2000, 2000, 2000, [1400, 1500]], grossesse: [2000, 2300], allaitement: 2700, src: ['BLV_2022'], note: 'Plus de 65 ans : boissons seules.' },
      ul: null,
      ecart: 'Pas la même chose : EFSA compte l eau des aliments, DGE donne les boissons. Pour une app qui compte ce qu on boit, le repère DGE est le bon objet.'
    },

    /* ---------- ACIDES GRAS OMÉGA-3 ---------- */

    ala: {
      nom: 'Oméga-3 ALA', unite: '%E', defaut: 'efsa',
      efsa: { type: 'AI', m: [0.5, 0.5, 0.5, 0.5], f: [0.5, 0.5, 0.5, 0.5], grossesse: 0.5, allaitement: 0.5, src: ['EFSA_DRV_2017:tableau 2', 'EFSA_FINDER'], note: 'En grammes : 0,5 % x kcal / 9. Exemple 2500 kcal : 1,4 g.' },
      dge: { type: 'SW', m: [0.5, 0.5, 0.5, 0.5], f: [0.5, 0.5, 0.5, 0.5], grossesse: 0.5, allaitement: 0.5, src: ['DGE_FETT'] },
      ch: { type: 'AI', m: [0.5, 0.5, 0.5, 0.5], f: [0.5, 0.5, 0.5, 0.5], src: ['BLV_2022'] },
      ul: null, ecart: 'Aucun.'
    },

    epadha: {
      nom: 'Oméga-3 EPA + DHA', unite: 'mg', defaut: 'efsa',
      efsa: { type: 'AI', m: [250, 250, 250, 250], f: [250, 250, 250, 250], grossesse: '250 + 100 à 200 de DHA', allaitement: '250 + 100 à 200 de DHA', src: ['EFSA_DRV_2017:tableau 2 et section 3.3', 'EFSA_FINDER'] },
      dge: null, dge_note: 'La page DGE ne donne pas de valeur EPA + DHA pour l adulte. Grossesse et allaitement : au moins 200 mg de DHA par jour en moyenne.',
      ch: { type: 'AI', m: [250, 250, 250, 250], f: [250, 250, 250, 250], src: ['BLV_2022'] },
      ul: null, ul_note: 'Pas assez de données pour un UL (EFSA_UL_2025, tableau 4).'
    },

    o3: {
      nom: 'Oméga-3 (ALA + EPA + DHA, total de l app)', unite: 'g', defaut: 'derive',
      derive: { formule: 'g = 0,005 x kcal / 9 + 0,25', src: ['EFSA_DRV_2017:tableau 2'],
        note: 'Aucune source ne donne un total ALA + EPA + DHA. Ce repère additionne les deux AI EFSA (ALA et EPA + DHA). Il est construit par cette table, il n est publié nulle part. Le mieux : suivre ALA et EPA + DHA à part.' }
    },

    /* ---------- SODIUM ET SEL ---------- */

    na: {
      nom: 'Sodium', unite: 'mg', defaut: 'efsa', limite: true,
      efsa: { type: 'SAI', m: [2000, 2000, 2000, 2000], f: [2000, 2000, 2000, 2000], grossesse: 2000, allaitement: 2000, src: ['EFSA_NA_2019', 'EFSA_FINDER'],
        note: 'Apport sûr et adéquat : à ce niveau, confiance dans un risque cardio-vasculaire réduit, et la plupart des adultes gardent leur équilibre en sodium.' },
      oms: { type: 'LIM', m: ['< 2000', '< 2000', '< 2000', '< 2000'], f: ['< 2000', '< 2000', '< 2000', '< 2000'], src: ['OMS_NA_2012'], note: 'Moins de 2 g de sodium, soit moins de 5 g de sel (recommandation forte).' },
      dge: { type: 'SW', m: [1500, 1500, 1500, 1500], f: [1500, 1500, 1500, 1500], grossesse: 1500, allaitement: 1500, src: ['DGE_NA'], note: 'Apport jugé suffisant, pas une limite.' },
      ch: { type: 'SAI', m: [2000, 2000, 2000, [1200, 1500]], f: [2000, 2000, 2000, [1200, 1500]], grossesse: 2000, allaitement: 2000, src: ['BLV_2022'] },
      ul: null, ul_note: 'EFSA 2005 : pas d UL (EFSA_UL_2025, tableau 1). L apport sûr et adéquat de 2019 sert de repère.',
      ecart: 'EFSA et OMS : 2 g. DGE : 1,5 g, mais comme apport suffisant, pas comme plafond.'
    },

    salt: {
      nom: 'Sel', unite: 'g', defaut: 'oms', limite: true,
      oms: { type: 'LIM', m: ['< 5', '< 5', '< 5', '< 5'], f: ['< 5', '< 5', '< 5', '< 5'], valeur: 5, src: ['OMS_NA_2012', 'OMS_FICHE_2026'] },
      efsa: { type: 'SAI', equivalent: 5, src: ['EFSA_NA_2019'], note: '2 g de sodium équivalent à 5 g de sel (équivalence donnée par l OMS, OMS_NA_2012).' },
      ecart: 'Même repère, 5 g.'
    }
  },

  /* Besoins moyens en énergie EFSA (MJ/j), adultes, par décennie. PAL 1,4 sédentaire, 1,6 modéré, 1,8 actif, 2,0 très actif.
     Source : EFSA_DRV_2017, tableau 1, recontrôlé dans EFSA_FINDER. Rien au-delà de 79 ans (EFSA : pas de données). */
  energieRef: {
    unite: 'MJ/j', kcalParMJ: 238.83, pal: [1.4, 1.6, 1.8, 2.0],
    m: { '18-29': [9.8, 11.2, 12.6, 14.0], '30-39': [9.5, 10.8, 12.2, 13.5], '40-49': [9.3, 10.7, 12.0, 13.4], '50-59': [9.2, 10.5, 11.9, 13.2], '60-69': [8.4, 9.6, 10.9, 12.1], '70-79': [8.3, 9.5, 10.7, 11.9] },
    f: { '18-29': [7.9, 9.0, 10.1, 11.2], '30-39': [7.6, 8.7, 9.8, 10.8], '40-49': [7.5, 8.6, 9.7, 10.7], '50-59': [7.5, 8.5, 9.6, 10.7], '60-69': [6.8, 7.8, 8.8, 9.7], '70-79': [6.8, 7.7, 8.7, 9.6] },
    grossesse: { t1: 0.29, t2: 1.1, t3: 2.1 }, allaitement: 2.1
  },

  conversions: {
    kcalParMJ: 238.83,
    vitA_RE_efsa: 'µg RE = µg rétinol + µg bêta-carotène / 6 + µg autres caroténoïdes provitamine A / 12 (EFSA_DRV_2017)',
    vitA_RAE_dge: 'µg RAE = µg rétinol + µg bêta-carotène / 12 + µg autres caroténoïdes provitamine A / 24 (DGE_VITA)',
    vitA_ul: '1 µg RE = 1 µg rétinol = 0,87 µg acétate de rétinyle = 0,55 µg palmitate de rétinyle (EFSA_FINDER, note de l UL)',
    folate_DFE_efsa: 'µg DFE = µg folates des aliments + 1,7 x µg acide folique (EFSA_DRV_2017)',
    folate_dge: '1 µg équivalent folate = 1 µg folate alimentaire = 0,5 µg acide folique (DGE_B9)',
    niacine_NE: '1 mg NE = 1 mg niacine = 60 mg tryptophane (EFSA_DRV_2017, DGE_B3)',
    vitD_UI: '1 µg = 40 UI (EFSA_DRV_2017)',
    vitE_dge: '1 mg RRR-alpha-tocophérol = 2 mg all-rac-alpha-tocophérol (DGE_VITE)',
    sel_sodium: '5 g de sel = 2 g de sodium (OMS_NA_2012)'
  },

  sources: {
    EFSA_DRV_2017: { titre: 'EFSA, Dietary Reference Values for nutrients. Summary report. EFSA supporting publication 2017:e15121, 92 p.', date: 'approuvé le 4 décembre 2017', doi: '10.2903/sp.efsa.2017.e15121', url: 'https://www.efsa.europa.eu/sites/default/files/2017_09_DRVs_summary_report.pdf' },
    EFSA_FINDER: { titre: 'EFSA, DRV Finder (outil en ligne), fichier de données assets/data/languages/en/data.json', date: 'version en ligne lue le 2026-10-23', url: 'https://multimedia.efsa.europa.eu/drvs/index.htm' },
    EFSA_NA_2019: { titre: 'EFSA NDA Panel, Dietary reference values for sodium. EFSA Journal 2019;17(9):5778', date: '2019-09-04', doi: '10.2903/j.efsa.2019.5778' },
    EFSA_K_2017: { titre: 'EFSA NDA Panel, Dietary reference values for vitamin K. EFSA Journal 2017;15(5):4780', date: '2017-05-22', doi: '10.2903/j.efsa.2017.4780' },
    EFSA_SUCRES_2022: { titre: 'EFSA NDA Panel, Tolerable upper intake level for dietary sugars. EFSA Journal 2022;20(2):7074', date: '2022-02-28', doi: '10.2903/j.efsa.2022.7074' },
    EFSA_UL_2025: { titre: 'EFSA, Overview on Tolerable Upper Intake Levels as derived by the SCF and the EFSA NDA Panel, version 11', date: 'août 2025', url: 'https://www.efsa.europa.eu/sites/default/files/2024-05/ul-summary-report.pdf' },
    EFSA_UL_VITA_2024: { titre: 'EFSA NDA Panel, Scientific opinion on the tolerable upper intake level for preformed vitamin A and beta-carotene. EFSA Journal 2024;22(6):8814', date: '2024-06-06', doi: '10.2903/j.efsa.2024.8814' },
    EFSA_UL_FE_2024: { titre: 'EFSA NDA Panel, Scientific opinion on the tolerable upper intake level for iron. EFSA Journal 2024;22(6):8819', date: '2024-06-12', doi: '10.2903/j.efsa.2024.8819' },
    EFSA_UL_VITE_2024: { titre: 'EFSA NDA Panel, Scientific opinion on the tolerable upper intake level for vitamin E. EFSA Journal 2024;22(8):8953', date: '2024-08-02', doi: '10.2903/j.efsa.2024.8953' },
    EFSA_UL_VITD_2023: { titre: 'EFSA NDA Panel, Scientific opinion on the tolerable upper intake level for vitamin D, including the derivation of a conversion factor for calcidiol monohydrate. EFSA Journal 2023;21(8):8145', date: '2023-08-08', doi: '10.2903/j.efsa.2023.8145' },
    EFSA_UL_B6_2023: { titre: 'EFSA NDA Panel, Scientific opinion on the tolerable upper intake level for vitamin B6. EFSA Journal 2023;21(5):8006', date: '2023-05-17', doi: '10.2903/j.efsa.2023.8006' },
    EFSA_UL_B9_2023: { titre: 'EFSA NDA Panel, Scientific opinion on the tolerable upper intake level for folate. EFSA Journal 2023;21(11):8353', date: '2023-11-13', doi: '10.2903/j.efsa.2023.8353' },
    EFSA_UL_SE_2023: { titre: 'EFSA NDA Panel, Scientific opinion on the tolerable upper intake level for selenium. EFSA Journal 2023;21(1):7704', date: '2023-01-20', doi: '10.2903/j.efsa.2023.7704' },
    EFSA_UL_MN_2023: { titre: 'EFSA NDA Panel, Scientific opinion on the tolerable upper intake level for manganese. EFSA Journal 2023;21(12):8413', date: '2023-12-08', doi: '10.2903/j.efsa.2023.8413' },
    EFSA_CU_2023: { titre: 'EFSA Scientific Committee, Re-evaluation of the existing health-based guidance values for copper and exposure assessment from all sources. EFSA Journal 2023;21(1):7728', date: '2023-01-17', doi: '10.2903/j.efsa.2023.7728' },
    EFSA_UL_CA_2012: { titre: 'EFSA NDA Panel, Scientific Opinion on the Tolerable Upper Intake Level of calcium. EFSA Journal 2012;10(7):2814', date: '2012-07-27', doi: '10.2903/j.efsa.2012.2814' },
    SCF_UL_2006: { titre: 'EFSA, Tolerable Upper Intake Levels for Vitamins and Minerals (avis du SCF et du panel NDA réunis)', date: 'février 2006', url: 'https://www.efsa.europa.eu/sites/default/files/efsa_rep/blobserver_assets/ndatolerableuil.pdf' },
    DGE_VITA: { titre: 'DGE/ÖGE, Referenzwerte, Vitamin A (Stand Ableitung 2020)', url: 'https://www.dge.de/wissenschaft/referenzwerte/vitamin-a/' },
    DGE_VITC: { titre: 'DGE/ÖGE, Referenzwerte, Vitamin C (Stand Ableitung 2015)', url: 'https://www.dge.de/wissenschaft/referenzwerte/vitamin-c/' },
    DGE_VITD: { titre: 'DGE/ÖGE, Referenzwerte, Vitamin D (Stand Ableitung 2012)', url: 'https://www.dge.de/wissenschaft/referenzwerte/vitamin-d/' },
    DGE_VITE: { titre: 'DGE/ÖGE, Referenzwerte, Vitamin E (Stand Ableitung 2024)', url: 'https://www.dge.de/wissenschaft/referenzwerte/vitamin-e/' },
    DGE_VITK: { titre: 'DGE/ÖGE, Referenzwerte, Vitamin K (Stand Ableitung 2000)', url: 'https://www.dge.de/wissenschaft/referenzwerte/vitamin-k/' },
    DGE_B1: { titre: 'DGE/ÖGE, Referenzwerte, Thiamin (Stand Ableitung 2015)', url: 'https://www.dge.de/wissenschaft/referenzwerte/thiamin/' },
    DGE_B2: { titre: 'DGE/ÖGE, Referenzwerte, Riboflavin (Stand Ableitung 2015)', url: 'https://www.dge.de/wissenschaft/referenzwerte/riboflavin/' },
    DGE_B3: { titre: 'DGE/ÖGE, Referenzwerte, Niacin (Stand Ableitung 2015)', url: 'https://www.dge.de/wissenschaft/referenzwerte/niacin/' },
    DGE_B5: { titre: 'DGE/ÖGE, Referenzwerte, Pantothensäure (Stand Ableitung 2021)', url: 'https://www.dge.de/wissenschaft/referenzwerte/pantothensaeure/' },
    DGE_B6: { titre: 'DGE/ÖGE, Referenzwerte, Vitamin B6 (Stand Ableitung 2019)', url: 'https://www.dge.de/wissenschaft/referenzwerte/vitamin-b6/' },
    DGE_B9: { titre: 'DGE/ÖGE, Referenzwerte, Folat (Stand Ableitung 2015)', url: 'https://www.dge.de/wissenschaft/referenzwerte/folat/' },
    DGE_B12: { titre: 'DGE/ÖGE, Referenzwerte, Vitamin B12 (Stand Ableitung 2018)', url: 'https://www.dge.de/wissenschaft/referenzwerte/vitamin-b12/' },
    DGE_CA: { titre: 'DGE/ÖGE, Referenzwerte, Calcium (Stand Ableitung 2013)', url: 'https://www.dge.de/wissenschaft/referenzwerte/calcium/' },
    DGE_FE: { titre: 'DGE/ÖGE, Referenzwerte, Eisen (Stand Ableitung 2023)', url: 'https://www.dge.de/wissenschaft/referenzwerte/eisen/' },
    DGE_MG: { titre: 'DGE/ÖGE, Referenzwerte, Magnesium (Stand Ableitung 2021)', url: 'https://www.dge.de/wissenschaft/referenzwerte/magnesium/' },
    DGE_ZN: { titre: 'DGE/ÖGE, Referenzwerte, Zink (Stand Ableitung 2019)', url: 'https://www.dge.de/wissenschaft/referenzwerte/zink/' },
    DGE_K: { titre: 'DGE/ÖGE, Referenzwerte, Kalium (Stand Ableitung 2016)', url: 'https://www.dge.de/wissenschaft/referenzwerte/kalium/' },
    DGE_SE: { titre: 'DGE/ÖGE, Referenzwerte, Selen (Stand Ableitung 2015)', url: 'https://www.dge.de/wissenschaft/referenzwerte/selen/' },
    DGE_I: { titre: 'DGE/ÖGE, Referenzwerte, Jod (Stand Ableitung 2025)', url: 'https://www.dge.de/wissenschaft/referenzwerte/jod/' },
    DGE_CU_MN: { titre: 'DGE/ÖGE, Referenzwerte, Kupfer, Mangan, Chrom, Molybdän (Stand Ableitung 2000)', url: 'https://www.dge.de/wissenschaft/referenzwerte/kupfer-mangan-chrom-molybdaen/' },
    DGE_NA: { titre: 'DGE/ÖGE, Referenzwerte, Natrium (Stand Ableitung 2016)', url: 'https://www.dge.de/wissenschaft/referenzwerte/natrium/' },
    DGE_P: { titre: 'DGE/ÖGE, Referenzwerte, Protein (Stand Ableitung 2017)', url: 'https://www.dge.de/wissenschaft/referenzwerte/protein/' },
    DGE_KH: { titre: 'DGE/ÖGE, Referenzwerte, Kohlenhydrate (Stand Ableitung 2000)', url: 'https://www.dge.de/wissenschaft/referenzwerte/kohlenhydrate/' },
    DGE_FETT: { titre: 'DGE/ÖGE, Referenzwerte, Fett, essenzielle Fettsäuren (Stand Ableitung 2000)', url: 'https://www.dge.de/wissenschaft/referenzwerte/fett-essenzielle-fettsaeuren/' },
    DGE_FIB: { titre: 'DGE/ÖGE, Referenzwerte, Ballaststoffe (Stand Ableitung 2021)', url: 'https://www.dge.de/wissenschaft/referenzwerte/ballaststoffe/' },
    DGE_EAU: { titre: 'DGE/ÖGE, Referenzwerte, Wasser (Stand Ableitung 2000)', url: 'https://www.dge.de/wissenschaft/referenzwerte/wasser/' },
    DGE_EDITION: { titre: 'DGE/ÖGE, Referenzwerte für die Nährstoffzufuhr, 3e édition, 1re livraison 2025 (classeur), erratum à mai 2026 ; note « Erläuterungen zur 3. Auflage »', url: 'https://www.dge.de/fileadmin/dok/wissenschaft/referenzwerte/DGE_Referenzwerte_Erlaeuterungen_zur_3._Auflage_2025.pdf' },
    BLV_2022: { titre: 'OSAV (BLV), Dietary Reference Values for Switzerland, version de juin 2022, fichier nutrient-requirements-ch-2022.xlsx (mis en ligne le 29.10.2024 ; liste des publications datée du 10.02.2026)', url: 'https://www.blv.admin.ch/fr/valeurs-nutritionnelles' },
    BLV_EVOLUTION: { titre: 'OSAV, Évolution des valeurs nutritionnelles de référence suisses (dernière entrée 06.10.2025)', url: 'https://www.blv.admin.ch/dam/fr/sd-web/9q55cISsVm-e/entwicklung-schweizerischen-referenzwerte-n%C3%A4hrstoffzufuhr-de-fr-it.pdf' },
    CFN_2021: { titre: 'Commission fédérale de la nutrition (CFN), prise de position sur le projet Nutritional Reference Values for Switzerland, 7.12.2021', url: 'https://www.edi.admin.ch/dam/fr/sd-web/PZJ5Y3s871r9/stellungnahme-eek-ernaehrungsreferenzwerte-fr.pdf' },
    OMS_FICHE_2026: { titre: 'OMS, Healthy diet, fiche d information (date affichée : 26 janvier 2026)', url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
    OMS_SUCRES_2015: { titre: 'OMS, Guideline: sugars intake for adults and children, 4 mars 2015, ISBN 978-92-4-154902-8', url: 'https://www.who.int/publications/i/item/9789241549028' },
    OMS_NA_2012: { titre: 'OMS, Guideline: sodium intake for adults and children, 2012, ISBN 978-92-4-150483-6', url: 'https://www.who.int/publications/i/item/9789241504836' },
    OMS_AGS_2023: { titre: 'OMS, Saturated fatty acid and trans-fatty acid intake for adults and children: WHO guideline, 17 juillet 2023, ISBN 978-92-4-007363-0', url: 'https://www.who.int/publications/i/item/9789240073630' }
  }
};
