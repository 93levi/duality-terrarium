// Every visually-tunable constant for the 3D viewer, in one place — colors, camera framing, light
// rig, animation feel, stroke dimensions. Change values here for a purely visual/UI tweak; nothing
// here affects classification, data loading, or interaction logic (raycasting, pin/hover state,
// click-vs-drag detection) — that lives in scene.js and kanjiRenderer.js and shouldn't need to
// change just because a color or angle changed. Deliberately zero THREE.js imports — plain values
// only, so this file is editable without knowing Three.js's API. See apps/web/CLAUDE.md.

export const COLORS = {
  background: 0x07090b, // matches the home terrarium's scene background (terrarium/scene.js) so the two screens read as one continuous black, not a lighter dictionary-mode gray
  ink: 0xf2f0ea, // stroke color when nothing is hovered/pinned
  highlightUseful: 0xceffda, // the EXACT jade used everywhere in the 2D UI's own glow (style.css's
  // rgba(206,255,218,…) text-shadow stacks on .info-character/.related-kanji/etc.) — matched
  // verbatim, not a re-derived approximation, so the 3D hover's own glow reads as the same "house"
  // color as the boxes' glow instead of a different, unrelated green. Was a self-invented neon
  // 0x39ffc4 before this; still only ever used for hoverUseful below.
  highlightNoise: 0xef5350, // muted red — confirms noise (test tool only, see apps/web/CLAUDE.md)
}

// "Hollow glass box" pin look — translucent + glowing, not a flat fill. Hover is the dimmer
// preview version; pin is the brighter/cooler "confirmed" version. The actual glass *construction*
// (not just these numbers) is ported 1:1 from moss x kanji FINAL's `glassbox2.js` centerpiece box:
// every translucent state renders as two coincident passes on the same geometry — a BackSide pass
// (the inner surface, more opaque) then a FrontSide pass (the outer surface, more transparent),
// both non-depth-writing so they layer instead of occluding — rather than one flat translucent
// fill. See scene.js's `makeGlassPair` for where this gets built; roughness/metalness/env
// reflectivity are shared across every glass state (GLASS below) exactly as glassbox2.js shares
// one `glassMat` recipe across its whole box, only opacity/color/emissive vary per state.
export const GLASS = {
  // Bumped from glassbox2.js's original 0.08 — that low a roughness is close to mirror-smooth, and
  // combined with the light rig + envMap reflection it was throwing a sharp specular glint at
  // certain viewing angles ("sparkle" — the bloom pass then picked that single bright point up and
  // made it worse). 0.22 wasn't enough on its own to fully kill it; 0.4 does, while still reading
  // as glossy/reflective rather than a flat matte fill.
  roughness: 0.4,
  metalness: 0.05,
  envMapIntensity: 1.4,
  // glassbox2.js's own two passes: back 0.28 opacity, front 0.20 — front is 5/7 of back. Every
  // glass state below sets only its back-pass opacity; the front pass derives from this ratio.
  frontOpacityRatio: 0.2 / 0.28,
}

// Gradient equirectangular environment glassbox2.js's box reflects (via PMREMGenerator) — ported
// 1:1 including the exact stops; see scene.js's `buildEnvironment`.
export const ENV_MAP = {
  stops: [
    [0, '#1a2a3a'],
    [0.4, '#0a1218'],
    [1, '#050808'],
  ],
  environmentIntensity: 0.4,
}

