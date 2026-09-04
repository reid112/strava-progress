/**
 * Port of reference/build_data.py: per-activity parse results + activities.csv → the
 * JSON the page renders. Section comments follow the Python file so the two can be
 * read side by side. Rules 1–9 from PROMPT.md are marked where they apply.
 */
import { TARGETS, TARGET_KEYS, isError, type ActivityResult, type TargetKey, type WorkerResult } from '../parse/types';
import { num, parseStravaDate, type Table } from './csv';
import { addYears, browserTz, dayNumber, dateFromDayNumber, localParts, quarterKey, tzFromLatLon, weekStart, type LocalParts } from './tz';
import type { DataJson, EffortRow, Race, SportGroup, WeekRow } from './types';
import { vdot } from './vdot';

export interface Profile { id: string; firstName: string; weight: number | null; city: string }

export interface RaceOverrides {
  include: Set<string>;
  exclude: Set<string>;
  official: Record<string, number>;
}

export interface BuildOptions {
  today: string;
  exportDate: string;
  maxHr?: number | null;
  tz?: string | null;
  races?: RaceOverrides;
  filesMissing?: number;
}

/** Rule 5: fixed plausibility floors, seconds. */
export const FLOORS: Record<TargetKey, number> = {
  '1k': 170, '1mi': 280, '5k': 960, '10k': 1980, '15k': 3000, half: 4320, '30k': 6300, marathon: 9000,
};
/** Aerobic-efficiency band as a fraction of max HR (135–158 of 201 in the reference). */
export const EASY_HR_BAND: [number, number] = [0.67, 0.79];
/** Rule 7 in the prompt's words: activity names that look like races. */
export const RACE_NAME_RE = /marathon|half|10k|5k|10 ?km|5 ?km|parkrun|park run|race|time trial|\bTT\b|ultra|70\.3|ironman/i;

interface Act {
  id: string; epoch: number; loc: LocalParts; name: string; type: string; sport: SportGroup;
  km: number; mt: number; el: number; hr: number | null; hrmax: number | null; cad: number | null; elev: number;
  gear: string; desc: string; speed: number | null; typeCol: string; pw: number | null; filename: string; pace: number;
}

function sportOf(t: string): SportGroup {
  if (t === 'Run' || t === 'Virtual Run') return 'Run';
  if (t === 'Ride' || t === 'Virtual Ride') return 'Bike';
  if (t === 'Swim') return 'Swim';
  if (t === 'Weight Training' || t === 'Workout') return 'Strength';
  return 'Other';
}

/**
 * Python's round(): decides on the exact decimal value of the double, and only
 * breaks true ties half-to-even. Keeps the port diff-clean against the reference.
 */
export function r(x: number, digits = 0): number {
  if (!Number.isFinite(x)) return x;
  const s = x.toFixed(20); // exact expansion (doubles have at most ~17 significant digits)
  const dot = s.indexOf('.');
  const tail = s.slice(dot + 1 + digits);
  if (/^50*$/.test(tail)) {
    const m = 10 ** digits;
    const q = Math.trunc(Math.abs(x) * m + 0.25); // integer part of the scaled magnitude, safe at a true tie
    const even = q % 2 === 0 ? q : q + 1;
    return Math.sign(x) * even / m;
  }
  return Number(x.toFixed(digits));
}
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
function mean(xs: number[]): number | null { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; }
function sum(xs: number[]): number { return xs.reduce((a, b) => a + b, 0); }
function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
/** The target distance an activity of `m` metres is a race of: within −1.5% / +3%, like Rule 6. */
export function nearestTarget(m: number): TargetKey | null {
  let best: TargetKey | null = null, bestErr = Infinity;
  for (const k of TARGET_KEYS) {
    const L = TARGETS[k], err = Math.abs(m - L) / L;
    if (m >= L * 0.985 && m < L * 1.03 && err < bestErr) { best = k; bestErr = err; }
  }
  return best;
}
function monthKey(loc: LocalParts): string { return `${loc.y}-${String(loc.m).padStart(2, '0')}`; }

