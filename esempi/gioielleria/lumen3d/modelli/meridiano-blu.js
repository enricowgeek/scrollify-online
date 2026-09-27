// Lumen 3D · modello "Meridiano Blu" (acciaio, quadrante blu soleil con data a ore 3, bracciale integrato a tre file, chiusura déployante).
// Fratello del Verde, costruito con lo stesso metodo (facce piane, spigoli vivi, satinato e lucido distinti) ma rimisurato sulle foto del Blu:
// lunetta a otto lati con gli angoli smussati (non a sedici lati uguali), piano satinato largo e smusso lucido ripido; anse più lunghe
// con la tacca in mezzo dove entra la prima maglia centrale; bracciale più largo alle anse; chiusura a tre blocchi con la lama sotto.
//
// ————————————————————————————— misure (src/orologi/meridiano-blu) —————————————————————————————
// FRONTE (riferimento per x, y): 13,02 px/mm (cassa 41,5 mm sui fianchi, 536 px), centro del quadrante (624; 554,5) px.
//   sagoma (fronte_in.png, media dei lati, mm): fianco 20,74 a y 0 → 19,9 a y 8,6; ansa 16,35 a y 14 → 11,95 a y 24,2 (fine delle
//   anse; alto 23,7, basso 24,7: prospettiva). Tacca centrale fra le anse larga 13 mm.
//   lunetta: otto lati + otto facce d'angolo (lati a 20,1 dal centro, angoli a 1,066 ×: facce d'angolo di ~1,5 mm come in foto);
//   piano satinato da 16,6 a 19,0, smusso lucido fino a 20,1; parete interna satinata 15,36 → 16,1, bisello lucido fino a 16,6.
//   quadrante visibile fino a 200 px (15,36 mm); indici da 135 a 186-189 px + bordo scuro (10,3 → 14,5-14,7 mm), larghi 13 px;
//   ore 12 doppio (2 × 0,82 mm a ± 0,54); a ore 3 la data (resta in foto). Lancette ferme sulle 10:10:36 della foto:
//   ore 145,0° (dalla cima del perno) lunga 9,4 mm larga 0,95; minuti 35,0° lunga 14,65 larga 0,8; secondi 231,6° lunga 15,1,
//   contrappeso di 3,7 mm. Quadrante: quadrante.py + quadrante-meridiano-blu-ritocco.py (monconi degli indici vicino alla minuteria).
//   corona: da 20,6 a 23,5 mm, diametro 5,9 (77 px), 16 costole.
// PROFILO (spessori e anello): 13,2-13,6 px/mm (corona, spessore, anello coerenti con la fronte a 13,2); vetro a x 301 px.
//   quote (mm): vetro 0, lunetta −0,35, smusso lucido fino a −2,3, base −4,75, spigolo lucido −5,5, fianco satinato fino a −9,8,
//   smusso basso −10,35, piastra −11,2, fondello −11,8. In foto il vetro sporge ~1,5 mm dalla lunetta: provato (1 mm), ma il vetro
//   del motore è solo riflesso e di profilo il suo bordo diventa una fascia nera; resta basso come nel Verde. Anse di profilo più corte (±20,3):
//   la foto non è coerente con la fronte, vince la fronte (anse a 24,2) e l'anello parte dalla loro fine.
//   Anello: contorno esterno della sagoma (raggi dal centro 690; 585 px, lisciato) spostato di 2,1 mm verso l'interno, a 13,2 px/mm,
//   ingrandito × 1,03 (la fronte vede l'anello un po' più grande); copia in 3d/lumen/meridiano-blu-anello.json;
//   maglie laterali lunghe 8 mm (8 per parte), spessore 4,4, testate quasi vive e fessure di 0,25 (di profilo rettangoli, non perline);
//   chiusura di 19,5 mm a filo delle maglie (due blocchi + coperchio) a y ≈ −3, lama interna sottile di 21,5 mm con le testate rastremate.
//   Viti col taglio sulle maglie laterali solo dove le mostra la foto: la prima dopo l'ansa e le due vicine alla chiusura.
// RETRO: piastra ottagonale 17,7 (lati a 0°, 45°…) con smusso lucido largo 1,6, fondello a raggiera r 13,9, otto viti col taglio
//   sugli angoli a r 15,9. Foto di tre quarti con la corona in alto, come quella del Verde.
import * as THREE from 'three';
import { Officina, v, daLati, rientra, ruota, campiona, in3, cerchio, cerchio2, percorso, scatola, corona, posa,
  indice, sagomaIndice, lancetta, sagomaLancetta, pernoLancette, poligonoRegolare, anello, angoli, tondo, D2R } from '../officina.js';
