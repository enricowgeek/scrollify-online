// Lumen 3D · modello "Abisso Bianco" (subacqueo in ceramica bianca, lunetta girevole a tacche, bracciale a tre file col centro zigrinato,
// chiusura déployante, fondello in acciaio). Tutto a facce piane e spigoli vivi: piani opachi, smussi lucidi (ceramica-bianca.opaca / .lucida).
// Revisione: maglie laterali in un pezzo a gradino (non più due scatole), ceramica meno bruciata (CERAMICA), fondello satinato a cerchi,
// viti senza nero, guardie a cuneo, fila centrale più profonda, smussi larghi su anse, maglie e passante, cerniera nascosta e leva della chiusura.
//
// ————————————————————————————— misure dalle foto (src/orologi/abisso-bianco) —————————————————————————————
// Fronte: 13,0 px/mm (lunetta Ø 44 mm), centro del quadrante (622, 527) px, perno delle lancette (622, 522) (è più alto: prospettiva).
//   quadrante: indici r 10,5–14,7 mm, largh. 2,73 (6: 10,2–14,9 × 2,85; 12 a Y: 9,3–14,6, testa 5,46 → gambo 2,7); rehaut 14,8–15,9;
//   smusso lucido 15,9–17,6; piano della lunetta 17,6–21,5 con i rilievi 17,9–21,2 × 1,5 ogni 5 minuti, triangolo alle 12 (4 × 3,3) con la
//   perla di lume; tacche incise ogni minuto da 1 a 14; bordo a denti fino a 22,4.
//   lancette (foto, angoli matematici): ore 147,2° (10,1 mm, freccia), minuti 35,1° (14,6 mm, spada), secondi 226,6° (15,1 mm, cerchio a 8 mm).
//   sagoma (mezza larghezza x per quota y): anse 14,0 @ ±25,3 → 18,3 @ ±15,8 (viti in alto a ±15,3, ±20,0); paracolpi a ±29° fino a r 24,8;
//   guardie della corona e blocchi a ore 9: y ±3,1…±8,4, fino a x 25,8; corona 7,3 mm, dalla cassa a x 28,2; ore 9: x 24,1 per |y| < 2,7.
// Profilo: 13,0 px/mm, girato di 0,13 rad verso il quadrante (si vede il vetro di sbieco); riferimento = bordo alto della lunetta (x 225 px).
//   spessori (z): vetro 0, lunetta −0,35, fondo lunetta −3,0, corona −6,7, cassa fino a −14,0, fondello fino a −15,5; anse che scendono
//   da −2,9 a −7,6 fra y 22,2 e 25,8; bracciale spesso 4,6; anello (linea mediana): anello.py dava uno zig-zag, rifatto a mano sulla foto
//   (24 punti), alzato di 1 mm (la vista è girata: col bordo della lunetta come riferimento veniva 1 mm troppo in fondo) e prolungato
//   dentro le anse (un punto per parte) perché le prime maglie escano da sotto l'ansa. Copia in 3d/lumen/abisso-bianco-anello.json.
//   Chiusura dalla parte opposta alla cassa: coperchio a y ≈ +8 (8,5 mm) con la placca in rilievo, lama da y +5 a −15, cerniera a −1,8.
//   (Il retro la mostra più corta del profilo: compromesso fra le due foto.)
// Retro: 13,7 px/mm; piastra d'acciaio ottagonale con 4 viti, disco a raggiera Ø 28, altre 4 viti nella ceramica del fondo.
// Foto AI incoerenti fra loro: la fronte fa fede per x/y, il profilo per spessori e anello. Di fronte il bracciale sotto la cassa scende
// fino a y −46 mm, di profilo l'anello arriva a −36,8: il modello segue il profilo (sagoma di fronte fra le anse IoU 0,975, intera 0,886).
import * as THREE from 'three';
import { Officina, v, D2R, daLati, lati, ruota, cerchio, cerchio2, anello, angoli, tondo, percorso, posa, pernoLancette } from '../officina.js';
import { centra } from '../motore.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const Z = {
  vetro: 0, lunTop: -.35, lunSm: -.72, lunBase: -3.0, rehaut: -1.55, lunBisello: -1.55, quadrante: -3.3,
  casTop: -3.0, ansa: -2.9, ansaFine: -7.6, guardia: -2.4, paracolpi: -3.9, casFondo: -14.0, piastra: -14.8, corona: -6.7,
};
const R = { lunInt: 17.6, lunEst: 21.45, lunFianco: 21.85, denti: 22.35, rehaut: 16.0, quadrante: 14.8 };
// linea mediana dell'anello [y, z] (foto di profilo, 13 px/mm), dall'ansa in alto all'ansa in basso
const LINEA = [[21.2, -13.2], [24.85, -15.94], [27.85, -20.02], [29.46, -25.02], [29.92, -30.4], [29.23, -36.17], [27.31, -41.94], [23.62, -47.32], [19.23, -51.55],
  [14.23, -54.86], [8.08, -57.32], [1.92, -58.48], [-3.46, -58.86], [-8.08, -59.02], [-13.46, -58.32], [-18.46, -56.55], [-23.08, -53.48],
  [-27.31, -49.25], [-30.77, -43.86], [-33.08, -38.09], [-34.08, -31.94], [-33.46, -25.78], [-31.54, -20.78], [-28.46, -16.71], [-27.15, -15.4], [-23.4, -13.0]]
  .map(([y, z]) => [y, z + 1.0]);

