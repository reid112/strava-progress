import type { JobMsg, ReadyMsg, ResultMsg } from './worker';
import { isError, type WorkerResult } from './types';
import { blobSource, readEntry } from '../data/zip';
import { processBytes } from './process';
// Inlined so the built page also works from file://, where Chrome refuses to load worker scripts.
import ParseWorker from './worker?worker&inline';

export type JobSpec = Omit<JobMsg, 'type'>;

export interface Progress { done: number; total: number }

/**
 * Fan the jobs out over `navigator.hardwareConcurrency` workers. Results come back in any order.
 * If workers can't run at all (Safari opening the page from file:// refuses blob: workers and
 * the data: fallback can't read the File), parse on the main thread instead, yielding between
 * files so the progress bar keeps moving.
 */
export async function runPool(blob: Blob, jobs: JobSpec[], onProgress: (p: Progress) => void, size = navigator.hardwareConcurrency || 4): Promise<WorkerResult[]> {
  if (!jobs.length) return [];
  try {
    const results = await workerPool(blob, jobs, onProgress, size);
    const errs = results.filter(isError).length;
    if (results.length >= 4 && errs / results.length > 0.9) {
      console.warn(`Workers returned ${errs}/${results.length} errors (first: "${(results.find(isError) as { err: string }).err}"); parsing on the main thread instead.`);
      return mainThread(blob, jobs, onProgress);
    }
    return results;
  } catch (e) {
    console.warn(`Workers unavailable (${(e as Error).message}); parsing on the main thread instead.`);
    return mainThread(blob, jobs, onProgress);
  }
}

function workerPool(blob: Blob, jobs: JobSpec[], onProgress: (p: Progress) => void, size: number): Promise<WorkerResult[]> {
  const n = Math.max(1, Math.min(size, jobs.length));
  const results: WorkerResult[] = [];
  let next = 0, done = 0;
  return new Promise((resolve, reject) => {
    const workers: Worker[] = [];
    const finish = () => { workers.forEach((w) => w.terminate()); resolve(results); };
    const fail = (msg: string) => { workers.forEach((w) => w.terminate()); reject(new Error(msg)); };
    const feed = (w: Worker) => {
      if (next >= jobs.length) return;
      const j = jobs[next++];
      const msg: JobMsg = { type: 'job', ...j };
      w.postMessage(msg);
    };
    for (let i = 0; i < n; i++) {
      let w: Worker;
      try { w = new ParseWorker(); } catch (e) { fail((e as Error).message); return; }
      workers.push(w);
      w.onerror = (e) => fail(e.message || 'worker error');
      w.onmessage = (e: MessageEvent<ResultMsg | ReadyMsg>) => {
        if (e.data.type === 'ready') { if (e.data.ok) feed(w); else fail(`worker cannot read the file (${e.data.err})`); return; }
        results.push(e.data.result);
        done++;
        onProgress({ done, total: jobs.length });
        if (done === jobs.length) finish();
        else feed(w);
      };
      w.postMessage({ type: 'init', blob });
    }
  });
}

async function mainThread(blob: Blob, jobs: JobSpec[], onProgress: (p: Progress) => void): Promise<WorkerResult[]> {
  const src = blobSource(blob);
  const results: WorkerResult[] = [];
  let last = performance.now();
  for (const j of jobs) {
    try {
      const raw = await readEntry(src, j.entry);
      results.push(processBytes(j.id, j.filename, raw, j.csvDistance, j.elapsed, j.sport));
    } catch (e) {
      results.push({ id: j.id, err: String((e as Error)?.message ?? e).slice(0, 80) });
    }
    onProgress({ done: results.length, total: jobs.length });
    if (performance.now() - last > 80) { await new Promise((r) => setTimeout(r, 0)); last = performance.now(); }
  }
  return results;
}
