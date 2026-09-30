// Doppio Strato · il palco: UNA scena, un renderer. I quattro burger in giostra, ognuno sul suo piatto di porcellana nera, su un
// piano di pietra nera, sotto una luce calda e netta dall'alto. Lo scroll li fa passare UNO ALLA VOLTA: il burger davanti è
// chiuso, si apre a strati come nella foto esplosa (ogni strato sale al suo posto), si richiude cadendo (i più bassi arrivano
// prima, il pane di sopra per ultimo; a ogni arrivo un tonfo, niente rimbalzi) e il formaggio cola un filo di più; poi la giostra
// gira al burger dopo, che fa lo stesso. Tutto reversibile. La giostra si trascina (quando il burger davanti è chiuso: tornano
// in vista gli altri); da aperto il trascinamento gira il burger.
// uso: const p = await monta(host, { burger: [{ id, nome }…], zona(W, H, fase) }); p.vai(P) (0…1 = avanzamento della sezione)
// restituisce { vai(P), fissa(P), stato(), etichette(lato), strati(i), su(evento, f), info(), momento(k, fase), … }
// eventi: 'centro' (i) quando cambia il burger davanti · 'costruito' (i) · 'errore' (i, e) · 'fotogramma'
import * as THREE from 'three';
import { carica, costruisci, DIAMETRO } from './burger.js';
import { pub } from './luce.js';
import { PASSI, linea } from './linea.js';

const TAU = Math.PI * 2;
const FOV = 24;

export { PASSI, linea } from './linea.js';

// giostra (a = |d| = 0, 1, 2): fx = posizione orizzontale in mezze larghezze visibili a quella profondità; z = profondità (cm);
// ang = girato verso il centro; luce = penombra; tuffo = durante lo scambio arretrano un poco
const ALTO = { fx: [0, 1.16, 1.9], z: [0, -26, -62], ang: [0, .62, 1.1], luce: [1, .36, 0], tuffo: 8 };
const LARGO = { fx: [0, .66, 1.22], z: [0, -30, -68], ang: [0, .52, .95], luce: [1, .42, 0], tuffo: 7 };
// apertura (panoramica): i due vicini raccolti dietro al centrale, più piccoli e in penombra
const ALTO_P = { fx: [0, .8, 1.3], z: [0, -40, -85], ang: [0, .34, .6], luce: [1, .3, 0] };
const LARGO_P = { fx: [0, .7, 1.2], z: [0, -44, -80], ang: [0, .4, .7], luce: [1, .42, 0] };
const TENUTA = .62;
const PIATTO_R = 10.3, FONDO_PIATTO = .5;   // cm: raggio del piatto e quota del suo fondo (dove poggia il burger)
const liscio = t => t * t * (3 - 2 * t);
const tra = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const mix = (a, b, t) => a + (b - a) * t;
function curva(K, a) {   // Hermite fra i valori a 0, 1, 2 (tangente nulla al centro)
  if (a >= 2) return K[2];
  const i = a < 1 ? 0 : 1, t = a - i, p0 = K[i], p1 = K[i + 1];
  const m0 = i === 0 ? 0 : (K[2] - K[0]) / 2, m1 = i === 0 ? (K[2] - K[0]) / 2 : K[2] - K[1];
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (3 * t2 - 2 * t3) * p1 + (t3 - t2) * m1;
}

