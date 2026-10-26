'use strict';
/* KalMydas PERSO : profil de Kal. Sert à calculer les objectifs (calories, protéines, eau) et les repères de micronutriments.
   Dépense de repos : formule de Mifflin-St Jeor. Dépense totale : repos x niveau d'activité. Ce sont des estimations, pas un avis médical.
   Repères de micros : data/drv.js (EFSA par défaut, DGE/ÖGE ou OSAV au choix) selon le sexe, l'âge, la grossesse ou l'allaitement,
   la ménopause et les phytates. Sources et contrôles : _donnees/SOURCES_DRV.md et _donnees/DRV_AUDIT.md. */

const PF = () => STATE.profile;
const ACTS = [[1.2, 'Sédentaire : bureau, peu de sport'], [1.375, 'Légère : 1 à 3 séances par semaine'], [1.55, 'Modérée : 3 à 5 séances par semaine'], [1.725, 'Forte : 6 à 7 séances par semaine'], [1.9, 'Très forte : travail physique et sport']];
const GOALS = [[-500, 'Perdre du poids, environ 0,5 kg par semaine'], [-250, 'Perdre doucement'], [0, 'Garder mon poids'], [250, 'Prendre doucement'], [400, 'Prendre du muscle']];

function ageYears() {
  const b = PF().born; if (!b) return null;
  const d = parseD(b), n = new Date(); let a = n.getFullYear() - d.getFullYear();
  if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--;
  return a;
}
function bmr() {
  const p = PF(), a = ageYears();
  if (!p.weight || !p.height || a === null) return null;
  return 10 * p.weight + 6.25 * p.height - 5 * a + (p.sex === 'f' ? -161 : 5);
}
const tdee = () => { const b = bmr(); return b === null ? null : b * PF().act; };
function autoTargets() { // calories et macros calculés ; null tant que le profil est incomplet
  const t = tdee(); if (t === null) return null;
  const p = PF(), kcal = Math.round((t + p.goal) / 10) * 10;
  const prot = Math.round(p.weight * 1.8), fat = Math.round(Math.max((kcal * 0.25) / 9, p.weight * 0.8));
  const carb = Math.max(0, Math.round((kcal - prot * 4 - fat * 9) / 4));
  return { kcal, p: prot, c: carb, f: fat };
}

