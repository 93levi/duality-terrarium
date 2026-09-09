// Three.js scene shell + hover raycasting against whatever kanji group is currently mounted.
// Rendering geometry lives in kanjiRenderer.js; this file owns the scene graph, camera, lights,
// interaction state (hover/pin/drag/auto-spin), and turning pointer position into a hover
// callback. All colors/framing/motion values live in theme.js, not here — this file is the
// FUNCTIONALITY (raycasting, state machines), not the look. Change theme.js for a visual tweak;
// change this file only if the actual interaction behavior needs to change. See apps/web/CLAUDE.md.

import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import {
  COLORS,
  MATERIALS,
  GLASS,
  ENV_MAP,
  CAMERA,
  LIGHTS,
  MOTION,
  BLOOM,
  HOVER_REVEAL,
  PIN_REVEAL,
  PIN_FLICKER,
  LOAD_REVEAL,
  EXIT_REVEAL,
  PINCH,
  LOAD_SWOOP,
  DETACH_ZOOM,
  EDGE_GLOW,
  STROKE_GENERATION,
} from './theme.js'
import { samplePathPoints, computeOffsetEdges, buildOutlineShape, extrudeOutline } from './kanjiRenderer.js'

// Constant speed, no acceleration or deceleration at either end — used by both the load-in swoop
// (tick()'s swoopingIn branch) and the detach-zoom (tick()'s detachGroup branch) to drive scale/
// rotation off one shared progress value. Replaces an easeOutCubic/easeOutQuint pair this file used
// to have — both, even the "smoother" quint version, still read as a weighted, decelerating glide
// (fast start, soft landing), which was the explicit complaint ("weights on the zooms... looks
// super modern and ai"). A flat identity function is what actually delivers "one speed the whole
// time" — kept as a named function (not just using `t` directly at each call site) so every place
// driving a timed tween through this reads as a deliberate choice, not an accidental omission.
function linear(t) {
  return t
}

// A self-contained, awaited tween — playStrokeGeneration's own driver (below), unlike every other
// animation in this file, which is instead driven by tick()'s own elapsed-time phase checks. That
// style fits everything else here because those all interact with shared, ongoing state (hover/pin/
// detach-zoom) tick() already owns every frame regardless; this one doesn't — it's a genuinely
// self-contained, one-shot sequence (build the overlay, run it, reveal the real meshes, done), the
// same shape pipeline-visualization's own dev tool (viewer/pipelineDemo.js) already uses its
// identically-named helper for. Reused here rather than re-derived, same reasoning as everywhere
// else in this app that two things doing the same job should share one real implementation.
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

// Gradient equirectangular environment for the glass materials to reflect, ported 1:1 from
// moss x kanji FINAL's `src/main.js` `buildEnvMap` — same canvas gradient, same PMREMGenerator
// path, same `scene.environmentIntensity`. (The source's version also builds an unused `envScene`
// with two lights that are never rendered into the equirect texture — dead code there, so it's not
// reproduced here; it has zero effect on the reflection this env map actually produces.)
function buildEnvironment(renderer, scene) {
  const pmremGen = new THREE.PMREMGenerator(renderer)
  pmremGen.compileEquirectangularShader()

  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size * 2
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const grd = ctx.createLinearGradient(0, 0, 0, size)
  for (const [stop, color] of ENV_MAP.stops) grd.addColorStop(stop, color)
  ctx.fillStyle = grd
  ctx.fillRect(0, 0, size * 2, size)

  const equiTex = new THREE.CanvasTexture(canvas)
  equiTex.mapping = THREE.EquirectangularReflectionMapping

  scene.environment = pmremGen.fromEquirectangular(equiTex).texture
  scene.environmentIntensity = ENV_MAP.environmentIntensity

  equiTex.dispose()
  pmremGen.dispose()
  renderer.setRenderTarget(null)
}

// "Glass box" construction ported 1:1 from moss x kanji FINAL's `glassbox2.js`: a translucent
// state is two MeshPhysicalMaterials sharing the same recipe (GLASS.roughness/metalness/
// envMapIntensity) — a BackSide pass at the state's own opacity and a FrontSide pass at
// GLASS.frontOpacityRatio of it, both `depthWrite: false` so they layer instead of z-fighting.
// Mirrors glassbox2.js's `glassMat` (BackSide, opacity 0.28) / `glassMat2` (FrontSide, opacity
// 0.20, cloned off the first) pair exactly, just parameterized per hover/pin/glass state.
function makeGlassPair(spec) {
  const back = new THREE.MeshPhysicalMaterial({
    color: spec.color,
    roughness: GLASS.roughness,
    metalness: GLASS.metalness,
    transparent: true,
    opacity: spec.opacity,
    side: THREE.BackSide,
    depthWrite: false,
    envMapIntensity: GLASS.envMapIntensity,
    emissive: spec.emissive ?? 0x000000,
    emissiveIntensity: spec.emissiveIntensity ?? 0,
  })
  const front = back.clone()
  front.side = THREE.FrontSide
  front.opacity = spec.opacity * GLASS.frontOpacityRatio
  return { back, front }
}

