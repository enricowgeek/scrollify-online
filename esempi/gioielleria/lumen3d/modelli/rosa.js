// Lumen 3D · modello "Rosa" (acciaio lucido, cassa rettangolare a gradini, quadrante rosa soleil con diamanti, bracciale a cinque file).
// Misure dalle foto (src/orologi/rosa), mm. Scala dichiarata: cassa larga 21,0 mm → foto frontale 14,2 px/mm (298 px fra i fianchi);
// profilo 14,05 px/mm (altezza del quadrante, 343 px). Foto frontale, centro = perno delle lancette (620,3; 533,3):
//   guide (lati lunghi, le parti più alte): x 8,9…10,5, dorso tondo, punte tonde (r 1,6) a y ±16,1; fra le guide le barre fino a ±14,9
//   gola scura attorno all'orlo (8,9 × 13,55), orlo lucido del vetro, rehaut satinato, quadrante 7,6 × 12,25 (foto 7,6 × 12,2)
//   anse: x 6,5…8,85 fino a y ±17,6 (oltre le barre, accanto alle punte delle guide), vite del perno sul fianco a y ±16,85
//   corona: da x 10,5 a 13,3, presa a 12 costole r 2,45, cabochon a cupola r 1,63; y 0
//   bracciale largo 12,1: file 2,5 | 1,9 | 3,3 | 1,9 | 2,5 (bordo, chicco, centro, chicco, bordo); passo delle maglie ≈ 7,6
// Profilo (foto di tre quarti, a ≈ 1,3 rad: il quadrante si vede di sbieco): cassa spessa 6,3 (colmo delle guide 0, fianco fino a −5,35,
//   fondo −5,75, piastra −6,3); anello alto 69 (linea mediana +30,4…−33,6) e profondo 35,7; maglie −1,95…+2,1 sulla linea (la sovrapposizione
//   di profilo vuole le maglie un filo più spesse dei 3,8 misurati a occhio)
// Retro: piastra rettangolare satinata con gli angoli smussati, 4 viti; chiusura a placca lucida larga quanto il bracciale (7,8 mm) e sotto
//   il corpo della déployante (nel profilo: piastra dritta con gli angoli tondi, 11 mm). Mai un secondo fondello: di fronte alla cassa c'è la chiusura.
// Maglie di centro e di bordo: cuscini netti (piano lucido, spalla tonda stretta, fianchi dritti), come nel dettaglio del bracciale;
//   chicchi di riso tondi davvero (normali morbide).
// Le foto non sono coerenti fra loro: il retro è in prospettiva forte (anello più largo della cassa di quanto sia), la fronte mostra
// il bracciale più lungo in basso (+4 mm rispetto al profilo). Si segue la fronte per XY e il profilo per spessori e anello.
import * as THREE from 'three';
import { Officina, v, TAU, D2R, clamp, rientra, lati, daLati, ruota, in3, percorso, lungo, vite, posa, anello, angoli, tondo, sulQuadrante, sagomaLancetta, pernoLancette } from '../officina.js';
import { centra } from '../motore.js';

