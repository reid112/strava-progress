/**
 * "Confirm your races": detected candidates plus anything the user adds, with an
 * optional official time each. Persisted per athlete in localStorage so a re-upload
 * remembers the answers.
 */
import type { RaceOverrides } from '../data/build';
import { RACE_NAME_RE } from '../data/build';
import { esc, fmt, toSec, distS } from './format';

export interface RaceCandidate { id: string; d: string; name: string; km: number; elapsed: number; detected: 'name' | 'type' | null }

interface Saved { include: string[]; exclude: string[]; official: Record<string, number> }

export function loadOverrides(athleteId: string): RaceOverrides {
  try {
    const s: Saved = JSON.parse(localStorage.getItem('races:' + athleteId) || 'null');
    if (s) return { include: new Set(s.include), exclude: new Set(s.exclude), official: s.official ?? {} };
  } catch { /* ignore */ }
  return { include: new Set(), exclude: new Set(), official: {} };
}
export function saveOverrides(athleteId: string, o: RaceOverrides) {
  try { localStorage.setItem('races:' + athleteId, JSON.stringify({ include: [...o.include], exclude: [...o.exclude], official: o.official } as Saved)); } catch { /* ignore */ }
}
export function detect(name: string, typeCol: string): 'name' | 'type' | null {
  return typeCol === '1' ? 'type' : RACE_NAME_RE.test(name) ? 'name' : null;
}

export function renderRaces(root: HTMLElement, runs: RaceCandidate[], initial: RaceOverrides, onDone: (o: RaceOverrides) => void) {
  const o: RaceOverrides = { include: new Set(initial.include), exclude: new Set(initial.exclude), official: { ...initial.official } };
  const isOn = (r: RaceCandidate) => (o.include.has(r.id) || (r.detected !== null && !o.exclude.has(r.id)));
  const listed = new Set<string>(runs.filter((r) => r.detected || o.include.has(r.id)).map((r) => r.id));
  root.innerHTML = `<div class="races">
    <h2>Confirm your races</h2>
    <p class="lede">These runs look like races or time trials, from their names${runs.some((r) => r.detected === 'type') ? ' or Strava\'s race tag' : ''}. Untick warm-ups and shakeouts, add anything missing, and enter official chip times where you have them. Official times replace the watch time in the records. Saved in this browser for next time.</p>
    <div class="cands"><table id="race-table"></table></div>
    <div class="add"><label for="race-search">Add a run:</label><input type="search" id="race-search" placeholder="search by name or date"><span class="note" style="margin:0" id="race-hits"></span></div>
    <div class="sticky"><span class="note" style="margin:0;margin-right:auto" id="race-count"></span><button class="ghost" id="race-skip" type="button">Skip</button><button id="race-done" type="button" class="primary">Show my page</button></div>
  </div>`;
  const table = root.querySelector('#race-table') as HTMLElement;
  const draw = () => {
    const rows = runs.filter((r) => listed.has(r.id)).sort((a, b) => (a.d < b.d ? -1 : 1));
    table.innerHTML = `<tr><th></th><th>Date</th><th>Run</th><th class="num">Distance</th><th class="num">Watch time</th><th>Official time</th></tr>` + rows.map((r) => `<tr>
      <td><input type="checkbox" data-id="${r.id}" ${isOn(r) ? 'checked' : ''} aria-label="include"></td>
      <td>${r.d}</td><td>${esc(r.name)}${r.detected ? '' : '<span class="pill">added</span>'}</td>
      <td class="num">${distS(r.km, 2)}</td><td class="num">${fmt(r.elapsed)}</td>
      <td><input type="text" data-off="${r.id}" placeholder="h:mm:ss" value="${o.official[r.id] ? fmt(o.official[r.id]) : ''}" ${isOn(r) ? '' : 'disabled'}></td></tr>`).join('');
    (root.querySelector('#race-count') as HTMLElement).textContent = `${rows.filter(isOn).length} races selected`;
    table.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((cb) => cb.addEventListener('change', () => {
      const id = cb.dataset.id!, r = runs.find((x) => x.id === id)!;
      if (cb.checked) { o.exclude.delete(id); if (!r.detected) o.include.add(id); }
      else { o.include.delete(id); if (r.detected) o.exclude.add(id); }
      draw();
    }));
    table.querySelectorAll<HTMLInputElement>('input[type=text]').forEach((inp) => inp.addEventListener('change', () => {
      const id = inp.dataset.off!, v = inp.value.trim();
      if (!v) { delete o.official[id]; inp.classList.remove('bad'); return; }
      const s = toSec(v);
      if (s && s > 0) { o.official[id] = s; inp.classList.remove('bad'); } else inp.classList.add('bad');
    }));
  };
  draw();
  const search = root.querySelector('#race-search') as HTMLInputElement, hits = root.querySelector('#race-hits') as HTMLElement;
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    hits.innerHTML = '';
    if (q.length < 2) return;
    const found = runs.filter((r) => !listed.has(r.id) && (r.name.toLowerCase().includes(q) || r.d.includes(q))).slice(0, 8);
    hits.innerHTML = found.length ? found.map((r) => `<button class="ghost small" data-add="${r.id}" type="button">${r.d} · ${esc(r.name.slice(0, 40))} · ${distS(r.km)}</button>`).join(' ') : 'no matches';
    hits.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.add!; listed.add(id); o.include.add(id); o.exclude.delete(id); search.value = ''; hits.innerHTML = ''; draw(); }));
  });
  (root.querySelector('#race-done') as HTMLElement).addEventListener('click', () => onDone(o));
  (root.querySelector('#race-skip') as HTMLElement).addEventListener('click', () => onDone(initial));
}
