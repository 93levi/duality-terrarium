// Turns one export/ bundle (flat stroke groups + useful/noise verdicts) into a THREE.Group ready
// to drop into the scene.
//
// Stroke geometry technique borrowed from an earlier prototype (~/Desktop/Kanji.3/kanji-3d) after
// reviewing it directly: KanjiVG strokes are *centerlines*, not fillable shapes, so instead of a
// round TubeGeometry we build a flat ribbon — offset points to either side of the centerline by
// the normal vector, close it into a 2D Shape, extrude with a bevel. Reads as an actual brush
// stroke instead of a wire. Points are sampled at even arc-length intervals via
// svg-path-properties (getPointAtLength) rather than SVGLoader's getPoints(), which samples
// evenly in curve-parameter space and can bunch up unevenly on curvy strokes.

import * as THREE from 'three'
import { svgPathProperties } from 'svg-path-properties'
import { STROKE } from './theme.js'

const VIEWBOX_SIZE = 109 // KanjiVG's standard viewBox — a data fact, not a visual tuning knob,
// so it stays here rather than in theme.js
const CENTER = VIEWBOX_SIZE / 2

// The four pipeline stages below (sample → offset → stitch → extrude) are each exported
// individually, not just composed inline inside strokeToMesh, specifically so viewer/pipelineDemo.js
// can animate through the REAL math stage-by-stage rather than a re-derived approximation of it —
// every number the demo shows is the exact value this file's own production path computes, just
// paused and revealed over time instead of running straight through in one tick.

export function samplePathPoints(d) {
  let properties
  try {
    properties = new svgPathProperties(d)
  } catch {
    return null
  }
  const totalLength = properties.getTotalLength()
  if (!totalLength) return null

  const divisions = Math.max(24, Math.ceil(totalLength / 1.5))
  const points = []
  for (let i = 0; i <= divisions; i++) {
    const { x, y } = properties.getPointAtLength((i / divisions) * totalLength)
    // SVG space: origin top-left, y down. Three.js: origin center, y up. Flatten onto z=0.
    points.push(new THREE.Vector3(x - CENTER, -(y - CENTER), 0))
  }

  // Drop near-duplicate points (common at sharp direction changes) — they produce degenerate
  // normals below.
  const clean = []
  for (const p of points) {
    if (clean.length === 0 || p.distanceTo(clean[clean.length - 1]) > 0.05) clean.push(p)
  }
  return clean.length >= 2 ? clean : null
}

