// Lumen 3D · modello "Meridiano Verde" (acciaio, quadrante verde soleil, bracciale a tre file, chiusura déployante).
// Base: il modulo p2 approvato da Enrico (cassa ottagonale con le anse integrate, lunetta a 16 lati, bracciale a tre file,
// misure prese dalle foto, mm), traslocato nella libreria pixel per pixel. Innesti dalla versione "finale", scelti dai giudici:
// quadrante con indici e lancette in 3D (foto ripulita sotto), corona zigrinata, chiusura déployante a placca, viti col taglio.
// Il fianco a "X" e il resto della cassa della finale NON sono innestati (forme molli): la cassa resta quella di p2.
import * as THREE from 'three';
import { Officina, v, daLati, rientra, ruota, campiona, in3, sulRaggio, cerchio, cerchio2, percorso, braccialeTreFile, chiusuraDeployante,
  corona, vite, posa, indici, indice, sagomaIndice, lancetta, sagomaLancetta, pernoLancette } from '../officina.js';
import { centra } from '../motore.js';

// ————————————————————————————— misure (mm) —————————————————————————————
const Z = {
  vetro: 0, lunTop: -.3, lunEst: -.52, lunBase: -4.6, casTop: -4.6, casBordo: -5.2, casSmusso: -5.65, casFondo: -9.6, casRetro: -10.1,
  piastra: -10.85, fondello: -11.3, quadrante: -2.55, corona: -7.35,
};
// lunetta: ottagono con gli angoli smussati (16 lati), lati principali a 0/45/90…
function lunetta16(a, extra = .3) {
  const ang = [], dist = [];
  for (let i = 0; i < 16; i++) { ang.push(i * Math.PI / 8); dist.push(i % 2 ? a + extra : a); }
  return ruota(daLati(ang, dist));
}
// cassa: ottagono con le anse integrate (dal contorno della foto frontale)
const cassaSagoma = (x3, y3, x2, y2, y1) => [[x3, -y3], [x3, y3], [x2, y2], [10.3, y1], [-10.3, y1], [-x2, y2], [-x3, y3], [-x3, -y3], [-x2, -y2], [-10.3, -y1], [10.3, -y1], [x2, -y2]]
  .map(([x, y]) => new THREE.Vector2(x, y));
const CASSA_SU = cassaSagoma(20.05, 1.9, 15.0, 15.0, 21.7), CASSA = cassaSagoma(20.55, 4.4, 15.15, 15.15, 21.7), CASSA_GIU = cassaSagoma(19.95, 1.9, 14.9, 14.9, 21.6);
// linea mediana dell'anello (y, z), dalla foto di profilo
const LINEA = [
  [22.0, -7.25], [24.9, -8.3], [27.4, -10.5], [29.4, -13.7], [30.8, -17.8], [31.4, -22.6], [31.0, -28.7], [29.1, -34.4], [25.8, -39.3],
  [21.7, -43.1], [17.4, -45.9], [13.0, -48.0], [8.6, -49.4], [4.6, -50.3], [.7, -50.7], [-3.2, -50.8], [-7.1, -50.7], [-11.1, -50.3],
  [-15.1, -49.4], [-19.3, -47.9], [-23.5, -45.7], [-27.6, -42.8], [-31.3, -38.9], [-34.6, -34.2], [-36.7, -28.7], [-36.9, -22.9],
  [-35.6, -17.6], [-32.9, -13.2], [-29.4, -10.0], [-25.6, -8.1], [-22.0, -7.25]];

