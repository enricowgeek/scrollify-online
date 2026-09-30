// Velluto · la scarpiera sulla parete destra, dopo le piste: caselle in noce con una luce calda nascosta sotto ogni
// ripiano, le scarpe da bowling bicolori (a sella: punta e tallone di un colore, la sella coi lacci dell'altro, suola di
// cuoio e tacco di gomma) di punta verso chi guarda, le targhette d'ottone coi numeri dal 36 al 46. Accanto, la
// rastrelliera d'ottone con le palle colorate. Tutto in codice: la scarpa è un'estrusione a sezioni (loft).
import * as THREE from 'three';
import { S, COSTANTI, RUMORE, INSEGNA, LUCI, AMBIENTE, NEBBIA } from './glsl.js';
import { curva, PALLA } from './misure.js';
import { unisci, scatola, piano, VERT, TESTA, FRAG_LUCIDO, FRAG_VELLUTO } from './pista.js';

export const NUMERI = Array.from({ length: 11 }, (_, i) => 36 + i);
const C = S.scarpe, XW = S.xw, PROF = .36;                // profondità delle caselle
const RIGHE = 9, COL = NUMERI.length;
const CW = (C.z1 - C.z0) / COL, RH = (C.y1 - C.y0) / RIGHE;

// la luce di ogni casella: un filo di LED caldo sotto il ripiano di sopra, sul bordo davanti
const CASELLA = /* glsl */`
#define CW ${CW.toFixed(5)}
#define RH ${RH.toFixed(5)}
#define PROF ${PROF.toFixed(4)}
vec3 luceCasella(vec3 p, vec3 n, vec3 V, vec3 alb, float lucido, float sp){
  vec3 q = p - n * .012;
  if (q.x < XW - PROF - .05 || q.z < SC_Z0 || q.z > SC_Z1 || q.y < SC_Y0 || q.y > SC_Y1) return vec3(0.);
  float i = floor((q.z - SC_Z0) / CW), j = floor((q.y - SC_Y0) / RH);
  vec3 lp = vec3(XW - PROF + .03, SC_Y0 + (j + 1.) * RH - .02, SC_Z0 + (i + .5) * CW);
  vec3 l = lp - p; float d2 = dot(l, l); l *= inversesqrt(d2);
  // la striscia: un po' larga (luce morbida)
  return brdf(n, V, l, vec3(1., .64, .34) * .07 / (d2 + .01), alb, lucido, sp);
}`;

