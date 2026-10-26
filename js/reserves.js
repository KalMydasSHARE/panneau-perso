'use strict';
/* KalMydas PERSO : réserves estimées par nutriment. Calcul : js/reserves_calc.js (copie de _donnees/reserves_glue.js, testée par
   _donnees/test_reserves.cjs). Données et sources : data/reserves.js, méthode : _donnees/RESERVES.md.
   Ce sont des ESTIMATIONS de couverture alimentaire faites avec les repas notés, pas une mesure du corps. Seule une prise de sang le dit.
   Au départ la réserve vaut 0 : on ne compte que ce qui est noté depuis le début du suivi, sauf si Kal choisit « état de départ normal ». */

const RSV_TYPE = { quotidien: 'Renouvellement quotidien', courte: 'Réserve courte', longue: 'Réserve longue', os: 'Os : aucune réserve comptée' };
const RSV_PREUVE = { forte: 'preuve forte', moyenne: 'preuve moyenne', faible: 'preuve faible' };
const RSV_AVERT = 'Estimation faite avec tes repas notés. Ce n\'est pas une mesure de ton corps : seule une prise de sang le dit.';

/* Empreinte des données qui comptent (repas, compléments, eau, mes aliments) depuis une date : on ne refait un calcul que si elle change. */
function hashStr(hh, s) { for (let i = 0; i < s.length; i++) hh = Math.imul(hh ^ s.charCodeAt(i), 16777619); return hh; }
function sigNutri(from) {
  const n = N(); let hh = 2166136261;
  for (const d in n.log) { if (d < from) continue; hh = hashStr(hh, d); for (const e of n.log[d]) hh = hashStr(hh, `${e.food || e.name}|${e.g}|${e.meal}|${e.repas || ''}|${e.n ? JSON.stringify(e.n) : ''}`); }
  for (const d in n.supLog) if (d >= from) hh = hashStr(hh, d + JSON.stringify(n.supLog[d]));
  for (const d in n.water) if (d >= from) hh = hashStr(hh, d + n.water[d]);
  hh = hashStr(hh, JSON.stringify(n.supps));
  for (const f of n.foods) hh = hashStr(hh, f.id + JSON.stringify(f.v));
  return hh >>> 0;
}

// Repère du jour de chaque clé du modèle, dans l'unité des totaux du panneau (EPA + DHA : repère en mg, totaux en g)
function repereRsv(k, tg) {
  if (k === 'eau') return waterTarget();
  if (k === 'epadha') { const r = drvRef('epadha'); return r && r.v > 0 ? r.v / 1000 : null; }
  return tg[k] > 0 ? tg[k] : null;
}
// Totaux d'un jour pour le modèle : repas et compléments (dayTotals), eau comme l'écran de la journée, EPA + DHA
function valeursRsv(d) {
  const t = dayTotals(d), v = {};
  for (const k in RESERVES.nutriments) v[k] = t[k] || 0;
  v.eau = (N().water[d] || 0) + (waterTotalMode() ? t.eau || 0 : 0);
  v.epadha = (t.epa || 0) + (t.dha || 0);
  return v;
}
const sexeRsv = () => (PF().sex === 'f' && !PF().menopause ? 'f' : 'm'); // après la ménopause, l'EFSA donne au fer les repères de l'homme

function reservesEtat() {
  if (!RESERVES_OK() || !STATE) return null;
  const td = today(), from = addDays(td, -366), tg = targets(), dep = N().reserveDepart === 'plein' ? 'plein' : 'vide';
  const sig = `${td}|${dep}|${JSON.stringify(tg)}|${sexeRsv()}|${PF().drvSrc}|${waterTarget()}|${sigNutri(from)}`;
  if (reservesEtat.c && reservesEtat.c.sig === sig) return reservesEtat.c;
  const t0 = performance.now();
  const notes = Object.keys(N().log).filter(d => d < td && d >= addDays(td, -365) && N().log[d].length).sort();
  const debut = notes[0] || null, jours = [];
  if (debut) for (let d = debut; d < td; d = addDays(d, 1)) { const note = (N().log[d] || []).length > 0; jours.push({ date: d, note, v: note ? valeursRsv(d) : {} }); }
  const auj = { v: valeursRsv(td) }, opts = { sexe: sexeRsv(), depart: dep, regles: RESERVES.regles }, n = {};
  for (const [k, p] of Object.entries(RESERVES.nutriments)) {
    const rep = repereRsv(k, tg);
    const etat = rep ? reserveEstimee(jours, auj, k, rep, p, opts) : null;
    const moyenne = rep ? couvertureGlissante(jours, k, rep, p) : null;
    const tendance = rep ? couvertureGlissante(jours, k, rep, p, Math.min(RESERVES.regles.fenetreTendance, p.fenetre)) : null;
    n[k] = { k, p, rep, etat, moyenne, tendance, u: urgence(etat, tendance, RESERVES.regles) };
  }
  return (reservesEtat.c = { sig, debut, nbJours: jours.length, nbNotes: notes.length, depart: dep, n, ms: performance.now() - t0 });
}

