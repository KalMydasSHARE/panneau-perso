'use strict';
/* KalMydas PERSO : Nutrition, le reste. Recettes, plan de repas et liste de courses, poids, tendances, aliments, objectifs. */

/* ----- recettes ----- */
function recipeTotals(r) { // par portion
  const t = totalsOf(r.items.map(i => ({ food: i.food, g: i.g, name: i.name })), null), k = r.portions || 1;
  for (const key in t) if (key !== 'unk') t[key] /= k;
  return t;
}
function addRecipe(r, d, meal, eaten = 1) {
  const k = eaten / (r.portions || 1);
  logEntries(d, r.items.map(i => ({ meal, food: i.food, name: i.name, g: r2(i.g * k), recipe: r.name })), `${r.name} ajoutée au ${meal.toLowerCase()}`);
}
function saveAsRecipe(entries, label) {
  const items = entries.filter(e => e.food).map(e => ({ food: e.food, name: e.name, g: e.g }));
  if (!items.length) return toast('Ce repas n\'a que des saisies rapides');
  const name = inp('text', label, { placeholder: 'Nom de la recette' }), portions = inp('text', '1', { inputmode: 'decimal' });
  modal('Enregistrer comme recette', h('div', { class: 'form' }, field('Nom', name), field('Nombre de portions', portions, 'Les quantités du repas feront ce nombre de portions.')),
    [{ label: 'Enregistrer', run: () => { if (!name.value.trim()) return false; N().recipes.push({ id: uid(), name: name.value.trim(), portions: num(portions.value) || 1, items }); save(); rerender(); toast('Recette enregistrée'); } }]);
}
function vueRecettes(root) {
  if (typeof vueBibliotheque === 'function') root.append(vueBibliotheque()); // repas complets de data/repas.js, filtrés par les préférences
  root.append(h('div', { class: 'row between' }, h('h2', null, 'Mes recettes'), h('button', { class: 'btn', onclick: () => editRecipe() }, '+ Créer')),
    h('p', { class: 'muted' }, 'Une recette garde ses ingrédients et leurs grammes. Ses calories, macros et micros se calculent seuls, par portion.'));
  if (!N().recipes.length) root.append(h('div', { class: 'empty' }, 'Aucune recette. Crée-en une, ou transforme un repas du journal en recette.'));
  const tg = targets();
  const cx = typeof prefsCtx === 'function' && FLAGS_OK() ? prefsCtx() : null;
  root.append(h('div', { class: 'list' }, N().recipes.map(r => { const t = recipeTotals(r), ex = cx && cx.actif ? r.items.filter(i => cx.v(i.food).v === 'exclu') : []; return h('div', { class: 'card item' },
    h('div', { class: 'grow' }, h('b', null, r.name), h('small', { class: 'muted' }, ` · ${r.portions} portion(s) · ${r.items.length} ingrédient(s)`), ex.length ? h('small', { class: 'neg block' }, `Contient ce que tu exclus : ${ex.map(i => shortName(i.name)).join(', ')}`) : null,h('div', { class: 'muted small' }, `Par portion : ${fmtK(t.kcal)}${t.unk.kcal ? ' + ?' : ''} kcal · P ${fmtNum(t.p)} · G ${fmtNum(t.c)} · L ${fmtNum(t.f)} · micros ${fmtPct(microPct(t, tg), 0)} d'une journée`)),
    h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => recipeToLog(r) }, 'Ajouter au journal'), h('button', { class: 'btn small ghost', onclick: () => editRecipe(r) }, 'Modifier'),
      h('button', { class: 'btn small danger', onclick: () => { const u = garde(N(), 'recipes'); N().recipes = N().recipes.filter(x => x !== r); save(); rerender(); undoable(`Recette ${r.name} supprimée`, u); } }, 'Supprimer'))); })));
}
function recipeToLog(r) {
  const p = inp('text', '1', { inputmode: 'decimal' }), m = sel(MEALS, ADD.meal), day = inp('date', today());
  modal(`Ajouter ${r.name}`, h('div', { class: 'form' }, field('Portions mangées', p), field('Repas', m), field('Jour', day)), [{ label: 'Ajouter', run: () => { addRecipe(r, day.value || today(), m.value, num(p.value) || 1); } }]);
}
function editRecipe(r) {
  const st = { name: r ? r.name : '', portions: r ? r.portions : 1, items: r ? r.items.map(i => ({ ...i })) : [], q: '' };
  const body = h('div', { class: 'form' });
  function draw() {
    const t = recipeTotals({ items: st.items, portions: st.portions });
    const q = inp('search', st.q, { placeholder: 'Ajouter un ingrédient', oninput: e => { st.q = e.target.value; list(); } });
    const res = h('div', { class: 'results' });
    const addItem = (f, g) => { st.items.push({ food: f.id, name: f.n, g: g || N().lastG[f.id] || typicalGrams(f) }); st.q = ''; draw(); };
    function list() { res.replaceChildren(h('div', { class: 'list' }, (st.q.trim() ? searchFoods(st.q, 6) : []).map(f => h('button', { class: 'pick-line', onclick: () => addItem(f) }, h('span', null, f.n), h('small', { class: 'muted' }, foodMeta(f)))))); }
    fill(body, 
      field('Nom', inp('text', st.name, { oninput: e => { st.name = e.target.value; } })), field('Nombre de portions', inp('text', String(st.portions), { inputmode: 'decimal', onchange: e => { st.portions = num(e.target.value) || 1; draw(); } })),
      h('div', { class: 'list' }, st.items.map((i, ix) => h('div', { class: 'item' }, h('div', { class: 'grow' }, i.name), inp('text', String(i.g), { inputmode: 'decimal', class: 'lim', onchange: e => { i.g = num(e.target.value); draw(); } }), h('small', null, 'g'), h('button', { class: 'icon', onclick: () => { st.items.splice(ix, 1); draw(); } }, '×')))),
      q, res, h('p', { class: 'muted' }, `Par portion : ${fmtK(t.kcal)} kcal, ${fmtNum(t.p)} g de protéines, ${fmtNum(t.c)} g de glucides, ${fmtNum(t.f)} g de lipides.`),
      t.unk.kcal ? h('p', { class: 'unk small' }, `${t.unk.kcal} ingrédient(s) sans énergie publiée : pas comptés dans les calories.`) : null);
    list();
  }
  draw();
  modal(r ? `Modifier ${r.name}` : 'Nouvelle recette', body, [{ label: 'Enregistrer', run: () => {
    if (!st.name.trim() || !st.items.length) { toast('Un nom et au moins un ingrédient'); return false; }
    const rec = { name: st.name.trim(), portions: st.portions || 1, items: st.items }; if (r) Object.assign(r, rec); else N().recipes.push({ id: uid(), ...rec });
    save(); rerender();
  } }]);
}

