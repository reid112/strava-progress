# Strava export → progress page

Drop the zip Strava emails you into a web page and get a personal progress report: how far you've come, records, volume, habits, the other sports, and a projection of where it could go. Works with your Strava export. Not affiliated with Strava.

## Nothing leaves your browser

The export holds your email, weight, GPS traces of your home and heart-rate data. Every step (unzipping, parsing the FIT/GPX/TCX files, aggregating, drawing) runs in your browser. There is no upload endpoint, no server, and no analytics on your activities. The app is a static folder; you can open `dist/index.html` straight from disk with the network cable pulled and it works.

The only data that ever leaves the page is what you choose to download: a PNG from "Share as image" or the aggregated JSON from "Save page data".

## Get your export

1. On strava.com open Settings → My Account → Download or Delete Your Account.
2. Under Download Request click Get Started, then Request Your Archive.
3. Strava emails a link to `export_<your id>.zip`, usually within the hour.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static folder in dist/, works from file:// and any static host
```

Deploy `dist/` to Cloudflare Pages, Netlify, Vercel, or a plain web server. No environment variables, no backend.

Dev conveniences: `?fixture` renders `reference/data.json` (the sample athlete's aggregate, kept out of git); `?zip=/absolute/path.zip` loads an export from disk.

### Scripts

| Command | What it does |
| --- | --- |
| `npx tsx scripts/parse-export.ts export.zip out.json` | Run the parser over a real export in Node, single-threaded, and save per-activity results |
| `npx tsx scripts/build-export.ts export.zip results.json data.json [--maxhr 201] [--official <id>=<seconds>]` | Aggregate saved results into the page's JSON, for diffing against a reference |
| `npx tsx scripts/make-fixtures.ts export.zip fixtures/private` | Cut synthetic edge-case exports (cyclist, manual-only, corrupt files, TCX) from a real one |
| `npx tsx scripts/e2e.ts export.zip [more.zip]` | Playwright smoke test of `dist/` in Chromium, Firefox and WebKit, from file:// and http:// (`BROWSERS=webkit` to narrow) |

## How it works

1. A small zip reader lists the archive from the File without loading it into memory. Each worker slices and inflates its own entries.
2. `activities.csv` drives everything: which activities exist, their type, distance, times, HR, cadence, gear, elevation.
3. Run and ride files are parsed in a pool of Web Workers (`navigator.hardwareConcurrency` of them). FIT via Garmin's official SDK, GPX and TCX via a small tag scanner (Workers have no DOMParser), gzip via pako. A 1,550-activity export parses in about 5 seconds in Chrome. If workers can't run (Safari opening the page from file://), parsing falls back to the main thread with the same progress bar.
4. Each run is scanned for its fastest 1K, mile, 5K, 10K, 15K, half, 30K and marathon segment using moving time (any gap between samples is capped at 15 s), the same idea as Strava's best efforts. Training runs count, not just races.
5. Everything is aggregated into one JSON object and drawn with Chart.js. Times inside runs are moving time; races show elapsed.

## Why is a record missing, or marked with an asterisk?

These rules came from real exports and each one fixed a wrong number. They are in `src/parse/process.ts` and `src/data/build.ts`.

1. **Two distance columns.** `activities.csv` has two `Distance` columns. The first is km for runs but metres for swims. The app uses the second, which is metres for everything.
2. **Timestamps are UTC.** Strava writes activity dates in UTC. The app derives each activity's timezone from its first GPS fix (an offline lookup), falls back to the athlete's most common zone, then to your browser's, before working out day of week, start hour and the daily heatmap. A run in another timezone gets its true local hour.
3. **Multisport files.** Strava splits a triathlon into swim, bike and run activities, but each one's file can be the whole day's recording. When the parsed track is more than 1.5× the CSV distance, the app cuts it to this activity's leg: by the FIT session message for that sport if present, else by the per-record activity type, else the trailing `Elapsed Time` seconds.
4. **Corrected distances.** If you edited a run's distance in Strava (treadmill, bad GPS), the file and the CSV disagree by more than 3%. Every effort time is scaled by file distance ÷ CSV distance, any distance the corrected run no longer covers is dropped, and the 1 km and mile efforts are dropped entirely: indoor splits under a mile are noise. Virtual Runs (Zwift and the like) lose their 1 km and mile efforts for the same reason.
5. **Plausibility floors.** Efforts faster than 1K 2:50, mile 4:40, 5K 16:00, 10K 33:00, 15K 50:00, half 1:12, 30K 1:45, marathon 2:30 are discarded as GPS spikes. For fast athletes the floor tightens to 85% of the time implied by their best whole-run average speed in the CSV, whichever is lower.
6. **Near-distance races (the asterisk).** A race recorded a little short (a half at 20.95 km because GPS cut corners) has no 21.1 km segment. If the CSV distance is within −1.5% / +3% of a target and the file produced no effort for it, the whole-run moving time is scaled to the exact distance and the result is marked `*`. Without this, races vanish from the records table.
7. **Cadence.** Garmin writes running cadence per foot (about 88). It is doubled to steps per minute, and values outside 60–120 are discarded first (one export contained 325917).
8. **Max HR.** Zones need a max. The app uses the 99.5th percentile of your per-run maxes from the CSV, which skips the obvious spikes. You can override it on the Progress tab; the zones and the easy-run band recompute without re-parsing.
9. **VDOT.** Jack Daniels' race-fitness number, computed with the formulas from *Daniels' Running Formula*. The quarterly fitness series is the best VDOT among all efforts of 5K or longer in that quarter.
10. **Official times (the dagger).** In the "Confirm your races" step you can type the official chip time for a race. It replaces the watch's effort for that distance and is marked `†`. Confirmations are saved in your browser per athlete, so a re-upload remembers them.

## The projection

The "Where this goes" tab needs at least 8 quarters with a 5K-or-longer effort, 4 of them in the last 8; otherwise it shows the current fitness and equivalent times only. The trend is a linear fit on the trailing-four-quarter maximum, from the start of the current consistent block (the first quarter after the most recent gap of two or more quarters without such an effort), then decayed toward a ceiling under three scenarios. Training hours scale the rate by √(hours ÷ your two-year average). Marathon times carry +1.5%. The tab shows the fitted window, and an "About this model" panel has the details.

## Layout

```
src/parse/    zip entry → streams → best efforts (runs in the worker)
src/data/     zip reader, CSV, timezone, VDOT, build.ts (aggregation)
src/ui/       landing, progress, race confirmation, report tabs, projection, copy
scripts/      Node harnesses: parse, build, fixtures, e2e
reference/    the one-athlete prototype this generalises (data.json is gitignored)
```
