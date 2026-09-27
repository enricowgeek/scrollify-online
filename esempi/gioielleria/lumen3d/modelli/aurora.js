// Lumen 3D · modello "Aurora" (oro rosa lucido, cassa tonda, quadrante bianco argenté con piccoli secondi, cinturino di cocco
// bordeaux con fibbia ad ardiglione). Facce piane e spigoli vivi sul metallo; il cuoio ha le scaglie in rilievo, una per una.
//
// Misure dalle foto (src/orologi/aurora, 1254 px):
// · fronte: cassa Ø 40,0 mm = 540 px → 13,5 px/mm, centro (617,6; 520,0); vista un po' dal basso (e ≈ −0,09: la corona, a z −6,9,
//   scende di 0,6 mm e le punte delle anse di 0,8). Corona fino a x 22,85. Anse: bordo esterno da (17,33; 10) a (12,8; 20),
//   punta a |y| 22,2 (media delle anse alte e basse), dentro a x ±10,05 (cinturino 20 mm).
//   Lunetta: quadrante visibile fino a r 15,8; smusso interno scuro 15,85-16,3; filo di luce 16,4-16,6; faccia interna 16,7-17,8;
//   faccia esterna chiara 17,9-19,4; spalla e fianco fino a r 20.
//   Quadrante: perno a (618,8; 520,0) px; indici r 10,3-14,3 larghi 1,2 (ore 12 doppio 2 × 1,0 a ±0,62; ore 6 corto da r 12,75);
//   ore 145,4° lunga 9,77, larga 1,7 a 2,7 mm; minuti 37,4° lunga 14,4, larga 1,26 a 3,5 mm (le 10:09 della foto);
//   piccoli secondi a (0,05; −7,44) mm, lancetta a 232,5° lunga 3,84 (contrappeso 2,2).
// · profilo: di lato quasi puro, 12,75 px/mm (lunetta 510 px), vetro bombato (cima a x 304 px = z 0, bordo a z −1,0):
//   lunetta fino a z −4,1, carrure satinata −4,6/−8,85, fondello −9,2/−9,72, corona al centro della carrure (z −6,85);
//   anse che piegano all'indietro fino a z −10,9 (oltre il fondello). Anello del cinturino fino a z ≈ −51.
//   Dalla parte opposta alla cassa: fibbia ad ardiglione (perno a y 2,8, telaio lungo 13 mm verso ore 6) e due passanti sopra.
// · retro: fondello a tre quarti con la corona in alto; anello con 8 viti a r 17,35 (±17° e ±48° dall'asse 12-6),
//   gola a r 15,3, fondello a cerchi concentrici da r 14,45.
// Cinturino 20 → 16 mm alla fibbia, spessore 3,1 (4,05 alle anse), scaglie grandi al centro e più strette ai lati fra le due cuciture,
// cucitura ritorta a ~2,2 mm dal bordo (come nelle foto), taglio tinto, fodera color cuoio con i trattini; sul pezzo lungo 5 fori
// (uno sotto l'ardiglione), punta a mezzo cerchio; passanti sottili a teste tonde; fibbia coi fianchi a lama affusolata.
import * as THREE from 'three';
import { Officina, v, TAU, D2R, clamp, cerchio, percorso, corona, vite, posa, lancetta, sagomaLancetta, sulQuadrante,
  anello, angoli, tondo } from '../officina.js';
import { centra, casuale } from '../motore.js';

const NC = 192;                       // lati della cassa tonda
const ls = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ————————————————————————————— cassa —————————————————————————————
// profilo di rivoluzione [r, z] dal quadrante al fondello; per ogni tratto fino al punto dopo: ruolo e colore (occlusione)
const PROFILO = [
  [[15.72, -2.6], 'luc', .35],   // parete sotto il bordo del quadrante (niente fessura)
  [[15.85, -1.9], 'luc', .55],   // smusso interno, in ombra nella foto
  [[16.35, -1.1], 'luc', 1],     // filo di luce
  [[16.6, -1.02], 'luc', 1],     // faccia interna della lunetta
  [[17.85, -1.3], 'luc', 1],     // faccia esterna, larga: la fascia chiara della foto
  [[19.35, -2.05], 'luc', 1],    // spalla
  [[19.75, -2.5], 'luc', 1],
  [[19.97, -3.1], 'luc', 1],     // fianco della lunetta
  [[20.0, -3.9], 'luc', .6],     // smusso sotto
  [[19.72, -4.18], 'luc', .3],   // gola fra lunetta e carrure
  [[19.55, -4.3], 'luc', 1],     // smusso alto della carrure
  [[19.85, -4.62], 'sat', 1],    // carrure satinata lungo il giro
  [[19.85, -8.85], 'luc', 1],    // smusso basso
  [[19.45, -9.2], 'sat', 1],     // anello del fondello, satinato lungo il giro (qui le viti)
  [[15.3, -9.2], 'luc', .35],    // gola
  [[15.2, -9.35], 'luc', 1],     // smusso del fondello
  [[14.45, -9.6], null],
];
const Z = { quadrante: -2.35, corona: -6.85 };

// ansa (quella in alto a destra; le altre si specchiano): bordo esterno di fronte X(Y), di lato dorso T e sotto B [Y, z]
const ANSA_X = [[8.6, 17.72], [10, 17.33], [11, 16.9], [12, 16.37], [13, 15.85], [14, 15.38], [15, 14.93], [16, 14.45], [17, 14.0],
  [18, 13.6], [19, 13.2], [20, 12.82], [21, 12.48], [21.8, 12.28], [22.4, 12.1], [23.2, 12.0]];
