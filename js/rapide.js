'use strict';
/* KalMydas PERSO : gestes rapides et filets de sécurité.
   - Jour qui avance tout seul : un onglet laissé ouvert après minuit passe au nouveau jour (sauf si l'on regardait exprès un autre jour).
   - Actions rapides (Panneau, bouton + sur téléphone, adresses #/rapide/...) : repas, verre d'eau, humeur, séance, jeûne. La dépense reste dans Argent.
   - Accueil guidé au premier lancement, chaque étape sautable.
   - Rappels des habitudes avec « Fait » et « Plus tard », quand le panneau est ouvert et déverrouillé.
   - Clavier : raccourcis et aide « ? ».
   - Sauvegarde : rappel d'export, dossier de sauvegarde automatique (Chrome et Edge), fichiers toujours chiffrés. */

/* ---------- jour courant ---------- */
let DAY = today();
// Le repas proposé suit l'heure, sauf s'il a été choisi à la main il y a moins de 30 minutes ou qu'un aliment est en cours de saisie
function mealRoll(force) {
  if (ADD.pick) return;
  if (force || Date.now() - ADD.mealAt > 30 * 60000) ADD.meal = mealNow();
}
/* Nouveau jour : chaque écran qui montrait « aujourd'hui » passe au nouveau jour. Un jour choisi exprès dans le passé ne bouge pas.
   Rend vrai si le jour a changé. */
function dayRoll() {
  const td = today();
  if (td === DAY) { mealRoll(); return false; }
  const old = DAY; DAY = td;
  if (nDay === old) nDay = td;
  if (planDay === old) planDay = td;
  if (planWeek === weekStart(old)) planWeek = weekStart(td);
  if (planWk === weekStart(old)) planWk = weekStart(td);
  if (typeof TXF !== 'undefined' && TXF.date === old) TXF.date = td; // date proposée pour une dépense (état d'Argent, le fichier n'est pas touché)
  if (typeof curMonth !== 'undefined' && curMonth === monthKey(old)) curMonth = monthKey(td);
  mealRoll(true);
  return true;
}

