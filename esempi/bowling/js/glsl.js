// Velluto · pezzi di shader comuni: le misure della sala, il rumore, le luci calde (calcolate: niente luci di Three), quello
// che si vede riflesso nelle superfici lucide (soffitto, parete dell'insegna, bar retroilluminato, scarpiera) e le ombre
// morbide di palla e birilli. Li usano tutti i materiali fatti a mano.
import { PISTA } from './misure.js';

export const S = {
  zt: PISTA.testa,             // il birillo 1
  zm: PISTA.testa + .35,       // la parete dell'insegna (davanti ai birilli, i birilli si vedono sotto)
  ys: .86, ys2: 1.04,          // la fascia scura con i numeri d'ottone (sotto la parete)
  yc: 4.2,                     // soffitto
  xw: 4.35,                    // pareti laterali (lungo le piste e nella zona bar)
  zb: 12.4,                    // la parete di fondo del bar
  passo: PISTA.passo,
  // l'insegna (lettere d'ottone retroilluminate) e la scritta STRIKE: centro, larghezza, altezza del quadro
  insegna: { x: 0, y: 2.6, w: 3.3, h: 3.3 * 520 / 1024, tela: [1024, 520] },
  strike: { x: 0, y: 1.42, w: 1.7, h: 1.7 * 340 / 1024, tela: [1024, 340] },
  // la scarpiera sulla parete destra, il bar in fondo
  scarpe: { z0: .9, z1: 5.5, y0: .32, y1: 2.28 },
  bar: { z: 9.0, x0: -3.1, x1: 3.1, alto: 1.08 },
};

const f = x => x.toFixed(4);
export const COSTANTI = /* glsl */`
#define ZT ${f(S.zt)}
#define ZM ${f(S.zm)}
#define YS ${f(S.ys)}
#define YS2 ${f(S.ys2)}
#define YC ${f(S.yc)}
#define XW ${f(S.xw)}
#define ZB ${f(S.zb)}
#define PASSO ${f(S.passo)}
#define MEZZA ${f(PISTA.largo / 2)}
#define SPONDA ${f(PISTA.spondaX)}
#define FOSSA ${f(PISTA.testa - PISTA.fossa)}
#define SC_Z0 ${f(S.scarpe.z0)}
#define SC_Z1 ${f(S.scarpe.z1)}
#define SC_Y0 ${f(S.scarpe.y0)}
#define SC_Y1 ${f(S.scarpe.y1)}
#define BAR_Z ${f(S.bar.z)}
#define BAR_X0 ${f(S.bar.x0)}
#define BAR_X1 ${f(S.bar.x1)}
#define PI 3.14159265
`;

export const RUMORE = /* glsl */`
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3. - 2. * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }
float fbm3(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vnoise3(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
float fbm2(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
`;

// le insegne d'ottone: la texture di ciascuna (r = distanza dal bordo delle lettere, g/b = alone largo e vicino) e quanto
// sono accese (il dimmer). La luce calda che esce da dietro le lettere si posa sulla parete.
export const INSEGNA = /* glsl */`
uniform sampler2D tSegno; uniform sampler2D tStrike;
uniform vec4 uInsegna; uniform vec4 uStrikeQ;   // centro x, y, larghezza, altezza (sulla parete)
uniform vec2 uAcceso;                           // x = insegna, y = STRIKE (0…1, curva morbida)
#define AMBRA vec3(1., .6, .28)
vec3 aloneInsegne(vec2 h){
  vec3 c = vec3(0.);
  vec2 uv = (h - uInsegna.xy) / uInsegna.zw + .5;
  vec2 b = smoothstep(0., .08, uv) * smoothstep(1., .92, uv);
  if (b.x * b.y > 0.) { vec2 g = texture2D(tSegno, uv).gb; c += AMBRA * (g.x * 1.1 + g.y * 1.4) * uAcceso.x * b.x * b.y; }
  vec2 us = (h - uStrikeQ.xy) / uStrikeQ.zw + .5;
  b = smoothstep(0., .08, us) * smoothstep(1., .92, us);
  if (b.x * b.y > 0.) { vec2 g = texture2D(tStrike, us).gb; c += AMBRA * (g.x * 1.1 + g.y * 1.4) * uAcceso.y * b.x * b.y; }
  return c;
}
`;

