"""
export/ — merges extract/'s structure with the top-level category (1/2/3) into one flat,
renderable bundle per character: everything apps/web needs to draw a kanji and know what's
interactive, with no joining logic left for the app to do itself.

PIVOT (see data-pipeline/CLAUDE.md for the full reasoning): render groups now come directly from
`structure` (category 1/2/3), not from the fine-grained frequency-dial classification
(enrich/dial.py, classify.py) that drove this file until now. The dial's per-node useful/noise
judgment calls (orphan-tier thresholds, corrections/overrides.json's pair_overrides for
coincidental shape-matches like 貝→目/八) only ever mattered because that model exposed deep,
nested hover targets. Under the category model, a character exposes at most 2 coarse regions (its
named top-level parts, each with everything beneath it merged in) — 貝's own internal 目/八 shape
match is never separately hoverable at all, it's just absorbed into 貝's merged region. That's not
a workaround, it's the reason almost every hard judgment call from earlier tonight (冖/彡 in 鬱,
貝→目/八...) stops mattering: neither was ever a top-level part of anything.
**"five's fake 二" was NOT actually in that category, despite reading like it was at the time —
real, confirmed correction, not a repeat of the same claim: 五's two "二" groups ARE its top-level
parts (that's exactly what made this a category-2 split, both genuinely named), so this one very
much DID resurface under the category model, as a real bug, found later by direct testing —
compute_structure's own split-radical-downgrade check (its own comment has the full story) is the
actual fix, checking KanjiVG's `kvg:part` attribute specifically, not something this pivot already
handled for free.** dial.py/classify.py/corrections/ aren't deleted — they're real, tested
infrastructure that might matter again later (e.g. ranking cross-reference results by real-world
frequency) — they're just no longer wired into what's interactive.

Category 1 (atomic, e.g. 木, 力) gets ONE group whose element is the character itself and IS
marked useful — atomic characters are exactly the kind of thing that recurs as a part of *other*
characters (that's what "atomic" means here), so they belong in the cross-reference index too.
Category 2 gets exactly 2 groups, one per named top-level part, each useful. Category 3 (1,175
characters, 17.5% — see compute_structure) gets ONE group for the whole character, marked NOT
useful — deliberately no attempt at a fake OR incomplete split; a missing split is honest, a wrong
or partial one isn't.

Usage:
    python3 build_bundle.py 06d77 09b31 068ee 08a9e 0660e
    python3 build_bundle.py --all
Output: apps/web/public/data/<codepoint>.json
"""

import argparse
import re
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "extract"))
from parse_kanjivg import parse_file  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = REPO_ROOT / "data-pipeline" / "kanjivg-source" / "kanji"
OUT_DIR = REPO_ROOT / "apps" / "web" / "public" / "data"
BASE_FILENAME = re.compile(r"^[0-9a-f]{5}\.svg$")


def resolve_named_child(child: dict) -> dict:
    """A top-level child with no `element` of its own is usually genuinely unnamed — but if it has
    EXACTLY ONE child of its own, and that single grandchild IS named, the child is a transparent
    single-item positional wrapper, not a real unnamed shape: parse_kanjivg.py's own docstring
    already describes bare kvg:position wrappers as "pure layout groupings with no element of their
    own" that "group other *named* children spatially." 今 is the clean example — its second
    top-level child carries no element itself but wraps exactly one grandchild, ヨ, which IS named;
    that name was already present one level down, this just stops discarding it.

    Deliberately narrow: only fires on exactly one named grandchild. Two or more named grandchildren
    (e.g. 㐬's wrapper has 2, 亮's has 3) is a different situation — a real 3+-part character with
    every piece genuinely named, just forced into a 2-slot model. Collapsing THAT case would either
    invent a combined name that doesn't exist or silently drop one of the real names, which is
    exactly the "wrong split teaches a false pattern" failure this pipeline exists to avoid — left as
    category 3 on purpose. Verified against the full dataset: 99 characters have the narrow
    exactly-one-named-grandchild shape this promotes; the other ~770 two-children-not-both-named
    characters don't and are unaffected. See data-pipeline/CLAUDE.md's structure section.

    Only element/radical/phon/original are borrowed from the grandchild — `id`/`position` stay the
    wrapper's own, since the wrapper's subtree (not just the grandchild's) is still the actual
    on-screen region (collect_all_strokes below walks the whole wrapper regardless of this).
    """
    if child.get("element"):
        return child
    grandchildren = child.get("children", [])
    if len(grandchildren) == 1 and grandchildren[0].get("element"):
        g = grandchildren[0]
        return {
            **child,
            "element": g.get("element"),
            "radical": g.get("radical"),
            "phon": g.get("phon"),
            "original": g.get("original"),
        }
    return child