export const MATERIALS = {
  normal: { color: COLORS.ink, roughness: 0.32 },
  // opacity below is the BackSide (inner) pass — see GLASS.frontOpacityRatio for the FrontSide pass.
  // Was a flat, filled green (color: highlightUseful, opacity 0.55) — replaced by request: still
  // reads as "hollow and grey," the SAME neutral base `glass` (below) uses, just with a faint jade
  // tint riding on top instead of a colored fill — "literally so subtle." A pass bumping
  // emissiveIntensity to 1.6 to make this cross BLOOM.threshold and bloom into a halo was tried and
  // reverted by request ("looked better before") — the actual edge/corner glow effect wanted lives
  // instead in EDGE_GLOW below, a separate wireframe overlay, not this fill material.
  hoverUseful: {
    color: COLORS.ink, // same neutral base as `glass`/`normal` — the FILL itself is grey, not green
    opacity: 0.16, // barely above `glass`'s own 0.12 — reads as "still basically unselected," not a
    // filled highlight
    emissive: COLORS.highlightUseful,
    emissiveIntensity: 0.22, // low — "literally so subtle" was the explicit ask; retune this first
    // if it needs to read as more or less noticeable once seen live.
  },
  hoverNoise: { color: COLORS.highlightNoise, roughness: 0.28 },
  // Deliberately NOT green, unlike hoverUseful — green means "hovering, previewing"; an actual
  // pin (the left info box coming up) escalates to a bright white instead, so the two states read
  // as genuinely different things (preview vs. "this is the one you picked"), not just two shades
  // of the same highlight. The *other* part of the character stays exactly as before (see `glass`
  // below, untouched) — only the picked element itself gets this treatment.
  pinned: {
    color: 0xffffff,
    // Higher than every other glass state's opacity (all ~0.55-0.7) — at the same translucency as
    // those, a strong emissive boost barely read as different from plain default-white ink; the
    // glass construction's own transparency was diluting how much of that extra light actually
    // reached the eye. Still not fully opaque (this stays a glass pair, not `normal`'s solid fill —
    // the "hollow glass box" look is core to this project's whole visual system), just denser.
    opacity: 0.92,
    emissive: 0xffffff,
    emissiveIntensity: 2.4, // well above normal ink's own bloom-crossing brightness — reads as a
    // deliberate "lit up" flash, not just "still white like before".
  },
  glass: { color: COLORS.ink, opacity: 0.12, emissive: 0x000000, emissiveIntensity: 0 },
}

// Camera framing — elevated (not dead-on) for a more natural "looking at a real object" feel.
// Distance from origin (sqrt(y²+z²)) should stay roughly constant across angle tweaks so the
// character's apparent size doesn't shift — adjust position[1] (y) and position[2] (z) together.
export const CAMERA = {
  fov: 45,
  near: 0.1,
  far: 1000,
  position: [0, 55, 161],
  lookAt: [0, 0, 0],
}

// 4-light rig (ambient + key + fill + rim) — reads much better on dark strokes than one flat light.
export const LIGHTS = {
  ambient: { intensity: 1.2 },
  key: { position: [60, 100, 120], intensity: 3.5 },
  fill: { position: [-80, 30, 80], intensity: 1.2 },
  rim: { position: [0, -50, -100], intensity: 1.8 },
}

// Interaction *feel* — how fast things move, how forgiving click-vs-drag detection is. Not the
// interaction logic itself (that's in scene.js), just its pacing.
export const MOTION = {
  dragRotateSpeed: 0.008,
  autoSpinSpeed: 0.005, // radians/frame — ~1 turn every 21s at 60fps
  returnEase: 0.08, // fraction of remaining distance eased back to neutral per frame
  clickMoveThreshold: 4, // px of pointer movement beyond which pointerup counts as a drag, not a click
}

// Two-finger pinch-to-resize (scene.js's onWheel/onTouchMove) — a uniform scale on `strokeGroup`,
// separate from and unrelated to camera/rotation. `sensitivity` is deliberately aggressive: a
// single ordinary pinch gesture should be able to swing the character from `min` to `max`, not
// need several repeated pinches to get there. `idleMs`/`returnEase` mirror the drag-rotate
// snap-back's own pattern (MOTION.returnEase) but as a dedicated value — resizing and rotating are
// independent transforms and there's no reason retuning one's return feel should risk the other's.
export const PINCH = {
  sensitivity: 0.02, // exponent multiplier per wheel-delta unit — see onWheel's use of Math.exp
  min: 0.15,
  max: 6,
  idleMs: 4000, // no pinch activity for this long → starts easing back to scale 1
  returnEase: 0.06,
}

