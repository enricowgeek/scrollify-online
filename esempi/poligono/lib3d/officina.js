// Pistola 3D · officina: strumenti geometrici per pezzi a facce nette (dalla libreria Lumen della gioielleria, adattata).
// Le facce si raccolgono per "ruolo" (chiave del materiale) e diventano un Mesh per ruolo: pochi disegni per pezzo.
// Unità: mm. Assi della pistola: +x verso la bocca, +y in alto, +z fianco destro (lato della finestra di espulsione).
// Strumenti nuovi rispetto a Lumen: faccia() (poligono con buchi in un piano qualsiasi), sfalsa() (sfalsamento di poligoni
// anche concavi, per lato), piastra() (sagoma estrusa con smussi a gradini e buchi passanti o tasche), tornio() (solidi di
// rotazione a facce nette), scatolaSmussata(), elica() (molla).
import * as THREE from 'three';

const V3 = THREE.Vector3, V2 = THREE.Vector2;
export const v = (x, y, z) => new V3(x, y, z);
export const v2 = (x, y) => new V2(x, y);
export const TAU = Math.PI * 2, D2R = Math.PI / 180;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// ————————————————————————————— raccolta delle facce —————————————————————————————
// ogni ruolo: posizione, normale, tangente (verso della satinatura), uv (mm), colore (occlusione finta: 1 = piena luce)
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
    if (n.lengthSq() < 1e-14) return;
    n.normalize();
    if (centro && n.dot(new V3().addVectors(a, c).multiplyScalar(.5).sub(centro)) < 0) return this.quad(k, d, c, b, a, dir, col);
    const t = tangente(n, dir), bt = new V3().crossVectors(n, t);
    const uv = p => [p.dot(t), p.dot(bt)];
    for (const p of [a, b, c, a, c, d]) this.punto(k, p, n, t, uv(p), col);
  }
  tri(k, a, b, c, dir, col = 1, verso = null) {
    const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
    if (n.lengthSq() < 1e-16) return;
    n.normalize();
    if (verso && n.dot(verso) < 0) return this.tri(k, a, c, b, dir, col);
    const t = tangente(n, dir), bt = new V3().crossVectors(n, t);
    for (const p of [a, b, c]) this.punto(k, p, n, t, [p.dot(t), p.dot(bt)], col);
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
  // faccia piana con buchi in un piano qualsiasi: contorno e buchi 2D (coordinate a, b), piano = { o, u, w } (o + a·u + b·w),
  // normale = u × w (o il suo opposto con inverti). dir = verso della satinatura
  faccia(k, contorno, buchi, piano, { dir = null, col = 1, inverti = false } = {}) {
    const C = contorno.map(p => p.isVector2 ? p : v2(p[0], p[1])), H = (buchi ?? []).map(b => b.map(p => p.isVector2 ? p : v2(p[0], p[1])));
    const tris = THREE.ShapeUtils.triangulateShape(C, H);
    const tutti = C.concat(...H);
    const N = new V3().crossVectors(piano.u, piano.w).normalize(); if (inverti) N.negate();
    const P3 = q => piano.o.clone().addScaledVector(piano.u, q.x).addScaledVector(piano.w, q.y);
    const d = dir ?? piano.u;
    if (typeof col === 'function') { for (const [a, b, c] of tris) this.triC(k, [P3(tutti[a]), P3(tutti[b]), P3(tutti[c])], d, [col(tutti[a]), col(tutti[b]), col(tutti[c])], N); }
    else for (const [a, b, c] of tris) this.tri(k, P3(tutti[a]), P3(tutti[b]), P3(tutti[c]), d, col, N);
  }
  // triangolo piatto con un colore (occlusione finta) per vertice
  triC(k, P, dir, C, verso) {
    const n = new V3().subVectors(P[1], P[0]).cross(new V3().subVectors(P[2], P[0]));
    if (n.lengthSq() < 1e-16) return;
    n.normalize();
    const o = verso && n.dot(verso) < 0 ? [0, 2, 1] : [0, 1, 2];
    if (o[1] === 2) n.negate();
    const t = tangente(n, dir), bt = new V3().crossVectors(n, t);
    for (const i of o) this.punto(k, P[i], n, t, [P[i].dot(t), P[i].dot(bt)], C[i]);
  }
  // triangolo con normali per vertice, verso deciso dalla normale di faccia f
  triN(k, P, N, U, T, f, col) {
    const x = new V3().subVectors(P[1], P[0]).cross(new V3().subVectors(P[2], P[0]));
    if (x.lengthSq() < 1e-20) return;
    const o = x.dot(f) < 0 ? [0, 2, 1] : [0, 1, 2];
    for (const i of o) this.punto(k, P[i], N[i], tangente(N[i], T[i]), U[i], col);
  }
  // loft: superficie fra anelli di punti (stesso numero di punti). La normale di faccia è cross(c-a, b-d); con fuori = punto (o funzione
  // (i, j) → punto) interno al solido, il verso si decide da lì (niente convenzioni da ricordare).
  // o = { chiuso, duri(j), liscioV, duriV(i), mat(i, j, f, P) → 'ruolo' | ['ruolo', col] | ['ruolo', col, 'v'] | null, col, capoA, capoB, m, dentro }
  loft(R, o = {}) {
    if (o.m) {
      const m = o.m, nm = new THREE.Matrix3().getNormalMatrix(m), dentro = this;
      const d = o.dentro ? (typeof o.dentro === 'function' ? o.dentro : () => o.dentro) : null;
      return this.loft.call({
        triN: (k, P, N, U, T, f, col) => dentro.triN(k, P.map(p => p.clone().applyMatrix4(m)), N.map(n => n.clone().applyMatrix3(nm).normalize()), U, T.map(t => t.clone().transformDirection(m)), f.clone().applyMatrix3(nm).normalize(), col),
      }, R, { ...o, m: null, dentroLocale: d });
    }
    const M = R.length, N = R[0].length, chiuso = o.chiuso !== false, E = chiuso ? N : N - 1;
    const duro = o.duri || (() => false), duroV = o.duriV || (() => !o.liscioV);
    const mat = typeof o.mat === 'function' ? o.mat : () => o.mat ?? 'luc';
    const col0 = o.col ?? 1;
    const dentro = o.dentroLocale ?? (o.dentro ? (typeof o.dentro === 'function' ? o.dentro : () => o.dentro) : null);
    const NF = [];
    for (let i = 0; i < M - 1; i++) {
      const riga = [];
      for (let j = 0; j < E; j++) {
        const j1 = (j + 1) % N, a = R[i][j], b = R[i][j1], c = R[i + 1][j1], d = R[i + 1][j];
        const n = new V3().subVectors(c, a).cross(new V3().subVectors(b, d)), l = n.length();
        if (l > 1e-12) {
          n.multiplyScalar(1 / l);
          if (dentro) { const cen = new V3().add(a).add(b).add(c).add(d).multiplyScalar(.25); if (n.dot(cen.clone().sub(dentro(i, j, cen))) < 0) n.negate(); }
          riga.push(n);
        } else riga.push(null);
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
      for (const si of strisce) for (const ej of lati) { const f = NF[si]?.[ej]; if (f) s.add(f); }
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
      if (!L.p.length) continue;
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
  // un Mesh per ruolo (una chiamata di disegno per materiale). materiali = { ruolo: Material }; un ruolo senza materiale è un errore
  mesh(materiali, nome = '') {
    const gruppo = new THREE.Group(); gruppo.name = nome;
    for (const [k, g] of Object.entries(this.geometrie())) {
      if (!materiali[k]) throw new Error(`pistola3d: nessun materiale per il ruolo "${k}"`);
      const m = new THREE.Mesh(g, materiali[k]); m.name = nome + ':' + k; gruppo.add(m);
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
export const vec2 = coppie => coppie.map(p => p.isVector2 ? p.clone() : v2(p[0], p[1]));
export function areaFirmata(P) { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
export const antiorario = P => areaFirmata(P) < 0 ? P.slice().reverse() : P;
export const orario = P => areaFirmata(P) > 0 ? P.slice().reverse() : P;
// sfalsamento: ogni lato i si sposta alla sua SINISTRA di d(i) (per un contorno antiorario = verso l'interno; per un buco orario = verso
// il pieno, cioè il buco si allarga). Vertici = incroci dei lati spostati (con limite dello spigolo: niente punte lunghe)
export function sfalsa(P, d) {
  const n = P.length, D = typeof d === 'function' ? d : () => d, out = [];
  const lato = i => { const a = P[i], b = P[(i + 1) % n], e = v2(b.x - a.x, b.y - a.y), L = e.length(); e.multiplyScalar(1 / (L || 1)); return { a, e, nn: v2(-e.y, e.x), d: D(i) }; };
  const L = Array.from({ length: n }, (_, i) => lato(i));
  for (let i = 0; i < n; i++) {
    const A = L[(i - 1 + n) % n], B = L[i];
    const pa = v2(A.a.x + A.nn.x * A.d, A.a.y + A.nn.y * A.d), pb = v2(B.a.x + B.nn.x * B.d, B.a.y + B.nn.y * B.d);
    const cr = A.e.x * B.e.y - A.e.y * B.e.x;
    let q;
    if (Math.abs(cr) < .02) {
      // lati quasi allineati: spostamento medio lungo la bisettrice
      const m = v2(A.nn.x + B.nn.x, A.nn.y + B.nn.y).normalize(), dd = (A.d + B.d) / 2, c = Math.max(.25, m.dot(B.nn));
      q = v2(P[i].x + m.x * dd / c, P[i].y + m.y * dd / c);
    } else {
      const t = ((pb.x - pa.x) * B.e.y - (pb.y - pa.y) * B.e.x) / cr;
      q = v2(pa.x + A.e.x * t, pa.y + A.e.y * t);
      const lim = 3 * Math.max(Math.abs(A.d), Math.abs(B.d), 1e-6);
      const dq = v2(q.x - P[i].x, q.y - P[i].y);
      if (dq.length() > lim) q = v2(P[i].x + dq.x / dq.length() * lim, P[i].y + dq.y / dq.length() * lim);
    }
    out.push(q);
  }
  return out;
}
// ritaglia un poligono con il semipiano a·x + b·y ≤ c (Sutherland–Hodgman: va bene quando il pezzo che resta è uno solo)
export function ritaglia(P, a, b, c) {
  const out = [], f = p => a * p.x + b * p.y - c;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], fp = f(p), fq = f(q);
    if (fp <= 0) out.push(p.clone());
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const t = fp / (fp - fq); out.push(v2(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t)); }
  }
  // via i punti doppi
  return out.filter((p, i) => p.distanceTo(out[(i + 1) % out.length]) > 1e-4);
}
// rettangolo con gli spigoli arrotondati (r, n punti per spigolo), antiorario; centro cx, cy, mezze misure hx, hy
export function rettangoloTondo(cx, cy, hx, hy, r, n = 4) {
  r = Math.min(r, hx, hy); const out = [];
  const c = [[cx + hx - r, cy - hy + r, -Math.PI / 2], [cx + hx - r, cy + hy - r, 0], [cx - hx + r, cy + hy - r, Math.PI / 2], [cx - hx + r, cy - hy + r, Math.PI]];
  for (const [x, y, a0] of c) for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI / 2; out.push(v2(x + Math.cos(a) * r, y + Math.sin(a) * r)); }
  return out;
}
// poligono con gli spigoli arrotondati: ogni vertice sostituito da un arco di raggio r (n punti); P antiorario o orario
export function arrotonda(P, r, n = 4) {
  const out = [], N = P.length, R = typeof r === 'function' ? r : () => r;
  for (let i = 0; i < N; i++) {
    const a = P[(i - 1 + N) % N], b = P[i], c = P[(i + 1) % N], rr = R(i);
    const e1 = v2(a.x - b.x, a.y - b.y), e2 = v2(c.x - b.x, c.y - b.y), l1 = e1.length(), l2 = e2.length();
    e1.multiplyScalar(1 / l1); e2.multiplyScalar(1 / l2);
    const ang = Math.acos(clamp(e1.dot(e2), -1, 1));
    if (rr <= 0 || ang > Math.PI - .05) { out.push(b.clone()); continue; }
    const t = Math.min(rr / Math.tan(ang / 2), l1 * .45, l2 * .45);
    const p1 = v2(b.x + e1.x * t, b.y + e1.y * t), p2 = v2(b.x + e2.x * t, b.y + e2.y * t);
    // arco di Bézier quadratico (abbastanza tondo per raggi piccoli)
    for (let k = 0; k <= n; k++) { const s = k / n, u = 1 - s; out.push(v2(u * u * p1.x + 2 * u * s * b.x + s * s * p2.x, u * u * p1.y + 2 * u * s * b.y + s * s * p2.y)); }
  }
  return out;
}
export const cerchio2 = (r, n, cx = 0, cy = 0, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + i / n * TAU; return v2(cx + Math.cos(a) * r, cy + Math.sin(a) * r); });
// asola (stadio) da p a q, larghezza w, antioraria
export function asola(p, q, w, n = 6) {
  const d = v2(q.x - p.x, q.y - p.y).normalize(), nn = v2(-d.y, d.x), a0 = Math.atan2(nn.y, nn.x), out = [];
  for (let i = 0; i <= n; i++) { const a = a0 + i / n * Math.PI; out.push(v2(p.x + Math.cos(a) * w / 2, p.y + Math.sin(a) * w / 2)); }
  for (let i = 0; i <= n; i++) { const a = a0 + Math.PI + i / n * Math.PI; out.push(v2(q.x + Math.cos(a) * w / 2, q.y + Math.sin(a) * w / 2)); }
  return out;
}
// x del bordo del poligono sulla riga y: il più a destra (lato = 1) o il più a sinistra (lato = −1)
export function bordoX(P, y, lato = 1) {
  let best = null;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue;
    const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
    if (best === null || (lato > 0 ? x > best : x < best)) best = x;
  }
  return best;
}

// ————————————————————————————— piastra —————————————————————————————
// sagoma 2D (piano locale xy, antioraria) estrusa lungo z locale da z0 a z1, con smussi a gradini sui due lati e buchi.
// o = {
//   contorno, buchi: [{ punti, tasca: profondità (solo sul lato z1) | undefined = passante, k: ruolo del fondo }],
//   z0, z1, smussi: [[dxy, dz], …] dal fianco verso la faccia (di serie [[.6, .6]]), smussiA (lato z0, di serie = smussi),
//   molt(i) → moltiplicatore dello smusso del lato i (0 = spigolo vivo, il fianco sale dritto; 2 = rastrema di più),
//   pareti(i) → false = il fianco del lato i non si costruisce (lo fa chi chiama), m (Matrix4), k (ruolo), kFaccia, kFianco, kSmusso,
//   dir (satinatura: 'x' | 'lungo' = lungo i lati), col, colFianco, colBuco }
export function piastra(O, o) {
  const P0 = vec2(o.contorno), rev = areaFirmata(P0) < 0, P = rev ? P0.slice().reverse() : P0, nP = P.length;
  const m = o.m ?? null, nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  // se il contorno era orario è stato girato: il lato i del girato è il lato (n − 2 − i) dell'originale
  const indice = i => rev ? ((nP - 2 - i) % nP + nP) % nP : i;
  const sm = o.smussi ?? [[.6, .6]], smA = o.smussiA ?? sm, molt = o.molt ? (i => o.molt(indice(i))) : (() => 1);
  const k = o.k ?? 'poli', kF = o.kFaccia ?? k, kL = o.kFianco ?? k, kS = o.kSmusso ?? kL;
  const colF = o.colFianco ?? o.col ?? 1, colB = o.colBuco ?? .55;
  const T = p => { const q = v(p.x, p.y, p.z); return m ? q.applyMatrix4(m) : q; };
  const TD = d => m ? d.clone().transformDirection(m) : d.clone();
  const dirX = TD(v(1, 0, 0));
  const q = (kk, a, b, c, d, dir, col) => O.quad(kk, T(a), T(b), T(c), T(d), dir, col);
  const buchi = (o.buchi ?? []).map(b => ({ ...b, punti: orario(vec2(b.punti ?? b)) }));
  const passanti = buchi.filter(b => b.tasca === undefined), tasche = buchi.filter(b => b.tasca !== undefined);
  const dzTot = s => s.reduce((t, [, dz]) => t + dz, 0);
  const zA = o.z0 + dzTot(smA), zB = o.z1 - dzTot(sm);
  // anelli dello smusso: [ [poligono, z], … ] dal fianco alla faccia
  const anelli = (Q, s, z, verso, mm = molt) => {
    const out = [[Q, z]]; let dxy = 0, zz = z;
    for (const [d, dz] of s) { dxy += d; zz += verso * dz; out.push([sfalsa(Q, i => dxy * mm(i)), zz]); }
    return out;
  };
  const fasciaRing = (kk, A, zA_, B, zB_, dirLato, col, salta = null) => {
    const n = A.length;
    for (let i = 0; i < n; i++) {
      if (salta && salta(i)) continue;
      const j = (i + 1) % n;
      const a = v(A[i].x, A[i].y, zA_), b = v(A[j].x, A[j].y, zA_), c = v(B[j].x, B[j].y, zB_), d = v(B[i].x, B[i].y, zB_);
      // verso: il fianco guarda a destra del lato (fuori per un antiorario, dentro al buco per un orario = fuori dal pieno)
      const e = v(A[j].x - A[i].x, A[j].y - A[i].y, 0), fuori = v(e.y, -e.x, 0);
      const nrm = new V3().subVectors(c, a).cross(new V3().subVectors(d, b));
      const dir = dirLato === 'lungo' ? TD(e) : dirX;
      if (nrm.dot(fuori) + nrm.z * 0 < 0 && Math.abs(zB_ - zA_) > 1e-9) q(kk, b, a, d, c, dir, col); else q(kk, a, b, c, d, dir, col);
    }
  };
  const dirL = o.dir ?? 'lungo';
  // contorno: fianco dritto + smussi sui due lati
  const top = anelli(P, sm, zB, 1), bot = anelli(P, smA, zA, -1);
  const salta = o.pareti ? i => o.pareti(indice(i)) === false : null;
  fasciaRing(kL, P, zA, P, zB, dirL, colF, salta);
  for (let s = 0; s + 1 < top.length; s++) fasciaRing(kS, top[s][0], top[s][1], top[s + 1][0], top[s + 1][1], dirL, colF, salta);
  for (let s = 0; s + 1 < bot.length; s++) fasciaRing(kS, bot[s + 1][0], bot[s + 1][1], bot[s][0], bot[s][1], dirL, colF, salta);
  // buchi passanti: fianco dentro + smussi (il buco si allarga verso le facce)
  const capBuchiT = [], capBuchiB = [];
  for (const b of passanti) {
    const H = b.punti;
    // smussi del buco: dxy suoi (o 0,7 di quelli del contorno), dz sempre quelli del contorno (le facce restano piane)
    const dxy = (b.smussi ?? sm.map(([d]) => [d * .7])).map(x => x[0]);
    const sbT = sm.map(([, dz], i) => [dxy[i] ?? dxy.at(-1), dz]), sbB = smA.map(([, dz], i) => [dxy[i] ?? dxy.at(-1), dz]);
    const tB = anelli(H, sbT, zB, 1, () => 1), bB = anelli(H, sbB, zA, -1, () => 1);
    fasciaRing(kL, H, zA, H, zB, dirL, colB);
    for (let s = 0; s + 1 < tB.length; s++) fasciaRing(kS, tB[s][0], tB[s][1], tB[s + 1][0], tB[s + 1][1], dirL, colB);
    for (let s = 0; s + 1 < bB.length; s++) fasciaRing(kS, bB[s + 1][0], bB[s + 1][1], bB[s][0], bB[s][1], dirL, colB);
    capBuchiT.push(tB.at(-1)[0]); capBuchiB.push(bB.at(-1)[0]);
  }
  // tasche sul lato z1: bordo (piccolo smusso), pareti, fondo
  const capTasche = [];
  for (const b of tasche) {
    const H = b.punti, zt = o.z1, zf = o.z1 - b.tasca, e = b.smusso ?? Math.min(.25, b.tasca * .6);
    const H1 = sfalsa(H, e);   // bordo della tasca sulla faccia (più largo)
    fasciaRing(kS, H, zt - e, H1, zt, dirL, 1);
    fasciaRing(b.kParete ?? kL, H, zf, H, zt - e, dirL, .6);
    const piano = { o: T(v(0, 0, zf)), u: TD(v(1, 0, 0)), w: TD(v(0, 1, 0)) };
    O.faccia(b.k ?? kF, antiorario(H), [], piano, { dir: dirX, col: b.colFondo ?? .9 });
    capTasche.push(H1);
  }
  // facce: z1 (normale +z) e z0 (normale −z)
  const pT = { o: T(v(0, 0, top.at(-1)[1])), u: TD(v(1, 0, 0)), w: TD(v(0, 1, 0)) };
  O.faccia(kF, top.at(-1)[0], [...capBuchiT, ...capTasche.map(h => orario(h))], pT, { dir: o.dirFaccia ? TD(o.dirFaccia) : dirX, col: o.colFaccia ?? o.col ?? 1 });
  if (!o.senzaFondo) {
    const pB = { o: T(v(0, 0, bot.at(-1)[1])), u: TD(v(1, 0, 0)), w: TD(v(0, 1, 0)) };
    O.faccia(o.kRetro ?? kF, bot.at(-1)[0], capBuchiB, pB, { dir: o.dirFaccia ? TD(o.dirFaccia) : dirX, col: o.colFaccia ?? o.colRetro ?? o.col ?? 1, inverti: true });
  }
  return { P, zA, zB };
}
// scatola smussata (tutti gli spigoli): centro c (locale), mezze misure h = [hx, hy, hz], smusso s; m = Matrix4
export function scatolaSmussata(O, k, c, h, s, { m = null, dir = v(1, 0, 0), col = 1, kFaccia = null, smussi = null } = {}) {
  const [hx, hy, hz] = h;
  const base = new THREE.Matrix4().makeTranslation(c[0], c[1], c[2]);
  piastra(O, {
    contorno: [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]], z0: -hz, z1: hz, smussi: smussi ?? [[s, s]], k, kFaccia: kFaccia ?? k,
    m: m ? m.clone().multiply(base) : base, dir: 'x', col,
  });
}

