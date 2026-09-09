# genki/genkiKanji.json

The 317 kanji taught across Genki I (lessons 3–12) and Genki II (lessons 13–23), grouped by lesson
— the real deck data behind every `genki-lesson-N` button's actual review session
(`mountFlashcardSession`, `apps/web/CLAUDE.md`'s own "Flashcards" section).

**Source:** [cemulate/genki-db](https://github.com/cemulate/genki-db)'s
`src/assets/kanji.json` (MIT-licensed repo; the kanji-to-lesson mapping itself is factual
curriculum data, not creative expression — same reasoning as vendoring KanjiVG/KANJIDIC2, root
`CLAUDE.md` Data source section). Retrieved 2026-09-02.

**Verified against the count of 317 the [official GENKI app](https://apps.apple.com/us/app/id1551595310)
advertises**, confirmed no duplicate characters across lessons, and spot-checked lesson 3
(一二三四五六七八九十百千万円時) against the well-known canonical list.

**Shape:** `{ "<lesson number 3-23>": [{ kanji, gloss, on, kun, examples }, ...] }`, in the source's
own per-lesson order (already textbook-introduction order, not re-sorted). `on`/`kun` are arrays of
reading strings, split from the upstream single `"On; On; kun"`-style field by script (katakana →
`on`, hiragana → `kun`) — same field names as `data-pipeline/export/build_bundle.py`'s own
character-level `on`/`kun`, since it's the same concept, but this data is NOT produced by that
pipeline (no KanjiVG geometry involved) and intentionally lives here instead, next to the app code
that will actually consume it. `々` (lesson 12, the repetition mark) has no real reading, so both
arrays are empty for it — expected, not a data bug.

`examples` is an array of `{ word, reading, gloss }` — real compound words that use this kanji,
straight from that same upstream source's own per-kanji `Examples` field (dropped in an earlier
pass, restored once the flashcard mini-lesson screen needed real example vocabulary to show on a
"didn't get it" — apps/web/CLAUDE.md's own flashcards section). Capped at the first 4 (source
ranges 0–32 per kanji, averaging ~5.9; kept in the source's own order — not re-ranked by simplicity
or frequency, since there's no honest data to rank by here). `天` and `重` have `examples: []` —
the upstream source itself has none for those two, not something lost in this transform.

Regenerating: no live script committed (this was a one-off transform of a small, static, hand-
compiled community list, not a large upstream feed worth a maintained pipeline stage). To redo it,
fetch the source JSON above, group by its `Lesson` field, split `Reading` on `;`/`；`, and take the
first 4 of each entry's own `Examples` array as `{word: Example, reading: Reading, gloss: Definition}`.
