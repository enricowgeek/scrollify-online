// Centro 3D · la linea di tiro, il proiettile in volo e il bersaglio che si spacca.
// Stessa scena della pistola, stesse unità (mm) e stessi assi: il proiettile esce dalla bocca (x 94) e vola lungo +x (y = 0, z = 0)
// fino al bersaglio a 25 m. La linea è stilizzata e compressa in altezza e larghezza (pavimento 30 cm sotto la traiettoria, luci
// 25 cm sopra, parete divisoria a 1,3 m) perché la camera le stia vicina e le veda passare; in lunghezza è vera (25 m).
// Leggera: una texture per tipo, oggetti ripetuti istanziati, nebbia nera che spegne il lontano. Tutto procedurale.
import * as THREE from 'three';
import { casuale } from './motore.js';

export const LINEA = {
  xT: 25000,            // bersaglio
  pavimento: -300, luci: 250, parete: -1300, pareteVicina: 900, fondo: 26800,
  soffitto: 760,        // barre di luce e paraschegge: alti, fuori dalla vista di fianco (si vedono dietro il proiettile, verso il bersaglio)
  carta: 360,           // lato del foglio del bersaglio (mm)
  marche: [5, 10, 15, 20],
};
const tela = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; };
const texDa = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };

// ————— texture: parete a pannelli, pavimento in cemento, numeri a stampino, pozza di luce, bersaglio —————
function texParete(rnd) {
  return texDa(tela(1024, 256, (g, w, h) => {
    g.fillStyle = '#1d1e21'; g.fillRect(0, 0, w, h);
    const I = g.getImageData(0, 0, w, h);
    for (let i = 0; i < I.data.length; i += 4) { const n = (rnd() - .5) * 9; I.data[i] += n; I.data[i + 1] += n; I.data[i + 2] += n; }
    g.putImageData(I, 0, 0);
    // due pannelli per piastrella, giunti scuri e una riga chiara orizzontale (fascia paracolpi)
    g.fillStyle = '#060606'; g.fillRect(0, 0, 5, h); g.fillRect(w / 2, 0, 5, h);
    g.fillStyle = '#26282b'; g.fillRect(0, h * .62, w, 10); g.fillStyle = '#0b0b0c'; g.fillRect(0, h * .62 + 10, w, 3);
  }));
}
function texPavimento(rnd) {
  return texDa(tela(512, 512, (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2200; k++) { const x = rnd() * w, y = rnd() * h, r = .5 + rnd() * 2.2, c = 14 + rnd() * 16; g.fillStyle = `rgb(${c},${c},${c})`; g.fillRect(x, y, r, r); }
    g.fillStyle = '#0a0a0a'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);   // giunti ogni 2 m
  }));
}
function texNumero(testo, font) {
  return texDa(tela(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(214,208,196,.86)'; g.textBaseline = 'middle';
    g.font = `800 190px ${font}`; const m = g.measureText(testo.n).width;
    g.font = `700 70px ${font}`; const mm = g.measureText(' m').width;
    const x0 = (w - m - mm) / 2;
    g.font = `800 190px ${font}`; g.fillText(testo.n, x0, h / 2 + 8);
    g.font = `700 70px ${font}`; g.fillText(' m', x0 + m, h / 2 + 52);
  }));
}
function texPozza() {
  return texDa(tela(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,246,228,.5)'); gr.addColorStop(.45, 'rgba(255,240,220,.16)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
}
function texLavaggio() {
  return texDa(tela(128, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, 0, 0, w / 2, 0, h * .95);
    gr.addColorStop(0, 'rgba(255,244,226,.34)'); gr.addColorStop(.35, 'rgba(255,240,220,.1)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
}
function texScia() {
  return texDa(tela(256, 16, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.85, 'rgba(255,240,215,.55)'); gr.addColorStop(1, 'rgba(255,255,255,.9)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, w, h);
  }));
}
// bersaglio di carta classico: dieci anelli, il nero dal 7 al 10, il 10 con l'anello interno, i numeri sugli assi
function texBersaglio(font) {
  return texDa(tela(1024, 1024, (g, w, h) => {
    const c = w / 2, k = w / LINEA.carta;           // px per mm
    g.fillStyle = '#ece6d8'; g.fillRect(0, 0, w, h);
    // grana della carta
    const rnd = casuale(71), I = g.getImageData(0, 0, w, h);
    for (let i = 0; i < I.data.length; i += 4) { const n = (rnd() - .5) * 10; I.data[i] += n; I.data[i + 1] += n; I.data[i + 2] += n * .9; }
    g.putImageData(I, 0, 0);
    const passo = 16.5;                               // mm fra gli anelli: il 1 a 165 mm, il 10 a 16,5
    g.beginPath(); g.arc(c, c, 4 * passo * k, 0, Math.PI * 2); g.fillStyle = '#121212'; g.fill();
    for (let r = 1; r <= 10; r++) {
      const rr = (11 - r) * passo * k;
      g.beginPath(); g.arc(c, c, rr, 0, Math.PI * 2); g.lineWidth = r >= 7 ? 2.4 : 2.6; g.strokeStyle = r >= 7 ? '#e9e3d4' : '#1a1a1a'; g.stroke();
    }
    g.beginPath(); g.arc(c, c, passo * .5 * k, 0, Math.PI * 2); g.lineWidth = 1.8; g.strokeStyle = '#e9e3d4'; g.stroke();
    g.font = `600 ${Math.round(9 * k)}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let r = 1; r <= 8; r++) {
      const rm = (11 - r - .5) * passo * k; g.fillStyle = r >= 7 ? '#e9e3d4' : '#1a1a1a';
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.fillText(String(r), c + dx * rm, c + dy * rm);
    }
    // bordo del foglio
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  }));
}

// ————— il proiettile in volo: palla in rame (9 mm), sei righe della rigatura (si vede che gira), base piatta —————
function proiettile(motore) {
  const g = new THREE.Group(); g.name = 'proiettile';
  const prof = [[0, 0], [0, 4.1], [.35, 4.5], [7.4, 4.5], [9.2, 4.33], [10.9, 3.92], [12.4, 3.25], [13.8, 2.38], [14.9, 1.4], [15.5, .55], [15.6, 0]];
  const pts = prof.map(([x, r]) => new THREE.Vector2(r, x));
  const lathe = new THREE.LatheGeometry(pts, 40); lathe.rotateZ(-Math.PI / 2);   // asse y → asse x
  lathe.computeVertexNormals();
  const mRame = new THREE.MeshPhysicalMaterial({ color: 0xcb7a4c, metalness: 1, roughness: .22, envMap: motore.env, envMapIntensity: 1.35 });
  g.add(new THREE.Mesh(lathe, mRame));
  // righe della rigatura: sei strisce scure un po' elicoidali sulla parte cilindrica
  const pos = [], idx = [];
  for (let s = 0; s < 6; s++) {
    const a0 = s / 6 * Math.PI * 2, w = .13, n = 8;
    for (let i = 0; i <= n; i++) {
      const x = .9 + i / n * 6.2, a = a0 + i / n * .16;
      for (const d of [-w / 2, w / 2]) pos.push(x, Math.cos(a + d) * 4.52, Math.sin(a + d) * 4.52);
    }
    const b = s * (n + 1) * 2;
    for (let i = 0; i < n; i++) idx.push(b + i * 2, b + i * 2 + 2, b + i * 2 + 1, b + i * 2 + 1, b + i * 2 + 2, b + i * 2 + 3);
  }
  const gr = new THREE.BufferGeometry(); gr.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gr.setIndex(idx); gr.computeVertexNormals();
  g.add(new THREE.Mesh(gr, new THREE.MeshStandardMaterial({ color: 0x3a1c10, metalness: .6, roughness: .5, envMap: motore.env, side: THREE.DoubleSide })));
  return g;
}

// ————— la carta del bersaglio in pezzi: il foglio con il buco strappato + i pezzi del centro (volano o si piegano) —————
function bersaglio(motore, texCarta) {
  const L = LINEA.carta, rnd = casuale(12), g = new THREE.Group(); g.name = 'bersaglio';
  const mFronte = new THREE.MeshStandardMaterial({ map: texCarta, roughness: .9, metalness: 0, envMap: motore.env, envMapIntensity: 1.1, emissive: 0xffffff, emissiveMap: texCarta, emissiveIntensity: .32 });
  const mBordo = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 1, metalness: 0, emissive: 0xf2eee4, emissiveIntensity: .2 });
  // il retro della carta: bianco sporco, senza stampa (le schegge che girano lampeggiano chiare, i lembi piegati si vedono nel buco)
  const mRetro = new THREE.MeshStandardMaterial({ color: 0xe6dfcf, roughness: 1, metalness: 0, envMap: motore.env, envMapIntensity: .8, emissive: 0xe6dfcf, emissiveIntensity: .28 });
  // contorno del buco: raggio frastagliato 43…64 mm; i tagli radiali (11) lo incrociano in punti che entrano nel contorno stesso,
  // così foglio e pezzi hanno esattamente gli stessi spigoli (prima del colpo il foglio è intero, senza fessure)
  const NB = 40, base = Array.from({ length: NB }, (_, i) => { const a = (i + (rnd() - .5) * .5) / NB * Math.PI * 2; const r = 50 + Math.sin(i * 1.7) * 7 + (rnd() - .5) * 14; return { a, r }; }).sort((p, q) => p.a - q.a);
  const NR = 11, tagli = Array.from({ length: NR }, (_, i) => (i + .5 + (rnd() - .5) * .6) / NR * Math.PI * 2).sort((a, b) => a - b);
  const xy = (a, r) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  const P0 = base.map(q => xy(q.a, q.r));
  // incrocio del raggio ad angolo a con il contorno
  const suBordo = a => {
    const d = new THREE.Vector2(Math.cos(a), Math.sin(a));
    for (let i = 0; i < NB; i++) {
      const p = P0[i], q = P0[(i + 1) % NB], e = q.clone().sub(p), den = d.x * e.y - d.y * e.x; if (Math.abs(den) < 1e-9) continue;
      const t = (p.x * e.y - p.y * e.x) / den, u = (p.x * d.y - p.y * d.x) / den;
      if (t > 0 && u >= 0 && u <= 1) return { a, p: d.multiplyScalar(t), taglio: true };
    }
    return null;
  };
  const tutti = [...base.map((q, i) => ({ a: q.a, p: P0[i] })), ...tagli.map(suBordo)].sort((p, q) => p.a - q.a);
  const bordoBuco = tutti.map(q => q.p);
  const spess = .35;
  function lastrina(P, nome) {
    const geo = new THREE.ExtrudeGeometry(P instanceof THREE.Shape ? P : new THREE.Shape(P), { depth: spess, bevelEnabled: false, curveSegments: 1 });
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + L / 2) / L, (p.getY(i) + L / 2) / L);
    // ExtrudeGeometry mette le due facce nello stesso gruppo (prima il fondo a z = 0, poi la cima a z = spess): il fondo è il retro
    const g0 = geo.groups.find(q => q.materialIndex === 0), meta = g0.count / 2;
    geo.groups = geo.groups.filter(q => q !== g0); geo.addGroup(g0.start, meta, 2); geo.addGroup(g0.start + meta, meta, 0);
    const m = new THREE.Mesh(geo, [mFronte, mBordo, mRetro]); m.name = nome;
    return m;
  }
  // il foglio intero con il buco. La forma sta nel piano xy locale; ruotata di −90° attorno a y: x locale → +z della scena,
  // la faccia a profondità 0,35 guarda verso −x (verso chi spara) con la stampa dritta
  const foglio = new THREE.Shape([new THREE.Vector2(-L / 2, -L / 2), new THREE.Vector2(L / 2, -L / 2), new THREE.Vector2(L / 2, L / 2), new THREE.Vector2(-L / 2, L / 2)]);
  foglio.holes.push(new THREE.Path(bordoBuco.slice().reverse()));
  const orienta = o => { o.rotation.y = -Math.PI / 2; o.position.x = spess; return o; };
  const fogliaG = new THREE.Group(); fogliaG.position.set(LINEA.xT, 0, 0); g.add(fogliaG);
  fogliaG.add(orienta(lastrina(foglio, 'foglio')));
  // pezzi del centro: spicchi fra due tagli; dentro (dal centro a ~22 mm) e fuori (fino al bordo del buco). Alcuni "lembi" restano
  // attaccati al bordo e si piegano all'indietro
  const pezzi = [];
  const iT = tagli.map(a => tutti.findIndex(q => q.taglio && q.a === a));
  for (let i = 0; i < NR; i++) {
    const a0 = tagli[i], a1 = tagli[(i + 1) % NR] + (i === NR - 1 ? Math.PI * 2 : 0), am = (a0 + a1) / 2, rm = 20 + rnd() * 5;
    const dentro = [new THREE.Vector2(0, 0), xy(a0, rm), xy(am, rm + (rnd() - .5) * 3), xy(a1, rm)];
    const arco = []; for (let k = iT[i]; ; k = (k + 1) % tutti.length) { arco.push(tutti[k].p.clone()); if (k === iT[(i + 1) % NR]) break; }
    const fuori = [xy(a0, rm), ...arco, xy(a1, rm), xy(am, rm + (rnd() - .5) * 3)];
    fuori.splice(fuori.length - 1, 1); fuori.push(dentro[2].clone());
    for (const [P, tipo] of [[dentro, 'dentro'], [fuori, i % 4 === 1 ? 'lembo' : 'fuori']]) {
      const m = orienta(lastrina(P, 'pezzo'));
      const piv = new THREE.Group(); fogliaG.add(piv); piv.add(m);
      const c = P.reduce((s, q) => s.add(q), new THREE.Vector2()).multiplyScalar(1 / P.length), dir = c.clone().normalize();
      pezzi.push({
        piv, m, tipo, c, a: am, arco,
        v: new THREE.Vector3(-.12 + rnd() * .34, dir.y * (.22 + rnd() * .55) + .06, dir.x * (.22 + rnd() * .55)),
        w: new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize(), vw: (4 + rnd() * 10) / 1000,
      });
    }
  }
  // dietro il foglio, la luce del parapalle: si accende con l'impatto e si vede solo dal buco (bordo strappato in controluce).
  // Vicina alla carta e più piccola del foglio: dalle viste dell'impatto e del finale (≤ 25° dall'asse) resta nascosta dietro
  const tLuce = texDa(tela(256, 256, (q, w, h) => {
    const gr = q.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, '#fffaf0'); gr.addColorStop(.22, '#ffe2b0'); gr.addColorStop(.55, '#d08a46'); gr.addColorStop(.85, '#4a2a14'); gr.addColorStop(1, '#120c08');
    q.fillStyle = gr; q.fillRect(0, 0, w, h);
  }));
  const mLuce = new THREE.MeshBasicMaterial({ map: tLuce, toneMapped: false, transparent: true, opacity: 0 });
  const luceDietro = new THREE.Mesh(new THREE.CircleGeometry(92, 48), mLuce);
  luceDietro.rotation.y = -Math.PI / 2; luceDietro.position.set(LINEA.xT + 48, 0, 0); luceDietro.visible = false; g.add(luceDietro);
  // polvere e briciole di carta
  const NP = 170, posP = new Float32Array(NP * 3), velP = [];
  for (let i = 0; i < NP; i++) { const a = rnd() * Math.PI * 2, s = rnd(); velP.push(new THREE.Vector3(-.5 + rnd() * .9, Math.sin(a) * s * .9 + .1, Math.cos(a) * s * .9)); }
  const gP = new THREE.BufferGeometry(); gP.setAttribute('position', new THREE.BufferAttribute(posP, 3));
  const mP = new THREE.PointsMaterial({ color: 0xe8e0cf, size: 2.2, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
  const polvere = new THREE.Points(gP, mP); polvere.frustumCulled = false; polvere.position.set(LINEA.xT, 0, 0); g.add(polvere);
  // supporto: due mollette sul bordo alto, due aste fino al carrello sulla rotaia
  const mMet = new THREE.MeshStandardMaterial({ color: 0x2a2b2d, metalness: .8, roughness: .45, envMap: motore.env });
  const box = (sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mMet); m.position.set(x, y, z); g.add(m); return m; };
  for (const s of [1, -1]) { box(8, 22, 26, LINEA.xT + 2, L / 2 - 4, s * (L / 2 - 40)); box(4, LINEA.luci + 40 - L / 2, 4, LINEA.xT + 2, (LINEA.luci + 40 + L / 2) / 2, s * (L / 2 - 40)); }
  box(60, 24, L - 40, LINEA.xT + 2, LINEA.luci + 52, 0);

  // stato: ms dall'impatto (−1 = intero). Pezzi 'dentro' e 'fuori' volano via con gravità; i 'lembi' si piegano all'indietro e restano
  const Q = new THREE.Quaternion();
  function aggiorna(ms) {
    const k = ms < 0 ? -1 : ms;
    for (const p of pezzi) {
      if (k < 0) { p.piv.position.set(0, 0, 0); p.piv.quaternion.identity(); p.piv.visible = true; continue; }
      if (p.tipo === 'lembo') {
        // perno sul bordo esterno del pezzo (verso il buco): si piega di ~115° all'indietro con un piccolo rimbalzo
        const e = Math.min(1, k / 240), ang = 2.0 * (1 - Math.pow(1 - e, 3)) + Math.sin(Math.min(1, k / 600) * Math.PI) * .12;
        // asse di piega: la corda fra i due capi dell'arco (sul bordo del buco), nel piano del foglio (scena: u → z, v → y)
        const A0 = p.arco[0], A1 = p.arco[p.arco.length - 1], cx = (A0.x + A1.x) / 2, cy = (A0.y + A1.y) / 2;
        const asse = new THREE.Vector3(0, A1.y - A0.y, A1.x - A0.x).normalize();
        Q.setFromAxisAngle(asse, -ang);
        const perno = new THREE.Vector3(spess, cy, cx);
        p.piv.quaternion.copy(Q);
        p.piv.position.copy(perno).sub(perno.clone().applyQuaternion(Q));
        p.piv.visible = true; continue;
      }
      const t = Math.min(k, 2200);
      p.piv.position.set(p.v.x * t, p.v.y * t - .00042 * t * t, p.v.z * t);
      Q.setFromAxisAngle(p.w, p.vw * t * (p.tipo === 'dentro' ? 1.6 : 1)); p.piv.quaternion.copy(Q);
      p.piv.visible = k < 2150;
    }
    // la luce dietro: subito dopo il lampo
    luceDietro.visible = k >= 0; mLuce.opacity = k < 0 ? 0 : Math.min(1, k / 90);
    // polvere
    if (k < 0 || k > 1500) { mP.opacity = 0; polvere.visible = false; }
    else {
      polvere.visible = true; const a = gP.attributes.position.array;
      for (let i = 0; i < NP; i++) { const v = velP[i], d = (1 - Math.exp(-k / 380)) * 380; a[i * 3] = v.x * d; a[i * 3 + 1] = v.y * d - .00035 * k * k; a[i * 3 + 2] = v.z * d; }
      gP.attributes.position.needsUpdate = true;
      mP.opacity = .75 * Math.min(1, k / 60) * (1 - k / 1500);
    }
  }
  aggiorna(-1);
  return { gruppo: g, aggiorna, pezzi };
}

// ————— la linea di tiro —————
export async function creaPoligono(motore) {
  const rnd = casuale(90);
  // font dei numeri a stampino: quello del sito se c'è già (Archivo stretto), altrimenti un sans di sistema
  let font = '"Archivo", "Arial Narrow", sans-serif';
  try { await Promise.race([document.fonts.load('800 100px Archivo'), new Promise(r => setTimeout(r, 1500))]); } catch (e) { /* va bene il ripiego */ }
  const g = new THREE.Group(); g.name = 'poligono';
  const { xT, pavimento: yF, luci: yL, parete: zW, pareteVicina: zN, fondo: xB, soffitto: yS } = LINEA;
  const x0 = -900, lung = xB - x0;
  // parete divisoria dietro la traiettoria (e quella di qua, che si vede solo nelle viste finali)
  const tP = texParete(rnd); tP.wrapS = THREE.RepeatWrapping; tP.repeat.set(lung / 2500, 1); tP.anisotropy = motore.maxAniso;
  const mParete = new THREE.MeshStandardMaterial({ map: tP, roughness: .82, metalness: .15, envMap: motore.env, envMapIntensity: .6 });
  const hW = yL + 80 - yF;
  const parete = new THREE.Mesh(new THREE.PlaneGeometry(lung, hW), mParete); parete.position.set(x0 + lung / 2, yF + hW / 2, zW); g.add(parete);
  const pareteV = parete.clone(); pareteV.rotation.y = Math.PI; pareteV.position.z = zN; g.add(pareteV);
  // pavimento
  const tF = texPavimento(rnd); tF.wrapS = tF.wrapT = THREE.RepeatWrapping; tF.repeat.set(lung / 2000, (zN - zW) / 2000); tF.anisotropy = motore.maxAniso;
  const mPav = new THREE.MeshStandardMaterial({ map: tF, roughness: .75, metalness: .1, envMap: motore.env, envMapIntensity: .5 });
  const pav = new THREE.Mesh(new THREE.PlaneGeometry(lung, zN - zW), mPav); pav.rotation.x = -Math.PI / 2; pav.position.set(x0 + lung / 2, yF, (zN + zW) / 2); g.add(pav);
  // soffitto scuro (si vede solo nelle viste dal basso o finali)
  const sof = new THREE.Mesh(new THREE.PlaneGeometry(lung, zN - zW), new THREE.MeshBasicMaterial({ color: 0x050505 })); sof.rotation.x = Math.PI / 2; sof.position.set(x0 + lung / 2, yS + 120, (zN + zW) / 2); g.add(sof);
  // righe delle distanze (chiare) sul pavimento, con i numeri delle distanze
  const mRiga = new THREE.MeshBasicMaterial({ color: 0xcfc9bd, toneMapped: true });
  const riga = (x, w, m) => { const r = new THREE.Mesh(new THREE.PlaneGeometry(w, zN - zW - 40), m); r.rotation.x = -Math.PI / 2; r.position.set(x, yF + 1, (zN + zW) / 2); g.add(r); };
  for (const d of LINEA.marche) {
    riga(d * 1000, 34, mRiga);
    const t = texNumero({ n: String(d) }, font);
    const mN = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
    const nF = new THREE.Mesh(new THREE.PlaneGeometry(480, 240), mN); nF.rotation.x = -Math.PI / 2; nF.position.set(d * 1000 - 260, yF + 2, zW + 420); g.add(nF);
  }
  // luci a soffitto (barre bianche di traverso) con la loro pozza sul pavimento, e i paraschegge inclinati sopra
  const PL = 1250, NL = Math.floor((xT - 800) / PL) + 1;
  const barre = new THREE.InstancedMesh(new THREE.BoxGeometry(46, 10, zN - zW - 200), new THREE.MeshBasicMaterial({ color: 0xfff4e2, toneMapped: false }), NL);
  const pozze = new THREE.InstancedMesh(new THREE.PlaneGeometry(1100, zN - zW), new THREE.MeshBasicMaterial({ map: texPozza(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .9 }), NL);
  const M = new THREE.Matrix4(), Qr = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < NL; i++) {
    const x = 1200 + i * PL;
    barre.setMatrixAt(i, M.makeTranslation(x, yS, (zN + zW) / 2));
    pozze.setMatrixAt(i, M.compose(new THREE.Vector3(x, yF + 1.5, (zN + zW) / 2), Qr.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), S1));
  }
  g.add(barre, pozze);
  // la luce delle barre sulla parete: ventagli tenui dall'alto (ritmo che scorre, parallasse)
  const lavaggio = new THREE.InstancedMesh(new THREE.PlaneGeometry(900, hW * 1.1), new THREE.MeshBasicMaterial({ map: texLavaggio(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55 }), NL);
  for (let i = 0; i < NL; i++) lavaggio.setMatrixAt(i, M.makeTranslation(1200 + i * PL, yL - hW * .5, zW + 6));
  g.add(lavaggio);
  const NB = Math.floor((xT - 2000) / 3000) + 1;
  const mBaffle = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: .6, metalness: .5, envMap: motore.env, envMapIntensity: .7 });
  const baffle = new THREE.InstancedMesh(new THREE.BoxGeometry(18, 300, zN - zW), mBaffle, NB);
  for (let i = 0; i < NB; i++) baffle.setMatrixAt(i, M.compose(new THREE.Vector3(2400 + i * 3000, yS - 60, (zN + zW) / 2), Qr.setFromEuler(new THREE.Euler(0, 0, .6)), S1));
  g.add(baffle);
  // fondo: muro parapalle scuro e piastre inclinate
  const muro = new THREE.Mesh(new THREE.PlaneGeometry(zN - zW, yS + 120 - yF), new THREE.MeshStandardMaterial({ color: 0x101012, roughness: .7, metalness: .4, envMap: motore.env, envMapIntensity: .5 }));
  muro.rotation.y = -Math.PI / 2; muro.position.set(xB, (yS + 120 + yF) / 2, (zN + zW) / 2); g.add(muro);
  // rotaia del porta-bersaglio sul soffitto
  const rot = new THREE.Mesh(new THREE.BoxGeometry(xT - 2000, 16, 30), mBaffle); rot.position.set((xT + 2000) / 2 + 200, yL + 75, 0); g.add(rot);
  // pulviscolo nell'aria lungo la traiettoria (parallasse forte vicino alla camera)
  const ND = 520, pd = new Float32Array(ND * 3);
  for (let i = 0; i < ND; i++) { pd[i * 3] = x0 + rnd() * (xT - x0); pd[i * 3 + 1] = yF + 20 + rnd() * (yL - yF - 40); pd[i * 3 + 2] = zW + 100 + rnd() * (260 - zW); }
  const gD = new THREE.BufferGeometry(); gD.setAttribute('position', new THREE.BufferAttribute(pd, 3));
  const polv = new THREE.Points(gD, new THREE.PointsMaterial({ color: 0xcfc6b6, size: 1.6, transparent: true, opacity: .45, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(polv);

  // proiettile, anello d'aria alla bocca, scia
  const pr = proiettile(motore); g.add(pr);
  const mAnello = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const anello = new THREE.Mesh(new THREE.TorusGeometry(1, .045, 8, 72), mAnello); anello.rotation.y = Math.PI / 2; g.add(anello);
  const mScia = new THREE.MeshBasicMaterial({ map: texScia(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
  const scia = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mScia); scia.geometry.translate(-.5, 0, 0); g.add(scia);
  const bers = bersaglio(motore, texBersaglio(font)); g.add(bers.gruppo);
  // lampo dell'impatto
  const mLampo = new THREE.SpriteMaterial({ map: motore.texFiamma(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0, color: 0xfff0d8 });
  const lampo = new THREE.Sprite(mLampo); lampo.position.set(xT - 4, 0, 0); g.add(lampo);

  return {
    gruppo: g, proiettile: pr, bersaglio: bers,
    // stato del volo: xB = posizione del proiettile, giro = rotazione su se stesso, vis = si vede, onda (0…1: l'anello d'aria alla
    // bocca, a tempo dal colpo: 300 ms, poi sparisce),
    // velocita (0…1: quanto si vede la scia), impatto (ms, −1 = intero)
    aggiorna({ xB, giro, vis, onda, scia: sv, impatto, ridotto }) {
      pr.visible = vis; pr.position.set(xB, 0, 0); pr.rotation.x = giro;
      // onda d'urto: due anelli che si allargano dalla bocca
      { const k = Math.min(1, Math.max(0, onda));
        anello.visible = onda > 0 && onda < 1 && !ridotto; anello.scale.setScalar(7 + 46 * (1 - Math.pow(1 - k, 2.6))); anello.position.set(97 + 16 * k, 0, 0);
        mAnello.opacity = .6 * Math.pow(1 - k, 1.6) * Math.min(1, k * 12); }
      polv.visible = !ridotto;
      scia.visible = vis && sv > .01 && !ridotto; scia.position.set(xB, 0, 0); scia.scale.set(160 + 260 * sv, 3.2, 1); mScia.opacity = .5 * sv;
      bers.aggiorna(impatto);
      const f = impatto < 0 ? 0 : Math.max(0, 1 - impatto / 110);
      mLampo.opacity = f; lampo.scale.setScalar(60 + 120 * (1 - f)); lampo.visible = f > 0;
    },
  };
}