const ANSA_T = [[8.6, -4.3], [12, -4.3], [15.5, -4.3], [18.5, -4.33], [20.2, -4.5], [21.35, -5.05], [22.2, -6.1], [22.7, -7.4], [22.95, -8.6], [23.02, -9.5]];
const ANSA_B = [[8.6, -9.15], [12, -9.15], [15.5, -9.15], [18.5, -9.3], [20.2, -9.55], [21.35, -9.8], [22.2, -10.1], [22.55, -10.35], [22.75, -10.6], [22.82, -10.85]];
const ANSA_IN = 10.05;

// interpolazione lineare su una tabella [x, y] ordinata
function tab(T, x) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [a, p] = T[i - 1], [b, q] = T[i]; return p + (q - p) * (x - a) / (b - a); }
  return T.at(-1)[1];
}
// loft con le facce verso fuori: controlla il verso di una faccia (anelli ic, ic+1; di serie 1) rispetto al centro della sezione
// e, se serve, gira le sezioni
function loftFuori(O, R, o) {
  const i = Math.min(o.ic ?? 1, R.length - 2), a = R[i][0], b = R[i][1], c = R[i + 1][1], d = R[i + 1][0];
  const n = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(b, d));
  const cen = R[i].reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / R[i].length);
  const m = a.clone().add(b).add(c).add(d).multiplyScalar(.25);
  if (n.dot(m.sub(cen)) < 0) {
    const N = R[0].length, { mat, col, duri } = o, gira = j => N - 2 - j < 0 ? N - 1 : N - 2 - j;
    // sezioni al contrario: il lato j diventa il lato N-2-j (quello di chiusura resta N-1), il vertice j il vertice N-1-j
    R = R.map(r => r.slice().reverse());
    o = { ...o };
    if (typeof mat === 'function') o.mat = (ii, j, f, P) => mat(ii, gira(j), f, P);
    if (typeof col === 'function') o.col = (ii, j, f, P) => col(ii, gira(j), f, P);
    if (typeof duri === 'function') o.duri = j => duri(N - 1 - j);
  }
  O.loft(R, o);
}

function cassa(O) {
  const n = NC;
  for (let i = 0; i < PROFILO.length - 1; i++) {
    const [[r0, z0], k, col] = PROFILO[i], [[r1, z1]] = PROFILO[i + 1];
    // dal punto dopo al punto prima: normali verso fuori; lisce lungo il giro, spigolo vivo fra una fascia e l'altra del profilo
    O.fasciaLiscia(k, cerchio(r1, n, z1), cerchio(r0, n, z0), { col });
  }
  // fondello a cerchi concentrici, appena bombato
  const rr = [14.45, 11, 7, 3.5, .6], zz = [-9.6, -9.65, -9.69, -9.715, -9.72];
  for (let i = 0; i < rr.length - 1; i++) O.fasciaLiscia('rag', cerchio(rr[i + 1], n, zz[i + 1]), cerchio(rr[i], n, zz[i]), { giro: true });
  const ultimo = cerchio(.6, n, zz.at(-1)), c0 = v(0, 0, zz.at(-1) - .003);
  for (let i = 0; i < n; i++) O.tri('rag', ultimo[(i + 1) % n], ultimo[i], c0, ultimo[i].clone().setZ(0).normalize(), 1, v(0, 0, -1));
  // 8 viti col taglio sull'anello satinato
  for (const a0 of [17, 48]) for (const q of [1, -1]) for (const e of [90, 270]) {
    const a = (e + q * a0) * D2R;
    vite(O, posa(v(Math.cos(a) * 17.35, Math.sin(a) * 17.35, -9.2), v(0, 0, -1), a), { r: .95, h: .36, taglio: .19 });
  }
  // quattro anse
  for (const sx of [1, -1]) for (const sy of [1, -1]) ansa(O, sx, sy);
  // corona zigrinata col cappello a cerchi (foto: 12 costole grandi, Ø 5,7)
  corona(O, { r: 2.85, costole: 12, x0: 19.85, x1: 22.85, y: 0, z: Z.corona, tubo: 1.35, kCap: 'rag' });
}

// ansa: sezioni fra il dorso T(u) e il sotto B(u); di traverso: fianco interno, smusso, dorso, smusso esterno largo, fianco, smusso basso
function ansa(O, sx, sy) {
  const N = 26, cur = P => new THREE.CatmullRomCurve3(P.map(([y, z]) => v(0, y, z)), false, 'centripetal');
  const cT = cur(ANSA_T), cB = cur(ANSA_B), R = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, t = cT.getPoint(u), b = cB.getPoint(u);
    const xT = tab(ANSA_X, t.y), xB = tab(ANSA_X, b.y), c = .75 - .15 * u;
    const sez = [
      [ANSA_IN, b.y, b.z], [ANSA_IN, t.y, t.z - .25], [ANSA_IN + .25, t.y, t.z], [xT - c, t.y, t.z],
      [xT, t.y - (t.y - b.y) * .06, t.z - c * .8], [xB, b.y, b.z + .35], [xB - .35, b.y, b.z],
    ];
    R.push(sez.map(([x, y, z]) => v(sx * x, sy * y, z)));
  }
  const mats = [['luc', .5], ['luc', .8], 'luc', 'luc', 'luc', ['luc', .7], ['sat', .45]];
  loftFuori(O, R, { duri: () => true, liscioV: true, mat: (i, j) => mats[j], capoB: 'luc' });
}

