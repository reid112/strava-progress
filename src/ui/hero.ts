import type { DataJson } from '../data/types';
import { heroKey } from './copy';
import { fmt, LBL, distS, targetKm, dist, distUnit } from './format';
import { reduced } from './charts';

const $ = (s: string) => document.querySelector(s) as HTMLElement;

/** The head-to-head: your first year's best X against your best X now. Hidden when there's no history to compare. */
export function renderHero(D: DataJson) {
  const race = $('#race');
  const h = heroKey(D);
  if (!h || D.meta.primary_sport === 'bike') { race.hidden = true; return; }
  race.hidden = false;
  const a = D.best_by_year[h.k][h.y0], b = D.best_by_year[h.k][h.y1];
  const T_NOW = b.t, T_THEN = a.t, L = targetKm(h.k), DUR = reduced ? 0 : 11000;
  $('#race-h').textContent = `A ${LBL[h.k]}: the runner you were in ${h.y0} against the one you are now`;
  $('#tag-then').textContent = h.y0; $('#tag-now').textContent = h.y1;
  $('#l-now').textContent = `${h.y1} · ${fmt(T_NOW)} best`; $('#l-then').textContent = `${h.y0} · ${fmt(T_THEN)} best`;
  const lane = $('#lane');
  lane.querySelectorAll('.tick').forEach((t) => t.remove());
  const total = dist(L), stepKm = total <= 6 ? 1 : total <= 14 ? 2 : 5;
  for (let k = 0; k <= total; k += stepKm) {
    const t = document.createElement('div');
    t.className = 'tick'; t.style.left = (k / total * 100) + '%';
    t.innerHTML = `<span>${k} ${distUnit()}</span>`;
    lane.appendChild(t);
  }
  let raf: number | null = null;
  const setState = (t: number) => {
    const dn = Math.min(L, L * t / T_NOW), dt = Math.min(L, L * t / T_THEN);
    $('#r-now').style.left = (dn / L * 100) + '%'; $('#r-then').style.left = (dt / L * 100) + '%';
    $('#clk').textContent = fmt(Math.min(t, T_THEN)); $('#d-now').textContent = distS(dn, 2); $('#d-then').textContent = distS(dt, 2);
    if (t >= T_NOW) {
      const gap = L - L * T_NOW / T_THEN;
      $('#res').textContent = `${h.y1} finishes in ${fmt(T_NOW)}. ${h.y0} is ${distS(gap, 2)} back and will need another ${fmt(T_THEN - T_NOW)}.`;
    } else $('#res').textContent = '';
  };
  const go = $('#go') as HTMLButtonElement;
  const run = () => {
    if (raf) cancelAnimationFrame(raf);
    go.textContent = 'Run it again';
    if (!DUR) { setState(T_NOW); return; }
    const t0 = performance.now();
    const step = (now: number) => { const t = Math.min(T_NOW, (now - t0) / DUR * T_NOW); setState(t); if (t < T_NOW) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
  };
  go.onclick = run;
  go.textContent = 'Run the race';
  setState(0);
}
