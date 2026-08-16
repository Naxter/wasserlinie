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

Sorted by station, then time. Row groups of 50k rows so DuckDB can range-read
one station cheaply.

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
  "indexOffset": -0.5, "indexScale": 2.5,
  "horizonHours": 72,
  "forecastRun": "2026-08-16T16",
  "rivers": [1, 0, 2, …]
}
```

`field.bin` is a plain `uint8` array shaped
`[rivers][steps][samples][channels]`, in the order of the `rivers` list.
Per cell: R = level index packed as `(index - indexOffset) / indexScale`,
G = 255 measured … 0 forecast, B = forecast spread (p90 − p10) in index
units. Steps are anchored so `now` falls exactly on a row.

## forecast/manifest.json and forecast/&lt;run&gt;.parquet

The manifest lists the newest runs first; the app loads `runs[0]`.

| column    | type            |
| --------- | --------------- |
| `station` | string          |
| `ts`      | timestamp (UTC) |
| `p10`     | float32, cm     |
| `p50`     | float32, cm     |
| `p90`     | float32, cm     |

Every 3 hours out to 72 hours after the last measurement.

## germany.json

`{ "rings": [[[lon, lat], …], …] }` — the country's land polygon from
VG2500, simplified. Used to dim everything outside and draw the outline.
