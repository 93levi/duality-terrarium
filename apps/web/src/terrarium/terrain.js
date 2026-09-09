// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── Circular moss terrain disc + metal pedestal ───────────────────────────────

import * as THREE from 'three';
import {
  TERRAIN_RADIUS, TERRAIN_Y,
  fbm, smoothstep, seededRandom,
  makeMossTexture, makeMossNormal
} from './utils.js';

// Shared height function exported so other modules place objects correctly
export function sampleHeight(x, z) {
  const dist = Math.sqrt(x * x + z * z);
  if (dist >= TERRAIN_RADIUS) return TERRAIN_Y;
  const t = dist / TERRAIN_RADIUS;   // 0 = centre, 1 = rim

  // ── Primary dome — central mound ─────────────────────────────────────────
  const dome = 0.28 * Math.pow(Math.max(0, 1.0 - t), 1.55);

  // ── Secondary rolling hills — more dramatic, more layers ──────────────────
  const lumps  = (fbm(x * 1.0 + 0.5,  z * 1.0 - 0.3,  5) - 0.5) * 0.26;  // big rolls
  const lumps2 = (fbm(x * 1.8 - 1.2,  z * 1.8 + 0.9,  4) - 0.5) * 0.18;  // medium bumps
  const lumps3 = (fbm(x * 2.8 + 2.1,  z * 2.8 - 1.7,  4) - 0.5) * 0.12;  // extra variation
  const lumps4 = (fbm(x * 0.6 - 0.8,  z * 0.6 + 1.4,  3) - 0.5) * 0.14;  // broad swells

  // ── Fine surface texture ───────────────────────────────────────────────────
  const surface = (fbm(x * 4.0 + 1.3, z * 4.0 - 0.8,  5) - 0.5) * 0.040;
  const micro   = (fbm(x * 9.5 + 2.1, z * 9.5 - 1.4,  3) - 0.5) * 0.010;

  // Edge fade: taper smoothly at the very last 8% before the rim
  const edgeFade = 1 - smoothstep(TERRAIN_RADIUS * 0.92, TERRAIN_RADIUS * 0.995, dist);

  return dome * edgeFade + (lumps + lumps2 + lumps3 + lumps4 + surface + micro) * edgeFade + TERRAIN_Y;
}

function buildTerrainGeometry(radius, res) {
  const step = (radius * 2) / res;
  const verts   = [];
  const normals = [];
  const uvs     = [];
  const colors  = [];
  const indices = [];
  const rng = seededRandom(99);

  // Grid → index map (only vertices inside disc)
  const idxMap = new Map();
  let vi = 0;

  for (let iz = 0; iz <= res; iz++) {
    for (let ix = 0; ix <= res; ix++) {
      const x = -radius + ix * step;
      const z = -radius + iz * step;
      const dist = Math.sqrt(x * x + z * z);

      // Slightly generous threshold so triangles reach full rim
      if (dist > radius + step * 0.75) continue;

      const y = dist < radius ? sampleHeight(x, z) : TERRAIN_Y;

      verts.push(x, y, z);
      uvs.push(ix / res, iz / res);

      // Rich moss vertex color — varies with fbm and position
      const colorN1 = fbm(x * 2.5, z * 2.5, 5);
      const colorN2 = fbm(x * 6.0 + 5, z * 6.0 - 3, 3);
      const jitter  = rng() * 0.06 - 0.03;
      const bright  = dist < radius * 0.5 ? 1.0 : smoothstep(radius, radius * 0.5, dist);
      const r = 0.15  + colorN1 * 0.12 + jitter;
      const g = 0.40  + colorN1 * 0.28 + colorN2 * 0.10 + jitter + bright * 0.08;
      const b = 0.07  + colorN1 * 0.06 + jitter * 0.5;
      colors.push(
        Math.max(0, Math.min(1, r)),
        Math.max(0, Math.min(1, g)),
        Math.max(0, Math.min(1, b))
      );
      normals.push(0, 1, 0); // will be recomputed

      idxMap.set(iz * (res + 1) + ix, vi++);
    }
  }

  // Build triangles
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const a = idxMap.get( iz      * (res + 1) + ix    );
      const b = idxMap.get( iz      * (res + 1) + ix + 1);
      const c = idxMap.get((iz + 1) * (res + 1) + ix    );
      const d = idxMap.get((iz + 1) * (res + 1) + ix + 1);

      if (a !== undefined && b !== undefined && c !== undefined) indices.push(a, b, c);
      if (b !== undefined && d !== undefined && c !== undefined) indices.push(b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts,   3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,     2));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors,  3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createTerrain(scene) {
  // ── Moss disc ──────────────────────────────────────────────────────────────
  const mossTex    = makeMossTexture(256);
  const mossNormal = makeMossNormal(256);

  const terrainGeo = buildTerrainGeometry(TERRAIN_RADIUS, 160);

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors:     true,
    // No map — vertex colors are vibrant enough; texture was darkening result
    normalMap:        mossNormal,
    normalScale:      new THREE.Vector2(2.2, 2.2),
    roughness:        0.95,
    metalness:        0.0,
    envMapIntensity:  0.2,
  });

  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true;
  terrain.castShadow    = false;
  scene.add(terrain);

  // ── Disc rim edge ring ─────────────────────────────────────────────────────
  const rimGeo = new THREE.TorusGeometry(TERRAIN_RADIUS, 0.016, 8, 128);
  const rimMat = new THREE.MeshStandardMaterial({
    color:     0x3a3a3e,
    roughness: 0.35,
    metalness: 0.85,
  });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = TERRAIN_Y + 0.002;
  rim.receiveShadow = true;
  rim.castShadow    = true;
  scene.add(rim);

  // ── Bottom disc (closes the table underside) ───────────────────────────────
  const bottomGeo = new THREE.CircleGeometry(TERRAIN_RADIUS, 64);
  const bottomMat = new THREE.MeshStandardMaterial({
    color:     0x1a1e1a,
    roughness: 0.9,
    metalness: 0.1,
    side:      THREE.BackSide,
  });
  const bottom = new THREE.Mesh(bottomGeo, bottomMat);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = TERRAIN_Y - 0.006;
  scene.add(bottom);

  // ── Pedestal — polished dark steel cylinder ────────────────────────────────
  const pedestalGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.02, 48, 1, false);
  const pedestalMat = new THREE.MeshStandardMaterial({
    color:     0x2a2c2e,
    roughness: 0.22,
    metalness: 0.92,
  });
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.position.y = TERRAIN_Y - 0.51;
  pedestal.castShadow    = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  // ── Pedestal base plate ────────────────────────────────────────────────────
  const basePlateGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.035, 64);
  const baseplateMat = new THREE.MeshStandardMaterial({
    color:     0x252628,
    roughness: 0.18,
    metalness: 0.96,
  });
  const basePlate = new THREE.Mesh(basePlateGeo, baseplateMat);
  basePlate.position.y = TERRAIN_Y - 1.025;
  basePlate.castShadow    = true;
  basePlate.receiveShadow = true;
  scene.add(basePlate);

  // ── Floor plane ───────────────────────────────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(20, 20);
  const floorMat = new THREE.MeshStandardMaterial({
    color:     0x0c0d10,
    roughness: 0.9,
    metalness: 0.05,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = TERRAIN_Y - 1.06;
  floor.receiveShadow = true;
  scene.add(floor);

  return { terrain, rim, pedestal };
}
