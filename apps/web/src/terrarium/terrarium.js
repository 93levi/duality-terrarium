// The home-page terrarium — adapted from moss x kanji FINAL's public/three-scene/js/main.js (the
// "Digital Terrarium" demo). Mirrors that file's scene composition and camera-entrance animation
// almost exactly; what's actually different, and why, below.
//
// mountTerrarium(container, { startAtCloseUp }) builds the whole scene into `container` and starts
// rendering immediately, returning { dispose() }. Per the architecture agreed for the home page: the
// terrarium only ever exists here, and it must be possible to fully tear it down (geometries,
// materials, textures, the render loop, every listener) when the user picks Dictionary — the
// source demo never needed this (it was a permanent full-page scene), so this is new, not ported.
//
// Phase 0 (the ultra-zoomed-out → resting entrance, ~2.5s) plays automatically on every mount, same
// as the source: that's what gives the terrarium its "starts small, settles in" first look. It
// resolves to "resting at birds-eye" by default (`birdsEyePos`) — but `startAtCloseUp: true` (passed
// by main.js's `mountHome(true)`, when returning directly to select mode instead of landing on
// welcome — dictionary's own "close dictionary" and a flashcard session's own exit both do this now)
// re-targets this SAME single tween straight to `closeUpPos` instead, landing on phase 2 ("resting at
// close-up") rather than phase 0 — see the CAMERA ENTRANCE block in `animate()`, below, for the full
// mechanics and why this re-targets the one existing tween rather than stacking a second swoop on top
// of it. The source's own phase-1 "low angle" swoop is now ALSO live, both directions — renamed from
// the source's brandsViewOpened/brandsViewClosed (a "spotify store" concept, meaningless here) to
// terrariumEnterCloseUp/terrariumExitCloseUp and retuned for this app's own triggers, each tied to a
// specific box stage change (main.js): terrariumEnterCloseUp fires on welcome's own "enter the
// terrarium" click (welcome → select-mode — there used to be a dummy login stage in between, removed
// entirely; this same swoop now fires straight off that one welcome button) and swoops the camera
// down and in — not fully to ground level, and close enough that the terrarium's own edges sit near
// the frame's edge rather than floating in empty space — then settles into the same auto-rotate idle
// it always has, just from this new resting position. terrariumExitCloseUp fires on select-mode's
// own 'exit' option (→ welcome) and reverses that exact swoop back to birds-eye. The pairing is
// deliberate: every box stage has one
// specific terrarium position it belongs at, and moving between stages (either direction) is what
// moves the camera — not a one-way trip.
//
// terrariumEnterDeck/terrariumExitDeck extend that SAME chain one stage deeper — not a separate
// system: birds-eye ⇄ close-up ⇄ deck-zoom, one continuous line, so this reuses the closeUpAnim*
// state (phase numbers, below) rather than a parallel duplicate machine. Fires on select-mode's own
// 'flashcards' button (→ deckZoomPos — a combined dolly-in + tilt-down from closeUpPos, all the way
// to the camera rig's own maxPolarAngle, genuinely flat/ground-level) and reverses on genki volumes'
// own back button (→ closeUpPos directly, NOT all the way back to birds-eye — the deck zoom is one
// level below close-up, not below birds-eye, so its own back only undoes ITS OWN zoom). Does not
// fire from genki's own children (genki 1/2's lesson lists, further down the tree) going back to
// genki volumes itself — those stay at deckZoomPos, no camera change, same "no pairing exists below
// where one was actually asked for" reasoning terrariumEnterCloseUp/terrariumExitCloseUp already
// established for genki/lesson stages.
//
// This used to be a THREE-level chain (birds-eye ⇄ close-up ⇄ flashcards-zoom ⇄ deck-zoom,
// terrariumEnterFlashcards/terrariumExitFlashcards driving the middle hop at flashcardsZoomPos, phase
// numbers 4/5/6) back when select-mode's 'flashcards' button led to a menu (custom deck / genki)
// before reaching genki volumes. That menu was removed entirely once login/accounts were removed —
// a custom deck needs real per-user storage that doesn't exist in a fully static app (root CLAUDE.md
// phasing; apps/web/CLAUDE.md's "One box, every stage") — so 'flashcards' now leads straight to genki
// volumes, one hop, not two. terrariumEnterFlashcards/terrariumExitFlashcards, flashcardsZoomPos, and
// phases 4/5/6 were removed along with it rather than left dormant (unlike brandSelected/
// collectionOpened/collectionClosed below, which are genuine source-demo reference material for a
// later, different feature — this was custom-built for the now-gone stage, not reusable reference).
// Phase numbers 7/8/9 (deck-zoom) are unchanged from before, and the closeUpAnimPhase sequence
// deliberately still jumps 3 → 7 with no 4/5/6 in between — not a bug, just where that removed tier
// used to sit.
//
// Deliberately STILL dormant, unrelated to the above: the source's brandSelected/collectionOpened/
// collectionClosed choreography (the brand-select zoom, the collection float) — nothing in this
// build dispatches those, kept intact as reference for a later pass, not touched by this one.
//
// Terrain and particles stay disabled, matching the exact configuration already checked into moss
// x kanji FINAL's own copy of this file for the kanji-flavored variant (see terrain.js/particles.js
// for the pieces that are ported but unused here, same as upstream).

import * as THREE from 'three'