/* Phrase d'écran, même logique que phraseReserve (js/reserves_calc.js), avec la ponctuation française et les mots de RESERVES.md section 7 */
const pctR = x => `${Math.round(x * 100)} %`;
function phraseRsv(x) {
  const nom = x.p.nom, e = x.etat, c = x.moyenne;
  if (!e) return `${nom} : pas de repère pour ton profil.`;
  const moy = c && c.moyenne !== null ? ` Moyenne des jours notés sur les ${c.fenetre} derniers : ${pctR(c.moyenne)}.` : '';
  if (e.type === 'os' && e.manqueAujourdhui > 0) return `${nom} : il manque ${pctR(e.manqueAujourdhui)} aujourd'hui. Le corps prend dans les os : ce n'est pas une réserve à vider.${moy}`;
  if (e.plafond === 0 || e.type === 'quotidien') return e.manqueAujourdhui > 0 ? `${nom} : il manque ${pctR(e.manqueAujourdhui)} aujourd'hui. Pas de réserve à compter.${moy}` : `${nom} : couvert aujourd'hui.${moy}`;
  let s;
  if (e.manqueAujourdhui > 0) s = `${nom} : réserve estimée vide, il manque ${pctR(e.manqueAujourdhui)} aujourd'hui.`;
  else if (e.joursAvance === 0) s = `${nom} : couvert aujourd'hui, pas d'avance.`;
  else if (e.joursAvance >= 60) s = `${nom} : couvert aujourd'hui, avance estimée d'environ ${Math.floor(e.joursAvance / 30)} mois.`;
  else s = `${nom} : couvert aujourd'hui, avance estimée d'environ ${e.joursAvance} jour${e.joursAvance > 1 ? 's' : ''}.`;
  if (e.joursBas >= 7) s += ` Apport bas depuis ${e.joursBas} jours : la réserve baisse.`;
  if (e.depart === 'vide' && e.type === 'longue') s += ' Compté depuis le début de ton suivi seulement.';
  return s + moy;
}
// Type du repère (AI, PRI...) : sous un apport adéquat (AI), jamais « carence » (IOM 2000, RESERVES.md section 1)
const typeRepere = k => { const r = drvRef(k); return r ? r.type : ''; };
function notesRsv(x) {
  const k = x.k, e = x.etat, out = [];
  if (e && e.manqueAujourdhui > 0 && typeRepere(k) === 'AI') out.push('Sous le repère : on ne peut pas dire qu\'il en manque, seulement que ce n\'est pas sûr d\'être assez.');
  if (e && e.joursImputes > 0) out.push(`${e.joursImputes} jour${e.joursImputes > 1 ? 's' : ''} non noté${e.joursImputes > 1 ? 's' : ''} compté${e.joursImputes > 1 ? 's' : ''} à la moyenne.`);
  if (k === 'b3') out.push('Le tryptophane des protéines n\'est pas compté : la couverture réelle est plus haute.');
  if (k === 'vD') out.push('Le soleil n\'est pas compté. En hiver, la peau n\'en fait presque pas.');
  if (k === 'b12' && ((ageYears() || 0) >= 65 || PR().profil === 'vegetalien')) out.push('Après 65 ans, ou sans produit animal, la B12 des aliments peut mal passer : demande une prise de sang à ton médecin.');
  if (k === 'fe') out.push('Absorption non ajustée : la viande et la vitamine C aident, le thé, le café et le calcium freinent.');
  return out;
}
function urgTxt(u) { return u >= 0.67 ? 'haute' : u >= 0.34 ? 'moyenne' : u > 0 ? 'basse' : 'aucune'; }

