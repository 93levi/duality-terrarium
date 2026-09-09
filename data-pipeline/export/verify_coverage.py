"""
Coverage invariant: every stroke that exists in KanjiVG's source for a character must appear
somewhere in that character's exported bundle. Rendering completeness must never depend on
classification/grouping logic being right — this check exists specifically because it wasn't
independently guaranteed once (see data-pipeline/CLAUDE.md: 川 silently lost all 3 of its strokes
because the grouping code's root-node handling had a gap; nothing caught it until a human noticed
the character wasn't rendering).

This does NOT check classification is correct — it checks something much more basic and much more
important to guarantee absolutely: a stroke that exists never silently disappears. Run this after
any change to extract/ or export/, on the full dataset, before trusting the output.

Usage:
    python3 verify_coverage.py           # full dataset
    python3 verify_coverage.py 05ddd     # one character, for debugging a specific failure
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "extract"))
from parse_kanjivg import parse_file  # noqa: E402

from build_bundle import build_bundle, load_gloss_index  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "data-pipeline" / "kanjivg-source" / "kanji"
BASE_FILENAME = re.compile(r"^[0-9a-f]{5}\.svg$")


def count_source_strokes(node) -> int:
    return len(node.get("strokes", [])) + sum(count_source_strokes(c) for c in node.get("children", []))


def count_bundle_strokes(bundle) -> int:
    return sum(len(g["strokes"]) for g in bundle["groups"])


def main():
    gloss_index = load_gloss_index()
    if len(sys.argv) > 1:
        files = [SOURCE_DIR / f"{cp}.svg" for cp in sys.argv[1:]]
    else:
        files = sorted(f for f in SOURCE_DIR.glob("*.svg") if BASE_FILENAME.match(f.name))

    mismatches = []
    for svg_path in files:
        source = parse_file(svg_path)
        source_count = count_source_strokes(source["tree"])

        bundle = build_bundle(svg_path, gloss_index)
        bundle_count = count_bundle_strokes(bundle)

        if source_count != bundle_count:
            mismatches.append((bundle["character"], svg_path.stem, source_count, bundle_count))

    print(f"Checked {len(files)} character(s).")
    if mismatches:
        print(f"COVERAGE FAILURE — {len(mismatches)} character(s) lost strokes between source and bundle:")
        for char, cp, src, out in mismatches[:20]:
            print(f"  {char} ({cp}): source has {src} strokes, bundle has {out}")
        sys.exit(1)
    else:
        print("Coverage OK — every stroke in every character made it into its bundle.")


if __name__ == "__main__":
    main()