// le luci: sei puntiformi (insegna, STRIKE, avvicinamento, scarpiera, bar), per ogni pista la luce del piano dei birilli,
// i faretti del soffitto sopra le piste, le lampade a sospensione del bar
export const LUCI = /* glsl */`
uniform vec3 uLP[6]; uniform vec3 uLC[6];
vec3 brdf(vec3 n, vec3 V, vec3 l, vec3 col, vec3 alb, float lucido, float sp){
  float nl = max(dot(n, l), 0.);
  vec3 h = normalize(l + V);
  float s = pow(max(dot(n, h), 0.), lucido) * (lucido + 8.) * .0398 * sp;
  return col * nl * (alb * .3183 + s);
}
vec3 punto(vec3 p, vec3 n, vec3 V, vec3 lp, vec3 lc, vec3 alb, float lucido, float sp){
  vec3 l = lp - p; float d2 = dot(l, l); l *= inversesqrt(d2);
  return brdf(n, V, l, lc / (d2 + .04), alb, lucido, sp);
}
// la luce del piano dei birilli (calda, nascosta sotto la parete, punta indietro e in basso)
vec3 luciBirilli(vec3 p, vec3 n, vec3 V, vec3 alb, float lucido, float sp, float ombra){
  if (p.z > ZM + .6) return vec3(0.);
  float xl = floor(p.x / PASSO + .5) * PASSO;
  vec3 lp = vec3(xl, .8, ZM - .06), l = lp - p; float d2 = dot(l, l); l *= inversesqrt(d2);
  float cono = smoothstep(.35, .8, dot(-l, normalize(vec3(0., -.62, -1.)))) * step(p.z, ZM);
  return brdf(n, V, l, vec3(1., .86, .66) * 2.1 * cono * ombra / (d2 + .05), alb, lucido, sp);
}
// i faretti del soffitto sopra le piste (una griglia fra le piste, ogni 3 m): coni caldi
vec3 luciSoffitto(vec3 p, vec3 n, vec3 V, vec3 alb, float lucido, float sp){
  if (p.z > 5.) return vec3(0.);
  vec3 c = vec3(0.);
  float gx = floor((p.x - PASSO * .5) / PASSO) * PASSO + PASSO * .5;
  float gz = floor(p.z / 3.) * 3.;
  for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) {
    float z = clamp(gz + float(j) * 3., -15., 3.);
    vec3 lp = vec3(gx + float(i) * PASSO, YC - .05, z);
    vec3 l = lp - p; float d2 = dot(l, l); l *= inversesqrt(d2);
    c += brdf(n, V, l, vec3(1., .7, .42) * 4.4 * smoothstep(.55, .92, l.y) / (d2 + .1), alb, lucido, sp);
  }
  return c;
}
// le lampade del bar: quattro globi sopra il bancone
vec3 luciBar(vec3 p, vec3 n, vec3 V, vec3 alb, float lucido, float sp){
  if (p.z < 5.) return vec3(0.);
  vec3 c = vec3(0.);
  for (int i = 0; i < 4; i++) {
    vec3 lp = vec3(-2.25 + float(i) * 1.5, 2.2, BAR_Z - .02);
    c += punto(p, n, V, lp, vec3(1., .66, .36) * 1.5, alb, lucido, sp);
  }
  return c;
}
// le applique sulle pareti laterali: una ogni 3 m; a destra niente dove ci sono la scarpiera e la rastrelliera
float zApplique(float z){ return clamp(floor((z + 15.) / 3. + .5) * 3. - 15., -15., 12.); }
vec3 luciApplique(vec3 p, vec3 n, vec3 V, vec3 alb, float lucido, float sp){
  float zs = zApplique(p.z);
  vec3 c = punto(p, n, V, vec3(-XW + .14, 2.25, zs), vec3(1., .64, .34) * .55, alb, lucido, sp);
  if (zs < .5 || zs > 5.2) c += punto(p, n, V, vec3(XW - .14, 2.25, zs), vec3(1., .64, .34) * .55, alb, lucido, sp);
  return c;
}
vec3 luci(vec3 p, vec3 n, vec3 V, vec3 alb, float lucido, float sp, float ombra){
  vec3 c = vec3(0.);
  if (abs(p.x) > 2.) c += luciApplique(p, n, V, alb, lucido, sp);
  for (int i = 0; i < 6; i++) c += punto(p, n, V, uLP[i], uLC[i], alb, lucido, sp);
  c += luciBirilli(p, n, V, alb, lucido, sp, ombra);
  c += luciSoffitto(p, n, V, alb, lucido, sp);
  c += luciBar(p, n, V, alb, lucido, sp);
  // il faretto sulla rastrelliera
  if (p.x > 2. && p.z > 4.6 && p.z < 8.4) c += punto(p, n, V, vec3(3.55, 2.7, 6.05), vec3(1., .7, .42) * 2.2, alb, lucido, sp);
  return c;
}
`;