// ————————————————————————————— quadrante —————————————————————————————
// foto ripulita (src/lumen3d/quadrante-aurora.py) + indici a tetto, lancette dauphine, perni: tutto in oro rosa lucido
const Q = {
  texture: '3d/lumen/aurora-quadrante.webp', raggio: 213 / 13.5,
  indici: { r0: 10.3, r1: 14.35, largh: 1.2, alto: .5, doppio: [1.0, .62], r0sei: 12.75 },
  sub: [.05, -7.44],
  // [angolo °, quota sopra il quadrante, spessore, profilo [t, larghezza]]
  // dauphine: falde piane, la larghezza cresce e cala in linea retta (una piega sola, al punto più largo)
  ore: [145.4, .5, .28, [[-1.75, .06], [-1.0, .6], [0, .85], [.9, .78], [2.7, 1.7], [9.77, .03]]],
  minuti: [37.4, .85, .26, [[-1.9, .06], [-1.1, .5], [0, .62], [1.3, .56], [3.5, 1.22], [14.4, .03]]],
  secondi: [232.5, .3, .12, [[-2.2, .16], [-1.9, .32], [0, .34], [3.3, .28], [3.84, .03]]],
};
// indice applicato a tetto: colmo al centro, due falde lucide, testate a punta (come gli indici sfaccettati della foto)
function indiceTetto(O, [phi, w, scarto, r0, r1, h], z) {
  const s = [[-w / 2, 0], [-w / 2, h * .3], [0, h], [w / 2, h * .3], [w / 2, 0]], t = s.map(([x, y]) => [x * .5, y * .55]), c = Math.min(w * .42, (r1 - r0) / 5);
  O.loft([t.map(([x, y]) => v(x, y, r0)), s.map(([x, y]) => v(x, y, r0 + c)), s.map(([x, y]) => v(x, y, r1 - c)), t.map(([x, y]) => v(x, y, r1))],
    { duri: () => true, mat: 'lanc', capoA: 'lanc', capoB: 'lanc', m: sulQuadrante(phi, scarto, z) });
}
const sagoma = ([phi, w, scarto, r0, r1]) => {
  const c = Math.cos(phi), s = Math.sin(phi), q = (r, l) => [c * r - s * (scarto + l), s * r + c * (scarto + l)];
  return [q(r0, -w / 2), q(r1, -w / 2), q(r1, w / 2), q(r0, w / 2)];
};
// lancetta a bastone su un altro centro (piccoli secondi): come lancetta() dell'officina, senza lume, spostata in (cx, cy)
function lancettaIn(O, { ang, z, h, prof }, cx, cy, k = 'lanc') {
  const s = [[-.5, 0], [-.5, h * .3], [0, h], [.5, h * .3], [.5, 0]], R = prof.map(([t, w]) => s.map(([x, y]) => v(x * w, y, t)));
  const m = new THREE.Matrix4().makeTranslation(cx, cy, 0).multiply(sulQuadrante(ang * D2R, 0, z));
  O.loft(R, { duri: () => true, mat: (i, j, f) => f.y < -.9 ? ['luc', .5] : k, capoA: k, capoB: k, m });
}
// perno a gradini in un punto qualunque del quadrante
function perno(O, cx, cy, gradini) {
  const a = angoli(10 * D2R), m = new THREE.Matrix4().makeTranslation(cx, cy, 0);
  for (const [r, z0, z1, k = 'lanc'] of gradini)
    O.loft([anello(tondo(.02), z1 + .03, a), anello(tondo(r * .82), z1, a), anello(tondo(r), z1 - .06, a), anello(tondo(r), z0, a)], { mat: k, liscioV: true, duriV: i => i === 2, m });
}
async function quadrante(O, motore) {
  const z = Z.quadrante, I = Q.indici, pezzi = [], ombre = [];
  for (let h = 1; h <= 12; h++) {
    const phi = (90 - 30 * h) * D2R;
    if (h === 12) for (const sg of [-1, 1]) pezzi.push([phi, I.doppio[0], sg * I.doppio[1], I.r0, I.r1, I.alto]);
    else pezzi.push([phi, I.largh, 0, h === 6 ? I.r0sei : I.r0, I.r1, I.alto]);
  }
  for (const p of pezzi) { indiceTetto(O, p, z); ombre.push({ punti: sagoma(p), alto: p[5], forza: .5 }); }
  for (const [ang, dz, h, prof] of [Q.ore, Q.minuti]) {
    const L = { ang, z: z + dz, h, prof, lume: false };
    lancetta(O, L); ombre.push({ punti: sagomaLancetta(L), alto: dz + h * .5, forza: .45 });
  }
  perno(O, 0, 0, [[1.3, z, z + .5], [.95, z + .45, z + .85], [.48, z + .8, z + 1.12], [.2, z + 1.08, z + 1.16, 'nero']]);
  // piccoli secondi: lancetta a bastone e perno piccolo, sul loro centro
  const [sx, sy] = Q.sub, [ang, dz, h, prof] = Q.secondi;
  const Ls = { ang, z: z + dz, h, prof };
  lancettaIn(O, Ls, sx, sy);
  ombre.push({ punti: sagomaLancetta(Ls).map(([x, y]) => [x + sx, y + sy]), alto: dz + .1, forza: .35 });
  perno(O, sx, sy, [[.58, z, z + .28], [.3, z + .26, z + .5], [.12, z + .47, z + .53, 'nero']]);
  return motore.quadrante({ texture: Q.texture, raggio: Q.raggio, z, ombre });
}

