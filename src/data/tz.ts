import tzlookup from 'tz-lookup';

export function tzFromLatLon(lat: number, lon: number): string | null {
  try { return tzlookup(lat, lon); } catch { return null; }
}

export function browserTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export interface LocalParts {
  y: number; m: number; d: number; h: number;
  /** Monday = 0 … Sunday = 6, like pandas. */
  dow: number;
  /** YYYY-MM-DD */
  date: string;
}

const fmts = new Map<string, Intl.DateTimeFormat>();
const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmts.get(tz);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' };
    try { f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz }); }
    catch { f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }); }
    fmts.set(tz, f);
  }
  return f;
}

/** Rule 2: CSV timestamps are UTC; everything date-shaped must go through the local zone first. */
export function localParts(epochMs: number, tz: string): LocalParts {
  const parts = fmt(tz).formatToParts(new Date(epochMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = +get('year'), m = +get('month'), d = +get('day');
  let h = +get('hour');
  if (h === 24) h = 0;
  return { y, m, d, h, dow: DOW[get('weekday')] ?? 0, date: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

/** Days since epoch for a YYYY-MM-DD string (UTC arithmetic, so no DST surprises). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export function dateFromDayNumber(n: number): string {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}
/** Monday-start week key (YYYY-MM-DD of the Monday), i.e. pandas 'W-SUN' period start. */
export function weekStart(date: string): string {
  const n = dayNumber(date);
  const dow = (new Date(n * 86400000).getUTCDay() + 6) % 7;
  return dateFromDayNumber(n - dow);
}
export function quarterKey(date: string): string {
  return `${date.slice(0, 4)}Q${Math.floor((+date.slice(5, 7) - 1) / 3) + 1}`;
}
export function addYears(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${y + n}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