/* ----- plan de repas et liste de courses ----- */
let planWk = weekStart(today());
function vuePlanning(root) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(planWk, i)), tg = targets();
  root.append(h('div', { class: 'row between wrap' },
    h('div', { class: 'monthnav' }, h('button', { class: 'icon', 'aria-label': 'Semaine précédente', onclick: () => { planWk = addDays(planWk, -7); rerender(); } }, '‹'), h('b', null, `Semaine du ${shortDate(days[0])}`), h('button', { class: 'icon', 'aria-label': 'Semaine suivante', onclick: () => { planWk = addDays(planWk, 7); rerender(); } }, '›'),
      planWk !== weekStart(today()) ? h('button', { class: 'btn small ghost', onclick: () => { planWk = weekStart(today()); rerender(); } }, 'Cette semaine') : null),
    h('button', { class: 'btn small ghost', onclick: () => { let n = 0; days.forEach((d, i) => { const from = N().log[addDays(d, -7)] || []; if (from.length && !(N().plan[d] || []).length) { N().plan[d] = from.map(e => ({ ...e, id: uid() })); n++; } }); save(); rerender(); toast(n ? `${n} jour(s) copiés de la semaine d'avant` : 'Rien à copier'); } }, 'Reprendre la semaine d\'avant')));
  root.append(h('div', { class: 'cols' }, days.map((d, i) => {
    const pl = N().plan[d] || [], t = totalsOf(pl, null);
    return h('section', { class: `card ${d === today() ? 'gold' : ''}` }, h('div', { class: 'row between' }, h('b', null, `${JOURS_LONG[i]} ${parseD(d).getDate()}`), h('small', { class: 'muted' }, pl.length ? `${fmtK(t.kcal)} / ${fmtK(tg.kcal)} kcal` : '')),
      MEALS.map(m => { const es = pl.filter(e => e.meal === m); return es.length ? h('div', { class: 'group' }, h('small', { class: 'muted up' }, m), es.map(e => h('div', { class: 'item' }, h('div', { class: 'grow' }, e.name, h('small', { class: 'muted' }, e.n ? ' · saisie rapide' : ` · ${fmtNum(e.g)} g`)),
        h('button', { class: 'icon', title: 'Mangé : le mettre au journal', 'aria-label': `${e.name} mangé : le mettre au journal`, onclick: () => { const rp = garde(N().plan, d); N().plan[d] = pl.filter(x => x !== e); if (!N().plan[d].length) delete N().plan[d]; logEntries(d, [{ meal: e.meal, food: e.food, name: e.name, g: e.g, n: e.n }], `${shortName(e.name)} noté au journal`, [rp]); } }, '✓'),
        h('button', { class: 'icon', 'aria-label': `Retirer ${e.name}`, onclick: () => { const rp = garde(N().plan, d); N().plan[d] = pl.filter(x => x !== e); if (!N().plan[d].length) delete N().plan[d]; save(); rerender(); undoable(`${shortName(e.name)} retiré du plan`, rp); } }, '×')))) : null; }),
      h('button', { class: 'btn small ghost', onclick: () => planAdd(d) }, '+ Ajouter'));
  })));
  // liste de courses : tout ce qui est prévu dans la semaine, regroupé
  const agg = new Map();
  for (const d of days) for (const e of N().plan[d] || []) { if (!e.food) continue; const f = foodById(e.food), k = e.name; const o = agg.get(k) || { name: k, g: 0, grp: f && f.g ? f.g : 'Autres' }; o.g += e.g; agg.set(k, o); }
  const wkShop = planWk, checked = N().shop[wkShop] || {}; // pas de fiche vide pour chaque semaine regardée
  const groups = [...new Set([...agg.values()].map(x => x.grp))].sort();
  root.append(h('section', { class: 'card' }, h('div', { class: 'row between' }, h('h3', null, 'Liste de courses'), agg.size ? h('button', { class: 'btn small ghost', onclick: async () => { const txt = [...agg.values()].map(x => `- ${x.name} : ${fmtNum(x.g)} g`).join('\n'); try { await navigator.clipboard.writeText(txt); toast('Liste copiée'); } catch { toast('Copie impossible ici'); } } }, 'Copier') : null),
    agg.size ? groups.map(g => h('div', { class: 'group' }, h('small', { class: 'muted up' }, g), [...agg.values()].filter(x => x.grp === g).sort((a, b) => a.name.localeCompare(b.name)).map(x => h('label', { class: `check ${checked[x.name] ? 'done' : ''}` },
      h('input', { type: 'checkbox', checked: !!checked[x.name], onchange: e => { if (e.target.checked) checked[x.name] = true; else delete checked[x.name]; if (Object.keys(checked).length) N().shop[wkShop] = checked; else delete N().shop[wkShop]; save(); rerender(); } }), h('span', { class: 'grow' }, x.name), h('small', { class: 'muted' }, `${fmtNum(x.g)} g`)))))
      : h('div', { class: 'empty' }, 'Planifie tes repas de la semaine : la liste de courses se fait toute seule.')));
}
function planAdd(d) {
  const st = { mode: 'food', q: '', pick: null, g: '', meal: ADD.meal, rec: N().recipes[0] ? N().recipes[0].id : '', portions: '1' };
  const body = h('div', { class: 'form' });
  function draw() {
    const tabs = seg([['food', 'Aliment'], ['recipe', 'Recette']], st.mode, v => { st.mode = v; draw(); }), meal = sel(MEALS, st.meal, { onchange: e => { st.meal = e.target.value; } });
    if (st.mode === 'recipe') return body.replaceChildren(tabs, N().recipes.length ? h('div', { class: 'form' }, field('Recette', sel(N().recipes.map(r => [r.id, r.name]), st.rec, { onchange: e => { st.rec = e.target.value; } })), field('Portions', inp('text', st.portions, { inputmode: 'decimal', oninput: e => { st.portions = e.target.value; } })), field('Repas', meal)) : h('div', { class: 'empty' }, 'Aucune recette.'));
    const q = inp('search', st.q, { placeholder: 'Chercher un aliment', oninput: e => { st.q = e.target.value; st.pick = null; res(); } }), box = h('div', { class: 'results' });
    function res() { box.replaceChildren(h('div', { class: 'list' }, (st.q.trim() && !st.pick ? searchFoods(st.q, 6) : []).map(f => h('button', { class: 'pick-line', onclick: () => { st.pick = f.id; st.q = f.n; st.g = String(N().lastG[f.id] || typicalGrams(f)); draw(); } }, h('span', null, f.n), h('small', { class: 'muted' }, foodMeta(f)))))); }
    fill(body, tabs, q, box, st.pick ? h('div', { class: 'row wrap' }, inp('text', st.g, { inputmode: 'decimal', oninput: e => { st.g = e.target.value; } }), h('small', null, 'g'), meal) : null); res();
  }
  draw();
  modal(`Prévoir le ${dateLabel(d)}`, body, [{ label: 'Prévoir', run: () => {
    const pl = (N().plan[d] = N().plan[d] || []);
    if (st.mode === 'recipe') { const r = N().recipes.find(x => x.id === st.rec); if (!r) return false; const k = (num(st.portions) || 1) / (r.portions || 1); pl.push(...r.items.map(i => ({ id: uid(), meal: st.meal, food: i.food, name: i.name, g: r2(i.g * k) }))); }
    else { const f = st.pick && foodById(st.pick); const g = num(st.g); if (!f || g <= 0) return false; pl.push({ id: uid(), meal: st.meal, food: f.id, name: f.n, g }); }
    save(); rerender();
  } }]);
}

