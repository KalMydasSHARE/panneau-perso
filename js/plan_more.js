'use strict';
/* KalMydas PERSO : Plan de vie, la suite. Focus, tâches, objectifs, journal, sport, relations, identité. */

function notify(msg) { try { if ('Notification' in window && Notification.permission === 'granted') new Notification('KalMydas perso', { body: msg }); } catch { /* pas de notification */ } }
function beep() { try { const ac = new (window.AudioContext || window.webkitAudioContext)(), o = ac.createOscillator(), g = ac.createGain(); o.connect(g); g.connect(ac.destination); g.gain.value = 0.1; o.frequency.value = 880; o.start(); setTimeout(() => { o.stop(); ac.close(); }, 500); } catch { /* pas de son */ } }

/* ----- focus : minuteur de concentration, noté dans la journée ----- */
let focusTick = null;
function finishTimer() {
  const t = P().timer; if (!t) return;
  // on compte le temps réellement passé (Terminer maintenant après 5 minutes = 5 minutes), au jour où le focus s'est fini
  const endAt = Math.min(Date.now(), t.start + t.mins * 60000), mins = Math.max(0, Math.round((endAt - t.start) / 60000)), d = ymd(new Date(endAt));
  if (mins) P().focus[d] = (P().focus[d] || 0) + mins;
  const task = P().tasks.find(x => x.id === t.task); if (task && mins) task.focus = (task.focus || 0) + mins;
  P().timer = null; save(); notify(`Focus terminé : ${mins} minutes`); beep(); rerender();
}
function focusCard() {
  const t = P().timer, el = h('div');
  if (t && Date.now() >= t.start + t.mins * 60000) { setTimeout(finishTimer, 0); }
  const draw = () => {
    if (P().timer) {
      const rem = Math.max(0, Math.round((P().timer.start + P().timer.mins * 60000 - Date.now()) / 1000)), task = P().tasks.find(x => x.id === P().timer.task);
      fill(el, h('div', { class: 'timer' }, `${pad(Math.floor(rem / 60))}:${pad(rem % 60)}`), task ? h('small', { class: 'muted' }, task.title) : null, progress(100 - (rem / (P().timer.mins * 60)) * 100, 'gold'),
        h('div', { class: 'row', style: { marginTop: '.6rem' } }, h('button', { class: 'btn small', onclick: finishTimer }, 'Terminer maintenant'), h('button', { class: 'btn small ghost', onclick: () => { P().timer = null; save(); rerender(); } }, 'Annuler')));
      if (rem <= 0) { clearInterval(focusTick); setTimeout(finishTimer, 0); } // jamais au milieu d'un rendu
    } else {
      const m = sel([['15', '15 min'], ['25', '25 min'], ['50', '50 min'], ['90', '90 min']], '25', { 'aria-label': 'Durée du focus' }), tk = sel([['', 'Sans tâche précise'], ...P().tasks.filter(x => !x.done).slice(0, 30).map(x => [x.id, x.title])], '', { 'aria-label': 'Tâche du focus' });
      el.replaceChildren(h('div', { class: 'row wrap' }, m, tk, h('button', { class: 'btn small', onclick: () => { try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* ignore */ } P().timer = { start: Date.now(), mins: +m.value, task: tk.value }; save(); rerender(); } }, 'Démarrer')),
        h('small', { class: 'muted' }, `Aujourd'hui : ${fmtNum(P().focus[today()] || 0)} min de focus.`));
    }
  };
  draw(); clearInterval(focusTick); if (P().timer) focusTick = setInterval(() => { if (el.isConnected) draw(); else clearInterval(focusTick); }, 1000);
  return h('section', { class: 'card' }, h('h3', null, 'Focus'), el);
}

/* ----- tâches ----- */
const PRIO = { 1: 'Haute', 2: 'Normale', 3: 'Basse' };
function nextDue(t) { // prochaine échéance après aujourd'hui, au même rythme (une tâche faite en retard ne renaît pas déjà en retard)
  const base = t.due || today(), step = n => (t.rec === 'd' ? addDays(base, n) : t.rec === 'w' ? addDays(base, 7 * n) : addMonthsDay(base, n));
  let n = 1, d = step(1);
  while (d <= today() && n < 1000) d = step(++n);
  return d;
}
// Avec « Annuler » : le message rend la tâche et la copie d'une tâche répétée comme avant
function completeTaskU(t) {
  const u = garde(P(), 'tasks'), was = t.done;
  completeTask(t);
  undoable(was ? `${t.title} : rouverte` : `${t.title} : faite`, u);
}
function completeTask(t) {
  t.done = !t.done; t.doneOn = t.done ? today() : undefined;
  if (t.done && t.rec) { const id = uid(); P().tasks.push({ ...t, id, done: false, doneOn: undefined, next: undefined, due: nextDue(t), sub: (t.sub || []).map(s => ({ ...s, done: false })), focus: 0 }); t.next = id; }
  else if (!t.done && t.next) { // décochée par erreur : on retire la copie créée au moment où on l'avait cochée, si elle n'a pas encore servi
    const c = P().tasks.find(x => x.id === t.next); if (c && !c.done) P().tasks = P().tasks.filter(x => x !== c);
    delete t.next;
  }
  save(); rerender();
}
/* Tâche écrite en clair : « Appeler le garage demain 9h ! ». Tout se lit ici, sur l'appareil.
   Reconnu : aujourd'hui, demain, après-demain, un jour de la semaine (le prochain), « dans 3 jours / 2 semaines / 1 mois », « le 12 », « 12.11 »,
   « le 12 novembre » ; « chaque jour / semaine / mois / lundi », « tous les jours » ; une heure « 9h », « 9h30 », « 14:00 » ; une durée « 30 min »,
   « pendant 2h » ; « ! » seul pour la priorité haute. Pas deviné en silence : « 1300 » reste dans le titre, « mensuel » aussi.
   Chaque morceau lu est montré avant l'ajout, et un geste le rend au titre. Rend { title, due, hh, rec, prio, min, parts }. */
