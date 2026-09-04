/** Daniels & Gilbert VDOT from a race of `distM` metres in `tS` seconds. Same constants as the reference. */
export function vdot(distM: number, tS: number): number {
  const v = distM / (tS / 60), tmin = tS / 60;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * tmin) + 0.2989558 * Math.exp(-0.193261 * tmin);
  return vo2 / pct;
}

/** Inverse: seconds a runner of VDOT `vd` would take for `distM`. Bisection, as in the reference page. */
export function timeFor(distM: number, vd: number): number {
  let lo = 200, hi = 40000;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (vdot(distM, mid) > vd) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