/* ----- poids et mesures ----- */
/* Tendance plutôt que bruit : moyenne des pesées des 7 derniers jours à chaque pesée, puis pente de cette moyenne sur 4 semaines (droite des
   moindres carrés), en kg par semaine. Rien sous 3 pesées ou 10 jours d'écart : la pente ne voudrait rien dire. */
function weightTrend(W, to = today()) {
  const avg = W.map(x => { const win = W.filter(y => y.d <= x.d && y.d >= addDays(x.d, -6)); return { d: x.d, kg: sum(win, y => y.kg) / win.length }; });
  const pts = avg.filter(x => x.d >= addDays(to, -27) && x.d <= to);
  let week = null;
  if (pts.length >= 3 && daysBetween(pts[0].d, pts[pts.length - 1].d) >= 10) {
    const xs = pts.map(x => daysBetween(pts[0].d, x.d)), mx = sum(xs) / xs.length, my = sum(pts, x => x.kg) / pts.length;
    const sxx = sum(xs, v => (v - mx) ** 2), sxy = sum(xs.map((v, i) => (v - mx) * (pts[i].kg - my)));
    week = sxx ? (sxy / sxx) * 7 : null;
  }
  return { avg, week, n: pts.length };
}
function vueCorps(root) {
  const W = N().weights.slice().sort((a, b) => a.d.localeCompare(b.d)), p = PF(), tr = weightTrend(W);
  const d = inp('date', today()), kg = inp('text', '', { inputmode: 'decimal', placeholder: 'kg' }), waist = inp('text', '', { inputmode: 'decimal', placeholder: 'tour de taille, cm' }), fat = inp('text', '', { inputmode: 'decimal', placeholder: 'masse grasse, %' });
  const cur = W.length ? W[W.length - 1] : null, avg7 = W.filter(x => x.d >= addDays(today(), -6)), a7 = avg7.length ? sum(avg7, x => x.kg) / avg7.length : null;
  // pesée de référence : la dernière d'il y a au moins 4 semaines, mais pas plus de 8 (sinon « sur 4 semaines » ne veut plus rien dire)
  const ago = W.filter(x => x.d <= addDays(today(), -28) && x.d >= addDays(today(), -56) && cur && x.d < cur.d).pop(), ch = cur && ago ? cur.kg - ago.kg : null;
  // dépense réelle estimée : calories moyennes mangées moins ce que le poids a pris, sur 28 jours
  let real = null;
  if (cur && ago) { const span = daysBetween(ago.d, cur.d); const days = Array.from({ length: span }, (_, i) => addDays(ago.d, i)).filter(x => (N().log[x] || []).length); if (days.length >= 10 && span >= 14) { const eaten = sum(days, x => dayTotals(x).kcal) / days.length; if (eaten >= 1000) real = eaten - (cur.kg - ago.kg) * 7700 / span; } }
  put(root, h('h2', null, 'Poids et mesures'),
    h('div', { class: 'grid4' }, stat('Moyenne 7 jours', a7 ? `${fmtNum(a7)} kg` : '–', cur ? `dernière pesée ${fmtNum(cur.kg)} kg, ${shortDate(cur.d)}` : 'aucune pesée'),
      stat('Tendance', tr.week === null ? '–' : `${tr.week > 0.05 ? '+' : tr.week < -0.05 ? '−' : ''}${fmtNum(Math.abs(tr.week))} kg par semaine`, tr.week === null ? 'dès 3 pesées sur 10 jours' : `moyenne 7 jours, ${tr.n} pesées en 4 semaines`),
      stat('Sur 4 semaines', ch !== null ? `${ch > 0 ? '+' : ''}${fmtNum(ch)} kg` : '–', 'pesée contre pesée'),
      stat('Vers mon poids visé', cur && p.goalWeight ? `${fmtNum(cur.kg - p.goalWeight)} kg` : '–', p.goalWeight ? `visé ${fmtNum(p.goalWeight)} kg` : 'à régler dans Réglages')),
    real ? h('section', { class: 'card gold' }, h('h3', null, 'Ta dépense réelle'), h('p', null, `D'après ce que tu as mangé et l'évolution de ton poids sur 4 semaines : environ `, h('b', null, `${fmtNum(real)} kcal par jour`), tdee() ? `, contre ${fmtNum(tdee())} estimés avec ton profil.` : '.'), h('small', { class: 'muted' }, 'Fiable seulement si tu notes presque tous tes repas.')) : null,
    h('section', { class: 'card' }, h('h3', null, 'Ajouter une pesée'), h('div', { class: 'grid-form' }, field('Date', d), field('Poids (kg)', kg), field('Tour de taille', waist), field('Masse grasse', fat)),
      h('button', { class: 'btn', onclick: () => { const v = num(kg.value); if (v <= 0) return toast('Mets le poids'); const u = [garde(N(), 'weights'), garde(PF(), 'weight')]; N().weights = N().weights.filter(x => x.d !== d.value); N().weights.push({ id: uid(), d: d.value || today(), kg: v, waist: num(waist.value) || undefined, fat: num(fat.value) || undefined }); const latest = N().weights.slice().sort((a, b) => a.d.localeCompare(b.d)).pop(); PF().weight = latest.kg; save(); rerender(); undoable(`Pesée notée : ${fmtNum(v)} kg`, u); } }, 'Enregistrer')),
    h('section', { class: 'card' }, h('h3', null, 'Courbe'), W.length >= 2 ? (() => { // axe en jours : deux pesées à une semaine d'écart ne sont pas collées comme deux pesées d'un même jour
      const W2 = W.slice(-120), d0 = W2[0].d, xd = d => daysBetween(d0, d), av = tr.avg.slice(-120);
      return [linesChart([{ name: 'Moyenne 7 jours', color: 'var(--gold)', pts: av.map(x => ({ x: xd(x.d), y: x.kg })) }, { name: 'Pesées', color: 'var(--mut)', dots: true, pts: W2.map(x => ({ x: xd(x.d), y: x.kg })) }]
        .concat(p.goalWeight ? [{ name: 'Visé', color: 'var(--pos)', pts: [{ x: 0, y: p.goalWeight }, { x: xd(W2[W2.length - 1].d), y: p.goalWeight }] }] : []), { xlabels: [shortDate(d0), shortDate(W2[W2.length - 1].d)] }),
      h('small', { class: 'muted' }, 'Le poids d\'un jour bouge avec l\'eau et le sel. Le trait suit la moyenne des 7 derniers jours, les points sont les pesées.')];
    })() : h('div', { class: 'empty' }, 'Deux pesées font une courbe.')),
    W.length ? h('section', { class: 'card' }, h('h3', null, 'Historique'), h('div', { class: 'list' }, W.slice().reverse().slice(0, 30).map(x => h('div', { class: 'item' }, h('div', { class: 'grow' }, shortDate(x.d)), h('b', null, `${fmtNum(x.kg)} kg`), x.waist ? h('small', { class: 'muted' }, ` ${fmtNum(x.waist)} cm`) : null, x.fat ? h('small', { class: 'muted' }, ` ${fmtNum(x.fat)} %`) : null,
      h('button', { class: 'icon', 'aria-label': `Supprimer la pesée du ${shortDate(x.d)}`, onclick: () => { const u = [garde(N(), 'weights'), garde(PF(), 'weight')]; N().weights = N().weights.filter(y => y !== x); save(); rerender(); undoable(`Pesée du ${shortDate(x.d)} supprimée`, u); } }, '×'))))) : null);
}