// ————————————————————————————— misure (mm) —————————————————————————————
const Z = { guida: 0, orlo: -.1, vetro: -.2, gola: -.55, bordoGola: -.3, rehaut: -.42, quadrante: -1.75, fianco: -5.35, fondo: -5.75, piastra: -6.3, corona: -3.2 };
const W = 10.5, XR = 8.9, RC = W - XR, HR = 16.1, HE = 14.9;              // guide (x XR…W, punte tonde a ±HR, raggio = larghezza), barre fino a ±HE
const APERTURA = [8.9, 13.55, .25];                                      // gola attorno all'orlo: semilati e raggio d'angolo
const QUADRANTE = { texture: '3d/lumen/rosa-quadrante.webp', raggio: 212 / 14.2, semi: [7.8, 12.45] };   // semi: sotto il rehaut
// lancette ferme sulle 10:09 della foto (quadrante ripulito da src/lumen3d/quadrante-rosa.py): [angolo °, quota, spessore, colmo, profilo]
// colmo basso (le due falde salgono di pochi gradi): con falde ripide una delle due specchia sempre il buio dello studio
const LANCETTE = [
  [144.9, .3, .12, .045, [[-.45, .34], [.7, .5], [2.1, .56], [3.5, .34], [4.6, .02]]],
  [38.3, .52, .1, .026, [[-.45, .3], [1.0, .33], [4.6, .27], [6.7, .12], [7.48, .02]]],
];
// linea mediana dell'anello [y, z] (anello.py sul profilo a 1,3 rad: z = −u / sin a, y × 0,9636 per la scala del quadrante),
// lisciata; attacchi alle anse rifatti a mano (prima maglia dritta) e raccordati senza flessi (le maglie rigide non bucano il fondo).
// Copia in 3d/lumen/rosa-anello.json
const LINEA = [
  [15, -3.3], [17, -3.45], [18.86, -4.66], [20.69, -5.97], [22.49, -7.44], [24.24, -9.1], [25.95, -10.92], [27.62, -12.87],
  [29.28, -14.89], [30.23, -17.44], [30.39, -20.09], [29.64, -22.63], [28.14, -24.88], [26.21, -26.82], [24.02, -28.47],
  [21.66, -29.86], [19.23, -31.14], [16.75, -32.28], [14.17, -33.16], [11.54, -33.9], [8.89, -34.56], [6.23, -35.1],
  [3.54, -35.41], [0.81, -35.58], [-1.92, -35.68], [-4.65, -35.67], [-7.36, -35.56], [-10.06, -35.27], [-12.73, -34.82],
  [-15.36, -34.2], [-17.93, -33.34], [-20.49, -32.37], [-22.99, -31.26], [-25.39, -29.91], [-27.69, -28.39], [-29.8, -26.63],
  [-31.56, -24.53], [-32.86, -22.11], [-33.55, -19.47], [-33.48, -16.78], [-32.61, -14.23], [-31.07, -11.99], [-28.93, -10.33],
  [-26.79, -8.74], [-24.68, -7.28], [-22.59, -6.01], [-20.52, -4.95], [-18.46, -4.07], [-16.4, -3.3], [-15, -3.3]];

