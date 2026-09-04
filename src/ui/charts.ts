import Chart from 'chart.js/auto';

export const C = { canola: '#E4B31F', canolaDeep: '#B98A0C', sky: '#2C6E9E', skySoft: '#CFE0EC', slate: '#7A8894', ink: '#14213D', swim: '#3AA6A0', strength: '#8E7CC3', other: '#C5CCD3', wheat: '#C9A96E', line: '#D9DEE4' };
export const gridOpt = { color: '#E6EAEE' };
export const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

Chart.defaults.font.family = 'Barlow, Helvetica Neue, Arial, sans-serif';
Chart.defaults.font.size = 13;
Chart.defaults.color = '#4A5568';
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.boxHeight = 12;
if (reduced) Chart.defaults.animation = false;

const charts: Record<string, Chart> = {};
export function mk(id: string, cfg: any): Chart | null {
  const el = document.getElementById(id) as HTMLCanvasElement | null;
  if (!el) return null;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(el, cfg);
  return charts[id];
}
export function destroyAll() { for (const k of Object.keys(charts)) { charts[k].destroy(); delete charts[k]; } }

/** Wheat → sky gradient across the athlete's years. */
export function yearColorFn(y0: number, y1: number) {
  const span = Math.max(1, y1 - y0);
  return (y: number) => {
    const t = Math.min(1, Math.max(0, (y - y0) / span));
    const a = [201, 169, 110], b = [44, 110, 158];
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
}
/** Fractional year of a YYYY-MM-DD, for linear time axes. */
export const dy = (d: string) => { const t = new Date(d + 'T12:00:00'); return t.getFullYear() + (t.getTime() - new Date(t.getFullYear(), 0, 1).getTime()) / 31557600000; };
export const qt = (q: string) => +q.slice(0, 4) + (+q.slice(5) - 1) / 4 + 0.125;
