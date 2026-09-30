// Velluto · la sala in codice: cinque piste d'acero caldo (tavole, frecce, puntini, linea di lancio, piano dei birilli),
// l'avvicinamento in noce, il salotto in spina di pesce scura, canali in canna di fucile, sponde d'ebano, la parete
// dell'insegna in ebano cannettato con i filetti d'ottone, la fascia coi numeri d'ottone, il soffitto coi faretti, le
// pareti di velluto verde smeraldo. Luci e riflessi calcolati (js/glsl.js); pista e salotto leggono il riflesso vero.
import * as THREE from 'three';
import { PISTA } from './misure.js';
import { S, COSTANTI, RUMORE, INSEGNA, LUCI, AMBIENTE, OMBRE, NEBBIA } from './glsl.js';

const L = PISTA.largo / 2, K = PISTA.spondaX, FOSSA = S.zt - PISTA.fossa, CUSCINO = S.zt - PISTA.cuscino;
export const PISTE = [-2, -1, 0, 1, 2].map(i => i * S.passo);

export const VERT = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec2 vUv;
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * viewMatrix * w; }`;
export const TESTA = `${COSTANTI}${RUMORE}${INSEGNA}${LUCI}${AMBIENTE}${OMBRE}${NEBBIA}
uniform float uSpecchio; varying vec3 vW; varying vec3 vN; varying vec2 vUv;`;

// unisce geometrie (non indicizzate) con posizione, normale, uv
export function unisci(geos) {
  const g = geos.map(x => (x.index ? x.toNonIndexed() : x));
  const n = g.reduce((a, x) => a + x.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const x of g) {
    pos.set(x.attributes.position.array, o * 3); nor.set(x.attributes.normal.array, o * 3);
    if (x.attributes.uv) uv.set(x.attributes.uv.array, o * 2);
    o += x.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geos.forEach(x => x.dispose()); g.forEach(x => x.dispose());
  return out;
}
export const piano = (w, h, x, y, z, rx = -Math.PI / 2, ry = 0) => { const g = new THREE.PlaneGeometry(w, h); g.rotateX(rx); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
export const scatola = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// ————— il pavimento: piste d'acero, avvicinamento in noce, salotto in spina di pesce; riflesso vero
const FRAG_PISTA = /* glsl */`
uniform sampler2D tRiflesso; uniform mat4 mRiflesso; uniform vec3 uPalla;
// spina di pesce: tavole larghe 1 e lunghe N (unità: larghezza), ruotate di 45°
vec4 spina(vec2 p){
  const float W = .09, N = 6.;
  vec2 a = vec2(p.x + p.y, p.y - p.x) * .70710678 / W;
  vec2 c = floor(a);
  float t = mod(c.x - c.y, 2. * N);
  float oriz = step(t, N - .5);
  float id = oriz > .5 ? floor((c.x - c.y) / (2. * N)) * 31. + c.y : floor((c.x - c.y) / (2. * N)) * 17. + c.x + 500.;
  vec2 f = fract(a);
  float lungo = oriz > .5 ? (mod(t, N) + f.x) / N : (mod(t, N) - N + f.y + N) / N;
  float bordo = oriz > .5 ? min(f.y, 1. - f.y) : min(f.x, 1. - f.x);
  // le teste delle tavole (le fughe corte)
  float tq = oriz > .5 ? mod(c.x - c.y, 2. * N) + f.x : mod(c.x - c.y, 2. * N) - N + (1. - f.y);
  bordo = min(bordo, min(tq, N - tq) * 1.);
  return vec4(hash11(id * .37 + 3.), lungo, bordo, oriz);
}
void main(){
  vec3 p = vW;
  vec3 V = normalize(cameraPosition - p), n = vec3(0., 1., 0.);
  float xl = floor(p.x / PASSO + .5) * PASSO, lx = p.x - xl;
  float pista = step(abs(lx), MEZZA + .001) * step(p.z, 0.);
  float avv = step(0., p.z) * step(p.z, 4.9);
  float salotto = step(4.9, p.z);
  float bw = MEZZA * 2. / 39.;
  float fb = (lx + MEZZA) / bw, ib = floor(fb); fb = fract(fb);
  float corsia = floor(xl / PASSO + .5);
  vec3 legno; float lucido; float segno = 0.; float hb = 0.;
  if (salotto > .5) {
    // salotto: rovere affumicato a spina di pesce, lucido
    vec4 s = spina(p.xz);
    float vena = vnoise(vec2(s.y * 18. + s.x * 40., s.x * 90.)) * .5 + vnoise(vec2(s.y * 60., s.x * 13.)) * .5;
    legno = vec3(.105, .066, .042) * (.72 + .5 * s.x) * (.85 + .25 * vena);
    legno *= 1. - .45 * smoothstep(.06, .0, s.z);
    // un filetto d'ottone dove finisce l'avvicinamento
    lucido = .55;
    hb = s.x;
  } else {
    // piste: acero caldo; avvicinamento: noce
    hb = hash12(vec2(ib, corsia * 7.3 + step(-4.6, p.z) + step(p.z, ZT + .9) * 2.));
    float pino = step(p.z, -4.6) * step(ZT + .9, p.z);
    legno = mix(vec3(.72, .5, .29), vec3(.74, .47, .24), pino) * (.93 + .12 * hb);
    float vena = vnoise(vec2(ib * 17.3 + fb * 2.2, p.z * 1.7 + hb * 40.)) * .6 + vnoise(vec2(ib * 5.1 + fb * 9., p.z * 9.)) * .4;
    legno *= .9 + .14 * vena;
    legno *= 1. - .1 * (smoothstep(.04, 0., fb) + smoothstep(.96, 1., fb)) * pista;
    // noce dell'avvicinamento: tavole lunghe su tutta la sala
    float tn = floor(p.x / .14), hn = hash12(vec2(tn, floor(p.z / 2.3 + hash11(tn) * 3.)));
    vec3 noce = vec3(.2, .11, .06) * (.8 + .35 * hn) * (.85 + .25 * vnoise(vec2(p.x * 60., p.z * 3.)));
    noce *= 1. - .3 * smoothstep(.006, .0, abs(fract(p.x / .14) - .5) - .49 + .006);
    legno = mix(legno, noce, avv);
    lucido = mix(.97, .7, avv);
    // segni: linea di lancio, frecce, puntini, i dischi dei birilli (intarsi di noce)
    segno = max(segno, smoothstep(.006, .004, abs(p.z + .005)) * step(abs(lx), MEZZA));
    float k = floor((MEZZA - abs(lx)) / bw) + 1.;
    if (mod(k, 5.) == 0. && k <= 20. && pista > 0.) {
      float z0 = -3.96 - (k / 5. - 1.) * .305, u = (fract((MEZZA - abs(lx)) / bw) - .5) * 2.;
      float t = clamp((z0 - p.z) / .16, -1., 2.);
      segno = max(segno, step(0., t) * step(t, 1.) * smoothstep((1. - t) * .95, (1. - t) * .95 - .12, abs(u)) * .55);
    }
    if ((k == 3. || k == 5. || k == 8. || k == 11. || k == 14.) && pista > 0.) {
      float u = (fract((MEZZA - abs(lx)) / bw) - .5) * bw;
      segno = max(segno, smoothstep(.0075, .0055, length(vec2(u, p.z + 2.134))) * .7);
    }
    float piano = step(p.z, ZT + .38) * pista;
    legno = mix(legno, vec3(.76, .58, .4) * (.9 + .12 * vena), piano * .8);
    if (piano > 0.) {
      float dmin = 9.;
      for (int r = 0; r < 4; r++) for (int j = 0; j <= 3; j++) { if (j > r) break;
        vec2 c = vec2((float(j) - float(r) * .5) * .3048, ZT - float(r) * .26397); dmin = min(dmin, length(vec2(lx, p.z) - c)); }
      segno = max(segno, smoothstep(.003, .0015, abs(dmin - .027)) * .5);
    }
    legno = mix(legno, vec3(.09, .05, .025), segno * .8);
  }
  // il filetto d'ottone fra avvicinamento e salotto
  float filetto = smoothstep(.008, .005, abs(p.z - 4.9)) * step(abs(p.x), XW);
  // ombre: palla e birilli sulla nostra pista; sulle piste accanto i birilli fermi
  float ao = 1., sh = 1.;
  if (abs(p.x) < 1.5 && p.z < 0.) {
    vec3 q = uPalla - p; float d2 = dot(q, q);
    ao *= 1. - clamp(.0119 / d2 * max(q.y, 0.) * inversesqrt(d2) * 1.15, 0., .95);
    if (p.z < ZT + 2.5) { ao *= occlusione(p, n); sh = ombraLuce(p, vec3(0., .8, ZM - .06)); ao = min(ao, 1.); }
  } else if (p.z < ZT + .38 && pista > 0.) {
    float dmin = 9.;
    for (int r = 0; r < 4; r++) for (int j = 0; j <= 3; j++) { if (j > r) break;
      vec2 c = vec2((float(j) - float(r) * .5) * .3048, ZT - float(r) * .26397); dmin = min(dmin, length(vec2(lx, p.z) - c)); }
    ao *= mix(.35, 1., smoothstep(.02, .1, dmin));
    sh = mix(.4, 1., smoothstep(.03, .09, dmin));
  }
  vec3 col = luci(p, n, V, legno, 90., .0, sh) * ao + legno * vec3(.016, .012, .009) * ao;
  // la vernice lucida: riflesso vero (un filo mosso dalle tavole) e fresnel
  vec4 rp = mRiflesso * vec4(p, 1.);
  vec2 ruv = rp.xy / rp.w;
  ruv.x += (hb - .5) * .0016 * (pista + salotto) + (vnoise(vec2(p.z * .7, corsia)) - .5) * .002;
  vec3 rifl = texture2D(tRiflesso, ruv).rgb;
  float cosv = max(V.y, 0.), F = .045 + .955 * pow(1. - cosv, 5.);
  lucido *= 1. - segno * .4;
  col = col * (1. - F * lucido) + rifl * F * lucido * vec3(1., .94, .86);
  col += ambiente(p, reflect(-V, n), .35) * .05;
  // l'ottone del filetto
  col = mix(col, vec3(1., .72, .36) * (ambiente(p, reflect(-V, n), .2) * 1.5 + luci(p, n, V, vec3(0.), 60., 1., 1.)), filetto);
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— materiale lucido generico (canali, separatori, sponde, ottone): colore, liscio/ruvido, metallo
export const FRAG_LUCIDO = /* glsl */`
uniform vec3 uColore; uniform float uRuvido; uniform float uMetallo;
void main(){
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  if (uSpecchio > .5 && p.y < -.002) discard;
  if (!gl_FrontFacing) n = -n;
  float ao = abs(p.x) < 1.5 && p.z < ZT + 2.5 && p.z > ZT - 2. ? occlusione(p, n) : 1.;
  vec3 dif = uColore * (1. - uMetallo);
  vec3 col = luci(p, n, V, dif, mix(160., 20., uRuvido), 1., 1.) * mix(vec3(1.), uColore * 2.5, uMetallo) * ao;
  col += dif * vec3(.02, .016, .012);
  float F0 = mix(.04, 1., uMetallo);
  float F = F0 + (1. - F0) * pow(1. - max(dot(n, V), 0.), 5.);
  col += ambiente(p, reflect(-V, n), uRuvido) * F * mix(vec3(1.), uColore * 1.6, uMetallo) * ao;
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— la parete dell'insegna: ebano cannettato (scanalature verticali), filetti d'ottone fra le piste, l'alone caldo
const FRAG_PARETE = /* glsl */`
void main(){
  vec3 p = vW, V = normalize(cameraPosition - p);
  // cannettatura: scanalature da 5 cm, a mezza canna
  float u = fract(p.x / .05) * 2. - 1.;
  vec3 n = normalize(vec3(u * .9, 0., sqrt(max(0., 1. - u * u * .81))));
  float grana = vnoise(vec2(p.x * 20., p.y * 1.5)) * .5 + vnoise(vec2(p.x * 90., p.y * 4.)) * .5;
  vec3 base = vec3(.03, .02, .013) * (.75 + .4 * grana);
  base *= .75 + .25 * (1. - abs(u));
  // la luce calda dietro le lettere: radente sulle canne (le fa vedere)
  vec3 alone = aloneInsegne(p.xy);
  float radente = .35 + .65 * pow(abs(n.x), .6);
  vec3 col = alone * base * 7. * radente;
  col += alone * pow(max(dot(reflect(-V, n), normalize(vec3(0., 0., 1.))), 0.), 8.) * .08;
  col += luci(p, n, V, base, 30., .25, 1.) * .8 + base * vec3(.02, .016, .012);
  // filetti d'ottone verticali a ogni separatore di pista
  float filetto = smoothstep(.007, .004, abs(mod(p.x, PASSO) - PASSO * .5)) * step(1.7, abs(p.x));
  vec3 ott = vec3(1., .72, .36) * (ambiente(p, reflect(-V, vec3(0., 0., 1.)), .25) * 1.4 + alone * .7 + luci(p, vec3(0., 0., 1.), V, vec3(0.), 50., 1., 1.));
  col = mix(col, ott, filetto);
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— la fascia sotto la parete: legno scuro con i numeri d'ottone delle piste
const FRAG_FASCIA = /* glsl */`
uniform sampler2D tFascia;
void main(){
  vec3 p = vW, V = normalize(cameraPosition - p), n = vec3(0., 0., 1.);
  float m = texture2D(tFascia, vUv).r;
  vec3 legno = vec3(.03, .02, .013) * (.85 + .3 * vnoise(vec2(p.x * 30., p.y * 200.)));
  vec3 col = luci(p, n, V, legno, 30., .2, 1.) + legno * .03 + aloneInsegne(vec2(p.x, YS2 + .3)) * legno * 2.;
  vec3 ott = vec3(1., .72, .36) * (ambiente(p, reflect(-V, n), .25) * 1.5 + luci(p, n, V, vec3(0.), 50., 1., 1.) + aloneInsegne(vec2(p.x, YS2 + .2)) * .35);
  col = mix(col, ott, m);
  // i due profili d'ottone sopra e sotto
  float prof = smoothstep(.006, .003, min(abs(p.y - YS - .004), abs(p.y - YS2 + .004)));
  col = mix(col, ott * 1.2, prof);
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— soffitto buio coi faretti accesi (sopra le piste e l'avvicinamento)
const FRAG_SOFFITTO = /* glsl */`
void main(){
  vec3 p = vW;
  vec2 g = vec2(mod(p.x - PASSO * .5, PASSO) - PASSO * .5, mod(p.z, 3.) - 1.5);
  float dentro = step(-15.5, p.z) * step(p.z, 3.5);
  float d = length(g);
  vec3 col = vec3(.005, .004, .003) + vec3(1., .7, .42) * (smoothstep(.045, .034, d) * 6. + smoothstep(.2, .045, d) * .025) * dentro;
  // l'anello d'ottone intorno ai faretti
  col += vec3(.6, .42, .2) * .04 * smoothstep(.006, .0, abs(d - .052)) * dentro;
  col *= 1. - .35 * smoothstep(.02, .0, abs(mod(p.z, 1.5) - .75) - .06);
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— dentro la macchina dei birilli: tenda nera e fondo della fossa, un filo di luce calda
const FRAG_FOSSA = /* glsl */`
void main(){
  vec3 p = vW;
  float xl = abs(p.x - floor(p.x / PASSO + .5) * PASSO);
  float dentro = smoothstep(.8, .6, xl);
  vec3 col = vec3(.003, .0025, .002) + vec3(1., .75, .5) * dentro * (.004 + .018 * smoothstep(-.3, .8, p.y)) * (.7 + .3 * vnoise(p.xy * vec2(18., 2.)));
  gl_FragColor = vec4(col, 1.);
}`;

// ————— velluto verde smeraldo: tende a pieghe lungo le pareti (lucentezza radente del velluto)
export const FRAG_VELLUTO = /* glsl */`
uniform vec3 uColore; uniform float uPieghe;
void main(){
  vec3 p = vW, V = normalize(cameraPosition - p), n0 = normalize(vN);
  if (uSpecchio > .5 && p.y < -.002) discard;
  // le pieghe: la coordinata lungo la parete
  vec3 t = normalize(cross(vec3(0., 1., 0.), n0));
  float s = dot(p, t);
  float ph = s * uPieghe + vnoise(vec2(s * 2., 1.)) * 2.4;
  float onda = sin(ph) * .5 + sin(ph * 2.3 + 1.) * .2;
  vec3 n = normalize(n0 + t * (cos(ph) * .55 + cos(ph * 2.3 + 1.) * .25));
  float nv = max(dot(n, V), 0.);
  vec3 base = uColore * (.55 + .45 * smoothstep(-.7, .7, onda));
  vec3 col = luci(p, n, V, base, 8., .0, 1.) * .9 + base * .025;
  // la lucentezza del velluto ai bordi (fibre di taglio)
  col += uColore * 2.2 * pow(1. - nv, 3.) * (.15 + luci(p, n, V, vec3(1.), 4., 0., 1.).g * .6);
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// la fascia coi numeri d'ottone delle piste (5…9, la nostra è la 7): disegnata in una tela (maschera)
function fascia(larghezza) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 48;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff'; g.font = '500 30px "Bodoni Moda", Didot, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) { const x = (PISTE[i] / larghezza + .5) * c.width; g.fillText(String(5 + i), x, 26); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return t;
}

export function sala(scena, U, { telefono }) {
  const gruppo = new THREE.Group(); scena.add(gruppo);
  const inRiflesso = o => { o.layers.enable(1); return o; };
  const mat = (frag, extra = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: VERT, fragmentShader: TESTA + frag });

  // ——— il pavimento: le piste e tutto il resto della sala (avvicinamento, salotto, bar)
  const geoPista = unisci([
    ...PISTE.map(x => piano(PISTA.largo, -FOSSA, x, 0, FOSSA / 2)),
    piano(S.xw * 2, S.zb, 0, 0, S.zb / 2),
  ]);
  const uPista = { tRiflesso: { value: null }, mRiflesso: { value: new THREE.Matrix4() }, uPalla: { value: new THREE.Vector3(0, -5, 0) } };
  const pista = new THREE.Mesh(geoPista, mat(FRAG_PISTA, uPista));
  gruppo.add(pista);

  // ——— i canali: mezzi tubi fra la pista e la sponda, dalla linea di lancio alla fossa
  const archi = [];
  const XC = (L + K) / 2, CH = (K - L) / 2, RG = (CH * CH + PISTA.canaleFondo ** 2) / (2 * PISTA.canaleFondo), YC = RG - PISTA.canaleFondo;
  const a0 = Math.asin(CH / RG), seg = 14;
  for (const xp of PISTE) for (const lato of [-1, 1]) {
    const pos = [], nor = [], uv = [];
    const xc = xp + lato * XC;
    for (let i = 0; i < seg; i++) {
      const a = -a0 + 2 * a0 * i / seg, b = -a0 + 2 * a0 * (i + 1) / seg;
      const P = t => [xc + Math.sin(t) * RG, YC - Math.cos(t) * RG], N = t => [-Math.sin(t), Math.cos(t)];
      const [x1, y1] = P(a), [x2, y2] = P(b), [n1x, n1y] = N(a), [n2x, n2y] = N(b);
      for (const [x, y, nx, ny, z] of [[x1, y1, n1x, n1y, 0], [x2, y2, n2x, n2y, 0], [x2, y2, n2x, n2y, FOSSA], [x1, y1, n1x, n1y, 0], [x2, y2, n2x, n2y, FOSSA], [x1, y1, n1x, n1y, FOSSA]]) { pos.push(x, y, z); nor.push(nx, ny, 0); uv.push(0, 0); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    archi.push(g);
  }
  const canali = new THREE.Mesh(unisci(archi), mat(FRAG_LUCIDO, { uColore: { value: new THREE.Color(.1, .095, .09) }, uRuvido: { value: .1 }, uMetallo: { value: .85 } }));
  canali.material.side = THREE.DoubleSide;
  gruppo.add(canali);

  // ——— separatori fra le piste (bassi, laccati neri) e sponde d'ebano del piano dei birilli
  const sep = [], sponde = [];
  for (let i = 0; i <= 5; i++) {
    const xa = i === 0 ? -S.xw : PISTE[i - 1] + K, xb = i === 5 ? S.xw : PISTE[i] - K, w = xb - xa, xm = (xa + xb) / 2;
    sep.push(scatola(w, .03, -S.zm, xm, .0, S.zm / 2));
    sponde.push(scatola(w, S.ys + .34, S.zm - CUSCINO, xm, (S.ys - .32) / 2, (S.zm + CUSCINO) / 2));
  }
  const nero = mat(FRAG_LUCIDO, { uColore: { value: new THREE.Color(.012, .01, .009) }, uRuvido: { value: .06 }, uMetallo: { value: 0 } });
  gruppo.add(new THREE.Mesh(unisci(sep), nero));
  const sp = inRiflesso(new THREE.Mesh(unisci(sponde), mat(FRAG_LUCIDO, { uColore: { value: new THREE.Color(.02, .013, .009) }, uRuvido: { value: .3 }, uMetallo: { value: 0 } })));
  gruppo.add(sp);

  // ——— la fossa: fondo, tenda, cielo della macchina dei birilli
  const fossa = inRiflesso(new THREE.Mesh(unisci([
    piano(S.xw * 2, FOSSA - CUSCINO, 0, -PISTA.fossaFondo, (FOSSA + CUSCINO) / 2),
    piano(S.xw * 2, S.ys + PISTA.fossaFondo + .1, 0, (S.ys - PISTA.fossaFondo) / 2, CUSCINO, 0),
    piano(S.xw * 2, S.zm - CUSCINO, 0, S.ys, (S.zm + CUSCINO) / 2, Math.PI / 2),
  ]), mat(FRAG_FOSSA)));
  gruppo.add(fossa);

  // ——— la parete dell'insegna e la fascia coi numeri
  const larghezza = S.xw * 2;
  const parete = inRiflesso(new THREE.Mesh(piano(larghezza, S.yc - S.ys2, 0, (S.yc + S.ys2) / 2, S.zm, 0), mat(FRAG_PARETE)));
  gruppo.add(parete);
  const striscia = inRiflesso(new THREE.Mesh(piano(larghezza, S.ys2 - S.ys, 0, (S.ys + S.ys2) / 2, S.zm + .004, 0), mat(FRAG_FASCIA, { tFascia: { value: fascia(larghezza) } })));
  gruppo.add(striscia);

  // ——— soffitto (sopra le piste e l'avvicinamento; più avanti il soffitto del bar è lo stesso piano)
  const soffitto = inRiflesso(new THREE.Mesh(piano(larghezza, S.zb - S.zm, 0, S.yc, (S.zb + S.zm) / 2, Math.PI / 2), mat(FRAG_SOFFITTO)));
  gruppo.add(soffitto);

  // ——— pareti laterali: tende di velluto smeraldo lungo le piste (la destra si ferma dove comincia la scarpiera)
  const velluto = mat(FRAG_VELLUTO, { uColore: { value: new THREE.Color(.012, .09, .06) }, uPieghe: { value: 9 } });
  const tende = inRiflesso(new THREE.Mesh(unisci([
    piano(S.zb - S.zm, S.yc, -S.xw, S.yc / 2, (S.zb + S.zm) / 2, 0, Math.PI / 2),
    piano(S.scarpe.z0 - .4 - S.zm, S.yc, S.xw, S.yc / 2, (S.scarpe.z0 - .4 + S.zm) / 2, 0, -Math.PI / 2),
    piano(S.zb - S.scarpe.z1 - .05, S.yc, S.xw, S.yc / 2, (S.zb + S.scarpe.z1 + .05) / 2, 0, -Math.PI / 2),
    // sopra la scarpiera, fino al soffitto
    piano(S.scarpe.z1 - S.scarpe.z0 + .8, S.yc - S.scarpe.y1 - .1, S.xw, (S.yc + S.scarpe.y1 + .1) / 2, (S.scarpe.z0 + S.scarpe.z1) / 2, 0, -Math.PI / 2),
  ]), velluto));
  gruppo.add(tende);

  // ——— le applique: piastra d'ottone e un tubo opalino acceso (le luci sono in js/glsl.js, luciApplique)
  const piastre = [], tubi = [];
  for (let z = -15; z <= 12; z += 3) for (const s of [-1, 1]) {
    if (s > 0 && z > .5 && z < 5.2) continue;
    const x = s * (S.xw - .012);
    piastre.push(scatola(.02, .26, .1, x, 2.25, z));
    const t = new THREE.CylinderGeometry(.028, .028, .19, 16, 1); t.translate(s * (S.xw - .07), 2.25, z); tubi.push(t);
    const b1 = new THREE.CylinderGeometry(.034, .034, .012, 16, 1); b1.translate(s * (S.xw - .07), 2.35, z); piastre.push(b1);
    const b2 = new THREE.CylinderGeometry(.034, .034, .012, 16, 1); b2.translate(s * (S.xw - .07), 2.15, z); piastre.push(b2);
  }
  gruppo.add(inRiflesso(new THREE.Mesh(unisci(piastre), mat(FRAG_LUCIDO, { uColore: { value: new THREE.Color(1, .72, .36) }, uRuvido: { value: .2 }, uMetallo: { value: 1 } }))));
  gruppo.add(inRiflesso(new THREE.Mesh(unisci(tubi), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: TESTA + `void main(){ vec3 n = normalize(vN), V = normalize(cameraPosition - vW); gl_FragColor = vec4(vec3(1., .66, .38) * (1.3 + 1.8 * pow(max(dot(n, V), 0.), 1.5)), 1.); }`, uniforms: U }))));

  return { gruppo, pista, uPista, canali, velluto };
}
