// A "moss box" is the reusable floating glass card every panel in this app's UI should be built
// from — ported 1:1 from moss x kanji FINAL's NORA design system (public/moss-final.css) and
// generalized here so a *future* box (not just the related-kanji box this was built for) can drop
// in with the same chrome instead of re-deriving CSS from scratch. The actual visual recipe (glass
// blur, glow, custom properties) lives in style.css's "NORA glass-box design system" section — this
// file only builds the DOM shape that CSS expects, plus a small imperative API on top of it.
//
// Structure (topbar and bottombar are each optional, independently — a box with neither is just
// the base glass card, which is exactly how moss's own #info-panel is built):
//
//   .nora-moss-box[.is-hidden]
//     .nora-moss-topbar-container          — present iff `title` and/or `kanji` given
//       .nora-moss-topbar-back[.is-hidden] — back arrow, mirrored to the corner glyph's own corner
//                                             (left:10px vs its right:10px). Always in the DOM once
//                                             a topbar exists, but hidden unless a caller opts in via
//                                             showBack()/hideBack() — most boxes never show one.
//       .nora-moss-topbar-label-wrap > .nora-moss-title
//       .nora-moss-topbar                  — the actual glass blur strip (backdrop-filter)
//       .nora-moss-topbar-kanji            — small pulsing glyph in the corner
//     .nora-moss-content                   — always present; caller's real content goes here.
//                                             Sits one z-layer ABOVE the box's glass background
//                                             (.nora-moss-box::before) with no blur of its own, so
//                                             content reads crisp — the glow is text-shadow on the
//                                             content's own classes (.info-character etc.), not a
//                                             blur filter over the text. Only the topbar/bottombar
//                                             strips are actually blurred (they're blurring the 3D
//                                             scene visible behind/around the card, not the text).
//     .nora-moss-bottombar                 — present iff `marquee` given
//       .nora-moss-marquee-wrap > .nora-moss-marquee-text — the text repeated enough times to
//         actually span the bar's full width (see layoutMarquee), then that whole repeated run
//         duplicated once more so translateX(-50%) loops seamlessly regardless of label length.
//
// Usage:
//   const box = createMossBox({ id: 'info-panel', position: 'left' })
//   document.body.appendChild(box.el)   // setMarquee measures real widths, so attach before using it
//   box.setContent('<div class="info-character">氵</div>...')   // first paint only — see regenerate below
//   box.show() / box.hide()
//   box.setKanji('氵'); box.setTitle('water'); box.setMarquee('water 氵')   // English before kanji,
//   plain space, no separator — this app's real marquees' own convention (main.js), not the
//   middle-dot `infoBox` uses for its OWN "label · gloss" (a different pairing entirely)
//   box.showBack(() => renderPreviousStage()); box.hideBack()
//   box.regenerate('<span data-typewriter>...</span>')   // any LATER content change that's a real
//     // user-facing transition — closes to the tabs, pops back open, types itself in; see
//     // regenerateBox's own header comment further down for the full choreography.

const POSITION_CLASS = {
  left: 'nora-moss-box--float-left',
  right: 'nora-moss-box--float-right',
}

// Constant scroll speed for every marquee, regardless of label length — a one-character label and
// a long English gloss both drift at the same px/s instead of one crawling and one racing, because
// layoutMarquee derives the animation-duration from the measured content width, not a fixed number.
const MARQUEE_SPEED_PX_PER_SEC = 40

// Must match @keyframes nora-kanji-pulse's cycle length in style.css (1.6s) — see syncPulseDelay.
export const KANJI_PULSE_MS = 1600

// A CSS `animation: infinite` restarts its local clock at whatever moment it's actually applied —
// two elements that start "the same" animation at different real times end up out of phase with
// each other, even with identical duration/timing/keyframes. To make an element's pulse land in
// step with every OTHER element using this same function (regardless of when each one starts),
// compute animation-delay as the negative of "how far into the current global cycle are we right
// now" (performance.now() mod the cycle length) at the exact moment the animation is applied. The
// algebra: effective_phase(t) = (t - t_applied + delay) mod duration; substituting
// delay = -(t_applied mod duration) makes t_applied cancel out entirely, leaving
// effective_phase(t) = t mod duration for every caller — a shared reference clock, not "time since
// I personally started," so it doesn't matter that the topbar's corner glyph was created seconds
// or minutes before a tile's hover pulse begins.
function pulseDelayValue(durationMs = KANJI_PULSE_MS) {
  return `${-((performance.now() % durationMs) / 1000)}s`
}

export function syncPulseDelay(el, durationMs = KANJI_PULSE_MS) {
  el.style.animationDelay = pulseDelayValue(durationMs)
}

