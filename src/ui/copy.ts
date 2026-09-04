/**
 * Every caption on the page, computed from the data. The reference page had these
 * hand-written for one athlete; these are the templated replacements. Each function
 * returns '' when the data can't support the sentence, and the page hides the element.
 */
import type { DataJson } from '../data/types';
import type { TargetKey } from '../parse/types';
import { LBL, distR, fmt, hour12, monthYear, longDate, n, pace, season, DOWS, getUnits, distS, tzName } from './format';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const word = (x: number) => (x >= 0 && x < WORDS.length ? WORDS[x] : String(x));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function spanYears(D: DataJson): number {
  const days = (new Date(D.last).getTime() - new Date(D.first).getTime()) / 86400000;
  return Math.max(1, Math.round(days / 365.25));
}

/** Hero distance: the longest of 5K/10K/half with a best in both the first and the latest year. */
export function heroKey(D: DataJson): { k: TargetKey; y0: string; y1: string } | null {
  for (const k of ['half', '10k', '5k'] as TargetKey[]) {
    const years = Object.keys(D.best_by_year[k] ?? {}).sort();
    if (years.length >= 2 && years[0] !== years[years.length - 1]) return { k, y0: years[0], y1: years[years.length - 1] };
  }
  return null;
}

export function title(D: DataJson): string {
  const km = D.meta.primary_sport === 'bike' ? D.totals.bike_km : D.totals.run_km;
  const days = (new Date(D.last).getTime() - new Date(D.first).getTime()) / 86400000;
  if (days < 540) { const mo = Math.max(1, Math.round(days / 30.44)); return `${cap(word(mo))} ${mo === 1 ? 'month' : 'months'}, ${distR(km)}.`; }
  const yrs = spanYears(D);
  return `${cap(word(yrs))} years, ${distR(km)}.`;
}

export function lede(D: DataJson): string {
  const t = D.totals;
  if (D.meta.primary_sport === 'bike') {
    const yrs = D.yearly.filter((y) => y.rides);
    const big = yrs.length ? yrs.reduce((a, b) => (b.bike_km > a.bike_km ? b : a)) : null;
    return `${n(yrs.reduce((a, y) => a + y.rides, 0))} rides and ${n(t.bike_hours)} hours in the saddle${big ? `, with ${big.year} the biggest year at ${distR(big.bike_km)}` : ''}.${t.runs ? ` Plus ${n(t.runs)} runs.` : ''}`;
  }
  const h = heroKey(D);
  const parts: string[] = [];
  if (h) {
    const a = D.best_by_year[h.k][h.y0], b = D.best_by_year[h.k][h.y1];
    parts.push(`From a ${fmt(a.t)} ${LBL[h.k]} in ${season(a.d)} to ${fmt(b.t)} in ${monthYear(b.d)}.`);
  }
  const bits = [`${n(t.runs)} runs`];
  if (t.marathons) bits.push(`${word(t.marathons)} ${t.marathons === 1 ? 'marathon' : 'marathons'}`);
  if (t.halfs_plus > t.marathons) bits.push(`${t.halfs_plus} runs of a half or longer`);
  if (t.bike_hours >= 20) bits.push(`${n(t.bike_hours)} hours on the bike`);
  parts.push(bits.join(', ') + '.');
  return parts.join(' ');
}

export function overviewLede(D: DataJson): string {
  const m = D.meta;
  if (m.primary_sport === 'bike') return `The bars are ${getUnits() === 'mi' ? 'miles' : 'kilometres'} ridden per year; the small text is hours and the longest ride.`;
  const attempts = m.restarts + 1;
  const first = attempts === 1
    ? `One continuous stretch of running since ${season(D.first)}.`
    : `${cap(word(attempts))} stretches of running, separated by breaks of three months or more.`;
  return `${first} The bars are ${getUnits() === 'mi' ? 'miles' : 'kilometres'} per year; the small text is the best 5K found anywhere inside that year's runs.`;
}

