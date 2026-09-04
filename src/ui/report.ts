import type { DataJson, EffortRow, SportGroup } from '../data/types';
import { TARGETS, type TargetKey } from '../parse/types';
import { vdot } from '../data/vdot';
import { nearestTarget } from '../data/build';
import { dayNumber, dateFromDayNumber, addYears } from '../data/tz';
import { C, destroyAll, dy, gridOpt, mk, reduced, yearColorFn } from './charts';
import * as copy from './copy';
import { KEYS, LBL, dist, distR, distS, distUnit, elevS, esc, fmt, getUnits, n, pace, paceS, paceUnit, setUnits, speedS, monthYear, hour12, MONTHS } from './format';
import { renderHero } from './hero';
import { renderPredict } from './predict';
import template from './report.html?raw';

export interface ReportHandlers {
  onEditRaces(): void;
  onStartOver(): void;
  onMaxHr(v: number | null): void;
}

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const set = (id: string, text: string) => { const el = document.getElementById(id); if (!el) return; el.textContent = text; el.hidden = !text; };

let currentTab = 'overview';
let curDist: TargetKey = '5k';

export function renderReport(root: HTMLElement, D: DataJson, h: ReportHandlers) {
  destroyAll();
  root.innerHTML = template;
  const bike = D.meta.primary_sport === 'bike';
  const hasRuns = D.totals.runs > 0;
  const yearColor = yearColorFn(+D.first.slice(0, 4), +D.last.slice(0, 4));

  // ---------- header, controls
  document.title = `${D.meta.first_name ? D.meta.first_name + ' · ' : ''}${copy.title(D).replace(/\.$/, '')}`;
  $('#who').textContent = D.meta.first_name ? `${D.meta.first_name}${D.meta.city ? ', ' + D.meta.city : ''}` : '';
  $('#h-title').textContent = copy.title(D);
  $('#h-lede').textContent = copy.lede(D);
  $('#seg-units').querySelectorAll('button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.u === getUnits()));
    b.addEventListener('click', () => { setUnits(b.dataset.u as 'km' | 'mi'); renderReport(root, D, h); });
  });
  $('#edit-races').addEventListener('click', h.onEditRaces);
  $('#edit-races-2').addEventListener('click', (e) => { e.preventDefault(); h.onEditRaces(); });
  $('#start-over').addEventListener('click', h.onStartOver);
  if (hasRuns) renderHero(D); else $('#race').hidden = true;

  // ---------- tabs (bike-first athletes get the running tabs demoted, or dropped if there are none)
  const order = bike ? ['overview', 'volume', 'multi', ...(hasRuns ? ['progress', 'records', 'predict'] : [])] : ['overview', 'progress', 'records', 'volume', 'multi', 'predict'];
  const labels: Record<string, string> = { overview: 'Overview', progress: 'Progress', records: 'Races & records', volume: 'Volume & habits', multi: bike ? 'All sports' : 'Multisport', predict: 'Where this goes' };
  if (!order.includes(currentTab)) currentTab = 'overview';
  $('#tabs').innerHTML = order.map((t) => `<button role="tab" data-tab="${t}" aria-selected="${t === currentTab}">${labels[t]}</button>`).join('');
  const built: Record<string, boolean> = {};
  const build: Record<string, () => void> = { overview, progress, records, volume, multi, predict: () => renderPredict(D) };
  const show = (t: string) => {
    currentTab = t;
    document.querySelectorAll('nav [role=tab]').forEach((x) => x.setAttribute('aria-selected', String((x as HTMLElement).dataset.tab === t)));
    document.querySelectorAll('section.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + t));
    if (!built[t]) { build[t](); built[t] = true; }
  };
  document.querySelectorAll('nav [role=tab]').forEach((b) => b.addEventListener('click', () => { show((b as HTMLElement).dataset.tab!); window.scrollTo({ top: $('nav').offsetTop, behavior: reduced ? 'auto' : 'smooth' }); }));
  show(currentTab);
  $('#foot').textContent = copy.footer(D);

  // ---------- OVERVIEW
  function overview() {
    const yrs = D.yearly;
    set('ov-h', bike ? `The shape of ${copy.word(copy.spanYears(D))} years on the bike` : `The shape of ${copy.word(copy.spanYears(D))} years`);
    set('ov-lede', copy.overviewLede(D));
    const key = bike ? 'bike_km' : 'run_km';
    const maxkm = Math.max(1, ...yrs.map((y) => y[key]));
    $('#timeline').innerHTML = yrs.map((y) => {
      const b = D.best_by_year['5k']?.[y.year];
      const small = bike ? `${y.rides} rides · ${n(y.bike_h)} h<br>longest ${y.rides ? distS(Math.max(...D.longest_rides.filter((r) => r.d.startsWith(String(y.year))).map((r) => r.km), 0), 0) : '—'}` : `${y.runs} runs<br>${b ? '5K ' + fmt(b.t) : '—'}`;
      return `<div class="yr"><div class="y">${y.year}</div><div class="bar" style="width:${Math.max(3, y[key] / maxkm * 100)}%"></div><div class="km">${distR(y[key])}</div><div class="s">${small}</div></div>`;
    }).join('');
    const t = D.totals;
    const stats: [string, string][] = bike
      ? [[n(yrs.reduce((a, y) => a + y.rides, 0)), 'rides recorded'], [n(t.bike_hours), 'hours in the saddle'], [n(t.active_days), 'days with an activity'], [elevS(t.bike_elev), 'climbed'], [D.longest_rides.length ? distS(D.longest_rides[0].km, 0) : '—', 'longest ride'], ...(yrs.some((y) => y.pw_avg) ? [[`${Math.round(yrs.filter((y) => y.pw_avg).slice(-1)[0].pw_avg!)} W`, `average power, ${yrs.filter((y) => y.pw_avg).slice(-1)[0].year}`] as [string, string]] : [[n(t.runs), 'runs'] as [string, string]])]
      : [[n(t.runs), 'runs recorded'], [n(t.run_hours), 'hours on your feet'], [n(t.active_days), 'days with an activity'], [String(t.marathons), t.marathons === 1 ? 'marathon' : 'marathons'], [String(t.halfs_plus), 'runs of a half or longer'], [elevS(t.run_elev), 'climbed on foot']];
    $('#stats').innerHTML = stats.map(([v, l]) => `<div class="panel stat"><div class="bignum">${v}</div><div class="big-label">${l}</div></div>`).join('');
    const mo = D.monthly;
    set('monthly-h', `${getUnits() === 'mi' ? 'Miles' : 'Kilometres'} ${bike ? 'ridden' : 'run'} per month, every month since ${monthYear(D.first)}`);
    set('monthly-note', bike ? '' : copy.monthlyNote(D));
    mk('c-monthly', { type: 'bar', data: { labels: mo.map((m) => m.m), datasets: [{ label: distUnit(), data: mo.map((m) => +dist(bike ? m.bike_km : m.run_km).toFixed(1)), backgroundColor: mo.map((m) => yearColor(+m.m.slice(0, 4))), borderWidth: 0, barPercentage: 1, categoryPercentage: 0.9 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => bike ? `${c.raw} ${distUnit()} · ${mo[c.dataIndex].bike_h} h` : `${c.raw} ${distUnit()} · ${mo[c.dataIndex].runs} runs · longest ${distS(mo[c.dataIndex].long)}` } } }, scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (_v: any, i: number) => (mo[i].m.endsWith('-01') ? mo[i].m.slice(0, 4) : null) } }, y: { grid: gridOpt, title: { display: true, text: distUnit() } } } } });
    $('#ov-run-panels').hidden = bike || !yrs.some((y) => y.avg_hr);
    if (!$('#ov-run-panels').hidden) {
      set('pacehr-note', copy.paceHrNote(D));
      const py = yrs.filter((y) => y.med_pace).map((y) => y.med_pace!), hy = yrs.filter((y) => y.avg_hr).map((y) => y.avg_hr!);
      const pd = (p: number | null) => (p == null ? null : +(getUnits() === 'mi' ? p * 1.609344 : p).toFixed(2));
      mk('c-yr-pace-hr', { data: { labels: yrs.map((y) => y.year), datasets: [
        { type: 'line', label: 'median pace', data: yrs.map((y) => pd(y.med_pace)), borderColor: C.canolaDeep, backgroundColor: C.canola, yAxisID: 'y', tension: 0.3, pointRadius: 5, order: 2, spanGaps: true },
        { type: 'line', label: 'avg HR', data: yrs.map((y) => y.avg_hr), borderColor: C.sky, backgroundColor: C.sky, yAxisID: 'y2', spanGaps: true, tension: 0.3, order: 1, pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c: any) => (c.dataset.label === 'median pace' ? `pace ${pace(c.raw / (getUnits() === 'mi' ? 1.609344 : 1))} ${paceUnit()}` : `HR ${c.raw} bpm`) } } }, scales: { x: { grid: { display: false } }, y: { reverse: true, min: Math.floor(pd(Math.min(...py))! * 2) / 2, max: Math.ceil(pd(Math.max(...py))! * 2) / 2, ticks: { callback: (v: number) => pace(v / (getUnits() === 'mi' ? 1.609344 : 1)) }, grid: gridOpt, title: { display: true, text: `min${paceUnit()} (faster ↑)` } }, y2: { position: 'right', min: Math.floor(Math.min(...hy) / 10) * 10 - 5, max: Math.ceil(Math.max(...hy) / 10) * 10 + 5, grid: { display: false }, title: { display: true, text: 'bpm' } } } } });
      const q = D.vdot_quarterly;
      mk('c-vdot-mini', { type: 'line', data: { labels: q.map((x) => x.q), datasets: [{ label: 'VDOT', data: q.map((x) => x.vdot), borderColor: C.ink, backgroundColor: C.canola, pointRadius: 4, tension: 0.25, borderWidth: 1.5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => { const x = q[c.dataIndex]; return `VDOT ${x.vdot} · ${LBL[x.dist]} in ${fmt(x.t)} (${x.d})`; } } } }, scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (_v: any, i: number) => (q[i].q.endsWith('Q1') ? q[i].q.slice(0, 4) : null) } }, y: { grid: gridOpt, min: Math.floor(Math.min(...q.map((x) => x.vdot)) - 3) } } } });
    }
  }

  // ---------- PROGRESS
  function progress() {
    const seg = $('#seg-dist');
    const avail = KEYS.filter((k) => D.effort_scatter[k]?.length);
    if (!avail.includes(curDist)) curDist = avail[0] ?? '5k';
    seg.innerHTML = avail.map((k) => `<button data-k="${k}" aria-pressed="${k === curDist}">${LBL[k]}</button>`).join('');
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { curDist = b.dataset.k as TargetKey; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawEffort(); }));
    drawEffort();
    const ks = (['1k', '1mi', '5k', '10k', 'half', 'marathon'] as TargetKey[]).filter((k) => Object.keys(D.best_by_year[k] ?? {}).length);
    const yrs = D.yearly.map((y) => y.year);
    $('#t-yearbest').innerHTML = `<tr><th>Year</th>${ks.map((k) => `<th class="num">${LBL[k]}</th>`).join('')}</tr>` + yrs.map((y) => `<tr><td>${y}</td>${ks.map((k) => {
      const b = D.best_by_year[k][y];
      if (!b) return '<td class="num">—</td>';
      const rec = Math.min(...Object.entries(D.best_by_year[k]).filter(([yy]) => +yy <= y).map(([, v]) => v.t));
      const isPR = b.t <= rec + 0.01;
      return `<td class="num" title="${esc(b.name)} (${b.d})" style="${isPR ? 'color:var(--canola-deep);font-weight:600' : ''}">${fmt(b.t)}${mark(b)}</td>`;
    }).join('')}</tr>`).join('') + `<tr><td colspan="${ks.length + 1}" class="note small">Yellow = the record stood at the end of that year. Hover a time for the run. Treadmill and corrected-distance runs are scaled to the distance you set; their 1 km and mile efforts are excluded. * = whole-run time scaled to the exact distance. † = official time you entered.</td></tr>`;
    const a = D.aerobic;
    $('#p-aero').hidden = a.length < 2;
    if (a.length >= 2) {
      set('aero-note', copy.aerobicNote(D));
      const k = getUnits() === 'mi' ? 1.609344 : 1;
      mk('c-aero', { data: { labels: a.map((x) => x.q), datasets: [{ type: 'line', label: 'easy pace', data: a.map((x) => +(x.pace * k).toFixed(2)), borderColor: C.sky, backgroundColor: C.sky, yAxisID: 'y', tension: 0.3, pointRadius: 4, order: 2 }, { type: 'line', label: 'm/min per bpm', data: a.map((x) => x.ef * 60 / 1000), borderColor: C.canolaDeep, backgroundColor: C.canola, yAxisID: 'y2', tension: 0.3, pointRadius: 4, order: 1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c: any) => { const x = a[c.dataIndex]; return c.dataset.label === 'easy pace' ? `pace ${pace(x.pace)}${paceUnit()} at ${x.hr} bpm (${x.n} runs)` : `${(x.ef * 60 / 1000).toFixed(2)} m/min/bpm`; } } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { reverse: true, ticks: { callback: (v: number) => pace(v / k) }, grid: gridOpt, title: { display: true, text: `min${paceUnit()} (faster ↑)` } }, y2: { position: 'right', grid: { display: false }, title: { display: true, text: 'm/min/bpm' } } } } });
    }
    const ph = D.pace_hr;
    $('#p-cloud').hidden = ph.length < 10;
    if (ph.length >= 10) {
      const k = getUnits() === 'mi' ? 1.609344 : 1;
      mk('c-cloud', { type: 'scatter', data: { datasets: [{ label: 'runs', data: ph.map((p) => ({ x: p[2], y: +(p[1] * k).toFixed(2), d: p[0], km: p[3] })), backgroundColor: ph.map((p) => yearColor(+p[0].slice(0, 4)) + 'B3'), pointRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => `${c.raw.d} · ${pace(c.raw.y / k)}${paceUnit()} at ${c.raw.x} bpm · ${distS(c.raw.km)}` } } }, scales: { x: { title: { display: true, text: 'average HR (bpm)' }, grid: gridOpt }, y: { reverse: true, ticks: { callback: (v: number) => pace(v / k) }, grid: gridOpt, title: { display: true, text: `min${paceUnit()} (faster ↑)` } } } } });
    }
    const zy = D.zones_by_year, zyears = Object.keys(zy).sort();
    $('#p-zones').hidden = !zyears.length;
    if (zyears.length) {
      set('zones-note', copy.zonesNote(D));
      const zc = ['#CFE0EC', '#8FB7D6', '#E4B31F', '#D67C2B', '#B23A3A'], zl = ['Z1 <60%', 'Z2 60–70%', 'Z3 70–80%', 'Z4 80–90%', 'Z5 90%+'];
      mk('c-zones', { type: 'bar', data: { labels: zyears, datasets: [0, 1, 2, 3, 4].map((i) => ({ label: zl[i], data: zyears.map((y) => zy[y][i]), backgroundColor: zc[i], borderWidth: 0 })) },
        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c: any) => `${c.dataset.label}: ${c.raw} h` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: gridOpt, title: { display: true, text: 'hours' } } } } });
      const inp = $('#maxhr') as HTMLInputElement;
      inp.value = String(D.meta.max_hr);
      $('#maxhr-apply').addEventListener('click', () => { const v = +inp.value; if (v >= 120 && v <= 240) h.onMaxHr(v); });
      $('#maxhr-reset').addEventListener('click', () => h.onMaxHr(null));
    }
    const cy = D.yearly.filter((y) => y.cad);
    $('#p-cad').hidden = cy.length < 2;
    if (cy.length >= 2) {
      set('cad-note', copy.cadenceNote(D));
      const cs = cy.map((y) => y.cad!);
      mk('c-cad', { type: 'line', data: { labels: cy.map((y) => y.year), datasets: [{ label: 'spm', data: cs, borderColor: C.canolaDeep, backgroundColor: C.canola, tension: 0.3, pointRadius: 5 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { min: Math.floor(Math.min(...cs) / 5) * 5 - 5, max: Math.ceil(Math.max(...cs) / 5) * 5 + 5, grid: gridOpt, title: { display: true, text: 'steps / min' } } } } });
    }
  }
  function mark(p: EffortRow) { return p.official ? '†' : p.extrap ? '*' : ''; }
  function drawEffort() {
    const k = curDist, sc = D.effort_scatter[k] ?? [], pr = D.pr_progression[k] ?? [];
    if (!sc.length) { $('#pr-chain').innerHTML = ''; return; }
    const pts = sc.map((x) => ({ x: dy(x[0]), y: x[1], d: x[0] }));
    const step: { x: number; y: number }[] = [];
    pr.forEach((p, i) => { step.push({ x: dy(p.d), y: p.t }); if (pr[i + 1]) step.push({ x: dy(pr[i + 1].d), y: p.t }); });
    if (pr.length) step.push({ x: dy(D.last), y: pr[pr.length - 1].t });
    const ys = sc.map((x) => x[1]), lo = Math.min(...ys), hi = Math.max(...ys), capHi = Math.min(hi, lo * 1.8);
    mk('c-effort', { type: 'scatter', data: { datasets: [
      { type: 'scatter', label: 'best segment in a run', data: pts, backgroundColor: sc.map((x) => yearColor(+x[0].slice(0, 4)) + '99'), pointRadius: 3.5, order: 2 },
      { type: 'line', label: 'record at the time', data: step, borderColor: C.ink, borderWidth: 2, pointRadius: 0, showLine: true, tension: 0, order: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, parsing: true, plugins: { tooltip: { callbacks: { label: (c: any) => (c.dataset.type === 'line' ? `record ${fmt(c.raw.y)}` : `${c.raw.d} · ${fmt(c.raw.y)} (${paceS(c.raw.y / TARGETS[k] * 1000)}${paceUnit()})`) } } },
        scales: { x: { type: 'linear', min: +D.first.slice(0, 4), max: +D.last.slice(0, 4) + 1, ticks: { stepSize: 1, callback: (v: number) => String(v) }, grid: { display: false } }, y: { reverse: true, min: Math.floor(lo * 0.97), max: Math.ceil(capHi), ticks: { callback: (v: number) => fmt(v) }, grid: gridOpt, title: { display: true, text: 'time (faster ↑)' } } } } });
    $('#pr-chain').innerHTML = `<h3 style="margin-top:14px">${LBL[k]} record, every time it fell</h3><div style="overflow-x:auto"><table><tr><th>Date</th><th>Run</th><th class="num">Time</th><th class="num">Pace</th><th class="num">Improvement</th><th class="num">VDOT</th></tr>` +
      pr.map((p, i) => `<tr><td>${p.d}</td><td>${esc(p.name)}</td><td class="num">${fmt(p.t)}${mark(p)}</td><td class="num">${paceS(p.t / TARGETS[k] * 1000)}</td><td class="num">${i ? '−' + fmt(pr[i - 1].t - p.t) : 'first'}</td><td class="num">${p.vdot}</td></tr>`).join('') + '</table></div>';
  }

  // ---------- RECORDS
  function records() {
    const rc = D.races;
    $('#races-empty').hidden = rc.length > 0;
    $('#t-races').innerHTML = rc.length ? `<tr><th>Date</th><th>Event</th><th class="num">Distance</th><th class="num">Time</th><th class="num">Pace</th><th class="num">Avg HR</th><th class="num">VDOT</th><th>Your note</th></tr>` + rc.map((r) => {
      const off = r.official ?? null;
      const t = off ? fmt(off) : fmt(r.elapsed);
      const k = nearestTarget(r.km * 1000);
      const vd = k ? vdot(TARGETS[k], off || r.elapsed).toFixed(1) : '';
      return `<tr><td>${r.d}</td><td>${esc(r.name)}</td><td class="num">${distS(r.km, 2)}</td><td class="num"><strong>${t}</strong>${off ? '<div class="note small" style="margin:0">official · watch ' + fmt(r.elapsed) + '</div>' : ''}</td><td class="num">${paceS(r.elapsed / r.km)}</td><td class="num">${r.hr ?? '—'}</td><td class="num">${vd}</td><td class="note small" style="margin:0">${esc(r.desc.replace(/\[strava:\/\/[^\]]+\]/g, ''))}</td></tr>`;
    }).join('') : '';
    set('records-note', copy.recordsNote(D));
    $('#t-records').innerHTML = `<tr><th>Distance</th><th class="num">Record</th><th class="num">Pace</th><th>Where</th><th>Date</th><th class="num">VDOT</th><th class="num">First recorded</th><th class="num">Gained</th></tr>` + KEYS.map((k) => {
      const pr = D.pr_progression[k];
      if (!pr?.length) return '';
      const p = pr[pr.length - 1], f = pr[0];
      return `<tr><td>${LBL[k]}</td><td class="num"><strong>${fmt(p.t)}${mark(p)}</strong></td><td class="num">${paceS(p.t / TARGETS[k] * 1000)}</td><td>${esc(p.name)}</td><td>${p.d}</td><td class="num">${p.vdot}</td><td class="num">${fmt(f.t)} <span class="note small" style="margin:0">(${f.d.slice(0, 4)})</span></td><td class="num">${f.t > p.t ? '−' + fmt(f.t - p.t) : '—'}</td></tr>`;
    }).join('');
    $('#t-longest').innerHTML = `<tr><th>Date</th><th>Run</th><th class="num">Distance</th><th class="num">Moving time</th><th class="num">Pace</th></tr>` + D.longest_runs.map((r) => `<tr><td>${r.d}</td><td>${esc(r.name)}</td><td class="num">${distS(r.km)}</td><td class="num">${fmt(r.t)}</td><td class="num">${paceS(r.t / r.km)}</td></tr>`).join('');
  }

  // ---------- VOLUME
  function volume() {
    const cut = addYears(D.last, -2);
    const src = bike ? D.weekly_bike : D.weekly;
    const w = src.filter((x) => x.w >= cut);
    set('vol-lede', bike ? 'Hours and distance on the bike, and how regular it all is.' : 'The fitness gains on the Progress tab are downstream of this tab.');
    set('weekly-h', `Weekly ${getUnits() === 'mi' ? 'miles' : 'kilometres'}${bike ? ' ridden' : ''}, last two years`);
    const roll = w.map((_x, i) => { const s = w.slice(Math.max(0, i - 3), i + 1); return +(dist(s.reduce((a, b) => a + b.km, 0) / s.length)).toFixed(1); });
    mk('c-weekly', { data: { labels: w.map((x) => x.w), datasets: [{ type: 'bar', label: distUnit(), data: w.map((x) => +dist(x.km).toFixed(1)), backgroundColor: bike ? C.sky : C.canola, borderWidth: 0, barPercentage: 1, categoryPercentage: 0.85 }, { type: 'line', label: '4-week average', data: roll, borderColor: C.ink, borderWidth: 2, pointRadius: 0, tension: 0.3 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { title: (c: any) => 'week of ' + c[0].label, label: (c: any) => (c.dataset.type === 'bar' ? `${c.raw} ${distUnit()} · ${w[c.dataIndex].n} ${bike ? 'rides' : 'runs'} · ${w[c.dataIndex].h} h` : `4-wk avg ${c.raw} ${distUnit()}`) } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12, callback: (_v: any, i: number) => w[i].w.slice(0, 7) } }, y: { grid: gridOpt, title: { display: true, text: distUnit() } } } } });
    const t2 = D.train_last2y;
    const biggest = Math.max(0, ...src.map((x) => x.km));
    set('weekly-note', bike
      ? `Biggest week on record: ${distS(biggest, 0)}. Two-year average across all sports: ${t2.all_h_wk} hours a week.`
      : `Two-year average ${distS(t2.run_km_wk, 1)} and ${t2.run_h_wk} running hours a week (${t2.all_h_wk} h across all sports). The two years before that averaged ${distS(D.train_prev2y.run_km_wk, 1)} a week. Biggest week on record: ${distS(biggest, 1)}.`);
    // heatmap: from the first of the month two years back (or the first activity, if later)
    const heat = $('#heat');
    const startDate = D.first > cut ? D.first : cut.slice(0, 8) + '01';
    set('heat-h', `Every day since ${monthYear(startDate)}`);
    const start = dayNumber(startDate), end = dayNumber(D.last);
    const dow = (new Date(start * 86400000).getUTCDay() + 6) % 7;
    const cells: string[] = [];
    for (let i = 0; i < dow; i++) cells.push('<div style="visibility:hidden"></div>');
    const col: Record<SportGroup, string> = { Run: '228,179,31', Bike: '44,110,158', Swim: '58,166,160', Strength: '142,124,195', Other: '160,170,180' };
    for (let dn = start; dn <= end; dn++) {
      const key = dateFromDayNumber(dn), day = D.daily[key];
      if (!day) { cells.push(`<div data-t="${key} · rest"></div>`); continue; }
      const tot = Object.values(day).reduce((a, b) => a + b!, 0);
      const top = (Object.keys(day) as SportGroup[]).sort((a, b) => day[b]! - day[a]!)[0];
      const al = Math.min(1, 0.3 + tot / 120 * 0.7);
      cells.push(`<div style="background:rgba(${col[top]},${al.toFixed(2)})" data-t="${key} · ${Object.entries(day).map(([k, v]) => k.toLowerCase() + ' ' + v + ' min').join(', ')}"></div>`);
    }
    heat.innerHTML = cells.join('');
    const tip = $('#tip');
    heat.addEventListener('mousemove', (e) => { const t = (e.target as HTMLElement).dataset.t; if (!t) { tip.style.display = 'none'; return; } tip.textContent = t; tip.style.display = 'block'; tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 12) + 'px'; });
    heat.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    $('#vol-run-panels').hidden = !hasRuns;
    if (hasRuns) {
      const cy = Object.keys(D.consistency);
      set('consist-note', copy.consistencyNote(D));
      mk('c-consist', { type: 'bar', data: { labels: cy, datasets: [{ data: cy.map((y) => D.consistency[y]), backgroundColor: cy.map((y) => yearColor(+y)), borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { max: 52, grid: gridOpt, title: { display: true, text: 'weeks' } } } } });
      const mi = getUnits() === 'mi';
      const dl = mi ? ['<3', '3–5', '5–7.5', '7.5–10', '10–13', '13–18.6', '18.6+'] : ['<5', '5–8', '8–12', '12–16', '16–21', '21–30', '30+'];
      const dd = D.dist_dist, dyrs = Object.keys(dd), dcol = ['#EEF2F5', '#CFE0EC', '#8FB7D6', '#E4B31F', '#D67C2B', '#B23A3A', '#14213D'];
      mk('c-distdist', { type: 'bar', data: { labels: dyrs, datasets: dl.map((l, i) => ({ label: l + ' ' + distUnit(), data: dyrs.map((y) => { const s = dd[y].reduce((a, b) => a + b, 0); return s ? +(dd[y][i] / s * 100).toFixed(1) : 0; }), backgroundColor: dcol[i], borderWidth: 0 })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c: any) => `${c.dataset.label}: ${c.raw}% (${dd[c.label][c.datasetIndex]} runs)` } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, max: 100, grid: gridOpt, ticks: { callback: (v: number) => v + '%' } } } } });
    }
    set('hour-h', bike ? 'When you ride' : 'When you run');
    set('hour-note', copy.hourNote(D));
    set('dow-note', copy.dowNote(D));
    mk('c-hour', { type: 'bar', data: { labels: [...Array(24).keys()].map((hh) => hour12(hh)), datasets: [{ data: D.hour_hist, backgroundColor: C.sky, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { grid: gridOpt, title: { display: true, text: 'runs' } } } } });
    mk('c-dow', { type: 'bar', data: { labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], datasets: [{ data: D.dow_hist, backgroundColor: C.sky, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: gridOpt, title: { display: true, text: 'runs' } } } } });
    const sh = D.shoes.slice(0, 15);
    $('#p-shoes').hidden = !sh.length;
    if (sh.length) {
      set('shoes-h', `Shoes, by ${getUnits() === 'mi' ? 'miles' : 'kilometres'}`);
      mk('c-shoes', { type: 'bar', data: { labels: sh.map((s) => s.name), datasets: [{ data: sh.map((s) => Math.round(dist(s.km))), backgroundColor: C.canola, borderWidth: 0 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c: any) => { const s = sh[c.dataIndex]; return `${distR(s.km)} · ${s.n} runs · ${s.first} → ${s.last}`; } } } }, scales: { x: { grid: gridOpt, title: { display: true, text: distUnit() } }, y: { grid: { display: false } } } } });
    }
  }

  // ---------- MULTISPORT
  function multi() {
    set('m-lede', copy.multiLede(D));
    const cut = addYears(D.last, -3).slice(0, 7);
    const mo = D.monthly.filter((m) => m.m >= cut);
    set('sport-hours-note', `The last three years, by month.`);
    const ds: [keyof typeof mo[number], string, string][] = [['run_h', 'run', C.canola], ['bike_h', 'bike', C.sky], ['swim_h', 'swim', C.swim], ['strength_h', 'strength', C.strength], ['other_h', 'other', C.other]];
    mk('c-sport-hours', { type: 'bar', data: { labels: mo.map((m) => m.m), datasets: ds.map(([k, l, c]) => ({ label: l, data: mo.map((m) => m[k] as number), backgroundColor: c, borderWidth: 0 })) }, options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c: any) => `${c.dataset.label}: ${c.raw.toFixed(1)} h` } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { autoSkip: false, maxRotation: 0, callback: (_v: any, i: number) => (mo[i].m.endsWith('-01') || mo[i].m.endsWith('-07') ? mo[i].m : null) } }, y: { stacked: true, grid: gridOpt, title: { display: true, text: 'hours' } } } } });
    const big = Object.entries(D.daily).map(([d, v]) => ({ d, tot: Object.values(v).reduce((a, b) => a + b!, 0), v })).sort((a, b) => b.tot - a.tot).slice(0, 10);
    $('#t-bigdays').innerHTML = `<tr><th>Date</th><th class="num">Total</th><th>Breakdown</th></tr>` + big.map((x) => `<tr><td>${x.d}</td><td class="num">${fmt(x.tot * 60)}</td><td class="note small" style="margin:0">${Object.entries(x.v).sort((a, b) => b[1]! - a[1]!).map(([k, v]) => `${k.toLowerCase()} ${fmt(v! * 60)}`).join(', ')}</td></tr>`).join('');
    $('#t-sport').innerHTML = `<tr><th>Year</th><th class="num">Run ${distUnit()}</th><th class="num">Bike ${distUnit()}</th><th class="num">Swim ${distUnit()}</th><th class="num">Strength h</th><th class="num">All hours</th></tr>` + D.yearly.map((y) => `<tr><td>${y.year}</td><td class="num">${y.run_km ? distR(y.run_km).replace(/ \w+$/, '') : '—'}</td><td class="num">${y.bike_km ? distR(y.bike_km).replace(/ \w+$/, '') : '—'}</td><td class="num">${y.swim_km ? dist(y.swim_km).toFixed(1) : '—'}</td><td class="num">${y.strength_h ? Math.round(y.strength_h) : '—'}</td><td class="num">${Math.round(y.all_h)}</td></tr>`).join('');
  }
}

export { MONTHS, speedS };
