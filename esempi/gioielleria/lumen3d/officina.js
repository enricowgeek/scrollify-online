// Lumen 3D · officina: gli strumenti geometrici generici per costruire un orologio a facce nette.
// Niente materiali qui: le facce si raccolgono per "ruolo" (sat, luc, rag, lanc, lume, nero, o chiavi del modello)
// e il modello decide a quale finitura va ogni ruolo con Officina.mesh(motore.ruoli('acciaio')).
// Unità: mm. Assi: +z quadrante, +y ore 12, +x corona. Il bracciale sta nel piano x = 0, dietro (z < 0).
import * as THREE from 'three';

const V3 = THREE.Vector3;
export const v = (x, y, z) => new V3(x, y, z);
export const TAU = Math.PI * 2, D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ————————————————————————————— raccolta delle facce —————————————————————————————
// ogni ruolo ha le sue liste: posizione, normale, tangente (verso della satinatura), uv (mm), colore (occlusione finta: 1 = piena luce)
export class Officina {
  constructor() { this.m = {}; }
  lista(k) { return this.m[k] ??= { p: [], n: [], t: [], u: [], c: [] }; }
  punto(k, p, n, t, uv, c) {
    const L = this.lista(k);
    L.p.push(p.x, p.y, p.z); L.n.push(n.x, n.y, n.z); L.t.push(t.x, t.y, t.z, 1); L.u.push(uv[0], uv[1]); L.c.push(c, c, c);
  }
  // quadrilatero piatto a,b,c,d (antiorario visto da fuori); dir = verso della satinatura; centro = punto interno per orientare
  quad(k, a, b, c, d, dir, col = 1, centro = null) {
    const n = new V3().subVectors(c, a).cross(new V3().subVectors(d, b));
    if (n.lengthSq() < 1e-12) return;
    n.normalize();
    if (centro && n.dot(new V3().addVectors(a, c).multiplyScalar(.5).sub(centro)) < 0) return this.quad(k, d, c, b, a, dir, col);
    const t = tangente(n, dir), bt = new V3().crossVectors(n, t);
    const uv = p => [p.dot(t), p.dot(bt)];
    for (const p of [a, b, c, a, c, d]) this.punto(k, p, n, t, uv(p), col);
  }
  tri(k, a, b, c, dir, col = 1, verso = null) {
    const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
    if (n.lengthSq() < 1e-14) return;
    n.normalize();
    if (verso && n.dot(verso) < 0) return this.tri(k, a, c, b, dir, col);
    const t = tangente(n, dir), bt = new V3().crossVectors(n, t);
    for (const p of [a, b, c]) this.punto(k, p, n, t, [p.dot(t), p.dot(bt)], col);
  }
  // fascia tra due anelli con normali mediate (superfici curve); giro = satinatura lungo l'anello (se no lungo la fascia)
  fasciaLiscia(k, A, B, { chiuso = true, col = 1, giro = true, inverti = false } = {}) {
    const n = A.length, M = chiuso ? n : n - 1, fn = [];
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % n;
      const f = new V3().subVectors(B[j], A[i]).cross(new V3().subVectors(B[i], A[j]));
      if (inverti) f.negate();
      fn.push(f.lengthSq() > 1e-14 ? f.normalize() : null);
    }
    const nv = [];
    for (let i = 0; i < n; i++) {
      const s = new V3();
      const a = chiuso ? fn[(i - 1 + M) % M] : fn[i - 1], b = fn[i];
      if (a) s.add(a); if (b) s.add(b);
      nv.push(s.normalize());
    }
    const u = [0]; for (let i = 1; i <= n; i++) u.push(u[i - 1] + A[i % n].distanceTo(A[i - 1]));
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % n, uj = chiuso && j === 0 ? u[n] : u[j];
      const ta = giro ? new V3().subVectors(A[j], A[i]) : new V3().subVectors(B[i], A[i]);
      const q = [[A[i], nv[i], u[i], 0], [A[j], nv[j], uj, 0], [B[j], nv[j], uj, B[j].distanceTo(A[j])], [B[i], nv[i], u[i], B[i].distanceTo(A[i])]];
      const ord = inverti ? [0, 3, 2, 0, 2, 1] : [0, 1, 2, 0, 2, 3];
      for (const o of ord) { const [p, nn, uu, vv] = q[o]; this.punto(k, p, nn, tangente(nn, ta), giro ? [uu, vv] : [vv, uu], col); }
    }
  }
  // fascia a facce piatte tra anelli corrispondenti (stesso numero di punti)
  fascia(k, A, B, { chiuso = true, col = 1, giro = true, inverti = false } = {}) {
    const n = A.length, M = chiuso ? n : n - 1;
    for (let i = 0; i < M; i++) {
      const j = (i + 1) % n;
      const dir = giro ? new V3().subVectors(A[j], A[i]) : new V3().subVectors(B[i], A[i]);
      if (inverti) this.quad(k, A[j], A[i], B[i], B[j], dir, col); else this.quad(k, A[i], A[j], B[j], B[i], dir, col);
    }
  }
  // faccia piana con buchi (contorni 2D, piano z costante, normale +z se su, -z se no)
  tappo(k, contorno, buchi, z, su, dir, col = 1) {
    const tris = THREE.ShapeUtils.triangulateShape(contorno, buchi);
    const tutti = contorno.concat(...buchi);
    for (const [a, b, c] of tris) {
      const P = [a, b, c].map(i => v(tutti[i].x, tutti[i].y, z));
      this.tri(k, P[0], P[1], P[2], dir, col, v(0, 0, su ? 1 : -1));
    }
  }
  // triangolo con normali per vertice, verso deciso dalla normale di faccia f
  triN(k, P, N, U, T, f, col) {
    const x = new V3().subVectors(P[1], P[0]).cross(new V3().subVectors(P[2], P[0]));
    if (x.lengthSq() < 1e-20) return;
    const o = x.dot(f) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const i of o) this.punto(k, P[i], N[i], tangente(N[i], T[i]), U[i], col);
  }
  // loft: superficie fra anelli di punti (stesso numero di punti); normale di faccia = cross(c-a, b-d):
  // anelli antiorari visti dall'asse (o sezioni orarie) e profilo verso l'esterno.
  // o = { chiuso (anello chiuso, di serie sì), duri(j) (spigolo vivo fra lato j-1 e j), liscioV (normali mediate fra anelli),
  //       duriV(i), mat(i, j, f, P) → 'ruolo' | ['ruolo', col] | ['ruolo', col, 'v'] (satinatura lungo il profilo) | null (salta),
  //       col (numero o funzione come mat), capoA / capoB (chiudono il primo / l'ultimo anello: 'ruolo' o ['ruolo', col]), m (Matrix4) }
  loft(R, o = {}) {
    // tutto si calcola nel riferimento locale (mat riceve normali e punti locali), la matrice si applica all'uscita
    if (o.m) {
      const m = o.m, nm = new THREE.Matrix3().getNormalMatrix(m), dentro = this;
      return this.loft.call({
        triN: (k, P, N, U, T, f, col) => dentro.triN(k, P.map(p => p.clone().applyMatrix4(m)), N.map(n => n.clone().applyMatrix3(nm).normalize()), U, T.map(t => t.clone().transformDirection(m)), f.clone().applyMatrix3(nm).normalize(), col),
      }, R, { ...o, m: null });
    }
    const M = R.length, N = R[0].length, chiuso = o.chiuso !== false, E = chiuso ? N : N - 1;
    const duro = o.duri || (() => false), duroV = o.duriV || (() => !o.liscioV);
    const mat = typeof o.mat === 'function' ? o.mat : () => o.mat ?? 'luc';
    const col0 = o.col ?? 1;
    const NF = [];
    for (let i = 0; i < M - 1; i++) {
      const riga = [];
      for (let j = 0; j < E; j++) {
        const j1 = (j + 1) % N, a = R[i][j], b = R[i][j1], c = R[i + 1][j1], d = R[i + 1][j];
        const n = new V3().subVectors(c, a).cross(new V3().subVectors(b, d)), l = n.length();
        riga.push(l > 1e-12 ? n.multiplyScalar(1 / l) : null);
      }
      NF.push(riga);
    }
    const U = R.map(r => { const u = [0]; for (let j = 1; j <= N; j++) u.push(u[j - 1] + r[j % N].distanceTo(r[j - 1])); return u; });
    const Vv = [new Array(N).fill(0)];
    for (let i = 1; i < M; i++) Vv.push(R[i].map((p, j) => Vv[i - 1][j] + p.distanceTo(R[i - 1][j])));
    const vn = (i, j, ri, vj) => {
      const s = new V3(), strisce = [i], lati = [j];
      if (!duroV(ri) && ri > 0 && ri < M - 1) strisce.push(ri === i ? i - 1 : i + 1);
      if (!duro(vj % N)) { const e2 = vj === j ? j - 1 : j + 1; if (chiuso) lati.push((e2 + E) % E); else if (e2 >= 0 && e2 < E) lati.push(e2); }
      for (const si of strisce) for (const ej of lati) { const f = NF[si][ej]; if (f) s.add(f); }
      return s.lengthSq() > 0 ? s.normalize() : NF[i][j].clone();
    };
    for (let i = 0; i < M - 1; i++) for (let j = 0; j < E; j++) {
      const f = NF[i][j]; if (!f) continue;
      const j1 = j + 1, J = j1 % N;
      const P = [R[i][j], R[i][J], R[i + 1][J], R[i + 1][j]];
      let k = mat(i, j, f, P), col = typeof col0 === 'function' ? col0(i, j, f, P) : col0, lungo = 'u';
      if (Array.isArray(k)) [k, col = col, lungo = 'u'] = k;
      if (!k) continue;
      const Nn = [vn(i, j, i, j), vn(i, j, i, j1), vn(i, j, i + 1, j1), vn(i, j, i + 1, j)];
      let UV = [[U[i][j], Vv[i][j]], [U[i][j1], Vv[i][J]], [U[i + 1][j1], Vv[i + 1][J]], [U[i + 1][j], Vv[i + 1][j]]];
      let ta = new V3().subVectors(P[1], P[0]), tb = new V3().subVectors(P[2], P[3]);
      if (lungo === 'v') { ta = new V3().subVectors(P[3], P[0]); tb = new V3().subVectors(P[2], P[1]); UV = UV.map(([a, b]) => [b, a]); }
      if (ta.lengthSq() < 1e-12) ta.copy(tb); if (tb.lengthSq() < 1e-12) tb.copy(ta);
      const T = lungo === 'v' ? [ta, tb, tb, ta] : [ta, ta, tb, tb];
      this.triN(k, [P[0], P[1], P[2]], [Nn[0], Nn[1], Nn[2]], [UV[0], UV[1], UV[2]], [T[0], T[1], T[2]], f, col);
      this.triN(k, [P[0], P[2], P[3]], [Nn[0], Nn[2], Nn[3]], [UV[0], UV[2], UV[3]], [T[0], T[2], T[3]], f, col);
    }
    const centro = r => r.reduce((c, p) => c.add(p), new V3()).multiplyScalar(1 / r.length);
    const capo = (ri, kk, altro) => {
      let [k, col] = Array.isArray(kk) ? kk : [kk, typeof col0 === 'number' ? col0 : 1];
      const r = R[ri], c = centro(r), n = new V3();
      for (let j = 0; j < N; j++) { const p = r[j], q = r[(j + 1) % N]; n.x += (p.y - q.y) * (p.z + q.z); n.y += (p.z - q.z) * (p.x + q.x); n.z += (p.x - q.x) * (p.y + q.y); }
      n.normalize(); if (n.dot(new V3().subVectors(c, centro(R[altro]))) < 0) n.negate();
      const e1 = new V3().subVectors(r[0], c); e1.addScaledVector(n, -e1.dot(n)).normalize(); const e2 = new V3().crossVectors(n, e1);
      const uv = p => { const d = new V3().subVectors(p, c); return [d.dot(e1), d.dot(e2)]; };
      for (let j = 0; j < N; j++) { const a = r[j], b = r[(j + 1) % N]; this.triN(k, [c, a, b], [n, n, n], [uv(c), uv(a), uv(b)], [e1, e1, e1], n, col); }
    };
    if (o.capoA) capo(0, o.capoA, 1);
    if (o.capoB) capo(M - 1, o.capoB, M - 2);
  }
  geometrie() {
    const out = {};
    for (const [k, L] of Object.entries(this.m)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(L.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(L.n, 3));
      g.setAttribute('tangent', new THREE.Float32BufferAttribute(L.t, 4));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(L.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(L.c, 3));
      g.computeBoundingBox(); g.computeBoundingSphere();
      out[k] = g;
    }
    return out;
  }
  // un Mesh per ruolo (una draw call per materiale). materiali = { ruolo: Material }; un ruolo senza materiale è un errore
  mesh(materiali) {
    const gruppo = new THREE.Group();
    for (const [k, g] of Object.entries(this.geometrie())) {
      if (!materiali[k]) throw new Error(`lumen3d: nessun materiale per il ruolo "${k}"`);
      const m = new THREE.Mesh(g, materiali[k]); m.name = k; gruppo.add(m);
    }
    return gruppo;
  }
}
export function tangente(n, dir) {
  const t = dir.clone().addScaledVector(n, -dir.dot(n));
  if (t.lengthSq() < 1e-10) { t.set(1, 0, 0).addScaledVector(n, -n.x); if (t.lengthSq() < 1e-6) t.set(0, 1, 0).addScaledVector(n, -n.y); }
  return t.normalize();
}