import { centra } from '../motore.js';

const PX = 13.02;   // px/mm della foto frontale
const Z = {
  vetro: 0, lunTop: -.35, lunSmusso: -2.3, lunBase: -4.75, quadrante: -2.9,
  casTop: -4.75, casSmusso: -5.5, corona: -7.65, casFondo: -9.8, casRetro: -10.35, piastra: -11.2, fondello: -11.62,
};
// lunetta: otto lati (normali a 0°, 45°…) con gli angoli smussati; a = distanza dei lati, k = distanza degli smussi / a
// (foto, raggi dal centro a passi di 2,5°: smusso lucido da 19,2 a 20,2 sui lati, faccia d'angolo di ~1,5 mm → k = 1,066)
function lunetta16(a, k = 1.066) {
  const ang = [], dist = [];
  for (let i = 0; i < 16; i++) { ang.push(i * Math.PI / 8); dist.push(i % 2 ? a * k : a); }
  return ruota(daLati(ang, dist));
}
// cassa: un quarto (x ≥ 0, y ≥ 0) dal fianco (y = 0) alla tacca → poligono intero antiorario (tacca in alto e in basso)
function cassaSagoma(Q) {
  const destra = [...Q.slice(1).map(([x, y]) => [x, -y]).reverse(), ...Q];
  const sinistra = destra.map(([x, y]) => [-x, -y]);
  return [...destra, ...sinistra].map(([x, y]) => new THREE.Vector2(x, y));
}
const TACCA = [6.65, 20.2];   // semilarghezza e fondo della tacca fra le anse
// sagoma frontale (fronte_in.png, 13,02 px/mm, media dei lati): fianco 20,74 a y 0 → 19,9 a y 8,6 (foto: arco leggero, qui due facce
// piane col colmo dietro la corona), ansa su due facce: 19,9 → 16,35 a y 14 (pendenza 0,66) → 11,95 a y 24,2 (0,45).
// Prima erano cinque segmenti per quarto e tre anelli non paralleli (quad storti): di tre quarti il fianco veniva a scacchiera
const CASSA = cassaSagoma([[20.74, 0], [19.9, 8.6], [16.35, 14.0], [11.95, 24.2], [TACCA[0], 24.2], TACCA]);
const Y_ANSA = 24.2;
// linea mediana dell'anello (y, z): tacca → fine delle anse diritta, raccordo, contorno del profilo (× 1,03 attorno al suo centro:
// la fronte vede l'anello un po' più grande), raccordo, ansa, tacca. Il primo tratto lascia l'ansa inclinato come in foto
const LINEA = [[20.35, -8.3], [21.63, -8.3], [22.92, -8.3], [24.2, -8.3], [26.6, -10.18], [28.45, -12.7], [29.84, -15.64], [30.85, -18.77],
  [31.57, -21.89], [31.84, -24.17], [31.84, -26.62], [31.58, -28.93], [30.98, -31.26], [30.16, -33.59], [29.12, -35.72], [27.81, -37.84],
  [26.38, -39.86], [24.82, -41.55], [22.96, -43.04], [20.88, -44.47], [18.72, -45.71], [16.48, -46.84], [14.18, -47.79], [11.79, -48.61],
  [9.24, -49.39], [6.87, -50.06], [4.29, -50.58], [1.9, -51.07], [-0.55, -51.23], [-3.05, -51.22], [-5.54, -51.06], [-7.83, -50.61],
  [-10.51, -50.04], [-12.93, -49.43], [-15.23, -48.65], [-17.75, -47.66], [-20.05, -46.74], [-22.19, -45.61], [-24.43, -44.25],
  [-26.49, -42.9], [-28.37, -41.35], [-30.28, -39.6], [-31.83, -37.91], [-33.09, -35.95], [-34.19, -33.72], [-35.04, -31.53],
  [-35.54, -29.26], [-35.74, -26.83], [-35.78, -24.36], [-35.46, -22.33], [-34.52, -20.23], [-33.07, -17.38], [-31.3, -14.68],
  [-29.21, -12.21], [-26.84, -10.05], [-24.2, -8.3], [-22.92, -8.3], [-21.63, -8.3], [-20.35, -8.3]];

