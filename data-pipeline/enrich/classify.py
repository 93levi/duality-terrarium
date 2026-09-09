"""
The real enrich/ output — applies the locked dial (dial.py) + corrections/overrides.json to
produce enrich/out/<codepoint>.json, in the same per-node schema whether a node was resolved
mechanically or by a correction. No LLM, no API key — see data-pipeline/CLAUDE.md for why Phase 0
doesn't need one.

Note on scope: this deliberately does NOT fill in a "meaning" gloss (e.g. 氵 -> "water"). That's a
separate concern from useful/noise classification and needs real semantic knowledge — a dictionary
lookup (KRADFILE or similar) or a manual/LLM pass later. This script's only job is the verdict.

Usage:
    python3 classify.py 06d77 09b31 068ee 08a9e 0660e
    python3 classify.py --all       # full ~6,703-character run
"""

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "extract"))
from parse_kanjivg import parse_file  # noqa: E402

from dial import build_correction_lookups, is_useful, load_corrections  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "data-pipeline" / "kanjivg-source" / "kanji"
STATS_PATH = Path(__file__).resolve().parent / "stats" / "component_frequency.json"
OUT_DIR = Path(__file__).resolve().parent / "out"
BASE_FILENAME = re.compile(r"^[0-9a-f]{5}\.svg$")


def load_stats():
    if not STATS_PATH.exists():
        print("Run component_frequency.py first — stats file missing.", file=sys.stderr)
        sys.exit(1)
    return json.loads(STATS_PATH.read_text(encoding="utf-8"))


def classify_file(svg_path: Path, stats: dict, component_lookup: dict, pair_lookup: dict) -> dict:
    result = parse_file(svg_path)
    classifications = []

    def walk(node, parent_useful, parent_element):
        element = node.get("element")
        useful_here = parent_useful
        if element:
            useful_here, reason = is_useful(
                node, stats, parent_useful, parent_element, component_lookup, pair_lookup,
            )
            entry = {
                "node_id": node["id"],
                "element": element,
                "useful": useful_here,
            }
            if reason:
                entry["note"] = reason
            classifications.append(entry)
        for child in node.get("children", []):
            walk(child, useful_here, element)

    for child in result["tree"].get("children", []):
        walk(child, True, None)

    return {
        "codepoint": result["codepoint"],
        "character": result["character"],
        "classifications": classifications,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codepoints", nargs="*", help="e.g. 06d77 09b31")
    ap.add_argument("--all", action="store_true", help="classify every base character")
    args = ap.parse_args()

    stats = load_stats()
    component_lookup, pair_lookup = build_correction_lookups(load_corrections())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.all:
        files = sorted(f for f in SOURCE_DIR.glob("*.svg") if BASE_FILENAME.match(f.name))
    elif args.codepoints:
        files = [SOURCE_DIR / f"{cp}.svg" for cp in args.codepoints]
    else:
        print("Pass codepoints or --all.", file=sys.stderr)
        sys.exit(1)

    ok, failed = 0, []
    for svg_path in files:
        if not svg_path.exists():
            failed.append((svg_path.name, "file not found"))
            continue
        try:
            result = classify_file(svg_path, stats, component_lookup, pair_lookup)
        except Exception as e:  # noqa: BLE001
            failed.append((svg_path.name, str(e)))
            continue
        out_path = OUT_DIR / f"{result['codepoint']}.json"
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        ok += 1

    print(f"Classified {ok} file(s) -> {OUT_DIR}")
    if failed:
        print(f"Failed {len(failed)}:")
        for name, err in failed[:10]:
            print(f"  {name}: {err}")


if __name__ == "__main__":
    main()