// ————————————————————————————— tornio —————————————————————————————
// solido di rotazione attorno all'asse x locale: profilo [[x, r, ruolo?, liscio?], …] (ruolo del tratto che PARTE da quel punto;
// liscio = normali mediate con il tratto successivo, per curve come l'ogiva). Il pieno sta a destra del verso di percorrenza
// (dal retro verso il fronte in fuori: normali verso fuori). seg = spicchi. m = Matrix4 (posa dell'asse)
export function tornio(O, prof, { seg = 32, m = null, k = 'acc', col = 1, a0 = 0 } = {}) {
  const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  const T = p => m ? p.applyMatrix4(m) : p, TN = n => m ? n.applyMatrix3(nm).normalize() : n, TD = d => m ? d.transformDirection(m) : d;
  const ang = Array.from({ length: seg + 1 }, (_, i) => a0 + i / seg * TAU);
  const P = prof.map(p => ({ x: p[0], r: p[1], k: p[2] ?? k, liscio: !!p[3], col: p[4] ?? col }));
  // normale (assiale, radiale) di ogni tratto
  const NT = [];
  for (let i = 0; i + 1 < P.length; i++) { const dx = P[i + 1].x - P[i].x, dr = P[i + 1].r - P[i].r, L = Math.hypot(dx, dr) || 1; NT.push([-dr / L, dx / L]); }
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1]; if (Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.r - b.r) < 1e-9) continue;
    const n0 = NT[i], nA = (a.liscio === false || i === 0 || !P[i - 1].liscio) ? n0 : media(NT[i - 1], n0), nB = (!b.liscio || i + 1 >= NT.length) ? n0 : media(n0, NT[i + 1]);
    for (let s = 0; s < seg; s++) {
      const t0 = ang[s], t1 = ang[s + 1], tm = (t0 + t1) / 2;
      const Q = (x, r, t) => T(v(x, Math.cos(t) * r, Math.sin(t) * r));
      const N = (n, t) => TN(v(n[0], Math.cos(t) * n[1], Math.sin(t) * n[1]));
      const p00 = Q(a.x, a.r, t0), p01 = Q(a.x, a.r, t1), p11 = Q(b.x, b.r, t1), p10 = Q(b.x, b.r, t0);
      const f = N(n0, tm), dirT = TD(v(0, -Math.sin(tm), Math.cos(tm)));
      const n00 = N(nA, t0), n01 = N(nA, t1), n11 = N(nB, t1), n10 = N(nB, t0);
      const uv = (x, t, r) => [x, t * Math.max(r, .5)];
      if (a.r > 1e-6) O.triN(a.k, [p00, p01, p11], [n00, n01, n11], [uv(a.x, t0, a.r), uv(a.x, t1, a.r), uv(b.x, t1, b.r)], [dirT, dirT, dirT], f, a.col);
      if (b.r > 1e-6) O.triN(a.k, [p00, p11, p10], [n00, n11, n10], [uv(a.x, t0, a.r), uv(b.x, t1, b.r), uv(b.x, t0, b.r)], [dirT, dirT, dirT], f, a.col);
    }
  }
}
function media(a, b) { const x = a[0] + b[0], y = a[1] + b[1], L = Math.hypot(x, y) || 1; return [x / L, y / L]; }
// matrice che porta l'asse x locale lungo la direzione d con l'origine in p (e l'asse y locale il più possibile verso su)
export function asse(p, d, su = v(0, 1, 0)) {
  const x = d.clone().normalize(); let z = new V3().crossVectors(x, su); if (z.lengthSq() < 1e-8) z = new V3().crossVectors(x, v(0, 0, 1)); z.normalize();
  const y = new V3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
}