def compute_structure(root: dict, gloss_index: dict) -> dict:
    """
    The highest-level (and, as of this pivot, the ONLY) framing of a character.

    category 1 — atomic, no top-level split (0 children; e.g. 川, 月). 5.6% of the dataset.
    category 2 — a clean two-part top-level split where BOTH parts are actually named (e.g.
                 海 = 氵 + 毎), after resolve_named_child above unwraps any transparent single-item
                 wrapper first (e.g. 今), AND both parts resolve to a real KANJIDIC2 gloss (see
                 the ungloss-downgrade check below this docstring) — "named" alone isn't enough.
                 Requiring both parts named (not just "exactly 2 children") matters — 鬱's root
                 also has exactly 2 children, but they're bare positional wrappers ("top"/"bottom")
                 with no element of their own AND no single named grandchild to resolve to either;
                 showing that as a clean split would be presenting "(unnamed) top / (unnamed)
                 bottom" as if it were as meaningful as 氵/每. Found by testing 鬱 specifically, not
                 by inspection.
    category 3 — everything else: 1 or 3+ named top-level children, exactly 2 children where at
                 least one is unnamed even after resolve_named_child (鬱's case, or a wrapper with 2+
                 named grandchildren like 㐬 — see that function's own comment for why those aren't
                 promoted too), a real, both-parts-NAMED split where at least one part still has
                 NO resolvable KANJIDIC2 gloss at all (real, confirmed case: 右 = 丆 + 口 — 丆 is a
                 genuine, KanjiVG-named character, just one obscure enough to have no KANJIDIC2 entry
                 of its own; the split isn't structurally fake, but presenting it as a clean 2-part
                 split left one part permanently un-glossable — a real gap, not "noise" the app
                 could just render inert and leave the other part alone: a split where only ONE side
                 has anything to teach isn't a complete pattern either, same "wrong split teaches a
                 false pattern" reasoning this pipeline already applies elsewhere, just triggered by
                 gloss-completeness instead of KanjiVG's own naming. Confirmed narrow: 177 of 5,328
                 real named-both-parts splits (3.3%) hit this before the fix — 3 of those because one
                 "part" was a bare KanjiVG-internal placeholder code (`CDP-...`), not a real character
                 at all, which this same check catches for free, no separate handling needed), OR a
                 split where either part carries KanjiVG's own `kvg:part` attribute (see the
                 split-radical-downgrade check below this docstring — real, confirmed case: 五
                 = "二"[part 1] + "二"[part 2], five's genuine traditional radical, not two real
                 copies of "two"). No default split
                 attempted for what remains; see build_bundle() and the module docstring's PIVOT note.

    `role` on a part is "meaning" when KanjiVG marks it as the classifying radical (kvg:radical —
    reliable for 96.2% of characters by long-standing dictionary convention) or "sound" only when
    KanjiVG explicitly marks kvg:phon (19.8% coverage) — deliberately null otherwise, never
    inferred by elimination for the other ~80%.
    """
    children = root.get("children", [])
    resolved_children = [resolve_named_child(c) for c in children]

    if len(children) == 0:
        category = 1
    elif len(children) == 2 and all(c.get("element") for c in resolved_children):
        category = 2
    else:
        category = 3

    # Ungloss-downgrade — "named" (KanjiVG says this shape has an identity) isn't the same bar as
    # "actually teachable" (KANJIDIC2 has something to say about it). A split where only one side
    # has a real English meaning isn't a complete pattern, so it doesn't get to be category 2 just
    # because the OTHER side is fine — real, confirmed case: 右 = 丆 (genuine KanjiVG name, no
    # KANJIDIC2 entry at all) + 口 ("mouth", real gloss). Checked BEFORE `parts` is built below, but
    # needs `resolve_gloss` on the same element/original pair `parts` will carry — computed here
    # directly off `resolved_children` rather than waiting for `parts` to exist, since `parts` is
    # unconditional (built for every category, unused by category 3) and this check needs to run
    # first to decide which category `parts` even ends up belonging to.
    if category == 2:
        for child in resolved_children:
            if resolve_gloss(child.get("element"), child.get("original"), gloss_index) is None:
                category = 3
                break

    # Split-radical downgrade — KanjiVG's OWN `kvg:part` attribute (extracted by parse_kanjivg.py,
    # never previously read by this pipeline at all) marks a group as a non-contiguous FRAGMENT of
    # one element that KanjiVG's authors split across the character, not a complete, independent
    # occurrence — real, confirmed case: 五 ("five") = two top-level children, BOTH literally named
    # "二" ("two", `kvg:part="1"`/`"2"`), because five's traditional Kangxi radical genuinely IS
    # "two" — a real classification fact, faithfully encoded, but not a real "five is built from two
    # copies of two" fact; presenting it as a clean split taught exactly the false pattern this
    # pipeline exists to avoid. Checking `kvg:part` specifically (not "both parts share the same
    # element name") is what keeps this from also breaking genuine reduplicated characters like 林
    # ("forest" = 木＋木, two REAL, independent, `kvg:part`-free trees, `position="left"/"right"`) —
    # confirmed by inspecting 林's own raw source before relying on this distinction. Applied
    # whenever EITHER part carries `kvg:part` at all, not just the unambiguous "both sides carry
    # sequential values" case (五, 亞, 冓, 巴, 平, 柬, 母, 甘) — a part marked as a fragment on only
    # one side (e.g. 主 = 亠 `kvg:part="1"` + 王, unmarked) is still KanjiVG's own statement that
    # THAT side isn't a complete, independent element, same "no single source of truth on whether an
    # edge case should really be split — default to false, for the user's sake" reasoning already
    # applied to the ungloss check above, deliberately not re-litigated per character. Confirmed
    # narrow against the real dataset: 43 of 5,151 category-2 characters (0.8%) carry `kvg:part` on
    # either side.
    if category == 2 and any(child.get("part") for child in resolved_children):
        category = 3

    parts = []
    for child in resolved_children:
        role = "meaning" if child.get("radical") else ("sound" if child.get("phon") else None)
        parts.append({
            "node_id": child["id"],
            "element": child.get("element"),
            "position": child.get("position"),  # e.g. "left"/"right"/"top"/"bottom", or None
            "role": role,
            "original": child.get("original"),  # e.g. 氵's original is 水 — see resolve_gloss()
        })
    return {"category": category, "parts": parts}


