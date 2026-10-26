'use strict';
/* KalMydas PERSO : modèle de réserve des nutriments (estimation de couverture alimentaire).
   Construit le 2026-10-23. Données pures : aucune fonction. Le calcul est dans _donnees/GLUE_RESERVES.md.
   Méthode, citations exactes et formules : _donnees/RESERVES.md. Références complètes : _donnees/RESERVES_SOURCES.md.

   CE QUE CE FICHIER N EST PAS
   Il ne mesure pas l état du corps. Seule une prise de sang (ou un examen) le fait. Il donne une ESTIMATION faite
   uniquement à partir des repas notés : « d après ce que tu as noté, tu as de l avance pour environ N jours ».

   UNITÉ DU MODÈLE
   La réserve se compte en JOURS DE BESOIN : 1 jour = le repère du jour (data/drv.js, selon le profil).
   x = apport du jour / repère. Un jour à 100 % (x = 1) ne remplit ni ne vide la réserve.

   CHAMPS (un bloc par clé de l app : js/foods.js MICROS, MACROS, et 'eau', 'epadha')
   type        'quotidien' : pas de réserve utile, le besoin se renouvelle chaque jour (plafond 0 à 3 jours).
               'courte'    : réserve de quelques jours à quelques semaines (plafond 7 à 30 jours).
               'longue'    : réserve de plusieurs mois ou plus (plafond 90 jours et plus).
               'os'        : le corps puise dans le squelette ; ce n est pas une réserve à vider (calcium).
   fenetre     nombre de jours (hier compris, aujourd hui exclu) de la moyenne glissante. CHOIX DE CONCEPTION.
   plafond     réserve maximale, en jours de besoin. Un nombre, ou { m, f } quand il dépend du sexe.
   gainMax     au plus combien de jours de réserve un seul jour d excès peut ajouter. CHOIX DE CONCEPTION :
               1 par défaut (l excès n est pas toujours absorbé ni gardé) ; 7 pour les réserves longues où une prise
               par semaine est une pratique reconnue (vitamines A, D, E, B12, EPA et DHA).
   pertePubliee  ce que la littérature publie sur la vitesse de perte (fraction par jour, demi-vie). Pour information
               et pour la page des sources. Le calcul de l app reste linéaire en jours de besoin (voir RESERVES.md 4).
   reserveCorps  ordre de grandeur publié de ce que contient le corps.
   delaiCarence  ce qui est publié sur le temps avant les premiers signes quand l apport est nul ou très bas.
   plafond_origine  'source' si le plafond est lu ou calculé directement depuis une source citée ;
               'conception' si c est un choix prudent fait faute de valeur publiée (la raison est dans .note).
   preuve      'forte', 'moyenne' ou 'faible' : qualité de ce qui fonde le plafond.
   inconnu     ce qui n est PAS connu.
   interactions  ce qui change la couverture réelle (absorption, pertes), sans calcul dans l app sauf mention.
   src         identifiants de RESERVES.sources avec la page (p.) ou la ligne lue.
   Lecture de toutes les sources : 2026-10-23. Aucun tiret cadratin dans ce fichier. */

