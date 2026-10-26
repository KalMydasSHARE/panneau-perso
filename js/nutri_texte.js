'use strict';
/* KalMydas PERSO : un repas écrit en une phrase (« 2 œufs, 1 tranche de pain, 1 café au lait »).
   Tout se lit ici, sur l'appareil : aucune IA, aucun envoi. La phrase est coupée en morceaux (virgule, « et », « avec », +, retour à la ligne),
   chaque morceau donne une quantité, une unité et un aliment cherché dans la base (même recherche que la Journée : synonymes, fautes, historique).
   Les grammes viennent, dans l'ordre : de l'unité écrite (g, kg, ml, cl, dl, l) ; d'une portion de maison sourcée (js/portions.js, USDA) qui
   porte le mot écrit (tranche, cuillère, tasse) ; de la portion moyenne de l'aliment ; sinon de la dernière quantité notée ou de la portion
   habituelle, et la ligne le dit (« à vérifier »). Rien n'est noté avant que la proposition soit validée. */

const NOMBRES = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, douze: 12, demi: 0.5, demie: 0.5 };
// unités de poids ou de volume : facteur vers les grammes (1 ml compté 1 g, l'écran le dit)
const UNITES = { g: 1, gr: 1, gramme: 1, grammes: 1, kg: 1000, kilo: 1000, ml: 1, cl: 10, dl: 100, l: 1000, litre: 1000, litres: 1000 };
// mots de maison (lus sans accents) : clé cherchée dans le libellé des portions
const MAISON = [[/^tranches?$/, 'tranche'], [/^(cuilleres?|c|cs|cas|cc|cac)$/, 'cuillere'], [/^tasses?$/, 'tasse'], [/^verres?$/, 'verre'], [/^bols?$/, 'bol'], [/^pots?$/, 'pot'],
  [/^pieces?$/, 'piece'], [/^morceaux?$/, 'morceau'], [/^gousses?$/, 'gousse'], [/^poignees?$/, 'poignee'], [/^parts?$/, 'part'], [/^portions?$/, 'portion'], [/^carres?$/, 'carre'], [/^boules?$/, 'boule']];
const TAILLES = { petit: 'petit', petite: 'petit', moyen: 'moyen', moyenne: 'moyen', gros: 'gros', grosse: 'gros', grand: 'grand', grande: 'grand' };
const PETITS = new Set(['de', 'd', 'du', 'des']);

