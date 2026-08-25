# Wasserlinie

![Germany's river network coloured by how unusual each gauge is](docs/hero.png)

Germany's river network as a living map, coloured by how unusual the water is
**for each gauge**. A raw "312 cm" tells you nothing; the same reading placed
against that gauge's own mean low water, mean water and record levels tells
you at a glance whether a river is running dry. Warm means the water is
leaving — sand, amber, then the red of a record low. Cool means it is rising.
Normal is the least saturated point on the scale, so a quiet country recedes
and anything unusual saturates, in either direction and by the same amount.
Drag the time slider and the whole network moves with it;
push past "now" and it becomes a forecast, visibly softer the further it goes.

[![CI](https://github.com/Naxter/wasserlinie/actions/workflows/ci.yml/badge.svg)](https://github.com/Naxter/wasserlinie/actions/workflows/ci.yml)
![MIT license](https://img.shields.io/badge/license-MIT-green)
![Node 22+](https://img.shields.io/badge/node-22%2B-brightgreen)
![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue)

![Station panel for Koblenz with measured levels and the forecast band](docs/station.png)

## What it does

- **A scale you can read, for the time of year.** Every reading is placed
  against what that gauge has actually done around this date since 2000 — a
  ±15-day window across 27 years of its own record. Low water in August is
  judged against other Augusts, not against March. Gauges whose archive cannot
  carry that fall back to their published marks (record low, mean low water,
  mean water, mean high water, record high), and the app says which of the two
  it used.
- **A list of what is actually happening.** Every gauge outside its normal band,
  worst first, each against the mark it is judged by. Click one to fly to it;
  the counts in the header filter the map to the dry or the wet ones.
- **Rivers that carry data.** ~2,500 river parts from the official German
  topographic model. The parts that have gauges are driven by measurements: the
  level between neighbouring gauges is interpolated along the river and drawn as
  a gradient down it. Line width follows the river's size, not its water, so the
  Rhine still looks like the Rhine at low water.
- **Grey means we do not know.** Of the 691 PEGELONLINE stations, 443 get a
  colour. The rest stay grey on purpose: 98 tidal gauges, where a level between
  two tides says where the tide is rather than whether anything is wrong, and
  150 with neither a usable archive nor usable marks.
- **Time, and only time.** One slider covers the stored history plus 72 hours
  ahead. Nothing else changes as it moves — no light, no motion — so the same
  river on two different days can be compared.
- **Forecast that looks like a forecast, and admits what it knows.** A small
  gradient-boosting model produces p10/p50/p90 per station, with the band
  widened until it actually covers 80 % of observations in a hindcast. On the
  map the future is haze-coloured and soft; the wider the band, the softer the
  line. Measured skill and its limits: [docs/forecast-skill.md](docs/forecast-skill.md).
- **No servers.** The pipeline writes Parquet and JSON files; the browser
  reads the Parquet directly with hyparquet. Static hosting is enough.
- **No basemap, no tiles, no key.** The map is the country outline, the river
  network and the gauges, all from the pipeline's own files. Nothing is fetched
  from a tile server, so there is no account and no quota.

## How it is built

```text
pipeline/  Python                        public/data/            src/  TypeScript + MapLibre
─────────────────────────────────        ──────────────────      ─────────────────────────────
PEGELONLINE ─ fetch ─────────────────▶   stations.json           map/     style, camera, clock,
              (hourly means, 90 d)       levels.parquet ───────▶          rivers, gauges
BKG DLM1000 ─ rivers ────────────────▶   rivers.json    ───────▶ color/   the anomaly ramp
              (axes + polygon skeleton)  germany.json
levels ────── forecast (GBM p10/50/90) ▶ forecast/*.parquet ───▶ data/    hyparquet, timeline
history ───── seasonal reference ──────▶ seasonal.parquet ─────▶ ui/      React panels, time bar
```

The one rule that matters: React never touches a GPU buffer. The UI reads
and writes a small store; the map subscribes to it. How the pieces fit and
where map objects are created and destroyed:
[docs/architecture.md](docs/architecture.md).

Nothing runs per frame. There is no animation to drive, so a repaint happens
only when the clock moves: each gauged river gets its own layer, and its colour
is a gradient rebuilt from the states of the gauges along it.

## Quickstart

The data is not in the repository — it is rebuilt from public sources, so the
first step is to fetch it. You need Node 22+ and Python 3.11+; no accounts and
no API keys.

```bash
cd pipeline
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m wasserlinie all
```

That writes everything the app needs into `public/data/`. It takes a few
minutes, most of it a one-off 56 MB download of the river geometry. Then:

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Everything the map draws is local. If you start
the app before the pipeline has run, it says so and tells you what to run.

## The pipeline

`all` runs four steps, each usable on its own:

| Step       | What it does                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `fetch`    | Stations and 15-minute readings from PEGELONLINE → hourly `levels.parquet`, `stations.json`. Merges with earlier runs and keeps 90 days. |
| `rivers`   | Downloads BKG DLM1000 (56 MB, cached), merges river axes, skeletonises wide rivers that only exist as polygons, snaps gauges onto them → `rivers.json`, `germany.json`. |
| `forecast` | Trains three quantile GBMs on all inland stations at once, calibrates the band against held-out hours and writes a run into `forecast/` plus `manifest.json`. |
| `field`    | Interpolates levels along every gauged river for each 6-hour step → `field.bin`, `field.json`.        |

Two more are deliberately outside `all`, because each is a long job you run
when you mean to:

| Step       | What it does                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `history`  | Downloads every gauge's readings back to 1 January 2000 through PEGELONLINE's archive and derives `seasonal.parquet` — what counts as normal *for this time of year*. Several hours for all 691 gauges, and the server slows down the longer it runs. Cached per gauge, so it resumes where it stopped and a second run is free. |
| `backtest` | Retrains on a held-out split and rewrites [docs/forecast-skill.md](docs/forecast-skill.md).           |

`fetch` keeps the rolling 90-day window topped up and is meant to run daily —
the REST API only answers for about the last month.

To deploy, run the pipeline wherever you like, put `public/data/` behind a URL
and build with `VITE_DATA_URL` pointing at it (see `.env.example`). Keeping the
data out of the repository is deliberate: it changes every day and would bloat
the history for nothing.

Formats are documented in [docs/data.md](docs/data.md).

## Honesty notes

- The forecast knows only the recent shape of each level curve. No rainfall,
  no upstream routing. A hindcast on unseen data puts its median error at
  3–9 cm and shows it beating "assume the level stays put" without interruption
  only out to +9 h; past that it is a coin toss, negative at 8 of the 24 lead
  times. The p10–p90 band is calibrated to cover 80 %, and does. Full numbers in
  [docs/forecast-skill.md](docs/forecast-skill.md).
- The 26 years of archive do not feed the forecast. They are daily means, and
  the model reads hourly steps; they set what counts as normal for a date, not
  what happens in the next three days.
- Tidal gauges get no forecast. The model has no tide features, so on the
  coast it was wrong by about a metre; showing that would have been worse than
  showing nothing.
- The seasonal scale covers 432 of the 691 gauges; 11 more are judged against
  year-round marks, which cannot tell a dry August from a dry March. The panel
  says which one a gauge got, and never claims "for this time of year" without
  a reference within 15 days of the date.
- The archive is raw, unvalidated data. A few gauges carry scale errors in it —
  one jumps by a factor of a hundred between eras — and a few tidal gauges
  publish no tide marks to identify themselves by. Both are filtered out by
  what the numbers do rather than by what they are labelled; see
  [docs/data.md](docs/data.md).
- Grey stations are still clickable and still show their measured curve, they
  just get no verdict.
- River geometry is 1:1,000,000. Close up, lines can drift a few hundred
  metres from the actual water.

## Development

```bash
npm run typecheck
npm run lint
npm test
npm run build

cd pipeline && ruff check . && pytest
```

## Data sources and credits

- Water levels: [PEGELONLINE](https://www.pegelonline.wsv.de) — WSV, free for reuse.
- River network and country outline: [BKG DLM1000 and VG2500](https://gdz.bkg.bund.de) — © GeoBasis-DE / BKG 2025, [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0).
- Rendering: [MapLibre GL JS](https://maplibre.org/); Parquet in the browser: [hyparquet](https://github.com/hyparam/hyparquet).

## License

MIT — see [LICENSE](LICENSE).
