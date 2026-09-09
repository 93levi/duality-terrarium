// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── Ground cover: fittonia patches + creeping vines ───────────────────────────

import * as THREE from 'three';
import { fernVert, fernFrag, fittoniaFrag } from './shaders.js';
import {
  seededRandom, TERRAIN_RADIUS,
  makeLeafAlpha, makeFittoniaLeafTex, randomInAnnulus
} from './utils.js';
import { sampleHeight } from './terrain.js';

// ── Fittonia leaf geometry ────────────────────────────────────────────────────
// Low, flat, spreading oval leaves hugging the ground

function buildFittoniaLeaf(rng, size) {
  const w = size * (0.7 + rng() * 0.5);
  const h = size * (0.5 + rng() * 0.4);
  const tilt = (rng() - 0.5) * 0.3; // slight tilt off horizontal

  // Oval leaf: 8-sided polygon lying flat, with a slight upward curve at edges
  const segs = 10;
  const verts = [], uvs = [], norms = [], idx = [];

  // Centre vertex
  verts.push(0, 0.008, 0);
  uvs.push(0.5, 0.5);
  norms.push(0, 1, 0);

  for (let s = 0; s <= segs; s++) {
    const a  = (s / segs) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const vx = ca * w;
    const vz = sa * h;
    // Slight upward bowl at edges
    const vy = tilt * (1 - Math.abs(ca)) + 0.002;
    verts.push(vx, vy, vz);
    uvs.push(0.5 + ca * 0.5, 0.5 + sa * 0.5);
    norms.push(0, 1, 0);

    if (s > 0) idx.push(0, s, s + 1 > segs ? 1 : s + 1);
  }

  // Close the fan
  idx.push(0, segs + 1, 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,   2));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(norms, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function buildFittoniaPatch(rng, leafCount, patchRadius) {
  const allV = [], allU = [], allN = [], allI = [];
  let offset = 0;

  for (let l = 0; l < leafCount; l++) {
    const angle = rng() * Math.PI * 2;
    const r     = Math.sqrt(rng()) * patchRadius;
    const lx    = Math.cos(angle) * r;
    const lz    = Math.sin(angle) * r;
    const size  = 0.028 + rng() * 0.022;

    const geo = buildFittoniaLeaf(rng, size);
    const pos = geo.getAttribute('position');
    const uv  = geo.getAttribute('uv');
    const n   = geo.getAttribute('normal');
    const idx = geo.getIndex();

    // Random Y rotation per leaf
    const ry = rng() * Math.PI * 2;
    const c = Math.cos(ry), s = Math.sin(ry);

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      // Rotate around Y
      allV.push(px * c - pz * s + lx, py, px * s + pz * c + lz);
      allU.push(uv.getX(i), uv.getY(i));
      allN.push(0, 1, 0);
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) allI.push(idx.getX(i) + offset);
    }
    offset += pos.count;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(allV, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(allU, 2));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(allN, 3));
  // Add dummy wind offset attribute for vertex shader compatibility
  const windOffsets = new Float32Array(allV.length / 3);
  for (let i = 0; i < windOffsets.length; i++) windOffsets[i] = rng() * Math.PI * 2;
  geo.setAttribute('a_windOffset', new THREE.Float32BufferAttribute(windOffsets, 1));
  geo.setIndex(allI);
  geo.computeVertexNormals();
  return geo;
}

// ── Vine / creeper ────────────────────────────────────────────────────────────

function buildVineGeometry(rng, segments = 30, length = 0.8) {
  const allV = [], allU = [], allN = [], allI = [];
  let offset = 0;
  let cx = 0, cy = 0, cz = 0;
  let dir = rng() * Math.PI * 2;

  for (let s = 0; s < segments; s++) {
    const t = s / segments;
    // Wander the vine path
    dir += (rng() - 0.5) * 0.8;
    const step = (length / segments) * (0.7 + rng() * 0.6);
    const nx = cx + Math.cos(dir) * step;
    const nz = cz + Math.sin(dir) * step;
    const ny = sampleHeight(nx, nz) ?? cy;
    if (Math.sqrt(nx * nx + nz * nz) > TERRAIN_RADIUS * 0.9) break;

    // Small leaf at each node
    const leafSize = 0.015 + rng() * 0.012;
    const leafGeo  = buildFittoniaLeaf(rng, leafSize * 0.7);
    const pos = leafGeo.getAttribute('position');
    const uv  = leafGeo.getAttribute('uv');
    const idx = leafGeo.getIndex();
    const ry  = rng() * Math.PI * 2;
    const c = Math.cos(ry), ss = Math.sin(ry);

    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py2 = pos.getY(i), pz = pos.getZ(i);
      allV.push(px * c - pz * ss + nx, py2 + ny, px * ss + pz * c + nz);
      allU.push(uv.getX(i), uv.getY(i));
      allN.push(0, 1, 0);
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) allI.push(idx.getX(i) + offset);
    }
    offset += pos.count;

    cx = nx; cy = ny; cz = nz;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(allV, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(allU, 2));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(allN, 3));
  const windOffsets = new Float32Array(allV.length / 3);
  for (let i = 0; i < windOffsets.length; i++) windOffsets[i] = rng() * Math.PI * 2;
  geo.setAttribute('a_windOffset', new THREE.Float32BufferAttribute(windOffsets, 1));
  geo.setIndex(allI);
  geo.computeVertexNormals();
  return geo;
}

