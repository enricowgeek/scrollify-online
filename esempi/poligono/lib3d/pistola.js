// Pistola 3D · il modello: una pistola di fantasia (nessun marchio, nessuna scritta), solo i pezzi grossi visibili da fuori,
// come l'animazione "ispeziona arma" di un videogioco. Misure dalle foto (src/misura.py → misure.js, scala 6,28 px/mm).
// Assi: +x bocca, +y alto, +z fianco destro (finestra di espulsione). Origine: asse della canna, 640 px della foto di profilo.
// Ogni pezzo è costruito già al suo posto nell'arma montata (coordinate dell'arma): la scena lo sposta e lo gira attorno al suo centro.
// Pezzi: carrello (con i mirini), canna, molla, asta (guida della molla), fusto (con impugnatura, guardia, sgancio del caricatore,
// leva e testa del perno sul fianco sinistro), grilletto, leva (hold-open, fianco destro, con l'alberino), perno (di smontaggio),
// caricatore (con fondello ed elevatore), cartucce ×3, bossolo (per il colpo).
import * as THREE from 'three';
import { Officina, v, v2, vec2, piastra, sfalsa, ritaglia, arrotonda, rettangoloTondo, cerchio2, asola, bordoX, tornio, asse, elica,
  scatolaSmussata, antiorario, orario, linea, TAU, D2R } from './officina.js';
import { MISURE } from './misure.js';

const px = (x, y) => [(x - 640) / 6.28, (298 - y) / 6.28];      // pixel della foto di profilo → mm
const pxv = (x, y) => v2(...px(x, y));
const X = v(1, 0, 0), Y = v(0, 1, 0), Z = v(0, 0, 1);

// ————————————————————————————— carrello —————————————————————————————
// sezione (z, y): piano alto largo 16,8, due smussi (il secondo più ripido), fianchi a ±13, piccolo smusso sotto
export const C = {
  yt: 10.03, yb: -12.1, hw: 13, xn: 87.5, xf: 91.08,
  sez: [[12.5, -12.1], [13, -11.6], [13, 4.2], [11, 7.95], [8.4, 10.03], [-8.4, 10.03], [-11, 7.95], [-13, 4.2], [-13, -11.6], [-12.5, -12.1]],
  cav: { hw: 10, y: 8.5, xBreech: -1.5, xCanale: -76, yCanale: -5, xFronte: 86 },
  porta: { x0: -1.6, x1: 25.1, yb: -4.7, zIn: -6 },
  // zigrinature: posizione della parete dietro (la riga scura) a y = 1,27; pendenza 0,4 (la cima verso la bocca), larghe 2, profonde 1,1
  zig: { dietro: [-67.52, -62.67, -57.8, -53.02, -48.09, -43.31], davanti: [62.26, 67.04, 71.82, 76.75], w: 2, d: 1.1, y0: -11.4, pend: .4 },
};
const xr = y => -85.83 + .267 * (y + 12.1);             // faccia posteriore inclinata
const xA = y => xr(y) + 1.1;                             // fine dello smusso posteriore
const BOCCA = 94.0;
const ASTA_Y = -16.2;

