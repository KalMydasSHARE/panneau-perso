'use strict';
/* KalMydas PERSO : séance de musculation détaillée, en option (façon Hevy et Strong, sans fil social ni récompense).
   Chaque exercice reprend les séries de la dernière fois (charge et répétitions) ; on coche une série d'un geste, le repos part tout seul
   (90 s par défaut, réglable), et une meilleure série que toutes les précédentes est signalée sobrement. La séance en cours est gardée dans
   le coffre (P().muscu) : un verrouillage ou un onglet fermé ne la perd pas. À la fin, elle devient une séance « Musculation » comme les autres,
   avec ses séries. Meilleure série : charge estimée pour une répétition (formule d'Epley, charge x (1 + répétitions / 30)), une estimation. */

const EXOS_BASE = ['Développé couché', 'Squat', 'Soulevé de terre', 'Développé militaire', 'Rowing barre', 'Tractions', 'Dips', 'Pompes', 'Tirage vertical', 'Presse à cuisses',
  'Fentes', 'Curl biceps', 'Extension triceps', 'Élévations latérales', 'Hip thrust', 'Gainage'];
const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);
const RESTS = [60, 90, 120, 180];
const restSec = () => (STATE.settings.rest > 0 ? STATE.settings.rest : 90);
// séances passées avec des séries, la plus récente d'abord
const muscuPast = () => P().workouts.filter(w => Array.isArray(w.sets) && w.sets.length).sort((a, b) => b.date.localeCompare(a.date) || (b.end || 0) - (a.end || 0));
// séries de la dernière fois pour cet exercice (vide s'il n'a jamais été fait)
function lastSets(name) { const w = muscuPast().find(x => x.sets.some(s => s.ex === name)); return w ? w.sets.filter(s => s.ex === name).map(s => ({ kg: s.kg, reps: s.reps, done: false })) : []; }
function bestOf(name) { let b = 0; for (const w of muscuPast()) for (const s of w.sets) if (s.ex === name) b = Math.max(b, e1rm(s.kg, s.reps)); return b; }
const exoNames = () => [...new Set([...muscuPast().flatMap(w => w.sets.map(s => s.ex)), ...EXOS_BASE])];

