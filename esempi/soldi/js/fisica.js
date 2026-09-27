// Soldi · fisica leggera delle banconote (nessuna libreria): ogni banconota è un foglio rigido (posizione, velocità,
// orientamento, velocità angolare) che vola con gravità, resistenza dell'aria diversa di piatto e di taglio (plana come
// una foglia), coppia che lo mette di traverso al vento (oscilla) e un po' di turbolenza.
// Il mucchio è una MAPPA DELLE ALTEZZE (griglia 2,5D) scritta dalle banconote ferme, in ordine di arrivo:
//   - una banconota che vola tocca la mappa → rimbalza/striscia con attrito → quando è lenta si adagia (piano stimato
//     sotto la sua impronta) e scrive la sua impronta nella mappa;
//   - quando una banconota ferma se ne va (scia, presa, crollo) la mappa si ricostruisce in ordine di arrivo e chi non
//     ha più appoggio sotto si sveglia e cade (la cima tagliata scivola giù, il crollo si propaga da solo).
// Unità: la lunghezza della banconota = 1. y in alto. Nessuna allocazione nel ciclo caldo.

export const NASCOSTA = 0, RIPOSO = 1, VOLO = 2, PIOGGIA = 3, PRESA = 4, SALITA = 5;
const TAU = Math.PI * 2;