function carrello(O) {
  const { yt, yb, hw, xn, xf, sez, cav, porta: pt, zig } = C;
  const S = sez.map(([z, y]) => v2(z, y));                // antioraria nel piano (z, y)
  const k = 'carr', kL = 'carrLuc';
  const yE = 4.2 + zig.d * (3.75 / 2), L2 = Math.hypot(2, 3.75), sE = (yE - 4.2) / 3.75 * L2;
  const gruppi = [...zig.dietro, ...zig.davanti];
  const xR = (xd, y) => xd + zig.pend * (y - 1.27), xF = (xd, y) => xR(xd, y) + zig.w, xB = (xd, y) => xR(xd, y) + zig.w - zig.d;

  // — smusso posteriore (loft fra la sezione piena e la faccia dietro rientrata) e faccia dietro —
  const Sr = sfalsa(S, i => i === 9 ? .45 : .9);
  const anello = (P, dx) => P.map(p => v(xr(p.y) + dx, p.y, p.x));
  O.loft([anello(Sr, 0), anello(S, 1.1)], { mat: [k, 1], duri: () => true, dentro: v(-70, 0, 0), capoA: k });
  // — naso: dalla sezione piena a xn alla sezione rientrata a xf (smussi diversi per lato) —
  const ins = [1, 2, 1.8, 1.5, 1.2, 1.5, 1.8, 2, 1, 0];
  const Sn = sfalsa(S, i => ins[i]);
  O.loft([S.map(p => v(xn, p.y, p.x)), Sn.map(p => v(xf, p.y, p.x))], { mat: (i, j) => j === 0 || j === 8 ? [k, .8] : [kL, 1], duri: () => true, dentro: v(80, 0, 0) });
  // faccia davanti con il foro della canna
  O.faccia(k, Sn.map(p => v2(p.y, p.x)), [cerchio2(7.8, 40).map(p => v2(p.x, p.y)).reverse()], { o: v(xf, 0, 0), u: Y.clone(), w: Z.clone() }, { dir: Z, col: 1 });
  tornio(O, [[xf, 7.8, k, false, .45], [cav.xFronte, 7.8]], { seg: 40, k });   // tunnel del foro (normali verso l'asse)

  // — piano alto (con la tacca della finestra a destra) —
  const xa = xA(yt);
  O.faccia(k, [[xa, -8.4], [pt.x0, -8.4], [pt.x0, -pt.zIn], [pt.x1, -pt.zIn], [pt.x1, -8.4], [xn, -8.4], [xn, 8.4], [xa, 8.4]],
    [], { o: v(0, yt, 0), u: X.clone(), w: v(0, 0, -1) }, { dir: X });
  // — smussi (strisce piane lungo x): smusso 1 (8,4; yt) → (11; 7,95), smusso 2 (11; 7,95) → (13; 4,2) —
  const striscia = (kk, A, B, lato, tacche, porta) => {
    // A, B = [z, y] dei due bordi (A in basso); lato = ±1; tacche = [[xa, xb, xa2, xb2, s]] dal bordo A; porta = [x0, x1] o null
    const a = v(0, A[1], A[0] * lato), b = v(0, B[1], B[0] * lato), w = new THREE.Vector3().subVectors(b, a), L = w.length(); w.normalize();
    const fuori = v(0, (A[1] + B[1]) / 2, (A[0] + B[0]) / 2 * lato).normalize();
    const pezzo = (x0, x1, conTacche) => {
      const P = [[x0 === null ? xA(A[1]) : x0, 0]];
      if (conTacche) for (const [r0, f0, r1, f1] of tacche) { if (r0 > P[0][0] && f0 < (x1 ?? xn)) P.push([r0, 0], [r1, sE], [f1, sE], [f0, 0]); }
      P.push([x1 ?? xn, 0], [x1 ?? xn, L], [x0 === null ? xA(B[1]) : x0, L]);
      O.faccia(kk, P, [], { o: a, u: X.clone(), w }, { dir: X, inverti: new THREE.Vector3().crossVectors(X, w).dot(fuori) < 0 });
    };
    if (porta) { pezzo(null, porta[0], true); pezzo(porta[1], null, true); } else pezzo(null, null, true);
  };
  const tacche = gruppi.map(xd => [xR(xd, 4.2), xF(xd, 4.2), xR(xd, yE), xB(xd, yE)]);
  for (const lato of [1, -1]) {
    const porta = lato > 0 ? [pt.x0, pt.x1] : null;
    striscia(kL, [11, 7.95], [8.4, yt], lato, [], porta);
    striscia(kL, [13, 4.2], [11, 7.95], lato, tacche, porta);
    // fianco: tacche delle zigrinature in alto, finestra di espulsione a destra
    const P = [[xA(yb + .5), yb + .5], [xn, yb + .5], [xn, 4.2]];
    const lista = gruppi.map(xd => ({ xd, x: xF(xd, 4.2) }));
    if (lato > 0) lista.push({ porta: true, x: pt.x1 });
    lista.sort((p, q) => q.x - p.x);
    for (const g of lista) {
      if (g.porta) P.push([pt.x1, 4.2], [pt.x1, pt.yb], [pt.x0, pt.yb], [pt.x0, 4.2]);
      else P.push([xF(g.xd, 4.2), 4.2], [xF(g.xd, zig.y0), zig.y0], [xR(g.xd, zig.y0), zig.y0], [xR(g.xd, 4.2), 4.2]);
    }
    P.push([xA(4.2), 4.2]);
    O.faccia(k, P, [], { o: v(0, 0, hw * lato), u: X.clone(), w: Y.clone() }, { dir: X, inverti: lato < 0 });
    // smusso basso
    const a = v(0, -11.6, 13 * lato), b = v(0, yb, 12.5 * lato), w = new THREE.Vector3().subVectors(b, a); const Lb = w.length(); w.normalize();
    O.faccia(kL, [[xA(-11.6), 0], [xn, 0], [xn, Lb], [xA(yb), Lb]], [], { o: a, u: X.clone(), w }, { dir: X, inverti: new THREE.Vector3().crossVectors(X, w).dot(v(0, -1, lato)) < 0, col: .8 });
    // zigrinature: fondo, pareti, testata bassa
    const zf = (hw - zig.d) * lato, ze = hw * lato;
    for (const xd of gruppi) {
      O.faccia(k, [[xR(xd, zig.y0), zig.y0], [xB(xd, zig.y0), zig.y0], [xB(xd, yE), yE], [xR(xd, yE), yE]], [], { o: v(0, 0, zf), u: X.clone(), w: Y.clone() }, { dir: Y, inverti: lato < 0, col: .6 });
      // parete dietro (dritta, in ombra) e parete davanti inclinata a 45° (lucida: la riga chiara della foto)
      O.quad(k, v(xR(xd, zig.y0), zig.y0, zf), v(xR(xd, zig.y0), zig.y0, ze), v(xR(xd, 4.2), 4.2, ze), v(xR(xd, yE), yE, zf), Y, .5, v(xR(xd, 0) - 1, 0, (hw - .5) * lato));
      O.quad(kL, v(xB(xd, zig.y0), zig.y0, zf), v(xF(xd, zig.y0), zig.y0, ze), v(xF(xd, 4.2), 4.2, ze), v(xB(xd, yE), yE, zf), Y, 1, v(xF(xd, 0) + 1, 0, (hw - 1.2) * lato));
      O.quad(k, v(xR(xd, zig.y0), zig.y0, zf), v(xB(xd, zig.y0), zig.y0, zf), v(xF(xd, zig.y0), zig.y0, ze), v(xR(xd, zig.y0), zig.y0, ze), X, .6, v(xR(xd, zig.y0) + .5, zig.y0 - 1, (hw - .3) * lato));
    }
  }
  // — faccia sotto (y = yb) con l'apertura del canale —
  O.faccia(k, [[xA(yb), -12.5], [xn, -12.5], [xn, 12.5], [xA(yb), 12.5]], [[[cav.xCanale, -cav.hw], [cav.xFronte, -cav.hw], [cav.xFronte, cav.hw], [cav.xCanale, cav.hw]].reverse()],
    { o: v(0, yb, 0), u: X.clone(), w: Z.clone() }, { dir: X, col: .7 });
  // — cavità: pareti interne, soffitti, faccia dell'otturatore, fondo del canale, retro del muro davanti —
  for (const lato of [1, -1]) {
    const P = [[cav.xCanale, yb], [cav.xFronte, yb], [cav.xFronte, cav.y]];
    if (lato > 0) P.push([pt.x1, cav.y], [pt.x1, pt.yb], [pt.x0, pt.yb], [pt.x0, cav.y]);
    P.push([cav.xBreech, cav.y], [cav.xBreech, cav.yCanale], [cav.xCanale, cav.yCanale]);
    O.faccia(k, P, [], { o: v(0, 0, cav.hw * lato), u: X.clone(), w: Y.clone() }, { dir: X, inverti: lato > 0, col: .4 });
  }
  O.faccia(k, [[cav.xCanale, -cav.hw], [cav.xBreech, -cav.hw], [cav.xBreech, cav.hw], [cav.xCanale, cav.hw]], [], { o: v(0, cav.yCanale, 0), u: X.clone(), w: Z.clone() }, { dir: X, col: .35 });
  O.faccia(k, [[cav.xBreech, -cav.hw], [pt.x0, -cav.hw], [pt.x0, -pt.zIn], [pt.x1, -pt.zIn], [pt.x1, -cav.hw], [cav.xFronte, -cav.hw], [cav.xFronte, cav.hw], [cav.xBreech, cav.hw]].map(([x, z]) => [x, -z]),
    [], { o: v(0, cav.y, 0), u: X.clone(), w: Z.clone() }, { dir: X, col: .35 });
  O.faccia(k, [[cav.yCanale, -cav.hw], [cav.y, -cav.hw], [cav.y, cav.hw], [cav.yCanale, cav.hw]], [], { o: v(cav.xBreech, 0, 0), u: Y.clone(), w: Z.clone() }, { dir: Y, col: .5 });
  O.faccia('nero', cerchio2(1.1, 16), [], { o: v(cav.xBreech + .02, 0, 0), u: Y.clone(), w: Z.clone() }, {});
  O.faccia(k, [[yb, -cav.hw], [cav.yCanale, -cav.hw], [cav.yCanale, cav.hw], [yb, cav.hw]], [], { o: v(cav.xCanale, 0, 0), u: Y.clone(), w: Z.clone() }, { dir: Y, col: .3 });
  O.faccia(k, [[yb, -cav.hw], [cav.y, -cav.hw], [cav.y, cav.hw], [yb, cav.hw]], [cerchio2(7.8, 40)], { o: v(cav.xFronte, 0, 0), u: Y.clone(), w: Z.clone() }, { dir: Y, col: .3, inverti: true });
  // — finestra di espulsione: pareti del taglio, fondo, bordo interno —
  const tagliata = [[pt.zIn, cav.y], [pt.zIn, yt], [8.4, yt], [11, 7.95], [13, 4.2], [13, pt.yb], [cav.hw, pt.yb], [cav.hw, cav.y]];
  O.faccia(k, tagliata, [], { o: v(pt.x0, 0, 0), u: Z.clone(), w: Y.clone() }, { dir: Z, inverti: true, col: .75 });
  O.faccia(k, tagliata, [], { o: v(pt.x1, 0, 0), u: Z.clone(), w: Y.clone() }, { dir: Z, col: .75 });
  O.quad(k, v(pt.x0, pt.yb, cav.hw), v(pt.x1, pt.yb, cav.hw), v(pt.x1, pt.yb, 13), v(pt.x0, pt.yb, 13), X, .8, v(10, pt.yb - 1, 11));
  O.quad(k, v(pt.x0, cav.y, pt.zIn), v(pt.x1, cav.y, pt.zIn), v(pt.x1, yt, pt.zIn), v(pt.x0, yt, pt.zIn), X, .8, v(10, 9, pt.zIn - 1));

  // — mirini —
  const tacca = [[-75.96, 9.9], [-60.99, 9.9], [-66.08, 16.24], [-74.52, 16.24], [-74.84, 15.13]];
  const bassi = (P, yMin = 10) => i => { const a = P[i], b = P[(i + 1) % P.length]; return (a[1] < yMin && b[1] < yMin) ? 0 : 1; };
  for (const [z0, z1] of [[2, 7.5], [-7.5, -2]]) piastra(O, { contorno: tacca, z0, z1, smussi: [[.35, .35]], molt: bassi(tacca), k: 'carr', kSmusso: 'carrLuc' });
  const taccaC = ritaglia(vec2(tacca), 0, 1, 13.2).map(p => [p.x, p.y]);
  piastra(O, { contorno: taccaC, z0: -2.05, z1: 2.05, smussi: [[0, .001]], molt: () => 0, k: 'carr' });
  const mirino = [[74.68, 9.9], [88.69, 9.9], [87.58, 13.54], [86.31, 14.65], [76.11, 15.92]];
  piastra(O, { contorno: mirino, z0: -3.3, z1: 3.3, smussi: [[.3, .3]], molt: bassi(mirino), k: 'carr', kSmusso: 'carrLuc' });
  // puntino bianco sulla faccia dietro del mirino (verso chi mira)
  const nM = v(-(15.92 - 9.9), 76.11 - 74.68, 0).normalize(), pM = v(74.68 + (76.11 - 74.68) * .55, 9.9 + (15.92 - 9.9) * .55, 0);
  tornio(O, [[-.3, 0, 'lume'], [-.3, .95, 'lume'], [.12, .95, 'lume'], [.12, 0]], { seg: 20, m: asse(pM, nM.clone().negate()), k: 'lume' });
  // — piastrina dietro con le righe (sulla faccia inclinata) —
  const nR = v(-1, .267, 0).normalize(), uR = v(.267, 1, 0).normalize();
  const mR = new THREE.Matrix4().makeBasis(Z.clone(), uR, nR).setPosition(v(xr(-5), -5, 0));
  piastra(O, { contorno: rettangoloTondo(0, .2, 6.2, 6.8, 1.4, 3), z0: -.3, z1: .75, smussi: [[.3, .3]], k: 'carr', kSmusso: 'carrLuc', m: mR });
  for (let i = 0; i < 6; i++) scatolaSmussata(O, 'carrLuc', [0, -5.2 + i * 2.05, .85], [5.2, .45, .25], .15, { m: mR });
}

