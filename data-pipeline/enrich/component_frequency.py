"""
Corpus-wide component frequency count — the objective backbone for "useful vs. noise".

The core idea (see data-pipeline/CLAUDE.md): whether a named KanjiVG component is worth surfacing
to a learner correlates strongly with how many *other* real characters it also appears in. That's
not a semantic/etymological judgment — it's a count, computable mechanically across the whole
dataset, no LLM involved.

For every named node across all 6,703 base characters (stroke-order style variants like
"...-Kaisho.svg" are excluded — same character, not a separate data point), this records how many
*distinct characters* contain that exact element name. A repeated component within one character
(e.g. 木 appearing twice in 林) counts once for that character, not twice — we're measuring cross-
character reach, not raw stroke-group count.

This produces the input to the "dial": apps built on top of this (or a human, or an LLM doing the
harder residual judgment calls) can threshold on `distinct_kanji_count` to decide what counts as
"common enough to be a useful component" — and that threshold can be tuned empirically against real
samples instead of guessed per-character.

Usage:
    python3 component_frequency.py
Output: enrich/stats/component_frequency.json
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "extract"))
from parse_kanjivg import parse_file  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "data-pipeline" / "kanjivg-source" / "kanji"
OUT_PATH = Path(__file__).resolve().parent / "stats" / "component_frequency.json"

BASE_FILENAME = re.compile(r"^[0-9a-f]{5}\.svg$")


def collect_elements(node: dict, seen_in_this_char: set):
    """Walk a parsed tree, recording every distinct element name found (once per character)."""
    element = node.get("element")
    if element:
        seen_in_this_char.add(element)
    for child in node.get("children", []):
        collect_elements(child, seen_in_this_char)


def main():
    base_files = sorted(f for f in SOURCE_DIR.glob("*.svg") if BASE_FILENAME.match(f.name))
    print(f"Processing {len(base_files)} base characters...")

    appears_in = defaultdict(set)  # element -> set of codepoints it appears in
    failed = []

    for svg_path in base_files:
        try:
            result = parse_file(svg_path)
        except Exception as e:  # noqa: BLE001
            failed.append((svg_path.name, str(e)))
            continue
        seen = set()
        collect_elements(result["tree"], seen)
        for element in seen:
            appears_in[element].add(result["codepoint"])

    # An element is a "standalone character" if its glyph is itself one of the base characters
    # in the dataset (e.g. 木 is standalone; a KanjiVG-internal shape label wouldn't be). When it
    # is, we also record its own total stroke count — this is what catches the 丿/一 problem:
    # frequency alone can't distinguish "common because it's a real, recognizable unit" (木, 十)
    # from "common because it's a generic 1-stroke primitive that happens to appear everywhere"
    # (丿, 一). A component's own complexity is a free, mechanical proxy for "distinctive enough
    # to be worth recognizing," same spirit as the frequency count itself.
    standalone_stroke_counts = {}
    for f in base_files:
        char = chr(int(f.stem, 16))
        try:
            result = parse_file(f)
        except Exception:  # noqa: BLE001
            continue

        def total_strokes(n):
            return len(n.get("strokes", [])) + sum(total_strokes(c) for c in n.get("children", []))

        standalone_stroke_counts[char] = total_strokes(result["tree"])

    stats = {
        element: {
            "distinct_kanji_count": len(codepoints),
            "is_standalone_character": element in standalone_stroke_counts,
            "standalone_stroke_count": standalone_stroke_counts.get(element),
            "example_kanji_codepoints": sorted(codepoints)[:5],
        }
        for element, codepoints in appears_in.items()
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )

    ranked = sorted(stats.items(), key=lambda kv: -kv[1]["distinct_kanji_count"])
    print(f"\n{len(stats)} distinct component names found across {len(base_files)} characters.")
    print(f"Wrote {OUT_PATH}")
    if failed:
        print(f"Failed to parse {len(failed)} file(s): {failed[:5]}")

    print("\nTop 15 most common components:")
    for element, entry in ranked[:15]:
        print(f"  {element}\t{entry['distinct_kanji_count']} characters")

    print("\nDistribution (how many components fall in each frequency band):")
    bands = [(1000, None), (100, 999), (20, 99), (5, 19), (2, 4), (1, 1)]
    for lo, hi in bands:
        if hi is None:
            count = sum(1 for e in stats.values() if e["distinct_kanji_count"] >= lo)
            label = f">= {lo}"
        else:
            count = sum(1 for e in stats.values() if lo <= e["distinct_kanji_count"] <= hi)
            label = f"{lo}-{hi}"
        print(f"  {label:>10} characters: {count} components")


if __name__ == "__main__":
    main()