export function createMossBox({ id, position = 'left', extraClass = '', title = '', kanji = '' } = {}) {
  const box = document.createElement('section')
  if (id) box.id = id
  box.className = ['nora-moss-box', POSITION_CLASS[position], extraClass, 'is-hidden'].filter(Boolean).join(' ')
  box.setAttribute('aria-live', 'polite')

  box.innerHTML = [buildTopbar(title, kanji), '<div class="nora-moss-content"></div>'].join('')

  const content = box.querySelector('.nora-moss-content')
  attachHeavyScroll(content) // every box's content gets the weighted scroll for free, not just this one

  // Bumped on every spawnFrom()/reveal call — the reveal helpers check it before each async step
  // and bail out silently if it's moved on, so clicking a second element mid-animation cleanly
  // abandons the first sequence instead of both fighting over the same DOM.
  let generation = 0

  // The back arrow is always in the DOM once a topbar exists (see buildTopbar) but starts hidden —
  // showBack()/hideBack() below just toggle it and swap which function a click actually calls, so
  // callers don't need to re-attach a listener every time the box moves to a different stage (see
  // apps/web's home-page state machine in main.js for why that matters: one box, several stages,
  // each stage's "back" goes somewhere different). Click/hover are delegated on `box` itself (not
  // `content`) since the back button lives in the topbar, outside .nora-moss-content.
  let backHandler = null
  box.addEventListener('click', (event) => {
    if (event.target.closest('.nora-moss-topbar-back') && backHandler) backHandler()
  })
  // Deliberately NOT a plain :hover glow — "clean"/static at rest per request; hover instead beeps
  // via .nora-moss-topbar-back.is-pulsing in style.css, same white family and same syncPulseDelay
  // treatment as every other hover-pulse in this app.
  box.addEventListener('mouseover', (event) => {
    const btn = event.target.closest('.nora-moss-topbar-back')
    if (!btn || btn.classList.contains('is-pulsing')) return
    syncPulseDelay(btn)
    btn.classList.add('is-pulsing')
  })
  box.addEventListener('mouseout', (event) => {
    const btn = event.target.closest('.nora-moss-topbar-back')
    if (!btn || btn.contains(event.relatedTarget)) return
    btn.classList.remove('is-pulsing')
  })

  // Pulled out of the returned object below so BOTH the public setTitle()/setKanji()/setMarquee()/
  // showBack()/hideBack() methods AND regenerate()'s internal applyStage() (which needs to apply all
  // of them together, at one specific instant mid-animation — see regenerateBox's header comment)
  // share one implementation instead of two copies drifting apart.
  function applyTitle(text) {
    ensureTopbar(box, title, kanji)
    box.querySelector('.nora-moss-title').textContent = text
  }
  function applyKanji(text) {
    ensureTopbar(box, title, kanji)
    box.querySelector('.nora-moss-topbar-kanji').textContent = text
  }
  function applyMarquee(text) {
    ensureBottombar(box)
    layoutMarquee(box, text)
  }
  function applyBack(onClick) {
    ensureTopbar(box, title, kanji)
    backHandler = onClick || null
    box.querySelector('.nora-moss-topbar-back').classList.toggle('is-hidden', !onClick)
  }

  return {
    el: box,
    content,
    setContent(html) {
      content.innerHTML = html
    },
    // The universal "close to the tabs, flash, pop back open, type itself in" system — see
    // regenerateBox's own header comment above for the full choreography and exactly why the order
    // matters. Use this instead of setContent()/setTitle()/etc. for any content change that's a real
    // user-facing transition (a new "page" for this box); reserve the plain setters for the very
    // first paint, before the box has ever been shown (nothing would be visible to animate anyway).
    // `title`/`kanji`/`marquee`/`back` are all optional — omit any of them to leave that piece of
    // chrome as it already is; `back` is a click handler to show the back arrow, or `null`/omitted
    // to hide it (see applyBack above) — all four apply at the exact same instant as `html`, under
    // cover of the flash, never independently. `maxContentHeight` (optional, px, TOTAL height —
    // same unit as getBoundingClientRect()) caps how tall the box grows for THIS content; past that,
    // content scrolls instead of the box growing further — see regenerateBox's own comment on
    // targetHeight for how the cap interacts with the rest of the sizing math.
    async regenerate({ title: newTitle, kanji: newKanji, marquee: newMarquee, back, html, maxContentHeight } = {}) {
      const myGen = ++generation
      return regenerateBox(
        box,
        content,
        () => {
          if (newTitle !== undefined) applyTitle(newTitle)
          if (newKanji !== undefined) applyKanji(newKanji)
          if (newMarquee !== undefined) applyMarquee(newMarquee)
          if (back !== undefined) applyBack(back)
          content.innerHTML = html
        },
        () => myGen === generation,
        maxContentHeight,
      )
    },
    setTitle(text) {
      applyTitle(text)
    },
    setKanji(text) {
      applyKanji(text)
    },
    setMarquee(text) {
      applyMarquee(text)
    },
    showBack(onClick) {
      applyBack(onClick)
    },
    hideBack() {
      applyBack(null)
    },
    show() {
      box.classList.remove('is-hidden')
    },
    hide() {
      generation++ // abandon any in-flight spawn/reveal — nothing should keep animating into a hidden box
      box.classList.add('is-hidden')
    },

    // The click-to-pin entrance: a small shard flies from (x,y) — the clicked element's on-screen
    // position — to this box, "glitch-expanding" into its closed (topbar+bottombar only) shape,
    // does a quick fake-render flicker, then bump-expands to full height. Resolves once the box is
    // full size and ready for content — still empty, see revealLines/revealRelatedList below.
    // Returns false if superseded by a newer spawnFrom/hide before finishing (caller should bail).
    async spawnFrom(x, y) {
      const myGen = ++generation
      return spawnFrom(box, content, x, y, () => myGen === generation)
    },

    // The exact mirror of spawnFrom, played in reverse: content fades, the box bump-COLLAPSES back
    // to its closed (topbar+bottombar only) shape, the same fake-render flicker, then a shard
    // glitch-SHRINKS out of that closed shape down to a small chip at (x, y) — the box becomes the
    // shard, rather than the shard becoming the box. Ends in the same resting `.is-hidden` state
    // hide() leaves the box in (a later spawnFrom starts clean either way). Also bumps `generation`,
    // so an in-flight spawnFrom/revealLines this supersedes bails out the same way hide() already
    // does. Returns false if superseded by a newer spawnFrom/despawnTo/hide before finishing.
    async despawnTo(x, y) {
      const myGen = ++generation
      return despawnTo(box, content, x, y, () => myGen === generation)
    },

    // A box that's leaving for good with no destination point to fly toward (unlike despawnTo) —
    // the dictionary-entry transition's own "left box closes up and glows, then disappears" (see
    // main.js's transitionToDictionary). Three beats: content collapses to its closed
    // (topbar+bottombar-only) shape (regenerateBox's own Phase 1, verbatim — same collapse
    // mechanics, same closing easing), the same rise-then-fall white flash regenerateBox's own
    // Phase 2 uses (the "glow"), then the whole box fades out via the ordinary `.is-hidden`
    // opacity transition (the "disappear") — no shard, no reopening. Returns false if superseded.
    async closeAndFade() {
      const myGen = ++generation
      return closeAndFade(box, content, () => myGen === generation)
    },

    // Reveals an array of content-block HTML strings one at a time, each fading/sliding in with a
    // short stagger — "for water the first line with the water radical loads, then..." Appends into
    // `target` if given (e.g. a sticky header wrapper the caller already put in `content`),
    // otherwise straight into `content`. Returns the last appended element, or null if superseded.
    async revealLines(lines, target) {
      const myGen = generation
      return revealLines(target || content, lines, () => myGen === generation)
    },

    // Inserts the full related-kanji section (already-complete HTML: the "Also appears in..."
    // title + the entire tile grid) instantly for correctness, then plays a staggered burst-glow
    // entrance ONLY on the tiles currently visible without scrolling — the rest just appear, since
    // animating something the viewer can't see yet without scrolling first would be wasted motion.
    async revealRelatedList(html) {
      const myGen = generation
      return revealRelatedList(content, html, () => myGen === generation)
    },
  }
}

// Both .nora-moss-title and .nora-moss-topbar-kanji are always rendered once a topbar exists at
// all (even empty at creation time) — setTitle()/setKanji() can then always find them later,
// rather than needing to know which of `title`/`kanji` happened to be passed at construction. An
// empty span is visually inert.
function buildTopbar(title, kanji) {
  if (!title && !kanji) return ''
  // Computed right here, at the actual moment this markup is built (i.e. the corner glyph's real
  // creation time) — see syncPulseDelay's comment for why this specific instant is what matters.
  return `
    <div class="nora-moss-topbar-container">
      <button type="button" class="nora-moss-topbar-back is-hidden" aria-label="back">←</button>
      <div class="nora-moss-topbar-label-wrap"><span class="nora-moss-title">${title}</span></div>
      <div class="nora-moss-topbar"></div>
      <span class="nora-moss-topbar-kanji" style="animation-delay: ${pulseDelayValue()}">${kanji}</span>
    </div>
  `
}

function buildBottombar() {
  return `
    <div class="nora-moss-bottombar">
      <div class="nora-moss-marquee-wrap">
        <span class="nora-moss-marquee-text"></span>
      </div>
    </div>
  `
}

// Repeats `text` enough times that the rendered run comfortably exceeds the bar's own width, then
// duplicates that whole run once more — translateX(-50%) in the CSS keyframe then always slides by
// exactly one full run's width, which is seamless (repeat N == repeat N) no matter how many
// repeats N ends up being. Without this, a short label (a single kanji, "海 · sea") produces less
// total content than the bar is wide, so the "loop" just slides that short text partway into the
// visible area and leaves the rest of the bar blank instead of actually crossing it.
function layoutMarquee(box, text) {
  const wrap = box.querySelector('.nora-moss-marquee-wrap')
  const textEl = box.querySelector('.nora-moss-marquee-text')
  if (!wrap || !textEl) return

  // Measure one repeat's real rendered width (text + its CSS padding-right spacer) in the box's
  // own font context, rather than guessing — a throwaway probe node, same classes, off-screen.
  const probe = document.createElement('span')
  probe.className = 'nora-moss-marquee-text'
  probe.style.cssText = 'position:absolute; visibility:hidden; animation:none; transform:scaleY(0.58);'
  probe.innerHTML = `<span>${text}</span>`
  textEl.parentElement.appendChild(probe)
  const unitWidth = probe.getBoundingClientRect().width || 60
  probe.remove()

  const barWidth = wrap.getBoundingClientRect().width || 350
  // +1 extra repeat beyond bare coverage so there's no seam gap at the exact edge case where the
  // bar width divides evenly into unitWidth.
  const repeats = Math.max(3, Math.ceil(barWidth / unitWidth) + 1)
  const duration = (repeats * unitWidth) / MARQUEE_SPEED_PX_PER_SEC

  textEl.style.setProperty('--marquee-duration', `${duration.toFixed(2)}s`)
  textEl.innerHTML = Array.from({ length: repeats * 2 }, () => `<span>${text}</span>`).join('')
}

// setTitle/setKanji are only meaningful once a topbar exists — a box created with neither `title`
// nor `kanji` has no .nora-moss-topbar-container to update. Rather than silently no-op (surprising)
// or throw (a caller doing `createMossBox({}); box.setTitle(...)` is a reasonable pattern), build
// the topbar lazily the first time it's actually needed.
function ensureTopbar(box, title, kanji) {
  if (box.querySelector('.nora-moss-topbar-container')) return
  box.insertAdjacentHTML('afterbegin', buildTopbar(title || ' ', kanji || ' '))
}

// Mirrors ensureTopbar — setMarquee works even on a box created with no bottombar yet.
function ensureBottombar(box) {
  if (box.querySelector('.nora-moss-bottombar')) return
  box.insertAdjacentHTML('beforeend', buildBottombar())
}

