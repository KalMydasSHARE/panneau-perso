'use strict';
/* KalMydas PERSO : Plan de vie. Habitudes (à cocher, à compter, automatiques), fréquence par jours ou par semaine, jours de repos,
   séries, tâches, objectifs, journal, sport, relations, revue de la semaine. */

const P = () => STATE.plan;
const pillarName = id => { const p = P().pillars.find(x => x.id === id); return p ? p.name : 'Sans pilier'; };
const activeHabits = () => P().habits.filter(x => !x.archived);
const SLOTS = [['matin', 'Matin'], ['journee', 'Journée'], ['soir', 'Soir'], ['', 'Sans moment']];
const AUTOS = [['', 'Je coche moi-même'], ['workout', 'Automatique : une séance de sport notée'], ['journal', 'Automatique : journal rempli'], ['water', 'Automatique : objectif d\'eau atteint'], ['meals', 'Automatique : au moins deux repas notés'], ['micro70', 'Automatique : micros couverts à 70 %'], ['focus', 'Automatique : 30 minutes de focus'],
  ['prot', 'Automatique : objectif de protéines atteint'], ['sleep7', 'Automatique : 7 heures de sommeil notées au journal']];

/* ----- état d'une habitude un jour donné ----- */
const isSkipped = (hb, d) => !!(P().skips[d] && P().skips[d][hb.id]);
// Pause sur une période (vacances, maladie) : ces jours ne comptent ni pour la série, ni pour la force, ni pour la discipline
const isPaused = (hb, d) => (P().pauses || []).some(p => (!p.habit || p.habit === hb.id) && d >= p.from && d <= p.to);
function autoDone(hb, d) {
  switch (hb.auto) {
    case 'workout': return P().workouts.some(w => w.date === d);
    case 'journal': { const j = P().journal[d]; return !!(j && (j.mood || j.text || (j.grat || []).some(Boolean))); }
    case 'water': return waterOf(d) >= waterTarget();
    case 'meals': return (N().log[d] || []).length >= 2;
    case 'micro70': { const nd = nutriDay(d); return !!nd && nd.micro >= 70; }
    case 'focus': return (P().focus[d] || 0) >= 30;
    case 'prot': { const nd = nutriDay(d); return !!nd && nd.t.p >= nd.targets.p; }
    case 'sleep7': { const j = P().journal[d]; return !!(j && j.sleep >= 7); }
    default: return false;
  }
}
function habitValue(hb, d) { const c = P().checks[d], v = c && c[hb.id]; return typeof v === 'number' ? v : v ? 1 : 0; }
function isDone(hb, d) {
  if (hb.auto && autoDone(hb, d)) return true;
  return hb.type === 'count' ? habitValue(hb, d) >= (hb.goal || 1) : !!(P().checks[d] && P().checks[d][hb.id]);
}
function scheduled(hb, d) {
  if (hb.created && d < hb.created) return false;
  if (isPaused(hb, d)) return false;
  return hb.freq === 'week' ? true : (hb.days || [0, 1, 2, 3, 4, 5, 6]).includes(dow(d));
}
// Objectif d'une semaine pour une habitude « n fois par semaine », réduit au prorata des jours en pause (0 : semaine entière en pause)
function weekGoal(hb, wk) {
  const goal = hb.perWeek || 3; if (!(P().pauses || []).length) return goal;
  const free = Array.from({ length: 7 }, (_, i) => addDays(wk, i)).filter(d => !isPaused(hb, d)).length;
  return Math.round((goal * free) / 7);
}
// Cochée ou décochée avec « Annuler » dans le message
function toggleU(hb, d) {
  const r = garde(P().checks, d), was = isDone(hb, d);
  toggle(hb, d);
  undoable(`${hb.name} : ${was ? 'décochée' : 'faite'}`, r);
}
function setHabit(hb, d, v) {
  const c = (P().checks[d] = P().checks[d] || {});
  if (v) c[hb.id] = v; else delete c[hb.id];
  if (!Object.keys(c).length) delete P().checks[d];
  save(); rerender();
}
function toggle(hb, d) { setHabit(hb, d, hb.type === 'count' ? (isDone(hb, d) ? 0 : hb.goal || 1) : (P().checks[d] && P().checks[d][hb.id] ? 0 : true)); }
function toggleSkip(hb, d) {
  const s = (P().skips[d] = P().skips[d] || {});
  if (s[hb.id]) delete s[hb.id]; else s[hb.id] = true;
  if (!Object.keys(s).length) delete P().skips[d];
  save(); rerender();
}
const doneDaysInWeek = (hb, wk) => Array.from({ length: 7 }, (_, i) => addDays(wk, i)).filter(d => d <= today() && isDone(hb, d)).length;
function weekProgress(hb, wk) { return { done: doneDaysInWeek(hb, wk), goal: weekGoal(hb, wk) }; }

