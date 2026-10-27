'use strict';
/* KalMydas PERSO : socle. Coffre chiffre (AES-GCM, cle PBKDF2), outils DOM, dates, graphiques. */

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------- outils ---------- */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = true;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  if (value !== undefined) el.value = value;
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
// append qui saute null et false (append écrirait le mot « null » à l'écran)
const put = (el, ...kids) => el.append(...kids.filter(x => x != null && x !== false));
// fill aplatit les listes : une liste passée telle quelle s'écrirait « [object HTMLElement] »
const fill = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter(x => x != null && x !== false));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function b64enc(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64dec(s) {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/* ---------- dates (toujours en heure locale, format AAAA-MM-JJ) ---------- */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const dow = s => (parseD(s).getDay() + 6) % 7; // 0 = lundi
const weekStart = s => addDays(s, -dow(s));
const monthKey = s => s.slice(0, 7);
const addMonths = (mk, n) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthsBetween = (a, b) => { const x = parseD(a), y = parseD(b); return (y.getFullYear() - x.getFullYear()) * 12 + (y.getMonth() - x.getMonth()) + (y.getDate() - x.getDate()) / 30; };
// Nombre de jours entre deux dates (b moins a). L'arrondi absorbe l'heure gagnée ou perdue au changement d'heure.
const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);
// Même jour du mois n mois plus tard, ramené au dernier jour si le mois est plus court (31 janvier + 1 mois = 28 ou 29 février)
const addMonthsDay = (s, n) => { const d = parseD(s), day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return ymd(d); };
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const JOURS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const monthLabel = mk => { const [y, m] = mk.split('-').map(Number); return `${MOIS[m - 1]} ${y}`; };
const dateLabel = s => { const d = parseD(s); return `${JOURS_LONG[dow(s)]} ${d.getDate()} ${MOIS[d.getMonth()]}`; };
const shortDate = s => { const d = parseD(s); return `${d.getDate()}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`; };

/* ---------- formats ---------- */
const nfMoney = new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 });
const nfMoney0 = new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 });
const fmtMoney = (n, round) => (round ? nfMoney0 : nfMoney).format(Number.isFinite(n) ? n : 0);
const money = (n, round) => h('span', { class: 'amt' }, fmtMoney(n, round));
const nfNum = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 1 });
const fmtNum = n => nfNum.format(Number.isFinite(n) ? n : 0);
// Chiffres honnêtes : les tables ne donnent pas une calorie près au dixième. kcal entières ; grammes entiers dès 10, une décimale en dessous.
const nfInt = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 });
const fmtK = n => nfInt.format(Math.round(Number.isFinite(n) ? n : 0));
const fmtG = n => (Math.abs(Number.isFinite(n) ? n : 0) >= 10 ? fmtK(n) : fmtNum(n));
const fmtPct = (n, d = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(d).replace('.', ',')} %`;
const num = v => { const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const sum = (arr, f = x => x) => arr.reduce((a, x) => a + f(x), 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/* ---------- messages et annulation ----------
   Un seul message à la fois, en bas de l'écran. Avec { undo: true }, il porte un bouton « Annuler » (Ctrl+Z aussi, pendant 10 secondes).
   Avant de changer quelque chose, on en prend une copie avec garde(objet, clé) ; undoable() garde ces copies et les remet si l'on annule. */
const UNDO = { fn: null, until: 0 };
function toast(msg, opts = {}) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const long = opts.undo || (opts.actions && opts.actions.length);
  const ms = opts.ms || (long ? 8000 : 2600);
  const t = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }, h('span', null, msg),
    opts.undo ? h('button', { class: 'toast-btn', onclick: () => undo() }, 'Annuler') : null,
    (opts.actions || []).map(a => h('button', { class: 'toast-btn', onclick: () => { t.remove(); a.run(); } }, a.label)));
  document.body.append(t);
  clearTimeout(toast.t1); clearTimeout(toast.t2);
  toast.t1 = setTimeout(() => t.classList.add('out'), ms - 400);
  toast.t2 = setTimeout(() => t.remove(), ms);
  return t;
}
// copie de obj[key] ; la fonction rendue remet obj[key] exactement comme avant (ou l'efface s'il n'existait pas)
function garde(obj, key) {
  const had = Object.prototype.hasOwnProperty.call(obj, key), old = had ? structuredClone(obj[key]) : undefined;
  return () => { if (had) obj[key] = structuredClone(old); else delete obj[key]; };
}
function undoable(msg, restores, opts = {}) {
  const rs = [].concat(restores);
  UNDO.fn = () => rs.forEach(r => r()); UNDO.until = Date.now() + 10000;
  return toast(msg, { ...opts, undo: true });
}
function undo() {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  if (!UNDO.fn || Date.now() > UNDO.until || !STATE) { UNDO.fn = null; return false; }
  const f = UNDO.fn; UNDO.fn = null; f();
  if (typeof foodIndex === 'function') foodIndex.m = null;
  save(); rerender(); toast('Annulé');
  return true;
}

/* ---------- fenetres ----------
   Entrée dans un champ simple lance le bouton principal (le dernier qui n'est ni « danger » ni discret). Échap ferme.
   opts.sheet : sur téléphone, la fenêtre monte du bas de l'écran (actions rapides). */
function modal(title, body, actions = [], opts = {}) {
  const back = document.activeElement; // le focus revient là où il était à la fermeture
  const close = () => { if (!ov.isConnected) return; ov.remove(); if (back && back.isConnected && back.focus) back.focus({ preventScroll: true }); };
  const prim = [...actions].reverse().find(a => !/danger|ghost/.test(a.cls || ''));
  const btns = actions.map(a => h('button', { class: a.cls || 'btn', 'data-primary': a === prim ? '1' : null, onclick: async e => { if ((await a.run(e)) !== false) close(); } }, a.label));
  const onkey = e => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    const t = e.target;
    if (e.key === 'Enter' && !e.defaultPrevented && !e.isComposing && t.tagName === 'INPUT' && !/^(search|checkbox|radio|button|submit|file|range)$/.test(t.type) && !t.hasAttribute('data-noenter')) {
      const p = ov.querySelector('.modal-foot [data-primary]'); if (p) { e.preventDefault(); p.click(); }
    }
  };
  const ov = h('div', { class: `overlay${opts.sheet ? ' sheet' : ''}`, onclick: e => { if (e.target === ov) close(); }, onkeydown: onkey },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h3', null, title), h('button', { class: 'icon', onclick: close, 'aria-label': 'Fermer' }, '×')),
      h('div', { class: 'modal-body' }, body),
      btns.length ? h('div', { class: 'modal-foot' }, btns) : null));
  ov.__close = close;
  document.body.append(ov);
  const first = opts.focus || ov.querySelector('input:not([type=checkbox]),select,textarea') || ov.querySelector('.modal-foot button, .modal-head button');
  if (first) first.focus();
  return close;
}
// Échap ferme la fenêtre du dessus même si le focus en est sorti (contenu redessiné)
addEventListener('keydown', e => { if (e.key !== 'Escape') return; const ovs = document.querySelectorAll('.overlay'), top = ovs[ovs.length - 1]; if (top && !top.contains(e.target) && top.__close) top.__close(); });
const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', null, hint) : null);
const inp = (type, value, extra) => h('input', { type, value: value ?? '', ...(extra || {}) });
function sel(options, value, extra) {
  return h('select', extra, options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: v === value }, l); }));
}

/* ---------- graphiques SVG ---------- */
const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
  for (const c of kids.flat()) if (c) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
function lineChart(points, { height = 160, fmt = v => fmtMoney(v, true) } = {}) {
  const W = 600, H = height, P = 8;
  if (points.length < 2) return h('div', { class: 'empty' }, 'Le graphique apparaît dès le deuxième relevé (un par jour de saisie).');
  const ys = points.map(p => p.y);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = i => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = v => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const area = `${d} L${x(points.length - 1)},${H - P} L${x(0)},${H - P} Z`;
  const last = points[points.length - 1];
  return h('div', { class: 'chart' },
    svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Évolution' },
      svg('path', { d: area, class: 'area' }), svg('path', { d, class: 'line' }),
      svg('circle', { cx: x(points.length - 1), cy: y(last.y), r: 4, class: 'dot' })),
    h('div', { class: 'chart-legend' }, h('span', null, points[0].x), h('span', { class: 'amt' }, `${fmt(lo)} à ${fmt(hi)}`), h('span', null, last.x)));
}
function barPairs(rows) { // rows: [{label, a, b}] a = entrees, b = depenses
  const max = Math.max(1, ...rows.flatMap(r => [r.a, r.b]));
  return h('div', { class: 'bars' }, rows.map(r =>
    h('div', { class: 'bar-col' },
      h('div', { class: 'bar-pair' },
        h('div', { class: 'bar in', style: { height: `${(r.a / max) * 100}%` }, title: `Entrées ${fmtMoney(r.a, true)}` }),
        h('div', { class: 'bar out', style: { height: `${(r.b / max) * 100}%` }, title: `Dépenses ${fmtMoney(r.b, true)}` })),
      h('small', null, r.label))));
}
const progress = (pct, cls = '') => h('div', { class: `prog ${cls}` }, h('i', { style: { width: `${clamp(pct, 0, 100)}%` } }));
function ring(pct, label, sub) {
  const r = 42, c = 2 * Math.PI * r, p = clamp(pct, 0, 100);
  return h('div', { class: 'ring' },
    svg('svg', { viewBox: '0 0 100 100' },
      svg('circle', { cx: 50, cy: 50, r, class: 'ring-bg' }),
      p > 0 ? svg('circle', { cx: 50, cy: 50, r, class: 'ring-fg', 'stroke-dasharray': `${(p / 100) * c} ${c}`, transform: 'rotate(-90 50 50)' }) : null), // à 0 %, le bout arrondi dessinait un point
    h('div', { class: 'ring-txt' }, h('b', null, label), sub ? h('small', null, sub) : null));
}

/* ---------- etat et coffre chiffre ---------- */
let STATE = null;
const VAULT_KEY = 'kmp.vault';
const Vault = {
  key: null, salt: null, it: 250000, timer: null, dirty: false, q: Promise.resolve(), prevDone: false,
  exists() { try { return !!localStorage.getItem(VAULT_KEY); } catch { return false; } },
  supported() { return !!(window.crypto && crypto.subtle); },
  async derive(pw, salt, it) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  },
  async create(pw) {
    this.salt = crypto.getRandomValues(new Uint8Array(16));
    this.key = await this.derive(pw, this.salt, this.it);
    STATE = defaultState();
    this.prevDone = false;
    await this.flush();
  },
  async unlock(pw) {
    const read = k => { try { const x = JSON.parse(localStorage.getItem(k)); return x && x.salt && x.iv && x.data ? x : null; } catch { return null; } };
    let v = read(VAULT_KEY), fromPrev = false;
    if (!v) { v = read(VAULT_KEY + '.prev'); fromPrev = true; } // coffre abîmé : on essaie la copie du début de la session d'avant
    if (!v) throw new Error('Coffre illisible dans ce navigateur et pas de copie de secours. Pour repartir d\'un export : efface les données du site, crée un coffre provisoire, puis Réglages, Importer un coffre.');
    const salt = b64dec(v.salt);
    const key = await this.derive(pw, salt, v.it || this.it);
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(v.iv) }, key, b64dec(v.data));
      STATE = migrate(JSON.parse(dec.decode(plain)));
    } catch { return false; }
    this.key = key; this.salt = salt; this.it = v.it || this.it;
    this.prevDone = fromPrev; // ouvert depuis la copie : on ne l'écrase pas avec le coffre abîmé
    if (fromPrev) setTimeout(() => toast('Coffre abîmé : ouvert depuis la copie de secours, faite au début de la session d\'avant.'), 500);
    return true;
  },
  save() { // groupe les ecritures rapprochees
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  },
  flush() { // les écritures passent l'une après l'autre : une ancienne version ne peut pas écraser une plus récente
    clearTimeout(this.timer);
    this.q = this.q.then(() => this.write()).catch(e => { console.error('[coffre]', e); toast(`Enregistrement impossible : ${e.message}`); });
    return this.q;
  },
  async write() {
    if (!this.key || !STATE) return;
    this.dirty = false;
    const key = this.key, salt = this.salt, it = this.it, iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(STATE))));
    if (key !== this.key) return; // verrouillé ou mot de passe changé pendant le chiffrement : la suite de la file écrira
    const out = JSON.stringify({ v: 1, it, salt: b64enc(salt), iv: b64enc(iv), data: b64enc(ct) });
    // .prev garde le coffre tel qu'il était à l'ouverture de la session : une vraie version d'avant, pas celle d'il y a 200 ms
    if (!this.prevDone) { const prev = localStorage.getItem(VAULT_KEY); try { if (prev) localStorage.setItem(VAULT_KEY + '.prev', prev); } catch { /* place manquante : on garde au moins le coffre */ } this.prevDone = true; }
    try { localStorage.setItem(VAULT_KEY, out); } catch (e) { localStorage.removeItem(VAULT_KEY + '.prev'); localStorage.setItem(VAULT_KEY, out); }
  },
  async changePassword(pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), key = await this.derive(pw, salt, this.it);
    await this.q; // une écriture en cours finit avec l'ancienne clé, puis on bascule
    this.salt = salt; this.key = key;
    await this.flush();
  },
  async lock() {
    if (this.dirty) await this.flush(); else await this.q;
    clearTimeout(this.timer); this.dirty = false;
    this.key = null; STATE = null;
  }
};
// DATA_VER change à chaque enregistrement : les calculs gardés en mémoire (force des habitudes) savent qu'ils sont à refaire
let DATA_VER = 0;
const save = () => { DATA_VER++; Vault.save(); };

/* ---------- donnees de depart ---------- */
function defaultState() {
  return {
    v: 1,
    // glass : verre en ml ; fold : cartes repliées ; lastExport : dernier export du coffre ; onboarded : accueil vu ; remind : rappels des habitudes ;
    // capH : heures disponibles par jour pour les tâches (charge du jour) ; rest : repos entre deux séries de musculation, en secondes
    settings: { autolock: 10, theme: 'auto', glass: 250, fold: {}, lastExport: 0, created: Date.now(), onboarded: false, remind: true, capH: 6, rest: 90 },
    profile: { sex: 'm', born: '', height: 0, weight: 0, goalWeight: 0, act: 1.375, goal: 0, weekMin: 150,
      drvSrc: 'efsa', phytate: 600, menopause: false, etat: '' }, // repères : source (efsa, dge, ch), phytates mg/j, ménopause, grossesse g1 à g3 ou allaitement
    argent: { accounts: [], tx: [], debts: [], budgets: {}, snaps: [] },
    plan: {
      identity: '', rules: [],
      pillars: ['Tâches', 'Sport', 'Activité', 'Social', 'Nutrition', 'Argent'].map(n => ({ id: uid(), name: n, vision: '' })),
      habits: [], checks: {}, skips: {}, tasks: [], notes: {}, goals: [], journal: {}, workouts: [], people: [], focus: {}, reviews: {}, timer: null,
      pauses: [], // { id, from, to, habit } ; habit vide = toutes les habitudes (vacances, maladie)
      muscu: null // séance de musculation en cours (js/muscu.js)
    },
    nutri: { targets: null, foods: [], log: {}, lastG: {}, water: {}, supps: [], supLog: {}, recipes: [], weights: [], fast: null, fasts: [], plan: {}, shop: {},
      prefs: defaultPrefs(), // préférences alimentaires (js/preferences.js)
      menu: { maxMin: 40, sansCuisson: false, matin: 'petit' }, // menu du jour : temps de préparation voulu, au plus (5, 10, 20 ou 40 min) ; matin : un petit truc d'abord, ou un repas
      reserveDepart: 'vide' } // réserves : 'vide' (on ne compte que le suivi) ou 'plein' (état de départ normal, prise de sang récente)
  };
}
/* Préférences alimentaires : profil (clé de FOODFLAGS.meta.profils), allergies et intolérances (drapeaux), mode strict (un drapeau inconnu écarte),
   états posés dans la liste à cocher (noeuds, aliments), drapeaux exclus ou évités venus de la liste, repas refusés, masquer ce que j'exclus. */
function defaultPrefs() { return { profil: null, allergies: [], strict: false, noeuds: {}, aliments: {}, flagsExclus: [], flagsEviter: [], repasNon: [], masquer: true, cru: false, shelton: false, seul: false }; }
function migratePrefs(p) {
  const d = defaultPrefs(), o = { ...d, ...(p && typeof p === 'object' ? p : {}) };
  for (const k of ['allergies', 'flagsExclus', 'flagsEviter', 'repasNon']) if (!Array.isArray(o[k])) o[k] = [];
  for (const k of ['noeuds', 'aliments']) if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {};
  if (typeof o.profil !== 'string') o.profil = null;
  o.strict = !!o.strict; o.masquer = o.masquer !== false; o.cru = !!o.cru; o.shelton = !!o.shelton; o.seul = !!o.seul;
  return o;
}
function migrate(s) {
  const d = defaultState();
  // un coffre d'avant l'accueil guidé ne le revoit pas, et sa date de création reste inconnue (0)
  if (s.settings && !('onboarded' in s.settings)) { s.settings.onboarded = true; if (!('created' in s.settings)) s.settings.created = 0; }
  s.profile = { ...d.profile, ...(s.profile || {}) };
  s.settings = { ...d.settings, ...(s.settings || {}) };
  if (!s.settings.fold || typeof s.settings.fold !== 'object') s.settings.fold = {};
  s.argent = { ...d.argent, ...(s.argent || {}) };
  s.plan = { ...d.plan, ...(s.plan || {}) };
  s.nutri = { ...d.nutri, ...(s.nutri || {}) };
  // préférences, réglages du menu et départ des réserves (24 octobre 2026) : un coffre d'avant les reçoit vides
  s.nutri.prefs = migratePrefs(s.nutri.prefs);
  s.nutri.menu = { ...d.nutri.menu, ...(s.nutri.menu && typeof s.nutri.menu === 'object' ? s.nutri.menu : {}) };
  if (![5, 10, 20, 40].includes(s.nutri.menu.maxMin)) s.nutri.menu.maxMin = 40;
  if (s.nutri.menu.matin !== 'repas') s.nutri.menu.matin = 'petit';
  delete s.nutri.menu.cru; // « Cru » vit dans les préférences depuis le 26 octobre 2026
  if (s.nutri.reserveDepart !== 'plein') s.nutri.reserveDepart = 'vide';
  // ancien réglage d'activité 1,4 absent de la liste : la liste affichait « sédentaire » alors que le calcul prenait 1,4. On prend le niveau le plus proche.
  if (typeof ACTS !== 'undefined' && !ACTS.some(a => a[0] === s.profile.act)) s.profile.act = ACTS.reduce((b, a) => (Math.abs(a[0] - s.profile.act) < Math.abs(b[0] - s.profile.act) ? a : b), ACTS[1])[0];
  return s;
}

/* ---------- registre des modules et briques communes ---------- */
const MODULES = {};
let rerender = () => {};
const r2 = n => Math.round(n * 100) / 100;
function stat(label, value, sub, cls = '') {
  return h('div', { class: `card stat ${cls}` }, h('small', null, label), h('div', { class: 'big' }, value), sub ? h('small', { class: 'muted' }, sub) : null);
}
function monthNav(mk, set) {
  return h('div', { class: 'monthnav' },
    h('button', { class: 'icon', onclick: () => set(addMonths(mk, -1)), 'aria-label': 'Mois précédent' }, '‹'),
    h('b', null, monthLabel(mk)),
    h('button', { class: 'icon', onclick: () => set(addMonths(mk, 1)), 'aria-label': 'Mois suivant' }, '›'));
}
function dayNav(d, set) {
  return h('div', { class: 'monthnav' },
    h('button', { class: 'icon', onclick: () => set(addDays(d, -1)), 'aria-label': 'Jour précédent' }, '‹'),
    h('b', null, d === today() ? `Aujourd'hui, ${dateLabel(d)}` : dateLabel(d)),
    h('button', { class: 'icon', onclick: () => set(addDays(d, 1)), 'aria-label': 'Jour suivant' }, '›'),
    d !== today() ? h('button', { class: 'btn small ghost', onclick: () => set(today()) }, "Aujourd'hui") : null);
}
// Carte repliable dont l'état (ouverte ou fermée) est retenu dans le coffre
// kids peut être une fonction : rien n'est calculé tant que la carte est fermée
function foldCard(key, title, kids, { open = false, cls = 'card' } = {}) {
  const st = STATE.settings.fold || (STATE.settings.fold = {}), isOpen = key in st ? !!st[key] : open, lazy = typeof kids === 'function';
  return h('details', { class: `${cls} fold`, open: isOpen, ontoggle: e => {
    const v = e.currentTarget.open; if (v === isOpen && st[key] === undefined) return;
    if (st[key] !== v) { st[key] = v; save(); if (v && lazy && !isOpen) rerender(); }
  } }, h('summary', null, h('h3', null, title)), lazy ? (isOpen ? kids() : null) : kids);
}
function seg(options, value, onpick) {
  return h('div', { class: 'seg' }, options.map(([v, l]) => h('button', { type: 'button', class: v === value ? 'on' : '', 'aria-pressed': v === value ? 'true' : 'false', onclick: () => onpick(v) }, l)));
}
