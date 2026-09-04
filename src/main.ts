import './fonts';
import './legacy/report.css';
import { start, load } from './app';
import { renderReport } from './ui/report';

async function main() {
  const q = new URLSearchParams(location.search);
  // Dev conveniences: ?fixture renders reference/data.json, ?zip=<path> loads an export from disk via Vite's /@fs route.
  if (import.meta.env.DEV && q.has('fixture')) {
    const D = await (await fetch('/reference/data.json')).json();
    D.meta ??= { athlete_id: '', first_name: '', weight_kg: null, city: '', tz: 'America/Regina', tz_source: 'gps', max_hr: 201, max_hr_source: 'derived', files_total: 997, files_failed: 0, files_missing: 0, trimmed_multisport: 3, scaled_distance: 87, floors: {}, easy_hr: [135, 158], primary_sport: 'run', restarts: 3, restart_dates: ['2017-04-26', '2021-03-30', '2024-04-01'], low_years: [2019, 2023], peak_hour: 11, peak_dow: 2, export_date: '2026-08-27' };
    D.weekly_bike ??= []; D.longest_rides ??= [];
    renderReport(document.getElementById('app')!, D, { onEditRaces() {}, onStartOver() {}, onMaxHr() {} });
    return;
  }
  if (import.meta.env.DEV && q.has('zip')) {
    const res = await fetch('/@fs' + q.get('zip'));
    const blob = await res.blob();
    void load(new File([blob], 'export.zip', { lastModified: Date.now() }));
    return;
  }
  start();
}
void main();