def load_gloss_index() -> dict:
    """character -> {gloss, on, kun, grade, strokeCount, jlpt}, from
    data-pipeline/gloss/build_gloss_index.py (KANJIDIC2). See that script and root CLAUDE.md Data
    source for what this is and isn't."""
    path = Path(__file__).resolve().parents[1] / "gloss" / "gloss_index.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


RADICAL_NUMBER_GLOSS = re.compile(r"^radical number \d+$", re.IGNORECASE)


def resolve_gloss(element: str | None, original: str | None, gloss_index: dict) -> str | None:
    """氵 (a visual variant of 水) often has no clean entry of its own in KANJIDIC2 — fall back to
    the original/canonical form KanjiVG already tells us about. This is the actual mechanism that
    makes 氵 show "water": not a special case, just preferring the canonical form when the variant
    itself comes up empty. Verified: 98.3% of category-2 parts resolve this way (direct or via
    original) against the real dataset before this was wired in.

    Real, confirmed bug this docstring used to claim was already handled and wasn't — 亻 does NOT
    show "person" through this mechanism, because 亻 has its OWN direct KANJIDIC2 entry, so the
    element-lookup branch below returns before the original-fallback branch ever runs — the fallback
    only fires when the direct lookup comes up EMPTY, and 亻's own entry isn't empty, it's just
    useless: KANJIDIC2's own gloss for it is the literal string "radical number 9" (a small,
    inconsistent KANJIDIC2 quirk affecting exactly ONE character in the whole 13,108-entry gloss
    index — 氵/忄/扌/犭's own direct entries are genuinely "water"/"heart"/"hand"/"dog", real,
    correct, semantic glosses; 亻 alone got a bare radical-number placeholder instead of "person").
    Surfaced by real Flashcards testing, not found by inspection — confirmed live in 189 real,
    currently-shipping characters (休, 他, 住, 代, 何, 作, 信, 体, 便, 化, 供, 個, ... — common,
    beginner-taught kanji, which is why this read as "constant" rather than rare). The fix:
    RADICAL_NUMBER_GLOSS treats a matching direct-lookup gloss as if it were empty, same as a
    genuinely missing one, so it falls through to the `original` branch below exactly the way a
    real gap already does — no special-casing 亻 by name, since the pattern (not the specific
    character) is what's actually unreliable, and KANJIDIC2 could plausibly have the same quirk on
    some other radical form this dataset doesn't currently expose."""
    if element and element in gloss_index:
        gloss = gloss_index[element].get("gloss")
        if gloss and not RADICAL_NUMBER_GLOSS.match(gloss):
            return gloss
    if original and original in gloss_index:
        gloss = gloss_index[original].get("gloss")
        if gloss:
            return gloss
    return None