// A weighted, damped scroll instead of native 1:1 wheel tracking — every wheel/trackpad tick nudges
// a target scroll position, and the element's actual scrollTop eases toward that target a fraction
// at a time each frame, rather than jumping straight there the way native scrolling does. That lag
// is the whole point: it reads as "heavier"/old-school compared to native OS momentum, which tracks
// input directly and only decelerates lightly at the end. Takes over scrolling entirely (calls
// preventDefault on every wheel event) rather than layering on top of native scroll, so the two
// don't fight each other and produce a jittery double-scroll. An earlier attempt used pure CSS
// scroll-snap for a similar "settles into place" feel — dropped for feeling glitchy in practice
// (real user testing, not something caught by inspection); this is a deliberate, if heavier,
// replacement of that.
const SCROLL_EASE = 0.14

function attachHeavyScroll(el) {
  let target = el.scrollTop
  let ticking = false

  function tick() {
    const current = el.scrollTop
    const diff = target - current
    if (Math.abs(diff) < 0.5) {
      el.scrollTop = target
      ticking = false
      return
    }
    el.scrollTop = current + diff * SCROLL_EASE
    requestAnimationFrame(tick)
  }

  el.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      // Resync to the element's real scrollTop before applying this tick's delta, but only when
      // nothing's currently animating — covers content being reset out from under us (a fresh pin
      // clears .nora-moss-content and its scroll position along with it) without disrupting an
      // already-in-progress smooth scroll on every single wheel event.
      if (!ticking) target = el.scrollTop
      const max = el.scrollHeight - el.clientHeight
      target = Math.min(max, Math.max(0, target + event.deltaY))
      if (!ticking) {
        ticking = true
        requestAnimationFrame(tick)
      }
    },
    { passive: false },
  )
}

// ════════════════════════════════════════════════════════════════════════════════
// Click-to-pin spawn animation — a small white shard flies from the clicked 3D element to the
// box, glitch-expanding into its closed (topbar+bottombar-only) shape; a quick fake-render
// flicker; a bump-expand to full height; then content reveals line by line, and the related-kanji
// tiles burst in one by one. Every stage checks `stillCurrent()` before proceeding and bails
// silently if a newer spawn/hide has superseded it — see the `generation` counter above.
// ════════════════════════════════════════════════════════════════════════════════

const LINE_STAGGER_MS = 90
const BURST_STAGGER_MS = 32

async function spawnFrom(box, content, x, y, stillCurrent) {
  content.innerHTML = ''
  // Defensive reset — closeAndFade (above) deliberately PINS these four properties to their closed
  // (0) values instead of clearing them when it closes this same box (see that function's own
  // finally comment for why), so a box that most recently closed via closeAndFade needs them cleared
  // back to ordinary CSS auto-sizing here, before this reveals anything new — otherwise the incoming
  // content would render permanently clipped to 0 height, with nothing else in this box's lifecycle
  // ever un-pinning it. A no-op the rest of the time (a box that's never been through closeAndFade
  // has no inline overrides on these to begin with).
  content.style.maxHeight = ''
  content.style.minHeight = ''
  content.style.paddingTop = ''
  content.style.paddingBottom = ''
  box.classList.remove('is-hidden')

  // Freeze the box's natural (full) max-height in px so we can transition to/from it — it's
  // normally driven by CSS (e.g. #info-panel's 67vh, which stays responsive to viewport resizes);
  // every inline override this function sets gets cleared in the `finally` below, win or lose, so
  // ordinary CSS (including .is-hidden) governs again once this attempt is done either way.
  const naturalMaxHeight = getComputedStyle(box).maxHeight
  const topbar = box.querySelector('.nora-moss-topbar-container')
  const bottombarEl = box.querySelector('.nora-moss-bottombar')
  const collapsedHeight = (topbar?.offsetHeight ?? 0) + (bottombarEl?.offsetHeight ?? 0) || 64

  // Laid out at its real collapsed size/position (so the shard has a real rect to fly to and
  // land on) but invisible — opacity stays 0 through the whole flight. Nothing about the box
  // (not even its empty closed topbar+bottombar shape) should be visible until the shard actually
  // arrives; revealing it any earlier was a real bug — the closed box sat there in place before
  // the shard even started moving, instead of the shard's landing being what makes it appear.
  box.style.transition = 'none'
  box.style.opacity = '0'
  box.style.transform = 'scale(1)'
  box.style.maxHeight = `${collapsedHeight}px`
  void box.offsetHeight // force reflow: lock in the collapsed rect below, and stop the jump above
  // from retroactively animating once transitions are re-enabled in phase 3

  try {
    if (!stillCurrent()) return false
    const rect = box.getBoundingClientRect() // the box's real on-screen rect, now collapsed (still invisible)

    // Phase 1 — flying shard: glitch-expands from (x,y) to the collapsed box's rect
    const shard = document.createElement('div')
    shard.className = 'moss-spawn-shard'
    document.body.appendChild(shard)
    try {
      await flyShard(shard, x, y, rect)
    } finally {
      // The box becomes visible at the exact instant the shard finishes arriving — same frame the
      // shard is removed, so the handoff reads as "the shard became the box" rather than the box
      // having been sitting there the whole time underneath it.
      box.style.opacity = '1'
      shard.remove()
    }
    if (!stillCurrent()) return false

    // Phase 2 — fake-render flicker over the landed (still-collapsed) box
    await flicker(box)
    if (!stillCurrent()) return false

    // Phase 3 — bump-expand to full height (overshoot easing = the "bump")
    box.style.transition = 'max-height 340ms cubic-bezier(.34,1.56,.64,1)'
    void box.offsetHeight
    box.style.maxHeight = naturalMaxHeight
    await waitTransitionEnd(box, 'max-height', 500)
    return stillCurrent()
  } finally {
    // Unconditional cleanup, success or cancelled: a spawn superseded mid-flight (or mid-expand)
    // must not leave opacity/transform pinned open via inline style — inline style outranks any
    // class selector, so a stray `opacity: 1` here would permanently defeat .is-hidden's `opacity:
    // 0` and hide() would stop visibly hiding the box. Real bug, caught by testing a click landing
    // on a related-kanji tile (which loads a new character, which calls hide()) mid-render.
    box.style.opacity = ''
    box.style.transform = ''
    box.style.maxHeight = ''
    box.style.transition = ''
  }
}