const JOURS_RE = 'lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche';
const MOIS_RE = MOIS.map(m => m.replace('é', '[ée]').replace('û', '[ûu]')).join('|');
const moisIdx = s => MOIS.findIndex(m => normFood(m) === normFood(s));
function parseTask(text, ref = today(), skip = new Set()) {
  let s = ' ' + text + ' ';
  const parts = [], out = { due: '', hh: '', rec: '', prio: 0, min: 0 };
  const take = (kind, re, fn) => {
    if (skip.has(kind) || parts.some(p => p.kind === kind)) return;
    const m = s.match(re); if (!m) return;
    const r = fn(m); if (!r) return;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    parts.push({ kind, raw: m[0].trim(), label: r });
  };
  const nextDow = (i, strict) => { let d = ref; for (let k = 0; k < 8; k++) { if (dow(d) === i && (!strict || d !== ref)) return d; d = addDays(d, 1); } return ref; };
  const lbl = d => `${JOURS[dow(d)]}. ${shortDate(d)}`;
  take('prio', /\s!{1,3}(?=\s)/, () => { out.prio = 1; return 'priorité haute'; });
  take('rec', new RegExp(`\\s(?:chaque|tous les|toutes les)\\s+(jours?|semaines?|mois|${JOURS_RE})(?=[\\s,.!])`, 'i'), m => {
    const w = m[1].toLowerCase();
    if (/^jour/.test(w)) { out.rec = 'd'; return 'chaque jour'; }
    if (/^semaine/.test(w)) { out.rec = 'w'; return 'chaque semaine'; }
    if (w === 'mois') { out.rec = 'm'; return 'chaque mois'; }
    out.rec = 'w'; out.due = nextDow(JOURS_LONG.indexOf(w), false); return `chaque ${w}, dès le ${lbl(out.due)}`;
  });
  take('min', /\s(?:pendant|durée|duree|pour)\s+(\d{1,2})\s?h(?:\s?(\d{1,2}))?(?:\s?min)?(?=[\s,.!])/i, m => { out.min = +m[1] * 60 + (+m[2] || 0); return `durée ${dureeTxt(out.min)}`; });
  take('min', /\s(\d{1,3})\s?min(?:utes?)?(?=[\s,.!])/i, m => { out.min = +m[1]; return `durée ${dureeTxt(out.min)}`; });
  if (!out.due) {
    take('due', /\s(aujourd'hui|aujourd’hui|auj|ce soir)(?=[\s,.!])/i, () => { out.due = ref; return `aujourd'hui, ${lbl(ref)}`; });
    take('due', /\s(apr[eè]s-demain)(?=[\s,.!])/i, () => { out.due = addDays(ref, 2); return `après-demain, ${lbl(out.due)}`; });
    take('due', /\s(demain)(?=[\s,.!])/i, () => { out.due = addDays(ref, 1); return `demain, ${lbl(out.due)}`; });
    take('due', /\sdans\s+(\d{1,3})\s+(jours?|semaines?|mois)(?=[\s,.!])/i, m => { const n = +m[1], u = m[2].toLowerCase(); out.due = /^jour/.test(u) ? addDays(ref, n) : /^semaine/.test(u) ? addDays(ref, 7 * n) : addMonthsDay(ref, n); return `${m[0].trim()}, ${lbl(out.due)}`; });
    take('due', new RegExp(`\\s(?:le\\s+)?(\\d{1,2})\\s+(${MOIS_RE})(?:\\s+(\\d{4}))?(?=[\\s,.!])`, 'i'), m => {
      const mo = moisIdx(m[2]); if (mo < 0) return null; let y = +m[3] || +ref.slice(0, 4), d = `${y}-${pad(mo + 1)}-${pad(+m[1])}`;
      if (parseD(d).getDate() !== +m[1]) return null; if (!m[3] && d < ref) d = `${y + 1}-${pad(mo + 1)}-${pad(+m[1])}`; out.due = d; return lbl(d);
    });
    take('due', /\s(?:le\s+)?(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=[\s,!]|\.\s)/, m => {
      const dd = +m[1], mm = +m[2]; if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
      let y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +ref.slice(0, 4), d = `${y}-${pad(mm)}-${pad(dd)}`;
      if (parseD(d).getDate() !== dd) return null; if (!m[3] && d < ref) d = `${y + 1}-${pad(mm)}-${pad(dd)}`; out.due = d; return lbl(d);
    });
    take('due', /\sle\s+(\d{1,2})(?=[\s,.!])(?!\s*h)/i, m => { // « le 12 » : le prochain 12 du mois
      const dd = +m[1]; if (dd < 1 || dd > 31) return null; let mk = ref.slice(0, 7);
      for (let k = 0; k < 3; k++, mk = addMonths(mk, 1)) { const d = `${mk}-${pad(dd)}`; if (parseD(d).getDate() === dd && d >= ref) { out.due = d; return lbl(d); } }
      return null;
    });
    take('due', new RegExp(`\\s(${JOURS_RE})(?:\\s+prochain)?(?=[\\s,.!])`, 'i'), m => { out.due = nextDow(JOURS_LONG.indexOf(m[1].toLowerCase()), true); return `${m[1].toLowerCase()}, ${lbl(out.due)}`; });
  }
  take('hh', /\s(?:à\s+|a\s+|vers\s+)?([01]?\d|2[0-3])\s?h(?:\s?([0-5]\d))?(?=[\s,.!])/i, m => { out.hh = `${pad(+m[1])}:${m[2] || '00'}`; return `à ${out.hh}`; });
  take('hh', /\s(?:à\s+|a\s+|vers\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=[\s,.!])/i, m => { out.hh = `${pad(+m[1])}:${m[2]}`; return `à ${out.hh}`; });
  take('prio', /\s!{1,3}(?=\s)/, () => { out.prio = 1; return 'priorité haute'; }); // « 9h! » : le ! se détache une fois l'heure lue
  if (out.hh && !out.due) out.due = ref; // une heure sans jour : aujourd'hui
  out.title = s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/^[\s,;:-]+|[\s,;:-]+$/g, '').trim();
  const ordre = ['rec', 'due', 'hh', 'min', 'prio']; // montrés dans l'ordre où on les lit : quand, à quelle heure, combien de temps, priorité
  out.parts = parts.sort((a, b) => ordre.indexOf(a.kind) - ordre.indexOf(b.kind));
  return out;
}
const dureeTxt = m => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ' ' + pad(m % 60) : ''}` : `${m} min`);
function taskRow(t, opts = {}) {
  const late = !t.done && t.due && t.due < today(), subDone = (t.sub || []).filter(s => s.done).length;
  return h('div', { class: `check ${t.done ? 'done' : ''}`, onclick: e => { if (!e.target.closest('button,input,a')) completeTaskU(t); } }, h('input', { type: 'checkbox', checked: t.done, 'aria-label': t.title, onchange: () => completeTaskU(t) }),
    h('span', { class: 'grow' }, h('span', { class: `prio${t.prio || 2}` }, t.prio === 1 ? '● ' : ''), t.title,
      t.due && !(opts.auj && t.due === today()) ? h('small', { class: late ? 'neg' : 'muted' }, late ? ` en retard depuis le ${shortDate(t.due)}` : ` pour le ${shortDate(t.due)}`) : '', // auj : sur le Panneau, « pour aujourd'hui » va de soi t.hh ? h('small', { class: 'muted' }, ` à ${t.hh}`) : '', t.min ? h('small', { class: 'muted' }, ` · ${dureeTxt(t.min)}`) : '',
      t.rec ? h('span', { class: 'tag' }, { d: 'chaque jour', w: 'chaque semaine', m: 'chaque mois' }[t.rec]) : '',
      (t.sub || []).length ? h('small', { class: 'muted' }, ` · ${subDone}/${t.sub.length}`) : '', t.focus ? h('small', { class: 'muted' }, ` · ${t.focus} min de focus`) : '', t.goal && P().goals.find(g => g.id === t.goal) ? h('span', { class: 'tag' }, P().goals.find(g => g.id === t.goal).title) : ''),
    opts.later && !t.done ? h('button', { class: 'btn small ghost', 'aria-label': `Reporter ${t.title} à demain`, onclick: () => postpone(t) }, 'Demain') : null,
    h('button', { class: 'icon', 'aria-label': `Modifier ${t.title}`, onclick: () => editTask(t) }, '✎'));
}
function postpone(t) { const u = garde(P(), 'tasks'); t.due = addDays(today(), 1); save(); rerender(); undoable(`${t.title} : reportée à demain`, u); }
function addTaskForm(defaults = {}) {
  const tt = inp('text', '', { placeholder: 'Nouvelle tâche, puis Entrée', 'aria-label': 'Nouvelle tâche' }), td = inp('date', defaults.due || '', { 'aria-label': 'Date' }), tp = sel([['1', 'Haute'], ['2', 'Normale'], ['3', 'Basse']], '2', { 'aria-label': 'Priorité' });
  const skip = new Set(), preview = h('div', { class: 'parse', 'aria-live': 'polite' });
  const read = () => parseTask(tt.value, today(), skip);
  const show = () => {
    const r = read();
    fill(preview, r.parts.length ? [h('small', { class: 'muted' }, 'Compris :'), r.parts.map(p => h('span', { class: 'chip lu' }, h('span', null, p.label), h('button', { type: 'button', class: 'chip-x', 'aria-label': `Ne pas lire « ${p.raw} », le garder dans le titre`, onclick: () => { skip.add(p.kind); show(); tt.focus(); } }, '×')))]
      : defaults.hint && !tt.value ? h('small', { class: 'muted' }, 'Écris en clair : « Appeler le garage demain 9h ! ». Jour, heure, durée (« 30 min »), répétition (« chaque lundi ») et « ! » sont lus et montrés avant l\'ajout.') : null);
  };
  show();
  tt.addEventListener('input', () => { if (!tt.value.trim()) skip.clear(); show(); });
  const add = () => {
    const r = read(); if (!r.title && !tt.value.trim()) return;
    const u = garde(P(), 'tasks'), t = { id: uid(), title: r.title || tt.value.trim(), pillar: '', due: r.due || td.value, hh: r.hh || undefined, rec: r.rec || '', min: r.min || undefined, prio: r.prio || +tp.value, done: false, sub: [] };
    P().tasks.push(t); save(); rerender();
    // la tâche peut partir sur un autre jour que l'écran : le message dit où elle est
    undoable(`« ${t.title} » ajoutée${t.due ? (t.due === today() ? ' pour aujourd\'hui' : ` pour le ${shortDate(t.due)}`) : ''}${t.hh ? ` à ${t.hh}` : ''}`, u);
  };
  tt.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  return h('div', { class: 'form tight' }, h('div', { class: 'row wrap' }, tt, td, tp, h('button', { class: 'btn small', onclick: add }, 'Ajouter')), preview);
}
/* Charge du jour (façon Sunsama) : durée facultative de chaque tâche contre le temps disponible (6 h par défaut, Réglages).
   Au-delà, l'écran le dit et chaque tâche porte « Demain ». */
const capMin = () => Math.round((STATE.settings.capH > 0 ? STATE.settings.capH : 6) * 60);
function dayLoad(d) {
  const open = P().tasks.filter(t => !t.done && t.due && t.due <= d && (d !== today() ? t.due === d : true));
  const timed = open.filter(t => t.min > 0);
  return { total: sum(timed, t => t.min), timed: timed.length, untimed: open.length - timed.length, cap: capMin() };
}
function loadLine(d) {
  const L = dayLoad(d); if (!L.timed) return null;
  const over = L.total > L.cap;
  return h('div', { class: `load${over ? ' over' : ''}` }, h('div', { class: 'row between wrap' },
    h('small', { class: over ? 'neg' : 'muted' }, over ? `Tu prévois ${dureeTxt(L.total)} pour ${dureeTxt(L.cap)} disponibles.` : `Charge prévue : ${dureeTxt(L.total)} sur ${dureeTxt(L.cap)}.`),
    L.untimed ? h('small', { class: 'muted' }, `${L.untimed} tâche(s) sans durée`) : null), progress((L.total / L.cap) * 100, over ? 'bad' : 'gold'));
}
function tasksToday(d) {
  const list = P().tasks.filter(t => (!t.done ? (t.due ? t.due <= d : t.prio === 1) : t.doneOn === d)).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.prio || 2) - (b.prio || 2) || (a.due || '9').localeCompare(b.due || '9') || (a.hh || '99').localeCompare(b.hh || '99'));
  const over = d === today() && dayLoad(d).total > capMin();
  return h('section', { class: 'card' }, h('h3', null, 'Tâches du jour'), addTaskForm({ due: d }), d === today() ? loadLine(d) : null, list.length ? h('div', { class: 'list' }, list.map(t => taskRow(t, { later: over }))) : h('div', { class: 'empty' }, 'Aucune tâche pour aujourd\'hui.'));
}
let taskView = 'open';
function vueTaches(root) {
  const t0 = today(), wk = addDays(t0, 7), all = P().tasks;
  const f = { open: x => !x.done, today: x => !x.done && x.due && x.due <= t0, week: x => !x.done && x.due && x.due <= wk, nodate: x => !x.done && !x.due, done: x => x.done }[taskView];
  const list = all.filter(f).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.prio || 2) - (b.prio || 2) || (a.due || '9').localeCompare(b.due || '9') || (a.hh || '99').localeCompare(b.hh || '99'));
  const over = dayLoad(t0).total > capMin();
  put(root, h('div', { class: 'row between wrap' }, h('h2', null, 'Tâches'), seg([['open', 'À faire'], ['today', 'Aujourd\'hui'], ['week', '7 jours'], ['nodate', 'Sans date'], ['done', 'Faites']], taskView, v => { taskView = v; rerender(); })),
    h('section', { class: 'card' }, addTaskForm({ hint: true }), taskView === 'done' ? null : loadLine(t0), list.length ? h('div', { class: 'list' }, list.slice(0, 200).map(t => taskRow(t, { later: over && t.due && t.due <= t0 }))) : h('div', { class: 'empty' }, 'Rien ici.')),
    taskView === 'done' && list.length ? h('button', { class: 'btn small danger', onclick: () => { if (confirm('Effacer toutes les tâches faites ?')) { const u = garde(P(), 'tasks'); P().tasks = P().tasks.filter(x => !x.done); save(); rerender(); undoable('Tâches faites effacées', u); } } }, 'Vider les tâches faites') : null);
}
function editTask(t) {
  const f = { title: inp('text', t.title), due: inp('date', t.due || ''), hh: inp('time', t.hh || ''), min: inp('text', t.min ? String(t.min) : '', { inputmode: 'numeric', placeholder: 'facultatif' }), prio: sel([['1', 'Haute'], ['2', 'Normale'], ['3', 'Basse']], String(t.prio || 2)), rec: sel([['', 'Une seule fois'], ['d', 'Chaque jour'], ['w', 'Chaque semaine'], ['m', 'Chaque mois']], t.rec || ''),
    pillar: sel([['', '(aucun)'], ...P().pillars.map(p => [p.id, p.name])], t.pillar || ''), goal: sel([['', '(aucun)'], ...P().goals.filter(g => !g.done).map(g => [g.id, g.title])], t.goal || ''), notes: h('textarea', { rows: 3 }) };
  f.notes.value = t.notes || '';
  const subs = (t.sub || []).map(s => ({ ...s })), subBox = h('div', { class: 'list' });
  const drawSubs = () => subBox.replaceChildren(...subs.map((s, i) => h('div', { class: 'check' }, h('input', { type: 'checkbox', checked: s.done, onchange: e => { s.done = e.target.checked; } }), inp('text', s.t, { oninput: e => { s.t = e.target.value; } }), h('button', { class: 'icon', onclick: () => { subs.splice(i, 1); drawSubs(); } }, '×'))));
  drawSubs();
  modal('Modifier la tâche', h('div', { class: 'form' }, field('Titre', f.title), h('div', { class: 'grid-form' }, field('Date', f.due), field('Heure', f.hh), field('Durée prévue (min)', f.min), field('Priorité', f.prio), field('Répétition', f.rec), field('Pilier', f.pillar), field('Objectif', f.goal)),
    field('Sous-tâches', h('div', null, subBox, h('button', { class: 'btn small ghost', type: 'button', onclick: () => { subs.push({ t: '', done: false }); drawSubs(); } }, '+ Sous-tâche'))), field('Notes', f.notes)),
    [{ label: 'Supprimer', cls: 'btn danger', run: () => { const u = garde(P(), 'tasks'); P().tasks = P().tasks.filter(x => x !== t); save(); rerender(); undoable(`${t.title} supprimée`, u); } },
      { label: 'Enregistrer', run: () => { if (!f.title.value.trim()) return false; Object.assign(t, { title: f.title.value.trim(), due: f.due.value, hh: f.hh.value || undefined, min: Math.round(num(f.min.value)) > 0 ? Math.round(num(f.min.value)) : undefined, prio: +f.prio.value, rec: f.rec.value, pillar: f.pillar.value, goal: f.goal.value, notes: f.notes.value.trim(), sub: subs.filter(s => s.t.trim()) }); save(); rerender(); } }]);
}