import { createScene } from './scene.js'
import { createLighting, updateLighting } from './lighting.js'
import { createFineMoss, updateFineMoss } from './moss2.js'
import { createFerns, updateFerns } from './fern.js'
import { createGroundCover, updateGroundCover } from './groundcover.js'
import { createRocks } from './rocks.js'
import { createGlassBox, updateGlassBox, createShatter } from './glassbox2.js'

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMERA ANIMATION CONSTANTS — identical to the source demo's own numbers
// ─────────────────────────────────────────────────────────────────────────────

const cameraStartPos = { x: 0, y: 9.5, z: 0.3 } // Ultra-zoomed out (disk view)
const birdsEyePos = { x: 0, y: 8.5, z: 0.5 } // Resting position (overhead view)
const birdsEyeDuration = 2500 // 2.5 seconds - slow reveal of the terrarium

// Select-mode entrance target — 80% of the way from birds-eye's near-vertical polar angle toward
// the camera rig's own maxPolarAngle "ground" limit (scene.js), not fully to ground level, at a
// distance close enough that the terrarium's own visible radius (≈1.35 world units, worked out from
// FOV × birds-eye's own on-screen apparent size) sits right at the frame's edge rather than floating
// in empty space, without being so close its edges crop out of frame entirely. Worked out from the
// actual FOV/scale geometry, not eyeballed — this environment's own renderer doesn't repaint
// reliably enough here to tune it by screenshot; treat the exact framing as a first pass to confirm
// for real, not a finished number.
const closeUpPos = { x: 0.91, y: 0.8, z: 2.13 }
const closeUpEnterDuration = 3375 // same pacing as the source demo's own low-angle swoop
const closeUpExitDuration = 3375

// Deck target (genki — the sole flashcards tier now; see this file's header comment for the removed
// intermediate flashcards-zoom stop this used to sit one level below) — same ray from
// controls.target through closeUpPos for azimuth, but BOTH distance and polar angle move this time,
// unlike closeUpPos's own dolly-only-partway-down approach: pulled in closer (≈1.3 world units vs
// closeUpPos's own ≈2.4 — noticeably closer without going all the way to controls.minDistance's 0.7,
// which risked clipping through the glass box/moss) AND tilted all the way to the camera rig's own
// maxPolarAngle, i.e. genuinely flat/ground-level, not 80% of the way like closeUpPos. Numerically
// unchanged from when this was reached via an intermediate flashcards-zoom stop (a pure dolly) then a
// pure tilt from there — same end position, just a direct combined dolly+tilt from closeUpPos now
// that the intermediate stop is gone. Same "not screenshot-tuned in this environment, treat as a
// first pass to confirm for real" caveat as every other position in this file.
const deckZoomPos = { x: 0.51, y: 0.1, z: 1.19 }
// Unchanged from when this covered the shorter flashcards-zoom→deck-zoom hop (a pure tilt, ≈0.42
// world units) — now covers the longer, combined closeUp→deck-zoom hop directly (≈1.24 world units).
// Not retuned for that longer distance yet — same "first pass, not screenshot-verified" caveat as the
// position above; retune this if the direct zoom reads as noticeably faster than closeUpPos's own
// entrance swoop.
const deckZoomEnterDuration = 1800
const deckZoomExitDuration = 1800

// The select-mode → dictionary/flashcards transition — redesigned from a straight "dive and then
// fade" into one continuous spiral: pull back out toward birds-eye WHILE already spinning, then
// (no stop, same spin still carrying through) dive back in toward the orb, with the box itself
// shattering into flying glass fragments DURING that dive so it's completely gone by the moment the
// dive lands — never fading in a separate beat after arrival. Explicit "PS2 disc-load" ask: slow,
// heavy, constant-speed motion (this file's own easeOutCubic elsewhere is deliberately NOT used for
// either leg here — see scene.js's LOAD_SWOOP/DETACH_ZOOM comments for why constant speed reads
// "massive" in this app and easing reads "modern/ai"), computed fresh from wherever the camera
// actually is (closeUpPos for a real dictionary-mode entry, but just as often deckZoomPos for a
// lesson entry reached through the deck picker) rather than assuming one fixed starting point.
const spiralOutDuration = 1700 // pull back + start spinning
const spiralInDuration = 3000 // spin continues; dive back in + shatter, concurrently
const spiralSpinRateDegPerSec = 50 // continuous through BOTH legs, never resets at the peak
const spiralPeakBlend = 0.85 // how far out toward birds-eye's own radius/phi the peak reaches —
// same "most of the way, not literally all the way" idiom closeUpPos's own 80%-to-maxPolarAngle
// already uses, just toward birds-eye instead.
const spiralDiveBlend = 0.04 // how much of the peak's own radius is left once the dive lands —
// same reasoning as the old dive's own 96%-of-the-way number: a truly zero-length camera-to-target
// vector reads as broken, not "inside the orb."
// The intact box's own materials fade out on the SAME clock as phase 2 itself (the camera's dive,
// and the shatter fragments' own fade — spiralShatter.update, glassbox2.js) — starts fading the
// instant the fragments start animating (progress 0, the phase-1→2 handoff). spiralBoxFadeBlend is
// how much of phase 2 that fade actually takes: 0.5 means the box is fully gone HALFWAY through the
// dive, not at the very end like the shatter fragments' own fade (which still runs the whole way to
// progress 1) — explicit request, a later tightening of the original "fades out over the whole dive"
// version. Not meant to read as physically "realistic" (a real box wouldn't stay solid-looking while
// its own shards are already scattering) — simplicity over cinematic accuracy, by explicit request.
const spiralBoxFadeBlend = 0.5