// ————————————————————————————— poligoni 2D —————————————————————————————
// poligono convesso dato dalle normali dei lati (angoli) e dalle distanze dal centro
export function daLati(ang, dist) {
  const n = ang.length, P = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a1 = ang[i], a2 = ang[j], d1 = dist[i], d2 = dist[j];
    const det = Math.cos(a1) * Math.sin(a2) - Math.sin(a1) * Math.cos(a2);
    P.push(new THREE.Vector2((d1 * Math.sin(a2) - d2 * Math.sin(a1)) / det, (Math.cos(a1) * d2 - Math.cos(a2) * d1) / det));
  }
  return P;   // vertice i = fine del lato i
}
// lati di un poligono convesso dato per vertici (antiorario) → angoli e distanze
export function lati(P) {
  const ang = [], dist = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], e = b.clone().sub(a), nn = new THREE.Vector2(e.y, -e.x).normalize();
    ang.push(Math.atan2(nn.y, nn.x)); dist.push(nn.dot(a));
  }
  return { ang, dist };
}
// sfalsamento vero: ogni lato si sposta verso l'interno di d (gradini di larghezza uguale, non scalatura)
export const rientra = (P, d) => { const { ang, dist } = lati(P); return ruota(daLati(ang, dist.map(x => x - d))); };
// riallinea i vertici di daLati (fine lato) all'ordine del poligono originale (inizio lato)
export function ruota(Q) { return Q.map((_, i) => Q[(i - 1 + Q.length) % Q.length]); }
// poligono regolare con n lati: il primo lato ha la normale a fase (radianti), apotema a
export const poligonoRegolare = (n, a, fase = 0) => ruota(daLati(Array.from({ length: n }, (_, i) => fase + i * TAU / n), Array(n).fill(a)));
// suddivide i lati: k punti per lato (stesso numero per poligoni paralleli → punti corrispondenti)
export function campiona(P, k) {
  const out = [];
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], n = k[i] ?? k; for (let s = 0; s < n; s++) out.push(a.clone().lerp(b, s / n)); }
  return out;
}
export const in3 = (P, z) => P.map(p => v(p.x, p.y, z));
// punto del contorno P lungo il raggio con angolo a (primo bordo incontrato)
export function sulRaggio(P, a) {
  const d = new THREE.Vector2(Math.cos(a), Math.sin(a)); let best = 1e9;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], e = q.clone().sub(p), den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const t = (p.x * e.y - p.y * e.x) / den, u = (p.x * d.y - p.y * d.x) / den;
    if (t > 0 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t);
  }
  return new THREE.Vector2(d.x * best, d.y * best);
}
export const cerchio = (r, n, z, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + i / n * TAU; return v(Math.cos(a) * r, Math.sin(a) * r, z); });
export const cerchio2 = (r, n) => Array.from({ length: n }, (_, i) => { const a = i / n * TAU; return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r); });
export const vec2 = coppie => coppie.map(([x, y]) => new THREE.Vector2(x, y));