/* ---------- actions rapides ---------- */
const QUICK = [['repas', 'Repas', '◔'], ['eau', 'Verre d\'eau', '◍'], ['humeur', 'Humeur', '☺'], ['seance', 'Séance', '▲'], ['jeune', 'Jeûne', '◷']];
function quickAction(k) {
  if (!STATE) return;
  if (k === 'repas') return quickMeal();
  if (k === 'eau') return addWater(today(), glassMl());
  if (k === 'humeur') return moodSheet();
  if (k === 'seance') return quickWorkout();
  if (k === 'jeune') return quickFast();
}
function quickBar() {
  return h('nav', { class: 'quick', 'aria-label': 'Actions rapides' }, QUICK.map(([k, l, ic]) => h('button', { class: 'quick-btn', onclick: () => quickAction(k), 'aria-label': k === 'eau' ? `Ajouter un verre d'eau de ${glassMl()} ml` : l },
    h('i', { 'aria-hidden': 'true' }, ic), h('span', null, k === 'eau' ? `+ ${glassMl()} ml` : l))));
}
// Bouton + flottant sur téléphone : les mêmes actions, depuis n'importe quel écran
function fab() {
  return h('button', { class: 'fab', 'aria-label': 'Actions rapides', onclick: () => {
    const close = modal('Ajouter', h('div', { class: 'quick sheet-quick', onclick: e => { if (e.target.closest('button')) setTimeout(close, 0); } }, QUICK.map(([k, l, ic]) => h('button', { class: 'quick-btn', onclick: () => setTimeout(() => quickAction(k), 0) }, h('i', { 'aria-hidden': 'true' }, ic), h('span', null, k === 'eau' ? `+ ${glassMl()} ml` : l)))), [], { sheet: true });
  } }, '+');
}
/* Repas en feuille : refaire hier, habituels de l'heure avec +, recherche. Tout s'ajoute au jour d'aujourd'hui. */
function quickMeal() {
  const d = today(), body = h('div', { class: 'form' }), st = { q: '', pick: null, g: '' };
  let close = () => {};
  const done = () => setTimeout(() => close(), 0);
  function draw() {
    const meal = sel(MEALS, ADD.meal, { 'aria-label': 'Repas', onchange: e => { ADD.meal = e.target.value; ADD.mealAt = Date.now(); draw(); } });
    const hab = habituels(ADD.meal, 8);
    const q = h('input', { type: 'search', value: st.q, placeholder: 'Chercher un aliment', 'aria-label': 'Chercher un aliment', autocomplete: 'off', oninput: e => { st.q = e.target.value; st.pick = null; list(); },
      onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); const f = searchFoods(st.q, 8)[0]; if (f) pick(f); } } });
    const res = h('div', { class: 'results' });
    const pick = f => { st.pick = f; st.g = String(defaultG(f)); draw(); };
    function list() { fill(res, st.q.trim() && !st.pick ? h('div', { class: 'list' }, searchFoods(st.q, 8).map(f => pickLine(f, () => pick(f), (x, g) => { st.pick = x; st.g = String(g); draw(); }))) : null); }
    const redo = redoBlock(d);
    fill(body, h('div', { class: 'row' }, meal),
      redo ? h('div', { onclick: e => { if (e.target.closest('button')) done(); } }, redo) : null,
      hab.length ? h('div', { class: 'tiles' }, hab.map(f => { const g = defaultG(f); return h('div', { class: 'tile' }, h('button', { class: 'tile-name', onclick: () => pick(f) }, h('span', null, shortName(f.n)), h('small', { class: 'muted' }, quantiteTexte(f, g))),
        h('button', { class: 'tile-add', 'aria-label': `Ajouter ${f.n}, ${fmtNum(g)} g`, onclick: () => { logEntries(d, [{ meal: ADD.meal, food: f.id, name: f.n, g }], `${shortName(f.n)} : ${quantiteTexte(f, g)}`); done(); } }, '+')); })) : null,
      st.pick ? null : q, res,
      st.pick ? (() => {
        const g = inp('text', st.g, { inputmode: 'decimal', 'aria-label': 'Quantité en grammes', oninput: e => { st.g = e.target.value; }, onkeydown: e => { if (e.key === 'Enter') { e.preventDefault(); go(); } } });
        const go = () => { const v = num(g.value); if (v <= 0) return toast('Mets une quantité'); logEntries(d, [{ meal: ADD.meal, food: st.pick.id, name: st.pick.n, g: v }], `${shortName(st.pick.n)} : ${quantiteTexte(st.pick, v)}`); done(); };
        setTimeout(() => { g.focus(); g.select(); }, 0);
        const ports = portionsOf(st.pick);
        return h('div', { class: 'pick-row' }, h('div', { class: 'row' }, h('b', { class: 'grow' }, st.pick.n), h('button', { class: 'icon', 'aria-label': 'Choisir un autre aliment', onclick: () => { st.pick = null; draw(); } }, '×')),
          ports.length ? h('div', { class: 'chips' }, ports.map(p => h('button', { class: 'chip pick', onclick: () => { g.value = String(p.g); st.g = g.value; g.focus(); } }, `${p.label} · ${fmtNum(p.g)} g`))) : null,
          h('div', { class: 'row' }, g, h('small', { class: 'muted' }, 'g'), h('button', { class: 'btn', onclick: go }, 'Ajouter')));
      })() : null,
      h('div', { class: 'row wrap' }, h('button', { class: 'btn small ghost', onclick: () => { close(); setTimeout(() => mealText(d), 0); } }, 'Écrire le repas en une phrase'), h('a', { class: 'btn small ghost', href: '#/nutri/jour', onclick: done }, 'Ouvrir la journée')));
    list();
  }
  draw();
  close = modal(`Repas, ${ADD.meal.toLowerCase()}`, body, [], { sheet: true });
}
/* Humeur en deux gestes : un visage (enregistré tout de suite), puis des étiquettes facultatives */
const TAGS_HUMEUR = ['Sport', 'Social', 'Travail', 'Dehors', 'Mal dormi', 'Écran tard'];
function moodSheet() {
  const d = today(), body = h('div', { class: 'form' });
  const J = () => P().journal[d] || {};
  const setMood = v => { const u = garde(P().journal, d); const j = (P().journal[d] = P().journal[d] || {}); if (v) j.mood = v; else delete j.mood; if (!Object.keys(j).length) delete P().journal[d]; save(); rerender(); draw(); undoable(v ? `Humeur notée : ${['très bas', 'bas', 'moyen', 'bien', 'très bien'][v - 1]}` : 'Humeur retirée', u); };
  const setTag = t => { const j = (P().journal[d] = P().journal[d] || {}); const s = new Set(j.tags || []); if (s.has(t)) s.delete(t); else s.add(t); j.tags = [...s]; if (!j.tags.length) delete j.tags; if (!Object.keys(j).length) delete P().journal[d]; save(); draw(); };
  function draw() {
    const j = J();
    fill(body, h('div', { class: 'faces', role: 'group', 'aria-label': 'Humeur' }, ['très bas', 'bas', 'moyen', 'bien', 'très bien'].map((l, i) => h('button', { class: `face${j.mood === i + 1 ? ' on' : ''}`, 'aria-pressed': j.mood === i + 1 ? 'true' : 'false', onclick: () => setMood(j.mood === i + 1 ? 0 : i + 1) }, h('b', null, String(i + 1)), h('small', null, l)))),
      j.mood ? h('div', null, h('small', { class: 'muted' }, 'Facultatif : ce qui a compté aujourd\'hui'), h('div', { class: 'chips' }, TAGS_HUMEUR.map(t => h('button', { class: `chip pick${(j.tags || []).includes(t) ? ' ok' : ''}`, 'aria-pressed': (j.tags || []).includes(t) ? 'true' : 'false', onclick: () => setTag(t) }, t)))) : null,
      h('a', { class: 'btn small ghost', href: '#/plan/journal', onclick: () => setTimeout(() => document.querySelectorAll('.overlay').forEach(o => o.remove()), 0) }, 'Écrire au journal'));
  }
  draw();
  modal('Humeur du jour', body, [], { sheet: true });
}
function quickWorkout() {
  if (P().muscu) return muscuSheet(); // une séance de musculation en cours : on la reprend
  const ws = lastWorkouts();
  if (!ws.length) return workoutModal(today());
  const close = modal('Séance', h('div', { class: 'form' }, h('small', { class: 'muted' }, 'Refaire une séance récente, aujourd\'hui :'),
    h('div', { class: 'list' }, ws.map(w => h('button', { class: 'pick-line', onclick: () => { close(); if (w.sets && w.sets.length) muscuStart(w); else addWorkout({ date: today(), type: w.type, min: w.min, rpe: w.rpe || 3, note: w.note || '' }); } },
      h('span', null, w.sets && w.sets.length ? `Musculation, série par série · ${[...new Set(w.sets.map(s => s.ex))].join(', ')}` : `${w.type} · ${w.min} min`), h('small', { class: 'muted' }, w.sets && w.sets.length ? 'les charges de la dernière fois reviennent' : `${RPE[(w.rpe || 3) - 1]}${w.note ? ' · ' + w.note : ''}`)))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost', onclick: () => { close(); workoutModal(today()); } }, 'Autre séance'), h('button', { class: 'btn ghost', onclick: () => { close(); muscuStart(); } }, 'Musculation, série par série'))), [], { sheet: true });
}
function quickFast() {
  const f = N().fast;
  if (f) {
    const close = modal('Jeûne', h('div', { class: 'form' }, h('p', null, `En cours depuis ${hm(f.start)} : `, h('b', null, durTxt(Date.now() - f.start)), ` sur ${f.goal} h.`),
      h('button', { class: 'btn', onclick: () => { close(); endFast(); } }, 'Terminer le jeûne')), [], { sheet: true });
    return;
  }
  const lm = lastMealAt(), goal = N().fastGoal || 16;
  const close = modal(`Jeûne de ${goal} h`, h('div', { class: 'form' },
    lm ? h('button', { class: 'btn', onclick: () => { close(); startFast(lm, goal); } }, `Depuis ${hm(lm)}, ton dernier repas`) : null,
    h('button', { class: `btn${lm ? ' ghost' : ''}`, onclick: () => { close(); startFast(Date.now(), goal); } }, 'Maintenant'),
    h('button', { class: 'btn ghost', onclick: () => { close(); pickFastTime('Commencer le jeûne', lm || Date.now(), v => startFast(v, goal)); } }, 'Autre heure'),
    h('small', { class: 'muted' }, 'La durée visée se change dans Nutrition, carte Jeûne.')), [], { sheet: true });
}
// Habitudes du jour sur le Panneau : la ligne entière coche, le bloc se vide au fur et à mesure
function todayHabitsCard(td) {
  if (!P().habits.length) return h('section', { class: 'card' }, h('h3', null, 'Aujourd\'hui'), h('p', { class: 'muted' }, 'Aucune habitude encore.'), h('button', { class: 'btn small', onclick: () => modelsModal() }, 'Choisir parmi les modèles'));
  const hbs = activeHabits().filter(x => scheduled(x, td) && !isSkipped(x, td)), todo = hbs.filter(x => !isDone(x, td) && !(x.freq === 'week' && doneDaysInWeek(x, weekStart(td)) >= weekGoal(x, weekStart(td)))); // objectif de la semaine déjà tenu : rien à faire aujourd'hui
  if (!hbs.length) return null;
  return h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Aujourd\'hui'), h('small', { class: 'muted' }, `${hbs.length - todo.length} sur ${hbs.length} faites`)),
    todo.length ? h('div', { class: 'list' }, todo.map(hb => habitRow(hb, td))) : h('p', { class: 'pos' }, 'Toutes les habitudes du jour sont faites.'));
}
// Choisir plusieurs modèles d'un coup (accueil et Panneau)
function modelsPicker(onDone) {
  const have = new Set(P().habits.map(x => x.name)), picks = new Set();
  const box = h('div', { class: 'list' }, MODELES.map(m => h('label', { class: 'check' }, h('input', { type: 'checkbox', 'aria-label': m.name, disabled: have.has(m.name), checked: have.has(m.name), onchange: e => { if (e.target.checked) picks.add(m); else picks.delete(m); } }),
    h('span', { class: 'grow' }, m.name, h('small', { class: 'muted' }, ` · ${m.freq === 'week' ? `${m.perWeek} fois par semaine` : 'tous les jours'}${m.why ? ', ' + m.why : ''}`)))));
  const add = () => { if (!picks.size) return 0; const u = garde(P(), 'habits'); for (const m of picks) P().habits.push(habitFromModel(m)); save(); rerender(); undoable(`${picks.size} habitude(s) ajoutée(s)`, u); return picks.size; };
  return { box, add };
}
function modelsModal() {
  const p = modelsPicker();
  modal('Habitudes : modèles', h('div', { class: 'form' }, h('small', { class: 'muted' }, 'Coche ce que tu veux tenir. Tout se règle ensuite dans Plan de vie, Habitudes.'), p.box), [{ label: 'Ajouter', run: () => { if (!p.add()) { toast('Rien de coché'); return false; } } }]);
}

