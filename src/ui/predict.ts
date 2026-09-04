/**
 * Phase 2: the projection. Trailing-four-quarter max smoothing, a linear fit from the
 * start of the current consistent block, three decay scenarios, √(hours) sensitivity,
 * +1.5% on marathon times. Gated on enough race-pace history.
 */
import type { DataJson } from '../data/types';
import { TARGETS, type TargetKey } from '../parse/types';
import { timeFor, vdot } from '../data/vdot';
import { C, gridOpt, mk, qt } from './charts';
import { fmt, fmtGoal, LBL, MONTHS, distS, esc } from './format';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const SCN = { cons: { tau: 2.5, mult: 0.7, label: 'Conservative', color: '#7A8894' }, base: { tau: 3.5, mult: 1.0, label: 'Base', color: '#E4B31F' }, opt: { tau: 4.0, mult: 1.2, label: 'Optimistic', color: '#2C6E9E' } } as const;
type Scn = keyof typeof SCN;
const MIN_QUARTERS = 8, MIN_RECENT = 4;

export interface Fit { rate: number; v0: number; t0: number; h0: number; startQ: string; nQ: number; smoothed: { q: string; vdot: number }[] }

function allQuarters(from: string, to: string): string[] {
  const out: string[] = [];
  let y = +from.slice(0, 4), q = +from.slice(5);
  const y1 = +to.slice(0, 4), q1 = +to.slice(5);
  while (y < y1 || (y === y1 && q <= q1)) { out.push(`${y}Q${q}`); if (++q > 4) { q = 1; y++; } }
  return out;
}

/** Start of the current block: the first quarter after the most recent gap of ≥ 2 quarters without a 5K+ effort. */
export function blockStart(D: DataJson): string | null {
  const have = new Set(D.vdot_quarterly.map((x) => x.q));
  if (!have.size) return null;
  const qs = allQuarters(D.vdot_quarterly[0].q, D.vdot_quarterly[D.vdot_quarterly.length - 1].q);
  let start = qs[0], gap = 0;
  for (const q of qs) {
    if (have.has(q)) { if (gap >= 2) start = q; gap = 0; } else gap++;
  }
  return start;
}

export function fitTrend(D: DataJson): Fit | null {
  const all = D.vdot_quarterly;
  const start = blockStart(D);
  if (!start) return null;
  const qi = all.findIndex((x) => x.q === start);
  const block = all.slice(qi);
  const smoothed = block.map((x, i) => ({ q: x.q, vdot: Math.max(...block.slice(Math.max(0, i - 3), i + 1).map((y) => y.vdot)) }));
  const xs = smoothed.map((x) => qt(x.q)), ys = smoothed.map((x) => x.vdot);
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const slope = den ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den : 0;
  const lastQ = all[all.length - 1];
  return { rate: slope, v0: smoothed[smoothed.length - 1].vdot, t0: qt(lastQ.q) + 0.125, h0: D.train_last2y.all_h_wk || 1, startQ: start, nQ: n, smoothed };
}

export function gate(D: DataJson): { ok: boolean; total: number; recent: number } {
  const qs = D.vdot_quarterly.map((x) => x.q);
  if (!qs.length) return { ok: false, total: 0, recent: 0 };
  const last = qs[qs.length - 1];
  const last8 = new Set(allQuarters(last, last).length ? (() => { const out: string[] = []; let y = +last.slice(0, 4), q = +last.slice(5); for (let i = 0; i < 8; i++) { out.push(`${y}Q${q}`); if (--q < 1) { q = 4; y--; } } return out; })() : []);
  const recent = qs.filter((q) => last8.has(q)).length;
  return { ok: qs.length >= MIN_QUARTERS && recent >= MIN_RECENT, total: qs.length, recent };
}

