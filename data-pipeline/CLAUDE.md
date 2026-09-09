# data-pipeline

Offline, Python. Produces the static dataset `apps/web` reads. Nothing here runs at request-time.

## How it works

Every character gets a **category**, computed once from KanjiVG's own structure — no LLM, no
frequency thresholds, no judgment calls:

- **Category 1 — atomic** (5.6% of the dataset, e.g. 川, 木, 力): no split. One region, the whole
  character. Marked useful — atomic characters are exactly the components other characters reuse.
- **Category 2 — two-part split** (76.2%, e.g. 海 = 氵 + 毎): exactly two top-level children, both
  actually *named* — including via one wrapper-unwrap step (`build_bundle.py`'s
  `resolve_named_child`, below) before that check runs — both parts actually resolve to a real
  KANJIDIC2 gloss (the ungloss-downgrade check, below the wrapper-unwrap note) — "named" alone isn't
  a high enough bar; see that note for why — AND neither part is a KanjiVG-flagged FRAGMENT of one
  element split across the character (the split-radical-downgrade check, right after the
  ungloss-downgrade note). Two regions. Each part carries `position`
  (left/right/top/bottom/etc., from `kvg:position`) and `role` — `"meaning"` when KanjiVG marks the
  classifying radical (`kvg:radical`, 96.2% coverage) or `"sound"` only when explicitly marked
  (`kvg:phon`, 19.8% coverage). Never inferred by elimination for the other ~80% — `null` instead of
  a guess.
- **Category 3 — irregular** (18.2%, 1,218 characters): everything else — 1 or 3+ named parts, 2
  parts where at least one is *still* unnamed after the wrapper-unwrap below (e.g. 鬱's bare
  "top"/"bottom" wrappers, which have no single named child to unwrap to; 烏's single "鳥" child,
  itself nesting deeper into a shape — 灬 — that would be actively *wrong* to gloss as "fire" here,
  since it means legs/tail in bird characters, not fire, despite being visually identical to the
  real fire radical), a real, both-parts-named split where at least one part still has no
  KANJIDIC2 gloss at all (the ungloss-downgrade check, below), OR a real, both-parts-named,
  both-parts-glossed split where either part is still a KanjiVG-flagged fragment of one
  split-across-the-character element (the split-radical-downgrade check, below). **No split is
  attempted.** One honest whole-character region beats a fake, incomplete, or fragmentary split.

  **Wrapper-unwrap, `resolve_named_child()` in `build_bundle.py`.** A top-level child with no
  `element` of its own is usually genuinely unnamed — but KanjiVG sometimes wraps a single real
  named part in an extra, purely positional `<g>` that carries no name of its own (e.g. 今 = a named
  人 top child + a second top-level child with no element itself but exactly one grandchild, ヨ,
  which *is* named). `parse_kanjivg.py`'s own docstring already calls these "pure layout groupings
  with no element of their own" — the fix just stops discarding the name one level down instead of
  treating the wrapper as a dead end. Only fires on *exactly one* named grandchild: `id`/`position`
  stay the wrapper's own (it's still the real on-screen region), only
  `element`/`radical`/`phon`/`original` are borrowed for naming/glossing. Deliberately does NOT fire
  on a wrapper with 2+ named grandchildren (e.g. 㐬's wrapper has 2, 亮's has 3, 僉's has 5) — those
  are genuine 3+-part characters where every piece is really named, just more than the category-2
  model's 2-slot cap allows; collapsing them would mean either inventing a combined name that
  doesn't exist or silently dropping a real one, exactly the "wrong split teaches a false pattern"
  failure this pipeline exists to avoid — left as category 3, on purpose, pending a possible future
  3+-part category (a real UI/rendering scope change, not a data fix — apps/web currently assumes
  at most 2 regions throughout). Landed 2026-09-04: +102 characters moved from category 3 to 2 (99
  from the single-named-grandchild case directly, e.g. 今; +3 more where *both* top-level children
  were single-item wrappers that each independently resolved, e.g. 丱 = 丿+丨). 998 category-3
  characters have no name anywhere in the tree, at any depth, the honest floor for this half of the
  check; see "Not currently used, not deleted" below for why hand-naming these instead isn't the
  plan. The remaining 177 (see the ungloss-downgrade note right below) DO have a name at every
  level — they just have nothing to teach on one side of it.

  **Ungloss-downgrade, same function, right after the category-2 structural check.** Surfaced by
  real Flashcards testing on beginner (Genki-lesson) kanji, not found by inspection — 右 ("right"),
  a real Genki 1 character, split cleanly into 丆 + 口 by the structural rule above: both genuinely
  *named* by KanjiVG, so category 2 by that check alone. But 丆 is a genuine, if extremely obscure,
  Unicode character with NO entry anywhere in KANJIDIC2 — nothing to gloss, nothing to teach, a
  permanently blank/broken-looking half of what should be a two-sided lesson. The fix: after the
  structural category-2 check passes, resolve BOTH parts' glosses (`resolve_gloss`, same
  element-then-`kvg:original` fallback everything else here uses) — if EITHER comes back `None`,
  downgrade to category 3 instead. "Named" isn't the bar any more; "named AND actually teachable" is.
  A split where only one side has anything to say isn't a complete pattern either — same "wrong
  split teaches a false pattern" reasoning this pipeline already applies to the structural check,
  just triggered by gloss-completeness instead of KanjiVG's own naming; catches 3 KanjiVG-internal
  placeholder codes (`CDP-...`, not real characters at all) for free too, no separate handling
  needed. Confirmed narrow before shipping, not assumed: 177 of 5,328 real both-parts-named splits
  (3.3%) — bounded by the SAME per-part gloss-coverage rate already measured just below, not
  something further edge-case-hunting could keep eroding.

  **Split-radical-downgrade, same function, right after the ungloss-downgrade check.** Also
  surfaced by real Flashcards testing, a genuinely different failure mode from the ungloss case
  above — real, confirmed case: 五 ("five") = two top-level children, BOTH literally named "二"
  ("two"), each carrying `kvg:part="1"`/`kvg:part="2"`. Both structural checks above pass (both
  named, both glossed — "two" is a perfectly real KANJIDIC2 entry) and the character IS genuinely
  filed under the "two" radical in traditional dictionaries, so this isn't invented data — but "五 is
  built from two copies of 二" isn't a real compositional fact, it's a radical-classification
  artifact, and presenting it as a clean 2-part split (the same visual/interactive treatment 海=氵+毎
  gets) taught exactly the false pattern this pipeline exists to avoid. `kvg:part` is KanjiVG's OWN
  attribute for exactly this situation — it marks a group as a non-contiguous FRAGMENT of one
  element the character's authors split apart, not a complete, independent occurrence — extracted by
  `parse_kanjivg.py` (`GROUP_ATTRS`) from the start but never actually READ anywhere in this pipeline
  until now. The fix: downgrade to category 3 if EITHER resolved top-level child carries `kvg:part`
  at all, checked directly off `resolved_children` (same as the ungloss check, before `parts` is
  built). Deliberately checks `kvg:part` specifically, NOT "both parts share the same element name"
  — the latter would also break real, correct reduplicated characters (confirmed by inspecting 林's
  own raw source before relying on this distinction: 林 = "木"+"木", two genuinely independent trees,
  `kvg:position="left"/"right"`, no `kvg:part` anywhere) — same-name-both-sides is a MIX of real
  reduplication and split-radical artifacts, `kvg:part` presence is the actual, unambiguous signal
  KanjiVG itself provides for telling them apart. Applied whenever `kvg:part` appears on EITHER
  side, not just the clearest "both sides carry sequential values" case (五, 亞, 冓, 巴, 平, 柬, 母,
  甘) — a part marked as a fragment on only one side (e.g. 主 = 亠 `kvg:part="1"` + 王, unmarked) is
  still KanjiVG's own statement that THAT side isn't a complete, independent element on its own,
  same "no single source of truth on whether an edge case should really be split — default to
  false, for the user's sake" reasoning already applied to the ungloss check, deliberately not
  re-litigated per character rather than hand-verifying each of the 35 murkier cases individually.
  Confirmed narrow before shipping: 43 of 5,151 real, glossed, both-parts-named splits (0.8%) carry
  `kvg:part` on either side.

