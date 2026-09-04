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

let src: ByteSource | null = null;

self.onmessage = async (e: MessageEvent<InitMsg | JobMsg>) => {
  const m = e.data;
  if (m.type === 'init') { src = blobSource(m.blob); return; }
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