// l'onice retroilluminato del bar: miele caldo a bande, più luminoso al centro
export const ONICE = /* glsl */`
vec3 onice(vec2 q){
  float x = (q.x - (BAR_X0 + BAR_X1) * .5) / (BAR_X1 - BAR_X0), y = (q.y - 1.72) / 1.6;
  vec2 w = q * vec2(1.2, 2.2);
  float b = fbm2(w + vec2(fbm2(w * .7 + 3.), fbm2(w * .7 + 9.)) * 1.8);
  float bande = .55 + .45 * sin(b * 14. + q.y * 3.);
  float centro = 1. - smoothstep(.2, .75, length(vec2(x * 1.1, y)));
  return vec3(1., .5, .17) * (.28 + .72 * bande * bande) * (.35 + .75 * centro);
}
// le sagome di ripiani e bottiglie davanti all'onice (per i riflessi: 1 = si vede l'onice)
float davantiOnice(vec2 q){
  float m = 1.;
  for (int i = 0; i < 3; i++) { float y0 = 1.12 + float(i) * .44;
    m *= 1. - .85 * smoothstep(.012, .004, abs(q.y - y0));
    float col = floor(q.x / .19 + float(i) * 3.7);
    float h = hash11(col * 1.7 + float(i)), alta = .2 + .14 * h;
    m *= 1. - .45 * smoothstep(y0 - .02, y0 + .02, q.y) * smoothstep(y0 + alta + .03, y0 + alta - .03, q.y) * smoothstep(.3, .1, abs(fract(q.x / .19 + float(i) * 3.7) - .5)); }
  return m;
}
`;

