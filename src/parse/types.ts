/** Distances (metres) for which best efforts are computed. Order matters for display. */
export const TARGETS = {
  '1k': 1000, '1mi': 1609.34, '5k': 5000, '10k': 10000, '15k': 15000,
  half: 21097.5, '30k': 30000, marathon: 42195,
} as const;
export type TargetKey = keyof typeof TARGETS;
export const TARGET_KEYS = Object.keys(TARGETS) as TargetKey[];

/** Sport as the activity is classified in the CSV. Used to pick the right leg of a multisport file. */
export type Sport = 'running' | 'cycling' | 'swimming' | 'other';

/** Per-sample streams. `t` is seconds since the first sample, `d` cumulative metres. */
export interface Streams {
  t: number[];
  d: number[];
  hr: (number | null)[];
  cad: (number | null)[];
  pw: (number | null)[];
  /** First GPS fix, if any. */
  pos0: [number, number] | null;
  /** FIT session messages, when present. Lets us cut a multisport recording cleanly. */
  sessions?: Session[];
  /** Per-sample activity type from the FIT record message, when present. */
  actType?: (string | null)[];
  /** Absolute epoch ms of sample 0, when the file has timestamps. */
  epoch0?: number;
}

export interface Session {
  sport: string;
  /** Epoch ms */
  start: number;
  elapsed: number;
  distance: number;
}

/** What the main thread hands a worker. `bytes` is transferred, not copied. */
export interface Job {
  id: string;
  filename: string;
  bytes: ArrayBuffer;
  /** Distance from `activities.csv` (metres, the second Distance column). */
  csvDistance: number;
  /** Elapsed Time from the CSV, seconds. */
  elapsed: number;
  sport: Sport;
}

/** Same shape as `process()` in the reference `parse_runs.py`, plus a few extras. */
export interface ActivityResult {
  id: string;
  n: number;
  /** Stream distance (metres) after any multisport trimming. */
  dist: number;
  be: Partial<Record<TargetKey, number>>;
  hr_avg: number | null;
  hr_max: number | null;
  cad_avg: number | null;
  pw_avg: number | null;
  /**
   * Seconds spent at each integer bpm (index = bpm). Zones are derived from this
   * later so a max-HR override never needs a re-parse.
   */
  hr_hist: number[] | null;
  /** Moving seconds (gaps capped at 15 s). */
  moving: number;
  pos0: [number, number] | null;
  epoch0: number | null;
  /** Rule 4: CSV distance and stream distance disagreed by >3%, efforts were rescaled. */
  scaled: boolean;
  /** Rule 3: the file was a whole multisport recording and was cut to this activity's leg. */
  trimmed: 'session' | 'activity_type' | 'trailing' | null;
}

export interface ActivityError {
  id: string;
  err: string;
}

export type WorkerResult = ActivityResult | ActivityError;

export function isError(r: WorkerResult): r is ActivityError {
  return 'err' in r;
}
