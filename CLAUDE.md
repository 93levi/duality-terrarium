# Kanji Terrarium

## Concept

Native readers build kanji pattern-recognition subconsciously, through years of repeated exposure.
Kanji Terrarium externalizes that: render any kanji in interactive 3D, split it into its real
top-level parts, and show every other kanji that shares a given part — one click. That
cross-reference is the whole mechanic. Everything else (3D, AR, flashcards, AWS) is presentation
on top of it.

The mechanism doesn't require etymological accuracy (same reason Heisig/WaniKani work without it)
— what matters is that recognizing a shape once pays off every time it reappears. So the question
this app answers per character is structural, not semantic: **does this character split into real
named parts, and what else has those same parts?**

## How a character is classified

Every character gets one of three categories, computed from KanjiVG's own structure plus KANJIDIC2
gloss availability — no LLM, no frequency thresholds, no per-character judgment:

- **Atomic** (5.6%, e.g. 川, 木, 力) — no split, one region.
- **Two-part split** (76.2%, e.g. 海 = 氵 + 毎, or 今 = 人 + 一 via the wrapper-unwrap below) —
  exactly two named top-level parts, each its own region, labeled with position (left/right/top/
  bottom) and role (meaning/sound, only when KanjiVG says so explicitly — never guessed), both
  parts resolve to a real KANJIDIC2 gloss — a genuine KanjiVG name with nothing to teach (e.g. 右's
  own 丆, real but too obscure for any KANJIDIC2 entry) downgrades the whole split to irregular
  instead — and neither part is a KanjiVG-flagged fragment of a single split-across-the-character
  element (e.g. 五 = "two" + "two", five's genuine traditional radical, not two real copies of
  "two" — real reduplication like 林 = 木 + 木, two actually-independent trees, is unaffected),
  `data-pipeline/CLAUDE.md`'s own structure section for both.
- **Irregular** (18.2%, 1,218 characters) — no clean, fully-glossed, non-fragmentary split. Shown
  as one region, no fake split.

Full detail: `data-pipeline/CLAUDE.md`.

## Data source