function cassa(O) {
  // — lunetta —
  const nI = 160;
  const pareteBasso = cerchio(15.1, nI, Z.quadrante + .02), pareteAlto = cerchio(15.75, nI, -.85);
  const bisello = cerchio(16.35, nI, Z.lunTop);
  O.fasciaLiscia('luc', pareteBasso, pareteAlto, { inverti: true, col: .5 });   // parete interna (in ombra)
  O.fasciaLiscia('luc', pareteAlto, bisello, { inverti: true });                // smusso lucido interno
  const L1 = lunetta16(18.7, 0), L2 = lunetta16(19.7, 0);
  const kL = Array.from({ length: 16 }, (_, i) => i % 2 ? 4 : 8);
  const est = in3(campiona(L1, kL), Z.lunEst);
  const intAng = est.map(p => Math.atan2(p.y, p.x));
  const intR = intAng.map(a => v(Math.cos(a) * 16.35, Math.sin(a) * 16.35, Z.lunTop));
  O.fasciaLiscia('sat', est, intR, { inverti: false });
  O.fascia('luc', in3(L2, Z.lunBase), in3(L1, Z.lunEst));                      // fianco lucido sfaccettato
  // — cassa centrale —
  const C0 = CASSA, C1 = rientra(CASSA_SU, .3), Cb = rientra(CASSA_GIU, .3);
  const angoli = [...new Set([...L2, ...C1].map(p => +Math.atan2(p.y, p.x).toFixed(5)).concat(Array.from({ length: 240 }, (_, i) => +(-Math.PI + i / 240 * Math.PI * 2).toFixed(5))))].sort((a, b) => a - b);
  const anB = angoli.map(a => { let q = sulRaggio(L2, a); const r = sulRaggio(C1, a); if (q.length() > r.length() - .04) q = r.clone().multiplyScalar(1 - .04 / r.length()); return v(q.x, q.y, Z.casTop); });
  const anC = angoli.map(a => { const q = sulRaggio(C1, a); return v(q.x, q.y, Z.casBordo); });
  O.fascia('sat', anC, anB, { col: .95 });
  O.fascia('luc', in3(CASSA_SU, Z.casSmusso), in3(C1, Z.casBordo));
  O.fascia('sat', in3(C0, Z.corona), in3(CASSA_SU, Z.casSmusso), { giro: true });
  O.fascia('sat', in3(CASSA_GIU, Z.casFondo), in3(C0, Z.corona), { giro: true, col: .85 });
  O.fascia('luc', in3(Cb, Z.casRetro), in3(CASSA_GIU, Z.casFondo));
  // — retro: piastra ottagonale, fondello a raggiera, viti —
  const P0 = daLati(Array.from({ length: 8 }, (_, i) => i * Math.PI / 4), Array(8).fill(17.8)).map((_, i, Q) => Q[(i + 7) % 8]);
  const P1 = rientra(P0, .55);
  O.tappo('sat', Cb, [P0.slice().reverse()], Z.casRetro, false, v(1, 0, 0), .8);
  O.fascia('luc', in3(P1, Z.piastra), in3(P0, Z.casRetro));
  const F0 = cerchio2(14.3, 128);
  O.tappo('sat', P1, [F0.slice().reverse()], Z.piastra, false, v(1, 0, 0));
  const nF = 256, anelliF = [14.3, 13.9, 13.5, 9, 4.5, .6];
  const zF = [Z.piastra, Z.fondello, Z.fondello - .05, Z.fondello - .12, Z.fondello - .17, Z.fondello - .19];
  for (let r = 0; r < anelliF.length - 1; r++) {
    const A = cerchio(anelliF[r], nF, zF[r]), B = cerchio(anelliF[r + 1], nF, zF[r + 1]);
    O.fasciaLiscia(r === 0 ? 'luc' : 'rag', A, B, { giro: r === 0, inverti: true });
  }
  const centroF = v(0, 0, zF.at(-1) - .005), ultimo = cerchio(.6, nF, zF.at(-1));
  for (let i = 0; i < nF; i++) O.tri('rag', ultimo[(i + 1) % nF], ultimo[i], centroF, ultimo[i].clone().setZ(0).normalize());
  // viti sugli spigoli dell'ottagono: testa bombata col taglio (dalla finale)
  for (let i = 0; i < 8; i++) { const a = (i + .5) * Math.PI / 4; vite(O, posa(v(Math.cos(a) * 15.95, Math.sin(a) * 15.95, Z.piastra), v(0, 0, -1), a + .5), { r: .9, h: .34 }); }
}
// bracciale: maglie di p2 lungo la linea; chiusura déployante a placca della finale (21 mm, come nella foto del retro)
function bracciale(O) {
  const Pc = percorso(LINEA), lung = Pc.lung;
  const sMid = Pc.trova(-3.2, -40);
  const LCH = 21, sA = sMid - LCH / 2, sB = sMid + LCH / 2;
  // larghezza: 20,4 alle anse, 17,4 alla chiusura
  const larg = s => { const k = Math.min(1, s < sMid ? s / sA : (lung - s) / (lung - sB)); return 20.4 - 3.0 * k * k * (3 - 2 * k); };
  const T2 = 2.0;
  braccialeTreFile(O, Pc, { sA, sB, larg, T2, passo: 7.0 });
  chiusuraDeployante(O, Pc, { sc: sMid, L: LCH, W: larg(sMid) / 2, sopra: T2 + .12, sotto: -T2 - .75, pulsante: [7.5, 1.8, .7] });
}

