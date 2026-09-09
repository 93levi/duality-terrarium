# apps/web

Vite + vanilla JS + Three.js, no router (see "The home page" below): a home page, the original
classification test tool ("Dictionary" — hover there responds to non-useful regions too, red
highlight, so the split itself can be verified directly, not just the polished UX), and a lesson-scoped
version of that same Dictionary browsing experience for real textbooks — Genki and Minna no Nihongo —
labeled "Textbooks" in the UI now, internally still "flashcards" throughout (see "Flashcards →
Textbooks rename" and "Flashcards — Dictionary itself, scoped to a lesson" below for both); the
3D viewer itself (`src/viewer/`) is a shared mount point for the latter two, never both at once, never
with the terrarium — "Hard architectural boundary" just below has the exact rule. This is a fully
static app, no accounts, on purpose (see "One box, every stage" below for why login/signup were built
then removed entirely) — see root `CLAUDE.md` phasing before adding any real persistence here (AR,
real accounts, a custom-decks feature). Neither placeholder that used to exist here is still around:
`custom` was removed along with login, and `guide` (select-mode's own inert "walkthrough" stub) has
since been removed too, not left inert — see "One box, every stage" below for both. No "UI skeleton,
not a real feature yet" case is left in this app right now.

## The home page

Started from a `/grill` session (see that skill if unfamiliar); has since grown a full choreographed
state machine, not the static skeleton that session originally produced. Everything below is
current-state-first — read this whole section before touching `src/main.js`'s `mountHome()` or
`src/ui/mossBox.js`'s `regenerate()`/`regenerateBox()`.

**App shell — `src/main.js`.** Still exactly one page/URL, no router: three real mount functions
(`mountHome()`, `mountDictionary()`, `mountFlashcardSession(lessonNumber)`), switched by replacing
`#app`'s content — but `#app` itself only ever tracks a BINARY `is-home` class (a plain layout toggle
between the grid dictionary/flashcards both need and a plain block box for home), not one class per
mount function; `mountDictionary()` is the file's entire previous content, untouched, just wrapped in
a function instead of running automatically on load — home is the default entry point now.
`localhost:5731/?view=dictionary` jumps straight into dictionary mode on load — a dev-only
convenience (reads the query param once at the bottom of main.js), not a real route; deleting that
one `if` check any time removes it cleanly.

**Hard architectural boundary, deliberate — updated by the flashcards pass below:** the terrarium
only ever exists on the home screen; the terrarium and the 3D kanji viewer (`src/viewer/`) never
coexist, and neither current code nor future choreography work should blur THAT half — see
`src/terrarium/terrarium.js`'s own header comment for exactly why (it's the "absolute monolith" that
has to be fully torn down, not hidden, when the user leaves the home screen). What changed: the
viewer itself is no longer dictionary-exclusive — `mountFlashcardSession` (`main.js`, see "Flashcards
— a real Genki review session" below) is a second, equally valid mount point for it. Same "never
coexist with the terrarium, full teardown before the next screen mounts" rule; just two doors into
the viewer instead of one.

### One box, every stage

`#options-panel` (`createMossBox()`, `position:'left'`) is created ONCE in `mountHome()` and carries
the user through the entire flow via `optionsBox.regenerate({...})` calls — never a second box,
never `setContent()` after the very first paint. Stage tree, each a `render*()` function in
`main.js`:

```
welcome (select / about)
  └─ select (dictionary / flashcards / exit)
       ├─ dictionary → tears down the terrarium, mounts the dictionary view entirely
       ├─ flashcards (renderFlashcardsDecks — the DECK PICKER; titled/glyphed 'textbooks' in the UI
       │   │          now, not 'genki' — genki isn't its own level here, it's one of two deck families;
       │   │          "Flashcards → Textbooks rename" below has the full UI-only rename scope;
       │   │          see "Terrarium camera choreography" below for the removed 'custom' menu stage)
       │   ├─ genki 1 → lessons 3-12
       │   └─ genki 2 → lessons 13-23
       │        └─ lesson N → tears down the terrarium, mounts a real review session
       │                      (mountFlashcardSession — see its own section below)
       └─ exit → welcome (leaves the tree entirely, not one level up)
```

**No accounts, nothing saved — this is a fully static app, by explicit request.** There used to be a
whole dummy login/signup layer here (welcome → a log-in form / a sign-up form → select mode,
`DUMMY_LOGIN = {email:'email', password:'123'}`, both forms' own `.auth-form`/`.auth-field`/
`.auth-input`/`.auth-input-display` markup) — it existed purely to have real stage transitions to
choreograph animation against (root CLAUDE.md's phasing always described a real login system as a
much later phase, never started). Removed entirely, not left as another inert placeholder: welcome's
own "enter the terrarium" button now calls `enterSelectMode()` directly — the exact same terrarium-
swoop + radio-box-spawn + `renderModeSelect()` sequence a successful login used to trigger, just with
no form or gate in front of it. `renderLogin()`/`renderSignup()`/`loginHtml()`/`signupHtml()` and the
`.auth-*` CSS family (`style.css`) are gone with it — `.auth-submit` is the one exception, kept
(unrenamed) purely because `#back-to-home-btn` (dictionary mode's own exit button, unrelated to auth)
happened to reuse its one real rule (centering).

**Welcome's own button, and select-mode's own title/marquee, are both renamed — UI text only, by
explicit request.** The button read 'enter' (its full original text, "enter the terrarium," had
already been shortened to just that one word before this rename) — now reads **'select'**, since
that's a more accurate name for what clicking it actually does (choose dictionary/textbooks/exit).
Select-mode's own title/marquee were `'select mode'`/`'select mode 選択'` — shortened to plain
`'select'`/`'select 選択'` in the same pass, so the button and the screen it leads to read as one
continuous idea rather than two different words for the same concept. **Internal names are
unchanged**, same "UI text only" scope the "Flashcards → Textbooks rename" below already
established: `data-stage="enter-terrarium"`, the click delegation's own `'enter-terrarium'` branch,
`enterSelectMode()`, the `terrariumEnterCloseUp` event it dispatches, `renderModeSelect()`,
`inSelectModeTree`/`showsIdleBranding` — every one of these still says "enter"/"select mode"
internally, only what a learner actually sees changed.

Every stage but the very first paint goes through `regenerate()` (plain `setContent()` is ONLY for
that first paint — the box is still `.is-hidden` then, so the full choreography would just run
invisibly and delay `show()`'s own fade-in for nothing anyone would see). `back` in each stage's
options object points to the ONE level up — welcome has none, a deck's own lesson-list children→the
deck picker→select mode — never skips a level. **Select mode is the one exception:** it has no topbar `back` at all
(`back: null`) — instead `modeSelectHtml()` adds a 4th in-list option, 'exit', that jumps straight
back to welcome. Was labeled 'log out' (kanji 退出, "leave/withdraw") back when this whole tree sat
behind the now-removed login — relabeled to 'exit' since there's nothing to log out of any more, but
退出 itself still fits "leave this area" either way, so the kanji is unchanged. Every other stage's
back button is unchanged.

**`mountHome(startAtSelectMode)`** — landing on welcome is the ONLY case that still paints `welcomeHtml()`
as the box's first stage; `mountHome(true)` (dictionary's own `#back-to-home-btn`, and a flashcard
session's own `exitToHome()`, both further down) skips welcome entirely and paints `modeSelectHtml()`
as the first paint instead, per explicit request: leaving either of those should return to select
mode, not all the way back to welcome — the two are genuinely different "leave" actions in this app
now (select-mode's own 'exit' still goes to welcome, unchanged; these two go one level less far).
Mechanically this is a SECOND first-paint branch alongside welcome's own, not a call to
`enterSelectMode()`/`renderModeSelect()` — both of those assume an already-visible box to animate
(`regenerate()`, `spawnFrom()`'s own shard-flight entrance for the radio box), and there's nothing on
screen yet to reverse-open FROM at a fresh mount; this branch sets `inSelectModeTree`/`showsIdleBranding`,
paints the box and radio box directly via `setContent()`+`show()`, and starts idle branding — the same
end STATE `enterSelectMode()` reaches, just painted directly instead of animated into. The terrarium's
own camera lands at close-up for free too — `mountTerrarium`'s own `startAtCloseUp` option (that
file's own header comment) re-targets the SAME automatic entrance tween every mount already plays
straight to `closeUpPos` instead of `birdsEyePos`, rather than playing the ordinary birds-eye entrance
and then stacking a separate `terrariumEnterCloseUp` swoop on top of it (dispatching that BEFORE the
entrance has genuinely settled would cut phase 0 off mid-flight and start the swoop from a bogus
position — see that option's own comment for the full reasoning).

### `regenerate()` — the universal box-transition system (`src/ui/mossBox.js`)

Every `createMossBox()` instance gets this for free — see that file's own header comment for the
full API. One call carries the FULL next stage — `{title, kanji, marquee, back, html,
maxContentHeight}` — applied together, never piecemeal (calling `setTitle()` etc. separately before
`regenerate()` was a real, fixed bug: the topbar text used to snap to the new stage instantly, well
before the box even started closing, since chrome lives outside `.nora-moss-content` and was never
itself part of the collapse animation). Four phases, in order, all inside `regenerateBox()`:

1. **Collapse** — `.nora-moss-content`'s `max-height`/`padding` animate to 0 (280ms, plain ease-out,
   `cubic-bezier(.4,0,.2,1)` — deliberately NOT the overshoot bounce `spawnFrom` uses; a bounce on a
   *closing* box read as a wobble at the bottom edge, not a pop). Chrome is untouched through this
   whole phase — still showing the OUTGOING stage.
2. **Flash + swap** — once content is *measurably* at 0 (a ground-truth check, not just "a CSS
   transition's timeout fallback fired" — see below for why that distinction is load-bearing), a
   solid white shield (`.moss-regen-flash`, a plain div layered over the box — NOT the jump-cut
   `flicker()` `spawnFrom` uses) rises to peak, `applyStage()` swaps title/kanji/marquee/back-
   state/content while it's fully covered, then the shield falls — one continuous rise-then-fall
   (`flashIn` is the literal time-reversal of `flashOut`, same 260ms/curve), no flat hold in between
   (an earlier version held flat at peak and read as "a box snapping on and off," not a flash).
3. **Reopen** — same ease-out family, animates back open to the incoming content's real size.
4. **Type** — only once Phase 3 is *measurably* done does every `data-typewriter` element type
   itself in letter-by-letter, staggered `LINE_STAGGER_MS` (90ms) apart, each with its OWN
   `createTypewriter()` instance.

**Real bugs found building this — all fixed, all worth knowing before touching `regenerateBox()`
again:**

- **Measure height/padding while the incoming content still has its real words, before blanking
  anything for the typewriter.** Measuring after blanking (the first version) only reserved as much
  space as the *empty* labels needed — less than the full text needs — so the box bump-expanded once
  too small, then AGAIN mid-typing as text outgrew the reserved space.
- **`min-height` has to be pinned to the SAME target as `max-height`, not just `max-height` alone.**
  `max-height` is only ever a ceiling — it does nothing to stop the box being *smaller* than target
  while content (still blanked, pre-typing) doesn't currently need the space. `min-height` forces the
  box open to the true final size regardless of blank-vs-filled content — the practical equivalent of
  pre-reserving a blank placeholder sized for the real words.
- **An empty flex item (no text node at all, not even blank) can render at 0 height, not its normal
  line-height.** `.mode-option-label` (and `.auth-field-label`, back when the now-removed login/signup
  forms existed — see "One box, every stage" above) are/were direct flex items of a
  `flex-direction:column`/`row` container — blanking them for the typewriter (no text node, not even
  whitespace) let them collapse individually, a 48px-class discrepancy across a 3-row form. This is
  exactly why the "measure before blanking" fix above matters — measuring after this collapse would
  silently under-measure every time.
- **`.nora-moss-content` has no `box-sizing:border-box`** (only the outer `.nora-moss-box` elements
  do), so `max-height`/`min-height` apply to the CONTENT area only — padding is added on top for the
  real rendered size. Setting them directly to a padding-INCLUSIVE `scrollHeight` value while also
  restoring real padding double-counts it (box landed 34px too tall — 243 target measured as 277
  actual). Always subtract real padding from a `scrollHeight` measurement before using it for
  `max-height`/`min-height`.
- **The `finally` cleanup must PIN `max-height` to its final value, not clear it to `''`.** Clearing
  it (assuming ordinary CSS auto-sizing would recompute the identical number) is true for uncapped
  content but false the moment `maxContentHeight` is capping something genuinely bigger (e.g. genki
  2's 11-lesson list — 838px real vs. a 520px cap) — `#options-panel` has no CSS max-height of its
  own, so clearing the inline one removes the ONLY thing enforcing the cap, and the box visibly
  bursts back out to full size a moment after settling. `min-height`/padding/transition are still
  safe to clear — only `max-height` needed pinning.
- **Every element typed in a loop needs its OWN `createTypewriter()` instance, not one shared across
  the loop.** A typewriter's `generation` counter is shared across every call IT receives — reusing
  one instance for multiple elements means starting the 2nd element's typing immediately cancels the
  1st mid-word ("login" cut to "log", "email" to "em").
- **A `max-height`/`min-height` cap needs a ground-truth check on the REAL rendered height
  (`getBoundingClientRect()`, polled via `requestAnimationFrame`), not just
  `transitionend`-or-timeout.** `waitTransitionEnd`'s own fallback is wall-clock time only, with no
  idea whether the box actually finished growing — under real load (the terrarium's WebGL loop
  competing for the same main thread this layout-triggering animation needs) that fallback can fire
  before the box has genuinely reached full size, letting the NEXT phase (the flash, or typing) start
  while the box is still visibly mid-motion. `waitUntilHeightReached()` (own timeout-protected
  `requestAnimationFrame` poll, in `mossBox.js`) is what actually guarantees "never before the box is
  measurably there," in every case.
- **Raw WAAPI `element.animate(...).finished` has no timeout fallback at all** — `flashIn`/`flashOut`
  used to be built this way and could hang the whole sequence forever if the animation somehow never
  fires `finished` (confirmed actually happening in this session's own sandboxed Browser-pane
  tooling). Rebuilt on `waitTransitionEnd` (CSS transitions, the same timeout-protected helper every
  other phase already uses) instead — same visual result, but can't hang.

**`maxContentHeight` — the option for long lists (genki's 11-lesson screens).** Optional px total-
height cap passed to `regenerate()`; content past it scrolls instead of the box growing further —
reusing `.nora-moss-content`'s own `overflow:auto` and the SAME weighted hand-scroll every box
already has via `attachHeavyScroll` (no new scroll implementation needed, just letting content
genuinely overflow instead of always fitting). `OPTIONS_LIST_MAX_HEIGHT` (`main.js`) was originally
520px, measured against a real `.mode-option` row at 64px (14px vertical padding + a 19px margin
`.mode-option-label` was quietly inheriting from `.related-title`) + the list's own 10px gap, landing
on ~6 full rows plus part of a 7th peeking through — the "there's more, scroll" affordance. Both that
padding and that margin were later cut to a shorter, uniform height so every `.mode-option` button,
in every stage, matches — originally matched to the login/signup forms' own input height, back when
those still existed (see "One box, every stage" above; "One box, every stage" isn't the layer that
changed, `.mode-option`/`.mode-option-label` in `style.css` is) — a row is now ~37px, not 64px, and
the constant was proportionally rescaled to 320 to keep roughly the same "~6 rows + a peek"
affordance. Not re-measured against a real render (see `main.js`'s own comment on it) — retune this
number first if genki 2's list ever shows visibly more or fewer than ~6 rows before scrolling.

**Back button — `showBack()`/`hideBack()` on every `createMossBox()` instance.** A back arrow
(`.nora-moss-topbar-back`, mirrored to the corner kanji glyph's own position) always exists in the
topbar DOM once one exists, hidden unless a stage opts in. Idle is static (no animation) by design;
hover beeps via the SAME `nora-kanji-pulse` white pulse everything else in this app uses (a red
variant was tried and dropped by request — this box family stays in the white/jade vocabulary
throughout). Wired per-stage via `regenerate()`'s own `back` option (a click handler to show it,
`null` to hide it) — applied at the same instant as the rest of the stage's chrome, under cover of
the flash, never independently.

### Terrarium camera choreography — `terrariumEnterCloseUp`/`terrariumExitCloseUp`/`terrariumEnterDeck`/`terrariumExitDeck`

The dormant phase-1 "low angle swoop" from the source demo (`brandSelected`/`collectionOpened`/
`collectionClosed` further down are still exactly that — dormant) is now LIVE, renamed in
`src/terrarium/terrarium.js` from
the source's `brandsViewOpened`/`brandsViewClosed` (a "spotify store" concept, meaningless here) to
`terrariumEnterCloseUp`/`terrariumExitCloseUp`. `main.js` dispatches `terrariumEnterCloseUp` on
welcome's own "enter the terrarium" click (welcome → select-mode — there used to be a dummy login
stage in between this and select-mode, removed entirely; this same swoop now fires straight off that
one welcome button) and `terrariumExitCloseUp` on select-mode's own 'exit' option (→ welcome) —
reversing the exact same swoop; the pairing is deliberate, every box stage has
one specific terrarium position it belongs at. `closeUpPos` (80% of the way from birds-eye's
near-vertical polar angle toward the camera rig's own `maxPolarAngle` "ground" limit, at a distance
close enough that the terrarium's own edges sit near the frame boundary) was worked out from the
real FOV/scale geometry, NOT eyeballed — this environment's own renderer doesn't repaint reliably
enough to tune it by screenshot (see the sandbox note at the end of this section).
`brandSelected`/`collectionOpened`/`collectionClosed` remain fully dormant, untouched, unrelated to
this activation — still the reference for a later, more involved choreography pass.

**`terrariumEnterDeck`/`terrariumExitDeck` extend this SAME chain one stage deeper**, per request —
birds-eye ⇄ close-up ⇄ deck-zoom, one continuous line, not a parallel system: they reuse the exact
same `closeUpAnim*` state variables `terrariumEnterCloseUp`/`terrariumExitCloseUp` already drive,
phase numbers 7/8/9 (7 = close-up → deck-zoom, 8 = resting at deck-zoom, 9 = deck-zoom → close-up,
closing back to phase 2 — the SAME "resting at close-up" phase 1's own completion already lands on,
not a separate one). `main.js` dispatches `terrariumEnterDeck` at select-mode's own 'flashcards'
button — specifically at that click delegation branch, not inside `renderFlashcardsDecks()` itself,
since that function is also the `back` target for any deck's own lesson-list children (genki 1/2's,
further down the tree) and re-zooming every time one of those steps back up to the deck picker would
be wrong; only the actual select-mode → flashcards transition moves the camera. `terrariumExitDeck`
dispatches at the deck picker's own back button, reversing to `closeUpPos` directly — deliberately
NOT all the way to birds-eye, since the deck zoom sits one level below close-up, not below birds-eye,
so its own back only undoes its own zoom. `deckZoomPos` sits on the exact same ray from
`controls.target` through `closeUpPos` for azimuth, but both distance AND polar angle move — pulled
in from closeUpPos's ~2.4 world units to ~1.3 (without going all the way to `controls.minDistance`'s
0.7, which risked clipping through the glass box/moss) AND tilted all the way to `maxPolarAngle`,
genuinely flat/ground-level, not 80% of the way like `closeUpPos`. `renderGenkiLessons` (a specific
deck's own lesson list, one level deeper still) does NOT get its own terrarium pairing — its own back
button returns to `renderFlashcardsDecks()` with no camera change, same "no pairing exists below
where one was actually asked for" reasoning already established for every earlier stage in this chain.

**This used to be a three-level chain, not two** — `terrariumEnterFlashcards`/`terrariumExitFlashcards`
drove a middle hop at `flashcardsZoomPos` (phases 4/5/6) back when select-mode's 'flashcards' button
led to a menu (custom deck / genki) before reaching the deck picker; `deckZoomPos` was reached from
THERE, one level deeper still, via a pure tilt with distance held fixed. That menu — and 'custom'
with it — was removed entirely once login/accounts were removed (see "One box, every stage" above): a
custom deck needs real per-user storage that doesn't exist in a fully static app (root CLAUDE.md
phasing), so keeping a menu whose only other option was a placeholder in front of the one real deck
family (genki) made no sense any more. `terrariumEnterFlashcards`/`terrariumExitFlashcards`,
`flashcardsZoomPos`, and phases 4/5/6 were deleted along with it, not left dormant like
`brandSelected`/`collectionOpened`/
`collectionClosed` below — those are genuine source-demo reference material for a later, different
feature; this was custom-built for the now-gone menu stage specifically, not reusable reference.
`deckZoomPos` itself is numerically unchanged (same end position, reached via a direct combined
dolly+tilt from `closeUpPos` now instead of a dolly then a separate tilt from an intermediate stop) —
`terrarium.js`'s own header comment has the full before/after phase-numbering detail, including why
`closeUpAnimPhase` deliberately jumps 3 → 7 with no 4/5/6 in between now.

### Hover title — `.select-hover-title` + `.select-hover-desc`

CSS in `src/style.css`, wired in `main.js`. Ported directly from `moss x kanji FINAL`'s
`.nora-brand-hover-title` CSS recipe — the actual JS behind it no longer exists anywhere in that
project's current checkout, only documented in ITS OWN `HANDOVER.md`, so this is a fresh
reimplementation of that documented behavior (hover shows a title, click dismisses), not a literal
port of code that's already gone. Two SEPARATE fixed elements, shown/hidden together but positioned
independently:
- `.select-hover-title` — the big glowing word itself, unchanged position (`top:62%`, centered, over
  the terrarium).
- `.select-hover-desc` — a smaller one-sentence description, typed in via its own
  `createTypewriter()` instance, positioned at `top:80px` — the SAME top `#options-panel` itself
  sits at (`.nora-moss-box--float-left`) — so it lines up with the box's own top edge; lands just
  above the terrarium's glass-box/orb in practice.

Only shown once select-mode is reached (`inSelectModeTree` in `main.js`, toggled by the `render*()`
functions themselves as they run) — welcome's own buttons never trigger it, per explicit
request. Every `.mode-option` that should show one carries `data-label`/`data-description`; omitting
`data-description` just leaves that line empty — no dead space is reserved for it either, it's a
wholly separate element — but nothing currently omits it: every real option in the tree (dictionary/
flashcards/exit, genki 1/genki 2, and every individual lesson button) has its own description
now. `genki 1`/`genki 2` (`flashcardsDecksHtml()`) and each `lesson N` (`genkiLessonsHtml()`, "One
box, every stage" above) got theirs added after initially shipping without — "review lessons from the
genki 1/2 textbook." and "review kanji from lesson N." respectively, the lesson one generated
per-button rather than shared since the lesson number needs to stay in the sentence.

**Idle state shows branding — but ONLY on select-mode itself, not the whole tree.** `IDLE_TITLE =
'duality terrarium'` and `IDLE_TAGLINE = 'a new way to learn kanji'` (`main.js`) are what
`showIdleHoverTitle()` (`showHoverTitle(IDLE_TITLE, IDLE_TAGLINE)`) shows. A first pass made every
select-mode-tree stage fall back to this instead of a plain hide — corrected by explicit request:
idle branding is select-mode's OWN title, not a tree-wide "nothing's hovered" fallback. A new
`showsIdleBranding` flag (alongside `inSelectModeTree`) tracks this — `true` only in
`renderModeSelect()`; `renderFlashcardsDecks()`/`renderGenkiLessons()` both set
it back to `false` and call the plain `hideHoverTitle()` on entry instead, same as before idle
branding existed at all — one level deeper than select-mode, idle genuinely means nothing shows, and
it stays gone until you're back on select-mode itself.

Moving the mouse OFF an option doesn't bring idle branding back immediately either, per a further
explicit request — there's a real `IDLE_HOVER_DELAY_MS` (2000ms) gap where nothing shows first.
`dropToIdleOrHidden()` is the shared "nothing's hovered anymore" handler (mouseout, and the click
delegation's own immediate, unconditional drop on any `.mode-option` click, defensively — nothing in
the current tree actually goes nowhere any more, but nothing downstream relies on that): it always
`hideHoverTitle()`s right away, then only schedules idle branding's delayed return
(`scheduleIdleHoverTitle()`, a plain `setTimeout`) when `showsIdleBranding` says this is actually
select-mode. `showHoverTitle()`/`hideHoverTitle()` both unconditionally clear any pending timer
first (`clearIdleHoverTimer()`) — without that, a timer scheduled from mousing off one option could
fire later and stomp whatever's showing by then (a different option's own hover, a new stage
entirely, or the elements already torn down on dictionary-mode entry). `hideHoverTitle()` itself is
still also what `renderWelcome()` uses for a real, total hide when actually leaving
the select-mode tree (`inSelectModeTree` flips to `false`), and what tears the elements down
entirely on dictionary-mode entry.

The click delegation's own guard was a real, caught bug in the FIRST idle-branding pass: it called
`showIdleHoverTitle()` unconditionally on every `.mode-option` click with no `inSelectModeTree`
check at all, unlike mouseover/mouseout (which both already gated on it) — meaning clicking welcome's
own "enter the terrarium"/"about" (both `.mode-option` too), would have
briefly shown "duality terrarium" over the welcome screen. Fixed by adding the same
`inSelectModeTree` gate there.

**`lockHoverToIdle()` — a guaranteed on-screen moment for idle branding.** Select-mode's own entrance
(`optionsBox.regenerate()`, still animating open) happens in real screen space while the cursor
typically hasn't moved — a button can easily end up forming right under it, which would otherwise
swap "duality terrarium" out for that button's own hover title before anyone consciously hovered
anything. `renderModeSelect()` calls this right after `showIdleHoverTitle()`: for `HOVER_LOCK_MS`
(4000ms) afterward, `hoverLocked` suppresses the mouseover handler's own `showHoverTitle()` call
entirely (idle branding just stays put), and the mouseout handler skips `dropToIdleOrHidden()` too
(nothing to drop back to — idle's already showing). `currentlyHoveredBtn` is tracked on every
mouseover/mouseout *regardless* of `hoverLocked`, specifically so the lock's own expiry can hand
control back to wherever the cursor actually is the instant it lifts — the browser won't fire a
fresh `mouseover` on its own just because the lock ended if the cursor's been sitting still over a
button the whole time, which is exactly the scenario this exists for. `clearHoverLock()` is folded
into `hideHoverTitle()` (same centralizing pattern `clearIdleHoverTimer()` already uses) so leaving
select-mode mid-lock — a fast click before the 4s window closes — can't leave a stale timer to fire
later on a completely different stage.

**Each option's own corresponding kanji, next to its word — the item above, since done.** Every
`.mode-option` that carries `data-label` now also carries `data-kanji`; `showHoverTitle()` takes it
as a third argument (`btn.dataset.kanji`, mouseover) and sets `.select-hover-title-kanji`'s
`textContent`. Markup: `.select-hover-title` no longer centers `.select-hover-title-text` on its own
— a new `.select-hover-title-row` (flex, `align-items: baseline`, centered as one unit) holds the
word and kanji side by side, kanji on the right. A first pass gave the kanji this app's usual
`Shippori Mincho` treatment (every other real kanji glyph — `.info-character`, `.related-kanji`,
`.nora-moss-topbar-kanji` — uses it) at a smaller companion size — corrected by explicit request to
match a specific reference instead: spotify-store's own `.nora-moss-brand-item` (the brand list) has
a couple of entries mixing English and kanji in ONE string ("CHËNG 鳴室", "OIOI器契"), styled by a
single class with a plain `Arial, sans-serif` font-family for the whole thing — Arial has no CJK
glyphs, so the kanji falls back to the platform's own default sans-serif CJK font, which is where
the "more blocky" look actually comes from (nothing to import — that's just what Arial already does
for kanji with no CJK-specific override). `.select-hover-title-kanji` now copies that 1:1: same
`font-family`/`font-size` as `.select-hover-title-text` (genuinely the same size as the word, not a
smaller companion) plus the identical glow/stroke/shadow recipe, so the two read as one continuous
piece of text. `:empty { display: none }` on the kanji span means a missing one (only
`showIdleHoverTitle()`'s "duality terrarium" ever omits it, per explicit request — the idle branding
gets no kanji) leaves no dangling gap.
Assignments, reusing an existing corner glyph wherever the destination stage already has one rather
than inventing a second kanji for the same concept: `dictionary` → 辞書 (new — dictionary mode itself
has no single fixed glyph, being per-character dynamic), `flashcards` (labeled/glyphed 'textbooks' in
the UI now — see "Flashcards → Textbooks rename" below; the internal `data-mode`/stage name is
unchanged, deliberately) → 教科書 ("textbook" — a real word, breaking this app's own established
2-kanji-jukugo convention on purpose, by explicit request; this is the SAME glyph both select-mode's
own `flashcards` button hover-title uses AND the deck-picker screen's own corner glyph
(`renderFlashcardsDecks()`, "One box, every stage" above) — the deck picker is titled 'textbooks' now,
not 'genki', per explicit correction that genki isn't its own level in this tree, just one of two
current deck families), `exit` → 退出 (new — kept unchanged from when this
option was still labeled 'log out', see "One box, every stage" above), `genki 1`/`genki 2` → 元気
(genki's own real name — this is each DECK's own glyph now, used on that deck's lesson-list screen
specifically, not on a "genki" level above them — there isn't one). Every `lesson N`, though, is 授業
("lesson/class") — corrected by explicit request from an initial pass that also gave every lesson
button 元気: once you're actually looking at a specific lesson, "lesson" is the more accurate word
than reusing its own deck's glyph again a third time. `custom` → 自作 no longer exists — that option
(and the flashcards menu it lived on) was removed entirely, see "One box, every stage" above.
`guide` → 案内 no longer exists either — that option (still an inert stage until this pass) was
removed entirely too, same treatment, see "One box, every stage" above.

**Every hover-desc's own trailing "." blinks — every option's own `data-description`, and the idle
tagline.** `createTypewriter()` (`mossBox.js`) gained an optional third `onDone` argument,
backward-compatible (every other caller still omits it) — fires once, right after the last
character lands, never for a superseded call (same `generation` guard every step already uses), so
a caller can react to "this string genuinely finished typing" without guessing a duration from the
28ms/char pacing — the same "wait for a real signal, not a timeout" preference this file already
applies elsewhere (height/layout). `showHoverTitle()` (`main.js`) always passes `blinkTrailingDot()`
as that callback now — a first pass only wired this up for `showIdleHoverTitle()`'s own tagline,
corrected by explicit request to cover every description; every `data-description` string picked up
its own trailing period specifically so this applies uniformly. `blinkTrailingDot()` wraps the
desc's own trailing "." in `<span class="hover-desc-dot">` once typing's done (a no-op if there
isn't one), and `style.css` animates just that span with `search-caret-blink` (reused verbatim from
`#kanji-search-caret`, not a second near-identical keyframe) — the same hard on/off square wave,
"old-school terminal" read, not a smooth fade.

### Flashcards → Textbooks rename

The select-mode option and the deck-picker screen it opens are labeled/glyphed **'textbooks' / 教科書**
now, not 'flashcards' / 単語 — grilled first (`/grill` session), settled reasoning: `単語` ("word") never
really fit what this feature shows (an isolated kanji pulled from a lesson, not "a word"), and the
whole point of the feature is browsing real textbooks (Genki, Minna no Nihongo) lesson by lesson, which
'textbooks' names directly. 教科書 is a genuine, real word ("textbook") — chosen over shorter jukugo
alternatives (暗記/"memorization", 想起/"recall", 語彙/"vocabulary" were all considered) specifically
BY breaking this app's own established 2-kanji-jukugo convention on purpose, since no 2-kanji word hits
"textbook" cleanly and the real word mattered more here than the syllable-count convention.

**Deliberately scoped to UI text only, not a full rename** — explicit decision: `data-mode="flashcards"`
(the click-delegation key), every function name (`flashcardsDecksHtml`, `renderFlashcardsDecks`,
`mountFlashcardSession`, `transitionToFlashcardSession`), the `#dev-skip-to-flashcards` dev button, the
`?view=flashcards` dev query-param shortcut, and this doc's own section names/prose below (including
this file's "Flashcards — Dictionary itself, scoped to a lesson" section, unrenamed) all keep saying
"flashcards" internally. Only what a learner actually sees changed: the button's own visible text/
`data-label`/`data-kanji` (`modeSelectHtml()`), and the deck-picker's own `title`/`kanji`/`marquee`
(`renderFlashcardsDecks()`). Genki/Minna no Nihongo's own per-deck glyphs (元気/日本語) and the whole
deck→lesson-list→lesson flow are unchanged — this rename only touches the ONE level between select-mode
and the deck picker. The still-fully-dormant old `mountFlashcardSession` review-queue implementation
("Flashcards — Dictionary itself, scoped to a lesson" below has the full history) was explicitly kept
in place, not deleted, despite the live feature no longer being called "Flashcards" in the UI.

The lesson-mode corner glyph (`mountDictionary`'s own `searchBox`, "Flashcards — Dictionary itself,
scoped to a lesson" below) was reverted from the shared `単語` back to `授業` ("lesson/class") as part of
this same pass, now that `単語` is retired as the shared glyph in favor of `教科書` one level up — see
that section's own "The box's own topbar TITLE" bullet for the full reasoning.

### Per-option captions — removed

Select-mode and the flashcards menu (itself since removed — see "One box, every stage" above) used to
also show a one-line description directly above each
button (`.mode-option-group`/`.mode-option-caption`, in-box, always visible once its stage was open —
distinct from the hover-title description above, which is hover-gated and lives at the top of the
page). The two were kept side by side deliberately, for testing/comparison, with the caption text
duplicated as a literal string in both `data-description` and the caption `<div>`. That comparison is
now resolved — the in-box version was removed by request, so the hover-title (above) is the only
place this description text shows; `data-description` is what it now reads from exclusively.
`.mode-option-group`/`.mode-option-caption` no longer exist in `style.css` or the button markup.

### `mode-option-list`

Every stage in this box, welcome included, shares one `.mode-option-list` layout (`.mode-option`
buttons stacked, full-width, centered text) — there used to be a second layout, `.mode-option-row`,
that laid welcome's old log-in/sign-up pair out side by side instead; removed along with those two
buttons when login/signup were dropped entirely (see "One box, every stage" above). Welcome's current
two options ("enter the terrarium" / "about") are ordinary `.mode-option-list` buttons, stacked one
above the other like every other stage — no special-cased layout for welcome any more.

### Flashcards — Dictionary itself, scoped to a lesson

**Completely redesigned, current-state-first — the section below describes what's live now; the
review-queue design this replaced (reveal-then-grade, `duality detected`, per-card material
choreography) is gone from the live app, not summarized here as history.** Grilled first (`/grill`
session) once the queue-based version stopped feeling right — settled conclusion: Flashcards' own
review mechanic was the actual problem, not any one bug in it, and Dictionary mode was already a
better browsing experience than Flashcards had ever been. So Flashcards became Dictionary itself:
`mountDictionary({ series, lessonNumber })` (`main.js`) *is* the whole implementation — not a second
mount function that happens to look similar, not a copy-pasted fork; `series` (`'genki'`/`'minna'`)
was added once a second deck (Minna no Nihongo) existed — see "A second deck: Minna no Nihongo"
below. `transitionToFlashcardSession` (`main.js`, fired from a real `genki-lesson-N`/`minna-lesson-N`
button click) calls exactly that. The OLD
implementation, `mountFlashcardSession(lessonNumber)` — the review queue, `src/cards/`'s own
lesson/duality panels, the whole material-choreography system described in prior revisions of this
section — is still fully defined in `main.js`, completely unreferenced from any live UI path.
Reverting is a one-line change at `transitionToFlashcardSession`'s own call site if this doesn't pan
out. **Still deliberately stateless, same reasoning as before — no SM-2, no due dates, nothing
persisted, no grading of any kind at all now:** `src/srs/` (sm2.js/store.js/queue.js) stays parked,
imported by nothing, for a genuinely different future feature (custom decks, due-date-gated review) —
that model never fit a fixed weekly Genki assignment, and a half-measure self-test layer was
considered and deliberately rejected in favor of shipping a real, working browse experience first.

**The mechanism — two optional parameters, everything else inherited:** `series`+`lessonNumber`
(both default `null`) are the ONLY things that ever distinguish Flashcards from real Dictionary — and
the only things that distinguish one DECK from another. `DECK_DATA = { genki: genkiKanji, minna:
minnaKanji }` maps `series` to that deck's own data; `lessonEntries = DECK_DATA[series]?.[String
(lessonNumber)]` (or `null` outside lesson mode) derives `isLessonMode`, the one flag every
lesson-specific branch checks. Both params are required together now, not `lessonNumber` alone —
genki's own lesson numbers (3-23) and minna's (1-50) collide, so a bare number stopped being a unique
key the moment a second deck existed. A bug fix or improvement to Dictionary mode — the 3D viewer, the
left info box's structural-parts pin/zoom, the "also appears in N other kanji" cross-reference list,
literally everything not listed below — applies to Flashcards automatically, for free, AND to every
deck at once, since it's the same code running with different scope, never separately-maintained
implementations per deck.

**What actually differs, in lesson mode:**
- **No search bar.** `.search-field` (the input row) stays in the DOM — every element inside it is
  still queried/wired unconditionally further down `mountDictionary`, so hiding it (inline
  `display:none`) rather than omitting it from the template avoids guarding a dozen call sites against
  null. The learner never sees or focuses it; it just stops being how a kanji gets selected.
- **`#search-examples` (dictionary's own "or try one of these" grid) becomes the entry point** — same
  element, same CSS, same hover-pulse/click-to-load wiring, just populated from
  `lessonEntries.map(e => e.kanji)` instead of the hand-picked 24-character list. Its own heading line
  (`.related-title`, "or try one of these" in real dictionary mode) is omitted entirely in lesson
  mode now, not replaced with a lesson-specific title — used to say "{series} lesson N kanji", removed
  by explicit request as redundant: the searchBox's own TITLE already says "{series} lesson N" right
  there in the same box, same reasoning as `updateBackLabel`'s own bare "close lesson"/"back to lesson"
  and `searchExamplesTitle` itself only carrying the dictionary-mode string now. Real dictionary mode
  is untouched — still has its own heading line. **Real bug from removing that line, caught and
  fixed same pass:** the title's own margin (7px top, 12px bottom, `.related-title`'s base rule)
  wasn't just spacing the text itself off its neighbors, it was the ONLY thing separating the topbar
  from the tile grid below — omitting the whole line collapsed that gap down to nothing (`#search-
  examples`'s own 8px margin-top alone), reading as broken/cramped, not intentionally tight.
  `style.css`'s `#search-examples > .related-list:first-child { margin-top: 32px; }` restores it —
  scoped via `:first-child` so it fires ONLY when the title above it is genuinely absent (lesson mode);
  real dictionary mode's `.related-list` is always the SECOND child there (after the title), so this
  rule never touches it. **A first pass used 12px (the title's own bare margin-bottom) and still
  read as too tight — caught and fixed in a follow-up pass, real reason documented in `style.css`'s
  own comment on this rule:** `#search-examples`'s 8px margin-top PARENT-COLLAPSES with whatever
  margin its first child carries, so the effective gap is `max(8, list's margin)`, never the sum —
  12px only ever won by 4px over the 8px baseline it was meant to replace. 32px is reverse-engineered
  from real dictionary mode's own still-intact title+list spacing (measured live: ~9px title height +
  ~15px trailing gap, on top of that same 8px collapse baseline dictionary mode also gets for free),
  landing lesson mode's total topbar-to-tile-grid gap at genuine parity with dictionary mode's (~49px
  either way, confirmed via `getBoundingClientRect`), not just "bigger than the broken version."
- **The right box (`#search-selected`) gates behind a "reveal" button.** `#search-selected-reveal-prompt`
  and `#search-selected-content` are both ALWAYS in the template (both modes) — only
  `#search-selected`'s own `reveal-pending` class (added by `loadChar`'s `showRevealPrompt`, removed by
  the reveal button's own click handler, which then runs `updateSearchSelected` for real) decides
  which shows; real dictionary mode never adds that class, so the prompt stays at its own
  `display:none` default there, genuinely inert. Deliberately stateless like everything else here —
  every new selection resets to un-revealed, even re-picking a kanji already revealed once this
  session. **Real bug, caught and fixed same pass as the padding one above:** the reveal button was
  rendering at roughly 1.5× every other `.mode-option`'s height (54.5px vs. 35.5px, measured) — its
  own label was plain `.related-title` with none of the margin-zeroing every OTHER `.mode-option`
  label gets (either via `.mode-option-label`'s own `margin:0`, or `#back-to-home-btn .related-title`'s
  own ID-scoped override right below it in `style.css`), so `.related-title`'s inherited block-flow
  margin (7px top, 12px bottom) was padding out the button's own auto height on top of its 10px
  padding. Fixed the same way `#back-to-home-btn` already was: `#search-selected-reveal-btn
  .related-title { margin: 0; }`.

  **Also picked up an idle pulse, explicit request** — the button looked identical to any other
  resting `.mode-option` and was easy to miss entirely. Inverts this app's usual hover-pulse
  convention on purpose: every other `.is-pulsing` use (`.mode-option.is-pulsing .mode-option-label`)
  pulses ONLY while hovered; here `.is-pulsing` goes on once `showRevealPrompt` shows the button (via
  `syncPulseDelay`, phase-locked to the same clock every other pulse on the page shares, including this
  same box's own topbar corner glyph) and stays on for as long as it sits there un-revealed — pulsing
  BY DEFAULT, specifically when nothing's hovering it, which is the whole point. Hovering does the
  opposite of the usual convention too: instead of starting the pulse, it freezes it — `#search-
  selected-reveal-btn:hover .related-title { animation: none; opacity: 0.75; }` (0.75 is
  `nora-kanji-pulse`'s own peak opacity) locks it at the pulse's bright top rather than pausing
  mid-cycle at some arbitrary half-faded frame, and wins over the `.is-pulsing` rule (equal
  specificity) purely by being declared after it — `.is-pulsing` itself is never removed on hover, so
  moving the cursor back off just lets the animation resume.
- **Exit returns to the lesson's own grid, from anywhere, one click — never a history stack.**
  `#back-to-home-btn`'s click handler special-cases `isLessonMode && currentChar !== null`: instead of
  the usual full teardown, it just sets the (hidden) search input back to `''` and calls
  `syncSearchField()` — the EXACT same code path a real dictionary user backspacing the field to empty
  already triggers (collapses `#search-selected`, `renderPinInfo(null)`, the graceful
  `exitLoadedKanji()`-then-`clearKanjiGroup()` sequence), reused verbatim, not reimplemented. This is
  what makes free-roaming through Dictionary's own cross-reference list completely safe from inside a
  lesson — however many hops from the lesson's own kanji you wander, one click on exit always lands
  back on the grid, never require an "how do I get back" for a learner to worry about. Only once
  already on the grid (nothing loaded) does exit do the real, full leave-the-screen teardown — same
  landing as real dictionary's own exit, `mountHome(true)`. The button's own label
  (`#back-to-home-label`) tracks which of the two it's about to do — "back to lesson" / "close lesson"
  — kept in sync everywhere `currentChar` changes (`loadChar`, the empty-field branch), never just set
  once. Deliberately bare now — no series, no lesson number (used to say "back to {series} lesson N" /
  "close {series} lesson N", added once a second deck made the bare number ambiguous) — reverted by
  explicit request once the searchBox's own TITLE (just below) already said "{series} lesson N" right
  there in the same box, making the button's own repeat of it redundant.
- **The box's own topbar TITLE stays fixed on "{series} lesson N"**, not the loaded character — set
  once at `createMossBox()` (`searchBox`), same "label the box itself" idea real dictionary's static
  'search' title already uses, just fixed on the lesson instead of the generic act of searching. The
  CORNER GLYPH is 授業 ("lesson/class") — hardcoded regardless of series, since it's specific to "you're
  inside one particular lesson," distinct from the deck-picker's own 教科書 ("textbook") one level up
  and each deck's own 元気/日本語 one level up from that. This used to be unified to 単語
  ("word/vocabulary" — the same glyph select-mode's own 'flashcards' hover-title and the deck-picker
  screen used, one symbol threading the whole journey instead of a new one invented per deck) —
  reverted back to 授業 once the feature itself was renamed 'flashcards' → 'textbooks' in the UI (see
  "Flashcards → Textbooks rename" below) and 単語 was retired as the shared glyph in favor of 教科書 at
  the deck-picker level; 授業 was the original, deliberately-discarded choice for this exact screen
  before that unification happened. The TITLE TEXT is what actually tells decks apart here, not the
  glyph.

**What's explicitly free-roam, unconstrained — a real, considered decision, not an oversight:** the
"also appears in N other kanji" cross-reference list can jump to any of the 6,703 kanji, same as real
Dictionary, even ones nowhere near any Genki lesson. Locking it to lesson-only kanji was considered and
rejected — a lesson's own kanji rarely share structural parts with EACH OTHER, so that list would be
near-empty most of the time, and the free exit-to-grid above already makes wandering safe regardless.
3D parts pin/zoom is likewise fully interactive, same as Dictionary, unlike the old review-queue design
which disabled all 3D click interactivity on purpose.

**The classifier's own red noise-region hover-highlight is gone from BOTH modes now, not just
Flashcards.** `mountScene`'s new `ignoreNoiseHover` option (`src/viewer/scene.js`, defaults `true`)
makes `raycastAt` skip past any hit whose group isn't `userData.useful` before returning one — hover
and click-to-pin now only ever respond to real, useful parts, everywhere. This used to be described as
deliberate — a way to visually verify the classifier's own verdicts directly in the live app — but was
still active in the production UI rather than gated behind anything, and reads as a developer/test-tool
behavior a learner using either screen should never see. `ignoreNoiseHover: false` at a call site is
the one-line way back if classifier verification in the live app is ever wanted again specifically.

### A second deck: Minna no Nihongo

`flashcardsDecksHtml()` (`main.js`) genuinely was ready for this — its own comment already said "a
future deck... would just be a third button in, not a new nested level" before this deck existed at
all. "minna no nihongo 1"/"minna no nihongo 2" sit alongside "genki 1"/"genki 2" now, same
`.mode-option-list`, same mechanism throughout — `data-stage` stays the short `minna-1`/`minna-2`.
The button's own visible label (`.mode-option-label`) spells out the full name. **Full name here
specifically, not shortened to "minna N" the way genki's own buttons are** — explicit request, real
reasoning behind it: "genki" already IS the book's own common short name, but "minna" alone reads as
a fragment of "minna no nihongo," not a real deck name on its own, so the ambiguity this fixes only
exists AT this one decision point. Verified it actually fits before assuming otherwise (an earlier
version defaulted to "minna N" purely by matching genki's own rhythm, without checking) —
`.mode-option-label` renders "minna no nihongo 1" at ~170px against ~230px of real available width in
the button, measured live. `data-label` (the fly-out hover-title's OWN text, a separate string from
the button's visible label) does NOT follow suit, though — it's the short "minna 1"/"2", a real fix
for a real, caught bug: the hover-title used to read the full "minna no nihongo 1" too, and that paired
with 日本語 (3 kanji) genuinely wrapped mid-glyph in `.select-hover-title-row` at normal desktop width
(confirmed live) — the button's own on-page label has ~230px of room and was never actually part of
the bug, only the hover-title's own tighter, centered layout was. Screens reached AFTER this one
(`renderMinnaLessons`'s own title/marquee, `mountDictionary`'s own
searchBox title) go back to the shorter "minna N" — by that point the ambiguity is already resolved,
same as genki's own lesson-list/searchBox screens never spelling out "Genki: An Integrated Course in
Elementary Japanese" either. `renderMinnaLessons(volume)` mirrors `renderGenkiLessons` (Vol. I =
units 1-25, Vol. II = 26-50, the textbook's own real numbering, same "no renumbering" idea genki's
own [3,12]/[13,23] ranges already follow), and lesson buttons land on `mountDictionary({ series:
'minna', lessonNumber })` exactly like genki's own do — see "The mechanism" above for why this needed
`series` threaded through at all once a second deck's lesson numbers could collide with the first.

**`minnaLessonsHtml` filters out lessons with no kanji — genki's own `genkiLessonsHtml` doesn't,
because it's never needed to.** Every genki lesson 3-23 has real kanji; Minna no Nihongo's units
21-23 (Vol. I) are genuine review lessons with none at all. Rendering a button for those would open
onto an empty grid — reads as broken, not as an honest "nothing to review here" — so
`minnaLessonsHtml(start, end)` builds its button range then filters to
`minnaKanji[String(n)]?.length > 0` before rendering, same "don't fake what isn't there" instinct
the classification pipeline already applies (data-pipeline/CLAUDE.md). 47 of the 50 possible lesson
numbers actually get a button.

**`minnaKanji.json` (`src/data/minna/minnaKanji.json`) is deliberately thinner than
`genkiKanji.json`** — each entry is just `{kanji}`, no gloss/on/kun/examples. Nothing in
`mountDictionary` ever reads those extra genki-only fields (character/gloss/readings all come live
from `loadKanjiBundle`/KANJIDIC2, same source real Dictionary already uses — see "The mechanism"
above and this project's root CLAUDE.md phasing on why genkiKanji.json's own gloss/on/kun are
already "vestigial") — so there was nothing to hand-curate here beyond the kanji lists themselves,
536 characters across 47 lessons. Sourced from en-nihongo.com's own per-unit kanji lists (a
third-party compilation, not the official 3A Corporation textbook), cross-checked before trusting it:
the two volumes' own character counts (243 + 293) sum to exactly 536, matching the combined total
independently reported elsewhere — not merely internally consistent with itself.

### About overlay — welcome's own `about` button

`about` (welcome's OTHER option, alongside `enter the terrarium`) is no longer an inert placeholder —
clicking it opens a near-fullscreen glass overlay whose entire content is a single `<iframe>` loading
a genuinely separate static page, `public/about-terrarium/` (own `index.html`/`style.css`/`terrarium.js`/
`main.js`/`img/`/`fonts/`, no build step, zero shared CSS/JS with this app). Grilled to a full spec
before building (`/grill` session) — full rationale for every decision below is in that transcript, not
repeated here; this section is current-state-first, same convention as the rest of this file.

**Source & what changed.** Ported from a local snapshot of a separate, standalone personal-portfolio
project — the original "Duality Terrarium" (same name this app's own idle branding borrows, "One box,
every stage" above — coincidental, unrelated projects), a Babylon.js scene + scrolling content pitch,
unrelated to kanji. Several near-duplicate save-folders of it existed on disk (`~/Desktop/DUALITY*`);
the one actually matching what's live at the real deployed domain was identified by diffing each
candidate's own script-tag structure against the live site's, not by folder name (the
best-sounding-named one, "pretty much perfect?", turned out to reference a typo'd, entirely
non-functional script path — folder names tracked iteration order, not correctness). Cut entirely, not
carried over: the spacebar-triggered camera fly-in/"space sequence" and its drag-to-orbit/scroll-to-zoom
controls (only interaction left is ordinary page scroll — the Babylon terrarium itself is static camera
+ a baked-in idle spin, `terrarium.js`'s own header comment), the loader's instructional text overlay,
all audio (the Unmute button and its whole player), the Menu (Contact/Media), the custom crosshair
cursor (plain default cursor throughout), and the entire "Mass Studio Cover Letter" case-study section
(video-heavy, was already headed for removal regardless of this port). Two real bugs in the original
were fixed while porting, not left in: `index.html` loaded `terrarium.js`/`main.js` TWICE (a duplicate
`TERRARIUM_CONFIG` declaration crashed the whole script on the live site), and the base
`Panchang-Medium` `@font-face` pointed at a wrong path with a typo'd extension (`.oft`), 404ing
silently and leaving the ENTIRE page's body text on plain sans-serif fallback — real font files
vendored into `fonts/` instead. `terrarium.js`'s camera now mounts directly at what the original's
"space sequence" used to animate TOWARD (its own `space_verticalView` framing, glass shell already
dissolved, drum at its final tilt) — reached instantly, never animated into, since there's no sequence
left to reach it through.

**The overlay itself (`main.js`, `mountHome()`).** A THIRD persistent `createMossBox()` instance
(`aboutBox`, alongside `optionsBox`/`radioBox`), same "one box, one real stage" convention as
`radioBox` — hidden until `openAbout()`, then spawns in and stays landed. `position: null` (not
`'left'`/`'right'`) opts it out of the float-left/float-right side-panel modifiers; sizing/position
come entirely from its own `extraClass`, `.nora-moss-box--about-overlay` (style.css): `top/left/right`
insets in `vw`/`vh` (not fixed px — "reactive to screen size" per the grilled spec, exact numbers
tunable later, real mobile support explicitly out of scope for now), plus BOTH `height` AND
`max-height` pinned to the same value — needed because this box's content is a single iframe, not the
typed text every other box's auto-height math assumes, so nothing else would force the flex column
open; matching `max-height` specifically is what lets `spawnFrom`/`despawnTo` (mossBox.js) bump-
animate open/closed at all, since they tween that exact property. No `setMarquee()` call — this box
has a topbar (title/kanji/back-arrow) but deliberately no bottombar.

**Open/close choreography — fully SEQUENTIAL in both directions, not the "fired independently, runs
concurrently" convention most other cross-box effects in this app use** (`enterSelectMode`'s own
terrarium dispatch, further down, is a real example of that OTHER convention — deliberately not used
here): confirmed by direct feedback that welcome has to be genuinely, visibly gone before About's own
shard starts flying, not overlapping it, or the two read as disconnected instead of one choreography.
`openAbout(originX, originY)` — the clicked button's own on-screen center, read at click time —
`await`s `optionsBox.closeAndFade()` (the same "leaving for good" collapse+flash+fade
`transitionToDictionary` uses elsewhere; only ever leaves the box `.is-hidden`, never destroys its
welcome content) to FULLY resolve, then `aboutBox.spawnFrom(originX, originY)` starts immediately, no
added delay. **There used to be an artificial `OPEN_GAP_MS` pause here (200ms, then 80ms) between the
two** — added because even a fully-resolved `closeAndFade()` starting the next animation on the very
next tick still read as "welcome hasn't finished closing yet." That turned out to be papering over real
bug #2b below (the flash's lost rounded corners) rather than a genuine timing gap — once THAT was
actually fixed, the artificial pause was confirmed unnecessary and removed entirely, not left at 0 as a
vestigial no-op. Worth remembering: a "needs a bit more delay" feeling during iteration is worth
checking for an underlying visual bug before reaching for a timeout to mask it. `spawnFrom` clears the
box's content the instant it starts (mossBox.js), so the iframe (`<iframe
src="/about-terrarium/index.html">`) is only inserted once it resolves. **The explicit `/index.html` in
that src matters** — a bare `/about-terrarium/` falls through Vite's dev-server SPA fallback (and most
static hosts' default
routing) instead of resolving to the directory's real index file, and silently serves THIS app's own
root `index.html` into the iframe instead (confirmed hitting exactly this while building — the iframe
rendered a nested copy of the kanji-terrarium app itself, not the about page).

Closing (`aboutBox`'s topbar back-arrow, wired via `showBack()` once the iframe's inserted) reverses via
`closeAbout()`, same sequential discipline: `aboutBox.despawnTo(originX, originY)` (the same point it
opened from) must fully resolve, THEN — a real, since-fixed leak, see its own paragraph below —
`aboutBox.setContent('')` tears the iframe down, THEN `optionsBox.spawnFrom(originX, originY)` plays
welcome's own genuine shard-flight/bump-expand re-entrance (not the plain instant `show()` this used to
be — a real, reported bug: welcome used to just "pop back into place" instead of replaying its own
closed-shard-then-open entrance the way every other box's first appearance in this app does), and
`setContent(welcomeHtml())` right after is what actually puts the buttons back (`spawnFrom`'s own
contract: "resolve once full size and ready for content, still empty," mossBox.js's own comment) — this
also does double duty undoing `closeAndFade`'s own pinned-to-0 content sizing (below has the full
story), since `optionsBox` never actually left the DOM or lost its welcome markup, just got hidden.

**The terrarium underneath stays fully live and rendering the WHOLE time About is open — no teardown,
no pause, nothing — a deliberate, settled decision now, not a deferred one.** Genuinely tried pausing it
(stopping its own `requestAnimationFrame` loop while About covers it, resuming instantly on close) as a
real fix for real #3 below's own performance concern — "Terrarium pause/resume, tried and reverted"
right after real bug #3 has the FULL story of why, worth reading in full before ever trying this again,
not just this one-line summary: the about box was never actually full-screen (`top:5vh; left/right:5vw`
— a real margin all the way around it, "About overlay" above), so the terrarium is genuinely visible
in that margin the ENTIRE time About is open, whether paused or not — pausing it there is a visible
frozen background, not an invisible optimization, in EVERY case, not just an edge case (zooming in just
made it obvious enough to actually notice). Reverted cleanly rather than layered around — see that
section for the real options if this gets revisited.

**Real bug #1, caught by actually clicking through it (not just the sandbox's own settled-state
checks):** a plain `optionsBox.show()` (an earlier version of `closeAbout`) left welcome PERMANENTLY
stuck — box visibly back on screen (topbar reads "welcome") but its content area collapsed to 0 height,
nothing showing, nothing clickable. `closeAndFade()` deliberately PINS `.nora-moss-content`'s
max-height/min-height/padding to 0 instead of clearing them when it closes a box (that function's own
comment in mossBox.js) — normally undone by a fresh `spawnFrom()`'s own "defensive reset" of those same
four properties, which a plain `show()` never runs. Now fixed properly: `closeAbout()` uses
`optionsBox.spawnFrom()` (which does that reset as a side effect of its own contract) instead of
`show()`, described in full just above. Worth remembering for ANY future case that closes a box via
`closeAndFade()` and later wants that exact box visible again via anything OTHER than `spawnFrom()`.

**Real bug #2, a genuine shared-code bug in `closeAndFade()` itself (mossBox.js), not specific to this
feature — also benefits `transitionToDictionary`'s own use of the same function.** Reported directly:
"welcome closes, goes white [the flash], then it opens again, then just disappears" — instead of one
continuous "flash, then gone." Root cause: the box's own disappearing fade (`.is-hidden`) used to only
start AFTER the flash had fully cleared, leaving a real, visible gap — the small collapsed (but still
fully opaque) box became visible again for a beat once the flash uncovered it, before its own separate
opacity fade even began. Fixed by starting `.is-hidden` right when the flash shield first appears
(under cover, at full white), giving the fade the flash's own ~520ms (flashIn+flashOut) to finish well
within cover instead of racing it afterward. That fix needed the shield ITSELF to move out of being a
child of `box` — CSS opacity is multiplicative down the tree, so a shield nested inside a
simultaneously-fading box would fade along WITH its parent instead of staying solidly white; the shield
is now `position:fixed`, sized to box's own real (collapsed) rect, appended to `document.body` instead
(z-index 41, matching `.moss-spawn-shard`'s own tier, since it's no longer covered by box's own
`isolation:isolate` stacking context). `regenerateBox`'s OWN separate shield-creation code is untouched
— it never had this problem (box stays visible throughout a content swap, nothing to hide).

**Real bug #2b — a direct, confirmed follow-on from #2 above, not a separate root cause.** Reported
directly: "you completely lose the shape of the shard, it goes to a hard edge instead of the curved
edge" — the white flash lost its rounded corners and rendered as a plain square-cornered rectangle.
While the shield was still a CHILD of `box`, it got `border-radius:14px` for free from box's own
`overflow:hidden` clipping anything that overflowed its rounded shape — `.moss-regen-flash` itself
carries no `border-radius` of its own, it always relied entirely on the parent clipping it (worth
knowing: `regenerateBox`'s OWN separate, untouched shield still gets this for free today, which is
exactly why THAT flash still looks correct — same class, different context). Moving the shield to
`document.body` for the fix above meant it was no longer inside anything that clips it. Fixed with one
explicit `shield.style.borderRadius = '14px'` right where the shield's position/size get set — matching
`.nora-moss-box`'s own real radius, not a guessed number. Worth remembering for ANY future element moved
out of a clipping parent for its own reasons: clipping and cropping are easy to take for granted as
"just how it looks" until the thing providing it is gone.

**Real bug #3 — a genuine performance regression, confirmed by direct report ("everything's getting
really laggy... it wasn't doing this before we introduced this fake web page"), not a perception issue
or an unrelated laptop problem.** `despawnTo` (About's own close animation) only ever hides `aboutBox`
— it never touches its content, so the `<iframe>`, and the SECOND full Babylon.js engine + its own
`runRenderLoop()` running inside that separate document, stayed alive and rendering INVISIBLY in the
background for the entire time About was closed — a real second WebGL render loop competing for
GPU/CPU with the main terrarium's own choreography (select mode, flashcards) indefinitely, only ever
actually torn down the NEXT time About happened to reopen (`spawnFrom`'s own defensive
`content.innerHTML = ''`). Fixed in `closeAbout()`: `aboutBox.setContent('')` right after `despawnTo`
resolves, the instant the box is fully hidden — genuinely unloads that iframe's document (which
actually stops its render loop) instead of leaving it running until the next open. Worth remembering
for anything else that ever puts a second live renderer (Babylon, Three.js, a video, anything with its
own render/animation loop) inside a box that only gets visually hidden, not torn down.

**Terrarium pause/resume — tried, and reverted. Read this whole section before ever trying it again,
not just the one-line pointer above it.** Written in plain English on purpose, per explicit request —
performance/GPU issues in 3D apps are exactly the kind of thing that's easy to get lost re-debugging
from scratch in a future session, so the goal here is a future reader (human or AI) being able to
understand the whole reasoning without decoding jargon.

*The idea:* real bug #3 above fixed the terrarium competing with About's own Babylon scene for GPU
*after* About was closed. There's a separate, smaller version of the same competition *while* About is
open: the main terrarium keeps rendering every single frame the whole time, even though About's box is
covering it and nobody can see it — genuinely wasted GPU work. The idea was to pause the terrarium
(stop asking the browser to draw new frames) the moment About fully covers it, and un-pause it the
instant you hit back — before the box even starts shrinking away, so the terrarium is already "alive"
underneath by the time there's anything to see.

*Why that's not as simple as it sounds — the actual GPU concept worth understanding:* there's a real
difference between STOPPING a 3D scene from rendering and DESTROYING it. Building a 3D scene the first
time (compiling its shaders, generating its geometry) is slow-ish — noticeably slow-ish on a weak
device. Once built, though, all of that stays sitting in GPU memory; RENDERING a frame from an
already-built scene is fast, milliseconds. "Pause" in the attempted version meant only stopping the
drawing — genuinely nothing was destroyed, so "resume" was instant, zero rebuild cost, none of the "did
it load back in time" risk a full teardown-and-rebuild would have. That part of the idea was sound and
worked correctly when tested.

*The actual, fatal problem — genuinely not something to just retune, worth understanding precisely if
this ever comes back:* the about box was never truly full-screen. It has a real margin all the way
around it (`top: 5vh; left/right: 5vw`, "About overlay" above — "fill the screen with some padding,"
from the very first spec), so a strip of the terrarium is ALWAYS visible in that margin, every single
time About is open — pausing it there is a visibly frozen background in that strip, in every case, not
some rare edge case. (Zooming in on the terrarium first just made the frozen strip obvious enough to
actually notice and report — the underlying problem exists regardless of zoom.) There is no tuning fix
for this: pausing a 3D scene that's genuinely still partially on screen will always look frozen, because
it genuinely is.

*Reverted cleanly, not left half-in:* `terrarium.js`'s `pause()`/`resume()` functions and their two call
sites in `main.js` (`openAbout`/`closeAbout`) were removed entirely — the terrarium mount function is
back to returning just `{ dispose, enterOrb }`, no dead pause/resume code left lying around to confuse
a future read of this file.

*If this ever gets revisited, two real paths — pick one, don't try to patch the reverted approach:*
1. Make the about box genuinely edge-to-edge (no margin) so nothing's left visible to freeze. Real
   tradeoff: loses the "framed window with breathing room" look the current padding gives it.
2. Keep the padding, accept the terrarium stays visible in that strip, and instead of pausing rendering
   entirely, throttle its frame rate way down (e.g. render every 4th-6th frame) whenever About is open —
   genuinely reduces GPU work without ever fully freezing, at the cost of the terrarium looking visibly
   choppier in that margin while About is open (a real, honest tradeoff, not a hidden one).

**Verification note for a future session touching this:** the shard-flight animations `spawnFrom`/
`despawnTo` play (`flyShard`/`flyShardBack`, mossBox.js) are built on raw WAAPI
`element.animate(...).finished` with no timeout fallback — the exact failure mode "This session's
sandbox limitations" (below) already documents for `flashIn`/`flashOut` before those were rebuilt away
from it. `flyShard`/`flyShardBack` were NOT rebuilt the same way and still carry that risk — confirmed
actually hanging indefinitely in this session's own Browser-pane sandbox. `closeAndFade()` (real bug #2
above) does NOT have this problem — it's built entirely on `waitTransitionEnd`/real CSS transitions, so
it WAS directly, fully observable completing in this same sandbox (confirmed: welcome ends up genuinely
`.is-hidden`, styles cleanly reset, no leftover flash shield in the DOM). Everything else was verified
by driving DOM state directly to each phase's settled end-state instead of waiting on the animation
(this file's own established workaround, "This session's sandbox limitations" below) — the overlay's
sizing math (exact 90vw×90vh at two different viewport sizes), the ported page's own content/scroll/
font-fix/Babylon-idle-spin/loading-blink. The one thing still not directly observed completing
end-to-end is the shard-flight portion of the open/close motion itself — high confidence it works in a
real browser regardless, since `spawnFrom`/`despawnTo` are pre-existing functions already used
elsewhere in this app (`radioBox`'s own entrance), not new code — but real click-throughs in an actual
browser are what caught real bugs #1-#3 above, all invisible to the sandbox's own settled-state checks.

**Current settled visual tuning, landed on after real live iteration, not guessed — retune the same
way (live, in-browser, at real content sizes) if these need adjusting again:**
- `--about-overlay-blur: 0.6px` (`apps/web/src/style.css`, `:root`) — applied to the WHOLE iframe (text
  included) via `#about-panel iframe`'s `filter`. History worth knowing: per-element blur (heavy blur
  on just images/canvas, zero on text) was tried and explicitly reverted — "it's making it look worse
  because they don't look like they're all from the same world." One shared blur is the actual design.
  Landed at 0.6px specifically because the page's real body text computes to just 12px — the same
  section's own "Real root cause" note (further down, search `getComputedStyle`) has the full math.
- The scrollbar is deliberately UNSTYLED — plain browser default. Two real attempts at an
  always-visible one (native `::-webkit-scrollbar` styling, then a fully custom-built indicator
  element driven by real scroll position) were each built, verified working, and then explicitly
  reverted anyway — "there's a lot of problems with this scrollbar... just put it back to how it was."
  Not a dead end if revisited: the custom-element version worked correctly end-to-end when reverted,
  it just wasn't wanted, worth knowing before re-deriving the same approach from scratch.

**Loading-blink → reveal choreography — `public/about-terrarium/` (index.html/style.css/main.js), NOT
`apps/web/src/style.css` any more.** `#about-loading` plays a brief (three hard on/off blinks, ~960ms)
fake-loading flourish before the typewriter starts — jade-glow text ported by eye from kanji-terrarium's
own dictionary-mode loading state (`#viewer-loading`, apps/web/src/style.css), not shared code.
`#scanline-overlay` (full-viewport, `z-index:1000`, on top of everything) lives inside the ported page
now, not in the parent app's CSS where it originally landed — moved specifically so the loading-blink
choreography below could drive it off a REAL event (the blink's own promise resolving), which only a
script inside this same page has firsthand; the parent app reaching in would only ever be able to guess
the timing via an external `setTimeout`, fragile against this page's own timing ever changing.

**Scanlines are ONE consistent look now, not a dark/light toggle — genuinely tried and reverted, real
bug, not a taste call.** The original idea: dark lines (visibly cutting across bright text too) during
the fake-load, switching to light lines the instant it resolves — the switch itself reading as "it just
finished loading." Broke the moment the REST of the hero also got hidden during loading (next
paragraph): with the title/images/terrarium all hidden, the loading-phase background is plain black, and
DARK lines painted over plain black have zero contrast — invisible. Reported directly as "the CRT
disappears... then comes back" once the bright content faded in. Reverted to the single light recipe
(`about-terrarium/style.css`'s own comment on `#scanline-overlay` has the exact values) — genuinely
visible against black OR bright content, nothing left to break by hiding what's behind it.

**The REST of the hero (title, terrarium underlay images, the Babylon canvas) is gated behind this same
moment too, not just the two typewriter text blocks.** Explicit request and a real coherence fix: those
elements used to render at first paint like everything else in this file's raw HTML, so the fake-loading
message ended up floating over an already-fully-visible page — nothing left to visibly "load." Now
hidden (`opacity: 0`) until `.scanlines-loaded` lands on `<body>`, the exact same class/moment that
flips the scanlines and starts the typewriter — one flag now drives all three.

**Real bug hit wiring this up, a genuine CSS specificity trap, not a logic error:** a plain
`.duality-title, #loader-canvas { opacity: 0; }` looked correct but didn't visibly do anything — this
file already carries its OWN pre-existing opacity rules for both (`.duality-title` itself sets
`opacity: 0.8` further down the same file — equal specificity, but LATER in source order, so it won on
cascade order alone; `body.page-loaded #loader-canvas` sets `opacity: 0.8` too, and is simply MORE
specific than a bare `#loader-canvas`, and `body.page-loaded` is ALWAYS true here — `<body
class="page-loaded">` from index.html, never toggled). Confirmed directly via `getComputedStyle` mid-
load before believing it was fixed: both sat at 0.8 opacity the whole time despite the new rule.
Resolved with `!important` on both the hidden and revealed states — deliberate here, not a lazy
override: this file already has enough scattered, sometimes-duplicated rules (this section's own
earlier "dead CSS" comment near the top) that chasing down and editing every existing opacity
declaration individually is more fragile than one unambiguous `!important` pair that wins regardless of
what else in this file touches these three elements.

**A real, separate bug, worth understanding precisely if load timing ever regresses again:** the ported
page used to have a genuine multi-second dead pause after the title appeared and before anything else
loaded — confirmed root cause: `index.html`'s Babylon CDN `<script>` tag (and `terrarium.js` right
after it) were plain, ordinary blocking `<script src>` tags. A blocking script tag stops the HTML
PARSER until it finishes downloading — and since `main.js` (which drives the loading blink and
typewriter, nothing to do with Babylon at all) sat AFTER those two in the document, it couldn't even
start running until that CDN fetch completed, which can genuinely take seconds on a real network. Fixed
two ways together, both needed: (1) `defer` on both the Babylon and `terrarium.js` tags — lets the
parser continue immediately instead of blocking there, while still guaranteeing `babylon.js` finishes
before `terrarium.js` runs (deferred scripts execute in their own relative document order); (2) `main.js`
no longer waits for `DOMContentLoaded` at all — it used to, but `DOMContentLoaded` itself doesn't fire
until every deferred script has ALSO finished, which would have reintroduced the exact same stall.
Running directly instead, no listener, is safe specifically because `main.js`'s own `<script>` tag is
the very last thing in `<body>` — by the time the parser reaches and executes it, every element this
file touches already exists in the DOM, which is the whole reason "put your script at the end of body"
is a real, load-bearing pattern here, not just a convention.

A real, separate bug caught while building the loading blink itself: the typewriter targets
(`#dualitySubtitle`/`#terra-def`) have their real, final words baked straight into `index.html` —
without `visibility: hidden` on them from the very first paint (`about-terrarium/style.css`), the
browser could paint that full text once before the typewriter functions ever ran to blank it, a flash
of the finished page before it "loads." `visibility: hidden`, deliberately not `display: none`/
`opacity: 0` — those two typewriter functions both measure real layout height (`offsetHeight`) before
blanking text, and `visibility: hidden` is the one hiding method that stays fully laid-out and
measurable while genuinely painting nothing.

**`#about-loading` used to carry its own small local `filter: blur(1.5px)` (about-terrarium/style.css),
on top of whatever the parent app's own `--about-overlay-blur` (0.6px) already applies to the whole
iframe — reverted, reported directly as reading heavy, not subtle.** Originally added because 0.6px is
tuned against this page's actual body text (12px), and at 22px the identical absolute blur reads
proportionally much weaker (~2.7% of font size vs ~5%) — a real, checked reason, not a guess. But the
two blurs COMPOUND rather than just picking whichever is stronger (this element's own filter blurs its
text first; the parent's iframe-wide filter then blurs the whole already-blurred composite again on
top of that), and that stacking read as heavy once actually seen live rather than "subtle glass." Fixed
by removing the local `filter` entirely — `#about-loading` now picks up only the SAME shared
`--about-overlay-blur` every other element on this page gets, one source of truth, no per-element
override. If a future report says this label specifically still doesn't feel "in the world" enough, the
fix is retuning `--about-overlay-blur` itself (affects the whole page) — not reintroducing a second,
stacked, element-local blur on top of it.

**Horizontal scrollbar — real bug, fixed by removing content, not by hiding the overflow.** The `#alt`
section's three images (`mouse.png` 400px, `boots.jpg.png` 500px, `boots-white.png` 520px) summed wider
than the page ever accounted for — confirmed directly via `getBoundingClientRect`, not guessed: the
rightmost image's own right edge exactly matched `document.documentElement.scrollWidth`, and removing it
dropped that scrollWidth by exactly its own width. `boots-white.png` removed entirely from `index.html`
(and deleted from `img/`, confirmed nothing else referenced it first) rather than papering over it with
`overflow-x: hidden` — explicit request ("rip it out"), and the more honest fix anyway: hiding the
overflow would have left that image rendered off-screen and permanently unreachable rather than actually
resolving the layout math. `mouse.png`/`boots.jpg.png` (the two remaining images) are unaffected. Verified
zero horizontal overflow afterward at the about box's own real rendered width (1152px on a 1280px-wide
window), not just a guess.

**Page zoom — hovering this page and Ctrl+scrolling (or trackpad-pinching) zooms the fake web page
itself, for readability, per explicit request.** `public/about-terrarium/main.js`, right above
`attachHeavyScroll()` (its own comment there has the full mechanism) — not `apps/web/src/`, same "no
shared code" boundary this whole feature already keeps. The one existing global `wheel` listener
(already `preventDefault()`ing every wheel event to drive the page's own weighted scroll) now branches
on `event.ctrlKey` first: true means zoom (`applyPageZoom`, scaling `document.body` via
`transform: scale()`, origin tracking the cursor), false means the ordinary scroll, unchanged. Trackpad
pinch and a real Ctrl+scroll are indistinguishable at the event level (both arrive as `wheel` +
`ctrlKey: true` — the same ambiguity `scene.js`'s own `PINCH` handling in the main app already
documents), so both just work via the one check. `<body>` scales, not `<html>` — `attachHeavyScroll`'s
own scrollTop target is `document.scrollingElement` (`<html>`), so leaving that untransformed keeps it
the one real scrolling box; every `position:fixed` element on this page (scanline overlay, hero
title/terrarium/canvas, loading flourish) scales and pans WITH the rest of the content instead of
staying pinned to the true viewport, because a `transform` on `<body>` becomes their new containing
block (standard CSS behavior, not a workaround) — `position:sticky` is untouched by this for the
opposite reason, it resolves against the nearest actual scroll container, still `<html>`. Range clamped
1x–3x (`PAGE_ZOOM_MIN`/`PAGE_ZOOM_MAX`), sensitivity `0.01` — both first-guess numbers, not measured
against a real trackpad/mouse, same "retune live" caveat as every other untuned motion constant in this
file.

**Real bug, caught immediately on real use, not by this session's own sandbox (which can't verify
CSS transform feel at all — see "This session's sandbox limitations" below): zooming from partway down
the page produced "weird interactions," cutting off the top instead of zooming toward the cursor.**
Root cause: the origin was computed as a PERCENTAGE of the VIEWPORT
(`event.clientX / window.innerWidth`, etc.) but applied as `body`'s own `transformOrigin` —
`transform-origin` percentages are relative to the element's OWN border box, not the viewport. `body`'s
real box is the page's full scrollHeight (thousands of px), not the ~800px viewport window sliding over
it, so "50%" landed at the vertical middle of the WHOLE DOCUMENT regardless of actual scroll position or
cursor location — scaling around that far-away, scroll-independent point is exactly what read as
"weird"/"cuts off the top." Fixed (`applyPageZoom`, `main.js`) by computing the origin in PIXELS, in
`body`'s own document-space coordinates (`scrollEl.scrollTop + event.clientY`, not `clientY` alone) —
`body`'s own box doesn't move as you scroll (the root `<html>` scroller just slides a viewport-sized
window over it, "Page zoom" comment above), so this lands the origin exactly under the cursor at any
scroll position, with no separate scroll-compensation step needed: a `transform-origin` point is
invariant under its own element's scale by definition, so anchoring it there is what keeps that exact
pixel under the cursor as scale changes — a real, structural fix, not a retuned number.

**Still not independently re-verified in a real browser after that fix** — same sandbox limitation as
before; the math above is correct by the CSS spec (verified by reasoning through the transform-origin
algebra, not by watching it render), but a real click-through — zooming from various scroll positions,
confirming the pivot genuinely tracks the cursor, and that the sticky sections still track correctly
while zoomed — is what actually settles this.

### Technology & System Overview — the pyramid, the flow strip, and the sticky title stack

**`#stack-architecture`'s own visible text has been "System Architecture," then briefly "System
Design," now "System Overview"** — worth knowing the history before renaming it again. "System
design" was tried and reverted fast: it's a loaded, specific term in tech (backend/
distributed-systems engineering — the "system design interview" sense: load balancers, databases,
sharding, API scaling) that doesn't describe anything this section actually covers — the paired
LAYER 1-4/RUNTIME content is entirely client-side (a dataset, a classifier, a 3D renderer, a UI), no
backend anywhere. Correct in the dictionary sense, misleading in the sense that actually matters to
a reader who knows the term. "System Overview" settled on instead — plain, no risk of the same
misread, and it's a fair description of what this box (`#case-right`'s own LAYER 1-4/RUNTIME
paragraph) actually is, a top-to-bottom overview of the whole system.

`System<br>Overview` also carries a real, kept change from that same pass: an explicit `<br>`
between the two words now, matching how `#stack-technology`/`#stack-flow` already force their own
breaks, rather than relying on natural wrap the way this title used to ("System Architecture" wrapped
on its own before any of this). Same real rendered height either way (72px, confirmed live at every
step of this rename — "Architecture," "Design," and "Overview" all land on it), so none of the
sticky-stack's own pixel math below (`#stack-flow`'s `top`/`margin-top`, both derived from this
title's real height) ever needed recalculating.

Three real, separate pieces inside `#case-study`, built/reworked heavily in one later session — none
of this existed when the rest of "About overlay" above was written. Current-state-first, same
convention as everywhere else in this file.

**The pyramid (`.layer-diagram`, `.case-textbox`) is bottom-up, not top-down.** DATA SOURCE is the
widest tier at the bottom; CLASSIFICATION ENGINE, RENDERING ENGINE, INTERFACE SYSTEM narrow going up.
This isn't just a visual choice — the prose paragraph directly above it already says "sitting
underneath everything is KanjiVG," "sitting on top of KanjiVG is KANJIDIC2," "sitting directly on top
of the render engine is the interface" — an earlier top-down version of this diagram actively
contradicted its own copy. Widths are FIXED steps (100/80/60/40%), not content-length-driven (a
longer item string in a "should be narrower" tier would invert the shape); alignment is flush-left,
not centered — load-bearing, not a style pick: flush-left is what leaves real empty space on the
RIGHT of the narrowest tier for RUNTIME ENVIRONMENT to sit in.

**RUNTIME ENVIRONMENT is deliberately NOT a 5th narrowing tier.** The prose's own RUNTIME paragraph
calls it what "all four layers... execute" inside — the container, not a layer — so it sits in a top
row beside INTERFACE SYSTEM (`.pyramid-top-row`), outside the width-stepping sequence. Its own item
list, after several rewrites, settled on: Single Page Application, Custom State Machine, Client-Side
Rendering, Zero Pre-Made 3D Kanji Assets (this last one bold, `<strong>`, no border/box of its own —
two earlier attempts gave it a bordered box, then a jade glow; both reversed, see the "G3 aesthetic"
note just below for why glow specifically was rejected).

**Real bug, easy to reintroduce: `<strong>` doesn't reliably render bold on this page.** Every real
heading in `#case-study` (`.invert-text`/`.case-textbox`'s shared rule) sets `font-weight: 300` as the
inherited base. A bare `<strong>` relies on the browser's own relative `font-weight: bolder` keyword,
not a fixed 700 — and per the CSS Fonts spec's own "bolder" lookup table, stepping up from a base
UNDER 350 only reaches 400, not 700 (that jump only happens from a 350–549 base). Confirmed directly:
`getComputedStyle` on a real `<strong>` here returned `400`, visually indistinguishable from the
surrounding 300 text. Fixed once, broadly, via `#case-study strong { font-weight: 700; }` (style.css)
rather than per-element — covers every heading in the section, not just the one it was caught on.

**The "G3 aesthetic" lesson — a THIN-LINE icon is a modern flat-design convention regardless of
color.** Came up chasing the landing-page scroll-hint arrow (below) and then the pyramid/flow-strip's
own connector arrows: a two-hairline-stroke chevron reads as 2010s+ flat iconography no matter what
color it's drawn in — period (2000s) UI chrome was solid, filled shapes with a simple light-to-dark
gradient giving a slight embossed read, not line art. Fixed by switching to a `clip-path` triangle
with a `linear-gradient` fill and ONE `drop-shadow` (not `box-shadow`, which wouldn't follow the
clipped shape) — no glow anywhere: an actual glossy Aero/Aqua sheen was tried once (`mossBox.js`'s own
`tileEnter()`, main app) and rejected for reading as a modern loading shimmer instead of a real
2000s-glass surface: "the opposite of a late-2000s glass aesthetic despite looking gentler." Glow, not
shine, restraint, not gloss — that's the real house style whenever "make it more retro/G3" comes up
again.

**The flow strip (`.flow-strip`, titled "BESPOKE 3D KANJI ENGINE") is a THIRD, separate diagram** —
not a variant of the pyramid, sitting BEFORE the LAYER 1-4/RUNTIME prose as a one-glance preview.
First child of `.case-block` on purpose, so it shares the same `skewX(-5deg)` as `.invert-text`/
`.case-textbox` (below has the full story on why that matters). Five steps, cross-checked against the
real app code, not just plausible-sounding: **Kanji Input (Unicode)** → **Stroke Data (KanjiVG)** →
**Mesh Outline (JavaScript)** → **3D Render (Three.js)** → **User Interaction (Raycasting)**. That
last parenthetical went through a real correction: an earlier draft said "(WebGL)," which is wrong —
WebGL is the GPU draw call 3D Render already covers; hover/click/drag hit-testing is CPU-side
`Raycaster` math against pointer events in `viewer/scene.js`, a different mechanism. The 3rd step was
renamed twice — "Geometry Engine" collided with the strip's own title also ending "...ENGINE" (read
like two engines) and ran long enough to wrap its box to an extra line the other four didn't need;
"3D Outline" fixed both, then became "Mesh Outline" on a further request. Below the row, one bold
tagline, NOT more steps — "Reactive, Robust, Client Side 3D Kanji Generation, With Zero Pre-Made
Assets Or Backend Dependencies." — deliberately pulled out of being pipeline stages: nothing is
"pushed through" real-time generation the way stroke data is pushed through the render pipeline, it's
the claim the pipeline earns by completing, not a step in it.

**The single biggest technical lesson from this whole pass — aligning two DIFFERENT-HEIGHT elements
inside one shared `skewX()` parent.** `.flow-strip` needed its edges to match `.invert-text`'s real
rendered edges (both live inside `.case-block`'s one shared `skewX(-5deg)`). This went through a real
chain of mistakes worth not repeating:
1. Matched `.case-textbox`'s own 90%/10px box recipe verbatim — fit fine, but sat ~254px right of
   `.invert-text`'s own left edge (never asked to match it yet at that point).
2. Solved a FIXED-PIXEL `margin-left` (`-244px`) against one Browser-pane tab's own viewport width —
   broke immediately at a different real window width, confirmed by direct report (the box shifted
   hard left, nearly into the sticky title column). **Fixed pixels are never safe for a
   viewport-WIDTH-dependent quantity.**
3. Widened the box while leaving `margin-left` at the safe-but-wrong 10px anchor — overflowed past
   the paragraph's own right edge instead; matching width alone from the wrong anchor point isn't the
   same as matching the real footprint.
4. Solved width AND margin-left TOGETHER as two independently-computed percentages (`132.65%` /
   `-41.5%`) — matched perfectly in one Browser-pane tab, and NOWHERE else. The real, structural
   reason: `skewX`'s horizontal shift (both position AND how much a shape's own rendered bounding box
   widens) is a function of an element's HEIGHT, in fixed pixels, genuinely INDEPENDENT of viewport
   width — while `width`/`margin-left` in `%` scale WITH viewport width by definition. Combining a
   width-independent pixel term with width-dependent percentage terms only balances at the one
   specific width it was solved against.
5. **The actual fix** — stopped trying to independently solve a width/margin pair at all. Copied
   `.invert-text`'s own width/margin-left VALUES exactly (`120%` / `-25%`, `.case-right p`) instead of
   computing different ones — since both elements share the same skewed parent, identical
   width/margin means their PRE-skew edges are algebraically identical at every viewport width (the
   width-dependent terms cancel exactly, always, by construction). What's left is ONLY the skew-shift
   DIFFERENCE between the two elements' own heights — genuinely a fixed-pixel, viewport-width-
   independent quantity this time (not a repeat of mistake 2: that px value stood in for a
   width-dependent quantity; this one only ever has to cancel a height-dependent one). Applied as
   `transform: translateX(-96px)` for position, plus a SECOND, related discovery while verifying the
   right edge — even with IDENTICAL declared `width` (both computed to the exact same real px value),
   the two elements' RENDERED bounding rects still differed in width, because `skewX` makes a TALLER
   shape's axis-aligned bounding box wider than a shorter one at the same nominal width. Also fixed
   height-driven, applied as a fixed px ADDED via `calc(120% + 73px)` on top of the matching
   percentage, not a different percentage. Verified at two different real viewport widths: right edge
   landed pixel-exact both times; left edge went from ~254px+ off down to ~10px, not exact —
   **a real, structural limit, not a tuning gap left unfinished**: `.invert-text` is six paragraphs of
   prose that reflow substantially with viewport width, `.flow-strip`'s content barely does, so the
   HEIGHT DIFFERENCE driving the skew-shift residual isn't actually a true constant across every
   width either — no single static CSS value zeroes it out everywhere. ~10px reads as aligned; exact
   alignment at literally every possible window width isn't achievable with static CSS here. Retune
   both the `translateX` and the `calc()` px term together, live, if `.flow-strip`'s own content
   height ever changes again (a wording change, a spacing change, anything that reflows it) — same
   "re-measure, don't reuse an old value" discipline as every other skew-adjacent number on this page.

**The sticky title stack (`.case-left`) — four independently-sticky elements, chained, replacing the
old single sticky h2+h1 block.** `#stack-duality` ("Duality Terrarium," a real `<h2>`, deliberately
tiny — 15px, `!important` — sized to sit inside "TECHNOLOGY"'s own text width, not matching any of
its own pre-rework history), `#stack-technology`, `#stack-architecture`, `#stack-flow` — each travels
in normal document flow alongside its OWN paired block in `.case-right` (`#stack-technology` ↔ the
flow strip, `#stack-architecture` ↔ the LAYER 1-4/RUNTIME paragraph — specifically synced to land
exactly on "LAYER 1: DATA SOURCE," that paragraph's own first line — `#stack-flow` ↔ the pyramid),
then locks flush under the title before it once it reaches its own `top` offset. Pure CSS,
no JS — `position: sticky`'s own native behavior (track normal flow until you'd cross the pinned
offset, then hold) already IS "travel alongside, then stick"; chaining four with increasing `top`
values (each = previous title's own top + its real height + a 36px gap — full line-break spacing
between every pair EXCEPT Duality→Technology, which is flush/0px by explicit request, "the one title
that genuinely sticks TO Technology") is what produces the stacking-underneath effect for free, and
it reverses cleanly on scroll-up since nothing here is a one-shot triggered animation. Every offset
and every `margin-top` (the natural, pre-stick position, independently solved per title to sync with
its own paired box's real top edge) was measured live against the real rendered heights, not
estimated — re-measure fresh any time this section's content changes at all, the same discipline the
flow-strip's own alignment fix above needed.

`.case-left`'s own `align-self: flex-start` had to come OFF again for this to have room to work —
worth flagging directly since this exact override was reverted back ON once earlier in this project's
history, for an unrelated reason (an earlier single-title sticky attempt felt wrong and was undone).
This time it's structural, not a repeat: four independent lock points need real room across the
section's full height to travel through, not the ~120px sliver `align-self: flex-start` leaves.

**Real, confirmed bug: reintroducing a genuine `<h2>` tag for Duality Terrarium silently broke its
own sizing.** `.case-study h2` — an entirely unrelated rule elsewhere in this file, predating all of
this — turned out to be dead CSS with no live target until `#stack-duality` became a real `<h2>` and
started matching it; its descendant selector (`0,1,1` specificity) beat the class-only styling rule
(`0,1,0`), silently overriding font-size/weight/opacity. Fixed via the `#stack-duality` ID rule
instead of touching `.case-study h2` itself (unknown what that one was originally for) — and given
this was the SECOND unrelated specificity collision found on this exact element in one session,
every property on `#stack-duality` now carries `!important`, deliberately, not defensively-for-its-
own-sake.

**An abandoned approach worth knowing about so it doesn't get reinvented:** a full pass pulled
"Duality Terrarium" OUT of this stack entirely into its own `position: fixed` overlay, revealed via a
scroll listener timed to the exact moment `#alt` (mouse/boots) locks into its own sticky view — built,
verified working end-to-end (dynamic threshold, real measured coordinates, clean reveal/hide
reversibility). Then explicitly reverted on direct request ("forget about the whole trick") in favor
of keeping Duality Terrarium in the same chained stack, just sized down. **None of that fixed-overlay
code exists any more** — no `#fixed-duality-title`, no reveal-scroll JS — don't assume it's still
there from an old description; this paragraph is the only record of it having existed.

**Scroll-hint arrows — the landing page's own "scroll down" cue, and a matching one on `#alt`.**
`.scroll-hint-arrow` (landing page, under "Scroll down to learn more about the project.") is the
canonical version of the "G3 aesthetic" solid-triangle recipe above: bounce + opacity pulse
(`scroll-hint-bounce`, `0.35↔1` opacity, `linear` timing — not eased, this project's own established
stance is that eased motion on a small loop reads as "modern and ai," constant speed reads as
deliberate). `.scroll-hint--alt` reuses the identical visual recipe on `#alt` (mouse/boots) but with
independent positioning (`position: absolute` within `#alt` itself, not centered under a text column
the way the landing-page one is, since `#alt` has no equivalent column) and its OWN real bug fix:
**`#alt` stays sticky-locked, visually dominant, for a long stretch of scroll while "Duality
Terrarium" is ALREADY scrolling into view underneath it** (a normal, non-sticky element in
`#case-study`, moving at ordinary scroll speed regardless of whether `#alt` is still stuck) — and this
arrow's own `z-index: 5` (above both sections' `z-index: 2`) let it paint on top of that newly-visible
title regardless. Fixed with `updateAltArrowVisibility()` in `main.js`'s existing scroll tick loop,
fading the arrow out once Duality Terrarium is genuinely visible, back in on scroll-up. **The
threshold is computed LIVE every call, not a hardcoded scrollTop** — deliberately, learning the
`-244px` lesson above a second time: every `section` on this page ties its own height to
`calc(100vh - 100px)` (the base `section` rule), so the scroll distance before `#case-study` even
starts is proportional to viewport HEIGHT too, not just width — a fixed number would drift with
either dimension. `getBoundingClientRect().top + scrollTop` gives the title's real absolute document
position at the current scroll state (viewport-size-independent, since it's measuring where the
element actually renders, not predicting it), recomputed fresh on every scroll tick.

The flow-strip's own four connector arrows do NOT pulse — tried once (matching the scroll-hint
arrows' own motion), reverted on direct request: too much motion competing with an already-busy row
of five two-line boxes. Only the two standalone "scroll down" cues (landing page, `#alt`) keep it.

### Known gaps, not fixed here

- `custom` no longer exists at all (see "One box, every stage" above) — no deck-building UI to build
  until there's real per-user storage to build it against. (`guide`, select-mode's other placeholder,
  is gone too now — not a gap, just removed, see the same section.)
- `src/viewer/scene.js`'s `mountScene` has no `dispose()`/teardown of its own — going home →
  dictionary → home → dictionary repeatedly currently leaks one WebGL context per round-trip (the
  terrarium's own dispose was the one that actually mattered for the original pass, since it's the
  heavy one). Fixing this means giving `mountScene` a real dispose, mirroring `terrarium.js`'s
  approach. `mountFlashcardSession` is a SECOND caller of the same un-disposed `mountScene` now, so
  home → a genki lesson → home → a genki lesson leaks the exact same way — one real fix (giving
  `mountScene` a dispose) covers both call sites, not two separate fixes.
- `#back-to-home-btn` is deliberately unstyled (plain HTML button) — a real design pass was
  explicitly deferred until the dictionary↔home round-trip itself was proven working. The flashcard
  session's own exit button is at the same "functional, unstyled" stage — no design pass yet either.
- About overlay ("About overlay" above): the main terrarium staying fully live/rendering the whole time
  About is open (not paused, not torn down) is now a settled decision, not a deferred one — see that
  section's own "Terrarium pause/resume, tried and reverted" for why pausing genuinely doesn't work
  given the box's own padding, and the two real alternative paths if this gets revisited. Its open/close
  shard-flight animation (`spawnFrom`/`despawnTo`) couldn't be observed completing in this session's own
  sandbox (a pre-existing raw-WAAPI hang risk, same category already noted below for flashIn/flashOut
  before those were rebuilt away from it) — worth an actual click-through in a real browser, not just
  the sandbox-verified end states, before trusting the motion itself.
- No responsive/mobile handling for the home page at all (desktop-only, by request) — the
  dictionary view's own `@media (max-width: 700px)` block in `style.css` doesn't apply to it, and
  flashcard mode has none of its own either.

### This session's sandbox limitations — worse than previously documented

Read before trying to verify ANY animation-timing behavior in Claude's own Browser-pane tooling
again — this goes further than the existing note under "The moss box glass-UI system" below:

- **`requestAnimationFrame` can fail to fire AT ALL for this tab, not just run slowly.** Confirmed
  directly: a terrarium camera position frozen byte-identical across 5+ real seconds after
  dispatching the event that should have moved it every frame. This is a step beyond the already-
  documented "CSS transitions don't visually progress" finding — the underlying JS callback itself
  never runs, not just its visible result.
- **`setInterval` is comparably unreliable** — a 300ms poll produced exactly ONE sample across 100+
  real seconds of elapsed time in one test.
- **What DOES reliably work for verification here:** reading real, settled DOM state (computed
  styles, `getBoundingClientRect()`, inline style values) after a generous wait, and — critically —
  hand-simulating a sequence's exact operations synchronously (no `await`, no transition) to test its
  MATH independent of whether this sandbox can actually animate it. Several real bugs in the list
  above were found and confirmed-fixed exactly this way, when live animated verification was flatly
  impossible. A screenshot DOES force real compositing and is trustworthy for a settled/static state
  (confirmed the terrarium close-up framing, the hover-title's real rendered font/glow, the
  per-option captions this way) — just don't trust it, or `getComputedStyle`, to catch something
  genuinely mid-transition; it may show a frozen pre-animation state that looks broken but isn't, or
  the reverse.
- **A CSS `transition` on a property will NOT progress, at all, while the Browser pane tab isn't
  fronted — and `getComputedStyle` will keep reporting the pre-transition value indefinitely, even
  past the transition's own declared duration, even setting the property inline with
  `!important` directly.** Confirmed the hard way on `about-terrarium`'s own scroll-driven reveal
  work: toggling a class that should animate `opacity: 0 → 1` over 0.4s reported `opacity: "0"` on
  every check, including one taken 500ms later — looked exactly like a real CSS bug (wrong
  specificity, a stray override) and burned real time chasing it as one. The actual tell: `visibility`
  (declared WITHOUT a transition on the same rule) toggled correctly and instantly every time, while
  ONLY the transitioning property stayed stuck — isolate this fast by checking whether a
  non-transitioned property on the same element updates correctly; if it does, the transitioning
  property's frozen value is this sandbox limitation, not a real bug. Confirmed the underlying CSS
  rule WAS correct by stripping `transition` to `none` via JS and re-toggling — value changed
  instantly and correctly. Verify a transitioning property's END STATE by testing the rule with its
  transition temporarily removed, not by watching the transition itself.
- **A freshly-created Browser pane tab can get a genuinely broken `0×0` viewport
  (`window.innerWidth`/`innerHeight` both `0`)** — every subsequent percentage-based layout
  measurement on that tab becomes nonsensical (a whole page rendering at ~1/3 its real height,
  absolute positions of every element shifted by thousands of px from a previously-good measurement
  in a different tab). Neither re-fronting (`tabs_select`) nor waiting fixed it once seen. The fix
  was NOT touching that tab further — open an entirely new one (`tabs_create`) and re-navigate;
  confirmed the new tab got a real, sane viewport immediately. Any measurement that looks wildly
  different from a previously-confirmed-good one on the SAME page (not just "off by a few px," but
  fundamentally different total page height) is worth a `{w: window.innerWidth, h: window.innerHeight}`
  sanity check before trusting it as a real regression.
- **This page's own total scroll height/absolute element positions shift substantially as its content
  changes over a long session** — obvious in hindsight, but worth stating plainly: a `scrollTop`
  value measured and confirmed correct early in a session (e.g. "`#case-study` starts at document-y
  3600") can be completely wrong later in the SAME session once more content has been added/resized
  elsewhere on the page. Never reuse an old absolute-position number without re-measuring fresh
  first — this bit twice in one session already (once on the flow-strip's own alignment, once
  chasing the `#alt`/Duality-Terrarium visibility threshold), and is exactly why every scroll-driven
  JS check added to `main.js` on this page computes its own threshold live from real element
  positions at call time, rather than a number written down once.

**`src/terrarium/`** — ported close to as-is from `~/Downloads/moss x kanji FINAL`'s
`public/three-scene/js/` (its "Digital Terrarium" demo; despite living inside that project, the
file headers say "SPOTIFY STORE" — it's a shared scaffold copy-pasted across several side projects,
not actually Shopify-specific code; the `brandSelected`/`brandsViewOpened`/etc. event names are a
leftover from that, not a kanji concept). `utils.js`/`shaders.js`/`terrain.js`/`lighting.js`/
`moss2.js`/`fern.js`/`groundcover.js`/`rocks.js`/`glassbox2.js`/`particles.js` are copied verbatim
(each has a one-line header noting this). **Terrain and particles stay disabled** — not a call made
for this pass, it's the configuration already baked into that source project's own kanji-flavored
copy of this file; `terrain.js`'s `sampleHeight()` is still very much used (moss/fern/groundcover/
rocks/glassbox all place themselves against it), just no visible ground disc/pedestal renders.

`scene.js` is adapted (not verbatim) — mounts into a given container instead of `document.body`,
sizes to that container via `ResizeObserver` instead of `window resize`/`window.innerWidth`, same
reasoning as `src/viewer/scene.js`'s own `ResizeObserver` choice.

`terrarium.js` is new, not ported — the source demo was a permanent full-page scene with no
teardown story at all. `mountTerrarium(container)` → `{ dispose() }`; `dispose()` walks the whole
scene graph disposing every geometry/material/texture generically (including shader-material
uniform textures — `if (material.isShaderMaterial) for (uniform of Object.values(material.uniforms))
uniform.value?.dispose?.()` catches the fern/moss/rock/glass procedural textures without needing a
bespoke path per subsystem file), then the render loop, every listener, the renderer, controls, and
the resize observer. Re-entrant (safe to mount → dispose → mount again), which matters: going home
→ dictionary → home is a normal user path, not an edge case.

**Camera choreography status** (phase 0 entrance, the phase-1 close-up swoop, and everything still
dormant) is covered in full by "Terrarium camera choreography" above — not repeated here.

## UI work vs. functionality — where to touch what

**For a purely visual/UI change** (color, camera angle, glow intensity, spin speed, stroke
thickness, panel layout/CSS): touch `src/viewer/theme.js` and/or `style.css`. Nothing else needs to
change, and nothing else *should* change for a visual-only tweak.

**Functionality** (classification, data loading, raycasting, the pin/hover/drag/auto-spin state
machines) lives in `src/data/`, `src/viewer/kanjiRenderer.js` (the geometry-building algorithm,
not its appearance), and `src/viewer/scene.js` (interaction logic, not its colors/framing) —
`theme.js` has zero effect on any of this, it's plain values with no logic of its own. This split
was deliberate, done specifically so UI work can happen in a separate chat without risk to the
classification/rendering pipeline — see root CLAUDE.md Working Conventions.

## The "moss box" glass-UI system

The floating glass card the related-kanji panel (and any future panel) is built from is ported,
deliberately and literally, from a separate sibling project: **`~/Downloads/moss x kanji FINAL`**
(its own repo, not part of this one). Two different pieces of that project got ported into two
different layers here — don't confuse them:

- **The 3D glass box** (`glassbox2.js` in that project) — the physically-based glass *material*
  technique (paired BackSide/FrontSide `MeshPhysicalMaterial` passes, `GLASS.*` constants in
  `theme.js`) used for the stroke hover/pin states in `scene.js`'s `makeGlassPair`. This is 3D
  render material, unrelated to the 2D UI below.
- **The NORA design system** (`moss-final.css`/`kanji-app.js` in that project) — the actual 2D
  floating-card UI (glass topbar/bottombar strips, marquee, glow typography) ported into this
  project's `style.css` (`:root`'s `--itab-*` custom properties) and generalized into a reusable
  component: `src/ui/mossBox.js`'s `createMossBox()`. **This is what "the box" means everywhere
  else in this doc and in code comments.** Any future floating panel should be built with
  `createMossBox()`, not new bespoke markup — see that file's own header comment for the DOM shape
  and API (`setContent`/`setTitle`/`setKanji`/`setMarquee`/`show`/`hide`/`spawnFrom`/`revealLines`/
  `revealRelatedList`).

**Every box's own bottombar marquee reads "English kanji" now — no separator character at all,
English word first.** Every real box in the app (welcome, select mode, textbooks, genki/minna decks,
lesson mode's searchBox, dictionary mode's own `'search'`, the radio box) went through two explicit,
successive corrections here: first the hyphen was dropped entirely (was `'開始 - welcome'`-style,
kanji-first with a plain hyphen-with-spaces separator — became `'開始 welcome'`, just a space), then
the word order itself was reversed (`'welcome 開始'`) — English leads, kanji trails, on every single
marquee in the app. The one exception, deliberately untouched: `infoBox`'s own marquee (dictionary
mode's structural-parts panel) uses a completely different pairing, `` `${label} · ${gloss}` `` (a
part's own name + its English gloss, middle-dot separated) — that's not this convention at all, never
was, and the "about" page has no bottombar to begin with (`aboutBox`'s own `position: null` setup,
"The home page" above — no `setMarquee()` call for it, ever). The still-fully-dormant
`mountFlashcardSession` review-queue code (`main.js`, "Flashcards — Dictionary itself, scoped to a
lesson" below) had its own marquees updated to match too, purely for consistency — it's unreferenced
from any live UI path, so this had zero visual effect, but there was no reason to leave it
inconsistent with a convention this explicit and this widely applied everywhere else.

**`.mode-option:hover` — the box's own hover "turns on" to the tabs' own REGULAR glass, not a
pulse, and not their old hover-escalated tier either.** A first pass had hovering a `.mode-option`
pulse the WHOLE button (opacity, box background included) via `nora-kanji-pulse` — replaced with a
plain CSS `:hover` rule (no JS — this is a static material swap, nothing here needs the phase-sync
math a hover-beep would) using `--itab-bg`/`-blur`/`-brightness`/`-saturate`, the tier
`.nora-moss-topbar`/`.nora-moss-bottombar` always sit at. That first version actually used the
STRONGER `--itab-hover-*` tier instead (matching what `.nora-moss-box:hover .nora-moss-topbar` used
to switch the topbar to on hover) — corrected by a further explicit request, alongside removing that
topbar rule entirely: hovering the box/topbar itself shouldn't change the topbar's own glass at all
any more (only `.nora-moss-topbar-back`, the back arrow specifically, still has its own hover
response, via its own separate `.is-pulsing` beep, unrelated to this), so "the hovered tab state"
isn't a real state to match any more either — a resting `.mode-option` has no glass at all (flat
`--itab-bg`, no `backdrop-filter`), so hovering it is what activates real glass, and that's just the
tabs' ordinary, always-on look now. `--itab-hover-*` itself is left declared in `style.css`,
unremoved, even though nothing currently uses it — its one real caller, `.auth-input:focus`, was
removed along with the rest of the now-gone login/signup forms (see "One box, every stage" above).
The word's own beep
didn't go away through any of this: the SAME `nora-kanji-pulse`/`syncPulseDelay` machinery still
runs exactly as before (JS toggles `.is-pulsing` on the button on mouseover/mouseout, unchanged) —
only the animation's own CSS target moved, from `.mode-option.is-pulsing` to
`.mode-option.is-pulsing .mode-option-label`, so it pulses just the text now instead of fighting the
button's own `:hover` background/backdrop-filter transition. Deliberately NOT a return to the "box
lights up" generic-hover-brighten this box family moved away from before (see
`.related-kanji.is-pulsing`'s own comment on that history) — that was a bespoke look invented for
the occasion; this reuses this app's own existing glass material verbatim.

**Real bugs hit while building this, worth knowing before touching the CSS again:**

- **Glass tint must be the shared white family, not a bespoke dark one.** Every glass surface here
  (`--itab-bg`, tiles, scrollbar thumb) tints with **white** (`rgba(255,255,255,0.03)`) over the
  dark 3D scene — that's what makes it read as "frosted," since white-over-dark *lightens*. Reaching
  for a dark tint instead (`rgba(10,11,13,...)`) just adds more black on top of already-dark
  content, no matter how the opacity is tuned — it reads as a flat solid panel, not glass. Took
  several passes to nail down; if a new glass surface looks "off" compared to its neighbors, this is
  the first thing to check.
- **A blurred sub-region needs the SAME recipe as its siblings, not just *a* blur.** Giving one part
  of a shared surface (e.g. a sticky sub-header) its own `backdrop-filter` while its sibling content
  has none creates an obvious seam — one area shows the 3D scene sharp, the other blurred. If two
  elements are meant to read as one continuous pane, they need bit-for-bit identical
  background/`backdrop-filter` values, not "similar."
- **A z-index-lower text layer sitting behind its own `backdrop-filter` layer gets blurred by it.**
  `.nora-moss-title` originally shared `--itab-blur`/`--itab-brightness` with `.nora-moss-topbar`
  (its own glass strip) at a value tuned for the *3D scene* behind the strip, not for text sitting
  in front of/behind it in z-order — bumping that blur (to try to match another bar) visibly blurred
  the title text itself. `.info-character`/`.info-subtitle`/`.related-kanji` deliberately use their
  own separate `--content-glow-blur`/`--content-glow-stroke` (lighter, tuned for legibility on dense
  kanji) rather than reusing `--itab-title-blur` — check what's actually *behind* an element in
  paint order before assuming a blur value is safe to bump.
- **A WAAPI `element.animate(..., {fill:'forwards'})` must be `.cancel()`ed once its final state is
  committed to inline style**, or it stays registered in the browser's active-animation stack
  indefinitely, competing with any *later* animation on the same property (e.g. a hover-triggered
  CSS `animation`) — symptom was a hover pulse visibly starting for one frame then cutting out. See
  `tileEnter`'s comment in `mossBox.js`.
- **Two elements can't just "share keyframes" to look synced.** A CSS `animation: infinite` restarts
  its local clock at whatever real moment it's actually applied — two elements starting "the same"
  animation at different times drift out of phase from each other, even with identical
  duration/easing. `syncPulseDelay()`/`pulseDelayValue()` in `mossBox.js` compute
  `animation-delay = -(performance.now() % duration)` fresh at the exact moment each instance
  starts — the algebra makes every caller resolve to the same `performance.now() mod duration`
  regardless of when it started, which is what actually keeps the topbar's corner glyph and a
  tile's hover-pulse in lockstep. See that function's comment for the derivation.
- **`inline style` set once during setup permanently outranks a CSS class**, including one added
  later (like `.is-hidden`). `spawnFrom`'s inline `opacity`/`transform`/`max-height` overrides are
  unconditionally cleared in a `finally` block for exactly this reason — a stray leftover inline
  `opacity: 1` would otherwise defeat `.is-hidden`'s `opacity: 0` forever after.
- **A "settles into place" scroll feel is not the same problem as a "heavy/weighted" scroll feel —
  don't reach for CSS `scroll-snap` for the latter.** The box's content scroll was first built with
  `scroll-snap-type`/`scroll-snap-align` (row-snapping), which measured as landing exactly on each
  row's `offsetTop` and looked correct in isolation — but felt "glitchy" in real trackpad/wheel use
  and was dropped for that reason alone (a real-use judgment, not something inspection would catch).
  Replaced with `attachHeavyScroll()` in `mossBox.js`: a `wheel`-driven target position that
  `el.scrollTop` eases toward a fraction (`SCROLL_EASE = 0.14`) each animation frame, `preventDefault`-ing
  the native wheel scroll entirely so the two don't fight. A fractional, decelerating `scrollTop`
  sequence across frames is the signature this is actually running (native/snap scrolling lands on
  whole-pixel or exact-row values instead).
- **Verifying CSS animation timing through this session's automated Browser-pane tooling is not
  reliable** — a requested "1 second" wait measured as ~2.6 real seconds via `performance.now()`
  inside that tab (tool round-trip latency), and animation state in a non-actively-composited tab
  can drift independently of that. Trust the code/math, verify structurally (DOM state, no stray
  animations via `element.getAnimations()`, no console errors), and let the user's own actively-
  focused browser be the actual judge of animation feel/sync — consistent with this project's
  existing convention for anything animation-related (see `scene.js`'s auto-spin section below). This
  turned out to go further than described here — see "This session's sandbox limitations" at the end
  of "The home page" section above for what a later session found (`requestAnimationFrame` and
  `setInterval` both confirmed able to not fire at all, not just run slowly).

## The search box (#search-panel)

A second `createMossBox()` instance (`position: 'right'`), replacing the old top `#controls` bar
entirely — character entry now lives inside a box with the exact same glass/topbar/bottombar chrome
as `#info-panel`. Unlike `#info-panel`, none of its chrome tracks app state: title (`'search'`),
corner glyph (`'検索'`), and bottombar marquee (`'search 検索'`) are all set once at creation and
never change — this box's chrome labels *itself*, not "what's currently loaded." Its own CSS sets
`right: 320px` instead of the shared `.nora-moss-box--float-right` class's `right: 40px`, since the
latter is measured from the viewport edge and would land under the docked `#sidebar` (280px) rather
than beside the kanji.

**The field is four stacked elements inside `.search-field`, not one plain `<input>`** — each real
bugs hit while building it forced a layer out of the native control and into a plain element:

- `#kanji-search-input` — a real `<input>`, but its own text is fully invisible
  (`color`/`-webkit-text-fill-color: transparent`) and its native caret is hidden
  (`caret-color: transparent`). It exists ONLY to own real typing/focus/caret-hit-testing/IME
  composition — nothing about it is ever seen directly.
- `#kanji-search-display` — the actually-visible glyph, a plain `<div class="info-character">`
  (the class reused **verbatim** from the left box's own headline glyph, for a genuine 1:1 style
  match rather than a re-derived copy). Rebuilt from scratch on every change by
  `renderSearchDisplay` (not a plain `textContent` mirror) — see the identify-vs-select system
  below for what it actually renders.
- `#kanji-search-caret` — a fully custom blinking cursor bar, not the native caret. White, 4×36px,
  built from the same jade-glow + itab-glass vocabulary as the rest of the box, with a hard on/off
  `steps(1, end)` blink (old-school terminal-style, not a smooth OS fade). Positioned by
  `measureCursorOffset` (`main.js`), tracked on `input`/`compositionend`/`click`/`keyup`/`scroll`,
  shown only while focused. This used to measure a hidden same-font probe span instead — a real
  bug once kanji tokens and plain text stopped being one uniform font: the probe stayed hardcoded
  to `.info-character`'s 45px long after tokens became 36px glass tiles (`.related-kanji`) and
  plain text dropped to 26px (`.search-plain-text`), so the estimate drifted further from the real
  cursor position with every character typed — exactly the "gap keeps growing" symptom reported.
  The fix measures the ACTUAL rendered DOM instead of estimating from any single font: it walks
  `searchDisplay`'s real children up to the cursor's character index, using a `Range` for a partial
  position inside a multi-character plain-text span and a plain `getBoundingClientRect()` at a
  token/span boundary. Verified with the gap between the caret and the actual last rendered
  character measured as exactly `0` across single-kanji, multi-kanji, and mixed kanji+English
  strings of varying lengths — not just at the end of the string either: a cursor placed mid-way
  through a multi-character English run, and one placed exactly on a token boundary, both landed
  at the exact same pixel a manual `Range` measurement of that same position independently gave.
- `#kanji-search-placeholder` — a plain `<div class="related-title">` (again reused verbatim, not
  `::placeholder`), toggled via `.is-hidden` based on whether the field is empty.

All four are kept in sync by one function, `syncSearchField()` in `main.js` — display text, its
horizontal scroll transform, the caret's horizontal offset, and the placeholder's visibility all
update together on every real change (deliberately unconditional on `'input'` even mid-composition,
unlike the kanji-detection logic below it, so visual state never lags behind what's actually typed).

**Two real, non-obvious bugs are why this is built this way, not as a plain styled `<input>`:**

- **`filter`/`-webkit-text-stroke` on a native form control's own text causes a persistent grey
  compositing box, at least on some Chrome/GPU combinations.** First found on `::placeholder`
  (combining those properties on that pseudo-element promotes it to its own compositing layer whose
  backing paints non-transparent) and fixed by replacing it with a real element — but the same grey
  box then turned out to also affect the real *typed* text, confirmed by the user to persist on
  committed (not just mid-composition) content, in Chrome specifically. Not reproducible in this
  session's own sandboxed browser pane at all (screenshots there always rendered clean, before or
  after either fix) — a real environment/GPU-dependent rendering bug, not something inspectable
  from first principles. The robust fix used for both cases: never apply `filter`/text-stroke to a
  native form control's own rendered text at all; render the actual visible glyph through a plain
  `<div>` instead (`#kanji-search-display`), and make the real `<input>` fully invisible.
- **A native `<input>`'s own used height doesn't purely follow its declared `font`/`line-height`
  the way a normal block element's would — it can vary by several px depending on which font
  actually renders the characters present.** Kanji stays in Shippori Mincho; Latin/kana in a mixed
  string falls back to generic `serif`, with different ascent/descent metrics at the same
  font-size. Measured directly: a value of `"海"` alone produced a 73px used height, not the 53px
  the CSS numbers (4px padding + 45px font + 4px padding) alone implied — and this varied by
  content, which is exactly what broke the caret's vertical alignment (tuned against one string,
  wrong for another — "the caret is centered for the placeholder but not for what I actually
  type"). Fixed by giving `.search-field`/`#kanji-search-input` an **explicit fixed height (53px)**
  instead of an intrinsic one, removing the variable entirely — every downstream measurement
  (`#kanji-search-display`'s flex-centering, the caret's `top`) is now against a number that never
  changes regardless of what's typed. Verified by measuring field height and caret/glyph center
  across pure-kanji, mixed Latin+kanji, and empty states — all landed on the identical 53px/155.5px
  before this was called done.
- `#kanji-search-display` also needed `display: flex; align-items: center;` — without it, text just
  top-aligns (default block flow), and this font's line-box metrics don't fill their nominal box
  evenly, so top-alignment alone left visibly more dead space below the glyph than above it.

**Status, honestly:** the grey-box fix (making the real input's text invisible) has not been
explicitly re-confirmed by the user in their own browser since it shipped — treat it as believed-
fixed, not verified-fixed, if it comes up again.

**Identify vs. select — a kanji appearing in the field is not the same as it being loaded.** This
replaced an earlier design where the first kanji anywhere in the string auto-loaded live as you
typed. The actual ask this became: typing on a Japanese IME shows plain English while composing
romaji, then plain hiragana candidates, then — once a real kanji commits (even a multi-kanji word
like 協力) — each one should get boxed, with NOTHING auto-selected; the user picks which one they
mean by clicking its box. Same for pasting a whole word (飛行機) directly. `renderSearchDisplay` (in
`main.js`) is the actual identification pass, rebuilding `#kanji-search-display`'s DOM on every
change via `splitKanjiTokens`: consecutive non-kanji characters merge into one plain text run,
while each of the first `KANJI_TOKEN_LIMIT` (4 — a yojijukugo, e.g. 一石二鳥, is the natural "full
box" case; the field only has room to show a handful before boxes would be scrolling off-screen
with the text — the placeholder spells this out too, "type or paste up to 4 kanji", so hitting the
cap reads as an intentional limit rather than the app silently dropping a 5th kanji) **distinct**
kanji characters gets its own token — `class="related-kanji kanji-token"`, reusing the LEFT box's
own glass-tile class **verbatim** (the exact 36×36 glass square, jade content-glow, and hover-pulse
`.related-kanji` tiles already have — see main.js's mouseover/mouseout delegation on
`searchDisplay`, same `syncPulseDelay` treatment as `infoBox.content`'s tiles), not a re-derived
approximation of it. `kanji-token` only adds what that tile system never needed on its own:
`pointer-events: auto` (only these spans need to capture a click — see below) and `.is-selected`
(that tile system has no "currently active" concept, since clicking a tile there navigates away
entirely). Deliberately counts unique characters, not occurrences: a repeat of an already-boxed
character (木木, or a 5th character that happens to repeat one of the first 4) still gets its own
box every time, since it isn't spending a new slot — verified directly (一石二鳥一 boxes all five
instances, 一石二鳥木 boxes only the first four and leaves 木 as plain text). Selection itself is a
separate, explicit act: a delegated `'click'` listener on `#kanji-search-display` calls `loadChar`
only when the click actually lands on a `.kanji-token` (the rest of the div is `pointer-events: none`
so a click anywhere else still falls through to the real `<input>` underneath, same as before) —
clicking a different box switches (rather than toggles on/off) which one is selected, exactly like
the related-kanji tiles in the left box already work. Whichever token's character matches
`currentChar` gets `.is-selected` — a brighter glass fill and a stronger version of the SAME jade
glow the tile already has (not a mismatched accent color), same "brighter/cooler confirmed"
relationship the 3D pin has over its own hover; `loadChar`
itself calls `syncSearchField()` once `currentChar` actually updates, which is what keeps that
highlight correct regardless of whether the load came from clicking a box directly or from a
related-kanji tile click (which sets the field's value and calls `loadChar` itself, same as a
direct box click would, since replacing the field via an explicit tile click is itself an explicit
selection — it doesn't need a second click on the resulting single box). The IME-composition
handling itself is unchanged from before: `'input'` fires (including mid-composition, which is
fine now — boxing a live composition preview the instant a kanji appears in it is the actual point,
not something to guard against the way the old auto-load logic had to); `'compositionend'` fires
once a candidate actually commits. `currentChar` had to move to the top of `main.js` (declared
before `searchBox` is even built) specifically because `renderSearchDisplay` reads it on the very
first, synchronous `syncSearchField()` call — declaring it later, where it used to live, would be a
real TDZ `ReferenceError`, not just messier code.

Every non-kanji run also gets wrapped in its own `<span>` (not a bare text node) for the same
reason kanji tokens are their own elements — so it can carry its own font, independent of the 45px
Shippori Mincho it'd otherwise inherit from `.info-character`. `splitKanjiTokens` actually splits
these into TWO different kinds, not one: `'plain'` (kana, and any kanji past `KANJI_TOKEN_LIMIT` —
still Japanese-script content, so it stays in the glyph font, just smaller — `.search-plain-text`)
and `'latin'` (genuinely Latin/English text — romaji while composing, or plain English typed or
pasted in — `.search-latin-text`, reusing `.related-title` **verbatim**: the same Arial +
`scaleY(0.58)` squish + jade glow every other piece of English in this app already uses, not a
smaller version of the glyph font). `KANA_RE` (hiragana + katakana) is what actually draws that
line — anything that's neither a kanji character nor kana falls into `'latin'`. Both still needed
their own smaller sizing/margin to fit `#kanji-search-display`'s fixed 45px content height
(`overflow: hidden`) — `.info-character`'s inherited 45px is sized for a single centerpiece glyph
with no descenders (CJK ideographs don't have them), and at that size English lowercase descenders
(g/y/p) and some kana glyphs were tall enough to actually get clipped — confirmed by measurement,
not just a screenshot: at 45px the text's own rendered bounding box overflowed the container by
10px on both top and bottom. `.search-plain-text`'s `font-size: 26px` leaves real headroom; chosen
empirically (screenshotted/measured directly), not computed from font metrics — this font's actual
ascent/descent isn't published anywhere reliable enough to
trust blindly, same lesson as the caret/field-height saga above. `.search-latin-text` needed no
separate size override at all — its `scaleY(0.58)` squish (inherited from `.related-title`) reduces
the visual line height on its own, leaving even more headroom than `.search-plain-text`'s explicit
26px; confirmed by the same measurement technique (a real descender character's rendered bounding
box against the container's, not a screenshot glance). Its only own override is `margin: 0` —
`.related-title`'s block-flow margin doesn't belong on an inline run sitting in the middle of a flex
row alongside kanji tiles and kana, the same reason `#kanji-search-placeholder` needed the same
override when it first reused that class.

**`#search-selected`** — below `.search-field` but still inside the same box, not a separate panel:
shows whatever's actually loaded right now as a full headline glyph + its own whole-character
gloss, reusing `.info-character`/`.info-subtitle` **verbatim** (the left box's own pinned-glyph
styling, 1:1 — not a re-derived copy), just for the WHOLE selected character's gloss rather than
one part's. Collapsed (`max-height: 0`) until the very first `loadChar` succeeds, then
bump-expands open with the same overshoot easing/duration mossBox.js's `spawnFrom` uses for the
left box's own "drop down" reveal — a deliberately similar *feel*, not shared code, since
`spawnFrom`/`revealLines` clear and rebuild the whole box's content on every call, which would wipe
out `.search-field` (the input itself) sitting right above this. `updateSearchSelected` (`main.js`)
is called from every successful `loadChar`, including the very first default load — there's no
special-cased "first time" skip, so the app always opens with the same little reveal rather than
only playing it for later clicks. The reveal replays on every single selection, not just the
first: `.is-revealed` is removed, a reflow is forced (`void searchSelected.offsetHeight`), then
re-added — removing and immediately re-adding the same class in one tick is a no-op to the style
engine without that forced reflow in between, and nothing would visibly restart on the 2nd+ click.
Verified end-to-end: typing 4 kanji leaves the section showing whatever was PREVIOUSLY
selected (correctly not auto-updating just because new boxes appeared), and clicking between
different tokens repeatedly re-triggers the full drop-down+pop-up each time with no stuck state.

One more line lives below the gloss: `#search-selected-stats` — stroke count + JLPT level only
(e.g. "9 strokes - JLPT N3", a plain hyphen between the two, not a middle dot), formatted as
"N{level}" to match the familiar modern JLPT label even though the underlying number is
KANJIDIC2's own OLD 4-level field (see `data-pipeline/CLAUDE.md`). `bundle.on`/`bundle.kun`/
`bundle.grade` are still extracted and present in every bundle — this is a display choice, not a
pipeline rollback; a readings line (and grade) were built and shown at one point, then deliberately
narrowed back down to just these two fields by request, and re-adding either later is just a
formatting change, not new extraction work.

`#search-selected-stats` carries `class="related-title"` directly (the exact class the placeholder
uses — same font/blur/text-stroke/jade glow/`scaleY(0.58)` squish, a real 1:1 match) rather than a
bespoke look. An earlier version used a custom plain-dim-Arial-no-glow style instead ("secondary
metadata, not content") — which was exactly the mismatch this was asked to fix. Its reveal is the
SAME typewriter effect the gloss line uses (`createTypewriter()` in `main.js` — a factory now,
not a single function, specifically so the gloss and the stats line each get their own independent
generation counter; sharing one would make starting one line's typing cancel the other's, since
they're meant to run concurrently, not exclusively) — confirmed by literally catching it mid-type
in a screenshot (`"4 strok"` mid-flight while the gloss above it had already finished typing "Tree"
— genuinely concurrent, not one waiting on the other). No separate opacity/transform reveal is
layered on top of the class at all anymore (an earlier version had one) — the typing itself is the
entire reveal, exactly like the gloss. Hides entirely (not left as dead empty space) when there's
nothing to show at all — some obscure/irregular characters have no KANJIDIC2 entry.

Two real gaps found after that first pass, both fixed:

- **A long KANJIDIC2 gloss (some run to a whole short phrase, not just one word) ran past the
  box's right edge instead of wrapping** — `#search-selected-gloss` was inheriting
  `white-space: nowrap` from `.info-subtitle`'s shared base rule (correct for a single word sitting
  next to a glyph in the LEFT box, wrong here). Overridden back to `white-space: normal` +
  `word-break: break-word` (a safety net for one unbroken "word" still too wide on its own) —
  confirmed by measurement with a deliberately long fake gloss (rendered bounding box's right edge
  landed exactly at the container's, zero overflow, height grew to fit the wrapped lines) rather
  than just eyeballing a screenshot. `#search-selected.is-visible`'s own `max-height` also had to
  grow (130px → 280px) to leave room for those extra wrapped lines — not computed from real content
  height, just set comfortably larger than any realistic wrapped gloss needs, the same "generous
  headroom, not a tight fit" approach as `.search-field`'s own fixed height elsewhere in this box.
- **Clearing the field back to empty (the placeholder showing again) left `#search-selected`
  still showing whatever was selected before, now stale** — a character that isn't even in the
  field anymore has nothing to be "selected." First fix only collapsed `#search-selected` itself
  (`classList.remove('is-visible', 'is-revealed')`); the real ask turned out to be broader —
  **empty search = empty state everywhere**, not just this one box's own section resetting while
  the 3D viewer, the structure panel, and the left info box all kept showing the previous
  character. `syncSearchField`'s empty branch now also clears `currentChar` to `null`, calls
  `clearKanjiGroup()` (`scene.js` — a new thin wrapper: `setKanjiGroup(new THREE.Group())`, reusing
  `setKanjiGroup`'s own hover/pin/rotation/pinch-scale reset instead of duplicating it, just handing
  it nothing to actually display), clears `#structure-panel`, and calls `renderPinInfo(null)` (the
  exact same call `loadChar` already uses to hide the left info box on every load). Guarded by
  `currentChar !== null` so this only actually fires once, on the transition INTO empty, not on
  every subsequent sync while it stays empty. Deliberately does NOT come back just because the
  field has text in it again (typing the same character back in, with no click, leaves everything
  cleared) — same identify-vs-select split as everything else in this box; only an actual click on
  a token re-triggers everything, verified end-to-end (pinned a stroke to bring up the left info
  box, cleared the field, confirmed all three — structure panel, left info box, 3D viewer — empty
  simultaneously, then typed+clicked a fresh character and confirmed everything re-populated
  together from that one click).

**The reveal itself was rebuilt a second time** — the original version faded+slid the glyph and
gloss in together (`opacity`/`translateY`), which read as a completely generic modern web-app
micro-interaction, not this project's own "y2k lo-fi" vocabulary. Replaced with two different,
more deliberate motions: the glyph glowing up, and — while the gloss instead types in for real,
letter by letter (`typeGloss` in `main.js`, a plain `setTimeout` loop building up `textContent`
one character at a time, generation-counted so a newer selection cleanly cancels an in-flight
typewriter rather than two racing to fill the same element). Both start together, alongside the
box's own max-height bump-expand, not in sequence.

**The glyph's OWN motion was reworked a THIRD time, most recently** — cut down to a plain opacity
fade, no `transform`/`filter` involved at all any more. The 2nd-generation version above described a
"glows up and in" zoom: `#search-selected-character` started as a soft, oversized, out-of-focus blob
(`opacity:0; transform:scale(0.4); filter:blur(16px)`) and resolved down to crisp full size on
`.is-revealed`, "a light igniting into focus." Cut by explicit request, reported as reading like a
generic "guffy AI" swoop-in-blur — the same complaint category, same fix shape, the 3D viewer's own
`LOAD_SWOOP` got around the same time (`scene.js`'s own history on that). `.info-character`'s base
rule already sets `filter: blur(var(--content-glow-blur))` unconditionally (every glyph in this app
inherits it, always in focus) — the old version's `filter`/`transform` overrides existed ONLY to
animate away from that resting look and back, which is exactly what got removed; nothing needed to
replace them, the glyph is simply always correctly in focus now, just invisible until opacity ramps
up. Reversible for free — removing `.is-revealed` on backspace plays the identical transition
backward, no separate closing rule needed, "one glow up, one glow back down" per the actual ask.

**A separate real bug, found right after that fix shipped, in `#search-selected`'s own container —
not the glyph.** Reported directly: even with the glyph itself just fading, backspacing still
"dropped down and glitched out" before disappearing. Root cause: `#search-selected`'s own
`max-height` bump-open (280px, the SAME overshoot curve `mossBox.js`'s `spawnFrom` uses) was, until
this fix, ALSO the curve used to collapse it back to 0 on close — a single `transition` declared on
the shared base rule, applying regardless of direction. An overshoot/"back" easing curve's progress
genuinely exceeds 1 partway through, which for a GROWING value is the intended bump-past-then-settle
pop; for a SHRINKING value (280px → 0) the same overshoot computes a genuinely NEGATIVE height
partway through, which the browser clamps to 0 EARLY — an abrupt snap well before the transition's
own nominal duration was up, not a smooth shrink, which is exactly what read as "drops down and
glitches." Fixed the same way `regenerateBox`'s own Phase 1 already documents for the identical class
of problem elsewhere in this app (`mossBox.js` — "a bounce on a CLOSING box read as a wobble, not a
pop"): the overshoot bump now lives ONLY on `#search-selected.is-visible`'s own `transition`
(governs OPENING, when that class is added); the base/closed rule got its own separate, plain
`cubic-bezier(.4,0,.2,1)` transition instead — the exact same "closing" curve family this app's OWN
convention already uses everywhere else (`mossBox.js`'s `easeTransition`), reused rather than
invented. A pure CSS split, no JS changed — which curve governs a given transition is just whichever
rule matches the element's style at either end of the change.

**A THIRD real bug, found right after — the easing fix above wasn't the actual root cause of "drops
down and glitches," just a real, separate issue that happened to look similar.** Reported directly,
after the easing fix: the glyph still visibly dropped down before disappearing. Root cause was
layout, not timing: `#search-examples` (the "or try one of these" tile grid) toggles visible via a
plain `display:none` → `display:block` (`style.css`'s `.is-hidden`), with NO transition at all — it
snaps back INSTANTLY, in the exact same synchronous `syncSearchField` call that starts
`#search-selected`'s own ~300-400ms fade-out. `#search-examples` used to sit ABOVE `#search-selected`
in the DOM — so that instant reappearance shoved `#search-selected`, mid-fade, down the page by the
FULL height of the tile grid, in a single frame, before its own collapse had even started. That
sudden jump — not the fade, not the collapse curve — is what actually read as "drops down and
glitches." Fixed by reordering the markup (`main.js`) so `#search-selected` sits BEFORE
`#search-examples` — confirmed structurally (not by watching the animation, this session's sandbox
can't) by measuring `#search-selected`'s own `getBoundingClientRect().top` immediately before and
after triggering the clear: unchanged, where it used to jump. A later sibling appearing can never
move an earlier one, which is the whole fix — nothing about the fade/collapse timing needed to
change.

That rebuild fixed a real, embarrassing bug in the process: the ORIGINAL fade+slide reveal set
`transform: translateY(8px)` (→ `translateY(0)` on reveal) on both the glyph AND the gloss via an
ID selector — `transform` is a single property, so this completely overwrote
`.info-subtitle`/`.related-title`'s own `transform: scaleY(0.58)` (the shared "squish" every tab-
style label in this app has) rather than combining with it, silently un-styling the gloss's most
distinctive visual trait despite its blur/glow still being technically present. Compounding it: an
old copy of that same end-state rule (`#search-selected.is-revealed #search-selected-character,
#search-selected.is-revealed #search-selected-gloss { opacity:1; transform:translateY(0); }`) was
left behind after an earlier edit and, being later in source order at equal specificity to the
NEW per-element rules, silently won the cascade tie and kept clobbering both — a real lesson: when
replacing a shared multi-element rule with per-element ones, grep for every remaining reference to
the old selector, don't assume deleting the "main" copy caught all of them. Confirmed fixed by
checking the actual matched rule (not just the source) — `element.matches(selector)` plus
`sheet.cssRules` to enumerate every rule genuinely touching `opacity`/`transform`/`filter` on the
element, not just re-reading the stylesheet source and assuming it applies.

**Another real trap hit while verifying this**: `getComputedStyle` reads for `opacity`/`transform`
kept reporting the pre-reveal resting values long after the transition should have settled, even
seconds later — looked exactly like the fix hadn't worked. It had; a screenshot (which forces real
compositing in this environment) showed the reveal fully complete and correctly styled at the exact
same moment a fresh `getComputedStyle` call still reported the stale start values. Same root cause
already documented for the caret's blink earlier in this file — CSS transitions/animations don't
keep progressing without active compositing in this session's own automated Browser-pane tooling,
and computed-style queries reflect that frozen state, not the real one. Trust a screenshot (or the
user's own actively-focused browser) over a computed-style read for anything transition/animation-
related in this pane — this is the second time it's caused a false alarm, not the first.

**`#search-examples` — a handful of one-click starting points for anyone without a way to type
kanji.** Sits directly below `.search-field`, shown ONLY while the field is genuinely empty —
`syncSearchField` toggles its `.is-hidden` the exact same moment (same condition) it already
toggles `#kanji-search-placeholder`'s, so it's gone the instant anything's typed and reappears the
instant the field empties out again. Reuses `.related-title`/`.related-list`/`.related-kanji`
VERBATIM (the left box's own click-through-list recipe — tile size, jade glow, hover-pulse, and now
the reactive 3D bleed-through too), not a bespoke component; clicking one runs the exact same
`searchInput.value = char; syncSearchField(); loadChar(char)` sequence the left box's own
related-kanji click already uses.

**Selection criteria — went through two real corrections, worth knowing before picking more:**
started chosen purely for STRUCTURAL variety (each rendering through a different split shape —
original picks: 超, 道, 店). Then shifted toward SEMANTIC storytelling — picks where the two parts'
own glosses genuinely explain the whole character's meaning. Then corrected again: a genuine
storyteller-suggested batch of common, textbook, `role: meaning`-on-both-halves picks (明 sun+moon,
好 woman+child, 鳴 mouth+bird, 岩 mountain+stone, 安 roof+woman, 家 roof+pig, 男 field+power, 看
hand+eye) was explicitly rejected as "boring" — the ACTUAL governing criterion turned out to be
atmospheric/evocative MEANING (dark, mythic, elemental single-word glosses), not textbook-common
vocabulary — with a clean two-part story as a bonus where the data supports one, never a hard
requirement (艦 "warship" was explicitly approved despite its own 2nd half, 監, being pure
phonetic — a cool word alone was enough).

**CURRENTLY OVERSIZED ON PURPOSE, mid-pruning — 30 total (elimination has already started; see
further down for the last 4 added and 餮's own removal), explicitly a "throw in a big batch, then
eliminate down" pass** ("add all of these then we'll take some away, process of elimination"), not
a finished set. The one non-negotiable bar applied to every pick below, independent of which ones
survive elimination: verified to actually exist in the dataset and split cleanly (category 2, real
`groups` with real glosses) before being added — nothing added on a guess. First ten (established
before this batch, fuller reasoning per pick above): 闇, 魂, 翼, 靄, 魘, 榊, 艦, 魄, 嵐, 雫.

The 17 added in the big batch, each verified `structure.parts`/`groups`: 瞳 (pupil) = 目 "eye" +
童 "juvenile"; 鱗 (fish scales) = 魚 "fish" + 粦 (phonetic); 鯨 (whale) = 魚 "fish" + 京 "capital"
(marked `sound`); 鰐 (alligator) = 魚 "fish" + 咢 "outspokenly"; 鯱 (orca/mythical dolphin-fish) =
魚 "fish" + 虎 "tiger"; 蜻 (dragonfly) = 虫 "insect" + 青 "blue"; 鵺 (mythical night bird, from the
Heike Monogatari) = 夜 "night" + 鳥 "bird"; 蠍 (scorpion) = 虫 "insect" + 歇 "exhausted"; 魑
(mountain spirit/goblin, as in 魑魅魍魎) = 鬼 "ghost" (`nyo`-wrap) + 离 "rare beast"; 蜃 (mythical
mirage-clam, 蜃気楼) = 辰 "dragon" + 虫 "insect," BOTH marked meaning; 饕 (be greedy, one half of the
two-character word 饕餮/taotie) = 號 "mark" + 食 "eat" — 餮 (voracious, the OTHER half of 饕餮) was
also added in the same batch and has since been removed by request; 饕 stays on its own, no longer
paired; 朧 (haziness, as in a
hazy moon) = 月 "month/moon" + 龍 "dragon"; 儚 (fleeting/ephemeral) = 亻 "person" (KANJIDIC2's own
gloss for 亻 here is the less-clean "radical number 9" — a pre-existing data-coverage gap, not
specific to this pick) + 夢 "dream"; 霓 (rainbow, specifically the secondary/outer bow) = 雨 "rain"
+ 兒 "child"; 暈 (halo, as around the moon/sun) = 日 "day/sun" + 軍 "army"; 縁 (affinity/fated
connection) = 糸 "thread" + 彖 (phonetic).

A further 4 added right after, same verification bar: 滝 (waterfall) = 氵 "water" + 竜 "dragon"
(phonetic); 霰 (hail) = 雨 "rain" + 散 "scatter"; 灘 (open sea/rough waters — also a real sake-brewing
region name in Japan) = 氵 "water" + 難 "difficult"; 焚 (burn) = 林 "grove" + 火 "fire," a clean
forest-catches-fire story. `#search-examples`'s own heading text also became "or try
one of these" (was "try one of these") — reads as a continuation of `#kanji-search-placeholder`'s
own "type or paste up to 4 kanji" line right above it.

Earlier-surfaced candidates, still NOT added (offered, not applied): 塵 (dust) = 鹿+土
(deer+soil, BOTH meaning — ancient deer-kicking-up-dust imagery); 翔 (soar) = 羊+羽; 呪
(curse/spell) = 口+兄; 蒼 (deep blue) = 艹+倉; 翠 (emerald green) = 羽+卒. (`position`/`role`
values come straight from KanjiVG/KANJIDIC2, already present in every category-2 bundle's
`structure.parts`/`groups` — see data-pipeline/CLAUDE.md. `role: "meaning"` vs `null` vs `"sound"`
is what separates a real semantic story from a phonetic half, but is NOT a requirement for a pick
here — see 艦's own precedent, a cool word alone was enough.)

**Second elimination pass — 6 more cut, 24 remain, order changed too.** 魄 (soul/spirit — the
"physical/earthbound" half of the 魂/魄 pair, one of the original ten), 鰐 (alligator), 蜃 (mythical
mirage-clam), 饕 (be greedy, from 饕餮), 儚 (fleeting/ephemeral), and 霓 (secondary rainbow) removed by
explicit request — same ongoing "add a big batch, then eliminate down" process the first pass (餮's own
removal, just above) already established, not a reversal of the selection criteria itself. **The
remaining 24 are now ordered common → obscure, not by when each was added** — a real ordering
convention, not an arbitrary shuffle, so a beginner scanning `#search-examples` hits the recognizable
words first — current order (both later corrections below already folded in, not the original list
this paragraph first shipped with): 闇, 魂, 翼, 縁, 滝, 嵐, 鯨, 艦, 瞳, 雫, 鱗, 焚, 暈, 霰, 蠍, 朧, 灘, 靄,
鯱, 蜻, 榊, 鵺, 魑, 靉. Ranked by eye (general real-world word/character familiarity — everyday
vocabulary and common compounds first, single-use-compound and mythological/folklore-only characters
last), not measured against any real frequency corpus — retune the order the same way if a placement
feels wrong, same "by eye, not by guessed numbers" convention this whole picks list already runs on.
嵐 was originally first in this list, moved to right after 滝 per explicit request; 魘 was originally
last, replaced by 靉 (own paragraph just below has that full history).

**魘 (nightmare) swapped for 靉 (clouds) — a rendering-density finding, not a selection-criteria
problem.** 魘's own 24 strokes turned out to be the worst real-world case this app found of the
dense-parallel-strokes "reads as filled in" issue (`src/viewer/kanjiRenderer.js`'s own section
above has the full mechanism — several of 鬼's strokes sit closer together than their own ribbon
width) — explicit call: "such an insane edge case of squished lines" that it wasn't worth keeping
as a showcase pick regardless of the word itself being good. **淵 (abyss) was considered as the
replacement first and rejected** — verified against the real bundle before proposing it further:
it's category 3 (irregular) in this dataset, not 2 — KanjiVG's own candidate split (氵 + a rare
right-side component) has no real KANJIDIC2 gloss on that right side, so `build_bundle.py`'s
ungloss-downgrade check (data-pipeline/CLAUDE.md) collapses it to one whole-character region, same
as an atomic character — it would never demonstrate this app's own click-through split mechanic at
all, the one non-negotiable bar this whole list runs on. **靉 replaced it instead** — verified
category 2, `雲` ("cloud", left) + `愛` ("love", right), 25 strokes (denser than 魘's own 24, if raw
complexity is what a pick is standing in for), and unlike 淵's dead-end candidate split, both real
cross-references (`雲` shared with 靆/曇/繧, `愛` with 瞹/曖) — a genuinely satisfying click-through
either direction, not a dead end. 蠱 (rice worm/curse, 23 strokes, 蟲+皿) and 魎 (spirits of trees
and rocks, 18 strokes, 鬼+兩 — a direct pairing with 魑, already on this list, both from the same
魑魅魍魎 idiom) were also verified and offered but not chosen this round — 蠱's own 蟲 half is a
genuine cross-reference dead end (the ONLY character in the whole 6,703-character dataset with 蟲 as
a region), worth knowing if it's ever reconsidered.

The list currently reads 闇, 魂, 翼, 縁, 滝, 嵐, 鯨, 艦, 瞳, 雫, 鱗, 焚, 暈, 霰, 蠍, 朧, 灘, 靄, 鯱, 蜻,
榊, 鵺, 魑, 靉 — 靉 landed at the end, in 魘's old slot, not re-sorted into the common→obscure ordering
above; it's genuinely obscure (no grade/JLPT — same rarity tier as most of this list's own back half)
so the slot still roughly fits, but re-rank it properly the next time this list gets a real pass.

## Loading a new character — the swoop-in loading state (`main.js`, `#viewer-loading`)

Every real trigger of a fresh dictionary-mode character load — a related-kanji click (`infoBox`), a
`#search-examples` starter tile, a `.kanji-token` selection in the search field, and the (currently
unreachable, kept for consistency) initial-boot default — goes through one shared
`loadCharWithLoading(char)` instead of calling `loadChar()` directly. Two things happen together for
the swoop's own real duration (`swoopDurationMs`, read from `scene.js` — a plain expose of theme.js's
own `LOAD_SWOOP.durationMs`, 4.6s, not a guessed number):

- **A real "読み込み中..." loading message**, centered over the viewer, pulsing (`nora-kanji-pulse` —
  the same glow-up-glow-down every clickable tile's hover uses in this app, here just always-on while
  visible instead of hover-gated, phase-locked via `syncPulseDelay` like every other pulsing element).
  The trailing "..." is plain static text (`main.js`) — a first pass animated it cycling through 0-3
  dots on its own separate `::after`/`@keyframes`, corrected by explicit request back to static, just
  beeping along with the rest of the text via the SAME pulse rather than a second, independently-
  timed animation.
  A real, confirmed bug on the way to this: `#viewer-loading` sits in the DOM BEFORE `#viewer-canvas`
  (Three.js's own `renderer.domElement`, appended after it in `mountScene`), and with neither given
  an explicit `z-index`, the later-inserted canvas was painting fully opaque over the text — the
  show/hide logic was toggling correctly the entire time (confirmed via direct `classList`/
  `getComputedStyle` checks), the text just had zero chance of ever being visible underneath it.
  Fixed with `z-index: 1` on `#viewer-loading`.
- **The 3D model is locked to `interactive: false`** for that same window (`setKanjiGroup`'s own
  option, `src/viewer/scene.js` — the SAME gate flashcard mode uses, just applied here for the swoop
  instead of a recall test) — explicit request, and a real bug this fixes: clicking or hovering a
  part mid-swoop, before the material had actually settled to its resting state, was producing
  genuinely broken-looking states (a half-lit part, a pin landing on geometry that was still
  mid-rescale underneath it). `loadChar()` now ALWAYS loads non-interactive;
  `loadCharWithLoading`'s own completion is the ONLY place that calls `setInteractive(true)` again.

**`loadGeneration` — a real, confirmed race-condition fix, not defensive programming for its own
sake.** Click one related kanji, then a second one before the first's own ~4.6s wait has resolved,
and the FIRST call's delayed `.remove('is-visible')`/`setInteractive(true)` would fire AFTER the
second click, cutting the second (newer, still actually loading) character's own indicator and
interaction-lock off early — this is exactly what "I saw the loading text once, then it never came
back" looked like when first reported. Fixed with the same "a generation counter, bumped per
attempt, gates whether a stale async completion is still allowed to act" pattern `mossBox.js`'s own
`spawnFrom`/`regenerate` already use for the identical class of problem — `loadCharWithLoading`
bumps `loadGeneration` on entry and checks it's still current before hiding the indicator or
re-enabling interactivity; a superseded call is a no-op past that point, letting whichever load is
actually still in flight own the eventual hide/unlock.

**Deliberately an artificial minimum was tried FIRST, then reworked, worth knowing if this ever
looks short again.** The very first version had NO connection to the swoop at all — a flat 1.5s
floor scoped to only the related-kanji click path, because every per-character fetch in this app is
normally too fast to ever see or verify a loading state existed at all. Corrected once the swoop
itself was brought into scope: tying the indicator to the swoop's own real duration (and extending
it to every load trigger, not just one) made more sense than a second, unrelated timer running
alongside a 4.6s animation — one real signal, not two approximate ones layered on each other.

### The character actually generates in, mid-swoop — `playStrokeGeneration` (`scene.js`)

Brings the pipeline-visualization dev tool's own effect (`viewer/pipelineDemo.js`, its own section
above) into this REAL swoop — explicit request: watch the character actually generate (raw
centerline → offset outline → real extruded depth), not just swoop in already finished. Fired (not
awaited) from `setKanjiGroup`'s own `animateEntrance: true` branch, right after every real mesh in
the fresh group gets `visible = false` — runs CONCURRENTLY with the scale/rotation swoop that's
already playing on `strokeGroup`, same "the character is generating itself WHILE it's still swooping
into frame" idea the dev tool's own 'swoop' entrance toggle established first. Reuses
`samplePathPoints`/`computeOffsetEdges`/`buildOutlineShape`/`extrudeOutline` straight from
`kanjiRenderer.js` — never a re-derived pipeline — building its own overlay group (`genGroup`, a
sibling of the real character group, so it inherits the SAME swoop scale/rotation for free, no
separate transform math needed) that draws every stroke's centerline together, etches every stroke's
offset outline together, then grows every stroke's real depth together — the exact "all strokes at
once" style the dev tool's own mode toggle already proved out, reusing `COLORS.highlightUseful` (the
jade "actively mid-interaction" color this whole app already uses) for the overlay, not a new debug
color.

**`bundle` has to be threaded back to `setKanjiGroup` separately from `buildKanjiGroup`, not read off
the group it already built.** `kanjiRenderer.js`'s own userData contract deliberately shares ONE
object across every mesh in a render-group (so a raycast hit resolves to that whole region's own
node_id/element/etc.) — there's no per-mesh raw `d` to recover from the built group afterward, so
this reads the SAME bundle `main.js`'s `loadChar` already built the group from instead of adding a
second, parallel data channel to `kanjiRenderer.js`'s existing contract just for this.
`setKanjiGroup(newGroup, { interactive, animateEntrance, bundle })` — `bundle` is a new option, only
ever supplied by `loadChar`'s own call site (the ONE real path that plays this swoop at all); a
caller that omits it (or animateEntrance is false) just gets the plain swoop/static load, unchanged.

**Deliberately does NOT stretch its own pacing to fill `LOAD_SWOOP`'s own much longer 4.6s duration —
tried live, reverted by explicit request.** `theme.js`'s own `STROKE_GENERATION` constants (shared
verbatim with the dev tool, so the two can't drift apart) are the SAME short, fixed pace regardless
of the swoop's own length: stretching the generation to fill the whole swoop meant the extrude/
Z-depth reveal only finished right as the character's own rotation had ALREADY eased most of the way
back to front-facing — hiding the exact moment (still meaningfully edge-on) that reveal is supposed
to be legible at. Left independent instead: the character finishes generating early into the swoop,
then continues swooping/rotating into place as an ordinary, already-complete character for the rest
of the swoop's own longer duration. The already-existing glassGlass→normalMaterial handoff (tick()'s
own `swoopingIn` branch, unchanged) still fires exactly when the swoop itself settles — this only
ever decides when the real meshes go from invisible to visible partway through, not what material
they're wearing when they do — see "Blueprint mode for the tail of the swoop" below for what's
actually worn in between.

**Blueprint mode for the tail of the swoop, not plain grey — later explicit request.** The moment
`playStrokeGeneration` actually reveals the real meshes (still mid-swoop at that point, generation
finished but the scale/rotation swoop still easing down to normal size) they now land in "blueprint
mode" — `glassGlass` plus the wireframe edge-glow outline (`EDGE_GLOW`, "The 3D viewer's pin system"
below), the SAME look a detach-zoomed sibling wears once something's pinned — instead of the plain
grey `glassGlass` they'd otherwise be sitting in for that stretch. tick()'s own `swoopingIn` settle
(unchanged) is still what then swaps this to solid white `normalMaterial` the instant the swoop
actually lands — so the real material arc for a swoop+generation load is: invisible (still
generating) → blueprint (revealed, still swooping) → solid white (settled). Blueprint is
deliberately a brief transitional look for that in-between stretch, not a new resting state — a
first pass made it the permanent post-swoop idle look instead (also moving `unpin()`/hover-leave
onto it) and was corrected by explicit follow-up: it should only show for "the split second after
it's been drawn into 3D and before it lands into normal size," not replace the white resting look
altogether. Unpinning, hovering away, and a flashcard session's static card (`animateEntrance:
false`, no swoop, no draw-in at all) are all unaffected — still plain `normalMaterial`.

**Blueprint actually starts a stage earlier than that reveal moment — a real, confirmed hitch,
fixed same pass.** Stage 3 of `playStrokeGeneration` (every stroke's real depth growing in,
`extrudeMeshes`) used to grow in plain grey (`glassGlass`, no outline) for its own ~700ms stretch,
with the edge-glow outline only turned on once the overlay was torn down and the real meshes took
over, above. Reported directly: the flat 2D lines (Stage 1/2) going straight into a plain-grey
growing 3D shape, THEN switching to blueprint only once fully grown, read as an awkward extra step
wedged in between — "2D lines" and "3D blueprint" are supposed to feel like one continuous world,
not three. Fixed by growing each Stage 3 extrude mesh's OWN edge-glow outline right alongside its
depth, from the very first frame anything has real depth at all — added as a CHILD of the mesh
(not via `getOrCreateEdgeGlow`'s usual sibling-add, which assumes a mesh that never moves its own
local transform — true for every real character mesh it's normally used on, but not this one, since
`mesh.scale.z` growing 0→1 IS the whole Stage 3 animation) so the outline inherits that same
growing scale for free. There's no plain-grey 3D moment left anywhere in the sequence now — the
hand-off to the real meshes at the end is a continuation of blueprint mode already in progress, not
a fresh switch into it.

**A genuinely new async-driven helper in an otherwise tick()-driven file, by design, not an
oversight.** Every other animation in `scene.js` is instead driven by `tick()`'s own elapsed-time
phase checks, because those all interact with shared, ongoing state (hover/pin/detach-zoom) `tick()`
already owns every frame regardless. This one doesn't — it's a genuinely self-contained, one-shot
sequence (build the overlay, run it, reveal the real meshes, done), the same shape the dev tool's own
identically-named `animateValue` helper already uses; reused as a second copy of that exact helper
(scene.js can't import a dev-tool-only file) rather than shoehorned into `tick()`'s own phase-flag
style for no real benefit.

**Same generation-guard pattern as everywhere else this session, applied to a NEW `genToken`
counter** (`setKanjiGroup` bumps it unconditionally on every call, alongside its other existing
"fresh character discards old async state" resets) — `playStrokeGeneration` checks its own captured
token after each of its three stages' own last `await`, and — if stale — removes/disposes whatever
overlay it had built so far and returns without revealing any real meshes, the same "a stale stage
cleans up after itself; only the CURRENT token's own completion actually reveals real meshes"
contract `pipelineDemo.js`'s own per-stage checks already established. Verified live via a temporary
debug hook (`window._sceneDebug`, removed after): the genuinely correct case (a single load) shows
`pinchScale`/`rotationY` easing smoothly and continuously from 6/-90° to 1/0° in step with real
elapsed time, the overlay's own jade centerlines/etch/extrude visibly playing during the early part
of that window, then a clean handoff — `strokeGroupChildren` drops back from 2 to 1 (the overlay
group actually removed) the instant the real meshes become visible, no console errors at any point.

**No jade anywhere in this production sequence at all, `genLineMaterial`/`genFillMaterial` both
grey (`COLORS.ink`) — two corrections, not one.** First pass: Stage 3 (the moment the shape actually
BECOMES a real 3D object) kept the dev tool's own jade `genFillMaterial` right up until the overlay
was torn down and the real (grey `glassGlass`) mesh revealed underneath, reading as a visible
green-then-grey snap at that exact handoff — fixed by handing Stage 3's extrude meshes the SAME
shared `glassGlass.front` material instance the real meshes are already sitting in underneath (not a
clone, not just a matching color — the literal same object, same color AND same opacity), so
revealing the real mesh changes nothing visible at all. Still not enough, confirmed live — a real
green flash remained, just moved a beat earlier: Stages 1/2 (the flat centerline/etch, immediately
before Stage 3) were STILL jade, so the color change simply happened at a different instant instead
of being removed. Second correction: `genLineMaterial`/`genFillMaterial` themselves (this file's own
comment on their declaration) recolored from `COLORS.highlightUseful` (jade, matching the dev tool's
own "actively demonstrated" color) to `COLORS.ink` (grey) — nothing in this whole sequence is jade
from the very first frame any more, so there's no jade anywhere for anything to flash FROM. Verified
live both ways: an early frame (Stage 1, still just a sparse scatter of centerline marks) already
reads grey/white, not green, and the whole sequence through to the swoop's own real white settle
(tick()'s `swoopingIn` completion, untouched) shows no jade at any point.

### Clearing back to empty — real bug, fixed

**The load-IN swoop above is completely untouched by this — this section is ONLY about what happens
going TO empty** (backspacing the search field out entirely), a genuinely separate path. Used to call
`clearKanjiGroup()` directly, with no graceful wind-down at all — reported directly: "fully
glitches... stuck down the bottom of the box... looks like a mistake." Two real, confirmed causes,
both fixed:

1. `clearKanjiGroup()` defaulted to `setKanjiGroup`'s own `animateEntrance: true` — meaning clearing
   to empty played the FULL load-in swoop for a group with nothing in it to actually see swooping.
   Now explicit: `clearKanjiGroup()` always loads `animateEntrance: false` — no swoop for an empty
   group, ever.
2. Whatever was actually on screen a moment before — possibly a part still mid-pin or mid-detach-zoom
   — never got a chance to wind down; `setKanjiGroup`'s own child-removal just discarded it
   mid-animation. Fixed by routing the clear through `exitLoadedKanji()` first (`scene.js`) — the SAME
   graceful "ease any detach-zoom back to normal, then glow the pin off and fade" sequence dictionary
   mode already used when leaving it entirely (`#back-to-home-btn`, "The dictionary-entry transition"
   below) — genuinely reused, not a second bespoke clear animation. Confirmed as a real improvement,
   not just a bug fix, once it landed: worth keeping even independent of the bug it fixes.
   `syncSearchField`'s empty-branch (`main.js`) bumps `loadGeneration` and calls
   `exitLoadedKanji().then(() => { if (stillCurrent) clearKanjiGroup() })` — fire-and-forget, not
   awaited, so the field's own synchronous UI updates (caret, placeholder) aren't held up by a ~1s 3D
   fade; reusing `loadCharWithLoading`'s own generation counter is what lets a fast retype right after
   backspacing supersede the clear cleanly, instead of the clear's own delayed `clearKanjiGroup()`
   wiping out a character that's already loaded back in by the time it fires.

**This is the first time `exitLoadedKanji()` is called from anywhere OTHER than right before the
whole viewer gets torn down** — its own original design (comment in `scene.js`) assumed that, so
`pinnedGroup`/`pinnedNodeId` were "deliberately left untouched... there's no stale UI left for it to
mislead" once the DOM's gone. That assumption doesn't hold for the clear path (the viewer stays up),
which surfaced a real, previously-unreachable race: a fast retype could start a brand-new
`setKanjiGroup()` call WHILE the old `exitLoadedKanji()` was still mid-fade. Fixed at the source —
`setKanjiGroup` now resolves and clears any in-flight exit-reveal state (`exitRevealResolve`,
`detachZoomBackResolve`) the same way it already discarded a stale `loadRevealStart`/`detachGroup` —
so a fresh character load can't leave an old `exitLoadedKanji()` promise dangling unresolved, and
can't have the OLD exit's flicker fight over materials the new load has already taken over.

**Real bug, found only after the fix above shipped — reported directly: "the 3D load-in animation
completely broke... it's like invisible... it just snaps into place."** Resolving the exit-reveal's
own STATE (the paragraph just above) turned out not to be the same as resetting the MATERIAL it had
been mutating. `applyExitReveal`'s own `fade` phase (`scene.js`) directly mutates the SHARED
`glassGlass` material's real `opacity`/`emissiveIntensity` down toward 0 — `glassGlass`/`pinnedGlass`
are both module-level singletons (`makeGlassPair`, near the top of `mountScene`), reused by every
character in that mount, never cloned per-load — and it lands there whether the fade finishes
naturally OR gets cut short by a fresh load superseding it. That was never a problem for
`exitLoadedKanji()`'s ORIGINAL caller (`#back-to-home-btn`) — the whole viewer, and that `glassGlass`
instance with it, gets torn down and rebuilt fresh immediately after. It IS a real problem now that
`clearKanjiGroup()` also routes through `exitLoadedKanji()` first and the SAME `glassGlass` instance
survives into the NEXT real character: `setGroupMaterial(g, glassGlass)` (setKanjiGroup, a few lines
below the reset) was handing every fresh load this material at whatever opacity the earlier fade had
left it at — near/at 0, genuinely invisible — for its ENTIRE swoop, only becoming visible the instant
the swoop's own completion force-switches to `normalMaterial` (`tick()`'s `swoopingIn` branch) — which
is exactly "invisible swoop, then snaps in." Reproduces specifically (and only) after backspacing a
character out at least once first — never on a page's very first load — which is what pinned this
down: `glassGlass` is pristine until the first exit-reveal fade ever touches it. Fixed in
`setKanjiGroup`, right alongside the state reset above: `applyGlowMultiplier(glassGlass, ..., 1, 1)`
and the same for `pinnedGlass` — the exact function the fade itself uses, just handed multiplier `1`
(the literal "back to full strength" case) — unconditionally, not only when actually interrupting an
in-flight fade, since a fully-naturally-finished one leaves the exact same corrupted 0 opacity behind
and isn't distinguishable from the interrupted case by `exitRevealStart`/`exitRevealResolve` alone
(both are already null in that case too).

**A third real bug, found immediately after the second — same root shape, a different piece of
state left dangling by the same interruption.** Reported directly: backspacing out DURING a
still-running `loadCharWithLoading` (the "読み込み中..." text + interaction-lock, "Loading a new
character" above) left that text stuck up indefinitely, "beeping on screen" until the NEXT
character's own load happened to finish — at which point it stopped only because THAT load's own
completion finally cleared it, not because the backspace ever did. Root cause: `syncSearchField`'s
clear branch bumps `loadGeneration` (needed for the material bug above's own race guard), and
`loadCharWithLoading`'s own completion checks that exact counter to decide whether it's still the
one that should hide the indicator (`myGeneration !== loadGeneration` → "a newer load must own this
instead, skip"). That logic is correct when a NEWER LOAD is what bumped the counter — but a
backspace isn't a load, and nothing else was coming to claim the job, so the indicator just never
got hidden. Fixed by hiding it directly in the clear branch itself (`viewerLoading.classList.remove
('is-visible')`, right before bumping `loadGeneration`) — unconditional, a harmless no-op if nothing
was actually loading, exactly what's needed if something was.

## The radio box (#radio-panel)

A second, persistent `createMossBox()` instance on the home page (`main.js`, alongside `optionsBox`)
— a real, working music player (play/pause, volume, track title/cover art, elapsed/total time —
`prev`/`next` were removed later, see "Track-picker dropdown" below for why), migrated from
**`~/Downloads/spotify-store`**'s own "NORA Music Player" (its
`public/index.html`) — a sibling side project to `moss x kanji FINAL` (the source `mossBox.js`'s
glass system itself was ported from), not that project. Only the source's actual PLAYER CONTENT
(`.nora-player-row` and everything inside it — art/meta/title/volume/controls/duration) was ported,
largely verbatim (see `style.css`'s own header comment on `#radio-panel` for the few deliberate
adaptations: `--itab-bg` instead of a hardcoded background, and the source's own expand/collapse
toggle dropped entirely since this box is meant to land once and stay — see below). The artist line
(`.nora-player-artist`, under the title) was ported too, then removed by request — title only now;
`RADIO_PLAYLIST` entries still carry `artist`, just unrendered, so it's a one-line change to bring
back if that's ever wanted again.
The OUTER box (topbar/glass/marquee/corner glyph) is NOT ported at all — that's `createMossBox()`
itself doing the job, which is what actually makes this box's chrome pixel-identical to
`#options-panel`'s own, "the exact same styling cues as our current selection box," rather than a
hand-derived approximation of it.

**Hidden until select mode is entered, spawns in once, never moves again.** `#radio-panel` starts
`.is-hidden` like any fresh `createMossBox()` instance and stays that way through welcome. Welcome's
"enter the terrarium" click (`enterSelectMode()`, `main.js` — there used to be a dummy login form's
own submit handler here instead, before login/signup were removed entirely; see "One box, every
stage" above) is where it actually spawns in: alongside the existing `terrariumEnterCloseUp` dispatch,
`optionsBox.el.getBoundingClientRect()` is read (the closing welcome box's own on-screen center — read
at this exact instant, before `optionsBox.regenerate()` inside `renderModeSelect()` starts animating
it into select-mode, since a moment later that rect would already be mid-collapse), and
`spawnRadioBox(x, y)` fires from there — not awaited, same "runs concurrently, not sequenced with the
rest of the select-mode-entry transition" convention the terrarium event already established.
`spawnRadioBox` runs the exact same `spawnFrom` → reveal sequence `renderPinInfo` (dictionary view,
further down this file) uses for the click-to-pin info box — the "shard flies from (x,y),
glitch-expands into the box's shape, flickers, bump-expands to full size" entrance — just with ONE
reveal "line" instead of several staggered text lines, since this isn't a text reveal.

**Lands directly on the track-SELECT stage now, not the ordinary player row — explicit request.**
Used to reveal `radioPlayerHtml()` (the collapsed player, its own "track select" button still needing
a click to actually see any tracks); now reveals `trackListStageHtml()` (`revealLines
([trackListStageHtml()])`) instead, immediately followed by `revealTrackRows()` — the SAME row-by-row
fade-in `openTrackSelectStage()` uses (that function's own section, "Track-picker dropdown" below, has
the row markup/reveal mechanics) — so coming from welcome straight into select mode shows every track
already laid out to choose from, not a collapsed player first. `#radio-panel`'s own CSS `max-height`
(560px, `style.css`) already accounts for the taller track-list stage regardless of which stage is
showing, so no sizing changes were needed to fit this on the very first spawn. Scoped to exactly this
ONE entry point on purpose: `spawnRadioBox`'s only caller is `enterSelectMode()` (welcome → select).
`mountHome(true)`'s own `startAtSelectMode` first-paint branch (returning to select mode from
Dictionary/a lesson, further down this file) is untouched and still paints the ordinary
`radioPlayerHtml()` player straight away via `syncTrackDisplay()`/`updateRadioDur()`/
`setRadioPlaying()`/`syncVolumeSlider()` — those calls only apply to that OTHER path now, since
`trackListStageHtml()` rebuilds itself fresh from the engine's current state every time it's rendered
and needs no separate sync step. Autoplay was tried and left disabled by request ("too annoying
mid-testing") even before the persistence redesign below — this box has never actually auto-started
playback on its own; picking a track (or pressing play from the ordinary player stage) is what starts
sound, same as it still is now.

`#radio-panel` reuses `.nora-moss-box--float-right` (`style.css`) unmodified — that class was already
sitting there specifically for "a future box that doesn't collide with the sidebar" (its own comment,
written before this box existed), and the home page has no sidebar at all, so this is exactly that
box: it lands in the empty space to the right of the terrarium, mirroring `#options-panel`'s own
`--float-left` position on the other side. Width matched to `#options-panel`'s own 300px for a
consistent pair of home-page boxes, not the source's one-off 380px.

**"Stuck there" was the explicit ask** — once spawned, this box is never `regenerate()`d and never
spawns a second time for the rest of that select-mode session; it just sits at its landed position
through every stage of select-mode, the flashcards deck picker, and any deck's own lesson list. It
only goes away in two places, both mirroring
how the OTHER home-page-only elements (`optionsBox`, `hoverTitle`/`hoverDesc`) already get handled at
the exact same call sites, not new teardown logic invented for this box specifically:

- **`renderWelcome()`** — reached via select-mode's 'exit' option (see "One
  box, every stage" above; used to also be reachable via login's own back button, before login was
  removed entirely) — retracts the box via `despawnTo(x, y)`
  (`mossBox.js`) rather than a plain fade, per the explicit ask: "just fading away" wasn't enough,
  it needed to repeat the shard/glass effect in reverse. `despawnTo` is the literal mirror of
  `spawnFrom` (same file) — content fades, the box bump-*collapses* to its closed shape (plain ease,
  not `spawnFrom`'s own overshoot bump-expand — an overshoot reads as a wobble on a closing motion,
  the same reasoning `regenerateBox`'s own Phase 1 already documents), the same landing `flicker()`,
  then a shard glitch-*shrinks* out of that closed shape down to a small chip at `(x, y)` — the box
  becomes the shard instead of the shard becoming the box. That shard flight (`flyShardBack`) is
  built by taking `spawnFrom`'s own `flyShard` keyframes and literally reversing the order while
  complementing every offset (`1 - offset`), with a correspondingly mirrored easing curve
  (`cubic-bezier(.64,0,.78,.39)`, `flyShard`'s own `cubic-bezier(.22,.61,.36,1)` with its control
  points swapped and complemented) — the same "exact time-reversal" mirroring `flashIn`/`flashOut`
  already established elsewhere in `mossBox.js`, not a separately-tuned exit animation. `x, y` here is
  `optionsBox.el`'s own current on-screen center (the box the original spawn flew IN from — its
  position doesn't actually move between stages, so reusing it as the retraction's target lands the
  shard back roughly where it started). Guarded on `!radioBox.el.classList.contains('is-hidden')` —
  only despawn a box that's actually visible right now. `renderWelcome()` has exactly one caller now
  (select-mode's 'exit' option), which always fires after `enterSelectMode()` already spawned the
  radio box, so in practice this guard's `else` branch (`radioBox.hide()`) is unreachable today — kept
  because it used to be reachable back when login's own back button could reach `renderWelcome()`
  before a successful login had ever spawned the box, and despawning an already-hidden box would fly a
  shard out of a stale rect that isn't a real "the box is leaving" moment. Cheap enough to leave in
  place rather than strip out now that its one real trigger is gone.
- **Entering Dictionary or a lesson** (`leaveHomeIntoOrb()`, shared by `transitionToDictionary` and
  `transitionToFlashcardSession`) — despawns/hides the box and calls `unsyncRadioUI()` before
  `radioBox.el.remove()`. This USED TO also call `radioAudio.pause()` right here — removed entirely
  by later explicit request, see "Persistent radio engine" below for the full redesign: audio now
  keeps playing straight through both screens. `unsyncRadioUI()` is the thing that still actually
  matters at this exact call site now — see that section for why.

### Persistent radio engine — surviving Dictionary, every lesson, and 'exit'

Explicit request, grilled first (`/grill` session — the user's own words: "grill me on this first,
make sure the whole layer of it is making sense"): since this is a one-page app, there's no real
reason music has to stop unless something actually pauses it. Before this pass, `RADIO_PLAYLIST`/
`radioTrack`/`radioAudio` (`new Audio()`) were ALL local to `mountHome()` — recreated from scratch
every single call, matching this file's own strict "nothing survives a mountHome() teardown" rule
(the terrarium, every box, all of it, rebuilt fresh every time) — and `radioAudio.pause()` calls sat
at both places that left the home screen (leaving for Dictionary/a lesson, and select-mode's own
'exit'). This is the FIRST exception to that rule, and deliberately the narrowest one possible:

**Only the playback ENGINE moved to module scope, above `mountHome` entirely — `RADIO_PLAYLIST`,
`radioTrackIndex`, `radioAudio` itself, `loadRadioTrackAudio()`, and the `ended` auto-advance
listener.** The visual `radioBox` — topbar, player row, the whole DOM — is still rebuilt from scratch
every single `mountHome()` call, exactly like every other box on this screen; it just paints itself
FROM the engine's current state (`syncTrackDisplay()`/`updateRadioDur()`/`setRadioPlaying()`/
`syncVolumeSlider()`, called once right after this mount's `radioPlayerHtml()` lands, in both
`spawnRadioBox` and the `startAtSelectMode` first-paint branch) instead of always resetting to track
0/paused/silent. A mount landing mid-song from a previous select-mode visit has to show that
correctly, not stomp it.

**Why this causes zero audible interruption, confirmed and explained to the user directly (not just
asserted) when they pushed back on exactly this point:** `radioAudio` has never been attached to the
DOM at all — nothing anywhere does `someElement.appendChild(radioAudio)`. A detached
`HTMLAudioElement` plays fine with no visual presence, so keeping it alive while completely unrelated
DOM (the box chrome) gets destroyed and rebuilt elsewhere on the page has no path to touching
playback — no pause, no reload, no click, as a SIDE EFFECT of navigation. The OLD `.pause()` calls
were solving a different problem specific to the old architecture: a fresh `new Audio()` every mount
meant the PREVIOUS instance had to be silenced explicitly or it would keep playing forever with
nothing left in JS able to control it. With one `Audio()` for the app's entire lifetime now, that
problem doesn't exist to solve — both `.pause()` call sites were removed outright, not replaced with
anything (`renderWelcome()`'s own 'exit' path, and `leaveHomeIntoOrb()`, shared by Dictionary and
every lesson entry).

**Per-mount UI listeners are added and removed in a matched pair** — `loadedmetadata` →
`syncTrackDisplay`, `play`/`pause` → `setRadioPlaying`, `timeupdate`/`durationchange` →
`updateRadioDur`, all added fresh in `mountHome` and explicitly removed by `unsyncRadioUI()` (called
from `leaveHomeIntoOrb()`, right before `radioBox.el.remove()`). Without this, every trip back into
select mode would stack one more duplicate listener onto the permanent `radioAudio` singleton — each
one still firing (mostly harmless no-ops against DOM that's already gone) but leaking all the same.
`renderWelcome()`'s own 'exit' path does NOT call `unsyncRadioUI()` — that path doesn't destroy the
box, just hides/despawns it (the same instance, same listeners, stay valid throughout), unlike
`leaveHomeIntoOrb()`'s genuine `.remove()`.

**Explicit scope decisions from the grill, settled before any code was written:**
- Audio survives Dictionary, every lesson screen, AND a full trip back to welcome via 'exit' — no
  exceptions, it only stops on a real `.pause()` (the play/pause button itself).
- No `localStorage`/reload-survival — purely within one running session of the SPA, matching every
  other "nothing saved" boundary this fully-static app already has (root `CLAUDE.md` phasing). A hard
  refresh resets everything, on purpose.
- The visual box stays fully disposable (destroyed/rebuilt every mount) — only the engine persists.
  Keeping the actual DOM node alive across a full terrarium teardown/rebuild was considered and
  rejected: it would fight `mossBox.js`'s whole lifecycle (`spawnFrom`/`despawnTo`/`regenerate` all
  assume a box belonging to the CURRENT mount) for a difference the user would never actually see —
  the audio surviving is what's experienced; the box being a fresh instance that already knows the
  right track is invisible.

### Track-picker dropdown — "let them pick a song"

Added in the same pass, same explicit request: next/prev alone wasn't "pick any song you want."
Lives INSIDE `#radio-panel` itself (not a second box — nothing else in this app splits one feature
across two boxes). **Redesigned twice already, both later same-day explicit requests.** First: the
opening version opened/closed via a small chevron icon next to the track title; too easy to miss.
Replaced with a real button reading "track select" (`#radio-player-toggle-list`, `radioPlayerHtml`)
— this app's own established "click this to proceed/reveal" look (the same class `#back-to-home-btn`/
dictionary's own "reveal" button use), not a bespoke icon; also needed its own explicit
`justify-content: center` (`style.css`) since plain `.mode-option`'s own default is left-aligned
content, not centered the way `.mode-option-list .mode-option` gets for free — this button isn't
inside one of those lists.

Second: this button is no longer "always-visible" at all, despite that being the whole point of the
first redesign — later explicit request changed the interaction again. Clicking it swaps the WHOLE
box over to a second, genuinely separate stage — the track list — via this box family's own usual
`regenerate()` choreography (collapse → white-flash swap → reopen), landing on `trackListStageHtml()`
instead of the ordinary player row. Was a one-way door for a while (below has that whole history,
current-state-first past this point) — is a real open/close toggle now, most-recent rework.

**REWORKED A THIRD TIME since — the max-height/opacity approach described in earlier revisions of
this section is gone.** That version deliberately avoided `regenerate()`'s own collapse/flash/reopen
(worried it would "visibly flash/interrupt the title/cover of whatever's currently playing... reading
as if the track itself had changed when it hadn't") in favor of a lightweight nested toggle:
`toggleTrackList()` bumping `.radio-track-list`'s own `.is-open` class plus a matching
`RADIO_BOX_OPEN_MAX_HEIGHT` bump on `#radio-panel` itself. That whole approach was walked back later
— "it doesn't need to do the full [nested] effect" — in favor of leaning into the SAME
`regenerate()` transition every other stage change in this box family already uses:
`openTrackSelectStage()` (`main.js`) calls `radioBox.regenerate({ html: trackListStageHtml() })`
directly, the exact collapse-to-tabs/flash/reopen every other stage transition in this app plays.
The concern the max-height version was built to avoid didn't turn out to matter in practice — the
player row and the track list are genuinely two different STAGES of this box now (`radioPlayerHtml()`
vs. `trackListStageHtml()`, never both in the DOM at once), the same relationship welcome/select-mode/
a deck/a lesson already have to each other elsewhere in this app, so the flash reads as a real stage
change rather than an interruption. `toggleTrackList`/`RADIO_BOX_OPEN_MAX_HEIGHT`/`.is-open` no
longer exist anywhere in the code.

**No longer a one-way door — later explicit request, "a proper toggle."** `trackListStageHtml()` now
ends with its own trailing button, "current track" (`#radio-player-close-list`) — reusing
`.radio-track-select-btn` verbatim (the SAME class "track select" itself uses, same centered
`.mode-option` look) rather than a bespoke close control. Clicking it calls
`closeTrackSelectStage()`, the direct mirror of `openTrackSelectStage()`: the same `regenerate()`
collapse/flash/reopen, landing back on `radioPlayerHtml()`, then the same re-sync block
`selectTrack()` already needs (`syncTrackDisplay`/`updateRadioDur`/`setRadioPlaying`/
`syncVolumeSlider` — a fresh `regenerate()` always wipes the box's whole DOM, so whatever's currently
playing has to be repainted from the persistent engine state again regardless of which direction
triggered it) — the one real difference from `selectTrack()` is it never touches
`loadRadioTrackAudio`/`radioAudio.play()` at all, since nothing about the track should change on the
way back out. Deliberately placed INSIDE `.radio-track-list` (an extra child after the mapped rows),
not as a sibling of it — `trackListStageHtml()` has to stay a single top-level element either way,
since `spawnRadioBox`'s own first-paint call goes through `revealLines()` (`mossBox.js`), which only
ever keeps a string's `firstElementChild` and silently drops any sibling (the exact same class of bug
this section's own "real bug" paragraph below already documents once, on `radioPlayerHtml()` itself)
— nesting the new button inside the existing wrapper sidesteps that trap entirely rather than
re-introducing it.

**Each row was ALSO redesigned in that same later pass** — explicit request: "should display more or
less like the featured song," not a plain text button. Originally `.mode-option`/`.mode-option-label`
verbatim (this app's usual "pick one of several options" look); now each row reuses `.nora-player-art`/
`.nora-player-title` instead — the SAME classes the box's own now-playing display uses — so a row is a
40px cover thumbnail next to a white-glow title, not a jade pill button. Still a real `<button>` for
click/keyboard semantics, just reset to a bare, transparent, left-aligned row (`.radio-track-option`,
`style.css`) with no button chrome at all. `data-typewriter` still deliberately omitted — that
attribute only means anything inside a `regenerate()`/`revealLines()` sequence, which this toggle
never runs.

**Hovering EITHER the art or the title glows the WHOLE row** — explicit request. `.is-pulsing` toggles
on the row itself (`radioBox.content`'s own mouseover/mouseout, scoped to `.radio-track-option`); the
CSS fires `nora-kanji-pulse` on BOTH children together, `syncPulseDelay`'d individually so they breathe
in phase with each other and the rest of the page's shared pulse clock. Needed one real fix to read
right: `.nora-player-art img` has no opacity of its own in the now-playing display (never dimmed
there), so a bare reuse would have pulsed UP to `nora-kanji-pulse`'s 0.75 peak from a resting 1.0 —
visually a flicker-DOWN, not a glow-UP. Given the art its own resting `opacity: 0.7` (`style.css`,
`.radio-track-option-art img`) — matching `.nora-player-title`'s own existing resting opacity exactly
— fixes it: both children now sit at the same dimmed weight at rest, and hovering genuinely brightens
both toward the pulse's peak instead of dimming either one.

**Picking a track** (`.radio-track-option` click) calls `loadRadioTrackAudio()` (the engine, above)
and `radioAudio.play()`, then closes the dropdown immediately — same "commit and move on" interaction
every other `.mode-option` selection in this app uses (a lesson, a deck), not a multi-step form.
**The currently-loaded track is highlighted** (`.is-current` — every one of the row's own elements
bumped to full opacity, overriding the same resting-dim rule above) so opening the list mid-playback
gives real orientation instead of a plain unordered stack; `renderTrackList()` re-runs inside
`syncTrackDisplay()` on every real track change (including the `ended` auto-advance firing with no UI
mounted at all), so this never goes stale.

**Each row grew to four elements, later explicit request, Apple-Music-style — art, a "Track N:" index
label, the kanji title, and a static duration, in that order.** `RADIO_PLAYLIST` entries each carry
their own `duration` (seconds) now — real, measured values (`ffprobe -show_entries format=duration`),
not estimates, hand-typed in since the list needs to show a track's length BEFORE that track has ever
been loaded (the box's own live `radioAudio.duration` readout only becomes available once a track's
metadata actually loads). The index label and duration both reuse `.nora-player-title`'s sibling class
`.nora-player-dur` verbatim — the same small/dim/Arial secondary-text treatment the main player's own
"0:00 / 4:06" readout already uses — but override its resting opacity (0.32, tuned for a single
always-visible readout) up to the row's own 0.7, joining the SAME resting-dim/hover-pulse/is-current
system every other element in the row already uses rather than looking like an unstyled afterthought.
`.radio-track-option-title` alone carries `flex: 1` — the one element that grows to consume whatever
width the other three don't claim, which is what pins the duration flush against the row's own right
edge regardless of title length, confirmed live (`row.right - duration.right === 0`) — using the
SAME `gap` value between all four elements rather than a separate margin pushing just the last one.

**`#radio-player-prev`/`#radio-player-next` were removed entirely, same later pass** — explicit
request, "just have play/pause." With the track-picker now doing real track selection, stepping
one-at-a-time via prev/next stopped earning its own two buttons and their own skip-back-if->3s-in
logic; play/pause and the picker cover everything prev/next used to. `radioTrackIndex ± 1` arithmetic
that used to live in those click handlers is gone with them, not left dormant — trivial to
re-introduce later if ever wanted, unlike the bigger dormant systems elsewhere in this app that got
kept specifically because reverting them wouldn't be trivial.

**A real bug, caught and fixed before this ever shipped:** `radioPlayerHtml()` originally returned TWO
top-level sibling elements (`.nora-player-row` and `.radio-track-list`) — `revealLines()` (`mossBox.js`)
only ever keeps `wrap.firstElementChild` from each string it's given, silently discarding any sibling.
The track list rendered nothing at all the first time, no error anywhere — `#radio-track-list` simply
never made it into the DOM via the `spawnRadioBox` path (the `startAtSelectMode` first-paint branch,
which uses plain `setContent()` instead, was unaffected — that path has no such restriction, which is
exactly why the bug didn't show up everywhere and was easy to miss at first). Fixed by wrapping both
elements in one shared parent (`.nora-player-wrap`) so `radioPlayerHtml()` returns a single top-level
element again, matching what `revealLines()` actually assumes.

Real tracks, not silence/placeholders, `RADIO_PLAYLIST` in `main.js`, in playback order. **The
bullets below are headed by each track's own underlying filename/`src` (unchanged, on disk) — not
its currently-displayed `title`, which was renamed again by later explicit request**, same "only the
`title` string changed" pattern `適`'s own bullet already documents happening once before: 滝→深淵,
適→哀愁, 絆→未練, 霧→煉獄, 縁→幽玄, 池→靉靆 (same order, same src/cover/artist/duration for all six).
The naming history below is per-FILE, so it's still accurate as written:
- `滝` (93levi) — pulled from this Mac's own Apple Music library (`~/Music/Music/Media.localized/`),
  not spotify-store. First in the playlist — the track loaded by default whenever the persistent
  engine has never been touched yet (see "Persistent radio engine" below), though nothing here has
  ever actually autoplayed it; pressing play is what starts sound. **Swapped for a corrected version
  since** — the file originally here was the wrong version of the song; replaced with the right one
  (same filename, `public/audio/滝.mp3`, dropped in from the repo's own outer level rather than
  `~/Music/`) — genuinely different audio (different byte size, different real duration, 4:06 now),
  not a re-save of the same file. Used to start at 0:45 in specifically (`spawnRadioBox`'s own
  `radioAudio.currentTime = 45`, set right after loading track 0) — reverted by later explicit
  request, plays from a genuine 0:00 now like every other track; both call sites that used to set
  this (`spawnRadioBox`, and `mountHome`'s own direct `startAtSelectMode` first-paint branch) had the
  seek removed outright rather than set to an explicit 0, since loading a track already starts it at
  0 by default. Cover art (`cover-taki.png`)
  is a user-supplied image, dragged in directly rather than pulled from anywhere else — an earlier
  pass used a thumbnail VirtualDJ had auto-extracted from the track's own embedded artwork
  (`cover3.jpg`), since replaced and removed.
- `適` (93levi) — originally `スプレー`, copied from `~/Downloads/spotify-store/public/audio/`
  (alongside the now-removed `Your Need`, below) — the original second track this whole box was
  migrated with. Renamed by later explicit request; same file, same cover (`cover.jpg`), only the
  filename and playlist `title` changed.
- `絆` / `霧` / `縁` / `池` (93levi, unconfirmed for all four — flagged, not verified per-track) —
  added by explicit request. `絆`/`霧`/`縁` (originally `絆`/`天上界`/`黙示録`) arrived as `.aif` — a
  real, caught bug: `<audio>`/`Audio()` can't play AIFF at all in Chrome/Firefox/Edge
  (`canPlayType('audio/aiff')` returns `''`, confirmed live — only Safari actually decodes it), so all
  three would have silently failed to make any sound for the vast majority of visitors, load and
  title/cover swap succeeding right up until playback itself. Converted to mp3
  (`ffmpeg -codec:a libmp3lame -b:a 192k`, matching this playlist's own existing bitrate) and the
  `.aif` originals deleted from `public/audio/` — no reason to ship a redundant 25-28MB source file
  per track alongside its own ~3.5-5MB web-playable copy. `池` arrived as mp3 already (a Moises.ai
  instrumental separation of a track called "pond" — 池 IS "pond"), unaffected by any of this.
  `天上界`→`霧` and `黙示録`→`縁` renamed same pass as `スプレー`→`適` above, same reasoning. All four
  share `cover2.jpg` (freed up by `Your Need`'s own removal, below) as a placeholder cover — no
  dedicated art existed for any of them yet; six brand new cover images were incoming per explicit
  request as of this writing, at which point every track (including `適`'s pre-existing `cover.jpg`
  and `滝`'s `cover-taki.png`) may get replaced.
- **`Your Need` — removed entirely**, not just unlisted: explicit request, the track no longer fit
  what this playlist should be. Its audio file, its `RADIO_PLAYLIST` entry, and the stale `dist/`
  build copy were all deleted; `cover2.jpg` (its own dedicated cover) was kept and repurposed as the
  shared placeholder for the four new tracks above rather than deleted, since it had no other use once
  freed up.

All copied into `apps/web/public/audio/` (mp3s + their own cover art).

## The dictionary-entry transition — `transitionToDictionary()` (`main.js`)

Replaces what used to be an instant, synchronous teardown (`disposeTerrarium()` + a handful of
`.remove()` calls, immediately, right on the 'dictionary' click) with a real multi-second choreographed
exit, per explicit request: "here's the hard part." Fired (not awaited) from the click delegation,
same "the click handler itself has nothing to wait for" convention as `spawnRadioBox`.

**Three exits run concurrently** (`Promise.all`, not sequenced — one coherent moment, not a queue):
- `optionsBox.closeAndFade()` (`mossBox.js`) — a new sibling to `spawnFrom`/`despawnTo` for a box
  that's leaving for good with no destination point to fly toward. Three beats: content collapses to
  its closed (topbar+bottombar-only) shape (`regenerateBox`'s own Phase 1, reused verbatim, not
  re-derived), the same rise-then-fall white flash `regenerateBox`'s own Phase 2 uses (the "glow"),
  then the box's own ordinary `.is-hidden` opacity/transform fade (the "disappear") — no shard, no
  reopening.
- `radioBox.despawnTo(x, y)` — the SAME reverse-shard retraction built for logout, reused as-is;
  "back to the left" is literally `optionsBox`'s own on-screen center, read before `closeAndFade`
  starts moving anything (its position doesn't change while collapsing in place, so this stays valid
  the whole time). Guarded the same way `renderWelcome()` already guards it — `radioBox.hide()`
  instead if it's somehow not actually visible.
- `enterOrb()` (`terrarium.js`) — see that function's own extensive comment for the full reasoning.
  **Redesigned from a straight "dive, then fade" into one continuous spiral**, explicit "PS2 disc-load"
  ask (grilled first): pull back out toward birds-eye WHILE already spinning, then — same spin, no
  stop, no seam — dive back in toward the orb, with the box shattering into flying glass fragments
  CONCURRENTLY with that dive so it's completely gone by the moment the dive lands, never fading in a
  separate beat after arrival like the old version did. Two phases (`spiralPhase` 1/2), both
  constant-speed/linear, no easing — the same reasoning `scene.js`'s `LOAD_SWOOP`/`DETACH_ZOOM`
  comments already give for why an eased deceleration reads "modern/ai" in this app rather than heavy:
  1) `spiralOutDuration` (1700ms) pulls the camera back and up, in Spherical terms (radius/phi around
  `controls.target`) `spiralPeakBlend` (0.85) of the way toward birds-eye's own radius/phi, computed
  FRESH from wherever the camera actually is (closeUpPos for a real dictionary entry, deckZoomPos for a
  lesson entry reached through the deck picker — this generalizes correctly to either, unlike the old
  dive's own fixed-one-caller assumption); 2) `spiralInDuration` (3000ms) dives back in, radius easing
  toward `spiralDiveBlend` (0.04) of the peak radius, phi easing back toward the ORIGINAL starting
  phi — while `spiralTheta` (the spin) keeps accumulating continuously across BOTH phases off one
  never-reset start time, recomputed fresh from elapsed time every frame rather than incremented, so it
  can't drift and never resets/stutters at the phase 1→2 seam, which is what makes the pull-back and
  the dive-back-in read as one unbroken motion instead of two separate moves. The box's own real
  materials (`glassBox.root` — base/glass panels/glow sphere) fade out starting the instant
  `createShatter()`'s (`glassbox2.js`) own ~32 small glass-tinted fragment planes (sampled across the
  box's own real 4 wall faces) spawn and start flying outward + tumbling + fading — but on its own
  COMPRESSED clock, `spiralBoxFadeBlend` (0.5): each real material's own opacity AT the phase-1→2
  handoff is captured (`spiralFadeTargets`, not assumed to be 1 — glass is already translucent at
  rest) as the fade's start value, then `boxFadeProgress = min(progress / spiralBoxFadeBlend, 1)` and
  `opacity = startOpacity * (1 - boxFadeProgress)` every frame — the box is fully gone HALFWAY through
  the dive, well before the shards themselves finish flying/fading at progress 1. Not meant to read as
  physically "realistic": simplicity over cinematic accuracy, by explicit request throughout.

  **Went through a real back-and-forth to land here — worth knowing the history if this gets touched
  again.** Originally faded across the WHOLE dive (progress 0→1, no separate blend) — reported as
  reading like unrelated random glass debris, not the box actually smashing open: the intact box
  lingered, half-faded, visibly overlapping its own already-flying shatter fragments for the entire 3s
  dive. Fixed by cutting the box's materials to opacity 0 INSTANTLY instead, right before
  `createShatter()` is even called — confirmed as a real improvement ("good job"). Walked back on
  further explicit request anyway: an instant hard cut read as an abrupt pop rather than a graceful
  dissolve, and a direct follow-up clarified the actual bar wasn't photorealism at all — just that the
  box start fading the instant the shards start animating, and be completely gone by the time the
  whole animation ends. Landed back on the whole-dive fade at that point (the earlier "random glass
  debris" complaint turned out not to rule this out, just to mean the box has to actually finish
  disappearing). Tightened once more, by further explicit request, to the current halfway-point
  version — `spiralBoxFadeBlend` is the one number that moved between that version and this one.
  **Real bug, found and fixed building this:** landing `spiralPhase` back on `0` at the very end
  flips the render loop's own `lookAt`-vs-`controls.update()` branch back to "normal" for that same
  frame, before main.js's continuation has actually disposed the terrarium — and `controls.update()`
  immediately snaps the camera's distance from target back OUT to `controls.minDistance` (0.7), since
  the dive deliberately lands well inside that. Landing on `3` ("done," not "idle") instead fixes it:
  every other check already treats "anything but 0/1/2" the same way "idle" would be treated wrong
  here, so nothing needs the ordinary orbit controls back — this terrarium instance is being torn down
  right after regardless. Unlike every other camera move in that file (all fire-and-forget
  `CustomEvent`s), `enterOrb()` is a directly-called method returning a Promise — main.js genuinely
  needs to know when both phases are done, not just fire something off, because it gates the actual
  terrarium disposal on it: too early and the dive/shatter visibly cuts short; too late and the next
  screen sits waiting on an animation nobody can see any more.

**Only once all three finish** does the hard teardown run — `disposeTerrarium()`, removing every
home-page-only element (`optionsBox.el`/`hoverTitle`/`hoverDesc`/`radioBox.el`), `mountDictionary()`
— so disposal never visibly cuts anything short, and dictionary mode never mounts underneath
still-animating boxes. `hideHoverTitle()` happens at the very START of `leaveHomeIntoOrb()`, before any
of the three exits even begin — clearing whatever was actually hovering right before this sequence's
own "entering the terrarium" caption (just below) takes over, not leaving the idle branding glowing
through a multi-second cinematic transition. `radioAudio` is NOT paused here (unlike an earlier
version) — see this file's own "Persistent radio engine" section; audio now plays straight through
this whole transition and every screen beyond it, by explicit request.

**The "entering the terrarium" caption types up the instant the click happens, and disappears the
instant the spiral turns back in — not tied to the ordinary idle-hover machinery at all.**
`ENTERING_VIEWER_TAGLINE` ("now entering duality terrarium.") reuses the same `hoverTitle`/`hoverDesc`
elements/typewriter select-mode's own idle branding already uses ("The home page" section's own hover-
title writeup, above) — it used to only ever surface INDIRECTLY, via `scheduleIdleHoverTitle`'s
ordinary 2000ms idle-hover delay firing off whichever mouseout happened to reach `optionsBox.content`
during the spiral; that read fine by accident but had no real relationship to the animation's own
timing. `leaveHomeIntoOrb()` now drives both ends explicitly instead: `showHoverTitle('',
ENTERING_VIEWER_TAGLINE)` the moment it's called (before any of the three concurrent exits even start),
and `enterOrb`'s own new `onDiveStart` callback (`terrarium.js`) — fired once, right at the
spiralPhase 1→2 handoff, i.e. the instant the spiral actually turns back in toward the orb, NOT at
`enterOrb`'s own much later Promise resolution (phase 2 fully landed) — calls `hideHoverTitle()` right
then. Same mechanism now covers both entry points into this transition (`transitionToDictionary` AND
`transitionToFlashcardSession`, both routing through this one `leaveHomeIntoOrb()`), so a genki/minna
lesson click gets the identical caption timing dictionary's own click always got.

The old indirect path is explicitly locked out for this whole window, not just superseded by it — the
`optionsBox.content` mouseover/mouseout handlers both gained a `!enteringViewer` guard alongside their
existing `inSelectModeTree`/`!hoverLocked` checks: without it, a mouseout reaching that element while
the box visibly collapses underneath the cursor (`optionsBox.closeAndFade()`, likely, not an edge
case) could re-trigger the ordinary idle-branding machinery and pop the caption back up again AFTER
`onDiveStart` already hid it for good.

**Dictionary now opens on a genuinely empty search box, not a pre-loaded 海.** `#kanji-search-input`
used to carry `value="海"`, auto-loaded via `loadChar(searchInput.value)` unconditionally at the end
of `mountDictionary()` — both removed; that call is now guarded on the input actually having a value.
Same "empty search = empty state everywhere" convention `syncSearchField` already established for
clearing the field back to empty (search box's own CLAUDE.md section, above) — this is just that
same starting state applying on load too, not a second implementation of it.

**`#search-panel`'s own content now plays the same closed→glow→bump-open entrance every stage
transition elsewhere in this app already uses**, instead of just appearing fully formed. Its real
content markup is built into a `searchContentHtml` string (same content as before, just no longer
inlined directly into a `setContent()` call), then `searchBox.show()` (BEFORE regenerate — that
function assumes an already-visible box, same reason `spawnFrom`'s own callers always `show()`
first) followed by `await searchBox.regenerate({ html: searchContentHtml })`. Works here specifically
because the box's content is genuinely empty beforehand (nothing had ever called `setContent` on it
before this), so `regenerate()`'s own Phase 1 collapse is a real no-op (0 → 0) — the visible sequence
really is just "closed, flash, bump open to this." `mountDictionary()` had to become `async` for this
— every DOM reference right after (`searchInput`, `searchDisplay`, ...) reads from `#search-panel`'s
own content, which `regenerate()` only actually inserts partway through its own Phase 2, not
synchronously the way the old `setContent()` did; awaiting it first was a real bug caught while
building this, not a style preference. Safe to make async: nothing anywhere currently awaits
`mountDictionary()` itself (the 'dictionary' click, `#back-to-home-btn`'s own round trip, and the
`?view=dictionary` bootstrap all already fire it without awaiting).

## Structure

- `src/data/loadKanji.js` — `loadKanjiBundle(char)` fetches one bundle per character
  (`/data/<codepoint>.json`, from `data-pipeline/export/build_bundle.py`). `loadComponentIndex()`
  fetches the reverse index once, cached module-level (`/data/_index.json`, ~586KB, from
  `build_component_index.py`). Both gitignored, generated, cover the full 6,703-character set.
- `src/viewer/theme.js` — every visually-tunable constant (colors, material definitions, camera
  framing, light rig, motion speeds, stroke dimensions), as plain values with **zero THREE.js
  imports** — editable without knowing Three.js's API. `scene.js` and `kanjiRenderer.js` import
  from here instead of hardcoding values inline. The one exception left in `kanjiRenderer.js`:
  KanjiVG's 109×109 `VIEWBOX_SIZE` — a data fact, not a visual tuning knob, so it stays there.
  `GLASS`/`ENV_MAP` here are the 3D glass-material constants ported from `glassbox2.js` — see "The
  moss box glass-UI system" above for how this differs from the *2D* UI system in `style.css`.
  `BLOOM`/`CANVAS_BLUR_PX` are the 3D counterpart of the 2D boxes' own glow/blur — see `scene.js`'s
  post-processing composer below. Tuned down hard from a first pass: `UnrealBloomPass` at any
  moderately "reasonable"-sounding strength/threshold blew the whole near-white kanji out into an
  unreadable glowing blob rather than a soft edge sheen, because the ink color is already near-1.0
  luminance under this rig's lighting — most of the character's own surface crosses any threshold
  below ~0.9. Landed on `strength: 0.04, radius: 0.32, threshold: 0.95` (extreme-sounding numbers,
  but that's what a *subtle* effect requires against an already-bright base render) — retune by
  screenshotting after each change, not by guessing from the numbers alone. `CANVAS_BLUR_PX` (the
  canvas's own CSS blur, separate from bloom) similarly isn't the 2D boxes' 0.25px
  `--content-glow-blur` value — that number works there because it's paired with a text-stroke and
  multi-layer text-shadow doing most of the visible work; blur alone at that size on a plain canvas
  was confirmed imperceptible by A/B toggling it live, and 0.8px was the smallest value that
  actually read as different.

  `COLORS.highlightUseful` is `0xceffda` — the EXACT jade `style.css`'s own 2D glow already uses
  (`.info-character`/`.related-kanji`/etc.'s `rgba(206,255,218,…)` text-shadow stacks), matched
  verbatim rather than re-derived, so the 3D hover reads as the same "house" color as the boxes'
  glow instead of an unrelated green. Was a self-invented neon `0x39ffc4` before this correction.
  `MATERIALS.hoverUseful` deliberately does NOT fill the hovered part with this color, though — its
  own `color` stays `COLORS.ink` (the same neutral grey `normal`/`glass` use), only `emissive` picks
  up the jade tint, at a low `emissiveIntensity` (0.22) tuned to read as "barely above unselected,"
  not a colored highlight — a flat, filled green fill (`opacity: 0.55`) was tried first and replaced
  by request; the actual glow effect this project wants lives in `EDGE_GLOW` (the wireframe outline)
  instead of this fill material. `MATERIALS.pinned` is a separate, unrelated white (`0xffffff`,
  `emissiveIntensity: 2.4`) — see its own paragraph below for why pin escalates to white rather than
  a brighter jade. Separately: `GLASS.roughness` (glassbox2.js's original 0.08 — close to
  mirror-smooth) was throwing a sharp specular glint off the light rig + envMap at certain viewing
  angles, which the bloom pass then amplified into a visible "sparkle" — fixed at the material level
  (roughness bumped to 0.4, softening the reflection itself) rather than only trying to blur it away
  after the fact, though `BLOOM.radius` was also widened a little (0.2→0.32) so anything that still
  crosses threshold spreads into a softer patch instead of a hard point.

  `MATERIALS.pinned` is deliberately NOT tinted jade, unlike `hoverUseful` — jade means "hovering,
  previewing"; an actual pin (the left info box coming up) escalates to bright white instead, so the
  two states read as genuinely different things (preview vs. "this is the one you picked"), not two
  shades of the same highlight. The *other*, non-picked part of the character is untouched (`glass`,
  same as always). Getting the white to actually look "extra" glowing next to the default (also-white)
  ink took more than a high `emissiveIntensity` — at the same low opacity every other glass state
  uses (`glass`/`hoverUseful` both sit well under 0.2, per their own current values above), a strong
  emissive barely read as different from plain unpinned ink in a direct comparison screenshot, because
  the glass construction's own translucency was diluting how much of that light actually reached the
  eye. Fixed by raising `pinned`'s own opacity to 0.92
  (denser than its siblings, though still not fully opaque — the hollow-glass-box look stays intact)
  alongside `emissiveIntensity: 2.4`; verified by screenshotting the identical region unpinned vs.
  pinned side by side, not by trusting the numbers alone.
- `src/viewer/kanjiRenderer.js` — turns a bundle into a `THREE.Group`. KanjiVG strokes are
  centerlines, not fillable shapes, so each is sampled at even arc-length intervals
  (`svg-path-properties`) and built as a flat ribbon (offset left/right of the centerline,
  extruded with a bevel) — reads as an actual brush stroke, not a wire. One child group per bundle
  region, `userData: {node_id, element, position, role, gloss, useful}` on both the group and its
  meshes. `gloss` is the English meaning from KANJIDIC2, resolved in `build_bundle.py`.

  **Real, confirmed, dataset-wide rendering bug — fixed, full history worth knowing before touching
  `computeOffsetEdges` again.** Found via 台 ("pedestal") rendering with an obviously broken
  厶-stroke — a jagged spike instead of a clean hooked diagonal, right next to its own 口-stroke
  (no sharp turns) rendering as a clean parallelogram, same character, same load. Root cause: a
  CONSTANT-width offset (`computeOffsetEdges`) self-intersects wherever the centerline's own local
  turn radius is smaller than `STROKE.halfWidth` (2.2, in the 109-unit KanjiVG viewBox) — the same
  reason a thick pen stroked around a sharp corner overlaps itself on the inside of the turn. 台's
  own 厶-stroke has a genuine ~1.14-unit-radius hook (KanjiVG type `㇜`, a diagonal that hooks
  sharply back on itself) — well under 2.2 — confirmed by re-running the real
  `samplePathPoints`/`computeOffsetEdges`/`buildOutlineShape` pipeline against 台's own stroke data
  in Node and checking the resulting edges for genuine segment-segment self-intersection (not a
  curvature-radius heuristic, which over-counts harmless turns on the convex/outer side): a real
  self-intersecting loop, area ≈2.3 sq. units, spanning exactly the third of that stroke's four
  Bezier sub-commands (`c-3.45,3.77,-3.13,4.67,1.5,3.48`, the physical hook, 41–49% along the
  stroke). A self-intersecting 2D `THREE.Shape` fed into `ExtrudeGeometry` triangulates into
  genuinely garbled, non-manifold geometry at exactly that region — why it visibly looks broken,
  not a shading/material issue.

  **Confirmed dataset-wide, not a one-off — the hypothesis this was somehow caused by the (much
  later) load-in swoop/generation feature was investigated and disproven directly:** the real mesh
  is built by `buildKanjiGroup`→`strokeToMesh`→this exact function, called synchronously to
  completion in `main.js`'s `loadChar` BEFORE any swoop/animation code runs at all — and the
  identical call already existed, predating the swoop entirely, in the dormant pre-swoop
  `mountFlashcardSession` review-queue code (`animateEntrance: false`, zero swoop). Re-running the
  real self-intersection test against every stroke in every shipped bundle
  (`public/data/*.json`) found 8,630 of 79,921 strokes (10.8%) with a genuine self-intersecting
  offset edge, across 4,570 of 6,703 characters (68.2%) — including 21 of this app's own 24
  hand-picked `#search-examples` characters (魑/魘 worse than 台's own break), tested constantly all
  week before 台 was ever loaded, just never noticed on a complex character where one warped stroke
  among many is easy to miss. Severity varied hugely — bucketing by loop area, 65% were
  sub-0.2-sq.-unit numerical hairs at ordinary corners (likely invisible, smoothed further by the
  extrude's own bevel), only ~2% (180 strokes) cleared area 4+. The worst offenders by far were a
  different, related case: Latin letters/digits/hiragana with a near-closed-loop stroke as part of
  their normal shape (O, Q, 0, あ, め, ぬ, は, ま...) — real characters in the shipped 6,703 (KanjiVG
  includes non-kanji glyphs for completeness, per root CLAUDE.md) even though none are surfaced in
  any curated UI list.

  **The fix — `resolveOffsetSelfIntersections`, called from inside `computeOffsetEdges` on both
  `leftEdge`/`rightEdge` before they're returned.** The standard technique real 2D vector-stroke
  engines (Skia, Cairo, FreeType) use for exactly this failure: miter/round/bevel joins (not
  implemented here, not needed) solve the OUTER/convex side of a sharp corner (filling a gap);
  this solves the complementary INNER/concave side (removing an overlap) by finding where the
  offset polyline crosses itself and collapsing the looped-back range of points down to the single
  crossing point, repeatedly, until none remain. Verified exhaustively: re-ran the real pipeline
  against all 79,921 strokes in the shipped dataset with the fix applied — 8,630/8,630 previously
  self-intersecting strokes resolved, zero remaining, `extrudeOutline` throws on nothing; all 24
  curated `#search-examples` characters confirmed clean; 台's own stroke outline area barely moves
  (443.30 → 440.99, -0.5%) — the fix removes exactly the tangle, nothing else. Confirmed live too,
  through the real swoop + generation pipeline (not just Node): 台 and 魑 both reload with a clean
  render and zero console errors (checked with a fresh timestamped marker either side of the load,
  to rule out stale browser console-buffer noise).

  **Real integration bug caught building this, not just theorized — worth knowing before changing
  this function's OUTPUT SHAPE again.** A first version of the fix REMOVED the looped-back points
  from the array (spliced them out) instead of collapsing them in place — mathematically
  equivalent, and it worked fine in an isolated Node test against 台's own stroke data, but broke
  for real the moment it was wired into the live app: `scene.js`'s `playStrokeGeneration` (the
  swoop's own "etch" stage) and `pipelineDemo.js`'s own Stage 2 (forward AND reverse) both index
  `leftEdge[i]`/`rightEdge[i]` assuming it's always the exact same length as, and positionally
  aligned with, `points[i]` — confirmed by actually loading 台 with the length-changing version
  live: a real `TypeError: Cannot read properties of undefined (reading 'x')` the instant the etch
  animation ran. The shipped fix collapses in place instead — same array length, same index
  alignment, every existing consumer works unmodified.

  **Deliberately does NOT handle the closed-loop-stroke case (Latin "O"/"Q", digits, hiragana loops
  like ぬ/め/あ) — a real, known limitation, not an oversight.** On "O" specifically, the fix still
  reports zero self-intersections afterward, but the resulting outline is genuinely WRONG (area
  balloons 1000 → 4587 sq. units — collapsing the "first" crossing on a curve that nearly closes on
  itself eats a huge, wrong chunk of the shape, not a small tangle). Real kanji strokes are never
  drawn as a single fully-closed loop (a closed shape like 口's box is always built from multiple
  separate strokes meeting, never one stroke tracing a circle), so this never bites real app
  content — but it's a genuinely different failure shape needing a genuinely different technique
  (e.g. detecting a near-closed centerline up front and handling it as its own case), not something
  this fix was ever meant to cover.

  **To revert, if this ever needs backing out:** delete the two `resolveOffsetSelfIntersections(...)`
  calls inside `computeOffsetEdges` and go back to returning the raw `{ leftEdge, rightEdge }` —
  `resolveOffsetSelfIntersections`/`findFirstSelfIntersection`/`segmentIntersection` can stay in the
  file unused (they have no other callers) or be deleted too. That's the entire rollback — nothing
  else in this file or its callers changes shape either way, specifically because the fix preserves
  array length/index alignment.
- `src/viewer/scene.js` — camera/lights/materials/hover raycasting/click-to-pin/drag-to-rotate.
  **Hover only ever drives the 3D material** (the moss-green/red glow that says "this is
  clickable") — it does **not** touch the info box at all anymore; only an actual click does, via
  the `onPin` callback (`mountScene(container, { onPin })`), which fires `onPin(userData, screenPos)`
  — `null` on unpin, and `screenPos` (from `projectGroupCenter`, the pinned group's world-space
  bounding-box center projected to on-screen pixels, correct regardless of current auto-spin/drag
  rotation) only on an actual new pin. That screen position is where `main.js` starts the box's
  spawn animation from. Clicking a region pins its highlight and info-panel content, so leaving the
  canvas (e.g. to click a related-kanji button in the sidebar) doesn't clear the selection.
  Click-vs-drag is distinguished by pointer movement between down/up (a real click has ~none); they
  share the same listeners without conflicting. `main.js`'s `loadChar` explicitly resets the
  displayed info panel on every load — `setKanjiGroup` clears the pin state internally but has no
  way to tell `main.js` the old panel content is now stale; a real bug the first time, found by
  testing the full pin-then-load-a-related-kanji flow, not by inspection.

  A useful (green) hover doesn't just snap to `hoverUsefulGlass` — it plays a short jump-cut
  flicker first (`HOVER_REVEAL` in theme.js, applied frame-by-frame by `applyHoverReveal`/`tick`),
  deliberately irregular (an overshoot flash, a cut to black, a partial flicker, another dip, THEN
  settling) rather than a smooth fade, so it reads as a signal jankily acquiring — a CRT/old-
  hardware power-on flicker, not a modern crossfade. `hoverRevealStart` (set the instant a new
  useful hover begins, read every frame, cleared once the sequence finishes) is the only state
  involved; leaving that hover for any reason — a different element, empty space, a pin — cancels
  it outright in `onPointerMove` rather than letting it keep animating a material nothing is using
  anymore. Noise (red) hover is untouched, stays instant. As with the caret's blink, real-time
  timing/feel here can't be verified through this session's own automated Browser-pane tooling
  (screenshots land wherever the tool round-trip happens to land relative to the ~260ms sequence,
  not at a chosen frame) — verified structurally instead (re-triggering rapidly across several
  elements, no stuck intermediate state, no console errors, correct settle every time) and left for
  the user's own actively-focused browser to judge the actual feel.

  An actual pin gets the identical treatment, one step further: `PIN_REVEAL` plays the same
  jump-cut "generating in" flicker (its own separate, slightly longer step sequence — scaled
  against `MATERIALS.pinned`'s own, much higher opacity/emissiveIntensity, so it needed its own
  numbers rather than reusing `HOVER_REVEAL`'s), and once THAT settles, `pinnedGlass` doesn't just
  sit static — `PIN_FLICKER` keeps a very small, irregular flicker running for as long as it stays
  pinned (gated on `pinnedGroup` in `tick()`), like a fluorescent tube's hum rather than a perfectly
  steady light. Same non-eased philosophy as everywhere else: a random opacity/emissive multiplier
  near 1 is rolled and HELD for a random short interval (70-260ms), then re-rolled — not a smooth
  sine "breathing" pulse, which would read as a calm, deliberate modern idle animation rather than
  something jankily still-alive. `applyGlowMultiplier`/`stepAt` in `scene.js` are the shared
  plumbing behind all three effects (hover reveal, pin reveal, pin flicker) — one place that turns
  "a step/multiplier" into an actual write to a glass pair's `opacity`/`emissiveIntensity`, rather
  than three near-identical copies of the same four lines. `pinRevealStart`/unset cleanly cancels
  either the reveal or the hum the instant something is unpinned (same "leaving cancels it outright"
  rule as the hover reveal) — verified the same way: pin/unpin/re-pin across different elements
  repeatedly, no stuck state, no console errors, correct settle every time.

  A pin escalates the pinned region to a translucent jade glow (`pinnedGlass` — a `{back, front}`
  glass-material pair, see `makeGlassPair`/"moss box" section above) and every *other* region of the
  same character to translucent "glass" (`glassGlass`) — meaningfully visible only on a category-2
  split (the other named half fades out), but the logic is unconditional: a category-1/3 character
  has exactly one region, so "every other region" is naturally empty and only the glow applies.
  Hovering a *different* region while one is pinned still previews that region's *material* (jade if
  useful, red if not) — it does not touch the info box, which stays showing the pin's content until
  the next actual click.

  Auto-spin (slow, y-axis) runs whenever nothing is being dragged; a drag ends by easing back to
  neutral rotation (shortest path — `rotation.y` is normalized to `(-π, π]` first, since it
  accumulates unbounded during auto-spin and lerping toward literal 0 would visibly unwind every
  past turn) before auto-spin resumes. A fresh character load resets rotation and this state
  immediately — see `setKanjiGroup`. Auto-spin itself never swings past edge-on (`rotation.y` stays
  within `(-π/2, π/2]`) — the instant it crosses +90° it snaps back by exactly 180° rather than
  continuing into the mirrored back half. That instant is edge-on (extruded strokes read as just a
  line from directly the side), so ±90° are visually identical and the snap is imperceptible; what
  you actually see is a continuous forward spin that never shows the character reversed.

  Camera sits at `z≈161`, elevated (`y=55`) with an explicit `lookAt(0,0,0)` for an above-eye-level
  angle rather than dead-on — for KanjiVG's 109×109 viewBox, centered on origin. Distance from
  origin (`sqrt(y²+z²)`) is kept roughly constant across angle tweaks so framing size doesn't shift
  — adjust both together, not just one. Don't shrink `z` without checking characters aren't cropped
  (a real bug, fixed once). Uses `ResizeObserver` on the container, not a `window resize` listener —
  the container's size can be unknown for a moment on first mount, and only `ResizeObserver`
  reliably re-fires once it's known (a `window resize` listener doesn't, and this was a real bug: a
  stuck NaN projection matrix from reading size before layout settled).

  Two-finger pinch resizes the character (`PINCH` in theme.js) — a plain uniform scale on
  `strokeGroup`, entirely independent of the camera/rotation above. Two input paths feed the same
  `pinchScale`/`lastPinchActivity` state: a trackpad pinch (neither Chrome nor Firefox expose a
  dedicated gesture event for this — both represent it as a `'wheel'` event with `ctrlKey: true`,
  the same signal an actual Ctrl+scroll from a physical mouse wheel produces; there's no reliable
  way to tell the two apart, a limitation every browser pinch-to-zoom implementation shares), and a
  real touchscreen two-finger gesture (tracked via the distance between the first two
  `touches`). `PINCH.sensitivity` is deliberately aggressive — confirmed by dispatching synthetic
  wheel events directly (this pane has no real trackpad/touch hardware to test against): a single
  simulated pinch reliably drove the scale to both its `min` and `max` clamp on its own, which is
  the actual ask ("huge and tiny with one pinch"), not an oversight. No pinch activity for
  `PINCH.idleMs` (4s) eases `pinchScale` back to 1 — confirmed by waiting past that window and
  screenshotting: it visibly grows/shrinks back and fully resettles at the original size. A fresh
  character load doesn't reset `pinchScale` to 1 — see the load-in swoop below, which deliberately
  does something louder than that.

  Every fresh character load plays a load-in swoop (`LOAD_SWOOP` in theme.js, driven by
  `swoopingIn`/`swoopStart` in `tick()`): the character starts at `PINCH.max` (huge — reuses that
  constant rather than a separate duplicated number, so the two can't silently drift out of sync)
  turned to `LOAD_SWOOP.startAngle` (90°, edge-on — "facing to the side"). Both `pinchScale` and
  `strokeGroup.rotation.y` are then driven off ONE shared timed progress value (elapsed time since
  `swoopStart`, divided by `LOAD_SWOOP.durationMs`) rather than each having its own independent
  per-tick ease — this is deliberate, not an arbitrary implementation choice: an earlier version
  gave scale and rotation the same exponential ease *rate* but let them run independently, and
  because rotation started much closer to its target (90°) than scale did (6x), rotation visually
  finished turning well before scale finished shrinking — two motions that merely happened to share
  a rate, not one choreographed motion. Sharing the same progress value instead guarantees they are
  always at the exact same fraction of "done" on every single frame, so they can only ever finish
  at the same instant. **The curve run through that shared progress value has changed twice since**
  — worth knowing the history if it comes up again: started as `easeOutCubic` (deliberately not the
  exponential "close the remaining distance by a fraction every frame" ease `PINCH.returnEase` uses
  elsewhere, since that shape is front-loaded and reads as uneven/AI-generated; also not
  `easeInOutCubic`, tried first, since its near-zero velocity at t=0 reads as a dead pause before
  the motion "kicks in"); then `easeOutQuint` for "slower and smoother"; then — by explicit
  request, since even the quint version still read as a weighted, decelerating glide ("looks super
  modern and ai") — the current, final answer: `linear` (scene.js), constant speed with NO easing
  at either end at all. `spinState === 'autoSpinning'`'s ordinary per-tick rotation increment is
  explicitly suppressed for the duration (`&& !swoopingIn`) so it doesn't fight the swoop's own
  rotation motion; auto-spin picks back up from exactly 0 the frame after `swoopingIn` clears. A
  real pinch gesture cancels the swoop immediately (`swoopingIn = false` in `bumpPinchScale`) —
  mid-swoop pinching takes over from wherever the swoop currently is rather than fighting it or
  waiting for it to finish.

  Rendering goes through a post-processing composer (`EffectComposer` → `RenderPass` →
  `UnrealBloomPass` → `OutputPass`), not a plain `renderer.render(scene, camera)` — the 3D
  equivalent of the 2D boxes' own glow/blur system, so the kanji reads as part of the same
  "y2k-ified" look instead of a plain crisp render sitting next to glowing UI. Works off luminance
  only, no per-material color tuning: the near-white `COLORS.ink` blooms white by default (the same
  family as the boxes' white tab-chrome glow) and the jade hover/pin materials bloom jade on their
  own, since bloom just amplifies whatever's already bright enough to cross `BLOOM.threshold` — see
  theme.js's own comment on those numbers for why they're tuned so much lower than they sound like
  they should be. `OutputPass` at the end isn't optional cosmetic polish — without it, colors coming
  out of the composer's intermediate render targets read visibly washed out compared to what
  `renderer.render()` used to produce directly. Resizing needs `composer.setSize(...)` alongside
  `renderer.setSize(...)` — the composer owns its own render targets, sized independently.
- `src/ui/mossBox.js` — the reusable glass-box component; see "The moss box glass-UI system" above.
- `src/terrarium/` — the home page's moss terrarium; see "The home page" above for the full story
  (what's ported verbatim vs. adapted vs. new, what's dormant, known gaps).
- `src/main.js` — `mountHome()`/`mountDictionary()`/`mountFlashcardSession()`, the app shell — see
  "The home page" above. Within dictionary mode: no top bar, character entry lives in `#search-panel`, a second
  `createMossBox()` instance floating on the *right* of the viewer — see "The search box" section
  above for its structure, the kanji-detection logic, and the real bugs that shaped it.

  Sidebar has two parts: `#structure-panel` (shown immediately on load — the whole character's
  gloss, its category, and for a two-part split, each part's gloss/position/role, plain docked
  HTML, not a moss box) and `#info-panel` (the click-to-pin related-kanji box, floating, hidden
  until a click pins something). On pin: sets topbar/bottombar chrome instantly
  (`setTitle`/`setKanji`/`setMarquee`), plays the box's spawn-from-click animation
  (`spawnFrom(screenPos.x, screenPos.y)`), then reveals the glyph/gloss/verdict/node lines
  (`revealLines`) and finally the related-kanji tile grid (`revealRelatedList`) — **no display
  cap**, the box's own `max-height` + internal scroll handles a component shared by 200+ kanji, all
  of it stays reachable, just requires scrolling (the actual scroll motion is `attachHeavyScroll()`,
  called automatically inside `createMossBox()` — see "moss box glass-UI system" above — not native
  1:1 wheel tracking, and the scrollbar itself is hidden via `scrollbar-width:none`/
  `::-webkit-scrollbar{display:none}` while staying scrollable). (An attempt to split this into a sticky
  glyph/gloss header with only the tile grid scrolling was tried and reverted — every version of it
  either broke the box's glass consistency or added complexity that wasn't worth what it bought;
  the current shipped state is one continuous scrolling block.) Hovering a related-kanji tile
  pulses it in sync with the topbar's corner glyph (see `syncPulseDelay` above) — delegated via
  `mouseover`/`mouseout` on `infoBox.content` (not `mouseenter`/`mouseleave`, which don't bubble),
  alongside the existing click-through delegation on the same element. **The click-through is the
  actual mechanic the whole project exists for** — see root CLAUDE.md Concept before touching it.

## The 3D viewer's pin system — "detach zoom" (EXPERIMENTAL)

`src/viewer/scene.js`'s pointerup handler + `theme.js`'s `DETACH_ZOOM`, marked `EXPERIMENTAL` in
both files' own comments — a from-scratch UI idea being tried, not a finished feature; may get
ripped back out if it doesn't feel right, per the explicit "we'll put everything back if this
doesn't work" framing it was built under. Only ever applies to an exactly-two-part-split character
(the ~78% category — see root CLAUDE.md's classification section); an atomic/irregular character
(one region, nothing to grey out) still gets the plain pin behavior below, untouched.

**What it does, on top of the existing pin behavior** (click a part → it goes bright white
`pinnedGlass`, every other part goes dim grey `glassGlass` — unchanged): the OTHER (grey) part now
also grows from exactly where it already sits up to `DETACH_ZOOM.targetScale` (same magnitude as
`PINCH.max`), over `DETACH_ZOOM.durationMs` at constant speed (`linear`, scene.js — see
`LOAD_SWOOP`'s own history in "The home page" section above for why this isn't an eased curve, and
why both durations have been bumped more than once — "read as an actual massive structure, not
just not-instant" was the last ask), while the pinned (white) part stays completely still —
normal size, normal position, for the whole sequence. It also grows a glowing "blueprint" wireframe
outline along its own real edges/corners — see "Edge glow," further down — that the load-in swoop's
own grey skin deliberately does NOT get (`showEdgeGlow`, `setGroupMaterial`'s own opt-in param).

Un-pinning (click the pinned part again, or empty space) eases the grey part back down the same
way, materials snapping back instantly (an accepted, deliberate split — see that branch's own
comment). **Re-pinning the OTHER part (clicking directly on the currently-grey/blueprint side) is a
SWAP, not an instant snap** — by explicit request, nothing changes materials-wise the instant you
click: the grey part just keeps easing back down to normal size (reversing whatever it was
mid-way through), and ONLY once it's genuinely back at scale 1 does the actual pin swap happen —
materials flip, and the NEWLY-grey part (the old pinned one) starts its own fresh grow-in.
`pendingSwap` (scene.js) is what queues this and `applyPinVisuals` (extracted so both the immediate
fresh-pin path and this deferred path share one implementation) is what actually applies it, from
inside `tick()`'s own detach-finished branch — never from the click handler directly for this case.

**Edge glow** — `EDGE_GLOW` (theme.js) + `getOrCreateEdgeGlow`/`edgeGlowCache` (scene.js): a glowing
wireframe outline (`THREE.EdgesGeometry`, real silhouette/crease edges only, not a full triangle
mesh) traced along whatever's actually wearing the detach-zoomed grey skin — "like the blueprints of
the structure." Reuses the same jade `COLORS.highlightUseful`/`EDGE_GLOW.color` pulled verbatim from
the 2D UI's own glow (style.css's `rgba(206,255,218,…)`), pushed past 1.0 brightness
(`EDGE_GLOW.brightness`) since a plain `LineBasicMaterial` is unlit and has no `emissiveIntensity` to
lean on the way the fill materials do — that's what gets it to reliably cross `BLOOM.threshold` on
its own. Gated by `showEdgeGlow` specifically so it shows on the pin's detach-zoomed sibling but NOT
during the character's own load-in swoop (which also uses `glassGlass` — same grey fill, no outline).

**Three real mechanics this needed, none of which existed before:**
- **A pivot to scale around** — naively scaling a node-group grows it around the KANJI's own
  shared origin (0,0,0 in `kanjiRenderer.js`'s coordinate space), which visibly drifts an
  off-center part sideways as it grows (its geometry sits OFFSET from that origin) — reads as
  "flying apart," not "growing in place," which was explicitly rejected ("no awkward split apart").
  `getOrComputeDetachPivot` computes each group's own local bounding-box center once (WeakMap
  cache, same lifecycle as `shellCache`) and `tick()`'s detach block scales around THAT instead —
  standard scale-around-an-arbitrary-pivot algebra: `position = basePosition + baseCenter * (1 -
  scale)`.
- **Guaranteed paint order, not just Z-position** — every glass material here has
  `depthWrite: false` (`makeGlassPair`, for the existing hollow-glass-box look), so nothing in
  this app's glass system ever actually occludes anything else via the depth buffer; once the grey
  part balloons up and visually overlaps the frozen white one, plain DRAW ORDER decides which is
  visible on top. `setGroupMaterial` gives whatever's using `pinnedGlass` a `renderOrder` tier (12)
  strictly above every other glass state's shared tier (2) — this, not anything spatial, is what
  actually delivers "stays in its spot over the top of."
- **Never touching rotation** — the detach-zoom block in `tick()` only ever mutates
  `detachGroup.position`/`.scale`, never `strokeGroup.rotation` or `spinState` — auto-spin/drag
  keep running exactly as normal the whole time this plays (explicit ask); since the animated
  group nests inside `strokeGroup` like every other part, it still inherits the whole character's
  rotation/pinch-scale for free on top of its own extra local transform. **A real, confirmed bug
  was found and fixed getting this actually true**, pre-existing in `pointerup` itself, not
  introduced by detach-zoom: `spinState = 'returning'` (the "snap back to face-forward" state) used
  to run UNCONDITIONALLY at the top of every `pointerup`, before the drag-vs-click check even ran —
  meaning a plain CLICK (pinning/swapping a part) also reset rotation every time, "hopping" the
  character back to neutral mid-spin the instant anything was clicked. Fixed by moving that reset
  inside the `moved > MOTION.clickMoveThreshold` branch specifically — only a REAL click-and-drag
  resets rotation now; clicking a part, from any point in its spin, never touches it. **That fix
  itself introduced a second real bug, since fixed**: `pointerdown` unconditionally sets
  `spinState = 'dragging'` on every press (it can't yet know whether it'll turn into a real drag or
  just a click), and the ONLY place that used to transition back out of `'dragging'` was the
  drag branch's own `spinState = 'returning'` — which the fix above now skips entirely for a plain
  click. Net effect: a plain click left `spinState` stuck at `'dragging'` forever, and `tick()`'s
  rotation logic has no branch at all for that state, so rotation just froze completely until an
  actual drag came along and moved spinState out of it again ("had to drag to wake it up" — exactly
  what was reported). Fixed by explicitly setting `spinState = 'autoSpinning'` (not `'returning'` —
  nothing actually moved during a plain click, so there's no rotation to ease back from) right at
  the top of the click-handling path, the instant a `pointerup` is confirmed NOT to have been a drag.

Not yet covered/tuned: `DETACH_ZOOM.targetScale`/`durationMs`/`EDGE_GLOW`'s own numbers are
first-guess values, not measured against a real render — retune directly in `theme.js` if the
size/speed/glow strength feels off. No interaction yet with `PIN_FLICKER`'s ongoing hum or
hover-on-the-grey-part (still flashes `hoverUsefulGlass` green mid-zoom, unchanged, untested against
this — including what that does to a swap queued via `pendingSwap` if it happens mid-reverse; not
handled, not yet reported as an issue either).

### Closing dictionary with a kanji still up — `exitLoadedKanji()` (`scene.js`)

`#back-to-home-btn`'s click handler (`main.js`) used to just tear `#viewer-container` down outright —
whatever the model was doing, pinned/detach-zoomed or not, it simply vanished the instant the DOM was
removed. Explicit request, framed around "two possible states": if you've already backed the search
field out to empty (`currentChar === null`), there's no model to animate at all and nothing changes
here. But if a character is STILL loaded when "close dictionary" is clicked, it should visibly leave —
"just like the box itself is doing" (`closeAndFade`, above in "The moss box glass-UI system") — not
just cut.

**Two real steps, strictly SEQUENTIAL** (`exitLoadedKanji`, right after `unpin()` in `scene.js`):
1. If a part is currently mid-zoom/holding at `DETACH_ZOOM`'s own scale (`detachGroup !== null`),
   ease it back down to normal size FIRST — the exact same `startDetachZoom(...,1)` tween
   `unpin()`/`pinGroup`'s own swap branch already use, just AWAITED this time. `detachZoomBackResolve`
   is the one genuinely new piece of state this needed: every other caller of `startDetachZoom` fires
   it and forgets, so `tick()`'s own "fully shrunk back" branch (the same one that already resolves a
   queued `pendingSwap`) now also checks for and calls this, a no-op for those other callers since
   they never set it.
2. Once genuinely back to normal size (or immediately, if nothing was mid-zoom to begin with), play
   `EXIT_REVEAL` (`theme.js`) — a NEW two-phase material sequence, deliberately simpler than
   `LOAD_REVEAL`'s own three (blueprint/gray/glow): `glow-out` (ONLY if something was actually pinned
   — `pinnedGlass` flickers DOWN via its own `glowSteps`, the SAME jump-cut "generating in" philosophy
   `HOVER_REVEAL`/`PIN_REVEAL`/`LOAD_REVEAL` already established, just walked toward 0 instead of
   toward 1; skipped entirely for a plain never-pinned load — nothing glowing to flicker down from),
   then `fade` (every group — pinned-white, its grey sibling, or plain `normalMaterial` if nothing was
   ever pinned — lands on the same neutral `glassGlass` the instant this phase starts, no edge-glow
   outline brought back for it, then its opacity ramps smoothly, linearly, to 0 across the rest of the
   duration — deliberately NOT another jump-cut flicker; the flicker personality is what phase 1
   already spent, this is the actual disappearance and reads as a clean dissolve). `durationMs`
   (1000ms) is a deliberate match to `closeAndFade`'s own rough total length (≈1.1-1.2s, since the two
   run concurrently and are meant to finish around the same moment) — same reasoning `LOAD_REVEAL`'s
   own duration was matched to the flashcard box's timing, not a re-tuned number picked in isolation.

`pinnedGroup`/`pinnedNodeId` are deliberately left untouched through all of this — no `unpin()` call —
since the entire dictionary-mode DOM this state belongs to is torn down the moment the returned
promise resolves (`main.js`'s `mountHome()`), so there's no stale UI left for it to mislead. What DOES
need to stand down is `tick()`'s own ambient `PIN_FLICKER` hum (`applyPinFlicker`, gated on
`pinnedGroup` being set) — left running, it would keep mutating the SAME shared `pinnedGlass` material
every frame right alongside `EXIT_REVEAL`'s own `glow-out` phase, fighting over the same opacity/
emissive values. That gate is extended to also check `exitRevealStart === null` rather than touching
`pinnedGroup` itself. `groupIsInteractive` is set `false` for the whole sequence too (nothing should
still respond to hover/click while it's leaving), same gate `loadCharWithLoading`'s own swoop-lock
already uses (see "Loading a new character" above), just applied here for the exit instead of the
entrance.

`main.js`'s own call site: a THIRD promise added to the `Promise.all` alongside `infoBox`/`searchBox`'s
own `closeAndFade()` calls (guarded on `currentChar === null` the same way those two are guarded on
`.is-hidden`) — all three run CONCURRENTLY, not sequenced, specifically so the kanji's own exit reads
as part of the SAME moment the box is closing, not a separate beat before or after it.

**Also related, elsewhere in this same box — the 3D bleed-through glow, its own small history of
iteration** (style.css, `--content-bleed-blur/-brightness/-saturate` in `:root`, all marked
EXPERIMENTAL): `.info-character`'s own glyph sits directly over the fully-transparent
`.nora-moss-content` with nothing solid behind it, so it visibly picks up a green cast whenever the
detach-zoomed structure's bright edge-glow lines pass underneath. That reactive glow ended up on
`.related-kanji` ONLY (every tile, both boxes — it already carried its own `--itab-*` glass
backdrop-filter as its baseline "resting" look; swapped to `--content-bleed-*` instead of adding a
second declaration), each with its own dedicated `--content-bleed-*` recipe rather than the shared
`--itab-*` tier (bumping that directly would also hit the topbar/bottombar tabs and everything else
using it). THREE things were tried and reverted getting here, all worth knowing if this comes up
again: a STATIC halo (`.kanji-token.is-selected`'s own recipe — brighter fill + permanent
box-shadow, always on) on every tile was "too much"; the bleed-through applied to the WHOLE
`.nora-moss-content` container (not just individual elements) also read as "too much," since it
amplified the entire box's background too, not just the UI sitting in it; and applying the SAME
per-element backdrop-filter to `.info-character`/`.info-subtitle`/`.related-title` (block-level
text lines, not tiles) produced an "obvious box" artifact — backdrop-filter fills an element's
whole RECTANGULAR box, not the glyph's actual shape, so a plain text line lit up as a glowing
rectangle sitting behind it rather than a glow ON the character. `.related-kanji` doesn't have this
problem because it's already an intentional square glass tile (fixed 36×36, `border-radius`,
`overflow:hidden`) — a filtered rect is correct there, not an artifact; the same treatment just
doesn't work on plain text and was pulled back off it. Since `.related-kanji` is reused verbatim by
both boxes (the right box's `.kanji-token` carries the same class), one shared rule is what makes
the glow apply to both without any box-specific selectors.

### Pipeline-visualization dev tool — `viewer/pipelineDemo.js`

A hidden dev backdoor on welcome (`#dev-skip-to-pipeline`, commented out in `welcomeHtml()` the same
way `#dev-skip-to-dictionary`/`#dev-skip-to-flashcards` already are — one-line uncomment to bring
back), wired to `enterPipelineDemo()` in `main.js`. Genuinely separate from the real app — not
Dictionary, not Flashcards, no relation to `scene.js`'s interactive viewer at all, per explicit
request. The whole point: `kanjiRenderer.js`'s real sample→offset→stitch→extrude pipeline runs once,
straight through, in under a millisecond — there's nothing to actually *watch* in the live app. This
tool re-plays the exact same math, one real stroke at a time, staged out over real time so each step
is genuinely visible.

**`kanjiRenderer.js` was refactored to expose each stage individually** —
`samplePathPoints`/`computeOffsetEdges`/`buildOutlineShape`/`extrudeOutline`, all now exported, with
`strokeToMesh` just composing them in sequence (identical output, zero behavior change) — specifically
so this demo animates the REAL production math stage-by-stage, not a re-derived approximation of it.

**A small picker, not a fixed single character** (`mountPipelineDemoScreen` in `main.js`, one button
per `PIPELINE_DEMO_CHARACTERS` entry in `pipelineDemoData.js`) — started as one fixed character (海),
extended to a real choice by explicit request. Deliberately still a small fixed set, not a live
search — same "simplest to tune and test" reasoning the original single-character version had, just
covering more ground:
- **海** ("sea") — the original pick, still first/default. A genuine two-part split, both roles
  present (氵=meaning, 毎=sound), 9 strokes, already this project's own running example throughout
  its docs.
- **鬱** ("gloom") — 29 strokes, genuinely ONE region: KanjiVG names real sub-elements deep inside it
  (缶/木/木/冖/鬯/彡...), but this project's own classifier calls it irregular regardless (no clean
  two-part split at the top level, the only level that counts) — the single most complex common
  example this app's own dataset has, shown honestly as one whole-character region, not a fake split
  invented for the demo.
- **闇** ("dark") — 17 strokes, a real two-part split shaped differently from 海's left/right: 門
  wraps 音 (`kamae`, an enclosure), not a side-by-side pair.
- **霧** ("fog") — 19 strokes, a real two-part split again, this time top/bottom (雨 over 務) —
  already a familiar name in this app (track 4's own title in `RADIO_PLAYLIST`, `main.js`).

**Every character's stroke order was hand-extracted from its own raw `kanjivg-source/kanji/
<codepoint>.svg` directly, not read off the shipped `apps/web/public/data/<codepoint>.json`
bundle** — a real, confirmed discovery: `build_bundle.py`'s export step drops each stroke's own
`kvg:sN` id/number entirely (only the path's `d` survives), and separately, its own tree-flattening
order does NOT reliably match true numeric stroke order (confirmed directly on 海's own bundle — its
毎-group order has its s4/s5 pair reversed relative to the source). `pipelineDemoData.js`'s own order
for all four characters is verified against each source file's own embedded `<g
id="kvg:StrokeNumbers_...">` layer — the literal numbered labels KanjiVG draws for humans — not just
assumed from element order. Worth knowing if a fifth demo character, or anything else needing
genuine writing order, ever gets built on top of the shipped bundle format instead: that order isn't
there to read.

**Per stroke, three stages play in sequence** (never the next stroke until this one fully finishes —
explicit request, real writing order, not "all strokes at once"):
1. **Draw the raw centerline** — a `THREE.Line` built straight from `samplePathPoints`' own real
   output, revealed progressively via `setDrawRange` (constant speed, not eased — see below).
2. **Etch the offset outline** — two more lines (the real `leftEdge`/`rightEdge` from
   `computeOffsetEdges`) with their OWN vertex positions lerped every frame from the centerline's
   points out to the real offset positions, then a flat, unextruded `ShapeGeometry` (from
   `buildOutlineShape`'s own outline) fades in once both edges land — "the outline etching itself
   outward from the centerline."
3. **Grow real Z depth** — the flat mesh is swapped for the real `extrudeOutline()` geometry with
   `scale.z` starting near 0, grown to 1.

Every tween in all three stages is constant-speed (`animateValue`'s own linear progress, no easing
curve) — the same reasoning as every other timed animation in this app (`theme.js`'s
`LOAD_SWOOP`/`DETACH_ZOOM` comments): an eased deceleration reads as a modern UI transition here,
flat constant speed reads as a deliberate, heavy process. The "actively being demonstrated" color is
`COLORS.highlightUseful` — the same jade this whole app already uses for anything mid-interaction,
not a new debug color invented for this tool. A finished stroke swaps to the real `normalMaterial`
tint and just sits there while later strokes play through their own three stages on top of it.

**The whole character spins continuously from the very first frame** (`strokeGroup.rotation.y`,
`renderTick`), not just once finished — reworked from an earlier version where Stage 3 instead
orbited the CAMERA to a scripted edge-on stop for the extrude, held there, then orbited back:
explicit correction, that read as hitting pre-determined rotation points rather than a genuinely
continuous spin. Depth growing in is still clearly visible as the ongoing spin naturally carries
each stroke edge-on-ish and back on its own, never a scripted stop-and-reverse — the camera itself
now just sits at the real viewer's own resting position/framing the whole time.

**Real bugs, found and fixed live in this session:**
- An earlier version of Stage 3's camera-orbit computed its ring radius as
  `hypot(CAMERA.position[1], CAMERA.position[2])` (height + depth) instead of
  `hypot(CAMERA.position[0], CAMERA.position[2])` (the actual horizontal/XZ-plane distance an
  orbit-at-fixed-height needs) — caught by watching the demo actually play (the character rendered
  oddly small/off-scale). Moot now that the camera no longer orbits at all, but the same
  "XZ-plane distance, not height+depth" mistake is worth not repeating if camera-orbit choreography
  ever comes back here.
- **Switching characters mid-animation could leave a stray mesh behind from whichever stage the
  PREVIOUS character was still mid-flight through.** `playCharacter(id)` bumps a `generation` counter
  and clears `strokeGroup` immediately, and `playStroke` checks that counter BETWEEN its three stage
  calls — but a stage that was already inside its own `await animateValue(...)` at the moment of the
  switch would still run its OWN final mutations (adding/finishing a mesh) unconditionally, since
  nothing inside the stage itself was checking — confirmed live (switching to 鬱 mid-stroke left a
  finished 海 stroke sitting in the otherwise-empty new scene). Fixed by threading `myGeneration`
  into `playStage1`/`playStage2`/`playStage3` themselves: each one re-checks immediately after its
  own last `await`, and — if stale — removes and disposes whatever IT just built and returns `null`
  instead of the real object; `playStroke` treats a `null` return as "stop here entirely," not
  "stale, but let the next stage run anyway." Verified after the fix by both an ordinary
  mid-animation switch and a rapid-fire switch through all four characters in quick succession —
  clean either way, no leftover geometry, no console errors.

**Teardown, deliberately NOT `leaveHomeIntoOrb`'s own cinematic exit:** `enterPipelineDemo()` does
the SAME real cleanup that function does (`disposeTerrarium()`, remove `optionsBox.el`/`hoverTitle`/
`hoverDesc`/`radioBox.el`, `unsyncRadioUI()`) but instantly, no spiral/shatter choreography — this is
a hidden dev backdoor a real user should never see, not a real navigation moment worth animating.
`mountPipelineDemoScreen()`'s own `[dev] back to welcome` button calls the demo's own `dispose()`
then plain `mountHome()` — the same fresh welcome-first-paint every cold load already starts from,
not a special "return from dev tool" path.

**A second playback mode, `#pipeline-demo-mode`'s own toggle row — "one stroke at a time" (default)
vs. "all strokes at once"** — added alongside the original, not replacing it (`playCharacter`'s own
`mode` argument in `pipelineDemo.js`: `'sequential'` vs `'simultaneous'`). `'simultaneous'`
(`playAllAtOnce`) reuses the EXACT same `playStage1`/`playStage2`/`playStage3` functions
`'sequential'` (`playSequence`) already does — never a second, re-derived pipeline — just fires all
of a character's strokes through each stage together via `Promise.all` instead of one at a time:
every stroke draws its centerline together, THEN every stroke etches its outline together, THEN
every stroke extrudes together — reading as "the whole character forming at once," not each stroke
independently running its own three-stage clock in parallel. No `STROKE_GAP_MS` in this mode — there
is no "next stroke" to leave a gap before. `mountPipelineDemoScreen()` tracks the current character
id and mode as plain variables (each row needs to know the OTHER row's current choice — picking a
new character plays it in whichever mode is already active; toggling mode replays whichever
character is already showing) rather than reading either back off the other row's own `.is-active`
DOM state. Verified live: simultaneous mode draws/etches/fills every stroke of a character in visible
lock-step, and switching characters mid-play while in simultaneous mode correctly carries the mode
over to the new character with no leftover geometry (the same `generation`-guard mechanics just
above cover `playAllAtOnce` too — its own two `Promise.all` calls are guarded the same way
`playSequence`'s per-stroke loop is).

**A third toggle, `#pipeline-demo-entrance`'s own row — "starts at rest" (default) vs. "spaceship
swoop-in"** — controls how the character ENTERS, orthogonal to both the character choice and the
stroke-build mode above (`playCharacter`'s own `entrance` argument: `'normal'` vs `'swoop'`).
`'swoop'` (`playSwoopEntrance`) plays the EXACT real load-in swoop dictionary mode already plays on
every fresh character — same numbers, not re-tuned for this tool: `theme.js`'s own `PINCH.max` (6x)
as the oversized starting scale, `LOAD_SWOOP.startAngle` (-90°) as the starting rotation, both
easing to normal via `LOAD_SWOOP.durationMs` (4600ms) of `linear` progress. Runs CONCURRENTLY with
whichever stroke-build mode is also selected (fired, not awaited, from `playCharacter` alongside
`playSequence`/`playAllAtOnce`) — the character generates itself WHILE it's still swooping into
frame, same as a real ship still under construction as it arrives, not a separate "swoop first, then
build" sequence.

The continuous spin (`renderTick`) has to stand down for the whole swoop window — a `swooping` flag,
same reasoning `scene.js`'s own real `swoopingIn` guard already established (fighting over the same
`rotation.y` every frame reads as a stutter, not two motions blending); auto-spin picks back up from
wherever the swoop actually lands (0°, matching the real viewer's own handoff) the instant it clears.

Unlike the stage functions above (which only ever need to check `generation` once, right after their
own last `await`, since they only ever mutate `strokeGroup.children`), `playSwoopEntrance` checks its
own `myGeneration` INSIDE the per-frame callback itself, every single frame for the full 4.6 seconds —
it's driving `strokeGroup`'s own `scale`/`rotation` directly, and a stale swoop left unchecked
mid-frame would fight a fresh one (switching characters, or the entrance toggle itself, while an old
swoop is still running) for those exact same properties for as long as both kept executing. Verified
live via a temporary debug hook (`window._pipelineDemoDebug`, removed after — same tuning-only
convention `terrarium.js`'s own debug exports already established): confirmed the swoop starts at the
real `scale:6`/`rotation:-π/2`, correctly settles to `scale:1`/`rotation:0` after the real duration,
and switching characters twice in rapid succession WHILE mid-swoop still lands cleanly on the second
character's own settled state with no fighting between the two swoops.

**`SPIN_SPEED` now reuses `theme.js`'s own `MOTION.autoSpinSpeed` directly, not a separate local
number** — it was hardcoded to `0.004` for a while even though the comment right above it already
claimed parity with the real viewer's own idle spin; the literal value had quietly drifted ~20%
slower than `MOTION.autoSpinSpeed`'s actual `0.005`. Went unnoticed until sleep mode (below) put this
tool's spin and the real viewer's spin side by side in the same session and the gap became visible.
Fixed at the source (import `MOTION`, `const SPIN_SPEED = MOTION.autoSpinSpeed`) rather than just
correcting the number, so the two can't drift apart again.

**`mountPipelineDemo`'s own new `spinSpeedMultiplier` option (default 1) scales `SPIN_SPEED` in
`renderTick` without touching the shared constant itself** — sleep mode (below) passes 2, explicit
request, to spin visibly faster than the real production idle rate; the dev tool's own picker (its
call site omits the option entirely) keeps matching the real viewer exactly, same as `SPIN_SPEED`'s
own fix just above intended. A multiplier on top of the shared constant, not a second local speed
value, so the dev tool and the real viewer can't drift apart from each other even though sleep mode
now deliberately runs faster than both.

### Sleep mode / screensaver — welcome's `sleep` button, `enterSleepMode`/`exitSleepMode` (`main.js`)

A real, user-facing feature — not a dev tool — taking `#dev-skip-to-pipeline`'s old visible spot in
`welcomeHtml()`'s button list (that dev backdoor is now hidden the same way
`#dev-skip-to-dictionary`/`#dev-skip-to-flashcards` already are, one-line uncomment to bring back).
The idea, across a few rounds of iteration: an old-school screensaver, reusing this same file's real
stroke-generation loop as the visual — 鬱 rebuilding itself, stroke by stroke, forever — inside a box
that drifts and bounces off the screen edges like the classic bouncing-DVD-logo screensaver, explicit
request/confirmation.

**Two ways in, one function:** clicking welcome's `sleep` button and 60 seconds of total inactivity
anywhere in the app (`SLEEP_IDLE_MS`, tracked by a single module-scope idle timer reset on any
`mousemove`/`mousedown`/`keydown`/`touchstart`/`wheel`) both call the exact same `enterSleepMode()` —
deliberately no separate "manual" vs. "auto-triggered" code path, since the two are meant to look and
behave identically. **Zero transition in either direction, by explicit correction** — an earlier
version of this idea played the terrarium's own shatter/spiral exit animation on the way in; reversed
once the user clarified sleep should "just come straight up... like it would for inactivity," and
waking should bring you "straight back" with no transition either.

**Implemented as a plain overlay pasted over the screen, not a mount-tree state** — the user's own
suggestion, confirmed: `enterSleepMode()` builds `#sleep-overlay` (full-viewport, `#07090b` to match
the app's own background) and appends it straight to `<body>`, a sibling of `#app`, never touching
whatever `mountHome`/`mountDictionary`/etc. currently has mounted underneath. This is exactly what
makes the "no transition" requirement free: since sleep never tears down or replaces anything, there
is nothing to animate into or out of — entering is one `appendChild`, waking is one `.remove()`.
`onUserActivity` (the same listener set that resets the idle timer while awake) calls `exitSleepMode`
the instant it fires while `sleepState` is set, and only that — the input that woke it is never
otherwise acted on, so a wake-click can't also land on whatever's underneath.

**The drifting box (`#sleep-drift-box`, 360px fixed) is real bouncing-DVD-logo physics** — constant
velocity, hard reflection off each edge the instant it's hit, no easing into the bounce — running on
its own `requestAnimationFrame` loop (`driftTick`) entirely independent of whatever build stage the
generation loop is currently mid-way through; the two were never meant to be coupled, same as
`renderTick`'s own spin and `playCharacter`'s own build sequence already aren't coupled in the base
tool above. It hosts a real `mountPipelineDemo(box)` instance — same mount function the dev tool
above uses, not a second copy.

**The loop builds, then fully de-renders in reverse, then moves to the next character — cycling
through `SLEEP_CHARACTERS` (module scope, `main.js`) forever**, `stopped` (`exitSleepMode`) is what
actually cuts it off. Started as just 鬱 (explicit follow-up request: "make it depression for now
tho, constant loop, form, reverse to nothing, form again forever") — extended, by further explicit
request, to a full 25-character cycle: `SLEEP_CHARACTERS = ['鬱', ...DICTIONARY_TRY_EXAMPLES.reverse()]`
— 鬱 first (kept as this list's own leader, not a special case handled separately from it anymore),
then every one of Dictionary mode's own "or try one of these" starter kanji (`DICTIONARY_TRY_EXAMPLES`,
hoisted to module scope specifically so both this list and `searchExamplesTiles`, further down, share
ONE real array instead of two hardcoded copies), reversed.

**Every character here, 鬱 included, is played the SAME way now — its real stroke geometry fetched
live via `loadKanjiBundle`, the SAME real per-character bundle Dictionary mode already uses, flattened
to one array via `bundle.groups.flatMap((g) => g.strokes)`** — NOT `pipelineDemoData.js`'s own small,
hand-verified `PIPELINE_DEMO_CHARACTERS` set (the dev tool's own picker still uses that set,
unaffected). Explicit, deliberate trade-off ("doesn't have to be robust... doesn't need to be
robust with the actual try one of these list"): this bundle-derived stroke order was NEVER
hand-cross-checked against each character's own real KanjiVG `kvg:StrokeNumbers` layer the way
`pipelineDemoData.js`'s own header comment requires for its 4 characters — genuinely acceptable here
specifically because this is a passive screensaver no one is meant to scrutinize stroke-by-stroke, not
a claim that the order is actually correct. `playCharacter` (`pipelineDemo.js`) was generalized to
accept this: its first argument, `idOrStrokes`, is either a real id string (existing dev-tool
behavior, looked up in `PIPELINE_DEMO_CHARACTERS` as before) OR a raw stroke array handed straight in
with no lookup at all — `Array.isArray(idOrStrokes) ? { strokes: idOrStrokes } : PIPELINE_DEMO_CHARACTERS.find(...)`.
`main.js`'s own `loop()` wraps each `loadKanjiBundle` fetch in a try/catch — a failed fetch just skips
that one character (`continue`) rather than breaking the whole infinite loop.

This needed two further changes to `pipelineDemo.js` itself, from before either of the above existed:
- `playCharacter` now `return`s the promise its own `playSequence`/`playAllAtOnce` resolves on
  (previously fired-and-forgotten) — every existing caller (the toggle rows above) still just calls
  it without awaiting anything, so this changes nothing for them, but it's what lets the sleep loop
  know when one full build has actually finished before reversing it.
- A new `playCharacterReverse()`, also exposed off `mountPipelineDemo`'s own return value, genuinely
  UNDOES each of the same three stages the forward build just played — not a fade-out standing in for
  "reverse." Every stroke that finishes building gets recorded, in order, as `{ mesh, strokeData }`
  in a `builtStrokes` array (cleared at the start of every `playCharacter` call, alongside
  `strokeGroup` itself); `playCharacterReverse` walks that array BACKWARD — last-drawn stroke first —
  and for each one runs `unplayStage3`/`unplayStage2`/`unplayStage1`, each a mirror of its forward
  counterpart with the interpolation direction flipped (shrink the real extruded depth back to ~0,
  fade the flat fill back out, un-etch the offset edges back onto the centerline, then un-draw the
  centerline itself via `setDrawRange` shrinking to 0) rather than a separately-invented undo
  animation. Recomputes `points`/`leftEdge`/`rightEdge`/`outline` fresh from the stroke's own `d`
  instead of threading the forward pass's intermediate arrays all the way through to a later,
  independent reverse call — cheap, and deterministic (same real math, same input, same output every
  time), so there's no risk of the reverse drifting from what was actually built. Tracking real
  `{ mesh, strokeData }` pairs as they land (rather than re-deriving "which stroke is which mesh" from
  `strokeGroup.children` after the fact) is what keeps this robust even in the edge case where a
  stroke's own path data fails to parse and gets silently skipped — `builtStrokes` only ever contains
  strokes that actually finished, so the reverse can't get out of sync with what's really on screen.
  Both `playCharacterReverse` and its own `unplayStage*` helpers use the SAME `generation` counter the
  forward stages already check — it operates on the CURRENT generation rather than bumping a new one
  (this is a continuation of one character's own build→un-build lifecycle, not a fresh character being
  loaded), so switching characters or toggling mode/entrance mid-reverse still correctly invalidates
  it exactly the same way an interrupted forward build already does.

**No radio UI, and no click targets of any kind, inside the overlay, both on purpose:**
`RADIO_PLAYLIST`/`radioAudio` (this doc's own "Persistent radio engine" section) is already a
module-scope engine that survives regardless of what's mounted, so "let the radio keep playing"
needed zero extra code here. And since ANY input anywhere on the overlay has to wake it, a real
pause/skip control would be self-contradictory — the whole surface is intentionally inert, styling
only (`cursor: none` — there is nothing on this screen for a cursor to point at).

**Every finished stroke wears the real "blueprint" skin permanently — the SAME look scene.js's own
detach-zoomed sibling wears in the real interactive viewer when a component is deselected** (a dim,
neutral-grey hollow fill plus a bright wireframe outline traced along the mesh's own real edges —
"detach zoom" above has the full spec for that original feature) — never the dev tool's own solid,
opaque-white finished-stroke look. `playCharacter`'s 4th argument, `blueprint` (default `false`, so
every EXISTING caller — the dev tool's own toggle rows — is unaffected), threads down through
`playSequence`/`playAllAtOnce`/`playStroke` to `playStage3` (`pipelineDemo.js`), and separately
through `playCharacterReverse`/`unplayStroke` to `unplayStage3` for the reverse (de-render) half of
the loop.

**Went through a real, confirmed misfire before landing here — worth knowing if "still white" ever
gets reported again for anything in this file.** The FIRST version of this feature just skipped
`playStage3`'s own `mesh.material = doneMaterial` hand-off, leaving `activeFillMaterial`'s clone (a
lit `MeshStandardMaterial`, jade-tinted) on the mesh instead — reported directly as still rendering
in full white, and confirmed live (Browser-pane screenshot, zoomed via a CSS `transform: scale()` on
the canvas — WebGL canvases don't reliably survive `drawImage`/`getImageData` pixel sampling without
`preserveDrawingBuffer`, so a real screenshot is what actually confirms this, not a pixel readback):
this scene's own light rig (`LIGHTS` in theme.js — the key light alone is intensity 3.5) blows ANY
lit fill color out to visually pure white once combined channel values clip past 1.0, regardless of
the material's own base hue — jade and white both wash out identically under this rig. Fixed with two
new, genuinely unlit materials (`blueprintFillMaterial` — `MeshBasicMaterial`, `COLORS.ink` at 0.12
opacity, matching scene.js's own `MATERIALS.glass` verbatim; `blueprintEdgeMaterial` — `LineBasicMaterial`
using `EDGE_GLOW`'s own color/brightness/opacity, ported the same way `getOrCreateEdgeGlow`, scene.js,
builds one) — unlit materials render their own exact base color always, immune to the light rig,
which is what an accurate "blueprint" needs. A real `THREE.EdgesGeometry`-based `LineSegments` (same
technique as `getOrCreateEdgeGlow`) is added as a CHILD of the finished mesh in `playStage3`'s own
blueprint branch, not a separate parallel object to track — inherits the mesh's transform for free.
This file has no bloom/post-processing pass (unlike scene.js's own real viewer), so `EDGE_GLOW`'s own
"pushed past 1.0" trick doesn't produce a soft glow halo here the way it does there — it still reads
as a crisp, fully-saturated bright line against the dim fill, just without the halo.

Always CLONED wherever `blueprintFillMaterial` is applied (never assigned directly) — same reasoning
`activeFillMaterial` itself already follows: `unplayStage3`'s own reverse fades a flat mesh's opacity
per-instance, and a shared, un-cloned material would leave the NEXT stroke's blueprint fill
permanently stuck at whatever opacity the last reverse faded it to. `blueprintEdgeMaterial` is the
opposite — genuinely safe to share as ONE instance, since nothing here ever animates its own
opacity/color per-instance (same reasoning `activeLineMaterial` is already shared, unlike
`activeFillMaterial`).

**A real, caught disposal gap, fixed alongside this:** every cleanup site in this file used to do a
plain `mesh.geometry.dispose()` — catching only the mesh's OWN geometry, never a blueprint mesh's own
`EdgesGeometry` child, silently leaking one every time a blueprint stroke got torn down (the
generation-cycling clear in `playCharacter`, and `unplayStage3`'s own removal of the fully-shrunk
extruded mesh, are the two spots that actually see a blueprint mesh). Fixed with a small
`disposeStrokeObject(obj)` helper (recurses into `obj.children`, disposing every geometry it finds,
deliberately leaving materials alone — matching this file's own pre-existing convention of never
disposing materials anywhere, most of which are shared singletons that must never be disposed) used
at both of those call sites instead of the old one-line geometry dispose.

`main.js`'s sleep loop passes `true` to BOTH `playCharacter` and `playCharacterReverse` — explicit
request: a screensaver should read as perpetually mid-construction, never "done," and the reverse
half of the loop needs the SAME skin or it would flash the ordinary lit fill for the brief window a
stroke is flattened back down before fading out during de-render.

## Commands

```bash
npm install
npm run dev
```
