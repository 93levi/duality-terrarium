"""
Parses KANJIDIC2 (data-pipeline/kanjidic-source/kanjidic2.xml — EDRDG, CC BY-SA, vendored
separately from KanjiVG; see root CLAUDE.md Data source section) into a flat character -> lexical
info lookup. KanjiVG has zero semantic data (pure stroke geometry + structure); KANJIDIC2 has zero
geometry (pure lexical data — readings, meanings, classification codes). Neither replaces the
other; this is the join, keyed on the raw character, which both datasets already share.

Per character:
  gloss       - primary English meaning. Only the first is kept — <meaning> tags with no m_lang
                attribute are English by KANJIDIC2's convention; m_lang="fr"/"es"/"pt"/etc. are
                other languages, skipped.
  on          - on'yomi readings (Chinese-derived, katakana) — r_type="ja_on".
  kun         - kun'yomi readings (native Japanese, hiragana) — r_type="ja_kun".
  grade       - school grade the character is taught in Japan (1-6 elementary, 8 = other jouyou,
                9/10 = jinmeiyo), or null if ungraded.
  strokeCount - the traditionally-counted number of pen strokes to write it — a real, separate
                metric from this app's own "stroke groups" (render regions), not a duplicate of it.
  jlpt        - JLPT level. NOTE: KANJIDIC2 documents this field as based on the OLD 4-level test
                (pre-2010 revision, 1=hardest through 4=easiest) and no longer officially
                maintained — treat it as a rough difficulty signal, not a current, authoritative
                JLPT level.
Deliberately NOT included: nanori (name-only readings) — these lists can run to 15+ entries per
character (e.g. 海) and are rarely useful outside actually reading names, mostly noise here.

A character with nothing at all (no gloss, no readings, no misc stats) is skipped entirely, same
as the original version of this script only indexing characters with a gloss.

Usage:
    python3 build_gloss_index.py
Output: data-pipeline/gloss/gloss_index.json
"""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

SOURCE_PATH = Path(__file__).resolve().parents[1] / "kanjidic-source" / "kanjidic2.xml"
OUT_PATH = Path(__file__).resolve().parent / "gloss_index.json"


def parse_int(text: str | None) -> int | None:
    return int(text) if text and text.isdigit() else None


def main():
    if not SOURCE_PATH.exists():
        raise SystemExit(f"Missing {SOURCE_PATH} — download KANJIDIC2 first.")

    tree = ET.parse(SOURCE_PATH)
    index = {}
    for char_el in tree.getroot().findall("character"):
        literal = char_el.findtext("literal")
        if not literal:
            continue

        gloss = None
        for meaning_el in char_el.iter("meaning"):
            if meaning_el.get("m_lang") is None and meaning_el.text:
                gloss = meaning_el.text
                break  # first English meaning only — the primary gloss

        on_readings = []
        kun_readings = []
        for reading_el in char_el.iter("reading"):
            r_type = reading_el.get("r_type")
            if r_type == "ja_on" and reading_el.text:
                on_readings.append(reading_el.text)
            elif r_type == "ja_kun" and reading_el.text:
                kun_readings.append(reading_el.text)

        misc = char_el.find("misc")
        grade = parse_int(misc.findtext("grade")) if misc is not None else None
        stroke_count = parse_int(misc.findtext("stroke_count")) if misc is not None else None
        jlpt = parse_int(misc.findtext("jlpt")) if misc is not None else None

        if not (gloss or on_readings or kun_readings or grade or stroke_count or jlpt):
            continue  # nothing usable at all for this character

        index[literal] = {
            "gloss": gloss,
            "on": on_readings,
            "kun": kun_readings,
            "grade": grade,
            "strokeCount": stroke_count,
            "jlpt": jlpt,
        }

    OUT_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(f"Indexed {len(index)} characters.")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