// vetro zaffiro bombato (profilo: 1 mm di cupola su r 16,3): solo riflesso, materiale del motore
function vetroBombato(motore, { raggio, alto, z }) {
  const R = (raggio * raggio + alto * alto) / (2 * alto), th = Math.asin(raggio / R);
  const g = motore.geometria(`aurora-vetro|${raggio}|${alto}|${z}`, () => {
    const g = new THREE.SphereGeometry(R, 128, 8, 0, TAU, 0, th); g.rotateX(Math.PI / 2); g.translate(0, 0, z - R); return g;
  });
  const m = new THREE.Mesh(g, motore.materiale('vetro', { forza: 1 }));
  m.renderOrder = 2; m.name = 'vetro';
  return m;
}

// ————————————————————————————— cinturino —————————————————————————————
// linea mediana dell'anello [y, z] (anello.py sul profilo, riportata a 12,75 px/mm e al vetro a x 304; attacchi fra le anse,
// dentro la cassa, e gomito sotto la fibbia rifiniti a mano; lato esterno spostato di 0,6-1,4 mm: in foto la fodera, vista in
// prospettiva, allarga la fascia solo verso dentro). Copia in 3d/lumen/aurora-anello.json
const LINEA = [
  [17.30, -5.45], [18.70, -6.30], [20.37, -7.09], [21.82, -8.16], [24.05, -9.97], [25.77, -12.65], [27.39, -15.30], [28.99, -18.00], [30.31, -20.89],
  [31.21, -23.95], [31.52, -27.14], [31.25, -30.33], [30.51, -33.43], [29.28, -36.37], [27.62, -39.10], [25.49, -41.50], [22.86, -43.35], [20.03, -44.72],
  [17.25, -46.08], [14.48, -47.52], [11.54, -48.69], [8.48, -49.51], [5.38, -49.97], [2.29, -50.35], [-.76, -50.66], [-3.83, -50.90], [-6.97, -51.01],
  [-10.09, -50.91], [-13.16, -50.46], [-16.18, -49.46], [-19.15, -48.28], [-22.04, -46.90], [-24.80, -45.24], [-27.36, -43.25], [-29.67, -40.90], [-31.60, -38.24],
  [-33.13, -35.32], [-34.25, -32.21], [-34.92, -28.94], [-34.94, -25.56], [-34.14, -22.28], [-32.63, -19.28], [-30.69, -16.67], [-28.73, -14.18], [-26.67, -11.80],
  [-24.52, -9.46], [-22.15, -7.78], [-20.55, -6.86], [-18.70, -6.30], [-17.30, -5.45]];

// sezione del cinturino (oraria vista dall'avanti, y = fuori dall'anello): fodera piatta, bordi tinti, piano bombato di d
// lati: 0 smusso, 1 bordo, 2 arrotondato, 3 corsia della cucitura, 4-7 piano (sotto le scaglie), 8 corsia, 9 arrotondato, 10 bordo, 11 smusso, 12 fodera
// corsia della cucitura (dal bordo al campo delle scaglie): la cucitura corre a ~2,2 mm dal bordo, come nella foto
const corsia = w => Math.min(2.85, w / 2 * .36);
function sezione(w, h, d, y0 = 0) {
  const a = w / 2, b = h / 2, top = x => b + d * (1 - (x / a) ** 2), e = corsia(w), r = Math.min(.2, a * .12), c = Math.min(.35, a * .2);
  return [[-a + c, -b], [-a, -b + .32], [-a, b - .42], [-a + r, top(-a + r) - .1], [-a + e, top(-a + e)],
    [-a * .5, top(-a * .5)], [0, top(0)], [a * .5, top(a * .5)], [a - e, top(a - e)], [a - r, top(a - r) - .1],
    [a, b - .42], [a, -b + .32], [a - c, -b]].map(([x, y]) => [x, y + y0]);
}

// un pezzo del cinturino lungo la linea: s = elenco delle ascisse, f(s) → { w, h, d, y0 }; scaglie(s) → piano coperto dalle scaglie
function pezzo(O, Pc, S, f, { scaglie = () => true, capoA, capoB } = {}) {
  const R = S.map(s => { const { w, h, d, y0 } = f(s); return sezione(w, h, d, y0).map(([x, y]) => Pc.P(s, x, y)); });
  const col = [.45, .7, .9, 1, null, null, null, null, 1, .9, .7, .45, .8];
  loftFuori(O, R, {
    liscioV: true, duri: j => j === 0 || j === 1 || j === 12 || j === 11,
    // taglio e smussi (0, 1, 10, 11) col bordo tinto: niente velo grigio del cuoio di taglio
    // sotto le scaglie (4-7) il fondo dei solchi è bordeaux scuro (niente velo grigio della pelle nei solchi)
    mat: (i, j) => j === 12 ? ['fodera', .8] : j <= 1 || j >= 10 ? ['bordo', col[j] + .25] : col[j] === null && scaglie(S[i]) && scaglie(S[i + 1]) ? ['bordo', .75] : ['pelle', col[j] ?? 1],
    capoA, capoB,
  });
}

