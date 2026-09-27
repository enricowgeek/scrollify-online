// Nuvola · rumore: numeri casuali ripetibili, simplex 3D in JS (per le forme calcolate una volta sola),
// rumore di valore periodico 2D (per le texture che si ripetono senza cuciture) e lo stesso simplex in GLSL (per la grana fine).
// Mai Math.random: i fogli di verifica devono venire uguali a ogni caricamento.

export function casuale(seme) {
  let a = seme >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const G3 = [1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1];
// simplex 3D (Gustavson), valori circa in [-1, 1]
export function simplex3(seme = 1) {
  const rnd = casuale(seme), p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512), g12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; g12[i] = perm[i] % 12; }
  const F = 1 / 3, G = 1 / 6;
  const angolo = (gi, x, y, z) => { let t = .6 - x * x - y * y - z * z; if (t < 0) return 0; t *= t; const k = gi * 3; return t * t * (G3[k] * x + G3[k + 1] * y + G3[k + 2] * z); };
  return (x, y, z) => {
    const s = (x + y + z) * F, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G, x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const ii = i & 255, jj = j & 255, kk = k & 255;
    return 32 * (angolo(g12[ii + perm[jj + perm[kk]]], x0, y0, z0)
      + angolo(g12[ii + i1 + perm[jj + j1 + perm[kk + k1]]], x0 - i1 + G, y0 - j1 + G, z0 - k1 + G)
      + angolo(g12[ii + i2 + perm[jj + j2 + perm[kk + k2]]], x0 - i2 + 2 * G, y0 - j2 + 2 * G, z0 - k2 + 2 * G)
      + angolo(g12[ii + 1 + perm[jj + 1 + perm[kk + 1]]], x0 - 1 + 3 * G, y0 - 1 + 3 * G, z0 - 1 + 3 * G));
  };
}

// rumore di valore 2D periodico: griglia P × P, interpolazione morbida; u, v in unità di cella (si ripete ogni P)
export function valorePeriodico(P, seme) {
  const rnd = casuale(seme), g = Float32Array.from({ length: P * P }, () => rnd() * 2 - 1);
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  return (u, v) => {
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = f(u - x0), fy = f(v - y0);
    const a = ((x0 % P) + P) % P, b = ((y0 % P) + P) % P, a1 = (a + 1) % P, b1 = (b + 1) % P;
    const v00 = g[b * P + a], v10 = g[b * P + a1], v01 = g[b1 * P + a], v11 = g[b1 * P + a1];
    return (v00 + (v10 - v00) * fx) + ((v01 + (v11 - v01) * fx) - (v00 + (v10 - v00) * fx)) * fy;
  };
}

export const liscia = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const mescola = (a, b, t) => a + (b - a) * t;

// simplex 3D in GLSL (Ashima Arts / Ian McEwan, licenza MIT): solo per la grana fine, non deve combaciare con quello in JS
export const GLSL_SNOISE = /* glsl */`
vec3 nv_m289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 nv_m289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 nv_perm(vec4 x){ return nv_m289(((x * 34.0) + 1.0) * x); }
float snoise(vec3 v){
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = nv_m289(i);
  vec4 p = nv_perm(nv_perm(nv_perm(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = 0.142857142857 * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 nr = 1.79284291400159 - 0.85373472095314 * vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= nr.x; p1 *= nr.y; p2 *= nr.z; p3 *= nr.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;