export function monthlyNote(D: DataJson): string {
  const m = D.meta;
  if (!m.restart_dates.length) return '';
  const last = m.restart_dates[m.restart_dates.length - 1];
  const monthsSince = Math.round((new Date(D.last).getTime() - new Date(last).getTime()) / (30.44 * 86400000));
  const list = m.restart_dates.map(season).join(', ');
  const held = monthsSince >= 12 ? ` The latest one has held for ${monthsSince >= 24 ? `${Math.floor(monthsSince / 12)} years` : `${monthsSince} months`} without a break.` : '';
  return `${m.restarts === 1 ? 'The restart is' : `The ${word(m.restarts)} restarts are`} visible: ${list}.${held}`;
}

export function paceHrNote(D: DataJson): string {
  const ys = D.yearly.filter((y) => y.med_pace && y.avg_hr && y.runs >= 10);
  if (ys.length < 2) return 'Median pace of runs of 2 km or more (yellow) against average heart rate across all runs with HR (blue).';
  const a = ys[0], b = ys[ys.length - 1];
  return `Median pace of runs of 2 km or more (yellow) against average heart rate across all runs with HR (blue). In ${a.year} a median run was ${pace(a.med_pace!)} at ${Math.round(a.avg_hr!)} bpm; in ${b.year}, ${pace(b.med_pace!)} at ${Math.round(b.avg_hr!)} bpm.`;
}

export function aerobicNote(D: DataJson): string {
  const [lo, hi] = D.meta.easy_hr;
  return `Runs of 5 km or more with an average heart rate between ${lo} and ${hi} bpm (${Math.round(lo / D.meta.max_hr * 100)}–${Math.round(hi / D.meta.max_hr * 100)}% of your ${D.meta.max_hr} max): genuinely easy running, and slower than 5K race pace plus 15%. Blue: median pace each quarter. Yellow: metres per minute per heartbeat (speed ÷ HR), the cleanest single number for aerobic fitness in a log like this. Quarters with fewer than three qualifying runs are skipped.`;
}

export function zonesNote(D: DataJson): string {
  const src = D.meta.max_hr_source === 'user' ? 'the max you set' : `a ${D.meta.max_hr} bpm max, the 99.5th percentile of your per-run maxes`;
  const ys = Object.keys(D.zones_by_year).filter((y) => D.zones_by_year[y].reduce((a, b) => a + b, 0) >= 10);
  let trend = '';
  if (ys.length >= 2) {
    const share = (y: string) => { const z = D.zones_by_year[y]; const t = z.reduce((a, b) => a + b, 0); return Math.round((z[3] + z[4]) / t * 100); };
    trend = ` In ${ys[0]}, ${share(ys[0])}% of heart-rate time was zone 4 or 5; in ${ys[ys.length - 1]} it was ${share(ys[ys.length - 1])}%.`;
  }
  return `Second-by-second HR from the activity files, bucketed on ${src}.${trend}`;
}

export function cadenceNote(D: DataJson): string {
  const cy = D.yearly.filter((y) => y.cad);
  if (cy.length < 2) return 'Yearly average steps per minute across runs with cadence data.';
  return `Yearly average steps per minute across runs with cadence data: ${cy[0].cad} in ${cy[0].year}, ${cy[cy.length - 1].cad} in ${cy[cy.length - 1].year}.`;
}

export function recordsNote(D: DataJson): string {
  const inside: string[] = [];
  for (const k of ['15k', '30k', 'marathon', 'half', '10k'] as TargetKey[]) {
    const pr = D.pr_progression[k];
    if (!pr?.length) continue;
    const p = pr[pr.length - 1];
    if (p.km >= (k === 'half' ? 21.1 : k === 'marathon' ? 42.2 : k === '30k' ? 30 : k === '15k' ? 15 : 10) * 1.15) inside.push(`the ${LBL[k]} record is a split from inside a ${distS(p.km, 0)} run`);
  }
  const ins = inside.length ? ` ${cap(inside.slice(0, 2).join('; '))}.` : '';
  return `Segment records from inside any run.${ins} Where a race GPS track came up a few metres short of the full distance, the whole-run time is scaled to the exact distance and marked with an asterisk. Times you entered as official are marked with a dagger.`;
}