function streak(hb) {
  if (hb.freq === 'week') { // semaines de suite où l'objectif est tenu ; la semaine en cours compte si elle est déjà tenue ; une semaine en pause est sautée
    let wk = weekStart(today()), n = 0;
    if (doneDaysInWeek(hb, wk) < weekGoal(hb, wk)) wk = addDays(wk, -7);
    for (let i = 0; i < 120; i++, wk = addDays(wk, -7)) { if (hb.created && addDays(wk, 6) < hb.created) break; const g = weekGoal(hb, wk); if (!g) continue; if (doneDaysInWeek(hb, wk) >= g) n++; else break; }
    return n;
  }
  let d = today(), n = 0;
  if (scheduled(hb, d) && !isDone(hb, d) && !isSkipped(hb, d)) d = addDays(d, -1); // la journée n'est pas finie
  for (let i = 0; i < 500; i++, d = addDays(d, -1)) {
    if (hb.created && d < hb.created) break;
    if (!scheduled(hb, d) || isSkipped(hb, d)) continue;
    if (isDone(hb, d)) n++; else break;
  }
  return n;
}
function bestStreak(hb) {
  let best = 0, cur = 0, from = hb.created || addDays(today(), -365);
  for (let d = from; d <= today(); d = addDays(d, 1)) { if (!scheduled(hb, d) || isSkipped(hb, d)) continue; if (isDone(hb, d)) { cur++; best = Math.max(best, cur); } else if (d < today()) cur = 0; }
  return best;
}
function rate(hbs, from, to) { // part des cases tenues sur les cases prévues ; jours de repos exclus
  let due = 0, ok = 0;
  for (const hb of hbs) {
    if (hb.freq === 'week') {
      // Une habitude « n fois par semaine » se juge sur la semaine entière. Si la période ne couvre qu'une partie de la semaine
      // (un seul jour, par exemple), la semaine compte au prorata des jours couverts : un jour ne pèse plus comme une semaine.
      const td = today();
      for (let wk = weekStart(from); wk <= to; wk = addDays(wk, 7)) {
        const end = addDays(wk, 6);
        if (hb.created && end < hb.created) continue;
        const done = doneDaysInWeek(hb, wk), goal = weekGoal(hb, wk);
        if (!goal) continue; // semaine entière en pause
        const ended = end < td, left = ended ? 0 : daysBetween(td, end) + 1;
        if (!(ended || done >= goal || done + left < goal)) continue; // semaine pas encore jouée
        const lo = from > wk ? from : wk, hi = to < end ? to : end, part = (daysBetween(lo, hi) + 1) / 7;
        due += goal * part; ok += Math.min(goal, done) * part;
      }
    } else for (let d = from; d <= to; d = addDays(d, 1)) if (scheduled(hb, d) && !isSkipped(hb, d)) { due++; if (isDone(hb, d)) ok++; }
  }
  return { due, ok, pct: due ? (ok / due) * 100 : null };
}
const pctTxt = r => (r.pct === null ? '–' : fmtPct(r.pct, 0));
const dayScore = d => rate(activeHabits(), d, d);

/* ----- force d'une habitude, façon Loop Habit Tracker -----
   Moyenne lissée où le récent pèse plus : un oubli après une longue série ne remet pas à zéro (80 % après un mois sans faute, 96 % après deux).
   Chaque jour prévu pèse (1 - m), avec m = 0,5 puissance 1 / (13 x racine de la fréquence) : la force diminue de moitié en 13 jours prévus
   pour une habitude de tous les jours. Jours non prévus, de repos ou en pause : sautés. Aujourd'hui ne compte que s'il est fait.
   Habitude « n fois par semaine » : calculée par semaine, la semaine en cours seulement quand elle est tenue. */
const _force = { k: null, m: new Map() };
function strength(hb, upto = today()) {
  if (_force.k !== STATE || _force.v !== DATA_VER) { _force.k = STATE; _force.v = DATA_VER; _force.m.clear(); }
  const key = hb.id + '|' + upto; if (_force.m.has(key)) return _force.m.get(key);
  let s = 0;
  if (hb.freq === 'week') {
    const goal = hb.perWeek || 3, m = Math.pow(0.5, (7 * Math.sqrt(goal / 7)) / 13), end = weekStart(upto);
    let wk = addDays(end, -26 * 7); if (hb.created && weekStart(hb.created) > wk) wk = weekStart(hb.created);
    for (; wk <= end; wk = addDays(wk, 7)) {
      const g = weekGoal(hb, wk); if (!g) continue;
      const done = Array.from({ length: 7 }, (_, i) => addDays(wk, i)).filter(d => d <= upto && isDone(hb, d)).length;
      if (wk === end && done < g) continue;
      s = s * m + Math.min(1, done / g) * (1 - m);
    }
  } else {
    const f = (hb.days || [0, 1, 2, 3, 4, 5, 6]).length / 7, m = Math.pow(0.5, 1 / (13 * Math.sqrt(f || 1)));
    let d = addDays(upto, -120); if (hb.created && hb.created > d) d = hb.created;
    for (; d <= upto; d = addDays(d, 1)) {
      if (!scheduled(hb, d) || isSkipped(hb, d)) continue;
      const v = hb.type === 'count' && !(hb.auto && autoDone(hb, d)) ? Math.min(1, habitValue(hb, d) / (hb.goal || 1)) : isDone(hb, d) ? 1 : 0;
      if (d === upto && v < 1) continue; // la journée n'est pas finie
      s = s * m + v * (1 - m);
    }
  }
  _force.m.set(key, s * 100);
  return s * 100;
}

/* ----- score de discipline : habitudes, tâches, repas notés, journal -----
   On ne compte que ce que tu suis vraiment : la part repas n'existe que si tu as déjà noté un repas, la part journal que si tu as déjà écrit.
   Rien de prévu : pas de note (« – »), jamais un 0 / 100 au premier lancement. */