// Every fresh character load starts at PINCH's own `max` (not a separate duplicated number, so a
// future retune of one can't silently drift out of sync with the other — "full pinch size") AND
// turned to face `startAngle` off-center — "facing to the side" — instead of the normal neutral
// facing-front pose. Both scale and rotation.y are driven off ONE shared time-based progress value
// (see scene.js's tick(), which suppresses the ordinary auto-spin increment for the duration so it
// doesn't fight this) run through a fixed-`durationMs` `linear` tween (scene.js) — not an
// exponential "approach the target by a fraction every frame" ease like PINCH.returnEase uses (that
// shape is front-loaded — most of the motion happens in the very first few frames, then a long,
// barely-moving crawl to finally settle — and never genuinely finishes, just approaches). This used
// to run through an eased (easeOutCubic, then easeOutQuint) curve instead — reverted by explicit
// request: even the "smoother" quint version still read as a weighted, decelerating glide, which is
// exactly the "looks modern/AI" complaint. `linear` is constant speed, start to finish, no ramp
// either direction. Since scale and rotation share the exact same progress value every frame, they
// still can't drift out of sync with each other the way two independent tweens could, regardless of
// curve. Tuned slower than a snap-to-size on purpose — "a huge spaceship flipping around and
// docking," just gliding at one constant speed now rather than easing into the stop. Bumped once
// (4200 → 5200) to read as an actual massive structure, then pulled back a little (5200 → 4600) by
// request — still wanted slow overall, just not quite that slow specifically for a fresh load-in.
export const LOAD_SWOOP = {
  durationMs: 4600,
  // 90° — fully edge-on/"facing the side" at the start of the swoop. NEGATIVE, not positive — a
  // real, confirmed bug: rotation.y interpolates from `startAngle` DOWN to 0 as the swoop plays
  // (see scene.js's tick()), so a POSITIVE startAngle means rotation.y is DECREASING the whole
  // swoop — but MOTION.autoSpinSpeed (the ordinary idle spin that takes over the instant the swoop
  // ends) is positive, always INCREASING rotation.y. Net effect: the character visibly reversed
  // direction the exact moment it hit normal size — spinning one way while swooping in, then
  // snapping to spin the OTHER way once settled. A negative startAngle makes the swoop itself
  // INCREASE rotation.y (-90° → 0°, same direction auto-spin already turns), so the hand-off is
  // seamless — same direction the whole time, no reversal. Still visually edge-on at the start
  // either way (+90°/-90° are indistinguishable poses — see the auto-spin wrap-around comment in
  // tick() for why), so this changes nothing about how the swoop LOOKS at frame one, only which way
  // it turns to get to 0.
  startAngle: -Math.PI / 2,
}

// Stroke-generation build timing — kanjiRenderer.js's real sample→offset→stitch→extrude pipeline,
// staged out over real time (samplePathPoints draws in, computeOffsetEdges/buildOutlineShape etch
// outward + fade, extrudeOutline grows real depth), same "all strokes together" simultaneous style
// the pipeline-visualization dev tool's own toggle plays — shared verbatim between that tool
// (viewer/pipelineDemo.js) and the REAL load-in swoop (viewer/scene.js's playStrokeGeneration),
// single source of truth so the two can't quietly drift out of sync.
//
// Deliberately NOT stretched to match LOAD_SWOOP's own much longer duration (4600ms), even though
// this plays concurrently with it on every real character load — tried and reverted by explicit
// request: stretching the build to fill the whole swoop means the extrude/Z-depth reveal only
// finishes right as the character's own rotation has ALREADY eased most of the way back to
// front-facing, hiding the exact moment (still meaningfully edge-on) that reveal is supposed to be
// legible at. Left at its own short, independent pace instead — the character finishes generating
// early into the swoop, while it's still turned enough to actually see the depth arrive, then
// continues swooping/rotating into place as an ordinary, already-complete character for the
// remainder of LOAD_SWOOP's own longer duration.
export const STROKE_GENERATION = {
  drawMs: 550,
  etchMs: 750,
  fadeMs: 200,
  extrudeMs: 700,
}