/* ----- objectifs avec jalons ----- */
function goalProgress(g) {
  if (g.metric && g.metric.target !== g.metric.start) return clamp(((g.metric.cur - g.metric.start) / (g.metric.target - g.metric.start)) * 100, 0, 100);
  const ms = g.ms || []; return ms.length ? (ms.filter(m => m.done).length / ms.length) * 100 : (g.done ? 100 : 0);
}
function vueObjectifs(root) {
  const goals = P().goals.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.due || '9').localeCompare(b.due || '9'));
  root.append(h('div', { class: 'row between' }, h('h2', null, 'Mes objectifs'), h('button', { class: 'btn', onclick: () => editGoal() }, '+ Ajouter')),
    h('p', { class: 'muted' }, 'Un objectif a une date, une raison, et soit une valeur à atteindre (80 kg, 10 000 CHF), soit des jalons à cocher. Les tâches peuvent s\'y rattacher.'));
  if (!goals.length) root.append(h('div', { class: 'empty' }, 'Aucun objectif. Pose-en un pour les 90 prochains jours.'));
  root.append(h('div', { class: 'list' }, goals.map(g => {
    const pr = goalProgress(g), left = g.due ? daysBetween(today(), g.due) : null, created = g.created || today();
    const span = g.due ? Math.max(1, daysBetween(created, g.due)) : null, expected = span ? clamp(((span - left) / span) * 100, 0, 100) : null;
    const verdict = g.done ? h('span', { class: 'chip ok' }, 'Atteint') : expected === null ? null : left < 0 ? h('span', { class: 'chip bad' }, `Date dépassée de ${-left} j`) : pr + 8 >= expected ? h('span', { class: 'chip ok' }, 'Dans les temps') : h('span', { class: 'chip bad' }, `En retard : ${fmtNum(expected)} % attendus`);
    const tasks = P().tasks.filter(t => t.goal === g.id);
    return h('div', { class: `card ${g.done ? 'dim' : ''}` }, h('div', { class: 'row between wrap' }, h('div', null, h('b', null, g.title), h('small', { class: 'muted' }, ` · ${pillarName(g.pillar)}${g.due ? ` · pour le ${shortDate(g.due)}${left >= 0 ? `, ${left} j` : ''}` : ''}`)), verdict),
      g.why ? h('div', { class: 'muted small' }, `Pourquoi : ${g.why}`) : null, progress(pr, 'gold'),
      g.metric ? h('div', { class: 'row between' }, h('small', null, `${fmtNum(g.metric.start)} → ${fmtNum(g.metric.target)} ${g.metric.unit || ''}`), h('div', { class: 'row' }, h('b', null, `${fmtNum(g.metric.cur)} ${g.metric.unit || ''}`), h('button', { class: 'btn small ghost', onclick: () => { const v = inp('text', String(g.metric.cur), { inputmode: 'decimal' }); modal('Valeur actuelle', field(g.metric.unit || 'Valeur', v), [{ label: 'Enregistrer', run: () => { g.metric.cur = num(v.value); if (goalProgress(g) >= 100) g.done = true; save(); rerender(); } }]); } }, 'Mettre à jour'))) : null,
      (g.ms || []).length ? h('div', { class: 'list' }, g.ms.map(m => h('label', { class: `check ${m.done ? 'done' : ''}` }, h('input', { type: 'checkbox', checked: m.done, onchange: e => { m.done = e.target.checked; if (goalProgress(g) >= 100) g.done = true; save(); rerender(); } }), h('span', { class: 'grow' }, m.t)))) : null,
      tasks.length ? h('small', { class: 'muted' }, `${tasks.filter(t => t.done).length}/${tasks.length} tâche(s) liées faites`) : null,
      h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: () => editGoal(g) }, 'Modifier'), h('button', { class: 'btn small ghost', onclick: () => { g.done = !g.done; save(); rerender(); } }, g.done ? 'Rouvrir' : 'Marquer atteint')));
  })));
}
function editGoal(g) {
  const n = !g, o = g || { title: '', pillar: P().pillars[0] ? P().pillars[0].id : '', why: '', due: '', metric: null, ms: [] };
  const f = { title: inp('text', o.title, { placeholder: 'Ex. Descendre à 78 kg' }), pillar: sel(P().pillars.map(p => [p.id, p.name]), o.pillar), why: inp('text', o.why || '', { placeholder: 'Pourquoi ça compte' }), due: inp('date', o.due || ''),
    unit: inp('text', o.metric ? o.metric.unit : '', { placeholder: 'kg, CHF, km...' }), start: inp('text', o.metric ? String(o.metric.start) : '', { inputmode: 'decimal' }), target: inp('text', o.metric ? String(o.metric.target) : '', { inputmode: 'decimal' }) };
  const ms = (o.ms || []).map(m => ({ ...m })), box = h('div', { class: 'list' });
  const draw = () => box.replaceChildren(...ms.map((m, i) => h('div', { class: 'check' }, h('input', { type: 'checkbox', checked: m.done, onchange: e => { m.done = e.target.checked; } }), inp('text', m.t, { oninput: e => { m.t = e.target.value; } }), h('button', { class: 'icon', onclick: () => { ms.splice(i, 1); draw(); } }, '×'))));
  draw();
  modal(n ? 'Nouvel objectif' : `Modifier ${o.title}`, h('div', { class: 'form' }, field('Objectif', f.title), field('Pilier', f.pillar), field('Pourquoi', f.why), field('Date visée', f.due),
    h('small', { class: 'muted up' }, 'Valeur à atteindre (facultatif)'), h('div', { class: 'grid-form' }, field('Unité', f.unit), field('Départ', f.start), field('Cible', f.target)),
    field('Jalons', h('div', null, box, h('button', { class: 'btn small ghost', type: 'button', onclick: () => { ms.push({ id: uid(), t: '', done: false }); draw(); } }, '+ Jalon')))),
    [{ label: 'Enregistrer', run: () => {
      if (!f.title.value.trim()) return false;
      const metric = f.target.value.trim() !== '' && f.start.value.trim() !== '' ? { unit: f.unit.value.trim(), start: num(f.start.value), target: num(f.target.value), cur: o.metric ? o.metric.cur : num(f.start.value) } : null;
      const v = { title: f.title.value.trim(), pillar: f.pillar.value, why: f.why.value.trim(), due: f.due.value, metric, ms: ms.filter(m => m.t.trim()) };
      if (n) P().goals.push({ id: uid(), created: today(), done: false, ...v }); else Object.assign(g, v);
      save(); rerender();
    } }]);
}

