// Velluto · la scena: la sala (js/pista.js), le insegne d'ottone, la palla, i birilli, la scarpiera, il bar. La guida lo
// scroll (p 0…1 della sezione). Prima parte (q = p / PS): l'insegna si accende come un dimmer → la camera arretra lungo
// la pista fino a dietro la palla → il tiro con l'effetto nella tasca 1-3 → lo strike al rallentatore (simulato in
// src/prepara/simula.mjs, letto da js/strike.bin) → "Strike" si accende. Seconda parte (s): la camera arretra lungo la
// sala, gira a destra verso la scarpiera, la costeggia, poi gira verso il bar e si ferma sui cocktail. Tutto reversibile:
// lo scroll decide il tempo del racconto T e la posa della camera; il tempo vero serve solo ai dimmer delle insegne.
// monta(host, opz) → { avanza(p), salta(p), fissa(p), ferma(), riprendi(), P(), info(), vista(pos, bersaglio) }
import * as THREE from 'three';
import { S } from './glsl.js';
import { PALLA, BIRILLO, curva } from './misure.js';
import { sala } from './pista.js';
import { birilli } from './birilli.js';
import { palla, palleColorate } from './palla.js';
import { tele, insegne, dimmer, lama } from './insegna.js';
import { scarpiera, rastrelliera, TINTE_PALLE } from './scarpiera.js';
import { bar } from './bar.js';
import { Riflesso } from './riflesso.js';
import { Post } from './post.js';
import { STRIKE } from './strike-dati.js';