// ————————————————————————————— sagome in pianta —————————————————————————————
const V2 = (x, y) => new THREE.Vector2(x, y);
// rettangolo con gli angoli tondi (antiorario), n segmenti per angolo; duri = i punti dove il lato dritto incontra l'arco
function rettTondo(hx, hy, r, n = 4) {
  const P = [], duri = [];
  const C = [[hx - r, -hy + r, -90], [hx - r, hy - r, 0], [-hx + r, hy - r, 90], [-hx + r, -hy + r, 180]];
  for (const [cx, cy, a0] of C) for (let i = 0; i <= n; i++) {
    const a = (a0 + 90 * i / n) * D2R; P.push(V2(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); duri.push(i === 0 || i === n);
  }
  return { P, duri };
}
// contorno di tutta la cassa (guide + barre, incavo fra le punte delle guide), antiorario: serve al fondo. muro = pareti dell'incavo
function sagomaCassa() {
  const P = [], duri = [], muro = [], NA = 6;
  const pt = (x, y, d, m = false) => { P.push(V2(x, y)); duri.push(d); muro.push(m); };
  const arco = (cx, cy, a0) => { for (let i = 1; i < NA; i++) { const a = (a0 + 90 * i / NA) * D2R; pt(cx + Math.cos(a) * RC, cy + Math.sin(a) * RC, false); } };
  pt(W, -(HR - RC), true); pt(W, HR - RC, true); arco(XR, HR - RC, 0); pt(XR, HR, true, true); pt(XR, HE, true); pt(-XR, HE, true, true); pt(-XR, HR, true);
  arco(-XR, HR - RC, 90); pt(-W, HR - RC, true); pt(-W, -(HR - RC), true); arco(-XR, -(HR - RC), 180);
  pt(-XR, -HR, true, true); pt(-XR, -HE, true); pt(XR, -HE, true, true); pt(XR, -HR, true); arco(XR, -(HR - RC), 270);
  return { P, duri, muro };
}
// sfalsamento verso l'interno di d, lato per lato (le pareti dell'incavo restano ferme)
const sfalsa = (S, d) => { if (!d) return S.P; const { ang, dist } = lati(S.P); return ruota(daLati(ang, dist.map((x, i) => x - (S.muro[i] ? 0 : d)))); };
// apertura rientrata di d (rettangolo tondo, raggio che cala col rientro)
const apertura = d => rettTondo(APERTURA[0] - d, APERTURA[1] - d, Math.max(.2, APERTURA[2] - .5 * d), 4);
// sezione di una guida [u (dal fianco verso l'interno), z]: smusso del fondo, fianco, filo inciso (il bordo del pannello piatto del fianco,
// la riga scura della foto di profilo), dorso tondo (colmo a metà), parete verso la gola
const GUIDA = [[.42, Z.fondo], [0, Z.fianco], [0, -1.0], [.07, -.93], [0, -.86], [0, -.6], [.04, -.42], [.13, -.26], [.3, -.12], [.52, -.04], [.8, Z.guida],
  [1.08, -.04], [1.3, -.12], [1.47, -.26], [1.56, -.42], [RC, -.6], [RC, Z.fondo]];
const GUIDA_DURI = new Set([0, 1, 2, 3, 4, 15, 16]);

// ————————————————————————————— cassa —————————————————————————————
// a gradini come nella foto: guide tonde lucide sui lati lunghi (le più alte), barre tonde alle testate, gola scura, orlo del vetro,
// rehaut satinato, quadrante. Dietro: fondo satinato, piastra con il bisello lucido e 4 viti. Anse con la vite sul fianco.
function cassa(O) {
  const S = sagomaCassa();
  // guide: la sezione percorre il fianco e gira attorno alle punte (quarto di giro attorno allo spigolo interno)
  for (const sx of [1, -1]) {
    const R = [], giri = [];
    for (let i = 0; i <= 8; i++) giri.push([-(HR - RC), -90 + 90 * i / 8]);
    for (let i = 0; i <= 8; i++) giri.push([HR - RC, 90 * i / 8]);
    for (const [cy, g] of giri) {
      const a = g * D2R, c = Math.cos(a), sn = Math.sin(a);
      R.push(GUIDA.map(([u, z]) => v(sx * (XR + (RC - u) * c), cy + (RC - u) * sn, z)));
    }
    if (sx < 0) R.forEach(r => r.reverse());
    const dur = j => GUIDA_DURI.has(sx > 0 ? j : GUIDA.length - 1 - j);
    O.loft(R, { chiuso: false, liscioV: true, duri: dur, capoA: 'cassa', capoB: 'cassa',
      mat: (i, j) => { const jj = sx > 0 ? j : GUIDA.length - 2 - j; return jj === 0 ? ['cassa', .8] : jj === 2 || jj === 3 ? ['cassa', .35] : jj === 15 ? ['cassa', .6] : 'cassa'; } });
  }
  // apertura, dal quadrante verso l'esterno: rehaut satinato, parete dell'orlo, orlo bombato, smusso, fondo della gola, parete della gola
  // (sui lati lunghi la parete della gola è il fianco interno delle guide: lì niente facce doppie)
  const ap = [[1.3, Z.quadrante + .02], [.8, Z.rehaut], [.8, -.15], [.5, Z.orlo], [.25, -.14], [.12, Z.gola], [0, Z.gola], [0, Z.bordoGola]];
  const A0 = apertura(0), RA = ap.map(([d, z]) => in3(apertura(d).P, z));
  const matA = [['sat', .72], ['luc', .6], 'cassa', 'cassa', ['luc', .8], ['luc', .35], ['luc', .5]];
  O.loft(RA, { duri: j => A0.duri[j], liscioV: true, duriV: i => i !== 3, mat: (i, j, f) => i === 6 && Math.abs(f.x) > .999 ? null : matA[i] });
  // barre alle testate: dorso tondo dalla gola alla testata, testata piatta fino al fondo; angolini fra gola e guide; chiusure contro le guide
  const prof = [[13.55, Z.bordoGola], [13.62, -.16], [13.8, -.08], [14.05, -.05], [14.35, -.09], [14.6, -.2], [14.78, -.38], [14.88, -.6], [14.9, -.85],
    [14.9, -1.3], [14.9, Z.fianco], [14.48, Z.fondo]];
  const r0 = APERTURA[2], nA = 4;
  for (const sy of [1, -1]) {
    const lato = x => prof.map(([y, z]) => v(x, sy * y, z));
    O.loft(sy > 0 ? [lato(-XR), lato(XR)] : [lato(XR), lato(-XR)], { chiuso: false, liscioV: true, duri: j => j === 0 || j >= 9,
      mat: (i, j) => j === 10 ? ['cassa', .8] : 'cassa' });
    for (const sx of [1, -1]) {
      const ang = Array.from({ length: nA + 1 }, (_, k) => k / nA * Math.PI / 2);
      const Q = [V2(XR, 13.55), ...ang.map(a => V2(XR - r0 + r0 * Math.cos(a), 13.55 - r0 + r0 * Math.sin(a)))].map(p => V2(sx * p.x, sy * p.y));
      O.tappo('cassa', Q, [], Z.bordoGola, true, v(1, 0, 0));
      const F = [[12.45, -1.3], [12.45, Z.bordoGola], ...prof.slice(0, 10)].map(([y, z]) => v(sx * XR, sy * y, z));
      for (let k = 1; k < F.length - 1; k++) O.tri('cassa', F[0], F[k], F[k + 1], v(0, 1, 0), .6, v(sx, 0, 0));
    }
  }
  // retro: fondo satinato, piastra rialzata con gli angoli smussati (bisello lucido), 4 viti
  const PL0 = [[8.55, -11.95], [8.55, 11.95], [7.65, 12.85], [-7.65, 12.85], [-8.55, 11.95], [-8.55, -11.95], [-7.65, -12.85], [7.65, -12.85]].map(([x, y]) => V2(x, y));
  const PL1 = rientra(PL0, .35);
  O.tappo('sat', sfalsa(S, .42), [PL0.slice().reverse()], Z.fondo, false, v(0, 1, 0), .9);
  O.fascia('cassa', in3(PL0, Z.fondo), in3(PL1, Z.piastra), { inverti: true });   // bisello lucido (girato verso fuori: prima era rivolto dentro e si vedeva il vuoto, una fessura nera)
  O.tappo('sat', PL1, [], Z.piastra, false, v(0, 1, 0));
  for (const [x, y, g] of [[7.25, 11.55, .5], [-7.25, 11.55, 1.2], [-7.25, -11.55, .3], [7.25, -11.55, 1.0]])
    vite(O, posa(v(x, y, Z.piastra), v(0, 0, -1), g), { r: .55, h: .2, taglio: .11 });
  // anse: blocchi lucidi tondi fra le guide e il bracciale, vite del perno sul fianco esterno (oltre la punta della guida)
  for (const sy of [1, -1]) for (const sx of [1, -1]) {
    cuscino(O, new THREE.Matrix4().makeTranslation(sx * 7.68, sy * 16.1, 0), 0, { w: 2.34, l: 3.0, rp: .6, r: .45, zt: -.4, zb: -4.9, dir: v(0, 1, 0) });
    vite(O, posa(v(sx * 8.85, sy * 16.85, -2.8), v(sx, 0, 0), .4 + sx * sy), { r: .42, h: .15, taglio: .09 });
  }
}

// ————————————————————————————— corona —————————————————————————————
// lungo +x: colletto, presa a 12 costole tonde (valli strette), faccia piana, cabochon a cupola lucido
function coronaRosa(O) {
  const n = 12, st = 8, N = n * st, angs = Array.from({ length: N }, (_, q) => q / N * TAU);
  const costola = (R, k) => angs.map(a => R * (1 - k * (1 - Math.pow(Math.abs(Math.sin(n * a / 2)), .45))));
  const ring = (x, rs) => angs.map((a, j) => { const r = typeof rs === 'number' ? rs : rs[j]; return v(x, r * Math.cos(a), r * Math.sin(a)); });
  const cup = [[13.3, .04], [13.25, .58], [13.08, 1.05], [12.82, 1.4], [12.5, 1.6], [12.38, 1.63]];   // cupola del cabochon
  const R = [...cup.map(([x, r]) => ring(x, r)),
    ring(12.38, 2.12), ring(12.3, costola(2.36, .07)), ring(12.15, costola(2.45, .08)), ring(11.1, costola(2.45, .08)),
    ring(10.95, costola(2.3, .07)), ring(10.9, 1.6), ring(10.6, 1.6), ring(10.6, 1.25), ring(10.2, 1.25)];
  const mat = ['cassa', 'cassa', 'cassa', 'cassa', 'cassa', ['cassa', .7], 'cassa', 'cassa', 'cassa', 'cassa', ['cassa', .5], 'cassa', ['cassa', .6], ['cassa', .4]];
  O.loft(R, { mat: i => mat[i], liscioV: true, duriV: i => i >= 5,
    m: new THREE.Matrix4().makeTranslation(0, 0, Z.corona) });
}

// ————————————————————————————— bracciale a cinque file —————————————————————————————
// chicco di riso (è tondo davvero: normali morbide), anelli in pianta dal colmo al fondo nel riferimento locale
// (x largo, y lungo la linea, z fuori dall'anello). prof = [[rientro x, rientro y, z], …]; piega = angolo con le vicine (rientro del fondo)
function magliaTonda(O, m, x0, pianta, w, l, prof, piega, col, k = 'maglia', kFondo = 'sat') {
  const t = Math.tan(piega / 2) * 1.15;
  const R = prof.map(([dx, dy, z]) => {
    const dxx = Math.min(dx, w / 2 - .15), dyy = Math.min(dy + (z < 0 ? -z * t : 0), l / 2 - .2);
    return pianta(w - 2 * dxx, l - 2 * dyy, Math.min(dxx, dyy)).map(([x, y]) => v(x0 + x, y, z));
  });
  O.loft(R, { liscioV: true, mat: i => [k, col[i] ?? col.at(-1)], capoA: k, capoB: [kFondo, .75], m });
}
// chicco di riso: ellisse un po' appuntita (esponente < 2 sulla lunghezza), 14 punti
const piantaChicco = (w, l) => Array.from({ length: 14 }, (_, i) => { const a = i / 14 * TAU, c = Math.cos(a), s = Math.sin(a); return [w / 2 * Math.sign(c) * Math.pow(Math.abs(c), .85), l / 2 * Math.sign(s) * Math.pow(Math.abs(s), 1.15)]; });
// cupola del chicco: quarto di superellisse (esponente 2,4) dal colmo al fianco dritto, rientro massimo fx di traverso e fy in lungo;
// z1 = attacco al fianco, hd = altezza della cupola, zb = fondo. Il chicco è bombato su tutta la larghezza, come nella foto
function cupola(fx, fy, z1, hd, zb) {
  const e = 2 / 2.4, R = [89, 80, 60, 40, 20, 0].map(t => { const c = Math.pow(Math.cos(t * D2R), e), s = Math.pow(Math.sin(t * D2R), e); return [(1 - c) * fx, (1 - c) * fy, z1 + hd * s]; });
  return [...R, [0, 0, zb + .35], [.28, .28, zb]];
}
const COL = [1, 1, 1, 1, 1, 1, .8, .6];

// vite piccola dei perni (fianco delle maglie di bordo): testa a cupola lucida a 8 lati e taglio scuro che segue la cupola.
// Nella foto sono teste chiare col taglio, non buchi: niente disco nero (quello dava i "puntini")
const A8 = angoli(45 * D2R);
function vitina(O, m, { r = .3, h = .1, taglio = .07, k = 'maglia' } = {}) {
  const Z = [[.02, h], [r * .62, h * .78], [r, h * .25], [r, -.06]];
  O.loft(Z.map(([rr, z]) => anello(tondo(rr), z, A8)), { liscioV: true, duriV: i => i === 2, mat: k, m });
  const quota = x => { const a = Math.abs(x); return a < r * .62 ? h - (h - h * .78) * a / (r * .62) : h * .78 - (h * .78 - h * .25) * (a - r * .62) / (r * .38); };
  const xs = [-.85, -.4, 0, .4, .85].map(t => t * r);
  for (let i = 0; i < xs.length - 1; i++) {
    const [a, b] = [xs[i], xs[i + 1]], P = [v(a, -taglio / 2, quota(a) + .012), v(b, -taglio / 2, quota(b) + .012), v(b, taglio / 2, quota(b) + .012), v(a, taglio / 2, quota(a) + .012)].map(q => q.applyMatrix4(m));
    O.quad('nero', P[0], P[1], P[2], P[3], P[1].clone().sub(P[0]), 1, v(0, 0, -1).applyMatrix4(m));
  }
}

// cuscino netto (maglie di centro e di bordo, anse, coperchio della chiusura): piano lucido PIATTO in cima, spalla tonda stretta
// (quarto di cerchio r, normali esatte), fianchi dritti, smusso sotto, fondo piatto. Pianta = rettangolo con gli angoli tondi rp (≥ r:
// gli archi di ogni anello sono concentrici, così la spalla è una vera superficie di raccordo). Come nella foto del bracciale:
// il piano grande prende un solo riflesso, la luce corre sulle spalle. rb > 0 = spalla tonda anche sotto (corpo della chiusura).
// riferimento locale: x largo, y lungo la linea, z fuori dall'anello; piega = angolo con le vicine (il fondo rientra alle testate)
function rettTondoN(hx, hy, rc, n = 3) {
  const P = [], N = [];
  for (const [sx, sy, a0] of [[1, -1, -90], [1, 1, 0], [-1, 1, 90], [-1, -1, 180]]) {
    const cx = sx * (hx - rc), cy = sy * (hy - rc);
    for (let i = 0; i <= n; i++) { const a = (a0 + 90 * i / n) * D2R, c = Math.cos(a), s = Math.sin(a); P.push([cx + c * rc, cy + s * rc]); N.push([c, s]); }
  }
  return { P, N };
}
const SPALLA = [90, 67.5, 45, 22.5, 0];
// bombatura del piano delle maglie (gradi alle testate): con il piano piatto a specchio metà del bracciale specchiava il buio dello studio
const BOMBA = 18;
function cuscino(O, m, x0, { w, l, rp, r, zt, zb, rb = 0, piega = 0, k = 'maglia', kPiano = k, kFianco = k, kFondo = 'sat', colFondo = .75, dir = v(1, 0, 0), bomba = BOMBA }) {
  const t = Math.tan(piega / 2) * 1.15, nm = new THREE.Matrix3().getNormalMatrix(m), Y = l / 2 - r;
  // anello a rientro d e quota z; ang = inclinazione della normale (90 = su, 0 = di lato, −90 = giù).
  // bomba (gradi): il piano è bombato in lungo come nella foto (normali inclinate fino a ±bomba alle testate, 0 in mezzo):
  // la bombatura vera è di pochi decimi di mm, la sagoma resta netta; la spalla la raccorda (peso sin ang)
  const anello = (d, z, ang) => {
    const hx = w / 2 - d, hy = Math.max(.25, l / 2 - d - (z < 0 ? -z * t : 0)), rc = Math.max(.04, Math.min(rp - d, hx - .01, hy - .01));
    const { P, N } = rettTondoN(hx, hy, rc), c = Math.cos(ang * D2R), s = Math.sin(ang * D2R);
    const Nb = N.map(([nx, ny], j) => {
      const b = -bomba * D2R * clamp(P[j][1] / Y, -1, 1) * Math.max(0, s), cb = Math.cos(b), sb = Math.sin(b), y = ny * c, zz = s;
      return v(nx * c, y * cb - zz * sb, y * sb + zz * cb).applyMatrix3(nm).normalize();
    });
    return { P: P.map(([x, y]) => v(x0 + x, y, z).applyMatrix4(m)), N: Nb, z };
  };
  const striscia = (A, B, col, kk = k, NA = A.N, NB = B.N) => {
    const n = A.P.length;
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n, P = [A.P[j], A.P[j1], B.P[j1], B.P[j]], N = [NA[j], NA[j1], NB[j1], NB[j]];
      const f = N[0].clone().add(N[1]).add(N[2]).add(N[3]).normalize(), T = new THREE.Vector3().subVectors(P[1], P[0]);
      const U = P.map(p => [p.x, p.y]);
      O.triN(kk, [P[0], P[1], P[2]], [N[0], N[1], N[2]], [U[0], U[1], U[2]], [T, T, T], f, col);
      O.triN(kk, [P[0], P[2], P[3]], [N[0], N[2], N[3]], [U[0], U[2], U[3]], [T, T, T], f, col);
    }
  };
  const tappo = (A, kk, su, col) => {
    const c = A.P.reduce((s, p) => s.add(p), v(0, 0, 0)).multiplyScalar(1 / A.P.length), n = v(0, 0, su ? 1 : -1).applyMatrix3(nm).normalize(), d = dir.clone().transformDirection(m);
    if (su && bomba) {
      // piano bombato: normali per vertice (quelle dell'anello in cima, il centro dritto)
      for (let j = 0; j < A.P.length; j++) { const j1 = (j + 1) % A.P.length, T = new THREE.Vector3().subVectors(A.P[j1], A.P[j]); O.triN(kk, [c, A.P[j], A.P[j1]], [n, A.N[j], A.N[j1]], [[c.x, c.y], [A.P[j].x, A.P[j].y], [A.P[j1].x, A.P[j1].y]], [T, T, T], n, col); }
      return;
    }
    for (let j = 0; j < A.P.length; j++) O.tri(kk, c, A.P[j], A.P[(j + 1) % A.P.length], d, col, n);
  };
  const sopra = SPALLA.map(a => anello(r * (1 - Math.cos(a * D2R)), zt - r + r * Math.sin(a * D2R), a));
  for (let i = 0; i < sopra.length - 1; i++) striscia(sopra[i], sopra[i + 1], 1);
  const base = sopra.at(-1);
  if (rb > 0) {
    const sotto = SPALLA.slice().reverse().map(a => anello(rb * (1 - Math.cos(a * D2R)), zb + rb - rb * Math.sin(a * D2R), -a));
    striscia(base, sotto[0], .9, kFianco);
    for (let i = 0; i < sotto.length - 1; i++) striscia(sotto[i], sotto[i + 1], .8);
    tappo(sotto.at(-1), kFondo, false, colFondo);
  } else {
    // fianco dritto (normali orizzontali), smusso di .16 a 45°, fondo piatto satinato di traverso
    const f1 = anello(0, zb + .16, 0), f0 = anello(.16, zb, -45), f1b = anello(0, zb + .16, -45);
    striscia(base, f1, .9, kFianco);
    striscia(f1b, f0, .6);
    tappo(f0, kFondo, false, colFondo);
  }
  tappo(sopra[0], kPiano, true, 1);
}
// file: [x del centro, larghezza, tipo]; bordo e centro allineati, chicchi sfalsati di mezzo passo
const FILE = [[0, 3.24, 'centro'], [2.6, 1.84, 'chicco'], [-2.6, 1.84, 'chicco'], [4.8, 2.44, 'bordo'], [-4.8, 2.44, 'bordo']];