// fascia a facce piatte (anelli corrispondenti), satinatura lungo il giro; col = occlusione, le pareti della tacca (|x| piccolo) in ombra
// Le facce rivolte in basso (normale y < −0,3: anse e fianco sotto la corona) vanno nel ruolo k + 'B': stessa finitura con più riflesso,
// il pavimento dello studio è quasi nero e di profilo la metà bassa della cassa veniva nera (in foto è chiara come quella alta)
function fasciaCol(O, k, A, B, col = 1) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, tacca = Math.abs(A[i].x) < 7.3 && Math.abs(A[j].x) < 7.3;
    const e = new THREE.Vector3().subVectors(A[j], A[i]), giu = e.x / Math.hypot(e.x, e.y) > .3;   // normale (e.y, −e.x): y < −0,3
    O.quad(giu && !tacca ? k + 'B' : k, A[i], A[j], B[j], B[i], e, tacca ? .35 : col);
  }
}
// fascia a facce piatte fra anelli corrispondenti (come officina.fascia): le facce con la normale in basso (y < −0,3) vanno in k + 'B'
function fasciaGiu(O, k, A, B, col = 1) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, nn = new THREE.Vector3().subVectors(B[j], A[i]).cross(new THREE.Vector3().subVectors(B[i], A[j])).normalize();
    O.quad(nn.y < -.3 ? k + 'B' : k, A[i], A[j], B[j], B[i], new THREE.Vector3().subVectors(A[j], A[i]), col);
  }
}
// spigoli della tacca vivi: i vertici della tacca (|x| = TACCA[0]) restano quelli del poligono di partenza, così la maglia
// d'attacco entra in una sede a pareti dritte (con lo smusso la tacca si vedeva di fronte come una fascia scura sotto la lunetta)
function taccaViva(P, base) {
  return P.map((p, i) => {
    const q = base[i]; if (Math.abs(q.x) > TACCA[0] + .01) return p;
    return new THREE.Vector2(q.x, Math.abs(q.y - Math.sign(q.y) * TACCA[1]) < .01 ? q.y : p.y);
  });
}

// vite a testa piatta col taglio nella sua sede (foto: fianchi delle maglie, chiusura, fondello): corona scura a filo della
// superficie, testa satinata appena bombata (lucida veniva un puntino nero), taglio nero passante. m = Matrix4 come per officina.vite
function viteSede(O, m, { r = .55, h = .07, taglio = .14, sede = .1, giro = 0, k = 'sat' } = {}) {
  const a = angoli(15 * D2R);
  O.loft([anello(tondo(r - .02), .012, a), anello(tondo(r + sede), .012, a)], { mat: 'nero', m });
  O.loft([anello(tondo(.02), h, a), anello(tondo(r * .8), h * .8, a), anello(tondo(r), .03, a), anello(tondo(r), -.2, a)],
    { liscioV: true, duriV: i => i === 2, mat: k, m });
  const L = r * .84, c = Math.cos(giro), s = Math.sin(giro);
  const f = z => [[L, -taglio / 2], [L, taglio / 2], [-L, taglio / 2], [-L, -taglio / 2]].map(([x, y]) => v(x * c - y * s, x * s + y * c, z));
  O.loft([f(h + .015), f(-.05)], { mat: 'nero', capoA: 'nero', m });
}