// ————— la scarpa: sezioni lungo la lunghezza (tallone z = 0 → punta z = L), ciascuna una suola piatta e una tomaia a volta
function scarpa() {
  const L = .27, suola = .017, NT = 24, NA = 15;
  const W = curva([[0, .022], [.07, .03], [.2, .034], [.38, .031], [.6, .042], [.72, .044], [.84, .04], [.93, .03], [.985, .016], [1, .006]]);
  const H = curva([[0, .064], [.12, .066], [.3, .05], [.44, .076], [.6, .064], [.72, .05], [.85, .04], [.95, .026], [.985, .014], [1, .004]]);
  const pos = [], zona = [], idx = [];
  const anelli = [];
  for (let k = 0; k <= NT; k++) {
    // più fitte verso la punta e il tallone
    const u = k / NT, t = .5 - .5 * Math.cos(u * Math.PI);
    const w = W(t), h = H(t), z = t * L;
    const r = [];
    const aggiungi = (x, y, zn) => { r.push(pos.length / 3); pos.push(x, y, z); zona.push(zn); };
    const tallone = t < .3 ? 1 : 0;
    aggiungi(0, 0, tallone);                   // sotto, al centro
    aggiungi(w + .002, 0, tallone);            // bordo della suola
    aggiungi(w + .002, suola, tallone);
    for (let a = 0; a <= NA; a++) {            // la tomaia: superellisse dal fianco destro al sinistro
      const f = a / NA * Math.PI, c = Math.cos(f), s = Math.sin(f);
      const x = w * Math.sign(c) * Math.abs(c) ** (2 / 3.2), y = suola + h * Math.abs(s) ** (2 / 3.2);
      // l'apertura della scarpa (sopra, fra tallone e lingua): si vede il dentro, scuro
      const sella = t > .36 && t < .67, dentro = t > .12 && t < .42 && Math.abs(f - Math.PI / 2) < .62;
      aggiungi(x, y, dentro ? 5 : sella ? 3 : 2);
    }
    aggiungi(-w - .002, suola, tallone);
    aggiungi(-w - .002, 0, tallone);
    anelli.push(r);
  }
  const M = anelli[0].length;
  for (let k = 0; k < NT; k++) for (let i = 0; i < M; i++) {
    const a = anelli[k][i], b = anelli[k][(i + 1) % M], c = anelli[k + 1][i], d = anelli[k + 1][(i + 1) % M];
    idx.push(a, b, c, b, d, c);
  }
  // tappi: tallone e punta (a ventaglio dal centro)
  for (const [k, verso] of [[0, -1], [NT, 1]]) {
    const r = anelli[k]; let cx = 0, cy = 0; for (const i of r) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; }
    const c0 = pos.length / 3; pos.push(cx / M, cy / M, pos[r[0] * 3 + 2]); zona.push(k ? 2 : 1);
    for (let i = 0; i < M; i++) { const a = r[i], b = r[(i + 1) % M]; verso > 0 ? idx.push(c0, b, a) : idx.push(c0, a, b); }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('zona', new THREE.Float32BufferAttribute(zona, 1));
  g.setIndex(idx); g.computeVertexNormals();
  // i lacci: cinque cilindretti sopra la sella
  const lacci = [];
  for (let i = 0; i < 5; i++) {
    const t = .47 + i * .042, y = suola + H(t) + .0015;
    const c = new THREE.CylinderGeometry(.0014, .0014, W(t) * .62, 5, 1); c.rotateZ(Math.PI / 2); c.translate(0, y - .0006, t * L);
    const n = c.attributes.position.count; c.setAttribute('zona', new THREE.Float32BufferAttribute(new Array(n).fill(4), 1));
    lacci.push(c.toNonIndexed());
  }
  g = g.toNonIndexed();
  const tutte = [g, ...lacci], N = tutte.reduce((a, x) => a + x.attributes.position.count, 0);
  const P = new Float32Array(N * 3), Nn = new Float32Array(N * 3), Z = new Float32Array(N);
  let o = 0;
  for (const x of tutte) { P.set(x.attributes.position.array, o * 3); Nn.set(x.attributes.normal.array, o * 3); Z.set(x.attributes.zona.array, o); o += x.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); out.setAttribute('zona', new THREE.BufferAttribute(Z, 1));
  out.translate(0, 0, -L / 2);
  return out;
}

const VERT_SCARPA = /* glsl */`
attribute float zona; attribute vec3 iA; attribute vec3 iB; attribute vec3 iC;
varying vec3 vW; varying vec3 vN; varying float vZona; varying vec3 vA; varying vec3 vB; varying vec3 vC; varying vec3 vL;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.);
  vW = w.xyz; vN = normalize(mat3(m) * normal); vZona = zona; vA = iA; vB = iB; vC = iC; vL = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG_SCARPA = /* glsl */`
