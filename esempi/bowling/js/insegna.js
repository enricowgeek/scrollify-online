// Velluto · le insegne: lettere d'ottone spazzolato con la luce calda dietro (l'alone si posa sulla parete). Le forme si
// disegnano al volo in una tela (il marchio: il birillo, il nome, la riga sotto; poi "Strike") e diventano una texture di
// distanze: r = distanza dal bordo (per il bordo smussato che prende la luce), g/b = alone largo e vicino.
// Si accendono come un dimmer (curva morbida), poi una lama di luce scorre una volta sulle lettere. Mai sfarfallii.
import * as THREE from 'three';
import { S, COSTANTI, RUMORE, INSEGNA, LUCI, AMBIENTE } from './glsl.js';
import { profiloBirillo } from './misure.js';

const RANGO = 24;   // distanza codificata (px della tela)
const INF = 1e20;

// distanza esatta (Felzenszwalb) su una riga/colonna
function riga(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
function distanze(g, W, H) {
  const n = Math.max(W, H), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = g[y * W + x]; riga(f, H, d, v, z); for (let y = 0; y < H; y++) g[y * W + x] = d[y]; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = g[y * W + x]; riga(f, W, d, v, z); for (let x = 0; x < W; x++) g[y * W + x] = Math.sqrt(d[x]); }
}
function sfoca(a, W, H, r) {
  const t = new Float32Array(a.length), k = 1 / (2 * r + 1), c = (x, m) => Math.max(0, Math.min(m, x));
  for (let p = 0; p < 3; p++) {
    for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + c(x, W - 1)]; for (let x = 0; x < W; x++) { t[y * W + x] = s * k; s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; } }
    for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[c(y, H - 1) * W + x]; for (let y = 0; y < H; y++) { a[y * W + x] = s * k; s += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } }
  }
  return a;
}
// la tela disegnata → texture (distanze + alone)
function mappa(disegna, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  disegna(g, W, H);
  const px = g.getImageData(0, 0, W, H).data, N = W * H;
  const fuori = new Float64Array(N), dentro = new Float64Array(N), a = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const v = px[i * 4] / 255; a[i] = v;
    fuori[i] = v >= 1 ? 0 : v <= 0 ? INF : Math.max(0, .5 - v) ** 2;
    dentro[i] = v >= 1 ? INF : v <= 0 ? 0 : Math.max(0, v - .5) ** 2;
  }
  distanze(fuori, W, H); distanze(dentro, W, H);
  const vicino = sfoca(Float32Array.from(a), W, H, 5), largo = sfoca(Float32Array.from(a), W, H, 20);
  const out = new Uint8Array(N * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, j = ((H - 1 - y) * W + x) * 4;   // capovolta: le texture dati partono dal basso
    out[j] = Math.max(0, Math.min(255, Math.round(128 + (fuori[i] - dentro[i]) * 127 / RANGO)));
    out[j + 1] = Math.min(255, Math.round(largo[i] * 255 * 1.6));
    out[j + 2] = Math.min(255, Math.round(vicino[i] * 255 * 1.2));
    out[j + 3] = 255;
  }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
// testo con spaziatura a mano (la tela non ha letter-spacing ovunque)
function testo(g, s, x, y, spazio) {
  const larghe = [...s].map(ch => g.measureText(ch).width), tot = larghe.reduce((a, b) => a + b, 0) + spazio * (s.length - 1);
  let cx = x - tot / 2;
  [...s].forEach((ch, i) => { g.fillText(ch, cx, y); cx += larghe[i] + spazio; });
  return tot;
}
// il segno: la sagoma vera del birillo, piena, con le due righe del collo scavate
export function sagomaBirillo(g, cx, top, alto) {
  const pr = profiloBirillo(60, 16), k = alto / .381;
  g.beginPath();
  pr.forEach(([r, h], i) => { const x = cx + r * k, y = top + alto - h * k; i ? g.lineTo(x, y) : g.moveTo(x, y); });
  [...pr].reverse().forEach(([r, h]) => g.lineTo(cx - r * k, top + alto - h * k));
  g.closePath(); g.fill();
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (const h of [.236, .257]) g.fillRect(cx - alto * .2, top + alto - (h + .011) * k, alto * .4, .007 * k);
  g.restore();
}

export function tele(D) {
  const [W1, H1] = S.insegna.tela, [W2, H2] = S.strike.tela;
  const marchio = mappa((g, W, H) => {
    sagomaBirillo(g, W / 2, 90, 74);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = '500 150px "Bodoni Moda", Didot, serif';
    testo(g, D.insegna.toUpperCase(), W / 2, 322, 16);
    g.font = '400 25px Jost, system-ui, sans-serif';
    testo(g, D.sottotitolo.toUpperCase(), W / 2, 392, 11);
  }, W1, H1);
  const strike = mappa((g, W, H) => {
    g.textBaseline = 'alphabetic'; g.font = 'italic 500 190px "Bodoni Moda", Didot, serif';
    testo(g, 'Strike', W / 2, 232, 4);
  }, W2, H2);
  return { marchio, strike };
}

