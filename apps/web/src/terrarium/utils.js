// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── Shared math, noise, and procedural utilities ──────────────────────────────

export const TERRAIN_RADIUS = 1.5;   // disc radius in metres
export const TERRAIN_Y     = 0.0;   // table surface world-Y

// ── Value noise ───────────────────────────────────────────────────────────────

function hash(ax, ay) {
  const n = Math.sin(ax * 127.1 + ay * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function hash3(ax, ay, az) {
  const n = Math.sin(ax * 127.1 + ay * 311.7 + az * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function lerp(a, b, t) { return a + (b - a) * t; }

function noise2D(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix,     iy    );
  const b = hash(ix + 1, iy    );
  const c = hash(ix,     iy + 1);
  const d = hash(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm(x, y, octaves = 6) {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    v    += amp * noise2D(x * freq, y * freq);
    amp  *= 0.5;
    freq *= 2.0;
  }
  return v;
}

export function fbm3(x, y, z, octaves = 4) {
  // 3-axis fbm for rock displacement etc.
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    v    += amp * (hash3(x * freq, y * freq, z * freq) * 2 - 1);
    amp  *= 0.5;
    freq *= 2.1;
  }
  return v;
}

// ── Terrain sampling ──────────────────────────────────────────────────────────

export function smoothstep(a, b, t) {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function terrainHeight(x, z) {
  const dist = Math.sqrt(x * x + z * z);
  if (dist > TERRAIN_RADIUS) return null;
  const edgeFade = 1 - smoothstep(TERRAIN_RADIUS * 0.80, TERRAIN_RADIUS * 0.97, dist);
  // primary undulation
  const h1 = fbm(x * 1.8, z * 1.8, 6) - 0.5;
  // fine surface detail
  const h2 = (fbm(x * 5.0, z * 5.0, 3) - 0.5) * 0.3;
  return (h1 + h2) * 0.055 * edgeFade + TERRAIN_Y;
}

// ── Placement helpers ─────────────────────────────────────────────────────────

export function randomOnTerrain(maxR = TERRAIN_RADIUS * 0.88, rng = Math.random) {
  let x, z, h;
  let tries = 0;
  do {
    const angle = rng() * Math.PI * 2;
    const r     = Math.sqrt(rng()) * maxR;
    x = Math.cos(angle) * r;
    z = Math.sin(angle) * r;
    h = terrainHeight(x, z);
    tries++;
  } while ((h === null) && tries < 20);
  return { x, y: h ?? TERRAIN_Y, z };
}

export function randomInAnnulus(minR, maxR, rng = Math.random) {
  const angle = rng() * Math.PI * 2;
  const r     = minR + Math.sqrt(rng()) * (maxR - minR);
  const x     = Math.cos(angle) * r;
  const z     = Math.sin(angle) * r;
  const h     = terrainHeight(x, z) ?? TERRAIN_Y;
  return { x, y: h, z };
}

// ── Seeded PRNG (Mulberry32) ──────────────────────────────────────────────────

export function seededRandom(seed = 42) {
  let s = seed | 0;
  return function () {
    s  = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Canvas texture factory ────────────────────────────────────────────────────

import * as THREE from 'three';

export function createCanvasTexture(w, h, drawFn, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  drawFn(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = opts.repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  if (opts.repeatCount) { tex.repeat.set(opts.repeatCount, opts.repeatCount); }
  tex.needsUpdate = true;
  return tex;
}

// ── Procedural textures ───────────────────────────────────────────────────────

export function makeMossTexture(size = 512) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const d   = img.data;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const x  = px / w * 6;
        const y  = py / h * 6;
        const n1 = fbm(x, y, 7);
        const n2 = fbm(x * 2.1 + 3.4, y * 1.9 + 1.1, 5);
        const n3 = noise2D(x * 8, y * 8);
        // deep base green + bright highlights
        const r  = Math.round((0.06 + n1 * 0.08 + n3 * 0.04) * 255);
        const g  = Math.round((0.18 + n1 * 0.22 + n2 * 0.10 + n3 * 0.06) * 255);
        const b  = Math.round((0.04 + n1 * 0.04 + n3 * 0.02) * 255);
        const i  = (py * w + px) * 4;
        d[i]     = r; d[i+1] = g; d[i+2] = b; d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: true, repeatCount: 3 });
}

export function makeMossNormal(size = 512) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const d   = img.data;
    const sampleH = (x, y) => fbm(x * 6, y * 6, 5) + noise2D(x * 20, y * 20) * 0.3;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const u  = px / w, v = py / h;
        const e  = 1 / w;
        const hL = sampleH(u - e, v), hR = sampleH(u + e, v);
        const hD = sampleH(u, v - e), hU = sampleH(u, v + e);
        const nx = (hL - hR) * 8 + 0.5;
        const ny = 0.5;
        const nz = (hD - hU) * 8 + 0.5;
        const i  = (py * w + px) * 4;
        d[i]     = Math.round(Math.max(0, Math.min(1, nx)) * 255);
        d[i + 1] = Math.round(Math.max(0, Math.min(1, ny)) * 255);
        d[i + 2] = Math.round(Math.max(0, Math.min(1, nz)) * 255);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: true, repeatCount: 3 });
}

export function makeGrassAlpha(size = 64) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    // Draw a tapered blade shape
    const cx = w / 2;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.38, h);
    ctx.bezierCurveTo(cx - w * 0.28, h * 0.6, cx - w * 0.06, h * 0.25, cx, 0);
    ctx.bezierCurveTo(cx + w * 0.06, h * 0.25, cx + w * 0.28, h * 0.6, cx + w * 0.38, h);
    ctx.fillStyle = 'white';
    ctx.fill();
  });
}

