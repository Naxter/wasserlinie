# Wasserlinie

![Germany's river network as glowing veins on dark terrain](docs/hero.png)

Germany's river network as a living map, coloured by how unusual the water is
**for each gauge**. A raw "312 cm" tells you nothing; the same reading placed
against that gauge's own mean low water, mean water and record levels tells
you at a glance whether a river is running dry. Rivers below their mean low
water turn ochre and slow down, normal water stays turquoise, high water goes
red and quickens. Drag the time slider and the whole network moves with it;
push past "now" and it becomes a forecast, visibly softer the further it goes.

[![CI](https://github.com/Naxter/wasserlinie/actions/workflows/ci.yml/badge.svg)](https://github.com/Naxter/wasserlinie/actions/workflows/ci.yml)
![MIT license](https://img.shields.io/badge/license-MIT-green)
![Node 22+](https://img.shields.io/badge/node-22%2B-brightgreen)
![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue)

![Station panel for Koblenz with measured levels and the forecast band](docs/station.png)

## What it does

- **A scale you can read.** Every reading is placed on the gauge's own named
  levels — record low, mean low water, mean water, mean high water, record
  high — so gauges are comparable without pretending a centimetre means the
  same thing everywhere. The status line counts how many gauges sit outside
  their normal band right now, and clicking a count filters the map to them.
- **Rivers that carry data.** ~2,500 river parts from the official German
  topographic model, drawn on real terrain. The parts that have gauges are
  driven by measurements: the level between neighbouring gauges is
  interpolated along the river, and the shader turns it into colour, glow and
  pulse speed. Line width stays absolute, so the Rhine still looks like the
  Rhine at low water.
- **Grey means we do not know.** Of ~700 PEGELONLINE stations, only those that
  publish enough long-term statistics get a colour. Tidal gauges are left out
  on purpose: a level between two tides says where the tide is, not whether
  anything is wrong.
- **Time is physical.** One slider covers the stored history plus 72 hours
  ahead. The sun follows it, so scrubbing moves the terminator across the
  country.
- **Forecast that looks like a forecast, and admits what it knows.** A small
  gradient-boosting model produces p10/p50/p90 per station, with the band
  widened until it actually covers 80 % of observations in a hindcast. On the
  map the future is haze-coloured and soft; the wider the band, the softer the
  line. Measured skill and its limits: [docs/forecast-skill.md](docs/forecast-skill.md).
- **No servers.** The pipeline writes Parquet and JSON files; the browser
  queries the Parquet directly with DuckDB-WASM. Static hosting is enough.
- **No satellite imagery, no ion token.** Terrain and a hand-made hillshade
  come from public elevation tiles, rendered in the browser.

## How it is built

```text
pipeline/  Python                        public/data/            src/  TypeScript + Cesium
─────────────────────────────────        ──────────────────      ─────────────────────────────
PEGELONLINE ─ fetch ─────────────────▶   stations.json           scene/   terrain, relief, camera,
              (hourly means, 90 d)       levels.parquet ───────▶          post-processing, clock
BKG DLM1000 ─ rivers ────────────────▶   rivers.json    ───────▶ layers/  rivers (GLSL field),
              (axes + polygon skeleton)                                    gauges (billboards)
levels ────── forecast (GBM p10/50/90) ▶ forecast/*.parquet ───▶ data/    DuckDB-WASM, timeline
all ────────── field (interpolate) ────▶ field.bin + field.json ▶ ui/     React panels, time bar
```

The one rule that matters: React never touches a GPU buffer. The UI reads
and writes a small store; the scene subscribes to it. How the pieces fit,
what runs per frame and where Cesium objects are created and destroyed:
[docs/architecture.md](docs/architecture.md).

Rivers with gauges each get a tiny texture — position along the river on one
axis, time on the other, three bytes per cell (level index, measured or
forecast, forecast spread). The fragment shader samples it at the slider's
time. Interpolating between gauges happens once, in Python, not per frame.

## Quickstart

The repository ships a data snapshot, so the app runs without any credentials.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Terrain tiles stream from AWS on first view.

## Refreshing the data

The pipeline lives in `pipeline/` and needs Python 3.11+.

```bash
cd pipeline
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m wasserlinie all
```

`all` runs four steps, each usable on its own:

| Step       | What it does                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------- |
| `fetch`    | Stations and 15-minute readings from PEGELONLINE → hourly `levels.parquet`, `stations.json`. Merges with earlier runs and keeps 90 days. |
| `rivers`   | Downloads BKG DLM1000 (56 MB, cached), merges river axes, skeletonises wide rivers that only exist as polygons, snaps gauges onto them → `rivers.json`, `germany.json`. |
| `forecast` | Trains three quantile GBMs on all inland stations at once, calibrates the band against held-out hours and writes a run into `forecast/` plus `manifest.json`. |
| `field`    | Interpolates levels along every gauged river for each 6-hour step → `field.bin`, `field.json`.        |
| `backtest` | Not part of `all`: retrains on a held-out split and rewrites `docs/forecast-skill.md`. |

PEGELONLINE only serves about a month of history per request; the 90-day
window fills up by running `fetch` daily. The included
[workflow](.github/workflows/data.yml) does that every morning and commits
the snapshot. Point the app at a different data location with
`VITE_DATA_URL` — see `.env.example`.

Formats are documented in [docs/data.md](docs/data.md).

## Honesty notes

- The forecast knows only the recent shape of each level curve. No rainfall,
  no upstream routing. A hindcast on unseen data puts its median error at
  6–17 cm and shows it beating "assume the level stays put" clearly only in
  the first few hours; past that it roughly matches it. The p10–p90 band is
  calibrated to cover 80 %, and does. Full numbers in
  [docs/forecast-skill.md](docs/forecast-skill.md).
- Tidal gauges get no forecast. The model has no tide features, so on the
  coast it was wrong by about a metre; showing that would have been worse than
  showing nothing.
- The colour scale is long-term but **not seasonal**: low water in August
  counts the same as low water in March. A seasonal comparison would need each
  gauge's own history across many years, and that does not exist openly for
  this network — PEGELONLINE serves about a month, and CAMELS-DE, the one open
  multi-year German archive, covers state catchment gauges and matches only 15
  of these 691 stations. See [docs/data.md](docs/data.md).
- Roughly half the stations stay grey: 219 publish no long-term marks at all
  and 98 are tidal. They are still clickable and still show their measured
  curve, they just get no verdict.
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
- Terrain: [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) — Mapzen, SRTM, EU-DEM and others.
- Rendering: [CesiumJS](https://cesium.com/platform/cesiumjs/); Parquet in the browser: [DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview).

## License

MIT — see [LICENSE](LICENSE).