/* ----- journal ----- */
/* Ce qui va avec l'humeur, sur 90 jours : humeur moyenne les jours avec une habitude faite, une séance, une étiquette d'humeur, contre les jours sans.
   Rien sous 7 jours de chaque côté. Un lien, jamais une cause : l'écran le dit. Rend [{ label, a, b, na, nb }], le plus grand écart d'abord. */
const LIEN_MIN = 7;
function moodLinks(to = today(), span = 90) {
  const days = Array.from({ length: span }, (_, i) => addDays(to, i - span + 1)).filter(d => P().journal[d] && P().journal[d].mood);
  const mood = d => P().journal[d].mood, mean = a => sum(a, mood) / a.length, out = [];
  const add = (label, yes, no) => { if (yes.length >= LIEN_MIN && no.length >= LIEN_MIN) out.push({ label, a: mean(yes), b: mean(no), na: yes.length, nb: no.length }); };
  for (const hb of activeHabits()) {
    if (hb.auto === 'journal') continue; // se coche avec le journal : toujours vraie les jours notés
    const due = days.filter(d => scheduled(hb, d) && !isSkipped(hb, d));
    add(`« ${hb.name} »`, due.filter(d => isDone(hb, d)), due.filter(d => !isDone(hb, d)));
  }
  const sport = new Set(P().workouts.map(w => w.date));
  add('une séance de sport', days.filter(d => sport.has(d)), days.filter(d => !sport.has(d)));
  const tagged = days.filter(d => (P().journal[d].tags || []).length); // étiquettes : seulement les jours où l'on en a mis
  for (const t of TAGS_HUMEUR) add(`« ${t} »`, tagged.filter(d => P().journal[d].tags.includes(t)), tagged.filter(d => !P().journal[d].tags.includes(t)));
  return out.sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b));
}
function vueJournal(root) {
  // la fiche du jour n'est créée qu'à la première saisie : regarder un jour ne laisse pas de fiche vide derrière soi
  const d = planDay, j = P().journal[d] || {}, keep = () => { if (Object.keys(j).length) P().journal[d] = j; else delete P().journal[d]; save(); };
  const set = (k, v) => { j[k] = v; if (v === undefined || v === '' || v === 0) delete j[k]; keep(); rerender(); };
  const grat = [0, 1, 2].map(i => inp('text', (j.grat || [])[i] || '', { placeholder: `Gratitude ${i + 1}`, onchange: e => { j.grat = j.grat || ['', '', '']; j.grat[i] = e.target.value.trim(); if (!j.grat.some(Boolean)) delete j.grat; keep(); } }));
  const wins = h('textarea', { rows: 2, placeholder: 'Une victoire du jour, même petite', onchange: e => { j.wins = e.target.value.trim(); if (!j.wins) delete j.wins; keep(); } }); wins.value = j.wins || '';
  const text = h('textarea', { rows: 5, placeholder: 'Écris librement.', onchange: e => { j.text = e.target.value.trim(); if (!j.text) delete j.text; keep(); } }); text.value = j.text || '';
  const days = Array.from({ length: 30 }, (_, i) => addDays(today(), i - 29)), J = x => P().journal[x] || {};
  const pts = k => days.map((x, i) => ({ x: i, y: J(x)[k] ? J(x)[k] : NaN }));
  // ce que le journal apprend : humeur les jours bien tenus, humeur après une bonne nuit
  const disc = new Map(days.map(x => [x, disciplineDay(x)])); // null : rien de prévu ce jour, ni bon ni mauvais
  const withMood = days.filter(x => J(x).mood), good = withMood.filter(x => disc.get(x) !== null && disc.get(x) >= 70), bad = withMood.filter(x => disc.get(x) !== null && disc.get(x) < 50);
  const slept = withMood.filter(x => J(x).sleep), s7 = slept.filter(x => J(x).sleep >= 7), s6 = slept.filter(x => J(x).sleep < 7), mean = (a, k) => sum(a, x => J(x)[k]) / a.length;
  const insights = [];
  if (good.length >= 3 && bad.length >= 3) insights.push(`Les jours où tu tiens ton plan (discipline 70 et plus), ton humeur moyenne est de ${fmtNum(mean(good, 'mood'))} sur 5, contre ${fmtNum(mean(bad, 'mood'))} les jours sous 50.`);
  if (s7.length >= 3 && s6.length >= 3) insights.push(`Après 7 heures de sommeil ou plus, ton humeur est de ${fmtNum(mean(s7, 'mood'))} sur 5, contre ${fmtNum(mean(s6, 'mood'))} sous 7 heures.`);
  const links = moodLinks().slice(0, 6);
  for (const l of links) insights.push(`Les jours avec ${l.label} : humeur ${fmtNum(l.a)} contre ${fmtNum(l.b)} sans (${l.na} jours contre ${l.nb}).`);
  const jOk = x => P().journal[x] && (P().journal[x].mood || P().journal[x].text);
  let streakJ = 0; for (let x = jOk(today()) ? today() : addDays(today(), -1); P().journal[x] && (P().journal[x].mood || P().journal[x].text); x = addDays(x, -1)) streakJ++;
  root.append(dayNav(d, v => { planDay = v; rerender(); }),
    h('div', { class: 'cols' }, h('section', { class: 'card' }, h('h3', null, 'Ce jour'),
      h('div', { class: 'form' }, field('Humeur', stars(j.mood || 0, v => set('mood', v), 5, ['très bas', 'bas', 'moyen', 'bien', 'très bien'])), field('Énergie', stars(j.energy || 0, v => set('energy', v), 5)), field('Stress', stars(j.stress || 0, v => set('stress', v), 5)),
        field('Sommeil (heures)', inp('text', j.sleep ? String(j.sleep) : '', { inputmode: 'decimal', onchange: e => set('sleep', num(e.target.value) || undefined) })), field('Trois choses dont je suis reconnaissant', h('div', { class: 'form' }, grat)), field('Victoire du jour', wins), field('Écrit libre', text))),
      h('div', { class: 'view' }, h('section', { class: 'card gold' }, h('h3', null, 'Ce que ton journal montre'), insights.length ? insights.map(t => h('p', null, t)) : h('p', { class: 'muted' }, 'Après une dizaine de jours notés (humeur et sommeil), le journal te dira ce qui va avec ton humeur.'),
          links.length ? h('small', { class: 'muted' }, `Sur 90 jours. Un lien, pas une cause : d'autres choses jouent. Rien n'est montré sous ${LIEN_MIN} jours de chaque côté.`) : null, h('p', null, h('small', { class: 'muted' }, `Série de journal : ${streakJ} jour(s).`))),
        h('section', { class: 'card' }, h('h3', null, 'Humeur et énergie, 30 jours'), linesChart([{ name: 'Humeur', color: 'var(--gold)', pts: pts('mood') }, { name: 'Énergie', color: 'var(--pos)', pts: pts('energy') }], { min: 1, max: 5, xlabels: [shortDate(days[0]), shortDate(days[29])] })),
        h('section', { class: 'card' }, h('h3', null, 'Sommeil, 30 jours'), barsChart(days.map(x => ({ label: String(parseD(x).getDate()), v: J(x).sleep || 0, cls: J(x).sleep && J(x).sleep < 7 ? 'out' : 'in' })), { goal: 8 })))));
}