Every character and every category-2 part also gets an English `gloss`, from KANJIDIC2 (a
completely separate dataset from KanjiVG — pure lexical data, readings/meanings/codes, zero stroke
geometry; KanjiVG has zero lexical data — neither replaces the other, this is the join between
them, keyed on the raw character both already share). A part's own visual form often has no clean
entry (氵 is a rare radical variant) — falls back to `kvg:original` (氵's original is 水) when
present, which is what actually makes 氵 show "water". Verified coverage: 95.7%
of whole characters; category-2 parts are 100% BY CONSTRUCTION now (the ungloss-downgrade check
just above means a part with no resolvable gloss can no longer exist in a live category-2 result at
all — it downgrades the whole character instead) — 98.3% was the real, measured rate (direct +
via-original combined) before that check existed; it's what the 177-character/3.3% figure above is
measured against.

**`RADICAL_NUMBER_GLOSS`, `resolve_gloss`'s own filter (`build_bundle.py`).** A real, confirmed
correction to a claim THIS FILE used to make — 亻 did NOT actually show "person" through the
original-fallback mechanism above, because 亻 has its own direct KANJIDIC2 entry, so the
element-lookup branch returned before the original-fallback branch ever ran; the entry just wasn't
useful — KANJIDIC2's own gloss for 亻 is literally the string "radical number 9", not a real
meaning. Confirmed narrow in the SOURCE data (exactly 1 of 13,108 gloss-index entries matches this
pattern — 氵/忄/扌/犭's own direct entries are genuinely "water"/"heart"/"hand"/"dog", real semantic
glosses, not the same quirk) but high-impact in the LIVE dataset — 189 currently-shipping
characters carry 亻 as a part, many of them common, beginner-taught kanji (休, 他, 住, 代, 何, 作,
信, 体, 便, 化, 供, 個...), which is why this read as constant rather than rare. The fix: treat a
gloss matching `^radical number \d+$` as if it were empty, same as a genuinely missing one, so it
falls through to the `original` branch exactly the way a real gap already does — not special-cased
to 亻 by character, since the PATTERN is what's unreliable, not that one character specifically; a
category shift never happens from this fix (亻's gloss was already non-null, just wrong, so the
ungloss-downgrade check above never saw it as missing either way) — purely a display-quality
correction across those 189 characters, verified via a full pipeline re-run showing identical
category counts before and after.

The WHOLE character (never a part) also gets `on`/`kun` readings and `grade`/`strokeCount`/`jlpt`
stats, same KANJIDIC2 source, same element-then-`kvg:original` fallback as `gloss`. Deliberately
NOT included: `nanori` (name-only readings) — these lists run to 15+ entries on some characters
(海 alone has 15) and are mostly noise outside actually reading names. `jlpt` specifically:
KANJIDIC2 documents this field as based on the OLD 4-level test (pre-2010 revision, 1=hardest
through 4=easiest) and no longer officially maintained — the web app formats the raw number as
"JLPT N{level}" (matching the familiar modern label people actually recognize) rather than
surfacing "(old)"/the pre-2010 framing to the user; see `apps/web/CLAUDE.md`'s `#search-selected`
section for the display side of this. Only `strokeCount`/`jlpt` are actually shown right now —
`on`/`kun`/`grade` are extracted and present in every bundle but not currently displayed anywhere
(a display choice made after `on`/`kun` were briefly shown and then deliberately narrowed back
down; re-adding them is a formatting change in `apps/web/src/main.js`, not new extraction work).

## Pipeline

1. `extract/parse_kanjivg.py` — KanjiVG SVG → stroke/group JSON tree. Deterministic, no LLM.
2. `gloss/build_gloss_index.py` — KANJIDIC2 XML → `{character: {gloss, on, kun, grade,
   strokeCount, jlpt}}`. Run once; rerun only if `kanjidic-source/` changes. Output:
   `gloss/gloss_index.json`. (13,108 characters indexed — a superset of characters with just a
   gloss, since some have readings/stats but no primary English meaning.)
3. `export/build_bundle.py` — computes category, builds the render groups above, resolves each
   group's own `gloss` plus the whole character's `gloss`/`on`/`kun`/`grade`/`strokeCount`/`jlpt`.
   This is the entire classification + glossing logic; nothing else feeds it. Output:
   `apps/web/public/data/<codepoint>.json`.
4. `export/verify_coverage.py` — run after any change to `extract/` or `export/`. Verifies every
   stroke in the source reaches the bundle (strict count parity, independent of whether the split
   itself is right). Currently 6,703/6,703 pass.
5. `export/build_component_index.py` — reverse index, element → every other character where it's
   also a region. The actual payoff: click a region, see every other kanji sharing it. Rerun after
   any `build_bundle.py` change. Output: `apps/web/public/data/_index.json`, fetched once by the app.

Rerun order after any pipeline change: `build_bundle.py --all` → `build_component_index.py` →
`verify_coverage.py`.

## Not currently used, not deleted

`enrich/` (`component_frequency.py`, `dial.py`, `classify.py`, `preview_dial.py`) and
`corrections/overrides.json` — a fine-grained, per-node frequency classifier, fully built and
tested, superseded by the category model above. Kept because it might matter again (ranking
cross-reference results by real-world frequency; a future "drill deeper inside one half" feature).
If `build_bundle.py` ever imports from `enrich/dial.py` again, that's a regression — the category
model doesn't need it for anything currently built.

No `ANTHROPIC_API_KEY` or LLM call anywhere in this pipeline. Categories 1 and 2 (81.8% of the
dataset) are fully mechanical. Category 3 is where real judgment would eventually help — do that
as a prioritized batch review of a finite list, not per-character, if it's ever tackled.

## Lessons worth not re-learning

- **Rendering completeness must never depend on classification/grouping logic being right.** Two
  separate real bugs, same class, both caught by `verify_coverage.py` (built after the first one):
  川 lost all its strokes because an atomic character with zero sub-grouping fell through every
  branch; 母 lost 2 strokes because its root owns strokes directly *in addition to* having 2 named
  children, and an early rewrite only walked the children.
- **KanjiVG's SVG root declares one `xmlns:kvg` URI; each file's internal DTD secretly overrides
  it to a different one.** Get the namespace constant in `extract/parse_kanjivg.py` wrong and
  every `kvg:` attribute silently parses as absent, no error.
- **Independent per-item judgment isn't consistent, even from the same reasoner** — demonstrated
  in-session reversing a verdict on the same component twice, minutes apart, no new information.
  This is the actual argument for the category model being purely structural rather than another
  round of per-node judgment calls.
