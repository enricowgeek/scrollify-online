// Velluto · il bar in fondo alla sala: la parete d'ebano con l'onice retroilluminato, i ripiani di vetro coi profili
// d'ottone e le bottiglie in controluce, il bancone in noce cannettato col piano di marmo Portoro (nero con le vene
// d'oro), la barra poggiapiedi d'ottone, gli sgabelli di velluto smeraldo, quattro lampade a globo. Sul bancone due
// cocktail di vetro vero (js/post.js: il vetro legge la scena dietro e la piega): un old fashioned con il ghiaccio e la
// scorza d'arancia, una coppa con la scorza di limone.
import * as THREE from 'three';
import { S, COSTANTI, RUMORE, INSEGNA, LUCI, AMBIENTE, NEBBIA } from './glsl.js';
import { unisci, scatola, piano, VERT, TESTA, FRAG_LUCIDO, FRAG_VELLUTO } from './pista.js';

const B = S.bar, ZB = S.zb, H = B.alto;
const ZF = B.z - .35;          // la faccia del bancone verso la sala
const SCAFFALI = [1.12, 1.56, 2.0], ZS = ZB - .14;

const FRAG_ONICE = /* glsl */`
uniform float uLuce;
void main(){ vec3 c = onice(vW.xy) * uLuce; gl_FragColor = vec4(nebbia(c, vW), 1.); }`;