/* ----- sport ----- */
const SPORTS = ['Musculation', 'Course', 'Marche', 'Vélo', 'Natation', 'Sport collectif', 'Arts martiaux', 'Yoga, mobilité', 'Autre'];
// Noter une séance avec « Annuler »
function addWorkout(w) {
  const u = garde(P(), 'workouts'); P().workouts.push({ id: uid(), ...w }); save(); rerender();
  undoable(`${w.type}, ${w.min} min notée${w.date !== today() ? ` le ${shortDate(w.date)}` : ''}`, u);
}
function removeWorkout(x) { const u = garde(P(), 'workouts'); P().workouts = P().workouts.filter(y => y !== x); save(); rerender(); undoable(`Séance ${x.type} supprimée`, u); }
// Les trois dernières séances différentes (type, durée, intensité), à refaire en un geste
function lastWorkouts(n = 3) {
  const out = [], seen = new Set();
  // séance détaillée : même liste d'exercices = même séance
  for (const w of P().workouts.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.end || 0) - (a.end || 0))) { const k = w.sets && w.sets.length ? 'series|' + [...new Set(w.sets.map(s => s.ex))].sort().join(',') : `${w.type}|${w.min}|${w.rpe}`; if (seen.has(k)) continue; seen.add(k); out.push(w); if (out.length >= n) break; }
  return out;
}
const RPE = ['facile', 'léger', 'moyen', 'dur', 'à fond'];
function redoWorkouts(d) {
  const ws = lastWorkouts(), cur = P().muscu;
  if (!ws.length && !cur) return null;
  return h('div', { class: 'chips' }, cur ? h('button', { class: 'chip pick ok', onclick: () => muscuSheet() }, `Musculation en cours depuis ${hm(cur.start)} · reprendre`) : null,
    ws.length ? h('small', { class: 'muted' }, 'Refaire :') : null,
    ws.map(w => (w.sets && w.sets.length
      // une séance détaillée se refait série par série : ses exercices et ses charges reviennent, rien n'est noté avant les coches
      ? h('button', { class: 'chip pick', 'aria-label': `Refaire la musculation : ${[...new Set(w.sets.map(s => s.ex))].join(', ')}`, onclick: () => muscuStart(w) }, `+ Musculation · ${[...new Set(w.sets.map(s => s.ex))].length} exercice(s)`)
      : h('button', { class: 'chip pick', 'aria-label': `Refaire ${w.type}, ${w.min} minutes, ${RPE[(w.rpe || 3) - 1]}`, onclick: () => addWorkout({ date: d, type: w.type, min: w.min, rpe: w.rpe || 3, note: w.note || '' }) }, `+ ${w.type} · ${w.min} min · ${RPE[(w.rpe || 3) - 1]}`))));
}
// Fenêtre complète, pré-remplie avec la dernière séance du même type (type de la dernière séance au départ)
function workoutModal(d) {
  const last = P().workouts.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const f = { date: inp('date', d || today()), type: sel(SPORTS, last ? last.type : SPORTS[0]), min: inp('text', last ? String(last.min) : '', { inputmode: 'decimal', placeholder: 'minutes' }), note: inp('text', '', { placeholder: 'Ce que j\'ai fait' }) }; let rpe = last ? last.rpe || 3 : 3;
  const rate = h('div'); const drawR = () => rate.replaceChildren(stars(rpe, v => { rpe = v || 3; drawR(); }, 5, RPE));
  f.type.addEventListener('change', () => { const w = P().workouts.filter(x => x.type === f.type.value).sort((a, b) => b.date.localeCompare(a.date))[0]; if (w) { f.min.value = String(w.min); rpe = w.rpe || 3; drawR(); } });
  drawR();
  // Musculation : on peut noter série par série (charges de la dernière fois, repos qui part tout seul)
  const detail = h('div', { class: 'row wrap' }, h('small', { class: 'muted grow' }, 'Ou série par série : charges reprises de la dernière fois, repos automatique.'), h('button', { class: 'btn small ghost', type: 'button', onclick: () => { close(); muscuStart(); } }, 'Noter série par série'));
  const showDetail = () => { detail.style.display = f.type.value === 'Musculation' ? '' : 'none'; };
  f.type.addEventListener('change', showDetail); showDetail();
  const close = modal('Séance de sport', h('div', { class: 'form' }, field('Type', f.type), detail, field('Durée (min)', f.min), field('Intensité', rate), field('Date', f.date), field('Note', f.note)),
    [{ label: 'Enregistrer', run: () => { const m = num(f.min.value); if (m <= 0) { toast('Mets la durée'); return false; } addWorkout({ date: f.date.value || today(), type: f.type.value, min: m, rpe, note: f.note.value.trim() }); } }], { focus: f.min });
}
function vueSport(root) {
  const target = PF().weekMin || 150, wk = weekStart(today()), W = P().workouts, min = (a, b) => sum(W.filter(x => x.date >= a && x.date <= b), x => x.min);
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(wk, (i - 7) * 7)), vol = weeks.map(w => min(w, addDays(w, 6)));
  let streakW = 0; for (let i = 7; i >= 0; i--) { if (vol[i] >= target) streakW++; else if (i === 7) continue; else break; }
  root.append(h('div', { class: 'row between wrap' }, h('h2', null, 'Sport et activité'), h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost', onclick: () => muscuStart() }, P().muscu ? 'Musculation en cours' : 'Musculation, série par série'), h('button', { class: 'btn', onclick: () => workoutModal() }, '+ Séance'))),
    redoWorkouts(today()),
    h('div', { class: 'grid4' }, h('div', { class: 'card stat' }, h('small', null, 'Cette semaine'), ring(Math.min(100, (vol[7] / target) * 100), `${vol[7]}`, `/ ${target} min`)), stat('Séances cette semaine', String(W.filter(x => x.date >= wk).length)), stat('Semaines de suite', String(streakW), `objectif ${target} min`), stat('Total 30 jours', `${min(addDays(today(), -29), today())} min`)),
    h('section', { class: 'card' }, h('h3', null, 'Minutes par semaine'), barsChart(weeks.map((w, i) => ({ label: parseD(w).getDate() + '.' + pad(parseD(w).getMonth() + 1), v: vol[i], cls: vol[i] >= target ? 'in' : 'out' })), { goal: target })),
    h('section', { class: 'card' }, h('h3', null, 'Séances récentes'), W.length ? h('div', { class: 'list' }, W.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(x => h('div', { class: 'item' }, h('small', { class: 'muted date' }, shortDate(x.date)), h('div', { class: 'grow' }, x.type, x.note ? h('small', { class: 'muted' }, ` · ${x.note}`) : null, x.sets && x.sets.length ? setsSummary(x) : null), h('b', null, `${x.min} min`), h('small', { class: 'muted' }, ` effort ${x.rpe}/5`), h('button', { class: 'icon', 'aria-label': `Supprimer la séance ${x.type} du ${shortDate(x.date)}`, onclick: () => removeWorkout(x) }, '×')))) : h('div', { class: 'empty' }, 'Aucune séance notée. Marche, salle, course : tout compte.')));
}