[KanjiVG](https://github.com/KanjiVG/kanjivg) — CC BY-SA, 6,703 base characters. Pure stroke
geometry + structure, zero meanings. Vendored into `data-pipeline/kanjivg-source/`.

[KANJIDIC2](http://www.edrdg.org/wiki/index.php/KANJIDIC_Project) — EDRDG, CC BY-SA. Pure lexical
data (English meanings, readings), zero stroke geometry. Vendored into
`data-pipeline/kanjidic-source/`. Supplies the English gloss shown per part and per character
(95.7%/98.3% coverage — see `data-pipeline/CLAUDE.md`), plus (whole character only, not per-part)
on'yomi/kun'yomi readings and grade/stroke-count/JLPT stats.

Both gitignored, regenerate from upstream — neither dataset replaces the other, they're joined on
the raw character.

## Repo map

- `data-pipeline/` — offline Python. KanjiVG → classified, render-ready dataset. Fully mechanical,
  no API key needed. See its own CLAUDE.md.
- `packages/kanji-schema/` — not started. `data-pipeline/export/build_bundle.py`'s output shape is
  the de facto schema until this exists.
- `apps/web/` — Vite + vanilla JS + Three.js. Three real screens now: a home page (moss terrarium +
  a mode-picker box), the original classification test tool ("Dictionary" — type a kanji, see its
  split, click through to related kanji), and that same Dictionary experience scoped to a real
  textbook lesson — labeled "Textbooks" in the UI, internally still "flashcards" → a deck (genki
  1/genki 2, minna no nihongo 1/2 today) → a lesson. Fully static, no accounts. See its own CLAUDE.md,
  especially "The home page" and "Flashcards".
- `infra/` — AWS. Empty on purpose — nothing goes here before Phase 3.

## Phasing

0. **Data pipeline** — done. Category-based classification, fully mechanical, verified across the
   whole dataset (`data-pipeline/export/verify_coverage.py`).
1. **Full dataset** — done. All 6,703 characters processed; classification quality has no finish
   line by design (category 3's 1,218 irregular characters — 1,100 until a lossless wrapper-unwrap
   fix recovered 102 of them, then +177 once a real, confirmed gap (a genuinely-named split where
   one part has no KANJIDIC2 gloss at all — 右 = 丆 + 口) got the same "no fake/incomplete split"
   treatment, then +43 more once a SECOND real gap was found the same way (real Flashcards testing
   on beginner kanji): a genuinely-named split where either part is a KanjiVG-flagged FRAGMENT of
   one element split across the character (`kvg:part`) rather than a real independent component —
   五 = "two" + "two" (five's genuine traditional radical, not two real copies of "two") is the
   textbook case; real reduplication like 林 = 木 + 木 is unaffected, `data-pipeline/CLAUDE.md`'s own
   structure section for both — are a known, deferred, prioritizable gap).
2. **Web MVP — in progress, as a test tool**: 3D viewer, structural framing on load, English
   glosses per part and per character (KANJIDIC2), click-through cross-reference. Noise regions are
   now genuinely inert everywhere (hover/click only ever respond to useful parts,
   `src/viewer/scene.js`'s `ignoreNoiseHover`) — the classifier-verification red-highlight used to be
   deliberate here, retired for reading as a developer/test-tool behavior a learner should never see.
3. **AWS backend** — not before there's a real persistence need (accounts, SRS progress).
4. **WebXR AR toggle.**
5. **Merge in the separately-prototyped UI/aesthetic layer** — a first pass of this jumped the
   queue: `apps/web/` now has a full choreographed home page built around the moss terrarium (see
   its own CLAUDE.md, "The home page"), deliberately built *before* Phase 3/4, at the user's request.
   **No accounts at all, by explicit decision — this is a fully static app.** A dummy login/signup
   layer existed here for a while (a hardcoded `email`/`123` check, purely to have real stage
   transitions to choreograph animation against) — removed entirely, not left as a placeholder: a
   real accounts system is still Phase 3 territory, genuinely not started, and until it exists there's
   nothing here that NEEDS login, so the dummy layer was pure overhead. Welcome now goes straight to
   select mode with one click, no gate (apps/web/CLAUDE.md, "One box, every stage").
   **"Flashcards" is no longer just navigation — every real Genki lesson button now starts a real
   lesson-scoped browsing screen** (`mountDictionary({ lessonNumber })`, apps/web/CLAUDE.md's own
   "Flashcards" section) — REDESIGNED since the paragraph above was first written: Flashcards is
   Dictionary mode itself now, parameterized rather than forked, not a separate review-queue
   implementation. `flashcards` still leads straight to a deck picker — genki 1/genki 2 AND, since,
   minna 1/minna 2 (Minna no Nihongo, apps/web/CLAUDE.md's own "A second deck" section) — not through
   a menu — that menu's other option, `custom`,
   no longer exists at all (removed alongside login: a custom deck needs real per-user storage a static
   app doesn't have). No grading, no queue, no session-completion state at all now — a deliberate MVP
   choice after the earlier reveal-then-grade design stopped feeling right, not a downgrade in
   progress: a real SM-2 spaced-repetition module (`apps/web/src/srs/`) is still built and sitting
   unused, specifically for a FUTURE custom-decks feature where due-date-gated review actually fits,
   unlike a fixed weekly Genki assignment; that's still its own later phase (deck building, per-kanji
   SRS progress, real storage — Phase 3 territory once it happens). The original review-queue
   implementation (`mountFlashcardSession`) is still fully defined in `main.js`, just unreferenced from
   any live UI path — a one-line revert away if the redesign doesn't pan out. `guide`
   — select-mode's other placeholder, alongside the now-removed `custom` above — has since been
   removed entirely too, not left inert (apps/web/CLAUDE.md's "One box, every stage"): select-mode is
   now dictionary/flashcards/exit, no fourth option. Dictionary mode itself also picked up real polish this pass —
   a genuine (not simulated) loading state tied to the swoop-in's own real duration, the 3D model
   locked non-interactive for that same window (apps/web/CLAUDE.md, "Loading a new character"), and
   — added later in this same phase — a kanji still on screen when "close dictionary" is clicked now
   visibly dissolves away instead of just vanishing (apps/web/CLAUDE.md, "Closing dictionary with a
   kanji still up"). Closing dictionary, and leaving a flashcard session early, both now return to
   select mode rather than all the way to welcome (`mountHome(startAtSelectMode)`,
   apps/web/CLAUDE.md's own "One box, every stage"). **Welcome's own `about` button is no longer a
   placeholder either** — it opens a near-fullscreen glass overlay whose content is a genuinely
   separate static page (`apps/web/public/about-terrarium/`, own HTML/CSS/JS/Babylon, no build step,
   no shared code with this app), ported from a completely unrelated personal-portfolio project by the
   same author (apps/web/CLAUDE.md's own "About overlay" has the full grilled spec and every decision
   behind it). **"Flashcards" is renamed "Textbooks" in the UI** — select-mode's own option and the
   deck picker it opens are now labeled/glyphed 'textbooks'/教科書, not 'flashcards'/単語 (単語 never
   really fit — a single kanji pulled from a lesson isn't "a word" — and the feature is fundamentally
   about browsing real textbooks lesson by lesson). Deliberately UI-only, by explicit decision: every
   internal name (`data-mode="flashcards"`, `mountFlashcardSession`, `renderFlashcardsDecks`, the
   `#dev-skip-to-flashcards`/`?view=flashcards` dev shortcuts, and this doc's own "Flashcards" section
   name) stays unchanged — only what a learner actually sees changed. The lesson-mode corner glyph
   (`mountDictionary`'s own `searchBox`) reverted from the now-retired shared 単語 back to its earlier
   value, 授業 ("lesson/class"), same pass. Full detail: apps/web/CLAUDE.md's own "Flashcards →
   Textbooks rename". **The radio player is now a persistent, app-wide audio layer** — grilled first
   (`/grill` session), explicit request: since this is a one-page app, music has no real reason to
   stop unless something actually pauses it, so it now survives Dictionary, every lesson screen, and
   a full trip back to welcome, picking up exactly where it left off (track/position/volume) whenever
   select mode is revisited. This is the FIRST exception to this file's own "nothing survives a
   mountHome() teardown" rule, deliberately scoped as narrowly as possible: only the playback engine
   (`RADIO_PLAYLIST`/`radioTrackIndex`/`radioAudio`, module-scope in `main.js`, above `mountHome`)
   persists — the visual player box is still rebuilt fresh every single mount, just painted from the
   engine's live state instead of always resetting. Also picked up a real track-picker dropdown in
   the same pass (explicit request — next/prev alone wasn't "pick any song you want"), reusing this
   app's own established `.mode-option` list look rather than a new one. Full detail: apps/web/
   CLAUDE.md's own "Persistent radio engine" and "Track-picker dropdown" sections.

## Working conventions

- **Local-first data** through Phase 2. No AWS before Phase 3.
- **Classification lives in data, not code** — never hand-edit generated output; fix the source and
  regenerate. Bias when uncertain: exclude, not include. A missed split is just today's rote
  memorization; a wrong one teaches a false pattern.
- **One Claude Code chat per phase/folder.** This file and each subfolder's CLAUDE.md are the
  handoff between chats — don't rely on prior chat history. Write non-obvious decisions here, not
  just in conversation. Keep these docs current-state-first — when something changes, rewrite the
  relevant section rather than layering a "we used to think X" note on top of it.
