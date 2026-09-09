// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ═══════════════════════════════════════════════════════════════════════════════
// GLASS BOX CENTERPIECE - Frosted glass box at terrarium center
// ═══════════════════════════════════════════════════════════════════════════════
// Creates a tall, frosted glass box positioned at the center of the terrarium.
// Contains: metal base platform, transparent glass panels, interior glow sphere,
// metal frame edges, and optional interior plant silhouettes (currently disabled).

import * as THREE from 'three';
import { glowVert, glowFrag } from './shaders.js';
import { seededRandom, fbm3, makeMossNormal } from './utils.js';
import { sampleHeight } from './terrain.js';

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSIONS - Glass box proportions
// ─────────────────────────────────────────────────────────────────────────────
const BOX_W = 0.275;  // Width (X axis)
const BOX_H = 0.42;   // Height (Y axis)
const BOX_D = 0.275;  // Depth (Z axis)

export function createGlassBox(scene) {
  const rng = seededRandom(55);  // Deterministic random generator for reproducibility

  // ─────────────────────────────────────────────────────────────────────────────
  // ROOT GROUP - Position box at terrain center
  // ─────────────────────────────────────────────────────────────────────────────
  // All glass box components are children of this root group for easy positioning
  const terrainY = sampleHeight(0, 0);  // Get ground height at center
  const root = new THREE.Group();
  root.position.y = terrainY;
  scene.add(root);

  // Helper function to add objects to root instead of scene directly
  const addToScene = (obj) => root.add(obj);

  // ─────────────────────────────────────────────────────────────────────────────
  // BASE PLATFORM - Metal cylinder supporting the glass box
  // ─────────────────────────────────────────────────────────────────────────────
  // Provides visual support and anchors the glass structure
  const baseGeo = new THREE.CylinderGeometry(0.155, 0.17, 0.018, 32);
  const baseMat = new THREE.MeshStandardMaterial({
    color:     0x282a2c,    // Dark gray-brown metallic color
    roughness: 0.25,        // Slightly polished metal
    metalness: 0.90,        // Highly metallic
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.set(0, 0.009, 0);
  base.castShadow    = true;  // Casts shadows on other objects
  base.receiveShadow = true;  // Receives shadows from other objects
  addToScene(base);

  // ─────────────────────────────────────────────────────────────────────────────
  // GLASS PANELS - Transparent sides of the box (open top, no bottom)
  // ─────────────────────────────────────────────────────────────────────────────
  // Uses dual-pass rendering: back-faces first (inner surface), then front-faces
  // (outer surface) to avoid transparency sorting artifacts. Very subtle color tint.
  const glassMat = new THREE.MeshPhysicalMaterial({
    color:           new THREE.Color(0.78, 0.90, 1.0),  // Faint blue tint
    roughness:       0.08,   // Smooth, glass-like
    metalness:       0.05,   // Minimal metallic reflection
    transparent:     true,
    opacity:         0.28,   // Very transparent (back-face, inner)
    side:            THREE.BackSide,   // Render inner surface first
    depthWrite:      false,  // Don't write to depth (allows layering)
    envMapIntensity: 1.4,    // Strong environment reflections
  });
  const glassMat2 = glassMat.clone();
  glassMat2.side = THREE.FrontSide;  // Render outer surface second
  glassMat2.opacity = 0.20;           // Slightly more transparent (outer)

  const halfW = BOX_W / 2, halfD = BOX_D / 2;
  const glassY = BOX_H / 2 + 0.019;  // Vertical center of glass box

  // ─────────────────────────────────────────────────────────────────────────────
  // GLASS PANEL GEOMETRY BUILDER - Creates 4-sided open-top box mesh
  // ─────────────────────────────────────────────────────────────────────────────
  // Constructs 4 rectangular panels (front, back, left, right) with proper normals
  // and UVs. No top or bottom to avoid seam edges. Open top allows camera to look in.
  function makeSidePanelGeo() {
    const verts = [], uvs = [], normals = [], idx = [];

    // Define 4 side panels: each has 4 corner vertices and a normal direction
    const panels = [
      // FRONT PANEL (positive Z direction)
      { corners: [[-halfW,0,halfD],[halfW,0,halfD],[halfW,BOX_H,halfD],[-halfW,BOX_H,halfD]], n:[0,0,1] },
      // BACK PANEL (negative Z direction)
      { corners: [[halfW,0,-halfD],[-halfW,0,-halfD],[-halfW,BOX_H,-halfD],[halfW,BOX_H,-halfD]], n:[0,0,-1] },
      // LEFT PANEL (negative X direction)
      { corners: [[-halfW,0,-halfD],[-halfW,0,halfD],[-halfW,BOX_H,halfD],[-halfW,BOX_H,-halfD]], n:[-1,0,0] },
      // RIGHT PANEL (positive X direction)
      { corners: [[halfW,0,halfD],[halfW,0,-halfD],[halfW,BOX_H,-halfD],[halfW,BOX_H,halfD]], n:[1,0,0] },
    ];

    // Build geometry from panels: add vertices, normals, UVs, and indices
    panels.forEach((p, pi) => {
      const base = pi * 4;  // Base index for this panel's vertices
      p.corners.forEach(([x,y,z], ci) => {
        verts.push(x,y,z);
        normals.push(...p.n);
        // UV coordinates: span left-right (x) and bottom-top (y)
        uvs.push(ci < 2 ? (ci === 0 ? 0 : 1) : (ci === 2 ? 1 : 0),
                 ci < 2 ? 0 : 1);
      });
      // Two triangles per panel (quad split)
      idx.push(base,base+1,base+2, base,base+2,base+3);
    });

    // Create BufferGeometry from collected data
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts,3));
    g.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,2));
    g.setIndex(idx);
    return g;
  }

  // Create two meshes from same geometry: one for back-faces, one for front-faces
  const glassGeoA = makeSidePanelGeo();
  const glassGeoB = makeSidePanelGeo();

  // Back-face mesh (inner surface) - rendered first
  const glassBack  = new THREE.Mesh(glassGeoA, glassMat);
  glassBack.position.set(0, 0.019, 0);
  glassBack.renderOrder = 1;  // Render first
  addToScene(glassBack);

  // Front-face mesh (outer surface) - rendered second
  const glassFront = new THREE.Mesh(glassGeoB, glassMat2);
  glassFront.position.set(0, 0.019, 0);
  glassFront.renderOrder = 2;  // Render after back faces
  addToScene(glassFront);

  const glassGroup = { glassBack, glassFront };

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERIOR PLANT SILHOUETTES - Disabled (keeping just the orb)
  // ─────────────────────────────────────────────────────────────────────────────
  // buildInteriorPlant() creates decorative plant geometry inside the box.
  // Currently disabled per design choice to keep the interior clean and simple.
  // const plantGroup = buildInteriorPlant(rng);
  // plantGroup.position.set(0, 0.018, 0);
  // addToScene(plantGroup);

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERIOR GLOW VOLUME - Subtle additive sphere creating warm light inside
  // ─────────────────────────────────────────────────────────────────────────────
  // Uses a custom shader (glowVert/glowFrag) to create a pulsing volumetric glow.
  // Positioned at center of box, color oscillates subtly with time.
  // Additive blending lets it brighten whatever's behind it.
  const glowGeo = new THREE.SphereGeometry(0.10, 12, 8);
  const glowU = {
    u_time:  { value: 0 },  // Updated each frame to animate the glow
    u_color: { value: new THREE.Vector3(1.0, 0.62, 0.70) },  // Warm pink-white
  };
  const glowMat = new THREE.ShaderMaterial({
    vertexShader:   glowVert,
    fragmentShader: glowFrag,
    uniforms:       glowU,
    transparent:    true,
    depthWrite:     false,    // Don't affect depth testing
    blending:       THREE.AdditiveBlending,  // Add light, don't replace
    side:           THREE.FrontSide,
  });

  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.set(0, 0.14 + 0.018, 0);  // Centered vertically
  addToScene(glowMesh);

  // ─────────────────────────────────────────────────────────────────────────────
  // RIM FRAME EDGES - Dark metal corners defining the box silhouette
  // ─────────────────────────────────────────────────────────────────────────────
  // Four vertical edge cylinders at the corners of the glass box.
  // No top frame (open top design). Provides visual structure and definition.
  const edgeMat = new THREE.MeshStandardMaterial({
    color:     0x1c1e20,    // Very dark gray-black metal
    roughness: 0.3,         // Polished metal edges
    metalness: 0.95,        // Highly metallic
  });

  // Define the four vertical corner edges
  const edgeConfigs = [
    // Front-left corner
    { pos: [-halfW, BOX_H / 2,  halfD], rot: [0, 0, 0], w: 0.006, h: BOX_H },
    // Front-right corner
    { pos: [ halfW, BOX_H / 2,  halfD], rot: [0, 0, 0], w: 0.006, h: BOX_H },
    // Back-left corner
    { pos: [-halfW, BOX_H / 2, -halfD], rot: [0, 0, 0], w: 0.006, h: BOX_H },
    // Back-right corner
    { pos: [ halfW, BOX_H / 2, -halfD], rot: [0, 0, 0], w: 0.006, h: BOX_H },
  ];

  const edgeGroup = new THREE.Group();
  edgeGroup.position.set(0, 0.018, 0);

  // Create a cylinder for each edge
  for (const e of edgeConfigs) {
    const eg = new THREE.CylinderGeometry(e.w / 2, e.w / 2, e.h, 6);
    const em = new THREE.Mesh(eg, edgeMat);
    em.position.set(...e.pos);
    em.rotation.set(...e.rot);
    em.castShadow    = true;    // Casts shadows
    em.receiveShadow = true;    // Receives shadows
    edgeGroup.add(em);
  }
  addToScene(edgeGroup);

  return { glassGroup, glowMesh, glowU, root };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GLASS BOX UPDATE - Animate the interior glow