// anello da una sagoma "raggio in funzione dell'angolo" f(a); z numero o funzione (x, y)
export const anello = (f, z, angs) => angs.map(a => { const r = f(a), x = r * Math.cos(a), y = r * Math.sin(a); return v(x, y, typeof z === 'function' ? z(x, y) : z); });
// angoli a passo costante più quelli obbligati (vertici della sagoma), ordinati e senza doppioni
export function angoli(passo, extra = []) {
  const a = [];
  for (let x = 0; x < TAU - 1e-9; x += passo) a.push(x);
  extra.forEach(x => a.push(x));
  const n = a.map(x => ((x % TAU) + TAU) % TAU).sort((p, q) => p - q), out = [];
  for (const x of n) if (!out.length || x - out[out.length - 1] > 1e-6) out.push(x);
  if (TAU - out[out.length - 1] + out[0] < 1e-6) out.pop();
  return out;
}
export const tondo = r => () => r;

// ————————————————————————————— pezzi —————————————————————————————
// vite a testa bombata con il taglio. m = Matrix4 che mette l'origine sulla superficie e +z fuori da essa.
// o = { r (raggio testa), h (altezza), taglio (larghezza), k (ruolo), kTaglio }
export function vite(O, m, { r = .92, h = .36, taglio = .16, k = 'luc', kTaglio = 'nero', col = 1 } = {}) {
  const ang = angoli(15 * D2R);
  O.loft([anello(tondo(.02), h, ang), anello(tondo(r * .7), h * .9, ang), anello(tondo(r), h * .42, ang), anello(tondo(r), -.1, ang)],
    { liscioV: true, duriV: i => i === 2, mat: [k, col], m });
  if (taglio > 0) {
    const L = r * .87, f = z => [v(L, -taglio / 2, z), v(L, taglio / 2, z), v(-L, taglio / 2, z), v(-L, -taglio / 2, z)];
    O.loft([f(h * 1.03), f(h * .94)], { mat: kTaglio, capoA: kTaglio, m });
  }
}
// matrice per una vite: posizione, normale della superficie (fuori), rotazione del taglio attorno alla normale
export function posa(pos, normale, giro = 0) {
  const n = normale.clone().normalize(), a = Math.abs(n.z) < .9 ? v(0, 0, 1) : v(1, 0, 0);
  const t = new V3().crossVectors(a, n).normalize(), u = new V3().crossVectors(n, t);
  const q = new THREE.Matrix4().makeBasis(t, u, n).setPosition(pos);
  return q.multiply(new THREE.Matrix4().makeRotationZ(giro));
}

