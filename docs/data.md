# Data assets

Everything the app reads lives under `public/data/` (or wherever
`VITE_DATA_URL` points). All timestamps are UTC ISO strings; the app displays
them in Berlin time.

## stations.json

```json
{
  "generated": "2026-08-16T16:22:18+00:00",
  "stations": [
    {
      "uuid": "a6ee8177-…",
      "name": "KÖLN",
      "water": "RHEIN",
      "waterKey": "rhein",
      "lon": 6.96, "lat": 50.94,
      "km": 688.0,
      "zero": 34.97,
      "mw": 297.0,
      "low": 114.0, "high": 725.0, "ref": "mean",
      "hasData": true
    }
  ]
}
```

- `waterKey` is the normalised water name used to match rivers.
- `low`/`high` are the reference marks the level index is built from:
  `ref` says which pair (`mean` = MNW/MHW, `tidal` = MTnw/MThw,
  `extremes` = NW/HW). `null` when the station publishes none.
- `zero` is the gauge datum in metres above sea level, `mw` mean water.

## levels.parquet

| column    | type            | note                          |
| --------- | --------------- | ----------------------------- |
| `station` | string          | station uuid                  |
| `ts`      | timestamp (UTC) | hourly                        |
| `value`   | float32         | water level in cm, hourly mean |
| `state`   | float32         | position on the gauge's scale, null where it cannot be placed |

`state` comes from one of two references. Where `wasserlinie history` has
fetched a gauge's archive, it is the seasonal one below; otherwise it falls back
to the gauge's year-round marks. `stations.json` records which in `basis`, and
the app words its verdict accordingly — it never claims "for this time of year"
unless it can back it.

### The state scale

`state` is what every colour in the app is driven by. It places a reading on
the gauge's own published levels:

| state | level | meaning |
| ---: | --- | --- |
| −1.0 | NNW | the lowest ever recorded here |
| −0.5 | MNW | mean low water, the usual bottom of the year |
| 0.0 | MW | mean water, normal |
| +0.5 | MHW | mean high water, the usual top of the year |
| +1.0 | HHW | the highest ever recorded here |

Linear in between, and the slope of the outer segment continues past the ends
so a record-breaking level keeps moving instead of piling up on the end stop.

It is deliberately **not** a percentile, and deliberately **not** seasonal.
A percentile would spend 95% of its range on levels above mean low water and
squash every degree of drought into the bottom few percent — which is exactly
where the interesting variation sits. A seasonal comparison would need years of
history per gauge; PEGELONLINE serves roughly a month and does not answer for
dates in the past, and CAMELS-DE (the one open multi-year German level archive,
1582 catchments, 1951–2020) matches only 15 of these 691 stations because it
covers state catchment gauges rather than federal waterways.

`state` is null when the gauge publishes fewer than three of those marks, when
MNW and MHW are missing or less than 20 cm apart, when the marks contradict
each other, or when the gauge is tidal — a level between MTnw and MThw encodes
the phase of the tide, not whether anything unusual is happening.

Sorted by station, then time, so one station is a contiguous slice and the app
can serve its chart from an offset without a query engine.

## rivers.json

```json
{
  "rivers": [
    {
      "id": 1,
      "name": "Rhein",
      "cls": 200,
      "km": 689.5,
      "coords": [[7.59, 47.59], …],
      "gauges": [{ "uuid": "…", "s": 0.0237 }, …]
    }
  ]
}
```

- Coordinates run downstream (oriented from the DLM's flow flag, gauge datum
  as fallback).
- `cls` is the DLM width class (12, 42, 125, 200 m); polygon-derived rivers
  count as 200.
- `s` is the gauge's normalised position along the part (0 = start, 1 = end).

## field.json + field.bin

The texture behind the river shader.

```json
{
  "t0": "2026-07-16T10:00:00+00:00",
  "now": "2026-08-16T16:00:00+00:00",
  "stepHours": 6, "steps": 138, "samples": 48, "channels": 3,
  "stateOffset": -1.5, "stateScale": 3.0,
  "horizonHours": 72,
  "forecastRun": "2026-08-16T16",
  "rivers": [1, 0, 2, …]
}
```

`field.bin` is a plain `uint8` array shaped
`[rivers][steps][samples][channels]`, in the order of the `rivers` list.
Per cell: R = state packed as `(state - stateOffset) / stateScale`,
G = 255 measured … 0 forecast, B = forecast band width on the state scale.
Steps are anchored so `now` falls exactly on a row.

## forecast/manifest.json and forecast/&lt;run&gt;.parquet

The manifest lists the newest runs first; the app loads `runs[0]`.

| column    | type            |
| --------- | --------------- |
| `station` | string          |
| `ts`      | timestamp (UTC) |
| `p10`     | float32, cm     |
| `p50`     | float32, cm     |
| `p90`     | float32, cm     |
| `state`   | float32, the p50 on the state scale |
| `stateLow`, `stateHigh` | float32, the band on the state scale |

Every 3 hours out to 72 hours after the last measurement.

## seasonal.parquet

What counts as normal at a gauge *on this date*, from `wasserlinie history`.
Built from every daily mean since 2000 in a ±15-day window around the day of
the year, across all years.

| column | type | note |
| --- | --- | --- |
| `station` | string | station uuid |
| `doy` | int16 | day of the year, sampled every 5 days |
| `lo`, `hi` | float32 | lowest and highest daily mean seen in the window, in cm |
| `p10`, `p25`, `p50`, `p75`, `p90` | float32 | percentiles of those daily means, in cm |
| `years` | int16 | how many distinct years the window drew on |

Those seven levels map onto the state scale as −1, −0.5, −0.25, 0, +0.25, +0.5,
+1, so a reading at the seasonal record low lands on −1 exactly. A gauge needs
at least 5 years and 30 samples in the window to get a row at all; the day is
sampled every 5 days because the window already smooths the curve, and storing
all 365 was five times the bytes for no extra information.

## history.parquet (cache only)

Daily means per gauge back to 2000, in `pipeline/cache/`. It is the raw material
for `seasonal.parquet` and is never shipped: ~36 MB for all gauges, against
1.2 MB for the reference derived from it.

| column | type | note |
| --- | --- | --- |
| `station` | string | station uuid |
| `day` | timestamp | local calendar day |
| `mean`, `min`, `max` | float32 | of that day's 15-minute readings, in cm |
| `n` | int16 | readings that day; days under 24 are dropped |

## germany.json

`{ "rings": [[[lon, lat], …], …] }` — the country's land polygon from
VG2500, simplified. Used to dim everything outside and draw the outline.