// The mirror of spawnFrom above, run in reverse — see despawnTo's own comment on the returned
// object (top of this file) for the phase-by-phase reasoning. Used by the radio box's logout
// exit (main.js) so it retracts the same way it arrived, instead of just fading in place.
async function despawnTo(box, content, x, y, stillCurrent) {
  const topbar = box.querySelector('.nora-moss-topbar-container')
  const bottombarEl = box.querySelector('.nora-moss-bottombar')
  const collapsedHeight = (topbar?.offsetHeight ?? 0) + (bottombarEl?.offsetHeight ?? 0) || 64

  try {
    // Phase 1 — content fades out fast. This box's content was never going to be revealed line by
    // line again on the way out, so a quick opacity fade is enough to keep the collapse right after
    // from reading as a raw content clip (the box has overflow:hidden — see .nora-moss-box in
    // style.css — so content would otherwise just get chopped off mid-shrink with no fade at all).
    content.style.transition = 'opacity 150ms ease'
    content.style.opacity = '0'
    await waitTransitionEnd(content, 'opacity', 250)
    if (!stillCurrent()) return false

    // Phase 2 — bump-COLLAPSE the box's own max-height back down to its closed (topbar+bottombar
    // only) shape — the mirror of spawnFrom's own Phase 3 bump-EXPAND. Freezes the box's CURRENT
    // real height first (same "lock in a real px rect before animating" move spawnFrom's own Phase 1
    // makes) so there's a genuine starting point to collapse from, not whatever CSS max-height this
    // box happens to have (which is deliberately larger than any real content needs — see e.g.
    // #radio-panel's own comment in style.css). Plain ease, NOT spawnFrom's own overshoot bump-
    // expand easing: a bounce reads as a wobble on a CLOSING motion, not a pop — the exact same
    // reasoning regenerateBox's own Phase 1 comment already documents for content's collapse, just
    // applied here to the box's own max-height instead. Reuses that same closing easing family
    // (cubic-bezier(.4,0,.2,1)) so every "closing" motion in this app reads as one consistent feel.
    const startHeight = box.getBoundingClientRect().height
    box.style.transition = 'none'
    box.style.maxHeight = `${startHeight}px`
    void box.offsetHeight
    box.style.transition = 'max-height 280ms cubic-bezier(.4,0,.2,1)'
    box.style.maxHeight = `${collapsedHeight}px`
    await waitTransitionEnd(box, 'max-height', 400)
    if (!stillCurrent()) return false

    // Phase 3 — the same fake-render flicker spawnFrom's own landing plays, now right before this
    // box launches instead of right after it arrives.
    await flicker(box)
    if (!stillCurrent()) return false

    // Phase 4 — flying shard: the mirror image of spawnFrom's own arrival. Glitch-SHRINKS from the
    // box's own (now-closed) rect down to a small chip landing at (x, y) — the box becomes the
    // shard, rather than the shard becoming the box. The box goes invisible the instant the shard
    // starts flying, same "the shard IS the box" handoff spawnFrom's own arrival uses, just reversed.
    const rect = box.getBoundingClientRect()
    box.style.opacity = '0'
    const shard = document.createElement('div')
    shard.className = 'moss-spawn-shard'
    document.body.appendChild(shard)
    try {
      await flyShardBack(shard, rect, x, y)
    } finally {
      shard.remove()
    }
    return stillCurrent()
  } finally {
    // Unconditional cleanup, same reasoning as spawnFrom's own finally: land in the ordinary
    // `.is-hidden` resting state (governed by CSS again, not leftover inline style) regardless of
    // whether this actually finished or was superseded mid-flight, so a later spawnFrom always
    // starts from a clean slate.
    box.classList.add('is-hidden')
    box.style.opacity = ''
    box.style.transform = ''
    box.style.maxHeight = ''
    box.style.transition = ''
    content.style.opacity = ''
    content.style.transition = ''
  }
}

// A box leaving for good, no destination point to fly toward — despawnTo's simpler sibling for
// exactly that case (see the returned closeAndFade's own comment on the returned object, above, for
// where this is actually used). Phase 1 is regenerateBox's own Phase 1 content-collapse, verbatim
// (same measure-real-height-then-collapse-to-0 mechanics, same closing easing) — reused rather than
// re-derived since it's already correct there. Phase 2 is the SAME rise-then-fall white flash
// regenerateBox's own Phase 2 uses (flashIn immediately followed by flashOut, not just flashIn alone
// — a flash that only rises and stays white would read as "the box turned solid white," not a glow
// that comes and goes). Phase 3 is the box's own ordinary `.is-hidden` opacity/transform fade
// (`.nora-moss-box.is-hidden`, style.css) — no shard, no reopening, this box is just gone.
async function closeAndFade(box, content, stillCurrent) {
  const TRANSITIONED_PROPS = ['max-height', 'min-height', 'padding-top', 'padding-bottom']
  const easeTransition = (ms) => TRANSITIONED_PROPS.map((p) => `${p} ${ms}ms cubic-bezier(.4,0,.2,1)`).join(', ')

  let shield = null
  try {
    // Phase 1 — collapse content to a genuine 0, same mechanics as regenerateBox's own Phase 1
    // (see that function's own comment for why real-height-first, not straight to 0px).
    content.style.transition = 'none'
    content.style.overflow = 'hidden'
    content.style.maxHeight = `${content.scrollHeight}px`
    void content.offsetHeight
    content.style.transition = easeTransition(280)
    content.style.maxHeight = '0px'
    content.style.minHeight = '0px'
    content.style.paddingTop = '0px'
    content.style.paddingBottom = '0px'
    await waitTransitionEnd(content, 'max-height', 450)
    if (!stillCurrent()) return false
    await waitUntilHeightReached(content, 0, 300)
    if (!stillCurrent()) return false

    // Phase 2 — the glow: one continuous rise-then-fall over the now-closed box. The box's own
    // disappearing fade starts HERE too, under cover of the shield, not after it — a real, confirmed
    // bug without this: starting the fade only once the shield had fully cleared left a visible gap
    // where the small closed (but still fully opaque) box reappeared for a beat before its own
    // separate fade-out began — "closes, flashes white, POPS BACK, then disappears," not one
    // continuous "flash, then gone" (reported directly, watching the about-overlay feature use this
    // same function). Starting the fade now gives it the flash's full ~520ms (flashIn+flashOut) to
    // finish well within cover, instead of racing it against flashOut afterward.
    //
    // The shield itself moves OUT of `box` for this — `document.body`, `position:fixed`, sized to
    // box's own real (now-collapsed) rect — specifically so its own opacity can't be affected by
    // box's simultaneous fade. CSS opacity is inherently multiplicative down the DOM tree; if the
    // shield stayed a CHILD of `box` while `box` itself faded to 0, the shield's own "solid white"
    // would fade along with its parent instead of staying fully opaque, and the flash would visibly
    // dim out early instead of reading as one clean bright pulse. z-index bumped to 41 to match
    // (the same tier `.moss-spawn-shard` already uses, "above every .nora-moss-box it flies over" —
    // style.css) since this shield is now a body-level sibling of every box instead of nested inside
    // one, no longer covered by that box's own local stacking context (`isolation: isolate`).
    shield = document.createElement('div')
    shield.className = 'moss-regen-flash'
    const shieldRect = box.getBoundingClientRect()
    shield.style.position = 'fixed'
    shield.style.left = `${shieldRect.left}px`
    shield.style.top = `${shieldRect.top}px`
    shield.style.width = `${shieldRect.width}px`
    shield.style.height = `${shieldRect.height}px`
    shield.style.zIndex = '41'
    // Real, reported bug: while this shield was a CHILD of `box`, it got its rounded corners for free
    // from box's own `border-radius: 14px` + `overflow: hidden` clipping anything inside it (the exact
    // thing regenerateBox's OWN separate shield — untouched, still nested inside box — still relies on
    // today, which is why THAT flash still looks correct). Moving this one out to document.body for the
    // opacity fix above silently lost that free clipping — the flash rendered as a plain white
    // rectangle with hard square corners instead of matching the box's own curved shape. `.moss-regen-
    // flash` itself carries no border-radius of its own (relied entirely on the parent's clipping, per
    // its own original comment), so it has to be set explicitly here now that this shield stands alone.
    shield.style.borderRadius = '14px'
    document.body.appendChild(shield)
    box.classList.add('is-hidden')
    await flashIn(shield)
    if (!stillCurrent()) {
      shield.remove()
      return false
    }
    await flashOut(shield)
    shield.remove()
    shield = null
    if (!stillCurrent()) return false

    // Phase 3 — confirm the fade genuinely finished. It should have, well within the flash's own
    // ~520ms above — this is a safety net now, not the primary driver of the disappearance.
    await waitTransitionEnd(box, 'opacity', 400)
    return stillCurrent()
  } finally {
    // Pinned to their closed (0) values, NOT cleared to '' — the exact same fix regenerateBox's own
    // finally already documents needing, for the identical reason: this function only ever animates
    // content's rendered HEIGHT down to 0, it never clears content's actual HTML, so the real
    // (still-present) markup is sitting right there ready to spring back to its full natural size the
    // instant nothing constrains it any more. Clearing the constraint here was a real, confirmed bug:
    // on the ordinary completed path the box is already .is-hidden by the time this runs, so the
    // "burst back open" was merely invisible (opacity 0) rather than actually gone — but on a run that
    // gets SUPERSEDED (a newer spawnFrom/hide/despawnTo/closeAndFade bumping generation) before Phase 3
    // ever reaches `is-hidden`, stillCurrent() returns false and this `finally` still runs — clearing
    // the constraint then un-collapsed the box's real content while it was still fully VISIBLE, i.e.
    // exactly "closes, flashes, reopens, then disappears" (whatever superseded this then took over and
    // actually finished hiding/reopening it). Staying pinned closed means this box only ever grows
    // again once something that actually wants to show content explicitly says so — see spawnFrom's own
    // defensive reset of these same four properties, right where it starts revealing something new.
    shield?.remove()
    content.style.transition = ''
    content.style.overflow = ''
    content.style.maxHeight = '0px'
    content.style.minHeight = '0px'
    content.style.paddingTop = '0px'
    content.style.paddingBottom = '0px'
  }
}