// What the character actually LOOKS like while it swoops in (LOAD_SWOOP above drives scale/
// rotation only, not material) — starts in the same dim, grey, see-through "unselected" skin every
// OTHER part already wears once something's pinned (`glass` in MATERIALS / `glassGlass` in
// scene.js), not lit up from the very first frame (in practice this bare grey is only ever actually
// visible if there's no bundle to generate from — see below). The instant the swoop itself finishes
// (scale/rotation settle at normal), scene.js's tick() drops it straight to solid opaque
// `normalMaterial` — no flicker, no delay (a LOAD_REVEAL flicker step, reusing `pinnedGlass`, was
// tried here first; cut by request in favor of going white the moment the swoop hits normal size).
//
// The real swoop+generation path (scene.js's `playStrokeGeneration`) adds one more state in
// between, later explicit request: the moment generation finishes and the real meshes are actually
// revealed — still mid-swoop, not yet settled — they land in "blueprint mode" instead of that bare
// grey: `glassGlass` plus the wireframe edge-glow outline (EDGE_GLOW, further down this file), the
// SAME look a detach-zoomed sibling wears once something's pinned. That's what the character
// actually wears for the tail of the swoop; tick()'s own swoopingIn settle (above) is what then
// swaps it to solid white once the swoop actually lands. So the real arc is: invisible (still
// generating) → blueprint (revealed, still swooping) → solid white (settled) — blueprint is a
// brief transitional look for that tail stretch, not a new resting state; unpinning/hovering away
// still land back on plain `normalMaterial`, unchanged.
//
// Blueprint actually starts a stage earlier than that reveal moment, later correction — Stage 3's
// own extrude-growing overlay meshes (`playStrokeGeneration`'s own comment on `extrudeMeshes` has
// the mechanics) grow their OWN edge-glow outline right alongside their depth now, not just plain
// grey for that whole ~700ms stretch with the outline only appearing once the real meshes take
// over. Explicit request, a real, confirmed hitch: the flat 2D lines (Stage 1/2) going straight
// into a plain-grey growing 3D shape, THEN switching to blueprint only once fully grown and handed
// off, read as an awkward extra step wedged between "2D" and "3D blueprint" — they're meant to feel
// like one continuous world, not three. So the outline is present from the very first frame
// anything has real depth at all; there's no plain-grey 3D moment left anywhere in this sequence.

// The "generating in" flicker a useful hover plays once, instead of just snapping straight to
// hoverUsefulGlass — see scene.js's applyHoverReveal/tick. Each step is HELD until the next one
// (steps()-style jump-cut, like the caret's blink and mossBox.js's own spawn-flicker elsewhere in
// this project — never interpolated/eased between them), and the values are deliberately
// irregular — a bright overshoot, a cut to black, a partial flicker, another dip, THEN settling —
// not a smooth ramp from 0 to 1. That irregularity is the whole point: a clean fade reads as a
// modern UI transition; this reads as a signal jankily acquiring, closer to a CRT/old-hardware
// power-on flicker. `opacity`/`emissive` are multipliers on MATERIALS.hoverUseful's own tuned
// values, not absolute numbers — the final step is always exactly 1x, so it always settles on the
// real, already-tuned material rather than a re-derived approximation of it.
export const HOVER_REVEAL = {
  durationMs: 260,
  steps: [
    { t: 0, opacity: 0.3, emissive: 2.6 }, // bright overshoot flash
    { t: 0.1, opacity: 0, emissive: 0 }, // cut to nothing
    { t: 0.2, opacity: 0.8, emissive: 1.8 }, // flickers back, too bright
    { t: 0.28, opacity: 0.1, emissive: 0.2 }, // dips again
    { t: 0.42, opacity: 0.9, emissive: 1.3 },
    { t: 0.55, opacity: 0.35, emissive: 0.5 },
    { t: 0.72, opacity: 1, emissive: 1 }, // settles on the real material values
  ],
}

// The same "generating in" treatment as HOVER_REVEAL, played once when an actual pin lands
// instead of just snapping straight to the white pinned glow — see scene.js's
// applyPinReveal/tick. Same steps()-style jump-cut philosophy (irregular, held values, not an
// eased ramp); a separate, slightly longer sequence from HOVER_REVEAL rather than reusing it
// directly, since it's scaling MATERIALS.pinned's own (much higher) opacity/emissiveIntensity, not
// hoverUseful's — an identical multiplier curve wouldn't read the same against a different base.
export const PIN_REVEAL = {
  durationMs: 320,
  steps: [
    { t: 0, opacity: 0.35, emissive: 2.2 }, // bright overshoot flash
    { t: 0.08, opacity: 0, emissive: 0 }, // cut to nothing
    { t: 0.16, opacity: 0.85, emissive: 1.6 }, // flickers back, too bright
    { t: 0.24, opacity: 0.15, emissive: 0.2 }, // dips again
    { t: 0.36, opacity: 0.9, emissive: 1.3 },
    { t: 0.48, opacity: 0.4, emissive: 0.5 },
    { t: 0.62, opacity: 1, emissive: 1.2 }, // brief overshoot before settling
    { t: 0.8, opacity: 1, emissive: 1 }, // settles on the real material values
  ],
}

