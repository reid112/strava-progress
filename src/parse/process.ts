import * as pako from 'pako';
import { bestEfforts, MAX_GAP_S } from './bestEfforts';
import { streamsFit } from './fit';
import { streamsGpx } from './gpx';
import { streamsTcx } from './tcx';
import { TARGETS, type ActivityResult, type Sport, type Streams, type TargetKey, type WorkerResult } from './types';

/** Rule 3: a parsed track this much longer than the CSV distance is a whole multisport recording. */
const MULTISPORT_RATIO = 1.5;
/** Rule 4: CSV vs stream distance disagreement beyond this means the user corrected the distance. */
const CORRECTED_TOLERANCE = 0.03;

const FIT_SPORT: Record<Sport, string> = { running: 'running', cycling: 'cycling', swimming: 'swimming', other: '' };

export function kind(filename: string): 'fit' | 'gpx' | 'tcx' | null {
  const f = filename.toLowerCase();
  if (/\.fit(\.gz)?$/.test(f)) return 'fit';
  if (/\.gpx(\.gz)?$/.test(f)) return 'gpx';
  if (/\.tcx(\.gz)?$/.test(f)) return 'tcx';
  return null;
}

export function decodeStreams(filename: string, raw: Uint8Array): Streams {
  const k = kind(filename);
  if (!k) throw new Error('unknown file type');
  const bytes = filename.toLowerCase().endsWith('.gz') ? pako.ungzip(raw) : raw;
  if (k === 'fit') return streamsFit(bytes);
  const xml = new TextDecoder().decode(bytes);
  return k === 'gpx' ? streamsGpx(xml) : streamsTcx(xml);
}

function sliceStreams(s: Streams, keep: (i: number) => boolean): Streams {
  const idx: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (keep(i)) idx.push(i);
  if (!idx.length) return { ...s, t: [], d: [], hr: [], cad: [], pw: [] };
  const t0 = s.t[idx[0]], d0 = s.d[idx[0]];
  return {
    ...s,
    t: idx.map((i) => s.t[i] - t0),
    d: idx.map((i) => s.d[i] - d0),
    hr: idx.map((i) => s.hr[i]),
    cad: idx.map((i) => s.cad[i]),
    pw: idx.map((i) => s.pw[i]),
    actType: s.actType ? idx.map((i) => s.actType![i]) : undefined,
    epoch0: s.epoch0 != null ? s.epoch0 + t0 * 1000 : undefined,
  };
}

/**
 * Rule 3. Strava splits a triathlon into three activities but each one's file can be
 * the whole day's recording. Cut it down to this activity's leg. Preference order:
 * the FIT session for this sport, then per-record activity_type, then the trailing
 * `elapsed` seconds.
 */
export function trimMultisport(s: Streams, sport: Sport, csvDistance: number, elapsed: number): { s: Streams; trimmed: ActivityResult['trimmed'] } {
  const n = s.t.length;
  if (n < 2 || csvDistance <= 0 || s.d[n - 1] <= MULTISPORT_RATIO * csvDistance) return { s, trimmed: null };
  const want = FIT_SPORT[sport];

  if (s.sessions && s.sessions.length > 1 && s.epoch0 != null) {
    const cands = s.sessions.filter((x) => x.sport === want);
    if (cands.length) {
      const sess = cands.reduce((a, b) => (Math.abs(b.distance - csvDistance) < Math.abs(a.distance - csvDistance) ? b : a));
      const e0 = s.epoch0;
      const lo = (sess.start - e0) / 1000, hi = lo + sess.elapsed + 1;
      const cut = sliceStreams(s, (i) => s.t[i] >= lo && s.t[i] <= hi);
      if (cut.t.length >= 10) return { s: cut, trimmed: 'session' };
    }
  }
  if (s.actType && want) {
    const cut = sliceStreams(s, (i) => s.actType![i] === want);
    if (cut.t.length >= 10) return { s: cut, trimmed: 'activity_type' };
  }
  if (elapsed > 0) {
    const tEnd = s.t[n - 1];
    const cut = sliceStreams(s, (i) => s.t[i] >= tEnd - elapsed);
    if (cut.t.length >= 10) return { s: cut, trimmed: 'trailing' };
  }
  return { s, trimmed: null };
}

/** Rule 4. The user corrected the distance in Strava (treadmill, bad GPS): rescale efforts, drop the short ones. */
export function applyCorrectedDistance(be: Partial<Record<TargetKey, number>>, streamDist: number, csvDistance: number): boolean {
  if (csvDistance <= 0 || streamDist <= 0) return false;
  if (Math.abs(streamDist - csvDistance) / csvDistance <= CORRECTED_TOLERANCE) return false;
  const f = streamDist / csvDistance;
  for (const k of Object.keys(be) as TargetKey[]) {
    if (k === '1k' || k === '1mi' || csvDistance < TARGETS[k] * 0.995) delete be[k];
    else be[k] = Math.round(be[k]! * f * 10) / 10;
  }
  return true;
}

function mean(xs: (number | null)[]): number | null {
  let s = 0, n = 0;
  for (const x of xs) if (x) { s += x; n++; }
  return n ? s / n : null;
}

/** The worker's unit of work. Same result shape as `process()` in the reference. */
export function processBytes(id: string, filename: string, raw: Uint8Array, csvDistance: number, elapsed: number, sport: Sport): WorkerResult {
  try {
    const decoded = decodeStreams(filename, raw);
    const { s, trimmed } = trimMultisport(decoded, sport, csvDistance, elapsed);
    const n = s.t.length;
    const dist = n ? s.d[n - 1] : 0;
    const be = bestEfforts(s.t, s.d);
    const scaled = applyCorrectedDistance(be, dist, csvDistance);

    let hrMax: number | null = null, hrCount = 0;
    for (const h of s.hr) if (h) { hrCount++; if (hrMax === null || h > hrMax) hrMax = h; }
    let hr_hist: number[] | null = null;
    let moving = 0;
    if (n > 1) {
      hr_hist = hrCount > 10 ? new Array<number>(256).fill(0) : null;
      for (let j = 1; j < n; j++) {
        const dt = Math.min(s.t[j] - s.t[j - 1], MAX_GAP_S);
        moving += dt;
        const h = s.hr[j];
        if (hr_hist && h && h > 0 && h < 256) hr_hist[h] += dt;
      }
    }
    return {
      id, n, dist, be,
      hr_avg: mean(s.hr), hr_max: hrMax, cad_avg: mean(s.cad), pw_avg: mean(s.pw),
      hr_hist, moving,
      pos0: s.pos0, epoch0: s.epoch0 ?? null,
      scaled, trimmed,
    };
  } catch (e) {
    return { id, err: String((e as Error)?.message ?? e).slice(0, 80) };
  }
}