// scaglia di cocco: cuscinetto lucido col solco intorno, nel piano (s, x) del pezzo; piano(s, x) = quota del piano sopra la linea.
// Anelli concentrici (rettangolo con gli angoli tondi) e normali analitiche della cupola: niente spigoli sul colmo; coordinate di
// texture = (s, x) in mm, uguali per tutte le scaglie, così la grana corre dritta lungo il cinturino
const PROF_SCAGLIA = [[0, 0], [.2, .5], [.6, .85], [1.3, 1]];   // [rientro dal solco mm, quota / alt]: cima piatta, bordo morbido
function scaglia(O, Pc, piano, s0, s1, x0, x1, alt) {
  const g = .085, L = s1 - s0, W = x1 - x0, k = Math.max(0, Math.round(L / 3.2) - 1), m = Math.min(L, W) / 2 - g;
  const prof = PROF_SCAGLIA.filter(([e]) => e < m - .15).concat([[m - .05, 1.02]]);
  // punto del bordo di un rettangolo tondo rientrato di e: [s, x, verso dentro (ds, dx)]
  const giro = e => {
    const a0 = s0 + g + e, a1 = s1 - g - e, b0 = x0 + g + e, b1 = x1 - g - e, r = Math.max(.02, Math.min(.7, (a1 - a0) / 2, (b1 - b0) / 2) - .01), P = [];
    const lato = (p, q, n, dir) => { for (let i = 1; i <= n; i++) { const t = i / (n + 1); P.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, dir]); } };
    const ang = (cs, cx, t0) => { for (let i = 0; i <= 2; i++) { const t = t0 + i / 2 * Math.PI / 2; P.push([cs + Math.cos(t) * r, cx + Math.sin(t) * r, [-Math.cos(t), -Math.sin(t)]]); } };
    ang(a0 + r, b0 + r, Math.PI); lato([a0 + r, b0], [a1 - r, b0], k, [0, 1]);
    ang(a1 - r, b0 + r, 1.5 * Math.PI); ang(a1 - r, b1 - r, 0); lato([a1 - r, b1], [a0 + r, b1], k, [0, -1]); ang(a0 + r, b1 - r, .5 * Math.PI);
    return P;
  };
  const cs = (s0 + s1) / 2, cx = (x0 + x1) / 2, V3 = THREE.Vector3;
  const vert = (s, x, h, dir, pend) => {
    const { T, N } = Pc.rif(s), lat = new V3().crossVectors(N, T), p = Pc.P(s, x, piano(s, x) + h);
    const dentro = T.clone().multiplyScalar(dir[0]).addScaledVector(lat, dir[1]);
    return { p, n: N.clone().addScaledVector(dentro, -pend).normalize(), t: T, u: [s, x] };
  };
  const anelli = prof.map(([e, q], i) => {
    const d = prof[Math.min(i + 1, prof.length - 1)], c = prof[Math.max(i - 1, 0)], pend = (d[1] - c[1]) * alt / Math.max(.01, d[0] - c[0]);
    return giro(e).map(([s, x, dir]) => vert(s, x, q * alt, dir, i === prof.length - 1 ? 0 : pend));
  });
  const cen = vert(cs, cx, prof.at(-1)[1] * alt, [0, 0], 0), su = cen.n;
  const tri = (a, b, c) => O.triN('pelle', [a.p, b.p, c.p], [a.n, b.n, c.n], [a.u, b.u, c.u], [a.t, b.t, c.t], su, 1);
  for (let i = 0; i < anelli.length - 1; i++) {
    const A = anelli[i], B = anelli[i + 1], n = A.length;
    for (let j = 0; j < n; j++) { const j1 = (j + 1) % n; tri(A[j], A[j1], B[j1]); tri(A[j], B[j1], B[j]); }
  }
  const U = anelli.at(-1);
  for (let j = 0; j < U.length; j++) tri(U[j], U[(j + 1) % U.length], cen);
}
// file di scaglie su un tratto: centro grande (metà del campo fra le cuciture), fianchi più stretti e sfalsati; lunghezze con un po' di caso ripetibile.
// fori = ascisse dove la fila centrale deve avere una scaglia centrata (6,4 mm) per ospitare il foro
function scaglie(O, Pc, piano, largh, sA, sB, rnd, fori = []) {
  // fianchi stretti ma lunghi quasi quanto il centro (nelle foto le file sono quasi allineate, non a mattoncini)
  const fasce = [[0, .25, 5.0, 6.8], [.25, .75, 6.2, 7.8], [.75, 1, 5.0, 6.8]];
  const posa1 = (s0, s1, f0, f1) => { const L = largh((s0 + s1) / 2), w = L - 2 * corsia(L) - .1; scaglia(O, Pc, piano, s0, s1, -w / 2 + w * f0, -w / 2 + w * f1, .2); };
  for (const [f0, f1, lmin, lmax] of fasce) {
    // tagli fissi intorno ai fori (solo la fila centrale), poi i vuoti divisi in scaglie di lunghezza simile
    const fissi = f0 === .25 ? fori.filter(f => f - 3.2 > sA && f + 3.2 < sB).sort((p, q) => p - q).map(f => [f - 3.2, f + 3.2]) : [];
    let s = f0 === .25 ? sA : sA - rnd() * lmax;
    for (const [p, q] of [...fissi, [sB, sB]]) {
      const n = Math.max(1, Math.round((p - s) / ((lmin + lmax) / 2)));
      let a0 = s;
      for (let i = 0; i < n && p - s > 1.2; i++) {
        const a1 = i === n - 1 ? p : a0 + (p - s) / n * (.85 + rnd() * .3);
        if (Math.min(a1, sB) - Math.max(a0, sA) >= 1.2) posa1(Math.max(a0, sA), Math.min(a1, sB), f0, f1);
        a0 = a1;
      }
      if (q > p) posa1(p, q, f0, f1);
      s = q;
    }
  }
}
// cucitura in rilievo lungo i due bordi: il filo ritorto della foto, un tratto ovale e inclinato per punto, quasi a contatto
// col vicino (niente denti a rombo)
function cucitura(O, Pc, piano, largh, sA, sB) {
  const passo = 1.1, fi = 38 * D2R, c = Math.cos(fi), s_ = Math.sin(fi);
  const sez = [[-.37, 0], [0, .28], [.37, 0]];
  for (const lato of [1, -1]) for (let sc = sA + passo / 2; sc < sB - passo / 2; sc += passo) {
    const L = largh(sc), xc = lato * (L / 2 - corsia(L) * .78);
    const R = [[-.95, .3], [-.45, .95], [.45, .95], [.95, .3]].map(([a, k]) => sez.map(([b, h]) => {
      const s = sc + a * c - b * k * s_, x = xc + a * s_ + b * k * c; return Pc.P(s, x, piano(s, x) + h * k - .04);
    }));
    // sezione aperta sotto (sta sul cuoio), teste senza tappo: le copre il punto dopo
    loftFuori(O, R, { liscioV: true, chiuso: false, mat: 'filo' });
  }
}
// cucitura della fodera: trattini chiari (stesso materiale della fodera, colore pieno)
function trattini(O, Pc, largh, alto, sA, sB) {
  for (const lato of [1, -1]) for (let s = sA + .6; s < sB - 1.2; s += 1.9) {
    const x = lato * (largh(s) / 2 - corsia(largh(s)) * .78), y0 = -alto(s) / 2 - .015, q = (ss, xx) => Pc.P(ss, xx, y0);
    O.quad('fodera', q(s, x - .12), q(s + 1.0, x - .12), q(s + 1.0, x + .12), q(s, x + .12), Pc.rif(s).T, 1, Pc.P(s, x, 0));
  }
}
// foro dell'ardiglione sul colmo di una scaglia: fondo scuro e bordino in ombra, appena sopra la cupola (che lì è piana).
// y(s) = quota della cima lungo il cinturino: dove il pezzo lungo scende nel telaio il foro la segue (niente fori a "D")
function foro(O, Pc, s, x, y) {
  const a = angoli(20 * D2R), g = (r, h) => a.map(t => { const ss = s + Math.cos(t) * r; return Pc.P(ss, x + Math.sin(t) * r, y(ss) + h); });
  // dal fondo al bordo esterno: il fondo (capoA) guarda fuori, il bordino scende verso il cuoio
  O.loft([g(.8, .062), g(.86, .05), g(1.05, .0)], { liscioV: true, duriV: i => i === 1, mat: i => i === 0 ? 'nero' : ['pelle', .4], capoA: 'nero' });
}
// passante: fascia di cuoio sottile (t) intorno al fascio (x ±w/2, y da yb a yt), lunga L, con le teste tonde (sezione a stadio
// nel piano s-spessore): un anello di pelle, non un blocco. Il piano sopra è appena bombato come il cinturino
function passante(O, Pc, sc, L, w, yb, yt) {
  const t = .72, rett = (hx, y0, y1, r, bomba) => {
    const P = [], cs = [[hx - r, y1 - r, 0], [-hx + r, y1 - r, Math.PI / 2], [-hx + r, y0 + r, Math.PI], [hx - r, y0 + r, 1.5 * Math.PI]];
    for (const [cx, cy, a0] of cs) for (let i = 0; i <= 3; i++) { const u = a0 + i / 3 * Math.PI / 2; P.push([cx + Math.cos(u) * r, cy + Math.sin(u) * r]); }
    // punti in più sul lato alto per la bombatura (dal lato destro al sinistro)
    const alto = [];
    for (let i = 1; i < 6; i++) { const x = (hx - r) - 2 * (hx - r) * i / 6; alto.push([x, y1 + bomba * (1 - (x / hx) ** 2)]); }
    return [...P.slice(0, 4), ...alto, ...P.slice(4)];
  };
  // o = spessore raggiunto (0 = faccia interna, t = faccia esterna); le teste sono mezzi cerchi di raggio t/2
  const anello = o => rett(w / 2 + .12 + o, yb - .05 - o, yt + .05 + o, .3 + o * .9, o * .45);
  const S = [];
  for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + i / 4 * Math.PI; S.push([sc - L / 2 + t / 2 - Math.cos(a) * t / 2, t / 2 + Math.sin(a) * t / 2]); }
  for (let i = 0; i <= 4; i++) { const a = Math.PI / 2 - i / 4 * Math.PI; S.push([sc + L / 2 - t / 2 + Math.cos(a) * t / 2, t / 2 + Math.sin(a) * t / 2]); }
  // verso controllato sul tratto dritto di fuori (anelli 4-5), non sulle teste
  loftFuori(O, S.map(([s, o]) => anello(o).map(([x, y]) => Pc.P(s, x, y))), { liscioV: true, mat: 'pelle', ic: 4 });
}