// « 2 œufs, 1 tranche de pain et un café au lait » -> [{ raw, qty, unit, factor, maison, cuill, taille, nom }]
function parseMeal(text) {
  // la virgule d'un nombre (« 1,5 dl ») ne coupe pas
  return String(text || '').split(/(?<!\d),|,(?!\d)|[;\n+]|\s+et\s+|\s+avec\s+|\s+puis\s+/i).map(s => s.trim()).filter(Boolean).map(raw => {
    let s = raw.replace(/[’']/g, ' ').replace(/½/g, ' 0,5 ').replace(/\s+/g, ' ').trim(), qty = null, unit = '', factor = 0, maison = '', cuill = '', taille = '';
    let m = s.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(.*)$/);
    if (m) { qty = m[1].includes('/') ? +m[1].split('/')[0] / +m[1].split('/')[1] : num(m[1]); s = m[2]; }
    else { const w = normFood(s.split(' ')[0]); if (w in NOMBRES) { qty = NOMBRES[w]; s = s.slice(s.split(' ')[0].length).trim(); } }
    if (qty !== null && /^demie?\b/i.test(s)) { qty *= 0.5; s = s.replace(/^demie?\s*/i, ''); } // « une demi baguette »
    m = s.match(/^(\S+?)\.?(?:\s+|$)(.*)$/); // premier mot : unité de poids, mot de maison ou taille
    const w0 = m ? normFood(m[1]) : '';
    if (m && qty !== null && UNITES[w0] !== undefined) { unit = w0; factor = UNITES[w0]; s = m[2]; }
    else if (m && MAISON.some(([re]) => re.test(w0))) {
      maison = MAISON.find(([re]) => re.test(w0))[1]; s = m[2];
      if (maison === 'cuillere') { // « c. à soupe », « cuillère à café », « cs », « cc »
        const k = s.match(/^(?:a|à)\s+(soupe|caf[eé]|th[eé])\s*(.*)$/i);
        if (k) { cuill = /soupe/i.test(k[1]) ? 'soupe' : 'cafe'; s = k[2]; } else if (/^(cs|cas)$/.test(w0)) cuill = 'soupe'; else if (/^(cc|cac)$/.test(w0)) cuill = 'cafe';
      }
    }
    const ws = s.split(' ').filter(Boolean);
    while (ws.length > 1 && (PETITS.has(normFood(ws[0])) || TAILLES[normFood(ws[0])])) { if (TAILLES[normFood(ws[0])]) taille = TAILLES[normFood(ws[0])]; ws.shift(); }
    return { raw, qty, unit, factor, maison, cuill, taille, nom: ws.join(' ').trim() };
  }).filter(x => x.nom);
}
// portion de l'aliment qui porte le mot de maison écrit (« 1 tranche », « 1 c. à soupe »)
function portionMaison(f, seg) {
  if (!seg.maison) return null;
  return portionsOf(f).find(p => { const l = normFood(p.label).replace(/\./g, ''); return seg.maison === 'cuillere' ? /c a (soupe|cafe)/.test(l) && (!seg.cuill || l.includes(seg.cuill)) : l.includes(seg.maison); }) || null;
}
// Grammes pour un aliment donné. how : d'où ils viennent ; doute : vrai s'ils sont à vérifier
function gramsFor(f, seg) {
  const q = seg.qty === null ? 1 : seg.qty, ps = portionsOf(f);
  if (seg.factor) return { g: r2(q * seg.factor), how: UNITES[seg.unit] >= 1 && /^(g|gr|gramme|grammes|kg|kilo)$/.test(seg.unit) ? 'poids écrit' : 'volume écrit, 1 ml compté 1 g', doute: false };
  const pm = portionMaison(f, seg);
  if (pm) return { g: r2(q * pm.g), how: `${pm.label} = ${fmtNum(pm.g)} g (USDA)`, doute: false };
  if (!seg.maison && ps.length) {
    const p = (seg.taille && ps.find(x => normFood(x.label).includes(seg.taille))) || ps.find(x => /moyen/.test(x.label)) || ps[0];
    return { g: r2(q * p.g), how: `${p.label} = ${fmtNum(p.g)} g (USDA)`, doute: false };
  }
  const last = N().lastG[f.id];
  return { g: r2(q * (last || typicalGrams(f))), how: `${seg.maison ? `pas de poids connu pour « ${seg.maison} » ici, ` : ''}${last ? 'ta dernière quantité' : 'portion habituelle'} : à vérifier`, doute: true };
}
// Aliment et grammes proposés pour un morceau : le premier trouvé, ou le premier qui a la portion écrite (une tranche de pain de mie)
function resolveSeg(seg) {
  let cands = searchFoods(seg.nom, 6);
  if (!cands.length) return { seg, cands, food: null, g: 0, how: 'aucun aliment trouvé', doute: true };
  // « 1 tranche de pain » : si aucun des premiers n'a de tranche connue, on cherche plus loin un aliment qui en a une (pain de mie), proposé en tête
  if (seg.maison && !seg.factor && !cands.some(f => portionMaison(f, seg))) { const w = searchFoods(seg.nom, 40).find(f => portionMaison(f, seg)); if (w) cands = [w, ...cands.slice(0, 5)]; }
  const food = (seg.maison && !seg.factor && cands.find(f => portionMaison(f, seg))) || cands[0];
  return { seg, cands, food, ...gramsFor(food, seg) };
}
/* Fenêtre : on écrit, la proposition se met à jour, chaque ligne se corrige (aliment, grammes, case), puis un seul « Noter ».
   Entrée lit la phrase et met le focus sur « Noter » : une deuxième Entrée note. */
function mealText(d) {
  const st = { text: '', rows: [] }, body = h('div', { class: 'form' }), out = h('div', { class: 'list' });
  const meal = sel(MEALS, ADD.meal, { 'aria-label': 'Repas', onchange: e => { ADD.meal = e.target.value; ADD.mealAt = Date.now(); } });
  const ta = h('textarea', { rows: 2, placeholder: '2 œufs, 1 tranche de pain, 1 café au lait', 'aria-label': 'Le repas en une phrase' });
  const read = () => {
    const old = new Map(st.rows.map(r => [r.seg.raw, r])); // une ligne déjà corrigée garde sa correction
    st.rows = parseMeal(st.text).map(seg => old.get(seg.raw) || { ...resolveSeg(seg), on: true });
    draw();
  };
  let t = null;
  ta.addEventListener('input', e => { st.text = e.target.value; clearTimeout(t); t = setTimeout(read, 250); });
  ta.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault(); clearTimeout(t); st.text = ta.value; read();
    const b = ta.closest('.modal') && ta.closest('.modal').querySelector('.modal-foot [data-primary]'); if (b && st.rows.some(r => r.on && r.food)) b.focus();
  });
  function draw() {
    const on = st.rows.filter(r => r.on && r.food);
    fill(out, st.rows.map(r => h('div', { class: `item nl${r.on ? '' : ' dim'}` },
      h('input', { type: 'checkbox', checked: r.on && !!r.food, disabled: !r.food, 'aria-label': `Noter « ${r.seg.raw} »`, onchange: e => { r.on = e.target.checked; draw(); } }),
      h('div', { class: 'grow' }, h('small', { class: 'muted' }, `« ${r.seg.raw} »`),
        r.food ? h('div', null, sel(r.cands.map(f => [f.id, f.n]), r.food.id, { 'aria-label': `Aliment pour « ${r.seg.raw} »`, onchange: e => { r.food = r.cands.find(x => x.id === e.target.value); Object.assign(r, gramsFor(r.food, r.seg)); draw(); } }))
          : h('small', { class: 'unk' }, 'Rien trouvé : à chercher à la main dans la Journée.'),
        r.food ? h('small', { class: r.doute ? 'unk' : 'muted' }, r.how) : null),
      r.food ? h('div', { class: 'row' }, inp('text', String(r.g), { inputmode: 'decimal', class: 'lim', 'aria-label': `Grammes pour « ${r.seg.raw} »`, onchange: e => { const v = num(e.target.value); if (v > 0) { r.g = v; r.doute = false; r.how = 'quantité corrigée'; } draw(); } }), h('small', null, 'g')) : null)),
      st.rows.length ? h('small', { class: 'muted' }, `${on.length} aliment(s), ${fmtK(sum(on, r => ((r.food.v.kcal || 0) * r.g) / 100))}${on.some(r => r.food.v.kcal === undefined) ? ' + ?' : ''} kcal.`) : null);
  }
  fill(body, h('small', { class: 'muted' }, 'Sépare les aliments par une virgule ou « et ». Lu sur cet appareil, rien n\'est envoyé. Tu vérifies avant de noter.'), ta, field('Repas', meal), out);
  modal('Écrire le repas', body, [{ label: 'Noter', run: () => {
    clearTimeout(t); if (st.text !== ta.value) { st.text = ta.value; read(); }
    const rows = st.rows.filter(r => r.on && r.food && r.g > 0);
    if (!rows.length) { toast('Rien à noter : écris le repas, puis vérifie les lignes'); return false; }
    logEntries(d, rows.map(r => ({ meal: ADD.meal, food: r.food.id, name: r.food.n, g: r.g })), `${rows.length} aliment(s) notés au ${ADD.meal.toLowerCase()}`);
  } }], { focus: ta });
}