// `ignoreNoiseHover` defaults true — see raycastAt's own comment below for what this actually does
// and why it's on everywhere now. Only reason it's a parameter at all, not just hardcoded into
// raycastAt directly, is to leave a one-line way back (`{ ignoreNoiseHover: false }` at a call site)
// if the classifier-verification behavior is ever wanted again for real dictionary specifically,
// without re-deriving this from scratch.
export function mountScene(container, { onPin, ignoreNoiseHover = true } = {}) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    (container.clientWidth || 1) / (container.clientHeight || 1), // real size set by resize() below
    CAMERA.near,
    CAMERA.far,
  )
  camera.position.set(...CAMERA.position)
  camera.lookAt(...CAMERA.lookAt)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.domElement.id = 'viewer-canvas'
  renderer.domElement.style.touchAction = 'none' // avoid touch-scroll fighting drag-to-rotate
  container.appendChild(renderer.domElement)

  // TEMPORARY EXPERIMENT, per explicit request — the about overlay's own CRT scanline recipe
  // (public/about-terrarium/style.css's #scanline-overlay), back as a plain DOM layer over the
  // whole viewer container. A prior pass tried baking this into each material's own fragment
  // shader instead (screen-space, scoped automatically to just the model's own pixels) — reverted,
  // confirmed invisible in practice, not worth chasing further; back to the DOM version, which was
  // genuinely visible before. Living HERE, inside the one shared `mountScene()`, rather than
  // duplicated in main.js's mountDictionary()/mountFlashcardSession() separately — both of those
  // mount through this same function (apps/web/CLAUDE.md's "Hard architectural boundary" — the
  // viewer is a single shared mount point for both), so this "inherits to flashcards" for free, per
  // explicit request, with nothing mount-site-specific to keep in sync. #viewer-container fills the
  // entire page in both modes (its own CSS, style.css) and is already `position: relative`, so a
  // plain `position: absolute; inset: 0` child reads as full-page without needing `position: fixed`
  // or a `document.body` append — and, being an ordinary child of `container`, it's torn down for
  // free whenever the next mount overwrites #app's innerHTML, same as the canvas above; no matching
  // removal code needed anywhere, unlike info-panel/search-panel/flashcard-panel (all appended
  // straight to `document.body`, main.js, which DO need explicit `.remove()` on exit). Style itself
  // (`#viewer-scanline-overlay`) lives in style.css at HALF the about overlay's own opacity — 0.015
  // vs 0.03 — per explicit request ("half strength"); style.css's own comment has the exact recipe.
  const scanlineOverlay = document.createElement('div')
  scanlineOverlay.id = 'viewer-scanline-overlay'
  container.appendChild(scanlineOverlay)

  buildEnvironment(renderer, scene) // glass materials below need scene.environment to reflect anything

  // Post-processing bloom — the 3D counterpart of the 2D boxes' own glow/blur system (see
  // theme.js's BLOOM comment for why no per-material color tuning is needed here). RenderPass
  // draws the scene into the composer's first buffer, UnrealBloomPass extracts+blurs+adds back
  // whatever's brighter than BLOOM.threshold, OutputPass re-applies the renderer's own color-space/
  // tone-mapping at the end — without it, colors coming out of the composer's intermediate render
  // targets read washed out compared to what a direct renderer.render() call would have produced.
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(container.clientWidth || 1, container.clientHeight || 1),
    BLOOM.strength,
    BLOOM.radius,
    BLOOM.threshold,
  )
  composer.addPass(bloomPass)
  composer.addPass(new OutputPass())

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

  // Shared materials, swapped by reference on hover (not mutated) — they're shared across every
  // stroke mesh in the scene for efficiency, so mutating .color would recolor everything at once.
  // normal/hoverNoise are opaque flat fills (a mesh needs only one of these, no shell pass).
  const normalMaterial = new THREE.MeshStandardMaterial(MATERIALS.normal)
  const hoverNoiseMaterial = new THREE.MeshStandardMaterial(MATERIALS.hoverNoise)
  // hoverUseful/pinned/glass are the "glass box" states — each a { back, front } pair (see
  // makeGlassPair) rendered as two coincident passes on the mesh + its shell (getOrCreateShell).
  // Click-to-pin (not plain hover) escalates the pinned side to a genuine glow and de-emphasizes
  // every other part of the character to translucent "glass" — only meaningfully visible on a
  // category-2 split (two parts), but this works unconditionally: a category-1/3 character has
  // exactly one group, so "every other part" is naturally empty and only the glow applies.
  const hoverUsefulGlass = makeGlassPair(MATERIALS.hoverUseful)
  const pinnedGlass = makeGlassPair(MATERIALS.pinned)
  const glassGlass = makeGlassPair(MATERIALS.glass)

  // playStrokeGeneration's own Stage 1/2 materials (below) — grey (COLORS.ink), NOT the jade the
  // pipeline-visualization dev tool's own "actively being demonstrated" color uses. Explicit
  // correction: these started out jade (matching that dev tool, and the house "mid-interaction"
  // color everywhere else in this app), which read as a real, confirmed green flash right as the
  // character actually renders into 3D — Stage 3's own hand-off to glassGlass.front already fixed
  // the SNAP at that exact instant, but the flat centerline/etch stages immediately before it were
  // still jade, so the color change was just moved a beat earlier instead of removed. Grey from the
  // very first frame means there's no jade anywhere in this whole sequence for anything to flash
  // FROM. Plain, cheap, unlit-adjacent materials (not another glass pair) — this plays for well
  // under a second on every load, not worth the two-pass glass construction the "real" states use.
  const genLineMaterial = new THREE.LineBasicMaterial({ color: COLORS.ink })
  const genFillMaterial = new THREE.MeshStandardMaterial({
    color: COLORS.ink,
    roughness: 0.32,
    transparent: true,
    opacity: 0,
  })

  // Every glass-state mesh gets a lazily-created sibling "shell" — same geometry, BackSide pass —
  // added to the same node group the first time that mesh goes translucent, then just shown/hidden
  // after that. Keyed by the stroke mesh itself so it dies with it (WeakMap, no manual cleanup
  // needed when setKanjiGroup discards the whole old kanjiGroup on the next character load).
  const shellCache = new WeakMap()
  function getOrCreateShell(mesh) {
    let shell = shellCache.get(mesh)
    if (!shell) {
      shell = new THREE.Mesh(mesh.geometry, normalMaterial) // placeholder; real pair set by caller before .visible flips true
      shell.userData.isGlassShell = true
      shell.raycast = () => {} // the front mesh alone is enough for hit-testing; avoid double hits
      shell.visible = false
      mesh.parent.add(shell)
      shellCache.set(mesh, shell)
    }
    return shell
  }

  // EXPERIMENTAL (edge glow) — a glowing wireframe outline traced along a mesh's real geometric
  // edges/corners, shown only while that mesh sits in the "greyed out" glassGlass state — see
  // setGroupMaterial's own use of this and theme.js's EDGE_GLOW comment for the full picture.
  // THREE.EdgesGeometry extracts just the silhouette/crease edges of the mesh's OWN geometry (not
  // every triangle edge — a true wireframe would look like a mesh grid, not a clean outline), so
  // this needs no manual outline-tracing logic of its own. Lazily built + cached per mesh (WeakMap,
  // same lifecycle as shellCache above), shown/hidden rather than rebuilt on every material change.
  // The color is pushed PAST 1.0 per channel (EDGE_GLOW.brightness) — LineBasicMaterial is unlit
  // (no emissiveIntensity to lean on the way the fill materials do), so this is what actually gets a
  // plain line to reliably cross BLOOM.threshold and glow on its own.
  const edgeGlowCache = new WeakMap()
  function getOrCreateEdgeGlow(mesh) {
    let line = edgeGlowCache.get(mesh)
    if (!line) {
      const material = new THREE.LineBasicMaterial({
        color: new THREE.Color(EDGE_GLOW.color).multiplyScalar(EDGE_GLOW.brightness),
        transparent: true,
        opacity: EDGE_GLOW.opacity,
        depthWrite: false,
        depthTest: false, // always draws over the coincident fill/shell geometry beneath it —
        // avoids z-fighting against surfaces sharing the exact same vertices
      })
      line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), material)
      line.userData.isEdgeGlow = true
      line.raycast = () => {} // same reasoning as the shell above — the front mesh alone hit-tests
      // Above glassGlass's own tier (2/1, see setGroupMaterial) so it draws over its own fill, but
      // below pinnedGlass's tier (12/11) — the pinned/white part must still win if this grey,
      // now-outlined part is the detach-zoomed one and visually overlaps it.
      line.renderOrder = 5
      line.visible = false
      mesh.parent.add(line)
      edgeGlowCache.set(mesh, line)
    }
    return line
  }

  // EXPERIMENTAL (detach-zoom) — each node-group's own local bounding-box center, computed once
  // and cached (WeakMap, dies with the group on the next character load, same lifecycle as
  // shellCache above) — see theme.js's DETACH_ZOOM comment for why this pivot exists at all:
  // scaling a group directly grows it around the KANJI's shared origin (0,0,0), which visibly
  // drifts an off-center part sideways as it grows; scaling around ITS OWN center instead is what
  // makes it read as "growing in place." Skips shell children (getOrCreateShell's placeholders) —
  // they share their owning mesh's geometry, counting both would just double-weight the same
  // shape, not expand the box.
  const detachPivotCache = new WeakMap()
  function getOrComputeDetachPivot(group) {
    let pivot = detachPivotCache.get(group)
    if (!pivot) {
      const box = new THREE.Box3()
      for (const mesh of group.children) {
        if (mesh.userData.isGlassShell) continue
        mesh.geometry.computeBoundingBox()
        box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix))
      }
      const baseCenter = new THREE.Vector3()
      box.getCenter(baseCenter)
      pivot = { basePosition: group.position.clone(), baseCenter }
      detachPivotCache.set(group, pivot)
    }
    return pivot
  }

  // Snaps a node-group's detach-zoom transform back to identity INSTANTLY, no easing — used
  // whenever a group becomes the pinned (white, frozen) one, since a pinned part is never
  // mid-zoom; see the pointerup handler below for why this can happen even to a group that was
  // already mid-grow (clicking the currently-grey part swaps which side is pinned in one click).
  function resetDetachTransform(group) {
    const pivot = getOrComputeDetachPivot(group)
    group.scale.setScalar(1)
    group.position.copy(pivot.basePosition)
  }

  // Holds the currently-rendered kanji's group (from kanjiRenderer.buildKanjiGroup). Swapped out
  // whole every time a new character loads — see setKanjiGroup.
  const strokeGroup = new THREE.Group()
  scene.add(strokeGroup)

  let groupIsInteractive = true

  // Whether the CURRENTLY mounted group responds to hover/click AT ALL — read only by raycastAt
  // below, so it's a single choke point that both the pointerup (click-to-pin) and pointermove
  // (hover) handlers automatically inherit without either needing its own check. Defaults to true so
  // every existing caller (dictionary mode's setKanjiGroup(buildKanjiGroup(...)), clearKanjiGroup)
  // keeps its current behavior — hover/pin responds to real, useful parts. Flashcard/lesson mode
  // always passes false — clicking the model itself is never how a flashcard session reveals a part;
  // that happens through the mini-lesson box's own 2D UI instead (main.js), a deliberate distinction:
  // the 3D model responding to clicks IS what "exploring" means (dictionary), so a flashcard session,
  // which is testing recall rather than inviting exploration, never lets it. This is the ALL-OR-
  // NOTHING gate — see `ignoreNoiseHover` (mountScene's own option, raycastAt below) for the SEPARATE,
  // finer-grained one that decides whether NOISE regions specifically respond, independent of this.
  //
  // `restingSpinState` is the state a plain click / a completed drag-return settles into — normally
  // 'autoSpinning' (dictionary's whole "always drifting" character), but a flashcard session's fresh
  // card wants to sit genuinely still (see `animateEntrance` below) until an explicit startAutoSpin()
  // call says otherwise (main.js, on a "didn't get it"). Both the pointerup click handler and tick()'s
  // 'returning' branch read this instead of hardcoding 'autoSpinning', so neither one can accidentally
  // wake a deliberately-still card back up just because the user dragged it and let go.
  let restingSpinState = 'autoSpinning'

  // Brings the pipeline-visualization dev tool's own effect (viewer/pipelineDemo.js) into the REAL
  // load-in swoop, by explicit request: watch it actually generate, not just swoop in already
  // finished. Runs CONCURRENTLY with the scale/rotation swoop setKanjiGroup already sets up below —
  // fired, not awaited, from there — same "the character is generating itself WHILE it's still
  // swooping into frame" idea the dev tool's own 'swoop' entrance toggle already established.
  //
  // `bundle` — the SAME parsed bundle setKanjiGroup's own caller already built `newGroup` from
  // (main.js's loadChar, `buildKanjiGroup(bundle, ...)`) — is what actually supplies the raw stroke
  // `d` strings this needs; kanjiRenderer.js's own userData contract deliberately shares ONE object
  // across every mesh in a render-group (so a raycast hit resolves to that whole region's own
  // node_id/element/etc.), so there's no per-mesh `d` to read back off `newGroup` itself — this
  // reads it from the source bundle instead of adding a second, parallel data channel to
  // kanjiRenderer.js's existing contract just for this.
  //
  // Deliberately does NOT stretch its own pacing to fill LOAD_SWOOP's own much longer duration —
  // theme.js's own STROKE_GENERATION has the full "why," reverted after trying it live: the
  // character finishes generating early into the swoop (its own fixed, short pace, same numbers the
  // dev tool uses), then continues swooping/rotating into place for the rest of the swoop's own
  // duration — tick()'s own swoopingIn branch still fires the actual hand-off to solid white
  // normalMaterial exactly when the swoop itself settles, untouched.
  //
  // What it's wearing for that IN-BETWEEN stretch — generation just finished, swoop still easing
  // down to normal size — changed by later explicit request: used to be plain grey (glassGlass,
  // same as before generation revealed it), now "blueprint mode" instead — glassGlass plus the
  // wireframe edge-glow outline (the SAME look a detach-zoomed sibling wears, EDGE_GLOW/
  // getOrCreateEdgeGlow further up this file) — turned on the instant the real meshes are revealed,
  // right below, and turned back off by tick()'s own hand-off to normalMaterial once the swoop
  // settles (setGroupMaterial's showEdgeGlow defaults to off for any non-glassGlass state). So the
  // full material arc for a real swoop+generation load is: invisible (generating) → blueprint
  // (revealed, still swooping) → solid white (settled) — blueprint is a brief transitional stretch,
  // not a resting state on its own.
  async function playStrokeGeneration(newGroup, bundle, myToken) {
    const realMeshes = []
    for (const nodeGroup of newGroup.children) {
      for (const mesh of nodeGroup.children) {
        mesh.visible = false
        realMeshes.push(mesh)
      }
    }

    const genGroup = new THREE.Group()
    strokeGroup.add(genGroup) // a sibling of newGroup, so it inherits the SAME swoop scale/rotation
    // strokeGroup itself is already carrying — no separate transform math needed here at all.

    const prepared = []
    for (const group of bundle.groups) {
      for (const stroke of group.strokes) {
        const points = samplePathPoints(stroke.d)
        if (!points) continue
        const { leftEdge, rightEdge } = computeOffsetEdges(points)
        const outline = buildOutlineShape(leftEdge, rightEdge)
        prepared.push({ points, leftEdge, rightEdge, outline })
      }
    }

    function cleanUp() {
      strokeGroup.remove(genGroup)
      genGroup.traverse((obj) => {
        obj.geometry?.dispose?.()
      })
    }

    // Stage 1 — every stroke's raw centerline draws in together (kanjiRenderer.js's own real
    // samplePathPoints output — never a re-derived approximation of it).
    const lines = prepared.map((p) => {
      const geometry = new THREE.BufferGeometry().setFromPoints(p.points)
      const line = new THREE.Line(geometry, genLineMaterial)
      line.raycast = () => {} // same "never a hit target" trick getOrCreateShell's own shells use —
      // this plays with hover/click already locked out for the whole swoop regardless (loadChar's
      // own `interactive: false`), but costs nothing to make doubly sure.
      genGroup.add(line)
      return line
    })
    await animateValue(STROKE_GENERATION.drawMs, (progress) => {
      for (let i = 0; i < prepared.length; i++) {
        lines[i].geometry.setDrawRange(0, Math.max(2, Math.floor(prepared[i].points.length * progress)))
      }
    })
    if (myToken !== genToken) {
      cleanUp()
      return
    }

    // Stage 2 — every stroke's offset edges etch outward from its own centerline together, then
    // every stroke's flat (still zero-depth) outline fades in together.
    const leftLines = []
    const rightLines = []
    for (const p of prepared) {
      const leftGeo = new THREE.BufferGeometry().setFromPoints(p.points)
      const rightGeo = new THREE.BufferGeometry().setFromPoints(p.points)
      const leftLine = new THREE.Line(leftGeo, genLineMaterial)
      const rightLine = new THREE.Line(rightGeo, genLineMaterial)
      leftLine.raycast = () => {}
      rightLine.raycast = () => {}
      genGroup.add(leftLine, rightLine)
      leftLines.push(leftLine)
      rightLines.push(rightLine)
    }
    await animateValue(STROKE_GENERATION.etchMs, (progress) => {
      for (let i = 0; i < prepared.length; i++) {
        const { points, leftEdge, rightEdge } = prepared[i]
        const leftPos = leftLines[i].geometry.attributes.position
        const rightPos = rightLines[i].geometry.attributes.position
        for (let j = 0; j < points.length; j++) {
          const from = points[j]
          leftPos.setXYZ(
            j,
            from.x + (leftEdge[j].x - from.x) * progress,
            from.y + (leftEdge[j].y - from.y) * progress,
            0,
          )
          rightPos.setXYZ(
            j,
            from.x + (rightEdge[j].x - from.x) * progress,
            from.y + (rightEdge[j].y - from.y) * progress,
            0,
          )
        }
        leftPos.needsUpdate = true
        rightPos.needsUpdate = true
      }
    })
    if (myToken !== genToken) {
      cleanUp()
      return
    }

    const flatMeshes = prepared.map((p) => {
      const geometry = new THREE.ShapeGeometry(p.outline)
      const mesh = new THREE.Mesh(geometry, genFillMaterial.clone())
      mesh.raycast = () => {}
      genGroup.add(mesh)
      return mesh
    })
    await animateValue(STROKE_GENERATION.fadeMs, (progress) => {
      for (const mesh of flatMeshes) mesh.material.opacity = progress
    })
    for (const line of [...lines, ...leftLines, ...rightLines]) {
      genGroup.remove(line)
      line.geometry.dispose()
    }
    if (myToken !== genToken) {
      cleanUp()
      return
    }

    // Stage 3 — every stroke's real depth grows in together (extrudeOutline — the exact real
    // production geometry, not a stand-in), each starting from the SAME flat mesh Stage 2 just
    // finished fading in, at the exact position/orientation it's already sitting at.
    //
    // `glassGlass.front` directly — the SAME shared material instance the real meshes underneath
    // are already wearing, not another jade genFillMaterial clone — real, confirmed complaint: the
    // extrude used to stay jade right up until the instant the overlay was torn down and the real
    // (grey glassGlass) mesh revealed, reading as a visible green-then-grey snap at that handoff.
    // Once the SHAPE is actually becoming a real 3D object (this stage, unlike 1/2 which are still
    // flat sketching/etching), it wears the same grey the settled character is already sitting in
    // underneath it — same color, same opacity, so revealing the real mesh underneath at the end
    // is invisible, not a snap.
    //
    // Each extrude mesh ALSO grows its own wireframe edge-glow outline right alongside it now —
    // later explicit request: a first pass left this stage plain grey (glassGlass, no outline) for
    // its own full ~700ms growth, only turning on the edge-glow once the overlay was torn down and
    // the real mesh took over (below) — a real, confirmed "flat 2D lines → plain grey 3D → THEN
    // blueprint" hitch, since the grey-only stretch sat awkwardly between the two. Added as a CHILD
    // of the mesh (not via getOrCreateEdgeGlow's usual mesh.parent.add — that helper assumes a mesh
    // that never moves its own local transform, true for every REAL character mesh it's normally
    // used on, but not this one: `mesh.scale.z` below IS the whole animation) so the outline inherits
    // that same growing scale.z for free, instead of needing a second parallel tween kept in sync
    // with it by hand. Same color/opacity/brightness recipe as EDGE_GLOW everywhere else in this
    // file — not a separate one-off constant.
    const extrudeMeshes = prepared.map((p, i) => {
      const geometry = extrudeOutline(p.outline)
      const mesh = new THREE.Mesh(geometry, glassGlass.front)
      mesh.raycast = () => {}
      mesh.scale.z = 0.001
      genGroup.remove(flatMeshes[i])
      flatMeshes[i].geometry.dispose()
      genGroup.add(mesh)
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: new THREE.Color(EDGE_GLOW.color).multiplyScalar(EDGE_GLOW.brightness),
        transparent: true,
        opacity: EDGE_GLOW.opacity,
        depthWrite: false,
        depthTest: false, // same reasoning as getOrCreateEdgeGlow's own — always draws over the
        // coincident fill beneath it rather than z-fighting against shared vertices.
      })
      const edgeGlow = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial)
      edgeGlow.raycast = () => {}
      edgeGlow.renderOrder = 5 // matches getOrCreateEdgeGlow's own tier — above plain glass, below pinnedGlass
      mesh.add(edgeGlow)
      return mesh
    })
    await animateValue(STROKE_GENERATION.extrudeMs, (progress) => {
      for (const mesh of extrudeMeshes) mesh.scale.z = 0.001 + (1 - 0.001) * progress
    })
    if (myToken !== genToken) {
      cleanUp()
      return
    }

    // Done — hand off to the real meshes (still mid-swoop at this point in practice) and clear the
    // overlay. Already blueprint mode by this point — Stage 3's own extrude meshes, just above,
    // grow their edge-glow outline right alongside their depth — so this is a continuation of that
    // same look onto the real meshes, not a fresh switch INTO it. tick()'s own swoopingIn branch is
    // what later swaps this to solid white once the swoop actually settles at normal size.
    cleanUp()
    for (const mesh of realMeshes) mesh.visible = true
    for (const g of newGroup.children) setGroupMaterial(g, glassGlass, { showEdgeGlow: true })
  }

  function setKanjiGroup(newGroup, { interactive = true, animateEntrance = true, bundle = null } = {}) {
    groupIsInteractive = interactive
    restingSpinState = animateEntrance ? 'autoSpinning' : 'idle'
    for (const child of [...strokeGroup.children]) {
      strokeGroup.remove(child)
    }
    hoveredNodeId = null
    hoveredGroup = null
    pinnedNodeId = null
    pinnedGroup = null
    // EXPERIMENTAL (detach-zoom) — a fresh character discards every old node-group outright (the
    // remove loop above), so any in-flight detach-zoom was animating something that no longer
    // exists in the scene; drop the reference so tick() stops touching it and a stray old timer
    // can't fire against a brand-new group of the same array index later. Same for a queued swap —
    // it references old groups too, and would otherwise try to apply itself to them later.
    detachGroup = null
    pendingSwap = null
    // Same reasoning as detachGroup/pendingSwap just above — a fresh character discards whatever
    // was mid-flicker for the OLD one too; without this, a very fast card-advance (unlikely at
    // LOAD_REVEAL's full ~1s, but not impossible) could apply a stale phase to the wrong newly-
    // mounted group, or its completion could swap the wrong group's materials once it fires.
    loadRevealStart = null
    loadRevealPhase = null
    // Same reasoning again — a fresh character (or clearKanjiGroup's own empty one) invalidates
    // whatever generation overlay the PREVIOUS one might still have been mid-flight through;
    // playStrokeGeneration's own checkpoints (below) are what actually act on this going stale.
    genToken++
    // Same reasoning again, extended to exitLoadedKanji()'s own state — reachable from a context that
    // DOESN'T immediately tear the whole viewer down afterward (main.js's syncSearchField, clearing
    // the search field back to empty — "Clearing back to empty," apps/web/CLAUDE.md) as well as the
    // original teardown-only call site (#back-to-home-btn). Resolve any pending exitLoadedKanji()
    // promise immediately rather than just nulling it out from under it — the caller's own generation
    // guard (main.js) is what decides whether to actually ACT on that resolution, but the promise
    // itself must still settle, or it leaks unresolved forever. `detachZoomBackResolve`, if set, means
    // exitLoadedKanji() is still waiting on its own detach-zoom-back tween (phase 1) and hasn't reached
    // `startFade()` yet — that hasn't populated exitRevealResolve at all yet, so calling it here (which
    // IS startFade) is what promotes it into "phase 2 pending," which the very next check then
    // immediately resolves too.
    if (detachZoomBackResolve) {
      const cb = detachZoomBackResolve
      detachZoomBackResolve = null
      cb()
    }
    if (exitRevealResolve) {
      const resolve = exitRevealResolve
      exitRevealResolve = null
      resolve()
    }
    exitRevealStart = null
    exitRevealPhase = null
    // Real bug, found and fixed after the above alone still left the NEXT load's own swoop
    // genuinely invisible ("can't even see it as it loads in... just snaps into place"): resolving
    // the exit-reveal's STATE (above) isn't the same as resetting the MATERIAL it was mutating.
    // applyExitReveal's own 'fade' phase directly mutates the SHARED glassGlass material's real
    // opacity/emissiveIntensity down toward 0 (glassGlass/pinnedGlass are both module-level
    // singletons, `makeGlassPair` above, reused by every character, not cloned per-load) — and
    // lands there whether the fade finishes naturally OR gets cut short by a fresh load like this
    // one. That was never a problem for exitLoadedKanji()'s ORIGINAL caller (#back-to-home-btn) —
    // the whole viewer, and this glassGlass instance with it, gets torn down and rebuilt fresh right
    // after. It's a real problem now that `clearKanjiGroup()` also calls exitLoadedKanji() first
    // ("Clearing back to empty," apps/web/CLAUDE.md) and the SAME `glassGlass` instance survives
    // into the next real character: setGroupMaterial(g, glassGlass) a few lines below hands the new
    // character this material at whatever opacity the interrupted fade left it at — near/at 0, i.e.
    // invisible — for its entire swoop, only becoming visible the instant the swoop's own completion
    // force-switches to normalMaterial (tick()'s swoopingIn branch), which is exactly the "invisible
    // swoop, then snaps in" symptom reported. Unconditional, not just when actually interrupting
    // something — a fully-NATURALLY-finished exit reveal leaves glassGlass at the exact same
    // corrupted 0 opacity, so this can't be gated on `exitRevealStart`/`exitRevealResolve` having
    // been non-null moments ago. `applyGlowMultiplier(..., 1, 1)` is the same function the fade
    // itself uses, just handed multiplier 1 — the literal "back to full strength, no multiplier"
    // case — rather than a hand-rederived reset.
    applyGlowMultiplier(glassGlass, MATERIALS.glass.opacity, MATERIALS.glass.emissiveIntensity, 1, 1)
    applyGlowMultiplier(pinnedGlass, MATERIALS.pinned.opacity, MATERIALS.pinned.emissiveIntensity, 1, 1)
    if (animateEntrance) {
      // Starts turned edge-on to LOAD_SWOOP.startAngle — "facing to the side" — instead of the
      // normal neutral front-facing pose. tick()'s swoopingIn branch below eases this explicitly
      // back to 0 in lockstep with the scale swoop (same shared timed progress, suppressing the
      // ordinary auto-spin increment meanwhile), so the character turns from side to front at
      // exactly the same rate it shrinks from huge to normal, landing face-front the instant it
      // settles.
      strokeGroup.rotation.set(0, LOAD_SWOOP.startAngle, 0)
      spinState = 'autoSpinning' // fresh character always starts spinning from neutral
      // A fresh character starts at PINCH's own max size (not whatever the previous one had been
      // pinched to) and swoops down to normal — see theme.js's LOAD_SWOOP and tick()'s own use of
      // it below. swoopingIn takes priority over the ordinary idle-revert easing (which would
      // otherwise wait PINCH.idleMs before doing anything), so this starts closing the very next
      // frame, not after a multi-second wait.
      pinchScale = PINCH.max
      swoopingIn = true
      swoopStart = performance.now()
    } else {
      // animateEntrance: false — a flashcard session's fresh card (main.js). Lands directly at its
      // final resting pose: front-facing, normal size, genuinely still (restingSpinState above is
      // already 'idle', so nothing here needs to also silence tick()'s autoSpinning branch — it
      // simply never matches). "Traditional flashcard" per the actual ask: recognizable at a glance,
      // not something you have to wait for or that's already drifting while you're trying to read it.
      strokeGroup.rotation.set(0, 0, 0)
      spinState = 'idle'
      pinchScale = 1
      swoopingIn = false
    }
    strokeGroup.add(newGroup)
    // Starts in the same dim, grey, see-through "unselected" skin every OTHER part already wears
    // once something's pinned (glassGlass) — not lit up from the first frame, either path.
    // Deliberately NOT passing showEdgeGlow here — plain grey is only ever actually seen when
    // there's no bundle to generate from (animateEntrance:true with no bundle: the plain swoop,
    // below); the real swoop+generation path never shows this bare state at all, since the real
    // meshes stay invisible (playStrokeGeneration's own `mesh.visible = false`) until generation
    // finishes, and THAT reveal is what turns on the edge-glow outline — see this function's own
    // header comment for the full "blueprint mode" hand-off.
    for (const g of newGroup.children) setGroupMaterial(g, glassGlass)
    if (animateEntrance) {
      // tick()'s swoopingIn branch (below) drops this to solid white normalMaterial the instant the
      // swoop settles at normal size — no flicker, no delay (see that branch's own comment).
      // `bundle` — only ever supplied by the ONE real call site that also plays this whole swoop
      // (main.js's loadChar) — is what actually lets playStrokeGeneration run at all; a caller that
      // passes animateEntrance:true without a bundle just gets the plain swoop, unchanged, same as
      // before this existed.
      if (bundle) playStrokeGeneration(newGroup, bundle, genToken)
    } else {
      // A static (no-swoop, no-rotation) load still gets a reveal — explicit request, reusing the
      // SAME jump-cut flicker a real pin landing plays (LOAD_REVEAL, theme.js) instead of either
      // snapping straight to normalMaterial (too abrupt with nothing else moving to mask it) or the
      // swoop path's silent instant-white (that one's masked by the scale/rotation motion finishing
      // at the same instant; this path has no motion to hide behind). tick()'s own loadRevealStart
      // branch is what actually swaps to normalMaterial once the flicker completes.
      loadRevealStart = performance.now()
    }
  }

  // Empties the viewer entirely (no character shown at all) — for the search box's own empty
  // state (main.js's syncSearchField), not a "load a real character" path. Reuses setKanjiGroup's
  // own reset logic (hover/pin state, rotation, pinch scale) by just handing it nothing to
  // display, rather than duplicating that reset elsewhere. `animateEntrance: false` — real, confirmed
  // bug without it: the default (true) played the FULL load-in swoop for an empty group, with nothing
  // in it to actually see swooping. This only ever runs AFTER `exitLoadedKanji()` has already eased
  // whatever was on screen a moment before back down and dissolved it (main.js's syncSearchField,
  // "Clearing back to empty" apps/web/CLAUDE.md) — by the time this fires there's genuinely nothing
  // left to reveal either, so no swoop and no reveal flicker, just a clean, silent reset.
  function clearKanjiGroup() {
    setKanjiGroup(new THREE.Group(), { animateEntrance: false })
  }

  // --- Hover + click-to-pin raycasting ---
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let hoveredNodeId = null
  let hoveredGroup = null // the actual THREE.Group (mesh.parent), not looked up by id — see below

  // Drives the "generating in" flicker (see theme.js's HOVER_REVEAL) — set the instant a NEW
  // useful hover starts, read every frame in tick() below, cleared once the sequence finishes OR
  // the hover moves on to something else before it does (see onPointerMove). null means "not
  // currently playing" — tick() only touches hoverUsefulGlass's opacity/emissiveIntensity while
  // this is set, so there's zero per-frame cost once a hover has settled.
  let hoverRevealStart = null

  // A click "pins" a region: the highlight and info panel stay up when the pointer leaves the
  // canvas (e.g. moving to the sidebar to click a related-kanji button), instead of reverting the
  // moment hover ends. Pinning takes over from live hover entirely — see onPointerMove below —
  // so exploring a different region while one is pinned needs a fresh click, not just a hover.
  let pinnedNodeId = null
  let pinnedGroup = null

  // Same "generating in" pattern as hoverRevealStart above, but for an actual pin landing (see
  // theme.js's PIN_REVEAL) — set the instant a fresh pin happens, read every frame in tick(),
  // cleared once the sequence finishes. Once it's null AND something is still pinned, tick()
  // switches to pinFlickerNextAt below instead — the ongoing subtle "fluorescent tube" hum.
  let pinRevealStart = null
  // The ongoing flicker's own state once PIN_REVEAL has settled: the timestamp its current held
  // jitter value expires at, and that value itself (re-rolled once expired) — see PIN_FLICKER's
  // own comment and applyPinFlicker/tick below.
  let pinFlickerNextAt = 0
  // Same "generating in" pattern again, for a flashcard session's static load (see theme.js's
  // LOAD_REVEAL and setKanjiGroup's `animateEntrance` option below) — set the instant a static card
  // mounts, read every frame in tick(), cleared once the sequence finishes AND every current group
  // has been swapped from glassGlass to normalMaterial (tick's own loadRevealStart branch does both
  // in the same step, mirroring the swoop path's own "instant white the moment it settles" swap).
  let loadRevealStart = null
  // Which of LOAD_REVEAL's three material phases ('blueprint'/'gray'/'glow') was last actually
  // applied — see applyLoadReveal's own comment for why this exists (only swap materials on a real
  // phase change, not every frame). Reset alongside loadRevealStart, both places.
  let loadRevealPhase = null
  let pinFlickerMultiplier = { opacity: 1, emissive: 1 }

  // Dictionary mode's own "close dictionary" exit sequence (exitLoadedKanji, below) — same
  // "generating in" pattern as every other *RevealStart above, just walked toward invisible instead
  // of toward a settled material. exitRevealHadPin is captured ONCE, at the exact moment the exit
  // sequence starts (not read live from pinnedGroup every frame) — a one-shot decision made at t=0
  // about which phase-1/phase-2 split to use for this whole run; nothing can actually interact with
  // the model once setInteractive(false) locks it, so there's nothing for a live read to protect
  // against, only fragility to introduce.
  let exitRevealStart = null
  let exitRevealPhase = null
  let exitRevealHadPin = false
  let exitRevealResolve = null
  // Set only by exitLoadedKanji, right before it calls startDetachZoom(detachGroup, 1) to ease a
  // mid-zoom sibling back to normal size FIRST — see that function's own comment. Every other caller
  // of startDetachZoom (pinGroup's swap branch, unpin) fires it and forgets; this is the one caller
  // that needs to know the INSTANT it's actually finished, so the material fade only ever starts once
  // the model is genuinely back to normal size, never a moment before. tick()'s own detachGroup block
  // is what actually calls this, the same place it already resolves a queued pendingSwap.
  let detachZoomBackResolve = null

  // EXPERIMENTAL (detach-zoom) — the node-group currently under detach-zoom control (growing,
  // holding at full size, or shrinking back), or null when nothing is. Only ONE at a time: this
  // only ever applies to an exactly-two-part character (theme.js's DETACH_ZOOM), so there's never
  // more than one "other, grey" part to animate. `detachFromScale`/`detachToScale` are the current
  // eased tween's endpoints (read fresh, not assumed, so re-triggering mid-flight — e.g. unpinning
  // before a grow has finished — starts cleanly from wherever it actually is right now, not a
  // stale target); `detachAnimStart` times it the same real-clock way LOAD_SWOOP's own swoopStart
  // does. See tick()'s own detachGroup block for the per-frame pivot-scale math.
  let detachGroup = null
  let detachFromScale = 1
  let detachToScale = 1
  let detachAnimStart = 0

  function startDetachZoom(group, toScale) {
    detachGroup = group
    detachFromScale = group.scale.x
    detachToScale = toScale
    detachAnimStart = performance.now()
  }

  // EXPERIMENTAL (detach-zoom) — queued by the pointerup handler when a SWAP is requested (the
  // currently-grey/zoomed part is being clicked while something else is already pinned): rather
  // than swapping materials/transforms instantly, the grey part's reverse-to-normal plays out
  // FIRST, and only once tick()'s detachGroup block actually finishes that (t>=1, back at scale 1)
  // does this get applied — see that block's own use of it. A plain fresh pin (nothing was pinned
  // before) or a plain unpin never sets this; it's the swap case specifically. `{ newPinnedGroup,
  // allGroups }` — `allGroups` is captured at click time and stays valid across the wait (the SET
  // of node-groups never changes mid-character; only their materials/transforms do), unless a
  // fresh character loads in the meantime, which clears this outright (see setKanjiGroup).
  let pendingSwap = null

  // The actual "become pinned" visuals — white glass + frozen size on `newPinnedGroup`, grey glass
  // + blueprint outline + its own grow-in on whichever OTHER group exists (theme.js's
  // DETACH_ZOOM). Called two different ways: immediately, for a fresh pin (pointerup, nothing was
  // pinned before — no reverse to wait for); or deferred, once a queued swap's reverse actually
  // finishes (tick()'s detachGroup block, via pendingSwap above).
  function applyPinVisuals(newPinnedGroup, allGroups) {
    setGroupMaterial(newPinnedGroup, pinnedGlass)
    resetDetachTransform(newPinnedGroup) // always frozen at normal size the instant it's pinned
    if (newPinnedGroup === detachGroup) detachGroup = null // was mid-reverse a moment ago — settled now
    for (const g of allGroups) {
      if (g !== newPinnedGroup) setGroupMaterial(g, glassGlass, { showEdgeGlow: true })
    }
    pinRevealStart = performance.now() // kicks off PIN_REVEAL's "generating in" flicker — see
    // tick() below. Once it finishes, tick() switches straight into the ongoing subtle
    // PIN_FLICKER hum for as long as pinnedGroup stays set.
    const otherGroup = allGroups.length === 2 ? allGroups.find((g) => g !== newPinnedGroup) : null
    if (otherGroup) startDetachZoom(otherGroup, DETACH_ZOOM.targetScale)
  }

  // `state` is either a plain THREE.Material (normal/hoverNoise — opaque, no shell needed) or a
  // { back, front } glass pair (hoverUseful/pinned/glass — see makeGlassPair): the front pass goes
  // on the stroke mesh itself, the back pass on its lazily-created shell, renderOrder matching
  // glassbox2.js's own glassBack(1)/glassFront(2) so the inner surface composites first.
  function setGroupMaterial(nodeGroup, state, { showEdgeGlow = false } = {}) {
    // EXPERIMENTAL (detach-zoom) — whatever's actually pinned always paints LAST among the glass
    // states, strictly above the ordinary 2/1 tier every other glass state shares. Every glass
    // material here has depthWrite:false by construction (makeGlassPair) — none of them ever
    // register in the depth buffer — so once the grey (detach-zoomed) part grows large enough to
    // visually overlap the frozen white one, plain draw order is the ONLY thing deciding which is
    // visible on top; this is what actually delivers "stays in its spot over the top of."
    const tier = state === pinnedGlass ? 12 : 2
    for (const mesh of nodeGroup.children) {
      // Shells and edge-glow lines are driven from their owning mesh below, not iterated directly —
      // both live as siblings of the real stroke meshes inside this same nodeGroup.
      if (mesh.userData.isGlassShell || mesh.userData.isEdgeGlow) continue
      if (state.front) {
        mesh.material = state.front
        mesh.renderOrder = tier
        const shell = getOrCreateShell(mesh)
        shell.material = state.back
        shell.renderOrder = tier - 1
        shell.visible = true
      } else {
        mesh.material = state
        const shell = shellCache.get(mesh)
        if (shell) shell.visible = false
      }
      // EXPERIMENTAL (edge glow) — only glassGlass AND an explicit opt-in gets the blueprint
      // outline. The opt-in is what keeps this OFF the plain load-in swoop (setKanjiGroup's own
      // glassGlass call never passes it — "just the normal grey box" while loading) while still
      // showing it on the actual detach-zoomed sibling (the pointerup handler's own glassGlass
      // call, and onPointerMove's hover-leave restore, both pass it) — both are glassGlass, but
      // only one of them is meant to carry the outline.
      if (state === glassGlass && showEdgeGlow) {
        getOrCreateEdgeGlow(mesh).visible = true
      } else {
        const edgeGlow = edgeGlowCache.get(mesh)
        if (edgeGlow) edgeGlow.visible = false
      }
    }
  }

  function raycastAt(clientX, clientY) {
    // Single choke point for the whole "is this kanji clickable at all" gate — see
    // groupIsInteractive's own comment above setKanjiGroup. Both the click-to-pin handler
    // (pointerup) and the hover handler (onPointerMove) already treat "nothing hit" as their normal
    // no-op path, so returning null here is enough to make an atomic/irregular kanji in flashcard
    // mode behave as a plain rotatable model with zero hover/pin response — drag-to-rotate is
    // untouched either way, it never calls this at all (see the pointerdown/pointermove-while-
    // dragging listeners below).
    if (!groupIsInteractive) return null
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(strokeGroup.children, true)
    // kanjiRenderer.js nests each mesh directly under its render-group (Group), so .parent gets
    // us there in one step — no need to search strokeGroup.children (which only holds the single
    // outer kanji wrapper, not the individual node-groups; searching that always misses).
    //
    // `ignoreNoiseHover` (mountScene's own option, defaults true) used to be plain `hits[0]` always —
    // dictionary mode's own hover/click responded to noise regions too (shown in red), on purpose, as
    // a way to visually verify the classifier's own verdicts. Retired by explicit request: that's a
    // developer/test-tool behavior, not something a learner using the app should ever see, and it was
    // still active in the live app rather than gated behind anything. `hits` is already sorted
    // nearest-first, so this walks past any noise hit(s) in front of a useful one instead of just
    // rejecting the nearest hit outright — a useful part sitting just behind a noise region should
    // still respond, not become dead space.
    if (!ignoreNoiseHover) return hits.length > 0 ? hits[0].object.parent : null
    const usefulHit = hits.find((hit) => hit.object.parent.userData.useful)
    return usefulHit ? usefulHit.object.parent : null
  }

  // World-space bounding-box center of a node group, projected to on-screen pixel coordinates —
  // where the spawn animation's flying shard should originate from when that group gets pinned.
  // Box3().setFromObject reads world matrices, so this is correct regardless of strokeGroup's
  // current auto-spin/drag rotation.
  const projectionBox = new THREE.Box3()
  const projectionCenter = new THREE.Vector3()
  function projectGroupCenter(group) {
    projectionBox.setFromObject(group)
    projectionBox.getCenter(projectionCenter)
    projectionCenter.project(camera) // world → NDC (-1..1)
    const rect = renderer.domElement.getBoundingClientRect()
    return {
      x: rect.left + (projectionCenter.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-projectionCenter.y * 0.5 + 0.5) * rect.height,
    }
  }

  // Pins a specific group — extracted from the pointerup handler (below) so it has a second real
  // caller: pinNodeId, further down, pins by node_id directly instead of a raycasted screen hit, for
  // a 2D UI element (main.js's lesson box) to trigger the exact same visual a direct 3D click gets.
  // Same EXPERIMENTAL (detach-zoom) swap logic either way, unchanged from before this extraction: a
  // SWAP (something was already pinned) reverses that sibling back to normal size FIRST, and only
  // once it's genuinely back there does the actual pin/material swap happen — see applyPinVisuals's
  // own comment. A fresh pin (nothing was pinned before) has nothing to reverse, so it applies
  // immediately, same as always.
  function pinGroup(targetGroup) {
    const allGroups = strokeGroup.children[0]?.children ?? []
    const isSwap = pinnedGroup !== null
    pinnedNodeId = targetGroup.userData.node_id
    pinnedGroup = targetGroup
    if (isSwap) {
      // Materials are deliberately left UNTOUCHED here — the old pinned part stays white/frozen,
      // the new one (grey/blueprint) stays exactly as it visually is right now, just easing back
      // down — nothing "swaps" on-screen until that reverse actually completes.
      pendingSwap = { newPinnedGroup: pinnedGroup, allGroups }
      startDetachZoom(detachGroup, 1)
    } else {
      // Reset every part first — a prior hover/pin may have left something glass that a plain
      // fresh pin should start clean from.
      for (const g of allGroups) setGroupMaterial(g, normalMaterial)
      applyPinVisuals(pinnedGroup, allGroups)
    }
    hoveredNodeId = pinnedNodeId
    hoveredGroup = pinnedGroup
    // Screen-space center of the pinned group — the spawn animation's flying shard needs to know
    // where on screen to originate from.
    onPin?.(pinnedGroup?.userData ?? null, projectGroupCenter(pinnedGroup))
  }

  // Releases whatever's currently pinned — extracted alongside pinGroup, same reasoning (a second
  // real caller: unpin, in mountScene's own return, for a 2D UI element's mouseleave to reverse what
  // its own mouseenter/pinNodeId triggered). Unlike a swap, this is NOT deferred — materials reset
  // instantly (as always), only the grey part's SIZE eases back down separately; see this function's
  // own history (when it lived inline in the pointerup handler) for why that split is deliberate
  // (the accepted design from when detach-zoom was first built). A no-op if nothing's pinned.
  function unpin() {
    if (!pinnedGroup) return
    const allGroups = strokeGroup.children[0]?.children ?? []
    for (const g of allGroups) setGroupMaterial(g, normalMaterial)
    pinnedNodeId = null
    pinnedGroup = null
    pinRevealStart = null // stop either flicker outright — nothing is pinned to animate anymore
    pendingSwap = null // a plain unpin cancels any swap that might somehow still be queued
    // EXPERIMENTAL (detach-zoom) — ease the grown/growing grey part back down to normal, from
    // wherever it currently actually is (startDetachZoom reads its LIVE scale), rather than just
    // snapping it away — the explicit ask (same eased-revert convention as everything else in this
    // app that animates open).
    if (detachGroup) startDetachZoom(detachGroup, 1)
    hoveredNodeId = null
    hoveredGroup = null
    onPin?.(null, null)
  }

  // Dictionary mode's own "close dictionary" exit — main.js's #back-to-home-btn calls this (guarded
  // there on a character actually being loaded) instead of just letting the model vanish the instant
  // #viewer-container gets torn down. Two real steps, strictly SEQUENTIAL — matches the explicit ask
  // ("go back to regular size... and THEN do the trick in reverse"), not run concurrently with each
  // other (only the WHOLE thing runs concurrently with the box's own closeAndFade — see the caller's
  // own comment for why):
  //   1. If a part is currently mid-zoom/holding at DETACH_ZOOM's own scale (detachGroup !== null),
  //      ease it back down to normal size FIRST — the exact SAME startDetachZoom(...,1) tween
  //      unpin()/pinGroup's own swap branch already use, nothing new there except AWAITING it this
  //      time (detachZoomBackResolve, above, is the one genuinely new piece).
  //   2. Once genuinely back to normal size (or immediately, if nothing was mid-zoom to begin with),
  //      play EXIT_REVEAL (theme.js has the full material design) and resolve once THAT finishes.
  // pinnedGroup/pinnedNodeId are deliberately left untouched through all of this (no unpin() call) —
  // the entire dictionary-mode DOM this state belongs to is about to be torn down the moment this
  // promise resolves (main.js's mountHome()), so there's no stale UI left for it to mislead; tick()'s
  // own ambient pin-flicker is what actually needs to stand down here, guarded on exitRevealStart
  // instead (see that block's own comment).
  function exitLoadedKanji() {
    return new Promise((resolve) => {
      const allGroups = strokeGroup.children[0]?.children ?? []
      if (allGroups.length === 0) {
        resolve() // nothing actually loaded — a defensive no-op; main.js's own call site already
        return // guards on this, so this path shouldn't normally be reached at all.
      }
      groupIsInteractive = false // nothing here should still respond to hover/click while it's leaving
      const hadPin = pinnedGroup !== null
      function startFade() {
        exitRevealResolve = resolve
        exitRevealHadPin = hadPin
        exitRevealPhase = null
        exitRevealStart = performance.now()
      }
      if (detachGroup) {
        detachZoomBackResolve = startFade
        startDetachZoom(detachGroup, 1)
      } else {
        startFade()
      }
    })
  }

  // Pins by node_id directly, no raycasting — the actual entry point a 2D UI element (main.js's
  // lesson box) calls on click. Looks the group up the same place raycastAt's own hits resolve from
  // (strokeGroup.children[0]'s own children), a no-op if that id isn't currently mounted (a stale
  // call from a just-superseded card). A genuine TOGGLE, same as a direct 3D click already is —
  // clicking the currently-pinned part's own 2D entry again releases it, matching pointerup's own
  // `hitNodeId !== pinnedNodeId` check, just addressed by identity instead of a raycast hit.
  function pinNodeId(nodeId) {
    const allGroups = strokeGroup.children[0]?.children ?? []
    const targetGroup = allGroups.find((g) => g.userData?.node_id === nodeId)
    if (!targetGroup) return
    if (targetGroup === pinnedGroup) {
      unpin()
      return
    }
    pinGroup(targetGroup)
  }

  // --- Drag to rotate (and click detection — a click is a pointerdown/up pair with ~no movement
  // between them, so drag-rotate and click-to-pin share the same listeners without conflicting) ---
  // Auto-spin state machine, driven in tick() below: 'dragging' (pointer owns rotation) ->
  // 'returning' (eases back to neutral — the shortest way round, not unwinding accumulated spin,
  // see normalizeAngle) -> 'autoSpinning' (slow constant y-axis turn) -> back to 'dragging' on the
  // next pointerdown. A fresh character always starts 'autoSpinning' — see setKanjiGroup.
  let dragging = false
  let spinState = 'autoSpinning'
  let pointerDownX = 0
  let pointerDownY = 0
  let lastX = 0
  let lastY = 0

  function normalizeAngle(a) {
    const twoPi = Math.PI * 2
    a = a % twoPi
    if (a > Math.PI) a -= twoPi
    if (a < -Math.PI) a += twoPi
    return a
  }

  renderer.domElement.addEventListener('pointerdown', (event) => {
    dragging = true
    spinState = 'dragging'
    pointerDownX = lastX = event.clientX
    pointerDownY = lastY = event.clientY
    renderer.domElement.setPointerCapture(event.pointerId)
  })
  renderer.domElement.addEventListener('pointerup', (event) => {
    dragging = false
    renderer.domElement.releasePointerCapture(event.pointerId)

    const moved = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY)
    if (moved > MOTION.clickMoveThreshold) {
      // A REAL drag — this is the one thing allowed to interrupt/reset rotation. Was a real,
      // confirmed bug: this reset used to run unconditionally, before this drag-vs-click check even
      // existed below — meaning a plain CLICK (pinning/swapping a part) ALSO snapped the character
      // back to face-forward every time, "hopping" mid-rotation the instant anything was clicked.
      // Explicit request: clicking a part, from any rotation, at any point in its spin, should never
      // touch rotation at all — only an actual click-and-drag legitimately means "the user is taking
      // over rotation," which is what this branch (and only this branch) now covers.
      // Normalize before easing back so the return takes the shortest path — without this, a
      // rotation.y that's accumulated many turns during auto-spin would visibly unwind all of them.
      strokeGroup.rotation.y = normalizeAngle(strokeGroup.rotation.y)
      strokeGroup.rotation.x = normalizeAngle(strokeGroup.rotation.x)
      spinState = 'returning'
      return
    }

    // Not a real drag — a plain click. `pointerdown` unconditionally sets spinState = 'dragging' on
    // every press, real drag or not (it can't know yet which this'll turn out to be); this is what
    // undoes that for the click case specifically. Real, confirmed bug this fixes: without it,
    // spinState stayed stuck at 'dragging' forever after any plain click — tick()'s rotation logic
    // only has branches for 'returning'/'autoSpinning', nothing for 'dragging', so rotation just
    // froze completely until an actual drag came along and moved it out of that state again ("had
    // to drag to wake it up"). Straight to restingSpinState, not 'returning' — nothing actually moved
    // during a plain click, so there's no rotation to ease back from; this just resumes whatever the
    // current card's own resting behavior is (autoSpinning normally, idle for a flashcard session's
    // still-unrevealed card — see restingSpinState's own comment above setKanjiGroup) exactly where
    // it already was, with zero reset and zero pause.
    spinState = restingSpinState

    const hitGroup = raycastAt(event.clientX, event.clientY)
    const hitNodeId = hitGroup?.userData?.node_id ?? null

    if (hitNodeId && hitNodeId !== pinnedNodeId) {
      pinGroup(hitGroup)
    } else {
      unpin()
    }
  })
  renderer.domElement.addEventListener('pointermove', (event) => {
    if (!dragging) return
    strokeGroup.rotation.y += (event.clientX - lastX) * MOTION.dragRotateSpeed
    strokeGroup.rotation.x += (event.clientY - lastY) * MOTION.dragRotateSpeed
    lastX = event.clientX
    lastY = event.clientY
  })

  function onPointerMove(event) {
    if (dragging) return
    const hitGroup = raycastAt(event.clientX, event.clientY)
    const hitNodeId = hitGroup?.userData?.node_id ?? null

    if (hitNodeId === hoveredNodeId) return // no change

    // Restoring/setting hover material never touches the pinned group itself — it stays lit
    // regardless of what else is being hovered. Hover only ever drives the 3D material now (the
    // glow that says "this is clickable") — the info box itself no longer responds to hover at
    // all, only to an actual click/pin (see onPin in the pointerup handler above). A pin doesn't
    // block hovering other regions for their material preview; it just doesn't touch the box.
    if (hoveredGroup && hoveredGroup !== pinnedGroup) {
      // showEdgeGlow: true — restoring the detach-zoomed sibling back to grey after leaving its
      // hover-preview; a no-op when state is normalMaterial (nothing's pinned) instead.
      setGroupMaterial(hoveredGroup, pinnedGroup ? glassGlass : normalMaterial, { showEdgeGlow: true })
    }
    // Any in-progress "generating in" flicker was for whatever was hovered before — leaving that
    // hover (even to hover something else) cancels it outright rather than letting it keep
    // animating hoverUsefulGlass after nothing on screen is using it anymore.
    hoverRevealStart = null

    hoveredNodeId = hitNodeId
    hoveredGroup = hitNodeId ? hitGroup : null
    if (hoveredGroup && hoveredGroup !== pinnedGroup) {
      const useful = hoveredGroup.userData.useful
      setGroupMaterial(hoveredGroup, useful ? hoverUsefulGlass : hoverNoiseMaterial)
      // Only the useful (green) hover gets the flicker — see theme.js's HOVER_REVEAL comment for
      // why. Noise (red) hover stays instant, unchanged.
      if (useful) hoverRevealStart = performance.now()
    }
  }
  renderer.domElement.addEventListener('pointermove', onPointerMove)

  // --- Two-finger pinch to resize (theme.js's PINCH) — a uniform scale on strokeGroup, entirely
  // separate from rotation/drag above. Two input paths feed the same `pinchScale`/
  // `lastPinchActivity` state: a trackpad pinch (this Mac's actual input device) and a real
  // touchscreen two-finger gesture. --- Trackpad path: neither Chrome nor Firefox expose a
  // dedicated "pinch" event for a trackpad gesture — both represent it as a 'wheel' event with
  // `ctrlKey: true` (the same signal an actual Ctrl+scroll from a physical mouse wheel produces;
  // there is no reliable way to tell the two apart, a limitation every browser pinch-to-zoom
  // implementation shares). `preventDefault()` stops the browser's own page-zoom from *also*
  // firing alongside our custom scale.
  let pinchScale = 1
  let lastPinchActivity = 0
  // True from the moment a fresh character loads (setKanjiGroup) until its load-in swoop finishes
  // easing pinchScale back down to 1 — see tick()'s own use of this and theme.js's LOAD_SWOOP.
  let swoopingIn = false
  let swoopStart = 0 // performance.now() timestamp the current swoop began — its progress is timed
  // off this, not accumulated frame-by-frame, so it runs at the same real-world speed and reaches
  // an actual, definite finish regardless of framerate — see tick()'s use of it below.

  // playStrokeGeneration's own guard, same purpose as pipelineDemo.js's identically-named idea (own
  // comment there has the full reasoning): bumped every time setKanjiGroup starts a fresh
  // generation, checked by the in-flight one's own next checkpoint so an interrupted load (a second
  // search fired before the first one's generation finished playing) cleans up after itself instead
  // of fighting the new one for the same overlay meshes or wrongly revealing the WRONG group's real
  // meshes once it finally resolves.
  let genToken = 0

  function bumpPinchScale(factor) {
    swoopingIn = false // a real pinch always takes over immediately from the load-in swoop — same
    // "newer user action cancels whatever was already animating" rule the hover/pin reveals follow
    // elsewhere in this file, rather than fighting the user's own input every frame.
    pinchScale = Math.min(PINCH.max, Math.max(PINCH.min, pinchScale * factor))
    lastPinchActivity = performance.now()
  }

  renderer.domElement.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      // Negative deltaY = spreading fingers apart (zoom in) on every browser's convention for this
      // synthetic event — Math.exp keeps the result always positive and makes repeated small
      // deltas during one continuous gesture compound multiplicatively, not just add up, which is
      // what makes a single ordinary pinch able to reach from PINCH.min to PINCH.max on its own.
      bumpPinchScale(Math.exp(-event.deltaY * PINCH.sensitivity))
    },
    { passive: false },
  )

  // --- Touchscreen path: tracks the distance between the first two touch points, scaling
  // relative to that distance at gesture start (not incrementally like the wheel path above,
  // since touchmove reports absolute finger positions each event, not deltas).
  let pinchTouchStartDist = null
  let pinchTouchStartScale = 1

  function touchDistance(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  }

  renderer.domElement.addEventListener('touchstart', (event) => {
    if (event.touches.length === 2) {
      pinchTouchStartDist = touchDistance(event.touches)
      pinchTouchStartScale = pinchScale
    }
  })
  renderer.domElement.addEventListener(
    'touchmove',
    (event) => {
      if (event.touches.length !== 2 || pinchTouchStartDist === null) return
      event.preventDefault()
      bumpPinchScale((pinchTouchStartScale * (touchDistance(event.touches) / pinchTouchStartDist)) / pinchScale)
      // bumpPinchScale multiplies by a FACTOR (relative change), but this path already knows the
      // absolute target scale directly — dividing by the current pinchScale first converts "set to
      // X" into "multiply by (X / current)" so it can go through the same clamp+timestamp helper
      // as the wheel path instead of duplicating that logic.
    },
    { passive: false },
  )
  renderer.domElement.addEventListener('touchend', (event) => {
    if (event.touches.length < 2) pinchTouchStartDist = null
  })

  // ResizeObserver, not a window 'resize' listener: the container's size can become known/change
  // (initial layout, grid reflow, sidebar toggling) without the window itself resizing, and a
  // 'resize' listener never fires for that — which is exactly how the camera could get stuck with
  // a degenerate 0-aspect projection matrix if clientWidth/Height happened to read 0 once at
  // construction. ResizeObserver fires immediately with the current size, then on every change.
  function resize() {
    if (container.clientWidth === 0 || container.clientHeight === 0) return
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
    composer.setSize(container.clientWidth, container.clientHeight) // composer has its own render
    // targets, sized independently of the renderer — resizing one without the other leaves the
    // bloom pass working off a stale (usually 1x1, from construction) buffer size.
  }
  new ResizeObserver(resize).observe(container)

  // Shared by every flicker below: sets a glass pair's opacity/emissiveIntensity to `opacityMul`/
  // `emissiveMul` of its own tuned base values (never absolute numbers), keeping the front pass's
  // opacity properly scaled by GLASS.frontOpacityRatio the same way makeGlassPair itself does.
  function applyGlowMultiplier(glassPair, baseOpacity, baseEmissive, opacityMul, emissiveMul) {
    glassPair.back.opacity = baseOpacity * opacityMul
    glassPair.back.emissiveIntensity = baseEmissive * emissiveMul
    glassPair.front.opacity = baseOpacity * GLASS.frontOpacityRatio * opacityMul
    glassPair.front.emissiveIntensity = baseEmissive * emissiveMul
  }

  // Finds whichever step's `t` is the latest one at-or-before `progress` — steps()-style
  // (held until the next keyframe, never interpolated between them), matching how the caret's
  // blink and mossBox.js's own spawn-flicker work elsewhere in this project.
  function stepAt(steps, progress) {
    let step = steps[0]
    for (const s of steps) {
      if (s.t > progress) break
      step = s
    }
    return step
  }

  // Applies HOVER_REVEAL's jump-cut flicker to hoverUsefulGlass — mutates the shared material in
  // place, same pattern as setGroupMaterial's shared-materials-swapped-by-reference model, safe
  // because only one thing is ever mid-reveal at once (a new hover cancels whatever reveal was
  // already running, see onPointerMove above).
  function applyHoverReveal(progress) {
    const step = stepAt(HOVER_REVEAL.steps, progress)
    applyGlowMultiplier(
      hoverUsefulGlass,
      MATERIALS.hoverUseful.opacity,
      MATERIALS.hoverUseful.emissiveIntensity,
      step.opacity,
      step.emissive,
    )
  }

  // Same idea as applyHoverReveal, for an actual pin landing (PIN_REVEAL) — mutates pinnedGlass.
  function applyPinReveal(progress) {
    const step = stepAt(PIN_REVEAL.steps, progress)
    applyGlowMultiplier(
      pinnedGlass,
      MATERIALS.pinned.opacity,
      MATERIALS.pinned.emissiveIntensity,
      step.opacity,
      step.emissive,
    )
  }

  // A flashcard session's static load (LOAD_REVEAL, theme.js — see its own comment for the full
  // three-phase design). Unlike applyHoverReveal/applyPinReveal (one material, continuously scaled),
  // this walks three DISTINCT material states in order — blueprint → gray → glow — so it does real
  // material/showEdgeGlow SWAPS at each phase boundary, not just a multiplier ramp on one fixed
  // material. `loadRevealPhase` (below) tracks which phase was last actually applied so those swaps
  // only happen on an actual phase change, not every frame — setGroupMaterial is cheap to call
  // repeatedly (see its own comment: cached shells/edge-glow lines, no per-call allocation) but
  // there's still no reason to re-run it 60 times a second for a state that hasn't changed. The glow
  // phase's own flicker DOES need to update every frame within its window, same as PIN_REVEAL/
  // HOVER_REVEAL already do — that part isn't gated the same way.
  function applyLoadReveal(progress) {
    const allGroups = strokeGroup.children[0]?.children ?? []
    let phase
    if (progress < LOAD_REVEAL.blueprintEndT) phase = 'blueprint'
    else if (progress < LOAD_REVEAL.grayEndT) phase = 'gray'
    else phase = 'glow'

    if (phase !== loadRevealPhase) {
      loadRevealPhase = phase
      if (phase === 'blueprint') {
        for (const g of allGroups) setGroupMaterial(g, glassGlass, { showEdgeGlow: true })
      } else if (phase === 'gray') {
        for (const g of allGroups) setGroupMaterial(g, glassGlass)
      } else {
        for (const g of allGroups) setGroupMaterial(g, pinnedGlass)
      }
    }

    if (phase === 'glow') {
      // Rescaled into [grayEndT, 1] — LOAD_REVEAL.glowSteps' own `t` values are fractions of THIS
      // remaining window, not of the whole reveal, same as how HOVER_REVEAL/PIN_REVEAL's `steps`
      // are fractions of their own single, whole duration.
      const glowProgress = (progress - LOAD_REVEAL.grayEndT) / (1 - LOAD_REVEAL.grayEndT)
      const step = stepAt(LOAD_REVEAL.glowSteps, glowProgress)
      applyGlowMultiplier(pinnedGlass, MATERIALS.pinned.opacity, MATERIALS.pinned.emissiveIntensity, step.opacity, step.emissive)
    }
  }

  // Dictionary mode's own "close dictionary" exit — see theme.js's EXIT_REVEAL for the full two-phase
  // design (a `glow-out` flicker, only when `hadPin` is true, then a plain `fade` to nothing). `hadPin`
  // is passed in rather than read from `pinnedGroup` here, same reasoning exitRevealHadPin's own
  // declaration comment gives — this function just applies whatever was already decided once, at t=0.
  function applyExitReveal(progress, hadPin) {
    const allGroups = strokeGroup.children[0]?.children ?? []
    const glowEndT = hadPin ? EXIT_REVEAL.glowEndT : 0
    const phase = progress < glowEndT ? 'glow-out' : 'fade'

    if (phase !== exitRevealPhase) {
      exitRevealPhase = phase
      // 'glow-out' needs no material swap on entry — everything's already sitting exactly as it was
      // the instant this starts (pinnedGlass on the pinned part, glassGlass on its sibling, edge-glow
      // and all). Only the transition INTO 'fade' is a real swap: every group, whatever it was
      // showing a moment ago (pinned white, its grey sibling, or plain normalMaterial if nothing was
      // ever pinned), lands on the same neutral glassGlass — no edge-glow outline, that's spent its
      // moment during 'glow-out' (or was never shown at all for a plain load) and isn't brought back
      // for one last flourish here; the fill fading to nothing already reads as "dissolving" on its
      // own.
      if (phase === 'fade') {
        for (const g of allGroups) setGroupMaterial(g, glassGlass)
      }
    }

    if (phase === 'glow-out') {
      // Rescaled into [0, glowEndT] — see EXIT_REVEAL.glowSteps' own comment for why this is already
      // "reversed" simply by running first and landing near 0, not by walking anything backwards.
      const step = stepAt(EXIT_REVEAL.glowSteps, progress / glowEndT)
      applyGlowMultiplier(pinnedGlass, MATERIALS.pinned.opacity, MATERIALS.pinned.emissiveIntensity, step.opacity, step.emissive)
    } else {
      // Plain linear fade, deliberately NOT another jump-cut flicker — the flicker personality is
      // what 'glow-out' already spent; this is the actual disappearance, and reads as a clean
      // dissolve rather than one long flicker with no real ending. MATERIALS.glass has zero
      // emissiveIntensity to begin with (a plain grey ghost, never glowing), so only opacity is doing
      // any real work here — the emissive multiplier is passed for symmetry with applyGlowMultiplier's
      // own signature, not because it changes anything visible.
      const fadeProgress = (progress - glowEndT) / (1 - glowEndT)
      const opacityMul = 1 - fadeProgress
      applyGlowMultiplier(glassGlass, MATERIALS.glass.opacity, MATERIALS.glass.emissiveIntensity, opacityMul, opacityMul)
    }
  }

  // The ongoing "fluorescent tube" hum once PIN_REVEAL has settled — see PIN_FLICKER's own comment
  // in theme.js. Re-rolls a small random multiplier once the currently-held one expires, otherwise
  // leaves it exactly as-is (the held value, not a fresh one every frame, is what keeps this from
  // reading as random noise/shimmer instead of a flicker).
  function applyPinFlicker(now) {
    if (now >= pinFlickerNextAt) {
      pinFlickerMultiplier = {
        opacity: 1 + (Math.random() - 0.5) * PIN_FLICKER.opacityJitter,
        emissive: 1 + (Math.random() - 0.5) * PIN_FLICKER.emissiveJitter,
      }
      pinFlickerNextAt = now + PIN_FLICKER.minIntervalMs + Math.random() * (PIN_FLICKER.maxIntervalMs - PIN_FLICKER.minIntervalMs)
    }
    applyGlowMultiplier(
      pinnedGlass,
      MATERIALS.pinned.opacity,
      MATERIALS.pinned.emissiveIntensity,
      pinFlickerMultiplier.opacity,
      pinFlickerMultiplier.emissive,
    )
  }

  function tick() {
    requestAnimationFrame(tick)

    if (hoverRevealStart !== null) {
      const elapsed = performance.now() - hoverRevealStart
      const progress = elapsed >= HOVER_REVEAL.durationMs ? 1 : elapsed / HOVER_REVEAL.durationMs
      applyHoverReveal(progress)
      if (progress >= 1) hoverRevealStart = null // done — hoverUsefulGlass is left at exactly the
      // real material values (the final step is always {opacity:1, emissive:1}), so no separate
      // "restore" step is needed once this clears.
    }

    if (pinRevealStart !== null) {
      const elapsed = performance.now() - pinRevealStart
      const progress = elapsed >= PIN_REVEAL.durationMs ? 1 : elapsed / PIN_REVEAL.durationMs
      applyPinReveal(progress)
      if (progress >= 1) pinRevealStart = null // falls through to the ongoing hum below on the
      // very next frame — no gap between "generating in" finishing and the idle flicker starting.
    } else if (pinnedGroup && exitRevealStart === null) {
      // Guarded on exitRevealStart too — once the exit sequence's own 'glow-out' phase starts driving
      // pinnedGlass toward 0 (applyExitReveal, below), this ambient hum would otherwise keep mutating
      // the SAME shared material every frame right alongside it, fighting over the same opacity/
      // emissive values. pinnedGroup itself is deliberately left untouched through the whole exit
      // (see exitLoadedKanji's own comment) — this guard is what actually hands control over, not a
      // state change to pinnedGroup.
      applyPinFlicker(performance.now())
    }

    if (loadRevealStart !== null) {
      const elapsed = performance.now() - loadRevealStart
      const progress = elapsed >= LOAD_REVEAL.durationMs ? 1 : elapsed / LOAD_REVEAL.durationMs
      applyLoadReveal(progress)
      if (progress >= 1) {
        loadRevealStart = null
        loadRevealPhase = null
        // The actual settle — same swap the swoop path's own completion already does (setKanjiGroup's
        // comment on the `animateEntrance: true` branch), just triggered by this flicker finishing
        // instead of the scale/rotation swoop finishing.
        const allGroups = strokeGroup.children[0]?.children ?? []
        for (const g of allGroups) setGroupMaterial(g, normalMaterial)
      }
    }

    if (exitRevealStart !== null) {
      const elapsed = performance.now() - exitRevealStart
      const progress = elapsed >= EXIT_REVEAL.durationMs ? 1 : elapsed / EXIT_REVEAL.durationMs
      applyExitReveal(progress, exitRevealHadPin)
      if (progress >= 1) {
        exitRevealStart = null
        exitRevealPhase = null
        const resolve = exitRevealResolve
        exitRevealResolve = null
        resolve?.() // main.js's #back-to-home-btn handler is awaiting this — see exitLoadedKanji
      }
    }

    // EXPERIMENTAL (detach-zoom) — animates ONLY detachGroup's own local position/scale; never
    // touches strokeGroup.rotation or spinState, so whatever the character is already doing
    // (auto-spin, drag-return) keeps running exactly as normal the whole time this plays — the
    // explicit ask. Since detachGroup nests inside strokeGroup like every other part, it still
    // rotates/pinch-scales along with the rest of the character for free; this only ever adds an
    // EXTRA local transform on top of that.
    if (detachGroup) {
      const t = Math.min(1, (performance.now() - detachAnimStart) / DETACH_ZOOM.durationMs)
      const eased = linear(t) // constant speed, no weighted glide — same request as LOAD_SWOOP
      // below, applies to BOTH directions since this one block drives growing in and easing back
      // down alike (startDetachZoom's own toScale is the only thing that differs between them)
      const scale = detachFromScale + (detachToScale - detachFromScale) * eased
      const pivot = getOrComputeDetachPivot(detachGroup)
      detachGroup.scale.setScalar(scale)
      // Scale around the group's OWN local bounding-box center, not the kanji's shared origin —
      // see theme.js's DETACH_ZOOM comment and getOrComputeDetachPivot's own comment for why: this
      // is the standard scale-around-an-arbitrary-pivot algebra (position = basePosition +
      // baseCenter * (1 - scale)), what actually makes it read as "growing in place" instead of
      // drifting sideways as it scales.
      detachGroup.position.set(
        pivot.basePosition.x + pivot.baseCenter.x * (1 - scale),
        pivot.basePosition.y + pivot.baseCenter.y * (1 - scale),
        pivot.basePosition.z + pivot.baseCenter.z * (1 - scale),
      )
      if (t >= 1) {
        if (detachToScale === 1) {
          // Fully shrunk back — pin the EXACT final values (no floating-point residue from the
          // ease's own approach), same "pin, don't just let the ease approach it" discipline
          // LOAD_SWOOP's own finish already uses, and nothing left to track.
          const finishedGroup = detachGroup
          finishedGroup.scale.setScalar(1)
          finishedGroup.position.copy(pivot.basePosition)
          detachGroup = null
          // EXPERIMENTAL (detach-zoom) — a queued SWAP's reverse just genuinely finished (back at
          // normal size, materials still untouched from before) — NOW is the moment the actual
          // pin/material swap happens, never before. A plain unpin never sets pendingSwap, so this
          // is a no-op for that case.
          if (pendingSwap && pendingSwap.newPinnedGroup === finishedGroup) {
            const swap = pendingSwap
            pendingSwap = null
            applyPinVisuals(swap.newPinnedGroup, swap.allGroups)
          }
          // exitLoadedKanji's own "wait for the size revert, THEN fade" sequencing (below) — a no-op
          // for every other caller of startDetachZoom (pinGroup's swap branch, unpin), which never
          // set this.
          if (detachZoomBackResolve) {
            const cb = detachZoomBackResolve
            detachZoomBackResolve = null
            cb()
          }
        }
        // else: fully grown — just holds at target size; startDetachZoom (pointerup handler) is
        // what moves it again, on either an unpin (shrink back) or a swap (queued via pendingSwap).
      }
    }

    if (spinState === 'returning') {
      strokeGroup.rotation.x += (0 - strokeGroup.rotation.x) * MOTION.returnEase
      strokeGroup.rotation.y += (0 - strokeGroup.rotation.y) * MOTION.returnEase
      if (Math.abs(strokeGroup.rotation.x) < 0.001 && Math.abs(strokeGroup.rotation.y) < 0.001) {
        strokeGroup.rotation.set(0, 0, 0)
        // restingSpinState, not a hardcoded 'autoSpinning' — a flashcard session's still-unrevealed
        // card (restingSpinState === 'idle') settles back to genuinely still after a manual drag,
        // not back into drifting on its own; see restingSpinState's own comment above setKanjiGroup.
        spinState = restingSpinState
      }
    } else if (spinState === 'autoSpinning' && !swoopingIn) {
      // Suppressed for the duration of the load-in swoop below — that block drives rotation.y
      // explicitly (side -> front, in lockstep with the scale shrink) instead of this ordinary
      // slow drift, so the two motions don't fight each other mid-swoop.
      strokeGroup.rotation.y += MOTION.autoSpinSpeed
      // Never actually swing past edge-on (±90°) into the mirrored back half — snap by exactly
      // 180° the instant it crosses +90°. At that exact instant the character is edge-on (just a
      // line, extruded strokes have no readable face from directly the side), so +90° and -90°
      // are visually identical and the jump is imperceptible. What you see afterward is the same
      // forward spin, continuing to look "correct" instead of showing the reversed/mirrored back.
      if (strokeGroup.rotation.y > Math.PI / 2) strokeGroup.rotation.y -= Math.PI
    }

    // The load-in swoop takes priority over the idle-revert below — it needs to start closing the
    // very first frame after a fresh character loads, not wait for PINCH.idleMs like the ordinary
    // "pinched, then left alone" case does. Scale and rotation are both driven off the SAME timed
    // progress value (`t`) run through the same `linear` curve, not two independent per-tick eases
    // — that's what guarantees they visually finish at exactly the same instant no matter how far
    // each one started from its target, instead of whichever started closer (rotation, only 90°)
    // visually settling well before the other (scale, from 6x down to 1x) the way two separate
    // exponential eases naturally would. Auto-spin picks back up from exactly 0 the frame after
    // swoopingIn clears. `linear`, not an easeOut curve — a "weighted" glide (fast-then-settling)
    // was the explicit complaint; this is constant speed, start to finish.
    if (swoopingIn) {
      const t = Math.min(1, (performance.now() - swoopStart) / LOAD_SWOOP.durationMs)
      const eased = linear(t)
      pinchScale = PINCH.max + (1 - PINCH.max) * eased
      strokeGroup.rotation.y = LOAD_SWOOP.startAngle + (0 - LOAD_SWOOP.startAngle) * eased
      if (t >= 1) {
        pinchScale = 1
        strokeGroup.rotation.y = 0
        swoopingIn = false
        // The instant scale/rotation settle, drop whatever it was wearing mid-swoop straight to
        // solid opaque normalMaterial — no flicker, no delay, the explicit ask. (A LOAD_REVEAL
        // flicker — reusing pinnedGlass, the same bright-white "confirmed" glass a real pin uses —
        // was tried here first; cut by request in favor of going white the instant the swoop hits
        // normal size.) See playStrokeGeneration's own reveal step, above, for what it's actually
        // wearing right before this — "blueprint mode" (glassGlass + edge-glow outline) for the
        // tail of the swoop, not plain grey — this is just the hand-off away from that into white.
        const allGroups = strokeGroup.children[0]?.children ?? []
        for (const g of allGroups) setGroupMaterial(g, normalMaterial)
      }
    } else if (pinchScale !== 1 && performance.now() - lastPinchActivity > PINCH.idleMs) {
      // No pinch activity for PINCH.idleMs → ease pinchScale back to 1 (its neutral/no-op value),
      // same eased-return pattern as the rotation snap-back above, just on a different property and
      // gated on elapsed real time instead of a state-machine flag. Runs every frame regardless of
      // whether it's actually mid-return — cheap (a comparison + maybe one lerp step), and simpler
      // than adding a third state machine alongside spinState.
      pinchScale += (1 - pinchScale) * PINCH.returnEase
      if (Math.abs(pinchScale - 1) < 0.001) pinchScale = 1
    }
    strokeGroup.scale.setScalar(pinchScale)

    composer.render() // was renderer.render(scene, camera) — composer owns the whole
    // render+bloom+output chain now, see its construction above
  }
  tick()

  // Wakes the CURRENTLY mounted group up into ordinary auto-spin without reloading it — for a
  // flashcard session's "didn't get it" (main.js): the same mesh that was sitting still starts
  // drifting, not a fresh swoop-in of a new one. Sets restingSpinState too, not just spinState
  // directly, so a manual drag afterward returns to spinning rather than back to still — see
  // restingSpinState's own comment above setKanjiGroup.
  function startAutoSpin() {
    restingSpinState = 'autoSpinning'
    spinState = 'autoSpinning'
  }

  // Toggles hover/click-to-pin for the CURRENTLY mounted group without reloading it — the mid-
  // session counterpart to setKanjiGroup's own `interactive` option (see that option's comment).
  // For a flashcard session (main.js): a fresh card always loads with interactive:false (no hints
  // during the actual recall test); a category-2 miss calls setInteractive(true) on the SAME mesh
  // once the lesson box opens, so it responds to hover/click exactly like dictionary mode from that
  // point on — explicit request: exploring a real split IS useful once you're already being taught
  // it, just not before you've attempted to recall it.
  function setInteractive(interactive) {
    groupIsInteractive = interactive
  }

  return {
    scene,
    camera,
    renderer,
    strokeGroup,
    setKanjiGroup,
    clearKanjiGroup,
    startAutoSpin,
    setInteractive,
    pinNodeId,
    unpin,
    exitLoadedKanji,
    normalMaterial,
    // A plain read of theme.js's own LOAD_SWOOP.durationMs — not new logic, just exposed through
    // mountScene's own return instead of main.js importing theme.js directly (that file's own
    // values are meant to flow through scene.js's API, not be reached around it — see "UI work vs
    // functionality" in apps/web/CLAUDE.md). Dictionary mode's own loadCharWithLoading (main.js)
    // uses this to time its loading indicator against the swoop's REAL duration, not a guessed one.
    swoopDurationMs: LOAD_SWOOP.durationMs,
  }
}