// ————————————————————————————— attrezzi (varianti di officina.js, solo per questo modello) —————————————————————————————
// quadrilatero con la normale dalla parte di 'verso' (l'ordine dei punti non conta)
function Q(O, k, a, b, c, d, verso, col = 1, dir = null) {
  const n = new THREE.Vector3().subVectors(c, a).cross(new THREE.Vector3().subVectors(d, b)), D = dir ?? b.clone().sub(a);
  if (n.dot(verso) < 0) O.quad(k, d, c, b, a, D, col); else O.quad(k, a, b, c, d, D, col);
}
const area = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
const ccw = P => area(P) < 0 ? P.slice().reverse() : P;
// sfalsamento per lato (d numero o lista): come rientra() dell'officina, ma un lato può restare dov'è (d = 0)
function rientraLati(P, d) { const { ang, dist } = lati(P); return ruota(daLati(ang, dist.map((x, i) => x - (typeof d === 'number' ? d : d[i])))); }
const IDENT = (x, y, z) => v(x, y, z);
// faccia piana (o su un piano z = f(x, y)) con buchi; W porta i punti locali nel mondo
function faccia(O, k, P, buchi, z, verso, { col = 1, dir = v(1, 0, 0), W = IDENT } = {}) {
  const tris = THREE.ShapeUtils.triangulateShape(P.slice(), buchi.map(b => b.slice()));
  const tutti = P.concat(...buchi), Zf = typeof z === 'function' ? z : () => z;
  for (const t of tris) {
    const [A, B, C] = t.map(i => W(tutti[i].x, tutti[i].y, Zf(tutti[i].x, tutti[i].y)));
    O.tri(k, A, B, C, dir, col, verso);
  }
}
// prisma a facce piane: poligono P (antiorario) da zb a zt (numero o piano f(x, y)); smusso in alto s × h per lato
// (s lista: 'x' = lato di giunzione con un altro prisma: né smusso né fianco); giu = il "piano" guarda in basso (fondelli)
function prisma(O, P, zb, zt, o = {}) {
  const { s = .4, h = .4, kTop = 'cer', kSm = 'cerL', kLato = 'cer', colLato = .74, colTop = 1, giu = false, dir = null, fondo = false } = o;
  P = ccw(P);
  const n = P.length, Zt = typeof zt === 'function' ? zt : () => zt, up = giu ? -1 : 1;
  const sl = Array.from({ length: n }, (_, i) => Array.isArray(s) ? s[i] : s);
  const Pi = rientraLati(P, sl.map(x => x === 'x' ? 0 : x));
  faccia(O, kTop, Pi, [], Zt, v(0, 0, up), { col: colTop, dir: dir ?? v(1, 0, 0) });
  for (let i = 0; i < n; i++) {
    if (sl[i] === 'x') continue;
    const j = (i + 1) % n, a = P[i], b = P[j], e = b.clone().sub(a), no = v(e.y, -e.x, 0).normalize();
    const hh = sl[i] > 0 ? h : 0, ai = Pi[i], bi = Pi[j];
    const A1 = v(a.x, a.y, Zt(a.x, a.y) - up * hh), B1 = v(b.x, b.y, Zt(b.x, b.y) - up * hh);
    if (hh > 0) Q(O, kSm, A1, B1, v(bi.x, bi.y, Zt(bi.x, bi.y)), v(ai.x, ai.y, Zt(ai.x, ai.y)), no.clone().setZ(up), 1, e3(e));
    Q(O, kLato, v(a.x, a.y, zb), v(b.x, b.y, zb), B1, A1, no, colLato, e3(e));
  }
  if (fondo) faccia(O, kLato, P, [], zb, v(0, 0, -up), { col: .4 });
}
const e3 = e => v(e.x, e.y, 0);
// pezzo applicato con cornice e finestre di lume (indici, lancette): P contorno locale (x di traverso, y lungo il pezzo),
// W(x, y, z) → mondo, h altezza; smusso bev dalla metà del fianco; senza finestre il piano è kTop
function cornice(O, W, P, finestre, h, { bev = .14, hs = .5, kC = 'lanc', kL = 'lume', kTop = kC, colLato = .7, fondoLume = .72 } = {}) {
  P = ccw(P);
  const Pb = rientraLati(P, bev), n = P.length, o0 = W(0, 0, 0), D = (x, y, z) => W(x, y, z).sub(o0);
  const su = D(0, 0, 1).normalize();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = P[i], b = P[j], e = b.clone().sub(a), no = D(e.y, -e.x, 0).normalize();
    Q(O, kC, W(a.x, a.y, 0), W(b.x, b.y, 0), W(b.x, b.y, h * hs), W(a.x, a.y, h * hs), no, colLato);
    Q(O, kC, W(a.x, a.y, h * hs), W(b.x, b.y, h * hs), W(Pb[j].x, Pb[j].y, h), W(Pb[i].x, Pb[i].y, h), no.clone().add(su));
  }
  const F = finestre.map(ccw);
  faccia(O, kTop, Pb, F, h, su, { W });
  for (const L of F) {
    const m = L.length, hl = h * fondoLume;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, a = L[i], b = L[j], e = b.clone().sub(a), dentro = D(-e.y, e.x, 0).normalize();
      Q(O, kC, W(a.x, a.y, h), W(b.x, b.y, h), W(b.x, b.y, hl), W(a.x, a.y, hl), dentro, .55);
    }
    faccia(O, kL, L, [], hl, su, { W });
  }
}
// riferimento di un pezzo sul quadrante: x di traverso (orario), y lungo il raggio phi (gradi), z in su dalla quota z0
const Wq = (phi, z0) => { const c = Math.cos(phi * D2R), s = Math.sin(phi * D2R); return (x, y, z) => v(c * y + s * x, s * y - c * x, z0 + z); };
// vite a testa cilindrica con esagono incassato e rondella (acciaio): m = posa(punto, normale, giro)
function vite6(O, m, { r = 1.25, h = .55, esa = .42, prof = .3 } = {}) {
  const ang = angoli(20 * D2R), ex = a => { const q = ((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6; return r * esa / Math.cos(q); };
  O.loft([anello(tondo(.02), h - prof, ang), anello(ex, h - prof, ang), anello(ex, h, ang), anello(tondo(r * .84), h, ang), anello(tondo(r), h * .6, ang),
    anello(tondo(r), .1, ang), anello(tondo(r * 1.14), .1, ang), anello(tondo(r * 1.14), -.08, ang)],
  { m, mat: i => [['sat', .3], ['sat', .5], 'sat', 'luc', 'sat', 'sat', ['sat', .6]][i], duriV: () => true });   // esagono in ombra, non nero (foto)
}
// cilindro fra due punti (perni, cerniere): facce piane intorno e tappi
function cilindro(O, a, b, r, n, { k = 'cer', kCap = k, col = 1 } = {}) {
  const ax = b.clone().sub(a).normalize(), t = Math.abs(ax.z) < .9 ? v(0, 0, 1) : v(1, 0, 0), e1 = t.clone().cross(ax).normalize(), e2 = ax.clone().cross(e1);
  const pt = (c, i) => c.clone().addScaledVector(e1, Math.cos(i / n * Math.PI * 2) * r).addScaledVector(e2, Math.sin(i / n * Math.PI * 2) * r);
  for (let i = 0; i < n; i++) {
    const a0 = pt(a, i), a1 = pt(a, i + 1), b1 = pt(b, i + 1), b0 = pt(b, i), rad = a0.clone().add(a1).multiplyScalar(.5).sub(a);
    Q(O, k, a0, a1, b1, b0, rad, col, ax);
    O.tri(kCap, a, a0, a1, e1, col, ax.clone().negate()); O.tri(kCap, b, b0, b1, e1, col, ax);
  }
}

// ————————————————————————————— zigrinatura (normal map procedurale, niente foto) —————————————————————————————
// rombi a 45° (linee u ± v), piramidi tronche con la cima piatta e un solco fra l'una e l'altra; 4 × 4 rombi per ripetizione
function texZigrinata(maxAniso) {
  const N = 256, K = 4, h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N * K, w = y / N * K, a = u + w, b = u - w;
    const da = .5 - Math.abs(a - Math.floor(a) - .5), db = .5 - Math.abs(b - Math.floor(b) - .5), m = Math.min(da, db);
    h[y * N + x] = Math.min(1, Math.max(0, (m - .04) / .22));
  }
  const tela = fn => { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), I = g.createImageData(N, N); fn(I.data); g.putImageData(I, 0, 0); return c; };
  const nor = tela(d => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, du = h[y * N + (x + 1) % N] - h[y * N + (x - 1 + N) % N], dv = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const nx = -du * 5, ny = -dv * 5, l = Math.hypot(nx, ny, 1);
      d[i * 4] = (nx / l * .5 + .5) * 255; d[i * 4 + 1] = (ny / l * .5 + .5) * 255; d[i * 4 + 2] = (1 / l * .5 + .5) * 255; d[i * 4 + 3] = 255;
    }
  });
  // occlusione leggera nei solchi (il colore moltiplica quello della ceramica)
  const col = tela(d => { for (let i = 0; i < N * N; i++) { const c = 180 + 75 * Math.min(1, h[i] * 1.4); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = c; d[i * 4 + 3] = 255; } });
  const tn = new THREE.CanvasTexture(nor), tc = new THREE.CanvasTexture(col);
  for (const t of [tn, tc]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / (K * .95), 1 / (K * .95)); t.anisotropy = maxAniso; }
  tn.colorSpace = THREE.NoColorSpace; tc.colorSpace = THREE.SRGBColorSpace;
  return { tn, tc };
}
// ceramica opaca un po' meno ruvida e meno riflessa di quella di serie: con .62 / 1,8 le facce venivano tutte dello stesso bianco
// (di tre quarti metà dei pixel sopra 230); così le facce staccano come nella foto (mediana di fronte 208 contro 215 della foto)
const CERAMICA = { ruvido: .45, env: 1.5 };
// ceramica opaca con la zigrinatura: una sola per motore (cache del motore: la libera lui con motore.libera())
function zigrinata(motore) {
  return motore.geometria('abisso-bianco|zigrinata', () => {
    const m = motore.materiale('ceramica-bianca.opaca', CERAMICA).clone(), { tn, tc } = texZigrinata(motore.maxAniso);
    m.normalMap = tn; m.normalScale = new THREE.Vector2(.85, .85); m.map = tc; m.name = 'abisso-bianco|zigrinata';
    const via = m.dispose.bind(m); m.dispose = () => { via(); tn.dispose(); tc.dispose(); };
    return m;
  });
}

