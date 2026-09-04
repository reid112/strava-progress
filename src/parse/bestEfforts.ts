import { TARGETS, type TargetKey } from './types';

/** Gaps between samples longer than this are treated as pauses. */
export const MAX_GAP_S = 15;

/** Moving-time axis: cumulative time with every inter-sample gap capped at MAX_GAP_S. */
export function movingTime(t: number[]): number[] {
  const mt = new Array<number>(t.length);
  mt[0] = 0;
  for (let i = 1; i < t.length; i++) mt[i] = mt[i - 1] + Math.min(t[i] - t[i - 1], MAX_GAP_S);
  return mt;
}

/**
 * Exact port of `best_efforts` from the reference: for each target distance,
 * a two-pointer scan over the samples finds the fastest window (in moving time)
 * covering that distance, interpolating the end time to the exact metre.
 */
export function bestEfforts(t: number[], d: number[]): Partial<Record<TargetKey, number>> {
  const out: Partial<Record<TargetKey, number>> = {};
  const n = t.length;
  if (n < 10) return out;
  const mt = movingTime(t);
  const dEnd = d[n - 1];
  for (const name of Object.keys(TARGETS) as TargetKey[]) {
    const L = TARGETS[name];
    if (dEnd < L * 0.995) continue;
    let j = 0;
    let best: number | null = null;
    for (let i = 0; i < n; i++) {
      const target = d[i] + L;
      if (target > dEnd + L * 0.005) break;
      while (j < n && d[j] < target) j++;
      if (j >= n) break;
      let tt: number;
      if (j > 0 && d[j] !== d[j - 1]) {
        const frac = (target - d[j - 1]) / (d[j] - d[j - 1]);
        tt = mt[j - 1] + frac * (mt[j] - mt[j - 1]);
      } else tt = mt[j];
      const el = tt - mt[i];
      if (best === null || el < best) best = el;
    }
    if (best && best > 0) out[name] = Math.round(best * 10) / 10;
  }
  return out;
}