// ═══════════════════════════════════════════════════════════════════════════════

export function updateGlassBox(gbObj, time) {
  // Update the time uniform for the glow shader animation
  gbObj.glowU.u_time.value = time;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHATTER - The select-mode → dictionary/flashcards disintegration (terrarium.js's enterOrb)
// ═══════════════════════════════════════════════════════════════════════════════
// Breaks the box into a scatter of small glass-tinted fragment planes that fly outward from its own
// real wall surfaces, spinning and fading as they go, while the box's own real meshes fade out
// underneath them (driven separately, by terrarium.js — see that file's own spiralPhase-2 block) —
// the box erupts into its own debris rather than debris appearing beside a still-solid box. Sampled
// from the box's real 4 wall faces (front/back/left/right, same BOX_W/BOX_H/BOX_D this file's own
// panel geometry already uses) so the fragments read as coming from the box's actual silhouette, not
// a generic sphere of confetti. Built fresh every time this fires — this whole scene is disposed
// right after the transition it belongs to finishes anyway (main.js's leaveHomeIntoOrb), so there's
// no pooling concern, and no explicit cleanup needed here either: disposeTerrarium's own generic
// scene.traverse() sweeps every fragment's geometry/material exactly like it does everything else.
const SHATTER_FRAGMENT_COUNT = 32;
const SHATTER_FACES = [
  { axis: 'z', sign: 1 },  // front
  { axis: 'z', sign: -1 }, // back
  { axis: 'x', sign: 1 },  // right
  { axis: 'x', sign: -1 }, // left
];

export function createShatter(root, rng = Math.random) {
  const group = new THREE.Group();
  root.add(group);

  const halfW = BOX_W / 2, halfD = BOX_D / 2;
  const fragments = [];
  for (let i = 0; i < SHATTER_FRAGMENT_COUNT; i++) {
    const face = SHATTER_FACES[i % SHATTER_FACES.length];
    const size = 0.018 + rng() * 0.03;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      color:      new THREE.Color(0.8, 0.9, 1.0), // same faint blue-white tint as the real glass
      transparent: true,
      opacity:    0.45 + rng() * 0.3,
      side:       THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Sample a point across this face — `u` runs along the face's own width, `v` up its height.
    const span = face.axis === 'z' ? BOX_W : BOX_D;
    const u = (rng() - 0.5) * span * 0.92;
    const v = rng() * BOX_H;
    const x = face.axis === 'z' ? u : face.sign * halfW;
    const z = face.axis === 'z' ? face.sign * halfD : u;
    const y = v + 0.019; // same vertical offset the real glass panels sit at

    // Outward travel direction: mostly the face's own outward normal, with an upward bias so debris
    // reads as flying up and out rather than skimming flat past the camera.
    const dir = new THREE.Vector3(
      face.axis === 'x' ? face.sign : 0,
      0.3 + rng() * 0.6,
      face.axis === 'z' ? face.sign : 0,
    ).normalize();

    mesh.position.set(x, y, z);
    mesh.lookAt(x + dir.x, y + dir.y, z + dir.z);
    group.add(mesh);

    fragments.push({
      mesh,
      basePos:   mesh.position.clone(),
      dir,
      spinAxis:  new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
      spinSpeed: 2 + rng() * 4, // total radians tumbled across the whole progress 0→1 sweep
      travel:    0.3 + rng() * 0.4, // world units covered by the time progress reaches 1
      startOpacity: mat.opacity,
    });
  }

  let lastProgress = 0;
  // progress: 0..1, same clock as the camera's own dive-back-in leg (terrarium.js passes its own
  // spiralInDuration-scaled progress straight through) — fragments fly further and fade out exactly
  // as that progress advances, so the box is fully gone the instant the camera's dive itself lands.
  function update(progress) {
    const dProgress = progress - lastProgress;
    lastProgress = progress;
    for (const f of fragments) {
      f.mesh.position.copy(f.basePos).addScaledVector(f.dir, f.travel * progress);
      f.mesh.rotateOnAxis(f.spinAxis, f.spinSpeed * dProgress);
      f.mesh.material.opacity = f.startOpacity * (1 - progress);
    }
  }

  return { group, update };
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERIOR PLANT SILHOUETTES - Disabled decoration geometry
// ═══════════════════════════════════════════════════════════════════════════════
// This function creates decorative plant geometry that was previously rendered
// inside the glass box. Currently disabled to keep the box interior simple and
// allow focus on the central glow effect. Kept here for potential future use.

function buildInteriorPlant(rng) {
  const group = new THREE.Group();

  const darkGreen = new THREE.MeshStandardMaterial({
    color:    new THREE.Color(0.12, 0.35, 0.10),
    roughness: 0.85,
    metalness: 0.0,
    side:      THREE.DoubleSide,
  });

  // Small central stem branching into leaves — like a small fittonia or herb
  const stemGeo = new THREE.CylinderGeometry(0.003, 0.005, 0.12, 6);
  const stem    = new THREE.Mesh(stemGeo, new THREE.MeshStandardMaterial({
    color:     0x2a1a08,
    roughness: 0.95,
  }));
  stem.position.set(0, 0.06, 0);
  group.add(stem);

  // Leaf quads on the stem
  for (let l = 0; l < 7; l++) {
    const t     = l / 6;
    const angle = (l / 7) * Math.PI * 2 + rng() * 0.5;
    const leafW = 0.032 + rng() * 0.018;
    const leafH = 0.024 + rng() * 0.014;
    const geo   = new THREE.PlaneGeometry(leafW, leafH);
    const mat   = darkGreen.clone();
    mat.color   = new THREE.Color(
      0.08 + rng() * 0.06,
      0.28 + rng() * 0.18,
      0.06 + rng() * 0.08
    );

    const leaf = new THREE.Mesh(geo, mat);
    leaf.position.set(
      Math.cos(angle) * 0.04,
      0.025 + t * 0.09,
      Math.sin(angle) * 0.04
    );
    leaf.rotation.y = angle;
    leaf.rotation.x = -0.45 - rng() * 0.4;
    group.add(leaf);
  }

  // Small flowers — tiny sphere clusters (pink/white)
  const flowerColors = [0xff8fa8, 0xffd0e0, 0xffaabb, 0xffffff, 0xffccdd];
  for (let f = 0; f < 4; f++) {
    const angle  = rng() * Math.PI * 2;
    const r      = 0.02 + rng() * 0.025;
    const fGeo   = new THREE.SphereGeometry(0.006 + rng() * 0.006, 5, 4);
    const fMat   = new THREE.MeshStandardMaterial({
      color:     flowerColors[Math.floor(rng() * flowerColors.length)],
      roughness: 0.5,
      emissive:  new THREE.Color(0.35, 0.08, 0.12),
      emissiveIntensity: 0.4,
    });
    const flower = new THREE.Mesh(fGeo, fMat);
    flower.position.set(
      Math.cos(angle) * r,
      0.10 + rng() * 0.06,
      Math.sin(angle) * r
    );
    group.add(flower);
  }

  // Ground moss inside box
  const mossGeo = new THREE.CircleGeometry(0.11, 32);
  const mossMat = new THREE.MeshStandardMaterial({
    color:    new THREE.Color(0.14, 0.32, 0.08),
    roughness: 0.97,
  });
  const moss = new THREE.Mesh(mossGeo, mossMat);
  moss.rotation.x = -Math.PI / 2;
  moss.position.y = 0.001;
  group.add(moss);

  // Tiny pebbles
  for (let p = 0; p < 6; p++) {
    const pangle = rng() * Math.PI * 2;
    const pr     = 0.03 + rng() * 0.06;
    const pGeo   = new THREE.SphereGeometry(0.005 + rng() * 0.008, 5, 4);
    const pMat   = new THREE.MeshStandardMaterial({
      color:     new THREE.Color(0.35 + rng() * 0.2, 0.32 + rng() * 0.15, 0.28 + rng() * 0.1),
      roughness: 0.9,
    });
    const pebble = new THREE.Mesh(pGeo, pMat);
    pebble.position.set(Math.cos(pangle) * pr, 0.005, Math.sin(pangle) * pr);
    group.add(pebble);
  }

  return group;
}