// ————————————————————————————— lunetta, rehaut —————————————————————————————
function lunetta(O) {
  const nG = 240;
  // tacche incise dei minuti 1…14 (tranne 5 e 10): buchi nel piano, pareti e fondo in ombra
  const tacche = [];
  for (let k = 1; k < 15; k++) if (k % 5) {
    const a = (90 - 6 * k) * D2R, c = Math.cos(a), s = Math.sin(a), w = .17;
    tacche.push([[18.5, -w], [20.3, -w], [20.3, w], [18.5, w]].map(([r, t]) => V2(c * r + s * t, s * r - c * t)));
  }
  O.tappo('cer', cerchio2(R.lunEst, nG), [cerchio2(R.lunInt, nG).reverse(), ...tacche.map(t => ccw(t).reverse())], Z.lunTop, true, v(1, 0, 0));
  for (const t of tacche) {
    const T = ccw(t);
    // incise ma chiare come nella foto (con .45 / .3 di fronte erano tratti neri)
    for (let i = 0; i < 4; i++) { const a = T[i], b = T[(i + 1) % 4], e = b.clone().sub(a); Q(O, 'cer', v(a.x, a.y, Z.lunTop), v(b.x, b.y, Z.lunTop), v(b.x, b.y, Z.lunTop - .3), v(a.x, a.y, Z.lunTop - .3), v(-e.y, e.x, 0), .62); }
    faccia(O, 'cer', T, [], Z.lunTop - .3, v(0, 0, 1), { col: .55 });
  }
  // smusso lucido interno fino al rehaut, rehaut opaco fino al quadrante
  O.fasciaLiscia('cerL', cerchio(R.rehaut, nG, Z.lunBisello), cerchio(R.lunInt, nG, Z.lunTop), { inverti: true, col: .95 });
  O.fasciaLiscia('cer', cerchio(R.quadrante, nG, Z.quadrante + .02), cerchio(R.rehaut, nG, Z.rehaut), { inverti: true, col: .8 });
  // bordo esterno: smusso lucido, fianco, denti
  O.fasciaLiscia('cerL', cerchio(R.lunFianco, nG, Z.lunSm), cerchio(R.lunEst, nG, Z.lunTop));
  O.fasciaLiscia('cer', cerchio(R.lunFianco, nG, Z.lunBase), cerchio(R.lunFianco, nG, Z.lunSm), { col: .8 });
  for (let k = 0; k < 60; k++) {
    const a = (k * 6 + 3) * D2R, c = Math.cos(a), s = Math.sin(a), w = 1.75 * D2R;
    const P = [[21.6, -w], [R.denti, -w * .96], [R.denti, w * .96], [21.6, w]].map(([r, t]) => V2(r * Math.cos(a + t), r * Math.sin(a + t)));
    prisma(O, P, Z.lunBase + .1, -1.0, { s: .12, h: .12, colLato: .7 });
  }
  // rilievi ogni 5 minuti e triangolo alle 12 con la perla di lume
  for (let k = 1; k < 12; k++) {
    const a = (90 - 30 * k) * D2R, c = Math.cos(a), s = Math.sin(a), w = .75;
    const P = [[17.95, -w], [21.2, -w], [21.2, w], [17.95, w]].map(([r, t]) => V2(c * r + s * t, s * r - c * t));
    prisma(O, P, Z.lunTop - .05, Z.lunTop + .7, { s: .24, h: .22, colLato: .62 });
  }
  prisma(O, [V2(0, 17.9), V2(2.0, 21.25), V2(-2.0, 21.25)], Z.lunTop - .05, Z.lunTop + .7, { s: .26, h: .24, colLato: .62 });
  O.loft([anello(tondo(.02), .42, angoli(15 * D2R)), anello(tondo(.62), .38, angoli(15 * D2R)), anello(tondo(.8), .26, angoli(15 * D2R)), anello(tondo(.86), .12, angoli(15 * D2R)), anello(tondo(.86), -.05, angoli(15 * D2R))],
    { liscioV: true, mat: 'lume', m: new THREE.Matrix4().makeTranslation(0, 20.15, Z.lunTop + .7) });   // perla di lume bianca (foto)
  // rehaut: tacche dei minuti (strisce scure appena sollevate) e blocchi di lume alle ore
  const pRe = (r, t, a, dz = 0) => { const k = (r - R.quadrante) / (R.rehaut - R.quadrante), z = Z.quadrante + (Z.rehaut - Z.quadrante) * k; return v(Math.cos(a) * r + Math.sin(a) * t, Math.sin(a) * r - Math.cos(a) * t, z + dz); };
  const nRe = a => v(-Math.cos(a) * 1.75, -Math.sin(a) * 1.75, 1.2).normalize();
  for (let k = 0; k < 60; k++) {
    const a = (90 - 6 * k) * D2R;
    if (k % 5 === 0) {
      const w = .45, r0 = 14.95, r1 = 15.85, n = nRe(a), up = .16;
      const A = [pRe(r0, -w, a), pRe(r1, -w, a), pRe(r1, w, a), pRe(r0, w, a)], B = A.map(p => p.clone().addScaledVector(n, up));
      Q(O, 'lume', B[0], B[1], B[2], B[3], n);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4, m = A[i].clone().add(A[j]).multiplyScalar(.5).sub(A[0].clone().add(A[2]).multiplyScalar(.5)); Q(O, 'cerL', A[i], A[j], B[j], B[i], m, .7); }
    } else {
      const w = .07, n = nRe(a), d = .012;
      Q(O, 'cer', pRe(15.05, -w, a).addScaledVector(n, d), pRe(15.8, -w, a).addScaledVector(n, d), pRe(15.8, w, a).addScaledVector(n, d), pRe(15.05, w, a).addScaledVector(n, d), n, .3);
    }
  }
}