function flyShard(shard, fromX, fromY, rect) {
  const lerp = (a, b, t) => a + (b - a) * t
  const jitter = () => (Math.random() - 0.5) * 16

  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const startSize = 14
  const startScaleX = startSize / rect.width
  const startScaleY = startSize / rect.height
  const startTX = fromX - cx
  const startTY = fromY - cy

  // The shard's own box is sized/positioned to the DESTINATION rect from the start; the "small box
  // at the click point" look comes entirely from the initial transform (translate to the click
  // point, scaled down to ~14px) animating down to identity — a standard FLIP-style approach, GPU-
  // animated via transform only rather than animating left/top/width/height directly.
  shard.style.left = `${rect.left}px`
  shard.style.top = `${rect.top}px`
  shard.style.width = `${rect.width}px`
  shard.style.height = `${rect.height}px`
  shard.style.borderRadius = '14px'

  const anim = shard.animate(
    [
      {
        transform: `translate(${startTX}px, ${startTY}px) scale(${startScaleX}, ${startScaleY}) skewX(0deg)`,
        opacity: 1,
        filter: 'brightness(1.8)',
        offset: 0,
      },
      {
        transform: `translate(${lerp(startTX, 0, 0.2) + jitter()}px, ${lerp(startTY, 0, 0.18) + jitter()}px) scale(${lerp(startScaleX, 1, 0.22)}, ${lerp(startScaleY, 1, 0.15)}) skewX(-7deg)`,
        opacity: 0.5,
        offset: 0.16,
      },
      {
        transform: `translate(${lerp(startTX, 0, 0.55) + jitter()}px, ${lerp(startTY, 0, 0.5) + jitter()}px) scale(${lerp(startScaleX, 1, 0.55)}, ${lerp(startScaleY, 1, 0.4)}) skewX(5deg)`,
        opacity: 0.85,
        offset: 0.4,
      },
      {
        transform: `translate(${lerp(startTX, 0, 0.8)}px, ${lerp(startTY, 0, 0.78)}px) scale(${lerp(startScaleX, 1, 0.85)}, ${lerp(startScaleY, 1, 0.75)}) skewX(-2deg)`,
        opacity: 0.7,
        offset: 0.68,
      },
      { transform: 'translate(0px, 0px) scale(1, 1) skewX(0deg)', opacity: 1, filter: 'brightness(1)', offset: 1 },
    ],
    // Back to its original pace — a shortened version of this flight read worse on its own. The
    // "feels slow" complaint wasn't actually the flight's own speed, it was dead air between
    // phases; spawnFrom() below chains flight → flicker → expand with zero gap (each phase starts
    // the instant the previous one's promise resolves), so that's fixed there instead.
    { duration: 420, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' },
  )
  return anim.finished
}

// despawnTo's own flight — the exact time-reversal of flyShard above, not a separately-tuned
// animation: builds the identical 5-keyframe glitch shape flyShard would for shrinking TOWARD
// (toX, toY) (same lerp/jitter math, same cx/cy/scale derivation, just framed as "the point this
// ends at" instead of "the point this starts at"), then literally reverses the keyframe order and
// complements every offset (1 - offset) so the whole motion plays backwards: offset 0's identity
// state becomes the START, offset 1's small-chip-at-the-point state becomes the END. Easing is
// mirrored too — cubic-bezier(.64,0,.78,.39) is flyShard's own cubic-bezier(.22,.61,.36,1) with its
// x/y control points swapped and complemented (1-x, 1-y for each pair), the same "flashIn is the
// literal time-reversal of flashOut" mirroring flashIn/flashOut already use elsewhere in this file —
// an ease-out arrival becomes an ease-in departure, not the same curve played at the same shape in
// the opposite direction (which would look like it decelerates INTO vanishing, backwards).
function flyShardBack(shard, rect, toX, toY) {
  const lerp = (a, b, t) => a + (b - a) * t
  const jitter = () => (Math.random() - 0.5) * 16

  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const startSize = 14
  const endScaleX = startSize / rect.width
  const endScaleY = startSize / rect.height
  const endTX = toX - cx
  const endTY = toY - cy

  shard.style.left = `${rect.left}px`
  shard.style.top = `${rect.top}px`
  shard.style.width = `${rect.width}px`
  shard.style.height = `${rect.height}px`
  shard.style.borderRadius = '14px'

  const forwardKeyframes = [
    {
      transform: `translate(${endTX}px, ${endTY}px) scale(${endScaleX}, ${endScaleY}) skewX(0deg)`,
      opacity: 1,
      filter: 'brightness(1.8)',
      offset: 0,
    },
    {
      transform: `translate(${lerp(endTX, 0, 0.2) + jitter()}px, ${lerp(endTY, 0, 0.18) + jitter()}px) scale(${lerp(endScaleX, 1, 0.22)}, ${lerp(endScaleY, 1, 0.15)}) skewX(-7deg)`,
      opacity: 0.5,
      offset: 0.16,
    },
    {
      transform: `translate(${lerp(endTX, 0, 0.55) + jitter()}px, ${lerp(endTY, 0, 0.5) + jitter()}px) scale(${lerp(endScaleX, 1, 0.55)}, ${lerp(endScaleY, 1, 0.4)}) skewX(5deg)`,
      opacity: 0.85,
      offset: 0.4,
    },
    {
      transform: `translate(${lerp(endTX, 0, 0.8)}px, ${lerp(endTY, 0, 0.78)}px) scale(${lerp(endScaleX, 1, 0.85)}, ${lerp(endScaleY, 1, 0.75)}) skewX(-2deg)`,
      opacity: 0.7,
      offset: 0.68,
    },
    { transform: 'translate(0px, 0px) scale(1, 1) skewX(0deg)', opacity: 1, filter: 'brightness(1)', offset: 1 },
  ]
  const reversedKeyframes = forwardKeyframes
    .slice()
    .reverse()
    .map((kf) => ({ ...kf, offset: 1 - kf.offset }))

  const anim = shard.animate(reversedKeyframes, {
    duration: 420,
    easing: 'cubic-bezier(.64,0,.78,.39)',
    fill: 'forwards',
  })
  return anim.finished
}

function flicker(box) {
  return box.animate(
    [
      { filter: 'brightness(1) contrast(1)', offset: 0 },
      { filter: 'brightness(2.4) contrast(1.3)', offset: 0.15 },
      { filter: 'brightness(0.6) contrast(1)', offset: 0.32 },
      { filter: 'brightness(1.9) contrast(1.2)', offset: 0.5 },
      { filter: 'brightness(0.85)', offset: 0.7 },
      { filter: 'brightness(1) contrast(1)', offset: 1 },
    ],
    { duration: 200, easing: 'steps(6, end)' },
  ).finished
}

// A solid white "flash shield" over the closed box — deliberately NOT flicker() above (that's a
// jittery multi-step brightness/contrast jump, still used as-is by spawnFrom's own landing flicker
// and left untouched there). This is a clean, full white cover instead: a plain div layered over the
// box (`.moss-regen-flash`, style.css). flashIn/flashOut are ONE continuous up-then-down motion, not
// fade-in/hold/fade-out — a real flash bang, symmetric: the rise is the fall played in reverse (see
// flashIn's own comment just below), with no flat plateau anywhere in between. (An earlier version
// held flat at peak opacity for a beat between the two, and before that had a much faster, differently-
// eased rise than fall — both read wrong for different reasons: the hold looked like "a hard white box
// snapping on and off," and the mismatched rise looked like the white just "popped on" rather than
// climbing. The caller below doesn't pause between calling these, so the fall starts the instant the
// rise ends.) Split into two calls (not one keyframe list) purely so the caller can run real work —
// applyStage(), the height measurement, blanking — in the gap between them, at the exact moment the
// shield is at its peak; that gap is synchronous JS (no sleep), so it doesn't introduce a hold of its
// own.
// flashIn is the exact time-reversal of flashOut — same 260ms duration, and 'ease-in' (slow start,
// accelerating into peak) is the mirror of flashOut's 'ease-out' (fast off peak, decelerating to
// nothing) — not a separate, faster "pop" up to white. That symmetry is the actual point: a real
// up-then-down flash reads as ONE shape played forward then backward, not two differently-timed
// motions that both happen to end in white/black.
// CSS transitions (via waitTransitionEnd, same timeout-protected helper every other phase in this
// file already uses), not raw WAAPI .animate().finished — a real, confirmed gap: WAAPI's own
// .finished promise has no timeout fallback at all, so if it never fires for any reason, Phase 2
// hangs forever with no way out. Every OTHER animated step in regenerateBox already goes through
// waitTransitionEnd specifically to avoid that; the flash was the one place that didn't.
function flashIn(shield) {
  shield.style.transition = 'none'
  shield.style.opacity = '0'
  void shield.offsetHeight
  shield.style.transition = 'opacity 260ms ease-in'
  shield.style.opacity = '0.94'
  return waitTransitionEnd(shield, 'opacity', 400)
}
function flashOut(shield) {
  shield.style.transition = 'none'
  shield.style.opacity = '0.94'
  void shield.offsetHeight
  shield.style.transition = 'opacity 260ms ease-out'
  shield.style.opacity = '0'
  return waitTransitionEnd(shield, 'opacity', 400)
}

function waitTransitionEnd(el, prop, timeoutMs) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      el.removeEventListener('transitionend', onEnd)
      resolve()
    }
    const onEnd = (e) => {
      if (e.propertyName === prop) finish()
    }
    el.addEventListener('transitionend', onEnd)
    setTimeout(finish, timeoutMs) // fallback in case transitionend never fires (e.g. no-op distance)
  })
}