// ————— la parete d'ebano del bar e i fianchi
const FRAG_EBANO = /* glsl */`
void main(){
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  float g = vnoise(vec2(p.x * 8. + p.z * 8., p.y * 1.2)) * .5 + vnoise(vec2(p.x * 40. + p.z * 40., p.y * 6.)) * .5;
  vec3 alb = vec3(.022, .015, .01) * (.8 + .4 * g);
  vec3 col = luci(p, n, V, alb, 40., .3, 1.) + alb * vec3(.03, .024, .018);
  float F = .04 + .96 * pow(1. - max(dot(n, V), 0.), 5.);
  col += ambiente(p, reflect(-V, n), .3) * F * .5;
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— il bancone: noce cannettato, lavato dalla luce che scende da sotto il piano
const FRAG_BANCO = /* glsl */`
void main(){
  vec3 p = vW, n0 = normalize(vN), V = normalize(cameraPosition - p);
  float u = fract(p.x / .045) * 2. - 1.;
  vec3 n = normalize(n0 + vec3(u * .9, 0., 0.) * step(.9, abs(n0.z)));
  float g = vnoise(vec2(p.x * 25., p.y * 2.)) * .5 + vnoise(vec2(p.x * 120., p.y * 9.)) * .5;
  vec3 alb = vec3(.19, .1, .052) * (.78 + .4 * g) * (.8 + .2 * (1. - abs(u)));
  // la luce nascosta sotto il piano: radente dall'alto, più forte in alto
  float sotto = smoothstep(0., .9, p.y) * step(p.y, ${(H - .02).toFixed(3)});
  vec3 lavaggio = vec3(1., .64, .32) * 1.1 * pow(sotto, 2.2) * (.25 + .75 * max(dot(n, normalize(vec3(0., .9, -.45))), 0.));
  vec3 col = alb * lavaggio + luci(p, n, V, alb, 40., .3, 1.) * .7 + alb * vec3(.02, .016, .012);
  float F = .04 + .96 * pow(1. - max(dot(n, V), 0.), 5.);
  col += ambiente(p, reflect(-V, n), .3) * F * .5;
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— marmo Portoro: nero con le vene d'oro, lucidato a specchio
const FRAG_MARMO = /* glsl */`
void main(){
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  vec2 q = p.xz * 3. + p.y * 3.;
  float m = fbm2(q + vec2(fbm2(q * 1.3 + 2.), fbm2(q * 1.3 + 7.)) * 2.);
  float vena = smoothstep(.035, .0, abs(m - .5)) + smoothstep(.012, .0, abs(fbm2(q * 2.1 + 5.) - .5)) * .6;
  vec3 alb = mix(vec3(.01, .009, .008), vec3(.42, .3, .14), clamp(vena, 0., 1.));
  vec3 col = luci(p, n, V, alb, 300., 1.4, 1.) + alb * vec3(.03, .024, .018);
  float F = .05 + .95 * pow(1. - max(dot(n, V), 0.), 5.);
  col += ambiente(p, reflect(-V, n), .12) * F * .9;
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— le lampade: globi opalini accesi
const FRAG_GLOBO = /* glsl */`
void main(){
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  float c = max(dot(n, V), 0.);
  vec3 col = vec3(1., .68, .4) * (1.4 + 2.6 * pow(c, 2.)) ;
  gl_FragColor = vec4(col, 1.);
}`;

// ————— le bottiglie: vetro in controluce sull'onice, liquido colorato, etichetta, tappo
const VERT_BOTTIGLIA = /* glsl */`
attribute vec3 iLiq; attribute vec2 iEt;
uniform float uAlto;
varying vec3 vW; varying vec3 vN; varying vec3 vLiq; varying vec2 vEt; varying float vY; varying float vAng;
void main(){
  mat4 m = modelMatrix * instanceMatrix;
  vec4 w = m * vec4(position, 1.);
  vW = w.xyz; vN = normalize(mat3(m) * normal); vLiq = iLiq; vEt = iEt; vY = position.y / uAlto; vAng = atan(position.x, -position.z);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG_BOTTIGLIA = /* glsl */`
${COSTANTI}${RUMORE}${INSEGNA}${LUCI}${AMBIENTE}${NEBBIA}
uniform float uLuce; uniform float uCollo;
varying vec3 vW; varying vec3 vN; varying vec3 vLiq; varying vec2 vEt; varying float vY; varying float vAng;
void main(){
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  float nv = max(dot(n, V), 0.);
  // la luce che passa: l'onice dietro, attraverso il vetro e il liquido (più spesso al centro)
  vec3 dietro = onice(p.xy + vec2(0., .05)) * uLuce;
  float liquido = step(vY, vEt.y);
  vec3 tinta = mix(vec3(.62, .68, .6), vLiq, liquido);
  vec3 col = dietro * pow(tinta, vec3(1. + nv * 2.2)) * (.35 + .65 * nv) * .9;
  // etichetta sul davanti (niente scritte): avorio, nera o oro, con un filetto
  float fronte = smoothstep(1.35, 1.15, abs(vAng));
  float et = step(.26, vY) * step(vY, .52) * fronte * step(.5, vEt.x + .01);
  vec3 cEt = vEt.x > 2.5 ? vec3(.5, .36, .16) : (vEt.x > 1.5 ? vec3(.02, .018, .016) : vec3(.62, .56, .44));
  float fil = smoothstep(.006, .0, abs(vY - .3)) + smoothstep(.006, .0, abs(vY - .48));
  cEt = mix(cEt, vec3(.55, .4, .18), fil * .8);
  vec3 lab = luci(p, n, V, cEt, 30., .3, 1.) + cEt * vec3(.05, .035, .02);
  col = mix(col, lab, et);
  // tappo e collo in alto
  float tappo = step(uCollo, vY);
  col = mix(col, luci(p, n, V, vec3(.05, .035, .02), 60., .8, 1.) + vec3(.01, .006, .003), tappo);
  // il vetro: riflessi e un bordo di luce
  float F = .04 + .96 * pow(1. - nv, 5.);
  col += (ambiente(p, reflect(-V, n), .05) * 1.3 + luci(p, n, V, vec3(0.), 200., 1.5, 1.)) * F * (1. - et * .7);
  col += dietro * .25 * pow(1. - nv, 3.) * (1. - et);
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// ————— vetro vero (secondo passaggio, js/post.js): liquido e ghiaccio piegano la scena dietro; il bicchiere riflette
const VETRO_TESTA = /* glsl */`
${COSTANTI}${RUMORE}${INSEGNA}${LUCI}${AMBIENTE}
uniform sampler2D tSfondo; uniform sampler2D tProf; uniform vec2 uRis;
varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
vec2 schermo(){ return gl_FragCoord.xy / uRis; }
void coperto(){ if (gl_FragCoord.z > texture2D(tProf, schermo()).r + 1e-6) discard; }
vec3 piega(vec3 n, float k){ vec3 nv = normalize((viewMatrix * vec4(n, 0.)).xyz); return texture2D(tSfondo, schermo() - nv.xy * k).rgb; }
`;
const VERT_VETRO = /* glsl */`varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec2 vUv;
void main(){ vL = position; vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG_LIQUIDO = /* glsl */`${VETRO_TESTA}
uniform vec3 uTinta;
void main(){
  coperto();
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  if (!gl_FrontFacing) n = -n;
  float nv = max(dot(n, V), 0.);
  vec3 bg = piega(n, .06 * (1.2 - nv));
  // il liquido si accende nella luce delle lampade (diffonde dentro) oltre a lasciar passare lo sfondo
  vec3 col = bg * pow(uTinta, vec3(1.2 + (1. - nv) * 2.)) * 1.1 + uTinta * uTinta * (luci(p, vec3(0., 1., 0.), V, vec3(.9), 4., 0., 1.) * .5 + vec3(.05, .03, .015));
  float F = .02 + .98 * pow(1. - nv, 5.);
  col = mix(col, ambiente(p, reflect(-V, n), .05) * .9, F) + luci(p, n, V, vec3(0.), 200., .7, 1.);
  gl_FragColor = vec4(col, 1.);
}`;
const FRAG_GHIACCIO = /* glsl */`${VETRO_TESTA}
void main(){
  coperto();
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  float nv = max(dot(n, V), 0.);
  vec3 bg = piega(n, .09);
  float brina = vnoise(vL.xy * 180. + vL.z * 90.) * .5 + vnoise(vL.yz * 60.) * .5;
  vec3 col = bg * vec3(.86, .92, .95) + vec3(.5, .55, .6) * .06 * brina * (1. - nv) + vec3(1., .8, .6) * .04 * smoothstep(.55, .8, brina);
  float F = .03 + .97 * pow(1. - nv, 4.);
  col += ambiente(p, reflect(-V, n), .05) * F + luci(p, n, V, vec3(0.), 200., 2., 1.);
  gl_FragColor = vec4(col, 1.);
}`;
const FRAG_BICCHIERE = /* glsl */`${VETRO_TESTA}
void main(){
  coperto();
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  if (!gl_FrontFacing) n = -n;
  float nv = max(dot(n, V), 0.);
  float F = .045 + .955 * pow(1. - nv, 5.);
  vec3 col = ambiente(p, reflect(-V, n), .02) * F * 1.4 + luci(p, n, V, vec3(0.), 400., 2.5, 1.);
  float a = clamp(F * 1.1 + .035, 0., 1.);
  gl_FragColor = vec4(col, a);
}`;
const FRAG_SCORZA = /* glsl */`${VETRO_TESTA}
uniform vec3 uColore;
void main(){
  coperto();
  vec3 p = vW, n = normalize(vN), V = normalize(cameraPosition - p);
  if (!gl_FrontFacing) n = -n;
  float bordo = smoothstep(.3, .48, abs(vUv.y - .5));
  vec3 alb = mix(uColore * (.85 + .3 * vnoise(vUv * vec2(300., 40.))), vec3(.8, .72, .5), bordo);
  vec3 col = luci(p, n, V, alb, 60., .6, 1.) + alb * .06;
  gl_FragColor = vec4(col, 1.);
}`;

// profili a tornio [raggio, altezza]
const BOTTIGLIE = [
  { alto: .31, collo: .9, p: [[0, 0], [.036, 0], [.038, .004], [.038, .21], [.034, .235], [.016, .255], [.013, .27], [.013, .3], [.015, .302], [.015, .31], [0, .31]] },          // gin, dritta
  { alto: .27, collo: .88, p: [[0, 0], [.043, 0], [.046, .006], [.046, .17], [.04, .2], [.018, .215], [.015, .238], [.016, .262], [.017, .27], [0, .27]] },                            // whisky, larga
  { alto: .34, collo: .9, p: [[0, 0], [.034, 0], [.036, .005], [.036, .2], [.03, .24], [.014, .28], [.012, .31], [.013, .335], [.013, .34], [0, .34]] },                              // lunga, collo lungo
  { alto: .23, collo: .86, p: [[0, 0], [.03, 0], [.046, .03], [.052, .09], [.046, .14], [.02, .175], [.014, .19], [.014, .21], [.016, .222], [.016, .23], [0, .23]] },               // liquore, tonda
];
const LIQUIDI = [[.8, .38, .08], [.9, .93, .88], [.36, .1, .025], [.35, .62, .1], [.78, .06, .05], [.95, .7, .2], [.55, .22, .05]];

function tornio(p, seg = 24) { return new THREE.LatheGeometry(p.map(([r, h]) => new THREE.Vector2(r, h)), seg); }
function cuboTondo(l, e = 5) {
  // superellissoide: la direzione di ogni vertice del cubo suddiviso, alla distanza della superficie |x|^e + |y|^e + |z|^e = 1
  const g = new THREE.BoxGeometry(1, 1, 1, 10, 10, 10), a = g.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const x = a.getX(i), y = a.getY(i), z = a.getZ(i), d = Math.hypot(x, y, z);
    const ux = x / d, uy = y / d, uz = z / d, r = Math.pow(Math.abs(ux) ** e + Math.abs(uy) ** e + Math.abs(uz) ** e, -1 / e) * l / 2;
    a.setXYZ(i, ux * r, uy * r, uz * r);
  }
  g.computeVertexNormals(); return g;
}
// una scorza: nastro lungo una curva, che si attorciglia un poco (uv.y = attraverso il nastro, per il bordo chiaro)
function scorza(larg, curva, giri = .6) {
  const N = 28, M = 4, pos = [], uv = [], idx = [];
  const P = t => new THREE.Vector3(...curva(t));
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = P(t), tg = P(Math.min(1, t + .01)).sub(P(Math.max(0, t - .01))).normalize();
    const lato = new THREE.Vector3(0, 1, 0).cross(tg).normalize(), su = tg.clone().cross(lato).normalize();
    const a = (t - .5) * giri * Math.PI, w = lato.multiplyScalar(Math.cos(a)).add(su.multiplyScalar(Math.sin(a)));
    for (let j = 0; j <= M; j++) { const s = j / M - .5, q = c.clone().addScaledVector(w, s * larg * (1 - Math.pow(Math.abs(t - .5) * 2, 6) * .6)); pos.push(q.x, q.y, q.z); uv.push(t, j / M); }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function bar(scena, U, { telefono }) {
  const gruppo = new THREE.Group(); scena.add(gruppo);
  const mat = (frag, extra = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: VERT, fragmentShader: TESTA + frag });
  const inRiflesso = o => { o.layers.enable(1); return o; };
  const larg = B.x1 - B.x0, xm = (B.x0 + B.x1) / 2;
  const uLuce = { value: 1 };

  // ——— parete di fondo d'ebano, l'onice, i ripiani
  gruppo.add(inRiflesso(new THREE.Mesh(piano(S.xw * 2, S.yc, 0, S.yc / 2, ZB, 0, Math.PI), mat(FRAG_EBANO))));
  gruppo.add(inRiflesso(new THREE.Mesh(piano(larg, 1.6, xm, 1.72, ZB - .01, 0, Math.PI), mat(FRAG_ONICE, { uLuce }))));
  // cornice d'ottone dell'onice e ripiani (vetro scuro con il bordo d'ottone)
  const ott = [];
  for (const y of [.92, 2.52]) { const c = new THREE.CylinderGeometry(.008, .008, larg + .02, 8); c.rotateZ(Math.PI / 2); c.translate(xm, y, ZB - .015); ott.push(c); }
  for (const x of [B.x0 - .01, B.x1 + .01]) { const c = new THREE.CylinderGeometry(.008, .008, 1.6, 8); c.translate(x, 1.72, ZB - .015); ott.push(c); }
  for (const y of SCAFFALI) { const c = new THREE.CylinderGeometry(.006, .006, larg - .1, 8); c.rotateZ(Math.PI / 2); c.translate(xm, y - .004, ZS - .12); ott.push(c); }
  // ——— la barra poggiapiedi e i supporti
  { const c = new THREE.CylinderGeometry(.022, .022, larg - .2, 14); c.rotateZ(Math.PI / 2); c.translate(xm, .2, ZF - .14); ott.push(c); }
  for (let i = 0; i < 6; i++) { const x = B.x0 + .2 + i * (larg - .4) / 5, c = new THREE.CylinderGeometry(.01, .01, .14, 8); c.rotateX(Math.PI / 2); c.translate(x, .2, ZF - .07); ott.push(c); }
  // profilo d'ottone sul bordo del piano
  { const c = new THREE.CylinderGeometry(.009, .009, larg + .08, 10); c.rotateZ(Math.PI / 2); c.translate(xm, H - .025, ZF - .092); ott.push(c); }
  const matOtt = mat(FRAG_LUCIDO, { uColore: { value: new THREE.Color(1, .72, .36) }, uRuvido: { value: .18 }, uMetallo: { value: 1 } });
  gruppo.add(inRiflesso(new THREE.Mesh(unisci(ott), matOtt)));
  const vetroScuro = mat(FRAG_LUCIDO, { uColore: { value: new THREE.Color(.02, .018, .016) }, uRuvido: { value: .05 }, uMetallo: { value: 0 } });
  gruppo.add(new THREE.Mesh(unisci(SCAFFALI.map(y => scatola(larg - .1, .012, .26, xm, y - .006, ZS)), ), vetroScuro));

  // ——— il bancone: fronte cannettato, fianchi, piano di marmo
  const fronte = inRiflesso(new THREE.Mesh(unisci([
    scatola(larg, H - .05, .06, xm, (H - .05) / 2, ZF + .03),
    scatola(.06, H - .05, .7, B.x0 + .03, (H - .05) / 2, B.z), scatola(.06, H - .05, .7, B.x1 - .03, (H - .05) / 2, B.z),
  ]), mat(FRAG_BANCO)));
  const piano_ = inRiflesso(new THREE.Mesh(scatola(larg + .08, .05, .8, xm, H - .025, B.z - .04), mat(FRAG_MARMO)));
  gruppo.add(fronte, piano_);

  // ——— le lampade a globo con lo stelo d'ottone
  const globi = [], steli = [];
  for (let i = 0; i < 4; i++) {
    const x = -2.25 + i * 1.5;
    globi.push(new THREE.SphereGeometry(.12, 24, 16).translate(x, 2.2, B.z - .02));
    const c = new THREE.CylinderGeometry(.006, .006, S.yc - 2.3, 6); c.translate(x, (S.yc + 2.3) / 2, B.z - .02); steli.push(c);
    const k = new THREE.CylinderGeometry(.03, .045, .05, 16); k.translate(x, 2.33, B.z - .02); steli.push(k);
  }
  gruppo.add(inRiflesso(new THREE.Mesh(unisci(globi), mat(FRAG_GLOBO))));
  gruppo.add(new THREE.Mesh(unisci(steli), matOtt));

  // ——— gli sgabelli: base e stelo d'ottone, seduta di velluto smeraldo
  const basi = [], sedute = [];
  for (let i = 0; i < 5; i++) {
    const x = -2.2 + i * 1.1, z = ZF - .5;
    basi.push(tornio([[0, 0], [.2, 0], [.2, .012], [.05, .03], [.025, .05], [0, .05]], 28).translate(x, 0, z));
    const st = new THREE.CylinderGeometry(.022, .022, .68, 12); st.translate(x, .38, z); basi.push(st);
    const an = new THREE.TorusGeometry(.17, .01, 8, 32); an.rotateX(Math.PI / 2); an.translate(x, .3, z); basi.push(an);
    sedute.push(tornio([[0, 0], [.19, 0], [.205, .02], [.21, .05], [.2, .085], [.17, .1], [0, .105]], 32).translate(x, .72, z));
  }
  gruppo.add(inRiflesso(new THREE.Mesh(unisci(basi), matOtt)));
  const matSeduta = mat(FRAG_VELLUTO, { uColore: { value: new THREE.Color(.012, .1, .065) }, uPieghe: { value: 0 } });
  gruppo.add(inRiflesso(new THREE.Mesh(unisci(sedute), matSeduta)));

  // ——— le bottiglie sui ripiani (una maglia per forma)
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const posti = BOTTIGLIE.map(() => []);
  SCAFFALI.forEach((y, r) => {
    let x = B.x0 + .18;
    let k = 0;
    while (x < B.x1 - .18) {
      const f = Math.floor(h(k, r) * 4), b = BOTTIGLIE[f];
      posti[f].push([x, y, ZS + (h(r, k) - .5) * .06, Math.floor(h(k + 3, r) * LIQUIDI.length), Math.floor(h(k, r + 5) * 4), .35 + h(k + 7, r) * .5]);
      x += .13 + h(k + 1, r) * .09 + (h(k + 2, r) > .82 ? .22 : 0);
      k++;
    }
  });
  const matrice = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), uno = new THREE.Vector3(1, 1, 1);
  BOTTIGLIE.forEach((b, f) => {
    const n = posti[f].length; if (!n) return;
    const geo = tornio(b.p, telefono ? 18 : 24);
    const im = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: { ...U, uAlto: { value: b.alto }, uCollo: { value: b.collo }, uLuce }, vertexShader: VERT_BOTTIGLIA, fragmentShader: FRAG_BOTTIGLIA }), n);
    const liq = new Float32Array(n * 3), et = new Float32Array(n * 2);
    posti[f].forEach(([x, y, z, l, e, liv], i) => {
      qq.setFromAxisAngle(vv.set(0, 1, 0), (h(i, f) - .5) * .5);
      matrice.compose(vv.set(x, y, z), qq, uno); im.setMatrixAt(i, matrice);
      liq.set(LIQUIDI[l], i * 3); et.set([e, Math.min(b.collo - .05, liv)], i * 2);
    });
    geo.setAttribute('iLiq', new THREE.InstancedBufferAttribute(liq, 3));
    geo.setAttribute('iEt', new THREE.InstancedBufferAttribute(et, 2));
    im.computeBoundingSphere();
    im.layers.enable(1);
    gruppo.add(im);
  });

  // ——— i cocktail (vetro vero, strato 3: si disegnano nel secondo passaggio)
  const vetri = new THREE.Group(); scena.add(vetri);
  const uV = { tSfondo: { value: null }, tProf: { value: null }, uRis: { value: new THREE.Vector2(1, 1) } };
  const matV = (frag, extra = {}, opz = {}) => new THREE.ShaderMaterial({ uniforms: { ...U, ...uV, ...extra }, vertexShader: VERT_VETRO, fragmentShader: frag, ...opz });
  const trasparente = { transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, side: THREE.DoubleSide };
  const aggiungi = (geo, m, pos, ordine) => { const x = new THREE.Mesh(geo, m); x.position.copy(pos); x.layers.set(3); x.renderOrder = ordine; vetri.add(x); return x; };
  // old fashioned: bicchiere basso e pesante, whisky, un cubo di ghiaccio, la scorza d'arancia
  const pR = new THREE.Vector3(1.3, H, ZF + .17);
  aggiungi(tornio([[0, .0145], [.0385, .0145], [.0393, .062], [0, .062]], 40), matV(FRAG_LIQUIDO, { uTinta: { value: new THREE.Color(.92, .5, .16) } }), pR, 1);
  const ghiaccio = aggiungi(cuboTondo(.044, 6), matV(FRAG_GHIACCIO), pR.clone().add(new THREE.Vector3(.002, .052, 0)), 2);
  ghiaccio.rotation.set(.12, .5, .08);
  const arancia = aggiungi(scorza(.017, t => [Math.sin(t * 1.9 - .3) * .034, .1 - t * .05, -Math.cos(t * 1.9 - .3) * .034 + t * .01], .8), matV(FRAG_SCORZA, { uColore: { value: new THREE.Color(.9, .32, .03) } }, { side: THREE.DoubleSide }), pR.clone().add(new THREE.Vector3(.004, 0, 0)), 3);
  aggiungi(tornio([[0, .0145], [.039, .0145], [.041, .093], [.0435, .093], [.0428, .005], [.039, 0], [0, 0]], 48), matV(FRAG_BICCHIERE, {}, trasparente), pR, 5);
  // coppa: vetro sottile a stelo, un sour dorato, la scorza di limone sul bordo
  const pC = new THREE.Vector3(1.47, H, ZF + .31);
  const ciotola = (r0, y0, r1, y1, n, dentro) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, e = Math.sin(t * Math.PI / 2); return [r0 + (r1 - r0) * Math.pow(t, .7), y0 + (y1 - y0) * (1 - Math.cos(t * Math.PI / 2)) * .55 + (y1 - y0) * t * .45]; });
  const liq = ciotola(.0005, .1155, .0515, .146, 18);
  aggiungi(tornio([[0, .1155], ...liq, [0, .146]], 48), matV(FRAG_LIQUIDO, { uTinta: { value: new THREE.Color(.97, .82, .42) } }), pC, 1);
  aggiungi(scorza(.011, t => [Math.cos(t * 1.4 + 2.2) * .058, .163 - Math.sin(t * Math.PI) * .012 - t * .008, Math.sin(t * 1.4 + 2.2) * .058], 1.2), matV(FRAG_SCORZA, { uColore: { value: new THREE.Color(.95, .78, .06) } }, { side: THREE.DoubleSide }), pC, 3);
  const interno = ciotola(.0005, .1145, .0575, .158, 20), esterno = ciotola(.0045, .104, .0595, .158, 20).reverse();
  aggiungi(tornio([[0, .1145], ...interno, ...esterno, [.0045, .1], [.0042, .014], [.02, .007], [.034, .003], [.036, .001], [.036, 0], [0, 0]], 56), matV(FRAG_BICCHIERE, {}, trasparente), pC, 5);
  // i sottobicchieri d'ottone
  gruppo.add(new THREE.Mesh(unisci([new THREE.CylinderGeometry(.052, .052, .004, 32).translate(pR.x, H + .002, pR.z), new THREE.CylinderGeometry(.05, .05, .004, 32).translate(pC.x, H + .002, pC.z)]), matOtt));
  const sfera = new THREE.Sphere(new THREE.Vector3((pR.x + pC.x) / 2, H + .08, (pR.z + pC.z) / 2), .2);
  return { gruppo, vetri, uV, sfera, uLuce };
}
