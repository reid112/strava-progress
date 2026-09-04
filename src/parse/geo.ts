const R = 6371000;
const P = Math.PI / 180;

/** Great-circle distance in metres. Same constants as the reference. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a =
    Math.sin(((lat2 - lat1) * P) / 2) ** 2 +
    Math.cos(lat1 * P) * Math.cos(lat2 * P) * Math.sin(((lon2 - lon1) * P) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