// quadrante: foto ripulita (senza indici né lancette, 3d/lumen/meridiano-verde-quadrante.webp da src/lumen3d/quadrante.py) + pezzi in 3D.
// Misure della finale (foto a 15,4 px/mm) riportate alla scala di p2 (15,48 px/mm). Lancette ferme sulle 10:08:36 della foto:
// nella foto ripulita restano le tracce di quelle vere, coperte solo così.
const KQ = 15.4 / 15.48;
const QUADRANTE = {
  texture: '3d/lumen/meridiano-verde-quadrante.webp', raggio: 242 / 15.48,
  indici: { r0: 9.87 * KQ, r1: 13.9 * KQ, largh: 1.22 * KQ, alto: .45, salta: [3], doppio: [.98 * KQ, .62 * KQ], extra: [[-1.2, 1.3 * KQ, 13.05 * KQ, 14.3 * KQ]] },
  // [angolo °, quota sopra il quadrante, spessore, profilo [t, larghezza]]
  lancette: [
    [145.2, .45, .26, [[-1.7, .9], [-1.2, 1.3], [7.8, 1.3], [9.25, .04]], true],
    [39.3, .8, .24, [[-2.1, .8], [-1.6, 1.08], [11.9, 1.08], [13.3, .04]], true],
    [234.6, 1.15, .12, [[-3.9, .5], [-2.3, .5], [-2.0, .18], [13.8, .1]], false],
  ],
};
async function quadrante(O, motore) {
  const z = Z.quadrante, ombre = [];
  for (const p of indici(QUADRANTE.indici)) { indice(O, p, z); ombre.push({ punti: sagomaIndice(p), alto: p[5], forza: .5 }); }
  for (const [ang, dz, h, prof, lume] of QUADRANTE.lancette) {
    const L = { ang, z: z + dz, h, prof: prof.map(([t, w]) => [t * KQ, w * KQ]), lume };
    lancetta(O, L); ombre.push({ punti: sagomaLancetta(L), alto: dz, forza: .42 });
  }
  pernoLancette(O, [[1.05, z, z + .62, 'luc'], [.74, z + .6, z + .98], [.5, z + .9, z + 1.32], [.2, z + 1.2, z + 1.4, 'nero']]);
  return motore.quadrante({ texture: QUADRANTE.texture, raggio: QUADRANTE.raggio, z, ombre });
}

export default {
  id: 'meridiano-verde',
  nome: 'Meridiano Verde',
  // viste delle foto per la sovrapposizione (lumen-orto / sovrapponi): [angolo, elevazione, rotazione della cattura in gradi]
  // la foto del retro è di tre quarti con la corona in alto (angolo trovato dal confronto: a = π − 0,7, e = −0,1, ruotata di 90°)
  viste: { fronte: [0, 0], profilo: [Math.PI / 2, 0], retro: [Math.PI - .7, -.1, 90] },
  // punti notevoli (solo metadati, per la sezione "dettaglio" e vetrina.proietta/guarda): p = punto sulla superficie in mm, coordinate di
  // costruisci (prima di centra); n = normale della faccia (il punto si vede quando guarda verso chi guarda); a, e = la posa che mostra
  // meglio quella parte (angolo attorno a y, elevazione). Misure dalle quote qui sopra: quadrante −2,55, lunetta −0,3…−0,52 (piano fra
  // r 16,35 e 18,7), corona fino a x 23,15 a z −7,35, fianco a x −20,55, fondello −11,3 (raggiera fino a r 14,3), bracciale: linea + T2,
  // chiusura: faccia esterna a −53,8 (sotto la linea di 2,95 mm)
  punti: {
    quadrante: { p: [4.6, -7.2, -2.45], n: [0, 0, 1], a: 0, e: .12 },
    lunetta: { p: [12.37, 12.37, -.42], n: [.3, .2, .93], a: .72, e: .2 },
    corona: { p: [23.25, 0, -7.35], n: [1, 0, 0], a: 1.15, e: .08 },
    fondello: { p: [-11, -3, -11.45], n: [0, 0, -1], a: 2.35, e: -.06 },
    chiusura: { p: [0, -3.2, -53.8], n: [0, 0, -1], a: Math.PI, e: -.28 },
    bracciale: { p: [0, 14.37, -49.62], n: [0, .645, -.766], a: 4.0, e: .25 },
    cassa: { p: [-20.6, 0, -7.4], n: [-1, 0, 0], a: 5.45, e: .08 },
  },
  async costruisci(ctx) {
    const { motore } = ctx;
    const O = new Officina();
    cassa(O); bracciale(O);
    corona(O, { r: 2.8, costole: 14, x0: 20.3, x1: 23.15, y: 0, z: Z.corona, tubo: 1.9 });   // zigrinata, misure dalla foto frontale
    const disco = await quadrante(O, motore);
    const gruppo = new THREE.Group(); gruppo.name = 'meridiano-verde';
    gruppo.add(O.mesh(motore.ruoli('acciaio')));
    gruppo.add(disco);
    gruppo.add(motore.vetro({ raggio: 16.5, spessore: .3, z: Z.vetro }));
    // inquadratura del modulo p2: 94 mm di altezza, 70 mm di larghezza al telefono
    return { gruppo, ingombro: centra(gruppo), inquadratura: { altezza: 94, larghezza: 70 } };
  },
};