function disciplineParts(d) {
  const parts = [], hb = dayScore(d);
  if (hb.due) parts.push({ k: 'Habitudes', pct: hb.pct, w: 60, txt: `${fmtNum(hb.ok)} sur ${fmtNum(hb.due)}` });
  const due = P().tasks.filter(t => t.due === d || (t.done && t.doneOn === d));
  if (due.length) parts.push({ k: 'Tâches du jour', pct: (due.filter(t => t.done).length / due.length) * 100, w: 20, txt: `${due.filter(t => t.done).length} sur ${due.length}` });
  if (Object.keys(N().log).length) { const n = (N().log[d] || []).length; parts.push({ k: 'Repas', pct: n >= 2 ? 100 : 0, w: 10, txt: n >= 2 ? 'au moins deux notés' : `${n} noté(s), il en faut deux` }); }
  if (Object.keys(P().journal).length) { const j = P().journal[d]; parts.push({ k: 'Journal', pct: j && (j.mood || j.text) ? 100 : 0, w: 10, txt: j && (j.mood || j.text) ? 'rempli' : 'vide' }); }
  return parts;
}
function disciplineDay(d) {
  const parts = disciplineParts(d); if (!parts.length) return null;
  const w = sum(parts, p => p.w); return Math.round(sum(parts, p => p.pct * p.w) / w);
}
const disciplineWeek = days => { const v = days.filter(d => d <= today()).map(disciplineDay).filter(x => x !== null); return v.length ? Math.round(sum(v) / v.length) : null; };
const discTxt = v => (v === null ? '–' : `${v} / 100`);
function disciplineModal(d) {
  const parts = disciplineParts(d), w = sum(parts, p => p.w);
  modal(`Discipline, ${d === today() ? 'aujourd\'hui' : dateLabel(d)}`, h('div', null,
    parts.length ? h('div', { class: 'list' }, parts.map(p => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, p.k), h('small', { class: 'muted' }, ` · ${p.txt}`)), h('div', { class: 'right' }, fmtPct(p.pct, 0), h('small', { class: 'muted' }, ` x ${Math.round((p.w / w) * 100)} %`)))))
      : h('p', { class: 'muted' }, 'Rien de prévu ce jour : pas de note. Pose une habitude ou une tâche, et la note apparaît.'),
    h('small', { class: 'muted' }, 'Chaque part pèse selon son poids (habitudes 60, tâches 20, repas 10, journal 10), seulement si tu la suis. Jours de repos et pauses exclus.')), []);
}

let planDay = today(), planWeek = weekStart(today());

/* Quatre onglets au lieu de neuf (BENCHMARK, point 39). Rien ne disparaît : « Habitudes » porte aussi les objectifs, « Plus » porte tâches,
   journal, sport, relations et identité, chacun avec sa propre adresse (#/plan/taches...). « Plus » rouvre le dernier choisi. */
const PLAN_GROUPES = { habitudes: [['habitudes', 'Habitudes'], ['objectifs', 'Objectifs']], plus: [['taches', 'Tâches'], ['journal', 'Journal'], ['sport', 'Sport'], ['social', 'Relations'], ['identite', 'Qui je dois être']] };
let planPlus = 'taches';
MODULES.plan = {
  title: 'Plan de vie',
  subs: [['jour', "Aujourd'hui"], ['semaine', 'Semaine'], ['habitudes', 'Habitudes'], ['plus', 'Plus']],
  // toutes les vues, pour les tests et les adresses directes
  views: ['jour', 'semaine', 'habitudes', 'objectifs', 'taches', 'journal', 'sport', 'social', 'identite'],
  tabOf(sub) { for (const g in PLAN_GROUPES) if (PLAN_GROUPES[g].some(x => x[0] === sub)) return g; return sub; },
  render(root, sub) {
    if (sub === 'plus') sub = planPlus;
    if (PLAN_GROUPES.plus.some(x => x[0] === sub)) planPlus = sub;
    const g = this.tabOf(sub);
    if (PLAN_GROUPES[g]) root.append(h('nav', { class: 'seg segnav', 'aria-label': g === 'plus' ? 'Plus' : 'Habitudes et objectifs' }, PLAN_GROUPES[g].map(([k, l]) => h('a', { href: `#/plan/${k}`, class: k === sub ? 'on' : '', 'aria-current': k === sub ? 'page' : null }, l))));
    ({ jour: vueJour, semaine: vueSemaine, habitudes: vueHabitudes, objectifs: vueObjectifs, taches: vueTaches, journal: vueJournal, sport: vueSport, social: vueSocial, identite: vueIdentite }[sub] || vueJour)(root);
  }
};

/* ----- aujourd'hui ----- */
/* Ligne d'habitude : toute la ligne se touche (au moins 44 px de haut). Habitude à compter : − et +, et toucher le chiffre pour taper une valeur.
   Force (façon Loop) en premier, série d'affilée en petit. */
