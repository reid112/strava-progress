# Build "Strava export → progress page" as a browser-only web app

## What we're building

A static web app where anyone drops in their Strava bulk-export zip (the `export_<id>.zip` Strava emails you from Settings → My Account → Download or Delete Your Account → Get Started) and gets an interactive, personal progress page: how far they've come, records, volume, habits, multisport, and a projection of where they could go.

A working prototype of the *output* already exists for one athlete. It is in `reference/`. Your job is to turn that one-off into a generic app. **Read everything in `reference/` before writing any code.** The data-cleaning rules in there took real iteration to get right and must survive the port.

## Hard constraint: nothing leaves the browser

The export contains email, weight, GPS traces of the user's home, and heart-rate data. All parsing, aggregation and rendering happens client-side. No upload endpoint, no analytics on activity data, no server. The app deploys as a static folder (Cloudflare Pages / Netlify / Vercel). The landing page says this plainly.

The only optional network call is a future "write my captions" step (see Phase 3), and it sends aggregates only, never raw activities. Build v1 without it.

## Stack

- Vite + TypeScript, plain DOM (no framework needed; the reference page is vanilla JS and works). If you strongly prefer a framework, Svelte is fine; don't reach for React by default.
- `jszip` for the archive.
- FIT parsing: `@garmin/fitsdk` (official) or `fit-file-parser`. Pick the one that handles `.fit.gz` after `pako` inflate cleanly and exposes `record` messages with `timestamp`, `distance`, `heart_rate`, `cadence`, `power`, `activity_type`. Prototype both on the sample data before committing.
- GPX: parse with `DOMParser`; compute cumulative distance with haversine (see `streams_gpx` in `reference/parse_runs.py`). Pull `hr` and `cad` from the Garmin TrackPointExtension.
- TCX: same idea as GPX; the reference skipped it — support it.
- Chart.js 4 (already used by the reference page). Bundle it; don't load from a CDN.
- Web Workers for parsing. A 1,500-activity export took ~15 minutes single-threaded in Python; target under 3 minutes in JS with a worker pool of `navigator.hardwareConcurrency` workers.

## Reference files

- `reference/parse_runs.py` — per-activity stream parsing and the **best-efforts algorithm** (`best_efforts`): two-pointer scan for the fastest 1K / 1 mile / 5K / 10K / 15K / half / 30K / marathon segment in a run, using *moving time* (cap any gap between samples at 15 s). Port this exactly.
- `reference/build_data.py` — the aggregation from per-activity results + `activities.csv` into the `data.json` shape the page consumes. Port the shape; it's what the page expects. Also contains the data-quality rules below.
- `reference/template.html` — the page. `__DATA__` is where the JSON gets injected. Reuse the layout, charts, palette, and copy structure. Replace `<script src="…chart.umd…">` with a bundled import.
- `reference/data.json` — the aggregated output for the sample athlete (~9 years, 1,011 runs). Use it as a fixture: the page must render identically from it before you touch the parser.
- `reference/run_chunk.py` — ignore; it was a workaround for sandbox timeouts.

## Data-quality rules (all learned the hard way — keep every one)