// perno a vista sul fianco di una maglia (puntino scuro); P(x, y, z) = riferimento locale
export function perno(O, P, x, y, z, lato, { r = .3, k = 'luc', col = .1 } = {}) {
  const n = 10, c = P(x, y, z), pts = Array.from({ length: n }, (_, i) => { const a = i / n * TAU; return P(x, y + Math.cos(a) * r, z + Math.sin(a) * r * lato); });
  for (let i = 0; i < n; i++) O.tri(k, pts[i], pts[(i + 1) % n], c, v(0, 1, 0), col);
}

// corona zigrinata lungo +x: costole piatte con una scanalatura a V, cappello piatto satinato a cerchi, colletto e tubo.
// K = { r (raggio della presa), costole, x0 (inizio presa, sul fianco), x1 (cappello), y, z, tubo (raggio), kCap, k, kScuro }
export function corona(O, K) {
  const n = K.costole ?? 14, st = 8, angs = [];
  for (let q = 0; q < n * st; q++) angs.push(q / (n * st) * TAU);
  const prof = [1, 1, 1, 1, 1, .975, .945, .975];                 // una costola: piatto e scanalatura
  const zig = s => angs.map((a, j) => { const f = prof[j % st], base = Math.cos(Math.PI / n) / Math.cos(((a + TAU / n / 2) % (TAU / n)) - Math.PI / n); return K.r * s * f * Math.min(base, 1.04); });
  const ring = (x, rs) => angs.map((a, j) => { const r = typeof rs === 'number' ? rs : rs[j]; return v(x, r * Math.cos(a), r * Math.sin(a)); });
  const x0 = K.x0, x1 = K.x1, tubo = K.tubo ?? K.r * .42;
  const R = [
    ring(x1, .05), ring(x1, K.r * .78),                             // cappello piatto
    ring(x1 - .12, K.r * .84), ring(x1 - .35, zig(.93)),            // smusso verso il cappello
    ring(x1 - .6, zig(1)), ring(x0 + .75, zig(1)),                  // zigrinatura
    ring(x0 + .55, zig(.94)), ring(x0 + .35, K.r * .84),            // colletto lucido
    ring(x0 + .35, tubo), ring(x0 - .6, tubo),                      // tubo
  ];
  const kk = K.k ?? 'luc', mats = [K.kCap ?? 'sat', kk, kk, kk, kk, kk, kk, [K.kScuro ?? kk, .3], [kk, .45]];
  O.loft(R, { mat: i => mats[i], m: new THREE.Matrix4().makeTranslation(0, K.y ?? 0, K.z ?? 0), duriV: () => true });
}