function habitRow(hb, d) {
  const done = isDone(hb, d), skipped = isSkipped(hb, d), s = streak(hb), wk = hb.freq === 'week' ? weekProgress(hb, weekStart(d)) : null, auto = hb.auto && autoDone(hb, d), force = strength(hb);
  const ctrl = hb.type === 'count'
    ? h('div', { class: 'stepper' }, h('button', { class: 'icon', 'aria-label': `${hb.name} : moins`, onclick: () => setHabit(hb, d, Math.max(0, habitValue(hb, d) - (hb.step || 1))) }, '−'),
      h('button', { class: 'count-val', 'aria-label': `${hb.name} : taper une valeur`, onclick: () => countModal(hb, d) }, `${fmtNum(habitValue(hb, d))} / ${fmtNum(hb.goal || 1)} ${hb.unit || ''}`),
      h('button', { class: 'icon', 'aria-label': `${hb.name} : plus`, onclick: () => setHabit(hb, d, habitValue(hb, d) + (hb.step || 1)) }, '+'))
    : h('input', { type: 'checkbox', checked: done, disabled: !!auto, 'aria-label': hb.name, onchange: () => toggleU(hb, d) });
  const onRow = e => { if (e.target.closest('button,input,a,select')) return; if (auto) return toast('Cochée toute seule par tes données'); if (hb.type === 'count') return countModal(hb, d); toggleU(hb, d); };
  return h('div', { class: `check habit ${done ? 'done' : ''} ${skipped ? 'dim' : ''}`, onclick: onRow }, hb.type === 'count' ? null : ctrl,
    h('span', { class: 'grow' }, hb.name, hb.detail ? h('small', { class: 'muted' }, ` · ${hb.detail}`) : '', hb.hh ? h('small', { class: 'muted' }, ` · ${hb.hh}`) : '', hb.auto ? h('span', { class: 'tag' }, 'auto') : '', wk ? h('small', { class: 'muted' }, ` · ${wk.done}/${wk.goal} cette semaine`) : '',
      hb.type === 'count' ? h('div', null, ctrl, progress((habitValue(hb, d) / (hb.goal || 1)) * 100, done ? 'ok' : 'gold')) : null),
    h('span', { class: 'force', title: 'Force de l\'habitude : le récent pèse plus, un oubli ne remet pas à zéro' }, `${Math.round(force)} %`, s > 1 ? h('small', { class: 'streak' }, ` · ${s}${hb.freq === 'week' ? ' sem.' : ' j'}`) : null),
    h('button', { class: 'icon', title: skipped ? 'Annuler le repos' : 'Jour de repos : ne casse pas la série', 'aria-label': skipped ? `${hb.name} : annuler le repos` : `${hb.name} : jour de repos`, onclick: () => toggleSkip(hb, d) }, skipped ? '▶' : '⏸'));
}
function countModal(hb, d) {
  const v = inp('text', String(habitValue(hb, d) || ''), { inputmode: 'decimal' });
  modal(hb.name, field(`Valeur du jour${hb.unit ? ` (${hb.unit})` : ''}, objectif ${fmtNum(hb.goal || 1)}`, v), [{ label: 'Enregistrer', run: () => { const r = garde(P().checks, d); setHabit(hb, d, Math.max(0, num(v.value))); undoable(`${hb.name} : ${fmtNum(num(v.value))} ${hb.unit || ''}`, r); } }]);
}
function vueJour(root) {
  const d = planDay, hbs = activeHabits().filter(x => scheduled(x, d)), ds = rate(hbs, d, d), todo = hbs.filter(x => !isSkipped(x, d));
  const done = todo.filter(x => isDone(x, d)).length, pct = todo.length ? (done / todo.length) * 100 : 0, nd = nutriDay(d);
  const j = P().journal[d] || {}, focusMin = P().focus[d] || 0, due = people_due();
  root.append(dayNav(d, v => { planDay = v; rerender(); }),
    h('div', { class: 'grid4' },
      h('div', { class: 'card stat' }, h('small', null, 'Habitudes'), ring(pct, todo.length ? `${done}/${todo.length}` : '–', 'faites')),
      h('button', { class: 'card stat click', onclick: () => disciplineModal(d), 'aria-label': 'Discipline du jour : voir le calcul' }, h('small', null, 'Discipline du jour'), h('div', { class: 'big' }, discTxt(disciplineDay(d))), h('small', { class: 'muted' }, 'toucher pour le calcul')),
      stat('Focus', `${fmtNum(focusMin)} min`, 'temps de concentration noté'),
      stat('Nutrition', nd ? `${fmtK(nd.t.kcal)} kcal` : '–', nd ? `micros ${fmtPct(nd.micro, 0)} · eau ${fmtNum(waterOf(d) / 1000)} L` : 'rien de noté')),
    h('div', { class: 'cols' },
      h('section', { class: 'card' }, h('h3', null, 'Habitudes du jour'),
        hbs.length ? SLOTS.map(([k, l]) => { const rows = hbs.filter(x => (x.slot || '') === k); return rows.length ? h('div', { class: 'group' }, h('small', { class: 'muted up' }, l), rows.map(hb => habitRow(hb, d))) : null; })
          : h('div', { class: 'empty' }, activeHabits().length ? 'Rien de prévu ce jour.' : 'Aucune habitude. Va dans « Habitudes » pour poser ton plan (sport, social, tâches, nutrition).')),
      h('div', { class: 'view' }, focusCard(), tasksToday(d))),
    h('div', { class: 'cols' }, journalQuick(d, j), h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Sport du jour'), h('button', { class: 'btn small', onclick: () => workoutModal(d) }, '+ Séance')),
      redoWorkouts(d),
      (w => w.length ? h('div', { class: 'list' }, w.map(x => h('div', { class: 'item' }, h('div', { class: 'grow' }, x.type, x.note ? h('small', { class: 'muted' }, ` · ${x.note}`) : null), h('b', null, `${x.min} min`), h('button', { class: 'icon', 'aria-label': `Supprimer la séance ${x.type}`, onclick: () => removeWorkout(x) }, '×')))) : h('div', { class: 'empty' }, 'Aucune séance notée.'))(P().workouts.filter(x => x.date === d)),
      due.length ? h('div', { class: 'group' }, h('small', { class: 'muted up' }, 'À relancer'), due.slice(0, 3).map(p => h('div', { class: 'item' }, h('div', { class: 'grow' }, p.name, h('small', { class: 'neg' }, ` ${p.late} j de retard`)), h('button', { class: 'btn small ghost', onclick: () => contacted(p) }, 'Fait')))) : null)));
}
function journalQuick(d, j) {
  const set = (k, v) => { const o = (P().journal[d] = P().journal[d] || {}); o[k] = v; save(); rerender(); };
  const note = h('textarea', { rows: 3, 'aria-label': 'Journal du jour', placeholder: "Ce que j'ai fait, appris, ce qui m'a freiné.", onchange: e => { const o = (P().journal[d] = P().journal[d] || {}); o.text = e.target.value.trim(); save(); } }); note.value = j.text || P().notes[d] || '';
  return h('section', { class: 'card' }, h('h3', null, 'Journal du jour'),
    h('div', { class: 'row wrap' }, h('small', null, 'Humeur'), stars(j.mood || 0, v => set('mood', v), 5, ['très bas', 'bas', 'moyen', 'bien', 'très bien']), h('small', null, 'Énergie'), stars(j.energy || 0, v => set('energy', v), 5)),
    h('div', { class: 'row', style: { margin: '.5rem 0' } }, h('small', null, 'Sommeil (h)'), inp('text', j.sleep ? String(j.sleep) : '', { inputmode: 'decimal', class: 'lim', 'aria-label': 'Heures de sommeil', onchange: e => set('sleep', num(e.target.value) || undefined) })), note);
}

