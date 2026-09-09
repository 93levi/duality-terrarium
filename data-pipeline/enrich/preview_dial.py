"""
The "dial" — apply the frequency + stroke-complexity + orphan-tier thresholds (and corrections/)
to a sample of real characters and print the resulting useful/noise classification for eyeballing.

This is the tuning loop: run it, look at the output, adjust --min-frequency etc., run again. No
LLM, no API cost, no wait — every run is instant. Classification logic lives in dial.py, shared
with classify.py (the real batch output), so what you tune here is exactly what gets written.

Usage:
    python3 preview_dial.py --sample 8
    python3 preview_dial.py --chars 海 鬱 森 語 明
    python3 preview_dial.py --min-frequency 40 --chars 鬱   # override a default to experiment
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "extract"))
from parse_kanjivg import parse_file  # noqa: E402

from dial import (  # noqa: E402
    DEFAULT_MIN_FREQUENCY,
    DEFAULT_MIN_STROKES,
    DEFAULT_ORPHAN_MIN_FREQUENCY,
    build_correction_lookups,
    is_useful,
    load_corrections,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "data-pipeline" / "kanjivg-source" / "kanji"
STATS_PATH = Path(__file__).resolve().parent / "stats" / "component_frequency.json"
BASE_FILENAME = re.compile(r"^[0-9a-f]{5}\.svg$")


def load_stats():
    if not STATS_PATH.exists():
        print("Run component_frequency.py first — stats file missing.", file=sys.stderr)
        sys.exit(1)
    return json.loads(STATS_PATH.read_text(encoding="utf-8"))


def classify_char(codepoint: str, stats: dict, component_lookup: dict, pair_lookup: dict,
                   min_frequency: int, min_strokes: int, orphan_min_frequency: int):
    result = parse_file(SOURCE_DIR / f"{codepoint}.svg")
    lines = []

    def walk(node, depth, parent_useful, parent_element):
        element = node.get("element")
        label = element or "·"
        useful_here = parent_useful  # structural wrappers pass parent status straight through
        if element:
            entry = stats.get(element, {})
            freq = entry.get("distinct_kanji_count", 0)
            strokes = entry.get("standalone_stroke_count")
            useful_here, reason = is_useful(
                node, stats, parent_useful, parent_element, component_lookup, pair_lookup,
                min_frequency, min_strokes, orphan_min_frequency,
            )
            tag = "USEFUL" if useful_here else "noise "
            stroke_note = f", own={strokes}str" if strokes is not None else ""
            partial_note = ", partial" if node.get("partial") == "true" else ""
            orphan_note = "" if parent_useful else " [orphan-tier]"
            reason_note = f"  <- correction: {reason}" if reason else ""
            lines.append(
                f"{'  ' * depth}[{tag}] {label}  "
                f"(freq={freq}{stroke_note}{partial_note}){orphan_note}{reason_note}"
            )
        else:
            lines.append(f"{'  ' * depth}[      ] {label}  (structural wrapper)")
        for child in node.get("children", []):
            walk(child, depth + 1, useful_here, element)

    # The root node IS the character itself, not a component — evaluating it would score its own
    # rarity (any single character mostly occurs once, as itself) and wrongly orphan every
    # top-level component underneath it. Skip straight to its children.
    root = result["tree"]
    lines.append(f"{root.get('element', '·')}")
    for child in root.get("children", []):
        walk(child, 1, True, None)
    return result["character"], lines


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-frequency", type=int, default=DEFAULT_MIN_FREQUENCY)
    ap.add_argument("--min-strokes", type=int, default=DEFAULT_MIN_STROKES)
    ap.add_argument("--orphan-min-frequency", type=int, default=DEFAULT_ORPHAN_MIN_FREQUENCY)
    ap.add_argument("--sample", type=int, default=0, help="number of random characters to preview")
    ap.add_argument("--chars", nargs="*", default=[], help="specific characters to preview, e.g. 海 鬱")
    ap.add_argument("--seed", type=int, default=None, help="random seed, for reproducible samples")
    args = ap.parse_args()

    stats = load_stats()
    component_lookup, pair_lookup = build_correction_lookups(load_corrections())

    if args.seed is not None:
        random.seed(args.seed)

    if args.chars:
        codepoints = [f"{ord(c):05x}" for c in args.chars]
    elif args.sample:
        base_files = [f for f in SOURCE_DIR.glob("*.svg") if BASE_FILENAME.match(f.name)]
        codepoints = [f.stem for f in random.sample(base_files, args.sample)]
    else:
        print("Pass --sample N or --chars 海 鬱 ...", file=sys.stderr)
        sys.exit(1)

    print(f"dial: min_frequency={args.min_frequency}  min_strokes={args.min_strokes}  "
          f"orphan_min_frequency={args.orphan_min_frequency}\n")
    for codepoint in codepoints:
        try:
            char, lines = classify_char(codepoint, stats, component_lookup, pair_lookup,
                                         args.min_frequency, args.min_strokes,
                                         args.orphan_min_frequency)
        except FileNotFoundError:
            print(f"(no KanjiVG entry for {codepoint})\n")
            continue
        print(f"=== {char} ({codepoint}) ===")
        for line in lines:
            print(line)
        print()


if __name__ == "__main__":
    main()