// ————————————————————————————— elica (molla) —————————————————————————————
// tubo di raggio rf lungo un'elica di raggio R attorno all'asse x locale, da x0 a x1 con giri spire; estremi chiusi e appiattiti
export function elica(O, k, { R, rf, x0, x1, giri, passiGiro = 18, lati = 7, m = null, col = 1, piatte = 1 }) {
  const n = Math.round(giri * passiGiro), anelli = [];
  const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
  for (let i = 0; i <= n; i++) {
    const s = i / n, th = s * giri * TAU;
    // spire di testa più fitte (molla vera): la coordinata x cresce più piano sulle prime e ultime "piatte" spire
    const g = giri, sp = piatte / g, xs = s < sp ? s * .35 / 1 : s > 1 - sp ? 1 - (1 - s) * .35 : null;
    const xx = xs === null ? (.35 * sp + (s - sp) / (1 - 2 * sp) * (1 - 2 * .35 * sp)) : xs;
    const c = v(x0 + (x1 - x0) * xx, Math.cos(th) * R, Math.sin(th) * R);
    const tg = v((x1 - x0) / (g * TAU) * (xs === null ? 1 : .35), -Math.sin(th) * R, Math.cos(th) * R).normalize();
    const nr = v(0, Math.cos(th), Math.sin(th)), bn = new V3().crossVectors(tg, nr).normalize(), nn = new V3().crossVectors(bn, tg).normalize();
    const anello = [];
    for (let j = 0; j < lati; j++) { const a = j / lati * TAU; anello.push(c.clone().addScaledVector(nn, Math.cos(a) * rf).addScaledVector(bn, Math.sin(a) * rf)); }
    anelli.push({ c, a: anello });
  }
  O.loft(anelli.map(x => x.a), { mat: [k, col], liscioV: true, dentro: (i) => anelli[i].c, capoA: k, capoB: k, m });
}

// linea sottile (larghezza w) lungo una polilinea 2D, appoggiata sul piano z (normale +z se lato > 0, −z se no): linee di stampo, solchi
export function linea(O, k, punti, z, w, lato = 1, col = 1) {
  const P = vec2(punti);
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], d = v2(b.x - a.x, b.y - a.y), L = d.length(); if (L < 1e-6) continue;
    d.multiplyScalar(1 / L); const n = v2(-d.y * w / 2, d.x * w / 2), e = v2(d.x * w / 2, d.y * w / 2);
    // un filo più lunga ai due capi: le giunture si coprono
    const q = [v(a.x - n.x - e.x, a.y - n.y - e.y, z), v(b.x - n.x + e.x, b.y - n.y + e.y, z), v(b.x + n.x + e.x, b.y + n.y + e.y, z), v(a.x + n.x - e.x, a.y + n.y - e.y, z)];
    O.tri(k, q[0], q[1], q[2], v(d.x, d.y, 0), col, v(0, 0, lato)); O.tri(k, q[0], q[2], q[3], v(d.x, d.y, 0), col, v(0, 0, lato));
  }
}