// scatola con smussi sui 4 spigoli superiori e fondo rientrato di d (profilo a trapezio), nel riferimento P(x, y, z)
// c = { x0, x1, y0, y1 (smussi), h (altezza smusso), hb (smusso basso) }; dentro = occlusione dei fianchi verso l'interno
export function scatola(O0, P, x0, x1, y0, y1, zb, zt, c, d, { dentro = [1, 1], kSat = 'sat', kLuc = 'luc' } = {}) {
  const h = c.h, cen = P((x0 + x1) / 2, (y0 + y1) / 2, (zb + zt) / 2);
  const O = { quad: (k, a, b, cc, dd, dir, col = 1) => O0.quad(k === 'sat' ? kSat : kLuc, a, b, cc, dd, dir, col, cen) };
  const T = [P(x0 + c.x0, y0 + c.y0, zt), P(x1 - c.x1, y0 + c.y0, zt), P(x1 - c.x1, y1 - c.y1, zt), P(x0 + c.x0, y1 - c.y1, zt)];
  const M = [P(x0, y0, zt - h), P(x1, y0, zt - h), P(x1, y1, zt - h), P(x0, y1, zt - h)];
  const hb = c.hb ?? 0;
  const B = [P(x0, y0 + d, zb), P(x1, y0 + d, zb), P(x1, y1 - d, zb), P(x0, y1 - d, zb)];
  if (hb > 0) {
    // anello intermedio basso: i fianchi scendono dritti fino a zb + hb, poi lo smusso verso il fondo
    const M2 = [P(x0, y0, zb + hb), P(x1, y0, zb + hb), P(x1, y1, zb + hb), P(x0, y1, zb + hb)];
    const dy0 = new V3().subVectors(P(0, 1, 0), P(0, 0, 0)), dx0 = new V3().subVectors(P(1, 0, 0), P(0, 0, 0));
    O.quad('sat', M2[0], M2[1], M[1], M[0], dx0, .3); O.quad('sat', M2[2], M2[3], M[3], M[2], dx0, .3);
    O.quad('sat', M2[1], M2[2], M[2], M[1], dy0, dentro[1]); O.quad('sat', M2[3], M2[0], M[0], M[3], dy0, dentro[0]);
    O.quad('luc', B[0], B[1], M2[1], M2[0], dx0, .5); O.quad('luc', B[2], B[3], M2[3], M2[2], dx0, .5);
    O.quad('sat', B[1], B[2], M2[2], M2[1], dy0, dentro[1]); O.quad('sat', B[3], B[0], M2[0], M2[3], dy0, dentro[0]);
  }
  const dx = new V3().subVectors(P(1, 0, 0), P(0, 0, 0)), dy = new V3().subVectors(P(0, 1, 0), P(0, 0, 0));
  O.quad('sat', T[0], T[1], T[2], T[3], dx);                       // piano satinato (righe di traverso)
  O.quad('luc', M[0], M[1], T[1], T[0], dx); O.quad('luc', M[2], M[3], T[3], T[2], dx);   // smussi alle testate
  O.quad('luc', M[1], M[2], T[2], T[1], dy); O.quad('luc', M[3], M[0], T[0], T[3], dy);   // smussi lungo i lati
  if (!(hb > 0)) {
    O.quad('sat', B[0], B[1], M[1], M[0], dx, .3); O.quad('sat', B[2], B[3], M[3], M[2], dx, .3);   // testate (nella fessura)
    O.quad('sat', B[1], B[2], M[2], M[1], dy, dentro[1]); O.quad('sat', B[3], B[0], M[0], M[3], dy, dentro[0]);
  }
  O.quad('sat', B[3], B[2], B[1], B[0], dy, .8);                   // interno
}

// ————————————————————————————— bracciale —————————————————————————————
// linea mediana dell'anello (coppie [y, z] nel piano x = 0, vista di profilo), dalla foto di profilo (src/lumen3d/anello.py).
// Restituisce la lunghezza e il riferimento lungo la linea: C (punto), T (avanti), N (fuori dall'anello), X (larghezza)
// e P(s, x, y) = punto a larghezza x e altezza y sopra la linea (convenzione del loft: sezioni orarie viste da T)
export function percorso(linea, { divisioni = 3000 } = {}) {
  const curva = new THREE.CatmullRomCurve3(linea.map(([y, z]) => v(0, y, z)), false, 'centripetal');
  curva.arcLengthDivisions = divisioni;
  const lung = curva.getLength(), X = v(1, 0, 0);
  const rif = s => {
    const u = curva.getUtoTmapping(0, clamp(s, 0, lung));
    const C = curva.getPoint(u), T = curva.getTangent(u).normalize(), N = new V3().crossVectors(X, T).normalize();
    return { C, T, N, X };
  };
  const lat = s => { const { T, N } = rif(s); return new V3().crossVectors(N, T); };   // = -X
  const P = (s, x, y) => { const { C, T, N } = rif(s); return C.addScaledVector(new V3().crossVectors(N, T), x).addScaledVector(N, y); };
  // ascissa dove la linea, dietro (z < zMax), passa per la quota y: centro della chiusura
  const trova = (y, zMax = -30) => { let s0 = lung / 2, best = 1e9; for (let s = 0; s < lung; s += .1) { const { C } = rif(s); const d = Math.abs(C.y - y) + (C.z > zMax ? 100 : 0); if (d < best) { best = d; s0 = s; } } return s0; };
  return { curva, lung, rif, lat, P, trova };
}

