'use strict';
/* KalMydas PERSO : calcul de réserve estimée et d urgence par nutriment. 2026-10-23.
   Code à coller dans l app (par exemple un nouveau js/reserves_calc.js chargé après data/reserves.js).
   Source de vérité du code : ce fichier. _donnees/GLUE_RESERVES.md en contient une copie et le mode d emploi.
   Données : data/reserves.js (RESERVES). Méthode et sources : _donnees/RESERVES.md.
   Aucune bibliothèque. Aucun accès réseau. Fonctions pures : mêmes entrées, même résultat.

   FORME DES DONNÉES ATTENDUES
   jours : tableau des jours PASSÉS, du plus ancien au plus récent, SANS aujourd hui :
           [{ date: 'AAAA-MM-JJ', note: true|false, v: { vC: 85, b12: 3.1, ... } }]
           note = false quand aucun repas n a été noté ce jour-là (jour inconnu, pas jour à zéro).
           Un nutriment absent de v un jour noté compte 0 (les totaux de l app sont déjà des bornes basses).
   aujourdhui : { v: { ... } } ce qui est noté aujourd hui jusqu ici.
   repere : le repère du jour pour ce nutriment (data/drv.js selon le profil), dans la même unité que v.
   param  : RESERVES.nutriments[cle].
   opts   : { sexe: 'm'|'f', depart: 'vide'|'plein', regles: RESERVES.regles } */

function plafondDe(param, sexe) {
  const p = param.plafond;
  if (p && typeof p === 'object') return sexe === 'f' ? p.f : p.m;
  return typeof p === 'number' ? p : 0;
}

// Part du repère, ou null si le repère manque
function ratioRepere(valeur, repere) {
  if (!(repere > 0)) return null;
  return (typeof valeur === 'number' && isFinite(valeur) ? valeur : 0) / repere;
}

// Ce qu un jour apporte à la réserve, en jours de besoin. Un excès ne compte qu en partie et jamais plus que gainMax.
function gainDuJour(x, param, efficacite) {
  if (x <= 1) return x;
  const g = typeof param.gainMax === 'number' ? param.gainMax : 1;
  return 1 + Math.min((x - 1) * efficacite, g);
}

/* 1. Moyenne glissante de la couverture sur la fenêtre du nutriment (jours passés seulement).
   Un jour non noté est laissé de côté. Un jour très haut est plafonné à 1 + gainMax, pour qu un seul gros jour
   ne cache pas une semaine vide. Retourne moyenne = null si aucun jour noté dans la fenêtre.
   fenetreVoulue (option) remplace la fenêtre du nutriment : l urgence utilise min(regles.fenetreTendance, fenetre). */
function couvertureGlissante(jours, cle, repere, param, fenetreVoulue) {
  const fenetre = Math.max(1, fenetreVoulue || param.fenetre || 7);
  const plafondX = 1 + (typeof param.gainMax === 'number' ? param.gainMax : 1);
  const fen = jours.slice(-fenetre);
  let somme = 0, n = 0;
  for (const j of fen) {
    if (!j.note) continue;
    const x = ratioRepere((j.v || {})[cle], repere);
    if (x === null) continue;
    somme += Math.min(x, plafondX); n++;
  }
  return { moyenne: n ? somme / n : null, joursNotes: n, joursNonNotes: fen.length - n, fenetre };
}

/* 2. Réserve estimée, en jours de besoin.
   R(jour) = borne(R(veille) + gain(x) - 1, 0, plafond)  ; départ 0 ('vide', par défaut) ou plafond ('plein').
   Jour non noté : x = moyenne des jours notés de la fenêtre qui précède (0 s il n y en a aucun).
   disponible = R(hier) + gain(x d aujourd hui jusqu ici), borné à plafond + 1.
   joursAvance = nombre de jours entiers couverts APRÈS aujourd hui si on ne mangeait plus rien de ce nutriment. */
function reserveEstimee(jours, aujourdhui, cle, repere, param, opts) {
  const o = opts || {};
  const regles = o.regles || {};
  const eff = typeof regles.efficaciteExces === 'number' ? regles.efficaciteExces : 1;
  const P = plafondDe(param, o.sexe);
  const depart = o.depart || regles.departParDefaut || 'vide';
  let R = depart === 'plein' ? P : 0;
  let joursBas = 0, joursImputes = 0, xHier = null;
  const fen = Math.max(1, param.fenetre || 7);
  for (let i = 0; i < jours.length; i++) {
    const j = jours[i];
    let x;
    if (j.note) x = ratioRepere((j.v || {})[cle], repere);
    else {
      const prec = couvertureGlissante(jours.slice(Math.max(0, i - fen), i), cle, repere, param).moyenne;
      x = prec === null ? 0 : prec; joursImputes++;
    }
    if (x === null) return null; // repère absent : on ne calcule rien plutôt qu un faux chiffre
    R = Math.min(P, Math.max(0, R + gainDuJour(x, param, eff) - 1));
    joursBas = x < 0.5 ? joursBas + 1 : 0;
    xHier = x;
  }
  const xAuj = ratioRepere(((aujourdhui || {}).v || {})[cle], repere);
  if (xAuj === null) return null;
  const disponible = Math.min(P + 1, R + gainDuJour(xAuj, param, eff));
  return {
    cle, type: param.type, plafond: P,
    reserveHier: R,                       // jours de besoin en réserve à la fin d hier
    disponible,                           // réserve + ce qui est noté aujourd hui
    joursAvance: disponible >= 1 ? Math.floor(disponible - 1 + 1e-9) : 0,
    manqueAujourdhui: Math.max(0, 1 - disponible), // part du repère d aujourd hui qui manque encore
    xHier, xAujourdhui: xAuj,
    joursBas,                             // jours d affilée à moins de 50 % du repère (jusqu à hier)
    joursImputes,                         // jours non notés remplacés par une moyenne
    depart
  };
}

