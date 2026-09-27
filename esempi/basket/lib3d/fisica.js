// Rimbalzo 3D · la fisica, tutta calcolata PRIMA (all'avvio) e poi letta in funzione del tempo virtuale s (secondi):
// così lo scroll può andare avanti e indietro, fermarsi a metà di un rimbalzo, tornare su, e tutto si riavvolge senza stati.
//  · creaTraiettoria(): la palla dall'apertura al finale. Tratti scritti a mano (in mano, due palleggi con lo schiacciamento a
//    terra, raccolta, gesto del tiro) e tratti simulati (volo con il backspin, urto sul tabellone con attrito e spin, passaggio
//    nel ferro, frenata nella retina, caduta, rimbalzi a terra con l'effetto del backspin che la riporta verso chi ha tirato,
//    rotolamento fino a fermarsi). 240 campioni al secondo: posizione, orientamento (quaternione), schiacciamento.
//  · creaRete(traiettoria): la retina (12 maglie, 5 giri di rombi, fili divisi a metà) simulata a 480 Hz con vincoli di
//    lunghezza (dinamica a posizioni), gravità, attrito dell'aria, urto con la palla (nodi e fili spinti fuori dalla sfera,
//    trascinati dalla superficie della palla). Si registra a 240 Hz dal momento in cui la palla entra fino a quando la rete è ferma.
// Unità: metri, secondi. Assi: x a destra (visto da chi tira), y in alto, z verso chi tira; fondo campo a z = 0.
import * as THREE from 'three';

export const R_PALLA = 0.12;
// canestro regolamentare: tabellone 1,80 × 1,05 con il bordo basso a 2,90 e la faccia a 1,20 dal fondo; ferro Ø 45 cm (interno)
// con il bordo alto a 3,05, il centro a 15 cm + 22,5 cm dal tabellone; tubo Ø 18 mm
export const CAN = {
  zVetro: 1.2, yBasso: 2.9, largh: 1.8, alt: 1.05, spess: 0.012,
  anello: { x: 0, y: 3.041, z: 1.575, R: 0.234, tubo: 0.009 },   // R e y: il centro del tubo
};
export const OCCHI = { x: 0, y: 1.65, z: 6.1 };   // chi tira: sulla linea del tiro libero (a 5,80), 30 cm dietro
const G = 9.81;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ——— punti della coreografia ———
export const PUNTI = {
  mano: V(0.16, 1.4, 5.45),        // in mano all'apertura: davanti al petto, a destra (dallo schermo spunta solo la parte alta)
  palleggio: V(0.2, 0.98, 5.48),    // la mano del palleggio (all'altezza della vita)
  terra: V(0.22, R_PALLA, 5.3),     // dove batte il palleggio
  tasca: V(0.15, 1.38, 5.47),       // raccolta prima del tiro (davanti al petto: spunta in basso nel quadro)
  rilascio: V(0.1, 2.02, 5.66),     // la palla lascia le dita
  tabellone: V(0.035, 3.33, CAN.zVetro + R_PALLA),   // centro della palla quando tocca il vetro (dentro il rettangolo, in alto)
};
// tempi (secondi virtuali)
export const T = {
  preparaA: 0.35,                   // dalla presa d'apertura alla mano del palleggio
  palleggio: 0.5,                   // durata di un palleggio (due)
  raccoltaA: 1.95,                  // fine della raccolta (tasca)
  rilascio: 2.15,                   // fine del gesto: la palla parte
  volo: 1.05,                       // dal rilascio al tabellone
};
T.palleggiDa = T.preparaA; T.palleggiA = T.preparaA + 2 * T.palleggio; T.tabellone = T.rilascio + T.volo;

// Hermite (posizioni e velocità agli estremi, durata d)
function hermite(out, a, va, b, vb, u, d) {
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  out.set(0, 0, 0).addScaledVector(a, h00).addScaledVector(va, h10 * d).addScaledVector(b, h01).addScaledVector(vb, h11 * d);
  return out;
}
const liscia = t => t * t * (3 - 2 * t);
const seg = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));