// ── Export ────────────────────────────────────────────────────────────────────

export function createGroundCover(scene) {
  const rng        = seededRandom(29);
  const leafAlpha  = makeLeafAlpha(64);
  const veinTex    = makeFittoniaLeafTex(128);
  const uniforms   = [];

  // Shared uniforms factory
  const makeUniforms = (baseColor) => ({
    u_leafAlpha:      { value: leafAlpha },
    u_veinTex:        { value: veinTex },
    u_baseColor:      { value: baseColor },
    u_lightDir:       { value: new THREE.Vector3(1.5, 4.5, 2.5).normalize() },
    u_lightColor:     { value: new THREE.Vector3(1.0, 0.96, 0.88) },
    u_lightIntensity: { value: 1.25 },
    u_time:           { value: 0 },
    u_windStrength:   { value: 0.02 },
  });

  // ── Fittonia patches ────────────────────────────────────────────────────────
  const fittoniaColors = [
    new THREE.Vector3(0.10, 0.28, 0.08),
    new THREE.Vector3(0.12, 0.32, 0.06),
    new THREE.Vector3(0.08, 0.22, 0.10),
    new THREE.Vector3(0.14, 0.30, 0.07),
  ];

  // 12 patches scattered across the disc
  for (let p = 0; p < 12; p++) {
    const minR = p < 4 ? 0.15 : (p < 8 ? 0.45 : 0.75);
    const maxR = minR + 0.35;
    const pos  = randomInAnnulus(Math.min(minR, TERRAIN_RADIUS * 0.85),
                                 Math.min(maxR, TERRAIN_RADIUS * 0.88), rng);

    const leafCount   = 8 + Math.floor(rng() * 14);
    const patchRadius = 0.06 + rng() * 0.08;
    const patchGeo    = buildFittoniaPatch(rng, leafCount, patchRadius);

    const color = fittoniaColors[Math.floor(rng() * fittoniaColors.length)];
    const u     = makeUniforms(color);
    uniforms.push(u);

    const mat = new THREE.ShaderMaterial({
      vertexShader:   fernVert,
      fragmentShader: fittoniaFrag,
      uniforms:       u,
      side:           THREE.DoubleSide,
      transparent:    true,
      depthWrite:     true,
      alphaTest:      0.35,
    });

    const mesh = new THREE.Mesh(patchGeo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // ── Creeping vines ──────────────────────────────────────────────────────────
  for (let v = 0; v < 5; v++) {
    const start = randomInAnnulus(0.2, TERRAIN_RADIUS * 0.78, rng);
    const vineGeo = buildVineGeometry(rng, 25 + Math.floor(rng() * 20), 0.7 + rng() * 0.5);
    if (vineGeo.getAttribute('position').count === 0) continue;

    const color = new THREE.Vector3(0.08, 0.24, 0.06);
    const u     = makeUniforms(color);
    uniforms.push(u);

    const mat = new THREE.ShaderMaterial({
      vertexShader:   fernVert,
      fragmentShader: fittoniaFrag,
      uniforms:       u,
      side:           THREE.DoubleSide,
      transparent:    true,
      depthWrite:     true,
      alphaTest:      0.3,
    });

    const mesh = new THREE.Mesh(vineGeo, mat);
    mesh.position.set(start.x, start.y, start.z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  return { uniforms };
}

export function updateGroundCover(gcObj, time) {
  for (const u of gcObj.uniforms) {
    u.u_time.value = time;
  }
}