function cassa(O) {
  // — lunetta: parete interna e bisello (curvi), piano satinato piatto, smusso lucido ripido, fianco satinato —
  const nI = 160;
  // parete interna satinata: lucida rifletteva il fondo scuro dello studio e di fronte era un anello nero (in foto è un filo d'argento)
  O.fasciaLiscia('sat', cerchio(15.36, nI, Z.quadrante + .02), cerchio(16.1, nI, Z.lunTop - .55), { inverti: true, col: .8 });
  O.fasciaLiscia('luc', cerchio(16.1, nI, Z.lunTop - .55), cerchio(16.62, nI, Z.lunTop), { inverti: true });
  // smusso largo 1,1 (in foto 0,9-1): con la sua pendenza (1,1 su 1,95) il lato a ore 10-11 prende la linea netta dello studio
  const L2 = lunetta16(20.1), L1 = rientra(L2, 1.1);
  const kL = Array.from({ length: 16 }, (_, i) => i % 2 ? 3 : 10);
  const est = in3(campiona(L1, kL), Z.lunTop);
  const int = est.map(p => { const a = Math.atan2(p.y, p.x); return v(Math.cos(a) * 16.62, Math.sin(a) * 16.62, Z.lunTop); });
  O.fascia('sat', est, int);                                                    // piano satinato (righe lungo i lati)
  fasciaGiu(O, 'luc', in3(L2, Z.lunSmusso), in3(L1, Z.lunTop));                  // smusso lucido
  fasciaGiu(O, 'sat', in3(L2, Z.lunBase), in3(L2, Z.lunSmusso), .85);            // fianco della lunetta
  O.tappo('sat', L2, [cerchio2(16.4, 96).reverse()], Z.lunBase, false, v(1, 0, 0), .4);   // sotto (dove sporge sullo spigolo)
  // — cassa: piano alto (sotto la lunetta e sulle anse), spigolo lucido, fianco satinato dritto, smusso basso —
  // (anse piatte come nel Verde: provate inclinate come nella foto di profilo, di fronte le due in basso venivano scure)
  // una sola sagoma: gli smussi sono sfalsamenti veri (rientra), il fianco è dritto → ogni faccia è un piano
  const C1 = taccaViva(rientra(CASSA, .45), CASSA), Cb = taccaViva(rientra(CASSA, .35), CASSA);
  O.tappo('sat', C1, [cerchio2(16.4, 96).reverse()], Z.casTop, true, v(0, 1, 0));   // piano alto (anche sotto la lunetta)
  fasciaCol(O, 'luc', in3(CASSA, Z.casSmusso), in3(C1, Z.casTop));              // spigolo lucido
  fasciaCol(O, 'sat', in3(CASSA, Z.casFondo), in3(CASSA, Z.casSmusso), .95);     // fianco satinato
  fasciaCol(O, 'luc', in3(Cb, Z.casRetro), in3(CASSA, Z.casFondo), .8);          // smusso basso
  // — retro: piastra ottagonale con smusso lucido largo, fondello a raggiera, viti col taglio sugli angoli —
  // smusso della piastra largo 1,6 (foto del retro: ~0,1 della distanza dei lati, la fascia chiara attorno al fondello)
  const P0 = poligonoRegolare(8, 17.7), P1 = rientra(P0, 1.6);
  O.tappo('sat', Cb, [P0.slice().reverse()], Z.casRetro, false, v(1, 0, 0), .8);
  O.fascia('luc', in3(P1, Z.piastra), in3(P0, Z.casRetro));
  O.tappo('sat', P1, [cerchio2(13.9, 128).reverse()], Z.piastra, false, v(0, 1, 0));
  const nF = 256, anelliF = [13.9, 13.5, 13.1, 9, 4.5, .6];
  const zF = [Z.piastra, Z.fondello, Z.fondello - .05, Z.fondello - .12, Z.fondello - .17, Z.fondello - .19];
  for (let r = 0; r < anelliF.length - 1; r++)
    O.fasciaLiscia(r === 0 ? 'luc' : 'rag', cerchio(anelliF[r], nF, zF[r]), cerchio(anelliF[r + 1], nF, zF[r + 1]), { giro: r === 0, inverti: true });
  const centroF = v(0, 0, zF.at(-1) - .005), ultimo = cerchio(.6, nF, zF.at(-1));
  for (let i = 0; i < nF; i++) O.tri('rag', ultimo[(i + 1) % nF], ultimo[i], centroF, ultimo[i].clone().setZ(0).normalize());
  for (let i = 0; i < 8; i++) { const a = (i + .5) * Math.PI / 4; viteSede(O, posa(v(Math.cos(a) * 15.9, Math.sin(a) * 15.9, Z.piastra), v(0, 0, -1), a + .6), { r: 1.0, h: .12, taglio: .24, sede: .12 }); }
}

