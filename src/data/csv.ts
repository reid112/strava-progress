/** RFC 4180 parser. Handles quoted fields with commas, newlines, and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  const n = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1; // BOM
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      i++;
      while (i < n) {
        const q = text[i];
        if (q === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          i++;
          break;
        }
        field += q;
        i++;
      }
      continue;
    }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; continue; }
    field += c;
    i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/**
 * Header names deduplicated the way pandas does it: the second "Distance"
 * becomes "Distance.1". Rule 1 depends on this: the first Distance column is
 * km for runs but metres for swims; Distance.1 is metres for everything.
 */
export function dedupeHeader(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((h) => {
    const k = seen.get(h) ?? 0;
    seen.set(h, k + 1);
    return k ? `${h}.${k}` : h;
  });
}

export interface Table {
  header: string[];
  rows: string[][];
  col(name: string): number;
  get(row: string[], name: string): string;
}

export function table(text: string): Table {
  const all = parseCsv(text);
  const header = dedupeHeader(all[0] ?? []);
  const idx = new Map(header.map((h, i) => [h, i] as const));
  const rows = all.slice(1).filter((r) => r.length > 1);
  return {
    header, rows,
    col: (name) => idx.get(name) ?? -1,
    get: (row, name) => { const i = idx.get(name); return i == null ? '' : (row[i] ?? ''); },
  };
}

const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/** "Aug 27, 2026, 5:55:43 PM" (UTC, as Strava writes it) → epoch ms. Rule 2. */
export function parseStravaDate(s: string): number | null {
  const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/.exec(s.trim());
  if (!m) return null;
  const mo = MONTHS[m[1]];
  if (mo == null) return null;
  let h = +m[4] % 12;
  if (m[7] === 'PM') h += 12;
  return Date.UTC(+m[3], mo, +m[2], h, +m[5], +m[6]);
}

export function num(s: string): number | null {
  if (s === '' || s == null) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}