// ————————————————————————————— canna —————————————————————————————
function canna(O) {
  tornio(O, [[12, 0, 'acc'], [12, 6.9, 'acc'], [86.3, 6.9, 'acc'], [86.6, 7.5, 'acc'], [91.5, 7.5, 'accLuc', true], [92.6, 7.25, 'accLuc', true], [93.5, 6.6, 'accLuc', true],
    [BOCCA, 5.8, 'accLuc'], [BOCCA, 5.2, 'accLuc'], [BOCCA - .3, 4.6, 'nero', false, .4], [60, 4.6, 'nero'], [60, 0]], { seg: 40 });
  // blocco della camera (quello che si vede nella finestra): parte alta larga (x −1,5…25, y 3…9,95) con lo smusso alto lucido e
  // i fianchi in acciaio lucido che scuriscono verso il basso (ombra finta delle pareti della finestra); sotto la camera più stretta
  // (gradino di 0,6 mm: la riga d'ombra della foto). Il piano alto resta 0,08 sotto il carrello
  const ombraY = (y0, y1, c0, c1) => q => c0 + (c1 - c0) * Math.min(1, Math.max(0, (q.y - y0) / (y1 - y0)));
  piastra(O, {
    contorno: [[-1.5, 3], [25, 3], [25, 9.95], [-1.5, 9.95]], z0: -9.8, z1: 9.8, smussi: [[.9, .9]], k: 'canna', kFaccia: 'cannaLuc', kSmusso: 'accLuc',
    molt: i => [.35, .7, 1.2, .7][i], colFaccia: ombraY(3, 9.95, .42, 1), dir: 'x',
  });
  piastra(O, {
    contorno: [[-1.5, -7], [25, -7], [25, 3.2], [-1.5, 3.2]], z0: -9.2, z1: 9.2, smussi: [[.5, .5]], k: 'canna', kFaccia: 'cannaLuc', kSmusso: 'canna',
    molt: i => [1, 1, 0, 1][i], colFaccia: ombraY(-7, 3.2, .22, .42), col: .5, dir: 'x',
  });
  // raccordo della camera verso il tubo (tronco di cono)
  tornio(O, [[25, 7.6, 'canna', false, .55], [28, 6.9, 'canna', false, .7]], { seg: 40 });
  // bocca della camera sul retro del blocco
  O.faccia('nero', cerchio2(5, 32), [], { o: v(-1.52, 0, 0), u: Z.clone(), w: Y.clone() }, {});
  // tenone sotto la camera
  scatolaSmussata(O, 'acc', [5, -10.5, 0], [4.5, 3.7, 4.8], .5);
}