// urto con attrito e spin (sfera cava: I = 2/3 m r²). n: normale del contatto (dalla superficie verso la palla).
// Aggiorna v e w (velocità angolare, mondo) sul posto; restituisce la velocità d'urto normale
function urto(v, w, n, e, mu) {
  const rc = n.clone().multiplyScalar(-R_PALLA);               // dal centro al punto di contatto
  const vc = v.clone().add(w.clone().cross(rc));               // velocità del punto di contatto
  const vn = vc.dot(n);
  if (vn >= 0) return 0;
  const jn = -(1 + e) * vn;
  v.addScaledVector(n, jn);
  const vt = vc.clone().addScaledVector(n, -vn), s = vt.length();
  if (s > 1e-6) {
    const jt = Math.min(s / 2.5, mu * jn), t = vt.divideScalar(s);
    const J = t.multiplyScalar(-jt);                           // impulso d'attrito (per unità di massa), contro lo strisciamento
    v.add(J);
    w.add(rc.clone().cross(J).divideScalar((2 / 3) * R_PALLA * R_PALLA));
  }
  return -vn;
}

export function creaTraiettoria(O = {}) {
  const HZ = 240, DT = 1 / HZ;
  const pos = [], quat = [], sq = [];
  const q = new THREE.Quaternion(), p = V(0, 0, 0), tmp = V(0, 0, 0);
  const push = (pp, qq, s) => { pos.push(pp.x, pp.y, pp.z); quat.push(qq.x, qq.y, qq.z, qq.w); sq.push(s); };
  const ruota = (qq, w, dt) => {                                 // integra la velocità angolare w (mondo) per dt
    const a = w.length() * dt; if (a < 1e-9) return qq;
    const d = new THREE.Quaternion().setFromAxisAngle(tmp.copy(w).normalize(), a); return qq.premultiply(d).normalize();
  };
  // orientamenti: in mano con il "+" delle cuciture verso chi guarda e un poco girato; al tiro l'asse delle cuciture si mette di
  // traverso (il giro all'indietro fa rotolare i due anelli uno sopra l'altro: si legge bene)
  const Qmano = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.35, 0.12));
  const Qtiro = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, Math.PI / 2 + 0.2, 0.1));
  const { mano, palleggio, terra, tasca, rilascio, tabellone } = PUNTI;
  const zero = V(0, 0, 0);
  // velocità di rilascio: arriva al tabellone in T.volo
  const vR = tabellone.clone().sub(rilascio).addScaledVector(V(0, -G, 0), -0.5 * T.volo * T.volo).divideScalar(T.volo);
  const wTiro = V(13.8, 0, 0);                                   // backspin: 2,2 giri al secondo (la cima va verso chi tira)
  const ev = { vR: vR.clone() };

  // ——— tratti scritti: da 0 al rilascio ———
  const vImp = 4.6, vRis = 3.7;                                   // velocità del palleggio a terra (giù, su)
  let ang = 0;                                                   // rotazione del palleggio (in avanti) accumulata
  const nS = Math.round(T.rilascio * HZ);
  for (let i = 0; i < nS; i++) {
    const s = i * DT; let sc = 0;
    if (s < T.preparaA) {
      const u = liscia(s / T.preparaA);
      p.copy(mano).lerp(palleggio, u); q.copy(Qmano);
    } else if (s < T.palleggiA) {
      const k = Math.floor((s - T.palleggiDa) / T.palleggio), tau = (s - T.palleggiDa - k * T.palleggio) / T.palleggio;
      const giu = 0.4, con = 0.46, dG = giu * T.palleggio, dS = (1 - con) * T.palleggio;
      if (tau < giu) {                                           // spinta e discesa (la mano accompagna, poi la palla va)
        const u = tau / giu;
        hermite(p, palleggio, zero, terra, V(0.02, -vImp, -0.3), u, dG);
      } else if (tau < con) {                                    // a terra: si schiaccia e si riprende
        const u = (tau - giu) / (con - giu); p.copy(terra); sc = 0.075 * Math.sin(Math.PI * u);
      } else {                                                   // risale e la mano la riprende in cima
        const u = (tau - con) / (1 - con);
        hermite(p, terra, V(-0.02, vRis, 0.3), palleggio, zero, u, dS);
      }
      p.y = Math.max(p.y, R_PALLA);
      // gira in avanti a ogni spinta (0,45 rad) e un poco su se stessa
      const a = (k + liscia(Math.min(1, tau / 0.9))) * 0.45;
      q.copy(Qmano).premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-a, 0.12 * Math.sin(a * 2), 0)));
      ang = a;
    } else if (s < T.raccoltaA) {                                // raccolta: dalla mano del palleggio alla tasca, gira verso la presa di tiro
      const u = (s - T.palleggiA) / (T.raccoltaA - T.palleggiA);
      hermite(p, palleggio, zero, tasca, zero, liscia(u), 1);
      p.x += 0.07 * Math.sin(Math.PI * u);                       // raccolta sul lato della mano forte (a destra)
      const qa = Qmano.clone().premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, 0.12 * Math.sin(ang * 2), 0)));
      q.copy(qa).slerp(Qtiro, liscia(u));
    } else {                                                     // il gesto: dalla tasca (ferma) al rilascio (in corsa)
      const u = (s - T.raccoltaA) / (T.rilascio - T.raccoltaA), d = T.rilascio - T.raccoltaA;
      hermite(p, tasca, zero, rilascio, vR, u, d);
      q.copy(Qtiro);
      // il backspin cresce mentre le dita spingono (angolo = integrale della velocità: ω u² d / 2)
      if (u > 0) q.premultiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), wTiro.x * u * u * d / 2));
    }
    push(p, q, sc);
  }
  // ——— tratti simulati: volo, tabellone, ferro, retina, caduta, rimbalzi, rotolamento ———
  const v = vR.clone(), w = wTiro.clone();
  p.copy(rilascio);
  q.copy(Qtiro).premultiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), wTiro.x * (T.rilascio - T.raccoltaA) / 2));
  const A = CAN.anello;
  let s = T.rilascio, fase = 'volo', attesa = 0, schiaccia = null, fermo = null;
  const nRete = { yIn: A.y + 0.01, yOut: A.y - 0.47 };
  const eventi = { urti: [] };
  const SUB = 8, dt = DT / SUB;
  for (let guardia = 0; guardia < 60 * HZ; guardia++) {
    let sc = 0;
    for (let k = 0; k < SUB; k++) {
      if (schiaccia) { schiaccia.t += dt; if (schiaccia.t >= schiaccia.d) schiaccia = null; continue; }   // a terra: la palla si schiaccia, il tempo passa
      if (fermo) { continue; }
      // forze
      const a = V(0, -G, 0);
      const dentroRete = p.y < nRete.yIn && p.y > nRete.yOut && fase === 'retina';
      if (dentroRete) {
        // la retina frena (in verticale) e riporta la palla verso l'asse (molla e smorzatore orizzontali); lo spin si spegne
        const hx = p.x - A.x, hz = p.z - A.z;
        a.y += -3.0 * v.y;
        a.x += -60 * hx - 30 * v.x; a.z += -90 * hz - 9 * v.z;
        w.multiplyScalar(Math.exp(-16 * dt));
      }
      v.addScaledVector(a, dt); p.addScaledVector(v, dt); ruota(q, w, dt);
      // tabellone
      if (fase === 'volo' && p.z - R_PALLA <= CAN.zVetro) {
        p.z = CAN.zVetro + R_PALLA;
        const vin = v.clone();
        urto(v, w, V(0, 0, 1), 0.55, 0.35);
        eventi.tabellone = { s: s + k * dt, p: p.clone(), vin, vout: v.clone(), w: w.clone() };
        fase = 'ferro';
      }
      if (fase === 'ferro' && p.y < A.y) { fase = 'retina'; eventi.ferro = { s: s + k * dt, p: p.clone(), v: v.clone() }; }
      if (fase === 'retina' && p.y < nRete.yOut) { fase = 'caduta'; eventi.fuori = { s: s + k * dt, p: p.clone(), v: v.clone() }; }
      // pavimento
      if ((fase === 'caduta' || fase === 'terra') && p.y <= R_PALLA) {
        p.y = R_PALLA;
        const vi = urto(v, w, V(0, 1, 0), 0.7, 0.6);
        eventi.urti.push({ s: s + k * dt, vi, v: v.clone() });
        fase = 'terra';
        if (vi > 0.9) schiaccia = { t: 0, d: 0.022, amp: Math.min(0.085, 0.085 * vi / 7) };
        if (v.y < 0.55) { v.y = 0; fase = 'rotola'; }
      }
      if (fase === 'rotola') {
        p.y = R_PALLA; v.y = 0;
        const vh = Math.hypot(v.x, v.z);
        if (vh < 0.01) { fermo = s + k * dt; v.set(0, 0, 0); w.set(0, 0, 0); }
        else {
          const k2 = Math.max(0, vh - 0.32 * dt) / vh; v.x *= k2; v.z *= k2;
          w.set(v.z / R_PALLA, 0, -v.x / R_PALLA);             // rotola senza strisciare
        }
      }
    }
    s += DT;
    if (schiaccia) sc = schiaccia.amp * Math.sin(Math.PI * schiaccia.t / schiaccia.d);
    const pp = p.clone(); if (sc) pp.y = R_PALLA * (1 - sc);
    push(pp, q, sc);
    if (fermo && s > fermo + 0.6) break;
  }
  const P = new Float32Array(pos), Q = new Float32Array(quat), S = new Float32Array(sq), N = S.length;
  const FINE = (N - 1) * DT;
  const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
  // posa della palla al tempo s: posizione, quaternione, schiacciamento (interpolati fra i campioni)
  function posa(s, outP, outQ) {
    const x = Math.min(FINE, Math.max(0, s)) * HZ, i = Math.min(N - 2, Math.floor(x)), f = x - i;
    outP.set(P[i * 3] + (P[i * 3 + 3] - P[i * 3]) * f, P[i * 3 + 1] + (P[i * 3 + 4] - P[i * 3 + 1]) * f, P[i * 3 + 2] + (P[i * 3 + 5] - P[i * 3 + 2]) * f);
    if (outQ) { _qa.fromArray(Q, i * 4); _qb.fromArray(Q, i * 4 + 4); outQ.copy(_qa).slerp(_qb, f); }
    return S[i] + (S[i + 1] - S[i]) * f;
  }
  const vel = (s, out) => { const a = V(0, 0, 0), b = V(0, 0, 0); posa(s - 0.004, a); posa(s + 0.004, b); return out.copy(b).sub(a).divideScalar(0.008); };
  return { HZ, FINE, posa, vel, eventi, ev, fermo: eventi.fermo ?? null, n: N };
}