// quello che si vede riflesso: il primo piano colpito fra pavimento, soffitto, parete dell'insegna, parete del bar e pareti
// laterali (la scarpiera sulla destra). Niente texture: si calcola.
export const AMBIENTE = /* glsl */`
${ONICE}
vec3 ambiente(vec3 p, vec3 R, float ruvido){
  vec3 c = vec3(.004, .0035, .003);
  float tMin = 1e9;
  if (R.y < -.001) { float t = -p.y / R.y; if (t > 0.) { tMin = t; vec3 h = p + R * t;
    float legno = step(abs(h.x - floor(h.x / PASSO + .5) * PASSO), MEZZA) * step(h.z, 0.) * step(FOSSA, h.z);
    c = mix(vec3(.012, .008, .005), vec3(.1, .062, .03), legno); } }
  if (R.y > .001) { float t = (YC - p.y) / R.y; if (t > 0. && t < tMin) { tMin = t; vec3 h = p + R * t;
    vec2 g = vec2(mod(h.x - PASSO * .5, PASSO) - PASSO * .5, mod(h.z, 3.) - 1.5);
    float r = .06 + ruvido * .5;
    c = vec3(.008, .006, .005) + vec3(1., .7, .42) * 5. * smoothstep(r, r * .3, length(g)) * step(-15.5, h.z) * step(h.z, 3.5) * (1. - ruvido * .8);
    // le lampade del bar
    for (int i = 0; i < 4; i++) { vec2 q = h.xz - vec2(-2.25 + float(i) * 1.5, BAR_Z); c += vec3(1., .66, .36) * 2.5 * smoothstep(.5 + ruvido, .0, length(q)) * step(5., h.z); } } }
  if (R.z < -.001) { float t = (ZM - p.z) / R.z; if (t > 0. && t < tMin) { tMin = t; vec3 h = p + R * t;
    if (h.y > YS2 && h.y < YC) c = vec3(.006, .005, .004) + aloneInsegne(h.xy) * .6;
    else if (h.y > YS) c = vec3(.01, .008, .006);
    else if (h.y > 0.) { float xl = abs(h.x - floor(h.x / PASSO + .5) * PASSO); c = mix(vec3(.004), vec3(.12, .09, .06) * smoothstep(.1, .5, h.y), step(xl, .6)); } } }
  if (R.z > .001) { float t = (ZB - p.z) / R.z; if (t > 0. && t < tMin) { tMin = t; vec3 h = p + R * t;
    // il bar: l'onice retroilluminato dietro le bottiglie
    float r = .03 + ruvido * .4;
    float banda = smoothstep(BAR_X0 - r, BAR_X0 + r, h.x) * smoothstep(BAR_X1 + r, BAR_X1 - r, h.x) * smoothstep(.92 - r, .92 + r, h.y) * smoothstep(2.52 + r, 2.52 - r, h.y);
    c = vec3(.008, .006, .005);
    if (banda > 0.) c += onice(h.xy) * banda * mix(davantiOnice(h.xy), .6, clamp(ruvido * 2., 0., 1.)); } }
  if (abs(R.x) > .001) { float s = sign(R.x); float t = (s * XW - p.x) / R.x; if (t > 0. && t < tMin) { tMin = t; vec3 h = p + R * t;
    c = vec3(.006, .005, .004);
    // la scarpiera (a destra): caselle calde
    if (s > 0. && h.z > SC_Z0 && h.z < SC_Z1 && h.y > SC_Y0 && h.y < SC_Y1) c += vec3(1., .66, .36) * .35 * (1. - ruvido * .5); } }
  return c;
}
`;

// ombre morbide di palla e birilli (capsule): occlusione d'ambiente e ombra della luce del piano
export const OMBRE = /* glsl */`
uniform vec3 uCa[11]; uniform vec3 uCb[11]; uniform float uCr[11];
float occlusione(vec3 p, vec3 n){
  float o = 1.;
  for (int i = 0; i < 11; i++) {
    vec3 ba = uCb[i] - uCa[i]; vec3 pa = p - uCa[i];
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0., 1.);
    vec3 q = uCa[i] + ba * h - p; float d2 = max(dot(q, q), 1e-6);
    float r = uCr[i];
    o *= 1. - clamp(r * r / d2 * max(dot(n, q) * inversesqrt(d2), 0.) * 1.1, 0., .92);
  }
  return o;
}
float ombraLuce(vec3 p, vec3 lp){
  float o = 1.;
  vec3 d1 = lp - p;
  for (int i = 0; i < 11; i++) {
    vec3 d2 = uCb[i] - uCa[i], r = p - uCa[i];
    float a = dot(d1, d1), e = max(dot(d2, d2), 1e-6), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2);
    float den = a * e - b * b;
    float s = den > 1e-7 ? clamp((b * f - c * e) / den, 0., 1.) : 0.;
    float t = clamp((b * s + f) / e, 0., 1.);
    s = clamp((b * t - c) / a, 0., 1.);
    vec3 q = (p + d1 * s) - (uCa[i] + d2 * t);
    float dist = length(q), pen = uCr[i] * (.6 + s * 3.);
    o *= mix(1., smoothstep(uCr[i] * .5, uCr[i] + pen * .5, dist), step(.002, s));
  }
  return o;
}
`;

export const NEBBIA = /* glsl */`
vec3 nebbia(vec3 c, vec3 p){ float d = length(cameraPosition - p); return mix(c, vec3(.005, .0035, .0025), 1. - exp(-d * .02)); }
`;