/* ----- relations ----- */
// même règle partout : sans dernier contact, on compte depuis le jour où la personne a été ajoutée
function people_due() { return P().people.map(p => ({ ...p, late: daysBetween(addDays(p.last || p.added || today(), p.every || 30), today()) })).filter(p => p.late >= 0 && p.last !== today()).sort((a, b) => b.late - a.late); }
function contacted(p) { const o = P().people.find(x => x.id === p.id); if (o) { const u = garde(o, 'last'); o.last = today(); save(); rerender(); undoable(`${o.name} : contacté aujourd'hui`, u); } }
function vueSocial(root) {
  const people = P().people.map(p => { const next = addDays(p.last || p.added || today(), p.every || 30); return { p, next, late: daysBetween(next, today()) }; }).sort((a, b) => b.late - a.late);
  const onTime = people.filter(x => x.late < 0).length;
  put(root, h('div', { class: 'row between' }, h('h2', null, 'Relations et vie sociale'), h('button', { class: 'btn', onclick: () => editPerson() }, '+ Ajouter')),
    h('p', { class: 'muted' }, 'Les personnes qui comptent, et tous les combien de jours tu veux leur donner des nouvelles. Le panneau te dit qui attend.'),
    people.length ? h('div', { class: 'grid4' }, stat('Personnes suivies', String(people.length)), stat('À jour', `${onTime} / ${people.length}`), stat('À relancer', String(people.length - onTime))) : null);
  if (!people.length) root.append(h('div', { class: 'empty' }, 'Ajoute famille, amis, collègues, avec une fréquence : toutes les semaines, tous les mois.'));
  root.append(h('div', { class: 'list' }, people.map(({ p, late }) => h('div', { class: 'card item' }, h('div', { class: 'grow' }, h('b', null, p.name), h('small', { class: 'muted' }, ` · tous les ${p.every} jours · dernier contact ${p.last ? shortDate(p.last) : 'jamais'}`), p.note ? h('div', { class: 'muted small' }, p.note) : null,
    progress(late < 0 ? Math.min(100, ((p.every + late) / p.every) * 100) : 100, late >= 0 ? 'bad' : late > -3 ? 'warn' : 'ok')), h('b', { class: late >= 0 ? 'neg' : 'muted' }, late >= 0 ? `${late} j de retard` : `dans ${-late} j`),
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => contacted(p) }, 'Contacté'), h('button', { class: 'btn small ghost', onclick: () => editPerson(p) }, 'Modifier'))))));
  const bd = P().people.filter(p => p.bday).map(p => { const [m, d] = p.bday.slice(-5).split('-').map(Number); let x = new Date(new Date().getFullYear(), m - 1, d); if (x < new Date(new Date().setHours(0, 0, 0, 0))) x = new Date(x.getFullYear() + 1, m - 1, d); return { p, days: Math.round((x - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000) }; }).filter(x => x.days <= 30).sort((a, b) => a.days - b.days);
  if (bd.length) root.append(h('section', { class: 'card' }, h('h3', null, 'Anniversaires à venir'), h('div', { class: 'list' }, bd.map(x => h('div', { class: 'item' }, h('div', { class: 'grow' }, x.p.name), h('b', null, x.days === 0 ? 'aujourd\'hui' : `dans ${x.days} j`))))));
}
function editPerson(p) {
  const n = !p, o = p || { name: '', every: 30, last: '', note: '', bday: '' };
  const f = { name: inp('text', o.name), every: inp('text', String(o.every), { inputmode: 'decimal' }), last: inp('date', o.last || ''), bday: inp('date', o.bday || ''), note: inp('text', o.note || '', { placeholder: 'Sujets, à ne pas oublier' }) };
  modal(n ? 'Nouvelle personne' : `Modifier ${o.name}`, h('div', { class: 'form' }, field('Nom', f.name), field('Tous les combien de jours', f.every, '7 : chaque semaine, 30 : chaque mois'), field('Dernier contact', f.last), field('Anniversaire', f.bday), field('Note', f.note)),
    [...(n ? [] : [{ label: 'Supprimer', cls: 'btn danger', run: () => { P().people = P().people.filter(x => x !== p); save(); rerender(); } }]),
      { label: 'Enregistrer', run: () => { if (!f.name.value.trim()) return false; const v = { name: f.name.value.trim(), every: Math.max(1, Math.round(num(f.every.value) || 30)), last: f.last.value, bday: f.bday.value, note: f.note.value.trim() }; if (n) P().people.push({ id: uid(), added: today(), ...v }); else Object.assign(p, v); save(); rerender(); } }]);
}

