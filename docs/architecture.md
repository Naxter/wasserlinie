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
  rivers    ──────────────────▶ rivers.json    ────────────▶ layers/  RiverLayer, GaugeLayer
            BKG DLM1000         rivers-detail.json
  forecast  ──────────────────▶ forecast/*.parquet ───────▶ scene/   viewer, terrain, relief, camera, clock
  field     ──────────────────▶ field.bin + field.json ───▶ ui/      React panels (never touches the GPU)
  history   ──────────────────▶ seasonal.parquet
            PEGELONLINE archive (cache/history.parquet stays local)
  backtest  ──────────────────▶ docs/forecast-skill.md
```

Nothing in `public/data/` is committed. It is all rebuilt from public sources,
which is why the first thing a clone needs is a pipeline run.

## The one rule

**React never touches a GPU buffer, and nothing in React runs per frame.**

The store (`src/store.ts`, Zustand) is the only thing both sides share. React
subscribes to it for the panels; the scene subscribes to it in
`LayerHost.tick`, which runs on Cesium's `preRender`. Dragging the time slider
writes one number into the store. React re-renders the readout; the layers read
the same number on the next frame and push it into shader uniforms. Neither
knows about the other.

## What happens per frame

`LayerHost.tick` (`src/layers/plugin.ts`) is the whole hot path:

1. Read `simTime` and a wall-clock seconds value from the store.
2. `RiverLayer.frame` writes two uniforms per material — `time` (where the
   slider sits in the field texture) and `clock` (animation phase). That is a
   handful of number assignments, no allocation, no geometry work.
3. `GaugeLayer.frame` loops over ~700 billboards and sets colour, scale and
   sprite from `Timeline.sample`. That loop is the most expensive thing we do
   per frame and is deliberately plain arithmetic over typed arrays.

Camera work (`CameraDirector.tick`) also runs there: it eases vertical
exaggeration towards the value for the current height and, after ten idle
seconds, nudges the camera into a slow orbit.

Animation time comes from `performance.now()`, never from a frame counter, so
flow speed looks the same on a fast and a slow machine.

## How a gauge reading becomes line width

1. `fetch` pulls 15-minute readings from PEGELONLINE and averages them to
   hourly values in `levels.parquet`, merging with what earlier runs stored.
2. `fetch` places every reading on that gauge's own scale and writes it as
   `state` — see `anomaly.py`. Where `history` has fetched the gauge's archive
   back to 2000, the scale is its own record *for this day of the year*;
   otherwise it falls back to the published year-round marks. `stations.json`
   records which in `basis` so the app never overstates the comparison.
3. `field` walks every river that has gauges, interpolates the state
   between neighbouring gauges along the line, and packs the result into
   `field.bin`: one small grid per river, position along the river on one
   axis, time on the other, three bytes per cell.
4. `RiverLayer.load` turns each river's grid into a canvas and hands it to a
   Cesium `Material` as the `field` uniform.
5. `river.glsl` samples that texture at `(s, time)` where `s` is the position
   along the polyline. Red becomes the state, which the ramp turns into colour,
   glow and pulse speed; green says measured or forecast; blue carries the
   forecast spread and softens the edge.

So the interpolation between gauges happens once, in Python. The browser only
looks things up.

## What happens when you drag the slider one day

- `TimeBar` writes `simTime` into the store.
- `bindClock` (`src/scene/time.ts`) copies it into Cesium's clock, which moves
  the sun, so the terminator crawls across the terrain.
- `RiverLayer.frame` maps `simTime` to a row of the field texture. Rows are six
  hours apart and the shader samples with linear filtering, so the network
  eases between steps instead of stepping.
- `GaugeLayer.frame` asks `Timeline.sample` for each station, which
  interpolates between two hourly cells and reports whether the value is
  measured or forecast.
- The station panel re-renders because `simTime` changed; it reads the same
  `Timeline` plus the raw series from `LevelStore`.

Seeking is stateless: the same `simTime` always yields the same picture.

## Where Cesium objects are born and die

| What | Created | Destroyed |
| --- | --- | --- |
| Viewer, globe, imagery, post-processing | `createViewer` | `AppHandles.dispose` |
| Terrain and relief tiles | on demand by Cesium | Cesium's own tile cache |
| River primitives and materials | `RiverLayer.load` | `RiverLayer.dispose` (removes from `groundPrimitives`) |
| Gauge billboards | `GaugeLayer.load` | `GaugeLayer.dispose` (removes the collection, destroys the input handler) |
| Frame listener | `LayerHost` constructor | `LayerHost.dispose` |

Every layer implements `VisualLayer` and gets an `AbortSignal` in `load`. If a
layer is switched off while its data is still in flight, the host aborts the
request instead of letting it land on a disposed layer.

## Which file do I touch to…

| Change | File |
| --- | --- |
| a colour, a font, camera timings, terrain exaggeration | `src/tokens.ts` — the only place |
| how the river looks | `src/shaders/river.glsl` (uniforms come from `src/layers/riverMaterial.ts`) |
| how the terrain is shaded | `src/scene/relief.ts` |
| add a layer | implement `VisualLayer`, register it in `src/app.ts` |
| what the data means | `pipeline/wasserlinie/` and then `docs/data.md` |

## Deliberate non-choices

- **No Cesium ion.** Terrain comes from public elevation tiles and the relief
  is rendered in the browser, so there is no token and no quota.
- **No query engine in the browser.** An earlier version embedded DuckDB-WASM;
  it worked, but cost a 36 MB download for four trivial lookups. The parquet
  files are read directly instead.
- **No entity API.** Everything visual is a primitive with an explicit
  lifetime, because entities hide when work happens.
- **No committed data.** It changes every day and would bloat the history for
  nothing. `wasserlinie all` rebuilds it in minutes.