const RESERVES = {
  version: '2026-10-23',
  lu_le: '2026-10-23',
  unite: 'jours de besoin (1 jour = repère du jour de data/drv.js)',

  // Règles communes, toutes CHOIX DE CONCEPTION sauf mention (justification dans RESERVES.md, section 4)
  regles: {
    departParDefaut: 'vide',      // réserve à 0 au premier jour noté : on ne sait rien d avant le suivi
    departOptions: ['vide', 'plein'], // 'plein' seulement si la personne le choisit (ex. prise de sang récente normale)
    jourNonNote: 'moyenne',       // jour sans aucun repas noté : on suppose la moyenne des jours notés de la fenêtre
    poidsTendance: 0.5,           // poids de la moyenne glissante dans l urgence (voir urgence())
    fenetreTendance: 7,           // l urgence regarde au plus les 7 derniers jours (hier compris)
    efficaciteExces: 1,           // part d un excès comptée dans la réserve, avant le plafond gainMax
    texteAvertissement: 'Estimation faite avec tes repas notés. Ce n est pas une mesure de ton corps : seule une prise de sang le dit.'
  },

  nutriments: {

    /* ---------- VITAMINES ---------- */

    vA: {
      nom: 'Vitamine A', type: 'longue', fenetre: 30, plafond: 120, plafond_origine: 'source', gainMax: 7, preuve: 'moyenne',
      pertePubliee: { fractionJour: 0.007, texte: 'EFSA prend 0,7 % par jour des réserves du corps (calcul factoriel). Mesures : 0,5 % par jour (0,3 à 0,9), demi-vie du rétinol du foie 154 jours (75 à 241) ; d autres études donnent 1,6 à 2,3 %.' },
      reserveCorps: 'Surtout le foie (70 à 90 % du rétinol du corps). Réserve totale mesurée de 315 à 879 mg chez 8 hommes (Sauberlich 1974).',
      delaiCarence: 'Un foie à 20 µg de rétinol par gramme (seuil d un statut correct) protège un adulte sans vitamine A « pendant environ quatre mois » (Olson 1987, repris par EFSA).',
      note: 'Plafond 120 jours = les quatre mois publiés au seuil du statut correct. Beaucoup de gens ont plus (médiane du foie 198 à 506 µg/g dans deux séries d autopsies), mais l app ne peut pas le savoir : elle prend le seuil.',
      inconnu: 'La réserve de départ de chacun. La part du bêta-carotène qui devient vitamine A varie beaucoup (absorption de 5 à 65 %).',
      interactions: 'Le bêta-carotène est mal et inégalement absorbé ; l infection fait baisser le rétinol du sang sans baisse de la réserve.',
      src: ['EFSA_VA_2015:p.1, p.2, p.15, p.18, p.19, p.22', 'ODS_VITA']
    },

    vC: {
      nom: 'Vitamine C', type: 'courte', fenetre: 7, plafond: 30, plafond_origine: 'source', gainMax: 1, preuve: 'forte',
      pertePubliee: { fractionJour: 0.03, texte: 'Pertes du stock d environ 3 % par jour (2,2 à 4,1 % selon les sujets), soit 40 à 50 mg par jour quand le stock est d environ 1,5 g.' },
      reserveCorps: 'De moins de 0,3 g à 1,5 ou 2,0 g chez l homme adulte selon l apport ; environ 1,5 g à une vitamine C du sang de 50 µmol/L.',
      delaiCarence: 'Scorbut sous 300 mg de stock. NIH : les signes peuvent apparaître « en 1 mois » avec moins d environ 10 mg par jour.',
      note: 'Plafond 30 jours = le délai d un mois du NIH (le plus court publié). Le calcul avec 3 % de perte par jour depuis 1,5 g jusqu à 0,3 g donnerait environ 54 jours : on garde le plus prudent. Au-dessus d environ 100 mg par jour, l excès part dans les urines : un gros jour ne compte que pour un jour de plus (gainMax 1).',
      inconnu: 'Peu de données sur le renouvellement du stock chez la femme ; EFSA le dit elle-même.',
      interactions: 'Le tabac augmente les pertes (50 à 114 mg par jour chez des fumeurs contre 14 à 48 mg chez des non-fumeurs). La vitamine C aide l absorption du fer non héminique du même repas.',
      src: ['EFSA_VC_2013:p.2, p.9, p.13, p.14, p.25, p.30, p.33', 'ODS_VITC']
    },

    vD: {
      nom: 'Vitamine D', type: 'courte', fenetre: 30, plafond: 30, plafond_origine: 'conception', gainMax: 7, preuve: 'moyenne',
      pertePubliee: { demiVieJours: [13, 15], texte: '25-hydroxyvitamine D du sang : demi-vie moyenne de 13 à 15 jours (EFSA) ; 13,9 jours pour la D2 et 15,1 jours pour la D3 (Jones 2014) ; 15 jours (NIH).' },
      reserveCorps: 'Stockage long surtout dans le tissu gras, aussi le muscle et le foie. Quantité non publiée dans les textes lus.',
      delaiCarence: 'Non publié pour un apport nul sans soleil dans les textes lus. La vitamine D fabriquée en été sert en partie l hiver (EFSA).',
      note: 'Plafond 30 jours = environ deux demi-vies de la forme du sang (choix prudent). Une prise par semaine compte pour la semaine (gainMax 7). Le soleil n est pas mesuré : en été la peau peut fournir l essentiel, en hiver (octobre à avril à Berlin ou Amsterdam) presque rien. Les repères EFSA supposent peu ou pas de soleil.',
      inconnu: 'La quantité gardée dans le tissu gras, la part du soleil pour chacun.',
      interactions: 'Soleil, saison, latitude, peau, âge. Le surpoids garde une partie de la vitamine D dans le tissu gras.',
      src: ['EFSA_VD_2016:p.3, p.11, p.12, p.13, p.17, p.22, p.27', 'JONES_2014', 'ODS_VITD']
    },

    vE: {
      nom: 'Vitamine E', type: 'longue', fenetre: 30, plafond: 90, plafond_origine: 'conception', gainMax: 7, preuve: 'faible',
      pertePubliee: { demiVieJours: [44, 96], texte: 'Demi-vie d une dose marquée : 44 jours dans le sang, 96 jours dans les globules rouges, avec de grandes différences entre personnes.' },
      reserveCorps: 'Environ 11 g d alpha-tocophérol dans le corps (modèle de Novotny 2012), dont 90 à 99 % dans le tissu gras, qui n en rend presque pas au sang.',
      delaiCarence: 'Avec environ 3 mg par jour, signes biologiques (globules rouges fragiles) après plusieurs mois ; vers 80 % après environ 28 mois (Horwitt).',
      note: 'Plafond 90 jours = environ deux demi-vies du sang (choix prudent). La grosse réserve du tissu gras ne compte pas : elle ne repart presque pas vers le sang.',
      inconnu: 'Le lien entre apport et besoin : EFSA n a pas pu fixer de besoin moyen (repère = apport observé).',
      interactions: 'Plus d acides gras polyinsaturés demande plus de vitamine E (EFSA ne lie pas son repère à ces graisses).',
      src: ['EFSA_VE_2015:p.12, p.13, p.18, p.30']
    },

    vK: {
      nom: 'Vitamine K', type: 'courte', fenetre: 7, plafond: 7, plafond_origine: 'conception', gainMax: 1, preuve: 'moyenne',
      pertePubliee: { texte: 'Renouvellement rapide : temps de renouvellement moyen de 36 à 40 heures (Olson 2002).' },
      reserveCorps: 'Surtout le foie, aussi les os ; quantité très variable, renouvelée vite.',
      delaiCarence: 'Les signes et le trouble de la coagulation peuvent mettre « plus de 2 à 3 semaines » à apparaître sous 10 µg par jour (EFSA).',
      note: 'Plafond 7 jours, bien sous les 2 à 3 semaines publiées : choix prudent.',
      inconnu: 'La part des ménaquinones (K2) faites par l intestin.',
      interactions: 'Médicaments anticoagulants de type antivitamine K : avis médical, jamais l app.',
      src: ['EFSA_VK_2017:sections 2.3.4, 2.3.6, 2.4.1 (texte intégral PMC7010012)']
    },

    b1: {
      nom: 'B1 thiamine', type: 'courte', fenetre: 7, plafond: 14, plafond_origine: 'source', gainMax: 1, preuve: 'moyenne',
      pertePubliee: { demiVieJours: [9, 18], texte: 'Demi-vie biologique de 9 à 18 jours.' },
      reserveCorps: 'Environ 25 à 30 mg dans le corps adulte (muscles, coeur, cerveau, foie, reins). NIH : stockée « en très petite quantité ».',
      delaiCarence: 'Thiamine absente des urines après 18 jours d apport quasi nul ; signes chez 5 sujets sur 8 pendant 30 jours ; signes après 2 à 8 semaines à 0,05 mg par MJ.',
      note: 'Plafond 14 jours = le bas de la plage de 2 à 8 semaines, sous les 18 jours où l urine ne contient plus de thiamine.',
      inconnu: 'Le délai exact pour une personne donnée.',
      interactions: 'L alcool réduit l absorption et la réserve du foie (NIH). Le besoin suit la dépense d énergie (EFSA : par MJ).',
      src: ['EFSA_B1_2016:p.11, p.14, p.16, p.18, p.23', 'ODS_THIAMIN']
    },

    b2: {
      nom: 'B2 riboflavine', type: 'courte', fenetre: 7, plafond: 7, plafond_origine: 'conception', gainMax: 1, preuve: 'faible',
      pertePubliee: { texte: 'Non publiée sous forme de taux. Quand il y a trop, « peu est stocké » et le reste part dans les urines.' },
      reserveCorps: 'Petites quantités dans le foie, le coeur et les reins (NIH).',
      delaiCarence: 'Avec 0,5 mg par jour, la riboflavine des globules rouges baisse nettement en 45 jours (Bessey 1956). Délai pour un apport nul : non publié dans les textes lus.',
      note: 'Plafond 7 jours : choix prudent, car peu est stocké.',
      inconnu: 'Le délai avant les signes pour un apport nul.',
      interactions: 'La lumière détruit la riboflavine des aliments (NIH).',
      src: ['EFSA_B2_2017:sections 2.3.4 et 2.4 (texte intégral PMC7010026)', 'ODS_RIBOFLAVIN']
    },

    b3: {
      nom: 'B3 niacine', type: 'courte', fenetre: 7, plafond: 30, plafond_origine: 'source', gainMax: 1, preuve: 'moyenne',
      pertePubliee: { texte: 'Non publiée sous forme de taux.' },
      reserveCorps: 'Non publiée. Aucun test ne mesure la réserve totale (NIH).',
      delaiCarence: 'Pellagre chez des sujets sous environ 1 mg NE par MJ pendant plus de 50 jours ; à 6 ou 10 mg NE par jour pendant 35 jours, baisse des marqueurs urinaires sans pellagre.',
      note: 'Plafond 30 jours, sous les 35 jours sans signe et les 50 jours avant la pellagre. Le tryptophane des protéines fait aussi de la niacine (60 mg = 1 mg NE) : si l app ne compte que la niacine des tables, la couverture réelle est plus haute.',
      inconnu: 'La réserve en mg.',
      interactions: 'Le corps fabrique de la niacine avec le tryptophane, avec l aide des vitamines B6 et B2 et du fer.',
      src: ['EFSA_B3_2014:p.10, p.11, p.20, p.21', 'ODS_NIACIN']
    },

    b5: {
      nom: 'B5 pantothénique', type: 'quotidien', fenetre: 7, plafond: 3, plafond_origine: 'conception', gainMax: 1, preuve: 'faible',
      pertePubliee: { texte: 'Non publiée.' },
      reserveCorps: 'Non publiée.',
      delaiCarence: 'Carence rare, présente dans presque tous les aliments. Après 9 semaines sans B5, l excrétion urinaire baisse de 3,05 à 0,79 mg par jour (Fry 1976).',
      note: 'Plafond 3 jours : choix prudent faute de données.',
      inconnu: 'Tout ce qui concerne une réserve : EFSA n a trouvé aucun marqueur utilisable.',
      interactions: 'Aucune retenue.',
      src: ['EFSA_B5_2014:p.1, p.7, p.8', 'ODS_B5']
    },

    b6: {
      nom: 'B6', type: 'courte', fenetre: 7, plafond: 7, plafond_origine: 'source', gainMax: 1, preuve: 'moyenne',
      pertePubliee: { texte: 'Le stock du sang se renouvelle vite et se stabilise en 7 jours (1 à 2 semaines, preuve jugée faible par EFSA).' },
      reserveCorps: 'Environ 1 000 µmol pour 70 kg, 75 à 80 % dans le muscle, liée à une enzyme du glycogène : EFSA dit que ce n est pas une réserve qui couvre les besoins.',
      delaiCarence: 'Après 20 jours à environ 0,1 à 0,17 mg par jour, la B6 du sang tombe de 33 à 42 vers 7,5 à 14 nmol/L.',
      note: 'Plafond 7 jours = le temps publié pour que le stock du sang se stabilise.',
      inconnu: 'Le délai avant les signes cliniques.',
      interactions: 'Plus de protéines demande plus de B6. Le son de blé baisse la B6 du sang.',
      src: ['EFSA_B6_2016:p.3, p.9, p.11, p.13, p.15, p.16']
    },

    b9: {
      nom: 'B9 folates', type: 'courte', fenetre: 14, plafond: 30, plafond_origine: 'conception', gainMax: 1, preuve: 'moyenne',
      pertePubliee: { fractionJour: 0.01, texte: 'Renouvellement du corps entier estimé à 1 % des stocks (Stites 1997, cité par EFSA). Petit stock du sang : demi-vie de quelques heures ; gros stocks des tissus : demi-vie de plusieurs mois.' },
      reserveCorps: '22 à 100 mg selon les estimations (EFSA) ; 15 à 30 mg dont la moitié dans le foie (NIH).',
      delaiCarence: 'Les folates du sang baissent d abord, puis les stocks ; les globules rouges vivent 120 jours, donc les signes du sang mettent « plusieurs semaines ».',
      note: 'Plafond 30 jours : choix prudent, très en dessous du calcul avec 1 % par jour (environ 69 jours pour perdre la moitié) parce que les folates du sang baissent avant les stocks.',
      inconnu: 'La taille exacte du stock (estimations de 15 à 100 mg).',
      interactions: 'L acide folique ajouté compte 1,7 fois (DFE). L alcool fait baisser les folates du sang (NIH). Le manque de B12 piège les folates.',
      src: ['EFSA_B9_2014:p.2, p.10, p.11, p.13, p.16', 'ODS_FOLATE']
    },

    b12: {
      nom: 'B12', type: 'longue', fenetre: 30, plafond: 365, plafond_origine: 'conception', gainMax: 7, preuve: 'forte',
      pertePubliee: { fractionJour: 0.0013, texte: 'Pertes de 0,1 à 0,2 % du stock par jour, quelle que soit sa taille ; moyenne 0,13 % (0,10 à 0,15) sur 52 sujets.' },
      reserveCorps: '2 à 3 mg chez l adulte en bonne santé (1 à 6 mg), environ la moitié dans le foie (EFSA) ; 1 à 5 mg, soit 1 000 à 2 000 fois l apport d un jour (NIH).',
      delaiCarence: 'La carence peut mettre des années à apparaître, même sans aucun apport (EFSA, NIH). Plus vite quand l absorption ne marche pas (facteur intrinsèque absent).',
      note: 'Plafond 365 jours : choix prudent. Avec 0,13 % de perte par jour, passer de 2,5 mg à 1 mg prendrait environ 700 jours. On garde un an parce que la B12 du sang baisse avant le stock du foie et que le stock de départ varie de 1 à 6 mg.',
      inconnu: 'Le stock de départ de chacun ; la part réellement absorbée (40 % retenu par EFSA, très variable).',
      interactions: 'Âge : gastrite atrophique chez 8 à 9 % des 65 ans et plus (NIH) ; médicaments contre l acidité, metformine. Véganes : aucune source sûre sans aliment enrichi ou complément. Absorption des compléments : environ 50 % sous 1 à 2 µg, environ 2 % à 500 µg (NIH).',
      src: ['EFSA_B12_2015:p.2, p.10, p.11, p.13, p.14, p.17', 'ODS_B12']
    },

    cho: {
      nom: 'Choline', alias_drv: 'choline', type: 'courte', fenetre: 7, plafond: 14, plafond_origine: 'conception', gainMax: 1, preuve: 'faible',
      pertePubliee: { texte: 'Non publiée.' },
      reserveCorps: 'Non publiée. Le foie en fabrique (voie PEMT), mais pas toujours assez.',
      delaiCarence: 'Sous 50 mg par jour pendant jusqu à 42 jours, 39 adultes sur 57 ont eu des signes (foie gras, muscle) ; 80 % des femmes ménopausées, 44 % des femmes non ménopausées.',
      note: 'Plafond 14 jours : choix prudent, le jour exact d apparition n est pas publié dans le texte lu.',
      inconnu: 'Si les autres auraient eu des signes au-delà de 6 semaines (EFSA le dit).',
      interactions: 'Les oestrogènes aident la fabrication par le foie ; gènes PEMT et MTHFD1.',
      src: ['EFSA_CHO_2016:p.3, p.9, p.11, p.27, p.28, p.29', 'ODS_CHOLINE']
    },

    /* ---------- MINÉRAUX ---------- */

    ca: {
      nom: 'Calcium', type: 'os', fenetre: 7, plafond: 0, plafond_origine: 'conception', gainMax: 0, preuve: 'forte',
      pertePubliee: { texte: 'Pertes de la peau et de la sueur : 40 mg par jour (EFSA). Équilibre à 715 mg par jour d apport (urine et selles).' },
      reserveCorps: 'Environ 1 000 g, dont 99 % dans le squelette.',
      delaiCarence: 'Quand l apport manque, le corps prend le calcium des os : perte de masse osseuse, sans signe ressenti.',
      note: 'Plafond 0 : on ne crédite aucune réserve, car vider les os est justement le dommage. Fenêtre 7 jours : l absorption s adapte, il faut au moins une semaine pour mesurer un équilibre (EFSA).',
      inconnu: 'La masse osseuse de chacun (seul un examen la mesure).',
      interactions: 'Absorption 64 % pour 15 mg mais 28 % pour 500 mg en une prise : mieux vaut étaler. Vitamine D. Le calcium réduit l absorption du fer d un même repas.',
      src: ['EFSA_CA_2015:p.1, p.2, p.8, p.9, p.11', 'ODS_CALCIUM']
    },

    fe: {
      nom: 'Fer', type: 'longue', fenetre: 30, plafond: { m: 120, f: 90 }, plafond_origine: 'source', gainMax: 1, preuve: 'moyenne',
      pertePubliee: { texte: 'Pertes obligatoires médianes : 0,95 mg par jour (homme), 1,34 mg par jour (femme non ménopausée). Absorption retenue : 16 % (homme), 18 % (femme).' },
      reserveCorps: 'Fer du corps : 3,8 g (homme), 2,3 g (femme). Ferritine et hémosidérine : environ 1,0 g, très variable. À une ferritine de 30 µg/L, environ 120 mg de fer stocké peuvent être mobilisés.',
      delaiCarence: 'Quand l apport manque, le corps prend dans le stock ; la carence vient quand le stock est vide.',
      note: 'Plafond calculé avec les chiffres EFSA : 120 mg mobilisables à ferritine 30 divisés par les pertes médianes. Homme 120 / 0,95 = 126 jours, arrondi à 120 ; femme 120 / 1,34 = 90 jours. Après la ménopause, EFSA donne au fer les repères de l homme : l app peut prendre le plafond « m ».',
      inconnu: 'La ferritine de chacun : beaucoup de femmes ont un stock plus bas que 30 µg/L, d autres beaucoup plus haut.',
      interactions: 'Fer héminique (viande, poisson) absorbé à environ 25 %. Aident : vitamine C, viande. Freinent : phytates (céréales complètes, légumineuses), polyphénols (thé, café), calcium (165 mg réduisent d environ 50 % l absorption d un repas de pain). Sur la durée, l effet de la vitamine C et du calcium est plus faible que sur un seul repas (EFSA).',
      src: ['EFSA_FE_2015:p.2, p.3, p.4, p.14, p.15, p.19', 'ODS_IRON']
    },

    mg: {
      nom: 'Magnésium', type: 'courte', fenetre: 7, plafond: 7, plafond_origine: 'conception', gainMax: 1, preuve: 'faible',
      pertePubliee: { texte: 'Pertes de base (urine et selles) d environ 20 mg par jour à apport nul. Sueur : 1 à 5 mg par jour en activité modérée sans chaleur ; plus en effort intense ou au chaud.' },
      reserveCorps: '20 à 28 g, environ 60 % dans les os, 25 % dans le muscle ; environ 25 % échangeable vite.',
      delaiCarence: 'Non publié pour un apport nul. Le rein limite les pertes quand l apport baisse : la carence par l alimentation seule est rare chez une personne en bonne santé (NIH).',
      note: 'Plafond 7 jours : choix prudent faute de délai publié.',
      inconnu: 'Le délai avant les signes ; aucun marqueur sanguin ne suit bien l apport.',
      interactions: 'Sueur abondante, alcool, diabète de type 2 et certains médicaments augmentent les pertes.',
      src: ['EFSA_MG_2015:p.2, p.9, p.10, p.11, p.12', 'ODS_MAGNESIUM']
    },

    zn: {
      nom: 'Zinc', type: 'quotidien', fenetre: 7, plafond: 3, plafond_origine: 'conception', gainMax: 1, preuve: 'moyenne',
      pertePubliee: { texte: 'Urine 0,5 mg par jour (homme), 0,3 mg (femme) ; peau et sueur environ 0,5 mg par jour (homme).' },
      reserveCorps: '2,5 g (homme), 1,5 g (femme), 85 % dans le muscle et les os. « Le zinc n a pas de lieu de stockage principal connu » ; le foie garde un petit stock à court terme.',
      delaiCarence: 'Non publié pour un apport nul dans le texte lu. Le stock échangeable se renouvelle avec le sang en environ 2 jours.',
      note: 'Plafond 3 jours : choix prudent fondé sur l absence de stock et le renouvellement en 2 jours.',
      inconnu: 'Le délai avant les signes.',
      interactions: 'Les phytates baissent l absorption : le repère EFSA dépend des phytates du jour (data/drv.js, parPhytate). Avec peu de phytates et peu de zinc, l absorption peut dépasser 60 %.',
      src: ['EFSA_ZN_2014:p.1, p.2, p.10, p.11', 'ODS_ZINC']
    },

    k: {
      nom: 'Potassium', type: 'quotidien', fenetre: 7, plafond: 0, plafond_origine: 'conception', gainMax: 0, preuve: 'moyenne',
      pertePubliee: { texte: 'Le rein en rejette au moins 5 mmol (environ 195 mg) par jour (NIH). Sueur : 3 à 7 mmol par litre (117 à 273 mg).' },
      reserveCorps: '110 à 150 g pour 70 kg, à 98 % dans les cellules ; mais le stock total ne bouge presque pas avec l apport.',
      delaiCarence: 'Le manque par l alimentation seule est rare ; il vient surtout de pertes (diarrhée, vomissements, certains diurétiques).',
      note: 'Plafond 0 : le repère EFSA vise la tension et le risque d accident vasculaire, un effet de l apport habituel, pas une réserve. On regarde la moyenne sur 7 jours.',
      inconnu: 'Aucun marqueur de besoin (EFSA).',
      interactions: 'Plusieurs litres de sueur peuvent faire perdre 10 à 25 mmol (390 à 980 mg) par jour.',
      src: ['EFSA_K_2016:p.3, p.9, p.10, p.11, section 2.3.5.3', 'ODS_POTASSIUM']
    },

    se: {
      nom: 'Sélénium', type: 'courte', fenetre: 30, plafond: 30, plafond_origine: 'conception', gainMax: 1, preuve: 'faible',
      pertePubliee: { texte: 'Non publiée sous forme de taux. Le rein règle l équilibre (NIH).' },
      reserveCorps: '5 à 20 mg selon les pays (sol pauvre ou riche), 30 à 50 % dans le muscle. La sélénométhionine entre dans les protéines du corps, « ce qui permet de stocker le sélénium ».',
      delaiCarence: 'Non publié. Les signes cliniques sont mal définis ; la maladie de Keshan touche des régions de Chine à environ 15 µg par jour.',
      note: 'Plafond 30 jours : choix prudent. Le calcul brut (5 à 20 mg divisés par 70 µg) donnerait 70 à 285 jours, mais ce stock n est pas entièrement utilisable et aucun délai n est publié.',
      inconnu: 'La part du stock utilisable et le délai avant les signes.',
      interactions: 'Le sol de la région fait varier la teneur des aliments.',
      src: ['EFSA_SE_2014:p.2, p.12, p.13, p.14', 'ODS_SELENIUM']
    },

    i: {
      nom: 'Iode', type: 'courte', fenetre: 30, plafond: 30, plafond_origine: 'conception', gainMax: 1, preuve: 'moyenne',
      pertePubliee: { texte: 'Plus de 90 % de l apport repart dans les urines à l équilibre. Sueur : 25 à 47 µg par litre ; un match de football d une heure fait perdre environ 50 µg.' },
      reserveCorps: '10 à 20 mg dans le corps, 70 à 80 % dans la thyroïde (8 à 15 mg en moyenne) (EFSA) ; 15 à 20 mg (NIH). Thyroïde normale de 0,9 à 20,2 mg.',
      delaiCarence: 'Non publié dans les textes lus pour un apport nul. La thyroïde change sa capture en 12 à 14 semaines ; EFSA parle de « grandes réserves » quand le statut est bon.',
      note: 'Plafond 30 jours : choix prudent. Le calcul brut (10 mg divisés par 150 µg) donnerait environ 65 jours, mais la thyroïde n est pas un stock qu on vide sans dommage.',
      inconnu: 'Le délai avant les signes ; le stock de chacun.',
      interactions: 'Sueur abondante et répétée : « peut conduire, à la longue, à vider les réserves d iode ». Sel iodé ou non. Substances goitrogènes, tabac.',
      src: ['EFSA_I_2014:p.1, p.2, p.3, p.11, section 2.3.6.3', 'ODS_IODINE']
    },

    cu: {
      nom: 'Cuivre', type: 'courte', fenetre: 14, plafond: 14, plafond_origine: 'conception', gainMax: 1, preuve: 'faible',
      pertePubliee: { texte: 'Non publiée sous forme de taux. L excès part dans la bile sans être repris.' },
      reserveCorps: '50 à 120 mg dans le corps, « seulement de petites quantités » stockées (NIH) ; surtout dans le foie (EFSA).',
      delaiCarence: 'Non publié. Carence clinique rare, surtout liée à des maladies génétiques.',
      note: 'Plafond 14 jours : choix prudent.',
      inconnu: 'Le délai avant les signes.',
      interactions: 'Le zinc à forte dose gêne le cuivre (base de la limite haute du zinc).',
      src: ['EFSA_CU_2015:p.2, p.9, p.12, section 2.3.4', 'ODS_COPPER']
    },

    mn: {
      nom: 'Manganèse', type: 'courte', fenetre: 14, plafond: 14, plafond_origine: 'source', gainMax: 1, preuve: 'faible',
      pertePubliee: { demiVieJours: [13, 37], texte: 'Demi-vie de 13 à 37 jours, plus longue chez l homme, plus courte quand l apport est haut.' },
      reserveCorps: 'Non publiée dans les textes lus. Plus de 90 % du manganèse absorbé repart par la bile (NIH).',
      delaiCarence: 'Aucun syndrome de carence décrit chez l homme ; à 0,11 mg par jour pendant 39 jours, une dermatite passagère chez 5 sujets sur 7.',
      note: 'Plafond 14 jours = environ le bas de la demi-vie publiée.',
      inconnu: 'La réserve en mg et le délai avant les signes.',
      interactions: 'Le fer du corps change l absorption du manganèse. Le thé en apporte beaucoup.',
      src: ['EFSA_MN_2013:p.2, p.7, p.9, p.10', 'ODS_MANGANESE']
    },

    /* ---------- ACIDES GRAS, EAU, FIBRES, PROTÉINES ---------- */

    epadha: {
      nom: 'EPA + DHA (oméga-3 marins)', type: 'courte', fenetre: 7, plafond: 7, plafond_origine: 'source', gainMax: 7, preuve: 'moyenne',
      pertePubliee: { texte: 'Pas un taux de perte : vitesse d entrée dans les tissus. Maximum en 1 à 2 semaines (plasma), 3 à 4 semaines et 1 à 2 mois (plaquettes), 6 à 9 mois (cellules du sang), plus de 12 mois (tissu gras).' },
      reserveCorps: 'Membranes et tissu gras ; le tissu gras rend des acides gras essentiels quand l énergie manque (NIH).',
      delaiCarence: 'Non publié pour un adulte en bonne santé.',
      note: 'Repère EFSA 250 mg par jour, que EFSA traduit par 1 à 2 repas de poisson gras par semaine : un repas de poisson compte donc pour la semaine (plafond 7, gainMax 7). La valeur 7 jours vient de ce conseil.',
      inconnu: 'Le besoin moyen : EFSA n a pas pu le fixer (repère pour le coeur).',
      interactions: 'L ALA végétal donne peu d EPA (8 à 12 %) et très peu de DHA (moins de 1 %).',
      src: ['EFSA_FAT_2010:p.4, p.15', 'BROWNING_2012', 'ODS_OMEGA3']
    },

    o3: {
      nom: 'Oméga-3 total (ALA + EPA + DHA)', type: 'quotidien', fenetre: 7, plafond: 3, plafond_origine: 'conception', gainMax: 1, preuve: 'faible',
      pertePubliee: { texte: 'Non publiée.' },
      reserveCorps: 'Non publiée sous forme utile.',
      delaiCarence: 'La carence en acides gras essentiels est presque inexistante hors nutrition par perfusion (NIH).',
      note: 'Le repère de l app est la somme de deux repères EFSA (ALA et EPA + DHA). Pour la part marine, voir epadha. Plafond 3 jours : choix prudent.',
      inconnu: 'Tout délai.',
      interactions: 'Beaucoup d acide linoléique (oméga-6) freine la conversion de l ALA.',
      src: ['EFSA_FAT_2010:p.1, p.4, p.15', 'ODS_OMEGA3']
    },

    eau: {
      nom: 'Eau', type: 'quotidien', fenetre: 1, plafond: 0, plafond_origine: 'source', gainMax: 0, preuve: 'forte',
      pertePubliee: { texte: 'Une perte d eau d environ 1 % du poids est normalement compensée en 24 heures. En chaleur et effort, les pertes peuvent monter vers 8 000 mL par jour.' },
      reserveCorps: 'Pas de réserve : le corps équilibre entrées et sorties chaque jour.',
      delaiCarence: 'Au-delà de la perte compensée en un jour, baisse des performances physiques et mentales.',
      note: 'Plafond 0 : on compte jour par jour.',
      inconnu: 'La sueur réelle (l app ne la mesure pas).',
      interactions: 'Sueur, chaleur, sport : ajouter de l eau et des sels.',
      src: ['EFSA_EAU_2010:p.2, p.3', 'EFSA_DRV_2017:Tableau 2']
    },

    fib: {
      nom: 'Fibres', type: 'quotidien', fenetre: 7, plafond: 0, plafond_origine: 'conception', gainMax: 0, preuve: 'moyenne',
      pertePubliee: { texte: 'Sans objet.' },
      reserveCorps: 'Aucune : les fibres agissent dans l intestin.',
      delaiCarence: 'Sans objet ; le repère EFSA de 25 g vise un transit normal.',
      note: 'Plafond 0 ; moyenne sur 7 jours.',
      inconnu: 'Sans objet.',
      interactions: 'Aucune retenue.',
      src: ['EFSA_FIB_2010', 'EFSA_DRV_2017:lignes 647 à 649 du texte extrait']
    },

    p: {
      nom: 'Protéines', type: 'quotidien', fenetre: 7, plafond: 0, plafond_origine: 'conception', gainMax: 0, preuve: 'moyenne',
      pertePubliee: { texte: 'Le besoin remplace des pertes d azote obligatoires de chaque jour (besoin moyen 0,66 g par kg).' },
      reserveCorps: 'Aucune réserve de protéines publiée dans l avis lu ; le muscle n est pas un stock à vider.',
      delaiCarence: 'Non retenu ici.',
      note: 'Plafond 0 ; moyenne sur 7 jours.',
      inconnu: 'Sans objet.',
      interactions: 'Besoin plus haut en sport et avec l âge selon d autres sources non lues ici : non retenu.',
      src: ['EFSA_PROT_2012:p.1, p.2']
    }
  },

  // Sueur : teneurs publiées, pour un ajout optionnel au besoin du jour (litres de sueur saisis par l utilisateur).
  sueur: {
    note: 'Choix de conception : l app ne mesure pas la sueur. Si l utilisateur saisit des litres, besoin du jour + litres x teneur. Sinon rien.',
    k: { mgParLitre: [117, 273], src: 'EFSA_K_2016 section 2.3.5.3 (3 à 7 mmol/L, 1 mmol = 39,1 mg)' },
    mg: { mgParLitre: [1.3, 12.2], src: 'EFSA_MG_2015 p.10 (études de 1,3 ± 0,6 à 12,2 ± 12,2 mg/L ; corps entier 9,8 ± 4,8 mg/L)' },
    i: { ugParLitre: [24.9, 46.5], src: 'EFSA_I_2014 section 2.3.6.3 (Mao 2001)' },
    zn: { mgParJour: 0.5, src: 'EFSA_ZN_2014 p.11 (peau et sueur, homme, sans effort particulier ; pas de teneur par litre dans le texte lu)' },
    eau: { mlParJourMax: 8000, src: 'EFSA_EAU_2010 p.3' }
  },

  // Combien de jours de relevés faudrait-il pour connaître l apport habituel d une personne à 10 % près
  joursPourApportHabituel: {
    energie: 31, vitamineA: 433,
    src: 'BASIOTIS_1987 (29 adultes, un an de relevés) : énergie 31 jours en moyenne, vitamine A 433 jours ; pour un groupe, 3 à 41 jours.'
  },

  sources: {
    EFSA_PRINCIPES_2010: { titre: 'EFSA NDA Panel, Scientific Opinion on principles for deriving and applying Dietary Reference Values. EFSA Journal 2010;8(3):1458', doi: '10.2903/j.efsa.2010.1458' },
    EFSA_DRV_2017: { titre: 'EFSA, Dietary Reference Values for nutrients. Summary report. EFSA supporting publication 2017:e15121', doi: '10.2903/sp.efsa.2017.e15121' },
    EFSA_VA_2015: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for vitamin A. EFSA Journal 2015;13(3):4028', doi: '10.2903/j.efsa.2015.4028' },
    EFSA_VC_2013: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for vitamin C. EFSA Journal 2013;11(11):3418', doi: '10.2903/j.efsa.2013.3418' },
    EFSA_VD_2016: { titre: 'EFSA NDA Panel, Dietary reference values for vitamin D. EFSA Journal 2016;14(10):4547', doi: '10.2903/j.efsa.2016.4547' },
    EFSA_VE_2015: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for vitamin E as alpha-tocopherol. EFSA Journal 2015;13(7):4149', doi: '10.2903/j.efsa.2015.4149' },
    EFSA_VK_2017: { titre: 'EFSA NDA Panel, Dietary reference values for vitamin K. EFSA Journal 2017;15(5):4780', doi: '10.2903/j.efsa.2017.4780' },
    EFSA_B1_2016: { titre: 'EFSA NDA Panel, Dietary reference values for thiamin. EFSA Journal 2016;14(12):4653', doi: '10.2903/j.efsa.2016.4653' },
    EFSA_B2_2017: { titre: 'EFSA NDA Panel, Dietary Reference Values for riboflavin. EFSA Journal 2017;15(8):4919', doi: '10.2903/j.efsa.2017.4919' },
    EFSA_B3_2014: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for niacin. EFSA Journal 2014;12(7):3759', doi: '10.2903/j.efsa.2014.3759' },
    EFSA_B5_2014: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for pantothenic acid. EFSA Journal 2014;12(2):3581', doi: '10.2903/j.efsa.2014.3581' },
    EFSA_B6_2016: { titre: 'EFSA NDA Panel, Dietary Reference Values for vitamin B6. EFSA Journal 2016;14(6):4485', doi: '10.2903/j.efsa.2016.4485' },
    EFSA_B9_2014: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for folate. EFSA Journal 2014;12(11):3893', doi: '10.2903/j.efsa.2014.3893' },
    EFSA_B12_2015: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for cobalamin (vitamin B12). EFSA Journal 2015;13(7):4150', doi: '10.2903/j.efsa.2015.4150' },
    EFSA_CHO_2016: { titre: 'EFSA NDA Panel, Dietary Reference Values for choline. EFSA Journal 2016;14(8):4484', doi: '10.2903/j.efsa.2016.4484' },
    EFSA_CA_2015: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for calcium. EFSA Journal 2015;13(5):4101', doi: '10.2903/j.efsa.2015.4101' },
    EFSA_FE_2015: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for iron. EFSA Journal 2015;13(10):4254', doi: '10.2903/j.efsa.2015.4254' },
    EFSA_MG_2015: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for magnesium. EFSA Journal 2015;13(7):4186', doi: '10.2903/j.efsa.2015.4186' },
    EFSA_ZN_2014: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for zinc. EFSA Journal 2014;12(10):3844', doi: '10.2903/j.efsa.2014.3844' },
    EFSA_K_2016: { titre: 'EFSA NDA Panel, Dietary reference values for potassium. EFSA Journal 2016;14(10):4592', doi: '10.2903/j.efsa.2016.4592' },
    EFSA_SE_2014: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for selenium. EFSA Journal 2014;12(10):3846', doi: '10.2903/j.efsa.2014.3846' },
    EFSA_I_2014: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for iodine. EFSA Journal 2014;12(5):3660', doi: '10.2903/j.efsa.2014.3660' },
    EFSA_CU_2015: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for copper. EFSA Journal 2015;13(10):4253', doi: '10.2903/j.efsa.2015.4253' },
    EFSA_MN_2013: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for manganese. EFSA Journal 2013;11(11):3419', doi: '10.2903/j.efsa.2013.3419' },
    EFSA_FAT_2010: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for fats. EFSA Journal 2010;8(3):1461', doi: '10.2903/j.efsa.2010.1461' },
    EFSA_EAU_2010: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary reference values for water. EFSA Journal 2010;8(3):1459', doi: '10.2903/j.efsa.2010.1459' },
    EFSA_PROT_2012: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for protein. EFSA Journal 2012;10(2):2557', doi: '10.2903/j.efsa.2012.2557' },
    EFSA_FIB_2010: { titre: 'EFSA NDA Panel, Scientific Opinion on Dietary Reference Values for carbohydrates and dietary fibre. EFSA Journal 2010;8(3):1462', doi: '10.2903/j.efsa.2010.1462' },
    IOM_2000: { titre: 'Institute of Medicine, Dietary Reference Intakes: Applications in Dietary Assessment. National Academies Press, 2000, chapitre 3', url: 'https://nap.nationalacademies.org/read/9956/chapter/8' },
    BASIOTIS_1987: { titre: 'Basiotis PP et al., Number of days of food intake records required to estimate individual and group nutrient intakes with defined confidence. J Nutr 1987;117(9):1638-41', doi: '10.1093/jn/117.9.1638' },
    BROWNING_2012: { titre: 'Browning LM et al., Incorporation of eicosapentaenoic and docosahexaenoic acids into lipid pools when given as supplements providing doses equivalent to typical intakes of oily fish. Am J Clin Nutr 2012 (PMC3441107)', doi: '10.3945/ajcn.112.041343' },
    JONES_2014: { titre: 'Jones KS et al., 25(OH)D2 half-life is shorter than 25(OH)D3 half-life and is influenced by DBP concentration and genotype. J Clin Endocrinol Metab 2014 (PMC4207933)', doi: '10.1210/jc.2014-1714' },
    ODS_VITA: { titre: 'NIH ODS, Vitamin A, fiche pour professionnels (mise à jour 10 mars 2025)', url: 'https://ods.od.nih.gov/factsheets/VitaminA-HealthProfessional/' },
    ODS_VITC: { titre: 'NIH ODS, Vitamin C, fiche pour professionnels (mise à jour 31 juillet 2025)', url: 'https://ods.od.nih.gov/factsheets/VitaminC-HealthProfessional/' },
    ODS_VITD: { titre: 'NIH ODS, Vitamin D, fiche pour professionnels (mise à jour 27 juin 2025)', url: 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/' },
    ODS_THIAMIN: { titre: 'NIH ODS, Thiamin, fiche pour professionnels (mise à jour 9 février 2023)', url: 'https://ods.od.nih.gov/factsheets/Thiamin-HealthProfessional/' },
    ODS_RIBOFLAVIN: { titre: 'NIH ODS, Riboflavin, fiche pour professionnels (mise à jour 11 mai 2022)', url: 'https://ods.od.nih.gov/factsheets/Riboflavin-HealthProfessional/' },
    ODS_NIACIN: { titre: 'NIH ODS, Niacin, fiche pour professionnels (mise à jour 18 novembre 2022)', url: 'https://ods.od.nih.gov/factsheets/Niacin-HealthProfessional/' },
    ODS_B5: { titre: 'NIH ODS, Pantothenic Acid, fiche pour professionnels (mise à jour 1er mai 2026)', url: 'https://ods.od.nih.gov/factsheets/PantothenicAcid-HealthProfessional/' },
    ODS_FOLATE: { titre: 'NIH ODS, Folate, fiche pour professionnels (mise à jour 30 novembre 2022)', url: 'https://ods.od.nih.gov/factsheets/Folate-HealthProfessional/' },
    ODS_B12: { titre: 'NIH ODS, Vitamin B12, fiche pour professionnels (mise à jour 2 juillet 2025)', url: 'https://ods.od.nih.gov/factsheets/VitaminB12-HealthProfessional/' },
    ODS_CHOLINE: { titre: 'NIH ODS, Choline, fiche pour professionnels (mise à jour 2 juin 2022)', url: 'https://ods.od.nih.gov/factsheets/Choline-HealthProfessional/' },
    ODS_CALCIUM: { titre: 'NIH ODS, Calcium, fiche pour professionnels (mise à jour 22 juin 2026)', url: 'https://ods.od.nih.gov/factsheets/Calcium-HealthProfessional/' },
    ODS_IRON: { titre: 'NIH ODS, Iron, fiche pour professionnels (mise à jour 4 septembre 2025)', url: 'https://ods.od.nih.gov/factsheets/Iron-HealthProfessional/' },
    ODS_MAGNESIUM: { titre: 'NIH ODS, Magnesium, fiche pour professionnels (mise à jour 6 janvier 2026)', url: 'https://ods.od.nih.gov/factsheets/Magnesium-HealthProfessional/' },
    ODS_ZINC: { titre: 'NIH ODS, Zinc, fiche pour professionnels (mise à jour 6 janvier 2026)', url: 'https://ods.od.nih.gov/factsheets/Zinc-HealthProfessional/' },
    ODS_POTASSIUM: { titre: 'NIH ODS, Potassium, fiche pour professionnels (mise à jour 2 juin 2022)', url: 'https://ods.od.nih.gov/factsheets/Potassium-HealthProfessional/' },
    ODS_SELENIUM: { titre: 'NIH ODS, Selenium, fiche pour professionnels (mise à jour 4 septembre 2025)', url: 'https://ods.od.nih.gov/factsheets/Selenium-HealthProfessional/' },
    ODS_IODINE: { titre: 'NIH ODS, Iodine, fiche pour professionnels (mise à jour 5 novembre 2024)', url: 'https://ods.od.nih.gov/factsheets/Iodine-HealthProfessional/' },
    ODS_COPPER: { titre: 'NIH ODS, Copper, fiche pour professionnels (mise à jour 18 octobre 2022)', url: 'https://ods.od.nih.gov/factsheets/Copper-HealthProfessional/' },
    ODS_MANGANESE: { titre: 'NIH ODS, Manganese, fiche pour professionnels (mise à jour 29 mars 2021)', url: 'https://ods.od.nih.gov/factsheets/Manganese-HealthProfessional/' },
    ODS_OMEGA3: { titre: 'NIH ODS, Omega-3 Fatty Acids, fiche pour professionnels (mise à jour 22 août 2025)', url: 'https://ods.od.nih.gov/factsheets/Omega3FattyAcids-HealthProfessional/' }
  }
};
if (typeof module !== 'undefined') module.exports = RESERVES;