/* ----- qui je dois être ----- */
function vueIdentite(root) {
  const t = h('textarea', { rows: 8, 'aria-label': 'La personne que je dois être', placeholder: 'Qui je veux être dans un an. Comment je me lève, je travaille, je mange, je traite les autres, je gère mon argent. Écris-le comme si c\'était déjà vrai.', onchange: e => { P().identity = e.target.value; save(); } });
  t.value = P().identity || '';
  const nr = inp('text', '', { placeholder: 'Une règle de vie, puis Entrée', 'aria-label': 'Nouvelle règle de vie', onkeydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { P().rules.push(e.target.value.trim()); save(); rerender(); } } });
  root.append(h('section', { class: 'card gold' }, h('h3', null, 'La personne que je dois être'), t),
    h('section', { class: 'card' }, h('h3', null, 'Mes règles de vie'), P().rules.length ? h('div', { class: 'list' }, P().rules.map((r, i) => h('div', { class: 'item' }, h('div', { class: 'grow' }, r), h('button', { class: 'icon', 'aria-label': 'Retirer', onclick: () => { P().rules.splice(i, 1); save(); rerender(); } }, '×')))) : h('div', { class: 'empty' }, 'Des phrases courtes que tu relis : « Pas d\'écran après 22 h », « Je note chaque dépense ».'), nr),
    h('div', { class: 'row between' }, h('h2', null, 'Mes piliers'), h('button', { class: 'btn', onclick: () => editPillar() }, '+ Ajouter')),
    h('div', { class: 'list' }, P().pillars.map(pl => {
      const hbs = activeHabits().filter(x => x.pillar === pl.id), r = rate(hbs, addDays(today(), -29), today());
      return h('div', { class: 'card item' }, h('div', { class: 'grow' }, h('b', null, pl.name), h('small', { class: 'muted' }, ` · ${hbs.length} habitude(s) · ${P().goals.filter(g => g.pillar === pl.id && !g.done).length} objectif(s)`), pl.vision ? h('div', { class: 'muted' }, pl.vision) : h('div', { class: 'muted small' }, 'Pas de phrase encore : décris ce que ce pilier doit donner.'), r.due ? progress(r.pct, 'gold') : null),
        h('div', { class: 'right' }, h('b', null, pctTxt(r)), h('small', { class: 'muted' }, ' sur 30 j')),
        h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: () => editPillar(pl) }, 'Modifier'),
          h('button', { class: 'btn small danger', onclick: () => { if (P().habits.some(x => x.pillar === pl.id)) return toast('Déplace ou supprime d\'abord ses habitudes, archivées comprises'); if (confirm(`Supprimer le pilier ${pl.name} ?`)) { P().pillars = P().pillars.filter(x => x !== pl); save(); rerender(); } } }, 'Supprimer')));
    })));
}
function editPillar(pl) {
  const n = !pl, name = inp('text', n ? '' : pl.name), vis = inp('text', n ? '' : pl.vision || '', { placeholder: 'Ce que ce pilier doit donner' });
  modal(n ? 'Nouveau pilier' : `Modifier ${pl.name}`, h('div', { class: 'form' }, field('Nom', name), field('Phrase de vision', vis)),
    [{ label: 'Enregistrer', run: () => { if (!name.value.trim()) return false; if (n) P().pillars.push({ id: uid(), name: name.value.trim(), vision: vis.value.trim() }); else { pl.name = name.value.trim(); pl.vision = vis.value.trim(); } save(); rerender(); } }]);
}