export function casuale(seme) { let a = seme >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function creaMucchio({ n, larga, seme = 7 }) {
  const W = larga, rnd = casuale(seme);
  // ——— parametri dell'aria e degli urti (tarati a occhio) ———
  const K = {
    g: 30,            // gravità (L/s²): un po' meno del vero, lo svolazzo si legge meglio
    kN: 1.5,          // resistenza di piatto → velocità limite ≈ 4,5 L/s
    kT: .1,           // resistenza di taglio (plana)
    vSu: 7,           // tetto alla velocità verso l'alto in volo: un foglio inclinato e veloce non fa l'aquilone
    kA: 1.1,          // coppia che mette il foglio di traverso al vento
    kW: 1.8,          // smorzamento della rotazione
    mu: 1.4,          // attrito carta su carta (≈ 54°)
    rimbalzo: .12,
    riposoV: .5, riposoW: 2.2, riposoT: .08,
    muro: .4,         // oltre questa compenetrazione è un fianco, non un pavimento
    tDin: .008,       // spessore di una banconota che si adagia (sottile: a terra non devono rigonfiare un mucchio)
    alto: .5,         // su quale percentile dell'impronta si adagia (1 = punto più alto: più aria sotto; .5 = si incastra e resta bassa)
    tol: .06,         // tolleranza dell'appoggio
    scende: 1.6,      // vuoto sotto una banconota ferma oltre il quale cade libera invece di scendere in blocco
  };
  // ——— stato (struttura di array) ———
  const P = new Float32Array(n * 3), V = new Float32Array(n * 3), Q = new Float32Array(n * 4), O = new Float32Array(n * 3);
  const S = new Uint8Array(n), seq = new Int32Array(n), T = new Float32Array(n), ts = new Float32Array(n), dentro = new Float32Array(n);
  const resist = new Float32Array(n).fill(1), fase = new Float32Array(n), aPosto = new Uint8Array(n), mosso = new Uint8Array(n);
  const piega = new Float32Array(n * 4);            // curvatura, torsione, svolazzo, fase (per lo shader)
  const SP = new Float32Array(n * 3), SQ = new Float32Array(n * 4), ST = new Float32Array(n);   // posti nella montagna
  const tPioggia = new Float32Array(n), tSalita = new Float32Array(n);
  const ease = new Float32Array(n), edur = new Float32Array(n).fill(.16), EP = new Float32Array(n * 3), EQ = new Float32Array(n * 4);  // posa di partenza per adagiarsi dolcemente
  const EASE = .16;
  for (let i = 0; i < n; i++) {
    fase[i] = rnd() * TAU;
    piega[i * 4] = -.04 + rnd() * .3; piega[i * 4 + 1] = (rnd() - .5) * .05; piega[i * 4 + 3] = rnd() * TAU;
    Q[i * 4 + 3] = 1;
  }
  // ——— impronta: 7 × 3 campioni per la mappa; 4 angoli + centro per i contatti ———
  const CA = [], CB = [];
  for (let a = 0; a < 7; a++) for (let b = 0; b < 3; b++) { CA.push(-.45 + a * .15); CB.push((b - 1) * W * .38); }
  const NC = CA.length; let SA2 = 0, SB2 = 0; for (let k = 0; k < NC; k++) { SA2 += CA[k] * CA[k]; SB2 += CB[k] * CB[k]; }
  const KA = [-.48, .48, -.48, .48, 0], KB = [-W * .46, -W * .46, W * .46, W * .46, 0];
  const CY = new Float32Array(n * NC), CC = new Int32Array(n * NC);   // quota e cella dei campioni delle banconote ferme
  // ——— mappa delle altezze ———
  const LATO = 20, CELLA = .18, G = Math.ceil(2 * LATO / CELLA), hm = new Float32Array(G * G);
  const cellaDi = (x, z) => { const ix = Math.floor((x + LATO) / CELLA), iz = Math.floor((z + LATO) / CELLA); return (ix < 0 || iz < 0 || ix >= G || iz >= G) ? -1 : iz * G + ix; };
  const hmCella = (x, z) => { const c = cellaDi(x, z); return c < 0 ? 0 : hm[c]; };
  function hmBil(x, z) {
    const fx = (x + LATO) / CELLA - .5, fz = (z + LATO) / CELLA - .5, ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    if (ix < 0 || iz < 0 || ix >= G - 1 || iz >= G - 1) return 0;
    const c = iz * G + ix, a = hm[c], b = hm[c + 1], d = hm[c + G], e = hm[c + G + 1];
    return (a + (b - a) * tx) * (1 - tz) + (d + (e - d) * tx) * tz;
  }
  const NS = [0, 1, 0];
  function normale(x, z) {
    const h = .22, dx = (hmBil(x + h, z) - hmBil(x - h, z)) / (2 * h), dz = (hmBil(x, z + h) - hmBil(x, z - h)) / (2 * h), l = Math.hypot(dx, 1, dz);
    NS[0] = -dx / l; NS[1] = 1 / l; NS[2] = -dz / l; return NS;
  }
  // ——— matematica dei quaternioni (in array) ———
  const M = new Float32Array(9);   // colonne: asse lungo (x), normale (y), asse corto (z)
  function matrice(i) {
    const x = Q[i * 4], y = Q[i * 4 + 1], z = Q[i * 4 + 2], w = Q[i * 4 + 3];
    M[0] = 1 - 2 * (y * y + z * z); M[1] = 2 * (x * y + w * z); M[2] = 2 * (x * z - w * y);
    M[3] = 2 * (x * y - w * z); M[4] = 1 - 2 * (x * x + z * z); M[5] = 2 * (y * z + w * x);
    M[6] = 2 * (x * z + w * y); M[7] = 2 * (y * z - w * x); M[8] = 1 - 2 * (x * x + y * y);
  }
  function quatDaBase(o, j, Xx, Xy, Xz, Yx, Yy, Yz, Zx, Zy, Zz) {
    const tr = Xx + Yy + Zz; let x, y, z, w;
    if (tr > 0) { const s = .5 / Math.sqrt(tr + 1); w = .25 / s; x = (Yz - Zy) * s; y = (Zx - Xz) * s; z = (Xy - Yx) * s; }
    else if (Xx > Yy && Xx > Zz) { const s = 2 * Math.sqrt(1 + Xx - Yy - Zz); w = (Yz - Zy) / s; x = .25 * s; y = (Yx + Xy) / s; z = (Zx + Xz) / s; }
    else if (Yy > Zz) { const s = 2 * Math.sqrt(1 + Yy - Xx - Zz); w = (Zx - Xz) / s; x = (Yx + Xy) / s; y = .25 * s; z = (Zy + Yz) / s; }
    else { const s = 2 * Math.sqrt(1 + Zz - Xx - Yy); w = (Xy - Yx) / s; x = (Zx + Xz) / s; y = (Zy + Yz) / s; z = .25 * s; }
    const l = Math.hypot(x, y, z, w); o[j] = x / l; o[j + 1] = y / l; o[j + 2] = z / l; o[j + 3] = w / l;
  }
  function quatCasuale(o, j) {
    const u1 = rnd(), u2 = rnd() * TAU, u3 = rnd() * TAU, a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
    o[j] = a * Math.sin(u2); o[j + 1] = a * Math.cos(u2); o[j + 2] = b * Math.sin(u3); o[j + 3] = b * Math.cos(u3);
  }

  // ——— posa di riposo: piano stimato sotto l'impronta (minimi quadrati), poi quota = campione più alto ———
  const PP = new Float32Array(3), PQ = new Float32Array(4), VQ = new Float32Array(NC);
  let alto = 1;   // su quale campione si posa (1 = il più alto)
  function posa(x, z, ux, uz, faccia, spess, rum, pMax = 2.2) {
    let l = Math.hypot(ux, uz); if (l < 1e-4) { ux = 1; uz = 0; l = 1; } ux /= l; uz /= l;
    const wx = -uz, wz = ux;
    let sa = 0, sb = 0;
    for (let k = 0; k < NC; k++) { const h = hmCella(x + ux * CA[k] + wx * CB[k], z + uz * CA[k] + wz * CB[k]); sa += h * CA[k]; sb += h * CB[k]; }
    let pa = sa / SA2, pb = sb / SB2; const pm = Math.hypot(pa, pb); if (pm > pMax) { pa *= pMax / pm; pb *= pMax / pm; }
    let Ux = ux, Uy = pa, Uz = uz; l = Math.hypot(Ux, Uy, Uz); Ux /= l; Uy /= l; Uz /= l;
    let Wx = wx, Wy = pb, Wz = wz; l = Math.hypot(Wx, Wy, Wz); Wx /= l; Wy /= l; Wz /= l;
    let nx = Wy * Uz - Wz * Uy, ny = Wz * Ux - Wx * Uz, nz = Wx * Uy - Wy * Ux;
    if (rum) { nx += (rnd() - .5) * 2 * rum; ny += (rnd() - .5) * rum; nz += (rnd() - .5) * 2 * rum; }
    l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    if (ny < .2) { ny = .2; l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l; }
    // base ortonormale: X = asse lungo (U proiettato), Y = normale, Z = X × Y
    let d = Ux * nx + Uy * ny + Uz * nz, Xx = Ux - nx * d, Xy = Uy - ny * d, Xz = Uz - nz * d; l = Math.hypot(Xx, Xy, Xz); Xx /= l; Xy /= l; Xz /= l;
    let Yx = nx, Yy = ny, Yz = nz; if (faccia < 0) { Yx = -Yx; Yy = -Yy; Yz = -Yz; }
    const Zx = Xy * Yz - Xz * Yy, Zy = Xz * Yx - Xx * Yz, Zz = Xx * Yy - Xy * Yx;
    let cy = -1e9;
    if (alto >= 1) for (let k = 0; k < NC; k++) { const v = hmCella(x + Xx * CA[k] + Zx * CB[k], z + Xz * CA[k] + Zz * CB[k]) - (Xy * CA[k] + Zy * CB[k]); if (v > cy) cy = v; }
    else {
      for (let k = 0; k < NC; k++) VQ[k] = hmCella(x + Xx * CA[k] + Zx * CB[k], z + Xz * CA[k] + Zz * CB[k]) - (Xy * CA[k] + Zy * CB[k]);
      VQ.sort(); cy = VQ[Math.min(NC - 1, Math.round(alto * (NC - 1)))];
    }
    PP[0] = x; PP[1] = cy + spess; PP[2] = z;
    quatDaBase(PQ, 0, Xx, Xy, Xz, Yx, Yy, Yz, Zx, Zy, Zz);
  }
  // campioni (quota e cella) della banconota i nella sua posa attuale
  function campiona(i) {
    matrice(i); const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
    for (let k = 0; k < NC; k++) {
      const a = CA[k], b = CB[k];
      CY[i * NC + k] = py + M[1] * a + M[7] * b;
      CC[i * NC + k] = cellaDi(px + M[0] * a + M[6] * b, pz + M[2] * a + M[8] * b);
    }
  }
  function scrivi(i) {
    const tetto = seq[i] >= n ? P[i * 3 + 1] + .15 : 1e9;   // solo per chi si è riadagiato dopo la montagna: niente guglie
    for (let k = 0; k < NC; k++) { const c = CC[i * NC + k], y = Math.min(CY[i * NC + k], tetto); if (c >= 0 && y > hm[c]) hm[c] = y; }
  }

  // ——— elenco delle banconote ferme in ordine di arrivo; ricostruzione con controllo dell'appoggio ———
  let ordine = new Int32Array(n), nOrdine = 0, daOrdinare = false, sporco = false, contSeq = n;
  const scia = { x: 0, y: 0, z: 0, forza: 0 };       // trascinamento lasciato dall'ultima scia (per chi perde l'appoggio)
  const appena = [];                                  // svegliate in questo passo (per il controllo "sepolta")
  let guidata = false, cielo = 12, tempo = 0;
  function ricostruisci() {
    hm.fill(0);
    if (daOrdinare) { const a = Array.from(ordine.subarray(0, nOrdine)); a.sort((p, q) => seq[p] - seq[q]); ordine.set(a); daOrdinare = false; }
    let m = 0;
    for (let o = 0; o < nOrdine; o++) {
      const i = ordine[o]; if (S[i] !== RIPOSO) continue;
      // appoggiata se almeno un campione dell'impronta tocca ciò che c'è sotto (le banconote arrivate prima)
      let ok = P[i * 3 + 1] < T[i] + .05;
      for (let k = 0; k < NC && !ok; k++) { const c = CC[i * NC + k]; const h = c < 0 ? 0 : hm[c]; if (h >= CY[i * NC + k] - T[i] - K.tol) ok = true; }
      if (ok) { scrivi(i); ordine[m++] = i; continue; }
      // niente appoggio. Se il vuoto sotto è piccolo scende in blocco con la sua posa (la cima tagliata si posa sul
      // moncone e la montagna resta a punta); se è grande cade libera.
      let gap = 1e9;
      for (let k = 0; k < NC; k++) { const c = CC[i * NC + k]; const g = CY[i * NC + k] - T[i] - (c < 0 ? 0 : hm[c]); if (g < gap) gap = g; }
      if (gap < K.scende && scia.forza < 1.5) {
        const d = Math.min(.45, Math.max(.1, Math.sqrt(2 * gap / K.g)));
        iniziaEase(i, d); edur[i] = -d;           // durata negativa = caduta (accelera, come con la gravità)
        P[i * 3 + 1] -= gap; for (let k = 0; k < NC; k++) CY[i * NC + k] -= gap;
        aPosto[i] = 0; mosso[i] = 1; scrivi(i); ordine[m++] = i; continue;
      }
      // niente appoggio: cade, trascinata un po' dalla scia che l'ha scalzata
      // (dopo una scia: la parte sopra il taglio scivola via tutta insieme nella direzione del gesto, come sotto una spada)
      S[i] = VOLO; aPosto[i] = 0; ts[i] = 0; ease[i] = 0; mosso[i] = 1;
      const f = scia.forza, blocco = f >= 1.5;
      V[i * 3] = scia.x * f * (blocco ? .5 + rnd() * .12 : .3) + (rnd() - .5) * .4; V[i * 3 + 1] = blocco ? .1 + rnd() * .15 : (rnd() - .3) * .5; V[i * 3 + 2] = scia.z * f * (blocco ? .5 + rnd() * .12 : .3) + (rnd() - .5) * .4;
      O[i * 3] = (rnd() - .5) * 2; O[i * 3 + 1] = (rnd() - .5) * 2; O[i * 3 + 2] = (rnd() - .5) * 2;
      if (blocco) resist[i] = .3;
      appena.push(i);
    }
    nOrdine = m; sporco = false;
    // chi è ancora sotto altre banconote ferme passa "attraverso" finché non esce (niente teletrasporti verso l'alto)
    for (const i of appena) if (hmBil(P[i * 3], P[i * 3 + 2]) > P[i * 3 + 1] + .12) dentro[i] = .5;
    appena.length = 0;
  }
  function adagia(i, spess) {
    // posa di riposo dove si trova, con l'asse lungo attuale e la faccia che guarda in su
    matrice(i);
    let ux = M[0], uz = M[2]; if (Math.hypot(ux, uz) < .2) { ux = M[6]; uz = M[8]; }
    // il gold ticket si posa SOPRA quello che trova (le altre si incastrano a metà): in mezzo al mucchio, ma visibile
    const suOro = i === oro; if (suOro) spess = .03;
    alto = suOro ? 1 : K.alto; posa(P[i * 3], P[i * 3 + 2], ux, uz, M[4] >= 0 ? 1 : -1, spess, .03, 1.3); alto = 1;   // al massimo ~52°
    iniziaEase(i);
    P[i * 3] = PP[0]; P[i * 3 + 1] = PP[1]; P[i * 3 + 2] = PP[2]; Q.set(PQ, i * 4);
    fermaQui(i, spess, ++contSeq);
  }
  function iniziaEase(i, d = EASE) { EP[i * 3] = P[i * 3]; EP[i * 3 + 1] = P[i * 3 + 1]; EP[i * 3 + 2] = P[i * 3 + 2]; EQ.set(Q.subarray(i * 4, i * 4 + 4), i * 4); ease[i] = d; edur[i] = d; }
  function fermaQui(i, spess, s) {
    T[i] = spess; S[i] = RIPOSO; seq[i] = s; V.fill(0, i * 3, i * 3 + 3); O.fill(0, i * 3, i * 3 + 3); ts[i] = 0; dentro[i] = 0; resist[i] = 1;
    piega[i * 4 + 2] = 0; mosso[i] = 1;
    campiona(i); scrivi(i);
    if (nOrdine > 0 && seq[ordine[nOrdine - 1]] > s) daOrdinare = true;
    ordine[nOrdine++] = i;
  }

  // ——— la montagna: deposito simulato, un foglio alla volta dove manca più materiale rispetto al cono bersaglio ———
  // (cresce da piccola a grande, sempre a cono). Tutta FITTA: ogni banconota si posa su un percentile della sua impronta
  // (72% dentro, 82% fuori) invece che sul punto più alto, così si incastra un filo con quelle sotto e non lascia aria.
  let monte = { R: 3, H: 4.4, nMonte: n };
  let oro = -1;   // indice del gold ticket (lo sceglie la scena)
  function deposita({ pendenza = 1.35, gamma = 1.35, tInt = .026, tGuscio = .026, quotaGuscio = .55, sparse = .035, fronte = .6, rumInt = .04, rumGuscio = .05, altoInt = .72, altoGuscio = .82 } = {}) {
    hm.fill(0); nOrdine = 0;
    const nSparse = Math.round(n * sparse), nMonte = n - nSparse, iGuscio = Math.round(nMonte * (1 - quotaGuscio));
    const vol = iGuscio * W * tInt * .9 + (nMonte - iGuscio) * W * tGuscio * 1.3;
    // bersaglio largo: non si riempie mai, la montagna cresce come un cono simile a sé stesso (punta sempre affilata)
    const R0 = Math.cbrt(vol / (Math.PI / 3 * pendenza)), R = R0 * 2.4, H = pendenza * R;
    const bersaglio = r => r >= R ? 0 : H * Math.pow(1 - r / R, gamma);
    let livello = H;
    for (let i = 0; i < nMonte; i++) {
      const rAtt = R * (1 - Math.pow(Math.min(1, Math.max(0, livello / H)), 1 / gamma)) + .6;
      let bx = 0, bz = 0, bd = -1e9;
      for (let k = 0; k < 18; k++) {
        const r = rAtt * Math.sqrt(rnd()), a = rnd() * TAU, x = Math.cos(a) * r, z = Math.sin(a) * r, d = bersaglio(r) - hmBil(x, z);
        if (d > bd) { bd = d; bx = x; bz = z; }
      }
      livello = Math.min(livello, bd + .25);
      const interno = i < iGuscio, a = rnd() * TAU;
      alto = interno ? altoInt : altoGuscio;
      posa(bx, bz, Math.cos(a), Math.sin(a), rnd() < fronte ? 1 : -1, interno ? tInt : tGuscio, interno ? rumInt : rumGuscio);
      alto = 1;
      SP.set(PP, i * 3); SQ.set(PQ, i * 4); ST[i] = interno ? tInt : tGuscio;
      P.set(PP, i * 3); Q.set(PQ, i * 4); T[i] = ST[i]; seq[i] = i; campiona(i); scrivi(i);
    }
    // quanto è venuta: cima e raggio di base
    let cima = 0, rb = 0;
    for (let i = 0; i < nMonte; i++) { cima = Math.max(cima, SP[i * 3 + 1]); if (SP[i * 3 + 1] < .6) rb = Math.max(rb, Math.hypot(SP[i * 3], SP[i * 3 + 2])); }
    // qualche banconota sparsa per terra attorno
    for (let i = nMonte; i < n; i++) {
      const r = rb + .3 + rnd() * 2.6, a = rnd() * TAU, b = rnd() * TAU;
      posa(Math.cos(a) * r, Math.sin(a) * r, Math.cos(b), Math.sin(b), rnd() < fronte ? 1 : -1, K.tDin, .02);
      SP.set(PP, i * 3); SQ.set(PQ, i * 4); ST[i] = K.tDin;
      P.set(PP, i * 3); Q.set(PQ, i * 4); T[i] = ST[i]; seq[i] = i; campiona(i); scrivi(i);
    }
    monte = { R: rb + .5, H: cima + .1, nMonte, R0, Rbersaglio: R };
    // si parte da vuoti: tutte nascoste, pronte a piovere
    hm.fill(0); nOrdine = 0;
    for (let i = 0; i < n; i++) { S[i] = NASCOSTA; mosso[i] = 1; aPosto[i] = 0; }
    return monte;
  }
  // tutte al loro posto subito (per prefers-reduced-motion e per le prove)
  function tuttaFatta() {
    hm.fill(0); nOrdine = 0;
    for (let i = 0; i < n; i++) { P.set(SP.subarray(i * 3, i * 3 + 3), i * 3); Q.set(SQ.subarray(i * 4, i * 4 + 4), i * 4); ease[i] = 0; fermaQui(i, ST[i], i); aPosto[i] = 1; }
    guidata = false;
  }
  // pioggia: ogni banconota parte dal cielo al suo turno e viene guidata verso il suo posto
  function piovi(t0, durata = 2.4) {
    guidata = true;
    for (let i = 0; i < n; i++) { tPioggia[i] = t0 + i / n * durata + rnd() * .12; if (S[i] !== SALITA) S[i] = NASCOSTA; mosso[i] = 1; }
  }
  function nasci(i) {
    const r = 1 + rnd() * 3.6, a = rnd() * TAU;
    P[i * 3] = SP[i * 3] + Math.cos(a) * r; P[i * 3 + 1] = Math.max(cielo, SP[i * 3 + 1] + 3) + rnd() * 3.5; P[i * 3 + 2] = SP[i * 3 + 2] + Math.sin(a) * r;
    V[i * 3] = (rnd() - .5) * 2; V[i * 3 + 1] = -2 - rnd() * 2; V[i * 3 + 2] = (rnd() - .5) * 2;
    quatCasuale(Q, i * 4); O[i * 3] = (rnd() - .5) * 6; O[i * 3 + 1] = (rnd() - .5) * 6; O[i * 3 + 2] = (rnd() - .5) * 6;
    resist[i] = 1; dentro[i] = 0; ts[i] = 0; ease[i] = 0; mosso[i] = 1;
    S[i] = guidata ? PIOGGIA : VOLO;
  }
  // l'utente tocca durante la pioggia: la guida si spegne, chi è in aria cade dove capita
  function sganciaPioggia() {
    if (!guidata) return; guidata = false;
    for (let i = 0; i < n; i++) if (S[i] === PIOGGIA) S[i] = VOLO;
  }

  // ——— azioni ———
  function sveglia(i, vx, vy, vz, wx, wy, wz) {
    const s = S[i];
    if (s === NASCOSTA || s === SALITA || s === PRESA) return false;
    if (s === PIOGGIA) sganciaPioggia();
    if (s === RIPOSO) {
      if (hmCella(P[i * 3], P[i * 3 + 2]) > P[i * 3 + 1] + .12) dentro[i] = .45;
      S[i] = VOLO; aPosto[i] = 0; ts[i] = 0; ease[i] = 0; sporco = true;
      V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz; O[i * 3] = wx; O[i * 3 + 1] = wy; O[i * 3 + 2] = wz;
    } else {
      V[i * 3] += vx; V[i * 3 + 1] += vy; V[i * 3 + 2] += vz; O[i * 3] += wx; O[i * 3 + 1] += wy; O[i * 3 + 2] += wz;
    }
    mosso[i] = 1; return true;
  }
  function prendi(i) {
    const s = S[i]; if (s === NASCOSTA || s === SALITA) return false;
    sganciaPioggia();
    if (s === RIPOSO) { aPosto[i] = 0; sporco = true; }
    S[i] = PRESA; ease[i] = 0; dentro[i] = 0; mosso[i] = 1; return true;
  }
  function lascia(i, vx, vy, vz, wx, wy, wz, leggera = .14) {
    S[i] = VOLO; V[i * 3] = vx; V[i * 3 + 1] = vy; V[i * 3 + 2] = vz; O[i * 3] = wx; O[i * 3 + 1] = wy; O[i * 3 + 2] = wz;
    resist[i] = leggera; ts[i] = 0; dentro[i] = 0; mosso[i] = 1;
  }
  function crollo(dx, dz, forza = 1) {
    sganciaPioggia();
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const H = monte.H;
    for (let i = 0; i < n; i++) {
      if (S[i] !== RIPOSO && S[i] !== VOLO) continue;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], h = Math.min(1.2, y / H), r = Math.hypot(x, z) || 1;
      // anche quelle in basso partono forte (verso l'esterno e un po' in su): tutto si sparpaglia per terra, niente gobba
      const vv = (3.2 + 7 * h) * forza * (.6 + rnd() * .6), rad = 2.4 + rnd() * 3.6 + 3.5 * Math.max(0, 1 - h);
      V[i * 3] = dx * vv + x / r * rad + (rnd() - .5) * 2.5; V[i * 3 + 1] = 2 + rnd() * 4 + rnd() * 4 * h; V[i * 3 + 2] = dz * vv + z / r * rad + (rnd() - .5) * 2.5;
      O[i * 3] = (rnd() - .5) * 14; O[i * 3 + 1] = (rnd() - .5) * 14; O[i * 3 + 2] = (rnd() - .5) * 14;
      S[i] = VOLO; aPosto[i] = 0; ts[i] = 0; ease[i] = 0; dentro[i] = 0; mosso[i] = 1;
      resist[i] = .3 + rnd() * .3;   // per un attimo l'aria frena meno: volano lontano e si sparpagliano
    }
    hm.fill(0); nOrdine = 0; sporco = false;
  }
  // rifai: tutte risucchiate verso l'alto (a scaglioni), poi ripiovono al loro posto
  function rifai(t, durata = 2.4) {
    guidata = true;
    for (let i = 0; i < n; i++) {
      if (S[i] === PRESA) S[i] = VOLO;
      tSalita[i] = t + rnd() * .45 * (S[i] === RIPOSO ? 1 : .4);
      tPioggia[i] = t + 1.1 + i / n * durata + rnd() * .12;
      if (S[i] !== NASCOSTA) S[i] = SALITA;
      resist[i] = 1; dentro[i] = 0; ease[i] = 0; aPosto[i] = 0; mosso[i] = 1;
    }
    hm.fill(0); nOrdine = 0; sporco = false;
  }

  // ——— il passo ———
  function aria(i, h, gScala) {
    const j = i * 3, q = i * 4, r = resist[i];
    matrice(i);
    const nx = M[3], ny = M[4], nz = M[5];
    const f = fase[i];
    // turbolenza leggera (spinge e fa dondolare), più forte in volo libero
    const tx = Math.sin(tempo * 1.1 + f * 2) * 1.4, tz = Math.cos(tempo * .9 + f) * 1.4;
    let vx = V[j] + tx * h, vy = V[j + 1] - K.g * gScala * h, vz = V[j + 2] + tz * h;
    // resistenza implicita: di piatto (forte) e di taglio (debole) → plana
    let vn = vx * nx + vy * ny + vz * nz;
    let tx2 = vx - vn * nx, ty2 = vy - vn * ny, tz2 = vz - vn * nz;
    const vt = Math.hypot(tx2, ty2, tz2);
    vn = vn / (1 + K.kN * r * Math.abs(vn) * h);
    const ft = 1 / (1 + K.kT * r * vt * h);
    vx = tx2 * ft + vn * nx; vy = ty2 * ft + vn * ny; vz = tz2 * ft + vn * nz;
    V[j] = vx; V[j + 1] = vy; V[j + 2] = vz;
    // coppia: il foglio si mette di traverso al vento relativo (oscilla come una foglia)
    const sp = Math.hypot(vx, vy, vz);
    let wx = O[j], wy = O[j + 1], wz = O[j + 2];
    if (sp > .05) {
      const s = (vx * nx + vy * ny + vz * nz) >= 0 ? 1 / sp : -1 / sp, dx = vx * s, dy = vy * s, dz = vz * s;
      const k = K.kA * Math.min(sp * sp, 36) * (r < 1 ? r * r : 1);
      wx += (ny * dz - nz * dy) * k * h; wy += (nz * dx - nx * dz) * k * h; wz += (nx * dy - ny * dx) * k * h;
    }
    wx += Math.sin(tempo * 2.1 + f) * 2.2 * h; wy += Math.sin(tempo * 1.3 + f * 1.7) * 1.2 * h; wz += Math.sin(tempo * 2.6 + f * .7) * 2.2 * h;
    const sm = Math.exp(-K.kW * h); wx *= sm; wy *= sm; wz *= sm;
    O[j] = wx; O[j + 1] = wy; O[j + 2] = wz;
    // integra orientamento e posizione
    let qx = Q[q], qy = Q[q + 1], qz = Q[q + 2], qw = Q[q + 3], hh = .5 * h;
    const ax = qx + hh * (wx * qw + wy * qz - wz * qy), ay = qy + hh * (wy * qw + wz * qx - wx * qz), az = qz + hh * (wz * qw + wx * qy - wy * qx), aw = qw + hh * (-wx * qx - wy * qy - wz * qz);
    const l = Math.hypot(ax, ay, az, aw); Q[q] = ax / l; Q[q + 1] = ay / l; Q[q + 2] = az / l; Q[q + 3] = aw / l;
    P[j] += vx * h; P[j + 1] += vy * h; P[j + 2] += vz * h;
    if (r < 1) resist[i] = Math.min(1, r + h * .9);
    piega[i * 4 + 2] = Math.min(.055, .01 * sp + .012);
    mosso[i] = 1;
    return sp;
  }
  function contatto(i, h, px0, pz0) {
    const j = i * 3;
    matrice(i);
    let pen = -1e9;
    for (let k = 0; k < 5; k++) {
      const a = KA[k], b = KB[k], sx = P[j] + M[0] * a + M[6] * b, sy = P[j + 1] + M[1] * a + M[7] * b, sz = P[j + 2] + M[2] * a + M[8] * b;
      const p = hmBil(sx, sz) + .012 - sy; if (p > pen) pen = p;
    }
    if (dentro[i] > 0) { dentro[i] -= h; if (pen <= 0) dentro[i] = 0; return false; }
    if (pen <= 0) { ts[i] = 0; return false; }
    if (pen > K.muro) {
      // un fianco: torna indietro in orizzontale e rimbalza piano
      P[j] = px0; P[j + 2] = pz0; V[j] *= -.25; V[j + 2] *= -.25; P[j + 1] += Math.min(pen, .05);
    } else P[j + 1] += pen;
    const N = normale(P[j], P[j + 2]);
    let vx = V[j], vy = V[j + 1], vz = V[j + 2];
    const vn = vx * N[0] + vy * N[1] + vz * N[2];
    if (vn < 0) {
      const dv = -(1 + K.rimbalzo) * vn; vx += dv * N[0]; vy += dv * N[1]; vz += dv * N[2];
      const un = vx * N[0] + vy * N[1] + vz * N[2], tx = vx - un * N[0], ty = vy - un * N[1], tz = vz - un * N[2], vt = Math.hypot(tx, ty, tz);
      const cala = vt > 1e-5 ? Math.max(0, vt - K.mu * dv - 1.2 * h) / vt : 0;
      vx = un * N[0] + tx * cala; vy = un * N[1] + ty * cala; vz = un * N[2] + tz * cala;
    }
    V[j] = vx; V[j + 1] = vy; V[j + 2] = vz;
    // si stende sulla superficie: ruota la normale verso ±N
    const nx = M[3], ny = M[4], nz = M[5], s = nx * N[0] + ny * N[1] + nz * N[2] >= 0 ? 1 : -1;
    const cx = ny * N[2] * s - nz * N[1] * s, cy = nz * N[0] * s - nx * N[2] * s, cz = nx * N[1] * s - ny * N[0] * s;
    const k = Math.min(1, 12 * h);
    O[j] = O[j] * (1 - k) + cx * 14 * k; O[j + 1] = O[j + 1] * (1 - k) + cy * 14 * k; O[j + 2] = O[j + 2] * (1 - k) + cz * 14 * k;
    // si ferma quando è lenta su una pendenza che regge
    const sp = Math.hypot(vx, vy, vz), w = Math.hypot(O[j], O[j + 1], O[j + 2]);
    if (sp < K.riposoV && w < K.riposoW && N[1] > .5) ts[i] += h; else ts[i] = 0;
    if (ts[i] > K.riposoT) adagia(i, K.tDin);
    return true;
  }
  function passo(dt, t) {
    tempo = t;
    if (sporco) ricostruisci();
    // nascite della pioggia
    for (let i = 0; i < n; i++) if (S[i] === NASCOSTA && tPioggia[i] > 0 && t >= tPioggia[i]) { tPioggia[i] = 0; nasci(i); }
    const sub = Math.max(1, Math.ceil(dt / (1 / 60) - .01)), h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < n; i++) {
        const st = S[i];
        if (st === RIPOSO || st === NASCOSTA || st === PRESA) continue;
        const j = i * 3;
        if (st === VOLO) {
          const px0 = P[j], pz0 = P[j + 2];
          aria(i, h, 1);
          if (V[j + 1] > K.vSu) V[j + 1] = K.vSu;
          contatto(i, h, px0, pz0);
          if (P[j + 1] < -1) { P[j + 1] = .05; V[j + 1] = 0; }
        } else if (st === PIOGGIA) {
          // come in volo, più una guida verso il posto che si fa forte avvicinandosi
          const dy = P[j + 1] - SP[j + 1], f = Math.min(1.6, Math.max(.08, 1.5 - dy / 3.5));
          V[j] += ((SP[j] - P[j]) * 9 - V[j] * 3.5) * f * h; V[j + 2] += ((SP[j + 2] - P[j + 2]) * 9 - V[j + 2] * 3.5) * f * h;
          aria(i, h, 1.25);
          const dxz = Math.hypot(SP[j] - P[j], SP[j + 2] - P[j + 2]);
          if (dy < .25 + dxz * .5 || dy < -.1) {
            iniziaEase(i, .24);
            P.set(SP.subarray(j, j + 3), j); Q.set(SQ.subarray(i * 4, i * 4 + 4), i * 4);
            fermaQui(i, ST[i], i); aPosto[i] = 1;
          }
        } else if (st === SALITA) {
          if (t < tSalita[i]) continue;
          // risucchio: verso l'alto con un vortice attorno all'asse della montagna
          const x = P[j], z = P[j + 2], r = Math.hypot(x, z) + .5;
          V[j] += (-z / r * 4 - x * .8) * h; V[j + 2] += (x / r * 4 - z * .8) * h; V[j + 1] += 90 * h;
          aria(i, h, 1);
          if (P[j + 1] > cielo + 1.5) { S[i] = NASCOSTA; mosso[i] = 1; if (tPioggia[i] <= 0) tPioggia[i] = t; }
        }
      }
      tempo += h;
    }
    for (let i = 0; i < n; i++) if (ease[i] > 0) { ease[i] = Math.max(0, ease[i] - dt); mosso[i] = 1; }
  }

  function conta() {
    const c = { nascoste: 0, ferme: 0, volo: 0, pioggia: 0, prese: 0, salita: 0, aPosto: 0 };
    for (let i = 0; i < n; i++) {
      const s = S[i]; if (s === NASCOSTA) c.nascoste++; else if (s === RIPOSO) c.ferme++; else if (s === VOLO) c.volo++; else if (s === PIOGGIA) c.pioggia++; else if (s === PRESA) c.prese++; else c.salita++;
      if (aPosto[i]) c.aPosto++;
    }
    return c;
  }

  return {
    n, W, K, P, V, Q, O, S, piega, mosso, ease, edur, EP, EQ, EASE, aPosto, resist, SP, hm, G, LATO, CELLA,
    get monte() { return monte; }, get guidata() { return guidata; },
    set cielo(v) { cielo = v; }, get cielo() { return cielo; },
    set oro(v) { oro = v; }, get oro() { return oro; },
    scia, deposita, tuttaFatta, piovi, sveglia, prendi, lascia, crollo, rifai, passo, conta, hmBil, sganciaPioggia,
    // quando tutto si è fermato, il gold ticket (se è a terra) si rimette sopra quello che ha intorno: coperto non lo troverebbe nessuno
    rialzaOro() { if (oro >= 0 && S[oro] === RIPOSO && !aPosto[oro]) adagia(oro, .03); },   // solo se è uscito dal suo posto nella montagna
    ricostruisci: () => ricostruisci(),
  };
}
