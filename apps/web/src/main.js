import './style.css'
import { mountScene } from './viewer/scene.js'
import { buildKanjiGroup } from './viewer/kanjiRenderer.js'
import { mountPipelineDemo } from './viewer/pipelineDemo.js'
import { loadKanjiBundle, loadComponentIndex } from './data/loadKanji.js'
import { createMossBox, syncPulseDelay, createTypewriter } from './ui/mossBox.js'
import { mountTerrarium } from './terrarium/terrarium.js'
import genkiKanji from './data/genki/genkiKanji.json'
// minnaKanji is deliberately a THINNER shape than genkiKanji — just `{kanji}` per entry, no
// gloss/on/kun/examples. Flashcards only ever reads `.kanji` from either deck's own entries
// (mountDictionary's own lessonEntries.map — the character/gloss/readings shown per kanji all come
// live from loadKanjiBundle/KANJIDIC2, same source real Dictionary mode uses, same reason
// genkiKanji.json's own gloss/on/kun fields are already "vestigial," apps/web/CLAUDE.md's own
// "Flashcards" section) — so there was nothing to hand-curate here beyond the kanji lists
// themselves. Sourced from en-nihongo.com's own per-unit kanji lists (Vol. I:
// https://en-nihongo.com/japanesetips/kanji/kanji-list-for-minna-no-nihongo/, Vol. II:
// https://en-nihongo.com/japanesetips/kanji/kanji-list-for-minna-no-nihongo-2/), a third-party
// compilation, not the official 3A Corporation textbook itself — cross-checked before trusting it:
// the two volumes' own character counts (243 + 293) sum to exactly 536, matching the combined
// total independently reported elsewhere, not just internally consistent with itself. Units 21-23
// (Vol. I) have no kanji at all (review lessons) and are genuinely absent from this file, not
// present-with-an-empty-array — see minnaLessonsHtml's own comment for why that distinction matters.
import minnaKanji from './data/minna/minnaKanji.json'
// src/srs/ (sm2.js/store.js/queue.js) is NOT used by the Genki flow below — see
// mountFlashcardSession's own header comment for why (Genki lessons are stateless by design; SM-2 is
// parked for a future custom-decks feature instead). Nothing imported from there on purpose.

const app = document.querySelector('#app')

// ═══════════════════════════════════════════════════════════════════════════════
// APP SHELL — one page, no router. Two real screens, home and dictionary, switched by replacing
// #app's content outright rather than hiding/showing both at once. See root CLAUDE.md phasing /
// apps/web/CLAUDE.md for why this file used to boot straight into the classification test tool with
// no home screen at all — that's what mountDictionary below actually is, just no longer the
// automatic entry point. "Flashcards" is Dictionary itself now, scoped to a lesson's own kanji
// (mountDictionary's own header comment, apps/web/CLAUDE.md's "Flashcards" section) — not a third
// screen; mountFlashcardSession (the old review-queue implementation) still exists, fully defined,
// just unreferenced from any live UI path.
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// HOME — the terrarium (mountTerrarium, src/terrarium/) plus ONE moss box that carries the user
// through every stage of entering the app: welcome (enter the terrarium / about) → select mode
// (dictionary/flashcards). It's the same #options-panel instance throughout — each stage just
// setContent()s different markup into it (renderWelcome/renderModeSelect below) rather than
// swapping boxes, since choreographing ONE box changing shape is the actual point of this pass.
// This is a fully static app, on purpose — no accounts, nothing saved (root CLAUDE.md phasing):
// there used to be a dummy login/signup step here (DUMMY_LOGIN, a real login system was always a
// later phase, never started), removed entirely per explicit request rather than kept as another
// inert placeholder — "enter the terrarium" now goes straight to select mode with no gate at all.
// Content is still static within each stage for now (no expand/collapse or camera-sweep
// choreography yet) — that's the next pass, once this state machine itself is confirmed working.
// ─────────────────────────────────────────────────────────────────────────────

// The options box's own scroll cap, for any stage whose content can run long (currently just the
// genki lesson lists — genki 2's 11 lessons is the case this was actually built for). Content past
// this scrolls via .nora-moss-content's own overflow:auto and the weighted hand-scroll every box
// already has (attachHeavyScroll, mossBox.js) — passing this to regenerate() is the only piece that
// was actually missing; see its own maxContentHeight comment.
//
// 520 was the original real measurement, back when a .mode-option row was 64px tall (14px vertical
// padding + a 19px margin .mode-option-label was quietly inheriting from .related-title) — landing
// on ~6 full rows visible plus part of a 7th peeking through, the "there's more, scroll" affordance.
// Both that padding and that margin were cut to a shorter, uniform height (style.css's
// .mode-option/.mode-option-label — originally matched to the login/signup forms' own input height,
// back when those still existed), so a row is now ~37px, not 64px. 320 below is a proportional
// recalculation from that old 6-rows-plus-a-peek target (37×6 + 10×5 gaps ≈ 272, plus a scaled-down
// peek of a 7th ≈ 320) — NOT re-measured against a real render (this sandbox's own DOM-measurement
// tooling is reliable for settled state, but no dev server was spun up for this pass — see this
// project's dev-server convention). If genki 2's list shows noticeably more or less than "~6 rows
// plus a peek" in a real browser, this number is the one to retune, not the row CSS above.
const OPTIONS_LIST_MAX_HEIGHT = 320

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENT RADIO ENGINE — module-level singleton, created ONCE for the app's entire lifetime.
// Deliberately the FIRST exception to this file's own "nothing survives a mountHome() teardown"
// rule (root CLAUDE.md phasing, this file's own "Hard architectural boundary") — explicit request:
// since this is a one-page app, there's no real reason music has to stop unless something actually
// pauses it. Scoped as narrowly as possible: only the playback ENGINE lives here (the `Audio`
// object, the playlist, which track is loaded) — the visual `radioBox` player chrome is still built
// fresh every single `mountHome()` call, same as everything else on the home screen; it just paints
// itself from this singleton's CURRENT state instead of always resetting to track 0 (see
// `mountHome`'s own `radioBox`/`syncAllRadioUI` section, below, for that half).
//
// Why this causes literally zero audible interruption: `radioAudio` has never been attached to the
// DOM at all — nothing anywhere does `someElement.appendChild(radioAudio)`. A detached
// `HTMLAudioElement` plays fine with no visual presence, so keeping THIS object alive while
// completely unrelated DOM (the box chrome) gets destroyed and rebuilt elsewhere on the page has no
// path to touching playback — no pause, no reload, no click, ever, as a SIDE EFFECT of navigation.
// The old code's `radioAudio.pause()` calls (on leaving home for Dictionary/a lesson, and on
// select-mode's own 'exit') were solving a DIFFERENT problem specific to the old architecture — a
// fresh `new Audio()` was created every `mountHome()` call, so the OLD instance had to be explicitly
// silenced or it would have kept playing forever with nothing left in JS able to control it. With
// only one `Audio()` for the app's whole lifetime now, that problem doesn't exist to solve — those
// pause calls are removed outright at their own call sites, not replaced with anything.
//
// Explicit request, confirmed: audio survives Dictionary, every lesson screen, AND a trip all the
// way back out to welcome — it only ever stops when something genuinely calls `.pause()` (the
// player's own play/pause button), never as a byproduct of what's currently mounted on top of it.
//
// `artist` is kept on each entry even though the player doesn't display it — real metadata, cheap to
// surface later without re-touching this data. 絆/霧/縁/池 added by explicit request; 絆/霧/縁 arrived
// as `.aif` (Chrome/Firefox/Edge can't play AIFF at all — `canPlayType('audio/aiff')` returns `''`,
// confirmed live, only Safari decodes it) and were converted to mp3 (`ffmpeg -codec:a libmp3lame
// -b:a 192k`, matching this playlist's existing bitrate) with the `.aif` originals deleted; 池
// arrived as mp3 already. `スプレー`→`適`, `天上界`→`霧`, `黙示録`→`縁` renamed by later explicit
// request (filename AND title both, matching this playlist's "filename IS the title IS the display
// kanji" convention). Every track has its own dedicated cover art (`cover-<kanji>.jpg`, six images
// supplied together, assignment arbitrary by explicit request).
// `duration` (seconds) added by explicit request — the track-picker list shows each track's own
// static length, Apple-Music-style, which needs to be known BEFORE that track is ever loaded (the
// live `radioAudio.duration` this box already used elsewhere only becomes available once a track's
// metadata has actually loaded). Real, measured values (`ffprobe -show_entries format=duration`),
// not estimates — hand-typed here since re-deriving them from a live audio element for a list that's
// closed most of the time isn't worth the extra complexity.
// Titles renamed by explicit request — src/cover/artist/duration are all UNCHANGED, still keyed to
// the original filenames (滝/適/絆/霧/縁/池) on disk; only the displayed `title` string per entry
// was swapped, in the same order, for these six new words.
const RADIO_PLAYLIST = [
  { src: '/audio/滝.mp3', title: '深淵', artist: '93levi', cover: '/audio/cover-滝.jpg', duration: 246 },
  { src: '/audio/適.mp3', title: '哀愁', artist: '93levi', cover: '/audio/cover-適.jpg', duration: 110.9 },
  { src: '/audio/絆.mp3', title: '未練', artist: '93levi', cover: '/audio/cover-絆.jpg', duration: 138 },
  { src: '/audio/霧.mp3', title: '煉獄', artist: '93levi', cover: '/audio/cover-霧.jpg', duration: 156 },
  { src: '/audio/縁.mp3', title: '幽玄', artist: '93levi', cover: '/audio/cover-縁.jpg', duration: 147.2 },
  { src: '/audio/池.mp3', title: '靉靆', artist: '93levi', cover: '/audio/cover-池.jpg', duration: 138.1 },
]
let radioTrackIndex = 0
const radioAudio = new Audio()
radioAudio.volume = 0.8

function radioFmtTime(s) {
  if (!isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

// Pure engine action — no DOM reads/writes at all, so it's safe to call from anywhere (module
// scope, any mount, the 'ended' auto-advance below) whether or not a radioBox currently exists to
// show it. Whatever UI IS mounted right now hears about the result via radioAudio's own
// 'loadedmetadata'/'play'/'pause'/etc. events (wired per-mount, inside mountHome) — same principle
// as a real hardware radio not caring whether anyone's looking at its display.
function loadRadioTrackAudio(index) {
  radioTrackIndex = index
  radioAudio.src = RADIO_PLAYLIST[index].src
  radioAudio.load()
}
// Preloads track 0's metadata at module init (safe with no user gesture — only `.play()` needs one,
// not `.load()`) so the very first paint of the radio box already has a real cover/title/duration
// ready, instead of a blank flash before anyone's clicked anything.
loadRadioTrackAudio(0)
// Auto-advance on end, same as spotify-store's own player — unchanged behavior, now living at
// module scope since it has to keep working even while no radioBox/mountHome instance exists to
// have defined it locally (mid-Dictionary, mid-lesson, etc.).
radioAudio.addEventListener('ended', () => {
  loadRadioTrackAudio((radioTrackIndex + 1) % RADIO_PLAYLIST.length)
  radioAudio.play()
})
// ═══════════════════════════════════════════════════════════════════════════════

// The dictionary's own "or try one of these" starter-tile list (searchExamplesTiles, mountDictionary,
// further down) — hoisted up here as a real shared array, not a second hardcoded copy, so sleep
// mode's own SLEEP_CHARACTERS (just below) can reuse it directly. Same order dictionary mode shows
// on screen (common → obscure, apps/web/CLAUDE.md's own "picks" history).
const DICTIONARY_TRY_EXAMPLES = [
  '闇', '魂', '翼', '縁', '滝', '嵐', '鯨', '艦', '瞳', '雫', '鱗', '焚',
  '暈', '霰', '蠍', '朧', '灘', '靄', '鯱', '蜻', '榊', '鵺', '魑', '靉',
]

// ─────────────────────────────────────────────────────────────────────────────
// SLEEP MODE — a real screensaver, not a dev tool: reuses viewer/pipelineDemo.js's own
// generation-loop pipeline verbatim (same reasoning as scene.js's real production swoop reusing it
// — never a second, re-derived copy) inside a small box that drifts and bounces off the viewport
// edges at constant velocity — the old bouncing-DVD-logo screensaver, explicit request/confirmation.
// Cycles through SLEEP_CHARACTERS (just below) forever, one full build-in / reverse-out per
// character (playCharacterReverse, pipelineDemo.js — a genuine stroke-by-stroke rewind, not a
// fade-out) — 鬱 first ("starting with just one character," the original explicit request), then
// every one of the dictionary's own "try one of these" kanji, reversed, then back to 鬱 again.
//
// Deliberately module scope, same as radioAudio above, and for the same reason: it has to keep
// working no matter which real screen (welcome/select-mode/dictionary/a lesson) is currently
// mounted, since the whole point (explicit request) is that this is a PROPER screensaver — it
// auto-triggers after a fixed idle window regardless of what's on screen, not just from a welcome
// button. It's built as a plain overlay appended directly to <body> (a sibling of #app, never a
// child of it) rather than going through mountHome/mountDictionary/etc.'s own state machine — the
// user's own instinct, confirmed here: since sleep never tears down or touches whatever's
// underneath, entering and leaving it can be truly instant, no transition of any kind in either
// direction ("no transitions or anything, it just comes straight up... any move brings you straight
// back... like it's just being pasted over the screen") — there's nothing to choreograph, because
// nothing underneath ever actually changed.
//
// No radio UI lives in here on purpose — radioAudio (above) plays on completely untouched, sleep or
// not, so the music-keeps-going request needs zero extra code. And specifically no click/tap targets
// of any kind inside the overlay: "any move brings you back" means inputanywhere on it has to wake,
// so a pause/skip button would be self-contradictory — style, not something with a value to expose.
const SLEEP_IDLE_MS = 60000 // 1 minute, explicit request
// One combined, hardcoded list — the screensaver's own full cycle, in order: 鬱 first (explicit
// request — kept as this list's own leader, not a special case handled separately from it anymore),
// then DICTIONARY_TRY_EXAMPLES (above) reversed. Every character here, 鬱 included, is played the
// SAME way — its real stroke geometry fetched live off the SAME bundle Dictionary mode already uses
// (loop(), below) — explicit request, doesn't need to match pipelineDemoData.js's own hand-verified
// real writing order the way the dev tool's small PIPELINE_DEMO_CHARACTERS set does: "doesn't have
// to be robust," good enough for a passive screensaver, not worth hand-authoring 25 verified entries.
const SLEEP_CHARACTERS = ['鬱', ...[...DICTIONARY_TRY_EXAMPLES].reverse()]
const SLEEP_BOX_SIZE = 360 // px, the drifting box's own fixed footprint
const SLEEP_SPEED = 90 // px/second, constant — no easing, same "linear reads as deliberate,
// eased reads as modern/ai" reasoning as every other timed motion in this app (theme.js's own
// LOAD_SWOOP/DETACH_ZOOM comments)

let sleepState = null // null while awake; holds the live overlay/box/api/raf/loop while asleep
let idleTimer = null

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    if (!sleepState) enterSleepMode()
  }, SLEEP_IDLE_MS)
}

// Any real input anywhere in the document — while asleep this WAKES (and only wakes; the event
// that woke it is not otherwise acted on, so a wake-click can never also double as a click on
// whatever's underneath). While awake it just restarts the idle countdown.
function onUserActivity() {
  if (sleepState) {
    exitSleepMode()
    return
  }
  resetIdleTimer()
}
;['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach((evt) =>
  window.addEventListener(evt, onUserActivity, { passive: true }),
)
resetIdleTimer()

function enterSleepMode() {
  if (sleepState) return

  const overlay = document.createElement('div')
  overlay.id = 'sleep-overlay'
  const box = document.createElement('div')
  box.id = 'sleep-drift-box'
  box.style.width = `${SLEEP_BOX_SIZE}px`
  box.style.height = `${SLEEP_BOX_SIZE}px`
  overlay.appendChild(box)
  document.body.appendChild(overlay)

  // spinSpeedMultiplier: 2 — explicit request, spins visibly faster than the real production idle
  // rate (mountPipelineDemo's own comment on this option, pipelineDemo.js, has the full reasoning).
  const api = mountPipelineDemo(box, { spinSpeedMultiplier: 2 })

  // Drift physics — real constant-velocity, hard-reflection-off-edges, same as the genuine
  // bouncing-DVD-logo screensaver this was explicitly modeled on: a random starting direction, then
  // dx/dy just flip sign the instant any edge is hit, never eased into the bounce. Runs on its own
  // rAF loop, entirely independent of whatever generation stage playCharacter is currently mid-way
  // through inside `api` — the two were never meant to be coupled.
  let x = Math.random() * Math.max(1, window.innerWidth - SLEEP_BOX_SIZE)
  let y = Math.random() * Math.max(1, window.innerHeight - SLEEP_BOX_SIZE)
  const startAngle = Math.random() * Math.PI * 2
  let vx = Math.cos(startAngle) * SLEEP_SPEED
  let vy = Math.sin(startAngle) * SLEEP_SPEED
  let lastFrame = performance.now()
  let driftRaf = null

  function driftTick(now) {
    const dt = (now - lastFrame) / 1000
    lastFrame = now
    const maxX = Math.max(1, window.innerWidth - SLEEP_BOX_SIZE)
    const maxY = Math.max(1, window.innerHeight - SLEEP_BOX_SIZE)
    x += vx * dt
    y += vy * dt
    if (x < 0) { x = 0; vx = Math.abs(vx) }
    else if (x > maxX) { x = maxX; vx = -Math.abs(vx) }
    if (y < 0) { y = 0; vy = Math.abs(vy) }
    else if (y > maxY) { y = maxY; vy = -Math.abs(vy) }
    box.style.transform = `translate(${x}px, ${y}px)`
    driftRaf = requestAnimationFrame(driftTick)
  }
  driftRaf = requestAnimationFrame(driftTick)

  // The generation loop — cycles through SLEEP_CHARACTERS (module scope, above) forever: build,
  // fully de-render back to nothing (playCharacterReverse, pipelineDemo.js — a genuine
  // stroke-by-stroke rewind, not a fade-out), move to the next character, and loop back to the start
  // of the list once it runs out — until `stopped` (below) cuts it off. Every character's real
  // stroke geometry is fetched live via loadKanjiBundle — the SAME real per-character bundle
  // Dictionary mode already uses — flattened to one array via `groups.flatMap`, rather than requiring
  // each one to exist in pipelineDemoData.js's own small, hand-verified PIPELINE_DEMO_CHARACTERS set
  // (SLEEP_CHARACTERS's own comment has the full reasoning for why that's an acceptable trade-off
  // here specifically). A fetch failure just skips that one character rather than breaking the loop.
  let stopped = false
  async function loop() {
    while (!stopped) {
      for (const char of SLEEP_CHARACTERS) {
        if (stopped) return
        let strokes
        try {
          const bundle = await loadKanjiBundle(char)
          strokes = bundle.groups.flatMap((g) => g.strokes)
        } catch {
          continue // couldn't fetch/parse this one — move on rather than getting stuck
        }
        if (stopped) return
        // `true` (blueprint) — explicit request: every finished stroke wears the real "blueprint"
        // skin (a dim hollow fill + a glowing wireframe edge outline — the SAME look scene.js's own
        // detach-zoomed sibling wears in the real interactive viewer, apps/web/CLAUDE.md's "detach
        // zoom" section), never the dev tool's own ordinary solid-white finished-stroke look
        // (pipelineDemo.js's own `blueprintFillMaterial`/`blueprintEdgeMaterial` comment has the full
        // mechanics, including why a plain jade-tinted `MeshStandardMaterial` couldn't just stay
        // jade-colored under this scene's own light rig) — a screensaver should never look "done,"
        // just perpetually mid-construction. Passed to BOTH calls — `playCharacterReverse` needs to
        // know too, or its own reverse would flash the ordinary lit fill for the brief window a
        // stroke is flattened back down before fading out.
        await api.playCharacter(strokes, 'sequential', 'normal', true)
        if (stopped) return
        await api.playCharacterReverse(true)
      }
    }
  }
  loop()

  sleepState = {
    overlay,
    api,
    stop() {
      stopped = true
      if (driftRaf) cancelAnimationFrame(driftRaf)
    },
  }
}

function exitSleepMode() {
  if (!sleepState) return
  sleepState.stop()
  sleepState.api.dispose()
  sleepState.overlay.remove()
  sleepState = null
  resetIdleTimer()
}
// ─────────────────────────────────────────────────────────────────────────────

