// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── Fine-detail moss — moss2.js ───────────────────────────────────────────────
// Real moss anatomy: upright stems (gametophytes) with tiny spirally-arranged
// narrow leaves along the axis. Each "colony" template = 5 individual stems
// at varying heights & offsets, packed into a small area. No texture needed —
// leaf alpha is computed analytically in the fragment shader.
//
// Scale: 7–18 mm (visible when zoomed, reads as velvet from normal distance)
// Count: 24 000 colonies × 5 stems × 8 leaves = 960 000 leaf quads in one draw call.

import * as THREE from 'three';
import { TERRAIN_RADIUS, seededRandom } from './utils.js';
import { sampleHeight } from './terrain.js';

// ── Geometry constants ────────────────────────────────────────────────────────

const COLONY_COUNT   = 140000;
const STEMS          = 6;       // stems per colony template
const NODES          = 9;       // leaves per stem
const LEAF_HW        = 0.11;    // normalised half-width
const LEAF_LEN       = 0.28;    // normalised leaf length
const STEM_TILT      = 0.38;    // outward lean of each leaf from stem (rad)
const MIN_SCALE      = 0.022;   // 22 mm
const MAX_SCALE      = 0.055;   // 55 mm

// ── Build colony template geometry ───────────────────────────────────────────
// All coordinates are in normalised [0–1] space; a_scale stretches to real units.

