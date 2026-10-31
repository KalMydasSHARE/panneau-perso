'use strict';
/* KalMydas PERSO : coque de l'application. Verrou, navigation, panneau d'ensemble, reglages. */

const NAV = [['home', 'Panneau', '◈'], ['argent', 'Argent', '＄'], ['plan', 'Plan de vie', '✓'], ['nutri', 'Nutrition', '◔'], ['reglages', 'Réglages', '⚙']];
const app = $('#app');
let route = { mod: 'home', sub: '' };

/* ---------- verrou ---------- */
function gate() {
  document.body.classList.remove('in');
  const first = !Vault.exists();
  const pw = inp('password', '', { autocomplete: first ? 'new-password' : 'current-password', placeholder: 'Mot de passe', id: 'pw' });
  const pw2 = first ? inp('password', '', { autocomplete: 'new-password', placeholder: 'Répète le mot de passe' }) : null;
  const msg = h('p', { class: 'err' });
  const go = async () => {
    msg.textContent = '';
    if (!Vault.supported()) { msg.textContent = 'Ce navigateur ne permet pas le chiffrement ici. Ouvre la page dans Chrome, Edge ou Firefox récents.'; return; }
    if (first) {
      if (pw.value.length < 10) { msg.textContent = 'Dix caractères au minimum.'; return; }
      if (pw.value !== pw2.value) { msg.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
      btn.disabled = true; await Vault.create(pw.value); start();
    } else {
      btn.disabled = true; btn.textContent = 'Vérification…';
      let ok = false;
      try { ok = await Vault.unlock(pw.value); } catch (e) { btn.disabled = false; btn.textContent = 'Déverrouiller'; msg.textContent = e.message; return; }
      if (ok) return start();
      btn.disabled = false; btn.textContent = 'Déverrouiller'; msg.textContent = 'Mot de passe incorrect.'; pw.value = ''; pw.focus();
    }
  };
  const btn = h('button', { class: 'btn big-btn', onclick: go }, first ? 'Créer mon coffre' : 'Déverrouiller');
  [pw, pw2].forEach(el => el && el.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
  app.replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'gate-box' },
    h('div', { class: 'logo' }, 'KAL MYDAS'), h('h1', null, 'Mon panneau'),
    first ? h('p', { class: 'muted' }, 'Premier lancement. Choisis un mot de passe : il chiffre tout ce que tu notes ici, sur cet appareil. Personne ne peut le retrouver à ta place, pas même moi. Fais un export de temps en temps (Réglages).') : h('p', { class: 'muted' }, 'Argent, plan de vie, nutrition. Rien n\'est lisible sans ton mot de passe.'),
    pw, pw2, btn, msg)));
  setTimeout(() => pw.focus(), 50);
}
async function lock() {
  document.querySelectorAll('.overlay,.toast,.reminders').forEach(o => o.remove()); // rien ne reste affiché par-dessus le verrou
  UNDO.fn = null; ADD.plate = []; ADD.pick = null; ADD.q = ''; // rien d'un repas en cours ne reste en mémoire après le verrou
  if (typeof muscuStop === 'function') muscuStop();
  if (STATE) await autoBackup(false).catch(e => console.warn('[sauvegarde]', e)); // copie chiffrée dans le dossier choisi, si l'accès est donné
  await Vault.lock(); route = { mod: 'home', sub: '' }; gate();
}

