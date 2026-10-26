'use strict';
/* KalMydas PERSO : graphiques communs au plan de vie et à la nutrition (SVG, sans bibliothèque). */

// Barres simples : values = [{label, v, cls}], ligne de repère optionnelle
function barsChart(values, { height = 140, goal = null, fmt = v => fmtNum(v) } = {}) {
  const max = Math.max(1, goal || 0, ...values.map(x => x.v));
  return h('div', { class: 'bars wide', style: { height: `${height}px` } }, values.map(x =>
    h('div', { class: 'bar-col' }, h('div', { class: 'bar-single' }, h('div', { class: `bar ${x.cls || 'in'}`, style: { height: `${(x.v / max) * 100}%` }, title: `${x.label} : ${fmt(x.v)}` })), h('small', null, x.label))),
    goal ? h('div', { class: 'goal-line', style: { bottom: `calc(${(goal / max) * 100}% * ${(height - 22) / height} + 22px)` }, title: `objectif ${fmt(goal)}` }) : null);
}
// Une ou plusieurs courbes sur des dates : series = [{name, color, pts:[{x:index, y}], dots}] ; dots : des points sans trait
function linesChart(series, { height = 150, xlabels = [], min = null, max = null } = {}) {
  const W = 600, H = height, P = 10;
  const all = series.flatMap(s => s.pts.map(p => p.y)).filter(v => Number.isFinite(v));
  if (all.length < 2) return h('div', { class: 'empty' }, 'Pas encore assez de points pour tracer une courbe.');
  let lo = min !== null ? min : Math.min(...all), hi = max !== null ? max : Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const n = Math.max(1, ...series.flatMap(s => s.pts.map(p => p.x))), x = i => P + (i / n) * (W - 2 * P), y = v => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  return h('div', { class: 'chart' },
    svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': series.map(s => s.name).join(', ') || 'Courbe' },
      // dots : un point = un trait de longueur nulle à bout rond, qui reste rond même quand le dessin est étiré
      ...series.map(s => svg('path', { d: s.pts.filter(p => Number.isFinite(p.y)).map((p, i) => (s.dots ? `M${x(p.x).toFixed(1)},${y(p.y).toFixed(1)} l0,0` : `${i ? 'L' : 'M'}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`)).join(' '), class: s.dots ? 'line dots' : 'line', style: `stroke:${s.color || 'var(--gold)'}` }))),
    h('div', { class: 'chart-legend' }, h('span', null, xlabels[0] || ''), series.length > 1 ? h('span', null, series.map(s => h('span', { style: { color: s.color, marginRight: '.6rem' } }, `● ${s.name}`))) : h('span', { class: 'amt' }, `${fmtNum(lo)} à ${fmtNum(hi)}`), h('span', null, xlabels[xlabels.length - 1] || '')));
}
// Carte de chaleur façon calendrier : cells = [{d, v(0..1 ou null), title}], rendue par semaines, lundi en haut
function heatmap(cells, { weeks = 26 } = {}) {
  const byDay = new Map(cells.map(c => [c.d, c]));
  const end = weekStart(today()), start = addDays(end, -7 * (weeks - 1));
  const cols = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i), c = byDay.get(d);
      const lvl = !c || c.v === null || c.v === undefined ? 'n' : c.v >= 0.9 ? '4' : c.v >= 0.6 ? '3' : c.v >= 0.3 ? '2' : c.v > 0 ? '1' : '0';
      col.push(h('i', { class: `hm hm${lvl} ${d > today() ? 'fut' : ''}`, title: `${shortDate(d)}${c && c.title ? ' : ' + c.title : ''}` }));
    }
    cols.push(h('div', { class: 'hm-col' }, col));
  }
  return h('div', { class: 'heatmap-cal' }, cols);
}
function stars(value, onpick, max = 5, labels = []) {
  return h('div', { class: 'rate' }, Array.from({ length: max }, (_, i) => h('button', { type: 'button', class: i < value ? 'on' : '', title: labels[i] || String(i + 1), 'aria-label': `${i + 1} sur ${max}${labels[i] ? ', ' + labels[i] : ''}`, 'aria-pressed': value === i + 1 ? 'true' : 'false', onclick: () => onpick(value === i + 1 ? 0 : i + 1) }, String(i + 1))));
}