const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const u = cl((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const mix = (a, b, t) => a + (b - a) * t;

// ————— la linea del tempo. Lo strike occupa p 0…PS (in unità q = p / PS, come nella demo di partenza); il viaggio
// comincia a PJ (q = .86, "Strike" già acceso e inquadrato) e va fino a p = 1 (in unità s)
export const PS = .61, PJ = .86 * PS;
const Q = { rilascio: .29, strike: .795 };
export const TEMPI = {
  rilascio: Q.rilascio * PS, strike: Q.strike * PS, viaggio: PJ,
  s: p => cl((p - PJ) / (1 - PJ)),
};
// la palla: ferma poco oltre la linea di lancio, poi il tiro. Rallenta un filo (attrito) fino all'inizio della simulazione.
const Z0 = -.4, X0 = .19, V_RIL = 8.3;
const SIM = { x: S.zt + STRIKE.palla.x[2], vx: STRIKE.palla.v[0], vz: STRIKE.palla.v[2] };
const DIST = Z0 - SIM.x, V_SIM = Math.hypot(SIM.vx, SIM.vz), ATTR = (V_RIL ** 2 - V_SIM ** 2) / (2 * DIST), TA = (V_RIL - V_SIM) / ATTR;
const DURATA_SIM = (STRIKE.fotogrammi - 1) / STRIKE.hz;
// T(q): il tempo del racconto (0 = rilascio, TA = la palla tocca quasi il birillo 1). Il rallentatore è la pendenza bassa.
const T_DI_Q = curva([[Q.rilascio, 0], [.298, .02], [.32, .22], [.46, 1.45], [.515, TA - .12], [.545, TA + .012], [.6, TA + .09], [.66, TA + .25], [.72, TA + .5], [.77, TA + .85], [.82, TA + 1.5], [.87, TA + DURATA_SIM]]);
export const T = p => { const q = p / PS; return q <= Q.rilascio ? 0 : T_DI_Q(Math.min(q, 1)); };

// la traiettoria: x in funzione della distanza percorsa u (Hermite a tratti): esce un filo verso destra, poi l'effetto la
// riporta a sinistra dentro la tasca, con la pendenza giusta per attaccarsi alla simulazione
const PENDENZA_FINE = SIM.vx / -SIM.vz;
const NODI = [[0, X0, .006], [6, .228, .007], [11.6, .268, 0], [DIST, STRIKE.palla.x[0], PENDENZA_FINE]];
function xDiU(u) {
  u = cl(u, 0, DIST);
  let i = 0; while (i < NODI.length - 2 && u > NODI[i + 1][0]) i++;
  const [u0, x0, m0] = NODI[i], [u1, x1, m1] = NODI[i + 1], h = u1 - u0, t = (u - u0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * x0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * x1 + (t3 - t2) * h * m1;
}
// la rotazione lungo la strada: integrata una volta (rotola: asse orizzontale perpendicolare alla direzione)
const NR = 2400, ROT = new Float32Array((NR + 1) * 4);
{
  const q = new THREE.Quaternion(), dq = new THREE.Quaternion(), asse = new THREE.Vector3();
  q.setFromAxisAngle(asse.set(0, 1, 0), .25);   // i fori in alto, il pollice verso i birilli
  q.toArray(ROT, 0);
  for (let i = 1; i <= NR; i++) {
    const u0 = (i - 1) / NR * DIST, u1 = i / NR * DIST, dx = xDiU(u1) - xDiU(u0), du = u1 - u0, ds = Math.hypot(dx, du);
    asse.set(-du, 0, -dx).normalize();
    dq.setFromAxisAngle(asse, ds / PALLA.r); q.premultiply(dq);
    dq.setFromAxisAngle(asse.set(0, 1, 0), -ds * .9 * (1 - u1 / DIST)); q.premultiply(dq);
    q.normalize().toArray(ROT, i * 4);
  }
}
const Q_FINE = new THREE.Quaternion().fromArray(ROT, NR * 4);

// ————— il viaggio dopo lo strike: pose chiave [s, x, y, z, direzione (0 = verso i birilli, π/2 = verso la parete destra,
// π = verso il bar), inclinazione]. Ogni valore ha la sua curva morbida: niente fermate brusche.
const VIAGGIO = {
  alto: [
    [0, 0, .9, S.zm + 3.6, 0, .105],
    [.1, .45, 1.18, -11.4, -.03, .07],
    [.22, 1.9, 1.45, -1.8, -.12, .02],
    [.3, 2.0, 1.36, 1.1, .95, -.05],
    [.36, 2.05, 1.26, 2.25, 1.72, -.07],
    [.5, 2.1, 1.22, 4.2, 1.75, -.07],
    [.62, 2.05, 1.3, 5.6, 2.62, -.05],
    [.72, 1.55, 1.34, 6.7, 2.92, -.06],
    [.84, 1.3, 1.27, 8.26, 2.98, -.25],
    [.91, 1.3, 1.28, 8.17, 2.99, -.24],
    [1, .25, 1.55, 5.3, 3.14, -.01],
  ],
  largo: [
    [0, 0, .9, S.zm + 3.2, 0, .16],
    [.1, .45, 1.2, -11, -.03, .09],
    [.22, 1.75, 1.5, -2.2, -.11, .02],
    [.3, 1.8, 1.4, .9, .95, -.05],
    [.36, 1.7, 1.3, 2.0, 1.8, -.08],
    [.5, 1.75, 1.26, 4.1, 1.85, -.08],
    [.62, 1.75, 1.32, 5.5, 2.7, -.05],
    [.72, 1.3, 1.34, 6.6, 3.0, -.07],
    [.84, 1.17, 1.26, 8.2, 3.0, -.22],
    [.91, 1.15, 1.27, 8.12, 3.01, -.21],
    [1, .1, 1.6, 4.4, 3.14, -.02],
  ],
};
const curveViaggio = k => [1, 2, 3, 4, 5].map(i => curva(VIAGGIO[k].map(r => [r[0], r[i]])));
const CV = { alto: curveViaggio('alto'), largo: curveViaggio('largo') };

export async function monta(host, { telefono = false, ridotto = false, dati } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, telefono ? 2 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x050403, 1);
  renderer.info.autoReset = false;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  // ————— i file: la simulazione; i font per le insegne (disegnate al volo)
  const [bin] = await Promise.all([
    fetch('js/strike.bin').then(r => { if (!r.ok) throw new Error('strike.bin ' + r.status); return r.arrayBuffer(); }),
    document.fonts?.load('500 150px "Bodoni Moda"').catch(() => {}),
    document.fonts?.load('italic 500 150px "Bodoni Moda"').catch(() => {}),
    document.fonts?.load('400 25px Jost').catch(() => {}),
  ]);
  const D = new Int16Array(bin);
  const T2 = tele(dati);

  // ————— le uniformi comuni (gli stessi oggetti in tutti i materiali)
  const v3 = () => new THREE.Vector3();
  const U = {
    tSegno: { value: T2.marchio }, tStrike: { value: T2.strike }, uAcceso: { value: new THREE.Vector2() },
    uInsegna: { value: new THREE.Vector4(S.insegna.x, S.insegna.y, S.insegna.w, S.insegna.h) },
    uStrikeQ: { value: new THREE.Vector4(S.strike.x, S.strike.y, S.strike.w, S.strike.h) },
    uLP: { value: Array.from({ length: 6 }, v3) }, uLC: { value: Array.from({ length: 6 }, v3) },
    uCa: { value: Array.from({ length: 11 }, v3) }, uCb: { value: Array.from({ length: 11 }, v3) }, uCr: { value: new Array(11).fill(.05) },
    uSpecchio: { value: 0 },
  };
  // le luci: l'alone dietro l'insegna (due punti), dietro "Strike", l'avvicinamento, la scarpiera, il bar
  const AMBRA = [1, .62, .32], CALDA = [1, .72, .46];
  const LUCI = [
    [[-.85, 2.45, S.zm + .9], AMBRA, 1.3], [[.85, 2.45, S.zm + .9], AMBRA, 1.3], [[0, S.strike.y, S.zm + .7], AMBRA, 1.1],
    [[.2, 3.0, 1.6], CALDA, 5.5], [[2.4, 3.1, 3.2], CALDA, 2.4], [[.4, 3.3, 7.2], CALDA, 3.2],
  ];
  LUCI.forEach(([p], i) => U.uLP.value[i].fromArray(p));

  const scena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, .03, 80);
  const riflesso = new Riflesso(telefono ? .4 : .5);
  const s = sala(scena, U, { telefono });
  s.uPista.tRiflesso.value = riflesso.rt.texture;
  const pin = birilli(scena, U, { telefono });
  const ball = palla(scena, U, { telefono });
  const segni = insegne(scena, U, T2);
  const sc = scarpiera(scena, U, { telefono });
  rastrelliera(scena, U, posti => palleColorate(U, posti, TINTE_PALLE));
  const b = bar(scena, U, { telefono });
  const post = new Post(renderer, { msaa: telefono ? 2 : 4 });

  // ————— misure
  let W = 1, H = 1, alto = true;
  function misura() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    renderer.setSize(W, H, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    const dpr = renderer.getPixelRatio();
    post.misura(Math.round(W * dpr), Math.round(H * dpr));
    riflesso.misura(Math.round(W * dpr), Math.round(H * dpr));
    alto = W / H < 1;
    camera.aspect = W / H;
    camera.fov = alto ? 58 : 40;
    camera.updateProjectionMatrix();
    richiedi();
  }

  // ————— i corpi della simulazione al tempo ts (interpolati fra i fotogrammi)
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function corpo(ts, i, pos, quat) {
    const f = cl(ts * STRIKE.hz, 0, STRIKE.fotogrammi - 1), f0 = Math.floor(f), f1 = Math.min(f0 + 1, STRIKE.fotogrammi - 1), a = f - f0;
    const i0 = (f0 * STRIKE.corpi + i) * 7, i1 = (f1 * STRIKE.corpi + i) * 7, k = STRIKE.scalaPos, kq = 1 / 32767;
    pos.set(mix(D[i0], D[i1], a) * k, mix(D[i0 + 1], D[i1 + 1], a) * k, mix(D[i0 + 2], D[i1 + 2], a) * k + S.zt);
    quat.set(D[i0 + 3] * kq, D[i0 + 4] * kq, D[i0 + 5] * kq, D[i0 + 6] * kq);
    _q2.set(D[i1 + 3] * kq, D[i1 + 4] * kq, D[i1 + 5] * kq, D[i1 + 6] * kq);
    if (quat.dot(_q2) < 0) _q2.set(-_q2.x, -_q2.y, -_q2.z, -_q2.w);
    quat.slerp(_q2, a).normalize();
  }
  const pallaPos = new THREE.Vector3(), pallaQ = new THREE.Quaternion();
  function posaPalla(t) {
    if (t < TA) {
      const u = cl(V_RIL * t - .5 * ATTR * t * t, 0, DIST);
      pallaPos.set(xDiU(u), PALLA.r, Z0 - u);
      const f = u / DIST * NR, i0 = Math.floor(Math.min(f, NR - 1)), a = f - i0;
      pallaQ.fromArray(ROT, i0 * 4); _q2.fromArray(ROT, (i0 + 1) * 4); pallaQ.slerp(_q2, a);
    } else {
      corpo(t - TA, 0, pallaPos, _q);
      pallaQ.copy(_q).multiply(Q_FINE);
    }
    ball.position.copy(pallaPos); ball.quaternion.copy(pallaQ);
  }
  function posaBirilli(t) {
    const ts = t - TA;
    U.uCa.value[0].copy(pallaPos); U.uCb.value[0].copy(pallaPos); U.uCr.value[0] = PALLA.r;
    for (let i = 1; i <= 10; i++) {
      corpo(Math.max(0, ts), i, _p, _q);
      pin.posa(i - 1, _p, _q);
      _a.set(0, .05 - BIRILLO.baricentro, 0).applyQuaternion(_q).add(_p);
      _b.set(0, .32 - BIRILLO.baricentro, 0).applyQuaternion(_q).add(_p);
      U.uCa.value[i].copy(_a); U.uCb.value[i].copy(_b); U.uCr.value[i] = .047;
    }
    pin.fatto();
    s.uPista.uPalla.value.copy(pallaPos);
  }

  // ————— la camera. Prima parte: pose chiave in q (e la palla quando la segue); seconda: il viaggio in s
  const cam = new THREE.Vector3(), guarda = new THREE.Vector3();
  const K = () => alto ? {
    ap: { pos: [0, .44, S.zt + 7.8], g: [0, 1.3, S.zm] },
    mira: { pos: [.2, .37, .98], g: [.14, .08, -14] },
    impatto: { pos: [.36, .17, S.zt + 1.8], g: [0, .25, S.zt - .4] },
    esplode: { pos: [.52, .74, S.zt + 1.25], g: [0, .1, S.zt - .45] },
    strike: { pos: [0, .9, S.zm + 3.6], g: [0, 1.28, S.zm] },
  } : {
    ap: { pos: [0, .55, S.zt + 7.0], g: [0, 1.75, S.zm] },
    mira: { pos: [.22, .42, 1.0], g: [.14, .14, -14] },
    impatto: { pos: [.36, .19, S.zt + 1.5], g: [0, .24, S.zt - .4] },
    esplode: { pos: [.55, .66, S.zt + 1.0], g: [0, .1, S.zt - .45] },
    strike: { pos: [0, .9, S.zm + 3.2], g: [0, 1.5, S.zm] },
  };
  const lerp3 = (out, a, b, t) => out.set(mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t));
  const _c = new THREE.Vector3(), _g = new THREE.Vector3(), ond = new THREE.Vector2();
  function posaCamera(p, t, tempo) {
    const k = K(), q = p / PS;
    if (p >= PJ) {
      // il viaggio: posizione e direzione dalle curve
      const c = alto ? CV.alto : CV.largo, s = TEMPI.s(p);
      cam.set(c[0](s), c[1](s), c[2](s));
      const dir = c[3](s), inc = c[4](s);
      guarda.set(cam.x + Math.sin(dir) * Math.cos(inc), cam.y + Math.sin(inc), cam.z - Math.cos(dir) * Math.cos(inc));
    } else if (q < Q.rilascio) {
      // dall'insegna all'indietro, bassi sulla pista, fino a dietro la palla (una curva: prima si alza un filo)
      const u = ss(.05, .235, q), uy = ss(.05, .25, q);
      lerp3(cam, k.ap.pos, k.mira.pos, u);
      cam.y = mix(k.ap.pos[1], k.mira.pos[1], uy) + Math.sin(u * Math.PI) * .22;
      cam.x = mix(k.ap.pos[0], k.mira.pos[0], ss(.12, .235, q));
      lerp3(guarda, k.ap.g, k.mira.g, ss(.06, .235, q));
      const m = ss(.235, Q.rilascio, q);
      cam.z -= m * .12; cam.y -= m * .02;
    } else {
      // la segue da dietro, poi la lascia andare e si ferma bassa di fianco alla tasca (parte da "prendi la mira": niente salti)
      const segui = 1 - ss(.47, .535, q);
      const dist = mix(k.mira.pos[2] - .12 - Z0, 1.6, ss(Q.rilascio, .36, q));
      _c.set(mix(k.mira.pos[0], pallaPos.x * .85, ss(Q.rilascio, .34, q)), mix(k.mira.pos[1] - .02, .3, ss(Q.rilascio, .4, q)), Math.max(pallaPos.z, S.zt + .6) + dist);
      _g.set(pallaPos.x * .5, .1, Math.max(pallaPos.z - 9, S.zt - .4));
      _g.lerp(_a.fromArray(k.mira.g), 1 - ss(Q.rilascio, .34, q));
      _g.lerp(_a.fromArray(k.impatto.g), ss(.44, .53, q));
      const imp = _a.fromArray(k.impatto.pos), esp = _b.fromArray(k.esplode.pos);
      cam.copy(_c).lerp(imp, 1 - segui);
      // il giro al rallentatore: dal basso dietro la palla a tre quarti dall'alto, mentre i birilli volano
      cam.lerp(esp, ss(.565, .7, q));
      guarda.copy(_g).lerp(_p.fromArray(k.esplode.g), ss(.565, .7, q));
      // la scritta: si sale davanti a "Strike"
      const f = ss(.755, .84, q);
      lerp3(_c, [cam.x, cam.y, cam.z], k.strike.pos, f); cam.copy(_c);
      lerp3(_g, [guarda.x, guarda.y, guarda.z], k.strike.g, f); guarda.copy(_g);
    }
    // un respiro appena sul computer (fermo sul telefono e con il movimento ridotto) e il colpo dell'impatto (legato a T)
    if (!ridotto && !telefono) { ond.set(Math.sin(tempo * .37) * .006 + Math.sin(tempo * .83) * .003, Math.sin(tempo * .29 + 1) * .004); cam.x += ond.x; cam.y += ond.y; }
    const ts = t - TA;
    if (!ridotto && ts > 0 && ts < .35) { const k2 = Math.exp(-ts * 16) * .006; cam.y += Math.sin(ts * 95) * k2; cam.x += Math.sin(ts * 70 + 1) * k2 * .6; }
    camera.position.copy(cam);
    camera.lookAt(guarda);
    camera.updateMatrixWorld();
  }

  // ————— le insegne: il marchio si accende all'arrivo come un dimmer, poi la lama di luce; "Strike" quando lo scroll ci
  // arriva (si spegne piano se si torna su). Con il movimento ridotto: solo una dissolvenza corta, niente lama.
  let tAcceso = 1e9, tStrike = -1, kStrike = 0;
  function luci(p, tempo, dt) {
    const M = ridotto ? cl((tempo - tAcceso) / .6) : dimmer(tempo, tAcceso, 1.4);
    segni.u.accM.value = M; segni.u.sciaM.value = ridotto ? -1 : lama(tempo, tAcceso + 1.25, 1.6);
    const dentro = p >= TEMPI.strike;
    if (dentro && tStrike < 0) tStrike = tempo;
    if (!dentro && p < TEMPI.strike - .003) tStrike = -1;
    const K2 = tStrike >= 0 ? (ridotto ? cl((tempo - tStrike) / .5) : dimmer(tempo, tStrike, 1.2)) : 0;
    kStrike = tStrike >= 0 ? K2 : kStrike * Math.exp(-dt * 5);
    segni.u.accS.value = kStrike; segni.u.sciaS.value = ridotto || tStrike < 0 ? -1 : lama(tempo, tStrike + .9, 1.3);
    U.uAcceso.value.set(M, kStrike);
    LUCI.forEach(([, c, i], j) => {
      const on = j < 2 ? M : j === 2 ? kStrike : 1;
      U.uLC.value[j].set(c[0] * i * on, c[1] * i * on, c[2] * i * on);
    });
  }

  // ————— il ciclo: disegna solo se serve; lo scroll arriva lisciato
  let vistaLibera = null; const tempi = []; let ultimoCambio = 0, disegnati = 0;
  let pVoluto = 0, pVisto = 0, fisso = null, attivo = true, tempo = 0, ultimo = performance.now(), raf = 0;
  const frusto = new THREE.Frustum(), _m = new THREE.Matrix4();
  const vetri = { uV: b.uV, attivo: false };
  function richiedi() { if (!raf && attivo) raf = requestAnimationFrame(ciclo); }
  function disegna(p, dt) {
    renderer.info.reset(); disegnati++;
    const t = T(p);
    luci(p, tempo, dt);
    posaPalla(t);
    posaBirilli(t);
    if (vistaLibera) { camera.position.fromArray(vistaLibera[0]); camera.lookAt(...vistaLibera[1]); camera.updateMatrixWorld(); }
    else posaCamera(p, t, tempo);
    // il vetro dei cocktail solo quando si vedono
    frusto.setFromProjectionMatrix(_m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    vetri.attivo = frusto.intersectsSphere(b.sfera);
    U.uSpecchio.value = 1;
    riflesso.aggiorna(renderer, scena, camera);
    U.uSpecchio.value = 0;
    s.uPista.mRiflesso.value.copy(riflesso.matrice);
    post.componi.uniforms.uTempo.value = tempo;
    post.disegna(scena, camera, vetri);
  }
  function ciclo(ora) {
    raf = 0;
    if (!attivo) return;
    const dt0 = Math.max(0, (ora - ultimo) / 1000), dt = Math.min(.05, dt0); ultimo = ora;
    // qualità che si adatta: se non ce la fa (sotto ~45 fps per un po'), la tela scende di risoluzione (mai sotto 1)
    if (dt0 > 0 && dt0 < .25) {
      tempi.push(dt0); if (tempi.length > 40) tempi.shift();
      if (tempi.length === 40 && ora - ultimoCambio > 2500) {
        const med = [...tempi].sort((a, b2) => a - b2)[20], dpr = renderer.getPixelRatio();
        if (med > .022 && dpr > 1) { renderer.setPixelRatio(Math.max(1, dpr - .25)); misura(); ultimoCambio = ora; tempi.length = 0; }
      }
    }
    tempo += dt;
    if (fisso === null) {
      const k = 1 - Math.exp(-dt * 8);
      pVisto += (pVoluto - pVisto) * k;
      if (Math.abs(pVoluto - pVisto) < 1e-5) pVisto = pVoluto;
    }
    const p = fisso ?? pVisto;
    disegna(p, dt);
    // si continua a disegnare finché qualcosa si muove: lo scroll che arriva, i dimmer, il respiro della camera (computer)
    const fermo = Math.abs(pVoluto - pVisto) < 1e-5 && tempo > tAcceso + 3.2 && (tStrike < 0 || tempo > tStrike + 2.4) && kStrike < 1e-3 + (tStrike >= 0 ? 1 : 0) && (ridotto || telefono);
    if (!fermo) raf = requestAnimationFrame(ciclo);
  }
  misura();
  addEventListener('resize', () => {
    const r = host.getBoundingClientRect();
    if (telefono && Math.round(r.width) === W && Math.abs(Math.round(r.height) - H) < 220) return;
    misura();
  });

  // si compila tutto prima di mostrarla (niente scatti la prima volta), anche il vetro
  renderer.compile(scena, camera);
  camera.layers.set(3); renderer.compile(scena, camera); camera.layers.set(0);
  // e un giro di prova (nascosto: la tela è ancora trasparente) dove ci sono le scarpe e i cocktail: i dati vanno sulla GPU ora
  disegna(.72, 0); disegna(.93, 0);
  disegna(0, 0);
  tAcceso = tempo + .5;
  richiedi();

  return {
    canvas: renderer.domElement,
    avanza(p) { pVoluto = cl(p); richiedi(); },
    salta(p) { fisso = null; pVisto = pVoluto = cl(p); richiedi(); },
    fissa(p) { fisso = p === null ? null : cl(p); if (p !== null) pVisto = pVoluto = fisso; richiedi(); },
    ferma() { attivo = false; cancelAnimationFrame(raf); raf = 0; },
    riprendi() { if (!attivo) { attivo = true; ultimo = performance.now(); richiedi(); } },
    accendiSubito() { tAcceso = -10; if (tStrike >= 0) tStrike = -10; richiedi(); },
    P: () => fisso ?? pVisto,
    T,
    vista(pos, bersaglio) { vistaLibera = pos ? [pos, bersaglio] : null; richiedi(); },
    info() {
      const i = renderer.info;
      return { p: +(fisso ?? pVisto).toFixed(4), t: +T(fisso ?? pVisto).toFixed(3), disegnati, vetri: vetri.attivo, triangoli: i.render.triangles, chiamate: i.render.calls, dpr: renderer.getPixelRatio(), w: W, h: H, texture: i.memory.textures, geometrie: i.memory.geometries };
    },
    _debug: { scena, camera, U, post, TA, DIST, segni },
    misura,
  };
}
