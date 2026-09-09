"""
Deterministic KanjiVG parser — Phase 0.

Turns a KanjiVG SVG into a nested JSON tree that mirrors KanjiVG's own <g> hierarchy exactly: no
classification, no filtering, no judgment calls. That's enrich/'s job, deliberately kept separate.

What we learned inspecting real files (see data-pipeline/CLAUDE.md) before writing this: KanjiVG
already names almost every leaf-level component (down to obscure classical radicals like 鬯, 凵, 匕),
recursively. The handful of ungrouped <g> nodes that appear (e.g. a bare kvg:position="top" wrapper)
are pure layout groupings with no element of their own — they group other *named* children spatially,
they are not "noise" in the stroke sense. So this parser's job is just to preserve that structure
faithfully; deciding which nodes are learner-useful vs. too obscure to surface happens in enrich/.

Usage:
    python3 parse_kanjivg.py 06d77 09b31 068ee 08a9e 0660e
    python3 parse_kanjivg.py --all          # every file in kanjivg-source/kanji/

Output: one JSON file per character in extract/out/<codepoint>.json
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

SVG_NS = "{http://www.w3.org/2000/svg}"

# NOTE: KanjiVG's SVG root declares xmlns:kvg="https://kanjivg.tagaini.net/", but each file's
# internal DTD subset separately sets xmlns:kvg as a #FIXED default of
# "http://kanjivg.tagaini.net" (no "s", no trailing slash) on every <g>/<path> element — and
# Python's expat parser honors that DTD default over the root declaration. Verified empirically
# against real files; get this wrong and every kvg: attribute silently parses as absent.
KVG_NS = "{http://kanjivg.tagaini.net}"

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "data-pipeline" / "kanjivg-source" / "kanji"
OUT_DIR = Path(__file__).resolve().parent / "out"

# kvg: attributes that can appear on <g> (group) elements, per KanjiVG's own DTD.
GROUP_ATTRS = [
    "element", "variant", "partial", "original", "part",
    "number", "tradForm", "radicalForm", "position", "radical", "phon",
]


def strip_kvg_prefix(tag_or_attr: str) -> str:
    return tag_or_attr.replace(KVG_NS, "").replace(SVG_NS, "")


def parse_group(g_elem: ET.Element) -> dict:
    """Recursively parse a <g> element into our tree shape."""
    node = {
        "id": g_elem.get("id", "").replace("kvg:", ""),
    }
    for attr in GROUP_ATTRS:
        val = g_elem.get(f"{KVG_NS}{attr}")
        if val is not None:
            node[attr] = val

    strokes = []
    children = []
    for child in g_elem:
        tag = strip_kvg_prefix(child.tag)
        if tag == "path":
            strokes.append({
                "id": child.get("id", "").replace("kvg:", ""),
                "type": child.get(f"{KVG_NS}type"),
                "d": child.get("d"),
            })
        elif tag == "g":
            children.append(parse_group(child))

    if strokes:
        node["strokes"] = strokes
    if children:
        node["children"] = children
    return node


def parse_file(svg_path: Path) -> dict:
    tree = ET.parse(svg_path)
    root = tree.getroot()

    codepoint = svg_path.stem  # e.g. "06d77"

    stroke_paths_group = None
    for g in root.iter(f"{SVG_NS}g"):
        gid = g.get("id", "")
        if gid.startswith("kvg:StrokePaths_"):
            stroke_paths_group = g
            break

    if stroke_paths_group is None:
        raise ValueError(f"No StrokePaths group found in {svg_path.name}")

    # The character's own root <g> is the single child of the StrokePaths wrapper.
    char_group = next(iter(stroke_paths_group), None)
    if char_group is None:
        raise ValueError(f"StrokePaths group is empty in {svg_path.name}")

    tree_json = parse_group(char_group)

    return {
        "codepoint": codepoint,
        "character": tree_json.get("element"),
        "source_file": svg_path.name,
        "tree": tree_json,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codepoints", nargs="*", help="e.g. 06d77 09b31")
    ap.add_argument("--all", action="store_true", help="parse every file in kanjivg-source/kanji/")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.all:
        files = sorted(SOURCE_DIR.glob("*.svg"))
    elif args.codepoints:
        files = [SOURCE_DIR / f"{cp}.svg" for cp in args.codepoints]
    else:
        print("Pass codepoints or --all. See module docstring.", file=sys.stderr)
        sys.exit(1)

    ok, failed = 0, []
    for svg_path in files:
        if not svg_path.exists():
            failed.append((svg_path.name, "file not found"))
            continue
        try:
            result = parse_file(svg_path)
        except Exception as e:  # noqa: BLE001 — Phase 0, we want to see every failure, not just the first
            failed.append((svg_path.name, str(e)))
            continue
        out_path = OUT_DIR / f"{result['codepoint']}.json"
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        ok += 1

    print(f"Parsed {ok} file(s) -> {OUT_DIR}")
    if failed:
        print(f"Failed {len(failed)}:")
        for name, err in failed:
            print(f"  {name}: {err}")


if __name__ == "__main__":
    main()
