// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── Procedural fern plants ────────────────────────────────────────────────────
// Each fern has multiple fronds; each frond has a curved stem with pairs of
// leaflets. Wind animation via vertex shader.

import * as THREE from 'three';
import { fernVert, fernFrag } from './shaders.js';
import {
  TERRAIN_RADIUS, seededRandom, smoothstep,
  makeLeafAlpha, randomInAnnulus
} from './utils.js';
import { sampleHeight } from './terrain.js';

// ── Geometry builders ─────────────────────────────────────────────────────────

function buildFrondGeometry(rng, frondLength, frondCurve, stemSegments = 14) {
  const verts  = [], uvs = [], norms = [], windOffsets = [], indices = [];

  // Main stem arc: starts vertical, curves over
  // stemCurve: how much the tip leans (in XZ plane)
  const leanAngle = rng() * Math.PI * 2;
  const leanX = Math.cos(leanAngle);
  const leanZ = Math.sin(leanAngle);

  for (let s = 0; s <= stemSegments; s++) {
    const t  = s / stemSegments;   // 0=base, 1=tip
    const t2 = t * t;

    // Stem position along arc
    const stemX = leanX * frondCurve * t2 * frondLength;
    const stemY = frondLength * t * (1 - t2 * 0.25);
    const stemZ = leanZ * frondCurve * t2 * frondLength;

    // Leaflet size: fade in from base, full along middle, fade out at tip
    const fadeIn  = smoothstep(0.04, 0.18, t);
    const fadeOut = 1.0 - smoothstep(0.68, 0.97, t);
    const leafSize = frondLength * 0.20 * fadeIn * fadeOut;
    if (leafSize < 0.0012) continue;

    // Leaflet pairs — two leaflets per segment, angled outward from stem
    const perp = new THREE.Vector3(-leanZ, 0, leanX).normalize();

    for (let side = -1; side <= 1; side += 2) {
      const lx = perp.x * side;
      const lz = perp.z * side;

      // Leaflet: small quad — 2 triangles
      const leafTilt = 0.28; // how much leaf tilts downward from horizontal
      const bverts = [
        // base (stem attachment)
        [stemX, stemY, stemZ],
        // tip
        [stemX + lx * leafSize, stemY - leafSize * leafTilt, stemZ + lz * leafSize],
        // wide points mid-leaf
        [stemX + lx * leafSize * 0.65 - lz * leafSize * 0.25 * side,
         stemY - leafSize * leafTilt * 0.5,
         stemZ + lz * leafSize * 0.65 + lx * leafSize * 0.25 * side],
      ];

      // Leaflet quad (2 triangles using 4 vertices: base, left-mid, tip, right-mid)
      const b0 = [stemX, stemY, stemZ];
      const b1 = [stemX + lx * leafSize * 0.5 - lz * leafSize * 0.3 * side,
                  stemY - leafSize * leafTilt * 0.5 + 0.005,
                  stemZ + lz * leafSize * 0.5 + lx * leafSize * 0.3 * side];
      const b2 = [stemX + lx * leafSize, stemY - leafSize * leafTilt, stemZ + lz * leafSize];
      const b3 = [stemX + lx * leafSize * 0.5 + lz * leafSize * 0.3 * side,
                  stemY - leafSize * leafTilt * 0.5 + 0.005,
                  stemZ + lz * leafSize * 0.5 - lx * leafSize * 0.3 * side];

      const baseI = verts.length / 3;

      for (const bp of [b0, b1, b2, b3]) {
        verts.push(...bp);
        norms.push(lz * side, 0.7, -lx * side); // approximate normal
        windOffsets.push(rng() * Math.PI * 2);
      }

      // UVs for leaflet (maps to leaf alpha texture)
      uvs.push(0.5, 0,  0, 1,  0.5, 0,  1, 1); // simplified leaf UV

      // Two triangles
      indices.push(baseI, baseI + 1, baseI + 3);
      indices.push(baseI + 1, baseI + 2, baseI + 3);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',   new THREE.Float32BufferAttribute(verts,       3));
  geo.setAttribute('uv',         new THREE.Float32BufferAttribute(uvs,         2));
  geo.setAttribute('normal',     new THREE.Float32BufferAttribute(norms,       3));
  geo.setAttribute('a_windOffset', new THREE.Float32BufferAttribute(windOffsets, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildFernGeometry(rng, frondCount = 7, scale = 1.0) {
  const mergedGeos = [];

  for (let f = 0; f < frondCount; f++) {
    const frondLength = (0.22 + rng() * 0.18) * scale;
    const frondCurve  = 0.5 + rng() * 0.5;
    const fGeo = buildFrondGeometry(rng, frondLength, frondCurve);

    // Rotate each frond around Y axis
    const rotY  = (f / frondCount) * Math.PI * 2 + rng() * 0.5;
    fGeo.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY));

    // Slight random tilt of each frond base
    const tiltAngle = (rng() * 0.3 + 0.1);
    const tiltAxis  = new THREE.Vector3(Math.cos(rotY), 0, Math.sin(rotY));
    fGeo.applyMatrix4(new THREE.Matrix4().makeRotationAxis(tiltAxis, tiltAngle));

    mergedGeos.push(fGeo);
  }

  // Merge into single geometry using BufferGeometryUtils
  // Since we can't import BufferGeometryUtils easily here, merge manually
  const allV = [], allU = [], allN = [], allW = [], allI = [];
  let offset = 0;

  for (const g of mergedGeos) {
    const pos = g.getAttribute('position');
    const uv  = g.getAttribute('uv');
    const n   = g.getAttribute('normal');
    const wo  = g.getAttribute('a_windOffset');
    const idx = g.getIndex();

    for (let i = 0; i < pos.count; i++) {
      allV.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      allU.push(uv.getX(i), uv.getY(i));
      allN.push(n.getX(i), n.getY(i), n.getZ(i));
      allW.push(wo.getX(i));
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) allI.push(idx.getX(i) + offset);
    }
    offset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position',    new THREE.Float32BufferAttribute(allV, 3));
  merged.setAttribute('uv',          new THREE.Float32BufferAttribute(allU, 2));
  merged.setAttribute('normal',      new THREE.Float32BufferAttribute(allN, 3));
  merged.setAttribute('a_windOffset',new THREE.Float32BufferAttribute(allW, 1));
  merged.setIndex(allI);
  return merged;
}

// ── Fern colours ──────────────────────────────────────────────────────────────

const FERN_COLORS = [
  new THREE.Vector3(0.16, 0.46, 0.12),  // classic fern green
  new THREE.Vector3(0.12, 0.38, 0.10),  // dark forest fern
  new THREE.Vector3(0.20, 0.50, 0.14),  // brighter fern
  new THREE.Vector3(0.10, 0.30, 0.18),  // blue-green fern
  new THREE.Vector3(0.22, 0.48, 0.10),  // yellow-green fern
];

export function createFerns(scene) {
  const leafAlpha = makeLeafAlpha(128, 2.5);
  const rng       = seededRandom(13);

  // Fern placement configs
  const placements = [
    { r: 0.55, maxR: 0.85, scale: 1.1, fronds: 8  },  // ring of larger ferns
    { r: 0.55, maxR: 0.85, scale: 1.1, fronds: 8  },
    { r: 0.30, maxR: 0.65, scale: 0.8, fronds: 6  },  // inner smaller ones
    { r: 0.30, maxR: 0.65, scale: 0.8, fronds: 6  },
    { r: 0.65, maxR: 1.00, scale: 1.3, fronds: 9  },  // outer large
    { r: 0.65, maxR: 1.00, scale: 1.3, fronds: 9  },
    { r: 0.20, maxR: 0.50, scale: 0.65,fronds: 5  },  // small accent
    { r: 0.20, maxR: 0.50, scale: 0.65,fronds: 5  },
  ];

  const fernMeshes = [];
  const uniforms   = [];

  for (let pi = 0; pi < placements.length; pi++) {
    const cfg  = placements[pi];
    const pos  = randomInAnnulus(cfg.r, cfg.maxR, rng);
    if (!pos) continue;

    const fernGeo = buildFernGeometry(rng, cfg.fronds, cfg.scale);

    const colorVec = FERN_COLORS[Math.floor(rng() * FERN_COLORS.length)];

    const u = {
      u_leafAlpha:      { value: leafAlpha },
      u_baseColor:      { value: colorVec },
      u_lightDir:       { value: new THREE.Vector3(1.5, 4.5, 2.5).normalize() },
      u_lightColor:     { value: new THREE.Vector3(1.0, 0.96, 0.88) },
      u_lightIntensity: { value: 1.3 },
      u_time:           { value: 0 },
      u_windStrength:   { value: 0.06 },
    };

    const mat = new THREE.ShaderMaterial({
      vertexShader:   fernVert,
      fragmentShader: fernFrag,
      uniforms:       u,
      side:           THREE.DoubleSide,
      transparent:    true,
      depthWrite:     true,
      alphaTest:      0.45,
    });

    const mesh = new THREE.Mesh(fernGeo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.rotation.y    = rng() * Math.PI * 2;
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    fernMeshes.push(mesh);
    uniforms.push(u);
  }

  return { fernMeshes, uniforms };
}

export function updateFerns(fernObj, time) {
  for (const u of fernObj.uniforms) {
    u.u_time.value = time;
  }
}
