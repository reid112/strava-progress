import type { TargetKey } from '../parse/types';

export type SportGroup = 'Run' | 'Bike' | 'Swim' | 'Strength' | 'Other';

export interface EffortRow {
  d: string; t: number; name: string; id: number; y: number; km: number; hr: number | null;
  /** Rule 6: whole-run time scaled to the target distance because the GPS track came up just short. */
  extrap?: boolean;
  /** Time is the official chip time the user entered, not the watch's. */
  official?: boolean;
  vdot?: number;
}

export interface Race {
  id: number;
  d: string; name: string; km: number; moving: number; elapsed: number; pace: number;
  hr: number | null; hrmax: number | null; desc: string;
  be: Partial<Record<TargetKey, number>>;
  /** Official chip time in seconds, if the user entered one. */
  official?: number | null;
  /** Why it was suggested: 'name' regex, 'type' CSV race flag, or 'user' added by hand. */
  source: 'name' | 'type' | 'user';
}

export interface WeekRow { w: string; km: number; h: number; n: number }

/** The JSON the page renders. Same keys as the reference data.json, plus `meta` and a few bike fields. */
export interface DataJson {
  generated: string;
  first: string;
  last: string;
  totals: {
    activities: number; runs: number; run_km: number; run_hours: number; run_elev: number;
    bike_km: number; bike_hours: number; bike_elev: number; swim_km: number; swim_hours: number; strength_hours: number; all_hours: number;
    marathons: number; halfs_plus: number; longest_km: number; active_days: number;
  };
  yearly: {
    year: number; runs: number; run_km: number; run_h: number; longest: number; med_pace: number | null; avg_hr: number | null; cad: number | null;
    bike_km: number; bike_h: number; bike_elev: number; swim_km: number; swim_h: number; strength_h: number; other_h: number; all_h: number; activities: number; weeks_run: number;
    rides: number; pw_avg: number | null; longest_ride: number;
  }[];
  monthly: { m: string; run_km: number; runs: number; run_h: number; bike_h: number; swim_h: number; strength_h: number; other_h: number; bike_km: number; swim_km: number; long: number }[];
  weekly: WeekRow[];
  weekly_bike: WeekRow[];
  pr_progression: Record<TargetKey, EffortRow[]>;
  best_by_year: Record<TargetKey, Record<string, EffortRow>>;
  effort_scatter: Record<TargetKey, [string, number][]>;
  vdot_quarterly: { q: string; vdot: number; dist: TargetKey; t: number; d: string }[];
  aerobic: { q: string; pace: number; hr: number; ef: number; n: number }[];
  pace_hr: [string, number, number, number][];
  zones_by_year: Record<string, number[]>;
  races: Race[];
  daily: Record<string, Partial<Record<SportGroup, number>>>;
  streaks: { longest_run_streak_days: number };
  consistency: Record<string, number>;
  shoes: { name: string; km: number; n: number; first: string; last: string }[];
  hour_hist: number[];
  dow_hist: number[];
  hour_hist_bike: number[];
  dow_hist_bike: number[];
  dist_dist: Record<string, number[]>;
  train_last2y: { weeks: number; run_h_wk: number; all_h_wk: number; run_km_wk: number; run_h_wk_median: number };
  train_prev2y: { run_km_wk: number; all_h_wk: number };
  longest_runs: { d: string; name: string; km: number; t: number }[];
  longest_rides: { d: string; name: string; km: number; t: number; elev: number }[];
  meta: {
    athlete_id: string;
    first_name: string;
    weight_kg: number | null;
    city: string;
    tz: string;
    tz_source: 'gps' | 'browser';
    max_hr: number;
    max_hr_source: 'derived' | 'user';
    files_total: number;
    files_failed: number;
    files_missing: number;
    trimmed_multisport: number;
    scaled_distance: number;
    floors: Record<TargetKey, number>;
    easy_hr: [number, number];
    primary_sport: 'run' | 'bike';
    restarts: number;
    /** Date of the first run after each gap of more than 90 days. */
    restart_dates: string[];
    /** Years with run volume under 20% of the best year (the "zero years"). */
    low_years: number[];
    peak_hour: number | null;
    peak_dow: number | null;
    export_date: string;
  };
}
