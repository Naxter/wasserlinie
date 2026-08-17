# Architecture

One page on how the parts hang together, written for the version of me that
comes back in six months.

## The shape of it

There is no server. A Python pipeline turns public APIs into static files; the
browser reads those files and renders them.

```text
pipeline/                       public/data/                 src/
  fetch     ──────────────────▶ stations.json  ────────────▶ data/    parquet → LevelStore → Timeline
            PEGELONLINE         levels.parquet
  rivers    ──────────────────▶ rivers.json    ────────────▶ map/     viewer, style, RiverLayer, GaugeLayer
            BKG DLM1000         rivers-detail.json
  forecast  ──────────────────▶ forecast/*.parquet ───────▶ color/   the anomaly ramp
  field     ──────────────────▶ field.bin + field.json ───▶ ui/      React panels (never touches the GPU)
  history   ──────────────────▶ seasonal.parquet
            PEGELONLINE archive (cache/history.parquet stays local)
  backtest  ──────────────────▶ docs/forecast-skill.md
```

Nothing in `public/data/` is committed. It is all rebuilt from public sources,
which is why the first thing a clone needs is a pipeline run.

`field.bin` is still written but **no longer read**. It baked the interpolation
between gauges into a texture because a shader could only look things up; the
line gradient does that interpolation directly now. Deleting the `field` step
is a pipeline change nobody has made yet.

## There is no basemap

The map is MapLibre, but nothing is fetched from a tile server, and there is no
style URL and no key. The whole picture is the four files the pipeline already
writes: the country outline is one polygon, the network is two line files, and
the gauges are points. What a hosted basemap would add — roads, terrain, place
names — is context this map does not read against.

The cost of that is real and worth knowing: there are no city labels and no
neighbouring countries, so Germany floats on an empty sea.

## The one rule

**React never touches a GPU buffer, and nothing in React runs per frame.**

The store (`src/store.ts`, Zustand) is the only thing both sides share. React
subscribes to it for the panels; the map subscribes to it in `LayerHost`.
Dragging the time slider writes one number into the store. React re-renders the
readout; the layers read the same number and repaint. Neither knows about the
other.

## Nothing runs per frame

The 3D build repainted every layer on Cesium's `preRender`, because the rivers
carried a travelling pulse and the sun moved with the clock. Neither exists now,
so there is nothing to animate: **colour only changes when the clock does.**

`LayerHost` (`src/map/plugin.ts`) listens to the store and coalesces onto one
animation frame, so dragging the slider across a month costs one repaint per
frame at most rather than one per store write. Each layer then quantises again
to fifteen minutes, because the readings are hourly and repainting more finely
than the data only costs work.

`runClock` (`src/map/clock.ts`) is the only other loop, and it does one thing:
advance `simTime` during playback.

## How a gauge reading becomes a colour along a river

1. `fetch` pulls 15-minute readings from PEGELONLINE and averages them to
   hourly values in `levels.parquet`, merging with what earlier runs stored.
2. `fetch` places every reading on that gauge's own scale and writes it as
   `state` — see `anomaly.py`. Where `history` has fetched the gauge's archive
   back to 2000, the scale is its own record *for this day of the year*;
   otherwise it falls back to the published year-round marks. `stations.json`
   records which in `basis` so the app never overstates the comparison.
3. `RiverLayer` gives every gauged river its own layer, filtered to that one
   feature, because `line-gradient` is a layer property and not a feature one.
4. When the clock moves, `sampleRiver` (`src/data/profile.ts`) interpolates the
   state between neighbouring gauges at 24 points along the river, `rampCss`
   turns each into a colour, and the stops become the layer's gradient.
5. Gauges are one circle each, coloured through **feature state** rather than by
   replacing the source data, so moving the clock never re-parses seven hundred
   points. Each layer caches the last colour it wrote and skips the ones that
   did not change.

The interpolation used to happen once, in Python. It happens per repaint now,
and it is cheap enough that the texture was not worth keeping.

## What happens when you drag the slider one day

- `TimeBar` writes `simTime` into the store.
- `LayerHost` schedules one repaint.
- `RiverLayer` rebuilds the gradient for each of the 74 gauged rivers.
- `GaugeLayer` asks `Timeline.sample` for each station and writes the colours
  that changed.
- The station panel re-renders because `simTime` changed; it reads the same
  `Timeline` plus the raw series from `LevelStore`.

Seeking is stateless: the same `simTime` always yields the same picture. The
light does not move, so two days can be compared against each other.

## Where map objects are born and die

| What | Created | Destroyed |
| --- | --- | --- |
| Map, style, background | `createMap` | `AppHandles.dispose` → `map.remove()` |
| Land polygon | `createMap`'s `load` handler | with the map |
| River sources and layers | `RiverLayer.load` | `RiverLayer.dispose` |
| Gauge source and layers | `GaugeLayer.load` | `GaugeLayer.dispose` |
| Store subscription | `LayerHost` constructor | `LayerHost.dispose` |

Every layer implements `VisualLayer` and gets an `AbortSignal` in `load`. If a
layer is switched off while its data is still in flight, the host aborts the
request instead of letting it land on a disposed layer.

## Which file do I touch to…

| Change | File |
| --- | --- |
| a colour, a font, camera behaviour, line widths | `src/tokens.ts` — the only place |
| how the map is put together | `src/map/style.ts` |
| how a river is coloured | `src/map/rivers.ts` |
| add a layer | implement `VisualLayer`, register it in `src/app.ts` |
| what the data means | `pipeline/wasserlinie/` and then `docs/data.md` |

## Deliberate non-choices

- **No tile server and no key.** See above. It also means the map works offline
  once the data is fetched.
- **No tilt and no rotation.** They are switched off rather than merely left
  alone: the map's job is comparing one gauge against another, and a tilted
  view makes the near half of the country larger than the far half.
- **No query engine in the browser.** An earlier version embedded DuckDB-WASM;
  it worked, but cost a 36 MB download for four trivial lookups. The parquet
  files are read directly instead.
- **No committed data.** It changes every day and would bloat the history for
  nothing. `wasserlinie all` rebuilds it in minutes.

## One trap that costs an afternoon

MapLibre loads its worker with `new URL('./maplibre-gl-worker', import.meta.url)`.
Vite's dependency pre-bundling rewrites that to a path inside `.vite/deps` that
is never written, so the worker 404s — and then **every source stays unloaded,
the canvas paints nothing at all, and no error is raised anywhere**. The map
reports a valid centre, zoom and layer list the whole time. `optimizeDeps.exclude`
in `vite.config.ts` is what stops it; do not remove it.