let muscuTick = null;
function muscuStop() { clearInterval(muscuTick); muscuTick = null; }
// Nouvelle séance (ou reprise de celle en cours). from : une séance passée dont on reprend les exercices
function muscuStart(from) {
  if (!P().muscu) {
    P().muscu = { start: Date.now(), restUntil: 0, ex: from ? [...new Set(from.sets.map(s => s.ex))].map(name => ({ name, sets: lastSets(name) })) : [] };
    save();
  }
  muscuSheet();
}
function muscuSheet() {
  const body = h('div', { class: 'form muscu' }), clock = h('div', { class: 'row between wrap muscu-clock', 'aria-live': 'off' });
  const M = () => P().muscu;
  const add = h('input', { type: 'text', list: 'exos-liste', placeholder: 'Ajouter un exercice', 'aria-label': 'Ajouter un exercice', 'data-noenter': '1',
    onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); addExo(); } } });
  const addExo = () => {
    const name = add.value.trim(); if (!name || !M()) return;
    if (M().ex.some(x => normFood(x.name) === normFood(name))) { add.value = ''; return toast('Déjà dans la séance'); }
    const prev = lastSets(name);
    M().ex.push({ name, sets: prev.length ? prev : [{ kg: '', reps: '', done: false }, { kg: '', reps: '', done: false }, { kg: '', reps: '', done: false }] });
    add.value = ''; save(); draw(); add.focus();
  };
  const tickClock = () => {
    const m = M(); if (!m) return;
    const now = Date.now(), rest = m.restUntil ? Math.ceil((m.restUntil - now) / 1000) : 0;
    if (m.restUntil && rest <= 0) { m.restUntil = 0; save(); beep(); if (document.hidden) notify('Repos fini'); }
    fill(clock, h('span', null, h('small', { class: 'muted' }, 'Séance '), h('b', null, durTxt(now - m.start))),
      m.restUntil ? h('span', { class: 'rest-on' }, 'Repos ', h('b', null, `${Math.floor(rest / 60)}:${pad(rest % 60)}`), ' ', h('button', { class: 'btn small ghost', onclick: () => { M().restUntil = 0; save(); tickClock(); } }, 'Passer'))
        : h('span', null, h('small', { class: 'muted' }, 'Repos '), sel(RESTS.map(s => [String(s), `${s} s`]), String(restSec()), { 'aria-label': 'Durée du repos entre deux séries', onchange: e => { STATE.settings.rest = +e.target.value; save(); } })));
  };
  const check = (x, s) => {
    if (!s.done && !(num(s.reps) > 0)) return toast('Mets le nombre de répétitions');
    const before = bestOf(x.name);
    s.kg = num(s.kg); s.reps = Math.round(num(s.reps)); s.done = !s.done;
    if (s.done) {
      M().restUntil = Date.now() + restSec() * 1000;
      if (before > 0 && e1rm(s.kg, s.reps) > before && !x.sets.some(o => o !== s && o.done && e1rm(o.kg, o.reps) >= e1rm(s.kg, s.reps))) toast(`Meilleure série sur ${x.name} : ${fmtNum(s.kg)} kg x ${s.reps}`);
    }
    save(); draw();
  };
  function draw() {
    const m = M(); if (!m) return;
    fill(body, clock,
      m.ex.length ? m.ex.map((x, xi) => {
        const best = bestOf(x.name), last = lastSets(x.name);
        return h('section', { class: 'exo' }, h('div', { class: 'row between' }, h('b', null, x.name),
          h('div', { class: 'row' }, last.length ? h('small', { class: 'muted' }, `dernière fois : ${last.map(s => `${fmtNum(s.kg)}x${s.reps}`).join(', ')}`) : h('small', { class: 'muted' }, 'première fois'),
            h('button', { class: 'icon', 'aria-label': `Retirer ${x.name} de la séance`, onclick: () => { M().ex.splice(xi, 1); save(); draw(); } }, '×'))),
          x.sets.map((s, si) => h('div', { class: `set${s.done ? ' done' : ''}` }, h('small', { class: 'muted set-n' }, String(si + 1)),
            inp('text', s.kg === '' ? '' : String(s.kg), { inputmode: 'decimal', class: 'lim', 'aria-label': `${x.name}, série ${si + 1}, charge en kg`, 'data-noenter': '1', onchange: e => { s.kg = e.target.value; save(); } }), h('small', null, 'kg'),
            inp('text', s.reps === '' ? '' : String(s.reps), { inputmode: 'numeric', class: 'lim', 'aria-label': `${x.name}, série ${si + 1}, répétitions`, 'data-noenter': '1', onchange: e => { s.reps = e.target.value; save(); },
              onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); s.reps = e.target.value; check(x, s); } } }), h('small', null, 'fois'),
            s.done && best > 0 && e1rm(s.kg, s.reps) > best ? h('span', { class: 'tag' }, 'meilleure') : null,
            h('button', { class: `set-ok${s.done ? ' on' : ''}`, 'aria-pressed': s.done ? 'true' : 'false', 'aria-label': `${x.name}, série ${si + 1} : ${s.done ? 'faite, toucher pour annuler' : 'cocher, le repos part'}`, onclick: () => check(x, s) }, '✓'),
            s.done ? null : h('button', { class: 'icon', 'aria-label': `Retirer la série ${si + 1}`, onclick: () => { x.sets.splice(si, 1); save(); draw(); } }, '×'))),
          h('button', { class: 'btn small ghost', onclick: () => { const l = x.sets[x.sets.length - 1]; x.sets.push({ kg: l ? l.kg : '', reps: l ? l.reps : '', done: false }); save(); draw(); } }, '+ Série'));
      }) : h('p', { class: 'muted' }, 'Ajoute ton premier exercice. La prochaine fois, ses séries reviennent toutes seules.'),
      h('div', { class: 'row' }, add, h('button', { class: 'btn small', onclick: addExo }, 'Ajouter')),
      h('datalist', { id: 'exos-liste' }, exoNames().map(n => h('option', { value: n }))));
    tickClock();
  }
  draw();
  muscuStop(); muscuTick = setInterval(() => { if (!body.isConnected || !STATE) return muscuStop(); tickClock(); }, 1000);
  modal('Musculation', body, [
    { label: 'Abandonner', cls: 'btn danger', run: () => { const u = garde(P(), 'muscu'); P().muscu = null; save(); rerender(); undoable('Séance abandonnée', u); } },
    { label: 'Plus tard', cls: 'btn ghost', run: () => { rerender(); } },
    { label: 'Terminer et noter', run: () => muscuFinish() }], { sheet: true, focus: body.querySelector('.set-ok:not(.on)') || add }); // séance reprise : la première série à cocher, sans ouvrir le clavier du téléphone
}
// La séance devient une séance « Musculation » : durée depuis le début (4 h au plus), séries faites seulement
function muscuFinish() {
  const m = P().muscu; if (!m) return;
  const sets = m.ex.flatMap(x => x.sets.filter(s => s.done).map(s => ({ ex: x.name, kg: num(s.kg), reps: Math.round(num(s.reps)) })));
  if (!sets.length) { toast('Aucune série cochée : rien à noter. « Abandonner » efface la séance.'); return false; }
  const exs = [...new Set(sets.map(s => s.ex))], min = clamp(Math.round((Date.now() - m.start) / 60000), 1, 240);
  const u = [garde(P(), 'muscu'), garde(P(), 'workouts')];
  P().workouts.push({ id: uid(), date: ymd(new Date(m.start)), type: 'Musculation', min, rpe: 3, note: `${exs.length} exercice(s), ${sets.length} série(s)`, sets, end: Date.now() });
  P().muscu = null; save(); rerender();
  undoable(`Musculation notée : ${min} min, ${sets.length} série(s)`, u);
}
// Détail d'une séance passée, pour la liste des séances
function setsSummary(w) {
  const by = new Map(); for (const s of w.sets) (by.get(s.ex) || by.set(s.ex, []).get(s.ex)).push(`${fmtNum(s.kg)}x${s.reps}`);
  return h('details', { class: 'more sets' }, h('summary', null, 'Séries'), h('div', { class: 'list' }, [...by].map(([ex, l]) => h('small', null, h('b', null, ex), ` : ${l.join(', ')}`))));
}