// ————————————————————————————— asta guida e molla di recupero —————————————————————————————
function asta(O) {
  tornio(O, [[10.5, 0], [10.5, 3.8], [10.8, 4.2], [12.0, 4.2], [12.3, 3.8], [12.3, 1.9], [90.6, 1.9], [90.6, 2.6], [91.0, 2.9], [92.2, 2.9], [92.4, 2.6], [92.4, .8, 'nero'], [92.2, .8, 'nero'], [92.2, 0]],
    { seg: 28, m: new THREE.Matrix4().makeTranslation(0, ASTA_Y, 0), k: 'acc' });
}
function molla(O) {
  elica(O, 'acc', { R: 3.1, rf: .5, x0: 12.4, x1: 90.2, giri: 17, passiGiro: 16, lati: 6, m: new THREE.Matrix4().makeTranslation(0, ASTA_Y, 0), piatte: 1 });
}

// ————————————————————————————— fusto —————————————————————————————
const HW = { dorso: 13.3, coperchio: 10.8, guardia: 6.6, impugnatura: 13.8 };
export const CANALE = { x0: 10, x1: 89.5, hw: 4.4, y: -20.6 };
const TAGLIO_X = -17;
function fusto(O) {
  const F1 = vec2(MISURE.fustoAlto);
  const yTop = Math.max(...F1.map(p => p.y)), yTaglio = px(0, 494)[1], xFr = Math.max(...F1.map(p => p.x));
  const cl = (P, f) => i => { const a = P[i], b = P[(i + 1) % P.length]; return f(a, b); };
  // — dorso (coda di castoro, sopra l'impugnatura): x ≤ −25,5, largo 26,6, smussi ampi e un raccordo a 45° verso il coperchio —
  const D = ritaglia(F1, 1, 0, TAGLIO_X);
  piastra(O, {
    contorno: D, z0: -HW.dorso, z1: HW.dorso, smussi: [[1.0, 2.5]], k: 'poli',
    molt: cl(D, (a, b) => (a.y > yTop - .2 && b.y > yTop - .2) ? 0 : (Math.abs(a.x - TAGLIO_X) < .01 && Math.abs(b.x - TAGLIO_X) < .01) ? 2.5 : (Math.abs(a.y - yTaglio) < .05 && Math.abs(b.y - yTaglio) < .05 && a.x > -72) ? 0 : 1),
  });
  // — coperchio della molla, slitta e fronte (largo 21,6): faccia davanti con il foro dell'asta —
  const P = ritaglia(F1, -1, 0, -TAGLIO_X);
  const davanti = (a, b) => a.x > xFr - .35 && b.x > xFr - .35;
  const fr = P.filter(p => p.x > xFr - .35), yF0 = Math.max(...fr.map(p => p.y)), yF1 = Math.min(...fr.map(p => p.y));
  // la slitta (sotto il coperchio, davanti alla guardia) è più stretta: gradino smussato lungo il fianco, come nella foto
  const XR = 36, YR = px(0, 453)[1];
  const A = ritaglia(P, 1, 0, XR), Pd = ritaglia(P, -1, 0, -XR), A2 = ritaglia(Pd, 0, -1, -YR), B = ritaglia(Pd, 0, 1, YR);
  const su = (a, b) => a.y > yTop - .2 && b.y > yTop - .2, taglioX = x => (a, b) => Math.abs(a.x - x) < .01 && Math.abs(b.x - x) < .01;
  const taglioY = y => (a, b) => Math.abs(a.y - y) < .01 && Math.abs(b.y - y) < .01;
  // il canale della molla: x da CANALE.x0 a CANALE.x1, largo ±CANALE.hw, fondo a CANALE.y. Il fusto lì è fatto di due mezze piastre
  // (le pareti del canale) sopra una piastra intera (il fondo); il muro davanti ha il foro tondo dell'asta
  const { x0: cx0, x1: cx1, hw: chw, y: cy } = CANALE;
  const Ar = ritaglia(A, 1, 0, cx0), Af = ritaglia(A, -1, 0, -cx0), Afs = ritaglia(Af, 0, -1, -cy), Afg = ritaglia(Af, 0, 1, cy);
  const A2m = ritaglia(A2, 1, 0, cx1), A2d = ritaglia(A2, -1, 0, -cx1), A2s = ritaglia(A2m, 0, -1, -cy), A2g = ritaglia(A2m, 0, 1, cy);
  const tagli = [taglioX(TAGLIO_X), taglioX(XR), taglioX(cx0), taglioX(cx1), taglioY(cy)];
  const vivo = (P_, extra = () => false) => cl(P_, (a, b) => su(a, b) || extra(a, b) || tagli.some(f => f(a, b)) ? 0 : 1);
  const intera = (P_, extra, o = {}) => piastra(O, { contorno: P_, z0: -HW.coperchio, z1: HW.coperchio, smussi: [[.9, .9]], k: 'poli', molt: vivo(P_, extra), ...o });
  const mezze = P_ => { for (const s of [1, -1]) piastra(O, {
    contorno: P_, z0: s > 0 ? chw : -HW.coperchio, z1: s > 0 ? HW.coperchio : -chw, smussi: s > 0 ? [[.9, .9]] : [[0, .001]], smussiA: s > 0 ? [[0, .001]] : [[.9, .9]], k: 'poli', molt: vivo(P_),
  }); };
  intera(Ar); mezze(Afs); intera(Afg); mezze(A2s); intera(A2g);
  intera(A2d, davanti, { pareti: cl(A2d, (a, b) => !davanti(a, b)) });
  piastra(O, { contorno: B, z0: -9.4, z1: 9.4, smussi: [[.7, .7]], k: 'poli', molt: cl(B, (a, b) => taglioY(YR)(a, b) || taglioX(XR)(a, b) ? 0 : 1) });
  O.faccia('poli', [[yF1, -HW.coperchio], [yF0, -HW.coperchio], [yF0, HW.coperchio], [yF1, HW.coperchio]], [cerchio2(3.7, 32, ASTA_Y, 0).reverse()],
    { o: v(xFr, 0, 0), u: Y.clone(), w: Z.clone() }, { dir: Z });
  tornio(O, [[xFr, 3.7, 'nero', false, .4], [CANALE.x1 + .05, 3.7, 'nero'], [CANALE.x1 + .05, 0]], { seg: 32, m: new THREE.Matrix4().makeTranslation(0, ASTA_Y, 0), k: 'nero' });
  // — guardia del grilletto —
  const G = vec2(MISURE.guardia.esterno), yG = Math.max(...G.map(p => p.y)), xG = Math.min(...G.map(p => p.x));
  piastra(O, {
    contorno: G, buchi: [{ punti: MISURE.guardia.buco, smussi: [[.5]] }], z0: -HW.guardia, z1: HW.guardia, smussi: [[.7, .7]], k: 'poli', colBuco: .6,
    molt: cl(G, (a, b) => (a.y > yG - .15 && b.y > yG - .15) || (a.x < xG + .15 && b.x < xG + .15) ? 0 : 1),
  });
  // righe sul davanti della guardia (8, come nella foto)
  for (let i = 0; i < 8; i++) {
    const [, y] = px(0, 528 + i * 12.2), x = bordoX(G, y, 1);
    scatolaSmussata(O, 'poli', [x - .1, y, 0], [.45, .55, 4.2], .18);
  }
  // — impugnatura: anelli orizzontali (dorso, smussi, fianchi piani, smussi, davanti), dalla riga 486 px al fondo inclinato —
  const I = MISURE.impugnatura, righe = [];
  for (let i = 0; i < I.y.length; i++) { const ypx = 298 - I.y[i] * 6.28; if (i % 2 === 0 || (ypx > 636 && ypx < 704) || i === I.y.length - 1) righe.push(i); }
  const hwI = ypx => ypx <= 495 ? 13.2 : ypx <= 562 ? 13.3 : ypx >= 578 ? HW.impugnatura : 13.3 + (ypx - 562) / 16 * (HW.impugnatura - 13.3);
  const fondo = x => { const X_ = 640 + x * 6.28; return (298 - (1002 + (X_ - 90) * 16 / 296)) / 6.28; };
  const anelloI = (xb, xf, y, h, yf = null) => {
    const q = [[xb, -5.2], [xb, 5.2], [xb + 2.6, h - 2.8], [xb + 6.2, h], [xf - 5.8, h], [xf - 2.4, h - 3.2], [xf, 5.8], [xf, -5.8], [xf - 2.4, -(h - 3.2)], [xf - 5.8, -h], [xb + 6.2, -h], [xb + 2.6, -(h - 2.8)]];
    return q.map(([x, z]) => v(x, yf ? yf(x) : y, z));
  };
  const R = righe.map(i => anelloI(I.dietro[i], I.davanti[i], I.y[i], hwI(298 - I.y[i] * 6.28)));
  const ul = righe.at(-1);
  R.push(anelloI(I.dietro[ul] - .1, I.davanti[ul] + .05, 0, HW.impugnatura, fondo));
  const yPan = [px(0, 962)[1], px(0, 578)[1]];
  O.loft(R, { mat: (i, j, f, Q) => [[1, 2, 4, 5, 7, 8, 10, 11].includes(j) && Q[0].y > yPan[0] && Q[0].y < yPan[1] && Q[3].y > yPan[0] && Q[3].y < yPan[1] ? 'poliGrip' : 'poli', j === 0 || j === 6 ? .92 : 1], duri: () => true, liscioV: true, dentro: i => { const r = R[i]; return v((r[0].x + r[6].x) / 2, r[0].y, 0); }, capoB: ['poli', .8] });
  // bocca del pozzetto del caricatore (scura, appena sotto il fondo)
  // coste orizzontali sul dorso e sul davanti dell'impugnatura (in due metà, come nella foto di fronte/retro)
  const interp = (arr, y) => { const ys = I.y; for (let i = 0; i + 1 < ys.length; i++) if ((ys[i] - y) * (ys[i + 1] - y) <= 0) { const t = (y - ys[i]) / (ys[i + 1] - ys[i]); return arr[i] + (arr[i + 1] - arr[i]) * t; } return arr.at(-1); };
  for (let k = -7; k <= 17; k++) {
    const y = px(0, 699.5 + k * 16.4)[1]; const xb = interp(I.dietro, y);
    for (const s of [1, -1]) scatolaSmussata(O, 'poli', [xb - .22, y, s * 2.75], [.55, .62, 2.15], .2);
  }
  for (let k = 0; k <= 16; k++) {
    const y = px(0, 703.5 + k * 16.6)[1]; const xf = interp(I.davanti, y);
    for (const s of [1, -1]) scatolaSmussata(O, 'poli', [xf + .22, y, s * 2.75], [.55, .62, 2.15], .2);
  }
  // pannelli a puntini esagonali sui fianchi
  const pannello = arrotonda([pxv(139, 940), pxv(305, 959), pxv(405, 590), pxv(246, 574)], 3.2, 4);
  for (const s of [1, -1]) piastra(O, { contorno: pannello, z0: s > 0 ? HW.impugnatura - .15 : -HW.impugnatura - .32, z1: s > 0 ? HW.impugnatura + .32 : -HW.impugnatura + .15, smussi: [[.22, .22]], k: 'poli', kFaccia: 'poliGrip', kRetro: 'poliGrip', dir: 'x' });
  // sgancio del caricatore (pulsante quadro tondeggiante, su entrambi i fianchi)
  const [sx, sy] = px(465, 605), pul = rettangoloTondo(0, 0, 4.3, 4.3, 1.6, 3).map(p => v2(sx + p.x * Math.cos(-.2) - p.y * Math.sin(-.2), sy + p.x * Math.sin(-.2) + p.y * Math.cos(-.2)));
  for (const s of [1, -1]) piastra(O, { contorno: pul, z0: s > 0 ? 11.5 : -15.4, z1: s > 0 ? 15.4 : -11.5, smussi: [[.5, .5]], k: 'brunito', kSmusso: 'accLuc' });
  guide(O);
  lineeDiStampo(O);
}