// sezione [x, y] di un rettangolo w × h con gli spigoli arrotondati (raggio r, n punti per spigolo), oraria vista da T: per lungo()
export function sezioneArrotondata(w, h, r, n = 4, y0 = -h / 2) {
  r = Math.min(r, w / 2, h / 2); const out = [], c = [[-w / 2 + r, y0 + r, -Math.PI / 2], [-w / 2 + r, y0 + h - r, Math.PI], [w / 2 - r, y0 + h - r, Math.PI / 2], [w / 2 - r, y0 + r, 0]];
  for (const [cx, cy, a0] of c) for (let i = 0; i <= n; i++) { const a = a0 - i / n * Math.PI / 2; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
// estrusione di una sezione lungo il percorso da s0 a s1 (cinturini, fasce, file di maglie): sezione = [[x, y], …] oppure
// funzione s → sezione (larghezza che cambia); passi = numero di anelli; o = opzioni del loft (mat, duri, capoA, capoB, col…)
export function lungo(O, Pc, s0, s1, sezione, { passi = 40, ...o } = {}) {
  const R = [];
  for (let i = 0; i <= passi; i++) { const s = s0 + (s1 - s0) * i / passi, sez = typeof sezione === 'function' ? sezione(s) : sezione; R.push(sez.map(([x, y]) => Pc.P(s, x, y))); }
  O.loft(R, { liscioV: true, ...o });
  return R;
}

// bracciale a tre file (maglia centrale + due laterali sfalsate di mezzo passo, prima maglia terminale intera), dal modulo p2.
// Riempie [0, sA] e [sB, lung]; la chiusura (sA..sB) la mette chiusuraDeployante. o = { sA, sB, passo, larg(s), T2 (metà spessore),
// fessura, centrale (frazione della larghezza), kSat, kLuc }
export function braccialeTreFile(O, Pc, o) {
  const { sA, sB } = o, lung = Pc.lung, passo = o.passo ?? 7.0, fess = o.fessura ?? .32;
  const tratti = [[0, sA, 'inizio'], [sB, lung, 'fine']];
  let nMaglie = 0;
  for (const [s0, s1, lato] of tratti) {
    const n = Math.round((s1 - s0) / passo), P = (s1 - s0) / n;
    const ter = lato === 'inizio' ? [s0, s0 + P] : [s1 - P, s1];
    maglia(O, Pc.rif, o, (ter[0] + ter[1]) / 2, P - fess, 'terminale');
    const c0 = lato === 'inizio' ? s0 + P : s0, c1 = lato === 'inizio' ? s1 : s1 - P;
    for (let i = 0; i < n - 1; i++) { maglia(O, Pc.rif, o, c0 + (i + .5) * P, P - fess, 'centro'); nMaglie++; }
    // laterali sfalsate di mezzo passo (mezze maglie agli estremi)
    const tagli = [c0]; for (let x = c0 + P / 2; x < c1 - .01; x += P) tagli.push(x); tagli.push(c1);
    for (let i = 0; i < tagli.length - 1; i++) maglia(O, Pc.rif, o, (tagli[i] + tagli[i + 1]) / 2, tagli[i + 1] - tagli[i] - fess, 'lati');
  }
  return { nMaglie };
}
// una maglia (centrale, terminale o coppia laterale) come scatola smussata nel riferimento locale (X, T, N)
function maglia(O, rif, o, s, L, tipo) {
  const { C, T, N } = rif(s), X = v(1, 0, 0), T2 = o.T2 ?? 2.0;
  const W = o.larg(s), wc = W * (o.centrale ?? .46), g = .16, ks = { kSat: o.kSat ?? 'sat', kLuc: o.kLuc ?? 'luc' };
  // piega locale → rientro del fondo per non toccare le vicine
  const Ta = rif(s - L / 2).T, Tb = rif(s + L / 2).T, fi = Ta.angleTo(Tb);
  const d = Math.max(.12, T2 * Math.tan(fi / 2) * 1.15 + .05);
  const P = (x, y, z) => C.clone().addScaledVector(X, x).addScaledVector(T, y).addScaledVector(N, z);
  if (tipo === 'centro') {
    scatola(O, P, -wc / 2, wc / 2, -L / 2, L / 2, -T2 - .75, T2 + .12, { x0: .25, x1: .25, y0: .5, y1: .5, h: .38, hb: .5 }, Math.max(d, .5), { dentro: [.45, .45], ...ks });
  } else if (tipo === 'terminale') {
    // pezzo pieno: base larga con i bordi smussati + centro rialzato
    scatola(O, P, -W / 2, W / 2, -L / 2, L / 2, -T2 - .3, T2, { x0: .75, x1: .75, y0: .6, y1: .6, h: .75, hb: .6 }, Math.max(d, .6), ks);
    scatola(O, P, -wc / 2, wc / 2, -L / 2 + .02, L / 2 - .02, T2 - .5, T2 + .12, { x0: .25, x1: .25, y0: .5, y1: .5, h: .38 }, .02, { dentro: [.6, .6], ...ks });
    for (const yy of [L / 2 - 1.0]) { perno(O, P, W / 2 + .02, yy, 0, 1); perno(O, P, -W / 2 - .02, yy, 0, -1); }
  } else {
    const a = wc / 2 + g, e = Math.min(.9, L * .16);
    scatola(O, P, a, W / 2, -L / 2, L / 2, -T2, T2, { x0: .15, x1: .75, y0: e, y1: e, h: .75, hb: .75 }, Math.max(d, .75), { dentro: [.45, 1], ...ks });
    scatola(O, P, -W / 2, -a, -L / 2, L / 2, -T2, T2, { x0: .75, x1: .15, y0: e, y1: e, h: .75, hb: .75 }, Math.max(d, .75), { dentro: [1, .45], ...ks });
    if (L > 3.5) for (const yy of [L / 2 - 1.0]) { perno(O, P, W / 2 + .02, yy, 0, 1); perno(O, P, -W / 2 - .02, yy, 0, -1); }
  }
}

// chiusura déployante (dal modulo "finale"): guscio curvo lungo la linea, placca centrale in rilievo, lama sotto,
// pulsanti sui fianchi, viti alle estremità. Pc = percorso(); o = { sc (centro), L (lunghezza), W (metà larghezza),
// sopra, sotto (quote del bracciale sopra/sotto la linea), pulsante: [lunghezza, altezza, sporgenza], kSat, kLuc, kNero }
export function chiusuraDeployante(O, Pc, o) {
  const { P, rif } = Pc, sa = o.sc - o.L / 2, sb = o.sc + o.L / 2, kS = o.kSat ?? 'sat', kL = o.kLuc ?? 'luc', kN = o.kNero ?? 'nero';
  const nor = s => rif(s).N, tan = s => rif(s).T, lat = s => Pc.lat(s);
  const guscio = (s0, s1, sez, testa, ce, mats, K, col = 1) => {
    const R = [];
    for (let i = 0; i <= K + 2; i++) {
      const s = i === 0 ? s0 : i === K + 2 ? s1 : s0 + ce + (s1 - s0 - 2 * ce) * (i - 1) / K;
      R.push(((i === 0 || i === K + 2) ? testa : sez).map(([x, y]) => P(s, x, y)));
    }
    O.loft(R, { duri: () => true, liscioV: true, duriV: i => i === 1 || i === K + 1, capoA: [kS, .35], capoB: [kS, .35], col, mat: (i, j) => mats(i, j, K) });
  };
  const hw = o.W + .35, top = o.sopra + .45, bot = o.sotto - .1;
  // coperchio: fianchi satinati con la linea di piega, smussi lucidi, piano satinato
  const cop = (d, tp) => [[-hw + d, bot + d], [-hw + d, -.3], [-hw + d + .14, -.05], [-hw + d, .2], [-hw + d, tp - .8], [-hw + .8 + d, tp], [hw - .8 - d, tp], [hw - d, tp - .8], [hw - d, .2], [hw - d - .14, -.05], [hw - d, -.3], [hw - d, bot + d]];
  const mCop = [[kS, 1, 'v'], [kS, .3], [kS, .3], [kS, 1, 'v'], kL, kS, kL, [kS, 1, 'v'], [kS, .3], [kS, .3], [kS, 1, 'v'], [kS, .6]];
  guscio(sa, sb, cop(0, top), cop(.35, top - .6), .6, (i, j, K) => (i === 0 || i === K + 1) && j >= 3 && j <= 7 ? kL : mCop[j], 40);
  // placca centrale in rilievo (solchi di traverso), bordi lucidi
  const pw = hw - .75, pl = [[-pw, top - .05], [-pw, top + .15], [-pw + .3, top + .38], [pw - .3, top + .38], [pw, top + .15], [pw, top - .05]];
  const plT = pl.map(([x, y]) => [x * .97, y > top ? y - .25 : y]);
  guscio(sa + o.L * .2, sb - o.L * .2, pl, plT, .3, (i, j, K) => j === 2 && i > 0 && i <= K ? kS : j === 5 ? [kS, .3] : kL, 24);
  // lama pieghevole sotto (di profilo si vede come un gradino)
  const lw = hw - 2.2, lama = [[-lw, bot - .75], [-lw, bot + .05], [lw, bot + .05], [lw, bot - .75]];
  guscio(sa + 1.6, sb - 1.6, lama, lama.map(([x, y]) => [x * .96, y > bot - .5 ? y : y + .2]), .3, () => [kS, .6], 20, .6);
  // pulsanti sui due fianchi, sfaccettati
  const [pL, pH, pP] = o.pulsante ?? [7.5, 1.8, .7];
  for (const sg of [1, -1]) {
    const x0 = hw - .05, x1 = hw + pP, y0 = -.55, y1 = y0 + pH, e = .3, ym = (y0 + y1) / 2;
    let pu = [[x0, y1], [x1 - e, y1], [x1, y1 - e], [x1, y0 + e], [x1 - e, y0], [x0, y0]];
    let puT = pu.map(([x, y]) => [x0 + (x - x0) * .6, ym + (y - ym) * .8]);
    if (sg < 0) { pu = pu.map(([x, y]) => [-x, y]).reverse(); puT = puT.map(([x, y]) => [-x, y]).reverse(); }
    guscio(o.sc - pL / 2, o.sc + pL / 2, pu, puT, .3, (i, j, K) => (j === 2 && i > 0 && i <= K) ? [kS, 1, 'v'] : kL, 10, .95);
  }
  // viti alle estremità: sul piano agli angoli e sui fianchi
  for (const s of [sa + o.L * .1, sb - o.L * .1]) for (const sg of [1, -1]) {
    const n = nor(s), t = tan(s), u = new V3().crossVectors(n, t);
    rivetto(O, new THREE.Matrix4().makeBasis(t, u, n).setPosition(P(s, sg * (hw - 1.25), top)), { r: .4, k: kL, kNero: kN });
  }
  for (const s of [sa + 1.3, sb - 1.3]) for (const sg of [1, -1]) {
    const n = lat(s).multiplyScalar(sg), t = tan(s), u = new V3().crossVectors(n, t);
    rivetto(O, new THREE.Matrix4().makeBasis(t, u, n).setPosition(P(s, sg * hw, .9)), { r: .42, k: kL, kNero: kN });
  }
  return { sa, sb };
}
// testa piatta a filo con il centro scuro (viti a brugola piccole, rivetti); m come per vite()
export function rivetto(O, m, { r = .4, k = 'luc', kNero = 'nero', col = 1 } = {}) {
  const a = angoli(30 * D2R);
  O.loft([anello(tondo(.02), .05, a), anello(tondo(r * .75), .05, a), anello(tondo(r), .01, a), anello(tondo(r), -.2, a)],
    { mat: i => i === 0 ? kNero : [k, col], m, duriV: () => true });
}

// ————————————————————————————— quadrante: pezzi applicati —————————————————————————————
// riferimento sul quadrante: x locale = tangente, y locale = su (fuori dal quadrante), z locale = raggio
export function sulQuadrante(phi, scarto = 0, z = 0) {
  const r = v(Math.cos(phi), Math.sin(phi), 0), t = v(-Math.sin(phi), Math.cos(phi), 0);
  return new THREE.Matrix4().makeBasis(t, v(0, 0, 1), r).setPosition(t.x * scarto, t.y * scarto, z);
}
// elenco dei pezzi applicati di un quadrante a bastoni: [phi, largh, scarto, r0, r1, alto]
// I = { r0, r1, largh, alto, salta: [ore senza indice], doppio: [largh, scarto] per le 12, extra: [[gradi, largh, r0, r1]] }
export function indici(I) {
  const pezzi = [];
  for (let h = 1; h <= 12; h++) {
    const phi = (90 - h * 30) * D2R;
    if ((I.salta ?? []).includes(h)) continue;
    if (h === 12 && I.doppio) for (const sg of [-1, 1]) pezzi.push([phi, I.doppio[0], sg * I.doppio[1], I.r0, I.r1, I.alto]);
    else pezzi.push([phi, I.largh, 0, I.r0, I.r1, I.alto]);
  }
  for (const [g, w, r0, r1] of I.extra ?? []) pezzi.push([g * D2R, w, 0, r0, r1, I.alto * .9]);
  return pezzi;
}
// indice a bastone: listello con il piano in cima (ruolo kTop, di serie lume) e smussi lucidi ai lati; z = quota del quadrante
export function indice(O, [phi, w, scarto, r0, r1, h], z, { k = 'lanc', kTop = 'lume' } = {}) {
  const s = [[-w / 2, 0], [-w / 2, h * .45], [-w / 2 + w * .15, h], [w / 2 - w * .15, h], [w / 2, h * .45], [w / 2, 0]];
  const tt = s.map(([x, y]) => [x * .78, y * .5]);
  O.loft([tt.map(([x, y]) => v(x, y, r0)), s.map(([x, y]) => v(x, y, r0 + .22)), s.map(([x, y]) => v(x, y, r1 - .22)), tt.map(([x, y]) => v(x, y, r1))],
    { duri: () => true, mat: (i, j, f) => f.y > .97 && i === 1 ? kTop : k, capoA: k, capoB: k, m: sulQuadrante(phi, scarto, z) });
}
// sagoma di un pezzo per l'ombra dipinta sul quadrante (mm, piano del quadrante)
export function sagomaIndice([phi, w, scarto, r0, r1]) {
  const c = Math.cos(phi), s = Math.sin(phi), q = (r, l) => [c * r - s * (scarto + l), s * r + c * (scarto + l)];
  return [q(r0, -w / 2), q(r1, -w / 2), q(r1, w / 2), q(r0, w / 2)];
}
// lancetta a bastone sfaccettata: ang (gradi, 0 = ore 3, antiorario), z (quota della base), h (spessore),
// prof = [[t, larghezza], …] lungo la lancetta (t < 0 = coda), lume = striscia bianca sul colmo
export function lancetta(O, { ang, z, h, prof, lume = true, k = 'lanc', kLume = 'lume', kSotto = 'luc' }) {
  const s = lume ? [[-.5, 0], [-.5, h * .35], [-.3, h], [.3, h], [.5, h * .35], [.5, 0]] : [[-.5, 0], [-.5, h * .3], [0, h], [.5, h * .3], [.5, 0]];
  const R = prof.map(([t, w]) => s.map(([x, y]) => v(x * w, y, t)));
  O.loft(R, { duri: () => true, mat: (i, j, f) => f.y < -.9 ? [kSotto, .5] : lume && j === 2 && i >= 1 && i < prof.length - 2 ? kLume : k, capoA: k, capoB: k, m: sulQuadrante(ang * D2R, 0, z) });
}
export function sagomaLancetta({ ang, prof }) {
  const phi = ang * D2R, c = Math.cos(phi), s = Math.sin(phi), q = (t, l) => [c * t - s * l, s * t + c * l];
  return [...prof.map(([t, w]) => q(t, -w / 2)), ...prof.slice().reverse().map(([t, w]) => q(t, w / 2))];
}
// perno centrale a gradini: [[raggio, z0, z1, ruolo], …]
export function pernoLancette(O, gradini) {
  const a = angoli(10 * D2R);
  for (const [r, z0, z1, k = 'lanc'] of gradini)
    O.loft([anello(tondo(.02), z1 + .03, a), anello(tondo(r * .82), z1, a), anello(tondo(r), z1 - .06, a), anello(tondo(r), z0, a)], { mat: k, liscioV: true, duriV: i => i === 2 });
}
