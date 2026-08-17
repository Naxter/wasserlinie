# Forecast skill

Model `gbq-2`. Reproduce with `python -m wasserlinie backtest`.

Trained on 459 hours, band calibrated on the next 114, then
judged on 192 hours it had never seen, across 515 inland gauges
(318526 forecast/observation pairs).

Tidal gauges get no forecast at all: the model has no tide features, and a hindcast put
its error there near a metre with the band covering 31% of observations.

`skill vs persistence` compares the median forecast against assuming the level simply stays
where it is. Positive means the model adds something, zero or below means it does not. It
beats persistence without interruption out to **+9 h**; past that it is a coin toss,
negative at 8 of the 24 lead times below. Leads further out that look good
are noise, not range.

Coverage is the share of observations inside p10..p90 and should sit near 0.80.

| lead | MAE (cm) | persistence MAE (cm) | skill | coverage | band width (cm) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| +3 h | 3.0 | 5.5 | +0.46 | 0.80 | 11.8 |
| +6 h | 3.5 | 7.5 | +0.53 | 0.80 | 14.8 |
| +9 h | 5.3 | 6.4 | +0.18 | 0.81 | 17.7 |
| +12 h | 3.4 | 3.2 | -0.04 | 0.81 | 16.0 |
| +15 h | 5.9 | 6.2 | +0.04 | 0.82 | 17.6 |
| +18 h | 7.4 | 8.2 | +0.09 | 0.82 | 18.7 |
| +21 h | 6.7 | 7.4 | +0.09 | 0.81 | 19.6 |
| +24 h | 4.0 | 4.1 | +0.02 | 0.82 | 19.5 |
| +27 h | 6.5 | 6.0 | -0.09 | 0.82 | 20.8 |
| +30 h | 8.1 | 8.3 | +0.03 | 0.82 | 21.8 |
| +33 h | 7.5 | 8.3 | +0.10 | 0.82 | 22.6 |
| +36 h | 4.9 | 5.4 | +0.09 | 0.82 | 22.5 |
| +39 h | 7.6 | 6.0 | -0.27 | 0.83 | 23.9 |
| +42 h | 8.8 | 8.4 | -0.04 | 0.82 | 24.4 |
| +45 h | 8.3 | 8.8 | +0.06 | 0.83 | 24.7 |
| +48 h | 5.8 | 6.0 | +0.03 | 0.83 | 24.2 |
| +51 h | 7.5 | 5.6 | -0.34 | 0.82 | 25.0 |
| +54 h | 8.8 | 8.4 | -0.05 | 0.83 | 25.6 |
| +57 h | 8.7 | 9.3 | +0.06 | 0.83 | 26.2 |
| +60 h | 6.4 | 6.8 | +0.06 | 0.83 | 25.7 |
| +63 h | 7.8 | 5.3 | -0.47 | 0.82 | 26.4 |
| +66 h | 8.8 | 8.1 | -0.09 | 0.81 | 26.5 |
| +69 h | 8.8 | 9.5 | +0.07 | 0.81 | 26.8 |
| +72 h | 6.7 | 7.4 | +0.09 | 0.81 | 26.1 |

Generated 2026-08-17T11:20:43+00:00 from 31.8 days of stored history. The window
is short because PEGELONLINE's live API only serves about a month; it grows as the daily
refresh accumulates, and these numbers are worth re-checking when it does.

`wasserlinie history` does not widen it. That archive reaches back to 2000, but it is one
value per day, and this model reads the shape of the last three days in hourly steps to
predict the next three. It is the right raw material for what counts as normal on a date —
which is what `seasonal.parquet` is — and the wrong shape for an hourly forecast. Using it
would mean a second model on a daily horizon, judged against daily means.