// ————————————————————————————— cassa —————————————————————————————
const specchia = (P, sx, sy) => ccw(P.map(p => V2(p.x * sx, p.y * sy)));
const ruotaP = (P, a) => P.map(p => V2(p.x * Math.cos(a) - p.y * Math.sin(a), p.x * Math.sin(a) + p.y * Math.cos(a)));
const ANSA_A = [[5.3, 16.0], [13.5, 13.6], [17.4, 14.4], [18.3, 15.4], [18.3, 16.6], [17.7, 19.2], [16.02, 22.2], [5.3, 22.2]].map(([x, y]) => V2(x, y));
const ANSA_B = [[5.3, 22.2], [16.02, 22.2], [14.0, 25.8], [5.3, 25.8]].map(([x, y]) => V2(x, y));
const GUARDIA = [[20.5, 3.1], [25.4, 3.1], [25.8, 3.8], [25.8, 5.0], [24.3, 8.4], [20.5, 8.4]].map(([x, y]) => V2(x, y));
const PARACOLPI = [[20.0, -2.7], [23.9, -2.7], [24.8, -1.8], [24.8, 1.8], [23.9, 2.7], [20.0, 2.7]].map(([x, y]) => V2(x, y));
function cassa(O) {
  // corpo: 24 lati sotto la lunetta, smusso lucido in alto e in basso
  const corpo = ruota(daLati(Array.from({ length: 24 }, (_, i) => i * Math.PI / 12), Array(24).fill(22.7)));
  prisma(O, corpo, Z.casFondo + .6, Z.casTop, { s: .5, h: .5, colLato: .85 });
  prisma(O, corpo, Z.casFondo + .6, Z.casFondo, { s: .6, h: .6, giu: true, kTop: 'cer', colTop: .55, colLato: .85 });
  for (const sy of [1, -1]) {
    for (const sx of [1, -1]) {
      // anse: parte piana e parte che scende verso il bracciale (giunte da un lato 'x')
      const A = specchia(ANSA_A, sx, sy), B = specchia(ANSA_B, sx, sy);
      const sA = A.map((p, i) => { const q = A[(i + 1) % A.length]; return Math.abs(Math.abs(p.y) - 22.2) < .01 && Math.abs(Math.abs(q.y) - 22.2) < .01 ? 'x' : .45; });
      const sB = B.map((p, i) => { const q = B[(i + 1) % B.length]; return Math.abs(Math.abs(p.y) - 22.2) < .01 && Math.abs(Math.abs(q.y) - 22.2) < .01 ? 'x' : .45; });
      // smussi larghi come nella foto (1-1,5 mm a 45°): con 0,7 le anse sembravano scatole
      prisma(O, A, Z.casFondo + .15, Z.ansa, { s: sA.map(x => x === 'x' ? x : 1.1), h: .95, fondo: true });
      prisma(O, B, -12.0, (x, y) => Z.ansa - (Math.abs(y) - 22.2) * (Z.ansa - Z.ansaFine) / 3.6, { s: sB.map(x => x === 'x' ? x : 1.1), h: .95, fondo: true });
      // guardie (a destra quelle della corona), paracolpi a ±29°
      // a ore 9 le guardie sporgono meno (foto: x 25,1 invece di 25,8)
      // guardie col piano in cima inclinato verso l'esterno (foto: a cuneo, la faccia alta scende verso il bordo); pendenza 0,32:
      // con 0,5 e i paracolpi inclinati anche loro la sagoma del retro perdeva 0,001 di IoU
      prisma(O, specchia(sx > 0 ? GUARDIA : GUARDIA.map(p => V2(p.x > 24 ? p.x - .7 : p.x, p.y)), sx, sy), -11.2,
        (x) => Z.guardia - Math.max(0, Math.abs(x) - 22.4) * .32, { s: .8, h: .7, colLato: .72, fondo: true });
      const th = (sx > 0 ? (sy > 0 ? 29 : -29) : (sy > 0 ? 151 : 209)) * D2R;
      prisma(O, ruotaP(PARACOLPI, th), -9.7, Z.paracolpi, { s: 1.0, h: .9, colLato: .72, fondo: true });
      // viti: sopra le anse, sul fianco delle anse, sotto (nella ceramica del fondo)
      vite6(O, posa(v(sx * 15.25, sy * 20.0, Z.ansa), v(0, 0, 1), .3 + sx * .2), { r: 1.35 });
      vite6(O, posa(v(sx * 17.83, sy * 18.7, -7.0), v(sx * .974, sy * .225, 0), .5), { r: 1.2, h: .45 });
      vite6(O, posa(v(sx * 11.5, sy * 17.5, Z.casFondo), v(0, 0, -1), .2), { r: 1.15, h: .45 });
    }
    // pezzo centrale fra le anse: barretta liscia, poi blocco zigrinato che scende con le anse
    const barra = specchia([V2(-5.1, 16.4), V2(5.1, 16.4), V2(5.1, 20.3), V2(-5.1, 20.3)], 1, sy);
    prisma(O, barra, -12.0, -3.35, { s: .35, h: .35, fondo: true });
    const blocco = specchia([V2(-5.1, 20.5), V2(5.1, 20.5), V2(5.1, 25.3), V2(-5.1, 25.3)], 1, sy);
    prisma(O, blocco, -12.0, (x, y) => -3.55 - Math.max(0, Math.abs(y) - 21.4) * 1.05, { s: .35, h: .35, kTop: 'zig', dir: v(0, 1, 0), fondo: true });
  }
  // ore 3: sede della corona fra le guardie, più bassa di loro (di fronte, fra cassa e corona, si vedeva il fondo attraverso)
  prisma(O, [V2(20.5, -3.1), V2(24.2, -3.1), V2(24.2, 3.1), V2(20.5, 3.1)], -11.0, -3.4, { s: .45, h: .45, colLato: .8, fondo: true });
  // ore 9: blocco fra le due guardie
  prisma(O, [V2(-24.1, -2.7), V2(-20.5, -2.7), V2(-20.5, 2.7), V2(-24.1, 2.7)], -11.0, -4.0, { s: .5, h: .5, colLato: .85, fondo: true });
  // corona zigrinata in ceramica (7,3 mm: bianca nella foto di fronte e di profilo), colletto d'acciaio
  coronaDura(O, { r: 3.62, costole: 16, x0: 23.9, x1: 27.95, y: 0, z: Z.corona, tubo: 1.9 });
  // fondello: piastra d'acciaio ottagonale (satinata, smussi lucidi), disco a raggiera leggermente bombato, 4 viti
  const piastra = ruota(daLati(Array.from({ length: 8 }, (_, i) => i * Math.PI / 4), Array(8).fill(17.8)));
  prisma(O, piastra, Z.casFondo + .05, Z.piastra, { s: .35, h: .35, giu: true, kTop: 'sat', kSm: 'luc', kLato: 'sat', colLato: .8 });
  const nF = 192, anelliF = [14.1, 13.7, 13.3, 9, 4.5, .6], zF = [Z.piastra, Z.piastra - .35, Z.piastra - .4, Z.piastra - .55, Z.piastra - .66, Z.piastra - .7];
  // disco satinato a cerchi (foto del retro: righe concentriche, chiaro e morbido; la raggiera del Verde qui dava spicchi scuri)
  for (let r = 0; r < anelliF.length - 1; r++) O.fasciaLiscia(r === 0 ? 'luc' : 'rag', cerchio(anelliF[r], nF, zF[r]), cerchio(anelliF[r + 1], nF, zF[r + 1]), { giro: true, inverti: true });
  const cF = v(0, 0, zF.at(-1) - .005), ult = cerchio(.6, nF, zF.at(-1));
  for (let i = 0; i < nF; i++) O.tri('rag', ult[(i + 1) % nF], ult[i], cF, v(-ult[i].y, ult[i].x, 0).normalize());
  for (const a of [52, 128, 232, 308]) vite6(O, posa(v(Math.cos(a * D2R) * 15.95, Math.sin(a * D2R) * 15.95, Z.piastra), v(0, 0, -1), a * D2R), { r: 1.05, h: .42 });
}

