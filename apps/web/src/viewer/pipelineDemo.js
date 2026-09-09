// The pipeline-visualization dev tool — main.js's mountPipelineDemo, reached only via welcome's own
// hidden #dev-skip-to-pipeline button (see welcomeHtml's own comment; matches the same "hidden dev
// backdoor" convention the dictionary/flashcards shortcuts already use). NOT part of the real app's
// mount tree at all — no hover/pin/raycasting, no relation to scene.js's own interactive viewer,
// deliberately isolated per explicit request ("not actually connected to the app").
//
// The whole point: kanjiRenderer.js's real sample→offset→stitch→extrude pipeline runs once, straight
// through, in well under a millisecond — there's nothing to "watch" in the real app. This file
// re-plays the EXACT same math (samplePathPoints/computeOffsetEdges/buildOutlineShape/extrudeOutline,
// imported straight from kanjiRenderer.js, never re-derived), staged out over real time so each step
// is actually visible: draw the raw centerline, etch the offset outline outward from it, grow real Z
// depth into it. Two playback modes, both driving the exact same per-stroke stage functions (never a
// second, re-derived pipeline) — playCharacter's own `mode` argument, main.js's own mode-toggle row:
// 'sequential' (default) plays one stroke fully, in genuine KanjiVG writing order (pipelineDemoData.js),
// before the next one starts; 'simultaneous' moves every stroke through the SAME stage together
// (playAllAtOnce, below). The whole character spins continuously from the very first frame (not just
// once finished) — explicit correction from an earlier version that instead orbited the camera to a
// scripted edge-on stop for the extrude step, held, then orbited back: that read as hitting
// pre-determined rotation points rather than a genuinely continuous spin. Depth growing in is still
// clearly visible as the spin naturally carries each stroke edge-on-ish and back, just never a
// scripted stop-and-reverse. A third toggle, `entrance` ('normal' default, or 'swoop'), controls how
// the character ENTERS at all: 'swoop' plays the exact real "spaceship load-in" the dictionary
// viewer uses on every fresh character (scene.js's own LOAD_SWOOP, same numbers) — oversized and
// edge-on, easing to normal — running CONCURRENTLY with whichever build mode is also selected, so
// the character generates itself while it's still swooping into frame, same as a real ship still
// under construction as it arrives.

import * as THREE from 'three'
import { samplePathPoints, computeOffsetEdges, buildOutlineShape, extrudeOutline } from './kanjiRenderer.js'
import { PIPELINE_DEMO_CHARACTERS } from './pipelineDemoData.js'
import { COLORS, LIGHTS, CAMERA, PINCH, LOAD_SWOOP, STROKE_GENERATION, MOTION, EDGE_GLOW } from './theme.js'

// Pacing — each stroke plays all three stages before the next one starts (explicit request: "real
// order," not "all at once"). Constant-speed (linear) progress throughout, same reasoning as every
// other timed tween in this app (theme.js's LOAD_SWOOP/DETACH_ZOOM comments) — an eased eased curve
// reads as a modern UI transition; flat constant speed is what reads as a deliberate, heavy process.
// Pulled from theme.js's own STROKE_GENERATION, not a separate local copy — this tool's own numbers
// are what the real production load-in (scene.js's playStrokeGeneration) now reuses verbatim, so
// one shared source keeps the two from quietly drifting apart.
const STAGE1_DRAW_MS = STROKE_GENERATION.drawMs // raw centerline traces in
const STAGE2_ETCH_MS = STROKE_GENERATION.etchMs // offset points spread outward, outline fills in
const STAGE3_EXTRUDE_MS = STROKE_GENERATION.extrudeMs // real Z depth grows in
const STROKE_GAP_MS = 220 // breathing room before the next stroke starts (sequential mode only —
// no equivalent in production, which always plays every stroke together)

// Continuous spin — theme.js's own MOTION.autoSpinSpeed, the exact rate the real production viewer
// idles at, not a separate local number — this was a hardcoded 0.004 for a while (the comment here
// already claimed parity with the real idle spin, but the literal value had quietly drifted 20%
// slower than MOTION.autoSpinSpeed's actual 0.005), which read as visibly slower than the real
// viewer once the sleep-mode screensaver put the two side by side in the same session. Runs from
// the very first frame here instead of only once idle, see this file's own header comment for why.
const SPIN_SPEED = MOTION.autoSpinSpeed

