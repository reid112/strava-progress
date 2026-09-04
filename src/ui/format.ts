import { TARGETS, type TargetKey } from '../parse/types';

export const LBL: Record<TargetKey, string> = { '1k': '1 km', '1mi': '1 mile', '5k': '5K', '10k': '10K', '15k': '15K', half: 'Half', '30k': '30K', marathon: 'Marathon' };
export const KEYS: TargetKey[] = ['1k', '1mi', '5k', '10k', '15k', 'half', '30k', 'marathon'];

export type Units = 'km' | 'mi';
const MI = 1.609344;
let units: Units = 'km';
try { const u = localStorage.getItem('units'); if (u === 'mi' || u === 'km') units = u; } catch { /* private mode */ }
export function getUnits(): Units { return units; }
export function setUnits(u: Units) { units = u; try { localStorage.setItem('units', u); } catch { /* ignore */ } }

/** seconds → h:mm:ss or m:ss */
export const fmt = (s: number): string => {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};
/** minutes per km (number) → "m:ss" in the current units */
export const pace = (p: number): string => {
  if (!Number.isFinite(p)) return '—';
  if (units === 'mi') p *= MI;
  const m = Math.floor(p), s = Math.round((p - m) * 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
};
/** seconds per km → pace string */
export const paceS = (s: number) => pace(s / 60);
export const paceUnit = () => (units === 'mi' ? '/mi' : '/km');
/** km → distance number in current units */
export const dist = (km: number): number => (units === 'mi' ? km / MI : km);
export const distUnit = () => units;
export const distS = (km: number, d = 1): string => `${dist(km).toFixed(d)} ${units}`;
export const distR = (km: number): string => `${Math.round(dist(km)).toLocaleString()} ${units}`;
export const elev = (m: number): number => (units === 'mi' ? m * 3.28084 : m);
export const elevUnit = () => (units === 'mi' ? 'ft' : 'm');
export const elevS = (m: number): string => `${Math.round(elev(m)).toLocaleString()} ${elevUnit()}`;
export const speedS = (kmh: number): string => (units === 'mi' ? `${(kmh / MI).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`);
export const targetKm = (k: TargetKey) => TARGETS[k] / 1000;
export const n = (x: number) => Math.round(x).toLocaleString();
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOWS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const longDate = (d: string): string => { const [y, m, dd] = d.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${dd}, ${y}`; };
export const monthYear = (d: string): string => { const [y, m] = d.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; };
/** "America/Regina" → "Regina" */
export const tzName = (tz: string) => tz.split('/').pop()!.replace(/_/g, ' ');
/** Milestone label: 1:30:00 → 1:30, 40:00 → 40:00 */
export const fmtGoal = (s: number) => (s >= 3600 && s % 60 === 0 ? fmt(s).replace(/:00$/, '') : fmt(s));
export const season = (d: string): string => { const [y, m] = d.split('-').map(Number); return `${m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'} ${y}`; };
export const hour12 = (h: number): string => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h} a.m.` : `${h - 12} p.m.`);
/** "h:mm:ss" or "mm:ss" → seconds */
export function toSec(s: string): number | null {
  const p = s.trim().split(':').map(Number);
  if (p.some((x) => !Number.isFinite(x))) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return null;
}
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