// ————————————————————————————— quadrante: foto ripulita + indici e lancette in 3D —————————————————————————————
// foto: 3d/lumen/abisso-bianco-quadrante.webp (src/lumen3d/quadrante-abisso-bianco.py: solo la grana, senza pezzi né ombre;
// quadrante.py lasciava i fantasmi grigi delle ombre larghe delle lancette).
// Indici e lancette a cornice d'acciaio satinato con la finestra di lume (il lucido a specchio, sul bianco, veniva nero);
// lancette ferme sull'ora della foto (10:09:37), sotto le loro ombre dipinte.
const QUADRANTE = { texture: '3d/lumen/abisso-bianco-quadrante.webp', raggio: 197 / 13 };
const IND = { r0: 10.5, r1: 14.7, w: 2.73, alto: .55, bordo: .5 };
const rett = (x0, x1, y0, y1) => [V2(x0, y0), V2(x1, y0), V2(x1, y1), V2(x0, y1)];
const Y12 = [[-1.35, 9.3], [1.35, 9.3], [1.35, 11.0], [2.73, 14.6], [-2.73, 14.6], [-1.35, 11.0]].map(([x, y]) => V2(x, y));
// lancette: contorno (t lungo la lancetta, mezza larghezza), finestre di lume; [angolo °, quota sopra il quadrante, spessore]
const LANC = {
  ore: { ang: 147.2, dz: .78, h: .32, prof: [[-1.0, .62], [2.3, .5], [3.1, 1.12], [7.0, 1.22], [7.55, 1.45], [10.1, 0]],
    fin: [[[3.55, .74], [6.85, .8]], [[7.75, .92], [9.45, 0]]] },
  minuti: { ang: 35.1, dz: 1.16, h: .3, prof: [[-1.0, .56], [2.9, .45], [3.4, .95], [11.6, .95], [14.6, 0]], fin: [[[3.8, .6], [11.3, .6]]] },
};
const sagomaLanc = prof => [...prof.map(([t, w]) => V2(w, t)), ...prof.slice().reverse().filter(([, w]) => w > 0).map(([t, w]) => V2(-w, t))];
function finestra(f) {
  // [[t0, w0], [t1, w1]]: trapezio (w1 = 0 → triangolo verso la punta)
  const [[t0, w0], [t1, w1]] = f;
  return w1 > 0 ? [V2(-w0, t0), V2(w0, t0), V2(w1, t1), V2(-w1, t1)] : [V2(-w0, t0), V2(w0, t0), V2(0, t1)];
}
async function quadrante(O, motore) {
  const z = Z.quadrante, ombre = [], xy = (W, P) => P.map(p => { const q = W(p.x, p.y, 0); return [q.x, q.y]; });
  for (let h = 1; h <= 12; h++) {
    const phi = 90 - 30 * h, W = Wq(phi, z);
    let P, F;
    if (h === 12) { P = Y12; F = [rientraLati(Y12, IND.bordo)]; }
    else {
      const [r0, r1, w] = h === 6 ? [10.2, 14.9, 2.85] : [IND.r0, IND.r1, IND.w];
      P = rett(-w / 2, w / 2, r0, r1); F = [rett(-w / 2 + IND.bordo, w / 2 - IND.bordo, r0 + IND.bordo, r1 - IND.bordo)];
    }
    cornice(O, W, P, F, IND.alto, { bev: .22, kC: 'sat' });
    ombre.push({ punti: xy(W, P), alto: IND.alto, forza: .38 });
  }
  for (const L of Object.values(LANC)) {
    const W = Wq(L.ang, z + L.dz), P = sagomaLanc(L.prof);
    cornice(O, W, P, L.fin.map(finestra), L.h, { bev: .12, hs: .45, kC: 'sat' });
    ombre.push({ punti: xy(W, P), alto: L.dz, forza: .34 });
  }
  // secondi: asta sottile con la coda, cerchio di lume a 8 mm
  const Ws = Wq(226.6, z + 1.5), asta = [V2(-.36, -4.8), V2(.36, -4.8), V2(.24, -1.0), V2(.13, 15.1), V2(-.13, 15.1), V2(-.24, -1.0)];
  cornice(O, Ws, asta, [], .14, { bev: .05, hs: .5, kC: 'sat' });
  const cerchioS = cerchio2(.9, 24).map(p => V2(p.x, p.y + 7.96)), lumeS = cerchio2(.6, 24).map(p => V2(p.x, p.y + 7.96));
  cornice(O, Wq(226.6, z + 1.5), cerchioS, [lumeS], .2, { bev: .07, hs: .5, kC: 'sat' });
  ombre.push({ punti: xy(Ws, asta), alto: 1.5, forza: .28 }, { punti: xy(Ws, cerchioS), alto: 1.5, forza: .28 });
  pernoLancette(O, [[1.95, z, z + .45, 'sat'], [1.45, z + .45, z + .95, 'sat'], [1.05, z + .95, z + 1.4, 'lanc'], [.62, z + 1.4, z + 1.75, 'sat'], [.2, z + 1.72, z + 1.82, 'nero']]);
  return motore.quadrante({ texture: QUADRANTE.texture, raggio: QUADRANTE.raggio, z, ombre });
}