// A flashcard session's static load (main.js's mountFlashcardSession, setKanjiGroup's
// `animateEntrance: false`) — no swoop, no rotation, but the material still shouldn't just snap
// straight to normalMaterial the way the swoop path's own instant-white does.
//
// REWORKED from a first pass that literally reused PIN_REVEAL's own 320ms flicker verbatim — too
// short, explicit correction: the flashcard box's own "pop down and show the front prompt"
// animation (main.js's regenerate() sequence) takes roughly a full second, and the model finishing
// its reveal well before the box even finishes opening read as mismatched, not "the same effect
// from dictionary" applied here, just a shorter unrelated flicker that happened to share a shape.
// `durationMs` below is a deliberate match to that box timing, not a re-tuned flicker length picked
// in isolation.
//
// Also a genuinely different sequence now, not just a re-timed copy of PIN_REVEAL — three real
// material states in order, each one a state this app ALREADY has a name and a look for, not
// invented for this: `blueprint` (glassGlass + the wireframe edge outline — literally the same look
// a detach-zoomed sibling wears, `setGroupMaterial(..., glassGlass, {showEdgeGlow:true})`) → `gray`
// (glassGlass alone, edge outline dropped) → `glow` (pinnedGlass — the same bright-white "confirmed"
// material a real pin uses — played through the SAME jump-cut "generating in" philosophy
// PIN_REVEAL/HOVER_REVEAL already established: irregular held values, a bright overshoot, a cut to
// black, a couple more flickers, THEN settling, never an eased ramp). `blueprintEndT`/`grayEndT` are
// fractions of `durationMs` marking where each discrete state hands off to the next; `glowSteps` are
// scaled into the remaining window after `grayEndT` the same way HOVER_REVEAL/PIN_REVEAL's own
// `steps` are scaled across their own full duration. scene.js's own applyLoadReveal is what actually
// walks these three phases and performs the material swaps — see its own comment for the mechanics.
export const LOAD_REVEAL = {
  durationMs: 1000,
  blueprintEndT: 0.22,
  grayEndT: 0.4,
  glowSteps: [
    { t: 0, opacity: 0.3, emissive: 2.6 }, // bright overshoot flash
    { t: 0.14, opacity: 0, emissive: 0 }, // cut to nothing
    { t: 0.28, opacity: 0.85, emissive: 1.8 }, // flickers back, too bright
    { t: 0.38, opacity: 0.12, emissive: 0.2 }, // dips again
    { t: 0.55, opacity: 0.9, emissive: 1.3 },
    { t: 0.68, opacity: 0.4, emissive: 0.5 },
    { t: 0.85, opacity: 1, emissive: 1.15 }, // brief overshoot before settling
    { t: 1, opacity: 1, emissive: 1 }, // settles on the real material values
  ],
}