1. **Distance column.** `activities.csv` has two `Distance` columns. The first is km for runs but *metres* for swims; the second (`Distance.1`) is metres for everything. Use `Distance.1`.
2. **Timestamps are UTC.** `Activity Date` in the CSV is UTC. Derive the local timezone from the first GPS fix in the FIT/GPX files (lat/lon → timezone via a small offline lookup like `tz-lookup`) rather than hard-coding. Fall back to the browser's timezone. Apply it before computing day-of-week, hour-of-day, and the daily heatmap.
3. **Multisport files.** Strava splits a triathlon into Swim / Bike / Run activities, but each one's FIT file can be the *entire* day's recording (the sample's "70.3 Run" file is 111 km / 5h46). Detect: parsed distance > 1.5× the CSV distance. Fix: keep only records where `activity_type === 'running'` if the field exists; otherwise keep only the trailing `Elapsed Time` seconds of the file, and re-zero time and distance.
4. **Treadmill / corrected distances.** When the user edited the distance in Strava, the CSV distance and the stream distance disagree by more than 3%. Scale every best-effort time by `stream_dist / csv_dist`, drop any target the corrected distance no longer covers, and **exclude 1K and 1-mile efforts from these runs entirely** (indoor/GPS-noisy 1K splits are unreliable and produced impossible records before this rule).
5. **Plausibility floors.** Discard efforts faster than: 1K 2:50, 1 mi 4:40, 5K 16:00, 10K 33:00, 15K 50:00, half 1:12, 30K 1:45, marathon 2:30. These catch GPS spikes. Make them scale if you ever detect an elite athlete (a 14:xx 5K runner will trip them) — simplest: floor = 0.85 × the athlete's own best in the CSV `Average Speed` column, whichever is lower. Document whatever you choose.
6. **Near-distance races.** If an activity's CSV distance is within −1.5% / +3% of a target (e.g. a half recorded as 20.95 km because GPS cut corners), and the stream produced no effort for that target, use `moving_time × target / distance` and flag it (`extrap`). Races otherwise vanish from the records table.
7. **Cadence** in the CSV is per-foot for Garmin runs (~88); double it to steps per minute. Discard values outside 60–120 before doubling (one 2017 activity had `325917`).
8. **HR zones** need a max HR. Use `max(Max Heart Rate)` over runs, minus obvious spikes (take the 99.5th percentile of per-run maxes). Let the user override it.
9. **VDOT.** Daniels formulas are in both reference files (`vdot()` and `timeFor()`). The quarterly fitness series = best VDOT among all efforts of 5K+ in that quarter.

## Phase 1 — port and render (do this first, ship it)

1. Scaffold the project. Bundle Chart.js and the fonts (Barlow, Barlow Semi Condensed — self-host the woff2 files; no Google Fonts request).
2. Get `reference/template.html` rendering from `reference/data.json` via an `injectData()` step. Pixel-check every tab. Only then move on.
3. Implement the zip reader: list entries, read `activities.csv`, read `profile.csv` (first name, weight, city — display first name only, never email).
4. Implement the worker pool: each worker takes `{id, filename, bytes, csvDistance, elapsed}` and returns the same result object shape as `process()` in `parse_runs.py` (`id, n, dist, be, hr_avg, hr_max, cad_avg, pw_avg, zones`). Handle `.fit`, `.fit.gz`, `.gpx`, `.gpx.gz`, `.tcx`, `.tcx.gz`.
5. Port `build_data.py` to TypeScript producing the identical JSON shape. Verify by running the port on the sample athlete's zip (the user will supply it) and diffing against `reference/data.json` — differences should be limited to the TCX/timezone improvements above.
6. Progress UI: "Reading 1,547 activities… 612 done" with a real bar. Parsing must not freeze the page.
7. Make the page generic:
   - **Hero race**: "your first year's best X vs your best X now." Choose X as the longest of {5K, 10K, half} for which the athlete has efforts in both their first full year and their most recent year. If no run history, hide the hero.
   - **Primary sport**: if run volume is below bike volume (hours), render a bike-first variant of Overview/Volume (km, hours, elevation, FTP-ish power if present) and demote the running tabs. Don't show "0 km of running" to a cyclist.
   - **Units**: km/mi toggle, persisted in `localStorage` (this is a normal web app, `localStorage` is fine here).
   - **Copy**: every caption in the reference page is hand-written for one athlete ("three restarts", "Wascana laps", "the 11 o'clock lunch run"). Replace with templated sentences computed from the data (number of restarts = gaps > 90 days with no runs; peak start hour; etc.). Keep them short and specific; never generic filler.
   - **Races**: the reference hard-codes a race-name dictionary and official times. Replace with (a) heuristic detection — activity name matches `/marathon|half|10k|5k|10 ?km|5 ?km|parkrun|race|time trial|\bTT\b|ultra|70\.3|ironman/i` **or** CSV `Type` column value equals `1` (Strava's race workout type, present in some exports) — and (b) a "Confirm your races" step after parsing: a checklist with detected candidates, ability to add/remove, and an optional official-time field per race. Persist the confirmations in `localStorage` keyed by athlete id so re-uploads remember them.
8. Empty/edge states: export with no runs; export with only manual activities (no files); activities older than the FIT `activity_type` field; corrupt files (skip, count, and report "3 files couldn't be read").

## Phase 2 — projection page, gated

Port the projection exactly (trailing-four-quarter smoothing, linear fit from the start of the current consistent block, three decay scenarios, √(hours) sensitivity, +1.5% marathon adjustment). Then gate it:

- Require ≥ 8 quarters with a race-equivalent effort (5K+) **and** ≥ 4 in the last 8. Otherwise show "Not enough race-pace history yet — the model needs about two years" with what *is* available (current VDOT and equivalent times only, no trend).
- "Start of current block" = the first quarter after the most recent gap of ≥ 2 quarters without a 5K+ effort, or the first quarter if none. Show the user which window was fitted.
- Keep the "What could make this wrong" panel. Keep the milestones. Add an "About this model" expander with the Daniels reference.

## Phase 3 — nice-to-haves (only after 1 and 2 are solid)

- Share as image: render the Overview year strip + one chart to a PNG via canvas, no server.
- Optional captions written by a language model from the aggregate JSON only (a few hundred bytes), behind an explicit opt-in that says exactly what is sent. Build the templated captions first so the app is complete without this.
- Save/restore: allow the user to download the aggregated JSON and re-open it later without re-parsing.

## Definition of done for Phase 1

- `npm run build` produces a static folder that works from `file://` and from a static host.
- The sample athlete's zip renders all six tabs with no console errors in Chrome, Firefox, Safari.
- A second, different export (ask the user for one; a cyclist's if possible) renders without hard-coded assumptions leaking through.
- README explains: what the app does, that data never leaves the browser, how to get your Strava export, how to run locally, and the data-quality rules above (users will ask why a record is "missing" or marked with an asterisk).

## How to work

- Read `reference/` first. Say what you found and what you plan before writing code.
- Commit after each numbered step. Small PR-sized diffs.
- When a rule in this prompt conflicts with something you observe in real export data, stop and tell me rather than silently picking one.
- Do not use the Strava name or logo in a way that implies affiliation. "Works with your Strava export" is fine; "Powered by Strava" is not (that's their API brand program).