// ————————————————————————————— il piatto, il piano, la luce —————————————————————————————
// piatto da ristorante: fondo piano largo, tesa che sale dolce, labbro sottile arrotondato; sotto, il piede ad anello.
// Porcellana nera smaltata: quasi nera, lucida (clearcoat a specchio): i softbox dell'ambiente ci fanno righe nette
let geoPiatto = null, matPiatto = null;
export function piatto() {
  if (!geoPiatto) {
    const sopra = new THREE.SplineCurve([[0, FONDO_PIATTO], [4, FONDO_PIATTO], [6.6, FONDO_PIATTO + .01], [7.5, .58], [8.6, .82], [9.6, 1.02], [10.12, 1.12], [10.3, 1.1]].map(([x, y]) => new THREE.Vector2(x, y)));
    const labbro = new THREE.QuadraticBezierCurve(new THREE.Vector2(10.3, 1.1), new THREE.Vector2(10.42, 1.04), new THREE.Vector2(10.26, .98));
    const sotto = new THREE.SplineCurve([[10.26, .98], [9.6, .86], [8.4, .6], [7.2, .34], [6.3, .16], [6.05, .02], [5.7, 0], [5.45, .1], [4, .16], [0, .16]].map(([x, y]) => new THREE.Vector2(x, y)));
    const P = [...sopra.getPoints(30), ...labbro.getPoints(6).slice(1), ...sotto.getPoints(14).slice(1)].reverse();
    geoPiatto = new THREE.LatheGeometry(P, 80);   // ~7,5k triangoli
    // lo smalto: sotto quasi nero e liscio, sopra uno strato a specchio (righe nette dei softbox, niente velo largo)
    matPiatto = new THREE.MeshPhysicalMaterial({ color: 0x020202, roughness: .06, metalness: 0, clearcoat: 1, clearcoatRoughness: .02,
      specularIntensity: .45, envMapIntensity: 1 });
  }
  return new THREE.Mesh(geoPiatto, matPiatto);
}
export function ombra(r, forza, morbido = .55) {   // ombra morbida tonda (texture radiale), in un piano orizzontale
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(0,0,0,${forza})`); gr.addColorStop(1 - morbido, `rgba(0,0,0,${forza * .8})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
// piano di pietra nera (marmo nero con venature appena accennate, canvas). Niente luci vere: la pozza della lampada è disegnata
// (più netta al bordo, come uno spot), più un velo lucido dove la lampada si riflette verso la camera
const POZZA = { value: new THREE.Vector4(2.4, 40, 0, 0) };   // forza, raggio (cm)
let pianoCondiviso = null;
export function pietra() {
  if (pianoCondiviso) { const m = new THREE.Mesh(pianoCondiviso.geometry, pianoCondiviso.material); m.rotation.copy(pianoCondiviso.rotation); return m; }
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  let seme = 11; const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#121212'; g.fillRect(0, 0, S, S);
  // nuvole appena più chiare e più scure (il marmo non è piatto)
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, r = 60 + rnd() * 220, gr = g.createRadialGradient(x, y, 0, x, y, r);
    const chiaro = rnd() < .5; gr.addColorStop(0, chiaro ? 'rgba(40,38,36,.16)' : 'rgba(0,0,0,.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // venature sottili, grigio caldo, che si biforcano (ripetibili ai bordi: si disegnano anche spostate di ±S)
  const vena = (x, y, ang, lung, larg, a, prof) => {
    const pts = [[x, y]];
    for (let i = 0; i < lung; i += 6) { ang += (rnd() - .5) * .35; x += Math.cos(ang) * 6; y += Math.sin(ang) * 6; pts.push([x, y]); if (prof < 2 && rnd() < .012) vena(x, y, ang + (rnd() - .5) * 1.4, lung * .45, larg * .6, a * .8, prof + 1); }
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1] + dy); for (const [px, py] of pts) g.lineTo(px + dx, py + dy);
      g.strokeStyle = `rgba(150,142,132,${a})`; g.lineWidth = larg; g.stroke();
      g.strokeStyle = `rgba(150,142,132,${a * .25})`; g.lineWidth = larg * 5; g.stroke();
    }
  };
  for (let i = 0; i < 7; i++) vena(rnd() * S, rnd() * S, rnd() * TAU, 500 + rnd() * 700, .8 + rnd() * 1.1, .1 + rnd() * .12, 0);
  // grana fine
  const im = g.getImageData(0, 0, S, S), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.2, 2.2); t.anisotropy = 8;
  const m = new THREE.MeshBasicMaterial({ map: t, color: 0xffffff });
  m.onBeforeCompile = sh => {
    sh.uniforms.uPozza = POZZA;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMondo;').replace('#include <fog_vertex>', '#include <fog_vertex>\nvMondo = (modelMatrix * vec4(position, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vMondo; uniform vec4 uPozza;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float dP = length((vMondo.xz - vec2(0., 3.)) * vec2(1., 1.2));
        float pozza = pow(1. - smoothstep(uPozza.y * .35, uPozza.y, dP), 1.6) * .9 + .1 * (1. - smoothstep(0., uPozza.y * 2.4, dP));
        vec3 V = normalize(cameraPosition - vMondo), L = normalize(vec3(0., 72., 10.) - vMondo), Hh = normalize(V + L);
        float lucido = pow(max(Hh.y, 0.), 220.) * .9 + pow(max(Hh.y, 0.), 28.) * .07;   // il velo lucido della pietra levigata
        diffuseColor.rgb = diffuseColor.rgb * vec3(1., .88, .74) * pozza * uPozza.x + vec3(1., .9, .78) * lucido * (.25 + .75 * pozza);`);
  };
  const piano = new THREE.Mesh(new THREE.CircleGeometry(170, 64), m);
  piano.rotation.x = -Math.PI / 2; piano.rotation.z = .5;
  pianoCondiviso = piano;
  return piano;
}
export { PIATTO_R, FONDO_PIATTO };
function cono(alto, rBasso) {
  // il fascio della lampada, appena visibile nell'aria: additivo, più denso al centro della sagoma, sfuma in alto e al piano
  const g = new THREE.CylinderGeometry(1.4, rBasso, alto, 64, 8, true); g.translate(0, alto / 2, 0);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uForza: { value: .08 }, uAlto: { value: alto }, uColore: { value: new THREE.Color(1, .86, .68) } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.); vY = position.y; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uForza; uniform float uAlto; uniform vec3 uColore; varying vec3 vN; varying vec3 vV; varying float vY;
      void main(){
        float d = pow(abs(dot(normalize(vN), vV)), 2.2), y = vY / uAlto;
        gl_FragColor = vec4(uColore * d * smoothstep(.04, .34, y) * (1. - smoothstep(.6, 1., y)) * uForza, 1.);
      }`,
  });
  return new THREE.Mesh(g, m);
}