/* 3. Urgence d un nutriment pour choisir les prochains repas, de 0 (rien à faire) à 1 (priorité).
   u = max( borne(1 - disponible, 0, 1) , poidsTendance x borne(1 - moyenneGlissante, 0, 1) )
   Le premier terme dit ce qui manque aujourd hui une fois la réserve comptée ; le second empêche une réserve
   estimée pleine de cacher des jours d apport faible (cas de la B12 chez une personne végane, semaine pauvre en fer).
   couverture doit être calculée sur la fenêtre de tendance : couvertureGlissante(jours, cle, repere, param,
   Math.min(regles.fenetreTendance || 7, param.fenetre || 7)). */
function urgence(etat, couverture, regles) {
  if (!etat) return { valeur: 0, raison: 'inconnu' };
  const poids = regles && typeof regles.poidsTendance === 'number' ? regles.poidsTendance : 0.5;
  const u1 = Math.min(1, Math.max(0, 1 - etat.disponible));
  const m = couverture ? couverture.moyenne : null;
  const u2 = m === null ? 0 : poids * Math.min(1, Math.max(0, 1 - m));
  const valeur = Math.round(Math.max(u1, u2) * 100) / 100;
  let raison = 'couvert';
  if (valeur > 0) raison = u1 >= u2 ? 'manque aujourd hui' : 'moyenne basse';
  return { valeur, raison, u1, u2 };
}

/* 4. Phrase d écran courte et honnête (tutoiement, panneau perso). */
function phraseReserve(nom, etat, couverture) {
  if (!etat) return nom + ' : pas de repère pour ce profil.';
  const moy = couverture && couverture.moyenne !== null
    ? ` Moyenne des ${couverture.fenetre} derniers jours : ${Math.round(couverture.moyenne * 100)} %.` : '';
  if (etat.type === 'os' && etat.manqueAujourdhui > 0)
    return `${nom} : il manque ${Math.round(etat.manqueAujourdhui * 100)} % aujourd hui. Le corps prend dans les os : ce n est pas une réserve à vider.${moy}`;
  if (etat.plafond === 0 || etat.type === 'quotidien') {
    if (etat.manqueAujourdhui > 0) return `${nom} : il manque ${Math.round(etat.manqueAujourdhui * 100)} % aujourd hui. Pas de réserve à compter.${moy}`;
    return `${nom} : couvert aujourd hui.${moy}`;
  }
  let p;
  if (etat.manqueAujourdhui > 0) p = `${nom} : réserve estimée vide, il manque ${Math.round(etat.manqueAujourdhui * 100)} % aujourd hui.`;
  else if (etat.joursAvance === 0) p = `${nom} : couvert aujourd hui, pas d avance.`;
  else if (etat.joursAvance >= 60) p = `${nom} : couvert aujourd hui, avance estimée d environ ${Math.floor(etat.joursAvance / 30)} mois.`;
  else p = `${nom} : couvert aujourd hui, avance estimée d environ ${etat.joursAvance} jour${etat.joursAvance > 1 ? 's' : ''}.`;
  if (etat.joursBas >= 7) p += ` Apport bas depuis ${etat.joursBas} jours : la réserve baisse.`;
  if (etat.depart === 'vide' && etat.type === 'longue') p += ' Compté depuis le début de ton suivi seulement.';
  return p + moy;
}

/* 5. Aide au choix d un aliment : somme des urgences pondérées par ce que la portion apporte (plafonné à 1 repère).
   apports : { cle: quantité dans la portion }, urgences : { cle: valeur 0..1 }, reperes : { cle: repère }. */
function scoreAliment(apports, urgences, reperes) {
  let s = 0;
  for (const cle in urgences) {
    const r = reperes[cle], a = apports[cle];
    if (!(r > 0) || typeof a !== 'number') continue;
    s += urgences[cle] * Math.min(1, a / r);
  }
  return Math.round(s * 1000) / 1000;
}