// ————————————————————————————— bracciale —————————————————————————————
// tre file: la centrale parte dalla tacca (maglia d'attacco corta sotto la lunetta), le laterali dalla fine delle anse;
// la centrale ha le giunture sfalsate di 1,3 mm che si chiudono verso la chiusura. Maglie come scatole smussate (officina.scatola).
const T_SU = 2.1, T_GIU = 2.3, FESS = .25, GAP = .2;
function maglia(O, Pc, s, L, W, fila, viti = 0) {
  const { C, T, N } = Pc.rif(s), X = v(1, 0, 0), wc = W * .535;
  const Ta = Pc.rif(s - L / 2).T, Tb = Pc.rif(s + L / 2).T, fi = Ta.angleTo(Tb);
  const d = Math.max(.12, T_GIU * Math.tan(fi / 2) * 1.15 + .05);
  const P = (x, y, z) => C.clone().addScaledVector(X, x).addScaledVector(T, y).addScaledVector(N, z);
  if (fila === 'centro') {
    scatola(O, P, -wc / 2, wc / 2, -L / 2, L / 2, -T_GIU, T_SU, { x0: .3, x1: .3, y0: .55, y1: .55, h: .42, hb: .55 }, Math.max(d, .5), { dentro: [.45, .45] });
    return;
  }
  const a = wc / 2 + GAP, top = T_SU - .15, bot = -T_GIU + .15;
  // testate quasi vive: smusso di 0,25 in alto e rientro del fondo solo quanto serve alla curva (foto di profilo: rettangoli, fessure sottili)
  scatola(O, P, a, W / 2, -L / 2, L / 2, bot, top, { x0: .15, x1: .8, y0: .25, y1: .25, h: .75, hb: .6 }, Math.max(d, .3), { dentro: [.45, 1] });
  scatola(O, P, -W / 2, -a, -L / 2, L / 2, bot, top, { x0: .8, x1: .15, y0: .25, y1: .25, h: .75, hb: .6 }, Math.max(d, .3), { dentro: [1, .45] });
  // vite col taglio sul fianco esterno, vicino a un capo (viti = +1 capo avanti, −1 capo indietro)
  if (viti) for (const sg of [1, -1]) viteSede(O, posa(P(sg * W / 2, viti * (L / 2 - 1.3), -.1), X.clone().multiplyScalar(sg), .9), { r: .55 });
}
function bracciale(O) {
  const Pc = percorso(LINEA), lung = Pc.lung;
  let sH = 0; while (Pc.rif(sH).C.y < Y_ANSA) sH += .02;                    // fine delle anse lungo la linea
  const sc = Pc.trova(-3.0, -40), LCH = 19.5, sA = sc - LCH / 2, sB = sc + LCH / 2;
  // larghezza: 23,9 alla fine delle anse (quanto l'ansa: con 24,3 la sagoma frontale faceva un gradino), poi si stringe presto
  // (in cima all'anello, di fronte, è già ~21) fino a 20,6 alla chiusura. La maglia d'attacco nella tacca resta larga 13 (24,3 × 0,535)
  const larg = s => { const d = Math.min(s - sH, lung - sH - s); return d <= 0 ? 23.9 : 20.6 + 3.3 * Math.exp(-d / 8.5); };
  const c0 = sH - 1.3;   // prima giuntura della fila centrale
  for (const [dir, s0, s1, t0] of [[1, sH, sA, c0], [-1, lung - sH, sB, lung - c0]]) {
    // laterali: n maglie uguali fra l'ansa e la chiusura
    const n = Math.round(Math.abs(s1 - s0) / 8.0), p = (s1 - s0) / n;
    for (let i = 0; i < n; i++) {
      // viti: sulla prima maglia verso la chiusura, sulle ultime due verso l'ansa (come in foto)
      const c = s0 + p * (i + .5), viti = (i === 0 ? 1 : i >= n - 2 ? -1 : 0) * Math.sign(p);
      maglia(O, Pc, c, Math.abs(p) - FESS, larg(c), 'lati', viti);
    }
    // centrale: maglia d'attacco nella tacca, poi n maglie fino alla chiusura
    const e0 = dir > 0 ? .15 : lung - .15, e1 = t0;
    maglia(O, Pc, (e0 + e1) / 2, Math.abs(e1 - e0) - FESS / 2, 24.3, 'centro');
    const q = (s1 - t0) / n;
    for (let i = 0; i < n; i++) { const c = t0 + q * (i + .5); maglia(O, Pc, c, Math.abs(q) - FESS, larg(c), 'centro'); }
  }
  chiusura(O, Pc, { sc, L: LCH, W: larg(sc) });
}