// corona zigrinata a spigoli vivi (la corona() dell'officina ha le costole a normali mediate: in ceramica bianca sembrano molli).
// Stesse sezioni: cappello piatto lucido, smusso, costole piatte con la scanalatura a V, colletto d'acciaio, tubo
function coronaDura(O, K) {
  const n = K.costole, st = 4, angs = [];
  for (let q = 0; q < n * st; q++) angs.push((q + .5) / (n * st) * Math.PI * 2);
  const prof = [1, 1, .95, .95];                                  // una costola: piatto (2 lati) e scanalatura (2 lati)
  const zig = s => angs.map((a, j) => K.r * s * prof[j % st]);
  const ring = (x, rs) => angs.map((a, j) => { const r = typeof rs === 'number' ? rs : rs[j]; return v(x, r * Math.cos(a), r * Math.sin(a)); });
  const { x0, x1, tubo } = K;
  const R = [ring(x1, .001), ring(x1, K.r * .72), ring(x1 - .18, K.r * .84), ring(x1 - .42, zig(.94)), ring(x1 - .62, zig(1)), ring(x0 + .75, zig(1)),
    ring(x0 + .55, zig(.95)), ring(x0 + .35, K.r * .8), ring(x0 + .35, tubo), ring(x0 - .6, tubo)];
  const mats = ['cerL', 'cerL', 'cerL', 'cerL', ['cer', 1, 'v'], 'cerL', ['cerL', .8], ['sat', .5], ['sat', .45]];
  O.loft(R, { mat: i => mats[i], m: new THREE.Matrix4().makeTranslation(0, K.y, K.z), duriV: () => true, duri: () => true });
}