// fibbia ad ardiglione: telaio che gira intorno al cinturino (barra della cerniera nel ricciolo del pezzo corto, barra davanti rialzata
// sopra il pezzo lungo), ardiglione dalla cerniera alla barra davanti, viti della cerniera sui fianchi
function fibbia(O, Pc, sH, LF, w) {
  const b = 2.3, hb = 1.95, Wc = w / 2 + .2 + b / 2, sF = sH + LF - b / 2;
  const k = s => clamp((s - sH) / (sF - sH), 0, 1), y0 = s => -1.25 + 3.9 * (k(s) * .85 + .15 * ls(k(s)));
  // altezza del telaio: i fianchi sono lame affusolate (foto di profilo: larghe alla cerniera, sottili davanti), le barre restano basse
  const lama = x => ls((Math.abs(x) - (Wc - 2.1)) / 1.1), hS = (s, x) => 1.75 + (1 - k(s)) * (.55 + 1.55 * lama(x));
  // giro del telaio nel piano (s, x): rettangolo con gli angoli davanti tondi (r 2,4) e quelli della cerniera appena smussati
  const giro = [], arco = (cs, cx, r, a0, a1, n) => { for (let i = 0; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; giro.push([cs + Math.cos(t) * r, cx + Math.sin(t) * r]); } };
  arco(sH + .9, -Wc + .9, .9, Math.PI, 1.5 * Math.PI, 3);
  arco(sF - 2.4, -Wc + 2.4, 2.4, 1.5 * Math.PI, 2 * Math.PI, 6);
  arco(sF - 2.4, Wc - 2.4, 2.4, 0, .5 * Math.PI, 6);
  arco(sH + .9, Wc - .9, .9, .5 * Math.PI, Math.PI, 3);
  // punti in più lungo i lati lunghi (la linea curva)
  const G = [];
  for (let i = 0; i < giro.length; i++) {
    const p = giro[i], q = giro[(i + 1) % giro.length], n = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 1.6));
    for (let k = 0; k < n; k++) G.push([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n]);
  }
  const sez = h => [[-b / 2, 0], [-b / 2, h - .55], [-b / 2 + .42, h], [b / 2 - .42, h], [b / 2, h - .55], [b / 2, 0]];
  const cS = sH + (sF - sH) / 2, R = [];
  for (let i = 0; i <= G.length; i++) {
    const [s, x] = G[i % G.length], [sp, xp] = G[(i - 1 + G.length) % G.length], [sn, xn] = G[(i + 1) % G.length];
    let ns = xn - xp, nx = -(sn - sp); const l = Math.hypot(ns, nx); ns /= l; nx /= l;
    if (ns * (s - cS) + nx * x < 0) { ns = -ns; nx = -nx; }                       // normale nel piano verso fuori dal telaio
    R.push(sez(hS(s, x)).map(([u, h]) => { const ss = s + ns * u, xx = x + nx * u; return Pc.P(ss, xx, y0(ss) + h); }));
  }
  loftFuori(O, R, { duri: () => true, liscioV: true, mat: (i, j) => j === 5 ? ['sat', .5] : j === 0 || j === 4 ? ['luc', .85] : 'luc' });
  // viti della cerniera sui due fianchi
  for (const sg of [1, -1]) {
    const lat = Pc.lat(sH).multiplyScalar(sg);
    vite(O, posa(Pc.P(sH + .2, sg * (Wc + b / 2), .1), lat, .6), { r: .72, h: .24, taglio: .13 });
  }
  // ardiglione: dalla cerniera alla barra davanti, ci passa sopra e piega giù
  const yF = y0(sF) + hb, via = [[sH, 0], [sH + 1.4, .55], [sF - 2.3, yF + .2], [sF - .9, yF + .4], [sF - .2, yF + .36], [sF + .3, yF + .12], [sF + .5, yF - .12]];
  const cur = new THREE.CatmullRomCurve3(via.map(([s, y]) => v(0, s, y)), false, 'centripetal'), sa = [[-.55, -.42], [-.55, .12], [0, .44], [.55, .12], [.55, -.42]];
  const RA = [];
  for (let i = 0; i <= 26; i++) {
    const u = i / 26, p = cur.getPoint(u), t = cur.getTangent(u), nS = -t.z, nY = t.y;    // normale nel piano (s, y)
    const sc = i === 0 || i === 26 ? .55 : 1;
    RA.push(sa.map(([x, h]) => Pc.P(p.y + nS * h * sc, x * sc, p.z + nY * h * sc)));
  }
  loftFuori(O, RA, { duri: () => true, liscioV: true, mat: 'luc', capoA: 'luc', capoB: 'luc' });
  return { yArd: s => { const u = clamp((s - sH) / (sF + 1.05 - sH), 0, 1); return cur.getPoint(u).z; } };
}