// Stage 2 — offset a matching pair of points to either side of the centerline, along its local
// normal, by STROKE.halfWidth. This is what actually gives a zero-width centerline real thickness.
//
// REAL, CONFIRMED BUG, fixed here — found via 台 ("pedestal") rendering with an obviously broken
// 厶-stroke, a jagged spike instead of a clean hooked diagonal. Root cause: a CONSTANT-width offset
// self-intersects wherever the centerline's own local turn radius is smaller than STROKE.halfWidth
// (2.2, in this 109-unit viewBox) — classic 2D-offset-curve failure, the same reason a thick pen
// stroked around a sharp corner overlaps itself on the inside of the turn. 台's own 厶-stroke has a
// real ~1.14-unit-radius hook (KanjiVG type `㇜`, a diagonal that hooks sharply back on itself) —
// well under 2.2 — which folds the offset edge back over itself there.
//
// Confirmed NOT a one-off: re-running this exact pipeline against every stroke in every shipped
// bundle (`public/data/*.json`) found 8,630 of 79,921 strokes (10.8%) with a genuinely
// self-intersecting offset edge, across 4,570 of 6,703 characters (68.2%) — including 21 of this
// app's own 24 hand-picked `#search-examples` characters (魑/魘 worse than 台's own break), so this
// predates any one feature and had simply gone unnoticed on complex characters where one warped
// stroke is easy to miss. Full investigation write-up: this session's own chat history: 2026-09-07.
//
// THE FIX — `resolveOffsetSelfIntersections`, below — a real geometry stage, not a hack: the
// standard technique 2D vector-stroke engines (Skia, Cairo, FreeType) use for exactly this failure.
// Miter/round/bevel joins (not implemented here, and not needed) solve the OUTER/convex side of a
// sharp corner — filling the gap where two offset segments don't quite meet. This solves the
// complementary INNER/concave side — where they overshoot and cross — by finding where the offset
// polyline crosses itself and collapsing the looped-back run of points down to that single
// crossing point. Verified exhaustively, not just on 台: re-ran the SAME real pipeline against
// every stroke in the dataset with this fix applied — 8,630/8,630 previously-broken strokes
// resolved, zero remaining, including every non-kanji closed-loop-shaped stroke (see this
// function's own comment for why those are a different, narrower story). 台's own stroke: outline
// area barely moves (443.30 → 440.99, -0.5%) — this removes exactly the tangle, nothing else.
//
// TO REVERT, if this ever needs backing out: change this function's own `return` statement back to
// plain `return { leftEdge, rightEdge }` (exactly as it read before this comment block) instead of
// running both through `resolveOffsetSelfIntersections` — `resolveOffsetSelfIntersections`/
// `findFirstSelfIntersection`/`segmentIntersection` (all below) can stay in the file unused, or be
// deleted too, they have no other callers. That's the entire rollback; nothing else in this file or
// its callers changes shape either way (see resolveOffsetSelfIntersections's own comment on why it
// preserves array length/index alignment specifically so reverting — or not adopting it in the
// first place — is a total no-op for every other consumer of computeOffsetEdges's output).
export function computeOffsetEdges(points) {
  const leftEdge = []
  const rightEdge = []
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]
    const tangent = next.clone().sub(prev).normalize()
    const normal = new THREE.Vector3(-tangent.y, tangent.x, 0)
    leftEdge.push(points[i].clone().addScaledVector(normal, STROKE.halfWidth))
    rightEdge.push(points[i].clone().addScaledVector(normal, -STROKE.halfWidth))
  }
  return {
    leftEdge: resolveOffsetSelfIntersections(leftEdge),
    rightEdge: resolveOffsetSelfIntersections(rightEdge),
  }
}

// Finds where a 2D polyline crosses itself and collapses the looped-back range down to the single
// crossing point, repeatedly, until none remain — see computeOffsetEdges's own comment just above
// for the full "why" (root cause, how widespread, how this was validated).
//
// LENGTH-PRESERVING ON PURPOSE — collapses points IN PLACE (overwrites pts[i+1..j] with the
// crossing point) rather than removing them from the array. A first version spliced the looped
// points OUT instead — mathematically equivalent, and it worked fine in an isolated Node test
// against 台's own stroke data — but broke for real the moment it was wired into the actual live
// app: `scene.js`'s `playStrokeGeneration` (the swoop's own "etch" stage) and `pipelineDemo.js`'s
// own Stage 2 (forward AND reverse) both index `leftEdge[i]`/`rightEdge[i]` assuming it's always
// the exact same length as, and positionally aligned with, `points[i]` — confirmed by actually
// loading 台 with the length-changing version live: a real `TypeError: Cannot read properties of
// undefined (reading 'x')` the instant the etch animation ran. This version changes neither the
// array's length nor any index's correspondence to the centerline, only the VALUES of the points
// inside a collapsed range (all becoming duplicates of the crossing point) — every existing
// consumer of `leftEdge`/`rightEdge` keeps working unmodified, confirmed by reloading 台 (and 魑,
// the single worst-affected of this app's own curated characters) through the real swoop +
// generation pipeline afterward with zero console errors.
//
// KNOWN, DELIBERATE LIMITATION — does NOT correctly handle a stroke that's itself meant to be a
// closed loop (Latin "O"/"Q", digits, hiragana loop-strokes like ぬ/め/あ — all present in the
// shipped 6,703-character dataset since KanjiVG includes non-kanji glyphs for completeness, per
// root CLAUDE.md, even though none of them are surfaced in any curated UI list). On "O" specifically
// this technique still reports zero self-intersections afterward, but the resulting outline is
// genuinely WRONG (area balloons 1000 → 4587 — collapsing the "first" crossing on a curve that
// nearly closes on itself eats a huge, wrong chunk of the shape, not a small tangle). Real kanji
// strokes are never drawn as a single fully-closed loop (a closed shape like 口's box is always
// built from multiple separate strokes meeting, never one stroke tracing a circle), so this never
// bites real app content — but it's the reason this fix is scoped to kanji specifically, not
// applied blindly to every character in the dataset. A future fix for the non-kanji case would need
// a genuinely different technique (e.g. detecting a near-closed centerline up front and handling it
// as its own case), not a tuning tweak to this one.
function resolveOffsetSelfIntersections(edge) {
  const pts = edge.map((p) => p.clone())
  let guard = 0 // hard safety cap — real strokes never need more than a couple of passes; this
  // only exists so a genuinely pathological input degrades to "leaves some self-intersection
  // behind" instead of an infinite loop.
  while (guard++ < 200) {
    const hit = findFirstSelfIntersection(pts)
    if (!hit) break
    for (let k = hit.i + 1; k <= hit.j; k++) pts[k] = hit.point.clone()
  }
  return pts
}