/** Round-number milestones just under the current record (or the current fitness if there is no record). */
function milestones(D: DataJson, vNow: number): [string, string, number, number][] {
  const spec: [TargetKey, number][] = [['5k', 60], ['10k', 120], ['half', 300], ['marathon', 600]];
  const out: [string, string, number, number][] = [];
  for (const [k, step] of spec) {
    const pr = D.pr_progression[k];
    const base = pr?.length ? pr[pr.length - 1].t : timeFor(TARGETS[k], vNow) * (k === 'marathon' ? 1.015 : 1);
    let t = Math.floor(base / step) * step;
    if (t === base) t -= step;
    for (let i = 0; i < 2; i++, t -= step) if (t > 0) out.push([LBL[k], `sub-${fmtGoal(t)}`, TARGETS[k], k === 'marathon' ? t / 1.015 : t]);
  }
  return out;
}

export function renderPredict(D: DataJson) {
  const body = $('#predict-body');
  const g = gate(D);
  const cur = D.vdot_quarterly[D.vdot_quarterly.length - 1];
  const ks: TargetKey[] = ['5k', '10k', 'half', 'marathon'];
  if (!g.ok) {
    body.innerHTML = `<div class="panel"><h3>Not enough race-pace history yet</h3>
      <p>The model needs about two years: at least ${MIN_QUARTERS} quarters with a 5K-or-longer effort, ${MIN_RECENT} of them in the last eight. This export has ${g.total} ${g.total === 1 ? 'quarter' : 'quarters'}${g.total ? `, ${g.recent} recent` : ''}.</p>
      ${cur ? `<p>What is available: your most recent race-equivalent fitness is VDOT <strong>${cur.vdot}</strong>, from a ${LBL[cur.dist]} in ${fmt(cur.t)} on ${cur.d}. At that fitness the Daniels tables give:</p>
      <table>${ks.map((k) => `<tr><td>${LBL[k]}</td><td class="num">${fmt(timeFor(TARGETS[k], cur.vdot) * (k === 'marathon' ? 1.015 : 1))}</td></tr>`).join('')}</table>` : '<p>No run of 5 km or more with a usable effort was found.</p>'}
      </div>` + about();
    return;
  }
  const FIT = fitTrend(D)!;
  let scn: Scn = 'base';
  const t2 = D.train_last2y;
  body.innerHTML = `
  <div class="panel">
    <h3>How the model works</h3>
    <p>Your race-equivalent fitness (VDOT) is estimated each quarter from the best effort of 5 km or longer, then smoothed as the best of the trailing four quarters so an off-season or a hot marathon doesn't read as lost fitness. The trend is fitted on the current consistent block, ${qLabel(FIT.startQ)} to ${qLabel(cur.q)} (${FIT.nQ} quarters, shown dark on the chart). Over that window it has moved at about <strong>${FIT.rate.toFixed(1)}</strong> VDOT points per year on <strong>${t2.all_h_wk.toFixed(1)}</strong> hours of training a week (${t2.run_h_wk.toFixed(1)} h of it running, about ${distS(t2.run_km_wk, 0)}).</p>
    <p>Gains don't stay linear. The model continues the current rate but lets it decay toward a ceiling. The conservative scenario starts at 70% of the measured rate and fades over about 2.5 years; base uses the measured rate over 3.5 years; optimistic uses 120% over 4 years. Training time moves the rate by the square root of the change in hours, so doubling hours does not double the gain. Times are then read off the Daniels tables for each distance, with an extra 1.5% on the marathon because marathon fitness usually trails 5K fitness.</p>
    <div class="slider">
      <label for="hrs">Weekly training hours</label>
      <input type="range" id="hrs" min="${Math.max(1, Math.floor(FIT.h0 * 0.5))}" max="${Math.ceil(FIT.h0 * 1.75) + 1}" step="0.25">
      <output id="hrs-out"></output>
      <span class="note" style="margin:0">your two-year average is ${FIT.h0.toFixed(1)} h/week</span>
    </div>
    <div class="chart tall"><canvas id="c-proj"></canvas></div>
    <p class="note">Dots: measured quarterly fitness (dark inside the fitted window). Lines: projected fitness under the three scenarios, starting from the latest quarter.</p>
  </div>
  <div class="panel">
    <h3>Projected race times</h3>
    <div class="seg" id="seg-scn" role="group" aria-label="Scenario">
      <button data-s="cons" aria-pressed="false">Conservative</button><button data-s="base" aria-pressed="true">Base</button><button data-s="opt" aria-pressed="false">Optimistic</button>
    </div>
    <div style="overflow-x:auto"><table id="t-proj"></table></div>
    <p class="note">Each row is what a well-executed race at that distance could look like at that point, given a proper block for it. You can't hold all four at once: a marathon block costs 5K sharpness and vice versa.</p>
  </div>
  <div class="panel">
    <h3>Milestones</h3>
    <div class="milestones" id="milestones"></div>
    <p class="note">Year the selected scenario first crosses each mark. "Now" means the fitness is already there on paper; it still needs the right race.</p>
  </div>
  <div class="panel">
    <h3>What could make this wrong</h3>
    <ul class="caveats">
      <li><strong>Injury.</strong> The single biggest variable, and the model has no term for it.${D.meta.low_years.length ? ` Your low years (${D.meta.low_years.join(', ')}) may have been life rather than injury, but the risk profile changes with volume.` : ''}</li>
      <li><strong>Age.</strong> Not in the export, so not modelled. Under about 35 it's irrelevant for this horizon; if older, subtract a little from the optimistic line.</li>
      <li><strong>Specificity.</strong> The projection is fitness, not results. Heat, hills, and a bad taper all show up on race day and not in this chart.</li>
      <li><strong>Sample size.</strong> The trend is fitted on ${FIT.nQ} quarters. A plateau or a jump inside that window could be noise around a smoother line.</li>
      <li><strong>Diminishing returns.</strong> Everyone's ceiling is different. The conservative line assumes you're closer to yours than the numbers suggest; the optimistic one assumes you aren't.</li>
    </ul>
  </div>` + about();

  const proj = (s: Scn, t: number, h: number) => { const m = Math.sqrt(h / FIT.h0); const r = FIT.rate * m * SCN[s].mult; const G = r * SCN[s].tau; return FIT.v0 + G * (1 - Math.exp(-(t - FIT.t0) / SCN[s].tau)); };
  const sl = $('#hrs') as HTMLInputElement;
  sl.value = String(FIT.h0);
  const draw = () => {
    const h = +sl.value;
    $('#hrs-out').textContent = h.toFixed(2) + ' h';
    const xMin = Math.floor(Math.min(qt(D.vdot_quarterly[0].q), FIT.t0 - 4));
    const hist = D.vdot_quarterly.filter((x) => qt(x.q) >= xMin).map((x) => ({ x: qt(x.q), y: x.vdot, q: x.q, d: x.dist, t: x.t }));
    const ts: number[] = [];
    for (let t = FIT.t0; t <= FIT.t0 + 4.5; t += 0.125) ts.push(+t.toFixed(3));
    const ds: any[] = [{ type: 'scatter', label: 'measured', data: hist, backgroundColor: hist.map((p) => (p.q >= FIT.startQ ? C.ink : '#A9B2BA')), pointRadius: 4.5, order: 0 }];
    (Object.keys(SCN) as Scn[]).forEach((s) => ds.push({ type: 'line', label: SCN[s].label, data: ts.map((t) => ({ x: t, y: +proj(s, t, h).toFixed(2) })), borderColor: SCN[s].color, borderWidth: s === scn ? 3 : 1.5, borderDash: s === scn ? [] : [5, 4], pointRadius: 0, tension: 0.2, order: 1 }));
    const ys = hist.map((p) => p.y).concat(ts.map((t) => proj('opt', t, h)));
    mk('c-proj', { data: { datasets: ds }, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c: any) => (c.raw.q ? `${c.raw.q}: VDOT ${c.raw.y} (${LBL[c.raw.d as TargetKey]} ${fmt(c.raw.t)})` : `${c.dataset.label} ${c.raw.x.toFixed(2)}: ${c.raw.y}`) } } }, scales: { x: { type: 'linear', min: xMin, max: Math.ceil(FIT.t0 + 4.5), ticks: { stepSize: 1, callback: (v: number) => String(v) }, grid: { display: false } }, y: { min: Math.floor(Math.min(...ys) - 2), max: Math.ceil(Math.max(...ys) + 2), grid: gridOpt, title: { display: true, text: 'VDOT' } } } } });
    const y0 = Math.floor(FIT.t0);
    const when = [{ t: FIT.t0 + 0.08, l: 'Next race' }, { t: y0 + 1.3, l: `Spring ${y0 + 1}` }, { t: y0 + 1.7, l: `Autumn ${y0 + 1}` }, { t: y0 + 2.7, l: `Autumn ${y0 + 2}` }, { t: y0 + 3.7, l: `Autumn ${y0 + 3}` }, { t: y0 + 4.7, l: `Autumn ${y0 + 4}` }];
    $('#t-proj').innerHTML = `<tr><th>When</th><th class="num">VDOT</th>${ks.map((k) => `<th class="num">${LBL[k]}</th>`).join('')}</tr>` +
      when.map((y) => { const v = proj(scn, y.t, h); return `<tr><td>${y.l}</td><td class="num">${v.toFixed(1)}</td>${ks.map((k) => `<td class="num">${fmt(timeFor(TARGETS[k], v) * (k === 'marathon' ? 1.015 : 1))}</td>`).join('')}</tr>`; }).join('') +
      `<tr><td>Current records</td><td class="num">${FIT.v0.toFixed(1)}</td>${ks.map((k) => { const p = D.pr_progression[k]; return `<td class="num" style="color:var(--ink-2)">${p?.length ? fmt(p[p.length - 1].t) : '—'}</td>`; }).join('')}</tr>`;
    $('#milestones').innerHTML = milestones(D, FIT.v0).map(([d, g2, dm, tt]) => {
      const need = vdot(dm, tt);
      let at: number | null = null;
      for (let t = FIT.t0; t <= FIT.t0 + 10; t += 1 / 12) if (proj(scn, t, h) >= need) { at = t; break; }
      const now = proj(scn, FIT.t0, h) >= need;
      const lab = now ? 'now' : at ? `${MONTHS[Math.floor((at % 1) * 12)]} ${Math.floor(at)}` : `beyond ${Math.floor(FIT.t0 + 10)}`;
      return `<div class="ms ${now ? 'done' : ''}"><div class="g">${esc(d)} ${esc(g2)}</div><div class="w">${lab}</div><div class="r">needs VDOT ${need.toFixed(1)}</div></div>`;
    }).join('');
  };
  sl.addEventListener('input', draw);
  $('#seg-scn').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { scn = b.dataset.s as Scn; $('#seg-scn').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); draw(); }));
  draw();
}