let idleAt = Date.now();
['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => { idleAt = Date.now(); }, { passive: true }));
setInterval(() => {
  if (!STATE) return;
  if (Date.now() - idleAt > (STATE.settings.autolock || 10) * 60000) return lock();
  const t = P().timer; if (t && Date.now() >= t.start + t.mins * 60000) finishTimer(); // le focus se termine même si l'écran Aujourd'hui n'est pas ouvert
  // après minuit, l'écran passe au nouveau jour, mais jamais sous les doigts : seulement après une minute sans toucher
  if (Date.now() - idleAt > 60000 && dayRoll() && !document.querySelector('.overlay')) rerender();
  remindTick();
}, 15000);
addEventListener('visibilitychange', () => {
  if (document.hidden) { if (Vault.dirty) Vault.flush(); return; }
  if (STATE && dayRoll() && !document.querySelector('.overlay')) rerender(); // onglet retrouvé le lendemain : on est sur le nouveau jour
});
addEventListener('pagehide', () => { if (Vault.dirty) Vault.flush(); });
// Le coffre a changé dans un autre onglet : on verrouille celui-ci sans écrire, sinon le dernier qui enregistre efface le travail de l'autre
addEventListener('storage', e => {
  if (e.key !== VAULT_KEY || !STATE) return;
  clearTimeout(Vault.timer); Vault.dirty = false;
  lock().then(() => toast('Le coffre a été modifié dans un autre onglet. Déverrouille pour voir la dernière version.'));
});

/* ---------- coque ---------- */
async function start() {
  await CIQUAL_PRET; // base d'aliments chargée pendant la saisie du mot de passe ; en général déjà prête
  if (typeof DONNEES_PRET !== 'undefined') await DONNEES_PRET; // repas, régimes, liste à cocher, réserves (js/donnees.js), lus en même temps
  if (!STATE) return; // verrouillé entre-temps
  document.body.classList.add('in');
  idleAt = Date.now();
  rerender = render;
  applyTheme();
  dayRoll(); DAY = today(); // déverrouillé le lendemain dans le même onglet : on part d'aujourd'hui
  nDay = planDay = DAY; planWeek = weekStart(DAY); planWk = weekStart(DAY);
  parseHash();
  render();
  onboarding();
  if (quickPending) { const k = quickPending; quickPending = null; setTimeout(() => quickAction(k), 0); }
  backupHandle().then(d => { if (d) d.queryPermission({ mode: 'readwrite' }).then(p => { BK.state = p === 'granted' ? 'ok' : 'attente'; if (BK.state === 'attente' && route.mod === 'home') rerender(); }); }).catch(() => {});
  remindTick(); remindFlush();
  syncKal(true); // lecture silencieuse du gain Kal Mydas si des adresses sont saisies
}
// Adresses directes des actions rapides (#/rapide/eau, #/rapide/repas...) : l'action se lance, puis on revient au Panneau
let quickPending = null;
function parseHash() {
  const [, mod, sub, id, d] = location.hash.split('/');
  if (mod === 'rapide' && QUICK.some(q => q[0] === sub)) { quickPending = sub; history.replaceState(null, '', '#/home'); route = { mod: 'home', sub: '' }; return; }
  // geste d'une notification, panneau fermé au moment du toucher (sw.js) : appliqué au déverrouillage
  if (mod === 'rappel') { if (/^(fait|plus-tard|ouvrir)$/.test(sub) && /^[a-z0-9]{1,40}$/i.test(id || '') && /^\d{4}-\d{2}-\d{2}$/.test(d || '')) REM_WAIT.push({ action: sub, id, d }); history.replaceState(null, '', '#/home'); route = { mod: 'home', sub: '' }; return; }
  route = { mod: NAV.some(n => n[0] === mod) ? mod : 'home', sub: sub || '' };
}
addEventListener('hashchange', () => {
  if (!STATE) return;
  parseHash(); render(); if (!render.focusSel) window.scrollTo(0, 0);
  remindFlush();
  if (quickPending) { const k = quickPending; quickPending = null; quickAction(k); }
});

// Toute la page est reconstruite à chaque action. Pour ne pas perdre le champ où l'on tape, on note sa place parmi les champs
// de la page et on remet le focus sur le champ qui occupe la même place après coup, s'il a la même forme.
const FOCUSABLE = 'input,select,textarea,button,a[href]';
function focusMark() {
  const el = document.activeElement;
  if (!el || el === document.body || !app.contains(el)) return null;
  const all = [...app.querySelectorAll(FOCUSABLE)], i = all.indexOf(el);
  return i < 0 ? null : { i, sig: `${el.tagName}|${el.type || ''}|${el.getAttribute('placeholder') || ''}|${el.getAttribute('aria-label') || ''}`, text: el.tagName === 'INPUT' && /^(text|search)$/.test(el.type) };
}
function focusBack(m) {
  if (!m) return;
  const el = [...app.querySelectorAll(FOCUSABLE)][m.i];
  if (!el || `${el.tagName}|${el.type || ''}|${el.getAttribute('placeholder') || ''}|${el.getAttribute('aria-label') || ''}` !== m.sig) return;
  el.focus({ preventScroll: true });
  if (m.text) try { el.setSelectionRange(el.value.length, el.value.length); } catch { /* champ sans sélection */ }
}
let rendering = false;
/* Téléphone (27 octobre 2026) : une explication longue tient sur deux lignes, un toucher l'ouvre en entier (gardée ouverte jusqu'au rechargement de la page).
   Jamais un avertissement (« à vérifier », allergies, erreur) ni un texte qui porte un bouton ou un lien. */
const PLIS_OUVERTS = new Set();
const estTelephone = () => !!(window.matchMedia && matchMedia('(max-width:760px)').matches);
function plierExplications(root) {
  if (!estTelephone()) return;
  for (const e of root.querySelectorAll('small.muted, p.small, p.muted, .why')) {
    if (e.classList.contains('unk') || e.classList.contains('neg') || e.closest('button,a,label,.item,.noeud-ligne,.pick-line')) continue;
    if (e.querySelector('button,a,input,select,textarea')) continue;
    const t = e.textContent.trim(); if (t.length < 110) continue;
    e.classList.add('plie'); if (PLIS_OUVERTS.has(t)) e.classList.add('ouvert');
    e.setAttribute('role', 'button'); e.tabIndex = 0; e.setAttribute('aria-expanded', PLIS_OUVERTS.has(t) ? 'true' : 'false');
    const bascule = ev => { ev.stopPropagation(); const o = e.classList.toggle('ouvert'); e.setAttribute('aria-expanded', o ? 'true' : 'false'); if (o) PLIS_OUVERTS.add(t); else PLIS_OUVERTS.delete(t); };
    e.addEventListener('click', bascule); e.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); bascule(ev); } });
  }
}
function render() {
  if (!STATE) return;
  if (rendering) return void setTimeout(render, 0); // un rendu demandé pendant un rendu passe juste après
  // Champ validé en quittant (Tab, clic ailleurs) : on laisse d'abord le focus aller au champ suivant, puis on redessine et on l'y remet
  if (window.event && window.event.type === 'change') { if (!render.later) { render.later = true; setTimeout(() => { render.later = false; render(); }, 0); } return; }
  rendering = true;
  try {
    const y = window.scrollY, fm = focusMark(), m = MODULES[route.mod], active = route.sub || (m.subs ? m.subs[0][0] : ''), tab = m.tabOf ? m.tabOf(active) : active;
    const nav = h('nav', { class: 'nav', 'aria-label': 'Sections' }, NAV.map(([k, l, ic]) => h('a', { href: `#/${k}`, class: k === route.mod ? 'on' : '', 'aria-current': k === route.mod ? 'page' : null }, h('i', { 'aria-hidden': 'true' }, ic), h('span', null, l))));
    const main = h('main', { class: 'main' });
    if (m.subs) main.append(h('nav', { class: 'subtabs', 'aria-label': m.title }, m.subs.map(([k, l]) => h('a', { href: `#/${route.mod}/${k}`, class: k === tab ? 'on' : '', 'aria-current': k === tab ? 'page' : null }, l))));
    const body = h('div', { class: 'view' });
    main.append(body);
    try { m.render(body, active); plierExplications(body); } catch (e) { // un écran qui casse ne doit pas laisser une page blanche
      console.error(e);
      body.replaceChildren(h('section', { class: 'card' }, h('h3', null, 'Cet écran n\'a pas pu s\'afficher'), h('p', { class: 'neg' }, e.message), h('p', { class: 'muted' }, 'Tes données ne sont pas touchées. Les autres écrans restent utilisables.')));
    }
    const hidden = document.body.classList.contains('hide');
    app.replaceChildren(h('div', { class: 'shell' },
      h('header', { class: 'top' }, h('div', { class: 'logo' }, 'KAL MYDAS', h('small', null, ' perso')), h('div', { class: 'row' },
        h('button', { class: 'icon', title: 'Masquer les montants', 'aria-label': 'Masquer les montants', 'aria-pressed': hidden ? 'true' : 'false', onclick: e => { const on = document.body.classList.toggle('hide'); e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false'); try { localStorage.setItem('kmp.hide', on ? '1' : ''); } catch { /* ignore */ } } }, '◐'),
        h('button', { class: 'icon', title: 'Raccourcis clavier', 'aria-label': 'Raccourcis clavier', onclick: helpModal }, '?'),
        h('button', { class: 'btn small ghost', onclick: lock }, 'Verrouiller'))),
      nav, main, fab()));
    window.scrollTo(0, y);
    focusBack(fm);
    if (render.focusSel) { const el = app.querySelector(render.focusSel); render.focusSel = null; if (el) { el.focus(); if (el.select) el.select(); } }
  } finally { rendering = false; }
}
try { if (localStorage.getItem('kmp.hide')) document.body.classList.add('hide'); } catch { /* ignore */ }

/* ---------- panneau d'ensemble ---------- */
function alerts() {
  const out = [], td = today(), mk = monthKey(td), now = new Date();
  const late = P().tasks.filter(t => !t.done && t.due && t.due < td);
  if (late.length) out.push(['bad', `${late.length} tâche(s) en retard`, '#/plan/taches']);
  const ms = monthStats(mk);
  for (const [c, lim] of Object.entries(STATE.argent.budgets)) if (lim > 0 && (ms.cats[c] || 0) > lim) out.push(['bad', `Budget ${c} dépassé de ${fmtMoney(ms.cats[c] - lim, true)}`, '#/argent/budget']);
  for (const d of STATE.argent.debts) { const p = debtPlan(d); if (p.rest > 0 && p.late !== null && p.late > 0.5) out.push(['bad', `Dette ${d.name} : en retard sur ta date`, '#/argent/dettes']); }
  const hbs = activeHabits().filter(x => scheduled(x, td) && !isDone(x, td) && !isSkipped(x, td));
  // les habitudes du jour se cochent dans le bloc « Aujourd'hui » du Panneau : ici, seulement celles dont l'heure est passée
  const due = hbs.filter(x => x.hh && x.hh <= `${pad(now.getHours())}:${pad(now.getMinutes())}`);
  if (due.length) out.push(['bad', `À faire maintenant : ${due.map(x => x.name).slice(0, 3).join(', ')}`, '#/plan/jour']);
  const rel = people_due(); if (rel.length) out.push(['warn', `À relancer : ${rel.slice(0, 3).map(p => p.name).join(', ')}`, '#/plan/social']);
  const nd = nutriDay(td);
  if (!nd) out.push(['warn', "Aucun repas noté aujourd'hui", '#/nutri/jour']);
  else if (nd.micro < 60) out.push(['warn', `Micros à ${fmtPct(nd.micro, 0)} aujourd'hui`, '#/nutri/jour']);
  if (waterOf(td) < waterTarget() * 0.5 && now.getHours() >= 15) out.push(['warn', `Eau : ${fmtNum(waterOf(td) / 1000)} L sur ${fmtNum(waterTarget() / 1000)}`, '#/nutri/jour']);
  for (const a of ulAlerts(td)) out.push([a.type === 'NS' ? 'warn' : 'bad', `${a.nom} : ${ulText(a)}`, '#/nutri/jour']);
  if (!CIQUAL_OK()) out.push(['bad', 'Base d\'aliments non chargée : les repas notés ne comptent pas leurs valeurs', '#/nutri/sources']);
  if (P().timer) out.push(['warn', 'Une session de focus est en cours', '#/plan/jour']);
  const wk = weekStart(td); if (dow(td) >= 5 && !(P().reviews[wk] || {}).wins) out.push(['warn', 'La revue de la semaine attend', '#/plan/semaine']);
  if (!STATE.argent.accounts.length) out.push(['warn', 'Aucun compte saisi : commence par tes banques et plateformes', '#/argent/comptes']);
  return out;
}
MODULES.home = {
  title: 'Panneau',
  render(root) {
    const td = today(), mk = monthKey(td), ms = monthStats(mk), k = kalStats(), last7 = Array.from({ length: 7 }, (_, i) => addDays(td, i - 6));
    const hbs = activeHabits().filter(x => scheduled(x, td) && !isSkipped(x, td)), done = hbs.filter(x => isDone(x, td)).length, wk = rate(activeHabits(), addDays(td, -6), td);
    const nd = nutriDay(td), al = alerts(), best = activeHabits().map(hb => ({ hb, s: streak(hb) })).sort((x, y) => y.s - x.s)[0], f = N().fast;
    const wo = P().workouts.filter(x => x.date >= weekStart(td)).reduce((a, x) => a + x.min, 0), ah = activeHabits(), force = ah.length ? sum(ah, x => strength(x)) / ah.length : null;
    // Panneau court (31 octobre 2026) : en haut, seulement ce qui se fait maintenant ; les chiffres d'ensemble sont repliés (état retenu)
    put(root,
      h('h2', null, `Bonjour Kal, ${dateLabel(td)}`),
      quickBar(),
      maintenantCard(td, al),
      backupNag(),
      typeof menuCarte === 'function' ? menuCarte({ compact: true }) : null, // menu du jour : la prochaine proposition, « Je le mange » en un geste
      todayHabitsCard(td),
      foldCard('home-vue', "Vue d'ensemble", () => [vueEnsemble()], { cls: 'vue-plus' }));
    function vueEnsemble() { return h('div', { class: 'view' },
      h('div', { class: 'grid4' },
        h('button', { class: 'card stat click', onclick: () => disciplineModal(td), 'aria-label': 'Discipline du jour : voir le calcul' }, h('small', null, 'Discipline du jour'), h('div', { class: 'big' }, discTxt(disciplineDay(td))), h('small', { class: 'muted' }, disciplineDay(td) === null ? 'rien de prévu aujourd\'hui' : 'toucher pour le calcul')),
        stat('Discipline 7 jours', discTxt(disciplineWeek(last7))),
        stat('Force des habitudes', force === null ? '–' : `${Math.round(force)} %`, best && best.s ? `meilleure série : ${best.s}${best.hb.freq === 'week' ? ' sem.' : ' j'}, ${best.hb.name}` : 'un oubli ne remet pas à zéro'),
        stat('Sport cette semaine', `${wo} min`, `objectif ${PF().weekMin} min`)),
      h('div', { class: 'cols3' },
        h('a', { class: 'card panel', href: '#/argent' }, h('h3', null, 'Argent'),
          h('small', null, 'Patrimoine net'), h('div', { class: 'huge' }, money(netWorth(), true)),
          k.list.length ? h('div', { class: 'kal-mini' }, h('div', null, h('small', null, 'Déposé'), h('b', null, money(k.dep, true))), h('div', { class: k.gain >= 0 ? 'pos' : 'neg' }, h('small', null, 'Gain'), h('b', { class: 'amt' }, signed(k.gain, true), ' · ', (k.pct > 0 ? '+' : '') + fmtPct(k.pct)))) : null,
          h('div', { class: 'mini-grid' }, h('div', null, h('small', null, 'Dettes'), h('b', null, money(debtsTotal(), true))), h('div', null, h('small', null, `Marge ${MOIS[parseD(td).getMonth()]}`), h('b', null, money(ms.margin, true))))),
        h('a', { class: 'card panel', href: '#/plan' }, h('h3', null, 'Plan de vie'),
          ring(hbs.length ? (done / hbs.length) * 100 : 0, hbs.length ? `${done}/${hbs.length}` : '–', "aujourd'hui"),
          h('div', { class: 'mini-grid' }, h('div', null, h('small', null, '7 jours'), h('b', null, wk.pct === null ? '–' : fmtPct(wk.pct, 0))), h('div', null, h('small', null, 'Tâches ouvertes'), h('b', null, P().tasks.filter(t => !t.done).length)),
            h('div', null, h('small', null, 'Objectifs en cours'), h('b', null, P().goals.filter(g => !g.done).length)), h('div', null, h('small', null, 'Focus'), h('b', null, `${P().focus[td] || 0} min`)))),
        h('a', { class: 'card panel', href: '#/nutri' }, h('h3', null, 'Nutrition'),
          h('small', null, 'Calories du jour'), h('div', { class: 'huge' }, nd ? fmtK(nd.t.kcal) : '–', h('small', { class: 'muted' }, ` / ${fmtK(targets().kcal)}`)),
          h('div', { class: 'mini-grid' }, h('div', null, h('small', null, 'Micros'), h('b', null, nd ? fmtPct(nd.micro, 0) : '–')), h('div', null, h('small', null, 'Protéines'), h('b', null, nd ? `${fmtG(nd.t.p)} g` : '–')),
            h('div', null, h('small', null, 'Eau'), h('b', null, `${fmtNum(waterOf(td) / 1000)} L`)), h('div', null, h('small', null, 'Jeûne'), h('b', null, f ? `${Math.floor((Date.now() - f.start) / 3600000)} h` : '–'))))),
      h('p', { class: 'muted' }, "Chiffré sur cet appareil. Le bouton ◐ en haut masque les montants si quelqu'un regarde ton écran.")); }
  }
};
/* « Maintenant » : les tâches du jour et en retard (priorité d'abord, trois au plus) et les alertes (urgentes d'abord, trois au plus, le reste replié).
   Rien de tout ça : une ligne qui le dit. */
function maintenantCard(td, al) {
  const prio = t => t.prio || 2;
  const tasks = P().tasks.filter(t => !t.done && t.due && t.due <= td).sort((a, b) => prio(a) - prio(b) || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0) || (a.hh || '99').localeCompare(b.hh || '99'));
  const alerts = al.filter(a => !(tasks.length && a[2] === '#/plan/taches')).sort((a, b) => (a[0] === 'bad' ? 0 : 1) - (b[0] === 'bad' ? 0 : 1));
  if (!tasks.length && !alerts.length) return h('section', { class: 'card maintenant' }, h('p', { class: 'pos' }, "Rien d'urgent. Tout est à jour."));
  const ligne = ([c, t, href]) => h('a', { class: `item alert ${c}`, href }, h('span', { class: 'grow' }, t), h('span', null, '›'));
  return h('section', { class: 'card maintenant' }, h('h3', null, 'Maintenant'),
    tasks.length ? h('div', { class: 'list' }, tasks.slice(0, 3).map(t => taskRow(t, { later: true, auj: true })),
      tasks.length > 3 ? h('a', { class: 'small muted', href: '#/plan/taches' }, `+ ${tasks.length - 3} autre(s) tâche(s) ›`) : null) : null,
    alerts.length ? h('div', { class: 'list' }, alerts.slice(0, 3).map(ligne)) : null,
    alerts.length > 3 ? h('details', { class: 'more' }, h('summary', null, `${alerts.length - 3} autre(s) point(s) à regarder`), h('div', { class: 'list' }, alerts.slice(3).map(ligne))) : null);
}

/* ---------- reglages ---------- */
function downloadCSV(name, rows) {
  // un texte qui commence par = + - @ serait lu comme une formule par Excel (noms de produits venus d'Open Food Facts par exemple)
  const esc = v => { let s = String(v === undefined || v === null ? '' : v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function exportsCard() {
  const nutri = () => { const rows = [['date', 'repas', 'aliment', 'grammes', ...KEYS]]; for (const d of Object.keys(N().log).sort()) for (const e of N().log[d]) { const n = entryN(e); rows.push([d, e.meal, e.name, e.g || '', ...KEYS.map(k => (n[k] !== undefined ? r2(n[k] * 100) / 100 : ''))]); } downloadCSV(`nutrition-${today()}.csv`, rows); };
  const habits = () => { const rows = [['date', 'habitude', 'fait', 'valeur']]; for (const d of Object.keys(P().checks).sort()) for (const hb of P().habits) { if (P().checks[d][hb.id]) rows.push([d, hb.name, isDone(hb, d) ? 1 : 0, habitValue(hb, d)]); } downloadCSV(`habitudes-${today()}.csv`, rows); };
  const journal = () => { const rows = [['date', 'humeur', 'energie', 'stress', 'sommeil', 'victoire', 'texte']]; for (const d of Object.keys(P().journal).sort()) { const j = P().journal[d]; rows.push([d, j.mood, j.energy, j.stress, j.sleep, j.wins, j.text]); } downloadCSV(`journal-${today()}.csv`, rows); };
  const sport = () => downloadCSV(`sport-${today()}.csv`, [['date', 'type', 'minutes', 'effort', 'note'], ...P().workouts.map(x => [x.date, x.type, x.min, x.rpe, x.note])]);
  const poids = () => downloadCSV(`poids-${today()}.csv`, [['date', 'kg', 'taille_cm', 'masse_grasse_pct'], ...N().weights.slice().sort((a, b) => a.d.localeCompare(b.d)).map(x => [x.d, x.kg, x.waist, x.fat])]);
  return h('section', { class: 'card' }, h('h3', null, 'Exporter en tableau (CSV)'), h('p', { class: 'muted' }, 'Fichiers lisibles dans Excel ou Google Sheets. Attention : ils ne sont pas chiffrés.'),
    h('div', { class: 'row wrap' }, [['Repas', nutri], ['Habitudes', habits], ['Journal', journal], ['Sport', sport], ['Poids', poids]].map(([l, fn]) => h('button', { class: 'btn small ghost', onclick: fn }, l))));
}
MODULES.reglages = {
  title: 'Réglages',
  render(root) {
    const al = inp('number', String(STATE.settings.autolock || 10), { min: 1, max: 240, style: { width: '90px' }, 'aria-label': 'Minutes avant le verrouillage automatique', onchange: e => { STATE.settings.autolock = clamp(parseInt(e.target.value, 10) || 10, 1, 240); save(); toast('Enregistré'); } });
    const file = h('input', { type: 'file', accept: '.json,.vault', style: { display: 'none' }, onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const v = JSON.parse(await f.text());
        if (!v.salt || !v.iv || !v.data) throw new Error('format');
        if (!confirm('Remplacer le coffre actuel par ce fichier ? Il faudra son mot de passe.')) return;
        await Vault.flush(); localStorage.setItem(VAULT_KEY + '.prev', localStorage.getItem(VAULT_KEY)); localStorage.setItem(VAULT_KEY, JSON.stringify(v)); STATE = null; Vault.key = null; location.reload();
      } catch { toast('Fichier non reconnu'); }
    } });
    root.append(h('h2', null, 'Réglages'), profileCard(),
      h('section', { class: 'card' }, h('h3', null, 'Apparence'), h('div', { class: 'row wrap' }, seg([['auto', 'Automatique'], ['dark', 'Sombre'], ['light', 'Clair']], STATE.settings.theme || 'auto', v => { STATE.settings.theme = v; save(); applyTheme(); rerender(); }))),
      h('section', { class: 'card' }, h('h3', null, 'Sécurité'),
        h('div', { class: 'row wrap' }, 'Verrouillage automatique après ', al, ' minutes sans toucher'),
        h('div', { class: 'row' }, h('button', { class: 'btn', onclick: changePw }, 'Changer le mot de passe'))),
      h('section', { class: 'card' }, h('h3', null, 'Gestes et rappels'),
        h('div', { class: 'row wrap' }, 'Mon verre d\'eau : ', inp('number', String(glassMl()), { min: 50, max: 1000, step: 10, style: { width: '100px' }, 'aria-label': 'Verre d\'eau en ml', onchange: e => { STATE.settings.glass = clamp(Math.round(num(e.target.value)) || 250, 50, 1000); save(); toast('Enregistré'); } }), ' ml'),
        h('div', { class: 'row wrap', style: { marginTop: '.5rem' } }, 'Temps disponible pour les tâches : ', inp('number', String(capMin() / 60), { min: 1, max: 16, step: 0.5, style: { width: '90px' }, 'aria-label': 'Heures disponibles par jour pour les tâches', onchange: e => { STATE.settings.capH = clamp(num(e.target.value) || 6, 1, 16); save(); toast('Enregistré'); } }), ' h par jour'),
        h('label', { class: 'daybox', style: { marginTop: '.6rem' } }, h('input', { type: 'checkbox', checked: STATE.settings.remind !== false, onchange: e => { STATE.settings.remind = e.target.checked; save(); } }), 'Rappels des habitudes à leur heure, avec « Fait » et « Plus tard »'),
        h('p', { class: 'muted small' }, 'Les rappels ne partent que quand le panneau est ouvert (onglet ou fenêtre, même en arrière-plan) : sans serveur, rien n\'arrive quand il est fermé. Un rappel, puis une seule relance 30 minutes après.'),
        h('p', { class: 'muted small' }, 'Dans la notification du système, « Fait » et « Plus tard (10 min) » marchent sur Chrome et Edge quand le panneau est servi par son adresse (LANCER_PANNEAU). Si le coffre s\'est verrouillé entre-temps, le geste s\'applique au prochain déverrouillage. Ailleurs, toucher la notification ramène au panneau.'),
        'Notification' in window ? (Notification.permission === 'granted' ? h('small', { class: 'muted' }, 'Notifications du système autorisées : le nom de l\'habitude s\'affiche aussi quand l\'onglet est en arrière-plan.')
          : h('button', { class: 'btn small ghost', onclick: async () => { try { await Notification.requestPermission(); } catch { /* ignore */ } rerender(); } }, 'Autoriser les notifications du système')) : null,
        h('p', { class: 'muted small' }, 'Clavier : touche « ? » pour la liste des raccourcis.')),
      h('section', { class: 'card' }, h('h3', null, 'Sauvegarde'),
        h('p', { class: 'muted' }, 'Tout vit dans ce navigateur, chiffré. Si tu vides les données du navigateur, tout part. Fais un export de temps en temps et garde-le ailleurs (disque, clé USB). Le fichier reste chiffré avec ton mot de passe.'),
        h('p', null, `Dernier export : ${agoTxt(STATE.settings.lastExport)}. Dernière copie automatique : ${agoTxt(lastAuto())}.`),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: exportVault }, 'Exporter le coffre'), h('button', { class: 'btn ghost', onclick: () => file.click() }, 'Importer un coffre'), file),
        h('h3', { style: { marginTop: '1rem' } }, 'Sauvegarde automatique'),
        'showDirectoryPicker' in window ? h('div', null, h('p', { class: 'muted small' }, 'Choisis un dossier (par exemple sur ton disque de sauvegarde) : à chaque verrouillage, le coffre chiffré y est écrit, et les 10 derniers fichiers sont gardés. Rien ne quitte l\'ordinateur. Après un redémarrage du navigateur, il faut parfois redonner l\'accès d\'un geste.'),
          h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost', onclick: chooseBackupDir }, BK.handle ? 'Changer de dossier' : 'Choisir un dossier'),
            BK.handle ? h('button', { class: 'btn ghost', onclick: async () => { const r = await autoBackup(true); toast(r === 'ok' ? 'Copie chiffrée écrite' : 'Accès refusé'); rerender(); } }, 'Sauvegarder maintenant') : null,
            BK.handle ? h('button', { class: 'btn small danger', onclick: forgetBackupDir }, 'Arrêter') : null),
          BK.handle ? h('small', { class: 'muted' }, `Dossier : ${BK.handle.name}${BK.state === 'attente' ? ', en attente de ton accord' : ''}`) : null)
          : h('p', { class: 'muted small' }, 'Ce navigateur ne permet pas d\'écrire dans un dossier choisi (Chrome et Edge sur ordinateur le permettent). Reste l\'export à la main.')),
      exportsCard(),
      h('section', { class: 'card' }, h('h3', null, 'Contenu'),
        h('p', { class: 'muted' }, `${STATE.argent.accounts.length} compte(s), ${STATE.argent.tx.length} transaction(s), ${STATE.argent.debts.length} dette(s), ${P().habits.length} habitude(s), ${P().tasks.length} tâche(s), ${P().goals.length} objectif(s), ${Object.keys(P().journal).length} jour(s) de journal, ${P().workouts.length} séance(s), ${Object.keys(N().log).length} jour(s) de repas, ${N().weights.length} pesée(s).`),
        h('button', { class: 'btn danger', onclick: wipe }, 'Tout effacer')));
  }
};
function changePw() {
  const a = inp('password', '', { autocomplete: 'new-password' }), b = inp('password', '', { autocomplete: 'new-password' });
  modal('Nouveau mot de passe', h('div', { class: 'form' }, field('Nouveau mot de passe', a, 'Dix caractères au minimum'), field('Répète', b)),
    [{ label: 'Changer', run: async () => { if (a.value.length < 10 || a.value !== b.value) { toast('Dix caractères et deux fois le même'); return false; } await Vault.changePassword(a.value); toast('Mot de passe changé'); } }]);
}
async function exportVault() {
  if (STATE) { STATE.settings.lastExport = Date.now(); save(); } // la date du dernier export voyage dans le coffre
  await Vault.flush();
  const blob = new Blob([localStorage.getItem(VAULT_KEY)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = h('a', { href: url, download: `kalmydas-perso-${today()}.vault.json` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  toast('Coffre exporté'); rerender();
}
function wipe() {
  if (!confirm('Tout effacer, définitivement ?')) return;
  if (prompt('Tape EFFACER pour confirmer') !== 'EFFACER') return;
  localStorage.removeItem(VAULT_KEY); localStorage.removeItem(VAULT_KEY + '.prev'); STATE = null; Vault.key = null; location.reload();
}

gate();