/* ----- semaine et revue ----- */
function vueSemaine(root) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(planWeek, i)), hbs = activeHabits(), wr = rate(hbs, days[0], days[6]), last = addDays(planWeek, -7), lr = rate(hbs, last, addDays(last, 6));
  root.append(h('div', { class: 'row between wrap' },
    h('div', { class: 'monthnav' }, h('button', { class: 'icon', 'aria-label': 'Semaine précédente', onclick: () => { planWeek = addDays(planWeek, -7); rerender(); } }, '‹'),
      h('b', null, `Semaine du ${shortDate(days[0])} au ${shortDate(days[6])}`), h('button', { class: 'icon', 'aria-label': 'Semaine suivante', onclick: () => { planWeek = addDays(planWeek, 7); rerender(); } }, '›'),
      planWeek !== weekStart(today()) ? h('button', { class: 'btn small ghost', onclick: () => { planWeek = weekStart(today()); rerender(); } }, 'Cette semaine') : null),
    h('b', null, `Habitudes ${pctTxt(wr)}`, h('small', { class: 'muted' }, ` (${wr.ok}/${wr.due})${lr.pct !== null && wr.pct !== null ? `, ${wr.pct >= lr.pct ? '+' : ''}${fmtNum(wr.pct - lr.pct)} pt vs semaine d'avant` : ''}`))));
  if (hbs.length) root.append(h('section', { class: 'card scroll' }, h('table', { class: 'week' },
    h('thead', null, h('tr', null, h('th', null, ''), days.map((d, i) => h('th', { class: d === today() ? 'now' : '' }, JOURS[i], h('small', null, parseD(d).getDate()))), h('th', null, ''))),
    h('tbody', null, [...P().pillars, { id: null, name: 'Sans pilier' }].map(pl => { const rows = hbs.filter(x => (pl.id === null ? !P().pillars.some(p => p.id === x.pillar) : x.pillar === pl.id)); return rows.length ? [
      h('tr', { class: 'pill' }, h('td', { colspan: 9 }, pl.name)),
      rows.map(hb => { const done = days.filter(d => d <= today() && isDone(hb, d)).length;
        return h('tr', null, h('td', { class: 'name' }, hb.name), days.map(d => h('td', null, scheduled(hb, d) && d >= (hb.created || '')
          ? h('button', { class: `cell ${isDone(hb, d) ? 'on' : isSkipped(hb, d) ? 'rest' : d < today() ? 'miss' : ''}`, 'aria-label': `${hb.name}, ${dateLabel(d)}${isDone(hb, d) ? ', fait' : ''}`, onclick: () => (hb.auto && autoDone(hb, d) ? toast('Coché tout seul par tes données') : toggleU(hb, d)) }, isDone(hb, d) ? (hb.type === 'count' ? fmtNum(habitValue(hb, d)) : '✓') : isSkipped(hb, d) ? '⏸' : '')
          : h('span', { class: 'off', title: isPaused(hb, d) ? 'En pause' : 'Pas prévu' }, isPaused(hb, d) ? '–' : '·'))), h('td', { class: 'sc' }, hb.freq === 'week' ? `${done}/${weekGoal(hb, days[0])}` : `${rate([hb], days[0], days[6]).ok}/${rate([hb], days[0], days[6]).due}`)); })] : null; })))));
  else root.append(h('div', { class: 'empty' }, 'Aucune habitude pour l\'instant.'));
  root.append(h('section', { class: 'card' }, h('h3', null, 'Par pilier'), h('div', { class: 'list' }, P().pillars.map(pl => { const r = rate(hbs.filter(x => x.pillar === pl.id), days[0], days[6]); return r.due ? h('div', { class: 'item' }, h('div', { class: 'grow' }, h('b', null, pl.name), progress(r.pct, 'gold')), h('div', { class: 'right' }, pctTxt(r))) : null; }))),
    reviewCard(days));
}
function reviewCard(days) {
  const wk = days[0], rv = P().reviews[wk] || {}, tasks = P().tasks.filter(x => x.done && x.doneOn >= days[0] && x.doneOn <= days[6]);
  const wo = P().workouts.filter(x => x.date >= days[0] && x.date <= days[6]), js = days.map(d => P().journal[d]).filter(j => j && j.mood), nd = days.filter(d => (N().log[d] || []).length);
  const f = (k, label, ph) => { const t = h('textarea', { rows: 3, placeholder: ph, onchange: e => { rv[k] = e.target.value.trim(); if (!rv[k]) delete rv[k]; if (Object.keys(rv).length) P().reviews[wk] = rv; else delete P().reviews[wk]; save(); } }); t.value = rv[k] || ''; return field(label, t); };
  return h('section', { class: 'card gold' }, h('h3', null, 'Revue de la semaine'),
    h('div', { class: 'grid4' }, stat('Discipline', discTxt(disciplineWeek(days))), stat('Tâches finies', String(tasks.length)), stat('Sport', `${sum(wo, x => x.min)} min`, `${wo.length} séance(s)`), stat('Humeur moyenne', js.length ? fmtNum(sum(js, j => j.mood) / js.length) + ' / 5' : '–', `${nd.length} jour(s) de repas notés`)),
    h('div', { class: 'form' }, f('wins', 'Ce qui a bien marché', 'Mes victoires de la semaine'), f('lessons', 'Ce que j\'ai appris, ce qui a coincé', 'Où j\'ai décroché et pourquoi'), f('next', 'Mes trois priorités de la semaine prochaine', '1. 2. 3.')));
}

/* ----- habitudes ----- */
let habFocus = '';
function vueHabitudes(root) {
  const hbs = P().habits.slice().sort((a, b) => (a.archived ? 1 : 0) - (b.archived ? 1 : 0));
  const cells = [], t0 = today(), hm0 = addDays(weekStart(t0), -25 * 7), act = habFocus ? hbs.filter(x => x.id === habFocus) : activeHabits();
  for (let i = 0; i < 26 * 7; i++) { const d = addDays(hm0, i); if (d > t0) break; const r = rate(act, d, d); cells.push({ d, v: r.pct === null ? null : r.pct / 100, title: r.pct === null ? '' : `${Math.round(r.pct)} %` }); }
  const pz = (P().pauses || []).filter(p => p.to >= today()).sort((a, b) => a.from.localeCompare(b.from));
  put(root, h('div', { class: 'row between wrap' }, h('h2', null, 'Mes habitudes'), h('div', { class: 'row' }, h('button', { class: 'btn ghost', onclick: () => pauseModal(null) }, 'Pause pour toutes'), h('button', { class: 'btn', onclick: () => editHabit() }, '+ Ajouter'))),
    pz.length ? h('section', { class: 'card' }, h('h3', null, 'Pauses en cours ou à venir'), h('div', { class: 'list' }, pz.map(p => { const hb = p.habit ? P().habits.find(x => x.id === p.habit) : null; return h('div', { class: 'item' },
      h('div', { class: 'grow' }, h('b', null, hb ? hb.name : 'Toutes les habitudes'), h('small', { class: 'muted' }, ` · du ${shortDate(p.from)} au ${shortDate(p.to)}`)),
      h('button', { class: 'btn small ghost', onclick: () => { const u = garde(P(), 'pauses'); P().pauses = P().pauses.filter(x => x !== p); save(); rerender(); undoable('Pause retirée', u); } }, 'Retirer')); }))) : null,
    h('section', { class: 'card' }, h('div', { class: 'row between wrap' }, h('h3', null, 'Six derniers mois'), sel([['', 'Toutes les habitudes'], ...activeHabits().map(x => [x.id, x.name])], habFocus, { 'aria-label': 'Habitude montrée sur six mois', onchange: e => { habFocus = e.target.value; rerender(); } })), heatmap(cells), h('small', { class: 'muted' }, 'Plus c\'est clair et doré, plus la journée était tenue. Les jours de repos ne comptent pas.')));
  if (!hbs.length) root.append(h('div', { class: 'empty' }, 'Pose ici ce que tu veux tenir : sport, activité, social, tâches de fond, repas. Une habitude peut se cocher, se compter (2 L d\'eau), ou se cocher toute seule à partir de tes données.'));
  const last84 = Array.from({ length: 84 }, (_, k) => addDays(today(), -k)), last84dow = last84.map(dow); // calculés une fois pour toutes les habitudes
  root.append(h('div', { class: 'list' }, hbs.map(hb => {
    const r = rate([hb], addDays(today(), -29), today()), s = streak(hb);
    const wd = Array.from({ length: 7 }, (_, i) => { const days = last84.filter((d, k) => last84dow[k] === i && scheduled(hb, d) && !isSkipped(hb, d)); return days.length ? days.filter(d => isDone(hb, d)).length / days.length : null; });
    return h('div', { class: `card ${hb.archived ? 'dim' : ''}` }, h('div', { class: 'row between wrap' },
      h('div', { class: 'grow' }, h('b', null, hb.name), h('small', { class: 'muted' }, ` · ${pillarName(hb.pillar)} · `, hb.freq === 'week' ? `${hb.perWeek || 3} fois par semaine` : (hb.days || []).length === 7 ? 'tous les jours' : (hb.days || []).map(i => JOURS[i]).join(' '), hb.type === 'count' ? ` · objectif ${hb.goal} ${hb.unit || ''}` : '', hb.auto ? ' · automatique' : '')),
      h('div', { class: 'row' }, h('span', { title: 'Force de l\'habitude : le récent pèse plus, un oubli ne remet pas à zéro' }, h('small', { class: 'muted' }, 'force '), h('b', null, `${Math.round(strength(hb))} %`)), h('small', { class: 'muted' }, ` · ${pctTxt(r)} sur 30 j · série ${s} · record ${bestStreak(hb)}`))),
      h('div', { class: 'bars wide', style: { height: '46px', margin: '.5rem 0' } }, wd.map((v, i) => h('div', { class: 'bar-col' }, h('div', { class: 'bar-single' }, h('div', { class: 'bar in', style: { height: `${(v || 0) * 100}%` }, title: v === null ? 'pas prévu' : fmtPct(v * 100, 0) })), h('small', null, JOURS[i][0])))),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn small ghost', onclick: () => editHabit(hb) }, 'Modifier'), h('button', { class: 'btn small ghost', onclick: () => pauseModal(hb) }, 'Pause'),
        h('button', { class: 'btn small ghost', onclick: () => { const u = garde(hb, 'archived'); hb.archived = !hb.archived; save(); rerender(); undoable(`${hb.name} ${hb.archived ? 'archivée' : 'réactivée'}`, u); } }, hb.archived ? 'Réactiver' : 'Archiver'),
        h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Supprimer « ${hb.name} » et son historique ?`)) { const u = [garde(P(), 'habits'), garde(P(), 'checks')]; P().habits = P().habits.filter(x => x !== hb); for (const d in P().checks) { delete P().checks[d][hb.id]; if (!Object.keys(P().checks[d]).length) delete P().checks[d]; } save(); rerender(); undoable(`${hb.name} supprimée`, u); } } }, 'Supprimer')));
  })));
}
/* Modèles d'habitudes en un geste (création et accueil). pillar : nom du pilier de départ, s'il existe encore. */
const MODELES = [
  { name: 'Sport', freq: 'week', perWeek: 3, auto: 'workout', pillar: 'Sport', why: 'se coche avec une séance notée' },
  { name: 'Marcher 30 minutes', pillar: 'Activité', slot: 'journee' },
  { name: 'Lire 20 minutes', pillar: 'Activité', slot: 'soir' },
  { name: 'Boire assez d\'eau', auto: 'water', pillar: 'Nutrition', why: 'se coche quand l\'objectif d\'eau est atteint' },
  { name: 'Dormir 7 heures', auto: 'sleep7', pillar: 'Activité', why: 'se coche avec le sommeil noté au journal' },
  { name: 'Pas d\'écran après 22 h', pillar: 'Activité', slot: 'soir' },
  { name: 'Appeler un proche', freq: 'week', perWeek: 1, pillar: 'Social' },
  { name: 'Méditer 10 minutes', pillar: 'Activité', slot: 'matin' },
  { name: 'Écrire mon journal', auto: 'journal', pillar: 'Activité', slot: 'soir', why: 'se coche quand le journal est rempli' },
  { name: 'Protéines atteintes', auto: 'prot', pillar: 'Nutrition', why: 'se coche avec les repas notés' }
];
function habitFromModel(m) {
  const pl = P().pillars.find(p => p.name === m.pillar) || P().pillars[0];
  return { id: uid(), created: today(), name: m.name, detail: '', pillar: pl ? pl.id : '', type: 'check', goal: 1, unit: '', step: 1, freq: m.freq || 'days', perWeek: m.perWeek || 3, days: [0, 1, 2, 3, 4, 5, 6], slot: m.slot || '', hh: '', auto: m.auto || '' };
}
/* Nouvelle habitude : le nom et la fréquence suffisent, le reste est sous « Plus d'options ». Entrée enregistre.
   Les champs « à compter » n'apparaissent que pour une habitude à compter. */
function editHabit(hb) {
  const n = !hb, o = hb || { name: '', detail: '', pillar: P().pillars[0] ? P().pillars[0].id : '', type: 'check', goal: 1, unit: '', step: 1, freq: 'days', perWeek: 3, days: [0, 1, 2, 3, 4, 5, 6], slot: '', hh: '', auto: '' };
  const f = {
    name: inp('text', o.name, { placeholder: 'Ex. Salle de sport' }), detail: inp('text', o.detail || '', { placeholder: 'Précision (durée, lieu)' }), pillar: sel(P().pillars.map(p => [p.id, p.name]), o.pillar),
    type: sel([['check', 'À cocher'], ['count', 'À compter (quantité par jour)']], o.type || 'check'), goal: inp('text', String(o.goal || 1), { inputmode: 'decimal' }), unit: inp('text', o.unit || '', { placeholder: 'verres, pages, min...' }), step: inp('text', String(o.step || 1), { inputmode: 'decimal' }),
    freq: sel([['days', 'Certains jours de la semaine'], ['week', 'Un nombre de fois par semaine']], o.freq || 'days'), perWeek: inp('text', String(o.perWeek || 3), { inputmode: 'decimal' }),
    slot: sel(SLOTS.map(x => [x[0], x[1]]), o.slot || ''), hh: inp('time', o.hh || ''), auto: sel(AUTOS, o.auto || '')
  };
  const days = new Set(o.days || [0, 1, 2, 3, 4, 5, 6]);
  const boxes = h('div', { class: 'row wrap' }, JOURS.map((j, i) => h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: days.has(i), onchange: e => { if (e.target.checked) days.add(i); else days.delete(i); } }), j)));
  const perWeek = field('Combien de fois par semaine', f.perWeek), countBox = h('div', { class: 'grid-form' }, field('Objectif du jour', f.goal), field('Unité', f.unit), field('Pas du bouton +', f.step));
  const waterHint = h('p', { class: 'small unk' });
  const show = () => {
    boxes.style.display = f.freq.value === 'days' ? '' : 'none'; perWeek.style.display = f.freq.value === 'week' ? '' : 'none'; countBox.style.display = f.type.value === 'count' ? '' : 'none';
    // une habitude « eau » qui se compte à la main ferait doublon avec l'eau notée en Nutrition
    const eau = /\beau\b/i.test(f.name.value) && f.auto.value !== 'water';
    fill(waterHint, eau ? ['L\'eau se note déjà dans Nutrition. ', h('button', { class: 'btn small ghost', type: 'button', onclick: () => { f.auto.value = 'water'; f.type.value = 'check'; show(); } }, 'La cocher toute seule quand l\'objectif d\'eau est atteint')] : []);
    waterHint.style.display = eau ? '' : 'none';
  };
  [f.freq, f.type, f.auto].forEach(x => x.addEventListener('change', show)); f.name.addEventListener('input', show);
  const fillModel = m => { f.name.value = m.name; f.freq.value = m.freq || 'days'; f.perWeek.value = String(m.perWeek || 3); f.auto.value = m.auto || ''; f.slot.value = m.slot || ''; const pl = P().pillars.find(p => p.name === m.pillar); if (pl) f.pillar.value = pl.id; f.type.value = 'check'; show(); f.name.focus(); };
  const models = n ? h('div', { class: 'chips' }, h('small', { class: 'muted' }, 'Modèles :'), MODELES.map(m => h('button', { class: 'chip pick', type: 'button', title: m.why || '', onclick: () => fillModel(m) }, m.name))) : null;
  const more = h('details', { class: 'more', open: !n }, h('summary', null, 'Plus d\'options : pilier, type, moment, rappel, coche automatique'),
    h('div', { class: 'form' }, field('Pilier', f.pillar), field('Précision', f.detail), field('Type', f.type), countBox,
      h('div', { class: 'grid-form' }, field('Moment de la journée', f.slot), field('Heure du rappel', f.hh, 'Rappel avec « Fait » et « Plus tard », panneau ouvert')), field('Comment elle se coche', f.auto)));
  show();
  modal(n ? 'Nouvelle habitude' : `Modifier ${o.name}`, h('div', { class: 'form' }, models, field('Nom', f.name), waterHint, field('Fréquence', f.freq), boxes, perWeek, more),
    [{ label: 'Enregistrer', run: () => {
      if (!f.name.value.trim()) { toast('Donne-lui un nom'); return false; }
      if (f.freq.value === 'days' && !days.size) { toast('Choisis au moins un jour'); return false; }
      const v = { name: f.name.value.trim(), detail: f.detail.value.trim(), pillar: f.pillar.value, type: f.type.value, goal: num(f.goal.value) || 1, unit: f.unit.value.trim(), step: num(f.step.value) || 1, freq: f.freq.value, perWeek: Math.max(1, Math.min(7, Math.round(num(f.perWeek.value) || 3))), days: [...days].sort(), slot: f.slot.value, hh: f.hh.value, auto: f.auto.value };
      const u = garde(P(), 'habits');
      if (n) P().habits.push({ id: uid(), created: today(), ...v }); else Object.assign(hb, v);
      save(); rerender(); undoable(n ? `${v.name} ajoutée` : `${v.name} modifiée`, u);
    } }]);
}
/* Pause sur une période, pour une habitude ou pour toutes */
function pauseModal(hb) {
  const from = inp('date', today()), to = inp('date', addDays(today(), 6));
  modal(hb ? `Mettre en pause : ${hb.name}` : 'Pause pour toutes les habitudes', h('div', { class: 'form' }, h('div', { class: 'two' }, field('Du', from), field('Au', to)),
    h('small', { class: 'muted' }, 'Vacances, maladie : ces jours ne comptent ni pour la série, ni pour la force, ni pour la discipline. On retire une pause dans Habitudes.')),
    [{ label: 'Mettre en pause', run: () => {
      if (!from.value || !to.value || to.value < from.value) { toast('Une date de fin après le début'); return false; }
      const u = garde(P(), 'pauses'); (P().pauses = P().pauses || []).push({ id: uid(), from: from.value, to: to.value, habit: hb ? hb.id : '' });
      save(); rerender(); undoable(`Pause du ${shortDate(from.value)} au ${shortDate(to.value)}`, u);
    } }]);
}