function bracciale(O) {
  const Pc = percorso(LINEA), lung = Pc.lung;
  const sc = Pc.trova(-1.3, -30), LCH = 7.8, sA = sc - LCH / 2 - .15, sB = sc + LCH / 2 + .15;
  const passo = 7.6, gioco = .16;
  const rif = s => { const { C, T, N, X } = Pc.rif(s); return { C, T, N, X, m: new THREE.Matrix4().makeBasis(X, T, N).setPosition(C) }; };
  const piega = (s, L) => Pc.rif(s - L / 2).T.angleTo(Pc.rif(s + L / 2).T);
  for (const [s0, s1] of [[.15, sA], [sB, lung - .15]]) {
    const n = Math.max(1, Math.round((s1 - s0) / passo)), P = (s1 - s0) / n;
    const dritti = Array.from({ length: n }, (_, i) => [s0 + (i + .5) * P, P - gioco]);
    const tagli = [s0]; for (let x = s0 + P / 2; x < s1 - .01; x += P) tagli.push(x); tagli.push(s1);
    const sfasati = tagli.slice(0, -1).map((a, i) => [(a + tagli[i + 1]) / 2, tagli[i + 1] - a - gioco]);
    for (const [x0, w, tipo] of FILE) for (const [s, L] of tipo === 'chicco' ? sfasati : dritti) {
      const { m, T } = rif(s), fi = piega(s, L);
      if (tipo === 'chicco') magliaTonda(O, m, x0, piantaChicco, w, L, cupola(w / 2, L / 2 * .55, .45, 1.35, -1.25), fi, COL);
      else cuscino(O, m, x0, { w, l: L, rp: tipo === 'bordo' ? 1.0 : .9, r: tipo === 'bordo' ? .55 : .5, zt: 2.1, zb: -1.95, piega: fi });
      if (tipo === 'bordo') {
        // viti dei perni sul fianco esterno delle maglie di bordo (due per maglia, come nel profilo e nel retro)
        const sx = Math.sign(x0), n3 = v(sx, 0, 0);
        for (const yy of [-L / 2 + 1.15, L / 2 - 1.15]) {
          const p = new THREE.Vector3(x0 + sx * w / 2, yy, .15).applyMatrix4(m), u = new THREE.Vector3().crossVectors(n3, T);
          vitina(O, new THREE.Matrix4().makeBasis(T, u, n3).setPosition(p), { r: .3, h: .1 });
        }
      }
    }
  }
  // sotto le due file di chicchi: una fascia sottile rientrata (lo strato che regge le maglie), chiude i vuoti a V fra le punte dei chicchi
  // e le maglie vicine (nella foto sono ombre, non buchi). Di fuori si vede solo nelle fessure (scura), di dentro è rientrata di .25 mm
  for (const sx of [1, -1]) for (const [s0, s1] of [[.15, sA], [sB, lung - .15]]) {
    const x0 = sx * 2.6 - 1.05, x1 = sx * 2.6 + 1.05, sez = [[x0, -1.45], [x0, -1.05], [x1, -1.05], [x1, -1.45]];
    lungo(O, Pc, s0, s1, sez, { passi: 56, duri: () => true, mat: (i, j) => j === 1 ? ['sat', .3] : j === 3 ? ['sat', .7] : ['sat', .45] });
  }
  chiusura(O, rif, sc, LCH);
}
// chiusura: coperchio a placca lucido largo quanto il bracciale (fuori), lama déployante satinata dentro l'anello
function chiusura(O, rif, sc, LCH) {
  const { m } = rif(sc);
  cuscino(O, m, 0, { w: 12.5, l: LCH, rp: 1.0, r: .6, zt: 2.05, zb: -1.95 });   // coperchio: piastra lucida a facce piane, a filo delle maglie
  // corpo della déployante sotto il coperchio, dentro l'anello (nel profilo della foto: piastra dritta con gli angoli tondi lunga 11 mm,
  // più lunga del coperchio, che sporge poco sotto le maglie): cuscino coricato, i due fianchi sono le sue facce piane (x)
  const D = 1.3, zc = -1.97 - D / 2, coricato = new THREE.Matrix4().makeBasis(v(0, 0, -1), v(0, 1, 0), v(1, 0, 0)).setPosition(0, 0, 0);
  cuscino(O, m.clone().multiply(coricato), -zc, { w: D, l: 11, rp: 1.1, r: .35, rb: .35, zt: 5.2, zb: -5.2, bomba: 0, kPiano: 'sat', kFianco: 'sat', colFondo: .9 });
}