// ————————————————————————————— il palco —————————————————————————————
export async function monta(host, O) {
  const t0 = performance.now(), tempi = {};
  const voci = O.burger, N = voci.length, LN = linea(N);
  const fermo = O.fermo ?? matchMedia('(prefers-reduced-motion:reduce)').matches;
  const grossolano = matchMedia('(pointer:coarse)').matches;
  let pr = Math.min(devicePixelRatio || 1, 2);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!O.conserva });
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const tela = renderer.domElement;
  Object.assign(tela.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' });
  host.appendChild(tela);
  const FONDO = new THREE.Color(O.fondo ?? '#060606');
  const scena = new THREE.Scene(); scena.background = FONDO;
  scena.fog = new THREE.Fog(FONDO, 70, 180);   // i lontani affondano nel nero
  const env = pub(renderer); scena.environment = env.texture; scena.environmentIntensity = 1;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 5, 600);
  // luci: la lampada calda dall'alto (spot netto sul posto davanti), la chiave morbida davanti a sinistra (come nelle foto),
  // un controluce caldo dietro (i bordi, come nelle foto di cibo), un filo dal basso e l'emisfero neutro
  const spot = new THREE.SpotLight(0xffdfb8, 3.4, 0, .34, .45, 0); spot.position.set(0, 72, 10); spot.target.position.set(0, 0, 0);
  const chiave = new THREE.DirectionalLight(0xfff6ec, 2.2); chiave.position.set(-12, 20, 30);
  const contro = new THREE.DirectionalLight(0xffc88a, 1.9); contro.position.set(8, 16, -30);
  const sotto = new THREE.DirectionalLight(0xffe0c0, .4); sotto.position.set(0, -10, 14);
  const emi = new THREE.HemisphereLight(0xfff4ea, 0x2a2420, .45);
  scena.add(spot, spot.target, chiave, contro, sotto, emi);
  const piano = pietra(); scena.add(piano);
  const fascio = cono(52, 17); fascio.position.set(0, -.5, 2); scena.add(fascio);
  const U_FONDO = { value: FONDO.clone() };   // il burger al buio sfuma nel colore del fondo (uFondo)

  // ——— i posti: piatto + ombre + burger (costruito quando arriva) + il suo stato (apertura, caduta, tonfi, colata) ———
  const posti = voci.map((v, i) => {
    const perno = new THREE.Group(), giro = new THREE.Group();
    perno.add(giro);
    const pt = piatto(); giro.add(pt);
    const oT = ombra(PIATTO_R * 1.18, .85, .4); oT.position.y = .02; perno.add(oT);                // il piatto sul piano
    const oP = ombra(DIAMETRO * .56, .85, .42); oP.position.y = FONDO_PIATTO + .015; giro.add(oP);   // il burger sul piatto
    perno.visible = false; scena.add(perno);
    return { i, v, perno, giro, pt, oT, oP, B: null, pronto: false, luce: 0, a: 9, nascita: 0,
      AP: new Float32Array(16), V: new Float32Array(16), SCH: new Float32Array(16), caduta: false, cola: 0, tonfi: [] };
  });

  // ——— stato ———
  let Pm = 0, P = 0;                       // avanzamento chiesto e lisciato
  let xDrag = 0, xDragM = 0, mano = 0, tMano = -1e9;   // trascinamento della giostra (in burger) e quanto la giostra è "in mano"
  let presa = null, ultimoMoto = performance.now(), sporco = true, visibile = true, inPausa = false, tPrima = 0, dondolo = 0;
  let soggetto = 0;                        // il burger davanti
  const ascolta = {};
  const emetti = (n, ...a) => { for (const f of ascolta[n] ?? []) f(...a); };
  const trascinamento = { giro: 0, v: 0, t: 0 };   // da aperto il dito gira il burger
  const ST = { s: 0, k0: 1, kE: 0, chiuso: 1, aperto: 0, seg: 0, ultimo: false };   // per la pagina (stato())

  // ——— misure: camera e zone ———
  let W = 1, H = 1, aspetto = 1;
  const tanM = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const L = { fx: [0, 0, 0], z: [0, 0, 0], ang: [0, 0, 0], luce: [0, 0, 0], tuffo: 0 }, LP = { fx: [0, 0, 0], z: [0, 0, 0], ang: [0, 0, 0], luce: [0, 0, 0] };
  const LM = { fx: [0, 0, 0], z: [0, 0, 0], ang: [0, 0, 0], luce: [0, 0, 0] };
  function misura() {
    W = host.clientWidth || innerWidth; H = host.clientHeight || innerHeight; aspetto = W / H;
    renderer.setSize(W, H, false); camera.aspect = aspetto;
    const k = liscio(tra(aspetto, .7, 1.4));
    for (const c of ['fx', 'z', 'ang', 'luce']) for (let i = 0; i < 3; i++) { L[c][i] = mix(ALTO[c][i], LARGO[c][i], k); LP[c][i] = mix(ALTO_P[c][i], LARGO_P[c][i], k); }
    L.tuffo = mix(ALTO.tuffo, LARGO.tuffo, k);
    sporco = true;
  }
  misura();
  new ResizeObserver(misura).observe(host);

  // camera: guarda (0, ty, 0) da elevazione e, a distanza D tale che il riquadro (alto h, largo w) stia nella zona dello schermo
  // (frazioni: x0 x1 y0 y1), con la finestra spostata perché il riquadro cada nella zona (ancora: 0 in alto … 0,5 al centro)
  const cam = { ty: 0, e: 0, D: 100, cx: .5, cy: .5 };
  function inquadra(out, h, w, z, e, ty) {
    const zh = z.y1 - z.y0, zw = z.x1 - z.x0;
    out.D = Math.max(h / 2 / tanM / zh, w / 2 / (tanM * aspetto) / zw);
    const fh = h / (2 * out.D * tanM), an = z.ancora ?? .5;
    out.e = e; out.ty = ty; out.cx = (z.x0 + z.x1) / 2; out.cy = z.y0 + fh / 2 + (zh - fh) * an;
    return out;
  }
  const cG = { ty: 0, e: 0, D: 0, cx: 0, cy: 0 }, cA = { ...cG }, cE = { ...cG }, cF = { ...cG };
  let vistaLibera = null;   // verifiche: { y (cm dal piano), D, e, az, x }
  let hS = 0;   // altezza del burger davanti adesso (lisciata: la camera si allarga e si stringe con calma)
  let ariaFissa = null, colaFissa = null;
  // aria fra gli strati aperti: sul telefono (schermo stretto e alto) di più, così il burger aperto è più alto che largo
  const ARIA = () => ariaFissa ?? mix(1.55, 1.14, liscio(tra(aspetto, .6, 1.1)));
  function camera_(k0, kE, scossa, dt) {
    // k0 = panoramica (1 in apertura), kE = dentro (0 giostra … 1 il burger davanti da solo)
    const S = posti[soggetto], Bs = S.B ?? posti.find(p => p.B)?.B;
    const hC = Bs ? Bs.altezzaChiuso : 12, r = Bs ? Bs.raggio : 6, hAs = Bs ? Bs.strati[0].yA * ARIA() + Bs.strati[0].sopra : 17;
    const hM = hC + (hAs - hC) * (S.B ? S.AP[0] : 0);
    hS = hS && dt ? hS + (hM - hS) * (1 - Math.exp(-dt / 420)) : hM;
    // chiuso (prima di aprirsi e dopo il tonfo): centrato e grande; aperto: accanto alle etichette, segue l'altezza
    const chiusoK = liscio(1 - tra((hS - hC) / Math.max(.1, hAs - hC), .02, .6));
    ST.chiuso = chiusoK; ST.hS = hS; ST.hC = hC; ST.hA = hAs;
    const zG = O.zona(W, H, 'giostra'), zA = O.zona(W, H, 'apertura'), zE = O.zona(W, H, 'dentro'), zF = O.zona(W, H, 'chiuso');
    // sul telefono il burger comanda la larghezza (il piatto può uscire dai lati): più grande
    const wG = mix(r * 2.45, PIATTO_R * 2.1, liscio(tra(aspetto, .7, 1.2)));
    inquadra(cG, hC + 3.2, wG, zG, .14, 1.4 + hC * .46);
    inquadra(cA, hC + 3.2, wG, zA, .22, 1.4 + hC * .5);
    inquadra(cE, hS * 1.04 + 3.6, r * 2.12, zE, .03, .2 + hS * .5);   // col labbro del piatto davanti
    inquadra(cF, hC + 3, mix(r * 2.2, PIATTO_R * 1.7, liscio(tra(aspetto, .7, 1.2))), zF, .12, 1.2 + hC * .47);
    for (const k of ['ty', 'e', 'D', 'cx', 'cy']) cE[k] = mix(cE[k], cF[k], chiusoK);
    const g = { ty: mix(cG.ty, cA.ty, k0), e: mix(cG.e, cA.e, k0), D: mix(cG.D, cA.D, k0), cx: mix(cG.cx, cA.cx, k0), cy: mix(cG.cy, cA.cy, k0) };
    cam.ty = mix(g.ty, cE.ty, kE); cam.e = mix(g.e, cE.e, kE); cam.D = mix(g.D, cE.D, kE); cam.cx = mix(g.cx, cE.cx, kE); cam.cy = mix(g.cy, cE.cy, kE);
    if (vistaLibera) {
      const v = vistaLibera; camera.clearViewOffset();
      camera.position.set((v.x ?? 0) + v.D * Math.cos(v.e) * Math.sin(v.az ?? 0), v.y + v.D * Math.sin(v.e), v.D * Math.cos(v.e) * Math.cos(v.az ?? 0));
      camera.lookAt(v.x ?? 0, v.y, 0); camera.near = 1; camera.far = 800; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      return chiusoK;
    }
    camera.setViewOffset(W, H, (.5 - cam.cx) * W, (.5 - cam.cy) * H, W, H);
    camera.position.set(0, cam.ty + cam.D * Math.sin(cam.e) - scossa, cam.D * Math.cos(cam.e));
    camera.lookAt(0, cam.ty - scossa, 0);
    camera.near = cam.D * .15; camera.far = cam.D * 4 + 200;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    return chiusoK;
  }

  // ——— costruzione dei burger (il primo subito, gli altri quando il browser è libero) ———
  async function costruisciPosto(p) {
    if (p.pronto || p.inCorso) return;
    p.inCorso = true;
    try {
      const t = performance.now();
      const C = await carica(p.v.id, O.base ?? 'img/');
      const B = costruisci(C, { fondo: U_FONDO, seg: O.segmenti ?? 48 });
      B.gruppo.position.y = FONDO_PIATTO + B.fondoSotto;   // sul fondo del piatto
      p.giro.add(B.gruppo); p.B = B;
      p.perno.visible = true;
      renderer.compile(scena, camera);
      p.pronto = true; p.nascita = performance.now(); p.tempo = performance.now() - t;
      sporco = true;
      emetti('costruito', p.i);
    } catch (e) { console.warn('Doppio Strato: burger non costruito', p.v.id, e); p.fallito = true; emetti('errore', p.i, e); }
    p.inCorso = false;
  }
  camera_(1, 0, 0, 0);
  await costruisciPosto(posti[0]);
  posti[0].nascita = -1e9;
  aggiorna(0, performance.now()); renderer.render(scena, camera);
  tempi.primo = performance.now() - t0;
  const quandoLibero = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 60));
  let fineTutti; const tutti = new Promise(r => { fineTutti = r; });
  (function prossimo() {
    const p = posti.find(q => !q.pronto && !q.fallito && !q.inCorso);
    if (!p) { tempi.tutti = performance.now() - t0; fineTutti(); return; }
    quandoLibero(() => costruisciPosto(p).then(prossimo));
  })();

  // ——— puntatore: in orizzontale, burger aperto → lo gira; burger chiuso → gira la giostra (gli altri tornano in vista) ———
  tela.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    presa = { id: e.pointerId, x0: e.clientX, y0: e.clientY, xl: e.clientX, tl: performance.now(), modo: null, v: 0 };
  });
  tela.addEventListener('pointermove', e => {
    if (!presa || presa.id !== e.pointerId) return;
    const dx = e.clientX - presa.xl, now = performance.now(); presa.xl = e.clientX;
    if (!presa.modo) {
      const ax = Math.abs(e.clientX - presa.x0), ay = Math.abs(e.clientY - presa.y0);
      if (ax > 8 && ax > ay * 1.2) { presa.modo = ST.kE > .5 && ST.aperto > .04 ? 'burger' : 'giostra'; tela.setPointerCapture?.(e.pointerId); }
      else if (ay > 8) presa.modo = 'scorre';
      if (presa.modo !== 'burger' && presa.modo !== 'giostra') return;
    }
    if (presa.modo === 'scorre') return;
    ultimoMoto = now; sporco = true;
    if (presa.modo === 'burger') { const dv = dx * (grossolano ? .012 : .008); trascinamento.giro += dv; trascinamento.v = dv; trascinamento.t = now; }
    else { const dv = -dx / Math.max(260, W * .55); xDrag += dv; xDragM = xDrag; presa.v = dv / Math.max(1, now - presa.tl); }
    presa.tl = now;
  });
  const lascia = e => {
    if (!presa || presa.id !== e.pointerId) return;
    const q = presa; presa = null;
    if (q.modo === 'burger') { if (performance.now() - trascinamento.t > 90) trascinamento.v = 0; }
    else if (q.modo === 'giostra') { xDragM = Math.round(xDrag + Math.max(-.45, Math.min(.45, q.v * 220))); tMano = performance.now(); }
    ultimoMoto = performance.now(); sporco = true;
  };
  tela.addEventListener('pointerup', lascia); tela.addEventListener('pointercancel', lascia);

  // ——— pausa fuori schermo ———
  new IntersectionObserver(es => { visibile = es[0].isIntersecting; ciclo(); }).observe(host);
  function ciclo() { renderer.setAnimationLoop(visibile && !inPausa ? disegna : null); if (visibile && !inPausa) { tPrima = 0; sporco = true; } }

  function polso(t, t0) { if (t < 0) return 0; const x = t / t0; return x * Math.exp(1 - x); }   // sale e scende senza rimbalzo

  // un burger che non è più davanti: chiuso, fermo, con la colata che aveva
  function riponi(p) {
    if (!p?.B) return;
    p.AP.fill(0); p.V.fill(0); p.SCH.fill(0); p.tonfi = [];
    p.B.imposta({ apertura: 0, schiaccia: 0, cola: p.cola, aria: ARIA() });
    p.giro.position.y = 0;
  }

  // ——— ogni fotogramma ———
  const vA = new THREE.Vector3();
  function aggiorna(dt, t) {
    const kx = dt ? 1 - Math.exp(-dt / 110) : 1;
    const Pp = P; P += (Pm - P) * kx; if (Math.abs(Pm - P) < 1e-5) P = Pm;
    if (P !== Pp) { ultimoMoto = t; sporco = true; }
    const s = P * LN.tot;
    // trascinamento della giostra: segue il dito, poi si assesta sull'intero; mentre è "in mano" la giostra torna in vista
    if (!presa) { const d = xDragM - xDrag; if (Math.abs(d) > 1e-4) { xDrag += d * (dt ? 1 - Math.exp(-dt / 160) : 1); sporco = true; } else xDrag = xDragM; }
    const manoM = (presa && presa.modo === 'giostra') || Math.abs(xDragM - xDrag) > .02 || t - tMano < 500 ? 1 : 0;
    const mp = mano; mano += (manoM - mano) * (dt ? 1 - Math.exp(-dt / (manoM ? 160 : 380)) : 1); if (Math.abs(manoM - mano) < 1e-3) mano = manoM;
    if (mano !== mp) sporco = true;
    const k0 = liscio(1 - tra(s, LN.pano[0], LN.pano[1]));
    let kE0 = 0, xS = 0;
    for (const g of LN.seg) {
      const e = liscio(tra(s, g.entra[0], g.entra[1])) * (g.esce ? 1 - liscio(tra(s, g.esce[0], g.esce[1])) : 1);
      if (e > kE0) kE0 = e;
      if (g.gira) xS += tra(s, g.gira[0], g.gira[1]);
    }
    const kE = kE0 * (1 - mano);
    const seg = LN.seg[Math.min(N - 1, Math.round(xS))];
    const xg = xS + xDrag;
    const n = Math.floor(xg), f = xg - n, xe = n + f + (liscio(f) - f) * TENUTA;
    const c = ((Math.round(xg) % N) + N) % N;
    if (c !== soggetto) { const vecchio = posti[soggetto]; soggetto = c; riponi(vecchio); trascinamento.giro = 0; trascinamento.v = 0; emetti('centro', c); }
    if (!fermo && !presa && t - ultimoMoto > 1500) dondolo += (1 - dondolo) * (dt ? 1 - Math.exp(-dt / 1200) : 1); else dondolo += (0 - dondolo) * (dt ? 1 - Math.exp(-dt / 300) : 1);
    if (dondolo > 1e-3) sporco = true;

    // ——— strati del burger davanti ———
    const S = posti[soggetto], B = S.B;
    let scossa = 0;
    if (B) {
      const Ns = B.strati.length, AP = S.AP, V = S.V, SCH = S.SCH, chiuso = s >= seg.chiudi;
      if (chiuso && !S.caduta) { S.caduta = true; V.fill(0); }
      else if (!chiuso && S.caduta) S.caduta = false;
      if (S.caduta) {
        // la gravità: il pane di sopra (la caduta più lunga) arriva in ~0,42 s
        const ar = ARIA(), dTop = Math.max(1, B.strati[0].yA * ar - B.strati[0].yC), g = 2 * dTop / (.42 * .42);
        for (let k = 0; k < Ns; k++) {
          if (AP[k] <= 0) continue;
          const d = Math.max(.01, B.strati[k].yA * ar - B.strati[k].yC);
          V[k] += g * dt / 1000; AP[k] -= V[k] * dt / 1000 / d;
          if (fermo) AP[k] = 0;
          if (AP[k] <= 0) { AP[k] = 0; if (!fermo) S.tonfi.push({ t: 0, k, forza: k === 0 ? 1 : .22 + .18 * (B.strati[k].spessore / 2) }); }
        }
        sporco = true;
      } else {
        // aperture dallo scroll: ogni strato (dall'alto) nella sua finestra; il pane di sotto resta sul piatto
        const [a0, a1] = seg.apri;
        for (let k = 0; k < Ns; k++) {
          const q = k / Math.max(1, Ns - 2), w0 = a0 + (a1 - a0) * .78 * q, meta = Ns - 1 === k ? 1 : liscio(tra(s, w0, w0 + (a1 - a0) * .22));
          const pr_ = AP[k]; AP[k] += (meta - AP[k]) * (dt && !fermo ? 1 - Math.exp(-dt / 140) : 1); if (Math.abs(meta - AP[k]) < 1e-4) AP[k] = meta;
          if (AP[k] !== pr_) sporco = true;
        }
      }
      let aperto = 0; for (let k = 0; k < Ns - 1; k++) aperto = Math.max(aperto, AP[k]);
      ST.aperto = aperto;
      // tonfi: ogni arrivo schiaccia lo strato arrivato e quelli sotto per ~70 ms, niente rimbalzo
      SCH.fill(0);
      for (const e of S.tonfi) { e.t += dt / 1000; const q = polso(e.t, .07) * e.forza; for (let k = e.k; k < Ns; k++) SCH[k] += q * (k === e.k ? 1 : .8); }
      S.tonfi = S.tonfi.filter(e => e.t < .6);
      if (S.tonfi.length) sporco = true;
      // il formaggio cola un filo di più dopo il tonfo (e torna com'era se si riapre)
      const colaM = S.caduta && AP[0] <= 0 ? 1 : 0;
      const cp = S.cola; S.cola += (colaM - S.cola) * (dt ? 1 - Math.exp(-dt / (colaM ? 700 : 250)) : 1); if (Math.abs(colaM - S.cola) < 1e-3) S.cola = colaM;
      if (S.cola !== cp) sporco = true;
      const scossaPiatto = S.tonfi.reduce((a, e) => a + polso(e.t, .05) * e.forza, 0) * .12;
      B.imposta({ apertura: AP, schiaccia: SCH, cola: colaFissa ?? S.cola, y: -scossaPiatto, aria: ARIA() });
      S.giro.position.y = -scossaPiatto * .5;
      if (!vistaLibera) scossa = S.tonfi.reduce((a, e) => a + (e.k === 0 ? polso(e.t, .07) : 0), 0) * .22;   // la camera accusa il colpo
    }
    const kF = camera_(k0, kE, scossa, dt);
    if (kF > .001 && kF < .999) sporco = true;
    Object.assign(ST, { s, k0, kE, seg: seg.k, ultimo: seg.k === N - 1 && !seg.gira });

    // ——— giostra ———
    const hwK = tanM * aspetto;
    for (const cc of ['fx', 'z', 'ang', 'luce']) for (let i = 0; i < 3; i++) LM[cc][i] = mix(L[cc][i], LP[cc][i], k0);
    // rotazione del burger davanti mentre è aperto (si vede che è 3D): va a ~0,3 rad e torna di fronte quando si chiude
    const giroAperto = fermo ? 0 : .32 * Math.sin(Math.PI * tra(s, seg.apri[0], seg.chiudi));
    for (const p of posti) {
      if (!p.pronto) { p.perno.visible = false; continue; }
      let d = p.i - xe; d -= N * Math.round(d / N);
      const a = Math.abs(d), sg = d < 0 ? -1 : 1, sa = Math.sin(Math.PI * Math.min(1, a));
      const nasce = liscio(tra(t - p.nascita, 0, 500)); if (nasce < 1) sporco = true;
      const lui = p.i === soggetto;
      // dentro: gli altri escono di lato e si spengono; il burger davanti resta al centro
      const esce = lui ? 0 : kE;
      const z = curva(LM.z, a) - L.tuffo * (1 - k0) * sa * sa - esce * 20, fx = curva(LM.fx, a) + esce * .8;
      const luce = Math.max(0, curva(LM.luce, a)) * (1 - esce);
      p.luce = luce * nasce; p.a = a;
      p.perno.visible = p.luce > .01 && a < 1.95;
      if (!p.perno.visible) continue;
      const X = sg * fx * (cam.D - z * Math.cos(cam.e)) * hwK;
      p.perno.position.set(lui ? X * (1 - kE) : X, 0, z);
      p.perno.rotation.y = -sg * curva(LM.ang, a) * (1 - (lui ? kE : 0));
      const cen = liscio(1 - tra(a, 0, .5));
      let gy = Math.sin(t / 9000 * TAU) * .2 * dondolo * cen;
      if (lui && kE > 0) {
        if (!presa && Math.abs(trascinamento.v) > 1e-4) { trascinamento.giro += trascinamento.v * dt / 16.7; trascinamento.v *= Math.pow(.93, dt / 16.7); sporco = true; }
        else if (!presa && t - trascinamento.t > 2200 && Math.abs(trascinamento.giro) > 1e-4) { trascinamento.giro *= Math.exp(-dt / 600); sporco = true; }
        gy += kE * giroAperto + trascinamento.giro;
      }
      p.giro.rotation.y = gy;
      if (p.B) {
        p.B.U.uLuce.value = .08 + .92 * p.luce; p.B.U.uVelo.value = nasce * Math.min(1, p.luce * 3);
        // di fronte? (la sagoma frastagliata della foto vale solo lì)
        const rel = p.perno.rotation.y + p.giro.rotation.y + Math.atan2(p.perno.position.x, cam.D - p.perno.position.z);
        p.B.U.uFronte.value = Math.max(0, (Math.cos(rel) - .8) / .2);
      }
      p.oT.material.opacity = p.oP.material.opacity = Math.min(1, p.luce * 1.5) * nasce;
    }
    fascio.material.uniforms.uForza.value = .08 * (1 - kE * .4);
  }

  // pixel ratio che si adatta (solo in giù): se il telefono non tiene i 60 fps scende a 1,5 e poi a 1,25
  const intervalli = new Float32Array(90); let nInt = 0;
  function adatta(dt) {
    if (O.adatta === false || dt <= 0 || dt > 200) return;
    intervalli[nInt++] = dt; if (nInt < intervalli.length) return;
    nInt = 0; intervalli.sort();
    if (intervalli[45] > 19.5 && pr > 1.25) { pr = pr > 1.5 ? 1.5 : 1.25; renderer.setPixelRatio(pr); misura(); tempi.pixelRatio = pr; }
  }
  function disegna(t) {
    const dt = tPrima ? Math.min(50, t - tPrima) : 16.7; tPrima = t;
    aggiorna(dt, t);
    if (!sporco) return;
    sporco = false;
    renderer.render(scena, camera);
    emetti('fotogramma');
    adatta(dt);
  }
  ciclo();

  // ——— etichette: per ogni strato del burger davanti il punto sul bordo (a sinistra o a destra) a metà del nucleo ———
  const et = [];
  function etichette(lato = -1) {
    const S = posti[soggetto], B = S.B; et.length = 0;
    if (!B) return et;
    S.giro.updateWorldMatrix(true, true);
    const m = B.gruppo.matrixWorld;
    for (const st of B.strati) {
      const u = B.U.uStrato.value[st.k];
      vA.set(u.x + lato * st.raggio * .96, u.y + st.spessore * u.z * .5, 0).applyMatrix4(m).project(camera);
      et.push({ k: st.k, nome: st.nome, tipo: st.tipo, x: (vA.x + 1) / 2 * W, y: (1 - vA.y) / 2 * H, aperto: S.AP[st.k] });
    }
    return et;
  }

  tempi.monta = performance.now() - t0;
  return {
    N, tutti, etichette, linea: LN,
    // per componi.js: lo stesso renderer (niente secondo contesto WebGL), la luce, i burger già costruiti
    risorse: { renderer, ambiente: env.texture, burger: id => posti.find(p => p.v.id === id)?.B ?? null, fondo: FONDO },
    // un altro modulo disegna col renderer del palco (e copia su tele 2D); se il palco si vede, lo si ridisegna subito dopo
    // nello stesso fotogramma, così la sua tela non mostra mai il disegno degli altri
    prestito(fn) {
      fn(renderer);
      renderer.setScissorTest(false);
      const d = renderer.getDrawingBufferSize(new THREE.Vector2());
      renderer.setViewport(0, 0, d.x / renderer.getPixelRatio(), d.y / renderer.getPixelRatio());
      if (visibile && !inPausa) renderer.render(scena, camera);
    },
    strati: i => posti[i]?.B?.strati ?? null,
    vai(p) { Pm = Math.min(1, Math.max(0, +p || 0)); sporco = true; },
    // P di un momento del burger k (verifiche): 'chiuso0' (davanti, prima di aprirsi), 'aperto', 'chiuso' (dopo il tonfo)
    momento(k, fase) {
      const g = LN.seg[k], Q = PASSI;
      const s = { chiuso0: g.entra[1] + .01, apre: (g.apri[0] + g.apri[1]) / 2, aperto: g.apri[1] + Q.tieni * .5,
        chiuso: g.chiudi + (g.esce ? Q.chiuso * .6 : Q.coda * .6), gira: g.gira ? (g.gira[0] + g.gira[1]) / 2 : g.chiudi + Q.coda * .9 }[fase];
      return s / LN.tot;
    },
    // verifiche: scena fissata a p (niente rincorsa; caduta, tonfo e colata già finiti; niente dondolo)
    fissa(p) {
      Pm = P = Math.min(1, Math.max(0, +p || 0)); ultimoMoto = performance.now(); dondolo = 0;
      const t = performance.now();
      for (let i = 0; i < 200; i++) aggiorna(16.7, t + i * 16.7);   // 3,3 s simulati: tutto arrivato
      for (const q of posti) q.tonfi = [];
      dondolo = 0; aggiorna(16.7, t + 3400); hS = 0; aggiorna(0, t + 3400);
      renderer.render(scena, camera); sporco = false;
      return this.info();
    },
    giro(x) { xDrag = xDragM = x; sporco = true; },
    aria(x) { ariaFissa = x; sporco = true; },
    forzaCola(x) { colaFissa = x; sporco = true; },
    vista(v) { vistaLibera = v; sporco = true; const t = performance.now(); aggiorna(0, t); renderer.render(scena, camera); },
    giraSoggetto(a) { trascinamento.giro = a; trascinamento.v = 0; trascinamento.t = performance.now() + 1e9; sporco = true; },
    su(n, f) { (ascolta[n] ??= []).push(f); return () => { ascolta[n] = ascolta[n].filter(g => g !== f); }; },
    soggetto: () => soggetto, P: () => P, aperture: () => posti[soggetto].AP, cola: () => posti[soggetto].cola,
    stato: () => ({ ...ST, soggetto, cola: posti[soggetto].cola, caduta: posti[soggetto].caduta, mano }),
    misure() {
      const B = posti[soggetto].B; if (!B) return null;
      const y0 = B.gruppo.position.y;
      return { chiuso: +B.altezzaChiuso.toFixed(2), aperto: +(B.strati[0].yA * ARIA() + B.strati[0].sopra).toFixed(2), raggio: +B.raggio.toFixed(2), aria: +ARIA().toFixed(2),
        compatto: +B.compatto.toFixed(2), piatto: PIATTO_R, fondoPiatto: FONDO_PIATTO,
        strati: Object.fromEntries(B.strati.map(st => { const u = B.U.uStrato.value[st.k]; return [st.nome, +(y0 + u.y + st.spessore * u.z * .5).toFixed(2)]; })) };
    },
    pausa(si = true) { inPausa = !!si; ciclo(); },
    info() {
      const r = renderer.info.render;
      return {
        P: +P.toFixed(4), soggetto, costruiti: posti.filter(p => p.pronto).map(p => p.v.id), triangoli: posti.reduce((a, p) => a + (p.B ? p.B.triangoli : 0), 0),
        triangoliFotogramma: r.triangles, disegni: r.calls, programmi: renderer.info.programs?.length, pixelRatio: renderer.getPixelRatio(),
        tela: [tela.width, tela.height], tempi: Object.fromEntries(Object.entries(tempi).map(([k, v]) => [k, Math.round(v)])),
        tempiBurger: posti.map(p => p.tempo === undefined ? null : Math.round(p.tempo)), cola: +posti[soggetto].cola.toFixed(3),
        schermi: +LN.tot.toFixed(2), compatto: posti.map(p => p.B ? +p.B.compatto.toFixed(2) : null),
      };
    },
    libera() { renderer.setAnimationLoop(null); renderer.dispose(); env.dispose(); tela.remove(); },
  };
}