function sourcesRsv(x) {
  const p = x.p, srcs = (p.src || []).map(s => { const [key, ...rest] = s.split(':'), ref = RESERVES.sources[key] || {}; return { key, pages: rest.join(':').trim(), titre: ref.titre || key, doi: ref.doi, url: ref.url }; });
  modal(`${p.nom} : sources et méthode`, h('div', { class: 'form' },
    h('p', { class: 'small' }, h('b', null, RSV_TYPE[p.type] || p.type), ` · fenêtre de ${p.fenetre} jour${p.fenetre > 1 ? 's' : ''} · plafond ${typeof p.plafond === 'object' ? `${p.plafond.m} jours (homme), ${p.plafond.f} jours (femme)` : `${p.plafond} jour${p.plafond > 1 ? 's' : ''}`}`,
      p.plafond_origine === 'conception' ? ' (durée choisie faute de valeur publiée)' : ' (d\'après la source)', ` · ${RSV_PREUVE[p.preuve] || p.preuve}`),
    p.reserveCorps ? field('Réserve du corps', h('p', { class: 'small' }, apos(p.reserveCorps))) : null,
    p.pertePubliee && p.pertePubliee.texte ? field('Pertes et renouvellement publiés', h('p', { class: 'small' }, apos(p.pertePubliee.texte))) : null,
    p.delaiCarence ? field('Délai avant les signes', h('p', { class: 'small' }, apos(p.delaiCarence))) : null,
    p.note ? field('Choix du panneau', h('p', { class: 'small' }, apos(p.note))) : null,
    p.inconnu ? field('Ce qui n\'est pas connu', h('p', { class: 'small' }, apos(p.inconnu))) : null,
    p.interactions ? field('Ce qui joue', h('p', { class: 'small' }, apos(p.interactions))) : null,
    h('small', { class: 'muted up' }, 'Sources lues'),
    h('ul', { class: 'plain' }, srcs.map(s => h('li', null, s.titre, s.pages ? h('small', { class: 'muted' }, ` (${s.pages})`) : null, s.doi ? h('small', { class: 'muted' }, ` · doi ${s.doi}`) : s.url ? h('small', { class: 'muted' }, ` · ${s.url}`) : null))),
    h('small', { class: 'muted' }, 'Méthode complète : _donnees/RESERVES.md. Estimations, pas un avis médical.')), []);
}

