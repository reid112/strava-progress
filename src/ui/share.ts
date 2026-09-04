/**
 * Phase 3: "Share as image". Draws the year strip and the monthly chart onto one
 * canvas and downloads a PNG. No server, no external assets.
 */
import type { DataJson } from '../data/types';
import { distR, fmt, n } from './format';
import { title, lede } from './copy';
import { yearColorFn } from './charts';

export async function shareImage(D: DataJson) {
  const W = 1200, pad = 48;
  const bike = D.meta.primary_sport === 'bike';
  const yrs = D.yearly;
  const key = bike ? 'bike_km' : 'run_km';
  const H = 640;
  const c = document.createElement('canvas');
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2);
  await document.fonts.ready;
  g.fillStyle = '#F2F4F6'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#14213D';
  g.font = '600 56px "Barlow Semi Condensed", "Arial Narrow", Arial, sans-serif';
  g.fillText(title(D), pad, pad + 52);
  g.font = '400 20px Barlow, "Helvetica Neue", Arial, sans-serif';
  g.fillStyle = '#4A5568';
  wrap(g, lede(D), pad, pad + 90, W - pad * 2, 27);

  // year strip
  const top = 190, colW = (W - pad * 2) / yrs.length, maxkm = Math.max(1, ...yrs.map((y) => y[key]));
  const yc = yearColorFn(yrs[0].year, yrs[yrs.length - 1].year);
  g.strokeStyle = '#14213D'; g.lineWidth = 2; g.beginPath(); g.moveTo(pad, top); g.lineTo(W - pad, top); g.stroke();
  yrs.forEach((y, i) => {
    const x = pad + i * colW;
    g.fillStyle = '#14213D'; g.font = '700 22px "Barlow Semi Condensed", Arial, sans-serif'; g.fillText(String(y.year), x + 6, top + 30);
    g.fillStyle = yc(y.year); g.fillRect(x + 6, top + 40, Math.max(3, (colW - 14) * y[key] / maxkm), 6);
    g.fillStyle = '#B98A0C'; g.font = '600 17px "Barlow Semi Condensed", Arial, sans-serif'; g.fillText(distR(y[key]), x + 6, top + 68);
    g.fillStyle = '#4A5568'; g.font = '400 13px Barlow, Arial, sans-serif';
    const b = D.best_by_year['5k']?.[y.year];
    g.fillText(bike ? `${y.rides} rides` : `${y.runs} runs`, x + 6, top + 88);
    if (!bike && b) g.fillText(`5K ${fmt(b.t)}`, x + 6, top + 105);
  });

  // monthly bars
  const mo = D.monthly, cx0 = pad, cy1 = H - pad - 24, ch = 220, bw = (W - pad * 2) / mo.length;
  const mmax = Math.max(1, ...mo.map((m) => (bike ? m.bike_km : m.run_km)));
  g.fillStyle = '#4A5568'; g.font = '600 15px "Barlow Semi Condensed", Arial, sans-serif';
  g.fillText(`${bike ? 'Kilometres ridden' : 'Kilometres run'} per month`, pad, cy1 - ch - 14);
  mo.forEach((m, i) => {
    const v = bike ? m.bike_km : m.run_km, h = ch * v / mmax;
    g.fillStyle = yc(+m.m.slice(0, 4)); g.fillRect(cx0 + i * bw, cy1 - h, Math.max(1, bw - 1), h);
    if (m.m.endsWith('-01')) { g.fillStyle = '#4A5568'; g.font = '400 12px Barlow, Arial, sans-serif'; g.fillText(m.m.slice(0, 4), cx0 + i * bw, cy1 + 16); }
  });
  g.fillStyle = '#7A8894'; g.font = '400 12px Barlow, Arial, sans-serif';
  g.fillText(`${n(D.totals.activities)} activities · from a Strava export · nothing left the browser`, pad, H - 16);

  const url = c.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `strava-progress-${D.last}.png`; a.click();
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); line = w; y += lh; } else line = t;
  }
  if (line) g.fillText(line, x, y);
}