function cinturino(O, rnd) {
  const Pc = percorso(LINEA), lung = Pc.lung;
  const sH = Pc.trova(2.8, -40), LF = 13;                  // cerniera della fibbia (profilo: y 2,8), telaio lungo 13 verso ore 6
  const sK = [sH - 8.4, sH - 14.8], LK = 5.0;              // passanti: fisso e mobile
  const sP = sH - 22.5;                                    // punta del pezzo lungo
  const wC = s => 20 - 4 * ls(s / sH), wL = s => s >= sH ? 20 - 4 * ls((lung - s) / (lung - sH)) : 16;
  const hC = s => 3.1 + .95 * (1 - ls(s / 26)), hL = s => 3.1 + .95 * (1 - ls((lung - s) / 26));
  const dC = s => .18 + .22 * (1 - ls(s / 26)), dL = s => .18 + .22 * (1 - ls((lung - s) / 26));
  // quota del pezzo lungo sopra la linea: sopra il corto fino alla cerniera, poi scende dentro il telaio sotto la barra davanti
  const alto = s => hC(s) / 2 + dC(s) + hL(s) / 2 + .1;
  const offL = s => s <= sH + 1.2 ? alto(Math.min(s, sH)) : s >= sH + LF - .8 ? 0 : alto(sH) * (1 - ls((s - sH - 1.2) / (LF - 2.0)));
  // punta: mezzo cerchio negli ultimi 8 mm (come nella foto del retro, non a ogiva) e cuoio assottigliato verso la fine;
  // il fondo resta appoggiato sul pezzo corto, si abbassa solo il piano
  const kP = s => clamp((s - sP) / 8, 0, 1), wPunta = s => 16 * Math.sqrt(1 - (1 - kP(s)) ** 2);
  const wLp = s => s < sP + 8 ? Math.max(1.6, wPunta(s)) : wL(s), hLp = s => hL(s) * (.72 + .28 * ls(kP(s) * 1.6));
  const offLp = s => offL(s) - (hL(s) - hLp(s)) / 2;
  const fC = s => ({ w: wC(s), h: hC(s) * (s > sH - 1.4 ? .55 + .45 * Math.sqrt(clamp((sH - .15 - s) / 1.25, 0, 1)) : 1), d: dC(s), y0: 0 });
  const fL = s => ({ w: wLp(s), h: hLp(s), d: dL(s), y0: offLp(s) });
  const pianoC = (s, x) => hC(s) / 2 + dC(s) * (1 - (2 * x / wC(s)) ** 2);
  const pianoL = (s, x) => offLp(s) + hLp(s) / 2 + dL(s) * (1 - (2 * x / wLp(s)) ** 2);
  const passi = (a, b, d) => { const n = Math.max(2, Math.ceil((b - a) / d)); return Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n); };
  // pezzo corto (ore 12): dalla molla alla cerniera, finisce col ricciolo intorno alla barra
  const SC = [...passi(0, sH - 1.5, 1.5), sH - 1.0, sH - .6, sH - .3, sH - .15];
  pezzo(O, Pc, SC, fC, { scaglie: s => s < sP - .5, capoA: ['pelle', .4], capoB: ['pelle', .8] });
  // pezzo lungo (ore 6): dalla punta alla molla
  const SL = [sP, sP + .08, sP + .25, sP + .55, sP + 1, sP + 1.6, sP + 2.4, sP + 3.4, sP + 4.6, sP + 6, sP + 7.2, ...passi(sP + 8.2, sH - 1, 1.5), ...passi(sH - .5, sH + LF + 1, .75).slice(1), ...passi(sH + LF + 2.5, lung, 1.5)];
  pezzo(O, Pc, SL, fL, { scaglie: s => s > sP + 7, capoA: ['pelle', .8], capoB: ['pelle', .4] });
  const ard = fibbia(O, Pc, sH, LF, wC(sH));
  // fori: dove l'ardiglione attraversa il pezzo lungo, uno fra cerniera e passanti, tre verso ore 6 oltre il telaio (come nel retro)
  let sA = sH + 2;
  for (let s = sH + 1; s < sH + LF; s += .05) if (ard.yArd(s) > offL(s)) { sA = s; break; }
  const fori = [sH - 3.4, sA, sH + LF + 3.2, sH + LF + 9.6, sH + LF + 16];
  // scaglie: sul lungo dalla punta alla molla, sul corto dove si vede (prima della punta del lungo)
  scaglie(O, Pc, pianoL, wL, sP + 7.2, lung, rnd, fori);
  scaglie(O, Pc, pianoC, wC, 0, sP - .8, rnd);
  for (const f of fori) foro(O, Pc, f, 0, ss => pianoL(ss, 0) + .215);
  cucitura(O, Pc, pianoC, wC, 0, sP - .5);
  cucitura(O, Pc, pianoL, wLp, sP + 3.5, lung);
  trattini(O, Pc, wC, hC, .8, sH - 1.5);
  trattini(O, Pc, wL, hL, sH + LF + 1, lung - .8);
  // passanti intorno ai due pezzi
  for (const s of sK) passante(O, Pc, s, LK, Math.max(wC(s), 16), -hC(s) / 2, offL(s) + hL(s) / 2 + dL(s) + .3);
  return { sH };
}