/* ----- tendances ----- */
let tendRange = 14;
function vueTendances(root) {
  const tg = targets(), days = Array.from({ length: tendRange }, (_, i) => addDays(today(), i - tendRange + 1)), totals = days.map(d => ({ d, t: dayTotals(d), has: (N().log[d] || []).length > 0 || Object.keys(N().supLog[d] || {}).length > 0 }));
  const used = totals.filter(x => x.has), avg = k => (used.length ? sum(used, x => Math.min(1, (x.t[k] || 0) / tg[k])) / used.length : 0);
  root.append(h('div', { class: 'row between wrap' }, h('h2', null, 'Tendances'), seg([[7, '7 jours'], [14, '14 jours'], [30, '30 jours']].map(([v, l]) => [String(v), l]), String(tendRange), v => { tendRange = +v; rerender(); })));
  if (!used.length) return root.append(h('div', { class: 'empty' }, 'Note tes repas quelques jours : les tendances apparaissent ici.'));
  const worst = MICROS.map(m => ({ m, a: avg(m[0]) })).sort((a, b) => a.a - b.a).slice(0, 5);
  root.append(h('div', { class: 'grid4' }, stat('Jours notés', `${used.length} / ${tendRange}`), stat('Calories moyennes', `${fmtK(sum(used, x => x.t.kcal) / used.length)} kcal`, `objectif ${fmtK(tg.kcal)}`), stat('Protéines moyennes', `${fmtNum(sum(used, x => x.t.p) / used.length)} g`, `objectif ${fmtNum(tg.p)}`), stat('Micros moyens', fmtPct(sum(MICROS, m => avg(m[0])) / MICROS.length * 100, 0), 'part des repères')),
    h('section', { class: 'card' }, h('h3', null, 'Calories par jour'), barsChart(totals.map(x => ({ label: String(parseD(x.d).getDate()), v: x.t.kcal, cls: x.t.kcal > tg.kcal * 1.1 ? 'out' : 'in' })), { goal: tg.kcal })),
    h('section', { class: 'card' }, h('h3', null, 'Couverture des micros, jour par jour'), linesChart([{ name: 'Micros', color: 'var(--gold)', pts: totals.map((x, i) => ({ x: i, y: x.has ? microPct(x.t, tg) : NaN })) }], { min: 0, max: 100, xlabels: [shortDate(days[0]), shortDate(days[days.length - 1])] })),
    h('section', { class: 'card gold' }, h('h3', null, 'Ce qui manque le plus'), h('div', { class: 'chips' }, worst.map(x => h('button', { class: `chip pick ${x.a >= 0.7 ? 'ok' : 'bad'}`, onclick: () => sourcesModal(x.m) }, `${x.m[1]} ${fmtPct(x.a * 100, 0)}`))), h('small', { class: 'muted' }, 'Touche un micro pour voir quels aliments en sont riches.')));
  if (tendRange <= 14) root.append(h('section', { class: 'card scroll' }, h('table', { class: 'week heatmap' },
    h('thead', null, h('tr', null, h('th', null, ''), totals.map(x => h('th', null, JOURS[dow(x.d)], h('small', null, parseD(x.d).getDate()))), h('th', null, 'Moy.'))),
    h('tbody', null, MICROS.map(m => h('tr', null, h('td', { class: 'name' }, m[1]), totals.map(x => { const r = (x.t[m[0]] || 0) / tg[m[0]]; return h('td', { class: x.has ? `heat ${covClass(r)}` : 'heat none', title: x.has ? `${fmtNum(x.t[m[0]])} ${m[2]}` : '' }, x.has ? `${Math.round(Math.min(r, 9.99) * 100)}` : ''); }), h('td', { class: 'sc' }, `${Math.round(avg(m[0]) * 100)}`)))))),
    h('small', { class: 'muted' }, 'Chaque case est le pourcentage du repère du jour. Vert 100 et plus, orange 50 à 99, rouge sous 50.'));
  else root.append(h('section', { class: 'card' }, h('h3', null, 'Moyenne par micro'), h('div', { class: 'micros' }, MICROS.map(m => { const a = avg(m[0]); return h('div', { class: 'micro click', onclick: () => sourcesModal(m) }, h('div', { class: 'row between' }, h('b', null, m[1]), h('small', { class: covClass(a) + '-t' }, fmtPct(a * 100, 0))), progress(a * 100, covClass(a))); }))));
}