function qLabel(q: string) { return `${['winter', 'spring', 'summer', 'autumn'][+q.slice(5) - 1]} ${q.slice(0, 4)}`; }

function about() {
  return `<details class="panel about"><summary><h3 style="display:inline">About this model</h3></summary>
    <p>VDOT is Jack Daniels' single-number estimate of running fitness: the VO₂max that would produce a given race time, using the formulas from <em>Daniels' Running Formula</em> (Daniels &amp; Gilbert, <em>Oxygen Power</em>, 1979). Because it comes from a race time, it bundles economy and threshold in with aerobic capacity, which is what makes it useful for predicting other distances.</p>
    <p>Each quarter's VDOT is the best 5K-or-longer effort in that quarter, so training runs count. The trailing-four-quarter maximum keeps an off-season from reading as a decline. The trend is an ordinary least-squares line through the smoothed points inside the current block, where a block starts after any stretch of two or more quarters with no such effort.</p>
    <p>Projections decay exponentially toward a ceiling: gain = rate × τ × (1 − e<sup>−t/τ</sup>), with τ of 2.5, 3.5 or 4 years by scenario. The hours slider scales the rate by √(hours ÷ your two-year average). Marathon times carry an extra 1.5% because most runners race the marathon a little below their shorter-distance VDOT.</p>
  </details>`;
}
