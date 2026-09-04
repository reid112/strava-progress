import { blobSource, readEntry, type ByteSource, type ZipEntry } from '../data/zip';
import { processBytes } from './process';
import type { Sport, WorkerResult } from './types';

export interface InitMsg { type: 'init'; blob: Blob }
export interface JobMsg {
  type: 'job';
  id: string;
  filename: string;
  entry: ZipEntry;
  csvDistance: number;
  elapsed: number;
  sport: Sport;
}
export interface ResultMsg { type: 'result'; result: WorkerResult }
export interface ReadyMsg { type: 'ready'; ok: boolean; err?: string }

let src: ByteSource | null = null;

self.onmessage = async (e: MessageEvent<InitMsg | JobMsg>) => {
  const m = e.data;
  if (m.type === 'init') {
    src = blobSource(m.blob);
    // Probe: some browsers hand a worker a File it cannot read (Safari on file://). Say so before any work is queued.
    let ready: ReadyMsg;
    try { await src.slice(0, Math.min(4, src.size)); ready = { type: 'ready', ok: true }; }
    catch (e) { ready = { type: 'ready', ok: false, err: String((e as Error)?.message ?? e) }; }
    (self as unknown as Worker).postMessage(ready);
    return;
  }
  let result: WorkerResult;
  try {
    if (!src) throw new Error('worker not initialised');
    const raw = await readEntry(src, m.entry);
    result = processBytes(m.id, m.filename, raw, m.csvDistance, m.elapsed, m.sport);
  } catch (err) {
    result = { id: m.id, err: String((err as Error)?.message ?? err).slice(0, 80) };
  }
  const msg: ResultMsg = { type: 'result', result };
  (self as unknown as Worker).postMessage(msg);
};
