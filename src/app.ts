import { buildData, type Profile, type RaceOverrides } from './data/build';
import { num, parseStravaDate, table, type Table } from './data/csv';
import { browserTz, localParts, tzFromLatLon } from './data/tz';
import type { DataJson } from './data/types';
import { blobSource, readCentralDirectory, readEntryText, type ZipEntry } from './data/zip';
import { runPool, type JobSpec } from './parse/pool';
import { kind } from './parse/process';
import type { Sport, WorkerResult } from './parse/types';
import { renderLanding } from './ui/landing';
import { renderProgress } from './ui/progress';
import { detect, loadOverrides, renderRaces, saveOverrides, type RaceCandidate } from './ui/races';
import { renderReport } from './ui/report';

interface Session {
  /** Present when the session came from a saved JSON rather than a zip. */
  restored?: boolean;
  csv: Table;
  profile: Profile | null;
  results: WorkerResult[];
  filesMissing: number;
  exportDate: string;
  overrides: RaceOverrides;
  maxHr: number | null;
  /** Most common timezone across the parsed files, for dates shown before the build runs. */
  homeTz: string;
  data?: DataJson;
}

const root = () => document.getElementById('app')!;
const today = () => new Date().toISOString().slice(0, 10);

function sportOf(type: string): Sport {
  if (type === 'Run' || type === 'Virtual Run') return 'running';
  if (type === 'Ride' || type === 'Virtual Ride') return 'cycling';
  if (type === 'Swim') return 'swimming';
  return 'other';
}

export function start(error?: string) {
  renderLanding(root(), (f) => { void (f.name.toLowerCase().endsWith('.json') ? restore(f) : load(f)); }, error);
}

/** Phase 3: re-open a JSON saved from the page, no zip and no re-parse. */
async function restore(file: File) {
  try {
    const data = JSON.parse(await file.text()) as DataJson;
    if (!data?.totals || !data?.meta) throw new Error('not a saved page file');
    const s: Session = { restored: true, csv: table(''), profile: null, results: [], filesMissing: 0, exportDate: data.meta.export_date, overrides: { include: new Set(), exclude: new Set(), official: {} }, maxHr: null, homeTz: data.meta.tz, data };
    renderReport(root(), data, {
      onEditRaces: () => alert('Race edits need the original export zip. Load it again to change the list.'),
      onStartOver: () => start(),
      onMaxHr: () => alert('Changing max HR needs the original export zip.'),
      onSave: () => save(s),
    });
  } catch (e) {
    start(`Couldn't read that file: ${(e as Error).message}`);
  }
}

