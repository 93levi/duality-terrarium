// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── Mist particles (inside glass box) + ambient dust ─────────────────────────

import * as THREE from 'three';
import { mistVert, mistFrag, dustVert, dustFrag } from './shaders.js';
import { seededRandom, makeMistSprite, makeDustSprite, TERRAIN_RADIUS } from './utils.js';

const MIST_COUNT = 120;
const DUST_COUNT = 280;

export function createParticles(scene) {
  const rng        = seededRandom(61);
  const mistSprite = makeMistSprite(64);
  const dustSprite = makeDustSprite(32);

  // ── Box mist ───────────────────────────────────────────────────────────────
  const BOX_W = 0.24, BOX_H = 0.38, BOX_D = 0.24;

  const mistLife   = new Float32Array(MIST_COUNT);
  const mistSize   = new Float32Array(MIST_COUNT);
  const mistSpeed  = new Float32Array(MIST_COUNT);
  const mistOrigin = new Float32Array(MIST_COUNT * 3);

  for (let i = 0; i < MIST_COUNT; i++) {
    mistLife[i]   = rng();
    mistSize[i]   = 0.04 + rng() * 0.10;
    mistSpeed[i]  = 0.15 + rng() * 0.35;
    const ox = (rng() - 0.5) * BOX_W;
    const oz = (rng() - 0.5) * BOX_D;
    mistOrigin[i * 3]     = ox;
    mistOrigin[i * 3 + 1] = 0.02 + rng() * 0.06;  // near ground inside box
    mistOrigin[i * 3 + 2] = oz;
  }

  const mistGeo = new THREE.BufferGeometry();
  // Positions are handled entirely in vertex shader via a_origin
  const dummyPos = new Float32Array(MIST_COUNT * 3); // all zeros
  mistGeo.setAttribute('position',  new THREE.BufferAttribute(dummyPos,  3));
  mistGeo.setAttribute('a_life',    new THREE.BufferAttribute(mistLife,   1));
  mistGeo.setAttribute('a_size',    new THREE.BufferAttribute(mistSize,   1));
  mistGeo.setAttribute('a_speed',   new THREE.BufferAttribute(mistSpeed,  1));
  mistGeo.setAttribute('a_origin',  new THREE.BufferAttribute(mistOrigin, 3));

  const mistU = {
    u_time:   { value: 0 },
    u_sprite: { value: mistSprite },
  };
  const mistMat = new THREE.ShaderMaterial({
    vertexShader:   mistVert,
    fragmentShader: mistFrag,
    uniforms:       mistU,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.NormalBlending,
  });

  const mistPoints = new THREE.Points(mistGeo, mistMat);
  mistPoints.position.set(0, 0.018, 0);   // same Y as glass box
  scene.add(mistPoints);

  // ── Ambient dust floating above terrain ───────────────────────────────────
  const dustLife   = new Float32Array(DUST_COUNT);
  const dustSize   = new Float32Array(DUST_COUNT);
  const dustOrigin = new Float32Array(DUST_COUNT * 3);
  const dustSpeed  = new Float32Array(DUST_COUNT);
  const dummyDust  = new Float32Array(DUST_COUNT * 3);

  for (let i = 0; i < DUST_COUNT; i++) {
    dustLife[i]   = rng();
    dustSize[i]   = 0.008 + rng() * 0.018;
    dustSpeed[i]  = 0.5 + rng() * 1.5;

    const angle = rng() * Math.PI * 2;
    const r     = Math.sqrt(rng()) * TERRAIN_RADIUS * 0.90;
    dustOrigin[i * 3]     = Math.cos(angle) * r;
    dustOrigin[i * 3 + 1] = 0.02 + rng() * 0.12;   // just above terrain
    dustOrigin[i * 3 + 2] = Math.sin(angle) * r;
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position',  new THREE.BufferAttribute(dummyDust,  3));
  dustGeo.setAttribute('a_life',    new THREE.BufferAttribute(dustLife,   1));
  dustGeo.setAttribute('a_size',    new THREE.BufferAttribute(dustSize,   1));
  dustGeo.setAttribute('a_origin',  new THREE.BufferAttribute(dustOrigin, 3));
  dustGeo.setAttribute('a_speed',   new THREE.BufferAttribute(dustSpeed,  1));

  const dustU = {
    u_time:   { value: 0 },
    u_sprite: { value: dustSprite },
  };
  const dustMat = new THREE.ShaderMaterial({
    vertexShader:   dustVert,
    fragmentShader: dustFrag,
    uniforms:       dustU,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
  });

  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);

  return { mistU, dustU };
}

export function updateParticles(particlesObj, time) {
  particlesObj.mistU.u_time.value = time;
  particlesObj.dustU.u_time.value = time;
}
