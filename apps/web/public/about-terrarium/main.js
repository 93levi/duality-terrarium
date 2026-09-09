// ==============================
//  MAIN PAGE CONFIG
// ==============================
// Ported from the original Duality Terrarium site — see index.html's own header comment for the full
// "what changed and why" list. Everything below is what's left once the spacebar/intro sequence,
// drag/scroll-zoom controls, Menu, audio player, and custom cursor are all removed: just the
// typewriter text entrance (fired immediately on load instead of waiting for a "space sequence"
// completion callback) and page scroll.

// Disable browser's automatic scroll restoration on reload
if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

// ==============================
//  TYPEWRITER FOR TAGLINES / SUBTITLES
// ==============================

function typewriter(element, text, speed = 4) {
  if (!element || !text) return;

  // Temporarily set full text to measure final height, so the layout doesn't bump as it types in.
  element.textContent = text;
  const finalHeight = element.offsetHeight;
  element.style.minHeight = finalHeight + "px";
  element.textContent = "";
  // Real bug, caught by actually watching a fresh load: the raw HTML has this element's real,
  // final words baked in from the start (index.html, not injected by JS), so the browser can paint
  // that FULL text at least once before this function ever runs and blanks it — full text flashes,
  // then disappears, then types back in. style.css hides this element (visibility:hidden — NOT
  // display:none/opacity:0, so it stays measurable above) from the very first paint specifically so
  // there's nothing to flash; this is the one place that turns it back on, at the exact instant
  // there's nothing showing but empty space to reveal.
  element.style.visibility = "visible";

  let index = 0;
  function step() {
    element.textContent = text.slice(0, index + 1);
    index++;
    if (index < text.length) setTimeout(step, speed);
  }
  step();
}

function startDualitySubtitleTypewriter() {
  const el = document.getElementById("dualitySubtitle");
  if (!el) return;
  typewriter(el, el.textContent.trim(), 4);
}

