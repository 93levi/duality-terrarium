"""
Shared classification core — the "dial" plus corrections lookup, used by both preview_dial.py
(interactive tuning against samples) and classify.py (the real batch classifier). One
implementation, so tuning the dial in preview and running it for real never drift apart.

See data-pipeline/CLAUDE.md and enrich/README.md for how these defaults were reached: frequency
count + stroke-complexity floor handles most nodes for free; the orphan tier catches coincidental
shape-matches buried inside an already-excluded parent (e.g. 匕/凵 inside 鬱's obscure 鬯); anything
neither of those resolve goes in corrections/overrides.json instead of chasing a cleverer threshold.
"""

import json
from pathlib import Path

# Locked Phase 0 defaults, reached by testing against known characters + a random sample —
# see data-pipeline/CLAUDE.md for the tuning history. Override via CLI flags in preview_dial.py
# when experimenting; classify.py (the real output) always uses these.
DEFAULT_MIN_FREQUENCY = 25
DEFAULT_MIN_STROKES = 2
DEFAULT_ORPHAN_MIN_FREQUENCY = 300

CORRECTIONS_PATH = Path(__file__).resolve().parents[1] / "corrections" / "overrides.json"


def load_corrections() -> dict:
    if not CORRECTIONS_PATH.exists():
        return {"component_overrides": [], "pair_overrides": []}
    return json.loads(CORRECTIONS_PATH.read_text(encoding="utf-8"))


def build_correction_lookups(corrections: dict):
    """Returns (component_lookup, pair_lookup) dicts for O(1) override checks."""
    component_lookup = {
        entry["element"]: entry for entry in corrections.get("component_overrides", [])
    }
    pair_lookup = {
        (entry["parent_element"], entry["child_element"]): entry
        for entry in corrections.get("pair_overrides", [])
    }
    return component_lookup, pair_lookup


def is_useful(
    node: dict,
    stats: dict,
    parent_useful: bool,
    parent_element: str | None,
    component_lookup: dict,
    pair_lookup: dict,
    min_frequency: int = DEFAULT_MIN_FREQUENCY,
    min_strokes: int = DEFAULT_MIN_STROKES,
    orphan_min_frequency: int = DEFAULT_ORPHAN_MIN_FREQUENCY,
) -> tuple[bool, str]:
    """Returns (useful, reason) — reason is empty for a plain dial verdict, set when a
    correction fired, so callers/output can show why."""
    element = node.get("element")

    # Corrections take priority over the dial, most specific first.
    pair_override = pair_lookup.get((parent_element, element))
    if pair_override is not None:
        return pair_override["useful"], pair_override["reason"]

    component_override = component_lookup.get(element)
    if component_override is not None:
        return component_override["useful"], component_override["reason"]

    entry = stats.get(element)
    if entry is None:
        return False, ""

    if node.get("partial") == "true":
        return False, ""

    threshold = min_frequency if parent_useful else orphan_min_frequency
    if entry["distinct_kanji_count"] < threshold:
        return False, ""

    stroke_count = entry.get("standalone_stroke_count")
    if stroke_count is not None and stroke_count < min_strokes:
        return False, ""

    return True, ""