function save(s: Session) {
  if (!s.data) return;
  const blob = new Blob([JSON.stringify(s.data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `strava-progress-${s.data.meta.first_name ? s.data.meta.first_name.toLowerCase() + '-' : ''}${s.data.last}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Read the zip, parse every run (and ride, for the bike-first variant) in workers, then aggregate. */
export async function load(file: File) {
  const view = renderProgress(root());
  try {
    const src = blobSource(file);
    const entries = await readCentralDirectory(src);
    const byName = new Map<string, ZipEntry>(entries.map((e) => [e.name, e]));
    const csvEntry = byName.get('activities.csv');
    if (!csvEntry) throw new Error('No activities.csv in this zip. Is it the Strava export (export_<id>.zip)?');
    const csv = table(await readEntryText(src, csvEntry));
    const profEntry = byName.get('profile.csv');
    let profile: Profile | null = null;
    if (profEntry) {
      const p = table(await readEntryText(src, profEntry));
      const row = p.rows[0];
      if (row) profile = { id: p.get(row, 'Athlete ID'), firstName: p.get(row, 'First Name'), weight: num(p.get(row, 'Weight')), city: p.get(row, 'City') };
    }
    // Strava stamps the entries when it builds the archive, which beats the download's mtime.
    const stamp = Number.isFinite(csvEntry.mtime) && csvEntry.mtime > 0 ? csvEntry.mtime : (file.lastModified || Date.now());
    const exportDate = new Date(stamp).toISOString().slice(0, 10);

    const jobs: JobSpec[] = [];
    let filesMissing = 0;
    for (const row of csv.rows) {
      const sport = sportOf(csv.get(row, 'Activity Type'));
      if (sport !== 'running' && sport !== 'cycling') continue; // runs for efforts and HR zones; rides for the timezone fix
      const fn = csv.get(row, 'Filename');
      if (!fn) continue;
      const e = byName.get(fn);
      if (!e || !kind(fn)) { filesMissing++; continue; }
      jobs.push({ id: csv.get(row, 'Activity ID'), filename: fn, entry: e, csvDistance: num(csv.get(row, 'Distance.1')) ?? 0, elapsed: num(csv.get(row, 'Elapsed Time')) ?? 0, sport });
    }
    view.set(0, jobs.length);
    view.status(`${csv.rows.length.toLocaleString()} activities in the export, ${jobs.length.toLocaleString()} run and ride files to parse on ${navigator.hardwareConcurrency || 4} threads.`);
    const t0 = performance.now();
    const results = jobs.length ? await runPool(file, jobs, (p) => view.set(p.done, p.total)) : [];
    view.status(`Parsed in ${((performance.now() - t0) / 1000).toFixed(1)} s. Building the page…`);
    const athleteId = profile?.id || 'unknown';
    const votes = new Map<string, number>();
    const virtual = new Set(csv.rows.filter((row) => /^Virtual /.test(csv.get(row, 'Activity Type'))).map((row) => csv.get(row, 'Activity ID')));
    for (const r of results) if ('pos0' in r && r.pos0 && !virtual.has(r.id)) { const z = tzFromLatLon(r.pos0[0], r.pos0[1]); if (z) votes.set(z, (votes.get(z) ?? 0) + 1); }
    const homeTz = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? browserTz();
    const session: Session = { csv, profile, results, filesMissing, exportDate, overrides: loadOverrides(athleteId), maxHr: null, homeTz };
    try { const m = localStorage.getItem('maxhr:' + athleteId); if (m) session.maxHr = +m || null; } catch { /* ignore */ }
    confirmRaces(session, true);
  } catch (e) {
    console.error(e);
    start(`Couldn't read that file: ${(e as Error).message}`);
  }
}

function candidates(s: Session): RaceCandidate[] {
  const out: RaceCandidate[] = [];
  const { csv } = s;
  for (const row of csv.rows) {
    if (sportOf(csv.get(row, 'Activity Type')) !== 'running') continue;
    const name = csv.get(row, 'Activity Name');
    const epoch = parseStravaDate(csv.get(row, 'Activity Date'));
    out.push({ id: csv.get(row, 'Activity ID'), d: epoch === null ? '' : localParts(epoch, s.homeTz).date, name, km: (num(csv.get(row, 'Distance.1')) ?? 0) / 1000, elapsed: num(csv.get(row, 'Elapsed Time')) ?? 0, detected: detect(name, csv.get(row, 'Type')) });
  }
  return out;
}

function confirmRaces(s: Session, firstTime: boolean) {
  const cands = candidates(s);
  const hasCands = cands.some((c) => c.detected) || s.overrides.include.size > 0;
  if (firstTime && !hasCands) { showReport(s); return; } // nothing to confirm: straight to the page
  renderRaces(root(), cands, s.overrides, (o) => { s.overrides = o; saveOverrides(s.profile?.id || 'unknown', o); showReport(s); });
}

function showReport(s: Session) {
  s.data = buildData(s.csv, s.results, s.profile, { today: today(), exportDate: s.exportDate, maxHr: s.maxHr, races: s.overrides, filesMissing: s.filesMissing });
  window.scrollTo(0, 0);
  renderReport(root(), s.data, {
    onEditRaces: () => confirmRaces(s, false),
    onStartOver: () => start(),
    onMaxHr: (v) => { s.maxHr = v; try { if (v) localStorage.setItem('maxhr:' + (s.profile?.id || 'unknown'), String(v)); else localStorage.removeItem('maxhr:' + (s.profile?.id || 'unknown')); } catch { /* ignore */ } showReport(s); },
    onSave: () => save(s),
  });
}