// ===============================================
//  ULTRA FAST, NO-BUMP TYPEWRITER FOR #terra-def
// ===============================================
function ultraFastNoBumpTerraTypewriter(container, totalDurationMs = 2500) {
  if (!container) return;

  const paragraphs = Array.from(container.querySelectorAll("p"));
  if (paragraphs.length === 0) return;

  // Lock container height before clearing, so it doesn't bump as text types back in.
  container.style.minHeight = container.offsetHeight + "px";

  const texts = paragraphs.map((p) => p.textContent);
  paragraphs.forEach((p) => (p.textContent = ""));
  // Same fix, same reasoning as typewriter()'s own comment above: style.css hides #terra-def
  // (visibility:hidden, still measurable — that's what container.offsetHeight just read) so its real
  // baked-in HTML text can't flash on screen before this function gets a chance to blank it. Reveal
  // now, right as it's genuinely empty.
  container.style.visibility = "visible";

  const totalChars = texts.reduce((sum, t) => sum + t.length, 0);
  let startTime = null;

  function frame(timestamp) {
    if (startTime === null) startTime = timestamp;
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / totalDurationMs, 1);

    const targetChars = Math.floor(totalChars * progress);
    let remaining = targetChars;

    for (let i = 0; i < paragraphs.length; i++) {
      const full = texts[i];
      const take = Math.min(remaining, full.length);
      paragraphs[i].textContent = full.slice(0, take);
      remaining -= take;
    }

    if (progress < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function startTerraDefinitionTypewriter() {
  const terra = document.getElementById("terra-def");
  if (terra) ultraFastNoBumpTerraTypewriter(terra, 4500);
}

// ------------------------------
// Weighted page scroll — the same damped, "heavier than native" feel the main kanji-terrarium app's
// own boxes use (attachHeavyScroll, apps/web/src/ui/mossBox.js — e.g. dictionary mode's own left-side
// components box). This page has no shared code with that app (index.html's own header comment), so
// this is a deliberate, small port of that exact algorithm — same SCROLL_EASE (0.14), same "nudge a
// target on wheel, ease scrollTop toward it every frame" approach — just re-targeted at the whole
// page's own scroll (document.scrollingElement) instead of one box's .nora-moss-content div.
// ------------------------------
const SCROLL_EASE = 0.14;

// ------------------------------
// Page zoom — hovering this page and pinching (trackpad) or Ctrl+scrolling (mouse wheel) zooms the
// page itself, not the parent kanji-terrarium app around it, per explicit request ("make the whole
// window itself zoomable... for readability"). Neither Chrome nor Firefox expose a dedicated gesture
// event for trackpad pinch — both report it as a plain `wheel` event with `ctrlKey: true`, the exact
// same signal a real Ctrl+scroll produces (scene.js's own PINCH handling in the main app, "The 3D
// viewer" section of apps/web/CLAUDE.md, hits this same ambiguity and treats the two identically for
// the same reason: there's no reliable way to tell them apart). So `event.ctrlKey` alone is the
// branch — every OTHER wheel event still drives the ordinary weighted scroll above, unchanged.
//
// `document.body` is what actually scales (`transform: scale()`, origin tracking the cursor so it
// reads as "zoom toward where you're pointed," the same convention native pinch-zoom uses) —
// deliberately NOT `<html>`. `attachHeavyScroll()`'s own scrollTop target is `document.scrollingElement`
// (the root `<html>` element), so leaving `<html>` untransformed keeps it the one real scrolling box:
// a `transform` on an ancestor establishes a new containing block for its `position:fixed` descendants
// (the spec rule this relies on), so every fixed element on this page — the scanline overlay, the
// hero title/terrarium/canvas, the loading flourish — scales and pans together with the rest of the
// content instead of staying pinned to the true viewport, without that rule needing to touch the root
// scrolling element itself. `position:sticky` (the sticky sections further down this file's own CSS)
// is unaffected for the same reason: sticky resolves against the nearest actual scroll container,
// which is still `<html>`, not the transformed `<body>` sitting between them.
const PAGE_ZOOM_MIN = 1;
const PAGE_ZOOM_MAX = 3;
const PAGE_ZOOM_SENSITIVITY = 0.01; // first-guess value, not measured — retune live if a pinch/Ctrl-
// scroll feels too twitchy or too sluggish, same "tune live in a real browser" convention this whole
// file's other motion already follows (this session's own sandbox can't reliably verify feel/timing).
let pageZoomScale = 1;

// Real bug, reported directly ("pull the zoom from the middle of the box when you're at the top and
// it cuts off the top... weird interactions"): the origin used to be computed as a PERCENTAGE of the
// VIEWPORT (`event.clientX / window.innerWidth`, etc.) but applied as `transformOrigin` on `body` —
// and `transform-origin` percentages are relative to the element's OWN border box, not the viewport.
// `body`'s real box is the page's full scrollHeight (thousands of px), not the ~800px-tall viewport
// window sitting over it — so "50%" landed at the vertical MIDDLE OF THE WHOLE DOCUMENT, nowhere near
// the cursor, however far down the page you'd actually scrolled. Scaling around that far-away,
// scroll-independent point is exactly what reads as "weird"/"cuts off the top": the pivot barely
// moved with real cursor position at all. Fixed by computing the origin in PIXELS, in `body`'s own
// document-space coordinates (`scrollTop + clientY`, not `clientY` alone) — `body`'s own box doesn't
// move as you scroll (the root `<html>` scroller just slides a viewport-sized window over it), so this
// correctly lands the origin exactly under the cursor regardless of scroll position, and needs no
// separate scroll-compensation step: a `transform-origin` point is invariant under its own element's
// scale by definition, so anchoring it there is what keeps that exact pixel under the cursor as the
// scale changes, in every case, not just at the top of the page.
function applyPageZoom(event) {
  const prevScale = pageZoomScale;
  // deltaY is negative for "zoom in" (scroll up with Ctrl held, or spreading two fingers on a
  // trackpad) — matches the native browser zoom convention, so subtracting it increases scale.
  pageZoomScale = Math.min(
    PAGE_ZOOM_MAX,
    Math.max(PAGE_ZOOM_MIN, pageZoomScale - event.deltaY * PAGE_ZOOM_SENSITIVITY)
  );
  if (pageZoomScale === prevScale) return;

  const scrollEl = document.scrollingElement || document.documentElement;
  const originXpx = event.clientX;
  const originYpx = scrollEl.scrollTop + event.clientY;
  document.body.style.transformOrigin = `${originXpx}px ${originYpx}px`;
  document.body.style.transform = pageZoomScale === 1 ? "" : `scale(${pageZoomScale})`;
}

// #alt's own scroll-hint arrow (index.html, .scroll-hint--alt) needs to hide once "Duality
// Terrarium" (the sticky title stack in #case-study) is actually visible underneath it — real,
// confirmed bug otherwise: #alt stays sticky-locked for a long stretch of scroll while that title is
// ALREADY scrolling into view (a normal, non-sticky element, moving at ordinary speed regardless of
// #alt's own stuck state), and the arrow's own z-index (5, above both sections' z-index:2) lets it
// paint on top of the newly-visible title regardless.
//
// Threshold computed LIVE every call, not hardcoded — deliberately, learning the lesson from an
// earlier mistake THIS SAME SESSION (a fixed-pixel value solved against one specific viewport broke
// in a real browser at a different width). This one has an extra wrinkle beyond that: every
// `section` on this page has `height: calc(100vh - 100px)` (style.css's own base rule), so the
// scroll distance before #case-study even starts is proportional to viewport HEIGHT too, not just
// width — a hardcoded number would drift with either dimension. `getBoundingClientRect().top +
// scrollTop` gives the title's real absolute document position at the CURRENT scroll state
// (viewport-size-independent, since it's measuring where the element actually renders, not
// predicting it) — comparing that against the current scrollTop plus the real `window.innerHeight`
// stays correct at any window size, recomputed fresh on every scroll tick rather than trusted once.
function updateAltArrowVisibility(scrollTop) {
  const arrow = document.querySelector(".scroll-hint--alt");
  const duality = document.getElementById("stack-duality");
  if (!arrow || !duality) return;
  const dualityDocTop = duality.getBoundingClientRect().top + scrollTop;
  const isDualityVisible = scrollTop >= dualityDocTop - window.innerHeight;
  arrow.classList.toggle("is-hidden", isDualityVisible);
}

function attachHeavyScroll() {
  const el = document.scrollingElement || document.documentElement;
  let target = el.scrollTop;
  let ticking = false;

  updateAltArrowVisibility(el.scrollTop); // correct initial state on load

  function tick() {
    const current = el.scrollTop;
    const diff = target - current;
    if (Math.abs(diff) < 0.5) {
      el.scrollTop = target;
      updateAltArrowVisibility(el.scrollTop);
      ticking = false;
      return;
    }
    el.scrollTop = current + diff * SCROLL_EASE;
    updateAltArrowVisibility(el.scrollTop);
    requestAnimationFrame(tick);
  }

  window.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (event.ctrlKey) {
        applyPageZoom(event);
        return;
      }
      if (!ticking) target = el.scrollTop;
      const max = el.scrollHeight - window.innerHeight;
      target = Math.min(max, Math.max(0, target + event.deltaY));
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(tick);
      }
    },
    { passive: false }
  );
}