// ————————————————————————————— quadrante —————————————————————————————
// lancetta a foglia con il colmo (da officina.lancetta, sezione con i fianchi dritti e due falde basse): prof = [[t, larghezza], …]
// il colmo cala con la larghezza: le falde hanno la stessa pendenza dalla base alla punta (niente pieghe a metà lancetta)
function lancetta(O, { ang, z, h, colmo, prof, k = 'lancM', kSotto = 'luc' }) {
  const wMax = Math.max(...prof.map(p => p[1]));
  const R = prof.map(([t, w]) => { const c = colmo * w / wMax; return [[-.5, 0], [-.5, h - colmo], [0, h - colmo + c], [.5, h - colmo], [.5, 0]].map(([x, y]) => v(x * w, y, t)); });
  O.loft(R, { duri: () => true, mat: (i, j, f) => f.y < -.9 ? [kSotto, .5] : j === 0 || j === 3 ? [k, .8] : k, capoA: k, capoB: k, m: sulQuadrante(ang * D2R, 0, z) });
}
async function quadrante(O, motore) {
  const z = Z.quadrante, ombre = [];
  for (const [ang, dz, h, colmo, prof] of LANCETTE) {
    const L = { ang, z: z + dz, h, colmo, prof };
    lancetta(O, L); ombre.push({ punti: sagomaLancetta(L), alto: dz + h, forza: .4 });
  }
  pernoLancette(O, [[.97, z, z + .28, 'lancM'], [.45, z + .5, z + .74, 'lancM'], [.14, z + .72, z + .78, 'nero']]);   // disco sotto, cappuccio sopra le lancette
  ombre.push({ punti: Array.from({ length: 24 }, (_, i) => [Math.cos(i / 24 * TAU) * .97, Math.sin(i / 24 * TAU) * .97]), alto: .6, forza: .35 });
  const disco = await motore.quadrante({ texture: QUADRANTE.texture, raggio: QUADRANTE.raggio, z, ombre });
  // quadrante rettangolare: stesso materiale (foto e ombre), il disco diventa un rettangolo con le uv del disco
  const [hx, hy] = QUADRANTE.semi, R = QUADRANTE.raggio;
  disco.geometry = motore.geometria(`rosa-quadrante|${hx}|${hy}|${R}`, () => {
    const g = new THREE.PlaneGeometry(2 * hx, 2 * hy), p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * R) + .5, p.getY(i) / (2 * R) + .5);
    return g;
  });
  return disco;
}

