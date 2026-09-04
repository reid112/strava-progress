import type { JobMsg, ResultMsg } from './worker';
import type { WorkerResult } from './types';
// Inlined so the built page also works from file://, where Chrome refuses to load worker scripts.
import ParseWorker from './worker?worker&inline';

export type JobSpec = Omit<JobMsg, 'type'>;

export interface Progress { done: number; total: number }

/** Fan the jobs out over `navigator.hardwareConcurrency` workers. Results come back in any order. */
export function runPool(blob: Blob, jobs: JobSpec[], onProgress: (p: Progress) => void, size = navigator.hardwareConcurrency || 4): Promise<WorkerResult[]> {
  const n = Math.max(1, Math.min(size, jobs.length));
  const results: WorkerResult[] = [];
  let next = 0, done = 0;
  return new Promise((resolve, reject) => {
    if (!jobs.length) return resolve([]);
    const workers: Worker[] = [];
    const finish = () => { workers.forEach((w) => w.terminate()); resolve(results); };
    const feed = (w: Worker) => {
      if (next >= jobs.length) return;
      const j = jobs[next++];
      const msg: JobMsg = { type: 'job', ...j };
      w.postMessage(msg);
    };
    for (let i = 0; i < n; i++) {
      const w = new ParseWorker();
      workers.push(w);
      w.onerror = (e) => { workers.forEach((x) => x.terminate()); reject(new Error(e.message)); };
      w.onmessage = (e: MessageEvent<ResultMsg>) => {
        results.push(e.data.result);
        done++;
        onProgress({ done, total: jobs.length });
        if (done === jobs.length) finish();
        else feed(w);
      };
      w.postMessage({ type: 'init', blob });
      feed(w);
    }
  });
}