// blocco centrale sopra il fusto (dentro il canale del carrello: chiude la fessura carrello/fusto) e le quattro guide d'acciaio
function guide(O) {
  const y0 = -12.6, y1 = -8.2;
  const G = vec2([[-74, y0], [89.5, y0], [89.5, y1 - 1.2], [88.3, y1], [-8, y1], [-12, y1 - 2.4], [-72.8, y1 - 2.4], [-74, y1 - 3.6]]);
  const dietro = ritaglia(G, 1, 0, CANALE.x0 - 2), avanti = ritaglia(G, -1, 0, -(CANALE.x0 - 2));
  const piatto = (P_) => i => { const a = P_[i], b = P_[(i + 1) % P_.length]; return (Math.abs(a.y - y0) < .01 && Math.abs(b.y - y0) < .01) || (Math.abs(a.x - (CANALE.x0 - 2)) < .01 && Math.abs(b.x - (CANALE.x0 - 2)) < .01) ? 0 : 1; };
  piastra(O, { contorno: dietro, z0: -8.4, z1: 8.4, smussi: [[.5, .5]], k: 'poli', molt: piatto(dietro) });
  for (const s of [1, -1]) piastra(O, { contorno: avanti, z0: s > 0 ? CANALE.hw : -8.4, z1: s > 0 ? 8.4 : -CANALE.hw, smussi: [[.5, .5]], k: 'poli', molt: piatto(avanti) });
  for (const [x0, x1, yb] of [[-72, -52, y1 - 2.4], [40, 62, y1]]) for (const s of [1, -1])
    scatolaSmussata(O, 'brunito', [(x0 + x1) / 2, yb + .9, s * 8.9], [(x1 - x0) / 2, .9, .9], .25);
}

