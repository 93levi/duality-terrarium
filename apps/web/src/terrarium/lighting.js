// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── All scene lights ───────────────────────────────────────────────────────────

import * as THREE from 'three';

export function createLighting(scene) {
  // ── Hemisphere — sky/ground ambient ────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(
    0x3a5a70,   // sky: cool blue-green
    0x0d1f05,   // ground: dark green
    1.4
  );
  scene.add(hemi);

  // ── Ambient fill — soft but visible ───────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x1a3018, 1.2);
  scene.add(ambient);

  // ── Key light — gallery/store overhead (warm white) ────────────────────────
  const keyLight = new THREE.DirectionalLight(0xfff5e8, 4.5);
  keyLight.position.set(1.5, 4.5, 2.5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near   = 0.1;
  keyLight.shadow.camera.far    = 12;
  keyLight.shadow.camera.left   = -3;
  keyLight.shadow.camera.right  =  3;
  keyLight.shadow.camera.top    =  3;
  keyLight.shadow.camera.bottom = -3;
  keyLight.shadow.bias          = -0.0003;
  keyLight.shadow.normalBias    = 0.02;
  keyLight.shadow.radius        = 3;
  scene.add(keyLight);
  scene.add(keyLight.target); // target stays at origin

  // ── Rim light — cool blue from behind/side ─────────────────────────────────
  const rimLight = new THREE.DirectionalLight(0x8aafd0, 0.7);
  rimLight.position.set(-2.5, 2.0, -2.0);
  scene.add(rimLight);

  // ── Glass box interior point lights ───────────────────────────────────────
  // Primary warm pink glow
  const boxGlow = new THREE.PointLight(0xffb8d0, 3.5, 1.2, 2.0);
  boxGlow.position.set(0, 0.38, 0);
  scene.add(boxGlow);

  // Secondary warm amber — slightly offset for interest
  const boxGlow2 = new THREE.PointLight(0xffd580, 1.8, 0.7, 2.5);
  boxGlow2.position.set(0.05, 0.18, 0.05);
  scene.add(boxGlow2);

  // ── Ground bounce — warm green reflected off moss ──────────────────────────
  const groundBounce = new THREE.PointLight(0x3a6020, 0.6, 2.5, 2.0);
  groundBounce.position.set(0, 0.02, 0);
  scene.add(groundBounce);

  // ── Fill light from front-left ─────────────────────────────────────────────
  const fillLight = new THREE.DirectionalLight(0xd0e8d8, 0.4);
  fillLight.position.set(-2, 1.5, 2);
  scene.add(fillLight);

  return {
    hemi,
    ambient,
    keyLight,
    rimLight,
    boxGlow,
    boxGlow2,
    groundBounce,
    fillLight,
  };
}

// Animate the glow lights — called each frame
export function updateLighting(lights, time) {
  const pulse = Math.sin(time * 1.6) * 0.12 + Math.sin(time * 0.7) * 0.08;
  lights.boxGlow.intensity  = 3.5 + pulse;
  lights.boxGlow2.intensity = 1.8 + pulse * 0.5;

  // Very slight position drift to simulate mist scattering light
  lights.boxGlow2.position.x = 0.05 + Math.sin(time * 0.4) * 0.015;
  lights.boxGlow2.position.z = 0.05 + Math.cos(time * 0.55) * 0.015;
}