function vueReserves(root) {
  if (!RESERVES_OK()) return put(root, h('section', { class: 'card' }, h('h3', null, 'Réserves'), h('p', { class: 'neg' }, 'Données des réserves non chargées. Recharge la page.')));
  const R = reservesEtat(), list = Object.values(R.n).sort((a, b) => b.u.valeur - a.u.valeur || a.p.nom.localeCompare(b.p.nom));
  const plein = N().reserveDepart === 'plein';
  put(root,
    h('section', { class: 'card gold' }, h('h3', null, 'Réserves estimées'),
      h('p', null, RSV_AVERT), h('p', { class: 'muted small' }, 'Une prise de sang fait foi. Ce n\'est pas un avis médical : si un chiffre t\'inquiète, parles-en à ton médecin.'),
      h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: plein, onchange: e => { const r = garde(N(), 'reserveDepart'); N().reserveDepart = e.target.checked ? 'plein' : 'vide'; save(); rerender(); undoable(e.target.checked ? 'Réserves parties pleines' : 'Réserves parties de zéro', r); } }), 'Mon état de départ est normal (prise de sang récente)'),
      h('small', { class: 'muted block' }, plein ? 'Les réserves partent pleines au premier jour du suivi, puis suivent tes repas notés. À garder seulement si une prise de sang récente était normale.'
        : 'À cocher seulement si une prise de sang récente était normale. Sinon, la réserve part de zéro : on ne compte que ce qui est noté depuis le début du suivi.'),
      h('small', { class: 'muted block' }, R.debut ? `Suivi depuis le ${dateLabel(R.debut)} : ${R.nbNotes} jour${R.nbNotes > 1 ? 's' : ''} noté${R.nbNotes > 1 ? 's' : ''} sur ${R.nbJours}, plus aujourd'hui.` : 'Le suivi commence : seuls les repas notés comptent, à partir d\'aujourd\'hui.')),
    h('div', { class: 'list rsv-list' }, list.map(x => {
      const e = x.etat, u = x.u.valeur;
      return h('section', { class: 'card rsv' },
        h('div', { class: 'row between wrap' }, h('b', null, x.p.nom), h('span', { class: 'chips inline' }, h('span', { class: 'chip' }, RSV_TYPE[x.p.type] || x.p.type), h('span', { class: `chip ${x.p.preuve === 'forte' ? 'ok' : ''}` }, RSV_PREUVE[x.p.preuve] || x.p.preuve))),
        h('p', { class: 'small' }, phraseRsv(x)),
        h('div', { class: 'facts' },
          h('div', null, h('small', null, 'Avance estimée'), h('b', null, !e ? '–' : e.plafond === 0 ? 'pas de réserve' : e.joursAvance >= 60 ? `≈ ${Math.floor(e.joursAvance / 30)} mois` : `${e.joursAvance} j`)),
          h('div', null, h('small', null, 'Plafond du modèle'), h('b', null, e ? `${e.plafond} j` : '–'), h('small', null, x.p.plafond_origine === 'conception' ? 'choisi faute de valeur publiée' : 'd\'après la source')),
          h('div', null, h('small', null, 'Urgence pour le menu'), h('b', null, urgTxt(u)), progress(u * 100, u >= 0.67 ? 'bad' : u >= 0.34 ? 'warn' : 'ok'))),
        x.p.pertePubliee && x.p.pertePubliee.texte ? h('small', { class: 'muted block' }, `Pertes et renouvellement, d'après les sources : ${apos(x.p.pertePubliee.texte).replace(/^([A-ZÉ])(?=[a-zé])/, c => c.toLowerCase())}`) : null,
        notesRsv(x).map(t => h('small', { class: 'muted block' }, t)),
        h('div', { class: 'row' }, h('button', { class: 'btn small ghost', 'aria-label': `Sources : ${x.p.nom}`, onclick: () => sourcesRsv(x) }, 'Sources')));
    })),
    h('p', { class: 'muted small' }, apos(`Pour connaître l apport habituel d une personne à 10 % près, il faut en moyenne ${RESERVES.joursPourApportHabituel.energie} jours de relevés pour l énergie et ${RESERVES.joursPourApportHabituel.vitamineA} pour la vitamine A (Basiotis 1987). Un mois de suivi reste une estimation.`)));
}

/* Encart sobre de la Journée : ce que les jours passés notés ont peu couvert (moyenne des 7 derniers jours sous 70 %, au moins deux jours notés) */
function rsvEncart() {
  const R = reservesEtat(); if (!R || !R.debut) return null;
  const list = Object.values(R.n).filter(x => x.k !== 'eau' && x.etat && x.tendance && x.tendance.moyenne !== null && x.tendance.joursNotes >= 2 && x.tendance.moyenne < 0.7 && x.etat.manqueAujourdhui > 0)
    .sort((a, b) => a.tendance.moyenne - b.tendance.moyenne).slice(0, 4);
  if (!list.length) return null;
  const micro = k => MICROS.find(m => m[0] === k);
  return h('section', { class: 'card rsv-encart' }, h('div', { class: 'row between wrap' }, h('h3', null, 'À remplacer aujourd\'hui'), h('a', { class: 'btn small ghost', href: '#/nutri/reserves' }, 'Réserves')),
    h('small', { class: 'muted block' }, 'Moyenne des 7 derniers jours notés, en part de ton repère :'),
    h('div', { class: 'chips' }, list.map(x => micro(x.k) ? h('button', { class: 'chip pick bad', title: 'Où le trouver', onclick: () => sourcesModal(micro(x.k)) }, `${x.p.nom} ${pctR(x.tendance.moyenne)}`) : h('span', { class: 'chip bad' }, `${x.p.nom} ${pctR(x.tendance.moyenne)}`))),
    h('small', { class: 'muted block' }, 'Le menu du jour en tient compte. Estimation faite avec tes repas notés, pas une mesure de ton corps.'));
}