// ————————————————————————————— grilletto —————————————————————————————
function grilletto(O) {
  const G = vec2(MISURE.grilletto);
  piastra(O, { contorno: G, buchi: [{ punti: asola(pxv(592, 566), pxv(611, 626), 1.8), smussi: [[.25]] }], z0: -3.1, z1: 3.1, smussi: [[.45, .45]], k: 'acc', kSmusso: 'accLuc' });
  tornio(O, [[-3.6, 0], [-3.6, 1.1], [3.6, 1.1], [3.6, 0]], { seg: 20, m: asse(v(...px(593, 546), 0), Z), k: 'accLuc' });
}

// ————————————————————————————— leva hold-open (lato = 1 destra, −1 sinistra) —————————————————————————————
const LEVA = [[449, 388], [455, 381], [545, 381], [550, 374], [592, 373], [597, 377], [586, 404], [578, 410], [456, 410], [449, 404]].map(([x, y]) => px(x, y));
function leva(O, lato = 1, alberino = true) {
  const z0 = 10.7, z1 = 15.6;
  piastra(O, { contorno: LEVA, z0: lato > 0 ? z0 : -z1, z1: lato > 0 ? z1 : -z0, smussi: [[.4, .4]], k: 'acc', kSmusso: 'accLuc' });
  for (const ypx of [386.5, 392.5, 398.5, 404.5]) {
    const [x0, y] = px(452, ypx), [x1] = px(541, ypx);
    scatolaSmussata(O, 'accLuc', [(x0 + x1) / 2, y, lato * (z1 + .12)], [(x1 - x0) / 2, .38, .2], .12);
  }
  if (alberino) tornio(O, [[-11.2, 0], [-11.2, 1.5], [z0, 1.5], [z0, 0]], { seg: 18, m: asse(v(...px(470, 395), 0), Z), k: 'acc' });
}

