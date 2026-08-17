from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

HISTORY_DAYS = 90
FORECAST_HOURS = 72
FORECAST_STEP_HOURS = 3
FIELD_STEP_HOURS = 6
FIELD_SAMPLES = 48
# The state (-1 = record low, 0 = normal, +1 = record high) is packed into a
# byte over this range, leaving room either side for record-breaking levels.
STATE_OFFSET = -1.5
STATE_SCALE = 3.0

PEGELONLINE_HOST = "https://www.pegelonline.wsv.de"
PEGELONLINE_URL = f"{PEGELONLINE_HOST}/webservices/rest-api/v2"
DLM1000_URL = "https://daten.gdz.bkg.bund.de/produkte/dlm/dlm1000/aktuell/dlm1000.utm32s.shape.ebenen.zip"
VG2500_URL = "https://daten.gdz.bkg.bund.de/produkte/vg/vg2500/aktuell/vg2500_12-31.utm32s.shape.zip"

log = logging.getLogger("wasserlinie")


@dataclass
class Paths:
    out: Path = field(default_factory=lambda: REPO_ROOT / "public" / "data")
    cache: Path = field(default_factory=lambda: REPO_ROOT / "pipeline" / "cache")

    def __post_init__(self) -> None:
        self.out = Path(self.out)
        self.cache = Path(self.cache)
        self.out.mkdir(parents=True, exist_ok=True)
        (self.out / "forecast").mkdir(exist_ok=True)
        self.cache.mkdir(parents=True, exist_ok=True)

    @property
    def stations(self) -> Path:
        return self.out / "stations.json"

    @property
    def levels(self) -> Path:
        return self.out / "levels.parquet"

    @property
    def history(self) -> Path:
        """Daily means back to 2000; big, so it stays in the cache."""
        return self.cache / "history.parquet"

    @property
    def seasonal(self) -> Path:
        return self.out / "seasonal.parquet"

    @property
    def history_bin(self) -> Path:
        """State per gauge per day for the whole record; loaded on demand."""
        return self.out / "history.bin"

    @property
    def history_meta(self) -> Path:
        return self.out / "history.json"

    @property
    def history_cm(self) -> Path:
        """The same grid in centimetres, for the list and the chart."""
        return self.out / "history-cm.bin"

    @property
    def rivers(self) -> Path:
        return self.out / "rivers.json"

    @property
    def rivers_detail(self) -> Path:
        return self.out / "rivers-detail.json"

    @property
    def germany(self) -> Path:
        return self.out / "germany.json"

    @property
    def field_meta(self) -> Path:
        return self.out / "field.json"

    @property
    def field_bin(self) -> Path:
        return self.out / "field.bin"

    @property
    def forecast_dir(self) -> Path:
        return self.out / "forecast"

    @property
    def manifest(self) -> Path:
        return self.forecast_dir / "manifest.json"