// Played once when dictionary mode is closed (main.js's `#back-to-home-btn` handler) while a
// character is STILL loaded in the viewer — explicit request: leaving with a kanji still up shouldn't
// just cut it the instant `#viewer-container` gets torn down, it should visibly dissolve away, the
// same "transitions out cleanly" treatment `closeAndFade` already gives the box itself (mossBox.js).
// Two phases, not three — deliberately simpler than LOAD_REVEAL's own blueprint/gray/glow, since this
// only ever needs to read as "winding down," not walk every named material state on the way out:
//
// 1. `glow-out` (only if something was actually pinned when this started) — `pinnedGlass` flickers
//    DOWN via `glowSteps` below, the same jump-cut "generating in" philosophy every reveal in this
//    app already uses (HOVER_REVEAL/PIN_REVEAL/LOAD_REVEAL), just walked toward 0 instead of toward
//    1. Skipped entirely for a plain, never-pinned load (nothing glowing to flicker down from) —
//    scene.js's `applyExitReveal` decides this once, from `pinnedGroup` at the moment the exit
//    starts, not read live every frame (see that function's own comment for why).
// 2. `fade` — every group (whatever it was showing a moment ago — pinned-white, its grey sibling, or
//    plain solid `normalMaterial` if nothing was ever pinned) gets set to the same neutral `glassGlass`
//    the instant this phase starts, then its opacity ramps smoothly to 0 across the rest of the
//    duration. Deliberately a plain linear fade here, NOT another jump-cut flicker — the flicker
//    personality is what phase 1 already spent; the actual disappearance reads as a clean dissolve,
//    not one long flicker with no real ending.
//
// `durationMs` is a deliberate match to `closeAndFade`'s own rough total length (mossBox.js —
// collapse+flash+fade, ≈1.1-1.2s) since the two run concurrently and are meant to finish around the
// same moment — same reasoning LOAD_REVEAL's own duration was matched to the flashcard box's timing,
// not a re-tuned number picked in isolation.
export const EXIT_REVEAL = {
  durationMs: 1000,
  // Fraction of the total duration phase 1 gets, when it runs at all — the remaining (1 - glowEndT)
  // always belongs to phase 2. If nothing was pinned, scene.js treats this as 0 (skips straight to
  // phase 2 for the FULL duration) rather than wasting part of the window on a phase with nothing to
  // show.
  glowEndT: 0.3,
  // Rescaled into [0, glowEndT] the same way LOAD_REVEAL's own glowSteps are rescaled into
  // [grayEndT, 1] — this is its own timeline, already "reversed" simply by running first instead of
  // last and landing near 0 instead of settling at 1.
  glowSteps: [
    { t: 0, opacity: 1, emissive: 1 }, // starts at the real, already-settled pinned values
    { t: 0.15, opacity: 0.4, emissive: 0.5 }, // first dip
    { t: 0.32, opacity: 0.9, emissive: 1.3 }, // flickers back up, too bright
    { t: 0.45, opacity: 0.12, emissive: 0.2 }, // dips hard again
    { t: 0.62, opacity: 0.85, emissive: 1.6 }, // one more flicker
    { t: 0.75, opacity: 0, emissive: 0 }, // cut to nothing
    { t: 0.88, opacity: 0.3, emissive: 2.2 }, // one last bright overshoot before it's gone for good
    { t: 1, opacity: 0, emissive: 0 },
  ],
}

// Once PIN_REVEAL finishes, the pinned glow doesn't just sit static — a very small, irregular
// ongoing flicker keeps playing for as long as it stays pinned (scene.js's tick, gated on
// `pinnedGroup` being set), like a fluorescent tube's hum rather than a perfectly steady light.
// Deliberately NOT a smooth sine-wave "breathing" pulse (that reads as a calm, deliberate modern
// UI idle animation) — a random value is picked and HELD for a random short interval, then
// re-rolled, the same jump-cut-not-eased philosophy as the reveals above, just at a much smaller
// amplitude and continuing indefinitely instead of resolving to 1x.
export const PIN_FLICKER = {
  opacityJitter: 0.05, // ± fraction of the base opacity
  emissiveJitter: 0.12, // ± fraction of the base emissiveIntensity — glow visibly reacts a bit
  // more than the fill itself does, closer to how a real tube's light output flickers more than
  // its physical glass brightness would suggest.
  minIntervalMs: 70,
  maxIntervalMs: 260,
}

// EXPERIMENTAL — "detach zoom" — pinning a part on a two-part-split character now also grows the
// OTHER (grey) part up from exactly where it already sits, while the pinned (white) part stays put
// at its normal size — see scene.js's pointerup handler and the `detach*` state in tick(). Only
// ever applies to exactly-two-part characters (an atomic/irregular character has nothing to grey
// out); the grey part scales around its OWN local bounding-box center (scene.js's
// `getOrComputeDetachPivot`), not the kanji's shared origin, specifically so it reads as "growing
// in place" rather than drifting sideways as it scales — no separate translate step. Same
// fixed-duration tween philosophy as LOAD_SWOOP (a real, definite finish, not an
// asymptotically-approaching ease) — and reuses that SAME file's `linear` curve too, by explicit
// request: an eased version (easeOutCubic, then a "smoother" easeOutQuint) still read as a
// weighted, decelerating glide — "looks super modern and ai" — so this is constant speed, start to
// finish, same as the load-in swoop. Applies to BOTH directions (growing in, and easing back down
// on unpin/swap), since scene.js's tick() drives them through the exact same code path.
export const DETACH_ZOOM = {
  targetScale: 6, // same magnitude as PINCH.max — already the tuned "fills most of the frame" size
  durationMs: 2000, // was 1500 — same "read as an actual massive structure, not just not-instant"
  // request as LOAD_SWOOP's own bump, same proportional nudge.
}