// ————————————————————————————— perno di smontaggio (testa sul fianco destro) —————————————————————————————
const PERNO = [14.5, -20.2];
function perno(O) {
  tornio(O, [[-21.2, 0], [-21.2, 1.6, 'acc'], [0, 1.6, 'accLuc'], [0, 3.0, 'accLuc'], [.7, 3.0, 'accLuc'], [1.0, 2.7, 'accLuc'], [1.0, 0]], { seg: 36, m: asse(v(PERNO[0], PERNO[1], HW.coperchio), Z), k: 'accLuc' });
}

// testa sinistra del perno: un tappo che si innesta sull'alberino (entra da sinistra)
function pernoSinistro(O) {
  tornio(O, [[-2, 0], [-2, 1.7, 'acc'], [0, 1.7, 'accLuc'], [0, 3.0, 'accLuc'], [.7, 3.0, 'accLuc'], [1.0, 2.7, 'accLuc'], [1.0, 0]], { seg: 36, m: asse(v(PERNO[0], PERNO[1], -HW.coperchio), v(0, 0, -1)), k: 'accLuc' });
}

// linee di stampo del fusto (come nella foto): la fascia alta sotto il carrello, l'incavo liscio per il pollice sopra l'impugnatura,
// lo spigolo del coperchio verso la slitta. Linee scure sottili appoggiate sulle facce piane dei due fianchi
function lineeDiStampo(O) {
  const P = pts => pts.map(([x, y]) => px(x, y));
  const fascia = P([[190, 382], [193, 398], [202, 409], [216, 413.5], [423, 413.5], [436, 409], [442, 399]]);
  const pollice = [[302, 472], [440, 469], [452, 481], [457, 538], [447, 557], [431, 560], [313, 515], [300, 501]];
  const pollP = arrotonda(vec2(P(pollice)), 2.2, 3);
  const coperchio = P([[808, 440], [846, 404], [872, 384]]);
  for (const s of [1, -1]) {
    const zD = s * (HW.dorso + .03), zC = s * (HW.coperchio + .03);
    linea(O, 'nero', fascia, zD, .42, s);
    linea(O, 'nero', coperchio, zC, .42, s);
    // incavo del pollice: fondo liscio (senza grana) e bordo scuro
    const Q = s > 0 ? pollP : pollP.slice().reverse();
    O.faccia('poliLiscio', Q, [], { o: v(0, 0, zD - s * .01), u: X.clone(), w: Y.clone() }, { inverti: s < 0 });
    linea(O, 'nero', [...pollP, pollP[0]], zD + s * .005, .38, s);
  }
}

