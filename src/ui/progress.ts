export interface ProgressView { set(done: number, total: number, label?: string): void; status(text: string): void }

export function renderProgress(root: HTMLElement): ProgressView {
  root.innerHTML = `<div class="progress"><h2>Reading your export</h2><p class="status" id="p-status">Opening the zip…</p><div class="bar-wrap"><div class="bar-fill" id="p-bar"></div></div><p class="note" id="p-sub"></p></div>`;
  const bar = root.querySelector('#p-bar') as HTMLElement, status = root.querySelector('#p-status') as HTMLElement, sub = root.querySelector('#p-sub') as HTMLElement;
  return {
    set(done, total, label) {
      bar.style.width = total ? `${(done / total * 100).toFixed(1)}%` : '0%';
      status.textContent = `${label ?? 'Reading'} ${total.toLocaleString()} activities… ${done.toLocaleString()} done`;
    },
    status(text) { sub.textContent = text; },
  };
}
