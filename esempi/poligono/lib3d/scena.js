// Pistola 3D · la scena: un renderer, lo studio di luce, i pezzi della pistola e la linea del tempo guidata dallo scroll.
// monta(host, opzioni) → { vai(p), spara(), stato(), libera() }
//   p (0…1) = avanzamento nella sezione. Linea del tempo:
//   0,00–0,10 esploso (i pezzi sospesi respirano e ruotano piano) · 0,10–0,60 montaggio in sequenza (molla sull'asta, canna nel
//   carrello, molla e asta sotto la canna, grilletto, carrello che scorre sul fusto da davanti, leva, perno) · 0,60–0,93 caricamento
//   (3 cartucce nel caricatore, caricatore nell'impugnatura con lo scatto, carrello indietro e avanti) · 0,93–1 posa finale.
//   spara(): il colpo (a tempo, non a scroll): carrello indietro di scatto, fiammata e luce alla bocca, bossolo fuori dalla finestra
//   che gira, fumo, la camera trema. Con prefers-reduced-motion il colpo è solo accennato (niente tremolii).
// Verifiche: window.__pronto, window.__pistola(t) (fissa la linea del tempo; t in (1, 2] = colpo a (t − 1) s), window.__pistola(null)
// torna allo scroll; window.__vista(a, e, { orto }) fissa la camera sulla pistola montata; window.__info().
// Assi: +x bocca, +y alto, +z fianco destro. a = giro attorno a y (0 = fianco destro verso chi guarda, π/2 = bocca), e = elevazione.
import * as THREE from 'three';
import { preparaRenderer, creaMotore, casuale } from './motore.js';
import { costruisci, CAR, CART, PUNTI, matCar } from './pistola.js';
import { creaPoligono, LINEA } from './poligono.js';

// la sezione (0…1): la pistola (montaggio e caricamento) fino ad ARMA, il colpo quando lo scroll passa COLPO scendendo, il volo del
// proiettile da VOLO_DA a VOLO_A (il bersaglio si spacca alla fine del volo), poi l'immagine finale del bersaglio forato
export const SEZ = { arma: .484, colpo: .495, voloDa: .505, voloA: .905 };

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  io: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2,
  out: t => 1 - (1 - t) ** 3,
  in: t => t * t * t,
  sin: t => .5 - .5 * Math.cos(Math.PI * t),
  // scatto: arriva veloce e rimbalza appena (per il caricatore)
  scatto: t => t < .82 ? E.in(t / .82) : 1 + Math.sin((t - .82) / .18 * Math.PI) * .012,
};
const M4 = () => new THREE.Matrix4();
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const R = (x, y, z) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, 'XYZ'));
const mul = (...m) => m.reduce((a, b) => a.multiply(b), new THREE.Matrix4());

