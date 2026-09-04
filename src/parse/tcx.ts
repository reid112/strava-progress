import { haversine } from './geo';
import type { Streams } from './types';
import { blocks, num, parseTime, text } from './xml';

/**
 * TCX → streams. Uses the file's own DistanceMeters when every point has one
 * (Garmin writes it from the device's odometer), otherwise haversine like GPX.
 */
export function streamsTcx(xml: string): Streams {
  const t: number[] = [], dFile: (number | null)[] = [], dHav: number[] = [];
  const hr: (number | null)[] = [], cad: (number | null)[] = [], pw: (number | null)[] = [];
  let t0: number | null = null;
  let cum = 0;
  let prev: [number, number] | null = null;
  let pos0: [number, number] | null = null;
  let allHaveDist = true;
  for (const [, inner] of blocks(xml, 'Trackpoint')) {
    const ms = parseTime(text(inner, 'Time'));
    if (ms === null) continue;
    const lat = num(inner, 'LatitudeDegrees'), lon = num(inner, 'LongitudeDegrees');
    const dm = num(inner, 'DistanceMeters');
    if (dm === null) allHaveDist = false;
    if (lat !== null && lon !== null) {
      if (prev) cum += haversine(prev[0], prev[1], lat, lon);
      prev = [lat, lon];
      if (!pos0) pos0 = [lat, lon];
    } else if (dm === null) continue; // neither position nor distance: nothing to place this sample at
    if (t0 === null) t0 = ms;
    t.push((ms - t0) / 1000);
    dFile.push(dm);
    dHav.push(cum);
    const h = num(inner, 'Value'); // <HeartRateBpm><Value>
    hr.push(h);
    const rc = num(inner, 'RunCadence');
    cad.push(rc ?? num(inner, 'Cadence'));
    pw.push(num(inner, 'Watts'));
  }
  const d = allHaveDist && dFile.length ? (dFile as number[]) : dHav;
  return { t, d, hr, cad, pw, pos0, epoch0: t0 ?? undefined };
}