/* ----- aliments ----- */
let foodQ = '';
function vueAliments(root) {
  const nb = ciqualFoods().filter(f => !f.hidden && !f.twinOf).length;
  const q = h('input', { type: 'search', value: foodQ, 'aria-label': 'Chercher un aliment', placeholder: `Chercher dans les ${fmtNum(nb)} aliments et les tiens`, oninput: e => { foodQ = e.target.value; draw(); } });
  const box = h('div');
  const g1 = (f, k) => (f.v[k] === undefined ? '?' : fmtNum(f.v[k]));
  function draw() {
    const list = foodQ.trim() ? searchFoods(foodQ, 40) : N().foods;
    box.replaceChildren(h('div', { class: 'list' }, list.map(f => h('div', { class: 'card item' },
      h('div', { class: 'grow click', onclick: () => foodSheet(f), title: 'Voir la fiche' }, h('b', null, f.n), h('small', { class: 'muted' }, ` · ${foodMeta(f)}`),
        h('div', { class: 'muted small' }, `100 g : ${fmtKcal(f.v.kcal)} kcal · P ${g1(f, 'p')} · G ${g1(f, 'c')} · L ${g1(f, 'f')}`)),
      h('div', { class: 'row' }, h('button', { class: 'btn small ghost', onclick: () => foodSheet(f) }, 'Fiche'), h('button', { class: 'btn small ghost', onclick: () => editFood(f) }, f.base ? 'Copier' : 'Modifier'),
        f.base ? null : h('button', { class: 'btn small danger', onclick: () => { if (confirm(`Supprimer ${f.n} ? Les repas déjà notés perdent leurs micros.`)) { N().foods = N().foods.filter(x => x !== f); foodIndex.m = null; save(); rerender(); } } }, 'Supprimer'))))),
      !foodQ.trim() && !N().foods.length ? h('div', { class: 'empty' }, 'Cherche un aliment dans la table, ou crée le tien (produit avec étiquette, complément).') : null);
  }
  draw();
  root.append(h('div', { class: 'row between wrap' }, h('h2', null, 'Aliments'), h('button', { class: 'btn', onclick: () => editFood() }, '+ Créer')),
    h('p', { class: 'muted' }, 'Tables Ciqual 2025 (Anses, Licence Ouverte) et base suisse des valeurs nutritives V 7.1 (OSAV), choline et quelques trous complétés par l\'USDA. Valeurs pour 100 g. Une valeur absente est inconnue, pas zéro. Touche un aliment pour sa fiche. Les produits emballés se cherchent dans l\'onglet Journée, « Produit emballé ».'), q, box);
}
function editFood(f) {
  const isNew = !f, own = f && !f.base, src = f || { n: '', v: {} };
  const name = inp('text', own || isNew ? src.n : `${src.n} (copie)`), fields = {};
  const mk = (k, label, unit) => { fields[k] = inp('text', src.v[k] !== undefined ? String(r2(src.v[k] * 1000) / 1000) : '', { inputmode: 'decimal', placeholder: 'inconnu' }); return field(`${label} (${unit})`, fields[k]); };
  modal(isNew ? 'Nouvel aliment' : own ? `Modifier ${src.n}` : `Copier ${src.n}`, h('div', { class: 'form' },
    field('Nom', name), h('small', { class: 'muted up' }, 'Pour 100 g. Laisse vide ce que tu ne sais pas : vide veut dire inconnu, 0 veut dire zéro.'),
    h('div', { class: 'grid-form' }, [...MACROS, ...EXTRAS].map(m => mk(m[0], m[1], m[2]))),
    h('small', { class: 'muted up' }, 'Micronutriments pour 100 g'), h('div', { class: 'grid-form' }, MICROS.map(m => mk(m[0], m[1], m[2]))),
    h('details', { class: 'more' }, h('summary', null, 'Autres nutriments (facultatif)'), h('div', { class: 'grid-form' }, DETAILS.map(m => mk(m[0], m[1], m[2]))))),
    [{ label: 'Enregistrer', run: () => {
      if (!name.value.trim()) return false;
      const v = {}; for (const k in fields) { const s = fields[k].value.trim(); if (s !== '') v[k] = num(s); } // vide = inconnu, énergie comprise
      const rec = { n: name.value.trim(), g: '', v, known: MICROS.filter(m => v[m[0]] !== undefined).length };
      if (own) Object.assign(f, rec); else N().foods.push({ id: uid(), ...rec });
      foodIndex.m = null; save(); rerender();
    } }]);
}