// chiusura déployante del Blu (foto del retro): due blocchi di testa, il coperchio in mezzo un filo più alto con la linguetta
// sul lato della corona, le lame pieghevoli sotto (di profilo si vedono dentro l'anello), viti col taglio sui blocchi di testa
function guscio(O, Pc, s0, s1, sez, testa, ce, mats, K, col = 1) {
  const R = [];
  for (let i = 0; i <= K + 2; i++) {
    const s = i === 0 ? s0 : i === K + 2 ? s1 : s0 + ce + (s1 - s0 - 2 * ce) * (i - 1) / K;
    R.push(((i === 0 || i === K + 2) ? testa : sez).map(([x, y]) => Pc.P(s, x, y)));
  }
  O.loft(R, { duri: () => true, liscioV: true, duriV: i => i === 1 || i === K + 1, capoA: ['sat', .35], capoB: ['sat', .35], col, mat: (i, j) => mats(i, j, K) });
}
function chiusura(O, Pc, { sc, L, W }) {
  const hw = W / 2, sa = sc - L / 2, sb = sc + L / 2, X = v(1, 0, 0);
  // blocchi di testa: scatole smussate larghe quanto il bracciale
  const B = 4.9;
  for (const [s0, s1] of [[sa + .1, sa + B], [sb - B, sb - .1]]) {
    const s = (s0 + s1) / 2, { C, T, N } = Pc.rif(s);
    const P = (x, y, z) => C.clone().addScaledVector(X, x).addScaledVector(T, y).addScaledVector(N, z);
    scatola(O, P, -hw, hw, -(s1 - s0) / 2, (s1 - s0) / 2, -T_GIU, T_SU, { x0: .7, x1: .7, y0: .45, y1: .45, h: .6, hb: .5 }, .3);
    for (const sg of [1, -1]) viteSede(O, new THREE.Matrix4().makeBasis(X, T, N).setPosition(P(sg * (hw - 1.15), (s0 < sc ? -1 : 1) * ((s1 - s0) / 2 - 1.0), T_SU)), { r: .48 });
  }
  // coperchio: guscio curvo lungo la linea, piano satinato lungo l'anello, smussi lucidi (sezione oraria vista da T: x locale = −x)
  const h = hw - .15, top = T_SU + .1, bot = -T_GIU + .05;   // a filo dei blocchi (foto di profilo); fino alla lama: di lato nessuna fessura
  const cop = (d, tp) => [[-h + d, bot], [-h + d, tp - .5], [-h + .5 + d, tp], [h - .5 - d, tp], [h - d, tp - .5], [h - d, bot]];
  // piano satinato di traverso come le maglie (lungo il bracciale, sul guscio curvo, sfumava nel nero)
  const mCop = [['sat', .9, 'v'], 'luc', ['sat', 1], 'luc', ['sat', .9, 'v'], ['sat', .5]];
  guscio(O, Pc, sa + B + .25, sb - B - .25, cop(0, top), cop(.3, top - .35), .4, (i, j, K) => (i === 0 || i === K + 1) && j >= 1 && j <= 3 ? 'luc' : mCop[j], 24);
  // linguetta sul lato della corona (x world > 0), a metà del coperchio: un labbro basso sul piano che sporge appena dal bordo (foto del retro)
  {
    const { C, T, N } = Pc.rif(sc), P = (x, y, z) => C.clone().addScaledVector(X, x).addScaledVector(T, y).addScaledVector(N, z);
    scatola(O, P, hw - 2.6, hw + .45, -2.4, 2.4, top - .3, top + .32, { x0: .2, x1: .25, y0: .3, y1: .3, h: .18 }, .05);
  }
  // lame pieghevoli sotto il bracciale (dentro l'anello): di profilo sono la piastra sottile e curva della foto, più lunga della
  // chiusura di 1 mm per parte, con le testate rastremate (niente gradino a gancio)
  const lw = hw - 2.0, lb = -T_GIU - 2.25, lt = -T_GIU - .05;
  const lama = [[-lw + .35, lb], [-lw, lb + .35], [-lw, lt], [lw, lt], [lw, lb + .35], [lw - .35, lb]];
  const mLama = ['luc', ['sat', .85, 'v'], ['sat', .4], ['sat', .85, 'v'], 'luc', ['sat', .75]];
  const punta = lama.map(([x, y]) => [x * .97, Math.max(y, lt - .45)]);
  guscio(O, Pc, sa - 1.0, sb + 1.0, lama, punta, 1.6, (i, j, K) => (i === 0 || i === K + 1) ? (j === 5 ? 'luc' : mLama[j]) : mLama[j], 24);
}