// ————————————————————————————— caricatore —————————————————————————————
// riferimento del caricatore: origine al centro del fondello (sulla linea del fondo dell'impugnatura), u = asse (inclinato 19°
// verso la bocca), f = avanti (perpendicolare), z. Cartucce perpendicolari all'asse, sfalsate su due file.
const ANG = 19 * D2R;
export const CAR = {
  O: v(-63.9, -113.4, 0), u: v(Math.sin(ANG), Math.cos(ANG), 0), f: v(Math.cos(ANG), -Math.sin(ANG), 0), H: 100, hw: 8.9,
  // posto della cartuccia n (0 = la più alta) nel riferimento del caricatore: [f, u, z]
  posto: n => [-.45, 100 - 1.8 - n * 7.6, n % 2 ? -3.15 : 3.15],
};
export const matCar = () => new THREE.Matrix4().makeBasis(CAR.f, CAR.u, Z).setPosition(CAR.O);
function caricatore(O) {
  const m = matCar();
  const sez = [[-16, -8.2], [-15.2, -8.9], [11.2, -8.9], [13.8, -8.1], [15.5, -6.2], [16.2, -3.4], [16.4, 0], [16.2, 3.4], [15.5, 6.2], [13.8, 8.1], [11.2, 8.9], [-15.2, 8.9], [-16, 8.2]].map(([f, z]) => v2(f, z));
  const S = antiorario(sez), Si = sfalsa(S, .8);
  const tan = Math.tan(15.9 * D2R);
  const anello = (P, u) => P.map(p => v(p.x, typeof u === 'function' ? u(p.x) : u, p.y));
  const top = CAR.H;
  O.loft([anello(S, f => tan * f - .5), anello(S, top)], { mat: (i, j) => [j >= 3 && j <= 8 ? 'carrLuc' : 'caric', 1, 'v'], duri: () => true, dentro: (i, j, c) => v(0, c.y, 0), m });
  // costola stampata sui fianchi (spezza il piano: prende la luce anche di sbieco)
  for (const s of [1, -1]) piastra(O, { contorno: rettangoloTondo(3, 50, 2.2, 38, 2, 3), z0: s > 0 ? CAR.hw - .2 : -CAR.hw - .55, z1: s > 0 ? CAR.hw + .55 : -CAR.hw + .2, smussi: [[.4, .4]], k: 'caric', kSmusso: 'carrLuc', m });
  // fori di controllo sul fianco (dietro): quattro per lato
  for (const s of [1, -1]) for (let i = 0; i < 4; i++) {
    const o = CAR.O.clone().addScaledVector(CAR.u, 34 + i * 15).addScaledVector(CAR.f, -10.5).add(v(0, 0, s * (CAR.hw + .03)));
    O.faccia('nero', cerchio2(1.25, 16), [], { o, u: CAR.f.clone(), w: CAR.u.clone() }, { inverti: s < 0 });
  }
  O.loft([anello(Si, f => tan * f + 2), anello(Si, top)], { mat: ['nero', .5], duri: () => true, dentro: (i, j, c) => v(c.x * 2, c.y, c.z * 2), m });   // pareti dentro (normali verso l'asse)
  // bordo in alto (anello piano fra fuori e dentro): piano del caricatore a u = H, normale +u
  O.faccia('carrLuc', S.map(p => v2(p.x, -p.y)), [Si.map(p => v2(p.x, -p.y))], { o: CAR.O.clone().addScaledVector(CAR.u, top), u: CAR.f.clone(), w: v(0, 0, -1) }, { dir: CAR.f });
  // labbra: due listelli che rientrano sopra la cartuccia più alta
  for (const s of [1, -1]) scatolaSmussata(O, 'carrLuc', [-4, top - .6, s * 7.25], [10.5, .6, 1.0], .25, { m });
  // fondello (dalla foto: retro chiaro in acciaio, davanti scuro)
  // fondello: sagoma pulita presa dal contorno della foto (il contorno automatico ha i gradini dei pixel sul bordo basso)
  const Fo = vec2([[86, 1004], [105, 1003], [167, 1007], [290, 1013], [352, 1017], [378, 1019], [382, 1024], [381, 1030], [375, 1058], [369, 1066], [358, 1068], [100, 1039], [91, 1035], [88, 1028], [89, 1021], [95, 1013]].map(([x, y]) => px(x, y)));
  const xT = px(300, 0)[0];
  const dietro = ritaglia(Fo, 1, 0, xT), avanti = ritaglia(Fo, -1, 0, -xT);
  piastra(O, { contorno: dietro, z0: -11.2, z1: 11.2, smussi: [[.5, .5], [.4, 1.0]], k: 'acc', kSmusso: 'accLuc', molt: i => { const a = dietro[i], b = dietro[(i + 1) % dietro.length]; return Math.abs(a.x - xT) < .01 && Math.abs(b.x - xT) < .01 ? 0 : 1; } });
  piastra(O, { contorno: avanti, z0: -11.2, z1: 11.2, smussi: [[.5, .5], [.4, 1.0]], k: 'brunito', kSmusso: 'accLuc', molt: i => { const a = avanti[i], b = avanti[(i + 1) % avanti.length]; return Math.abs(a.x - xT) < .01 && Math.abs(b.x - xT) < .01 ? 0 : 1; } });
}
function elevatore(O) {
  // piatto dell'elevatore: coordinate del caricatore, faccia alta a u = 0 (la scena lo sposta lungo l'asse)
  const m = matCar();
  const S = sfalsa(antiorario([[-16, -8.2], [-15.2, -8.9], [11.2, -8.9], [13.8, -8.1], [15.5, -6.2], [16.2, -3.4], [16.4, 0], [16.2, 3.4], [15.5, 6.2], [13.8, 8.1], [11.2, 8.9], [-15.2, 8.9], [-16, 8.2]].map(([f, z]) => v2(f, z))), 1.0);
  const R = [S.map(p => v(p.x, -3, p.y)), S.map(p => v(p.x, 0, p.y))];
  O.loft(R, { mat: 'poli', duri: () => true, dentro: v(0, -1.5, 0), capoB: 'poli', m });
}

// ————————————————————————————— cartuccia 9 × 19 e bossolo —————————————————————————————
// asse x locale, da 0 (fondello) a 29,7 (punta); la scena la mette al suo posto
export const CART = { L: 29.7, bossolo: 19.15, r: 4.95 };
function bossoloProfilo(vuoto) {
  const p = [[.15, 0, 'acc'], [.15, 2.2, 'ottone'], [0, 2.35, 'ottone'], [0, 4.6, 'ottone'], [.3, 4.95, 'ottone'], [1.2, 4.95, 'ottone'], [1.4, 4.1, 'ottone'], [2.1, 4.1, 'ottone'], [2.7, 4.95, 'ottone'], [19.15, 4.78, 'ottone']];
  if (vuoto) p.push([19.15, 4.45, 'nero', false, .5], [4, 4.45, 'nero'], [4, 0]);
  else p.push([19.15, 4.52, 'rame'], [21.8, 4.52, 'rame', true], [23.8, 4.35, 'rame', true], [25.6, 3.95, 'rame', true], [27.1, 3.3, 'rame', true], [28.3, 2.45, 'rame', true], [29.2, 1.5, 'rame', true], [29.6, .6, 'rame'], [29.7, 0]);
  return p;
}
function cartuccia(O) { tornio(O, bossoloProfilo(false), { seg: 24, k: 'ottone' }); }
function bossolo(O) { tornio(O, bossoloProfilo(true), { seg: 24, k: 'ottone' }); }

// ————————————————————————————— costruzione —————————————————————————————
// restituisce { pezzi: { nome: Group } } con i gruppi già in coordinate dell'arma (cartucce e bossolo sul loro asse x locale)
export function costruisci(motore) {
  const R = motore.ruoli();
  const fai = (nome, fn) => { const O = new Officina(); fn(O); return O.mesh(R, nome); };
  const pezzi = {
    carrello: fai('carrello', carrello),
    canna: fai('canna', canna),
    asta: fai('asta', asta),
    molla: fai('molla', molla),
    fusto: fai('fusto', fusto),
    grilletto: fai('grilletto', grilletto),
    leva: fai('leva', O => leva(O, 1, true)),
    levaS: fai('levaS', O => leva(O, -1, false)),
    perno: fai('perno', perno),
    pernoS: fai('pernoS', pernoSinistro),
    caricatore: fai('caricatore', caricatore),
    elevatore: fai('elevatore', elevatore),
    cartucce: [0, 1, 2].map(i => fai('cartuccia' + i, cartuccia)),
    bossolo: fai('bossolo', bossolo),
  };
  return { pezzi };
}
export const PUNTI = { bocca: v(BOCCA + .3, 0, 0), finestra: v(12, 6, 11), camera: v(-1.5, 0, 0), asta: ASTA_Y, perno: PERNO };