// ————————————————————————————— bracciale e chiusura —————————————————————————————
// scatola nel riferimento di una maglia P(x, y, z) = C + X x + T y + N z: smussi lucidi in alto, fianchi (kX di lato, kY alle testate)
function scatola(O, P, x0, x1, y0, y1, zb, zt, { s = .35, h = .35, d = 0, kTop = 'cer', kSm = 'cerL', kX = 'cer', kY = 'cer', colX = .82, colX0 = colX, colX1 = colX, colY = .55 } = {}) {
  const o = P(0, 0, 0), ex = P(1, 0, 0).sub(o), ey = P(0, 1, 0).sub(o), ez = P(0, 0, 1).sub(o);
  const T = [P(x0 + s, y0 + s, zt), P(x1 - s, y0 + s, zt), P(x1 - s, y1 - s, zt), P(x0 + s, y1 - s, zt)];
  const M = [P(x0, y0, zt - h), P(x1, y0, zt - h), P(x1, y1, zt - h), P(x0, y1, zt - h)];
  const B = [P(x0 + .15, y0 + d, zb), P(x1 - .15, y0 + d, zb), P(x1 - .15, y1 - d, zb), P(x0 + .15, y1 - d, zb)];
  Q(O, kTop, T[0], T[1], T[2], T[3], ez, 1, ey);
  const lati = [[0, 1, ey.clone().negate(), kY, colY], [1, 2, ex, kX, colX1], [2, 3, ey, kY, colY], [3, 0, ex.clone().negate(), kX, colX0]];
  for (const [i, j, n, k, c] of lati) {
    Q(O, kSm, M[i], M[j], T[j], T[i], n.clone().add(ez), 1, ey);
    Q(O, k, B[i], B[j], M[j], M[i], n, c, ey);
  }
  Q(O, 'cer', B[0], B[1], B[2], B[3], ez.clone().negate(), .62, ey);
}
// prisma nel riferimento di una maglia W(x, y, z) = C + X x + T y + N z: pianta P (anche concava, x di traverso, y lungo la linea),
// smussi lucidi in alto (s × h), fondo accorciato di d alle testate (y = ±hl) per non toccare le vicine sulla curva;
// col(n) = occlusione finta del fianco con la normale n (pianta). Il fondo guarda dentro l'anello: in ceramica bianca resta chiaro
function pezzo(O, W, P, zb, zt, { s = .45, h = .45, d = 0, hl = 1, kTop = 'cer', kSm = 'cerL', kLato = 'cer', col = () => 1, colFondo = .66 } = {}) {
  P = ccw(P);
  const n = P.length, Pi = rientraLati(P, s), kb = Math.max(.2, hl - d) / hl;
  const o = W(0, 0, 0), D = (x, y, z) => W(x, y, z).sub(o), ez = D(0, 0, 1).normalize(), ey = D(0, 1, 0).normalize();
  faccia(O, kTop, Pi, [], zt, ez, { W, dir: ey });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = P[i], b = P[j], e = b.clone().sub(a), nl = V2(e.y, -e.x).normalize(), no = D(nl.x, nl.y, 0).normalize();
    Q(O, kSm, W(a.x, a.y, zt - h), W(b.x, b.y, zt - h), W(Pi[j].x, Pi[j].y, zt), W(Pi[i].x, Pi[i].y, zt), no.clone().add(ez), 1, ey);
    Q(O, kLato, W(a.x, a.y * kb, zb), W(b.x, b.y * kb, zb), W(b.x, b.y, zt - h), W(a.x, a.y, zt - h), no, col(nl), ey);
  }
  faccia(O, kLato, P.map(p => V2(p.x, p.y * kb)), [], zb, ez.clone().negate(), { W, col: colFondo });
}
function bracciale(O) {
  const Pc = percorso(LINEA), L = Pc.lung;
  const sCop = Pc.trova(8, -40), LCop = 8.5, sLama0 = Pc.trova(5, -40), sLama1 = Pc.trova(-15, -40), sPerno = Pc.trova(-1.8, -40);
  // larghezza: 25 alle anse, 22 alla chiusura
  const larg = s => { const k = Math.min(1, s < sCop ? s / sCop : (L - s) / (L - sCop)); return 25.0 - 3.0 * k * k * (3 - 2 * k); };
  const T2 = 2.3, GIU = .9, wc = 10.2, g = .2, gap = .35, passo = 10.2, Lb = 3.4, Lz = passo - Lb - 2 * gap;
  const fr = s => { const { C, T, N, X } = Pc.rif(s); return (x, y, z) => C.clone().addScaledVector(X, x).addScaledVector(T, y).addScaledVector(N, z); };
  const rientro = (s, l) => { const fi = Pc.rif(s - l / 2).T.angleTo(Pc.rif(s + l / 2).T); return Math.max(.1, T2 * Math.tan(fi / 2) * 1.15 + .05); };
  const cop0 = sCop - LCop / 2, cop1 = sCop + LCop / 2;
  // un tratto dall'ansa verso la chiusura: u = distanza dall'ansa, m(u) = ascissa sulla linea (dall'ansa in alto in avanti, da quella in basso indietro)
  const tratto = (m, u1) => {
    // fila centrale: barretta liscia + blocco zigrinato (quello che entra nel coperchio si accorcia)
    let u = .25;
    while (u < u1 - .6) {
      for (const [l, zig] of [[Lb, false], [Lz, true]]) {
        const a = u, b = Math.min(u + l, u1); if (b - a < .6) { u = u1; break; }
        // la fila centrale scende 0,6 più dentro l'anello delle laterali (foto di profilo: sotto le maglie lisce la striscia zigrinata è larga)
        const c = m((a + b) / 2), P = fr(c), d = rientro(c, b - a) * (T2 + GIU) / T2, hl = (b - a) / 2;
        if (zig) scatola(O, P, -wc / 2, wc / 2, -hl, hl, -T2 - GIU - .2, T2 + .05, { kTop: 'zig', kX: 'zig', d, s: .45, h: .45 });
        else scatola(O, P, -wc / 2, wc / 2, -hl, hl, -T2 - GIU, T2 - .12, { d, s: .55, h: .55 });
        u = b + gap;
      }
    }
    // file laterali: maglie lunghe sfalsate di mezzo passo, più sottili (sotto si vede il fianco zigrinato del centro).
    // Una maglia = un pezzo solo con la pianta a gradino (foto di fronte: la parte verso l'ansa più stretta di 0,7, passaggio a 45°):
    // con due scatole separate di profilo e di sbieco si vedevano due blocchi per maglia (il "cingolo")
    const tagli = [.25];
    for (let x = .25 + Lb + gap + Lz / 2; x < u1 - 1; x += passo) tagli.push(x);
    tagli.push(u1);
    for (let i = 0; i < tagli.length - 1; i++) {
      const a = tagli[i] + (i ? gap / 2 : 0), b = tagli[i + 1] - gap / 2; if (b - a < 1) continue;
      const c = m((a + b) / 2), P = fr(c), W = larg(c) / 2, d = rientro(c, b - a), hl = (b - a) / 2;
      const ym = -hl + (b - a) * .42, x0 = wc / 2 + g, st = Math.min(.7, W - x0 - 2);
      const pianta = [V2(x0, -hl), V2(W - st, -hl), V2(W - st, ym - st / 2), V2(W, ym + st / 2), V2(W, hl), V2(x0, hl)];
      for (const sg of [1, -1]) pezzo(O, P, sg > 0 ? pianta : pianta.map(p => V2(-p.x, p.y)), -.7, T2 - .05,
        { s: .85, h: .75, d, hl, col: n => Math.abs(n.y) > .9 ? .62 : n.x * sg < -.5 ? .78 : .97 });
    }
  };
  tratto(u => u, cop0 + .6);
  tratto(u => L - u, L - cop1 + .6);
  // chiusura déployante: coperchio che abbraccia il bracciale (y ≈ +8), lama più stretta sopra le maglie fino a y ≈ −15,
  // cerniera a y ≈ −1,8 con i perni d'acciaio ai lati (foto di profilo); la linea dell'anello passa sotto come sotto le maglie
  const lama = s => { const w = larg(s) / 2 - 1.7, y0 = T2 + .04, y1 = T2 + 2.0, c = .5;
    return [[-w + c, y0], [-w, y0 + c], [-w, y1 - c], [-w + c, y1], [w - c, y1], [w, y1 - c], [w, y0 + c], [w - c, y0]]; };
  const matLama = (i, j) => j === 3 ? 'cer' : j === 7 ? ['cer', .35] : j === 1 || j === 5 ? ['cer', .8] : 'cerL';
  lungoDuro(O, Pc, sLama0, sLama1, lama, { passi: 30, mat: matLama, capo: 'cer' });
  // coperchio con la placca centrale in rilievo (foto del retro)
  { const P = fr(sCop), W = larg(sCop) / 2 + .5;
    scatola(O, P, -W, W, -LCop / 2, LCop / 2, -T2 - .9, T2 + 2.5, { s: 1.1, h: 1.0, colY: .75, colX: .85 });
    scatola(O, P, -W * .42, W * .42, -LCop / 2 + .9, LCop / 2 - .9, T2 + 2.3, T2 + 2.95, { s: .28, h: .28, colY: .8, colX: .8 }); }
  // cerniera: rullo dentro lo spessore della lama (da fuori non fa una barra di traverso), sporge solo ai lati col perno d'acciaio
  { const { C, N, X } = Pc.rif(sPerno), W = larg(sPerno) / 2 - 1.1, c = C.clone().addScaledVector(N, T2 + 1.0);
    cilindro(O, c.clone().addScaledVector(X, -W), c.clone().addScaledVector(X, W), .95, 20, { k: 'cer', col: .9 });
    for (const sg of [-1, 1]) cilindro(O, c.clone().addScaledVector(X, sg * W), c.clone().addScaledVector(X, sg * (W + .16)), .55, 16, { k: 'sat' }); }
  // leva (foto di profilo): braccio sopra la lama dalla cerniera verso il basso, più spesso alla cerniera e più sottile in punta,
  // la testa copre la cerniera (un solo perno a vista, come nella foto). Da dietro è la placca centrale sopra la lama
  { const sL1 = Pc.trova(-14, -40), y0 = T2 + 1.98;
    const leva = s => { const k = Math.min(1, Math.max(0, (s - sPerno) / (sL1 - sPerno))), w = larg(s) / 2 - 2.8, y1 = y0 + 1.45 - .65 * k, c = .42;
      return [[-w + c, y0], [-w, y0 + c], [-w, y1 - c], [-w + c, y1], [w - c, y1], [w, y1 - c], [w, y0 + c], [w - c, y0]]; };
    lungoDuro(O, Pc, sPerno - 1.2, sL1, leva, { passi: 24, mat: matLama, capo: 'cer' }); }
}
// estrusione lungo il percorso con tutti gli spigoli vivi della sezione (lungo() dell'officina con duri e tappi piatti)
function lungoDuro(O, Pc, s0, s1, sezione, { passi = 30, mat, capo = 'cer' } = {}) {
  const Rg = [];
  for (let i = 0; i <= passi; i++) { const s = s0 + (s1 - s0) * i / passi, sez = typeof sezione === 'function' ? sezione(s) : sezione; Rg.push(sez.map(([x, y]) => Pc.P(s, x, y))); }
  O.loft(Rg, { liscioV: true, duri: () => true, mat, capoA: [capo, .6], capoB: [capo, .6] });
}