// The ground-truth check regenerateBox's collapse/reopen actually gate on — not just "did
// transitionend fire, or did the timeout elapse" (waitTransitionEnd above), but "has the box's real
// rendered height actually reached the target." This is what fixes a real, confirmed race: a
// layout-triggering transition like max-height/padding forces real reflow every frame, so if the
// main thread is busy (the terrarium's own WebGL render loop is exactly this kind of competitor),
// the transition can take longer in wall-clock time to visually finish than waitTransitionEnd's own
// timeout fallback allows for — meaning that fallback can resolve before the box has actually
// finished growing, letting the next phase (typing, or the flash) start while it's still visibly
// mid-motion. Polling the real getBoundingClientRect().height instead of trusting either the event
// or the timer is what actually guarantees "never before the box is truly full size," in every case,
// regardless of how loaded the main thread is at that moment. Resolves once within 1px of target, or
// after timeoutMs regardless (so a genuinely stuck layout can't hang the whole sequence forever).
function waitUntilHeightReached(el, targetPx, timeoutMs) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    // The deadline check above only runs from INSIDE the rAF loop below — a plain setTimeout
    // fallback here too (same belt-and-suspenders pattern as waitTransitionEnd above) is what
    // actually guarantees this can't hang forever if rAF itself ever stops firing (tab backgrounded
    // mid-animation, etc.), not just "usually resolves in time."
    setTimeout(finish, timeoutMs)
    function check() {
      if (done) return
      if (Math.abs(el.getBoundingClientRect().height - targetPx) <= 1) finish()
      else requestAnimationFrame(check)
    }
    check()
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ════════════════════════════════════════════════════════════════════════════════
// Regenerate — the universal "close to just the tabs, flash white, pop back open, type itself in"
// system every box's stage-to-stage content change goes through (the home page's welcome → log in →
// select-mode state machine, and back again), so the whole app has ONE consistent "this box is
// regenerating" motion rather than a different transition per screen. The exact order matters and
// is deliberate, driven directly by what the outgoing/incoming stage's chrome (title/kanji/marquee)
// is showing at each moment:
//   1. Collapse — .nora-moss-content shrinks to 0. Chrome is UNTOUCHED here, still showing the
//      OUTGOING stage the whole time (this is what fixes "the tabs change straight away" — chrome
//      lives in the topbar, outside .nora-moss-content, so it was never actually collapsed by the
//      content animation and has no business changing before the box is closed).
//   2. The instant content is fully closed (the box IS just the topbar+bottombar now, "the tabs
//      connect") — a solid white shield (flashIn/flashOut, NOT the jittery flicker() spawnFrom uses)
//      covers the whole small closed box, applyStage() swaps title/kanji/marquee/back-state/content
//      all at once while it's fully up, then the shield clears. Swapping under full cover, not
//      during a brightness jitter, is what hides the change completely: there's no frame where the
//      old label sits at normal brightness next to new content, or vice versa. Height/padding are
//      measured RIGHT HERE too, with the incoming content's real words still in the DOM, before
//      anything is blanked for typing — see Phase 2's own comment for the real bug this order fixes.
//   3. Bump back open to that already-measured natural height (a plain ease-out — see this
//      function's own comment on why there's no overshoot here).
//   4. Only once THAT fully resolves — never overlapping the box still growing, and never causing a
//      further reflow once it does (the space was sized for the full words from the start) — does
//      typing start: every element the caller's HTML marks with `data-typewriter` gets typed in
//      letter by letter (createTypewriter, a FRESH instance per element — see Phase 4's own comment
//      for why that isn't optional), staggered LINE_STAGGER_MS apart, same pacing revealLines uses.
// ════════════════════════════════════════════════════════════════════════════════