// Stroke geometry *dimensions* — how thick/deep a rendered stroke looks. Not the stroke-sampling
// algorithm (kanjiRenderer.js), just its appearance.
export const STROKE = {
  halfWidth: 2.2,
  extrudeDepth: 5,
}

// Post-processing bloom (scene.js's `mountScene`) — the 3D equivalent of the 2D boxes'
// content-glow/tab-glow text-shadow stacks, so the kanji reads as part of the same
// "y2k-ified"/lo-fi-glow system instead of a plain crisp render sitting next to glowing UI. Works
// off luminance, not a hand-picked color: the near-white `COLORS.ink` blooms white by default (the
// same family as the boxes' white tab-chrome glow), and `pinned` blooms white-hot because
// `MATERIALS.pinned` is colored+emissive well above `threshold` — no separate color to tune here,
// it's whatever's already bright enough to cross it. `hoverUseful`'s own jade fill is deliberately
// tuned LOW (see its own comment) so it does NOT reliably cross `threshold` — see EDGE_GLOW below
// for where an actual glowing halo effect lives instead.
export const BLOOM = {
  strength: 0.025, // turned down a little from 0.04 — explicit request: dense, many-stroke
  // characters (e.g. 魘's 24 strokes) were reading as visually "filled in" where several strokes
  // pack close together, since bloom's own blur was bridging the small real gaps between them. A
  // near-zero test (0.005/0.05 radius) proved that mechanism right but overcorrected — the
  // character lost its solid "brush stroke" fill everywhere, not just the dense spots — so this is
  // a moderate trim, not a removal.
  // Bumped from 0.2 (a separate, older change) — a specular glint off the glass materials (see
  // GLASS.roughness's own comment) was crossing threshold as a small, sharp, isolated bright point
  // ("sparkle" at certain viewing angles); a wider radius spreads whatever still crosses threshold
  // into a softer, blurrier patch instead of a hard dot, on top of the material-level fix that
  // reduces how often it happens.
  radius: 0.2, // turned down a little from 0.32, same reasoning as strength above
  threshold: 0.95, // only pixels brighter than this bloom at all — keeps the dark background/UI clean
}

// EXPERIMENTAL — "edge glow" — a glowing wireframe outline traced along a mesh's real geometric
// edges/corners (scene.js's EdgesGeometry-based overlay, NOT a full triangle wireframe — just the
// silhouette/crease lines, the same thing a CAD/blueprint line drawing shows), shown only on
// whatever's currently sitting in the "greyed out" glass state (`glass` above / `glassGlass` in
// scene.js — the de-emphasized sibling while something's pinned, and the load-in swoop's own grey
// skin). The explicit ask: "the outline of each edge/corner... like the blueprints of the
// structure... a matrix running along the edges." `color` is the SAME jade `highlightUseful`
// already uses — one house green, not a separate invented one. `brightness` multiplies it PAST 1.0
// per channel (scene.js applies this via `THREE.Color.multiplyScalar`, not here — this file stays
// THREE.js-free) — a plain `LineBasicMaterial` has no `emissiveIntensity` to lean on the way the
// mesh fill materials do, so pushing the color itself past 1 is what actually gets a thin unlit
// line to reliably cross `BLOOM.threshold` and pick up a real glow, on its own, independent of how
// dim the fill material around it stays.
export const EDGE_GLOW = {
  color: 0xceffda,
  brightness: 2.4,
  opacity: 0.85,
}

// The softness half of the "lo-fi" look — applied as a plain CSS filter on the canvas element
// itself (style.css's #viewer-canvas). NOT the same magnitude as --content-glow-blur (0.25px) —
// that value works for 2D text because it's paired with -webkit-text-stroke and a multi-layer
// text-shadow doing most of the visible work; blur alone at that size, on a canvas with nothing
// else compounding it, was genuinely imperceptible (confirmed by A/B toggling it live: 0.3px vs.
// none looked identical). 0.8px is the smallest value that actually reads as "softer" against a
// direct comparison, without eating into stroke legibility. A canvas isn't a native form control,
// so this doesn't carry the filter-on-appearance:auto compositing risk that ruled out CSS filter
// for the search box's own <input> — safe to use directly.
export const CANVAS_BLUR_PX = 0.8