export function buildData(csv: Table, results: WorkerResult[], profile: Profile | null, opts: BuildOptions): DataJson {
  // ---------- per-activity stream results, timezone
  // Virtual runs and rides (Zwift) carry made-up GPS, so their zone must not come from the file.
  const virtual = new Set(csv.rows.filter((row) => /^Virtual /.test(csv.get(row, 'Activity Type'))).map((row) => csv.get(row, 'Activity ID')));
  const rs = new Map<string, ActivityResult>();
  let failed = 0, trimmed = 0, scaled = 0;
  const tzVotes = new Map<string, number>();
  const tzById = new Map<string, string>();
  for (const x of results) {
    if (isError(x)) { failed++; continue; }
    rs.set(x.id, { ...x, be: { ...x.be } }); // copy: this function mutates efforts and must stay re-runnable
    if (x.trimmed) trimmed++;
    if (x.scaled) scaled++;
    if (x.pos0 && !virtual.has(x.id)) {
      const tz = tzFromLatLon(x.pos0[0], x.pos0[1]);
      if (tz) { tzById.set(x.id, tz); tzVotes.set(tz, (tzVotes.get(tz) ?? 0) + 1); }
    }
  }
  const homeTz = opts.tz || [...tzVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || browserTz();
  const tzSource: 'gps' | 'browser' = tzVotes.size ? 'gps' : 'browser';

  // ---------- activities.csv → Act rows (Rule 1: Distance.1 is metres for every sport)
  const acts: Act[] = [];
  for (const row of csv.rows) {
    const g = (k: string) => csv.get(row, k);
    const epoch = parseStravaDate(g('Activity Date'));
    if (epoch === null) continue;
    const id = g('Activity ID');
    const loc = localParts(epoch, opts.tz || tzById.get(id) || homeTz); // Rule 2
    const km = (num(g('Distance.1')) ?? 0) / 1000;
    const el = num(g('Elapsed Time')) ?? 0;
    const mt = num(g('Moving Time')) ?? el;
    acts.push({
      id, epoch, loc, name: g('Activity Name'), type: g('Activity Type'), sport: sportOf(g('Activity Type')),
      km, mt, el, hr: num(g('Average Heart Rate')), hrmax: num(g('Max Heart Rate.1')), cad: num(g('Average Cadence')),
      elev: num(g('Elevation Gain')) ?? 0, gear: g('Activity Gear'), desc: g('Activity Description'), speed: num(g('Average Speed')),
      typeCol: g('Type'), pw: num(g('Average Watts')), filename: g('Filename'), pace: km > 0 ? mt / 60 / km : NaN,
    });
  }
  acts.sort((a, b) => a.epoch - b.epoch);
  const runs = acts.filter((a) => a.sport === 'Run');
  const rides = acts.filter((a) => a.sport === 'Bike');
  const hours = (xs: Act[]) => sum(xs.map((a) => a.mt)) / 3600;
  const kms = (xs: Act[]) => sum(xs.map((a) => a.km));

  // ---------- Rule 8: max HR = 99.5th percentile of per-run maxes, unless the user set one
  const runMaxes = runs.map((a) => a.hrmax).filter((v): v is number => v != null && v > 100 && v < 240);
  const derivedMax = runMaxes.length >= 5 ? Math.round(quantile(runMaxes, 0.995)!) : (Math.max(0, ...[...rs.values()].map((x) => x.hr_max ?? 0)) || 190);
  const maxHr = opts.maxHr && opts.maxHr > 100 ? opts.maxHr : derivedMax;

  // ---------- Rule 5: plausibility floors, tightened for fast athletes
  const bestSpeed = Math.max(0, ...runs.filter((a) => a.km >= 3 && a.speed != null && a.speed < 7).map((a) => a.speed!));
  const floors = {} as Record<TargetKey, number>;
  for (const k of TARGET_KEYS) floors[k] = bestSpeed > 0 ? Math.min(FLOORS[k], 0.85 * TARGETS[k] / bestSpeed) : FLOORS[k];

  // ---------- Rules 5/6 and official times mutate the per-activity effort map, so later sections see the same efforts
  const extrap = new Map<string, Set<TargetKey>>();
  const official = new Map<string, TargetKey>();
  for (const a of runs) {
    const s = rs.get(a.id);
    if (!s) continue;
    if (a.type === 'Virtual Run') { delete s.be['1k']; delete s.be['1mi']; } // Rule 4, indoor case: treadmill splits under a mile are noise
    for (const k of TARGET_KEYS) {
      const L = TARGETS[k];
      const m = a.km * 1000;
      if (!(k in s.be) && m >= L * 0.985 && m < L * 1.03 && a.mt > 0) { // Rule 6
        s.be[k] = Math.round(a.mt * L / m * 10) / 10;
        if (!extrap.has(a.id)) extrap.set(a.id, new Set());
        extrap.get(a.id)!.add(k);
      }
      if (k in s.be && s.be[k]! < floors[k]) delete s.be[k]; // Rule 5
    }
    // An official chip time the user typed in replaces the watch's effort for the matching distance.
    const off = opts.races?.official[a.id];
    if (off && off > 0) {
      const k = nearestTarget(a.km * 1000);
      if (k && off >= floors[k]) { s.be[k] = off; official.set(a.id, k); extrap.get(a.id)?.delete(k); }
    }
  }

  const out = {} as DataJson;
  const first = acts[0]?.loc.date ?? opts.today, last = acts[acts.length - 1]?.loc.date ?? opts.today;
  const y0 = +first.slice(0, 4), y1 = +last.slice(0, 4);
  const years: number[] = [];
  for (let y = y0; y <= y1; y++) years.push(y);

  // ---------- summary
  out.generated = opts.today;
  out.first = first; out.last = last;
  const by = (s: SportGroup) => acts.filter((a) => a.sport === s);
  out.totals = {
    activities: acts.length, runs: runs.length, run_km: r(kms(runs), 1), run_hours: r(hours(runs), 1), run_elev: r(sum(runs.map((a) => a.elev))),
    bike_km: r(kms(rides), 1), bike_hours: r(hours(rides), 1), bike_elev: r(sum(rides.map((a) => a.elev))),
    swim_km: r(kms(by('Swim')), 1), swim_hours: r(hours(by('Swim')), 1), strength_hours: r(hours(by('Strength')), 1),
    all_hours: r(hours(acts), 1),
    marathons: runs.filter((a) => a.km >= 42).length, halfs_plus: runs.filter((a) => a.km >= 21).length,
    longest_km: r(Math.max(0, ...runs.map((a) => a.km)), 1),
    active_days: new Set(acts.map((a) => a.loc.date)).size,
  };

  // ---------- yearly by sport
  out.yearly = years.map((y) => {
    const d = acts.filter((a) => a.loc.y === y), rr = runs.filter((a) => a.loc.y === y), bb = rides.filter((a) => a.loc.y === y);
    const dd = (s: SportGroup) => d.filter((a) => a.sport === s);
    const cadOk = rr.filter((a) => a.cad != null && a.cad > 60 && a.cad < 120).map((a) => a.cad!); // Rule 7
    const hrs = rr.map((a) => a.hr).filter((v): v is number => v != null);
    const pws = bb.map((a) => a.pw).filter((v): v is number => v != null && v > 0);
    return {
      year: y, runs: rr.length, run_km: r(kms(rr), 1), run_h: r(hours(rr), 1),
      longest: rr.length ? r(Math.max(...rr.map((a) => a.km)), 1) : 0,
      med_pace: rr.length ? r(median(rr.filter((a) => a.km >= 2).map((a) => a.pace).filter(Number.isFinite)) ?? NaN, 2) : null,
      avg_hr: hrs.length ? r(mean(hrs)!, 1) : null,
      cad: rr.some((a) => a.cad != null && a.cad > 60) && cadOk.length ? r(mean(cadOk)! * 2) : null,
      bike_km: r(kms(bb), 1), bike_h: r(hours(bb), 1), bike_elev: r(sum(bb.map((a) => a.elev))),
      swim_km: r(kms(dd('Swim')), 1), swim_h: r(hours(dd('Swim')), 1), strength_h: r(hours(dd('Strength')), 1),
      other_h: r(hours(dd('Other')), 1), all_h: r(hours(d), 1), activities: d.length,
      weeks_run: new Set(rr.map((a) => weekStart(a.loc.date))).size,
      rides: bb.length, pw_avg: pws.length ? r(mean(pws)!) : null, longest_ride: bb.length ? r(Math.max(...bb.map((a) => a.km)), 1) : 0,
    };
  }).map((row) => ({ ...row, med_pace: row.med_pace != null && Number.isNaN(row.med_pace) ? null : row.med_pace }));

  // ---------- monthly
  out.monthly = [];
  for (let y = y0, m = +first.slice(5, 7); y < y1 || (y === y1 && m <= +last.slice(5, 7)); m++) {
    if (m > 12) { m = 1; y++; if (y > y1) break; }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const d = acts.filter((a) => monthKey(a.loc) === key), rr = d.filter((a) => a.sport === 'Run');
    const dd = (s: SportGroup) => d.filter((a) => a.sport === s);
    out.monthly.push({
      m: key, run_km: r(kms(rr), 1), runs: rr.length, run_h: r(hours(rr), 2), bike_h: r(hours(dd('Bike')), 2), swim_h: r(hours(dd('Swim')), 2),
      strength_h: r(hours(dd('Strength')), 2), other_h: r(hours(dd('Other')), 2), bike_km: r(kms(dd('Bike')), 1), swim_km: r(kms(dd('Swim')), 2),
      long: rr.length ? r(Math.max(...rr.map((a) => a.km)), 1) : 0,
    });
  }

  // ---------- weekly (all weeks from first to last run, zeros filled)
  const weekly = (xs: Act[]): WeekRow[] => {
    if (!xs.length) return [];
    const agg = new Map<string, WeekRow>();
    for (const a of xs) {
      const w = weekStart(a.loc.date);
      const row = agg.get(w) ?? { w, km: 0, h: 0, n: 0 };
      row.km += a.km; row.h += a.mt / 3600; row.n++;
      agg.set(w, row);
    }
    const rows: WeekRow[] = [];
    for (let n = dayNumber(weekStart(xs[0].loc.date)); n <= dayNumber(xs[xs.length - 1].loc.date); n += 7) {
      const w = dateFromDayNumber(n);
      const row = agg.get(w);
      rows.push(row ? { w, km: r(row.km, 1), h: r(row.h, 2), n: row.n } : { w, km: 0, h: 0, n: 0 });
    }
    return rows;
  };
  out.weekly = weekly(runs);
  out.weekly_bike = weekly(rides);

  // ---------- best efforts
  const prog = {} as DataJson['pr_progression'], perYear = {} as DataJson['best_by_year'], scatter = {} as DataJson['effort_scatter'];
  for (const k of TARGET_KEYS) {
    const L = TARGETS[k];
    const rows: EffortRow[] = [];
    for (const a of runs) {
      const s = rs.get(a.id);
      if (s && k in s.be) {
        rows.push({ d: a.loc.date, t: s.be[k]!, name: a.name.slice(0, 60), id: +a.id, y: a.loc.y, km: r(a.km, 1), hr: a.hr,
          ...(extrap.get(a.id)?.has(k) ? { extrap: true } : {}), ...(official.get(a.id) === k ? { official: true } : {}) });
      }
    }
    // already date-sorted since `runs` is
    let best = 1e9;
    const pr: EffortRow[] = [];
    for (const x of rows) if (x.t < best) { best = x.t; pr.push({ ...x, vdot: r(vdot(L, x.t), 1) }); }
    prog[k] = pr;
    const py: Record<string, EffortRow> = {};
    for (const x of rows) if (!(x.y in py) || x.t < py[x.y].t) py[x.y] = x;
    perYear[k] = Object.fromEntries(Object.entries(py).map(([y, v]) => [y, { ...v, vdot: r(vdot(L, v.t), 1) }]));
    scatter[k] = rows.map((x) => [x.d, r(x.t)]);
  }
  out.pr_progression = prog; out.best_by_year = perYear; out.effort_scatter = scatter;

  // ---------- VDOT timeline: quarterly max over all efforts >= 5k (Rule 9)
  const qv = new Map<string, DataJson['vdot_quarterly'][number]>();
  for (const k of ['5k', '10k', '15k', 'half', '30k', 'marathon'] as TargetKey[]) {
    for (const [d, t] of scatter[k]) {
      const q = quarterKey(d), v = vdot(TARGETS[k], t);
      const cur = qv.get(q);
      if (!cur || v > cur.vdot) qv.set(q, { q, vdot: r(v, 1), dist: k, t, d });
    }
  }
  out.vdot_quarterly = [...qv.keys()].sort().map((q) => qv.get(q)!);

  // ---------- aerobic efficiency: easy runs (HR band of max), >= 5 km, pace slower than 5K race pace × 1.15
  const easy: [number, number] = [Math.round(EASY_HR_BAND[0] * maxHr), Math.round(EASY_HR_BAND[1] * maxHr)];
  const best5k = prog['5k'].length ? prog['5k'][prog['5k'].length - 1].t : null;
  const racePace = best5k ? (best5k / 60 / 5) * 1.15 : 0;
  const ez = runs.filter((a) => a.hr != null && a.hr >= easy[0] && a.hr <= easy[1] && a.km >= 5 && a.pace > racePace);
  const ezq = new Map<string, Act[]>();
  for (const a of ez) { const q = quarterKey(a.loc.date); ezq.set(q, [...(ezq.get(q) ?? []), a]); }
  out.aerobic = [...ezq.keys()].sort().map((q) => {
    const xs = ezq.get(q)!;
    return { q, pace: r(median(xs.map((a) => a.pace))!, 2), hr: r(median(xs.map((a) => a.hr!))!), ef: r(median(xs.map((a) => (1000 / a.pace / 60) / a.hr!))! * 1000, 1), n: xs.length };
  }).filter((x) => x.n >= 3);
  // pace-vs-HR cloud
  out.pace_hr = runs.filter((a) => a.hr != null && a.hr > 100 && a.km >= 3 && a.pace < 8 && a.pace > 3)
    .map((a) => [a.loc.date, r(a.pace, 2), r(a.hr!), r(a.km, 1)]);

  // ---------- HR zones per year, from the per-bpm second histogram
  const zoneEdges = [0, 0.6 * maxHr, 0.7 * maxHr, 0.8 * maxHr, 0.9 * maxHr, 999];
  const zy = new Map<number, number[]>();
  for (const a of runs) {
    const s = rs.get(a.id);
    if (!s?.hr_hist) continue;
    const z = zy.get(a.loc.y) ?? [0, 0, 0, 0, 0];
    for (let b = 1; b < 256; b++) {
      const sec = s.hr_hist[b];
      if (!sec) continue;
      for (let k = 0; k < 5; k++) if (b >= zoneEdges[k] && b < zoneEdges[k + 1]) { z[k] += sec; break; }
    }
    zy.set(a.loc.y, z);
  }
  out.zones_by_year = Object.fromEntries([...zy.entries()].sort((a, b) => a[0] - b[0]).map(([y, z]) => [String(y), z.map((v) => r(v / 3600, 1))]));

  // ---------- races: heuristic candidates + user confirmations
  const ov = opts.races;
  out.races = runs.filter((a) => {
    if (ov?.exclude.has(a.id)) return false;
    if (ov?.include.has(a.id)) return true;
    return RACE_NAME_RE.test(a.name) || a.typeCol === '1';
  }).map((a): Race => ({
    id: +a.id, d: a.loc.date, name: a.name, km: r(a.km, 2), moving: Math.round(a.mt), elapsed: Math.round(a.el), pace: r(a.pace, 2),
    hr: a.hr == null ? null : Math.round(a.hr), hrmax: a.hrmax == null ? null : Math.round(a.hrmax),
    desc: (a.desc ?? '').slice(0, 200), be: rs.get(a.id)?.be ?? {},
    official: ov?.official[a.id] ?? null,
    source: ov?.include.has(a.id) && !RACE_NAME_RE.test(a.name) && a.typeCol !== '1' ? 'user' : a.typeCol === '1' ? 'type' : 'name',
  }));

  // ---------- heatmap: daily minutes by sport
  const daily: DataJson['daily'] = {};
  for (const a of acts) {
    const d = (daily[a.loc.date] ??= {});
    d[a.sport] = (d[a.sport] ?? 0) + a.mt / 60;
  }
  for (const d of Object.values(daily)) for (const k of Object.keys(d) as SportGroup[]) { const v = r(d[k]!); if (v > 0) d[k] = v; else delete d[k]; }
  out.daily = daily;

  // ---------- streaks & consistency
  const runDays = [...new Set(runs.map((a) => dayNumber(a.loc.date)))].sort((a, b) => a - b);
  let bestStreak = runDays.length ? 1 : 0, cur = 1;
  for (let i = 1; i < runDays.length; i++) { cur = runDays[i] - runDays[i - 1] === 1 ? cur + 1 : 1; bestStreak = Math.max(bestStreak, cur); }
  out.streaks = { longest_run_streak_days: bestStreak };
  const wr = new Map<string, number>();
  for (const a of runs) { const k = `${a.loc.y}|${weekStart(a.loc.date)}`; wr.set(k, (wr.get(k) ?? 0) + 1); }
  const cons: Record<string, number> = {};
  for (const [k, n] of wr) { const y = k.split('|')[0]; if (!(y in cons)) cons[y] = 0; if (n >= 3) cons[y]++; }
  out.consistency = Object.fromEntries(Object.entries(cons).sort());

  // ---------- shoes
  const sh = new Map<string, { km: number; n: number; first: string; last: string }>();
  for (const a of runs) {
    if (!a.gear) continue;
    const v = sh.get(a.gear) ?? { km: 0, n: 0, first: a.loc.date, last: a.loc.date };
    v.km += a.km; v.n++; if (a.loc.date < v.first) v.first = a.loc.date; if (a.loc.date > v.last) v.last = a.loc.date;
    sh.set(a.gear, v);
  }
  out.shoes = [...sh.entries()].sort((a, b) => b[1].km - a[1].km).map(([name, v]) => ({ name, km: r(v.km), n: v.n, first: v.first, last: v.last }));

  // ---------- time of day & weekday
  out.hour_hist = Array(24).fill(0); out.dow_hist = Array(7).fill(0);
  for (const a of runs) { out.hour_hist[a.loc.h]++; out.dow_hist[a.loc.dow]++; }
  out.hour_hist_bike = Array(24).fill(0); out.dow_hist_bike = Array(7).fill(0);
  for (const a of rides) { out.hour_hist_bike[a.loc.h]++; out.dow_hist_bike[a.loc.dow]++; }

  // ---------- distance distribution per year (right-closed bins like pd.cut)
  const bins = [0, 5, 8, 12, 16, 21, 30, 60];
  out.dist_dist = {};
  for (const y of years) {
    const c = Array(bins.length - 1).fill(0);
    for (const a of runs) if (a.loc.y === y) for (let i = 0; i < c.length; i++) if (a.km > bins[i] && a.km <= bins[i + 1]) { c[i]++; break; }
    out.dist_dist[String(y)] = c;
  }

  // ---------- training hours, last two years vs the two before (weeks with any activity)
  const cut2 = addYears(last, -2), cut4 = addYears(last, -4);
  const last2 = acts.filter((a) => a.loc.date >= cut2);
  const wk = new Map<string, { run: number; all: number; km: number }>();
  for (const a of last2) {
    const w = weekStart(a.loc.date);
    const v = wk.get(w) ?? { run: 0, all: 0, km: 0 };
    v.all += a.mt / 3600; if (a.sport === 'Run') { v.run += a.mt / 3600; v.km += a.km; }
    wk.set(w, v);
  }
  const wv = [...wk.values()];
  out.train_last2y = {
    weeks: wv.length, run_h_wk: r(mean(wv.map((v) => v.run)) ?? 0, 2), all_h_wk: r(mean(wv.map((v) => v.all)) ?? 0, 2),
    run_km_wk: r(mean(wv.map((v) => v.km)) ?? 0, 1), run_h_wk_median: r(median(wv.map((v) => v.run)) ?? 0, 2),
  };
  const prev2 = acts.filter((a) => a.loc.date >= cut4 && a.loc.date < cut2);
  out.train_prev2y = { run_km_wk: r(kms(prev2.filter((a) => a.sport === 'Run')) / 104, 1), all_h_wk: r(hours(prev2) / 104, 2) };

  // ---------- longest
  out.longest_runs = [...runs].sort((a, b) => b.km - a.km).slice(0, 10).map((a) => ({ d: a.loc.date, name: a.name.slice(0, 50), km: r(a.km, 1), t: Math.round(a.mt) }));
  out.longest_rides = [...rides].sort((a, b) => b.km - a.km).slice(0, 10).map((a) => ({ d: a.loc.date, name: a.name.slice(0, 50), km: r(a.km, 1), t: Math.round(a.mt), elev: r(a.elev) }));

  // ---------- meta (everything the generic copy needs)
  const restartDates: string[] = []; // restarts = gaps > 90 days with no runs
  for (let i = 1; i < runDays.length; i++) if (runDays[i] - runDays[i - 1] > 90) restartDates.push(dateFromDayNumber(runDays[i]));
  const maxYearKm = Math.max(0, ...out.yearly.map((y) => y.run_km));
  const lowYears = out.yearly.filter((y) => y.year !== y0 && y.year !== y1 && y.run_km < 0.1 * maxYearKm).map((y) => y.year);
  const argmax = (xs: number[]) => xs.length && Math.max(...xs) > 0 ? xs.indexOf(Math.max(...xs)) : null;
  const filesTotal = results.length + (opts.filesMissing ?? 0);
  out.meta = {
    athlete_id: profile?.id ?? '', first_name: profile?.firstName ?? '', weight_kg: profile?.weight ?? null, city: profile?.city ?? '',
    tz: homeTz, tz_source: tzSource, max_hr: maxHr, max_hr_source: opts.maxHr && opts.maxHr > 100 ? 'user' : 'derived',
    files_total: filesTotal, files_failed: failed, files_missing: opts.filesMissing ?? 0, trimmed_multisport: trimmed, scaled_distance: scaled,
    floors, easy_hr: easy,
    primary_sport: hours(runs) >= hours(rides) ? 'run' : 'bike',
    restarts: restartDates.length, restart_dates: restartDates, low_years: lowYears,
    peak_hour: argmax(hours(runs) >= hours(rides) ? out.hour_hist : out.hour_hist_bike), peak_dow: argmax(hours(runs) >= hours(rides) ? out.dow_hist : out.dow_hist_bike),
    export_date: opts.exportDate,
  };
  return out;
}