def resolve_character_info(character: str, original: str | None, gloss_index: dict) -> dict:
    """Readings + misc stats (on'yomi/kun'yomi/grade/strokeCount/jlpt) for the WHOLE character
    only — parts never get these, just their own `gloss` via resolve_gloss above. Same
    element-then-original fallback as resolve_gloss, for the same reason: a rare visual variant
    with no entry of its own falls back to KanjiVG's own declared original/canonical form."""
    entry = gloss_index.get(character) or (gloss_index.get(original) if original else None) or {}
    return {
        "on": entry.get("on", []),
        "kun": entry.get("kun", []),
        "grade": entry.get("grade"),
        "strokeCount": entry.get("strokeCount"),
        "jlpt": entry.get("jlpt"),
    }


def collect_all_strokes(node: dict) -> list:
    """Every stroke in this subtree, regardless of depth — this is what makes a coarse group's
    region visually complete even though its internal structure is no longer separately exposed."""
    strokes = list(node.get("strokes", []))
    for child in node.get("children", []):
        strokes.extend(collect_all_strokes(child))
    return strokes


def build_bundle(svg_path: Path, gloss_index: dict) -> dict:
    result = parse_file(svg_path)
    root = result["tree"]
    structure = compute_structure(root, gloss_index)
    groups = []

    if structure["category"] == 2:
        # The root itself can ALSO directly own strokes even when it has exactly 2 named children
        # (e.g. 母 — 2 strokes on the root, plus two 毋 children with the rest). Same bug class as
        # 川 losing its strokes earlier — caught this time by verify_coverage.py before it shipped,
        # not by a human noticing. Attributed to the first part rather than dropped or given a 3rd
        # region — category 2 is exactly 2 regions, no exceptions, per this pivot.
        root_only_strokes = [{"d": s["d"]} for s in root.get("strokes", [])]
        for i, (part, child_node) in enumerate(zip(structure["parts"], root["children"])):
            strokes = [{"d": s["d"]} for s in collect_all_strokes(child_node)]
            if i == 0:
                strokes = root_only_strokes + strokes
            groups.append({
                "node_id": part["node_id"],
                "element": part["element"],
                "position": part["position"],
                "role": part["role"],
                "gloss": resolve_gloss(part["element"], part["original"], gloss_index),
                "useful": True,
                "strokes": strokes,
            })
    elif structure["category"] == 1:
        element = root.get("element")
        groups.append({
            "node_id": root["id"],
            "element": element,  # the character itself — see module docstring
            "position": None,
            "role": None,
            "gloss": resolve_gloss(element, root.get("original"), gloss_index),
            "useful": True,
            "strokes": [{"d": s["d"]} for s in collect_all_strokes(root)],
        })
    else:  # category 3 — no reliable split, one honest whole-character region, not a fake split
        groups.append({
            "node_id": root["id"],
            "element": None,
            "position": None,
            "role": None,
            "gloss": None,
            "useful": False,
            "strokes": [{"d": s["d"]} for s in collect_all_strokes(root)],
        })

    character_info = resolve_character_info(result["character"], root.get("original"), gloss_index)
    return {
        "codepoint": result["codepoint"],
        "character": result["character"],
        # The whole character's own meaning — needed by all 3 categories (e.g. 蜜 -> "honey"),
        # distinct from any part's gloss.
        "gloss": resolve_gloss(result["character"], root.get("original"), gloss_index),
        # on'yomi/kun'yomi readings + a few misc stats — whole-character only, same as gloss above,
        # never resolved per-part. See resolve_character_info's own docstring for the fallback.
        "on": character_info["on"],
        "kun": character_info["kun"],
        "grade": character_info["grade"],
        "strokeCount": character_info["strokeCount"],
        "jlpt": character_info["jlpt"],
        "structure": structure,
        "groups": groups,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("codepoints", nargs="*")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    gloss_index = load_gloss_index()
    if not gloss_index:
        print("Warning: no gloss index found (run gloss/build_gloss_index.py first) — "
              "bundles will have no English glosses.", file=sys.stderr)

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
            bundle = build_bundle(svg_path, gloss_index)
        except Exception as e:  # noqa: BLE001
            failed.append((svg_path.name, str(e)))
            continue
        out_path = OUT_DIR / f"{bundle['codepoint']}.json"
        out_path.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")
        ok += 1

    print(f"Built {ok} bundle(s) -> {OUT_DIR}")
    if failed:
        print(f"Failed {len(failed)}:")
        for name, err in failed[:10]:
            print(f"  {name}: {err}")


if __name__ == "__main__":
    main()
