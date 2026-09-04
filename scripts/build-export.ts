/**
 * Dev harness: activities.csv + saved parse results → data.json.
 *   npx tsx scripts/build-export.ts <export.zip> <results.json> <out.json>
 */
import fs from 'node:fs/promises';
import { readCentralDirectory, readEntryText, type ByteSource } from '../src/data/zip';
import { table, num } from '../src/data/csv';
import { buildData } from '../src/data/build';
import type { WorkerResult } from '../src/parse/types';

async function fileSource(path: string): Promise<ByteSource> {
  const fh = await fs.open(path, 'r');
  const { size } = await fh.stat();
  return { size, async slice(start, end) { const buf = new Uint8Array(end - start); let off = 0; while (off < buf.length) { const { bytesRead } = await fh.read(buf, off, buf.length - off, start + off); if (!bytesRead) break; off += bytesRead; } return buf.subarray(0, off); } };
}
const args = process.argv.slice(2);
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const [zipPath, resultsPath, outPath] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const maxHr = flag('--maxhr') ? +flag('--maxhr')! : null;
const official: Record<string, number> = {};
for (const kv of (flag('--official') ?? '').split(',').filter(Boolean)) { const [id, t] = kv.split('='); official[id] = +t; }
const src = await fileSource(zipPath);
const entries = await readCentralDirectory(src);
const byName = new Map(entries.map((e) => [e.name, e]));
const csv = table(await readEntryText(src, byName.get('activities.csv')!));
const prof = table(await readEntryText(src, byName.get('profile.csv')!));
const p = prof.rows[0];
const profile = p ? { id: prof.get(p, 'Athlete ID'), firstName: prof.get(p, 'First Name'), weight: num(prof.get(p, 'Weight')), city: prof.get(p, 'City') } : null;
const results: WorkerResult[] = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
const t0 = performance.now();
const data = buildData(csv, results, profile, { today: '2026-08-27', exportDate: '2026-08-27', maxHr, races: { include: new Set(), exclude: new Set(), official } });
console.log('built in', (performance.now() - t0).toFixed(0), 'ms');
console.log(JSON.stringify(data.meta));
await fs.writeFile(outPath, JSON.stringify(data));
