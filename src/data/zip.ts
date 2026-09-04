import * as pako from 'pako';

/**
 * Minimal ZIP reader (central directory + per-entry inflate), with ZIP64.
 * Why not JSZip: it inflates on the calling thread and needs the whole archive
 * in memory per consumer. With this, every worker slices its own entries out of
 * the File and inflates them itself, so the main thread never touches
 * activity bytes and memory stays per-entry.
 */
export interface ByteSource {
  size: number;
  slice(start: number, end: number): Promise<Uint8Array>;
}

export interface ZipEntry {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  csize: number;
  usize: number;
  /** Offset of the local file header. */
  offset: number;
}

export function blobSource(blob: Blob): ByteSource {
  return {
    size: blob.size,
    async slice(start, end) {
      return new Uint8Array(await blob.slice(start, end).arrayBuffer());
    },
  };
}

const SIG_EOCD = 0x06054b50, SIG_EOCD64_LOC = 0x07064b50, SIG_EOCD64 = 0x06064b50, SIG_CEN = 0x02014b50, SIG_LOC = 0x04034b50;
const utf8 = new TextDecoder('utf-8');

function u16(v: DataView, o: number) { return v.getUint16(o, true); }
function u32(v: DataView, o: number) { return v.getUint32(o, true); }
function u64(v: DataView, o: number) { return Number(v.getBigUint64(o, true)); }

export async function readCentralDirectory(src: ByteSource): Promise<ZipEntry[]> {
  const tailLen = Math.min(src.size, 22 + 65535 + 20);
  const tail = await src.slice(src.size - tailLen, src.size);
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let p = tail.length - 22;
  while (p >= 0 && u32(tv, p) !== SIG_EOCD) p--;
  if (p < 0) throw new Error('not a zip file (no end-of-central-directory record)');

  let entries = u16(tv, p + 10);
  let cdSize = u32(tv, p + 12);
  let cdOffset = u32(tv, p + 16);
  if (entries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const lp = p - 20;
    if (lp >= 0 && u32(tv, lp) === SIG_EOCD64_LOC) {
      const eocd64Off = u64(tv, lp + 8);
      const rec = await src.slice(eocd64Off, eocd64Off + 56);
      const rv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength);
      if (u32(rv, 0) !== SIG_EOCD64) throw new Error('bad zip64 record');
      entries = u64(rv, 32);
      cdSize = u64(rv, 40);
      cdOffset = u64(rv, 48);
    }
  }

  const cd = await src.slice(cdOffset, cdOffset + cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const out: ZipEntry[] = [];
  let o = 0;
  for (let i = 0; i < entries && o + 46 <= cd.length; i++) {
    if (u32(v, o) !== SIG_CEN) throw new Error('bad central directory entry');
    const method = u16(v, o + 10);
    let csize = u32(v, o + 20), usize = u32(v, o + 24);
    const nameLen = u16(v, o + 28), extraLen = u16(v, o + 30), commentLen = u16(v, o + 32);
    let offset = u32(v, o + 42);
    const name = utf8.decode(cd.subarray(o + 46, o + 46 + nameLen));
    // ZIP64 extra field: only the fields that overflowed are present, in this order.
    let x = o + 46 + nameLen;
    const xEnd = x + extraLen;
    while (x + 4 <= xEnd) {
      const id = u16(v, x), len = u16(v, x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = u64(v, q); q += 8; }
        if (csize === 0xffffffff) { csize = u64(v, q); q += 8; }
        if (offset === 0xffffffff) { offset = u64(v, q); q += 8; }
      }
      x += 4 + len;
    }
    out.push({ name, method, csize, usize, offset });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** Read and (if deflated) inflate one entry. */
export async function readEntry(src: ByteSource, e: ZipEntry): Promise<Uint8Array> {
  const head = await src.slice(e.offset, e.offset + 30);
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (u32(hv, 0) !== SIG_LOC) throw new Error('bad local header for ' + e.name);
  const dataStart = e.offset + 30 + u16(hv, 26) + u16(hv, 28);
  const raw = await src.slice(dataStart, dataStart + e.csize);
  if (e.method === 0) return raw;
  if (e.method === 8) return pako.inflateRaw(raw);
  throw new Error(`unsupported compression method ${e.method} for ${e.name}`);
}

export async function readEntryText(src: ByteSource, e: ZipEntry): Promise<string> {
  return utf8.decode(await readEntry(src, e));
}