export function noEffortsNote(D: DataJson): string {
  return D.meta.files_total ? 'No run in this export covered 1 km at a plausible pace, so there are no segment records.' : 'Segment records need the activity files inside the export. Every run here is a manual entry with no file, so there is nothing to scan.';
}

export function consistencyNote(D: DataJson): string {
  const e = Object.entries(D.consistency).filter(([y]) => +y < +D.last.slice(0, 4));
  if (e.length < 2) return 'Out of 52.';
  const best = e.reduce((a, b) => (b[1] > a[1] ? b : a));
  return `Out of 52. ${e[0][1]} such weeks in ${e[0][0]}, ${best[1]} in ${best[0]}.`;
}

export function hourNote(D: DataJson): string {
  const h = D.meta.primary_sport === 'bike' ? D.hour_hist_bike : D.hour_hist;
  const tot = h.reduce((a, b) => a + b, 0);
  if (!tot) return '';
  const order = h.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const [v0, i0] = order[0], [v1, i1] = order[1];
  const second = v1 >= v0 * 0.7 && Math.abs(i1 - i0) > 1 ? ` and ${hour12(i1)}` : '';
  return `Start hour, local time (${D.meta.tz_source === 'gps' ? tzName(D.meta.tz) : 'your browser zone'}). ${cap(hour12(i0))}${second} ${second ? 'are' : 'is'} when you ${D.meta.primary_sport === 'bike' ? 'ride' : 'run'} most.`;
}

export function dowNote(D: DataJson): string {
  const d = D.meta.primary_sport === 'bike' ? D.dow_hist_bike : D.dow_hist, i = d.indexOf(Math.max(...d));
  return d[i] ? `${DOWS[i]} is the busiest day.` : '';
}

export function multiLede(D: DataJson): string {
  const t = D.totals;
  const bits: string[] = [];
  if (t.bike_km) bits.push(`${distR(t.bike_km)} of riding`);
  if (t.swim_km) bits.push(`${distS(t.swim_km, 0)} of swimming`);
  if (t.strength_hours) bits.push(`${n(t.strength_hours)} hours of strength work`);
  const other = D.yearly.reduce((a, y) => a + y.other_h, 0);
  if (other >= 5) bits.push(`${n(other)} hours of walking, hiking and other sports`);
  if (!bits.length) return `Every activity in the export is a run. Nothing else to show here yet.`;
  if (D.meta.primary_sport === 'bike') {
    const off = D.yearly.map((y) => ({ y: y.year, h: y.all_h - y.bike_h })).reduce((a, b) => (b.h > a.h ? b : a));
    return `Strava has ${bits.join(', ')}${t.run_km ? ` and ${distR(t.run_km)} of running` : ''}. ${off.h >= 5 ? `${off.y} was the biggest year off the bike, at ${n(off.h)} hours.` : ''}`.trim();
  }
  const bigYear = D.yearly.reduce((a, y) => (y.all_h - y.run_h > a.all_h - a.run_h ? y : a));
  return `Strava has ${bits.join(', ')} alongside the ${distR(t.run_km)} of running. ${bigYear.year} was the biggest year outside running, at ${n(bigYear.all_h - bigYear.run_h)} hours.`;
}

export function footer(D: DataJson): string {
  const m = D.meta;
  const bad = m.files_failed + m.files_missing;
  const tz = m.tz_source === 'gps' ? `Local times from GPS (${tzName(m.tz)})` : `Local times use your browser's zone (${tzName(m.tz)}) because no activity had a GPS fix`;
  const parsed = m.files_total - bad;
  const files = m.files_total ? `${n(parsed)} activity ${parsed === 1 ? 'file' : 'files'} parsed at the second-by-second level${bad ? `, ${bad} ${bad === 1 ? 'file' : 'files'} couldn't be read` : ''}` : 'no activity files to parse';
  return `Built from your Strava export of ${longDate(m.export_date)}: ${n(D.totals.activities)} activities, ${files}. Times inside runs are moving time; races show elapsed. ${tz}. Nothing left your browser.`;
}
