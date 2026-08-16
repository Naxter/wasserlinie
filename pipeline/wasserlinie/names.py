from __future__ import annotations

import re
import unicodedata

# PEGELONLINE names its waters after the waterway administration ("Untere
# Havel-Wasserstraße"), the DLM names them after the river. This maps the
# gauge-side long names onto DLM names where the two disagree.
ALIASES = {
    "UNTERE HAVEL-WASSERSTRASSE": "Havel",
    "OBERE HAVEL-WASSERSTRASSE": "Havel",
    "POTSDAMER HAVEL": "Havel",
    "ORANIENBURGER HAVEL": "Havel",
    "HAVEL-ODER-WASSERSTRASSE": "Obere Havel-Wasserstraße : Havel-Oder-Wasserstraße",
    "SPREE-ODER-WASSERSTRASSE": "Spree",
    "MÜGGELSPREE": "Spree",
    "MÜRITZ-ELDE-WASSERSTRASSE": "Elde",
    "DAHME-WASSERSTRASSE": "Dahme",
    "STÖR-WASSERSTRASSE": "Stör",
    "ELBESEITENKANAL": "Elbe-Seitenkanal",
    "OHRE": "Ohre",
    "WESTODER": "Westoder",
    "VLATAVA": "Moldau",
}

_TRANSLATE = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"})


def normalize(name: str) -> str:
    """Case-, umlaut- and punctuation-insensitive key for matching water names."""
    s = name.strip().lower().translate(_TRANSLATE)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", s)


def water_key(long_name: str) -> str:
    return normalize(ALIASES.get(long_name.strip().upper(), long_name))