function buildColony() {
  const tRng = seededRandom(777);   // fixed seed → same template every run

  const verts = [], uvs = [], norms = [], indices = [];
  let vIdx = 0;

  for (let s = 0; s < STEMS; s++) {
    // Random offset of this stem within the colony (normalised colony radius ≈ 0.30)
    const sAngle  = (s / STEMS) * Math.PI * 2 + tRng() * 0.6;
    const sRadius = tRng() * 0.28;
    const ox      = Math.cos(sAngle) * sRadius;
    const oz      = Math.sin(sAngle) * sRadius;

    // Random height & twist for this stem
    const hScale = 0.65 + tRng() * 0.70;   // stem height relative to template
    const twist  = tRng() * Math.PI * 2;   // starting angle of leaf spiral

    for (let n = 0; n < NODES; n++) {
      // Height fraction along stem: leave bottom 12% bare (rhizoid zone)
      const t    = 0.12 + (n / (NODES - 1)) * 0.82;
      const ht   = t * hScale;              // actual normalised height

      // Spiral angle: each leaf offset by golden angle (137.5°) for real botany
      const leafAngle = twist + n * 2.3998; // 2.3998 rad ≈ 137.5°

      // Leaf size envelope: larger in middle, tiny at base and tip
      const envelope = Math.pow(Math.sin(t * Math.PI), 0.7);
      const hw  = LEAF_HW  * envelope;
      const ll  = LEAF_LEN * envelope;

      // Leaf direction (outward from stem in XZ plane)
      const lx = Math.cos(leafAngle);
      const lz = Math.sin(leafAngle);
      // Perpendicular to leaf direction (for width)
      const px = -lz, pz = lx;

      // Leaf geometry: 4 vertices → diamond/ovate shape
      // v0 = stem attachment (narrow base)
      // v1 = left-wide (mid)
      // v2 = tip
      // v3 = right-wide (mid)
      const tipDist  = ll;
      const tipX = ox + lx * tipDist * Math.sin(STEM_TILT);
      const tipY = ht + tipDist * Math.cos(STEM_TILT);
      const tipZ = oz + lz * tipDist * Math.sin(STEM_TILT);
      const midDist  = ll * 0.52;
      const midX = ox + lx * midDist * Math.sin(STEM_TILT);
      const midY = ht + midDist * Math.cos(STEM_TILT);
      const midZ = oz + lz * midDist * Math.sin(STEM_TILT);

      // Vertex data
      verts.push(ox, ht, oz);
      uvs.push(0.5, 0.0);
      norms.push(lx, 0.4, lz);

      verts.push(midX + px * hw, midY, midZ + pz * hw);
      uvs.push(0.0, 0.5);
      norms.push(lx, 0.4, lz);

      verts.push(tipX, tipY, tipZ);
      uvs.push(0.5, 1.0);
      norms.push(lx, 0.4, lz);

      verts.push(midX - px * hw, midY, midZ - pz * hw);
      uvs.push(1.0, 0.5);
      norms.push(lx, 0.4, lz);

      // Two triangles per leaf (fan from v0)
      indices.push(vIdx, vIdx + 1, vIdx + 2);
      indices.push(vIdx, vIdx + 2, vIdx + 3);
      vIdx += 4;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,   2));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(norms, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ── Shaders ───────────────────────────────────────────────────────────────────

const vert = /* glsl */`
attribute vec3  a_offset;
attribute float a_rotation;
attribute float a_scale;
attribute vec3  a_color;

uniform float u_time;
uniform float u_wind;

varying vec2  vUv;
varying vec3  vColor;
varying vec3  vWorldNorm;
varying float vHeight;

void main(){
  vUv    = uv;
  vColor = a_color;
  vHeight = uv.y;

  vec3 pos = position * a_scale;

  // Barely perceptible tremor — moss doesn't really move
  float phase = dot(a_offset.xz, vec2(0.5, 0.7)) + u_time * 0.6;
  float sway  = sin(phase) * u_wind * uv.y * uv.y * 0.18;
  pos.x += sway;
  pos.z += sway * 0.3;

  // Rotate colony around world Y
  float c = cos(a_rotation), s = sin(a_rotation);
  pos.xz = vec2(pos.x * c - pos.z * s,
                pos.x * s + pos.z * c);

  pos += a_offset;

  vWorldNorm = normalize(normalMatrix * normal);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const frag = /* glsl */`
uniform vec3  u_lightDir;
uniform vec3  u_lightColor;
uniform float u_lightInt;

varying vec2  vUv;
varying vec3  vColor;
varying vec3  vWorldNorm;
varying float vHeight;

// Narrow ovate leaf alpha — computed analytically, no texture needed
float leafAlpha(vec2 uv) {
  float cx = uv.x - 0.5;        // -0.5 … 0.5 across leaf width
  float cy = uv.y;               // 0 = base, 1 = tip

  // Width profile: narrow at base (0), peaks at 30% up, tapers to pointed tip
  float profile = pow(sin(cy * 3.14159), 0.60) * 0.48;
  if(profile < 0.001) return 0.0;

  float dist = abs(cx) / profile; // 0 = centreline, 1 = edge
  return pow(clamp(1.0 - dist, 0.0, 1.0), 0.65);
}

void main(){
  float a = leafAlpha(vUv);
  if(a < 0.28) discard;

  float hf = vUv.y;   // 0=base 1=tip

  // ── Colour gradient ──────────────────────────────────────────────────────
  // Very dark rhizoid base → rich forest green mid → slightly fresh tip
  vec3 rootCol = vColor * vec3(0.06, 0.12, 0.04);
  vec3 midCol  = vColor * vec3(0.70, 0.95, 0.52);
  vec3 tipCol  = vColor * vec3(0.88, 1.05, 0.60) + vec3(0.006, 0.018, 0.003);

  vec3 col = hf < 0.45
           ? mix(rootCol, midCol, hf / 0.45)
           : mix(midCol,  tipCol, (hf - 0.45) / 0.55);

  // ── Ambient occlusion at base ────────────────────────────────────────────
  col *= 0.15 + 0.85 * smoothstep(0.0, 0.35, hf);

  // ── Midrib — very faint lighter central stripe ───────────────────────────
  float midrib = max(0.0, 1.0 - abs(vUv.x - 0.5) * 14.0);
  col += midCol * 0.08 * midrib * hf;

  // ── Diffuse lighting ─────────────────────────────────────────────────────
  vec3  N     = normalize(vWorldNorm);
  float NdotL = dot(N, -normalize(u_lightDir));
  col *= (0.38 + max(0.0, NdotL) * 0.72) * u_lightColor * u_lightInt;

  // ── Subsurface scatter — leaf glows cool green when backlit ──────────────
  float backlit = max(0.0, -NdotL);
  col += vColor * vec3(0.18, 0.55, 0.15) * pow(backlit, 2.8) * 0.65;

  // ── Soft edge from alpha ─────────────────────────────────────────────────
  float edge = smoothstep(0.28, 0.62, a);

  gl_FragColor = vec4(col, edge);
}
`;

// ── Build & scatter instances ─────────────────────────────────────────────────

export function createFineMoss(scene) {
  const template = buildColony();

  const geo = new THREE.InstancedBufferGeometry();
  geo.instanceCount = COLONY_COUNT;
  geo.index         = template.index;
  geo.setAttribute('position', template.getAttribute('position'));
  geo.setAttribute('uv',       template.getAttribute('uv'));
  geo.setAttribute('normal',   template.getAttribute('normal'));

  const offsets   = new Float32Array(COLONY_COUNT * 3);
  const rotations = new Float32Array(COLONY_COUNT);
  const scales    = new Float32Array(COLONY_COUNT);
  const colors    = new Float32Array(COLONY_COUNT * 3);

  const rng = seededRandom(333);

  // Rich forest greens — visible at distance, natural up close
  const palette = [
    [0.14, 0.40, 0.10],   // classic forest moss
    [0.10, 0.30, 0.08],   // darker shadow moss
    [0.18, 0.48, 0.12],   // medium moss
    [0.12, 0.36, 0.12],   // blue-green moss
    [0.16, 0.42, 0.09],   // olive moss
    [0.09, 0.28, 0.08],   // deep shade
    [0.20, 0.50, 0.13],   // brighter patch
    [0.13, 0.38, 0.09],   // neutral green
  ];

  // Clump centres — fine moss forms dense colonies
  const CLUMPS  = 60;
  const clumpXZ = [];
  for (let c = 0; c < CLUMPS; c++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * TERRAIN_RADIUS * 0.97;
    clumpXZ.push(Math.cos(a) * r, Math.sin(a) * r);
  }

  let placed = 0, tries = 0;
  while (placed < COLONY_COUNT && tries < COLONY_COUNT * 6) {
    tries++;

    let x, z;
    if (rng() < 0.50) {
      // Half clumped, half scattered — ensures full edge coverage
      const ci    = Math.floor(rng() * CLUMPS) * 2;
      const angle = rng() * Math.PI * 2;
      const r     = Math.pow(rng(), 1.2) * 0.32;
      x = clumpXZ[ci]     + Math.cos(angle) * r;
      z = clumpXZ[ci + 1] + Math.sin(angle) * r;
    } else {
      const angle = rng() * Math.PI * 2;
      const r     = Math.sqrt(rng()) * TERRAIN_RADIUS * 0.92;
      x = Math.cos(angle) * r;
      z = Math.sin(angle) * r;
    }

    const distC = Math.sqrt(x * x + z * z);
    if (distC > TERRAIN_RADIUS * 0.985) continue;

    const y = sampleHeight(x, z);
    if (y === null) continue;

    const i3 = placed * 3;
    offsets[i3] = x; offsets[i3 + 1] = y; offsets[i3 + 2] = z;
    rotations[placed] = rng() * Math.PI * 2;

    // Slightly taller colonies near disc centre (more moisture / shade)
    const centreFactor = 1.0 - (distC / TERRAIN_RADIUS) * 0.28;
    scales[placed] = (MIN_SCALE + rng() * (MAX_SCALE - MIN_SCALE)) * centreFactor;

    const p  = palette[Math.floor(rng() * palette.length)];
    const j  = (rng() - 0.5) * 0.03;
    colors[i3]     = Math.max(0, p[0] + j);
    colors[i3 + 1] = Math.max(0, p[1] + j * 0.6);
    colors[i3 + 2] = Math.max(0, p[2] + j);

    placed++;
  }

  geo.setAttribute('a_offset',   new THREE.InstancedBufferAttribute(offsets,   3));
  geo.setAttribute('a_rotation', new THREE.InstancedBufferAttribute(rotations, 1));
  geo.setAttribute('a_scale',    new THREE.InstancedBufferAttribute(scales,    1));
  geo.setAttribute('a_color',    new THREE.InstancedBufferAttribute(colors,    3));

  const mat = new THREE.ShaderMaterial({
    vertexShader:   vert,
    fragmentShader: frag,
    uniforms: {
      u_time:      { value: 0 },
      u_wind:      { value: 0.008 },
      u_lightDir:  { value: new THREE.Vector3(1.5, 4.5, 2.5).normalize() },
      u_lightColor:{ value: new THREE.Vector3(1.0, 0.96, 0.88) },
      u_lightInt:  { value: 1.35 },
    },
    side:        THREE.DoubleSide,
    transparent: true,
    depthWrite:  true,
    alphaTest:   0.0,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return { mesh, mat };
}

export function updateFineMoss(obj, time) {
  obj.mat.uniforms.u_time.value = time;
}