const VERT = /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = /* glsl */`
${COSTANTI}${RUMORE}${INSEGNA}${LUCI}${AMBIENTE}
uniform sampler2D tMappa; uniform vec2 uPx; uniform float uAcc; uniform float uScia; uniform float uSempre;
varying vec2 vUv; varying vec3 vW;
#define RG ${RANGO.toFixed(1)}
float dist(vec2 uv){ return (texture2D(tMappa, uv).r - .5) * 2. * RG; }
void main(){
  float d = dist(vUv);
  float aa = max(fwidth(d), .02) * .7;
  float faccia = 1. - smoothstep(-aa, aa, d);
  if (faccia < .003) discard;
  // il bordo smussato: la normale piega verso l'esterno vicino al bordo (la distanza cresce verso fuori)
  vec2 g = vec2(dist(vUv + vec2(uPx.x, 0.)) - dist(vUv - vec2(uPx.x, 0.)), dist(vUv + vec2(0., uPx.y)) - dist(vUv - vec2(0., uPx.y)));
  float bordo = smoothstep(-3., -.2, d);
  vec3 n = normalize(vec3(normalize(g + 1e-5) * bordo * 1.5, 1.));
  vec3 V = normalize(cameraPosition - vW), R = reflect(-V, n);
  // ottone spazzolato: righe fini orizzontali, riflesso caldo dell'ambiente, i faretti come lampi
  float spazzola = .82 + .18 * vnoise(vec2(vUv.x * 3., vUv.y * 420.));
  vec3 ottone = vec3(1., .72, .36) * spazzola;
  vec3 col = ottone * (ambiente(vW, R, .3) * 1.4 + vec3(.02, .014, .008));
  col += ottone * luci(vW, n, V, vec3(0.), 70., 1.6, 1.);
  // la luce che esce da dietro le lettere avvolge i bordi
  col += AMBRA * uAcc * bordo * .9 + AMBRA * uAcc * .05;
  // la lama di luce che scorre una volta (in diagonale)
  float lama = exp(-pow((vUv.x + vUv.y * .35 - uScia) / .06, 2.));
  col += vec3(1., .82, .55) * lama * (2. + bordo * 3.5) * step(-.4, uScia);
  // "Strike" non si vede finché non si accende (l'insegna sì: ottone al buio)
  float vis = max(uSempre, smoothstep(0., .35, uAcc));
  gl_FragColor = vec4(col * faccia * vis, faccia * vis);
}`;

export function insegne(scena, U, t) {
  const mat = (mappa, acc, scia, sempre) => new THREE.ShaderMaterial({
    uniforms: { ...U, tMappa: { value: mappa }, uPx: { value: new THREE.Vector2(1 / mappa.image.width, 1 / mappa.image.height) }, uAcc: acc, uScia: scia, uSempre: { value: sempre } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const A = S.insegna, B = S.strike;
  const u = { accM: { value: 0 }, sciaM: { value: -1 }, accS: { value: 0 }, sciaS: { value: -1 } };
  const marchio = new THREE.Mesh(new THREE.PlaneGeometry(A.w, A.h), mat(t.marchio, u.accM, u.sciaM, 1));
  marchio.position.set(A.x, A.y, S.zm + .05);
  const strike = new THREE.Mesh(new THREE.PlaneGeometry(B.w, B.h), mat(t.strike, u.accS, u.sciaS, 0));
  strike.position.set(B.x, B.y, S.zm + .045);
  for (const m of [marchio, strike]) { m.layers.enable(1); m.renderOrder = 2; scena.add(m); }
  return { marchio, strike, u };
}

// il dimmer: da 0 a 1 in `durata` secondi con una curva morbida (lenta all'inizio, si posa piano); mai sfarfallii
export function dimmer(t, t0, durata = 1.3) {
  const u = Math.min(1, Math.max(0, (t - t0) / durata));
  return u * u * u * (u * (u * 6 - 15) + 10);
}
// la lama di luce: parte dopo il dimmer e attraversa le lettere una volta (da -.4 a 1.6 in coordinate del quadro)
export function lama(t, t0, durata = 1.5) {
  const u = (t - t0) / durata;
  if (u <= 0 || u >= 1) return -1;
  return -.4 + 2 * (u * u * (3 - 2 * u));
}