export async function monta(host, O = {}) {
  const ridotto = O.ridotto ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const liscio = O.liscio ?? .12;   // inseguimento dello scroll per fotogramma (con Lenis lo scroll è già morbido: di più)
  const mobile = matchMedia('(pointer:coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!O.conserva });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
  preparaRenderer(renderer, { esposizione: O.esposizione ?? 1.05 });
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' });
  const motore = creaMotore(renderer);
  const t0 = performance.now();
  const { pezzi } = costruisci(motore);
  const tCostruzione = performance.now() - t0;

  // ——— grafo: scena → incl (elevazione) → giro (azimut) → centro (−perno) → pezzi (coordinate dell'arma) ———
  const scene = new THREE.Scene();
  const incl = new THREE.Group(), giro = new THREE.Group(), centro = new THREE.Group();
  scene.add(incl); incl.add(giro); giro.add(centro);
  scene.fog = new THREE.Fog(0x000000, 1e7, 2e7);
  const poligono = await creaPoligono(motore); centro.add(poligono.gruppo);
  const camera = new THREE.PerspectiveCamera(24, 1, 20, 5000);
  const orto = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 5000); orto.position.set(0, 0, 1000);

  // ogni pezzo: gruppo esterno (matrice animata) → il pezzo. Centro del pezzo = centro del suo ingombro (per girarlo su se stesso)
  const P = {};
  const box = new THREE.Box3();
  function registra(nome, g) {
    box.setFromObject(g);
    const c = box.getCenter(new THREE.Vector3());
    const est = new THREE.Group(); est.name = 'pezzo:' + nome; est.matrixAutoUpdate = false; est.add(g); centro.add(est);
    P[nome] = { nome, g: est, c, M: M4() };
    return P[nome];
  }
  for (const k of ['fusto', 'carrello', 'canna', 'asta', 'molla', 'grilletto', 'leva', 'levaS', 'perno', 'pernoS', 'caricatore', 'elevatore', 'bossolo']) registra(k, pezzi[k]);
  pezzi.cartucce.forEach((g, i) => registra('cartuccia' + i, g));
  P.bossolo.g.visible = false;

  // ——— effetti del colpo: fiammata (stella + due lingue incrociate), luce, fumo ———
  const fx = new THREE.Group(); centro.add(fx);
  const matStella = new THREE.SpriteMaterial({ map: motore.texFiamma(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0 });
  const stella = new THREE.Sprite(matStella); stella.position.copy(PUNTI.bocca).add(new THREE.Vector3(6, 0, 0)); fx.add(stella);
  const matLingua = new THREE.MeshBasicMaterial({ map: motore.texLingua(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, side: THREE.DoubleSide, opacity: 0 });
  const lingue = new THREE.Group(); lingue.position.copy(PUNTI.bocca); fx.add(lingue);
  for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, .5), matLingua); m.geometry.translate(.5, 0, 0); m.rotation.x = r; lingue.add(m); }
  const luce = new THREE.PointLight(0xffc27a, 0, 600, 2); luce.position.copy(PUNTI.bocca).add(new THREE.Vector3(22, 8, 10)); fx.add(luce);
  const fumo = [];
  const rndF = casuale(31);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.SpriteMaterial({ map: motore.texFumo(), depthWrite: false, transparent: true, opacity: 0, color: 0xc9c5bf });
    const s = new THREE.Sprite(m); s.visible = false; fx.add(s);
    const daFinestra = i >= 10;
    fumo.push({ s, t0: daFinestra ? 60 + rndF() * 80 : rndF() * 70, dur: 1100 + rndF() * 700, v: new THREE.Vector3(daFinestra ? -.004 : .05 + rndF() * .05, .012 + rndF() * .02, (rndF() - .5) * .025 + (daFinestra ? .018 : 0)),
      p0: daFinestra ? new THREE.Vector3(-4, 9, 8) : PUNTI.bocca.clone().add(new THREE.Vector3(2 + rndF() * 6, (rndF() - .5) * 3, (rndF() - .5) * 3)), s0: 10 + rndF() * 8, s1: 60 + rndF() * 45, rot: (rndF() - .5) * 2 });
  }

  // ——— pose ———
  // pose esplosa (matrice mondo del pezzo) = T(c + d) R(r) T(−c); respiro: su e giù e rotazione lenta attorno al centro
  const esplosa = (nome, d, r) => { const c = P[nome].c; return mul(T(c.x + d[0], c.y + d[1], c.z + d[2]), R(...r), T(-c.x, -c.y, -c.z)); };
  // composizione dell'esploso: in orizzontale larga; in verticale (telefono) la stessa stretta in x e allungata in y
  // l'esploso si guarda dal fianco SINISTRO (tre quarti davanti a sinistra): i pezzi sparsi verso chi guarda stanno a −z.
  // La camera poi gira (azimut che scende) davanti, a destra per le leve e il caricamento, fino alla posa del colpo
  const LAYOUT = {
    fusto: [[-14, -8, 12], [-.03, -.12, .02]], carrello: [[34, 74, 26], [-.05, -.08, -.06]], canna: [[74, 36, -24], [-.03, .22, .09]],
    asta: [[150, -8, -16], [-.08, .35, .04]], grilletto: [[52, -60, -34], [-.3, .6, -.25]], leva: [[-60, 62, 46], [.5, .8, .15]],
    perno: [[70, -34, 70], [.2, 1.2, .4]], caricatore: [[-82, -34, -30], [-.08, .25, .22]],
    levaS: [[-46, 28, -58], [-.5, -.8, .15]], pernoS: [[58, -24, -66], [-.2, -1.2, .4]],
  };
  const CART_ESP = [[4, -126, -62, -.3, -.9, .5], [40, -114, -50, .4, .5, .2], [76, -130, -66, -.6, -.2, -.9]];
  // in verticale: x × 0,5 (attorno al centro della composizione, x ≈ 40) e y × 1,4 (attorno a y ≈ −40)
  const RIT = { x: 40, kx: .5, y: -40, ky: 1.4, extra: { caricatore: [4, -40, 0], grilletto: [10, -10, 0], asta: [0, -10, 0] }, extraCart: -34 };
  const cc = new THREE.Vector3(CART.L / 2, 0, 0);
  let ritratto = null;
  const ESP = {}, cartEsp = [];
  function componiEsploso(rit) {
    if (rit === ritratto) return; ritratto = rit;
    const q = ([x, y, z], c) => {
      if (!rit) return [x, y, z];
      const X_ = c.x + x, Y_ = c.y + y;   // posizione assoluta del centro
      return [RIT.x + (X_ - RIT.x) * RIT.kx - c.x, RIT.y + (Y_ - RIT.y) * RIT.ky - c.y, z];
    };
    for (const [k, [d, r]] of Object.entries(LAYOUT)) { const e = rit ? RIT.extra[k] ?? [0, 0, 0] : [0, 0, 0], qq = q(d, P[k].c); ESP[k] = esplosa(k, [qq[0] + e[0], qq[1] + e[1], qq[2] + e[2]], r); }
    // la molla (esploso): davanti e sopra l'asta, sullo stesso asse inclinato (in verticale: sopra l'asta)
    ESP.molla = mul(ESP.asta.clone(), rit ? T(0, 14, 0) : T(44, 11, 0));
    CART_ESP.forEach(([x, y, z, a, b, g], i) => { const [X_, Y_] = q([x, y, z], { x: 0, y: 0 }); cartEsp[i] = mul(T(X_, Y_ + (rit ? RIT.extraCart : 0), z), R(a, b, g), T(-cc.x, 0, 0)); });
  }
  // posto n nel caricatore montato (cartuccia sul suo asse: x locale → f del caricatore, fondello a f = −15,3)
  const posto = (n, du = 0, df = 0, z = 0) => { const [f] = CAR.posto(0), u = CAR.posto(0)[1] - n * 7.6; return mul(matCar(), T(f - CART.L / 2 + df, u + du, z)); };
  // matrice mondo dell'elevatore (profondità u nel caricatore)
  const elev = u => T(CAR.u.x * u, CAR.u.y * u, 0);

  // fusione di due pose (matrici) attorno al centro del pezzo: posizione lineare, rotazione sferica
  const _a = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }, _b = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() };
  function fondi(out, A, B, k, c) {
    if (k <= 0) return out.copy(A); if (k >= 1) return out.copy(B);
    const a = A.clone().multiply(T(c.x, c.y, c.z)), b = B.clone().multiply(T(c.x, c.y, c.z));
    a.decompose(_a.p, _a.q, _a.s); b.decompose(_b.p, _b.q, _b.s);
    _a.p.lerp(_b.p, k); _a.q.slerp(_b.q, k);
    return out.compose(_a.p, _a.q, _a.s.set(1, 1, 1)).multiply(T(-c.x, -c.y, -c.z));
  }
  // catena di pose: [[t0, M0], [t1, M1, easing], …] → posa al tempo t
  function catena(t, lista, c) {
    if (t <= lista[0][0]) return lista[0][1].clone();
    for (let i = 1; i < lista.length; i++) {
      const [tb, Mb, e = E.io] = lista[i];
      if (t <= tb) { const [ta, Ma] = lista[i - 1]; return fondi(M4(), Ma, Mb, e(seg(t, ta, tb)), c); }
    }
    return lista.at(-1)[1].clone();
  }
  // respiro dell'esploso (per pezzo: fase e ampiezza) × peso (1 = sospeso, 0 = montato)
  const fasi = {}; { const r = casuale(3); for (const k of Object.keys(P)) fasi[k] = [r() * 6.28, r() * 6.28, .7 + r() * .6]; }
  const respiro = (nome, tempo, peso) => {
    if (peso <= 0 || ridotto) return M4();
    const [f1, f2, a] = fasi[nome], c = P[nome].c, s = tempo / 1000;
    return mul(T(0, Math.sin(s * .9 + f1) * 1.6 * a * peso, Math.sin(s * .6 + f2) * 1.0 * peso), T(c.x, c.y, c.z), R(Math.sin(s * .5 + f2) * .03 * peso, Math.sin(s * .37 + f1) * .06 * peso, Math.sin(s * .45 + f1) * .025 * peso), T(-c.x, -c.y, -c.z));
  };

  // ——— la linea del tempo: pose dei pezzi a (t, tempo) ———
  const K = {
    molla: [.08, .12, .16], canna: [.13, .18, .21, .24], levaS: [.16, .20, .23], pernoS: [.19, .23, .26], fusto: [.20, .30], grilletto: [.26, .30, .33],
    asta: [.32, .36, .40], carrello: [.38, .44, .50], leva: [.50, .53, .56], perno: [.53, .56, .59],
    parcheggio: [.26, .36], carica: [.60, .66], cart: [[.665, .695, .705, .715], [.715, .745, .755, .765], [.765, .795, .805, .815]], inserisci: [.815, .84, .865],
    arma: [.875, .90, .925],
  };
  const I = M4();
  function pose(t, tempo, colpo) {
    const W = {};
    const pesoEsp = (fine) => 1 - E.sin(seg(t, fine[0], fine[1]));
    // fusto: dall'esploso al centro
    const Mf = mul(catena(t, [[K.fusto[0], ESP.fusto], [K.fusto[1], I]], P.fusto.c), respiro('fusto', tempo, pesoEsp(K.fusto)));
    W.fusto = Mf;
    // carrello (con canna, asta, molla dentro): esploso → davanti al fusto allineato → scorre indietro sulle guide
    const rack = colpo.carrello ?? 0;   // arretramento (mm) del colpo o della manovra
    const carrPre = mul(Mf.clone(), T(118, 3, 0));
    const Ms = mul(catena(t, [[K.carrello[0], ESP.carrello], [K.carrello[1], carrPre, E.io], [K.carrello[2], Mf.clone(), E.out]], P.carrello.c), respiro('carrello', tempo, pesoEsp([K.carrello[0], K.carrello[1]])));
    // manovra del carrello (caricamento) e colpo
    const manovra = t < K.arma[0] ? 0 : t < K.arma[1] ? E.io(seg(t, K.arma[0], K.arma[1])) : 1 - E.in(seg(t, K.arma[1], K.arma[2]));
    const arretra = Math.max(rack, manovra * 24);
    W.carrello = mul(Ms.clone(), T(-arretra, 0, 0));
    // canna: esploso → sotto e dietro il carrello, inclinata → la bocca entra nel foro davanti → la camera scende al suo posto
    const cB = P.canna.c;
    const pre1 = mul(Ms.clone(), T(-34, -16, 0), T(cB.x, cB.y, cB.z), R(0, 0, .16), T(-cB.x, -cB.y, -cB.z));
    const pre2 = mul(Ms.clone(), T(-5, -4, 0), T(cB.x, cB.y, cB.z), R(0, 0, .05), T(-cB.x, -cB.y, -cB.z));
    let Mc = catena(t, [[K.canna[0], ESP.canna], [K.canna[1], pre1], [K.canna[2], pre2, E.sin], [K.canna[3], Ms.clone(), E.out]], cB);
    Mc = mul(Mc, respiro('canna', tempo, pesoEsp([K.canna[0], K.canna[1]])));
    // canna nel colpo/manovra: arretra con il carrello per 3 mm e si inclina un poco (chiusura a canna oscillante)
    if (t >= K.canna[3]) {
      const k = clamp(arretra / 3), ang = -.045 * clamp(arretra / 8);
      Mc = mul(Ms.clone(), T(-3 * k, 0, 0), T(-8, -6, 0), R(0, 0, ang), T(8, 6, 0));
    }
    W.canna = Mc;
    // asta con la molla: la molla scivola sull'asta (esploso), poi le due vanno sotto la canna
    const cA = P.asta.c;
    // sopra il canale del fusto, un po' indietro e con la punta in giù: la punta entra nel foro davanti, poi la testa scende
    const astaPre = mul(Mf.clone(), T(-8, 34, 0), T(cA.x, cA.y, cA.z), R(0, 0, -.22), T(-cA.x, -cA.y, -cA.z));
    const astaMezzo = mul(Mf.clone(), T(-3, 9, 0), T(cA.x, cA.y, cA.z), R(0, 0, -.08), T(-cA.x, -cA.y, -cA.z));
    let Ma = catena(t, [[K.asta[0], ESP.asta], [K.asta[1], astaPre], [(K.asta[1] + K.asta[2]) / 2, astaMezzo, E.sin], [K.asta[2], Mf.clone(), E.out]], cA);
    Ma = mul(Ma, respiro('asta', tempo, pesoEsp([K.asta[0], K.asta[1]])));
    if (t >= K.asta[2]) Ma = Mf.clone();
    W.asta = Ma;
    // molla: dall'esploso davanti all'asta, sull'asse, poi infilata; compressa quando il carrello arretra
    const mollaPre = mul(Ma.clone(), T(88, 0, 0));
    let Mm = catena(t, [[K.molla[0], ESP.molla], [K.molla[1], mollaPre, E.io], [K.molla[2], Ma.clone(), E.out]], P.molla.c);
    Mm = mul(Mm, respiro('molla', tempo, pesoEsp([K.molla[0], K.molla[1]])));
    if (t >= K.molla[2]) {
      Mm = Ma.clone();
      if (arretra > 0) { const x0 = 12.4, x1 = 90.2, s = (x1 - x0 - arretra) / (x1 - x0); Mm = mul(Mf.clone(), T(x0, 0, 0), new THREE.Matrix4().makeScale(s, 1, 1), T(-x0, 0, 0)); }
    }
    W.molla = Mm;
    // grilletto: da sotto, sale nel fusto
    const gPre = mul(Mf.clone(), T(0, -34, 0), T(P.grilletto.c.x, P.grilletto.c.y, 0), R(0, 0, -.35), T(-P.grilletto.c.x, -P.grilletto.c.y, 0));
    W.grilletto = mul(catena(t, [[K.grilletto[0], ESP.grilletto], [K.grilletto[1], gPre], [K.grilletto[2], Mf.clone(), E.out]], P.grilletto.c), respiro('grilletto', tempo, pesoEsp([K.grilletto[0], K.grilletto[1]])));
    // leva e perno: entrano di lato (+z)
    const lPre = mul(Mf.clone(), T(0, 0, 34)), pPre = mul(Mf.clone(), T(0, 0, 40));
    W.leva = mul(catena(t, [[K.leva[0], ESP.leva], [K.leva[1], lPre], [K.leva[2], Mf.clone(), E.out]], P.leva.c), respiro('leva', tempo, pesoEsp([K.leva[0], K.leva[1]])));
    W.perno = mul(catena(t, [[K.perno[0], ESP.perno], [K.perno[1], pPre], [K.perno[2], Mf.clone(), E.out]], P.perno.c), respiro('perno', tempo, pesoEsp([K.perno[0], K.perno[1]])));
    // fianco sinistro: leva e tappo del perno entrano da sinistra (−z)
    const lsPre = mul(Mf.clone(), T(0, 0, -34)), psPre = mul(Mf.clone(), T(0, 0, -40));
    W.levaS = mul(catena(t, [[K.levaS[0], ESP.levaS], [K.levaS[1], lsPre], [K.levaS[2], Mf.clone(), E.out]], P.levaS.c), respiro('levaS', tempo, pesoEsp([K.levaS[0], K.levaS[1]])));
    W.pernoS = mul(catena(t, [[K.pernoS[0], ESP.pernoS], [K.pernoS[1], psPre], [K.pernoS[2], Mf.clone(), E.out]], P.pernoS.c), respiro('pernoS', tempo, pesoEsp([K.pernoS[0], K.pernoS[1]])));
    // caricatore: esploso → posa di carico (in piedi, davanti e sotto l'arma) → sotto l'impugnatura allineato → dentro con lo scatto
    const cK = P.caricatore.c;
    // (sul telefono sotto l'arma invece che accanto: la composizione è verticale e la pistola resta tutta nel quadro)
    const carico = ritratto ? mul(Mf.clone(), T(112, -128, 20), T(cK.x, cK.y, cK.z), R(.05, -.45, 12 * Math.PI / 180), T(-cK.x, -cK.y, -cK.z))
      : mul(Mf.clone(), T(165, -22, 20), T(cK.x, cK.y, cK.z), R(.05, -.45, 19 * Math.PI / 180), T(-cK.x, -cK.y, -cK.z));
    const sotto = mul(Mf.clone(), T(-CAR.u.x * 78, -CAR.u.y * 78, 0));
    // passa sotto l'arma (non davanti all'impugnatura) per arrivare alla posa di carico
    const sottoArma = mul(Mf.clone(), T(60, -170, 10), T(cK.x, cK.y, cK.z), R(0, -.2, .2), T(-cK.x, -cK.y, -cK.z));
    // si toglie di mezzo (sotto, fuori inquadratura) quando la camera si avvicina all'arma, poi sale alla posa di carico
    const parcheggio = mul(Mf.clone(), T(-40, ritratto ? -720 : -320, -60), T(cK.x, cK.y, cK.z), R(0, -.2, .4), T(-cK.x, -cK.y, -cK.z));
    const km = (K.carica[0] + K.carica[1]) / 2;
    let Mk = catena(t, [[K.parcheggio[0], ESP.caricatore], [K.parcheggio[1], parcheggio, E.io], [K.carica[0], parcheggio], [km, sottoArma, E.sin], [K.carica[1], carico, E.out], [K.inserisci[0], carico], [K.inserisci[1], sotto, E.io]], cK);
    if (t > K.inserisci[1]) { const k = E.scatto(seg(t, K.inserisci[1], K.inserisci[2])); Mk = mul(Mf.clone(), T(-CAR.u.x * 78 * (1 - k), -CAR.u.y * 78 * (1 - k), 0)); }
    Mk = mul(Mk, respiro('caricatore', tempo, pesoEsp(K.parcheggio)));
    W.caricatore = Mk;
    // cartucce: esploso → sopra la bocca del caricatore (avanti e su) → giù sull'elevatore → indietro sotto le labbra.
    // Quando entra la k-esima, quelle già dentro scendono di un posto (7,6 mm) insieme all'elevatore. Ognuna resta dalla sua parte
    // (file sfalsate: la i-esima a z = ±3,15), l'ultima entrata sta in cima.
    let dentro = 0, spinta = 0;
    K.cart.forEach(([a, b, c, d], i) => { if (t >= d) dentro = i + 1; else if (t > b) spinta = Math.max(spinta, E.io(seg(t, b, c))); });
    for (let i = 0; i < 3; i++) {
      const [a, b, c, d] = K.cart[i], nome = 'cartuccia' + i, z = i % 2 ? -3.15 : 3.15;
      let Mw;
      if (t <= b) {
        // passa davanti al caricatore (verso chi guarda), poi sopra la bocca
        const sopra = mul(Mk.clone(), posto(0, 13, 9, z)), davanti = mul(T(0, 30, 40), sopra.clone());
        Mw = catena(t, [[a, cartEsp[i]], [a + (b - a) * .55, davanti, E.io], [b, sopra, E.io]], cc);
        Mw = mul(Mw, respiro(nome, tempo, 1 - E.sin(seg(t, a, b))));
      } else if (t < d) {
        const giu = E.io(seg(t, b, c)), dietro = E.out(seg(t, c, d));
        Mw = mul(Mk.clone(), posto(0, 13 * (1 - giu), 9 * (1 - dietro), z));
      } else Mw = mul(Mk.clone(), posto((dentro - 1) - i + spinta, 0, 0, z));
      W[nome] = Mw;
      // la più alta entra in camera quando il carrello torna avanti (dentro l'arma, non si vede): poi resta nascosta
      P[nome].g.visible = !(i === 2 && t > K.arma[1] + .005);
    }
    // elevatore: sotto la cartuccia più bassa (vuoto: appena sotto le labbra)
    const uTop = CAR.posto(0)[1] - CART.r;
    const uEl = dentro === 0 ? uTop + 4.2 * (1 - spinta) : uTop - (dentro - 1 + spinta) * 7.6;
    W.elevatore = mul(Mk.clone(), elev(uEl));
    return W;
  }

  // ——— camera: chiavi [t, azimut, elevazione, raggio (mm), perno x, y, z] ———
  // la camera gira attorno all'arma durante il montaggio (azimut che scende): tre quarti davanti a sinistra (esploso, leva e perno di
  // sinistra) → davanti (il carrello scorre sul fusto) → fianco destro (leve e perno di destra, caricamento) → posa del colpo
  const CAM = [
    [0, 2.52, .28, 152, 56, -34, -10], [.1, 2.48, .27, 150, 54, -34, -8], [.24, 2.25, .26, 142, 30, -28, -5], [.34, 2.05, .3, 136, 12, -32, 0],
    [.44, .95, .17, 126, 10, -44, 0], [.56, .45, .14, 120, 0, -50, 0], [.64, .05, .12, 132, 20, -54, 4], [.70, -.1, .1, 140, 40, -58, 8],
    [.80, .22, .07, 138, 38, -60, 8], [.87, .3, .08, 118, 0, -52, 0], [1, .42, .1, 112, 0, -50, 0],
  ];
  function cam(t) {
    let i = 1; while (i < CAM.length - 1 && t > CAM[i][0]) i++;
    const a = CAM[i - 1], b = CAM[i], k = E.sin(seg(t, a[0], b[0]));
    const c = a.map((x, j) => x + (b[j] - x) * k);
    // passando davanti all'arma (t 0,34–0,44: il carrello arriva davanti al fusto, l'asta scende nel canale) la camera sale e si
    // allontana un poco: dall'alto si legge il canale del fusto e il carrello che si allinea; di fronte e basso era confuso
    const gobba = Math.sin(Math.PI * seg(t, .31, .47)) ** 2;
    c[2] += .34 * gobba; c[3] += 22 * gobba; c[5] += 10 * gobba;
    if (ritratto) {
      // in verticale, all'apertura: l'esploso un poco più in alto (sotto ci sono il nome, la riga "cosa e dove" e "scorri")
      c[5] -= 16 * (1 - E.sin(seg(t, 0, .12)));
      // in verticale, mentre si caricano le cartucce (caricatore sotto l'arma): il perno scende fra l'arma e il caricatore
      const wc = E.sin(seg(t, .58, .665)) * (1 - E.sin(seg(t, .8, .87)));
      c[4] += (8 - c[4]) * wc; c[5] -= 58 * wc;
      // e mentre il carrello arriva davanti al fusto e ci scorre sopra (composizione lunga): un poco più lontana e più avanti
      const wr = Math.sin(Math.PI * seg(t, .36, .54)) ** 2;
      c[3] *= 1 + .2 * wr; c[4] += 34 * wr;
      // in verticale l'esploso è stretto e alto: il perno segue la composizione finché i pezzi sono sparsi (fino a t ≈ 0,4)
      const w = 1 - E.sin(seg(t, .3, .45));
      c[4] = c[4] + (RIT.x + (c[4] - RIT.x) * RIT.kx - c[4]) * w; c[5] = c[5] + (RIT.y - 18 + (c[5] - RIT.y) * RIT.ky - c[5]) * w; c[3] *= 1 - .12 * w;
    }
    return c;
  }

  // ——— stato e disegno ———
  let W_ = 1, H_ = 1;
  function misura() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; W_ = w; H_ = h;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    componiEsploso(w / h < .8);
  }
  misura(); new ResizeObserver(misura).observe(host);
  let p = 0, cur = 0, fisso = null, vista = null, colpoT = null, visibile = true, sospeso = false;
  let tira = 0, vt = 0, x0 = null, fermo = 0, mx = 0, my = 0, tx = 0, ty = 0, trema = 0;
  // pausa quando la tela non si vede (un bordo che tocca non conta: la sezione dopo inizia esattamente dove finisce il palco)
  new IntersectionObserver(es => { visibile = es[0].isIntersecting && es[0].intersectionRatio > .002; }, { threshold: [0, .002, .01, .05] }).observe(host);
  // trascinamento (solo a pistola montata) e inclinazione verso il cursore
  const montata = () => (fisso ?? cur) / SEZ.arma > .6 && (fisso ?? cur) < SEZ.voloDa;
  host.addEventListener('pointerdown', e => { if (!montata()) return; x0 = e.clientX; vt = 0; host.setPointerCapture?.(e.pointerId); });
  host.addEventListener('pointermove', e => {
    const r = host.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width) * 2 - 1; my = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (x0 === null) return; vt = (e.clientX - x0) * .006; tira += vt; x0 = e.clientX; fermo = 0;
  });
  const lascia = () => { x0 = null; };
  host.addEventListener('pointerup', lascia); host.addEventListener('pointercancel', lascia);
  host.addEventListener('pointerleave', () => { mx = my = 0; });

  const tInizio = performance.now();
  let tempoFisso = null;
  function colpoStato(ms) {
    // ms dal colpo → arretramento del carrello, fiammata, bossolo, fumo, tremolio
    const s = { carrello: 0 };
    if (ms === null || ms < 0 || ms > 2600) return s;
    const back = ridotto ? 6 : 24;
    s.carrello = ms < 38 ? back * E.out(ms / 38) : ms < 120 ? back * (1 - E.in((ms - 38) / 82)) : 0;
    s.fiamma = ms < 90 ? (1 - ms / 90) : 0;
    s.ms = ms;
    return s;
  }
  // ——— il volo: posizione del proiettile e camera che lo segue ———
  // f (0…1) → x del proiettile: esce piano dalla bocca, poi lungo la linea a velocità costante, poi (da V2) rallenta senza scatti
  // (stessa velocità all'attacco: lo sfondo non si ferma di colpo) e arriva al bersaglio ancora in corsa (il colpo si sente)
  // (uscita: accelera da fermo fino alla velocità della linea, senza scalini; poi velocità costante; poi il rallentatore)
  const V1 = .07, V2 = .80, X0 = 94.5, X2 = LINEA.xT - 3000, VF = 6000;
  const vLinea = (X2 - X0) / (V2 - V1 / 2), X1 = X0 + vLinea * V1 / 2;
  const xProiettile = f => {
    if (f <= V1) return X0 + vLinea * f * f / (2 * V1);
    if (f <= V2) return X1 + vLinea * (f - V1);
    const s = Math.min(1, (f - V2) / (1 - V2)), L = 1 - V2, s2 = s * s, s3 = s2 * s;   // Hermite: posizioni e velocità agli estremi
    return (2 * s3 - 3 * s2 + 1) * X2 + (s3 - 2 * s2 + s) * L * vLinea + (-2 * s3 + 3 * s2) * LINEA.xT + (s3 - s2) * L * VF;
  };
  // camera del volo: [a, e, distanza, perno x, y, z, fov]; parte dalla posa del colpo, poi di fianco al proiettile (lo tiene al centro),
  // poi gira dietro (inseguimento) e intanto si volta verso il bersaglio, così il bersaglio entra in quadro appena ci sta insieme al
  // proiettile (sul telefono la camera sale: proiettile in basso, bersaglio in alto), poi il bersaglio di fronte
  const distGiro = (raggio, fovG) => { const tf = Math.tan(THREE.MathUtils.degToRad(fovG) / 2); let d = raggio / tf; if (camera.aspect < 1) d = Math.max(d, raggio * 1.02 / (tf * camera.aspect)); return d; };
  const _C = new THREE.Vector3(), _P = new THREE.Vector3(), _T = new THREE.Vector3(), _dP = new THREE.Vector3(), _dT = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3(), _su = new THREE.Vector3(), _dx = new THREE.Vector3();
  const INS = { F0: .78, F1: .96 }, INS_T = { F0: .78, F1: .93 };   // sul telefono il giro dietro finisce prima (campo stretto)
  function insegui(f, xB, rit, lato) {
    const I_ = rit ? INS_T : INS, u = E.io(seg(f, I_.F0, I_.F1));
    const phi = -(rit ? 1.36 : 1.28) * u, r = lato[2] + ((rit ? 820 : 430) - lato[2]) * u, el = lato[1] + ((rit ? .34 : .13) - lato[1]) * u, fov = lato[6] + (34 - lato[6]) * u;
    _P.set(lato[3] + (rit ? 30 : 60) * u, lato[4] * (1 - u), 0);   // punto seguito: sul proiettile (poco davanti)
    _C.set(Math.cos(el) * Math.sin(phi), Math.sin(el), Math.cos(el) * Math.cos(phi)).multiplyScalar(r).add(_P);
    // voltarsi verso il bersaglio (in orizzontale e in verticale, ognuno con il suo mezzo campo): quanto basta perché entri a .8 del
    // mezzo campo, mai portando il proiettile oltre .55; se il bersaglio è ancora troppo fuori, niente (il proiettile resta al centro)
    _T.set(LINEA.xT, 0, 0);
    _dP.subVectors(_P, _C).normalize(); _dT.subVectors(_T, _C).normalize();
    _dx.crossVectors(_dP, _su.set(0, 1, 0)).normalize(); const up = _ax.crossVectors(_dx, _dP);
    const hv = THREE.MathUtils.degToRad(fov) / 2, hx = Math.atan(Math.tan(hv) * camera.aspect), avanti = _dT.dot(_dP);
    const sposta = (o, h) => {
      const a = Math.abs(o), k = a - .8 * h <= .55 * h ? Math.max(a - .8 * h, .42 * a) : .55 * h * E.sin(clamp(1 - (a - 1.35 * h) / (1.1 * h)));
      return Math.sign(o) * Math.min(k, .55 * h);
    };
    const w = E.sin(clamp(u / .45));
    const sx = avanti > 0 ? w * sposta(Math.atan2(_dT.dot(_dx), avanti), hx) : 0, sy = avanti > 0 ? w * sposta(Math.atan2(_dT.dot(up), avanti), hv) : 0;
    _dP.addScaledVector(_dx, Math.tan(sx)).addScaledVector(up, Math.tan(sy)).normalize();
    const L = _C.clone().addScaledVector(_dP, r), v = _C.clone().sub(L).divideScalar(r);
    return [Math.atan2(v.x, v.z), Math.asin(clamp(v.y, -1, 1)), r, L.x, L.y, L.z, fov];
  }
  function camVolo(f, fin) {
    const xB = xProiettile(f), rit = camera.aspect < .8;
    const h = cam(1), eroe = [h[1], h[2], distGiro(h[3], 24), h[4], h[5], h[6], 24];
    // di fianco: il proiettile un filo sotto il centro (le frasi stanno in alto)
    // alla fine il bersaglio a destra (a sinistra c'è "prenota"), sul telefono in alto (il testo sta sotto)
    const lato = [0, .07, rit ? 175 : 100, xB + 6, rit ? 9 : 6, 0, 38];
    const colpo = [-1.22, .06, rit ? 1450 : 640, LINEA.xT, rit ? -40 : 8, rit ? 0 : -60, 32];
    const fine = [-1.3, .05, rit ? 1600 : 720, LINEA.xT, rit ? -150 : 12, rit ? 0 : -190, 30];
    const mix = (A, B, k) => A.map((x, j) => x + (B[j] - x) * k);
    const I_ = rit ? INS_T : INS;
    let c;
    // la frusta dalla pistola al fianco del proiettile: il punto guardato corre avanti con il proiettile (E.out), il resto gira con
    // calma (E.io): così a metà si vede sempre il proiettile, mai un quadro vuoto
    if (f < V1) { const k = f / V1; c = mix(eroe, lato, E.io(k)); c[3] = eroe[3] + (lato[3] - eroe[3]) * E.out(k); }
    else if (f < I_.F0) c = lato;
    else if (f < I_.F1) c = insegui(f, xB, rit, lato);
    else c = mix(insegui(I_.F1, xB, rit, lato), colpo, E.io(seg(f, I_.F1, 1)));
    if (fin > 0) c = mix(c, fine, E.sin(fin));
    return c;
  }
  let fotogrammi = 0, impattoT = null, ricomponi = null, fePrima = 0, fovAttuale = 24, tiltK = 1;
  let pFisso = null, colpoFisso = null, impattoFisso = null, statoImp = -1, statoF = 0;
  let ultimo = null;
  function disegna(ora) {
    fotogrammi++;
    const tempo = tempoFisso ?? (ora - tInizio);
    // di ritorno dopo una pausa (tela fuori schermo, scheda nascosta, primo fotogramma): niente rincorsa di tutta la linea del tempo
    // dal punto vecchio, si riparte da dove si è; e se si è oltre l'impatto il bersaglio è già forato, senza lampo né scossa
    const ripresa = pFisso === null && (ultimo === null || ora - ultimo > 250) && Math.abs(p - cur) > .01;
    ultimo = ora;
    if (ripresa) {
      cur = p;
      const f0 = clamp((p - SEZ.voloDa) / (SEZ.voloA - SEZ.voloDa));
      fePrima = f0; ricomponi = null; impattoT = f0 >= .996 ? ora - 6000 : null;
    }
    cur += (p - cur) * (pFisso !== null ? 1 : liscio);
    const pp = pFisso ?? cur;
    const t = vista ? (vista.t ?? .95) : Math.min(1, pp / SEZ.arma);
    const fS = clamp((pp - SEZ.voloDa) / (SEZ.voloA - SEZ.voloDa)), fin = clamp((pp - SEZ.voloA) / (1 - SEZ.voloA));
    const msColpo = pFisso !== null ? colpoFisso : (colpoT !== null ? ora - colpoT : null);
    const cs = colpoStato(msColpo);
    // dopo il colpo il proiettile esce da solo dalla bocca (4 cm) e resta lì, fermo come in una foto, finché non si scorre; la
    // camera resta sulla pistola (la guida solo lo scroll). Legato allo scroll fra la posa del colpo e il punto del colpo: tornando su
    // il proiettile rientra piano nella canna (niente salti), tornando giù riesce
    const kColpo = clamp((pp - SEZ.arma) / (SEZ.colpo - SEZ.arma));
    const fe = vista ? 0 : Math.max(fS, msColpo !== null ? .014 * E.out(clamp(msColpo / 420)) * kColpo : 0);
    // impatto: una volta per passaggio (fine del volo); tornando indietro il foglio si ricompone (il tempo dell'impatto scorre all'indietro)
    let msImp = -1;
    if (pFisso !== null) msImp = impattoFisso ?? -1;
    else {
      if (fe >= .996 && fePrima < .996 && impattoT === null && !vista) { impattoT = ora; ricomponi = null; O.suImpatto?.(); }
      if (impattoT !== null && fe < .97) { ricomponi = { da: Math.min(1700, ora - impattoT), t0: ora }; impattoT = null; }
      if (impattoT !== null) msImp = ora - impattoT;
      else if (ricomponi) { msImp = ricomponi.da - (ora - ricomponi.t0) * 2.8; if (msImp <= 0) { msImp = -1; ricomponi = null; } }
    }
    fePrima = fe; statoImp = msImp; statoF = fe;
    const W = pose(t, tempo, cs);
    for (const [k, M] of Object.entries(W)) { P[k].g.matrix.copy(M); P[k].g.matrixWorldNeedsUpdate = true; }
    // bossolo: esce dalla finestra quando il carrello è tutto indietro
    const b = P.bossolo;
    if (cs.ms !== undefined && cs.ms < 1500 && !vista && !ridotto) {
      b.g.visible = true;
      const m = cs.ms, back = cs.carrello;
      if (m < 38) b.g.matrix.copy(T(-1.5 - back, 0, 0));
      else {
        // espulso a destra e in alto, gira su se stesso; la gravità lo porta giù fuori dall'inquadratura
        const s = (m - 38) / 1000, c0 = -1.5 - 24 + CART.bossolo / 2;
        b.g.matrix.copy(mul(T(c0 - 22 * s, 175 * s - 620 * s * s, 235 * s), R(s * 7, s * 4, s * 30), T(-CART.bossolo / 2, 0, 0)));
      }
      b.g.matrixWorldNeedsUpdate = true;
    } else b.g.visible = false;
    // fiammata e luce
    const f = cs.fiamma ?? 0, fk = ridotto ? .35 : 1;
    matStella.opacity = Math.min(1, f * 1.3) * fk; stella.scale.setScalar((46 + 60 * (1 - f)) * fk);
    matLingua.opacity = Math.min(1, f * 1.4) * fk; lingue.scale.set((60 + 70 * (1 - f)) * fk, (30 + 18 * (1 - f)) * fk, 1);
    lingue.rotation.x = (cs.ms ?? 0) * .05;
    luce.intensity = f * f * 3.2e4 * fk;
    // fumo
    for (const q of fumo) {
      const m = (cs.ms ?? -1) - q.t0;
      if (m < 0 || m > q.dur || ridotto && q.t0 > 0 && fumo.indexOf(q) % 3) { q.s.visible = false; continue; }
      const k = m / q.dur; q.s.visible = true;
      q.s.position.copy(q.p0).addScaledVector(q.v, m);
      q.s.scale.setScalar(q.s0 + (q.s1 - q.s0) * E.out(k));
      q.s.material.opacity = .15 * Math.sin(Math.PI * Math.min(1, k * 2.2)) ** .7 * (1 - k) ** 1.5 * (ridotto ? .6 : 1);
      q.s.material.rotation = q.rot * k;
    }
    // proiettile in volo, onda d'urto alla bocca, scia, bersaglio
    const xB = xProiettile(fe);
    poligono.aggiorna({
      xB, giro: tempo * .0055 + fe * 60, vis: fe > .0005 && fe < .998 && !vista, onda: msColpo !== null && fe > 0 ? clamp(msColpo / 300) : 0,
      scia: clamp((fe - .03) / .05) * (1 - clamp((fe - .9) / .07)), impatto: msImp, ridotto,
    });
    // camera: la pistola (montaggio) o il volo
    let a, e, d, pxv, pyv, pzv, fovN = 24;
    const inVolo = fe > 0 && !vista;
    if (inVolo) [a, e, d, pxv, pyv, pzv, fovN] = camVolo(fS, fin);
    else {
      let raggio;
      [, a, e, raggio, pxv, pyv, pzv] = cam(t);
      if (vista) { a = vista.a; e = vista.e; raggio = vista.raggio ?? 118; pxv = vista.centro?.[0] ?? 0; pyv = vista.centro?.[1] ?? -52; pzv = vista.centro?.[2] ?? 0; }
      d = distGiro(raggio, 24);
    }
    if (Math.abs(fovN - fovAttuale) > 1e-3) { fovAttuale = fovN; camera.fov = fovN; camera.updateProjectionMatrix(); }
    // nebbia: niente sulla pistola, spegne il lontano nella linea di tiro
    // la linea di tiro c'è solo nel volo: emerge dal buio mentre la camera gira di fianco (nebbia che si apre)
    poligono.gruppo.visible = inVolo;
    const kN = E.sin(clamp(fS / V1));
    scene.fog.near = inVolo ? d + 150 + 270 * kN : 1e7; scene.fog.far = inVolo ? d + 450 + (3750 + fin * 1500) * kN : 2e7;
    // trascinamento con inerzia (solo a pistola montata, prima del volo); dopo un po' torna alla posa dello scroll
    if (x0 === null) { tira += vt; vt *= .88; if (Math.abs(vt) < .002) { fermo++; if (fermo > 50) tira += (Math.round(tira / (Math.PI * 2)) * Math.PI * 2 - tira) * .035; } }
    if ((!montata() || inVolo) && x0 === null) tira *= .9;
    tx += (my * .07 - tx) * .06; ty += (mx * .12 - ty) * .06;
    const tiltN = vista || pFisso !== null || ridotto || inVolo ? 0 : 1;
    tiltK = pFisso !== null || vista ? tiltN : tiltK + (tiltN - tiltK) * .06; const tilt = tiltK;
    // tremolio: il colpo (forte, breve) e l'impatto (più piccolo)
    const tr1 = cs.ms !== undefined ? Math.max(0, 1 - cs.ms / 320) : 0, tr2 = msImp >= 0 && impattoT !== null ? .6 * Math.max(0, 1 - msImp / 280) : 0;
    trema = ridotto || vista ? 0 : Math.max(tr1, tr2);
    const tm = cs.ms ?? msImp;
    const rnd = trema > 0 ? [Math.sin(tm * .19) * .5 + Math.sin(tm * .47) * .5, Math.sin(tm * .23 + 1) * .5 + Math.sin(tm * .61) * .5] : [0, 0];
    giro.rotation.y = -(a + tira + ty * tilt) + rnd[0] * .025 * trema;
    incl.rotation.x = e + tx * tilt + rnd[1] * .03 * trema;
    incl.rotation.z = rnd[0] * .012 * trema;
    centro.position.set(-pxv, -pyv, -pzv);
    // respiro dell'arma montata (tutta insieme, piano)
    incl.position.y = ridotto || vista || pFisso !== null || inVolo ? 0 : Math.sin(tempo / 1400) * 1.2 * clamp((t - .55) * 3);
    let cam_ = camera;
    if (vista?.orto) {
      const o = vista.orto; cam_ = orto;
      const hh = o.mezza ?? 100; orto.top = hh; orto.bottom = -hh; orto.left = -hh * W_ / H_; orto.right = hh * W_ / H_; orto.updateProjectionMatrix();
    } else {
      camera.near = Math.max(4, d * .05); camera.far = d + 30000; camera.updateProjectionMatrix();
      camera.position.set(0, 0, d + (trema ? rnd[0] * 3 * trema : 0)); camera.lookAt(0, 0, 0);
    }
    renderer.render(scene, cam_);
    if (!window.__pronto) { window.__pronto = true; host.classList.add('pronto'); }
  }
  // shader compilati prima del primo fotogramma, anche quelli di bossolo e fumo (nascosti fino al colpo): niente scatti al colpo
  try {
    const nascosti = [P.bossolo.g, ...fumo.map(q => q.s)];
    nascosti.forEach(o => { o.visible = true; });
    misura(); camera.position.set(0, 0, 600); camera.lookAt(0, 0, 0);
    await renderer.compileAsync(scene, camera);
    nascosti.forEach(o => { o.visible = false; });
  } catch (e) { /* compileAsync non c'è: si compila al primo uso */ }
  renderer.setAnimationLoop(ora => { if ((visibile && !sospeso && !document.hidden) || pFisso !== null || vista) disegna(ora); });

  // ——— per le verifiche ———
  // __p(p, { colpo, impatto }): fissa l'avanzamento della sezione (e i ms dal colpo e dall'impatto: effetti a tempo fermi lì)
  window.__p = (x, o = {}) => {
    pFisso = x === null || x === undefined ? null : x; colpoFisso = o.colpo ?? null; impattoFisso = o.impatto ?? null;
    tempoFisso = pFisso === null ? null : (o.tempo ?? 0); vista = null; cur = pFisso ?? cur; fisso = pFisso; disegna(performance.now());
  };
  // __pistola(t): la linea del tempo della pistola (0…1); t in (1, 2] = colpo a (t − 1) s nella posa del colpo
  window.__pistola = x => x === null || x === undefined ? window.__p(null) : x <= 1 ? window.__p(x * SEZ.arma) : window.__p(SEZ.colpo, { colpo: (x - 1) * 1000 });
  window.__vista = (a, e = 0, o = {}) => { vista = a === null || a === undefined ? null : { a, e, ...o }; tempoFisso = vista ? 0 : null; disegna(performance.now()); };
  window.__info = () => {
    let tri = 0; scene.traverse(o => { if (o.isMesh && o.visible) tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
    return { fotogrammi, costruzioneMs: Math.round(tCostruzione), triangoli: Math.round(tri), disegni: renderer.info.render.calls, triangoliDisegnati: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio(), ridotto };
  };
  return {
    vai(x) { p = clamp(x); },
    spara() { colpoT = performance.now(); },
    riarma() { colpoT = null; },
    sospendi(s = true) { sospeso = !!s; },
    stato: () => ({ p, t: cur, f: +statoF.toFixed(3), impatto: Math.round(statoImp), colpo: colpoT !== null ? Math.round(performance.now() - colpoT) : null, giro: +(giro.rotation.y).toFixed(3), tira: +tira.toFixed(3) }),
    renderer, camera, scene, pezzi: P,
    libera() { renderer.setAnimationLoop(null); motore.libera(); scene.traverse(o => o.geometry?.dispose()); renderer.dispose(); renderer.domElement.remove(); },
  };
}
