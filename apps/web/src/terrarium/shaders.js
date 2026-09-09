// Ported close to as-is from moss x kanji FINAL's public/three-scene/js/ (the "Digital Terrarium" demo) — see apps/web/CLAUDE.md's home-page section for what changed and why. Terrain/particles stay disabled here, matching that project's own already-established choice for this scene.

// ── All GLSL shader source strings ────────────────────────────────────────────

// Simplex 3D noise by Ashima Arts / Ian McEwan — public domain
export const GLSL_NOISE = /* glsl */`
vec4 permute4(vec4 x){ return mod(((x*34.0)+1.0)*x,289.0); }
vec4 taylorInvSqrt4(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p  = permute4(permute4(permute4(
    i.z + vec4(0.0,i1.z,i2.z,1.0)) +
    i.y + vec4(0.0,i1.y,i2.y,1.0)) +
    i.x + vec4(0.0,i1.x,i2.x,1.0));
  float n_ = 0.142857142857;
  vec3  ns  = n_ * D.wyz - D.xzx;
  vec4 j    = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_   = floor(j * ns.z);
  vec4 y_   = floor(j - 7.0 * x_);
  vec4 x    = x_ *ns.x + ns.yyyy;
  vec4 y    = y_ *ns.x + ns.yyyy;
  vec4 h    = 1.0 - abs(x) - abs(y);
  vec4 b0   = vec4(x.xy, y.xy);
  vec4 b1   = vec4(x.zw, y.zw);
  vec4 s0   = floor(b0)*2.0 + 1.0;
  vec4 s1   = floor(b1)*2.0 + 1.0;
  vec4 sh   = -step(h, vec4(0.0));
  vec4 a0   = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1   = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0   = vec3(a0.xy, h.x);
  vec3 p1   = vec3(a0.zw, h.y);
  vec3 p2   = vec3(a1.xy, h.z);
  vec3 p3   = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt4(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float fbmNoise(vec3 p, int oct){
  float v=0.0, a=0.5, f=1.0;
  for(int i=0;i<8;i++){
    if(i>=oct) break;
    v += a * snoise(p*f);
    a *= 0.5; f *= 2.1;
  }
  return v;
}
`;

// ── Grass ─────────────────────────────────────────────────────────────────────

export const grassVert = /* glsl */`
${GLSL_NOISE}

attribute vec3  a_offset;
attribute float a_rotation;
attribute float a_height;
attribute vec3  a_color;
attribute vec2  a_lean;   // xz lean direction

uniform float u_time;
uniform float u_windStrength;
uniform vec2  u_windDir;

varying vec2  vUv;
varying vec3  vColor;
varying float vAO;
varying vec3  vWorldPos;
varying vec3  vNormal;

void main(){
  vUv   = uv;
  vColor = a_color;

  vec3 pos = position;

  // Scale blade height per instance (position.y is 0..1 template)
  pos.y *= a_height;

  float hf = uv.y;          // height fraction 0=base 1=tip
  float hf2 = hf * hf;      // quadratic — more sway at tip

  // Lean (natural droop / directionality)
  float leanScale = hf2 * 0.12;
  pos.x += a_lean.x * leanScale;
  pos.z += a_lean.y * leanScale;

  // Primary wind wave — large gentle sway
  float windPhase = dot(a_offset.xz, vec2(0.7,0.5)) * 0.8 + u_time * 1.3;
  float primaryWind = sin(windPhase) * u_windStrength * hf2;

  // Secondary rustling — faster, smaller, slightly off-axis
  float rustlePhase = dot(a_offset.xz, vec2(1.1, 0.9)) * 1.5 + u_time * 3.1;
  float rustleWind  = sin(rustlePhase) * u_windStrength * 0.25 * hf2;

  // Micro tremor at tip
  float microPhase = dot(a_offset.xz, vec2(2.3, 1.7)) + u_time * 6.0;
  float microWind  = sin(microPhase) * u_windStrength * 0.08 * hf;

  vec2 windVec = u_windDir * primaryWind
               + u_windDir.yx * rustleWind
               + u_windDir    * microWind;
  pos.xz += windVec;

  // Rotate blade around Y
  float c = cos(a_rotation), s = sin(a_rotation);
  pos.xz = vec2(pos.x * c - pos.z * s,
                pos.x * s + pos.z * c);

  // Translate to instance position
  pos += a_offset;

  vAO      = 1.0 - hf * 0.0 + hf * 1.0; // AO lighter at top
  vWorldPos = pos;

  // Approximate normal (always face-up-ish, rotated)
  vec3 n = normalize(vec3(-s * 0.3, 0.8, c * 0.3));
  vNormal = normalMatrix * n;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const grassFrag = /* glsl */`