${COSTANTI}${RUMORE}${INSEGNA}${LUCI}${AMBIENTE}${NEBBIA}${CASELLA}
varying vec3 vW; varying vec3 vN; varying float vZona; varying vec3 vA; varying vec3 vB; varying vec3 vC; varying vec3 vL;
void main(){
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  float z = vZona;
  vec3 alb; float lucido = 40., sp = .35, pelle = 1.;
  if (z < .5) { alb = vec3(.32, .2, .11); lucido = 20.; sp = .15; pelle = 0.; }          // suola di cuoio
  else if (z < 1.5) { alb = vec3(.02, .018, .017); lucido = 30.; sp = .2; pelle = 0.; }  // tacco di gomma
  else if (z < 2.5) alb = vA;                                                           // punta e tallone
  else if (z < 3.5) alb = vB;                                                           // la sella
  else if (z < 4.5) { alb = vC; lucido = 10.; sp = .1; }                                // lacci
  else { alb = vec3(.012, .01, .009); sp = 0.; }                                        // dentro
  // cuciture: una riga più scura dove cambia colore, e la grana fine della pelle
  alb *= .88 + .12 * vnoise(vL.xz * 900.);
  vec3 col = (luceCasella(p, n, V, alb, lucido, sp) + luci(p, n, V, alb, lucido, sp * .5, 1.) * .6) + alb * vec3(.02, .016, .012);
  float F = .04 + .96 * pow(1. - max(dot(n, V), 0.), 5.);
  col += ambiente(p, reflect(-V, n), .35) * F * .5 * pelle;
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— legno di noce delle caselle (con la luce della casella) e targhette d'ottone
const FRAG_NOCE = /* glsl */`
${CASELLA}
uniform float uFondo;
void main(){
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  if (uSpecchio > .5 && p.y < -.002) discard;
  float g = vnoise(vec2(p.z * 3. + p.x * 3., p.y * 40.)) * .5 + vnoise(vec2(p.z * 12., p.y * 160. + p.x * 50.)) * .5;
  vec3 alb = mix(vec3(.16, .085, .045), vec3(.012, .008, .006), uFondo) * (.78 + .38 * g);
  vec3 col = luceCasella(p, n, V, alb, 60., .5) + luci(p, n, V, alb, 60., .3, 1.) * .8 + alb * vec3(.02, .016, .012);
  float F = .04 + .96 * pow(1. - max(dot(n, V), 0.), 5.);
  col += ambiente(p, reflect(-V, n), .3) * F * .6 * (1. - uFondo);
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;
const VERT_TARGA = /* glsl */`
attribute float iNum; varying vec3 vW; varying vec2 vUv; varying float vNum;
void main(){ mat4 m = modelMatrix * instanceMatrix; vec4 w = m * vec4(position, 1.); vW = w.xyz; vUv = uv; vNum = iNum; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG_TARGA = /* glsl */`
${COSTANTI}${RUMORE}${INSEGNA}${LUCI}${AMBIENTE}${NEBBIA}${CASELLA}
uniform sampler2D tNumeri;
varying vec3 vW; varying vec2 vUv; varying float vNum;
void main(){
  vec3 p = vW, n = vec3(-1., 0., 0.), V = normalize(cameraPosition - p);
  float m = texture2D(tNumeri, vec2((vNum + vUv.x) / 11., vUv.y)).r;
  // bordo smussato della targa
  vec2 e = min(vUv, 1. - vUv) * vec2(70., 18.);
  float b = clamp(min(e.x, e.y), 0., 1.);
  vec3 nb = normalize(n + vec3(0., (vUv.y - .5) * (1. - b) * 1.5, (vUv.x - .5) * (1. - b) * .4));
  vec3 ott = vec3(1., .72, .36) * (ambiente(p, reflect(-V, nb), .25) * 1.6 + luci(p, nb, V, vec3(0.), 50., 1., 1.) + luceCasella(p + vec3(0., .05, 0.), nb, V, vec3(0.), 30., 1.) + vec3(.02, .014, .008));
  vec3 col = mix(ott, ott * .12, m);     // numeri incisi (scuri)
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// i numeri per le targhette: una fila di 11 caselle
function atlante() {
  const c = document.createElement('canvas'); c.width = 1408; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff';
  g.font = '500 44px "Bodoni Moda", Didot, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  NUMERI.forEach((n, i) => g.fillText(String(n), (i + .5) * 128, 35));
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.generateMipmaps = true; return t;
}

// i colori delle scarpe (A = punta e tallone, B = la sella, C = lacci): uno per riga, come una vetrina
const TINTE = [
  [[.72, .66, .56], [.02, .018, .018], [.72, .66, .56]],   // avorio e nero
  [[.3, .13, .06], [.72, .66, .56], [.72, .66, .56]],      // cuoio e avorio
  [[.72, .66, .56], [.012, .1, .065], [.72, .66, .56]],    // avorio e smeraldo
  [[.72, .66, .56], [.22, .025, .035], [.72, .66, .56]],   // avorio e bordeaux
  [[.02, .018, .018], [.72, .66, .56], [.02, .018, .018]], // nero e avorio
  [[.72, .66, .56], [.3, .13, .06], [.3, .13, .06]],       // avorio e cuoio
  [[.72, .66, .56], [.02, .018, .018], [.72, .66, .56]],
  [[.3, .13, .06], [.72, .66, .56], [.72, .66, .56]],
  [[.72, .66, .56], [.012, .1, .065], [.72, .66, .56]],
];

export function scarpiera(scena, U, { telefono }) {
  const gruppo = new THREE.Group(); scena.add(gruppo);
  const mat = (frag, extra = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: VERT, fragmentShader: TESTA + frag });
  const x0 = XW - PROF;
  // ——— le caselle: ripiani, divisori, fondo, cornice
  const legni = [];
  for (let j = 0; j <= RIGHE; j++) legni.push(scatola(PROF, .022, C.z1 - C.z0 + .02, x0 + PROF / 2, C.y0 + j * RH, (C.z0 + C.z1) / 2));
  for (let i = 0; i <= COL; i++) legni.push(scatola(PROF, C.y1 - C.y0, .02, x0 + PROF / 2, (C.y0 + C.y1) / 2, C.z0 + i * CW));
  // zoccolo e cornice sopra
  legni.push(scatola(PROF + .02, C.y0, C.z1 - C.z0 + .08, x0 + PROF / 2 - .01, C.y0 / 2, (C.z0 + C.z1) / 2));
  legni.push(scatola(PROF + .05, .09, C.z1 - C.z0 + .14, x0 + PROF / 2 - .025, C.y1 + .045, (C.z0 + C.z1) / 2));
  const noce = new THREE.Mesh(unisci(legni), mat(FRAG_NOCE, { uFondo: { value: 0 } }));
  noce.layers.enable(1);
  const fondo = new THREE.Mesh(piano(C.z1 - C.z0, C.y1 - C.y0, XW - .006, (C.y0 + C.y1) / 2, (C.z0 + C.z1) / 2, 0, -Math.PI / 2), mat(FRAG_NOCE, { uFondo: { value: 1 } }));
  // un profilo d'ottone davanti a ogni ripiano
  const profili = [];
  for (let j = 0; j <= RIGHE; j++) { const c = new THREE.CylinderGeometry(.006, .006, C.z1 - C.z0, 8, 1); c.rotateX(Math.PI / 2); c.translate(x0 - .004, C.y0 + j * RH + .011, (C.z0 + C.z1) / 2); profili.push(c); }
  const ottone = new THREE.Mesh(unisci(profili), mat(FRAG_LUCIDO, { uColore: { value: new THREE.Color(1, .72, .36) }, uRuvido: { value: .22 }, uMetallo: { value: 1 } }));
  gruppo.add(noce, fondo, ottone);

  // ——— le targhette coi numeri: una per casella, sul bordo del ripiano di sotto
  const nT = COL * RIGHE, targhe = new THREE.InstancedMesh(new THREE.PlaneGeometry(.075, .02), new THREE.ShaderMaterial({ uniforms: { ...U, tNumeri: { value: atlante() } }, vertexShader: VERT_TARGA, fragmentShader: FRAG_TARGA }), nT);
  const iNum = new Float32Array(nT), m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  let k = 0;
  const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
  for (let j = 0; j < RIGHE; j++) for (let i = 0; i < COL; i++) {
    m.compose(v.set(x0 - .011, C.y0 + j * RH - .0005, C.z0 + (i + .5) * CW), giro, sc); targhe.setMatrixAt(k, m); iNum[k++] = i;
  }
  targhe.geometry.setAttribute('iNum', new THREE.InstancedBufferAttribute(iNum, 1));
  gruppo.add(targhe);

  // ——— le scarpe: un paio per casella (qualche casella vuota: sono in pista)
  const geo = scarpa(), coppie = [];
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  for (let j = 0; j < RIGHE; j++) for (let i = 0; i < COL; i++) if (h(i, j) > .14) coppie.push([i, j]);
  const n = coppie.length * 2;
  const scarpe = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT_SCARPA, fragmentShader: FRAG_SCARPA }), n);
  const iA = new Float32Array(n * 3), iB = new Float32Array(n * 3), iC = new Float32Array(n * 3);
  k = 0;
  for (const [i, j] of coppie) {
    const t = TINTE[j % TINTE.length], zc = C.z0 + (i + .5) * CW, y = C.y0 + j * RH + .011;
    const taglia = 1.02 + i * .014;   // dal 36 al 46 le scarpe crescono un filo
    for (const lato of [-1, 1]) {
      const ang = -Math.PI / 2 + lato * .05 + (h(i + lato, j) - .5) * .1;
      q.setFromAxisAngle(v.set(0, 1, 0), ang);
      m.compose(v.set(XW - .03 - .135 * taglia + (h(j, i + lato) - .5) * .02, y, zc + lato * .056), q, sc.set(taglia, taglia, taglia));
      scarpe.setMatrixAt(k, m);
      iA.set(t[0], k * 3); iB.set(t[1], k * 3); iC.set(t[2], k * 3);
      k++;
    }
  }
  sc.set(1, 1, 1);
  geo.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 3));
  geo.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 3));
  geo.setAttribute('iC', new THREE.InstancedBufferAttribute(iC, 3));
  scarpe.computeBoundingSphere();
  gruppo.add(scarpe);

  return { gruppo, scarpe, targhe, coppie: coppie.length };
}

// ————— la rastrelliera: tre file di binari d'ottone con le palle colorate (usa il materiale della palla con un colore)
export const TINTE_PALLE = [[.01, .16, .1], [.34, .02, .04], [.02, .05, .22], [.02, .018, .016], [.5, .28, .06], [.66, .6, .5], [.12, .02, .16]];
export function rastrelliera(scena, U, creaPalla) {
  const gruppo = new THREE.Group(); scena.add(gruppo);
  const z0 = C.z1 + .45, z1 = z0 + 1.35, x = XW - .32;
  const binari = [];
  for (const [y, dx] of [[.2, 0], [.56, .08], [.92, .16]]) {
    for (const s of [-1, 1]) { const c = new THREE.CylinderGeometry(.012, .012, z1 - z0, 10, 1); c.rotateX(Math.PI / 2); c.translate(x - dx + s * .07, y, (z0 + z1) / 2); binari.push(c); }
  }
  for (const z of [z0, z1]) for (const [y, dx] of [[.2, 0], [.56, .08], [.92, .16]]) { const c = new THREE.CylinderGeometry(.012, .012, y, 8, 1); c.translate(x - dx, y / 2, z); binari.push(c); }
  const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uColore: { value: new THREE.Color(1, .72, .36) }, uRuvido: { value: .2 }, uMetallo: { value: 1 } }, vertexShader: VERT, fragmentShader: TESTA + FRAG_LUCIDO });
  const ott = new THREE.Mesh(unisci(binari), mat); ott.layers.enable(1); gruppo.add(ott);
  const posti = [];
  [[.2, 0], [.56, .08], [.92, .16]].forEach(([y, dx], r) => { for (let i = 0; i < 5; i++) posti.push([x - dx, y + PALLA.r * .8, z0 + .18 + i * .25, (i + r * 2) % TINTE_PALLE.length]); });
  const palle = creaPalla(posti);
  gruppo.add(palle);
  return { gruppo, palle };
}