async function regenerateBox(box, content, applyStage, stillCurrent, maxContentHeight) {
  // ONE easing family for both directions — closing and reopening are meant to read as the same
  // motion in reverse, not two different systems. Deliberately no overshoot on the reopen: an
  // earlier version used a bouncy cubic-bezier(.34,1.56,.64,1) here (matching spawnFrom's own
  // click-to-pin bump), but overshoot on max-height/padding means the box genuinely grows PAST its
  // final height and eases back down again — a real, deterministic wobble right at the bottom edge,
  // not lag or a rendering hiccup, which is exactly what read as "bumps around" / "glitches" near
  // the end. A plain ease-out settles at its target once and stops.
  // min-height is only ever actually DRIVEN in Phase 3 (see its own comment there for why reopening
  // needs it and collapsing doesn't) — it's in this shared list anyway so Phase 1 can reliably CLEAR
  // it to 0 too, in case a previous cycle's Phase 3 left it pinned open (see Phase 1's own comment).
  const TRANSITIONED_PROPS = ['max-height', 'min-height', 'padding-top', 'padding-bottom']
  const easeTransition = (ms) => TRANSITIONED_PROPS.map((p) => `${p} ${ms}ms cubic-bezier(.4,0,.2,1)`).join(', ')

  // Declared out here (not `const` inside Phase 2 below) so the `finally` block can always remove it
  // — including if something throws between creating it and its own explicit removal — the same
  // "unconditional cleanup" reasoning as every inline style reset below.
  let shield = null
  // Also declared out here, for the opposite reason: `finally` needs this value to PIN max-height
  // to, not clear it — see finally's own comment for the real bug this fixes.
  let finalContentHeightPx = null

  try {
    // Phase 1 — collapse .nora-moss-content down to a genuine 0 — chrome (title/kanji/marquee) is
    // UNTOUCHED through this whole phase, still showing the OUTGOING stage the entire time. This is
    // the actual fix for "the tabs change straight away": the previous version applied the new
    // title/kanji before this function even started, so the topbar text (which lives outside
    // .nora-moss-content and was never itself collapsed) visibly snapped to the new stage the
    // instant a click happened, well before anything else moved. Now nothing about the topbar
    // changes until Phase 2, under cover of the flash, once the box is actually fully closed.
    //
    // The box has no CSS max-height of its own (#options-panel is auto-height, just whatever its
    // children add up to — unlike #info-panel's fixed 67vh), so it naturally shrinks to "just the
    // two tabs" once this ONE variable-height child hits zero. padding-top/-bottom animate in the
    // SAME transition as max-height — .nora-moss-content has no box-sizing:border-box override
    // (only the outer .nora-moss-box elements do), so max-height alone still leaves its own vertical
    // padding rendering underneath; a real, confirmed bug in an earlier version of this. overflow is
    // pinned to hidden for the duration (already `auto` via CSS normally) so nothing paints past the
    // shrinking box either.
    content.style.transition = 'none'
    content.style.overflow = 'hidden'
    content.style.maxHeight = `${content.scrollHeight}px`
    void content.offsetHeight
    content.style.transition = easeTransition(280)
    content.style.maxHeight = '0px'
    // Explicitly cleared to 0 too — a PREVIOUS regenerate cycle's Phase 3 (below) pins min-height
    // open to force the box to its full reserved size; without clearing it here, that stale value
    // would floor THIS collapse above 0, breaking "closes all the way to just the tabs" the very
    // next time the box regenerates. (Content still has its real, non-blanked text at this point, so
    // min-height isn't needed to hold anything open DURING collapse — only max-height needs to
    // actually animate here; see Phase 3's own comment for why reopening is the direction that does.)
    content.style.minHeight = '0px'
    content.style.paddingTop = '0px'
    content.style.paddingBottom = '0px'
    await waitTransitionEnd(content, 'max-height', 450)
    if (!stillCurrent()) return false
    // Ground-truth gate — see waitUntilHeightReached's own comment for why the event/timeout above
    // isn't sufficient on its own: don't flash/swap until the box has ACTUALLY reached 0, confirmed
    // by measurement, not just "enough time passed." This is what "the tabs stay the same until they
    // truly connect" actually requires under real-world load, not just in a fast/idle browser.
    await waitUntilHeightReached(content, 0, 300)
    if (!stillCurrent()) return false

    // Phase 2 — the instant the tabs "connect" (content fully closed — the box IS just the topbar
    // and bottombar now, stacked with nothing between them): a solid white shield covers the WHOLE
    // (currently small, closed) box, EVERYTHING swaps while it's fully up, then the shield clears —
    // ONLY THEN does Phase 3's reopen begin. Explicit request: a genuine full white flash, not the
    // jittery flicker() used elsewhere — see flashIn/flashOut's own comment above.
    shield = document.createElement('div')
    shield.className = 'moss-regen-flash'
    box.appendChild(shield)
    await flashIn(shield)
    if (!stillCurrent()) {
      shield.remove()
      return false
    }

    // Everything (title, kanji, marquee, back-arrow state, and the actual content markup) swaps here
    // — the shield is already at its peak, so none of this is ever visible happening.
    applyStage()

    // Measure the INCOMING content's real natural height/padding right now, while its real text is
    // still in the DOM — BEFORE blanking anything for the typewriter. This order is the fix for a
    // real, confirmed bug: measuring AFTER blanking (the previous version) only reserved as much
    // space as the EMPTY labels needed, which can be less than the full typed-out text needs — so
    // the box would bump-expand once to that too-small size, then bump AGAIN mid-typing as the
    // growing text outgrew the space that was actually reserved for it. Measuring now, with the real
    // words still present, reserves the true final size up front — inline padding from the Phase 1
    // collapse is cleared first so getComputedStyle reads the real CSS value, not '0px'.
    content.style.paddingTop = ''
    content.style.paddingBottom = ''
    content.style.maxHeight = 'none'
    const naturalHeight = content.scrollHeight // the TOTAL (padding-box) height — what
    // getBoundingClientRect().height reports, so this is the right unit for waitUntilHeightReached's
    // ground-truth check below, but NOT the right unit for the max-height/min-height CSS properties
    // themselves (see naturalContentHeight's own comment just below for why those need a different
    // number).
    const naturalPaddingTop = getComputedStyle(content).paddingTop
    const naturalPaddingBottom = getComputedStyle(content).paddingBottom
    // The caller's own cap (e.g. a long genki lesson list), if any — the box grows to fit content up
    // to this TOTAL height, same unit as naturalHeight/getBoundingClientRect, and no further; content
    // past that scrolls instead, via .nora-moss-content's own overflow:auto (restored once this whole
    // function's `finally` clears the overflow:hidden Phase 1 set for the animation) and the SAME
    // weighted hand-scroll every box already gets for free (attachHeavyScroll, applied unconditionally
    // in createMossBox — see its own header comment). No separate scroll implementation needed here —
    // capping the height is the only piece that was actually missing.
    const targetHeight = maxContentHeight != null ? Math.min(naturalHeight, maxContentHeight) : naturalHeight
    // .nora-moss-content has no box-sizing:border-box (same fact Phase 1's own comment already notes
    // for a different reason), so `max-height`/`min-height` apply to the CONTENT area only — padding
    // is added ON TOP to get the total rendered size, not included within the constraint. Pinning
    // max-height/min-height directly to naturalHeight (which already INCLUDES padding, from
    // scrollHeight) while ALSO restoring the real padding on top double-counts it — a real, confirmed
    // bug caught before shipping: the box landed 34px too tall (243 target measured as 277 actual).
    // This is the corrected, content-only number Phase 3 actually uses for those two properties —
    // derived from targetHeight (capped), not the raw naturalHeight, so a capped box's own max-height/
    // min-height land on the cap, not the full uncapped content size.
    const naturalContentHeight = targetHeight - parseFloat(naturalPaddingTop) - parseFloat(naturalPaddingBottom)
    finalContentHeightPx = naturalContentHeight // see finally's own comment for why this is captured
    content.style.maxHeight = '0px' // back to fully closed — still collapsed for the flash below
    content.style.paddingTop = '0px'
    content.style.paddingBottom = '0px'

    // NOW blank every typewriter target, having already measured the space the real words need.
    // originalTexts is captured in the same pass, in DOM order, so Phase 4 can zip them back together.
    const typeables = [...content.querySelectorAll('[data-typewriter]')]
    const originalTexts = typeables.map((el) => el.textContent)
    typeables.forEach((el) => {
      el.textContent = ''
    })

    // The fall starts immediately — no sleep/hold here (see flashIn/flashOut's own comment for why
    // that flat pause was the actual problem last time). applyStage()/measuring/blanking above are
    // synchronous JS, so they land in the split-second gap right at the shield's peak, then the decay
    // continues on from there — one continuous rise-and-fall, not rise/pause/fall. Only once the
    // shield fully clears does Phase 3 (the reopen) begin.
    await flashOut(shield)
    shield.remove()
    if (!stillCurrent()) return false

    // Phase 3 — reopen to the height/padding already measured above (no re-measuring here — that was
    // the earlier bug), same easing family as the collapse. min-height is pinned to the SAME target
    // as max-height, not just max-height alone — this is what actually fixes "the box loads, then a
    // second load bumps it again as the words are typed in." max-height is only ever a CEILING: it
    // stops the box from growing past a limit, but does nothing to stop it from being SMALLER than
    // that limit if its content doesn't currently need the space — and right now content's own
    // natural size is smaller than naturalHeight, because every data-typewriter label is still
    // blanked. With max-height alone, the box would visibly "finish" reopening at that smaller
    // blank-content size (falling short of naturalHeight, so waitUntilHeightReached below would
    // never see a real match and just time out), then grow AGAIN once typing filled the labels back
    // in and content's real size finally caught up to naturalHeight — the exact bug reported, a
    // second time, from a different cause than the first (that one was measuring the wrong target
    // height; this is forcing the box open to whatever target is set, blank content or not).
    // min-height forces the box to actually OCCUPY the full reserved space regardless of what its
    // (blanked) content currently needs — the practical equivalent of preloading a blank placeholder
    // sized for the real words, then typing into a box that's already fixed at its final size and
    // never resizes again.
    content.style.transition = 'none'
    void content.offsetHeight
    content.style.transition = easeTransition(380)
    content.style.maxHeight = `${naturalContentHeight}px`
    content.style.minHeight = `${naturalContentHeight}px`
    content.style.paddingTop = naturalPaddingTop
    content.style.paddingBottom = naturalPaddingBottom
    await waitTransitionEnd(content, 'max-height', 550)
    if (!stillCurrent()) return false
    // Ground-truth gate — the actual fix for "words typing in before the box is fully loaded down."
    // waitTransitionEnd's own timeout fallback is wall-clock time only, with no idea whether the box
    // has genuinely finished growing; under real load (the terrarium's WebGL loop competing with this
    // layout-triggering animation for main-thread time) that fallback can fire before the box has
    // actually reached full size. This polls the REAL rendered height instead of trusting the event
    // or the timer — see waitUntilHeightReached's own comment — so typing (Phase 4, right below)
    // genuinely never starts until the box has measurably reached its target, in every case.
    await waitUntilHeightReached(content, targetHeight, 500)
    if (!stillCurrent()) return false

    // Phase 4 — type each target in, staggered STARTS (not staggered finishes — each one types at
    // its own pace concurrently with the others, same reasoning as the search box's gloss/stats
    // lines typing at once rather than queued one after another). Each element gets its OWN
    // createTypewriter() instance here — a real, confirmed bug in an earlier version of this reused
    // ONE instance for the whole loop, and since a typewriter's generation counter is shared across
    // every call it receives, typing the 2nd label immediately cancelled the 1st mid-word ("login"
    // cut short to "log", "email" to "em") — see createTypewriter's own comment for why a fresh
    // instance per concurrent line is the actual point, not optional.
    for (let i = 0; i < typeables.length; i++) {
      if (!stillCurrent()) return false
      createTypewriter()(typeables[i], originalTexts[i])
      await sleep(LINE_STAGGER_MS)
    }
    return stillCurrent()
  } finally {
    // max-height is PINNED to finalContentHeightPx here, not cleared — a real, confirmed bug caught
    // after shipping: clearing it (the original version of this) assumed removing the inline
    // constraint and letting ordinary CSS auto-sizing take over would land on the same number, which
    // is true for UNCAPPED content (its real size and finalContentHeightPx are the same value by
    // construction) but false the moment a caller passes maxContentHeight and the real content is
    // actually bigger than the cap (e.g. genki 2's 11 lessons vs. a 520px cap) — #options-panel has
    // no CSS max-height of its own, so clearing the inline one removed the ONLY thing enforcing the
    // cap, and the box visibly burst back out to its full uncapped size a moment after settling
    // (right as this `finally` ran, at the very end of Phase 4). null only when the function bailed
    // before Phase 2 ever measured anything (e.g. superseded mid-collapse) — nothing to pin yet, so
    // '' (ordinary CSS) is correct there. min-height/padding/transition still reset to '' — clearing
    // those is genuinely safe: content's real rendered size already reflects them by this point
    // (min-height's own job — forcing the box open past blank-content's smaller natural size — is
    // moot once real text is in; padding was measured FROM the CSS rule's own value, so '' resolves
    // to the identical number either way).
    content.style.maxHeight = finalContentHeightPx != null ? `${finalContentHeightPx}px` : ''
    content.style.minHeight = ''
    content.style.paddingTop = ''
    content.style.paddingBottom = ''
    content.style.transition = ''
    content.style.overflow = ''
    shield?.remove()
  }
}