// ------------------------------
// Fake-loading flourish before the typewriter starts — explicit request, "like our loading blinking
// thing... blink three times, one second max, and then it activates the typewriter." style.css's
// #about-loading.is-visible plays the actual three-blink animation (own comment there has the timing
// reasoning); `animation-iteration-count: 3` (not infinite) is specifically what lets this resolve on
// a single real `animationend` event once all three blinks are genuinely done, instead of a guessed
// setTimeout duration — same "wait for a real signal" preference the source app's own typewriter
// onDone callback already follows (main.js's own comment there, in the main kanji-terrarium app).
function playLoadingBlink() {
  return new Promise((resolve) => {
    const el = document.getElementById("about-loading");
    if (!el) {
      resolve();
      return;
    }
    function onDone() {
      el.removeEventListener("animationend", onDone);
      el.classList.remove("is-visible");
      resolve();
    }
    el.addEventListener("animationend", onDone);
    el.classList.add("is-visible");
  });
}

// ------------------------------
// Kick everything off — immediately, no spacebar/loading gate. The original waited for a keydown
// (CONFIG.LOADER_KEY) to run a Babylon "space sequence" and only THEN called this; here the page
// opens directly at that sequence's own end state (terrarium.js's own header comment), so these just
// fire as soon as they safely can, same content, no wait — except now the fake-loading blink above,
// which genuinely does insert a brief, DELIBERATE pause before the typewriter starts, on purpose
// (~1s, not the multi-second stall this section used to cause — see below).
//
// Deliberately NOT gated on `DOMContentLoaded` any more — real, confirmed bug: this script tag sits
// at the very end of <body>, AFTER the Babylon CDN script and terrarium.js (index.html). Before those
// two were marked `defer` (index.html's own comment on that), they were plain blocking scripts — the
// parser couldn't even reach and run THIS script until that CDN fetch finished, and `DOMContentLoaded`
// itself doesn't fire until every earlier blocking/deferred script has finished either way. Either
// path meant the loading blink and typewriter — which have nothing to do with Babylon at all — were
// stuck waiting on an unrelated, potentially multi-second CDN download before they could even start.
// Running this directly instead (no listener at all) is safe specifically BECAUSE this script tag is
// the very last thing in the document: by the time the parser reaches and executes it, every element
// this file touches (#dualitySubtitle, #terra-def, #about-loading) already exists — that's the whole
// reason "put your script at the end of body" is a real pattern, not just convention here.
// attachHeavyScroll() is NOT gated behind the loading blink — it's just event wiring, no visual effect
// of its own, no reason to delay it.
// ------------------------------
;(async () => {
  attachHeavyScroll();
  await playLoadingBlink();
  // .scanlines-loaded no longer changes the scanline overlay itself (that's back to one single look —
  // style.css's own #scanline-overlay comment has the real bug that caused, and why) — it now ONLY
  // reveals the title/terrarium-underlay/canvas (style.css, right below their own hidden state), at
  // the same moment the typewriter starts. Name kept as-is since it's still genuinely "the loading
  // phase just ended" signal, just narrower in scope than it used to be.
  document.body.classList.add("scanlines-loaded");
  startTerraDefinitionTypewriter();
  startDualitySubtitleTypewriter();
})();