// ————————————————————————————— quadrante —————————————————————————————
// foto ripulita (3d/lumen/meridiano-blu-quadrante.webp: src/lumen3d/quadrante.py meridiano-blu, poi quadrante-meridiano-blu-ritocco.py)
// + indici, lancette e perno in 3D.
// Indici agli angoli e ai raggi della foto (la prospettiva li sposta di 1-1,5°: così coprono esattamente i monconi rimasti in foto).
const QUADRANTE = {
  texture: '3d/lumen/meridiano-blu-quadrante.webp', raggio: 206 / PX,
  // [angolo °, inizio px, fine px]: angolo del moncone esterno, inizio del bianco, fine del bordo scuro (1 px prima del quadratino
  // della minuteria): l'indice 3D copre esattamente la parte rimasta in foto, fra 184 px e il quadratino
  indici: [[60.0, 135, 191], [30.3, 135, 191], [330.5, 135, 190.5], [300.9, 133, 189.5], [269.4, 132, 189], [238.8, 132, 189.5],
    [208.95, 135, 190], [178.85, 139, 191], [149.0, 137, 191], [119.35, 135, 191]],
  dodici: [90.15, 135, 190], largh: 1.02, alto: .45,
  // [angolo °, quota sopra il quadrante, spessore, profilo [t, larghezza], lume]. In foto le lancette partono dalla cima del perno,
  // 3,4 px sopra il centro (parallasse): gli angoli 3D (145,0 → 143,13; 35,0 → 36,45; 231,6 → 230,48) fanno passare ogni lancetta
  // in mezzo alla traccia ripulita, con al più 1,3-1,9 px di scarto dalla lancetta della foto dal perno alla punta
  lancette: [
    [143.13, .45, .26, [[-1.25, .62], [-.85, .95], [8.25, .95], [9.4, .04]], true],
    [36.45, .8, .24, [[-1.5, .55], [-1.1, .8], [13.35, .8], [14.15, .24], [14.65, .03]], true],
    [230.48, 1.15, .12, [[-3.75, .45], [-3.55, .74], [-1.5, .44], [-1.2, .22], [15.1, .14]], true],
  ],
};
async function quadrante(O, motore) {
  const z = Z.quadrante, ombre = [], Q = QUADRANTE;
  const pezzi = Q.indici.map(([g, r0, r1]) => [g * D2R, Q.largh, 0, (r0 - 1) / PX, r1 / PX, Q.alto]);
  for (const sg of [-1, 1]) pezzi.push([Q.dodici[0] * D2R, .82, sg * .54, (Q.dodici[1] - 1) / PX, Q.dodici[2] / PX, Q.alto]);
  for (const p of pezzi) { indice(O, p, z); ombre.push({ punti: sagomaIndice(p), alto: p[5], forza: .5 }); }
  for (const [ang, dz, h, prof, lume] of Q.lancette) {
    const L = { ang, z: z + dz, h, prof, lume };
    lancetta(O, L); ombre.push({ punti: sagomaLancetta(L), alto: dz, forza: .42 });
  }
  pernoLancette(O, [[1.3, z, z + .55, 'luc'], [.95, z + .55, z + .9], [.62, z + .88, z + 1.3], [.24, z + 1.26, z + 1.45, 'nero']]);
  return motore.quadrante({ texture: Q.texture, raggio: Q.raggio, z, ombre });
}