// ————————————————————— la retina —————————————————————
// 12 attacchi sotto il ferro, 5 giri di nodi sfalsati di mezza maglia (rombi), ogni filo diviso a metà (un nodo in mezzo):
// 12 × 6 nodi + 120 nodi di mezzo = 192. Forma disegnata (prima della gravità): raggi e altezze qui sotto; poi si lascia
// assestare 2 s con la gravità e quella è la retina ferma.
export const RETE = { N: 12, giri: 5, raggi: [0.231, 0.203, 0.176, 0.152, 0.132, 0.117], passi: [0, 0.09, 0.18, 0.268, 0.354, 0.438], filo: 0.0036 };

export function creaRete(traiettoria) {
  const { N, giri } = RETE, A = CAN.anello;
  const y0 = A.y - A.tubo - 0.006;                              // i ganci sotto il tubo
  const nodi = [], fissi = [];
  const idx = (r, i) => r * N + ((i % N) + N) % N;
  for (let r = 0; r <= giri; r++) for (let i = 0; i < N; i++) {
    const a = 2 * Math.PI * (i + r / 2) / N, R = RETE.raggi[r];
    nodi.push(A.x + R * Math.sin(a), y0 - RETE.passi[r], A.z + R * Math.cos(a)); fissi.push(r === 0);
  }
  const nNodi0 = nodi.length;
  // fili: (r, i) → (r+1, i) e (r, i) → (r+1, i−1), ciascuno in due tratti con un nodo in mezzo
  const tratti = [], fili = [];
  const aggiungiNodo = (x, y, z) => { nodi.push(x, y, z); fissi.push(false); return nodi.length / 3 - 1; };
  for (let r = 0; r < giri; r++) for (let i = 0; i < N; i++) for (const d of [0, -1]) {
    const a = idx(r, i), b = idx(r + 1, i + d);
    const m = aggiungiNodo((nodi[a * 3] + nodi[b * 3]) / 2, (nodi[a * 3 + 1] + nodi[b * 3 + 1]) / 2, (nodi[a * 3 + 2] + nodi[b * 3 + 2]) / 2);
    fili.push([a, m, b]);
    tratti.push([a, m], [m, b]);
  }
  const n = nodi.length / 3;
  const X = new Float32Array(nodi), Xp = new Float32Array(nodi), inv = new Float32Array(n);
  for (let i = 0; i < n; i++) inv[i] = fissi[i] ? 0 : 1;
  const L0 = new Float32Array(tratti.length);
  tratti.forEach(([a, b], k) => { L0[k] = Math.hypot(X[a * 3] - X[b * 3], X[a * 3 + 1] - X[b * 3 + 1], X[a * 3 + 2] - X[b * 3 + 2]); });
  const rC = R_PALLA + RETE.filo;
  const bp = V(0, 0, 0), bv = V(0, 0, 0), bq = new THREE.Quaternion();
  let palla = null;                                             // { c, v, w } quando la palla c'è
  function passo(dt) {
    const g = G * dt * dt;
    for (let i = 0; i < n; i++) {
      if (!inv[i]) continue;
      const k = i * 3;
      const vx = (X[k] - Xp[k]) * 0.994, vy = (X[k + 1] - Xp[k + 1]) * 0.994, vz = (X[k + 2] - Xp[k + 2]) * 0.994;
      Xp[k] = X[k]; Xp[k + 1] = X[k + 1]; Xp[k + 2] = X[k + 2];
      X[k] += vx; X[k + 1] += vy - g; X[k + 2] += vz;
    }
    for (let it = 0; it < 10; it++) {
      // lunghezze dei fili (un filo si tende, non si allunga: si accorcia pochissimo)
      for (let k = 0; k < tratti.length; k++) {
        const [a, b] = tratti[k], wa = inv[a], wb = inv[b], W = wa + wb; if (!W) continue;
        const dx = X[b * 3] - X[a * 3], dy = X[b * 3 + 1] - X[a * 3 + 1], dz = X[b * 3 + 2] - X[a * 3 + 2];
        const L = Math.hypot(dx, dy, dz) || 1e-9;
        if (L < L0[k] * 0.985) continue;                         // un filo più corto del suo riposo si affloscia (non spinge)
        const c = (L - L0[k]) / L / W;
        X[a * 3] += dx * c * wa; X[a * 3 + 1] += dy * c * wa; X[a * 3 + 2] += dz * c * wa;
        X[b * 3] -= dx * c * wb; X[b * 3 + 1] -= dy * c * wb; X[b * 3 + 2] -= dz * c * wb;
      }
      if (palla) urtoPalla(dt, it === 9);
    }
  }
  // la palla spinge fuori i nodi e i tratti di filo che la toccano; la sua superficie li trascina (attrito)
  function urtoPalla(dt, attrito) {
    const { c } = palla;
    for (let i = 0; i < n; i++) {
      if (!inv[i]) continue;
      const k = i * 3, dx = X[k] - c.x, dy = X[k + 1] - c.y, dz = X[k + 2] - c.z, d = Math.hypot(dx, dy, dz);
      if (d < rC && d > 1e-6) {
        const s = rC / d; X[k] = c.x + dx * s; X[k + 1] = c.y + dy * s; X[k + 2] = c.z + dz * s;
        if (attrito) {
          // velocità del nodo rispetto alla superficie: la parte tangente si avvicina a quella della palla (μ ≈ 0,35)
          const nx = dx / d, ny = dy / d, nz = dz / d;
          const sx = palla.v.x + palla.w.y * nz * R_PALLA - palla.w.z * ny * R_PALLA, sy = palla.v.y + palla.w.z * nx * R_PALLA - palla.w.x * nz * R_PALLA, sz = palla.v.z + palla.w.x * ny * R_PALLA - palla.w.y * nx * R_PALLA;
          let vx = (X[k] - Xp[k]) / dt - sx, vy = (X[k + 1] - Xp[k + 1]) / dt - sy, vz = (X[k + 2] - Xp[k + 2]) / dt - sz;
          const vn = vx * nx + vy * ny + vz * nz; vx -= vn * nx; vy -= vn * ny; vz -= vn * nz;
          const f = 0.35;
          Xp[k] += vx * f * dt; Xp[k + 1] += vy * f * dt; Xp[k + 2] += vz * f * dt;
        }
      }
    }
    // tratti: il punto più vicino al centro della palla, se dentro, spinge fuori i due capi (in proporzione)
    for (let k = 0; k < tratti.length; k++) {
      const [a, b] = tratti[k];
      const ax = X[a * 3], ay = X[a * 3 + 1], az = X[a * 3 + 2], ex = X[b * 3] - ax, ey = X[b * 3 + 1] - ay, ez = X[b * 3 + 2] - az;
      const ee = ex * ex + ey * ey + ez * ez || 1e-9;
      let t = ((c.x - ax) * ex + (c.y - ay) * ey + (c.z - az) * ez) / ee; t = Math.min(1, Math.max(0, t));
      if (t <= 0.02 || t >= 0.98) continue;                       // i capi li ha già sistemati il giro sui nodi
      const px = ax + ex * t, py = ay + ey * t, pz = az + ez * t, dx = px - c.x, dy = py - c.y, dz = pz - c.z, d = Math.hypot(dx, dy, dz);
      if (d >= rC || d < 1e-6) continue;
      const m = (rC - d) / d, wa = inv[a] * (1 - t), wb = inv[b] * t, W = wa * (1 - t) + wb * t; if (W < 1e-6) continue;
      const kx = dx * m / W, ky = dy * m / W, kz = dz * m / W;
      X[a * 3] += kx * wa; X[a * 3 + 1] += ky * wa; X[a * 3 + 2] += kz * wa;
      X[b * 3] += kx * wb; X[b * 3 + 1] += ky * wb; X[b * 3 + 2] += kz * wb;
    }
  }
  // assestamento con la gravità (2 s)
  const HZ = 480, dt = 1 / HZ;
  for (let i = 0; i < 2 * HZ; i++) passo(dt);
  // fermo: nessuna velocità residua
  Xp.set(X);
  const riposo = Float32Array.from(X);
  // registrazione: da quando la palla è a 25 cm dal ferro a 2,6 s dopo
  const ev = traiettoria.eventi;
  const s0 = ev.ferro.s - 0.08, s1 = s0 + 2.6, REG = 240, nf = Math.ceil((s1 - s0) * REG) + 1;
  const film = new Float32Array(nf * n * 3);
  let f = 0, sub = HZ / REG;
  const w = V(0, 0, 0), bp2 = V(0, 0, 0);
  for (let st = 0; f < nf; st++) {
    const s = s0 + st * dt;
    traiettoria.posa(s, bp, bq);
    traiettoria.posa(s + dt, bp2);
    bv.copy(bp2).sub(bp).divideScalar(dt);
    // la palla conta solo vicino alla retina
    const vicina = bp.y < A.y + 0.2 && bp.y > A.y - 0.75 && Math.hypot(bp.x - A.x, bp.z - A.z) < 0.5;
    palla = vicina ? { c: bp, v: bv, w } : null;
    passo(dt);
    // lo stato dopo il passo è quello del tempo s (risolto con la palla in s)
    if (st % sub === 0) { film.set(X, f * n * 3); f++; }
  }
  // misura: il nodo più in basso a riposo (la lunghezza della retina) e il raggio del fondo
  let yMin = 1e9; for (let i = 0; i < n; i++) yMin = Math.min(yMin, riposo[i * 3 + 1]);
  const fondo = []; for (let i = giri * N; i < (giri + 1) * N; i++) fondo.push(Math.hypot(riposo[i * 3] - A.x, riposo[i * 3 + 2] - A.z));
  const misure = { lunghezza: +(y0 - yMin).toFixed(3), raggioFondo: +(fondo.reduce((a, b) => a + b, 0) / N).toFixed(3) };
  // stato della retina al tempo s (fuori dalla registrazione: ferma)
  function stato(s, out) {
    const x = (s - s0) * REG;
    if (x <= 0) { out.set(film.subarray(0, n * 3)); return out; }
    if (x >= nf - 1) { out.set(film.subarray((nf - 1) * n * 3, nf * n * 3)); return out; }
    const i = Math.floor(x), t = x - i, a = i * n * 3, b = a + n * 3;
    for (let k = 0; k < n * 3; k++) out[k] = film[a + k] + (film[b + k] - film[a + k]) * t;
    return out;
  }
  return { n, nNodi: nNodi0, tratti, fili, stato, riposo, s0, s1, misure, fissi };
}