varying vec2  vUv;
varying vec3  vColor;
varying float vAO;
varying vec3  vWorldPos;
varying vec3  vNormal;

uniform float u_time;
uniform vec3  u_lightDir;
uniform vec3  u_lightColor;
uniform float u_lightIntensity;

void main(){
  // Dark base, bright tip gradient
  float hf    = vUv.y;
  vec3 base   = vColor * vec3(0.55, 0.70, 0.40);
  vec3 tip    = vColor * vec3(1.10, 1.45, 0.80) + vec3(0.05, 0.12, 0.01);
  vec3 col    = mix(base, tip, pow(hf, 0.7));

  // Fake AO — darken near base
  float ao = 0.35 + 0.65 * smoothstep(0.0, 0.35, hf);
  col *= ao;

  // Diffuse lighting
  float NdotL = max(0.0, dot(normalize(vNormal), -normalize(u_lightDir)));
  col *= (0.5 + NdotL * 0.6) * u_lightColor * u_lightIntensity;

  // Translucency / subsurface — backlit glow through thin blades
  float trans = max(0.0, dot(normalize(-u_lightDir), normalize(vec3(vWorldPos.x, 0.0, vWorldPos.z))));
  trans = pow(trans, 3.0) * 0.35;
  col += vColor * u_lightColor * trans * 0.6;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ── Fern / leaves ─────────────────────────────────────────────────────────────

export const fernVert = /* glsl */`
${GLSL_NOISE}

attribute float a_windOffset;

uniform float u_time;
uniform float u_windStrength;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main(){
  vUv = uv;

  vec3 pos = position;

  // Gentle swaying — controlled by vertex Y height
  float sway = snoise(vec3(pos.x * 0.4 + a_windOffset, u_time * 0.7, pos.z * 0.4)) * u_windStrength * 0.04;
  float heightFrac = clamp(pos.y * 2.0, 0.0, 1.0);
  pos.xz += sway * heightFrac;

  vWorldPos    = (modelMatrix * vec4(pos, 1.0)).xyz;
  vWorldNormal = normalize(normalMatrix * normal);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

export const fernFrag = /* glsl */`
uniform sampler2D u_leafAlpha;
uniform vec3  u_baseColor;
uniform vec3  u_lightDir;
uniform vec3  u_lightColor;
uniform float u_lightIntensity;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main(){
  float a = texture2D(u_leafAlpha, vUv).r;
  if(a < 0.45) discard;

  // Color gradient: darker veins toward midrib
  float distFromEdge = min(vUv.x, 1.0 - vUv.x) * 2.0;
  vec3 col = u_baseColor * mix(0.55, 1.0, distFromEdge);
  col *= mix(0.7, 1.0, vUv.y); // tip lighter

  // Diffuse
  float NdotL = dot(normalize(vWorldNormal), -normalize(u_lightDir));
  float diff  = 0.4 + max(0.0, NdotL) * 0.55;
  col *= diff * u_lightColor * u_lightIntensity;

  // Subsurface translucency — leaf glows when backlit
  float backlit = max(0.0, -NdotL);
  float sss     = pow(backlit, 2.5) * 0.55;
  col += u_baseColor * vec3(0.3, 0.9, 0.2) * sss;

  gl_FragColor = vec4(col, a);
}
`;

// ── Fittonia ground-cover ─────────────────────────────────────────────────────

export const fittoniaFrag = /* glsl */`
uniform sampler2D u_veinTex;
uniform sampler2D u_leafAlpha;
uniform vec3  u_lightDir;
uniform vec3  u_lightColor;
uniform float u_lightIntensity;

varying vec2 vUv;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

void main(){
  float a   = texture2D(u_leafAlpha, vUv).r;
  if(a < 0.4) discard;

  vec3 vein = texture2D(u_veinTex, vUv).rgb;
  vec3 base = vec3(0.10, 0.28, 0.08);

  // Overlay vein pattern
  vec3 col = mix(base, vec3(0.78, 0.90, 0.65), vein.g * 0.8);

  float NdotL = max(0.0, dot(normalize(vWorldNormal), -normalize(u_lightDir)));
  col *= (0.45 + NdotL * 0.5) * u_lightColor * u_lightIntensity;

  // Slight backlit warmth
  float backlit = max(0.0, dot(normalize(u_lightDir), normalize(vWorldNormal)));
  col += vec3(0.06, 0.15, 0.02) * pow(backlit, 3.0) * 0.4;

  gl_FragColor = vec4(col, a);
}
`;

// ── Mist particles ────────────────────────────────────────────────────────────

export const mistVert = /* glsl */`
attribute float a_life;
attribute float a_size;
attribute float a_speed;
attribute vec3  a_origin;

uniform float u_time;

varying float vAlpha;

void main(){
  float t   = mod(u_time * a_speed + a_life, 1.0);
  float rise = t * 0.32;           // drift upward
  float drift = sin(u_time * 0.4 + a_life * 6.28) * 0.04;

  vec3 pos = a_origin + vec3(drift, rise, drift * 0.5);

  // Fade in and out
  vAlpha = smoothstep(0.0, 0.2, t) * (1.0 - smoothstep(0.7, 1.0, t)) * 0.55;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = a_size * (1.0 / -mvPos.z) * 400.0;
  gl_Position  = projectionMatrix * mvPos;
}
`;

export const mistFrag = /* glsl */`
uniform sampler2D u_sprite;
varying float vAlpha;

void main(){
  vec4 tex = texture2D(u_sprite, gl_PointCoord);
  gl_FragColor = vec4(vec3(0.88, 0.94, 1.0), tex.r * vAlpha);
}
`;

// ── Ambient dust ──────────────────────────────────────────────────────────────

export const dustVert = /* glsl */`
attribute float a_life;
attribute float a_size;
attribute vec3  a_origin;
attribute float a_speed;

uniform float u_time;

varying float vAlpha;

void main(){
  float t   = mod(u_time * a_speed * 0.15 + a_life, 1.0);
  float driftX = sin(u_time * 0.3 + a_life * 7.0) * 0.5;
  float driftY = t * 0.3 - 0.15;
  float driftZ = cos(u_time * 0.2 + a_life * 5.0) * 0.4;

  vec3 pos  = a_origin + vec3(driftX, driftY, driftZ);
  vAlpha    = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.75, 1.0, t)) * 0.35;

  vec4 mvPos  = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = a_size * (1.0 / -mvPos.z) * 350.0;
  gl_Position  = projectionMatrix * mvPos;
}
`;

export const dustFrag = /* glsl */`
uniform sampler2D u_sprite;
varying float vAlpha;

void main(){
  vec4 tex = texture2D(u_sprite, gl_PointCoord);
  gl_FragColor = vec4(vec3(0.72, 0.88, 0.60), tex.r * vAlpha);
}
`;

// ── Interior glow pulse (for glass box emissive insert) ───────────────────────

export const glowVert = /* glsl */`
uniform float u_time;
varying vec3 vNormal;
varying vec3 vPos;

void main(){
  vNormal = normal;
  vPos    = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const glowFrag = /* glsl */`
uniform float u_time;
uniform vec3  u_color;
varying vec3  vNormal;
varying vec3  vPos;

void main(){
  float pulse = 0.85 + 0.15 * sin(u_time * 1.8);
  float edge  = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0,1.0,0.0))), 1.5);
  vec3  col   = u_color * pulse * (0.7 + edge * 0.5);
  float a     = 0.55 + edge * 0.3;
  gl_FragColor = vec4(col * a, a);
}
`;
