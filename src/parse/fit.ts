import { Decoder, Stream } from '@garmin/fitsdk';
import type { Session, Streams } from './types';

const SEMI = 180 / 2 ** 31;

interface FitRecord {
  timestamp?: Date;
  distance?: number;
  heartRate?: number;
  cadence?: number;
  power?: number;
  activityType?: string | number;
  positionLat?: number;
  positionLong?: number;
}
interface FitSession {
  sport?: string;
  startTime?: Date;
  totalElapsedTime?: number;
  totalDistance?: number;
}

/** Decode a (already inflated) FIT file into streams. Mirrors `streams_fit` in the reference. */
export function streamsFit(bytes: Uint8Array): Streams {
  const stream = Stream.fromByteArray(bytes);
  const decoder = new Decoder(stream);
  if (!decoder.isFIT()) throw new Error('not a FIT file');
  const { messages, errors } = decoder.read({
    convertTypesToStrings: true,
    includeUnknownData: false,
    mergeHeartRates: true,
    expandComponents: true,
  });
  const records = (messages.recordMesgs ?? []) as FitRecord[];
  if (!records.length && errors.length) throw new Error(String(errors[0]));

  const t: number[] = [], d: number[] = [];
  const hr: (number | null)[] = [], cad: (number | null)[] = [], pw: (number | null)[] = [];
  const actType: (string | null)[] = [];
  let hasActType = false;
  let t0: number | null = null;
  let pos0: [number, number] | null = null;
  for (const r of records) {
    const ts = r.timestamp, dist = r.distance;
    if (ts == null || dist == null) continue;
    const ms = ts.getTime();
    if (t0 === null) t0 = ms;
    t.push((ms - t0) / 1000);
    d.push(dist);
    hr.push(r.heartRate ?? null);
    cad.push(r.cadence ?? null);
    pw.push(r.power ?? null);
    const at = r.activityType;
    if (at != null) hasActType = true;
    actType.push(at == null ? null : String(at));
    if (!pos0 && r.positionLat != null && r.positionLong != null) {
      pos0 = [r.positionLat * SEMI, r.positionLong * SEMI];
    }
  }
  const sessions: Session[] = ((messages.sessionMesgs ?? []) as FitSession[])
    .filter((s) => s.startTime && s.totalElapsedTime != null)
    .map((s) => ({
      sport: String(s.sport ?? 'unknown'),
      start: s.startTime!.getTime(),
      elapsed: s.totalElapsedTime!,
      distance: s.totalDistance ?? 0,
    }));
  return {
    t, d, hr, cad, pw, pos0,
    sessions: sessions.length ? sessions : undefined,
    actType: hasActType ? actType : undefined,
    epoch0: t0 ?? undefined,
  };
}