// The "actively being demonstrated" color — the SAME jade this whole app already uses for anything
// mid-interaction (theme.js's COLORS.highlightUseful) — not a new color invented for this tool, so
// it reads as "this house's own language" rather than a foreign debug color.
const ACTIVE_COLOR = COLORS.highlightUseful
const DONE_COLOR = COLORS.ink

function animateValue(durationMs, onFrame) {
  return new Promise((resolve) => {
    const start = performance.now()
    function step() {
      const elapsed = performance.now() - start
      const progress = Math.min(1, elapsed / durationMs)
      onFrame(progress)
      if (progress < 1) requestAnimationFrame(step)
      else resolve()
    }
    step()
  })
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Disposes a stroke mesh's own geometry AND any child geometry it's carrying — specifically the
// blueprint edge-glow overlay (playStage3's own comment, further down, on why a finished blueprint
// mesh gets a `LineSegments` child at all). A plain `mesh.geometry.dispose()`, every cleanup site in
// this file used to do, only ever caught the PARENT's own geometry — silently leaking every
// EdgesGeometry a blueprint mesh built for itself the moment that mesh got torn down. Materials are
// deliberately left untouched here, matching every other cleanup site in this file: most are shared
// singletons (doneMaterial/activeLineMaterial/blueprintEdgeMaterial) that must never be disposed,
// and the few real per-instance clones (activeFillMaterial's own, blueprintFillMaterial's own) are
// cheap enough that this file has never bothered disposing them individually either.
function disposeStrokeObject(obj) {
  obj.geometry?.dispose?.()
  for (const child of obj.children) disposeStrokeObject(child)
}

// `spinSpeedMultiplier` (default 1, so the dev tool's own picker still matches the real viewer's own
// idle spin exactly, per SPIN_SPEED's own comment above) — sleep mode's screensaver passes 2, per
// explicit request, to spin visibly faster than the real production rate; a screensaver's own pacing
// doesn't need to stay in lockstep with the real interactive viewer's idle-spin feel the way the dev
// tool's own comparison purpose does.
export function mountPipelineDemo(container, { spinSpeedMultiplier = 1 } = {}) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    (container.clientWidth || 1) / (container.clientHeight || 1),
    CAMERA.near,
    CAMERA.far,
  )
  // Camera stays put, same resting position/framing the real viewer uses — the spin is the
  // character rotating (strokeGroup.rotation.y, in renderTick below), not the camera orbiting.
  camera.position.set(...CAMERA.position)
  camera.lookAt(...CAMERA.lookAt)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.domElement.id = 'pipeline-demo-canvas'
  container.appendChild(renderer.domElement)

  scene.add(new THREE.AmbientLight(0xffffff, LIGHTS.ambient.intensity))
  const keyLight = new THREE.DirectionalLight(0xffffff, LIGHTS.key.intensity)
  keyLight.position.set(...LIGHTS.key.position)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xffffff, LIGHTS.fill.intensity)
  fillLight.position.set(...LIGHTS.fill.position)
  scene.add(fillLight)
  const rimLight = new THREE.DirectionalLight(0xffffff, LIGHTS.rim.intensity)
  rimLight.position.set(...LIGHTS.rim.position)
  scene.add(rimLight)

  const strokeGroup = new THREE.Group()
  scene.add(strokeGroup)

  const doneMaterial = new THREE.MeshStandardMaterial({ color: DONE_COLOR, roughness: 0.32 })
  const activeLineMaterial = new THREE.LineBasicMaterial({ color: ACTIVE_COLOR })
  const activeFillMaterial = new THREE.MeshStandardMaterial({
    color: ACTIVE_COLOR,
    roughness: 0.32,
    transparent: true,
    opacity: 0,
  })
  // The real "blueprint" skin — the SAME look scene.js's own detach-zoomed sibling wears when a
  // component is deselected in the actual interactive 3D viewer (apps/web/CLAUDE.md's "detach zoom"
  // section): a dim, neutral-grey hollow fill (scene.js's own `MATERIALS.glass`) plus a bright
  // wireframe outline traced along the mesh's own real edges (`EDGE_GLOW`/`getOrCreateEdgeGlow`,
  // scene.js) — not a solid color swap. Ported here as plain values/constants (this file has no
  // hover/pin state machine or lit-glass/envMap material system of scene.js's own to hook into —
  // "not actually connected to the app," this file's own header comment), not shared code: a real,
  // confirmed reason a lit `MeshStandardMaterial` (activeFillMaterial/doneMaterial, both above) can't
  // just stay jade-tinted for this — this scene's own light rig (`LIGHTS`, imported from theme.js:
  // key alone is intensity 3.5) blows any lit fill color out to visually pure white regardless of its
  // base hue once combined intensities push channel values past 1.0 and clip — confirmed live, this
  // is genuinely why an earlier attempt at a "keep it jade" fix (skipping the `doneMaterial` swap
  // below) showed no visible difference at all. `MeshBasicMaterial` (unlit) sidesteps that
  // entirely — its rendered color is always exactly its own base color, immune to the light rig.
  // Always CLONED wherever it's applied (never assigned directly), same "own opacity needs to be
  // independently animatable, mustn't cross-contaminate a shared instance" reasoning
  // `activeFillMaterial` itself already follows — `unplayStage3` (below) fades this material's own
  // opacity per-instance during the reverse; a shared, un-cloned instance would leave the NEXT
  // stroke's blueprint fill permanently stuck at whatever opacity the last reverse faded it to.
  const blueprintFillMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.ink,
    transparent: true,
    opacity: 0.12, // matches scene.js's own MATERIALS.glass verbatim, not re-derived
  })
  // The wireframe half — genuinely safe to share as ONE instance (never cloned): nothing here ever
  // animates its opacity/color per-instance, same reasoning `activeLineMaterial` above is already
  // shared, unlike `activeFillMaterial`. `EdgesGeometry` (built fresh per mesh, in playStage3 below)
  // extracts just the real silhouette/crease edges — not every triangle edge, which would look like a
  // mesh grid rather than a clean outline — same technique scene.js's own `getOrCreateEdgeGlow` uses.
  // Color pushed PAST 1.0 (`EDGE_GLOW.brightness`) matches scene.js's own recipe verbatim, though
  // this file has no bloom/post-processing pass to actually make that overbright value glow the way
  // it does in the real viewer — kept anyway since a plain LineBasicMaterial clips overbright values
  // to a crisp, fully-saturated line regardless, which still reads clearly as "bright schematic edge"
  // against the dim fill, just without a soft halo around it.
  const blueprintEdgeMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(EDGE_GLOW.color).multiplyScalar(EDGE_GLOW.brightness),
    transparent: true,
    opacity: EDGE_GLOW.opacity,
    depthWrite: false,
    depthTest: false, // always draws over the coincident fill beneath it — same reasoning
    // getOrCreateEdgeGlow (scene.js) gives this same recipe, avoids z-fighting against shared verts
  })

  let disposed = false
  // Bumped every playCharacter() call — every async stage below checks this against the value it
  // captured when IT started, and bails out (without touching strokeGroup) the instant it goes
  // stale. A real Promise chain can't be cancelled outright, so this is what actually stops a
  // still-running sequence from mutating state out from under a newly-picked character rather than
  // two sequences quietly running at once.
  let generation = 0
  // True for as long as playSwoopEntrance (below) is driving strokeGroup's own scale/rotation
  // directly — the continuous spin has to stand down for that whole window, same reasoning
  // scene.js's own real load-in swoop already established (its own header comment on `swoopingIn`):
  // fighting over the same rotation.y every frame reads as a stutter, not two motions blending.
  let swooping = false
  // Every stroke that has actually finished all three stages for the CURRENT generation, in the
  // order it finished — playCharacterReverse (below) walks this backward to de-render the
  // character stroke-by-stroke, last-drawn first. Tracking the real built `{ mesh, strokeData }`
  // pairs as they land (rather than re-deriving "which stroke is which mesh" from strokeGroup's own
  // children afterward) is what keeps the reverse robust even if a stroke's own path data ever fails
  // to parse and gets silently skipped (samplePathPoints returning null) — playCharacter clears this
  // the same way it clears strokeGroup itself.
  let builtStrokes = []

  function renderTick() {
    if (disposed) return
    requestAnimationFrame(renderTick)
    if (!swooping) strokeGroup.rotation.y += SPIN_SPEED * spinSpeedMultiplier
    renderer.render(scene, camera)
  }
  renderTick()

  // The REAL "spaceship load-in" swoop dictionary mode plays on every fresh character — same
  // numbers, not re-tuned for this tool: LOAD_SWOOP.durationMs (4600ms), PINCH.max (6x) as the
  // oversized starting scale, LOAD_SWOOP.startAngle (-90°, "facing to the side") as the starting
  // rotation, both easing to normal (1x scale, 0°) via `linear` progress — same "constant speed
  // reads as a massive structure, easing reads as modern/ai" reasoning as everything else in this
  // file. Runs CONCURRENTLY with the stroke-build sequence (playCharacter fires this and the real
  // sequence side by side, never awaited in order) — the character is generating itself WHILE it
  // swoops into frame, same as a real spaceship still being built as it flies in. Checks its own
  // `myGeneration` inside the per-frame callback itself, not just after — unlike the stage
  // functions above (which only ever mutate strokeGroup.children, safe to check once after their
  // own last await), this drives strokeGroup's own scale/rotation every single frame for 4.6
  // seconds straight, and a stale swoop left unchecked mid-frame would fight a fresh one for the
  // exact same properties for as long as they both keep running.
  async function playSwoopEntrance(myGeneration) {
    swooping = true
    strokeGroup.scale.setScalar(PINCH.max)
    strokeGroup.rotation.y = LOAD_SWOOP.startAngle
    await animateValue(LOAD_SWOOP.durationMs, (progress) => {
      if (myGeneration !== generation) return
      strokeGroup.scale.setScalar(PINCH.max + (1 - PINCH.max) * progress)
      strokeGroup.rotation.y = LOAD_SWOOP.startAngle + (0 - LOAD_SWOOP.startAngle) * progress
    })
    // Auto-spin picks back up from wherever this landed (0°, same as the real swoop's own handoff)
    // the frame after — only for the generation that actually owns this swoop; a stale one has no
    // business clearing the FRESH swoop's own `swooping` lock.
    if (myGeneration === generation) swooping = false
  }

  // Real bug, found and fixed live: checking `generation` only BETWEEN these three stage calls
  // (in playStroke, below) isn't enough — a stage that's already mid-animation the instant
  // playCharacter() bumps generation and clears strokeGroup still runs its OWN final mutations
  // (adding/finishing a mesh) unconditionally, since nothing inside the stage itself was checking.
  // A newly-picked character's fresh, empty strokeGroup could end up with a stray leftover mesh
  // from whatever the PREVIOUS character's stage was mid-flight through. Every stage below now
  // takes `myGeneration` and checks it immediately after its own last `await`, before touching
  // strokeGroup any further — stale means clean up whatever this stage itself just built and
  // return `null`; playStroke (below) treats a null return as "stop here," not "stale but let the
  // next stage run anyway."

  // Stage 1 — the raw SVG vector, traced in. A THREE.Line built straight from samplePathPoints'
  // own real output, revealed progressively via setDrawRange — literally "draw the centerline" in
  // real time, not an instant appearance.
  async function playStage1(points, myGeneration) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(geometry, activeLineMaterial)
    strokeGroup.add(line)
    await animateValue(STAGE1_DRAW_MS, (progress) => {
      geometry.setDrawRange(0, Math.max(2, Math.floor(points.length * progress)))
    })
    if (myGeneration !== generation) {
      strokeGroup.remove(line)
      geometry.dispose()
      return null
    }
    return line
  }

  // Stage 2 — offset + stitch, made visible: two lines (the real leftEdge/rightEdge from
  // computeOffsetEdges) etch outward from the centerline's own points by lerping their vertex
  // positions from the centerline to the real offset positions, then a flat fill (buildOutlineShape,
  // NOT yet extruded — a plain ShapeGeometry, still zero depth) fades in once both edges land.
  async function playStage2(points, leftEdge, rightEdge, outline, centerLine, myGeneration) {
    if (!centerLine) return null // Stage 1 already went stale — nothing to build on top of.
    const leftGeo = new THREE.BufferGeometry().setFromPoints(points)
    const rightGeo = new THREE.BufferGeometry().setFromPoints(points)
    const leftLine = new THREE.Line(leftGeo, activeLineMaterial)
    const rightLine = new THREE.Line(rightGeo, activeLineMaterial)
    strokeGroup.add(leftLine, rightLine)

    const leftPos = leftGeo.attributes.position
    const rightPos = rightGeo.attributes.position
    await animateValue(STAGE2_ETCH_MS, (progress) => {
      for (let i = 0; i < points.length; i++) {
        const from = points[i]
        const toL = leftEdge[i]
        const toR = rightEdge[i]
        leftPos.setXYZ(
          i,
          from.x + (toL.x - from.x) * progress,
          from.y + (toL.y - from.y) * progress,
          0,
        )
        rightPos.setXYZ(
          i,
          from.x + (toR.x - from.x) * progress,
          from.y + (toR.y - from.y) * progress,
          0,
        )
      }
      leftPos.needsUpdate = true
      rightPos.needsUpdate = true
    })
    if (myGeneration !== generation) {
      strokeGroup.remove(leftLine, rightLine)
      leftGeo.dispose()
      rightGeo.dispose()
      return null
    }

    const flatGeometry = new THREE.ShapeGeometry(outline)
    const flatMesh = new THREE.Mesh(flatGeometry, activeFillMaterial.clone())
    strokeGroup.add(flatMesh)
    await animateValue(STROKE_GENERATION.fadeMs, (progress) => {
      flatMesh.material.opacity = progress
    })

    strokeGroup.remove(centerLine, leftLine, rightLine)
    centerLine.geometry.dispose()
    leftGeo.dispose()
    rightGeo.dispose()
    if (myGeneration !== generation) {
      strokeGroup.remove(flatMesh)
      flatGeometry.dispose()
      return null
    }
    return flatMesh
  }

  // Stage 3 — "watch the Z axis come into play." Swaps the flat mesh for the REAL extruded geometry
  // with scale.z starting near zero, grown to 1 — the character's own continuous spin (renderTick)
  // is what carries it edge-on-ish and back on its own, not a scripted camera move stopping to show
  // it off; the depth growing in reads against whatever angle the ongoing spin happens to be at.
  // `blueprint` — explicit request, sleep mode's own screensaver loop (main.js): every finished
  // stroke gets the real "blueprint" skin (`blueprintFillMaterial`/`blueprintEdgeMaterial`'s own
  // comment above has the full mechanics/history) instead of the ordinary hand-off to `doneMaterial`
  // (the dev tool's own normal finished-stroke look). Every other caller (the dev tool's own toggle
  // rows) omits this and keeps the ordinary jade→done hand-off unchanged.
  async function playStage3(flatMesh, outline, myGeneration, blueprint = false) {
    if (!flatMesh) return null // Stage 2 already went stale — nothing to build on top of.
    const geometry = extrudeOutline(outline)
    const mesh = new THREE.Mesh(geometry, activeFillMaterial.clone())
    mesh.material.opacity = 1
    mesh.scale.z = 0.001
    strokeGroup.remove(flatMesh)
    flatMesh.geometry.dispose()
    strokeGroup.add(mesh)

    await animateValue(STAGE3_EXTRUDE_MS, (progress) => {
      mesh.scale.z = 0.001 + (1 - 0.001) * progress
    })
    if (myGeneration !== generation) {
      strokeGroup.remove(mesh)
      geometry.dispose()
      return null
    }

    if (blueprint) {
      mesh.material = blueprintFillMaterial.clone()
      const edgeLine = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), blueprintEdgeMaterial)
      edgeLine.raycast = () => {} // this file has no raycasting at all, but matches scene.js's own
      // getOrCreateEdgeGlow defensively regardless — an overlay line should never be a hit target.
      mesh.add(edgeLine) // parented to the mesh itself — inherits its transform for free, and
      // disposeStrokeObject (below) walks a mesh's own children when tearing it down, so this never
      // needs its own separate cleanup call site.
    } else {
      mesh.material = doneMaterial
    }
    return mesh
  }

  async function playStroke(strokeData, myGeneration, blueprint = false) {
    const points = samplePathPoints(strokeData.d)
    if (!points) return

    const { leftEdge, rightEdge } = computeOffsetEdges(points)
    const outline = buildOutlineShape(leftEdge, rightEdge)

    const centerLine = await playStage1(points, myGeneration)
    if (!centerLine) return
    const flatMesh = await playStage2(points, leftEdge, rightEdge, outline, centerLine, myGeneration)
    if (!flatMesh) return
    const mesh = await playStage3(flatMesh, outline, myGeneration, blueprint)
    if (!mesh) return
    builtStrokes.push({ mesh, strokeData })
    await wait(STROKE_GAP_MS)
  }

  async function playSequence(strokes, myGeneration, blueprint = false) {
    for (const strokeData of strokes) {
      if (disposed || myGeneration !== generation) return
      await playStroke(strokeData, myGeneration, blueprint)
    }
    // Nothing left to do once the last stroke lands — the spin's been running continuously since
    // the first frame (renderTick), so there's no separate "now go idle" handoff any more.
  }

  // The 'simultaneous' mode — every stroke goes through the SAME stage together (all sampling/
  // drawing-in together, then all etching together, then all extruding together), not each stroke
  // running its own independent three-stage clock in parallel — reads as "the whole character
  // forming at once," matching what this option was originally described as when it lost out to
  // real-writing-order sequencing. Reuses the exact same playStage1/2/3 functions playSequence does
  // (never a second, re-derived implementation) — just fired via Promise.all across every stroke
  // instead of one at a time, so a single shared STAGE*_MS duration genuinely finishes together for
  // all of them (each stroke's own animateValue still runs its own real timer, they just all start
  // and finish at effectively the same moment). No STROKE_GAP_MS here — there's no "next stroke" to
  // leave a gap before, every stroke IS the current one.
  async function playAllAtOnce(strokes, myGeneration, blueprint = false) {
    const prepared = []
    for (const strokeData of strokes) {
      const points = samplePathPoints(strokeData.d)
      if (!points) continue
      const { leftEdge, rightEdge } = computeOffsetEdges(points)
      const outline = buildOutlineShape(leftEdge, rightEdge)
      // strokeData travels alongside its own derived geometry here (not just re-indexed against
      // `strokes` afterward) specifically because a skipped unparseable stroke would otherwise
      // desync the two arrays' lengths — builtStrokes (below) needs the exact right strokeData
      // paired with the exact mesh that came from it.
      prepared.push({ strokeData, points, leftEdge, rightEdge, outline })
    }

    const centerLines = await Promise.all(prepared.map((p) => playStage1(p.points, myGeneration)))
    if (disposed || myGeneration !== generation) return
    const flatMeshes = await Promise.all(
      prepared.map((p, i) =>
        playStage2(p.points, p.leftEdge, p.rightEdge, p.outline, centerLines[i], myGeneration),
      ),
    )
    if (disposed || myGeneration !== generation) return
    const meshes = await Promise.all(
      prepared.map((p, i) => playStage3(flatMeshes[i], p.outline, myGeneration, blueprint)),
    )
    if (disposed || myGeneration !== generation) return
    meshes.forEach((mesh, i) => {
      if (mesh) builtStrokes.push({ mesh, strokeData: prepared[i].strokeData })
    })
  }

  // Clears whatever the previous character (if any) left behind and starts a fresh sequence for
  // this one — the picker's own call site (main.js's mountPipelineDemoScreen). Safe to call again
  // mid-sequence: bumping `generation` first is what makes the OLD sequence's own next `await`
  // (and, for `entrance: 'swoop'`, the old swoop's own next per-frame check) resolve into a no-op
  // instead of racing this one. `mode` — 'sequential' (default, real writing order, one stroke
  // fully finishes before the next starts) or 'simultaneous' (every stroke moves through the same
  // stage together) — and `entrance` — 'normal' (default, starts at rest) or 'swoop' (starts
  // oversized/edge-on and eases to normal, playSwoopEntrance above) — are both toggle rows' own
  // call sites, main.js's mode-picker/entrance-picker. `blueprint` (default false) — explicit
  // request, sleep mode's own screensaver loop only: keep every stroke in the translucent jade
  // "actively generating" skin permanently instead of the ordinary hand-off to the solid,
  // opaque-white `doneMaterial` once it finishes (playStage3's own comment has the full mechanics) —
  // no UI toggle for this, main.js's sleep loop is the one caller that passes `true`.
  //
  // `idOrStrokes` — either a real `PIPELINE_DEMO_CHARACTERS` id (string, the dev tool's own picker,
  // looked up as before) OR a raw stroke array (`[{d}, ...]`) handed straight in, no lookup — sleep
  // mode's screensaver loop is the one caller that passes strokes directly, fetched live off the
  // SAME real per-character bundle Dictionary mode already uses (main.js's own comment at that call
  // site has the full reasoning: doesn't need this file's usual hand-verified real writing order,
  // "good enough for a screensaver").
  function playCharacter(idOrStrokes, mode = 'sequential', entrance = 'normal', blueprint = false) {
    const characterData = Array.isArray(idOrStrokes)
      ? { strokes: idOrStrokes }
      : PIPELINE_DEMO_CHARACTERS.find((c) => c.id === idOrStrokes)
    if (!characterData) return
    generation++
    const myGeneration = generation
    while (strokeGroup.children.length > 0) {
      const child = strokeGroup.children[0]
      strokeGroup.remove(child)
      disposeStrokeObject(child)
    }
    builtStrokes = [] // this generation's own finished-stroke record starts empty too
    if (entrance === 'swoop') {
      playSwoopEntrance(myGeneration) // not awaited — plays concurrently with the build below
    } else {
      swooping = false
      strokeGroup.scale.setScalar(1)
      strokeGroup.rotation.set(0, 0, 0)
    }
    // Returned (not just fired) so a caller that wants to know when a full build actually finishes
    // can await it — main.js's sleep-mode screensaver loop is the first one that needs this; every
    // existing caller (the dev tool's own toggle rows) still just calls this without awaiting
    // anything, so returning a promise here changes nothing for them.
    if (mode === 'simultaneous') return playAllAtOnce(characterData.strokes, myGeneration, blueprint)
    else return playSequence(characterData.strokes, myGeneration, blueprint)
  }

  // ── Reverse (de-render) — main.js's sleep-mode screensaver loop, once a build finishes: undo
  // the SAME three stages the forward build just played, stroke by stroke, in REVERSE stroke order
  // (last-drawn stroke undoes first) — a genuine rewind, not just a fade-out. Explicit request.
  // Each `unplayStageN` mirrors its forward `playStageN` counterpart with the interpolation
  // direction flipped, reusing the exact same real geometry (`samplePathPoints`/
  // `computeOffsetEdges`/`buildOutlineShape`, recomputed fresh from the stroke's own `d` — cheap,
  // and keeps this from having to carry the forward pass's intermediate arrays all the way through
  // to a later, independent reverse call) rather than a separately-invented "undo" animation.

  // Undoes stage 3: shrinks the real extruded mesh's real depth back to ~0 (mirrors playStage3's
  // own grow), removes it, then hands back a flat (zero-depth) equivalent so stage 2 has something
  // to continue reversing from — the same handoff shape playStage2→playStage3 uses forward, just
  // walked backward.
  async function unplayStage3(outline, mesh, myGeneration, blueprint = false) {
    await animateValue(STAGE3_EXTRUDE_MS, (progress) => {
      mesh.scale.z = 1 - progress * (1 - 0.001)
    })
    strokeGroup.remove(mesh)
    disposeStrokeObject(mesh) // catches a blueprint mesh's own edge-glow child too, not just itself
    if (myGeneration !== generation) return null
    const flatGeometry = new THREE.ShapeGeometry(outline)
    const flatMesh = new THREE.Mesh(flatGeometry, blueprint ? blueprintFillMaterial.clone() : activeFillMaterial.clone())
    flatMesh.material.opacity = 1
    strokeGroup.add(flatMesh)
    return flatMesh
  }

  // Undoes stage 2: fades the flat fill back out, then un-etches the two offset edges back onto
  // the centerline (the exact reverse lerp of playStage2's own outward etch). Returns whether it's
  // safe for unplayStroke to continue into stage 1's own reverse.
  async function unplayStage2(points, leftEdge, rightEdge, flatMesh, myGeneration) {
    if (!flatMesh) return false
    await animateValue(STROKE_GENERATION.fadeMs, (progress) => {
      flatMesh.material.opacity = 1 - progress
    })
    strokeGroup.remove(flatMesh)
    flatMesh.geometry.dispose()
    if (myGeneration !== generation) return false

    const leftGeo = new THREE.BufferGeometry().setFromPoints(leftEdge)
    const rightGeo = new THREE.BufferGeometry().setFromPoints(rightEdge)
    const leftLine = new THREE.Line(leftGeo, activeLineMaterial)
    const rightLine = new THREE.Line(rightGeo, activeLineMaterial)
    strokeGroup.add(leftLine, rightLine)
    const leftPos = leftGeo.attributes.position
    const rightPos = rightGeo.attributes.position
    await animateValue(STAGE2_ETCH_MS, (progress) => {
      for (let i = 0; i < points.length; i++) {
        const from = points[i]
        const toL = leftEdge[i]
        const toR = rightEdge[i]
        // Reverse of playStage2's own lerp: starts at the offset position (progress 0), ends back
        // on the centerline (progress 1).
        leftPos.setXYZ(i, toL.x + (from.x - toL.x) * progress, toL.y + (from.y - toL.y) * progress, 0)
        rightPos.setXYZ(i, toR.x + (from.x - toR.x) * progress, toR.y + (from.y - toR.y) * progress, 0)
      }
      leftPos.needsUpdate = true
      rightPos.needsUpdate = true
    })
    strokeGroup.remove(leftLine, rightLine)
    leftGeo.dispose()
    rightGeo.dispose()
    return myGeneration === generation
  }

  // Undoes stage 1: draws a fresh centerline at full length, then un-draws it via `setDrawRange`
  // shrinking back to nothing — the reverse of playStage1's own progressive reveal.
  async function unplayStage1(points, myGeneration) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(geometry, activeLineMaterial)
    strokeGroup.add(line)
    await animateValue(STAGE1_DRAW_MS, (progress) => {
      geometry.setDrawRange(0, Math.max(2, Math.floor(points.length * (1 - progress))))
    })
    strokeGroup.remove(line)
    geometry.dispose()
  }

  async function unplayStroke(strokeData, mesh, myGeneration, blueprint = false) {
    const points = samplePathPoints(strokeData.d)
    if (!points) {
      // Shouldn't happen — this stroke's `d` already parsed once, to build `mesh` in the first
      // place — but if it somehow doesn't reparse, at least clean up the real mesh rather than
      // leaving it stranded.
      strokeGroup.remove(mesh)
      disposeStrokeObject(mesh)
      return
    }
    const { leftEdge, rightEdge } = computeOffsetEdges(points)
    const outline = buildOutlineShape(leftEdge, rightEdge)

    const flatMesh = await unplayStage3(outline, mesh, myGeneration, blueprint)
    if (myGeneration !== generation) return
    const ok = await unplayStage2(points, leftEdge, rightEdge, flatMesh, myGeneration)
    if (!ok) return
    await unplayStage1(points, myGeneration)
    await wait(STROKE_GAP_MS)
  }

  // The reverse counterpart to playCharacter — walks `builtStrokes` (every stroke that actually
  // finished building, in build order) backward, de-rendering the LAST-drawn stroke first. Operates
  // on the CURRENT `generation` rather than bumping a new one: this is genuinely a continuation of
  // the same character's own lifecycle (build, then un-build), not a fresh character being loaded —
  // switching characters or toggling mode/entrance mid-reverse still correctly invalidates it via
  // the same `generation` check every stage above already makes. `blueprint` — same meaning as
  // `playCharacter`'s own (playStage3's comment has the full mechanics): the intermediate flat mesh
  // `unplayStage3` builds while reversing needs to know too, or a blueprint build's own reverse would
  // flash the ordinary lit jade fill for the brief window it's flattened back down before fading out.
  async function playCharacterReverse(blueprint = false) {
    const myGeneration = generation
    const strokes = builtStrokes
    builtStrokes = []
    for (let i = strokes.length - 1; i >= 0; i--) {
      if (disposed || myGeneration !== generation) return
      await unplayStroke(strokes[i].strokeData, strokes[i].mesh, myGeneration, blueprint)
    }
  }

  function resize() {
    if (disposed) return
    camera.aspect = (container.clientWidth || 1) / (container.clientHeight || 1)
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', resize)

  function dispose() {
    if (disposed) return
    disposed = true
    window.removeEventListener('resize', resize)
    scene.traverse((obj) => {
      obj.geometry?.dispose?.()
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
      else obj.material?.dispose?.()
    })
    renderer.dispose()
    renderer.domElement.remove()
  }

  return { dispose, playCharacter, playCharacterReverse, characters: PIPELINE_DEMO_CHARACTERS }
}