// `startAtSelectMode` — dictionary's own "close dictionary" button and a flashcard session's own exit
// (both further down this file) pass `true` here now, per explicit request: returning from either
// should land back in select mode, not all the way at welcome. See the first-paint block at the
// bottom of this function for what that actually changes.
function mountHome(startAtSelectMode = false) {
  app.classList.add('is-home')
  app.innerHTML = `<div id="terrarium-container"></div>`

  const terrariumContainer = document.querySelector('#terrarium-container')
  // startAtCloseUp (terrarium.js) — the SAME single automatic entrance tween every mount already
  // plays, just re-targeted straight to closeUpPos instead of birdsEyePos when returning directly to
  // select mode, so the terrarium's own camera actually matches what the box is about to show instead
  // of resting at the welcome-screen framing underneath select-mode content — see that option's own
  // comment in terrarium.js for why this re-targets the SAME tween rather than stacking a separate
  // close-up swoop on top of it.
  const { dispose: disposeTerrarium, enterOrb } = mountTerrarium(terrariumContainer, {
    startAtCloseUp: startAtSelectMode,
  })

  const optionsBox = createMossBox({ id: 'options-panel', position: 'left' })
  document.body.appendChild(optionsBox.el)

  // The center-screen hover title (style.css's .select-hover-title/-text — ported directly from
  // moss x kanji FINAL's .nora-brand-hover-title, same font/glow/position, renamed since "brand"
  // isn't a concept here). Only ever shown once select-mode is reached — inSelectModeTree below is
  // what gates that, toggled true/false by the render*() functions themselves, since welcome's own
  // buttons ("enter the terrarium", "about") explicitly should NOT get this treatment per the
  // original ask ("this won't affect until you're logged in" — still true in spirit even with login
  // itself gone: welcome is simply before select-mode). One element, reused across every
  // stage from select-mode down (dictionary/flashcards, genki 1/2, every lesson) rather than
  // rebuilt per stage, same reasoning as optionsBox itself being one persistent instance.
  //
  // The one-sentence description is a SEPARATE element (style.css's .select-hover-desc/-text) — not
  // stacked under the title anymore, moved to the top of the screen instead (top:80px, the same top
  // #options-panel itself sits at, so it lines up with the box's own top edge). Shown/hidden in
  // lockstep with the title (both toggled together below) but positioned independently, since "under
  // the title" and "aligned with the box's top edge" aren't the same place. Own createTypewriter
  // instance, same reasoning every independently-typed line in this app gets its own (createTypewriter's
  // own comment in mossBox.js) — a fresh instance per independent typed line. Not every option has a
  // description yet (genki 1/2 and individual lessons don't), so
  // showHoverTitle's own `description` argument is optional; omitting it just leaves that line empty.
  let inSelectModeTree = false
  const hoverTitle = document.createElement('div')
  hoverTitle.className = 'select-hover-title'
  // .select-hover-title-row lays the word and its own kanji out side by side (kanji on the right,
  // style.css) — the "Deferred mid-implementation" item from this file's own history, now wired up.
  hoverTitle.innerHTML =
    '<div class="select-hover-title-row"><span class="select-hover-title-text"></span><span class="select-hover-title-kanji"></span></div>'
  document.body.appendChild(hoverTitle)
  const hoverTitleText = hoverTitle.querySelector('.select-hover-title-text')
  const hoverTitleKanji = hoverTitle.querySelector('.select-hover-title-kanji')
  const hoverDesc = document.createElement('div')
  hoverDesc.className = 'select-hover-desc'
  hoverDesc.innerHTML = '<div class="select-hover-desc-text"></div>'
  document.body.appendChild(hoverDesc)
  const hoverDescText = hoverDesc.querySelector('.select-hover-desc-text')
  const typeHoverDesc = createTypewriter()
  // Any pending "come back to idle branding" timer (see scheduleIdleHoverTitle below) — tracked out
  // here so every other path that touches these elements can cancel a stale one. Without this, a
  // timer scheduled from mousing OFF one option could still fire later and stomp whatever's showing
  // by then (a different option's hover, a brand-new stage's own chrome, or the elements already
  // torn down entirely on dictionary-mode entry) — showHoverTitle/hideHoverTitle both clear it
  // unconditionally for exactly that reason, so no caller has to remember to.
  let idleHoverTimer = null
  function clearIdleHoverTimer() {
    if (idleHoverTimer === null) return
    clearTimeout(idleHoverTimer)
    idleHoverTimer = null
  }
  // Wraps a just-typed description's own trailing "." in its own span, once typing genuinely
  // finishes (the typewriter's onDone — see its own comment in mossBox.js for why this waits for a
  // real signal instead of a guessed setTimeout duration), so style.css's own hard on/off blink
  // (.hover-desc-dot) can target just that one character — "beep on and off," per request, for
  // every description that ends in one (every option's own data-description, plus the idle
  // tagline). A description with no trailing period (none currently, but the check costs nothing)
  // just leaves it alone.
  function blinkTrailingDot() {
    const text = hoverDescText.textContent
    if (!text.endsWith('.')) return
    hoverDescText.textContent = text.slice(0, -1)
    const dot = document.createElement('span')
    dot.className = 'hover-desc-dot'
    dot.textContent = '.'
    hoverDescText.appendChild(dot)
  }
  function showHoverTitle(text, description, kanji) {
    clearIdleHoverTimer()
    hoverTitleText.textContent = text
    hoverTitleKanji.textContent = kanji || '' // '' leaves it :empty (style.css) — no dangling gap
    typeHoverDesc(hoverDescText, description || '', blinkTrailingDot)
    hoverTitle.classList.add('visible')
    hoverDesc.classList.add('visible')
  }
  function hideHoverTitle() {
    clearIdleHoverTimer()
    clearHoverLock()
    hoverTitle.classList.remove('visible')
    hoverDesc.classList.remove('visible')
  }
  // The idle/ambient state of the same two elements — shown whenever nothing's actually being
  // hovered on the select-mode screen itself, instead of leaving the title/desc blank there (see
  // showsIdleBranding below for why "select-mode itself" specifically, not the whole tree).
  // showIdleHoverTitle() is what renderModeSelect() falls back to (see its own call site below)
  // rather than a plain hideHoverTitle() — the branding is meant to always be sitting there as
  // select-mode's own resting state, not just flash on for a hover and disappear otherwise.
  const IDLE_TITLE = 'duality terrarium'
  const IDLE_TAGLINE = 'a new way to learn kanji.'
  // A different caption for one specific window — while leaveHomeIntoOrb's own spiral is actually
  // playing (see enteringViewer below). A "now loading" read, consistent with the transition's own
  // "PS2 disc-load" framing (terrarium.js's own header comment) — and, same as idle branding, drops
  // the big IDLE_TITLE word entirely for that same moment rather than keeping it alongside the new
  // caption (the caption already says "duality terrarium" itself, so the title repeating it right
  // above read redundant). '' is safe here the same way showIdleHoverTitle's own kanji argument
  // already omits itself for idle branding — .select-hover-title-kanji has a real
  // :empty{display:none} rule for exactly this (style.css); .select-hover-title-text has no matching
  // rule but doesn't need one, since an empty inline span with nothing next to it (the kanji span is
  // ALSO empty here) just renders as nothing, not a dangling gap.
  //
  // Used to only ever surface indirectly — via scheduleIdleHoverTitle's own ordinary 2000ms idle-
  // hover delay, whichever mouseout happened to fire it during the spiral, "found by accident, kept
  // on purpose" since it read well regardless. Explicit request since then: type up the INSTANT
  // dictionary/a lesson is clicked, not whenever a stray mouseout's own delayed timer happens to land
  // — and disappear again the instant the spiral's own dive-back-in leg actually starts, not linger
  // through the whole ~4.7s sequence or however long that stray timer takes to fire. leaveHomeIntoOrb
  // (further down) now drives both ends explicitly: showHoverTitle(...) the moment it's called, and
  // enterOrb's own `onDiveStart` callback (terrarium.js) hiding it right at the phase-1→2 handoff.
  // The old indirect path is explicitly locked out for this whole window too, not just superseded by
  // it — see the mouseover/mouseout handlers' own `!enteringViewer` guard, further down: without it,
  // a mouseout reaching optionsBox.content while the box collapses underneath the cursor (a real,
  // likely occurrence, not an edge case) could re-trigger the ordinary idle-branding machinery and
  // pop this caption back up AFTER enterOrb's own callback already hid it for good.
  const ENTERING_VIEWER_TAGLINE = 'now entering duality terrarium.'
  let enteringViewer = false
  function showIdleHoverTitle() {
    showHoverTitle(enteringViewer ? '' : IDLE_TITLE, enteringViewer ? ENTERING_VIEWER_TAGLINE : IDLE_TAGLINE)
  }
  // Moving the mouse OFF an option doesn't bring idle branding straight back — per explicit request,
  // there's a real gap (nothing showing) before it does. hideHoverTitle() first (so the just-hovered
  // option's own title/desc actually disappears right away, not lingering), then this schedules idle
  // branding IDLE_HOVER_DELAY_MS later — cancelled by showHoverTitle/hideHoverTitle's own unconditional
  // clearIdleHoverTimer() call if anything else happens first (hovering a different option, a stage
  // transition, leaving select-mode entirely), so it can never fire late over top of something newer.
  const IDLE_HOVER_DELAY_MS = 2000
  function scheduleIdleHoverTitle() {
    clearIdleHoverTimer()
    idleHoverTimer = setTimeout(() => {
      idleHoverTimer = null
      showIdleHoverTitle()
    }, IDLE_HOVER_DELAY_MS)
  }
  // Idle branding is select-mode's OWN title, not a general "nothing's hovered" fallback for the
  // whole tree — per explicit correction: one level deeper (flashcards, genki 1/2, lessons)
  // idle means genuinely nothing shows, same as before idle branding existed at all; it's just gone
  // once you leave select-mode and doesn't come back until you're back on that screen. Toggled
  // alongside inSelectModeTree by the render*() functions below (true only in renderModeSelect()).
  let showsIdleBranding = false
  // What "nothing's hovered anymore" actually does, shared by the click delegation and the mouseout
  // handler below: always hide right away, and ONLY schedule idle branding's delayed comeback when
  // showsIdleBranding says this is actually select-mode itself — a deeper stage just stays hidden.
  function dropToIdleOrHidden() {
    hideHoverTitle()
    if (showsIdleBranding) scheduleIdleHoverTitle()
  }
  // Which .mode-option (if any) the cursor is ACTUALLY sitting over right now — tracked
  // unconditionally on every mouseover/mouseout below, regardless of hoverLocked, so
  // lockHoverToIdle's own expiry (just below) can hand control back to wherever the cursor really is
  // the instant the lock lifts, not just wait for the next real mouse movement to trigger a fresh
  // mouseover event (which won't happen on its own if the cursor's been sitting still the whole time
  // the box was transforming underneath it — exactly the scenario this lock exists for).
  let currentlyHoveredBtn = null
  // The box regenerating open across select-mode's own entrance (renderModeSelect, below) happens in
  // real screen space while the cursor typically hasn't moved — a button can easily end up forming
  // right under it, which would otherwise swap "duality terrarium" out for that button's own title
  // before the user ever consciously chose to hover anything. HOVER_LOCK_MS gives idle branding a
  // guaranteed window to actually be seen: mouseover is suppressed (see its own !hoverLocked check
  // below) for this long after select-mode is entered, then control hands back to the cursor.
  const HOVER_LOCK_MS = 4000
  let hoverLocked = false
  let hoverLockTimer = null
  function clearHoverLock() {
    if (hoverLockTimer !== null) {
      clearTimeout(hoverLockTimer)
      hoverLockTimer = null
    }
    hoverLocked = false
  }
  function lockHoverToIdle() {
    clearHoverLock()
    hoverLocked = true
    hoverLockTimer = setTimeout(() => {
      hoverLockTimer = null
      hoverLocked = false
      // Hand control back to wherever the cursor actually is right now, if it's sitting over a
      // button — see currentlyHoveredBtn's own comment for why this can't just wait for a fresh
      // mouseover event instead.
      if (currentlyHoveredBtn && currentlyHoveredBtn.dataset.label) {
        showHoverTitle(currentlyHoveredBtn.dataset.label, currentlyHoveredBtn.dataset.description, currentlyHoveredBtn.dataset.kanji)
      }
    }, HOVER_LOCK_MS)
  }

  // ── Radio box — a second, persistent createMossBox() instance, same "one box, several stages"
  // convention as optionsBox but with only one real stage: hidden until select mode is entered
  // (enterSelectMode, below), then it spawns in once (spawnFrom below, same click-to-pin shard/glass
  // entrance the dictionary view's info box uses) and stays landed — never regenerate()d, never a
  // second spawn. Migrated from
  // spotify-store's own "NORA Music Player" (a real player, not a placeholder) — see style.css's
  // own header comment on #radio-panel for exactly what was ported as-is vs. adapted. Chrome
  // (title/kanji/marquee) is set ONCE here, same "this box's chrome labels itself" convention as
  // searchBox in the dictionary view below — nothing about it tracks app state.
  const radioBox = createMossBox({ id: 'radio-panel', position: 'right', title: 'radio', kanji: '音楽' })
  document.body.appendChild(radioBox.el)
  radioBox.setMarquee('radio 音楽')

  // ── About overlay — a THIRD persistent createMossBox() instance, same "one box, several stages"
  // convention as optionsBox/radioBox above, but with only one real stage: hidden until welcome's own
  // "about" is clicked (openAbout, below), then spawns in and stays landed showing a single <iframe>
  // — the whole "about" experience is a genuinely separate static page (public/about-terrarium/, its
  // own HTML/CSS/JS/Babylon, zero shared code with this app), this box is just its frame. See
  // apps/web/CLAUDE.md's "About overlay" for the full grilled spec this follows.
  // `position: null` (not 'left'/'right') opts out of POSITION_CLASS's float modifiers entirely —
  // sized/positioned by its own extraClass below instead, which is a near-fullscreen inset, not a
  // side panel. No `setMarquee()` call — there's deliberately no bottombar on this box, just the
  // topbar (title/kanji/back-arrow) framing the iframe.
  const aboutBox = createMossBox({
    id: 'about-panel',
    position: null,
    extraClass: 'nora-moss-box--about-overlay',
    title: 'about',
    kanji: '紹介', // "introduction" — a real word, same convention every other corner glyph follows
  })
  document.body.appendChild(aboutBox.el)

  // RADIO_PLAYLIST/radioTrackIndex/radioAudio all moved to module scope, above mountHome entirely
  // (see that block's own header comment for the full reasoning) — this box's own job now is purely
  // UI: paint itself from that persistent engine's CURRENT state, and stay in sync with it for as
  // long as THIS particular mount is alive. Rebuilt fresh every mountHome() call like every other
  // box on this screen; the engine underneath never resets.
  //
  // syncTrackDisplay/updateRadioDur/setRadioPlaying/syncVolume are deliberately four small separate
  // functions, not one big syncAllRadioUI — each is wired to the SPECIFIC radioAudio event that
  // actually needs it (loadedmetadata only fires on a real track change, timeupdate fires ~4x/sec,
  // play/pause fire on their own transitions), so nothing re-renders more than it needs to. All four
  // still get one combined call right after this mount's radioPlayerHtml() is first inserted (inside
  // spawnRadioBox and the startAtSelectMode first-paint branch, further down) — the audio engine may
  // already be mid-track from a previous visit, so this mount has to paint the REAL current state
  // immediately, not assume track 0/paused/silent the way a fresh boot would.
  function syncTrackDisplay() {
    const t = RADIO_PLAYLIST[radioTrackIndex]
    const titleEl = radioBox.content.querySelector('#radio-player-title')
    if (titleEl) titleEl.textContent = t.title
    const artEl = radioBox.content.querySelector('#radio-player-art')
    if (artEl) artEl.innerHTML = `<img src="${t.cover}" alt="cover">`
    // No longer also refreshes a nested track list here — that list isn't part of this DOM any more
    // when the player stage is showing (trackListStageHtml() above is its own separate stage, always
    // rebuilt fresh from radioTrackIndex the moment it's actually entered), so there's nothing stale
    // to keep in sync while this stage is up.
  }
  function updateRadioDur() {
    const durEl = radioBox.content.querySelector('#radio-player-dur')
    if (durEl) durEl.textContent = `${radioFmtTime(radioAudio.currentTime)} / ${radioFmtTime(radioAudio.duration)}`
  }
  function setRadioPlaying(playing) {
    const playIcon = radioBox.content.querySelector('#radio-play-icon')
    const pauseIcon = radioBox.content.querySelector('#radio-pause-icon')
    if (!playIcon || !pauseIcon) return
    playIcon.style.display = playing ? 'none' : 'block'
    pauseIcon.style.display = playing ? 'block' : 'none'
  }
  function syncVolumeSlider() {
    const volEl = radioBox.content.querySelector('#radio-player-volume')
    if (volEl) volEl.value = radioAudio.volume
  }

  // These five are added fresh every mountHome() call (a new closure over THIS mount's own radioBox
  // DOM) and MUST be removed when this mount's box is torn down (leaveHomeIntoOrb, further down) —
  // radioAudio itself is the permanent singleton now, so without an explicit removal every trip back
  // into select mode would stack one more duplicate listener on top of the last, each one still
  // firing (harmlessly no-op-ing against whatever DOM existed at ITS OWN mount, most of it already
  // removed) but leaking all the same. unsyncRadioUI (called from leaveHomeIntoOrb) is the other half
  // of this pair.
  const onRadioPlay = () => setRadioPlaying(true)
  const onRadioPause = () => setRadioPlaying(false)
  radioAudio.addEventListener('loadedmetadata', syncTrackDisplay)
  radioAudio.addEventListener('play', onRadioPlay)
  radioAudio.addEventListener('pause', onRadioPause)
  radioAudio.addEventListener('timeupdate', updateRadioDur)
  radioAudio.addEventListener('durationchange', updateRadioDur)
  function unsyncRadioUI() {
    radioAudio.removeEventListener('loadedmetadata', syncTrackDisplay)
    radioAudio.removeEventListener('play', onRadioPlay)
    radioAudio.removeEventListener('pause', onRadioPause)
    radioAudio.removeEventListener('timeupdate', updateRadioDur)
    radioAudio.removeEventListener('durationchange', updateRadioDur)
  }

  // The track-picker — explicit request: "let them pick a song" directly, not just step through
  // next/prev. REWORKED TWICE now: first from a quiet nested max-height/opacity reveal to a full
  // click-to-pin despawnTo()→spawnFrom() shard flight (the same one spawnRadioBox/leaveHomeIntoOrb use
  // for entering/leaving select mode), then walked back on later explicit follow-up — "it doesn't need
  // to do the full shard effect" — to this box family's OTHER standard transition instead:
  // regenerate()'s own "collapse to just the tabs, white flash, pop back open" choreography
  // (mossBox.js's own header comment on regenerateBox has the full phase-by-phase breakdown), the
  // exact same motion the welcome→select-mode state machine already uses for ITS stage changes. No
  // shard, no box despawn/respawn, no click-origin point needed at all any more — the box stays put
  // and only its CONTENT collapses/flashes/reopens. Two genuinely separate STAGES either way (the
  // player stage, radioPlayerHtml() below, vs. this track-list stage), never both in the DOM at once —
  // that part of the shard-era rework was worth keeping regardless of which transition carries it.
  // `openTrackSelectStage`/`selectTrack`, further down, are this pair's own two regenerate() calls.
  //
  // Each row still reads as a small "featured song" preview — the same `.nora-player-art`/
  // `.nora-player-title` visual language the box's own now-playing display already uses (real,
  // deliberate reuse, explicit request: "should display more or less like the featured song"), NOT
  // `.mode-option`'s pill/glass button look — a plain `<button>` for real click/keyboard semantics,
  // but visually just an image next to a title, no button chrome at all. Four elements per row,
  // Apple-Music-style: art → a "Track N:" index label (N is 1-based, `i + 1`, matching how a person
  // counts tracks, not the 0-based `data-track-index` the click handler still uses internally) → the
  // kanji title → a static duration readout, pinned to the row's own right edge via
  // `.radio-track-option-title`'s own `flex: 1` (style.css) — the one element that actually GROWS to
  // fill whatever space the other three don't claim, using the same `gap` between all four rather than
  // a separate "push this one to the end" margin. `.nora-player-dur` reused verbatim for both the
  // index label and the duration itself — same small/dim/Arial secondary-text treatment the main
  // player's own "0:00 / 4:06" readout already uses. `is-current` (whichever track is actually loaded
  // right now) bumps all four to full opacity so it reads as distinct even at rest, not just on hover
  // — style.css's own comment on `.radio-track-option` has the hover-glow half of this. Rebuilt fresh
  // every time this stage is entered (openTrackSelectStage, below) — always correct for whatever's
  // playing AT THAT MOMENT, so there's no separate "keep it in sync while open" concern the way a
  // persistent nested list would have needed.
  // Rows start invisible (inline `opacity:0`, baked right into the markup) so regenerate() bump-opens
  // the box to its real full height (all 6 rows already present for correct measurement — Phase 3's
  // own comment in mossBox.js explains why that measurement needs the real content in place) with
  // nothing actually visible inside it yet; revealTrackRows (below) then fades them in one at a time
  // right after regenerate() resolves. translateY(4px) on top of the opacity, same small rise every
  // other staggered reveal in this app uses (revealLines/revealRelatedList, mossBox.js).
  function trackListStageHtml() {
    return `
      <div class="radio-track-list" id="radio-track-list">
        ${RADIO_PLAYLIST.map((t, i) => `
          <button type="button" class="radio-track-option${i === radioTrackIndex ? ' is-current' : ''}" data-track-index="${i}" style="opacity:0; transform:translateY(4px)">
            <span class="nora-player-art radio-track-option-art"><img src="${t.cover}" alt=""></span>
            <span class="nora-player-dur radio-track-option-index">Track ${i + 1}:</span>
            <span class="nora-player-title radio-track-option-title">${t.title}</span>
            <span class="nora-player-dur radio-track-option-dur">${radioFmtTime(t.duration)}</span>
          </button>
        `).join('')}
        <button type="button" class="mode-option radio-track-select-btn" id="radio-player-close-list">
          <span class="mode-option-label related-title">current track</span>
        </button>
      </div>
    `
  }
  // Same pacing as mossBox.js's own LINE_STAGGER_MS (revealLines) — a whole row (art+text) reads as a
  // "line" of content, not a small burst tile (that'd be BURST_STAGGER_MS's own faster 32ms, tuned for
  // many small kanji tiles at once, not six visually heavy rows).
  const TRACK_ROW_STAGGER_MS = 90
  // Explicit request: "have each track load in line by line not all at once" — fires each row's own
  // entrance animation without awaiting it (same fire-and-forget-then-sleep shape mossBox.js's own
  // revealRelatedList/tileEnter pair uses for its tile burst), so row 2 starts while row 1 is still
  // mid-fade rather than waiting for it to finish — that overlap IS what makes it read as staggered
  // rather than as six separate slow reveals played back to back. Committing the final opacity/
  // transform to inline style once each animation finishes (not just leaving the WAAPI animation's own
  // `fill: forwards` to hold it) matters for the SAME reason tileEnter's own comment gives: left
  // registered, a finished animation with `fill: forwards` keeps competing with this row's later
  // hover-pulse opacity changes (`.is-pulsing`, style.css) instead of getting out of the way once done.
  function revealTrackRows(list) {
    const rows = list ? list.querySelectorAll('.radio-track-option') : []
    rows.forEach((row, i) => {
      setTimeout(() => {
        const anim = row.animate(
          [
            { opacity: 0, transform: 'translateY(4px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 260, easing: 'ease-out', fill: 'forwards' },
        )
        anim.finished
          .then(() => {
            row.style.opacity = '1'
            row.style.transform = 'translateY(0)'
            anim.cancel()
          })
          .catch(() => {}) // a superseded regenerate() can tear this row out mid-flight; nothing to do
      }, i * TRACK_ROW_STAGGER_MS)
    })
  }
  // Click "track select": regenerate() collapses the box's content down to just the topbar+bottombar
  // ("the tabs"), flashes white once under cover of which the content actually swaps, then bump-opens
  // back up already showing trackListStageHtml() (rows still invisible at this instant — see its own
  // comment above) — chrome (title/kanji/marquee) is untouched throughout, only `html` is passed. The
  // row-by-row reveal (revealTrackRows) only starts once regenerate() itself is fully done, so it never
  // overlaps the box still growing. NO LONGER a one-way door — explicit request, "a proper toggle":
  // trackListStageHtml()'s own trailing "current track" button (closeTrackSelectStage, right below)
  // reverses this exact transition without picking anything. Bails cleanly (mossBox.js's own
  // generation guard) if superseded by a second click before it finishes.
  async function openTrackSelectStage() {
    const revealed = await radioBox.regenerate({ html: trackListStageHtml() })
    if (!revealed) return
    revealTrackRows(radioBox.content.querySelector('#radio-track-list'))
  }
  // Click "current track" — the reverse of openTrackSelectStage, closing the list back to the
  // ordinary player stage WITHOUT picking anything, so the pair now reads as a real open/close
  // toggle instead of the list being a one-way door only escapable by actually selecting a track.
  // Deliberately the exact same regenerate()+re-sync shape selectTrack() uses just below — a fresh
  // regenerate() always wipes the box's whole DOM, so whatever's currently playing has to be
  // repainted from the persistent engine state again regardless, there's nothing left on the
  // torn-down markup to read from — the only real difference from selectTrack() is this one never
  // touches loadRadioTrackAudio/radioAudio.play() at all, since nothing about the track changes.
  async function closeTrackSelectStage() {
    const revealed = await radioBox.regenerate({ html: radioPlayerHtml() })
    if (!revealed) return
    syncTrackDisplay()
    updateRadioDur()
    setRadioPlaying(!radioAudio.paused)
    syncVolumeSlider()
  }
  // Picking a track: commit the choice first (load + play, same "commit and move on" interaction
  // every other .mode-option selection in this app uses), THEN run the same collapse/flash/reopen in
  // reverse, landing back on the ordinary player stage with the new track already loaded and playing.
  async function selectTrack(index) {
    loadRadioTrackAudio(index)
    radioAudio.play()
    const revealed = await radioBox.regenerate({ html: radioPlayerHtml() })
    if (!revealed) return
    // Same one combined paint spawnRadioBox's own first-land uses — regenerate() just swapped this
    // box's entire content out from under whatever was here before, so nothing about the engine's
    // current state carries over in the DOM for free.
    syncTrackDisplay()
    updateRadioDur()
    setRadioPlaying(!radioAudio.paused)
    syncVolumeSlider()
  }
  // Hovering ANY of the four elements glows the WHOLE row, not just the text — explicit request.
  // All four pulse together (nora-kanji-pulse, the same beep every other hover-glow in this app
  // uses), phase-locked to each other AND to the rest of the page's own shared pulse clock
  // (syncPulseDelay on each, same as everywhere else this pattern is used) rather than just letting
  // four freshly-started animations coincidentally line up. `.is-pulsing` toggles on the ROW
  // (`.radio-track-option`); style.css's own rule targets all four off that one class.
  radioBox.content.addEventListener('mouseover', (event) => {
    const opt = event.target.closest('.radio-track-option')
    if (!opt || opt.classList.contains('is-pulsing')) return
    const art = opt.querySelector('.radio-track-option-art img')
    const title = opt.querySelector('.radio-track-option-title')
    const index = opt.querySelector('.radio-track-option-index')
    const dur = opt.querySelector('.radio-track-option-dur')
    syncPulseDelay(art)
    syncPulseDelay(title)
    syncPulseDelay(index)
    syncPulseDelay(dur)
    opt.classList.add('is-pulsing')
  })
  radioBox.content.addEventListener('mouseout', (event) => {
    const opt = event.target.closest('.radio-track-option')
    if (opt && !opt.contains(event.relatedTarget)) opt.classList.remove('is-pulsing')
  })
  // The "track select" toggle button itself is a real `.mode-option` (the app's own established
  // "click this to proceed/reveal" look) — generic `.mode-option` delegation is safe here (rather
  // than a scoped selector like the track rows' own) since this box's every OTHER button is either
  // `.nora-player-btn` or `.radio-track-option`, neither of which is `.mode-option` — no collision
  // risk to guard against.
  radioBox.content.addEventListener('mouseover', (event) => {
    const btn = event.target.closest('.mode-option')
    if (!btn || btn.classList.contains('is-pulsing')) return
    syncPulseDelay(btn)
    btn.classList.add('is-pulsing')
  })
  radioBox.content.addEventListener('mouseout', (event) => {
    const btn = event.target.closest('.mode-option')
    if (btn && !btn.contains(event.relatedTarget)) btn.classList.remove('is-pulsing')
  })

  radioBox.content.addEventListener('click', (event) => {
    const trackOpt = event.target.closest('.radio-track-option')
    if (trackOpt) {
      selectTrack(Number(trackOpt.dataset.trackIndex))
    } else if (event.target.closest('#radio-player-toggle-list')) {
      openTrackSelectStage()
    } else if (event.target.closest('#radio-player-close-list')) {
      closeTrackSelectStage()
    } else if (event.target.closest('#radio-player-play')) {
      if (!radioAudio.src) return
      radioAudio.paused ? radioAudio.play() : radioAudio.pause()
    }
  })
  radioBox.content.addEventListener('input', (event) => {
    if (event.target.id === 'radio-player-volume') radioAudio.volume = parseFloat(event.target.value)
  })

  function radioPlayerHtml() {
    // Single top-level wrapper around the player row + track-select button — required, not
    // stylistic: revealLines (mossBox.js, what carries this whole string in) only keeps
    // `wrap.firstElementChild` from each string it's given, silently discarding any sibling. No
    // nested track list any more — that's trackListStageHtml()'s own, entirely separate stage now
    // (openTrackSelectStage's own comment above has the full reasoning), never both in the DOM at once.
    return `
      <div class="nora-player-wrap">
      <div class="nora-player-row">
        <div class="nora-player-art" id="radio-player-art">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="9" stroke="white" stroke-width="1.2"/>
            <circle cx="11" cy="11" r="3" fill="white"/>
          </svg>
        </div>
        <div class="nora-player-meta">
          <div class="nora-player-title" id="radio-player-title">—</div>
          <input type="range" class="nora-player-volume" id="radio-player-volume" min="0" max="1" step="0.01" value="0.8">
        </div>
        <div class="nora-player-controls">
          <button type="button" class="nora-player-btn play-btn" id="radio-player-play" aria-label="Play">
            <svg id="radio-play-icon" width="16" height="16" viewBox="0 0 20 20" fill="none">
              <polygon points="4,2 18,10 4,18" fill="white"/>
            </svg>
            <svg id="radio-pause-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" style="display:none">
              <rect x="3" y="2" width="5" height="16" rx="1.5" fill="white"/>
              <rect x="12" y="2" width="5" height="16" rx="1.5" fill="white"/>
            </svg>
          </button>
        </div>
        <div class="nora-player-dur" id="radio-player-dur">0:00</div>
      </div>
      <button type="button" class="mode-option radio-track-select-btn" id="radio-player-toggle-list">
        <span class="mode-option-label related-title">select track</span>
      </button>
      </div>
    `
  }

  // Fired (not awaited) from enterSelectMode below, the instant "select" is clicked — see its own
  // comment there for where (x, y) comes from. Same spawnFrom → revealLines sequence renderPinInfo
  // (dictionary view, further down) uses, just with one reveal "line" instead of several staggered
  // ones, since this isn't a multi-line text reveal.
  //
  // Lands directly on the track-SELECT stage (trackListStageHtml(), not the ordinary player row) —
  // explicit request: coming from welcome straight into select mode should already show every track
  // for the user to choose from, not the collapsed player with its own "track select" button still
  // to click first. Scoped to exactly this one entry point on purpose: spawnRadioBox's only caller is
  // enterSelectMode() (welcome → select). The OTHER way select mode's radio box appears —
  // mountHome(true)'s own startAtSelectMode first-paint branch, further down (returning to select
  // mode from Dictionary/a lesson) — is untouched and still paints the ordinary player straight
  // away, since that trip isn't "coming from welcome." revealTrackRows (openTrackSelectStage's own
  // row-by-row fade-in, above) is reused verbatim here rather than the player stage's own sync* calls
  // — trackListStageHtml rebuilds itself fresh from whatever the persistent engine is already doing
  // (RADIO_PLAYLIST/radioTrackIndex/radioAudio, module scope above mountHome) every time it's
  // rendered, so there's no separate "sync this static markup to the engine" step the way the player
  // stage's own elements need; a return visit mid-track still shows the right track as `.is-current`,
  // same as `openTrackSelectStage()`'s own comment already establishes.
  async function spawnRadioBox(x, y) {
    const landed = await radioBox.spawnFrom(x, y)
    if (!landed) return
    const revealed = await radioBox.revealLines([trackListStageHtml()])
    if (!revealed) return
    revealTrackRows(radioBox.content.querySelector('#radio-track-list'))
  }

  // ── Stage markup — pure HTML-string builders, no side effects, so both the very first paint
  // (below) and every later transition (renderWelcome/renderModeSelect/etc.) can build the
  // exact same markup through one path rather than two copies drifting apart. Every piece of text
  // that should visibly type itself in during a regenerate() carries `data-typewriter` — see
  // regenerateBox's own comment in mossBox.js for what that attribute actually does. ──
  // Two options, stacked one above the other (.mode-option-list — the SAME stacked layout
  // select-mode's own buttons below use, not a bespoke row) — replaces the old login/signup pair per
  // explicit request: this is a fully static app now, nothing to authenticate. This button's own
  // visible label is 'select' now (renamed from 'enter' by explicit request, to actually name what
  // it leads to — select-mode's own title/marquee were renamed from 'select mode' to plain 'select'
  // in the same pass, further down, so the two read as one continuous idea) — internal names are
  // UNCHANGED on purpose, same "UI text only" scope the "Flashcards → Textbooks" rename already
  // established: `data-stage="enter-terrarium"`, the click delegation's own 'enter-terrarium' branch
  // below, `enterSelectMode()`, and the `terrariumEnterCloseUp` event it dispatches all still say
  // "enter." Clicking it calls enterSelectMode() directly — the exact same terrarium-swoop-in +
  // radio-box-spawn + renderModeSelect() sequence a successful login used to trigger, just with no
  // form in front of it. "about" opens a real overlay (see openAbout() below, and apps/web/CLAUDE.md's
  // "About overlay") — data-mode (not data-stage) since it's handled by the click delegation's own
  // mode-button branch, same as dictionary/flashcards below.
  function welcomeHtml() {
    return `
      <div class="mode-option-list">
        <button class="mode-option" data-stage="enter-terrarium">
          <span class="mode-option-label related-title" data-typewriter>select</span>
        </button>
        <button class="mode-option" data-mode="about">
          <span class="mode-option-label related-title" data-typewriter>about</span>
        </button>
        <!-- Real, user-facing feature now (not a dev shortcut) — a screensaver, reusing
             viewer/pipelineDemo.js's own stroke-generation loop (see enterSleepMode below, and
             apps/web/CLAUDE.md's "Sleep mode / screensaver" section). Takes #dev-skip-to-pipeline's
             old spot in this list — that dev button is hidden below, same convention as the other
             two hidden dev shortcuts, rather than deleted outright. -->
        <button class="mode-option" data-mode="sleep">
          <span class="mode-option-label related-title" data-typewriter>sleep</span>
        </button>
      </div>
      <!-- TEMP DEV SHORTCUT — delete this whole comment block + button, and its handler
           (search main.js for "TEMP DEV SHORTCUT"), once dictionary-page UI iteration is done and
           the normal welcome → select-mode → dictionary path isn't a hassle to click through
           anymore. Plain unstyled button on purpose (not .mode-option) so it can never be mistaken
           for a real part of the flow, and it has its own id + its own dedicated listener below, not
           wired into the mode-option/stage delegation, so removing it can't touch anything else. -->
      <!-- Hidden from the welcome screen for now (explicit request) — commented out, not deleted,
           so it's a one-line uncomment to bring back for the next round of dictionary-page iteration.
      <button id="dev-skip-to-dictionary" style="margin-top:12px;width:100%;">
        [dev] skip straight to dictionary
      </button>
      -->
      <!-- Same "temp, own id, own listener, deletable without touching anything else" deal as the
           dictionary shortcut just above — this one for flashcard-session iteration instead. Lesson
           20 specifically (not just "some genki 2 lesson"): checked its actual category mix first —
           2 atomic, 4 irregular, 9 real two-part splits, real variety across all three of
           lessonHtml's branches in one deck, not a lesson that happens to be all one kind.
           Hidden alongside the dictionary shortcut above, same reasoning, same one-line uncomment.
      <button id="dev-skip-to-flashcards" style="margin-top:8px;width:100%;">
        [dev] skip straight to genki lesson 20
      </button>
      -->
      <!-- Same "temp, own id, own listener" deal as the two shortcuts above — this one opens the
           pipeline-visualization dev tool (viewer/pipelineDemo.js), a genuinely separate mount not
           connected to the real app at all: watches 海's own real KanjiVG geometry pipeline
           (sample → offset → stitch → extrude) play out stroke by stroke, in real writing order,
           instead of the instant single-tick build the real viewer always does. Now that the real
           "sleep" button above reuses this same file's generation loop for something a learner
           actually sees, this dev entry point is hidden the same way as the other two above, rather
           than left visible as a second, redundant way in — one-line uncomment to bring it back.
      <button id="dev-skip-to-pipeline" style="margin-top:8px;width:100%;">
        [dev] show the rendering pipeline
      </button>
      -->
    `
  }

  // One caption above each button explaining what it does — widths checked directly against this
  // box's real content area (300px), not guessed: all land well under that at .related-title's
  // own 13px/0.14em-tracking size, so they genuinely stay on one line as asked, not just in theory.
  // The in-box .mode-option-caption/.mode-option-group wrappers that used to sit above each button
  // (kept for testing/comparison against the top-of-page hover-title description) were removed by
  // request — the hover-title (data-label/data-description below, main.js's showHoverTitle) is now
  // the ONLY place this description text shows. data-description is unchanged, still the hover
  // title's own source string.
  //
  // 'exit' is the last option here, not a topbar back button — select-mode is the one stage in
  // this whole tree whose topbar back arrow was replaced by an in-list option instead (see
  // renderModeSelect's own `back: null` and comment); every OTHER stage still uses the ordinary
  // topbar back arrow, untouched. data-stage (not data-mode) since this isn't a mode to enter, it's
  // a stage transition — handled in the click delegation below alongside 'genki-1'/'genki-2'/etc.
  // Was 'log out' (退出, "leave/withdraw") back when this whole tree sat behind a dummy login —
  // relabeled to 'exit' now that there's nothing to log out OF (this app has no accounts at all
  // anymore), but 退出 itself still fits "leave this area" either way, so the kanji is unchanged.
  function modeSelectHtml() {
    return `
      <div class="mode-option-list">
        <button class="mode-option" data-mode="dictionary" data-label="dictionary" data-kanji="辞書" data-description="enter any kanji to explore its dualities.">
          <span class="mode-option-label related-title" data-typewriter>dictionary</span>
        </button>
        <button class="mode-option" data-mode="flashcards" data-label="textbooks" data-kanji="教科書" data-description="review kanji from a textbook lesson.">
          <span class="mode-option-label related-title" data-typewriter>textbooks</span>
        </button>
        <!-- 'guide' — removed entirely, not left as another inert placeholder, per explicit request
             (same "genuinely gone, not just hidden" treatment 'custom' got — renderFlashcardsDecks's
             own header comment further down). Its 案内 kanji/description ("take a quick tour of how
             it works.") aren't reused anywhere else. -->
        <button class="mode-option" data-stage="exit" data-label="exit" data-kanji="退出" data-description="return to the welcome screen.">
          <span class="mode-option-label related-title" data-typewriter>exit</span>
        </button>
      </div>
    `
  }

  // The deck picker — 'flashcards' itself, not 'genki'. Genki isn't its own level any more (it never
  // conceptually was one — see renderFlashcardsDecks's own comment below): these buttons are DECKS,
  // a flat list — minna no nihongo is the first real second entry, not a new nested level above or
  // below genki's own two. Reached directly off select-mode's own 'flashcards' button, no menu in
  // between. There used to be a flashcards menu here (custom deck / genki, `flashcardsMenuHtml()`)
  // — removed entirely, not left as another inert placeholder: this is a fully static app with no
  // accounts (apps/web/CLAUDE.md's "One box, every stage"), and a custom deck is real, ongoing user
  // data with nowhere to be stored until there's a real persistence layer (root CLAUDE.md phasing)
  // — so 'custom' can't exist as a genuine option right now, only as a placeholder, and a
  // placeholder-only menu in front of the one real option (genki) was worse than no menu at all.
  // `src/srs/` (the parked SM-2 module) is still sitting there for whenever a real custom-decks
  // feature does become possible — see "Flashcards" in this file's own header comment further down.
  // Same .mode-option-list styling as everything else in this box, per the established convention.
  //
  // `minna no nihongo 1`/`2` pair with 日本語 ("Japanese language") — a real, meaningful word, same
  // "real word, not a random kanji" convention 元気 already follows for genki, even though it's
  // generic rather than naming the series specifically (unlike 元気, which genuinely IS "genki").
  // Full name on the BUTTON label itself (not shortened to "minna N") — explicit request, for
  // clarity at the actual decision point: "minna" alone reads as a fragment, not a real deck name,
  // unlike "genki" which already IS the book's own common short name. Verified this actually fits
  // before assuming otherwise — `.mode-option-label` renders "minna no nihongo 1" at ~170px against
  // ~230px of real available width in the button (measured live, not eyeballed). `data-label` (the
  // fly-out hover-title's own text, `showHoverTitle`/main.js — a SEPARATE string from the button's own
  // visible `.mode-option-label` span above) is the shorter "minna 1"/"2" instead, NOT the full name —
  // a real, caught bug: the hover title used to read the full "minna no nihongo 1" too, and at typical
  // desktop width that plus 日本語 (3 kanji) genuinely wraps mid-glyph in `.select-hover-title-row`
  // (confirmed live) — the exact class of bug the recent 教科書/textbooks rename was checked against
  // and found NOT to trigger, since that pairing uses a short word. `data-label`/the button's own text
  // being different strings is not new machinery, just the first time they've actually diverged.
  // Screens reached AFTER this one (renderMinnaLessons' own title/marquee, mountDictionary's own
  // searchBox title) still say the shorter "minna N" — by that point the ambiguity this fixes is
  // already resolved, same reasoning genki's own lesson-list/searchBox screens already apply. The
  // lesson-detail screen's own corner glyph (mountDictionary's own searchBox) does NOT follow suit
  // either — it's hardcoded to 授業 ("lesson/class") regardless of series, see that box's own creation
  // comment for why.
  function flashcardsDecksHtml() {
    return `
      <div class="mode-option-list">
        <button class="mode-option" data-stage="genki-1" data-label="genki 1" data-kanji="元気" data-description="review lessons from the genki 1 textbook.">
          <span class="mode-option-label related-title" data-typewriter>genki 1</span>
        </button>
        <button class="mode-option" data-stage="genki-2" data-label="genki 2" data-kanji="元気" data-description="review lessons from the genki 2 textbook.">
          <span class="mode-option-label related-title" data-typewriter>genki 2</span>
        </button>
        <button class="mode-option" data-stage="minna-1" data-label="minna 1" data-kanji="日本語" data-description="review lessons from the minna no nihongo 1 textbook.">
          <span class="mode-option-label related-title" data-typewriter>minna no nihongo 1</span>
        </button>
        <button class="mode-option" data-stage="minna-2" data-label="minna 2" data-kanji="日本語" data-description="review lessons from the minna no nihongo 2 textbook.">
          <span class="mode-option-label related-title" data-typewriter>minna no nihongo 2</span>
        </button>
      </div>
    `
  }

  // One lesson button per real Genki lesson number in `start..end` (inclusive), labeled "lesson N" —
  // deliberately the textbook's own lesson numbering, not renumbered per volume (Genki II's kanji
  // lessons are 13-23, not "1-11" of its own), so a user can open their physical book to whatever
  // week they're on and find the matching button directly, no mental translation needed. Each button
  // is a real trigger for transitionToFlashcardSession/mountDictionary({lessonNumber}) (click
  // delegation below) — not a dummy nav shell any more, that was true only before a real lesson
  // screen existed at all. `data-description` is generated per-lesson rather
  // than a single shared string, same reasoning `flashcardsDecksHtml()`'s own per-deck descriptions
  // use — "lesson 5" alone doesn't say what pressing it does, the number needs to stay in the
  // sentence, not be dropped for a generic one both lessons would share.
  function genkiLessonsHtml(start, end) {
    const buttons = Array.from(
      { length: end - start + 1 },
      (_, i) => `
        <button class="mode-option" data-stage="genki-lesson-${start + i}" data-label="lesson ${start + i}" data-kanji="授業" data-description="review kanji from lesson ${start + i}.">
          <span class="mode-option-label related-title" data-typewriter>lesson ${start + i}</span>
        </button>`,
    ).join('')
    return `<div class="mode-option-list">${buttons}</div>`
  }

  // Minna no Nihongo's own equivalent of genkiLessonsHtml above — same real-textbook-numbering
  // idea (Vol. II is units 26-50, not renumbered "1-25" of its own), same real trigger
  // (transitionToFlashcardSession/mountDictionary, now carrying `series: 'minna'` alongside
  // `lessonNumber`). Genuinely different from genkiLessonsHtml in one way, not just a renamed copy:
  // Minna's own units 21-23 (Vol. I) have NO kanji at all — real review lessons in the source
  // material, not a gap in this data — so `start..end` here is filtered down to only the units
  // `minnaKanji` actually has an entry for, rather than genki's own "every number in range has
  // content" assumption. Showing a button that opens onto a genuinely empty grid would read as
  // broken, not as an honest "this unit has nothing to review" — skipping the button entirely is
  // the honest version, same "don't fake what isn't there" instinct the classification pipeline
  // already applies elsewhere (data-pipeline/CLAUDE.md).
  function minnaLessonsHtml(start, end) {
    const buttons = Array.from({ length: end - start + 1 }, (_, i) => start + i)
      .filter((n) => minnaKanji[String(n)]?.length > 0)
      .map(
        (n) => `
        <button class="mode-option" data-stage="minna-lesson-${n}" data-label="lesson ${n}" data-kanji="授業" data-description="review kanji from lesson ${n}.">
          <span class="mode-option-label related-title" data-typewriter>lesson ${n}</span>
        </button>`,
      )
      .join('')
    return `<div class="mode-option-list">${buttons}</div>`
  }

  // ── Stage renderers — each is a real user-facing transition, so each goes through ONE
  // optionsBox.regenerate() call carrying BOTH the new chrome (title/kanji/marquee/back) AND the
  // new content together — never setTitle()/etc. called separately beforehand. That separateness
  // was a real bug: chrome lives in the topbar, outside .nora-moss-content, so calling setTitle()
  // before regenerate() started meant the tab text snapped to the new stage instantly, well before
  // the box even began closing. regenerate() now applies all of it together, at the one correct
  // instant (under cover of the flash) — see its own comment in mossBox.js. The box itself, and
  // every listener below, stays put across every stage; only its content/chrome changes. ──
  function renderWelcome() {
    inSelectModeTree = false // welcome never shows the hover title — see its own comment above
    showsIdleBranding = false
    hideHoverTitle()
    // Leaving select mode entirely (select-mode's own 'exit' button, the only way back here now that
    // login/signup are gone) — the radio box only ever lives in that area, so it leaves too. Retracts
    // via the same shard/glass entrance reversed (despawnTo, mossBox.js) rather than just fading in
    // place, per the explicit ask — but only when it's actually visible right now (a real spawn
    // happened): despawning an already-.is-hidden box would fly a shard out of whatever stale rect it
    // last had, which isn't a real "the box is leaving" moment — hide() is the correct no-op there
    // instead. Origin is optionsBox's own current on-screen center — the same box the original spawn
    // flew IN from — read now, before optionsBox.regenerate() below swaps its content back to welcome
    // (its position doesn't actually move between stages, but this keeps the same "read the rect
    // before regenerate() touches anything" discipline enterSelectMode's own spawn trigger uses).
    // Not awaited — same "runs concurrently" convention as every other cross-box effect on this page.
    // Used to `radioAudio.pause()` right here — removed by explicit request: audio now survives a
    // trip all the way back to welcome too, same as it survives Dictionary/a lesson (this file's own
    // "PERSISTENT RADIO ENGINE" header comment, above mountHome). The box itself still leaves the
    // screen (hidden/despawned below) — it just doesn't take the sound with it any more. This
    // specific box instance isn't destroyed here (unlike leaveHomeIntoOrb's own full `.remove()`),
    // so there's no unsyncRadioUI() to call either — its listeners stay valid, just watching a
    // hidden box.
    if (radioBox.el.classList.contains('is-hidden')) {
      radioBox.hide()
    } else {
      const originRect = optionsBox.el.getBoundingClientRect()
      radioBox.despawnTo(originRect.left + originRect.width / 2, originRect.top + originRect.height / 2)
    }
    optionsBox.regenerate({
      title: 'welcome',
      kanji: '開始', // "start/begin" — same "real word, not a random kanji" convention
      marquee: 'welcome 開始',
      back: null, // nothing before this stage to go back to
      html: welcomeHtml(),
    })
  }

  // Fires off welcome's own "about" click. Fully SEQUENTIAL by explicit request, not the "fired
  // independently, runs concurrently" convention most other cross-box effects in this app use
  // (enterSelectMode's own terrarium dispatch, further down, is a real example of that OTHER
  // convention — this is deliberately not that): welcome has to be genuinely gone before the about
  // box's own shard starts flying, not overlapping it. optionsBox.closeAndFade() is the SAME
  // "leaving for good" collapse+flash+fade transitionToDictionary uses elsewhere — it only leaves the
  // box `.is-hidden`, never destroys its content, so a later re-entrance (closeAbout, below) is
  // exactly as safe as any other stage's own. `aboutBox.spawnFrom` only starts once THAT'S fully
  // resolved. `spawnFrom` clears aboutBox's content the instant it starts (mossBox.js) — the iframe is
  // only inserted once it resolves too (still empty until then, same contract every other spawnFrom
  // caller in this app follows) — and every step bails via its own `finished`/`closed` check if
  // something superseded it mid-flight (a fast second click, an early close).
  //
  // The terrarium underneath is left exactly as it is — no teardown, no camera move — the about box
  // just covers it (apps/web/CLAUDE.md's "About overlay": explicitly deferred, not decided, whether
  // it should peek out from underneath instead — nothing here assumes either answer, trivial to
  // revisit later).
  async function openAbout(originX, originY) {
    const closed = await optionsBox.closeAndFade()
    if (!closed) return
    // An artificial OPEN_GAP_MS delay used to sit here (200ms, then 80ms) — closeAndFade's real
    // rounded-corner flash bug (apps/web/CLAUDE.md, "About overlay," real bug #2b) was making the
    // close read as unfinished, which this papered over with dead time rather than fixing. Once that
    // was actually fixed, the gap turned out to be solving a problem that no longer existed — removed
    // entirely by explicit follow-up ("it doesn't need it anymore... get rid of it") rather than left
    // at 0 as a vestigial no-op.
    const spawned = await aboutBox.spawnFrom(originX, originY)
    if (!spawned) return
    // Explicit /index.html, not just '/about-terrarium/' — Vite's dev server (and most static
    // hosts) only resolve a bare directory path to its index.html for real top-level routes; a
    // path this deep falls through the SPA fallback instead and serves the MAIN app's own
    // index.html into the iframe (confirmed while building this — the iframe rendered a nested
    // copy of this app itself). The explicit filename sidesteps that resolution gap entirely.
    aboutBox.setContent('<iframe src="/about-terrarium/index.html" title="about — duality terrarium"></iframe>')
    aboutBox.showBack(() => closeAbout(originX, originY))
  }

  // The exact reverse, same fully-sequential discipline as openAbout above: aboutBox shrinks back
  // down to the same point it opened from (despawnTo — spawnFrom played backward, mossBox.js's own
  // comment on it) and that has to actually FINISH before welcome starts its own entrance — not the
  // plain instant show() this used to be (a real, reported bug: welcome just "popped back into
  // place" instead of replaying its own closed-shard-then-open entrance the way it deserves, same as
  // every other box's first appearance in this app).
  //
  // optionsBox never actually left the DOM or lost its welcome content (closeAndFade only ever
  // hides it), so `optionsBox.spawnFrom` here is doing real double duty: it plays that genuine
  // shard-flight/bump-expand entrance AND — since spawnFrom unconditionally clears content plus
  // resets the same max-height/min-height/padding closeAndFade deliberately PINS to 0 (that
  // function's own comment in mossBox.js) — it's what undoes closeAndFade's pinned collapse, which a
  // plain show() never did (the original version of this bug: chrome visibly back, content stuck at
  // 0 height, nothing clickable). `setContent(welcomeHtml())` right after is what actually puts the
  // buttons back — spawnFrom's own contract is "resolve once full size and READY for content, still
  // empty" (its own comment), same as aboutBox's own entrance above.
  async function closeAbout(originX, originY) {
    const finished = await aboutBox.despawnTo(originX, originY)
    if (!finished) return
    // Real, reported performance bug, not just a visual one: despawnTo only ever hides aboutBox
    // (`.is-hidden`, opacity/pointer-events) — it never touches content, so the <iframe> (and the
    // SECOND full Babylon.js engine + its own runRenderLoop running inside that separate document)
    // stayed alive and rendering INVISIBLY in the background for as long as About was closed, only
    // ever actually torn down the next time About reopened (spawnFrom's own defensive `content.
    // innerHTML = ''` reset). That's a second real WebGL render loop competing for GPU/CPU with the
    // main terrarium's own choreography the whole time — confirmed as the actual cause of reported
    // lag in select mode/flashcards after visiting About, not a one-off perception. Clearing content
    // HERE, the instant the box is fully hidden, is what actually unloads that iframe's document and
    // genuinely stops its render loop, rather than leaving it running until the next open.
    aboutBox.setContent('')
    const spawned = await optionsBox.spawnFrom(originX, originY)
    if (!spawned) return
    optionsBox.setContent(welcomeHtml())
  }

  function renderModeSelect() {
    // '選択' — "selection/choice", same convention as searchBox's '検索' corner glyph (a real word,
    // not a random kanji) — see that box's own creation comment in the dictionary view below. Title/
    // marquee were 'select mode'/'select mode 選択' — shortened to plain 'select' by explicit
    // request, to match welcome's own button being renamed 'enter' → 'select' (that button's own
    // comment, above welcomeHtml, has the full reasoning) — internal names (the `inSelectModeTree`/
    // `showsIdleBranding` flags, `renderModeSelect` itself) are unchanged, same "UI text only" scope.
    // No topbar back arrow here, unlike every other stage — select-mode is the one place in this
    // tree where `back` was replaced by an in-list option instead: modeSelectHtml()'s own 'exit'
    // button (see its own comment, and the 'exit' branch in the click delegation below) covers
    // the same "leave this stage" job, just phrased as exiting rather than stepping back one
    // level. inSelectModeTree flips on here and stays true for every stage below this one — the
    // hover title starts applying now, defaulting to the idle branding (showIdleHoverTitle) rather
    // than staying hidden — see its own comment for why. showsIdleBranding is ALSO select-mode-
    // specific, not tree-wide (per explicit correction) — true only here; every deeper stage below
    // sets it back to false and reverts to a plain hideHoverTitle() instead.
    inSelectModeTree = true
    showsIdleBranding = true
    showIdleHoverTitle()
    lockHoverToIdle() // guarantees idle branding an on-screen moment before a hover can override it
    optionsBox.regenerate({
      title: 'select',
      kanji: '選択',
      marquee: 'select 選択',
      back: null,
      html: modeSelectHtml(),
    })
  }

  // '教科書' ("textbook") — select-mode's own option is labeled/glyphed 'textbooks' now too
  // (modeSelectHtml, above; was 'flashcards'/単語 — renamed by explicit request, UI text only, see
  // this file's own header comment on the "Flashcards" section for the full rename scope) — this
  // screen is titled 'textbooks', not 'genki', per the ORIGINAL correction that still holds: genki
  // isn't a level in this tree, it's a deck family (currently one of two) — this screen is the deck
  // picker, genki 1/2 and minna no nihongo 1/2 are just its four current entries, not a new level
  // above or below either deck family. Reached directly off select-mode's own 'textbooks' button
  // (click delegation below, still keyed on the internal `data-mode="flashcards"` — deliberately NOT
  // renamed, this pass was UI-only) — there used to be a flashcards menu stage in between (custom
  // deck / genki), removed entirely along with 'custom' itself (see this section's own header comment
  // above), so this is genuinely one level below select-mode now, not two.
  function renderFlashcardsDecks() {
    showsIdleBranding = false
    hideHoverTitle()
    optionsBox.regenerate({
      title: 'textbooks',
      kanji: '教科書',
      marquee: 'textbooks 教科書',
      // Reverses the terrarium's own deck zoom (terrariumExitDeck) back to close-up directly — the
      // mirror of terrariumEnterDeck's own dispatch at the 'flashcards' click below. Each deck's own
      // lesson-list stage (renderGenkiLessons, below) comes back HERE too, but that's still "inside
      // the deck picker" (see this function's own header comment) — no further camera regression at
      // that level, same "no pairing exists below where one was actually asked for" reasoning as
      // every other zoom step in this chain.
      back: () => {
        window.dispatchEvent(new Event('terrariumExitDeck'))
        renderModeSelect()
      },
      html: flashcardsDecksHtml(),
    })
  }

  // Titled/glyphed per DECK (`genki ${volume}` / 元気), not per level — this screen is one level
  // below the deck picker (renderFlashcardsDecks, above), showing that one specific deck's own
  // lessons, so its own chrome names the deck, same as any other deck's lesson list would.
  function renderGenkiLessons(volume) {
    showsIdleBranding = false
    hideHoverTitle()
    const [start, end] = volume === 1 ? [3, 12] : [13, 23]
    optionsBox.regenerate({
      title: `genki ${volume}`,
      kanji: '元気',
      marquee: `genki ${volume} 元気`,
      back: () => renderFlashcardsDecks(),
      html: genkiLessonsHtml(start, end),
      maxContentHeight: OPTIONS_LIST_MAX_HEIGHT,
    })
  }

  // Minna no Nihongo's own equivalent of renderGenkiLessons above — same "titled/glyphed per deck"
  // idea, 日本語 instead of 元気 (flashcardsDecksHtml's own comment has the full reasoning for that
  // glyph choice). Vol. I is units 1-25, Vol. II 26-50 — genuinely the textbook's own numbering,
  // same "no renumbering" idea genki's own [3,12]/[13,23] ranges already follow; minnaLessonsHtml
  // is what actually filters out the unit numbers with no kanji (21-23), not this function.
  function renderMinnaLessons(volume) {
    showsIdleBranding = false
    hideHoverTitle()
    const [start, end] = volume === 1 ? [1, 25] : [26, 50]
    optionsBox.regenerate({
      title: `minna ${volume}`,
      kanji: '日本語',
      marquee: `minna ${volume} 日本語`,
      back: () => renderFlashcardsDecks(),
      html: minnaLessonsHtml(start, end),
      maxContentHeight: OPTIONS_LIST_MAX_HEIGHT,
    })
  }

  // Initial paint — plain setContent(), not regenerate(). The box is still `.is-hidden` (opacity 0)
  // at this point, so the flicker/collapse/bump/typewriter sequence would just run invisibly and
  // delay show()'s own fade-in for nothing anyone would see. Every stage change AFTER this first
  // paint (entering the terrarium, a topbar back click, exiting select mode) goes through the
  // render*() functions above instead,
  // which do use regenerate() — that's the actual "box transforming to a new page" this was built for.
  //
  // startAtSelectMode skips welcome entirely and paints select-mode's own content as THIS first paint
  // instead — mirrors enterSelectMode()/renderModeSelect()'s own side effects (inSelectModeTree/
  // showsIdleBranding, idle branding, the radio box) without calling either of THOSE functions
  // directly, since both assume an already-visible box to animate (regenerate(), spawnFrom()'s own
  // shard-flight entrance) — there's nothing on screen yet to reverse-open FROM at a fresh mount. The
  // terrarium's own camera lands at close-up for free too, via mountTerrarium's own `startAtCloseUp`
  // option passed above — no `terrariumEnterCloseUp` dispatch needed here.
  if (startAtSelectMode) {
    inSelectModeTree = true
    showsIdleBranding = true
    optionsBox.setTitle('select')
    optionsBox.setKanji('選択')
    optionsBox.setMarquee('select 選択')
    optionsBox.setContent(modeSelectHtml())
    optionsBox.show()
    showIdleHoverTitle()
    lockHoverToIdle() // same "guarantee idle branding an on-screen moment" as renderModeSelect() itself
    // Radio box — the SAME content spawnRadioBox() builds, just without its own spawnFrom() shard-
    // flight entrance (nothing on screen yet to spawn FROM at a first paint) — plain setContent() +
    // show(), same rule as optionsBox's own first paint just above.
    radioBox.setContent(radioPlayerHtml())
    radioBox.show()
    // Same "paint whatever the persistent engine is already doing" sync as spawnRadioBox's own
    // (see that function's own comment) — this first-paint branch is reached by `mountHome(true)`,
    // i.e. returning from Dictionary/a lesson, so the engine is very possibly already mid-track.
    syncTrackDisplay()
    updateRadioDur()
    setRadioPlaying(!radioAudio.paused)
    syncVolumeSlider()
  } else {
    optionsBox.setTitle('welcome')
    optionsBox.setKanji('開始')
    optionsBox.setMarquee('welcome 開始')
    optionsBox.setContent(welcomeHtml())
    optionsBox.show()
  }

  // One delegated pair of listeners for the whole state machine — attached to optionsBox.content
  // itself, which survives every setContent() call (that only replaces content's children), so
  // nothing needs re-attaching per stage.
  optionsBox.content.addEventListener('click', (event) => {
    // Drop the just-clicked option's own title/desc immediately, before whichever branch below
    // actually navigates — "you press flashcard, it disappears" — via dropToIdleOrHidden() so
    // select-mode's own idle branding reappears after its usual delay but a deeper stage's click
    // just stays hidden, same logic the mouseout handler below uses. Guarded on inSelectModeTree —
    // welcome's own buttons ("enter"/"about") are `.mode-option` too but should never touch these
    // elements at all, same gate mouseover/mouseout already use.
    if (event.target.closest('.mode-option') && inSelectModeTree) dropToIdleOrHidden()

    const stageBtn = event.target.closest('[data-stage]')
    if (stageBtn) {
      const stage = stageBtn.dataset.stage
      if (stage === 'enter-terrarium') enterSelectMode()
      else if (stage === 'genki-1') renderGenkiLessons(1)
      else if (stage === 'genki-2') renderGenkiLessons(2)
      else if (stage === 'minna-1') renderMinnaLessons(1)
      else if (stage === 'minna-2') renderMinnaLessons(2)
      else if (stage.startsWith('genki-lesson-')) {
        // src/data/genki/genkiKanji.json supplies this lesson's kanji list. Same full "leave home"
        // transition as dictionary (leaveHomeIntoOrb above), landing on Dictionary itself, scoped to
        // this lesson — see transitionToFlashcardSession's own comment, and mountDictionary's header
        // comment, for why this isn't a separate screen.
        transitionToFlashcardSession('genki', Number(stage.slice('genki-lesson-'.length)))
      } else if (stage.startsWith('minna-lesson-')) {
        // Same mechanism as genki-lesson-N just above, src/data/minna/minnaKanji.json instead.
        transitionToFlashcardSession('minna', Number(stage.slice('minna-lesson-'.length)))
      }
      // 'exit' — nothing to tear down (no session, no accounts, this app is fully static), so this
      // is just the navigation: reverse the terrarium's close-up swoop back to birds-eye (the same
      // camera move used to fire here back when this button was 'log out') and land on welcome.
      else if (stage === 'exit') {
        window.dispatchEvent(new Event('terrariumExitCloseUp'))
        renderWelcome()
      }
      // 'genki-lesson-N'/'minna-lesson-N' are NOT inert — see the branches above and
      // transitionToFlashcardSession's own comment.
      return
    }

    const modeBtn = event.target.closest('.mode-option[data-mode]')
    if (!modeBtn) return
    if (modeBtn.dataset.mode === 'dictionary') {
      transitionToDictionary() // not awaited — the click handler itself has nothing to wait for
    } else if (modeBtn.dataset.mode === 'flashcards') {
      // Terrarium's own deeper zoom (terrarium.js) — fires HERE, at the select-mode button itself,
      // straight to renderFlashcardsDecks() (below, the deck picker — genki 1/2 today) — there used
      // to be a flashcards menu stage in between (custom deck / genki), removed entirely along with
      // 'custom' itself (see renderFlashcardsDecks's own header comment), so this is genuinely one
      // hop now, not two. renderFlashcardsDecks() is also reached elsewhere — any deck's own
      // lesson-list back button lands there too — so the dispatch stays HERE, at the actual
      // select-mode → flashcards transition, rather than inside renderFlashcardsDecks() itself, same
      // "don't re-trigger the zoom on every return visit" reasoning every other zoom step in this
      // chain already follows. Reverses on the deck picker's own back button below.
      window.dispatchEvent(new Event('terrariumEnterDeck'))
      renderFlashcardsDecks()
    } else if (modeBtn.dataset.mode === 'about') {
      // Origin point for both the welcome box's own closeAndFade and aboutBox's spawnFrom/despawnTo
      // pair — the clicked button's own on-screen center, read now before optionsBox starts closing
      // (same "read the rect before anything animates" discipline enterSelectMode's own radioBox
      // origin read already follows, just off the button itself here rather than the whole box).
      const rect = modeBtn.getBoundingClientRect()
      openAbout(rect.left + rect.width / 2, rect.top + rect.height / 2)
    } else if (modeBtn.dataset.mode === 'sleep') {
      // Identical call the idle timer itself uses (enterSleepMode, module scope above) — no
      // transition either way, per explicit request: sleep "just comes straight up," the same
      // whether a click asked for it or 60 seconds of inactivity did.
      enterSleepMode()
    }
  })

  // TEMP DEV SHORTCUT — its own listener, deliberately NOT folded into the delegation above, so
  // deleting this block (and the button markup in welcomeHtml()) can't touch any real app logic.
  // Skips select-mode entirely and runs the exact same exit choreography the real select-mode →
  // dictionary click uses (transitionToDictionary, defined below) — just triggered from welcome
  // instead, purely so dictionary-page UI work doesn't require clicking through select-mode every
  // time. Remove this whole block once that's no longer needed.
  optionsBox.content.addEventListener('click', (event) => {
    if (event.target.closest('#dev-skip-to-dictionary')) transitionToDictionary()
    // Same deal, for flashcard-session iteration — straight to genki lesson 20 (see its own
    // comment in welcomeHtml for why that specific lesson), skipping welcome → select-mode →
    // flashcards → genki 2 → lesson list every single reload.
    if (event.target.closest('#dev-skip-to-flashcards')) transitionToFlashcardSession('genki', 20)
    // Same deal, for the pipeline-visualization tool — a genuinely separate mount, not the exit
    // choreography the two shortcuts above reuse (see enterPipelineDemo's own comment for why an
    // instant teardown is the right call here instead).
    if (event.target.closest('#dev-skip-to-pipeline')) enterPipelineDemo()
  })

  // Fires straight off welcome's own "enter the terrarium" click (the 'enter-terrarium' branch in
  // the click delegation above) — the same "you're in" sequence a successful dummy login used to
  // trigger before login/signup were removed entirely, just with no form or gate in front of it now.
  function enterSelectMode() {
    // Terrarium's own camera choreography (terrarium.js) — swoops down and in, then settles into
    // its usual auto-rotate from that new closer position. Fired here, not tied to the box's own
    // regenerate() — the two run independently/concurrently, same as everything else on this page.
    window.dispatchEvent(new Event('terrariumEnterCloseUp'))
    // Radio box's own entrance — its origin point is the welcome box's own on-screen center, read
    // HERE, before optionsBox.regenerate() (inside renderModeSelect(), right below) starts animating
    // it into its next stage; a moment later and this rect would already be mid-collapse. Not
    // awaited — same "fired independently, runs concurrently" convention as the terrarium event just
    // above, not sequenced with renderModeSelect().
    const originRect = optionsBox.el.getBoundingClientRect()
    spawnRadioBox(originRect.left + originRect.width / 2, originRect.top + originRect.height / 2)
    renderModeSelect()
  }

  // The select-mode → dictionary transition — fired (not awaited) from the 'dictionary' click below.
  // Three exits run CONCURRENTLY (Promise.all, not sequenced — the whole point is one coherent
  // moment, not a queue of separate animations): optionsBox closes up, glows, and disappears
  // (closeAndFade, mossBox.js — the exact mirror of how it used to just get torn down instantly);
  // radioBox retracts via the SAME reverse-shard despawnTo already built for renderWelcome's own
  // 'exit' handling, "back to the left" meaning literally toward optionsBox's own on-screen position
  // (read here, before closeAndFade starts moving anything); and the terrarium spirals — pulls back
  // and spins, then dives back in while the box shatters into flying glass fragments concurrently,
  // finishing exactly as the dive lands (enterOrb, terrarium.js — see its own comment for the full
  // choreography and for why THIS one camera move is a Promise, unlike every other one in that file).
  // Only once all three are genuinely done does the hard teardown happen — disposeTerrarium(),
  // removing every home-page-only element, mountDictionary() — so disposal never visibly cuts the
  // spiral short, and dictionary mode never mounts underneath still-animating boxes.
  // The shared half of transitionToDictionary below — pulled out because flashcard-session entry
  // (transitionToFlashcardSession, further down) is a second real caller of the exact same "close
  // every home-page box, dive the terrarium into its orb, then tear the terrarium down completely"
  // sequence, not a variant of it: two independent inline copies of real animation-timing logic would
  // just drift apart the first time one of them gets retuned. Callers do their own mountXxx() after
  // this resolves — this function's only job is "home is gone, terrarium is disposed."
  async function leaveHomeIntoOrb() {
    hideHoverTitle() // clear whatever was actually hovering right before this sequence's own caption
    // Set BEFORE showHoverTitle just below — this is what arms the mouseover/mouseout handlers' own
    // !enteringViewer guard (their own comments, above optionsBox's creation) before the caption even
    // appears, so a mouseout reaching optionsBox.content while the box collapses underneath the
    // cursor (likely, not an edge case) can't fight what this function and enterOrb's own
    // onDiveStart callback below are about to drive explicitly.
    enteringViewer = true
    // Types up immediately — explicit request: the instant dictionary (or a lesson) is clicked, not
    // after the usual delayed idle-hover reappearance. Disappears again the instant the spiral's own
    // dive-back-in leg actually starts (enterOrb's own onDiveStart callback, passed below), not
    // lingering through the whole ~4.7s pull-back-then-dive sequence — ENTERING_VIEWER_TAGLINE's own
    // comment has the full history of why this used to be indirect.
    showHoverTitle('', ENTERING_VIEWER_TAGLINE)
    // Used to `radioAudio.pause()` right here — removed by explicit request, same reversal as
    // renderWelcome's own 'exit' path: audio now keeps playing straight through Dictionary and every
    // lesson screen (this file's own "PERSISTENT RADIO ENGINE" header comment, above mountHome). The
    // box itself still fully leaves (despawned/hidden below, then genuinely `.remove()`d at the end
    // of this function) — `unsyncRadioUI()` right before that `.remove()` is what actually matters
    // now: THIS mount's own play/pause/timeupdate/etc. listeners have to come off radioAudio before
    // its DOM is gone, or they'd leak (see unsyncRadioUI's own comment for why they don't just error
    // out harmlessly instead — some do, some don't, not worth relying on either way).
    const originRect = optionsBox.el.getBoundingClientRect()
    const originX = originRect.left + originRect.width / 2
    const originY = originRect.top + originRect.height / 2
    await Promise.all([
      optionsBox.closeAndFade(),
      radioBox.el.classList.contains('is-hidden') ? radioBox.hide() : radioBox.despawnTo(originX, originY),
      // onDiveStart: hides the "entering the terrarium" caption the instant the spiral turns back in
      // toward the orb (terrarium.js's own orbDiveStartCallback comment) — not at this Promise's own
      // much later resolution, which only fires once the whole spiral (pull-back AND dive) is done.
      enterOrb(() => hideHoverTitle()),
    ])
    // The terrarium is the "absolute monolith" this dispose exists for (see terrarium.js) — torn
    // down completely before the next screen mounts, not just hidden, per the home-page build's own
    // architecture: the two 3D scenes never coexist. hoverTitle/hoverDesc/radioBox are home-page-only
    // too (never shown outside home), so they leave with everything else here — the underlying
    // radioAudio does NOT leave with them any more, see above.
    disposeTerrarium()
    optionsBox.el.remove()
    hoverTitle.remove()
    hoverDesc.remove()
    unsyncRadioUI()
    radioBox.el.remove()
    // Defensive, not load-bearing — hoverTitle is already gone by this line, so nothing can call
    // showIdleHoverTitle() again for this mount regardless. Reset purely so this flag doesn't linger
    // true on the off chance anything here ever gets restructured to run before the elements above
    // are actually removed.
    enteringViewer = false
  }

  // Leaves home for the pipeline-visualization dev tool — deliberately NOT leaveHomeIntoOrb's own
  // cinematic exit (no spiral, no shatter, no hover-title choreography to bother with): this is a
  // hidden dev backdoor a real user should never see, not a real navigation moment worth a multi-
  // second animation. Still has to do the SAME real cleanup leaveHomeIntoOrb does, though — skipping
  // that would leave the terrarium's WebGL context/render loop and every home-page-only DOM element
  // (optionsBox/hoverTitle/hoverDesc/radioBox) running invisibly forever, orphaned the moment
  // app.innerHTML gets overwritten below. Just performed instantly instead of animated into.
  function enterPipelineDemo() {
    disposeTerrarium()
    optionsBox.el.remove()
    hoverTitle.remove()
    hoverDesc.remove()
    unsyncRadioUI()
    radioBox.el.remove()
    mountPipelineDemoScreen()
  }

  // Own tiny mount, genuinely separate from every other screen in this app (mountDictionary/
  // mountFlashcardSession/mountHome) — no shared layout, no shared teardown protocol, just a
  // container, a character picker, and a way back out. `dispose` (viewer/pipelineDemo.js's own
  // return value) tears down its renderer/listeners; calling mountHome() after is what actually
  // gets a learner-facing screen back on `#app` — the SAME plain welcome-first-paint every fresh
  // load already starts from, not a special "return from dev tool" path.
  function mountPipelineDemoScreen() {
    app.classList.remove('is-home')
    app.innerHTML = `
      <div id="pipeline-demo-container"></div>
      <div id="pipeline-demo-picker"></div>
      <div id="pipeline-demo-mode"></div>
      <div id="pipeline-demo-entrance"></div>
      <button id="pipeline-demo-back">[dev] back to welcome</button>
    `
    const { dispose, playCharacter, characters } = mountPipelineDemo(
      document.querySelector('#pipeline-demo-container'),
    )
    const picker = document.querySelector('#pipeline-demo-picker')
    const modeRow = document.querySelector('#pipeline-demo-mode')
    const entranceRow = document.querySelector('#pipeline-demo-entrance')
    // Tracked here, not read off whichever button happens to be .is-active — all three rows need to
    // know the OTHER two's current choice (picking a new character plays it in whatever mode/
    // entrance is already selected; toggling either replays whichever character is already
    // showing), and plain variables are simpler than querying the other rows' DOM state back out
    // every time.
    let currentCharacterId = characters[0]?.id
    let currentMode = 'sequential'
    let currentEntrance = 'normal'

    // One button per PIPELINE_DEMO_CHARACTERS entry (pipelineDemoData.js) — clicking any of them,
    // including the one already playing, is safe: playCharacter() itself clears whatever the
    // previous pick left behind and starts fresh (see its own comment for the generation-guard
    // mechanics). `.is-active` just tracks which button matches the character currently playing,
    // for a plain visual "you're looking at this one" cue — not load-bearing for playback itself.
    for (const characterData of characters) {
      const btn = document.createElement('button')
      btn.className = 'pipeline-demo-picker-btn'
      btn.textContent = `${characterData.character} ${characterData.gloss}`
      btn.addEventListener('click', () => {
        currentCharacterId = characterData.id
        playCharacter(currentCharacterId, currentMode, currentEntrance)
        for (const sibling of picker.children) sibling.classList.remove('is-active')
        btn.classList.add('is-active')
      })
      picker.appendChild(btn)
    }

    // The 'all strokes at once' toggle, alongside the original one-stroke-at-a-time sequencing —
    // explicit request, added as a second option rather than replacing the first (viewer/
    // pipelineDemo.js's own playCharacter `mode` argument /"simultaneous" has the real mechanics).
    // Switching modes replays whichever character is CURRENTLY showing in the new mode, rather than
    // requiring a re-click on the character row too.
    const MODES = [
      { id: 'sequential', label: 'one stroke at a time' },
      { id: 'simultaneous', label: 'all strokes at once' },
    ]
    for (const modeData of MODES) {
      const btn = document.createElement('button')
      btn.className = 'pipeline-demo-picker-btn'
      btn.textContent = modeData.label
      if (modeData.id === currentMode) btn.classList.add('is-active')
      btn.addEventListener('click', () => {
        currentMode = modeData.id
        playCharacter(currentCharacterId, currentMode, currentEntrance)
        for (const sibling of modeRow.children) sibling.classList.remove('is-active')
        btn.classList.add('is-active')
      })
      modeRow.appendChild(btn)
    }

    // Third toggle — whether the character starts at rest, or plays the exact real dictionary-mode
    // "spaceship" load-in swoop (viewer/pipelineDemo.js's own playCharacter `entrance` argument /
    // playSwoopEntrance has the real mechanics — same LOAD_SWOOP numbers the real viewer uses, not
    // re-tuned for this tool) running concurrently with whichever build mode is also selected.
    const ENTRANCES = [
      { id: 'normal', label: 'starts at rest' },
      { id: 'swoop', label: 'spaceship swoop-in' },
    ]
    for (const entranceData of ENTRANCES) {
      const btn = document.createElement('button')
      btn.className = 'pipeline-demo-picker-btn'
      btn.textContent = entranceData.label
      if (entranceData.id === currentEntrance) btn.classList.add('is-active')
      btn.addEventListener('click', () => {
        currentEntrance = entranceData.id
        playCharacter(currentCharacterId, currentMode, currentEntrance)
        for (const sibling of entranceRow.children) sibling.classList.remove('is-active')
        btn.classList.add('is-active')
      })
      entranceRow.appendChild(btn)
    }

    // Starts on the first character (umi/海) in sequential mode, starting at rest, by default —
    // same behavior this tool always had before any of the three toggle rows existed, just no
    // longer the only option.
    picker.firstChild?.click()

    document.querySelector('#pipeline-demo-back').addEventListener(
      'click',
      () => {
        dispose()
        mountHome()
      },
      { once: true },
    )
  }

  async function transitionToDictionary() {
    await leaveHomeIntoOrb()
    mountDictionary()
  }

  // Mirrors transitionToDictionary above exactly — same "leave home" sequence, different landing
  // screen. Fired from the 'genki-lesson-N'/'minna-lesson-N' clicks below (real lesson buttons
  // only). Lands on mountDictionary({series, lessonNumber}) now, NOT mountFlashcardSession —
  // Flashcards is Dictionary itself, scoped to one deck's one lesson (see mountDictionary's own
  // header comment). `series` was added once a second deck (minna) existed — genki's own lesson
  // numbers (3-23) and minna's (1-50) collide, so `lessonNumber` alone stopped being a unique key;
  // every call site now passes both. mountFlashcardSession (the old review-queue implementation)
  // stays fully defined, below, just unreferenced from any live UI path — a one-line revert here
  // (back to `mountFlashcardSession(lessonNumber)`, genki only — it predates minna entirely) is all
  // it'd take to restore it if this doesn't work out.
  async function transitionToFlashcardSession(series, lessonNumber) {
    await leaveHomeIntoOrb()
    mountDictionary({ series, lessonNumber })
  }

  // Same beep-in-and-out treatment as the dictionary view's related-kanji tiles (see infoBox.content's
  // mouseover/mouseout pair further down) — not a plain :hover brighten, the actual point being the
  // phase-lock to the topbar's own corner-glyph pulse via syncPulseDelay. Delegated on
  // optionsBox.content, same reasoning as the click listener above, which is what makes it work
  // across every stage (welcome's two options, select-mode's four) without re-attaching — every
  // button in this box is '.mode-option', in every stage, on purpose.
  optionsBox.content.addEventListener('mouseover', (event) => {
    const btn = event.target.closest('.mode-option')
    if (!btn) return
    currentlyHoveredBtn = btn // tracked regardless of hoverLocked — see its own comment for why
    // Center-screen hover title (see its own comment near optionsBox's creation) — gated on
    // inSelectModeTree so welcome's own buttons never trigger it, per the explicit ask, on
    // !hoverLocked so select-mode's own entrance lock (lockHoverToIdle) actually holds during its
    // window instead of a hover immediately overriding it, and on !enteringViewer so a mouseout
    // reaching this element while leaveHomeIntoOrb's own spiral plays can't fight the "entering the
    // terrarium" caption that sequence is explicitly driving (ENTERING_VIEWER_TAGLINE's own comment,
    // above optionsBox's creation, has the full reasoning).
    if (inSelectModeTree && !enteringViewer && btn.dataset.label && !hoverLocked)
      showHoverTitle(btn.dataset.label, btn.dataset.description, btn.dataset.kanji)
    if (btn.classList.contains('is-pulsing')) return
    syncPulseDelay(btn)
    btn.classList.add('is-pulsing')
  })
  optionsBox.content.addEventListener('mouseout', (event) => {
    const btn = event.target.closest('.mode-option')
    if (!btn || btn.contains(event.relatedTarget)) return
    if (currentlyHoveredBtn === btn) currentlyHoveredBtn = null
    // nothing's hovered anymore — idle branding or hidden, see dropToIdleOrHidden's own comment.
    // !hoverLocked: while locked, idle branding is already showing and should just stay put, not
    // get hidden-then-delayed-back-in by dropToIdleOrHidden's own usual timing. !enteringViewer:
    // same guard as mouseover's own, just above — this element is leaveHomeIntoOrb's to drive during
    // that window, not the ordinary hover machinery's.
    if (inSelectModeTree && !hoverLocked && !enteringViewer) dropToIdleOrHidden()
    btn.classList.remove('is-pulsing')
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// DICTIONARY — the classification test tool, unchanged from before this file grew a home screen,
// just wrapped in a function so it can mount on demand instead of automatically on load. Only new
// piece: #back-to-home-btn, which now lives inside #search-panel's own content (see
// searchContentHtml below) instead of floating as a standalone fixed-position element — it's the
// last thing in that box's content flow, so it always sits at the bottom of the search box
// regardless of whether #search-selected is collapsed or expanded above it.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// FLASHCARDS — a real Genki lesson review session. This is a SECOND mount point for the exact same
// 3D viewer dictionary mode uses (mountScene + buildKanjiGroup + loadKanjiBundle, below) — a
// deliberate change to this file's own previously-documented "the viewer only ever exists in
// dictionary mode" boundary (apps/web/CLAUDE.md, "Hard architectural boundary"). What's actually
// true now: the terrarium only ever exists on home; the per-character viewer exists in EITHER
// dictionary mode OR a flashcard session, never both at once, never with the terrarium. Same "never
// coexist, full teardown before the next one mounts" rule, just two doors into the same room instead
// of one.
//
// Deliberately STATELESS — no SM-2, no due dates, nothing persisted. Genki lessons are a curriculum-
// paced assignment ("this week's kanji"), not a self-directed long-term review pool — an SRS due-date
// gate would actively fight that: a learner drilling for Friday's quiz wants the WHOLE lesson every
// time, not whatever an algorithm decided was "due." Every card in the deck shows every session,
// shuffled; a miss sends that card to the back of THIS session's own queue (in-memory only), and the
// session ends once every card has been marked "got it" at least once. The real SM-2/due-date/
// persisted system (src/srs/ — sm2.js/store.js/queue.js, still intact, just unused here) is parked
// for a future custom-decks feature instead, where "keep reviewing until nothing's due" actually
// means something (root CLAUDE.md phasing).
//
// ALWAYS REVEAL, THEN SELF-GRADE — reworked from an earlier version where grading came FIRST and a
// `got it` never even showed the answer (self-reported honor-system grading, no typed-answer
// checking like WaniKani has, is unchanged — just moved). The front box now has exactly ONE button,
// `reveal` (onReveal, below); clicking it always shows the full lesson — meaning, readings, example
// compounds, duality breakdown for a real split — regardless of what the learner is about to say
// about their own recall. `got it`/`didn't get it` (onGrade, below) now live INSIDE that revealed
// content, at the bottom, alongside `duality detected` — grading is the last thing you do on a card,
// not the first. Per explicit request; the old "don't reward success with a peek" reasoning is gone,
// not preserved as a fallback anywhere.
//
// TWO BOXES, mirroring dictionary mode's OWN left/right split exactly (not a new layout): the
// control box sits on the RIGHT (where dictionary's search box lives) — front prompt (just `reveal`
// now), then the full lesson once revealed, `got it`/`didn't get it` included. A SECOND box, the
// mini-lesson, sits on the LEFT (where dictionary's info box lives) and only ever appears once a
// card's been revealed, on explicit click of `duality detected` — meaning, readings, this kanji's
// real compound-word examples (genkiKanji.json's own `examples` field — see that folder's README),
// and, for a genuine category-2 split only, a static list of both named parts. No fake split for
// category 1 (atomic) or 3 (irregular) — same "a wrong split teaches a false pattern" principle
// data-pipeline/CLAUDE.md already applies to the classifier itself.
//
// NO CLICK-TO-PIN ON THE 3D MODEL AT ALL, ever, in flashcard mode — setKanjiGroup's `interactive`
// option (src/viewer/scene.js) is always false here, every card, every phase. Explicit change of
// mind, worth being explicit about: an earlier pass turned this on after a miss (matching dictionary
// mode's own direct-click behavior), then corrected back off — unlike dictionary, the ONLY way to
// trigger the pin/detach-zoom here is clicking one of the left box's own component entries
// (pinNodeId, below); clicking the 3D model itself never does anything in this mode. scene.js's
// setInteractive() still exists (unused here now, not deleted) for exactly this kind of toggle if a
// future pass ever wants it back.
//
// STATIC FRONT, THEN SPIN ON REVEAL — a fresh card mounts via setKanjiGroup's own `animateEntrance:
// false` option: no swoop-in, no auto-spin, sitting in its normal resting pose like a printed card
// (still freely drag-rotatable — that option only ever governs what the model does on its OWN).
// `reveal` calls scene.js's startAutoSpin() on the SAME already-mounted mesh (no reload) the instant
// it fires — the model only starts drifting once you're actually in the teaching moment, not while
// you're doing the quiet recall test beforehand. Was tied to `didn't get it` before grading moved
// behind reveal; same reasoning, just fired a step earlier now that reveal always happens. Reflects
// an explicit design call: this app's own spinning/glowing "art project" register (apps/web/
// CLAUDE.md, "The moss box glass-UI system") is right for exploring or teaching, wrong for a quick
// legibility-first recall check.
// ─────────────────────────────────────────────────────────────────────────────

function shuffled(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

async function mountFlashcardSession(lessonNumber) {
  app.classList.remove('is-home')
  app.innerHTML = `<div id="viewer-container"></div>`
  const container = document.querySelector('#viewer-container')
  const { setKanjiGroup, startAutoSpin, pinNodeId, normalMaterial } = mountScene(container, {})

  // Right — mirrors dictionary mode's search box position. Always present, and — reworked from an
  // earlier version — now owns EVERY piece of full-kanji information (front prompt, then the whole
  // lesson: character/gloss/readings/examples), matching dictionary mode's own role split exactly:
  // the right box is always the full kanji, never dead space. `got it`/`didn't get it` live here now too.
  const cardBox = createMossBox({ id: 'flashcard-panel', position: 'right' })
  document.body.appendChild(cardBox.el)

  // Left — mirrors dictionary mode's info-panel position. Reworked from an earlier version that
  // showed the whole lesson here: this box is now PURELY duality information — a genuine atomic or
  // irregular kanji (no real split) never opens it at all. Opened explicitly via the right box's own
  // `duality detected` button (toggleDuality, below), not automatically on every miss any more.
  // Created once, stays hidden until first opened — spawnFrom()/closeAndFade() per open/close, the
  // SAME entrance/exit dictionary's own infoBox already uses for its click-to-pin reveal.
  const partsBox = createMossBox({ id: 'flashcard-parts-panel', position: 'left' })
  document.body.appendChild(partsBox.el)

  const deck = genkiKanji[String(lessonNumber)] ?? []
  const totalCount = deck.length
  // The actual session queue — a plain mutable array, not an index. "Got it" shift()s the front card
  // off for good; "didn't get it" shift()s it off and push()es it straight back onto the end, so it
  // comes around again after every other still-outstanding card. queue[0] is always "on screen now."
  const queue = shuffled(deck)
  let masteredCount = 0

  function exitToHome() {
    document.querySelector('#flashcard-panel')?.remove()
    document.querySelector('#flashcard-parts-panel')?.remove()
    // Matches dictionary mode's own #back-to-home-btn precedent exactly (main.js, below): a full
    // mountHome(true) reset — was welcome, corrected by explicit request to land back in select mode
    // instead (mountHome's own `startAtSelectMode` option) — still not a return to this specific
    // lesson-list stage, one level further back than that.
    mountHome(true)
  }

  // Wired as cardBox's own topbar back arrow (showBack()/regenerate()'s `back` option, every call
  // site below) rather than a bespoke in-box button, and — explicit request — kept up through EVERY
  // stage of a session, not just completeHtml()/emptyHtml()'s own in-box "back" button (unchanged,
  // still there too — this doesn't replace it, it just closes a real gap that existed before it):
  // there was previously no way to leave mid-deck at all short of grading every remaining card, front
  // prompt and post-miss lesson view included. cardBox sits at `position: 'right'`, so this arrow
  // lands top-left of the RIGHT-hand box — visible the instant the box itself is, for the whole
  // session, not toggled on/off per stage the way a stage-specific back arrow elsewhere in this app
  // would be (there's nowhere cheaper to land here anyway — see this function's own comment above for
  // why every exit route in this session already goes all the way to welcome, never a lighter "one
  // level up").

  const stageLabel = `genki ${lessonNumber}`
  // Was the box's own bottombar marquee, and used to spell out "X / Y mastered · Z left this round"
  // — moved into plain static content instead, per explicit request ("that shouldn't be a scrolling
  // tab, just a static line in the box"), then trimmed down again by further explicit request to just
  // the bare `n / n` count, nothing else. Renamed from `progressMarquee` to match — still only ever
  // shown alongside `frontHtml()` (below), same as before.
  const progressStatus = () => `${masteredCount} / ${totalCount}`

  // One button now, not two — grading moved to the bottom of the revealed lesson (onGrade, below);
  // see this section's own header comment for the "always reveal, then self-grade" story.
  // `progressStatus()` sits BELOW the button as a plain static line, not the box's bottombar marquee
  // any more (see that const's own comment) — the marquee itself now carries a per-card dash-pair
  // label instead (`${currentEntry.kanji} - unrevealed`, mirroring onReveal's own "- revealed").
  function frontHtml() {
    return `
      <div class="mode-option-list">
        <button class="mode-option" id="flashcard-reveal">
          <span class="mode-option-label related-title" data-typewriter>reveal</span>
        </button>
      </div>
      <div class="info-subtitle lesson-progress-stat">${progressStatus()}</div>
    `
  }

  // Stacked one per line (.lesson-parts is flex-direction:column — see style.css's own comment),
  // NOT side by side any more — a real, confirmed bug in the side-by-side version: several kanji's
  // own real KANJIDIC2 gloss for a part runs long (close to a full sentence), and a second column
  // next to it was running off the box entirely. LEFT box's only content, ever — see this section's
  // own header comment for why the right box owns everything else now.
  function partsHtml(bundle) {
    return bundle.groups
      .map(
        (g) => `
          <div class="lesson-part" data-node-id="${g.node_id}">
            <div class="info-character">${g.element}</div>
            <div class="info-subtitle">${g.gloss ?? '—'}</div>
          </div>`
      )
      .join('')
  }

  // The full lesson — RIGHT box, shown the instant `reveal` is clicked (onReveal, below), every card,
  // not just a miss. Built from the SAME bundle already fetched for the 3D model (loadCard, below)
  // plus this deck entry's own `examples` (genkiKanji.json — that's the one field the bundle doesn't
  // have; everything else here still comes from loadKanjiBundle, same single source of truth as
  // dictionary mode, not genkiKanji.json's own vestigial gloss/on/kun). `duality detected` only
  // renders for a genuine category-2 split — see toggleDuality's own comment for what it opens.
  // `got it`/`didn't get it` (onGrade, below) live here now too, not on the front prompt any more.
  function lessonHtml(entry, bundle) {
    const on = bundle.on?.length ? bundle.on.join('、') : '—'
    const kun = bundle.kun?.length ? bundle.kun.join('、') : '—'

    // .duality-toggle-list — real, confirmed bug (getBoundingClientRect: this list's own bottom
    // edge and the on'yomi row's own top edge landed at the EXACT same y, zero gap, touching) — a
    // plain .mode-option-list has no margin of its own by design (see that rule's own comment: just
    // `gap` between ITS OWN children), which every OTHER context using it relies on a NEIGHBOR to
    // provide (e.g. .lesson-grade-list's own margin-top below). Nothing was providing one here.
    const dualityButtonHtml =
      bundle.structure?.category === 2
        ? `<div class="mode-option-list duality-toggle-list">
             <button class="mode-option" id="flashcard-duality-toggle">
               <span class="mode-option-label related-title" data-typewriter>duality detected</span>
             </button>
           </div>`
        : ''

    // "used in" heading — reuses .related-title verbatim (same header treatment dictionary mode's
    // own "Also appears in N other kanji" line gets), plus its own dedicated .lesson-examples-title
    // class ONLY for the extra top margin — NOT a broader `.related-title` override, which would
    // also catch the grade/duality-detected buttons' own labels (same class, used for their glow).
    // Dash matched this app's marquees' own convention at the time this was written ( - , plain
    // hyphen with spaces) — not the middle-dot this used to use before THAT. Stale cross-reference
    // now: every marquee's own hyphen was removed by explicit request (kanji + English with just a
    // space, no separator at all — main.js's welcomeHtml/renderFlashcardsDecks/etc.), a change this
    // dead code was never touched to follow, since it's unreferenced from any live UI path.
    //
    // `.info-row-label` (English UI copy — "on'yomi", "kun'yomi", " - gloss") vs `.info-row-value`
    // (actual Japanese content — readings, the example word itself) — per explicit request: the
    // scaleY(0.58) "squish" every English UI label in this app carries (style.css, .related-title's
    // own base rule) is a Latin-alphabet font choice, and applying it uniformly to every span here
    // was ALSO squishing real hiragana/kanji content, which "looked terrible." `ex.word` and
    // `ex.reading` are both genuine Japanese content — `.info-row-value`, unsquished — while
    // `ex.gloss` (English) gets its own nested span so only IT, not the reading sitting right next to
    // it in the same flex cell, gets `.info-row-label`'s squish. style.css's own comment on
    // `.info-row-label`/`.info-row-value` has the CSS half of this split.
    const examplesHtml = entry.examples?.length
      ? `<div class="related-title lesson-examples-title">used in these words</div>${entry.examples
          .map(
            (ex) =>
              `<div class="info-row"><span class="info-row-value">${ex.word}</span><span><span class="info-row-value">${ex.reading}</span><span class="info-row-label"> - ${ex.gloss}</span></span></div>`
          )
          .join('')}`
      : `<div class="related-title lesson-examples-title">used in these words</div><div class="info-row"><span class="info-row-label">(no example compounds)</span></div>`

    return `
      <div class="info-character">${bundle.character}</div>
      <div class="info-subtitle">${bundle.gloss ?? '(no gloss)'}</div>
      ${dualityButtonHtml}
      <div class="info-row"><span class="info-row-label">on'yomi</span><span class="info-row-value">${on}</span></div>
      <div class="info-row"><span class="info-row-label">kun'yomi</span><span class="info-row-value">${kun}</span></div>
      ${examplesHtml}
      <div class="mode-option-list lesson-grade-list">
        <button class="mode-option" data-grade="hit">
          <span class="mode-option-label related-title" data-typewriter>got it</span>
        </button>
        <button class="mode-option" data-grade="miss">
          <span class="mode-option-label related-title" data-typewriter>didn't get it</span>
        </button>
      </div>
    `
  }

  function completeHtml() {
    return `
      <div class="info-character">✓</div>
      <div class="info-subtitle">lesson complete - ${totalCount} kanji mastered</div>
      <div class="mode-option-list">
        <button class="mode-option" id="flashcard-exit">
          <span class="mode-option-label related-title" data-typewriter>back</span>
        </button>
      </div>
    `
  }

  function emptyHtml() {
    return `
      <div class="info-character">✓</div>
      <div class="info-subtitle">this lesson has no kanji yet</div>
      <div class="mode-option-list">
        <button class="mode-option" id="flashcard-exit">
          <span class="mode-option-label related-title" data-typewriter>back</span>
        </button>
      </div>
    `
  }

  let currentEntry = null
  let currentBundle = null

  // Fetches the card currently at the front of the queue (same loadKanjiBundle dictionary mode
  // uses) and mounts its 3D structure — called once per card, before that card's front is shown, so
  // the model is already sitting there to be looked at the instant "what is this kanji?" appears.
  // See this section's own header comment for `interactive: false` and `animateEntrance: false`.
  async function loadCard() {
    currentEntry = queue[0]
    currentBundle = await loadKanjiBundle(currentEntry.kanji)
    setKanjiGroup(buildKanjiGroup(currentBundle, normalMaterial), {
      interactive: false,
      animateEntrance: false,
    })
  }

  // A reveal: wake the ALREADY-mounted model into auto-spin (no reload — same mesh, just no longer
  // sitting still) and swap the RIGHT box straight to the full lesson content — every card, not just
  // a miss (see this section's own header comment for the "always reveal, then self-grade" story).
  // Not awaited by its own caller (the click delegation below) — same "fire and forget, nothing left
  // to do in the handler" convention every other async transition in this file already follows (e.g.
  // transitionToDictionary).
  async function onReveal() {
    startAutoSpin()
    // The 3D model itself never responds to a click, here or anywhere else in this mode — see this
    // section's own header comment. The pin/detach-zoom only ever comes from the left box's own
    // component entries (toggleDuality/pinNodeId, below).
    const isDuality = currentBundle.structure?.category === 2
    await cardBox.regenerate({
      title: stageLabel,
      kanji: '授業',
      marquee: `revealed ${currentEntry.kanji}`,
      back: () => exitToHome(),
      html: lessonHtml(currentEntry, currentBundle),
    })
    // `duality detected` starts pulsing on its own the instant it exists, not waiting for a hover —
    // explicit request: the label alone is a little vague, so the button beeps ambiently to signal
    // "click me" the same way idle branding elsewhere in this app draws the eye. Awaited regenerate()
    // above so the button actually exists in the DOM before this runs (regenerate's own multi-phase
    // animation, not a synchronous content swap).
    if (isDuality) {
      const dualityBtn = cardBox.content.querySelector('#flashcard-duality-toggle')
      syncPulseDelay(dualityBtn)
      dualityBtn.classList.add('is-pulsing')
    }
  }

  // Opens/closes the LEFT box on demand — the `duality detected` button's own click (lessonHtml,
  // above), not automatic on every reveal. A genuine toggle: pressing it again while open closes it,
  // same "press again to release" convention pinNodeId's own toggle already uses.
  async function toggleDuality() {
    if (!partsBox.el.classList.contains('is-hidden')) {
      await partsBox.closeAndFade()
      return
    }
    const originRect = cardBox.el.getBoundingClientRect()
    const originX = originRect.left + originRect.width / 2
    const originY = originRect.top + originRect.height / 2
    const landed = await partsBox.spawnFrom(originX, originY)
    if (!landed) return // superseded by a newer open before this one finished
    partsBox.setTitle(stageLabel)
    partsBox.setKanji('授業')
    partsBox.setMarquee(`components ${currentEntry.kanji}`)
    partsBox.setContent(partsHtml(currentBundle))
  }

  // The actual self-grade — now fires from INSIDE the revealed lesson (`got it`/`didn't get it`,
  // lessonHtml above), not the front prompt; see this section's own header comment for why. Closes
  // the parts box first if still open (the old `continue` button's own precondition, carried over
  // unchanged), then applies the SAME bookkeeping the old onHit/onMiss did: 'hit' is gone for good
  // (masteredCount only ever grows — a later miss on a DIFFERENT card can't "un-master" this one),
  // 'miss' goes to the back of THIS session's own queue to come around again.
  async function onGrade(grade) {
    if (!partsBox.el.classList.contains('is-hidden')) await partsBox.closeAndFade()
    const card = queue.shift()
    if (grade === 'hit') masteredCount += 1
    else queue.push(card)
    await advanceOrComplete()
  }

  async function advanceOrComplete() {
    if (queue.length === 0) {
      cardBox.regenerate({ title: stageLabel, kanji: '授業', marquee: 'lesson complete', back: () => exitToHome(), html: completeHtml() })
      return
    }
    await loadCard()
    cardBox.regenerate({
      title: stageLabel,
      kanji: '授業',
      marquee: `unrevealed ${currentEntry.kanji}`,
      back: () => exitToHome(),
      html: frontHtml(),
    })
  }

  // One delegated listener each for the two boxes — same convention as every other box in this app
  // (mountHome's optionsBox, mountDictionary's infoBox), attached once, surviving every regenerate().
  cardBox.content.addEventListener('click', (event) => {
    if (event.target.closest('#flashcard-exit')) {
      exitToHome()
      return
    }
    if (event.target.closest('#flashcard-reveal')) {
      onReveal()
      return
    }
    if (event.target.closest('#flashcard-duality-toggle')) {
      toggleDuality()
      return
    }
    const gradeBtn = event.target.closest('[data-grade]')
    if (!gradeBtn) return
    onGrade(gradeBtn.dataset.grade)
  })
  // `reveal`/`got it`/`didn't get it` all get the ordinary plain-CSS `.mode-option:hover` treatment
  // (style.css) — no JS pulse wiring needed, same as these exact grade buttons already had back when
  // they lived on the front prompt.
  //
  // `duality detected` — the INVERSE, per explicit request: it starts pulsing ambiently the instant
  // it exists (onReveal, above, not here — this element doesn't exist yet when THIS listener is
  // attached, only once a category-2 card is actually revealed), specifically because the label
  // alone is a little vague about what it does; hovering STOPS the pulse (so the user reads it as
  // "I'm about to click this," a settled/confirmed state, not a moving target) and leaving resumes it.
  cardBox.content.addEventListener('mouseover', (event) => {
    const btn = event.target.closest('#flashcard-duality-toggle')
    if (btn) btn.classList.remove('is-pulsing')
  })
  cardBox.content.addEventListener('mouseout', (event) => {
    const btn = event.target.closest('#flashcard-duality-toggle')
    if (!btn || btn.contains(event.relatedTarget)) return
    syncPulseDelay(btn)
    btn.classList.add('is-pulsing')
  })
  partsBox.content.addEventListener('click', (event) => {
    // The actual pin/blueprint trigger — an explicit click, not hover (see the mouseover/mouseout
    // pair below for what hover does instead). pinNodeId (scene.js) is already a toggle, same as a
    // direct 3D click — clicking the currently-pinned part's own entry again releases it.
    const part = event.target.closest('.lesson-part')
    if (part) pinNodeId(part.dataset.nodeId)
  })
  // Corrected from an earlier hover-triggers-the-blueprint version, per explicit request: hover on
  // a .lesson-part should read as "this is clickable" — the SAME nora-kanji-pulse glow-up-glow-down
  // beep every other clickable tile in this app already uses (.related-kanji in dictionary mode,
  // wired identically here — syncPulseDelay + toggling .is-pulsing on mouseover/mouseout, including
  // the same `contains(relatedTarget)` guard so moving between a part's own children doesn't
  // flicker it), not a preview of the 3D transition itself. The 3D model never responds to a direct
  // click in this mode at all (this section's own header comment) — this is the ONLY route in.
  partsBox.content.addEventListener('mouseover', (event) => {
    const part = event.target.closest('.lesson-part')
    if (!part || part.classList.contains('is-pulsing')) return
    syncPulseDelay(part)
    part.classList.add('is-pulsing')
  })
  partsBox.content.addEventListener('mouseout', (event) => {
    const part = event.target.closest('.lesson-part')
    if (part && !part.contains(event.relatedTarget)) part.classList.remove('is-pulsing')
  })

  if (queue.length === 0) {
    cardBox.setTitle(stageLabel)
    cardBox.setKanji('授業')
    cardBox.setMarquee('empty lesson')
    cardBox.setContent(emptyHtml())
    cardBox.showBack(() => exitToHome())
    cardBox.show()
    return
  }

  // First paint — setContent(), not regenerate(), same convention as every other box's first stage
  // (mountHome's welcomeHtml, mountDictionary's searchContentHtml): the box is still .is-hidden here,
  // so regenerate()'s collapse/flash/reopen would just run invisibly. Every later screen in this
  // session goes through regenerate() instead, same as everywhere else. showBack() (not the `back`
  // option regenerate() takes — there's no regenerate() call at this first-paint point, same as
  // setTitle/setKanji/setMarquee/setContent right above) is what actually puts the arrow up from the
  // very first frame the box is visible, not a beat later once the first regenerate() call runs.
  await loadCard()
  cardBox.setTitle(stageLabel)
  cardBox.setKanji('授業')
  cardBox.setMarquee(`unrevealed ${currentEntry.kanji}`)
  cardBox.setContent(frontHtml())
  cardBox.showBack(() => exitToHome())
  cardBox.show()
}

// async: searchBox's own content is now inserted via regenerate() (below), not the synchronous
// setContent() this used to call — everything after that await depends on #kanji-search-input etc.
// actually existing in the DOM, which regenerate() doesn't guarantee until its Phase 2 applyStage()
// actually runs. Nothing currently awaits mountDictionary() itself (every call site — the
// 'dictionary' click, #back-to-home-btn's own round trip, the ?view=dictionary bootstrap — already
// fires it without awaiting), so making it async changes nothing for any of them.
// Dictionary mode — also the WHOLE implementation of "Flashcards 2" (apps/web/CLAUDE.md's
// "Flashcards — a lesson-scoped Dictionary" section), not a separate mount function that happens to
// look similar. Passing `series`+`lessonNumber` is the ONLY thing that ever distinguishes the two:
// no search bar, the "or try one of these" tile grid becomes that lesson's own full kanji list
// instead of a hand-picked one, the right box gates its content behind a "reveal" click, the exit
// button returns to the lesson's own grid instead of leaving outright, and the box's own topbar
// stays fixed on "{series} lesson N" / 授業 instead of following whatever's loaded. Everything else
// — the 3D viewer, the left info box's structural-parts pin/zoom, the "also appears in N other
// kanji" cross-reference list, all of it — is the literal same code, unconditionally, for both. A
// bug fix or improvement here applies to both (and every deck) automatically; that's the entire
// point of NOT forking this into a second copy.
async function mountDictionary({ series = null, lessonNumber = null } = {}) {
  app.classList.remove('is-home')
  app.innerHTML = `
    <div id="viewer-container">
      <div id="viewer-loading">読み込み中...</div>
    </div>
  `

  const container = document.querySelector('#viewer-container')
  const viewerLoading = document.querySelector('#viewer-loading')

  // `DECK_DATA` maps each real deck's own `series` key to its kanji-by-lesson data — the ONLY
  // place that mapping lives, so adding a third deck later is one more entry here, not a new
  // branch threaded through the rest of this function. genkiKanji entries carry
  // `{kanji, gloss, on, kun, examples}` (src/data/genki/genkiKanji.json); minnaKanji entries are
  // just `{kanji}` (src/data/minna/minnaKanji.json, own import comment for why) — `lessonEntries`
  // below only ever reads `.kanji`, so the extra genki-only fields are inert either way.
  const DECK_DATA = { genki: genkiKanji, minna: minnaKanji }

  // `lessonEntries` is null in real dictionary mode, an array (possibly empty, for an unknown
  // series/lesson combination) in lesson mode — `isLessonMode` is the one flag every
  // lesson-specific branch below checks, never `series`/`lessonNumber` directly, so "lesson mode is
  // on" always means "there's a real entries array to read from," never a number with nothing
  // behind it. `series` alone used to be enough to key this (genkiKanji only) — now that a second
  // deck exists with its own, colliding lesson numbers (genki 3-23, minna 1-50), both are required
  // together; there's no meaningful "lessonNumber with no series" case left to default around.
  const lessonEntries = series != null && lessonNumber != null ? (DECK_DATA[series]?.[String(lessonNumber)] ?? []) : null
  const isLessonMode = lessonEntries !== null

  // The character actually loaded into the 3D viewer right now — declared up here
  // (not down by loadChar, where it conceptually "belongs") because renderSearchDisplay below reads
  // it on every render, including the very first synchronous syncSearchField() call a few lines
  // down; declaring it any later would be a genuine TDZ ReferenceError on that first call, not just
  // bad style.
  let currentChar = null

  // The most recently loaded bundle, held here ONLY while lesson mode's reveal-gate is showing its
  // "reveal" prompt instead of the real content — see loadChar/showRevealPrompt below. Always null
  // outside lesson mode; nothing reads it there.
  let pendingRevealBundle = null

  // The related-kanji box — a createMossBox() instance, not raw markup. Any future box (an AR toggle
  // panel, a flashcard, whatever) should be built the same way: see src/ui/mossBox.js. No initial
  // title — the topbar shows whatever's currently pinned, set fresh on every renderPinInfo.
  const infoBox = createMossBox({ id: 'info-panel', position: 'left' })
  document.body.appendChild(infoBox.el)

  // The search box — same moss-box chrome as infoBox (topbar AND bottombar both, not just one), same
  // content-glow/blur typography, floating on the right of the viewer instead of the left. Replaces
  // the old top #controls bar entirely: no separate "input row", the search field lives inside the
  // box itself. Title, corner glyph, and bottombar marquee are all static ('search' / '検索' /
  // '検索 - search') — unlike infoBox, there's no "currently pinned thing" for any of the three to
  // track, so all of them just label the box itself rather than following the loaded character. In
  // lesson mode the TITLE becomes '{series} lesson N' instead — same "label the box itself" idea,
  // just fixed on the LESSON instead of the generic act of searching, so you always know which
  // lesson you're browsing no matter which of its kanji happens to be loaded (Q5, apps/web/CLAUDE.md
  // own "Flashcards" section) — `series` is in the title now specifically because there's more than
  // one deck (genki's own lesson numbers collide with minna's), so "lesson 3" alone would be
  // genuinely ambiguous. The CORNER GLYPH is 授業 ("lesson/class") — specific to "you're inside one
  // particular lesson," distinct from the deck-picker's own 教科書 ("textbook") one level up and each
  // deck's own 元気/日本語 one level up from that. This used to be unified to 単語 ("word/vocabulary")
  // threaded through the whole flashcards journey — welcome → deck picker → lesson list → here —
  // reverted back to 授業 once the feature was renamed 'flashcards' → 'textbooks' and 単語 was
  // retired as the shared glyph in favor of 教科書 at the deck-picker level; 授業 was the original,
  // deliberately-discarded choice for this exact screen before that unification happened. The title
  // text (not the glyph) is what actually disambiguates series here.
  const searchBoxTitle = isLessonMode ? `${series} lesson ${lessonNumber}` : 'search'
  const searchBoxKanji = isLessonMode ? '授業' : '検索'
  const searchBox = createMossBox({ id: 'search-panel', position: 'right', title: searchBoxTitle, kanji: searchBoxKanji })
  document.body.appendChild(searchBox.el)
  searchBox.setMarquee(isLessonMode ? `${series} lesson ${lessonNumber} 授業` : 'search 検索') // setMarquee
  // measures real widths, so this must come after appendChild above — see mossBox.js's usage comment.
  // #search-examples' own title + tiles — in lesson mode this IS the whole entry point (no search
  // bar, see .search-field's own comment below), populated from this lesson's real kanji list
  // instead of the hand-picked starter set; real dictionary mode is completely untouched, still that
  // same hand-picked list. Building these as plain strings here, ahead of the template literal below,
  // rather than an inline ternary inside it — the lesson tile list needs a real `.map()`, which
  // doesn't fit cleanly inline the way a short ternary does. `searchExamplesTitle` is dictionary-mode
  // only now (used to also cover lesson mode, "{series} lesson {N} kanji") — removed by explicit
  // request as redundant: the searchBox's own TITLE already says "{series} lesson N" right there in
  // the same box, same reasoning as `updateBackLabel`'s own bare "close lesson"/"back to lesson"
  // above. The markup below skips the title line entirely in lesson mode rather than rendering it
  // empty.
  const searchExamplesTitle = 'or try one of these'
  const searchExamplesTiles = isLessonMode
    ? lessonEntries.map((e) => `<button class="related-kanji" data-char="${e.kanji}">${e.kanji}</button>`).join('')
    // DICTIONARY_TRY_EXAMPLES (module scope, above SLEEP MODE) — the same list, not a second
    // hardcoded copy of it; sleep mode's own screensaver cycle reuses it too (SLEEP_CHARACTERS).
    : DICTIONARY_TRY_EXAMPLES.map((c) => `<button class="related-kanji" data-char="${c}">${c}</button>`).join('')

  // Dictionary mode's own real content, applied via regenerate() (below, after show()) instead of
  // the usual first-paint setContent() — per explicit request: this box should play the SAME
  // closed→glow→bump-open entrance every stage transition elsewhere in this app already uses, not
  // just appear fully formed. Works here specifically because this box's content is genuinely empty
  // beforehand (nothing else has ever called setContent on it) — regenerate()'s own Phase 1 collapse
  // is a real no-op (0 → 0), so the visible sequence is exactly "closed, flash, bump open to this."
  const searchContentHtml = `
    <!-- Lesson mode hides this row entirely (inline display:none) rather than omitting it from the
         template — every element inside it (searchInput/searchCaret/searchPlaceholder/searchField
         below) still gets queried and wired up unconditionally further down this function, and a
         hidden-but-present element answers those queries the same as a visible one; omitting the
         markup outright would mean guarding a dozen call sites against null instead. The learner
         never sees or focuses it either way — it just stops being how a lesson's own kanji get
         selected, that's #search-examples's job now (see its own comment further down). -->
    <div class="search-field"${isLessonMode ? ' style="display:none"' : ''}>
      <input
        id="kanji-search-input"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
      />
      <!-- The actual visible glyph — a real element instead of relying on the <input>'s own text,
           reusing .info-character verbatim (the left box's headline-glyph class) for a genuine 1:1
           match, not a re-derived copy. This exists because CSS filter/-webkit-text-stroke on a
           native form control's own text is exactly what was causing the grey box: it forces Chrome
           to rasterize the control (native appearance/chrome included) to composite the effect, and
           on at least some Chrome/GPU combinations that backing paints non-transparent — confirmed
           to persist even on committed (not just mid-composition) text. #kanji-search-input's own
           text is made fully transparent below (see its CSS) and stays only for real typing/caret/
           IME composition — this div is what's actually seen, synced to its value on every change
           (syncSearchField below) — same fix already applied to the placeholder, extended to the
           real typed text.
           Its actual CONTENT is built by renderSearchDisplay, not a plain textContent assignment —
           see that function for the identify-vs-select kanji-boxing system. -->
      <div id="kanji-search-display" class="info-character" aria-hidden="true"></div>
      <!-- The blinking cursor — a real styled bar instead of the native caret. caret-color can only
           change a native caret's COLOR, nothing else (not its width, not a glow, not a blink
           rhythm), so getting the "fatter, lo-fi glass/glow, old-school" look asked for means
           building our own and hiding the real one (see #kanji-search-input's own caret-color:
           transparent below) — positioned by JS (updateCaret below) to track the real cursor. -->
      <div id="kanji-search-caret" aria-hidden="true"></div>
      <!-- Reuses .related-title verbatim (the "also appears in..." line's own class) for the same
           1:1-match reason as above. -->
      <div id="kanji-search-placeholder" class="related-title">enter any kanji to explore its dualities</div>
    </div>
    <!-- Whatever's actually selected right now — not part of .search-field (the input row stays put
         above this the whole time; only this section animates). Reuses .info-character/.info-subtitle
         VERBATIM (the left box's own pinned-glyph headline, 1:1 — not a re-derived copy), just showing
         the WHOLE selected character's own gloss instead of one part's. Starts collapsed
         (style.css's #search-selected, max-height:0) and bump-expands + fades its lines in every time
         loadChar succeeds (updateSearchSelected below) — including the very first, default load, so
         the app always opens with the same little "something loaded" flourish rather than a special
         case only for later clicks.

         Moved to sit BEFORE #search-examples in the DOM (was after it) — real bug, reported directly:
         closing this over #search-examples reappearing (both toggle on the exact same backspace-to-
         empty event, syncSearchField below) used to read as "drops down, glitches out" instead of a
         clean fade in place. Root cause wasn't this element's own transition at all — #search-examples
         reappearing is a plain display:none → display:block toggle with NO transition of its own
         (style.css's #search-examples.is-hidden), so it snaps back INSTANTLY, in the same synchronous
         call that starts this element's ~300-400ms fade-out. With #search-examples sitting ABOVE this
         one in the DOM (the old order), that instant reappearance shoved this element — mid-fade — the
         full height of the examples grid further down the page in a single frame, before its own
         collapse even had a chance to start. Moving this element earlier in the flow means nothing
         reappearing below it can ever push it around while it's closing — the actual fix, not a
         retuned easing curve (a prior pass fixed a real overshoot-clamp bug in this element's own
         collapse curve, apps/web/CLAUDE.md, but that was a separate, smaller issue from this one). -->
    <div id="search-selected">
      <!-- Lesson mode's reveal-gate — see main.js's loadChar/showRevealPrompt for the mechanism.
           Always rendered (both modes), never just styling: real dictionary mode never adds
           #search-selected's own 'reveal-pending' class, so #search-selected-reveal-prompt's
           display:none default (style.css) never gets overridden there — genuinely inert, not
           merely unused, so there's nothing conditional here to keep in sync with isLessonMode
           elsewhere in this template. A plain .mode-option/.related-title button, matching every
           OTHER real button on this box (the exit button just below), not a bespoke look ported from
           the old flashcards' own reveal button. -->
      <div id="search-selected-reveal-prompt" class="mode-option-list">
        <button class="mode-option" id="search-selected-reveal-btn">
          <span class="related-title">reveal</span>
        </button>
      </div>
      <div id="search-selected-content">
        <div id="search-selected-character" class="info-character"></div>
        <div id="search-selected-gloss" class="info-subtitle"></div>
        <!-- Only strokes + JLPT are actually shown right now (see formatStats) — on'yomi/kun'yomi/
             grade still come through in every bundle and aren't going anywhere, there's just no UI
             for them at the moment. Reuses .related-title VERBATIM (the exact same class the
             placeholder uses — same font/blur/glow/squish, not a re-derived approximation of it; an
             earlier version of this line used a bespoke plain-dim-Arial look instead, which is exactly
             what didn't match). -->
        <div id="search-selected-stats" class="related-title"></div>
      </div>
    </div>
    <!-- A handful of hand-picked starting points for anyone who doesn't have a way to type kanji —
         shown ONLY while the field is genuinely empty (syncSearchField below toggles this the exact
         same way it already toggles #kanji-search-placeholder — same condition, same moment), gone
         the instant anything's typed. Reuses .related-title/.related-list/.related-kanji VERBATIM
         (the left box's own click-through-list recipe, 1:1 — tile size, jade glow, hover-pulse, and
         now the reactive 3D bleed-through too) rather than a bespoke "example chip" component.

         Selection criteria, evolved through a few real corrections — see apps/web/CLAUDE.md's own
         "#search-examples" section for the full history/reasoning per pick, not repeated here:
         started as pure STRUCTURAL variety, shifted to atmospheric/evocative meaning over
         beginner-textbook-common (明/好/鳴/etc. proposed, explicitly rejected as "boring"), a
         two-part semantic story is a bonus where the data supports one, never a hard requirement.

         CURRENTLY OVERSIZED ON PURPOSE — a deliberately large batch ("add all of these then we'll
         take some away, process of elimination"), not a finished set; expect this list to shrink.
         Every character below was verified to actually exist in the dataset and split cleanly
         (category 2) before being added — that's the one non-negotiable bar for a pick here,
         independent of which ones survive elimination.

         Sits AFTER #search-selected in the DOM now (used to be before it) — see that element's own
         comment for why: this block reappearing instantly (no transition) is exactly what used to
         shove #search-selected down mid-fade when it sat above it. -->
    <div id="search-examples">
      ${isLessonMode ? '' : `<div class="related-title">${searchExamplesTitle}</div>`}
      <div class="related-list">${searchExamplesTiles}</div>
    </div>
    <!-- Was a standalone position:fixed button in the top-left corner of the page; moved here, last
         in this box's content flow, so it's always at the bottom of the search box instead — see the
         function header comment above. .mode-option/.auth-submit give the BUTTON itself the same
         full-width glass-tab hover every stage of the home page's own box already uses (plain CSS
         :hover, no JS wiring needed) — .auth-submit itself is a leftover name from the now-removed
         login/signup forms it was originally built for, kept here purely for its one real rule
         (centering content that isn't naturally flanked by a sibling), not renamed since this is its
         only remaining caller. The label is plain .related-title, NOT .mode-option-label —
         deliberately: .mode-option-label overrides .related-title's own font-size (15px) and margin
         (0, tuned to keep home's own buttons a uniform short height next to each other) for ITS box's
         own context. This box has neither concern — its own English text (the placeholder, "or try
         one of these", the stats line) is all plain, unoverridden .related-title, so the back
         button's label uses the exact same class alone to read as genuinely the same text, not a
         same-family-different-size cousin of it. -->
    <!-- Static "close dictionary" in real dictionary mode, unchanged. In lesson mode this label is
         dynamic — see updateBackLabel below — because the button's own ACTION is two different things
         depending on whether a character is currently loaded: with one loaded, it returns to this
         lesson's own tile grid (never leaves the screen); with nothing loaded (already on the grid),
         it leaves the lesson entirely, same as real dictionary's own exit. -->
    <button id="back-to-home-btn" class="mode-option auth-submit">
      <span class="related-title" id="back-to-home-label">close dictionary</span>
    </button>
  `
  searchBox.show() // BEFORE regenerate() — regenerateBox assumes an already-visible box (it never
  // touches .is-hidden itself), same reason spawnFrom's own callers always show() first too.
  // Awaited — every DOM reference below (searchInput, searchDisplay, ...) reads from #search-panel's
  // own content, which regenerate() only actually inserts partway through its own Phase 2. Querying
  // any earlier would find nothing yet (a real bug caught here: this used to be the synchronous
  // setContent(), where that was never a concern).
  await searchBox.regenerate({ html: searchContentHtml })

  // regenerateBox() (mossBox.js) permanently pins .nora-moss-content's own max-height/min-height to
  // whatever it measured the ONE time this box's content was built — correct for a box that keeps
  // calling regenerate() (every measurement then reflects the box's real current content), wrong
  // here: #search-panel's title/kanji/marquee/content never regenerate() again (see this box's own
  // creation comment), and #search-selected below grows on its OWN separate max-height transition,
  // triggered later by loadChar — collapsed (max-height:0, not yet .is-visible) at the exact moment
  // this measurement ran, so the pin landed sized for "just the input row," with no room for
  // #search-selected's later ~280px. That pin then capped the parent .nora-moss-content, so
  // #search-selected's own bump-open had nowhere to go — the box itself never visibly reacted, and
  // the selected character's info (english name, JLPT, etc.) rendered past the pinned ceiling,
  // reachable only by scrolling instead of the box growing to show it. #search-panel has no CSS
  // max-height of its own (unlike #info-panel's 67vh — see that comment in style.css), so nothing
  // needs enforcing here; clearing the pin outright is safe and lets the box auto-size to whatever's
  // really inside it, #search-selected included.
  searchBox.content.style.maxHeight = ''
  searchBox.content.style.minHeight = ''

  const searchInput = document.querySelector('#kanji-search-input')
  const searchDisplay = document.querySelector('#kanji-search-display')
  const searchCaret = document.querySelector('#kanji-search-caret')
  const searchPlaceholder = document.querySelector('#kanji-search-placeholder')
  const searchExamples = document.querySelector('#search-examples')
  const searchSelected = document.querySelector('#search-selected')
  const searchSelectedCharacter = document.querySelector('#search-selected-character')
  const searchSelectedGloss = document.querySelector('#search-selected-gloss')
  const searchSelectedStats = document.querySelector('#search-selected-stats')

  document.querySelector('#back-to-home-btn').addEventListener('click', async () => {
    // Lesson mode only, and only while a character is actually loaded — "return to this lesson's own
    // grid," not "leave the screen." Reuses syncSearchField's OWN existing empty-field path verbatim
    // (currentChar → null, renderPinInfo(null), the graceful exitLoadedKanji()-then-clearKanjiGroup()
    // sequence, #search-selected collapsing) rather than a second, separately-maintained "go back"
    // implementation — setting the (hidden, but still fully wired) search input back to '' and
    // re-syncing is EXACTLY what a real dictionary user backspacing the field to empty already
    // triggers, so this is genuinely the same code path, not a lookalike copy of it.
    if (isLessonMode && currentChar !== null) {
      searchInput.value = ''
      syncSearchField()
      return
    }
    // Both floating boxes play their own "reverse open" before this view actually tears down — per
    // explicit request, closing dictionary mode is the search box's whole entrance choreography
    // (show() + regenerate()'s collapse/flash/bump-open/type) run backwards: closeAndFade()
    // collapses its content, flashes, then fades the whole box away (the exact mirror of that
    // entrance — see closeAndFade's own comment in mossBox.js). infoBox gets the same treatment,
    // guarded the same way renderPinInfo(null) above already guards it (and the same way
    // transitionToDictionary's own radioBox handling guards despawnTo): skip the animation if it's
    // already hidden (nothing pinned when "close dictionary" was clicked) — nothing to reverse-open
    // out of in that case. A THIRD, equally real exit runs alongside these two now: if a character is
    // still loaded in the viewer (`currentChar !== null` — the OTHER of the "two possible states" the
    // explicit ask distinguished; if you've backed the search field out to empty first, currentChar is
    // already null and there's nothing here to animate), `exitLoadedKanji()` (scene.js) eases it back
    // to normal size if it was mid-zoom, then dissolves it away — see that function's own comment for
    // the full two-step design. All three run CONCURRENTLY (Promise.all, not sequenced) specifically
    // so the kanji's own exit reads as part of the SAME moment the box is closing, not a separate
    // beat before or after it.
    await Promise.all([
      infoBox.el.classList.contains('is-hidden') ? Promise.resolve() : infoBox.closeAndFade(),
      searchBox.closeAndFade(),
      currentChar === null ? Promise.resolve() : exitLoadedKanji(),
    ])
    // infoBox/searchBox are appended straight to <body> (see below), not #app, so they need their
    // own cleanup here — #app.innerHTML in this function only clears #viewer-container. closeAndFade
    // only animates each box to its own .is-hidden resting state, it doesn't detach anything —
    // removal still has to happen explicitly, same as it always did.
    document.querySelector('#info-panel')?.remove()
    document.querySelector('#search-panel')?.remove()
    // Known gap, not fixed here: mountScene (src/viewer/scene.js) has no dispose/unmount of its
    // own yet, so the WebGLRenderer this view created is never explicitly released — going home and
    // back into dictionary repeatedly currently leaks one GL context per round-trip. Acceptable for
    // this pass (the terrarium's own dispose was the one that actually mattered here — it's the
    // "absolute monolith", see terrarium.js's header comment); a real fix means giving mountScene a
    // matching dispose(), not something to improvise here.
    // mountHome(true) — was a plain mountHome() (landing on welcome), corrected by explicit request:
    // closing dictionary should return to select mode, not all the way back to welcome (mountHome's
    // own `startAtSelectMode` option, "The home page" above).
    mountHome(true)
  })

  // Keeps the exit button's own label matching what it's ABOUT to do — no-op outside lesson mode
  // (stays "close dictionary" the whole time, set once in the template above). Called once at setup
  // (initial state, nothing loaded yet — "close lesson") and again every time currentChar changes,
  // both directions: loadChar (a character just loaded — "back to lesson") and syncSearchField's own
  // empty-field branch (back to nothing loaded — "close lesson" again). Deliberately bare — no
  // series, no lesson number — by explicit request: the searchBox's own TITLE (`searchBoxTitle`
  // above) already says "{series} lesson N" right there in the same box, so this button repeating it
  // was redundant; "close lesson"/"back to lesson" reads fine regardless of which lesson you're in.
  const backToHomeLabel = document.querySelector('#back-to-home-label')
  function updateBackLabel() {
    if (!isLessonMode) return
    backToHomeLabel.textContent = currentChar === null ? 'close lesson' : 'back to lesson'
  }
  updateBackLabel()

  // Lesson mode's own reveal-gate button — see #search-selected-reveal-prompt's own template comment
  // above for why this element always exists but only ever does anything in lesson mode.
  // `pendingRevealBundle` (declared with currentChar, near the top of this function) is what
  // loadChar/showRevealPrompt stashed for exactly this moment. Guarded so a stray click after a
  // NEWER load already superseded this one (fast tile-clicking) can't reveal stale content —
  // showRevealPrompt always overwrites `pendingRevealBundle` with whatever's actually current before
  // this could ever fire on it.
  const revealBtn = document.querySelector('#search-selected-reveal-btn')
  revealBtn.addEventListener('click', () => {
    if (!pendingRevealBundle) return
    searchSelected.classList.remove('reveal-pending')
    revealBtn.classList.remove('is-pulsing') // hidden either way once reveal-pending drops, but keeps
    // state honest for anything that later inspects this button while it's off-screen
    updateSearchSelected(pendingRevealBundle)
  })

  // Only strokeCount + jlpt are actually shown, by request — bundle.on/bundle.kun/bundle.grade
  // (see data-pipeline/CLAUDE.md for where these come from) are still present in every bundle,
  // there's just no UI reading them right now; re-adding a readings line later is just a matter of
  // formatting them, not re-extracting anything. `jlpt`'s own field is KANJIDIC2's OLD 4-level test
  // (pre-2010 revision, 1=hardest through 4=easiest) and no longer officially maintained — labeled
  // "N{level}" to match the familiar modern JLPT format, even though the underlying number is from
  // that older scale, not a live mapping to the current N1-N5 system.
  function formatStats(bundle) {
    const parts = []
    if (bundle.strokeCount) parts.push(`${bundle.strokeCount} strokes`)
    if (bundle.jlpt) parts.push(`JLPT N${bundle.jlpt}`)
    return parts.join('   -   ')
  }

  // createTypewriter is shared (imported from mossBox.js — see its own comment there) since the
  // home page's box-regenerate choreography needs the identical effect for its own labels; this was
  // the original use, now generalized rather than duplicated.
  const typeGloss = createTypewriter()
  const typeStats = createTypewriter() // same effect, now also used for the strokes/JLPT line

  // Plays the reveal for whatever's actually selected — called from loadChar every time it
  // succeeds. All three motions start together, not in sequence: #search-selected's own max-height
  // bump-expands (style.css — "drop down"), the glyph glows up from nothing via a plain opacity fade
  // (style.css's #search-selected-character transition — no scale/blur any more, see that rule's own
  // comment for why), and the gloss types in letter by letter (typeGloss above) — all triggered in
  // the same tick.
  function updateSearchSelected(bundle) {
    searchSelectedCharacter.textContent = bundle.character
    searchSelectedGloss.style.display = bundle.gloss ? '' : 'none' // the rare character with no
    // KANJIDIC2 gloss shouldn't leave an empty line's worth of gap below the glyph
    typeGloss(searchSelectedGloss, bundle.gloss || '')

    // Same typewriter effect as the gloss above, own independent instance (typeStats, not typeGloss
    // — see createTypewriter's own comment for why they can't share one). Hides entirely (not left
    // as empty dead space) when there's nothing to show at all — some obscure/irregular characters
    // have no KANJIDIC2 entry.
    const statsText = formatStats(bundle)
    searchSelectedStats.style.display = statsText ? '' : 'none'
    typeStats(searchSelectedStats, statsText)

    // Dropping .is-revealed first and forcing a reflow before re-adding it is what makes the glyph's
    // glow-in replay on EVERY call, not just the first — without the reflow, removing and
    // immediately re-adding the same class in the same tick is a no-op as far as the browser's style
    // engine is concerned, and nothing would visibly restart.
    searchSelected.classList.remove('is-revealed')
    searchSelected.classList.add('is-visible')
    void searchSelected.offsetHeight
    searchSelected.classList.add('is-revealed')
  }

  // Lesson mode's own entry point into #search-selected, called from loadChar INSTEAD of
  // updateSearchSelected — the box itself still bump-opens (same `.is-visible`, same real animation
  // every load gets), it just opens onto the reveal button (style.css's own `.reveal-pending` rule)
  // rather than the character/gloss/stats trio. `updateSearchSelected` still runs, for real, once
  // `#search-selected-reveal-btn` is actually clicked — see that listener, above — so the glyph-fade/
  // typewriter reveal plays at THAT moment, same effect a real dictionary load already gets, just
  // deferred behind one extra click. Also (re)starts the button's own idle pulse — explicit request,
  // to draw the eye toward a button that otherwise looks identical to any other resting
  // `.mode-option` — `syncPulseDelay` phase-locks it to the SAME clock every other pulse on the page
  // already shares (this box's own corner glyph included), so it doesn't beat out of sync sitting
  // right there in the same box. style.css's own `#search-selected-reveal-btn` rules invert the
  // usual hover convention: pulsing by default, freezing at the pulse's own bright peak on hover
  // instead of only pulsing ON hover the way `.mode-option.is-pulsing` elsewhere does — see those
  // rules' own comment for why.
  function showRevealPrompt(bundle) {
    pendingRevealBundle = bundle
    syncPulseDelay(revealBtn)
    revealBtn.classList.add('is-pulsing')
    searchSelected.classList.add('reveal-pending')
    searchSelected.classList.add('is-visible')
  }

  // .search-field is the shared positioning base every absolutely-positioned child in the field
  // (display/caret/placeholder) is measured against — grabbed once here for measureCursorOffset below.
  const searchField = document.querySelector('.search-field')

  // Finds the cursor's real pixel X position (relative to the viewport, like getBoundingClientRect)
  // by walking searchDisplay's ACTUAL rendered children up to `cursorIndex` characters in — not a
  // hidden probe measuring one assumed font. That was the previous approach, and it drifted further
  // off with every character added: kanji tokens are fixed 36px glass tiles (.related-kanji) and
  // plain text runs render at 26px (.search-plain-text, not the .info-character 45px the old probe
  // was hardcoded to) — nothing in the real field is actually 45px anymore, so a single-font
  // estimate could only ever be wrong, and increasingly so as more content accumulated.
  function measureCursorOffset(cursorIndex) {
    let remaining = cursorIndex
    for (const child of searchDisplay.childNodes) {
      const len = child.textContent.length
      if (remaining < len) {
        // Cursor lands inside (or right at the start of) this child.
        if (remaining === 0) return child.getBoundingClientRect().left
        const range = document.createRange()
        range.setStart(child.firstChild, 0)
        range.setEnd(child.firstChild, remaining)
        return range.getBoundingClientRect().right
      }
      remaining -= len
    }
    // Cursor is at/after the very end of everything currently rendered (the common case — typing
    // normally always appends at the end).
    const last = searchDisplay.lastChild
    return last ? last.getBoundingClientRect().right : searchDisplay.getBoundingClientRect().left
  }

  // Matches a single real kanji character — CJK Unified Ideographs + Extension A + Compatibility
  // Ideographs, which covers KanjiVG's whole 6,703-character set (all BMP, no surrogate pairs
  // needed). Deliberately NOT hiragana/katakana/romaji/English — see renderSearchDisplay below for
  // how this distinction actually gets used now (identification, not auto-loading).
  const KANJI_RE = /[㐀-䶿一-鿿豈-﫿]/

  // The field only has room to actually show a handful of boxed kanji before they'd start running
  // past the visible edge (a yojijukugo — a 4-character idiom, e.g. 一石二鳥 — is the natural "full
  // box" case) — past this many DISTINCT characters, boxing more would just mean boxes silently
  // scrolling off-screen with the text, which reads as broken rather than merely "there's more
  // text". Deliberately UNIQUE characters, not occurrences: a repeat of a character already within
  // budget (機機, 木木木) still gets boxed every time — it's not spending a new slot, it only counts
  // the first time that particular character is seen. The placeholder text ("enter any kanji to
  // explore its dualities," set in the template above) no longer states this number in plain
  // English (an earlier version, "type or paste up to 4 kanji," did) — this constant is still the
  // one real source of truth for the limit, hitting it still reads as an intentional cap rather
  // than the app silently ignoring a 5th kanji, just via the boxing behavior itself now rather than
  // a number spelled out ahead of time.
  const KANJI_TOKEN_LIMIT = 4

  // Hiragana + katakana — stays in the plain Shippori Mincho look (same as an unboxed kanji past
  // KANJI_TOKEN_LIMIT), NOT the Arial+squish treatment below. Only genuinely Latin/English text
  // (romaji while composing, or any plain English typed/pasted in) gets that.
  const KANA_RE = /[぀-ゟ゠-ヿ]/

  // Splits a string into a sequence of {text, kind} segments for rendering:
  //  - 'kanji': one of the first KANJI_TOKEN_LIMIT distinct kanji characters — its own standalone
  //    segment, never merged with a neighbor even when adjacent (e.g. a pasted 飛行機), since every
  //    kanji needs its own independently clickable box.
  //  - 'plain': kana, or any kanji past KANJI_TOKEN_LIMIT — the original Shippori Mincho look
  //    (.search-plain-text), un-squished, since it's still fundamentally Japanese-script content.
  //  - 'latin': everything else (English letters, romaji, numbers, punctuation) — the SAME
  //    Arial + scaleY squish look every other piece of English in this app uses
  //    (.search-latin-text, reusing .related-title verbatim), not the glyph font.
  // Consecutive characters of the same kind merge into one run; a kind change (or a fresh kanji
  // token) always starts a new one.
  function splitKanjiTokens(str) {
    const segments = []
    let buffer = ''
    let bufferKind = null
    const seen = new Set() // distinct kanji characters boxed so far, in first-seen order

    function flush() {
      if (buffer) segments.push({ text: buffer, kind: bufferKind })
      buffer = ''
    }

    for (const ch of str) {
      const isKanjiChar = KANJI_RE.test(ch)
      const boxable = isKanjiChar && (seen.has(ch) || seen.size < KANJI_TOKEN_LIMIT)
      if (boxable) {
        flush()
        seen.add(ch)
        segments.push({ text: ch, kind: 'kanji' })
        bufferKind = null
        continue
      }
      const kind = isKanjiChar || KANA_RE.test(ch) ? 'plain' : 'latin'
      if (kind !== bufferKind) flush()
      bufferKind = kind
      buffer += ch
    }
    flush()
    return segments
  }

  // Rebuilds searchDisplay's actual DOM content from the current field value. This is a plain
  // IDENTIFICATION pass, not a selection one — the whole point of this system: typing or pasting
  // kanji only ever gets them boxed (.kanji-token, styled like the caret — see style.css), it never
  // loads anything by itself. Selection is a separate, explicit act — see the click listener below.
  // This is what makes the "type on a Japanese IME" flow work correctly: romaji shows as plain
  // English text (no box, nothing to click), it becomes hiragana candidates (still plain text), and
  // only once a real kanji commits (e.g. 協力) does a box appear around EACH one — 協 and 力
  // independently — with nothing auto-selected; the user picks which one they mean by clicking it.
  // Pasting a whole word (e.g. 飛行機) works the same way: three boxes, click any one to load it,
  // click another to switch — "toggling" between them, exactly like the related-kanji tiles in the
  // left box already work.
  //
  // Whichever token's character matches `currentChar` (whatever's actually loaded into the 3D viewer
  // right now) gets `.is-selected`, so the highlight stays correct across a re-render triggered by
  // something unrelated (more typing elsewhere in the string, a fresh paste, etc.) — see loadChar's
  // own call to syncSearchField for the other half of keeping this in sync.
  function renderSearchDisplay(value) {
    searchDisplay.innerHTML = ''
    for (const segment of splitKanjiTokens(value)) {
      if (segment.kind === 'kanji') {
        const token = document.createElement('span')
        // related-kanji reuses the left box's own glass-tile class verbatim (1:1 match, not a
        // re-derived copy — see style.css); kanji-token is just the hook for pointer-events/selection.
        token.className = 'related-kanji kanji-token'
        if (segment.text === currentChar) token.classList.add('is-selected')
        token.dataset.char = segment.text
        token.textContent = segment.text
        searchDisplay.appendChild(token)
        continue
      }
      // Both 'plain' and 'latin' are wrapped in their own span (not a bare text node) specifically
      // so each can carry its own font — see style.css for why .search-plain-text needed a smaller
      // size in the first place (at .info-character's inherited 45px, English descenders, some kana
      // glyphs, and any kanji past KANJI_TOKEN_LIMIT were tall enough to get clipped by
      // #kanji-search-display's fixed 45px content height + overflow:hidden) and why 'latin' gets a
      // completely different class rather than just another size: it's meant to look like the same
      // Arial+squish typography every other piece of English in this app uses, not a smaller glyph.
      const span = document.createElement('span')
      span.className = segment.kind === 'latin' ? 'related-title search-latin-text' : 'search-plain-text'
      span.textContent = segment.text
      searchDisplay.appendChild(span)
    }
  }

  // Keeps searchDisplay (the boxed-kanji glyph render above), the custom caret bar, and
  // searchPlaceholder (hidden the instant the field has ANY content, even mid-IME-composition
  // preedit text — matching native <input> placeholder behavior) all in sync with the real,
  // invisible <input>. Also mirrors the input's own scroll position: a long typed string scrolls the
  // real input horizontally to keep the (invisible) native cursor in view — still happening, since
  // the real input still holds real focus/typing — and both searchDisplay and the caret need that
  // same offset applied manually via transform, or they'd drift out of sync with where the real
  // cursor actually is.
  function syncSearchField() {
    renderSearchDisplay(searchInput.value)
    searchDisplay.style.transform = `translateX(${-searchInput.scrollLeft}px)`
    searchPlaceholder.classList.toggle('is-hidden', searchInput.value.length > 0)
    // Same condition, same moment as the placeholder above — #search-examples is only ever useful
    // alongside "type or paste up to 4 kanji," so it disappears the instant there's anything typed
    // and comes back the instant the field is genuinely empty again, not just on initial load.
    searchExamples.classList.toggle('is-hidden', searchInput.value.length > 0)

    // An empty field (the "type or paste kanji" placeholder showing) has nothing identified, let
    // alone selected — empty search = empty state, full stop, not just this box's own section
    // resetting while a stale character keeps lingering everywhere else (the 3D viewer, the left
    // info box). The `currentChar !== null` guard means this only actually fires once, on the
    // transition INTO empty — not on every subsequent sync call while it stays empty (e.g. repeated
    // keyup events with nothing typed) — and it's also what's checked before (see loadChar) so a
    // real character never gets treated as "already cleared."
    if (searchInput.value.length === 0) {
      searchSelected.classList.remove('is-visible', 'is-revealed', 'reveal-pending') // collapses the
      // same way it opened (the max-height transition already in place, just running in reverse);
      // reveal-pending is lesson-mode-only and a no-op to remove outside it, but cleared
      // unconditionally anyway — a stale class on a collapsed, invisible box is harmless either way,
      // but the next real load (loadChar) re-adds it fresh regardless, so there's nothing gained by
      // leaving it and one less state combination to reason about by clearing it here.
      pendingRevealBundle = null
      if (currentChar !== null) {
        currentChar = null
        updateBackLabel() // lesson mode's exit button reads currentChar too — see its own comment
        renderPinInfo(null) // same call loadChar already uses to hide the left info box
        // Clearing back to empty — real bug, reported directly ("fully glitches... stuck down the
        // bottom of the box... looks like a mistake"): this used to call clearKanjiGroup() straight
        // away, which (a) defaulted to playing the FULL load-in swoop for an empty group with nothing
        // in it to swoop, and (b) never gave whatever was actually on screen a moment before —
        // possibly a part still mid-pin or mid-detach-zoom — any chance to wind down first; its
        // geometry just got yanked out from under it mid-animation. Now runs the SAME graceful exit
        // exitLoadedKanji() already gives dictionary mode when leaving it entirely (#back-to-home-btn,
        // "The dictionary-entry transition" further down) — glow the pinned part back OFF
        // (EXIT_REVEAL, theme.js), THEN fade the whole thing out — genuinely reused, not a second
        // bespoke clear animation. clearKanjiGroup() itself now also loads `animateEntrance: false`
        // (scene.js) — no swoop, ever, for an empty group. The load-IN swoop (loadChar, below) is
        // completely untouched by this — this only changes what happens going TO empty.
        //
        // Fire-and-forget, not awaited: syncSearchField's other synchronous UI updates (caret
        // position, placeholder/examples visibility) shouldn't wait on a ~1s 3D fade to finish. Reuses
        // loadGeneration (loadCharWithLoading's own race guard, further down) as its own guard — a
        // fast retype right after backspacing to empty starts a NEW loadCharWithLoading, which bumps
        // this same counter, so this exit's own delayed clearKanjiGroup() call can tell it's been
        // superseded and skip wiping out the character that just loaded in the meantime.
        //
        // Real bug, reported directly: backspacing out DURING a still-running loadCharWithLoading
        // (the "読み込み中..." text + interaction-lock, further down) left that text stuck up
        // indefinitely — beeping on screen until the NEXT character's own load happened to finish.
        // Root cause: bumping loadGeneration here makes that in-flight loadCharWithLoading's own
        // completion see itself as superseded (`myGeneration !== loadGeneration`) and skip its own
        // cleanup — correct in the ordinary "a newer LOAD took over" case (that newer load's own
        // completion is what's supposed to own the eventual hide/unlock), but backspacing isn't a
        // load, there's no other completion coming to claim that job. Fixed by hiding the indicator
        // right here, unconditionally — a harmless no-op if nothing was loading (removing an
        // already-absent class), but exactly what's needed if something was.
        viewerLoading.classList.remove('is-visible')
        const myClearGeneration = ++loadGeneration
        exitLoadedKanji().then(() => {
          if (myClearGeneration === loadGeneration) clearKanjiGroup()
        })
      }
    }

    // measureCursorOffset already reads searchDisplay's post-scroll rendered position (its own
    // translateX above is baked into getBoundingClientRect's result), so there's no separate
    // scrollLeft term to subtract here the way the old probe-based version needed — this is
    // measuring reality directly, not estimating it from a font assumption plus a manual correction.
    const cursorIndex = searchInput.selectionStart ?? searchInput.value.length
    const cursorX = measureCursorOffset(cursorIndex) - searchField.getBoundingClientRect().left - 2 // -2
    // undoes #kanji-search-caret's own static `left: 2px` base (style.css), which this transform
    // then adds on top of.
    searchCaret.style.transform = `translateX(${cursorX}px)`
  }
  syncSearchField() // initial state for the prefilled default value ('海' — starts hidden)
  searchInput.addEventListener('scroll', syncSearchField) // caret moved past the visible edge via
  // arrow keys/Home/End — scrollLeft changes with no 'input' event at all
  searchInput.addEventListener('click', syncSearchField) // clicking mid-string moves the cursor with
  // no 'input' event at all — same reasoning as 'scroll' above
  searchInput.addEventListener('keyup', syncSearchField) // arrow/Home/End keys move the cursor
  // without changing the value, so they fire no 'input' event either — cheap enough to just re-run
  // the whole sync rather than add a separate cursor-only path
  searchInput.addEventListener('focus', () => {
    searchCaret.classList.add('is-visible')
    syncSearchField()
  })
  searchInput.addEventListener('blur', () => searchCaret.classList.remove('is-visible'))

  // 'input' fires on every keystroke/paste, including mid-IME-composition (isComposing: true) — but
  // unlike the old version of this box, there's no kanji-auto-load logic to skip during composition
  // anymore, so there's nothing left that actually needs to branch on isComposing here. Boxing a
  // kanji the instant it appears — even as a live composition preview, before the candidate is even
  // committed — is exactly the desired behavior (see renderSearchDisplay's own comment), not
  // something to guard against the way auto-loading was.
  searchInput.addEventListener('input', syncSearchField)
  searchInput.addEventListener('compositionend', syncSearchField)

  // #search-examples' own tiles — same "set the field, sync, load" sequence the left box's own
  // related-kanji click uses (further down), not a re-derived version of it. Delegated on
  // searchExamples itself since its tiles never re-render (a static, hand-picked list, unlike the
  // left box's related-kanji list which gets rebuilt per pin).
  searchExamples.addEventListener('click', (event) => {
    const btn = event.target.closest('.related-kanji')
    if (!btn) return
    searchInput.value = btn.dataset.char
    syncSearchField() // renders the new box immediately, same as a manual paste would
    loadCharWithLoading(btn.dataset.char)
  })
  // Same hover-pulse as every other .related-kanji tile in this app (there's no plain CSS :hover
  // for this class — the beep is entirely JS-driven, phase-locked via syncPulseDelay) — without
  // this, these specific tiles would be the one place a related-kanji tile shows no hover feedback.
  searchExamples.addEventListener('mouseover', (event) => {
    const btn = event.target.closest('.related-kanji')
    if (!btn || btn.classList.contains('is-pulsing')) return
    syncPulseDelay(btn)
    btn.classList.add('is-pulsing')
  })
  searchExamples.addEventListener('mouseout', (event) => {
    const btn = event.target.closest('.related-kanji')
    if (!btn || btn.contains(event.relatedTarget)) return
    btn.classList.remove('is-pulsing')
  })

  // A kanji only actually loads into the 3D viewer on an explicit click of its own
  // box — typing or pasting one into the field only ever identifies it (renderSearchDisplay above).
  // Delegated on searchDisplay itself (stable across re-renders) rather than attached per-token,
  // same reasoning as the related-kanji click listener further down. searchDisplay's own
  // pointer-events:none (style.css) lets a click anywhere else in the field fall through to the real
  // <input> underneath as normal — only .kanji-token spans re-enable pointer-events, so only an
  // actual box captures a click here.
  searchDisplay.addEventListener('click', (event) => {
    const token = event.target.closest('.kanji-token')
    if (!token) return
    loadCharWithLoading(token.dataset.char)
  })

  // Same hover-pulse treatment as the left box's own related-kanji tiles (see the mouseover/mouseout
  // pair on infoBox.content further down) — these tokens carry the exact same .related-kanji class,
  // so they get the exact same beep, phase-locked the same way via syncPulseDelay. Duplicated rather
  // than sharing one listener across both containers because searchDisplay's entire subtree gets
  // rebuilt on every render (renderSearchDisplay) — delegating from a stable ancestor still works
  // fine either way, but keeping each box's own delegation on its own container is simpler to reason
  // about than one listener spanning two unrelated parts of the page.
  searchDisplay.addEventListener('mouseover', (event) => {
    const token = event.target.closest('.kanji-token')
    if (!token || token.classList.contains('is-pulsing')) return
    syncPulseDelay(token)
    token.classList.add('is-pulsing')
  })
  searchDisplay.addEventListener('mouseout', (event) => {
    const token = event.target.closest('.kanji-token')
    if (!token || token.contains(event.relatedTarget)) return
    token.classList.remove('is-pulsing')
  })

  // One delegated listener instead of re-attaching per render — revealRelatedList's staggered
  // burst-in means tiles exist in the DOM well before their entrance animation finishes, so a click
  // needs to work immediately on insertion, not after querying+attaching post-animation.
  infoBox.content.addEventListener('click', (event) => {
    const btn = event.target.closest('.related-kanji')
    if (!btn) return
    const char = btn.dataset.char
    searchInput.value = char
    syncSearchField() // setting .value directly doesn't fire 'input', so this needs its own call —
    // renders the new (single-kanji) box immediately; loadChar below will mark it .is-selected once
    // currentChar actually updates (a related-kanji click is an explicit selection, same as clicking
    // a box directly, so it loads right away rather than waiting for a second click).
    loadCharWithLoading(char) // every real load trigger goes through this now — see its own comment.
  })

  // Hovering a related-kanji tile makes it beep in and out exactly like the topbar's own corner
  // glyph — same keyframes, and genuinely in unison with it, not just visually similar. `mouseover`/
  // `mouseout` (not `mouseenter`/`mouseleave`, which don't bubble) delegated the same way as the
  // click listener above, since tiles come and go with every pin. syncPulseDelay computes a fresh
  // animation-delay right here, at the actual moment this specific hover starts — that's what locks
  // it to the corner glyph's phase regardless of how long that glyph has already been pulsing; see
  // its comment in mossBox.js for the reasoning.
  infoBox.content.addEventListener('mouseover', (event) => {
    const tile = event.target.closest('.related-kanji')
    if (!tile || tile.classList.contains('is-pulsing')) return
    syncPulseDelay(tile)
    tile.classList.add('is-pulsing')
  })
  infoBox.content.addEventListener('mouseout', (event) => {
    const tile = event.target.closest('.related-kanji')
    if (!tile || tile.contains(event.relatedTarget)) return
    tile.classList.remove('is-pulsing')
  })

  const { setKanjiGroup, clearKanjiGroup, setInteractive, exitLoadedKanji, swoopDurationMs, normalMaterial } = mountScene(container, {
    onPin: renderPinInfo,
  })

  let componentIndex = null
  loadComponentIndex().then((idx) => {
    componentIndex = idx
  })

  // Fires only on an actual click-to-pin (or click-to-unpin), never on plain hover — hover still
  // drives the 3D material glow (see scene.js) but no longer touches the box at all. `screenPos` is
  // the pinned element's on-screen projection, passed only when pinning something (null on unpin) —
  // see scene.js's projectGroupCenter — it's where the spawn animation's shard originates from.
  async function renderPinInfo(userData, screenPos) {
    if (!userData) {
      // closeAndFade(), not hide() — per explicit request, the left box always plays its own
      // "reverse open" (collapse content, flash, fade away — the exact mirror of spawnFrom's own
      // entrance, see that function's comment in mossBox.js) any time it closes, not just on the
      // dictionary→home round trip below. Guarded the same way transitionToDictionary's own
      // radioBox handling already guards despawnTo: skip the animation entirely if the box is
      // already hidden (e.g. loadChar's own renderPinInfo(null) firing with nothing ever pinned
      // yet) — nothing to reverse-open out of in that case.
      if (!infoBox.el.classList.contains('is-hidden')) infoBox.closeAndFade()
      return
    }
    const { element, gloss, useful, node_id } = userData
    const label = element ?? '(structural wrapper — no element)'

    // Topbar/bottombar chrome is set instantly — the staggered reveal below is for the box's actual
    // content, not its frame. Falls back to the glyph itself for the rarer part with no gloss.
    infoBox.setTitle(gloss || label)
    infoBox.setKanji(label)
    infoBox.setMarquee(gloss ? `${label} · ${gloss}` : label)

    const landed = await infoBox.spawnFrom(screenPos.x, screenPos.y)
    if (!landed) return // superseded by a newer click before this one finished landing

    const headerLines = [
      `<div class="info-character">${label}</div>`,
      gloss ? `<div class="info-subtitle">${gloss}</div>` : null,
      `<div class="info-kind${useful ? '' : ' noise'}">${useful ? 'USEFUL' : 'NOISE'}</div>`,
      `<div class="info-row"><span>node</span><span>${node_id}</span></div>`,
    ].filter(Boolean)

    const revealed = await infoBox.revealLines(headerLines)
    if (!revealed) return

    if (useful && element) await infoBox.revealRelatedList(buildRelatedHtml(element))
  }

  // Every OTHER character sharing this component — this is the actual payoff of the whole
  // classification pipeline: the same visual pattern, reinforced across the corpus. See root
  // CLAUDE.md concept. No display cap — the box itself scrolls (#info-panel's max-height +
  // .nora-moss-content's overflow:auto) instead of truncating with a "+N more" note, so a component
  // shared by 200+ kanji is fully reachable, just requires scrolling to see all of it.
  function buildRelatedHtml(element) {
    if (!componentIndex) return `<div class="related-title">Loading related kanji…</div>`

    const related = (componentIndex[element] ?? []).filter((k) => k.character !== currentChar)
    if (related.length === 0) {
      return `<div class="related-title">No other kanji share this component</div>`
    }

    const buttons = related
      .map((k) => `<button class="related-kanji" data-char="${k.character}">${k.character}</button>`)
      .join('')
    return `
      <div class="related-title">Also appears in ${related.length} other kanji</div>
      <div class="related-list">${buttons}</div>
    `
  }

  async function loadChar(char) {
    try {
      const bundle = await loadKanjiBundle(char)
      currentChar = bundle.character
      // interactive: false — every dictionary load now starts non-interactive, on purpose (see
      // loadCharWithLoading's own comment for why: clicking/hovering a part mid-swoop, before the
      // material has settled to normalMaterial, was producing real broken-looking states — a
      // half-lit part, a pin landing on something that's about to move/rescale under it). This is
      // the SAME `interactive` gate flashcard mode already uses (src/viewer/scene.js), just applied
      // here for the swoop instead of a recall test. loadCharWithLoading calls setInteractive(true)
      // once the swoop has actually finished — never here.
      // `bundle` here (not just to buildKanjiGroup) is what actually lets scene.js's own
      // playStrokeGeneration run — see setKanjiGroup's own comment on that option for why it needs
      // the raw bundle again, separately from the group buildKanjiGroup already built from it.
      setKanjiGroup(buildKanjiGroup(bundle, normalMaterial), { interactive: false, bundle })
      renderPinInfo(null) // scene.js clears its pinned selection on load too, but doesn't know to
      // clear main.js's displayed panel — without this the old character's pinned info panel content
      // stays on screen looking like it still applies. Real bug, found by testing this exact flow.
      syncSearchField() // refreshes which .kanji-token (if any) shows as .is-selected now that
      // currentChar has changed — needed here specifically because a direct box click doesn't call
      // syncSearchField any other way (the related-kanji-tile click handler does call it, but BEFORE
      // this line runs, so that call alone can't yet know the new currentChar).
      updateBackLabel() // exit button reads currentChar — see its own comment for why lesson mode
      // needs this kept in sync on every change, not just at setup.
      // Lesson mode gates the reveal — see showRevealPrompt/the reveal button's own click handler
      // above. Every load resets back to un-revealed, deliberately stateless, same as this app's
      // other review mechanics (apps/web/CLAUDE.md's "Flashcards" section) — even re-selecting a
      // kanji you already revealed once starts fresh.
      if (isLessonMode) {
        showRevealPrompt(bundle)
      } else {
        updateSearchSelected(bundle) // drop-down/pop-up reveal of the whole selected character + its
        // own gloss, below the input — see that function's own comment.
      }
      // searchBox's own title/corner glyph/marquee stay fixed in real dictionary mode ('search' /
      // '検索' / '検索 - search', set once at creation) rather than following the loaded character —
      // unlike infoBox, this box's chrome labels itself, not "what's currently shown". In lesson mode
      // it's ALSO fixed, just on the lesson instead — see its creation comment above.
    } catch (err) {
      // No status line anymore (search box is just the input) — surface a load failure (a kanji
      // outside KanjiVG's 6,703-character set) to the console instead of silently doing nothing.
      console.error(`Failed to load "${char}":`, err.message)
    }
  }

  // A real (not simulated) loading state, shown for the swoop-in's own real duration — reworked from
  // an earlier version with an artificial 1.5s floor, scoped to only the related-kanji click path.
  // Now EVERY real trigger of a fresh character load in dictionary mode goes through this — the
  // related-kanji click, the #search-examples starter tiles, a .kanji-token selection, and the
  // (currently unreachable, kept for consistency) initial-boot default — and the indicator's
  // lifetime is tied to the ACTUAL swoop
  // (`swoopDurationMs`, read from scene.js — theme.js's own LOAD_SWOOP.durationMs, not a guessed
  // number), not a fixed floor: appears the instant a load starts, disappears the instant the swoop
  // has genuinely settled to normal size, facing front. Interactivity is locked for that exact same
  // window — explicit request, and a real bug this fixes: clicking/hovering a part mid-swoop, before
  // the material had settled to normalMaterial, was producing broken-looking states (a half-lit
  // part, a pin landing on geometry that was still mid-rescale under it). `loadChar` above always
  // loads `interactive: false`; `setInteractive(true)` here is the ONLY place that ever turns it back
  // on, timed to fire in the same instant the loading text hides.
  //
  // `loadGeneration` is a real, confirmed bug fix, not defensive-programming-for-its-own-sake: click
  // one related kanji, then a second one before the first's own swoop-length wait has resolved, and
  // the FIRST call's delayed `.remove('is-visible')`/`setInteractive(true)` would fire AFTER the
  // second one, cutting the second (newer, still-loading) character's own indicator/interaction-lock
  // off early — exactly what "I saw it once, then it never came back" looked like. Same "a generation
  // counter, bumped per attempt, gates whether a stale async completion is still allowed to act"
  // pattern mossBox.js's own spawnFrom/regenerate already use for the identical class of problem.
  let loadGeneration = 0

  async function loadCharWithLoading(char) {
    const myGeneration = ++loadGeneration
    // Phase-locks the pulse's own animation-delay the same way every other pulsing element in this
    // app does (see syncPulseDelay's own comment in mossBox.js) — computed fresh at the exact moment
    // THIS instance starts, so it settles into the same shared phase as whatever else happens to be
    // pulsing right now instead of drifting on its own local clock.
    syncPulseDelay(viewerLoading)
    viewerLoading.classList.add('is-visible')
    await loadChar(char)
    await new Promise((resolve) => setTimeout(resolve, swoopDurationMs))
    if (myGeneration !== loadGeneration) return // superseded by a newer load — let ITS completion
    // be the one that hides the indicator and unlocks interaction, not this stale one.
    viewerLoading.classList.remove('is-visible')
    setInteractive(true)
  }

  // No default character pre-loaded any more (searchInput used to carry value="海") — per explicit
  // request, dictionary mode now opens on a genuinely empty search box: placeholder showing, nothing
  // pinned. Same "empty search = empty state everywhere" convention
  // this file's own syncSearchField already established for CLEARING the field back to empty; this
  // is just that same starting state applying on load too, not a second implementation of it.
  if (searchInput.value) loadCharWithLoading(searchInput.value)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTRY POINT — home by default. `?view=dictionary`/`?view=flashcards` are dev-only shortcuts (not a
// real router: there's still exactly one page/URL) so dictionary/flashcard work doesn't require
// clicking through the options box (and, for flashcards, the terrarium's own teardown animation —
// genuinely unreliable to sit through in this session's own sandboxed Browser-pane tooling, apps/web/
// CLAUDE.md's "This session's sandbox limitations") on every reload while iterating on either one.
// `?view=flashcards` always opens genki lesson 20 specifically — same reasoning `dev-skip-to-
// flashcards` (welcomeHtml, above) already picked it: real category variety (atomic/irregular/split)
// in one deck, not a lesson that happens to be all one kind. Points at mountDictionary({lessonNumber})
// now, not the old mountFlashcardSession — same live-UI switch as transitionToFlashcardSession above,
// so this shortcut keeps testing whatever's actually reachable from the real app.
// ═══════════════════════════════════════════════════════════════════════════════
const devView = new URLSearchParams(window.location.search).get('view')
if (devView === 'dictionary') {
  mountDictionary()
} else if (devView === 'flashcards') {
  mountDictionary({ series: 'genki', lessonNumber: 20 })
} else {
  mountHome()
}
