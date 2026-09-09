"""
Reverse index: element -> every character where that element was marked USEFUL (built from
export/build_bundle.py's own output, not the raw frequency stats — those count every occurrence
regardless of verdict; this only counts where a component is actually surfaced as clickable, so we
never link to a character where the same-named component was excluded, e.g. by a pair_override).

This is what makes the core mechanic real: click a useful component, see every other kanji that
shares it. Without this, the app only ever talks about the character currently on screen — this is
the payoff the whole classification pipeline exists for. See root CLAUDE.md concept.

One shared file, not embedded per-bundle (would duplicate the same list into thousands of files for
no reason) — fetched once by the app, looked up client-side after that.

Usage:
    python3 build_component_index.py
Output: apps/web/public/data/_index.json
"""

import json
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "apps" / "web" / "public" / "data"
OUT_PATH = DATA_DIR / "_index.json"


def main():
    index = defaultdict(list)
    bundle_files = [f for f in DATA_DIR.glob("*.json") if not f.name.startswith("_")]

    for f in bundle_files:
        bundle = json.loads(f.read_text(encoding="utf-8"))
        seen_elements = set()  # a component can repeat within one character (e.g. 木 in 森) —
        # only list each character once per component, not once per occurrence
        for group in bundle["groups"]:
            if group["useful"] and group["element"] and group["element"] not in seen_elements:
                seen_elements.add(group["element"])
                index[group["element"]].append({
                    "codepoint": bundle["codepoint"],
                    "character": bundle["character"],
                })

    OUT_PATH.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(f"Indexed {len(index)} useful component names across {len(bundle_files)} characters.")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