// finiture del motore tarate sulle foto: oro rosa chiaro e lucido (un filo di ruvidità allarga i riflessi dello studio: niente rame
// scuro), lancette e indici un po' meno a specchio (non bronzo di fronte), cocco bordeaux lucido con la grana appena accennata
// (più forte, sul lucido, i pori diventano puntini), taglio e fondo dei solchi tinti bordeaux scuro con un materiale senza velo
// ('filo'), fodera color cuoio chiaro, filo ritorto rosa bordeaux
function ruoli(motore) {
  const M = (n, o) => motore.materiale(n, o), oro = 0xeec6a8;
  return {
    luc: M('oro-rosa.luc', { colore: oro, ruvido: .16, env: 1.65 }), sat: M('oro-rosa.sat', { colore: oro, env: 1.35 }),
    rag: M('oro-rosa.rag', { colore: oro, env: 1.35 }), lanc: M('oro-rosa.lanc', { colore: oro, ruvido: .2, env: 1.6 }),
    nero: M('nero'), pelle: M('pelle', { colore: 0x5a121d, ruvido: .22, rilievo: .025, env: 1.55 }),
    bordo: M('filo', { colore: 0x3c0a13, ruvido: .3, env: 1.6 }),
    fodera: M('filo', { colore: 0xe8ccae, ruvido: .8 }), filo: M('filo', { colore: 0x9e3a50, ruvido: .45 }),
  };
}

export default {
  id: 'aurora',
  nome: 'Aurora',
  // viste delle foto (lumen-orto / sovrapponi): [angolo, elevazione, rotazione della cattura in gradi]
  viste: { fronte: [0, -.09], profilo: [Math.PI / 2, 0], retro: [Math.PI - .5, -.1, 90] },
  async costruisci(ctx) {
    const { motore } = ctx;
    const O = new Officina();
    cassa(O); cinturino(O, casuale(926));
    const disco = await quadrante(O, motore);
    const gruppo = new THREE.Group(); gruppo.name = 'aurora';
    gruppo.add(O.mesh(ruoli(motore)));
    gruppo.add(disco);
    gruppo.add(vetroBombato(motore, { raggio: 16.3, alto: 1.0, z: 0 }));
    return { gruppo, ingombro: centra(gruppo) };
  },
};