export default {
  id: 'rosa',
  nome: 'Rosa',
  // viste delle foto per lumen-orto / sovrapponi: il profilo è di tre quarti (quadrante di sbieco), il retro dall'alto con la corona in alto
  viste: { fronte: [0, 0], profilo: [1.3, 0], retro: [Math.PI - 0.68, -0.1, 90] },
  async costruisci(ctx) {
    const { motore } = ctx;
    const O = new Officina();
    cassa(O); coronaRosa(O); bracciale(O);
    const disco = await quadrante(O, motore);
    const gruppo = new THREE.Group(); gruppo.name = 'rosa';
    // lucido "morbido" per le maglie (ruvidità .18, env 1,3): sotto lo studio buio lo specchio puro (.07) resta nero su tutto ciò
    // che non guarda un pannello. Cassa e corona: stesso lucido più chiaro (env 2): nella foto guide e orlo sono quasi bianchi.
    // Lancette: env 3 (argento chiaro come nella foto; con .16 e l'env di serie restavano grigio scuro sul rosa)
    const lucM = motore.materiale('acciaio.luc', { ruvido: .18, env: 1.3 });
    const cassaM = motore.materiale('acciaio.luc', { ruvido: .2, env: 2 });
    const lancM = motore.materiale('acciaio.lanc', { ruvido: .2, env: 3 });
    gruppo.add(O.mesh(motore.ruoli('acciaio', { maglia: lucM, cassa: cassaM, lancM })));
    gruppo.add(disco);
    // vetro piatto rettangolare sotto l'orlo
    const gv = motore.geometria('rosa-vetro', () => new THREE.BoxGeometry(16.5, 25.8, .25));
    const vetro = new THREE.Mesh(gv, motore.materiale('vetro', { forza: 1 }));
    vetro.position.z = Z.vetro - .125; vetro.renderOrder = 2; vetro.name = 'vetro';
    gruppo.add(vetro);
    // stessa inquadratura del Verde: nella giostra gli orologi stanno alla loro grandezza vera
    return { gruppo, ingombro: centra(gruppo), inquadratura: { altezza: 94, larghezza: 70 } };
  },
};