export default {
  id: 'abisso-bianco',
  nome: 'Abisso Bianco',
  // viste delle foto per lumen-orto / sovrapponi (angoli cercati sulle sagome): fronte appena dal basso, profilo girato di 0,13 rad
  // verso il quadrante, retro quasi da dietro (girato di 0,19 verso la corona, dal basso) con la corona in alto
  viste: { fronte: [0, -.1], profilo: [Math.PI / 2 - .13, 0], retro: [Math.PI - .19, -.15, 90] },
  async costruisci(ctx) {
    const { motore } = ctx;
    const O = new Officina();
    lunetta(O); cassa(O); bracciale(O);
    const disco = await quadrante(O, motore);
    const gruppo = new THREE.Group(); gruppo.name = 'abisso-bianco';
    gruppo.add(O.mesh(motore.ruoli('acciaio', { cer: motore.materiale('ceramica-bianca.opaca', CERAMICA), cerL: motore.materiale('ceramica-bianca.lucida'), zig: zigrinata(motore),
      rag: motore.materiale('acciaio.rag', { ruvido: .42, aniso: .3 }) })));
    gruppo.add(disco);
    gruppo.add(motore.vetro({ raggio: 17.3, spessore: .3, z: -.45, forza: .55 }));
    return { gruppo, ingombro: centra(gruppo) };
  },
};