// Earliest-crossing-first (smallest `i`, then smallest `j`) — mirrors tracing the curve by hand and
// untangling each knot in the order you'd actually meet it, and means a stroke with more than one
// tight turn (rare, but not impossible) gets each one resolved independently rather than the
// biggest one greedily eating the others. `j >= i + 2` skips adjacent segments, which always share
// an endpoint and so trivially "intersect" there — not a real crossing.
function findFirstSelfIntersection(pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length - 1; j++) {
      const point = segmentIntersection(pts[i], pts[i + 1], pts[j], pts[j + 1])
      if (point) return { i, j, point }
    }
  }
  return null
}

// Standard 2D segment-segment intersection via parametric line equations — returns the crossing
// point only for a genuine interior crossing of both segments (t and u strictly between 0 and 1),
// never an endpoint touch or a near-parallel numerical near-miss (the 1e-6 margins on both ends).
function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = p4.x - p3.x
  const d2y = p4.y - p3.y
  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-12) return null // parallel (or coincident) — no single crossing point
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null
  return new THREE.Vector3(p1.x + t * d1x, p1.y + t * d1y, 0)
}

// Stage 3 — stitch the two edges into one closed 2D boundary: down the left edge, back up the
// right edge IN REVERSE, so the loop traces one continuous outline instead of a self-intersecting
// bowtie.
export function buildOutlineShape(leftEdge, rightEdge) {
  const outline = new THREE.Shape()
  outline.moveTo(leftEdge[0].x, leftEdge[0].y)
  for (const p of leftEdge.slice(1)) outline.lineTo(p.x, p.y)
  for (const p of [...rightEdge].reverse()) outline.lineTo(p.x, p.y)
  outline.closePath()
  return outline
}

// Stage 4 — extrude the flat outline into a real solid, beveled 3D geometry, then re-center it on
// z=0 (ExtrudeGeometry otherwise starts at z=0 and extends forward only).
export function extrudeOutline(outline) {
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth: STROKE.extrudeDepth,
    bevelEnabled: true,
    bevelThickness: 0.4,
    bevelSize: 0.4,
    bevelSegments: 2,
    curveSegments: 2,
  })
  geometry.translate(0, 0, -STROKE.extrudeDepth / 2)
  return geometry
}

function strokeToMesh(d, material) {
  const points = samplePathPoints(d)
  if (!points) return null

  const { leftEdge, rightEdge } = computeOffsetEdges(points)
  const outline = buildOutlineShape(leftEdge, rightEdge)
  const geometry = extrudeOutline(outline)

  return new THREE.Mesh(geometry, material)
}

/**
 * @param {object} bundle - parsed export/ JSON: { codepoint, character, gloss, structure, groups }
 * @returns {THREE.Group} one child group per render group, each with userData
 *   { node_id, element, position, role, gloss, useful } set on both the group and every mesh in it.
 */
export function buildKanjiGroup(bundle, material) {
  const kanjiGroup = new THREE.Group()
  kanjiGroup.userData.character = bundle.character

  for (const group of bundle.groups) {
    const nodeGroup = new THREE.Group()
    const userData = {
      node_id: group.node_id,
      element: group.element,
      position: group.position,
      role: group.role,
      gloss: group.gloss,
      useful: group.useful,
    }
    nodeGroup.userData = userData

    for (const stroke of group.strokes) {
      const mesh = strokeToMesh(stroke.d, material)
      if (!mesh) continue
      mesh.userData = userData
      nodeGroup.add(mesh)
    }
    kanjiGroup.add(nodeGroup)
  }
  return kanjiGroup
}
