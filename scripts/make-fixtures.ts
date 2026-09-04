/**
 * Synthetic exports for edge-case testing, cut from a real export so the CSV shape is right.
 *   npx tsx scripts/make-fixtures.ts <export.zip> <outdir>
 * Produces: cyclist.zip (rides only, no runs), manual.zip (no files at all),
 * corrupt.zip (a few runs with garbage files), tcx.zip (one run converted to TCX), tiny.zip (5 runs).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { readCentralDirectory, readEntry, readEntryText, type ByteSource } from '../src/data/zip';
import { parseCsv } from '../src/data/csv';

async function fileSource(p: string): Promise<ByteSource> {
  const fh = await fs.open(p, 'r'); const { size } = await fh.stat();
  return { size, async slice(s, e) { const b = new Uint8Array(e - s); let o = 0; while (o < b.length) { const { bytesRead } = await fh.read(b, o, b.length - o, s + o); if (!bytesRead) break; o += bytesRead; } return b.subarray(0, o); } };
}

/** Tiny stored-entries zip writer (no compression; fixtures are small). */
function writeZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [], cd: Uint8Array[] = [];
  let offset = 0;
  const enc = new TextEncoder();
  const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc32 = (b: Uint8Array) => { let c = -1; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 0, true); lh.setUint16(10, 0x7000, true); lh.setUint16(12, 0x5d1b, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(10, 0, true); ch.setUint16(12, 0x7000, true); ch.setUint16(14, 0x5d1b, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);
    cd.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdBytes = cd.reduce((a, b) => a + b.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true); eocd.setUint16(8, files.length, true); eocd.setUint16(10, files.length, true); eocd.setUint32(12, cdBytes, true); eocd.setUint32(16, offset, true);
  const all = [...parts, ...cd, new Uint8Array(eocd.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

function toCsv(rows: string[][]): Uint8Array {
  const q = (s: string) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  return new TextEncoder().encode(rows.map((r) => r.map(q).join(',')).join('\n') + '\n');
}

/** GPX → TCX with DistanceMeters from a running odometer and HR from the extension. */
function gpxToTcx(gpx: string): string {
  const pts = [...gpx.matchAll(/<trkpt lat="([^"]+)" lon="([^"]+)">([\s\S]*?)<\/trkpt>/g)];
  const R = 6371000, P = Math.PI / 180;
  let cum = 0, prev: [number, number] | null = null;
  const tp = pts.map((m) => {
    const lat = +m[1], lon = +m[2], time = /<time>([^<]+)</.exec(m[3])?.[1], hr = /<(?:\w+:)?hr>(\d+)</.exec(m[3])?.[1];
    if (prev) { const a = Math.sin((lat - prev[0]) * P / 2) ** 2 + Math.cos(prev[0] * P) * Math.cos(lat * P) * Math.sin((lon - prev[1]) * P / 2) ** 2; cum += 2 * R * Math.asin(Math.sqrt(a)); }
    prev = [lat, lon];
    return `<Trackpoint><Time>${time}</Time><Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>${lon}</LongitudeDegrees></Position><DistanceMeters>${cum.toFixed(2)}</DistanceMeters>${hr ? `<HeartRateBpm><Value>${hr}</Value></HeartRateBpm>` : ''}<Extensions><ns3:TPX><ns3:RunCadence>85</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2"><Activities><Activity Sport="Running"><Lap><Track>${tp.join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
}

const [zipPath, outDir] = process.argv.slice(2);
await fs.mkdir(outDir, { recursive: true });
const src = await fileSource(zipPath);
const entries = await readCentralDirectory(src);
const byName = new Map(entries.map((e) => [e.name, e]));
const csvRows = parseCsv(await readEntryText(src, byName.get('activities.csv')!));
const header = csvRows[0], rows = csvRows.slice(1).filter((r) => r.length > 1);
const col = (n: string, nth = 0) => header.reduce<number[]>((a, h, i) => (h === n ? [...a, i] : a), [])[nth];
const iType = col('Activity Type'), iFile = col('Filename');
const profile = await readEntry(src, byName.get('profile.csv')!);
const scrub = (p: Uint8Array) => new TextEncoder().encode(new TextDecoder().decode(p).replace(/[^,\n]+@[^,\n]+/, 'test@example.com'));

async function pack(name: string, keep: string[][], mutate?: (r: string[]) => Promise<{ name: string; data: Uint8Array } | null>) {
  const files: { name: string; data: Uint8Array }[] = [{ name: 'activities.csv', data: toCsv([header, ...keep]) }, { name: 'profile.csv', data: scrub(profile) }];
  for (const r of keep) {
    const fn = r[iFile];
    if (!fn) continue;
    const f = mutate ? await mutate(r) : (byName.has(fn) ? { name: fn, data: await readEntry(src, byName.get(fn)!) } : null);
    if (f) files.push(f);
  }
  await fs.writeFile(path.join(outDir, name), writeZip(files));
  console.log(name, keep.length, 'rows', files.length - 2, 'files');
}

// 1. cyclist: rides, swims, strength only; no runs at all. Ride files kept (timezone), the rest dropped.
await pack('cyclist.zip', rows.filter((r) => ['Ride', 'Virtual Ride', 'Swim', 'Weight Training', 'Walk'].includes(r[iType])).map((r) => { const c = [...r]; if (!['Ride', 'Virtual Ride'].includes(r[iType]) || !byName.has(r[iFile])) c[iFile] = ''; return c; }));
// 2. manual only: 60 runs with no files
await pack('manual.zip', rows.filter((r) => r[iType] === 'Run').slice(0, 60).map((r) => { const c = [...r]; c[iFile] = ''; return c; }));
// 3. corrupt: 12 runs, 3 with garbage bytes, 1 missing from the zip
const runs = rows.filter((r) => r[iType] === 'Run' && r[iFile].endsWith('.fit.gz')).slice(0, 12);
let k = 0;
await pack('corrupt.zip', runs, async (r) => { k++; if (k <= 3) return { name: r[iFile], data: new Uint8Array(Buffer.from('this is not a fit file at all ' + k)) }; if (k === 4) return null; return { name: r[iFile], data: await readEntry(src, byName.get(r[iFile])!) }; });
// 4. tcx: gpx runs converted to TCX (plain and gzipped)
const gpxRuns = rows.filter((r) => r[iType] === 'Run' && r[iFile].endsWith('.gpx')).slice(0, 6);
let j = 0;
await pack('tcx.zip', gpxRuns.map((r) => { const c = [...r]; c[iFile] = r[iFile].replace(/\.gpx$/, j++ % 2 ? '.tcx.gz' : '.tcx'); return c; }), async (r) => {
  const orig = r[iFile].replace(/\.tcx(\.gz)?$/, '.gpx');
  const tcx = new TextEncoder().encode(gpxToTcx(new TextDecoder().decode(await readEntry(src, byName.get(orig)!))));
  return { name: r[iFile], data: r[iFile].endsWith('.gz') ? new Uint8Array(zlib.gzipSync(tcx)) : tcx };
});
// 5. tiny: five real runs, for quick e2e
await pack('tiny.zip', rows.filter((r) => r[iType] === 'Run' && r[iFile]).slice(0, 5));
console.log('fixtures written to', outDir, '(names/dates are real; kept out of git)');
