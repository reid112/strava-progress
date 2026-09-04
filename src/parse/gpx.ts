import { haversine } from './geo';
import type { Streams } from './types';
import { attr, blocks, num, parseTime, text } from './xml';

/** GPX track → streams. Mirrors `streams_gpx` in the reference: cumulative haversine, hr/cad from extensions. */
export function streamsGpx(xml: string): Streams {
  const t: number[] = [], d: number[] = [];
  const hr: (number | null)[] = [], cad: (number | null)[] = [], pw: (number | null)[] = [];
  let t0: number | null = null;
  let cum = 0;
  let prev: [number, number] | null = null;
  let pos0: [number, number] | null = null;
  for (const [attrs, inner] of blocks(xml, 'trkpt')) {
    const ms = parseTime(text(inner, 'time'));
    if (ms === null) continue;
    const lat = attr(attrs, 'lat'), lon = attr(attrs, 'lon');
    if (lat === null || lon === null) continue;
    if (t0 === null) t0 = ms;
    if (prev) cum += haversine(prev[0], prev[1], lat, lon);
    prev = [lat, lon];
    if (!pos0) pos0 = [lat, lon];
    t.push((ms - t0) / 1000);
    d.push(cum);
    hr.push(num(inner, 'hr'));
    cad.push(num(inner, 'cad'));
    pw.push(num(inner, 'power'));
  }
  return { t, d, hr, cad, pw, pos0, epoch0: t0 ?? undefined };
}