/* ----- objectifs ----- */
function vueNObjectifs(root) {
  const base = { ...DEFAULT_TARGETS, ...rdaSet(), ...((N().autoOff ? null : autoTargets()) || {}) }, tg = targets(), f = {};
  const hint = k => (k === 'kcal' || k === 'p' || k === 'c' || k === 'f' ? (N().targets && N().targets[k] !== undefined ? 'réglé à la main' : N().autoOff || bmr() === null ? 'valeur de départ' : 'calcul du profil') : refLabel(k));
  const mk = (k, label, unit) => { f[k] = inp('text', String(tg[k]), { inputmode: 'decimal' }); return field(`${label} (${unit})`, f[k], hint(k)); };
  const pr = DRV_OK() && PF().weight && !(PF().sex === 'f' && PF().etat) ? drvRef('p') : null; // protéines : repère en g par kg (grossesse : en g par jour, non affiché)
  const src = PF().drvSrc || 'efsa';
  root.append(h('h2', null, 'Mes objectifs du jour'),
    h('section', { class: 'card gold' }, h('label', { class: 'daybox' }, h('input', { type: 'checkbox', checked: !N().autoOff, onchange: e => { N().autoOff = !e.target.checked; save(); rerender(); } }), 'Calculer calories et macros avec mon profil'),
      bmr() === null ? h('p', { class: 'muted' }, 'Profil incomplet : renseigne ta date de naissance, ta taille et ton poids dans Réglages. En attendant, valeurs de départ.') : h('p', { class: 'muted' }, `Profil : ${fmtNum(tdee())} kcal de dépense par jour, objectif « ${(GOALS.find(x => x[0] === PF().goal) || [0, ''])[1].toLowerCase()} ».`),
      pr ? h('p', { class: 'muted small' }, `Protéines : repère ${DRV_SRC[pr.s]} ${fmtNum3(pr.v)} g par kg, soit ${fmtNum(pr.v * PF().weight)} g. L'EFSA juge sûr jusqu'à deux fois ce repère (1,66 g par kg) ; au-delà, pas de donnée, pas de danger établi. Ton objectif : ${fmtNum(tg.p / PF().weight)} g par kg.`) : null),
    h('p', { class: 'muted' }, DRV_OK() ? `Repères de micros : ${DRV_SRC[src]} (à changer dans Réglages, Mon profil), selon ton sexe, ton âge et ton profil. Vitamine A : DGE/ÖGE en RAE, pour rester dans la même unité que les bases d'aliments. Ce que tu changes ici prime sur le calcul.`
      : 'Table des repères non chargée : repères de secours. Ce que tu changes ici prime sur le calcul.'),
    h('section', { class: 'card' }, h('h3', null, 'Calories et macros'), h('div', { class: 'grid-form' }, MACROS.map(m => mk(m[0], m[1], m[2])))),
    h('section', { class: 'card' }, h('h3', null, 'Micronutriments'), h('div', { class: 'grid-form' }, MICROS.map(m => mk(m[0], m[1], m[2])))),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { const o = {}; for (const k in f) { const v = num(f[k].value); if (v > 0 && Math.abs(v - base[k]) > 1e-9) o[k] = v; } N().targets = Object.keys(o).length ? o : null; save(); rerender(); toast('Objectifs enregistrés'); } }, 'Enregistrer'),
      h('button', { class: 'btn ghost', onclick: () => { if (confirm('Effacer mes réglages manuels ?')) { N().targets = null; save(); rerender(); } } }, 'Revenir au calcul')));
}