/* ---------- accueil guidé au premier lancement ---------- */
function onboarding() {
  if (!STATE || STATE.settings.onboarded) return;
  STATE.settings.onboarded = true; save(); // fermé ou sauté : on ne le remontre pas
  const body = h('div', { class: 'form' }); let step = 0;
  const steps = [
    { t: 'Ton profil', d: 'Sert à calculer calories, protéines, eau et repères de vitamines. Reste chiffré sur cet appareil.', draw: () => {
      const p = PF(), up = (k, c = x => x) => e => { p[k] = c(e.target.value); save(); };
      return h('div', { class: 'grid-form' }, field('Sexe', sel([['m', 'Homme'], ['f', 'Femme']], p.sex, { onchange: up('sex') })), field('Date de naissance', inp('date', p.born, { onchange: up('born') })),
        field('Taille (cm)', inp('text', p.height ? String(p.height) : '', { inputmode: 'decimal', onchange: up('height', num) })), field('Poids (kg)', inp('text', p.weight ? String(p.weight) : '', { inputmode: 'decimal', onchange: up('weight', num) })),
        field('Activité', sel(ACTS.map(x => [String(x[0]), x[1]]), String(p.act), { onchange: up('act', Number) })));
    } },
    { t: 'Ce que tu manges', d: 'Un geste pour ton profil, un geste par allergie. Le menu du jour en tient compte tout de suite. Le reste (liste à cocher, « pas de champignons ») se règle dans Nutrition, Préférences.', draw: () => {
      if (typeof FLAGS_OK !== 'function' || !FLAGS_OK()) return h('small', { class: 'muted' }, 'Données des régimes pas encore chargées : à régler plus tard dans Nutrition, Préférences.');
      const box = h('div', { class: 'form' });
      const d2 = () => fill(box, h('div', { class: 'chips', role: 'group', 'aria-label': 'Profil alimentaire' }, FOODFLAGS.meta.profils.map(x => { const on = (PR().profil || 'omnivore') === x.k; return h('button', { type: 'button', class: `chip pick${on ? ' sel' : ''}`, 'aria-pressed': on ? 'true' : 'false', title: `${x.def} Source : ${x.source}.`, onclick: () => { PR().profil = x.k === 'omnivore' ? null : x.k; save(); d2(); } }, x.l); })),
        h('small', { class: 'muted up' }, 'Allergies et intolérances'),
        h('div', { class: 'chips', role: 'group', 'aria-label': 'Allergies et intolérances' }, [...ALLERG_UE(), ...INTOL()].map(t => { const on = PR().allergies.includes(t); return h('button', { type: 'button', class: `chip pick${on ? ' sel-bad' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => { PR().allergies = on ? PR().allergies.filter(x => x !== t) : [...PR().allergies, t]; save(); d2(); } }, `${on ? '✕ ' : ''}${flagNom(t)}`); })),
        h('small', { class: 'unk' }, 'Pas un avis médical : en cas d\'allergie grave, lis toujours l\'étiquette.'));
      d2(); return box;
    } },
    { t: 'Tes premières habitudes', d: 'Trois à cinq, c\'est bien pour commencer. Celles marquées « se coche » se cochent toutes seules avec tes données.', draw: () => { steps[2].p = modelsPicker(); return steps[2].p.box; }, next: () => steps[2].p && steps[2].p.add() },
    { t: 'Tes objectifs', d: 'Tout se change plus tard dans Réglages.', draw: () => {
      const p = PF(), up = (k, c = x => x) => e => { p[k] = c(e.target.value); save(); };
      return h('div', { class: 'form' }, field('Objectif', sel(GOALS.map(x => [String(x[0]), x[1]]), String(p.goal), { onchange: up('goal', Number) })),
        h('div', { class: 'grid-form' }, field('Poids visé (kg)', inp('text', p.goalWeight ? String(p.goalWeight) : '', { inputmode: 'decimal', onchange: up('goalWeight', num) })), field('Sport par semaine (min)', inp('text', String(p.weekMin || 150), { inputmode: 'decimal', onchange: up('weekMin', x => num(x) || 150) }), '150 : repère de l\'OMS'),
          field('Ton verre d\'eau (ml)', inp('text', String(glassMl()), { inputmode: 'decimal', onchange: e => { STATE.settings.glass = clamp(Math.round(num(e.target.value)) || 250, 50, 1000); save(); } }))));
    } },
    { t: 'Ne rien perdre', d: 'Tout vit dans ce navigateur, chiffré. Si les données du navigateur sont effacées, tout part. Garde une copie ailleurs : le fichier reste chiffré avec ton mot de passe.', draw: () => h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: exportVault }, 'Exporter le coffre maintenant'),
      'showDirectoryPicker' in window ? h('button', { class: 'btn ghost', onclick: chooseBackupDir }, 'Choisir un dossier de sauvegarde automatique') : h('small', { class: 'muted' }, 'La sauvegarde automatique dans un dossier demande Chrome ou Edge sur ordinateur.')) }
  ];
  let close = () => {};
  function draw() {
    const s = steps[step];
    fill(body, h('small', { class: 'muted up' }, `Étape ${step + 1} sur ${steps.length}`), h('h3', null, s.t), h('p', { class: 'muted' }, s.d), s.draw(),
      h('div', { class: 'row between wrap' }, h('button', { class: 'btn ghost', onclick: () => next(false) }, step === steps.length - 1 ? 'Terminer' : 'Plus tard'),
        step < steps.length - 1 ? h('button', { class: 'btn', onclick: () => next(true) }, 'Suivant') : null));
    const f = body.querySelector('input:not([type=checkbox]),select,button'); if (f && body.isConnected) f.focus(); // le focus reste dans la fenêtre
  }
  function next(keep) { if (keep && steps[step].next) steps[step].next(); step++; if (step >= steps.length) { close(); rerender(); return; } draw(); }
  draw();
  close = modal('Bienvenue', body, []);
}

/* ---------- rappels des habitudes ----------
   Quand le panneau est ouvert et déverrouillé : à l'heure prévue, un bandeau avec « Fait » et « Plus tard (10 min) », et une notification du
   système si tu l'as autorisée. Une seule relance 30 minutes après. Fermé ou verrouillé : rien (pas de serveur). */
const REM = (() => { try { return JSON.parse(sessionStorage.getItem('kmp.rem')) || {}; } catch { return {}; } })(); // identifiants seulement, aucun nom
const remSave = () => { try { sessionStorage.setItem('kmp.rem', JSON.stringify(REM)); } catch { /* ignore */ } };
// habitudes à rappeler maintenant : heure passée, prévues, ni faites ni au repos, moins de deux rappels, pas en « plus tard »
function remindersDue(now = new Date()) {
  if (!STATE || STATE.settings.remind === false) return [];
  const td = ymd(now), hmNow = `${pad(now.getHours())}:${pad(now.getMinutes())}`, t = now.getTime();
  return activeHabits().filter(hb => {
    if (!hb.hh || hb.hh > hmNow || !scheduled(hb, td) || isDone(hb, td) || isSkipped(hb, td)) return false;
    const r = REM[hb.id + '|' + td]; return !r || (r.n < 2 && t >= r.next);
  });
}
function remindTick() {
  const td = today();
  for (const hb of remindersDue()) {
    const k = hb.id + '|' + td, r = REM[k] || (REM[k] = { n: 0, next: 0 });
    r.n++; r.next = Date.now() + 30 * 60000; remSave();
    showReminder(hb, td);
  }
}
function showReminder(hb, td) {
  const id = 'rem-' + hb.id; document.getElementById(id)?.remove();
  const k = hb.id + '|' + td, el = h('div', { class: 'reminder', id, role: 'alert' }, h('span', { class: 'grow' }, 'Rappel : ', h('b', null, hb.name), h('small', { class: 'muted' }, ` · prévu à ${hb.hh}`)),
    h('button', { class: 'btn small', onclick: () => { el.remove(); if (!STATE) return; if (!isDone(hb, td)) { const u = garde(P().checks, td); setHabit(hb, td, hb.type === 'count' ? hb.goal || 1 : true); undoable(`${hb.name} : faite`, u); } } }, 'Fait'),
    h('button', { class: 'btn small ghost', onclick: () => { el.remove(); REM[k].next = Date.now() + 10 * 60000; remSave(); } }, 'Plus tard (10 min)'),
    h('button', { class: 'icon', 'aria-label': 'Fermer le rappel', onclick: () => el.remove() }, '×'));
  (document.querySelector('.reminders') || document.body.appendChild(h('div', { class: 'reminders' }))).append(el);
  if (document.hidden) sysNotify(hb, td);
}
/* Notification du système, onglet en arrière-plan. Avec le service worker (Chrome, Edge) : boutons « Fait » et « Plus tard (10 min) »,
   que sw.js renvoie à la page. Sans lui (Firefox, page ouverte en fichier) : notification simple, la toucher ramène au panneau. */
async function sysNotify(hb, td) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return 'non';
    const k = hb.id + '|' + td, reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
    if (reg && reg.showNotification) {
      await reg.showNotification('Rappel', { body: hb.name, tag: k, data: { id: hb.id, d: td }, actions: [{ action: 'fait', title: 'Fait' }, { action: 'plus-tard', title: 'Plus tard (10 min)' }] });
      return 'actions';
    }
    const n = new Notification('Rappel', { body: hb.name, tag: k }); n.onclick = () => { window.focus(); n.close(); };
    return 'simple';
  } catch { return 'non'; }
}
/* Geste venu de la notification (sw.js) ou de l'adresse #/rappel/... : appliqué tout de suite, ou au déverrouillage si le coffre est fermé. */
const REM_WAIT = [];
function remindAction({ action, id, d }) {
  if (!STATE) { REM_WAIT.push({ action, id, d }); return 'attente'; }
  const hb = P().habits.find(x => x.id === id); if (!hb) return 'inconnue';
  document.getElementById('rem-' + id)?.remove();
  if (action === 'fait') {
    if (isDone(hb, d)) return 'déjà';
    const u = garde(P().checks, d); setHabit(hb, d, hb.type === 'count' ? hb.goal || 1 : true); undoable(`${hb.name} : faite (depuis le rappel)`, u);
    return 'fait';
  }
  if (action === 'plus-tard') { const k = id + '|' + d, r = REM[k] || (REM[k] = { n: 1, next: 0 }); r.next = Date.now() + 10 * 60000; remSave(); toast(`${hb.name} : rappel dans 10 minutes`); return 'plus-tard'; }
  if (d === today() && !isDone(hb, d)) showReminder(hb, d); // la notification touchée : le bandeau revient sur le panneau
  return 'ouvrir';
}
function remindFlush() { while (REM_WAIT.length && STATE) remindAction(REM_WAIT.shift()); }
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'kmp-rappel') remindAction(e.data); });

/* ---------- clavier ---------- */
const RACCOURCIS = [['/', 'Chercher un aliment'], ['r', 'Repas rapide'], ['e', 'Un verre d\'eau'], ['m', 'Humeur du jour'], ['n', 'Nouvelle tâche'], ['h', 'Habitudes du jour'], ['p', 'Panneau'],
  ['1 à 4', 'Repas : petit-déjeuner, déjeuner, collation, dîner (Nutrition)'], ['← →', 'Jour précédent, jour suivant'], ['Ctrl+Z', 'Annuler la dernière action (10 secondes)'], ['Échap', 'Fermer une fenêtre'], ['Entrée', 'Valider une fenêtre'], ['?', 'Cette aide']];
function helpModal() {
  modal('Raccourcis clavier', h('div', null, h('table', { class: 'sheet keys' }, h('tbody', null, RACCOURCIS.map(([k, l]) => h('tr', null, h('td', null, h('kbd', null, k)), h('td', null, l))))),
    h('small', { class: 'muted' }, 'Inactifs quand tu écris dans un champ.')), []);
}
function goTo(hash, sel) { render.focusSel = sel || null; if (location.hash === hash) { render(); } else location.hash = hash; }
addEventListener('keydown', e => {
  if (!STATE) return;
  const t = e.target, typing = !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z') { if (!typing && undo()) e.preventDefault(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.overlay')) return;
  const k = e.key;
  if (k === '/') { e.preventDefault(); ADD.mode = 'food'; ADD.pick = null; goTo('#/nutri/jour', '#n-search'); }
  else if (k === 'n') { e.preventDefault(); goTo('#/plan/taches', 'input[placeholder^="Nouvelle tâche"]'); }
  else if (k === 'e') quickAction('eau');
  else if (k === 'r') quickAction('repas');
  else if (k === 'm') quickAction('humeur');
  else if (k === 'h') goTo('#/plan/jour');
  else if (k === 'p') goTo('#/home');
  else if (k === '?') helpModal();
  else if (/^[1-4]$/.test(k) && route.mod === 'nutri') { ADD.meal = MEALS[+k - 1]; ADD.mealAt = Date.now(); rerender(); toast(`Repas : ${ADD.meal.toLowerCase()}`); }
  else if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.shiftKey) {
    const step = k === 'ArrowLeft' ? -1 : 1, s = route.sub;
    if (route.mod === 'nutri' && (!s || s === 'jour')) { nDay = addDays(nDay, step); ADD.pick = null; rerender(); }
    else if (route.mod === 'plan' && (!s || s === 'jour' || s === 'journal')) { planDay = addDays(planDay, step); rerender(); }
  }
});

/* ---------- sauvegarde ----------
   Rappel d'export : au-delà de 7 jours sans copie (ou 3 jours après la création du coffre sans aucune), sur le Panneau.
   Dossier automatique (Chrome, Edge) : le coffre chiffré y est écrit à chaque verrouillage, les 10 derniers fichiers sont gardés.
   Le dossier choisi est retenu par le navigateur (IndexedDB) ; il faut parfois redonner l'accès d'un geste après un redémarrage. */
const BK = { handle: null, state: '' };
function idbReq(mode, fn) {
  return new Promise((res, rej) => {
    const o = indexedDB.open('kmp-sauvegarde', 1);
    o.onupgradeneeded = () => o.result.createObjectStore('h');
    o.onerror = () => rej(o.error);
    o.onsuccess = () => { const tx = o.result.transaction('h', mode), r = fn(tx.objectStore('h')); tx.oncomplete = () => { res(r && r.result); o.result.close(); }; tx.onerror = () => rej(tx.error); };
  });
}
const lastAuto = () => { try { return Number(localStorage.getItem('kmp.lastAuto')) || 0; } catch { return 0; } };
const lastCopy = () => Math.max((STATE && STATE.settings.lastExport) || 0, lastAuto());
// Écrit le coffre (déjà chiffré) dans le dossier et ne garde que les `keep` plus récents de nos fichiers
async function backupTo(dir, raw, keep = 10, now = new Date()) {
  const name = `kalmydas-perso-${ymd(now)}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.vault.json`;
  const fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable(); await w.write(raw); await w.close();
  const ours = [];
  for await (const [n, hd] of dir.entries()) if (hd.kind === 'file' && /^kalmydas-perso-\d{4}-\d{2}-\d{2}-\d{6}\.vault\.json$/.test(n)) ours.push(n);
  ours.sort();
  for (const n of ours.slice(0, Math.max(0, ours.length - keep))) await dir.removeEntry(n);
  return name;
}
async function backupHandle() { if (!BK.handle && 'indexedDB' in window) BK.handle = await idbReq('readonly', s => s.get('dir')).catch(() => null); return BK.handle; }
// ask : vrai seulement après un geste (bouton) ; sans geste, on n'écrit que si l'accès est déjà donné
async function autoBackup(ask) {
  const dir = await backupHandle(); if (!dir) { BK.state = ''; return 'aucun'; }
  let p = await dir.queryPermission({ mode: 'readwrite' });
  if (p !== 'granted' && ask) p = await dir.requestPermission({ mode: 'readwrite' });
  if (p !== 'granted') { BK.state = 'attente'; return 'attente'; }
  await Vault.flush();
  const raw = localStorage.getItem(VAULT_KEY); if (!raw) return 'vide';
  await backupTo(dir, raw);
  try { localStorage.setItem('kmp.lastAuto', String(Date.now())); } catch { /* ignore */ }
  BK.state = 'ok'; return 'ok';
}
async function chooseBackupDir() {
  if (!('showDirectoryPicker' in window)) return toast('Ce navigateur ne sait pas choisir un dossier. Chrome ou Edge sur ordinateur le savent.');
  try {
    const dir = await showDirectoryPicker({ id: 'kmp-sauvegarde', mode: 'readwrite' });
    await idbReq('readwrite', s => s.put(dir, 'dir')); BK.handle = dir;
    const r = await autoBackup(true);
    toast(r === 'ok' ? `Sauvegarde automatique dans « ${dir.name} » : une copie chiffrée à chaque verrouillage` : 'Accès au dossier refusé'); rerender();
  } catch (e) { if (e && e.name !== 'AbortError') toast(`Dossier impossible : ${e.message}`); }
}
async function forgetBackupDir() { await idbReq('readwrite', s => s.delete('dir')).catch(() => {}); BK.handle = null; BK.state = ''; toast('Sauvegarde automatique arrêtée. Les fichiers déjà écrits restent dans le dossier.'); rerender(); }
const hasData = () => !!(P().habits.length || Object.keys(N().log).length || STATE.argent.tx.length || STATE.argent.accounts.length || P().tasks.length || Object.keys(P().journal).length);
function backupNag() {
  if (!hasData()) return null;
  const last = lastCopy(), now = Date.now(), created = STATE.settings.created || 0;
  const due = last ? now - last > 7 * 86400000 : !created || now - created > 3 * 86400000;
  if (BK.state === 'attente') return h('section', { class: 'card alertcard' }, h('p', null, 'La sauvegarde automatique attend ton accord pour écrire dans son dossier.'), h('button', { class: 'btn small', onclick: async () => { const r = await autoBackup(true); toast(r === 'ok' ? 'Copie chiffrée écrite' : 'Accès refusé'); rerender(); } }, 'Donner l\'accès et sauvegarder'));
  if (!due) return null;
  return h('section', { class: 'card alertcard' }, h('p', null, last ? `Dernière copie du coffre : il y a ${Math.floor((now - last) / 86400000)} jours.` : 'Aucune copie du coffre pour l\'instant.', h('small', { class: 'muted' }, ' Si les données du navigateur sont effacées, tout part.')),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn small', onclick: exportVault }, 'Exporter maintenant'), 'showDirectoryPicker' in window ? h('button', { class: 'btn small ghost', onclick: chooseBackupDir }, 'Sauvegarde automatique') : null));
}
const agoTxt = ts => { if (!ts) return 'jamais'; const d = Math.floor((Date.now() - ts) / 86400000); return d <= 0 ? 'aujourd\'hui' : d === 1 ? 'hier' : `il y a ${d} jours`; };