const brandSelectZoomPos = { x: 0.3, y: 0.08, z: 2.2 }
const brandSelectZoomDuration = 1800

const collectionViewPos = { x: 0, y: 3.8, z: 0.45 }
const collectionOpenDuration = 2400
const collectionCloseDuration = 1600

// `startAtCloseUp` — main.js's mountHome(true) (returning directly to select mode from dictionary's
// "close dictionary" or a flashcard session's exit, instead of landing back on welcome) passes this.
// See the CAMERA ENTRANCE block in animate(), below, for what it actually changes — the ONE automatic
// entrance tween every mount already plays, just re-targeted, not a second animation stacked on top
// of it.
export function mountTerrarium(container, { startAtCloseUp = false } = {}) {
  const { scene, camera, renderer, controls, clock, disposeResize } = createScene(container)

  // ── Build in dependency order (terrain first conceptually, then plants on top of it) ──────────
  const lighting = createLighting(scene)
  const fineMoss = createFineMoss(scene)
  const fernObj = createFerns(scene)
  const gcObj = createGroundCover(scene)
  createRocks(scene) // meshes self-register with the scene; nothing further to reach through here
  const glassBox = createGlassBox(scene)

  // ─────────────────────────────────────────────────────────────────────────────
  // RAYCASTING - Hover interaction on fern leaves
  // ─────────────────────────────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2(-9999, -9999)
  let hoveredObj = null

  // Scoped to the canvas itself (not `window`, unlike the source demo) — this scene can be
  // mounted/disposed/re-mounted repeatedly (going into Dictionary mode and back), so a window-level
  // listener would otherwise pile up across mounts.
  function onPointerMove(e) {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }
  renderer.domElement.addEventListener('mousemove', onPointerMove)

  function checkHover(time) {
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(fernObj.fernMeshes, false)

    if (hits.length > 0) {
      const obj = hits[0].object
      if (obj !== hoveredObj) {
        if (hoveredObj?.material?.emissive) hoveredObj.material.emissiveIntensity = 0
        hoveredObj = obj
      }
      if (hoveredObj.material?.emissive) {
        hoveredObj.material.emissiveIntensity = 0.12 + Math.sin(time * 3) * 0.05
      }
      renderer.domElement.style.cursor = 'pointer'
    } else {
      if (hoveredObj?.material?.emissive) hoveredObj.material.emissiveIntensity = 0
      hoveredObj = null
      renderer.domElement.style.cursor = ''
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTO-ROTATE CONTROL - Camera rotates idle, stops on user interaction
  // ─────────────────────────────────────────────────────────────────────────────
  let idleTimer
  function onPointerDown() {
    controls.autoRotate = false
  }
  function onPointerUp() {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      controls.autoRotate = true
    }, 8000)
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)

  // ─────────────────────────────────────────────────────────────────────────────
  // ENVIRONMENT MAP - Provides reflections for the glass box
  // ─────────────────────────────────────────────────────────────────────────────
  function buildEnvMap() {
    const pmremGen = new THREE.PMREMGenerator(renderer)
    pmremGen.compileEquirectangularShader()

    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size * 2
    canvas.height = size
    const ctx = canvas.getContext('2d')
    const grd = ctx.createLinearGradient(0, 0, 0, size)
    grd.addColorStop(0, '#1a2a3a')
    grd.addColorStop(0.4, '#0a1218')
    grd.addColorStop(1, '#050808')
    ctx.fillStyle = grd
    ctx.fillRect(0, 0, size * 2, size)

    const equiTex = new THREE.CanvasTexture(canvas)
    equiTex.mapping = THREE.EquirectangularReflectionMapping

    scene.environment = pmremGen.fromEquirectangular(equiTex).texture
    scene.environmentIntensity = 0.4

    equiTex.dispose()
    pmremGen.dispose()
    renderer.setRenderTarget(null)
  }
  buildEnvMap()

  // ─────────────────────────────────────────────────────────────────────────────
  // CAMERA ANIMATION STATE
  // ─────────────────────────────────────────────────────────────────────────────
  let cameraAnimStart = null
  let cameraAnimComplete = false

  // Live — see this file's header comment. main.js dispatches terrariumEnterCloseUp on welcome's
  // own "enter the terrarium" click, which is what actually moves closeUpAnimPhase off 0.
  let closeUpAnimStart = null
  let closeUpAnimStartPos = null
  let closeUpAnimPhase = 0
  let closeUpAnimating = false

  // enterOrb() — the select-mode → dictionary/flashcards spiral (main.js's own header comment on
  // enterOrb, below, has the full choreography). Deliberately NOT folded into closeUpAnimPhase's own
  // chain above: every one of those phases is reversible (there's always a "back" that undoes it),
  // this one genuinely isn't — leaving the home page tears the whole terrarium down right after,
  // there's no "exit the spiral" to come back from. spiralPhase: 0 = idle (never started), 1 = pulling
  // back + spinning (spiralOutDuration), 2 = still spinning, now diving back in while the box shatters
  // concurrently (spiralInDuration), 3 = done. 3, deliberately, not back to 0 — see the phase-2→3
  // transition's own comment below for why landing back on the "idle" value specifically breaks the
  // dive's own final position. spiralTheta accumulates continuously across BOTH phases off a single
  // never-reset start time (spiralSpinStart) — computed fresh each frame from elapsed time, not
  // incremented per-frame, so it can't drift and never has to reset/jump at the phase-1→2 boundary,
  // which is what makes the two legs read as one unbroken spiral instead of two separate moves.
  // spiralStartSph/spiralPeakSph are Sphericals (radius/phi around controls.target) computed fresh
  // per call from wherever the camera actually is — this generalizes correctly whether the entry
  // point is closeUpPos (dictionary) or deckZoomPos (a lesson, reached through the deck picker).
  // orbEnterResolve is the Promise enterOrb() itself returned to its caller — resolved once phase 2
  // finishes, so main.js knows exactly when it's safe to actually dispose the terrarium.
  let spiralPhase = 0
  let spiralSpinStart = null
  let spiralPhaseStart = null
  let spiralThetaStart = 0
  const spiralStartSph = new THREE.Spherical()
  const spiralPeakSph = new THREE.Spherical()
  let spiralShatter = null
  // The intact box's own materials → their opacity AT the phase-1→2 handoff — the fade's own start
  // value (see the const comment above this function for the full reasoning on the fade itself).
  let spiralFadeTargets = null
  let orbEnterResolve = null
  // enterOrb()'s own optional second signal — fired once, right at the phase-1→2 handoff (the
  // instant the spiral actually turns back toward the orb), NOT at orbEnterResolve's own much later
  // moment (phase 2 fully landed). main.js uses this to hide its own "entering the terrarium"
  // caption exactly when the dive-back-in leg starts, not at the end of the whole ~4.7s sequence.
  let orbDiveStartCallback = null

  let collectionCamAnimating = false
  let collectionCamStart = null
  let collectionCamFromPos = null
  let collectionCamTargetPos = null
  let collectionCamIsOpen = false

  let brandSelectAnimating = false
  let brandSelectAnimStart = null
  let brandSelectSpeed = 3.6
  const brandSelectStartSph = new THREE.Spherical()
  const brandSelectTgtSph = new THREE.Spherical()
  let brandSelectTheta = 0
  const _sphOffset = new THREE.Vector3()
  const _zoomOffset = new THREE.Vector3()

  function onWheel(e) {
    e.preventDefault()
    const delta = e.ctrlKey ? e.deltaY * 12 : e.deltaY
    const factor = Math.pow(0.65, -delta / 100)
    _zoomOffset.subVectors(camera.position, controls.target)
    const newDist = Math.max(controls.minDistance, Math.min(controls.maxDistance, _zoomOffset.length() * factor))
    _zoomOffset.setLength(newDist)
    camera.position.copy(controls.target).add(_zoomOffset)
  }
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

  // onEnterCloseUp/onExitCloseUp are live (see header comment) — the other three below
  // (onBrandSelected/onCollectionOpened/onCollectionClosed) are still fully dormant; nothing in
  // this build dispatches brandSelected/collectionOpened/collectionClosed.
  function onEnterCloseUp() {
    controls.autoRotate = false
    closeUpAnimStart = performance.now()
    closeUpAnimPhase = 1
    closeUpAnimating = true
  }
  function onBrandSelected() {
    brandSelectAnimating = true
    brandSelectAnimStart = performance.now()
    _sphOffset.copy(camera.position).sub(controls.target)
    brandSelectStartSph.setFromVector3(_sphOffset)
    _sphOffset.set(
      brandSelectZoomPos.x - controls.target.x,
      brandSelectZoomPos.y - controls.target.y,
      brandSelectZoomPos.z - controls.target.z,
    )
    brandSelectTgtSph.setFromVector3(_sphOffset)
    brandSelectTheta = brandSelectStartSph.theta
    brandSelectSpeed = controls.autoRotateSpeed
    controls.autoRotate = false
  }
  function onCollectionOpened() {
    if (brandSelectAnimating) {
      brandSelectAnimating = false
      brandSelectAnimStart = null
      controls.autoRotate = true
      controls.autoRotateSpeed = brandSelectSpeed
    }
    collectionCamIsOpen = true
    collectionCamAnimating = true
    collectionCamStart = performance.now()
    collectionCamFromPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    collectionCamTargetPos = collectionViewPos
    controls.autoRotate = false
  }
  function onCollectionClosed() {
    collectionCamIsOpen = false
    collectionCamAnimating = true
    collectionCamStart = performance.now()
    collectionCamFromPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
    collectionCamTargetPos = brandSelectZoomPos
    controls.autoRotate = false
  }
  function onExitCloseUp() {
    closeUpAnimPhase = 3
    closeUpAnimating = true
    closeUpAnimStart = performance.now()
    closeUpAnimStartPos = null
    controls.autoRotate = false
  }
  // onEnterDeck/onExitDeck — live, same as onEnterCloseUp/onExitCloseUp above (see this file's header
  // comment for the phase numbering and why it jumps 3 → 7 with no 4/5/6: phase 7 = close-up →
  // deck-zoom, 9 = deck-zoom → close-up, reusing the SAME closeUpAnim* state phases 1/3 already
  // drive, not new variables — one continuous birds-eye ⇄ close-up ⇄ deck-zoom chain).
  // closeUpAnimStartPos is nulled here (unlike onEnterCloseUp, which never needs to — it only ever
  // fires from phase 0's resting birds-eye) so the very next animate() tick captures whatever
  // position the camera is ACTUALLY at right now as the tween's start, the same defensive move
  // onExitCloseUp already makes — matters if this ever fires while a previous tween hasn't fully
  // settled, not just from a clean resting state.
  function onEnterDeck() {
    controls.autoRotate = false
    closeUpAnimStart = performance.now()
    closeUpAnimStartPos = null
    closeUpAnimPhase = 7
    closeUpAnimating = true
  }
  function onExitDeck() {
    controls.autoRotate = false
    closeUpAnimStart = performance.now()
    closeUpAnimStartPos = null
    closeUpAnimPhase = 9
    closeUpAnimating = true
  }

  // enterOrb() — a directly-called method (main.js's own dictionary-entry sequence awaits it), not
  // an event listener like everything above; exposed on this function's own return value, below.
  // Sets up both Sphericals (start = wherever the camera actually is right now; peak = spiralPeakBlend
  // of the way from there toward birds-eye's own radius/phi) and lets spiralPhase (driven in the
  // animate() loop, same as everything else in this file) carry it the rest of the way: phase 1 pulls
  // back to the peak while already spinning, phase 2 keeps spinning and dives back in — shattering the
  // box concurrently — until it lands. The returned Promise resolves only once phase 2 is fully done —
  // main.js needs that, not just a fire-and-forget event, so it knows exactly when it's safe to
  // actually dispose the terrarium: too early and the shatter/dive cuts off mid-flight; too late and
  // the next screen is left waiting on an animation nobody can see any more.
  // `onDiveStart` — optional, fired once at the phase-1→2 handoff (orbDiveStartCallback's own comment
  // above has the full reasoning) — a SECOND, earlier signal alongside the returned Promise, for a
  // caller that needs to react to "the dive back in just started," not just "the whole spiral is done."
  function enterOrb(onDiveStart) {
    return new Promise((resolve) => {
      orbEnterResolve = resolve
      orbDiveStartCallback = onDiveStart || null
      controls.autoRotate = false
      _sphOffset.copy(camera.position).sub(controls.target)
      spiralStartSph.setFromVector3(_sphOffset)
      _sphOffset.set(birdsEyePos.x, birdsEyePos.y, birdsEyePos.z).sub(controls.target)
      const birdsEyeSph = new THREE.Spherical().setFromVector3(_sphOffset)
      spiralPeakSph.set(
        spiralStartSph.radius + (birdsEyeSph.radius - spiralStartSph.radius) * spiralPeakBlend,
        spiralStartSph.phi + (birdsEyeSph.phi - spiralStartSph.phi) * spiralPeakBlend,
        spiralStartSph.theta, // theta is driven by the continuous spin, not this blend
      )
      spiralThetaStart = spiralStartSph.theta
      spiralSpinStart = performance.now()
      spiralPhaseStart = spiralSpinStart
      spiralPhase = 1
    })
  }

  window.addEventListener('terrariumEnterCloseUp', onEnterCloseUp)
  window.addEventListener('brandSelected', onBrandSelected)
  window.addEventListener('collectionOpened', onCollectionOpened)
  window.addEventListener('collectionClosed', onCollectionClosed)
  window.addEventListener('terrariumExitCloseUp', onExitCloseUp)
  window.addEventListener('terrariumEnterDeck', onEnterDeck)
  window.addEventListener('terrariumExitDeck', onExitDeck)

  // ═══════════════════════════════════════════════════════════════════════════════
  // ANIMATION LOOP
  // ═══════════════════════════════════════════════════════════════════════════════
  let frameCount = 0
  let rafId = null
  let disposed = false

  function animate() {
    rafId = requestAnimationFrame(animate)

    const time = clock.getElapsedTime()
    frameCount++

    // closeUpAnimating (phases 1/3, live) and collectionCamAnimating/brandSelectAnimating (still
    // fully dormant) — see header comment for which is which.
    if (closeUpAnimating && closeUpAnimStart !== null) {
      const elapsed = performance.now() - closeUpAnimStart
      if (closeUpAnimPhase === 1) {
        if (closeUpAnimStartPos === null) {
          closeUpAnimStartPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
        }
        const progress = Math.min(elapsed / closeUpEnterDuration, 1)
        const ease = easeOutCubic(progress)
        camera.position.x = closeUpAnimStartPos.x + (closeUpPos.x - closeUpAnimStartPos.x) * ease
        camera.position.y = closeUpAnimStartPos.y + (closeUpPos.y - closeUpAnimStartPos.y) * ease
        camera.position.z = closeUpAnimStartPos.z + (closeUpPos.z - closeUpAnimStartPos.z) * ease
        if (progress >= 1) {
          closeUpAnimPhase = 2
          closeUpAnimStartPos = null
          camera.position.set(closeUpPos.x, closeUpPos.y, closeUpPos.z)
          controls.autoRotate = true
          controls.autoRotateSpeed = 3.6
        }
      } else if (closeUpAnimPhase === 3) {
        if (closeUpAnimStartPos === null) {
          closeUpAnimStartPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
        }
        const progress = Math.min(elapsed / closeUpExitDuration, 1)
        const ease = easeOutCubic(progress)
        camera.position.x = closeUpAnimStartPos.x + (birdsEyePos.x - closeUpAnimStartPos.x) * ease
        camera.position.y = closeUpAnimStartPos.y + (birdsEyePos.y - closeUpAnimStartPos.y) * ease
        camera.position.z = closeUpAnimStartPos.z + (birdsEyePos.z - closeUpAnimStartPos.z) * ease
        if (progress >= 1) {
          closeUpAnimPhase = 0
          closeUpAnimating = false
          closeUpAnimStartPos = null
          camera.position.set(birdsEyePos.x, birdsEyePos.y, birdsEyePos.z)
          controls.autoRotate = true
          controls.autoRotateSpeed = 0.7
        }
      } else if (closeUpAnimPhase === 7) {
        // Close-up → deck-zoom, direct (this file's header comment explains why phases 4/5/6 —
        // the removed intermediate flashcards-zoom stop — no longer exist between phase 3 and here).
        // Same tween shape as phase 1 above, just a different target/duration.
        if (closeUpAnimStartPos === null) {
          closeUpAnimStartPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
        }
        const progress = Math.min(elapsed / deckZoomEnterDuration, 1)
        const ease = easeOutCubic(progress)
        camera.position.x = closeUpAnimStartPos.x + (deckZoomPos.x - closeUpAnimStartPos.x) * ease
        camera.position.y = closeUpAnimStartPos.y + (deckZoomPos.y - closeUpAnimStartPos.y) * ease
        camera.position.z = closeUpAnimStartPos.z + (deckZoomPos.z - closeUpAnimStartPos.z) * ease
        if (progress >= 1) {
          closeUpAnimPhase = 8
          closeUpAnimStartPos = null
          camera.position.set(deckZoomPos.x, deckZoomPos.y, deckZoomPos.z)
          controls.autoRotate = true
          controls.autoRotateSpeed = 3.6
        }
      } else if (closeUpAnimPhase === 9) {
        // Deck-zoom → close-up, direct — the mirror of phase 7, landing back at phase 2 (the SAME
        // "resting at close-up" state phase 1's own completion already uses) rather than a separate
        // resting phase of its own, since both really do mean the same thing: camera settled at
        // closeUpPos. Used to regress to phase 5 ("resting at flashcards-zoom") instead — see this
        // file's header comment for why that intermediate stop is gone.
        if (closeUpAnimStartPos === null) {
          closeUpAnimStartPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
        }
        const progress = Math.min(elapsed / deckZoomExitDuration, 1)
        const ease = easeOutCubic(progress)
        camera.position.x = closeUpAnimStartPos.x + (closeUpPos.x - closeUpAnimStartPos.x) * ease
        camera.position.y = closeUpAnimStartPos.y + (closeUpPos.y - closeUpAnimStartPos.y) * ease
        camera.position.z = closeUpAnimStartPos.z + (closeUpPos.z - closeUpAnimStartPos.z) * ease
        if (progress >= 1) {
          closeUpAnimPhase = 2
          closeUpAnimStartPos = null
          camera.position.set(closeUpPos.x, closeUpPos.y, closeUpPos.z)
          controls.autoRotate = true
          controls.autoRotateSpeed = 3.6
        }
      }
    }

    // enterOrb's own spiral — see that function's own comment for the full reasoning. Separate from
    // closeUpAnimPhase's block above on purpose (this file's header comment on enterOrb explains why:
    // non-reversible, fires from exactly one place per call, resolves a Promise instead of just
    // running). spiralTheta is recomputed fresh from elapsed time every frame (never incremented),
    // continuously across phases 1 and 2 off the ONE spiralSpinStart timestamp — that's what makes the
    // spin read as one unbroken motion straight through the pull-back-to-peak → dive-back-in boundary,
    // with no reset or stutter at the seam. Both legs are constant-speed (linear progress, no easing)
    // — the explicit "PS2 disc-load," "massive spaceship" ask, and the same reasoning scene.js's
    // LOAD_SWOOP/DETACH_ZOOM comments already give for why an eased deceleration reads "modern/ai"
    // here rather than heavy.
    if (spiralPhase === 1 || spiralPhase === 2) {
      const spiralTheta =
        spiralThetaStart + ((performance.now() - spiralSpinStart) / 1000) * (spiralSpinRateDegPerSec * (Math.PI / 180))
      if (spiralPhase === 1) {
        const progress = Math.min((performance.now() - spiralPhaseStart) / spiralOutDuration, 1)
        const radius = spiralStartSph.radius + (spiralPeakSph.radius - spiralStartSph.radius) * progress
        const phi = spiralStartSph.phi + (spiralPeakSph.phi - spiralStartSph.phi) * progress
        _sphOffset.setFromSphericalCoords(radius, phi, spiralTheta)
        camera.position.copy(controls.target).add(_sphOffset)
        if (progress >= 1) {
          // The hand-off into the dive+shatter leg. Capture each real box material's own CURRENT
          // opacity here (not assumed to be 1 — glass is already translucent at rest) as the fade's
          // own start value, force transparent:true on any material that doesn't already have it (the
          // metal base, the glow sphere) — BEFORE spawning the shatter fragments below, so this
          // traversal only ever catches the box's own real meshes, never the fragments themselves.
          // The actual fade itself runs in the `else` branch below, on the SAME `progress` as the
          // dive/shatter — see the `spiralFadeTargets` declaration's own comment, and the const
          // comment near the top of this file, for why (explicit request: fade alongside the shards,
          // land at exactly 0 opacity the instant the dive itself lands).
          spiralFadeTargets = new Map()
          glassBox.root.traverse((obj) => {
            if (!obj.material) return
            const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
            for (const mat of materials) {
              mat.transparent = true
              spiralFadeTargets.set(mat, mat.opacity)
            }
          })
          spiralShatter = createShatter(glassBox.root)
          spiralPhaseStart = performance.now()
          spiralPhase = 2
          // Fire the dive-start signal HERE, not at phase 2's own completion below — this is the
          // "starts moving back in towards the terrarium" moment main.js's caption is keyed to.
          orbDiveStartCallback?.()
          orbDiveStartCallback = null
        }
      } else {
        const progress = Math.min((performance.now() - spiralPhaseStart) / spiralInDuration, 1)
        const diveRadius = spiralPeakSph.radius * spiralDiveBlend
        const radius = spiralPeakSph.radius + (diveRadius - spiralPeakSph.radius) * progress
        const phi = spiralPeakSph.phi + (spiralStartSph.phi - spiralPeakSph.phi) * progress
        _sphOffset.setFromSphericalCoords(radius, phi, spiralTheta)
        camera.position.copy(controls.target).add(_sphOffset)
        spiralShatter.update(progress)
        // The intact box itself fades out right alongside the shards it just broke into, but on its
        // own COMPRESSED progress (spiralBoxFadeBlend's own comment above) — reaches exactly 0 at the
        // dive's own halfway point, not the very end like the shards themselves keep animating toward.
        const boxFadeProgress = Math.min(progress / spiralBoxFadeBlend, 1)
        for (const [mat, startOpacity] of spiralFadeTargets) mat.opacity = startOpacity * (1 - boxFadeProgress)
        if (progress >= 1) {
          // 3, not 0 — a real, caught bug: resetting to 0 here flips the lookAt/controls.update()
          // branch below back to "normal" for this same frame (before main.js's continuation has
          // actually disposed the terrarium), and controls.update() immediately snaps the
          // camera's distance from target back out to controls.minDistance (0.7) — since the dive
          // deliberately lands well inside that, at spiralDiveBlend's own tiny fraction of the peak
          // radius. 3 is just "done, not 0" — spiralPhase===1||2 above still correctly stops
          // re-running this tween, and the lookAt branch below still correctly treats "anything but
          // 0" as "stay off controls.update()," which is exactly right: this terrarium instance is
          // being torn down right after anyway, so nothing needs ordinary orbit controls again.
          spiralPhase = 3
          spiralShatter = null
          spiralFadeTargets = null
          // Resolve LAST, after every bit of internal cleanup above — main.js's own continuation
          // (disposing the terrarium, mounting the next screen) runs the instant this fires, so
          // nothing here should still be "in progress" when it does.
          orbEnterResolve?.()
          orbEnterResolve = null
        }
      }
    }

    if (collectionCamAnimating && collectionCamStart !== null) {
      const dur = collectionCamIsOpen ? collectionOpenDuration : collectionCloseDuration
      const elapsed = performance.now() - collectionCamStart
      const progress = Math.min(elapsed / dur, 1)
      const ease = easeOutCubic(progress)
      camera.position.x = collectionCamFromPos.x + (collectionCamTargetPos.x - collectionCamFromPos.x) * ease
      camera.position.y = collectionCamFromPos.y + (collectionCamTargetPos.y - collectionCamFromPos.y) * ease
      camera.position.z = collectionCamFromPos.z + (collectionCamTargetPos.z - collectionCamFromPos.z) * ease
      if (progress >= 1) {
        collectionCamAnimating = false
        collectionCamStart = null
        controls.autoRotate = true
        controls.autoRotateSpeed = collectionCamIsOpen ? 1.0 : brandSelectSpeed
      }
    }

    if (brandSelectAnimating && brandSelectAnimStart !== null) {
      const elapsed = performance.now() - brandSelectAnimStart
      const progress = Math.min(elapsed / brandSelectZoomDuration, 1)
      const ease = easeOutCubic(progress)
      const radius = brandSelectStartSph.radius + (brandSelectTgtSph.radius - brandSelectStartSph.radius) * ease
      const phi = brandSelectStartSph.phi + (brandSelectTgtSph.phi - brandSelectStartSph.phi) * ease
      brandSelectTheta -= ((2 * Math.PI) / 3600) * brandSelectSpeed
      _sphOffset.setFromSphericalCoords(radius, phi, brandSelectTheta)
      camera.position.copy(controls.target).add(_sphOffset)
      if (progress >= 1) {
        brandSelectAnimating = false
        brandSelectAnimStart = null
        controls.autoRotate = true
        controls.autoRotateSpeed = brandSelectSpeed
      }
    }

    // ── CAMERA ENTRANCE — the one animation that's NOT event-gated; plays on every mount ────────
    // `entranceTargetPos` — birdsEyePos normally (the ordinary "starts small, settles in" first look
    // every mount gets), or closeUpPos when `startAtCloseUp` (main.js's mountHome(true) — returning
    // directly to select mode, skipping welcome entirely). Deliberately re-targeting this SAME single
    // tween rather than stacking phase 1's own separate close-up swoop on top of it once phase 0
    // finishes: dispatching terrariumEnterCloseUp before this entrance has genuinely settled would
    // stop phase 0 outright (its own guard below is closeUpAnimPhase === 0) and start phase 1's own
    // tween from wherever the entrance happened to be mid-flight, not from a real resting position —
    // broken, not just untidy. One continuous, correctly-timed tween to wherever this mount actually
    // needs to land is simpler and correct by construction instead.
    const entranceTargetPos = startAtCloseUp ? closeUpPos : birdsEyePos
    if (!cameraAnimComplete && closeUpAnimPhase === 0) {
      if (cameraAnimStart === null) {
        cameraAnimStart = performance.now()
        controls.autoRotate = false
        camera.position.set(cameraStartPos.x, cameraStartPos.y, cameraStartPos.z)
      }
      const elapsed = performance.now() - cameraAnimStart
      const progress = Math.min(elapsed / birdsEyeDuration, 1)
      const ease = easeOutCubic(progress)
      camera.position.x = cameraStartPos.x + (entranceTargetPos.x - cameraStartPos.x) * ease
      camera.position.y = cameraStartPos.y + (entranceTargetPos.y - cameraStartPos.y) * ease
      camera.position.z = cameraStartPos.z + (entranceTargetPos.z - cameraStartPos.z) * ease
      if (progress >= 1) {
        cameraAnimComplete = true
        camera.position.set(entranceTargetPos.x, entranceTargetPos.y, entranceTargetPos.z)
        controls.autoRotate = true
        controls.autoRotateSpeed = startAtCloseUp ? 3.6 : 0.7 // matches whichever resting phase this
        // actually lands on below — 3.6 is closeUpPos's own idle speed everywhere else in this file
        // (phase 1/4/6/7/9's own completions), not a new number invented for this.
        // Lands on phase 2 — the SAME "resting at close-up" state terrariumEnterCloseUp's own phase 1
        // completion already uses — not phase 0, so terrariumExitCloseUp (select-mode's own 'exit')
        // correctly reverses FROM close-up later, exactly as if a real swoop had landed here.
        if (startAtCloseUp) closeUpAnimPhase = 2
      }
    }

    if (brandSelectAnimating || spiralPhase !== 0) {
      camera.lookAt(controls.target)
    } else {
      controls.update()
    }

    updateLighting(lighting, time)
    updateFineMoss(fineMoss, time)
    updateFerns(fernObj, time)
    updateGroundCover(gcObj, time)
    updateGlassBox(glassBox, time)

    if (frameCount % 2 === 0) checkHover(time)

    renderer.render(scene, camera)
  }
  animate()

  // ═══════════════════════════════════════════════════════════════════════════════
  // DISPOSE — not present in the source demo (it never needed to tear itself down). Walks the
  // whole scene graph disposing geometries/materials/textures generically (including shader-
  // material uniform textures, which is how the fern/moss/rock/glass procedural textures all get
  // caught without needing a bespoke dispose path per subsystem file), then tears down everything
  // mountTerrarium itself created: the render loop, every listener, the renderer, controls, and the
  // resize observer. Safe to call once; a second call is a no-op via the `disposed` guard.
  // ═══════════════════════════════════════════════════════════════════════════════
  function disposeMaterial(material) {
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap', 'aoMap']) {
      material[key]?.dispose?.()
    }
    if (material.isShaderMaterial && material.uniforms) {
      for (const uniform of Object.values(material.uniforms)) {
        if (uniform?.value?.isTexture) uniform.value.dispose()
      }
    }
    material.dispose()
  }

  function dispose() {
    if (disposed) return
    disposed = true

    cancelAnimationFrame(rafId)
    clearTimeout(idleTimer)

    renderer.domElement.removeEventListener('mousemove', onPointerMove)
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('wheel', onWheel)
    window.removeEventListener('terrariumEnterCloseUp', onEnterCloseUp)
    window.removeEventListener('brandSelected', onBrandSelected)
    window.removeEventListener('collectionOpened', onCollectionOpened)
    window.removeEventListener('collectionClosed', onCollectionClosed)
    window.removeEventListener('terrariumExitCloseUp', onExitCloseUp)
    window.removeEventListener('terrariumEnterDeck', onEnterDeck)
    window.removeEventListener('terrariumExitDeck', onExitDeck)

    scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      if (Array.isArray(obj.material)) obj.material.forEach(disposeMaterial)
      else if (obj.material) disposeMaterial(obj.material)
    })
    scene.environment?.dispose?.()

    disposeResize()
    controls.dispose()
    renderer.dispose()
    renderer.domElement.remove()

    delete window._scene
    delete window._camera
    delete window._controls
    delete window._projectToScreen
    delete window._spiralState
  }

  // Debug exports, same as the source demo — harmless, and genuinely useful for live inspection;
  // cleaned up in dispose() above rather than left dangling after unmount.
  window._scene = scene
  window._camera = camera
  window._controls = controls
  const _projVec = new THREE.Vector3()
  const _projResult = { x: 0, y: 0 }
  window._projectToScreen = (wx, wy, wz) => {
    _projVec.set(wx, wy, wz).project(camera)
    const rect = renderer.domElement.getBoundingClientRect()
    _projResult.x = ((_projVec.x + 1) / 2) * rect.width
    _projResult.y = (-(_projVec.y - 1) / 2) * rect.height
    return _projResult
  }
  // Tuning-only debug export for the spiral (enterOrb) choreography — ground truth for where the
  // camera/shatter actually are at a given moment, since wall-clock waits from outside the page can't
  // be trusted to land on a specific animation progress. Same cleanup convention as the exports above.
  window._spiralState = () => ({
    phase: spiralPhase,
    radius: camera.position.distanceTo(controls.target),
    cameraPos: camera.position.clone(),
  })

  return { dispose, enterOrb }
}