/* ---------- repères DRV ---------- */
const DRV_OK = () => typeof DRV !== 'undefined';
const DRV_SRC = { efsa: 'EFSA', dge: 'DGE/ÖGE', ch: 'OSAV', oms: 'OMS' };
const DRV_TYPE = { PRI: 'apport de référence', AR: 'besoin moyen', AI: 'apport adéquat', RI: 'plage de référence', SAI: 'apport sûr et adéquat', EZ: 'apport recommandé', SW: 'valeur estimée', RW: 'valeur indicative', LIM: 'limite' };
const DRV_KEY = { cho: 'choline' }; // clé de l'app : clé de data/drv.js quand elles diffèrent
// tranche d'âge DRV : 0 = 18 à 24, 1 = 25 à 50, 2 = 51 à 64, 3 = 65 et plus (25 à 50 si l'âge est inconnu)
const drvGroup = a => (a === null ? 1 : a < 25 ? 0 : a < 51 ? 1 : a < 65 ? 2 : 3);
// lit une valeur DRV : nombre, [min, max] (on vise le bas de la plage), texte '>= 30' ou '< 10', ou tableau de 4 tranches
function drvNum(v, gi) {
  if (Array.isArray(v) && v.length === 4) v = v[gi];
  if (Array.isArray(v)) return typeof v[0] === 'number' ? v[0] : null;
  if (typeof v === 'string') { const n = parseFloat(v.replace(',', '.').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; }
  return typeof v === 'number' ? v : null;
}
// valeur pour la clé de phytates la plus proche de celle du profil (EFSA 300/600/900/1200, DGE 330/660/990)
function drvPhytate(obj, want) {
  const ks = Object.keys(obj).map(Number).filter(n => !isNaN(n));
  if (!ks.length) return null;
  return obj[ks.reduce((x, y) => (Math.abs(y - want) < Math.abs(x - want) ? y : x))];
}
// énergie du jour pour les repères par MJ (thiamine, niacine) et en % de l'énergie : réglage manuel, sinon profil, sinon valeur de départ
const drvKcal = () => (N().targets && N().targets.kcal) || ((!N().autoOff && autoTargets()) || DEFAULT_TARGETS).kcal;
// valeur d'un bloc de source pour le profil : sexe, âge, grossesse ou allaitement, ménopause, phytates, dépense
function drvBlockValue(b) {
  const p = PF(), sx = p.sex === 'f' ? 'f' : 'm', gi = drvGroup(ageYears()), etat = sx === 'f' ? (p.etat || '') : '';
  const mj = drvKcal() / DRV.conversions.kcalParMJ;
  let v = null;
  if (b.parMJ) v = drvNum(b[sx], gi) ?? b.parMJ[sx] * mj;                    // thiamine, niacine : valeur fixe si la source en donne une, sinon par MJ
  else if (b.parPhytate) { const z = drvPhytate(b.parPhytate, p.phytate || 600); v = z ? z[sx] : null; } // zinc
  else if (b[sx] && !Array.isArray(b[sx]) && typeof b[sx] === 'object') {    // fer femme : avant ou après la ménopause
    const pre = drvNum(b[sx].avantMenopause, gi), post = drvNum(b[sx].apresMenopause, gi);
    v = p.menopause ? (post ?? pre) : (pre ?? post);
  } else v = drvNum(b[sx], gi);
  if (etat) {                                                                // 'g1', 'g2', 'g3' (trimestres) ou 'all' (allaitement)
    let w = etat === 'all' ? b.allaitement : b.grossesse;
    if (w && typeof w === 'object' && !Array.isArray(w)) {
      const t = etat === 'all' ? null : 't' + etat.slice(1);
      w = (t && (w[t] ?? (t !== 't1' ? w.t23 : undefined))) ?? (gi === 0 ? w['18-24'] : w['25+']) ?? w.avant6mois ?? w;
      if (w && typeof w === 'object' && !Array.isArray(w)) w = drvPhytate(w, p.phytate || 600); // zinc DGE
    }
    if (typeof w === 'string' && /^\+/.test(w.trim())) v = v === null ? null : v + parseFloat(w.replace(',', '.').replace(/[^0-9.]/g, ''));
    else { const x = drvNum(w, gi); if (x !== null) v = x; }
  }
  return v === null ? null : Math.round(v * 100) / 100;
}
/* Repère d'une clé de l'app : { v, s (source prise), type, why }. Règles :
   - vitamine A : toujours DGE/ÖGE en RAE. Les trois bases d'aliments (Anses, OSAV, USDA) publient la vitamine A en RAE
     (rétinol + bêta-carotène / 12) ; le repère EFSA est en RE (bêta-carotène / 6), il ne se compare pas à ces chiffres ;
   - sinon la source choisie dans le profil ; si elle ne donne rien pour ce cas, EFSA, et l'écran le dit. */
function drvRef(k) {
  if (!DRV_OK()) return null;
  const n = DRV.nutriments[DRV_KEY[k] || k]; if (!n) return null;
  const want = PF().drvSrc || 'efsa';
  const tries = k === 'vA' ? [['dge', 'rae']] : [[want, ''], ...(want !== 'efsa' ? [['efsa', 'repli']] : [])];
  for (const [s, why] of tries) {
    const b = n[s]; if (!b) continue;
    const v = drvBlockValue(b);
    if (v !== null) return { v, s, type: b.type, why, unite: b.unite || n.unite };
  }
  return null;
}
// texte court de la source d'un repère, pour l'écran
function refLabel(k) {
  if (N().targets && N().targets[k] !== undefined) return 'réglé à la main';
  if (k === 'o3') return DRV_OK() ? 'EFSA, somme ALA + EPA/DHA (dérivé)' : 'repère de secours';
  const r = drvRef(k); if (!r) return 'repère de secours';
  let t = `${DRV_SRC[r.s]}, ${DRV_TYPE[r.type] || r.type}`;
  if (r.why === 'rae') t += ', en RAE';
  if (r.why === 'repli') t += ` (${DRV_SRC[PF().drvSrc] || ''} ne donne rien ici)`;
  return t;
}
function rdaSet() { // repères de micros : table DRV si elle est chargée, sinon les repères de secours de foods.js
  const o = Object.fromEntries(MICROS.map(m => [m[0], m[3]]));
  if (!DRV_OK()) return o;
  for (const m of MICROS) { if (m[0] === 'o3') continue; const r = drvRef(m[0]); if (r) o[m[0]] = r.v; }
  // oméga-3 total de l'app : repère dérivé (AI ALA EFSA 0,5 % de l'énergie + AI EPA+DHA 250 mg), voir DRV.nutriments.o3
  o.o3 = Math.round((0.005 * drvKcal() / 9 + 0.25) * 10) / 10;
  const fib = drvRef('fib'); if (fib) o.fib = fib.v; // fibres : EFSA 25 g, DGE et OSAV 30 g
  return o;
}
// Repères du détail repliable (sodium, ALA, EPA + DHA) : seulement ceux que data/drv.js donne
function detailRef(k) {
  if (!DRV_OK()) return null;
  if (k === 'na') { const r = drvRef('na'); return r ? { v: r.v, label: `${DRV_SRC[r.s]}, ${DRV_TYPE[r.type] || r.type}` } : null; }
  if (k === 'ala') { const r = drvRef('ala'); return r ? { v: Math.round((r.v / 100) * drvKcal() / 9 * 10) / 10, label: `${DRV_SRC[r.s]}, ${fmtNum(r.v)} % de l'énergie` } : null; }
  return null;
}

/* Eau. EFSA (et OSAV) : eau totale, boissons et eau des aliments réunies. DGE/ÖGE : boissons seules.
   Le panneau compte donc l'eau des aliments notés quand le repère est EFSA ou OSAV, et seulement les boissons avec DGE. */
const waterTotalMode = () => DRV_OK() && (PF().drvSrc || 'efsa') !== 'dge';
function waterTarget() {
  if (!DRV_OK()) return PF().weight ? Math.round((PF().weight * 35) / 50) * 50 : 2500;
  const r = drvRef('eau'); return r ? r.v : 2500;
}
const foodWater = d => (typeof dayTotals === 'function' ? dayTotals(d).eau || 0 : 0); // g d'eau des aliments notés, 1 g = 1 ml
const waterOf = d => (N().water[d] || 0) + (waterTotalMode() ? foodWater(d) : 0);

function applyTheme() {
  const t = (STATE && STATE.settings.theme) || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
}

function profileCard() {
  const p = PF(), a = ageYears(), b = bmr(), td = tdee(), auto = autoTargets();
  const up = (k, conv = x => x) => e => { p[k] = conv(e.target.value); save(); rerender(); };
  const f = {
    sex: sel([['m', 'Homme'], ['f', 'Femme']], p.sex, { onchange: up('sex') }),
    born: inp('date', p.born, { onchange: up('born') }),
    height: inp('text', p.height ? String(p.height) : '', { inputmode: 'decimal', placeholder: 'cm', onchange: up('height', num) }),
    weight: inp('text', p.weight ? String(p.weight) : '', { inputmode: 'decimal', placeholder: 'kg', onchange: up('weight', num) }),
    goalWeight: inp('text', p.goalWeight ? String(p.goalWeight) : '', { inputmode: 'decimal', placeholder: 'kg', onchange: up('goalWeight', num) }),
    act: sel(ACTS.map(x => [String(x[0]), x[1]]), String(p.act), { onchange: up('act', Number) }),
    goal: sel(GOALS.map(x => [String(x[0]), x[1]]), String(p.goal), { onchange: up('goal', Number) }),
    weekMin: inp('text', String(p.weekMin), { inputmode: 'decimal', onchange: up('weekMin', x => num(x) || 150) }),
    drvSrc: sel([['efsa', 'Europe, EFSA (par défaut)'], ['dge', 'Allemagne et Autriche, DGE/ÖGE'], ['ch', 'Suisse, OSAV']], p.drvSrc || 'efsa', { onchange: up('drvSrc') }),
    phytate: sel([['300', 'Peu de céréales complètes et de légumineuses'], ['600', 'Alimentation mixte (par défaut)'], ['900', 'Beaucoup de céréales complètes et de légumineuses'], ['1200', 'Surtout végétal, céréales complètes non germées']],
      String(p.phytate || 600), { onchange: up('phytate', Number) })
  };
  const fem = p.sex === 'f' ? [
    field('Grossesse ou allaitement', sel([['', 'Ni enceinte ni allaitante'], ['g1', 'Enceinte, 1er trimestre'], ['g2', 'Enceinte, 2e trimestre'], ['g3', 'Enceinte, 3e trimestre'], ['all', 'Allaitement']], p.etat || '', { onchange: up('etat') })),
    field('Ménopause', sel([['0', 'Avant la ménopause'], ['1', 'Après la ménopause']], p.menopause ? '1' : '0', { onchange: up('menopause', x => x === '1') }))] : [];
  return h('section', { class: 'card gold' }, h('h3', null, 'Mon profil'),
    h('p', { class: 'muted' }, 'Sert à calculer tes objectifs de calories, de protéines et d\'eau, et les repères de vitamines et minéraux. Reste sur cet appareil, chiffré.'),
    h('div', { class: 'grid-form' }, field('Sexe', f.sex), field('Date de naissance', f.born), field('Taille (cm)', f.height), field('Poids (kg)', f.weight), field('Poids visé (kg)', f.goalWeight), field('Minutes de sport visées par semaine', f.weekMin, '150 est le repère de l\'OMS')),
    h('div', { class: 'form' }, field('Activité', f.act), field('Objectif', f.goal)),
    h('div', { class: 'grid-form', style: { marginTop: '.7rem' } }, field('Repères de', f.drvSrc), field('Phytates (céréales complètes, légumineuses)', f.phytate, 'Change le repère du zinc'), ...fem),
    typeof prefsLigne === 'function' ? prefsLigne() : null,
    b === null ? h('p', { class: 'muted' }, 'Renseigne la date de naissance, la taille et le poids : les objectifs se calculent seuls.')
      : h('div', { class: 'grid4' }, stat('Âge', `${a} ans`), stat('Dépense de repos', `${fmtK(b)} kcal`, 'Mifflin-St Jeor'), stat('Dépense du jour', `${fmtK(td)} kcal`, 'avec ton activité'), stat('Calories visées', `${fmtK(auto.kcal)} kcal`, `${fmtNum(auto.p)} g prot., ${fmtNum(auto.c)} g gluc., ${fmtNum(auto.f)} g lip.`)));
}