export function makeLeafAlpha(size = 128, elongation = 2.5) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const rx = w * 0.42, ry = h * 0.46;
    // Elliptical leaf with pointed tip
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.08, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    // Pointed tip at top
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.35, cy - ry * 0.5);
    ctx.quadraticCurveTo(cx, cy - ry * 1.15, cx + rx * 0.35, cy - ry * 0.5);
    ctx.fillStyle = 'white';
    ctx.fill();
  });
}

export function makeFittoniaLeafTex(size = 128) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = '#1a3a10';
    ctx.fillRect(0, 0, w, h);
    // Vein pattern - white/cream network
    ctx.strokeStyle = 'rgba(210,230,180,0.85)';
    ctx.lineWidth = 1.5;
    const drawVeins = (x0, y0, x1, y1, depth) => {
      if (depth <= 0) return;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const len = Math.sqrt((x1-x0)**2 + (y1-y0)**2) * 0.45;
      const ang = Math.atan2(y1-y0, x1-x0);
      const spread = 0.6;
      drawVeins(mx, my, mx + Math.cos(ang + spread) * len, my + Math.sin(ang + spread) * len, depth - 1);
      drawVeins(mx, my, mx + Math.cos(ang - spread) * len, my + Math.sin(ang - spread) * len, depth - 1);
    };
    drawVeins(w/2, h, w/2, h * 0.1, 6);
    // elliptical leaf border (clip mask effect via alpha)
  });
}

export function makeRockTexture(size = 256) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const d   = img.data;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const x = px / w * 4, y = py / h * 4;
        const n = fbm(x, y, 5);
        const v = 0.30 + n * 0.30;
        const i = (py * w + px) * 4;
        d[i]   = Math.round((v * 0.80) * 255);
        d[i+1] = Math.round((v * 0.75) * 255);
        d[i+2] = Math.round((v * 0.70) * 255);
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

export function makeDriftwoodTexture(size = 256) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const d   = img.data;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const x = px / w * 2, y = py / h * 8;
        const grain = fbm(x, y, 4);
        const knot  = Math.max(0, 1 - noise2D(x * 3, y * 0.5) * 4);
        const v = 0.25 + grain * 0.28 + knot * 0.12;
        const i = (py * w + px) * 4;
        d[i]   = Math.round((v * 0.72) * 255);
        d[i+1] = Math.round((v * 0.52) * 255);
        d[i+2] = Math.round((v * 0.30) * 255);
        d[i+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

export function makeMistSprite(size = 64) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
    grd.addColorStop(0,   'rgba(255,255,255,0.55)');
    grd.addColorStop(0.4, 'rgba(240,248,255,0.25)');
    grd.addColorStop(1,   'rgba(220,235,255,0.00)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  });
}

export function makeDustSprite(size = 32) {
  return createCanvasTexture(size, size, (ctx, w, h) => {
    const grd = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
    grd.addColorStop(0,   'rgba(200,230,180,0.6)');
    grd.addColorStop(1,   'rgba(200,230,180,0.0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  });
}
