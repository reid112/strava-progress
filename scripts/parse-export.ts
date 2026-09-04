/**
 * Dev harness: run the browser parser pipeline over a real export in Node,
 * single-threaded, and save per-activity results for build.ts iteration.
 *   npx tsx scripts/parse-export.ts <export.zip> <out.json>
 */
import fs from 'node:fs/promises';
import { readCentralDirectory, readEntry, readEntryText, type ByteSource } from '../src/data/zip';
import { table, num } from '../src/data/csv';
import { processBytes } from '../src/parse/process';
import type { Sport, WorkerResult } from '../src/parse/types';

async function fileSource(path: string): Promise<ByteSource> {
  const fh = await fs.open(path, 'r');
  const { size } = await fh.stat();
  return {
    size,
    async slice(start, end) {
      const buf = new Uint8Array(end - start);
      let off = 0;
      while (off < buf.length) {
        const { bytesRead } = await fh.read(buf, off, buf.length - off, start + off);
        if (!bytesRead) break;
        off += bytesRead;
      }
      return buf.subarray(0, off);
    },
  };
}

function sportOf(type: string): Sport {
  if (type === 'Run' || type === 'Virtual Run') return 'running';
  if (type === 'Ride' || type === 'Virtual Ride') return 'cycling';
  if (type === 'Swim') return 'swimming';
  return 'other';
}

const [zipPath, outPath] = process.argv.slice(2);
const src = await fileSource(zipPath);
const entries = await readCentralDirectory(src);
const byName = new Map(entries.map((e) => [e.name, e]));
console.log('entries', entries.length);
const csv = table(await readEntryText(src, byName.get('activities.csv')!));
console.log('activities', csv.rows.length, 'cols', csv.header.length, 'Distance.1 at', csv.col('Distance.1'));
const runs = csv.rows.filter((r) => sportOf(csv.get(r, 'Activity Type')) === 'running' && csv.get(r, 'Filename'));
console.log('runs with files', runs.length);
const results: WorkerResult[] = [];
const t0 = performance.now();
let i = 0;
for (const r of runs) {
  const id = csv.get(r, 'Activity ID'), fn = csv.get(r, 'Filename');
  const e = byName.get(fn);
  if (!e) { results.push({ id, err: 'missing in zip' }); continue; }
  const raw = await readEntry(src, e);
  results.push(processBytes(id, fn, raw, num(csv.get(r, 'Distance.1')) ?? 0, num(csv.get(r, 'Elapsed Time')) ?? 0, 'running'));
  if (++i % 100 === 0) console.log(i, ((performance.now() - t0) / 1000).toFixed(1) + 's');
}
console.log('done', results.length, 'in', ((performance.now() - t0) / 1000).toFixed(1) + 's');
const errs = results.filter((r) => 'err' in r);
console.log('errors', errs.length, errs.slice(0, 5));
const trimmed = results.filter((r) => 'trimmed' in r && r.trimmed), scaled = results.filter((r) => 'scaled' in r && r.scaled);
console.log('trimmed', trimmed.map((r: any) => [r.id, r.trimmed, Math.round(r.dist)]), 'scaled', scaled.length);
await fs.writeFile(outPath, JSON.stringify(results));
