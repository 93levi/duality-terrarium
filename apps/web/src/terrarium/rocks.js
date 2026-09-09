// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── Procedural rocks and driftwood ────────────────────────────────────────────

import * as THREE from 'three';
import {
  seededRandom, fbm3, fbm, smoothstep, TERRAIN_RADIUS,
  makeRockTexture, makeDriftwoodTexture, randomInAnnulus
} from './utils.js';
import { sampleHeight } from './terrain.js';

// ── Rock builder ──────────────────────────────────────────────────────────────
// Starts from a low-poly icosahedron, subdivides once, then displaces vertices
// with multi-octave 3D noise to get a natural, lumpy rock shape.

function buildRockGeometry(rng, subdivisions = 2) {
  // IcosahedronGeometry is already non-indexed — no toNonIndexed needed
  const geo = new THREE.IcosahedronGeometry(1, subdivisions);
  const pos = geo.getAttribute('position');
  const arr = pos.array;

  const seed = rng() * 100;

  for (let i = 0; i < pos.count; i++) {
    const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    const nx = x / len, ny = y / len, nz = z / len;

    // Large shape distortion
    const d1 = fbm3(nx * 2.1 + seed, ny * 1.9 + seed, nz * 2.3 + seed, 3) * 0.38;
    // Medium detail
    const d2 = fbm3(nx * 4.8 + seed + 1, ny * 5.1 + seed, nz * 4.6 + seed, 3) * 0.14;
    // Fine surface roughness
    const d3 = fbm3(nx * 11  + seed + 2, ny * 12  + seed, nz * 10  + seed, 2) * 0.05;

    const r = 1.0 + d1 + d2 + d3;
    arr[i * 3]     = nx * r;
    arr[i * 3 + 1] = ny * r;
    arr[i * 3 + 2] = nz * r;
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function placeRock(scene, rng, rockTex, pos, scale, rotY) {
  const geo = buildRockGeometry(rng, 2);

  // Flatten bottom (rocks sit on ground)
  const arr = geo.getAttribute('position').array;
  for (let i = 0; i < arr.length / 3; i++) {
    if (arr[i * 3 + 1] < -0.25) arr[i * 3 + 1] = -0.25;
  }
  geo.getAttribute('position').needsUpdate = true;
  geo.computeVertexNormals();

  // Rock colour: varied warm-grey to cool-grey to brownish
  const greyShift = rng() * 0.12;
  const warmShift = rng() * 0.06;
  const col = new THREE.Color(
    0.25 + greyShift + warmShift,
    0.23 + greyShift,
    0.21 + greyShift
  );

  const mat = new THREE.MeshStandardMaterial({
    map:        rockTex,
    color:      col,
    roughness:  0.88 + rng() * 0.1,
    metalness:  0.02,
  });

  const mesh = new THREE.Mesh(geo, mat);

  // Lift rock so most of it sits above the moss
  const liftY = scale.y * 0.85;
  mesh.position.set(pos.x, pos.y + liftY, pos.z);
  mesh.rotation.y = rotY;
  mesh.rotation.z = (rng() - 0.5) * 0.3;
  mesh.rotation.x = (rng() - 0.5) * 0.15;
  mesh.scale.set(scale.x, scale.y, scale.z);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return mesh;
}

// ── Driftwood builder ─────────────────────────────────────────────────────────
// A tapered cylinder with a curve applied by displacing along an arc

function buildDriftwoodGeometry(rng, length = 0.55, segments = 20) {
  // Wandering path
  const points = [];
  let cx = 0, cy = 0, cz = 0, dir = rng() * Math.PI * 2;
  for (let i = 0; i <= segments; i++) {
    const t  = i / segments;
    dir     += (rng() - 0.5) * 0.6;
    const step = length / segments;
    cx += Math.cos(dir) * step;
    cy += Math.sin(t * Math.PI) * 0.025;
    cz += Math.sin(dir) * step;
    points.push(new THREE.Vector3(cx, cy, cz));
  }

  const curve  = new THREE.CatmullRomCurve3(points);
  const radius = 0.018 + rng() * 0.014;   // actual cross-section radius
  const tube   = new THREE.TubeGeometry(curve, segments, radius, 8, false);

  // Add surface bark roughness — displace along existing normals
  tube.computeVertexNormals();
  const pos = tube.getAttribute('position');
  const nor = tube.getAttribute('normal');
  const arr = pos.array;
  const nrm = nor.array;

  for (let i = 0; i < pos.count; i++) {
    const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
    const bark = fbm3(x * 14, y * 14, z * 14, 3) * 0.006;
    arr[i * 3]     += nrm[i * 3]     * bark;
    arr[i * 3 + 1] += nrm[i * 3 + 1] * bark;
    arr[i * 3 + 2] += nrm[i * 3 + 2] * bark;
  }

  pos.needsUpdate = true;
  tube.computeVertexNormals();
  return tube;
}

// ── Small stone cluster helper ────────────────────────────────────────────────

function placeStoneCluster(scene, rng, rockTex, centerPos, count) {
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const r     = rng() * 0.08;
    const sx    = centerPos.x + Math.cos(angle) * r;
    const sz    = centerPos.z + Math.sin(angle) * r;
    const sy    = sampleHeight(sx, sz) ?? centerPos.y;
    const size  = 0.02 + rng() * 0.04;

    if (Math.sqrt(sx * sx + sz * sz) > TERRAIN_RADIUS * 0.9) continue;

    placeRock(scene, rng, rockTex,
      { x: sx, y: sy, z: sz },
      new THREE.Vector3(size, size * (0.5 + rng() * 0.5), size * (0.8 + rng() * 0.4)),
      rng() * Math.PI * 2
    );
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export function createRocks(scene) {
  const rng       = seededRandom(37);
  const rockTex   = makeRockTexture(128);
  const woodTex   = makeDriftwoodTexture(128);

  const meshes = [];

  // ── Original 5 anchor boulders ────────────────────────────────────────────
  const rockConfigs = [
    { minR: 0.60, maxR: 0.95, sx: 0.12, sy: 0.08, sz: 0.10 },
    { minR: 0.40, maxR: 0.70, sx: 0.09, sy: 0.06, sz: 0.09 },
    { minR: 0.70, maxR: 1.05, sx: 0.14, sy: 0.09, sz: 0.12 },
    { minR: 0.35, maxR: 0.65, sx: 0.07, sy: 0.05, sz: 0.08 },
    { minR: 0.80, maxR: 1.10, sx: 0.11, sy: 0.07, sz: 0.10 },
  ];

  for (const cfg of rockConfigs) {
    const pos  = randomInAnnulus(cfg.minR, Math.min(cfg.maxR, TERRAIN_RADIUS * 0.90), rng);
    const scl  = new THREE.Vector3(
      cfg.sx * (0.8 + rng() * 0.5),
      cfg.sy * (0.7 + rng() * 0.6),
      cfg.sz * (0.8 + rng() * 0.5)
    );
    const m = placeRock(scene, rng, rockTex, pos, scl, rng() * Math.PI * 2);
    meshes.push(m);

    // Small satellite stones around each large rock
    placeStoneCluster(scene, rng, rockTex, pos, 3 + Math.floor(rng() * 4));
  }

  // ── Scattered small stones ────────────────────────────────────────────────
  for (let s = 0; s < 18; s++) {
    const pos  = randomInAnnulus(0.1, TERRAIN_RADIUS * 0.88, rng);
    const size = 0.015 + rng() * 0.025;
    const scl  = new THREE.Vector3(size, size * (0.5 + rng() * 0.5), size * (0.8 + rng() * 0.4));
    placeRock(scene, rng, rockTex, pos, scl, rng() * Math.PI * 2);
  }

  // ── Driftwood pieces ───────────────────────────────────────────────────────
  for (let d = 0; d < 3; d++) {
    const pos = randomInAnnulus(0.35, TERRAIN_RADIUS * 0.82, rng);
    const woodLength = 0.35 + rng() * 0.35;
    const woodGeo    = buildDriftwoodGeometry(rng, woodLength, 20);

    const woodMat = new THREE.MeshStandardMaterial({
      map:       woodTex,
      roughness: 0.93,
      metalness: 0.00,
      color:     new THREE.Color(
        0.34 + rng() * 0.10,
        0.24 + rng() * 0.08,
        0.14 + rng() * 0.05
      ),
    });

    const woodMesh = new THREE.Mesh(woodGeo, woodMat);
    woodMesh.position.set(pos.x, pos.y - 0.02, pos.z);
    woodMesh.rotation.y = rng() * Math.PI * 2;
    woodMesh.rotation.x = (rng() - 0.5) * 0.15;
    woodMesh.castShadow    = true;
    woodMesh.receiveShadow = true;
    scene.add(woodMesh);
    meshes.push(woodMesh);
  }

  return { meshes };
}
