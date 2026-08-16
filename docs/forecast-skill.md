# Forecast skill

Model `gbq-2`. Reproduce with `python -m wasserlinie backtest`.

Trained on 448 hours, band calibrated on the next 112, then
judged on 187 hours it had never seen, across 515 inland gauges
(311539 forecast/observation pairs).

Tidal gauges get no forecast at all: the model has no tide features, and a hindcast put
its error there near a metre with the band covering 31% of observations.

`skill vs persistence` compares the median forecast against assuming the level simply stays
where it is. Positive means the model adds something, zero or below means it does not. On
this history it stops adding anything beyond about **+72 h**.

Coverage is the share of observations inside p10..p90 and should sit near 0.80.

| lead | MAE (cm) | persistence MAE (cm) | skill | coverage | band width (cm) |
| ---: | ---: | ---: | ---: | ---: | ---: |
| +3 h | 5.8 | 8.8 | +0.34 | 0.80 | 12.7 |
| +6 h | 9.7 | 14.3 | +0.32 | 0.79 | 16.0 |
| +9 h | 8.0 | 9.9 | +0.19 | 0.81 | 19.2 |
| +12 h | 9.7 | 10.1 | +0.04 | 0.80 | 17.3 |
| +15 h | 8.8 | 9.7 | +0.09 | 0.81 | 19.2 |
| +18 h | 14.0 | 15.4 | +0.09 | 0.82 | 20.3 |
| +21 h | 9.6 | 11.1 | +0.14 | 0.81 | 21.4 |
| +24 h | 10.7 | 11.7 | +0.08 | 0.82 | 21.5 |
| +27 h | 9.3 | 9.7 | +0.04 | 0.81 | 23.0 |
| +30 h | 15.0 | 16.2 | +0.07 | 0.82 | 24.1 |
| +33 h | 10.6 | 12.3 | +0.14 | 0.82 | 25.0 |
| +36 h | 12.1 | 13.5 | +0.10 | 0.82 | 25.3 |
| +39 h | 10.5 | 10.0 | -0.05 | 0.81 | 25.7 |
| +42 h | 16.1 | 16.9 | +0.04 | 0.82 | 26.4 |
| +45 h | 11.4 | 13.2 | +0.13 | 0.82 | 26.8 |
| +48 h | 13.6 | 14.9 | +0.09 | 0.82 | 26.3 |
| +51 h | 10.6 | 10.1 | -0.05 | 0.82 | 27.0 |
| +54 h | 16.8 | 17.4 | +0.04 | 0.83 | 28.0 |
| +57 h | 12.2 | 14.0 | +0.13 | 0.82 | 28.4 |
| +60 h | 15.0 | 16.7 | +0.10 | 0.82 | 28.0 |
| +63 h | 11.3 | 10.5 | -0.07 | 0.81 | 27.7 |
| +66 h | 17.6 | 18.1 | +0.03 | 0.81 | 28.2 |
| +69 h | 12.6 | 14.6 | +0.14 | 0.81 | 28.1 |
| +72 h | 16.2 | 18.3 | +0.12 | 0.79 | 27.1 |

Generated 2026-08-16T17:37:47+00:00 from 31.1 days of stored history. The window
is short because PEGELONLINE only serves about a month; it grows as the daily refresh
accumulates, and these numbers are worth re-checking when it does.