// A typewriter function factory with its OWN private generation counter — every caller (a box's
// regenerate(), the dictionary search box's gloss/stats lines) gets an independent instance rather
// than sharing one, so typing two different pieces of text at once doesn't make starting one cancel
// the other (a single shared counter would do exactly that, since they're meant to run concurrently,
// not exclusively). Reveals text one character at a time — deliberately not a fade/slide of the
// whole string, which reads as a generic modern reveal; this is a real typewriter effect instead.
// Each element's own styling (blur, glow, the scaleY squish, `related-title`'s `::first-letter`
// capitalization, etc. — all inherited from whatever class it already carries, untouched here)
// applies to whatever's typed at any instant, exactly as if the full text had been there from the
// start.
// `onDone` (optional, backward-compatible — every existing caller just omits it) fires once, right
// after the LAST character lands — never for a superseded call (guarded by the same generation
// check every step already uses), so a caller can reliably react to "this exact string finished
// typing" without guessing at a duration from the 28ms/char pacing above. First real use:
// showIdleHoverTitle's own trailing-dot blink (main.js) — the dot has to wait for typing to
// genuinely finish before it can wrap the last character, the same "wait for a real signal, not a
// guessed timeout" preference this file already applies to height/layout elsewhere.
export function createTypewriter() {
  let generation = 0
  return function type(el, text, onDone) {
    const myGen = ++generation
    el.textContent = ''
    if (!text) {
      onDone?.()
      return
    }
    let i = 0
    function step() {
      if (myGen !== generation) return // superseded — a newer call is typing into this element now
      i++
      el.textContent = text.slice(0, i)
      if (i < text.length) setTimeout(step, 28)
      else onDone?.()
    }
    step()
  }
}

// Appends each of `lines` (HTML strings, one element each) to `content`, staggered — "the first
// line with the water radical loads, then..." Returns the last element appended (revealRelatedList
// uses this box's position to know where to measure tile visibility from), or null if aborted.
async function revealLines(content, lines, stillCurrent) {
  let last = null
  for (const html of lines) {
    if (!stillCurrent()) return null
    const wrap = document.createElement('div')
    wrap.innerHTML = html
    const el = wrap.firstElementChild
    if (!el) continue

    // The slide/fade animates a plain wrapper around `el`, not `el` itself — `el` may carry its
    // own CSS `transform` (e.g. .info-subtitle/.related-title's tab-matching scaleY squish), and
    // setting an inline `transform` directly on it would silently clobber that: inline style
    // always wins over a CSS rule regardless of specificity. A real bug this way once — the squish
    // quietly vanished on every line built through this function but not on markup inserted any
    // other way (revealRelatedList's related-title kept it, since that path never touches
    // transform at all). The wrapper owns the reveal motion; el's own styling stays untouched.
    const holder = document.createElement('div')
    holder.style.opacity = '0'
    holder.style.transform = 'translateY(6px)'
    holder.style.transition = 'opacity 220ms ease, transform 220ms ease'
    holder.appendChild(el)
    content.appendChild(holder)
    void holder.offsetHeight // commit the 0/translateY(6px) start state before animating to visible
    holder.style.opacity = '1'
    holder.style.transform = 'translateY(0)'
    last = el
    await sleep(LINE_STAGGER_MS)
  }
  return last
}

// Inserts the whole related-kanji section (title + full tile grid) at once — correctness first, no
// per-tile layout thrash for what can be 200+ tiles — then fades in, one at a time, only the tiles
// actually visible without scrolling (measured post-insertion, so it reflects real layout); the
// rest just appear, since animating something off-screen is wasted motion.
async function revealRelatedList(content, html, stillCurrent) {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  const frag = document.createDocumentFragment()
  ;[...wrap.children].forEach((c) => frag.appendChild(c))
  content.appendChild(frag)
  if (!stillCurrent()) return

  const tiles = [...content.querySelectorAll('.related-kanji')]
  if (tiles.length === 0) return

  const contentRect = content.getBoundingClientRect()
  const visibleCount = tiles.filter((t) => t.getBoundingClientRect().top < contentRect.bottom).length

  tiles.forEach((t) => {
    t.style.opacity = '0'
    t.style.transform = 'translateY(4px)'
  })
  tiles.slice(visibleCount).forEach((t) => {
    t.style.opacity = '1'
    t.style.transform = 'translateY(0)'
  })

  for (let i = 0; i < visibleCount; i++) {
    if (!stillCurrent()) return
    tileEnter(tiles[i])
    await sleep(BURST_STAGGER_MS)
  }
}

// Plain fade + slight rise — the exact same technique revealLines() already uses for the header
// text above, nothing tile-specific layered on top. Two earlier attempts both read wrong: a
// scale-overshoot pop + saturated glow-ring flash felt like a modern "AI notification chip"
// pop-in, and a diagonal light-sheen sweep (meant as a calmer Aero/Aqua-glass alternative) turned
// out to *be* the exact "skeleton loading shimmer" pattern from every modern SaaS app — the
// opposite of a late-2000s glass aesthetic despite looking gentler. No more cleverness here: the
// tiles just quietly fade in, staggered, like the rest of the box's content already does.
function tileEnter(tile) {
  const anim = tile.animate(
    [
      { opacity: 0, transform: 'translateY(4px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 260, easing: 'ease-out', fill: 'forwards' },
  )
  anim.finished
    .then(() => {
      tile.style.opacity = '1'
      tile.style.transform = 'translateY(0)'
      // fill: 'forwards' keeps this Animation's effect registered on the element indefinitely —
      // committing the final values to inline style above doesn't remove it. Left uncancelled, it
      // sits in the browser's active-animation stack forever, competing with the hover pulse
      // (.related-kanji.is-pulsing) for the same `opacity` property later — the likely cause of a
      // real bug where the pulse would visibly start for a frame and then cut out immediately.
      // cancel() drops this animation from the stack once its final state is safely committed.
      anim.cancel()
    })
    .catch(() => {}) // cancelled — nothing to clean up, tile was going to be discarded anyway
}