export default {
  id: 'meridiano-blu',
  nome: 'Meridiano Blu',
  // viste delle foto per la sovrapposizione (lumen-orto / sovrapponi): [angolo, elevazione, rotazione della cattura in gradi]
  // il retro, come nel Verde, è di tre quarti con la corona in alto
  viste: { fronte: [0, 0], profilo: [Math.PI / 2, 0], retro: [Math.PI - .7, -.1, 90] },
  async costruisci(ctx) {
    const { motore } = ctx;
    const O = new Officina();
    cassa(O); bracciale(O);
    corona(O, { r: 2.95, costole: 16, x0: 21.05, x1: 23.5, y: 0, z: Z.corona, tubo: 2.0 });
    const disco = await quadrante(O, motore);
    const gruppo = new THREE.Group(); gruppo.name = 'meridiano-blu';
    gruppo.add(O.mesh(motore.ruoli('acciaio', { satB: motore.materiale('acciaio.sat', { env: 2.2 }), lucB: motore.materiale('acciaio.luc', { env: 2.2 }) })));
    gruppo.add(disco);
    gruppo.add(motore.vetro({ raggio: 16.5, spessore: .35, z: Z.vetro }));
    return { gruppo, ingombro: centra(gruppo), inquadratura: { altezza: 94, larghezza: 70 } };
  },
};
