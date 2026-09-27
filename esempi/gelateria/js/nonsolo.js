// Gelateria · "Non solo gelato": le quattro lavagne del negozio in 3D. monta(radice, opz) → api
//   frappe   · bicchiere alto di vetro (trasmissione vera, fondo spesso), frappè alla vaniglia con il cioccolato colato
//              sul vetro, panna montata a rosa, cannuccia di carta a righe, filo di cioccolato che scende fuori dal bicchiere
//   yogurt   · coppetta marrone col logo, frozen yogurt a spirale, lamponi, mirtilli e granella di nocciole
//   crepe    · crêpe piegata in quattro sul piattino, crema al cioccolato che esce dal bordo, righe di cioccolato, zucchero a velo
//   affogato · bicchierino di vetro, pallina di fior di latte (la pallina del cono, foto schiarita) e l'espresso che la avvolge
// UN SOLO renderer WebGL: disegna un oggetto alla volta (scissor) e lo copia nella tela 2D della sua cella. Le celle scorrono
// con la pagina (niente ritardi), la memoria resta quella di una cella, l'impaginazione è tutta nel CSS.
// Forme modellate in codice, texture disegnate in canvas all'avvio (niente file in più, tranne il logo e la foto della pallina).
import * as THREE from 'three';
import { studio } from './studio.js';
import { casuale, simplex3, valorePeriodico } from './rumore.js';
import { creaPallina } from './pallina.js';
import { creaOcclusione, inietta } from './occlusione.js';

export const OGGETTI = ['frappe', 'yogurt', 'crepe', 'affogato'];

const TAU = Math.PI * 2;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lim = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const liscia = (a, b, x) => { const t = lim((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const pausa = () => new Promise(r => requestAnimationFrame(() => r()));
// il montaggio si spezza in tanti passi: se dall'ultima pausa sono passati più di 6 ms si lascia un fotogramma alla pagina
// (niente compiti lunghi mentre si scorre). I tempi dei passi restano in window.__tempiNonsolo (per le verifiche).
let tCedi = 0, tSegna = 0;
async function cedi(nome) {
  const t = performance.now();
  (window.__tempiNonsolo ||= []).push([nome, +(t - tSegna).toFixed(1)]);
  if (t - tCedi > 6) { await pausa(); tCedi = performance.now(); }
  tSegna = performance.now();
}

// ————————————————————————————————— texture in canvas —————————————————————————————————
function tela(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn && fn(c.getContext('2d'), w, h); return c; }
function tex(c, { srgb = true, rip = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rip) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
// grana periodica (si ripete senza cuciture): rumore a più ottave + pori tondi (bolle d'aria della panna)
function grana(S, seme, { ottave = [[4, 1], [8, .6], [16, .35], [32, .2]], pori = 0, rPori = [1, 3] } = {}) {
  const f = ottave.map(([P], i) => valorePeriodico(P, seme + i)), somma = ottave.reduce((a, o) => a + o[1], 0);
  return tela(S, S, (g) => {
    const im = g.createImageData(S, S), d = im.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let v = 0; for (let i = 0; i < f.length; i++) v += ottave[i][1] * f[i](x / S * ottave[i][0], y / S * ottave[i][0]);
      const c = 128 + 110 * v / somma, k = (y * S + x) * 4;
      d[k] = d[k + 1] = d[k + 2] = c; d[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    const rnd = casuale(seme + 99);
    for (let i = 0; i < pori; i++) {
      const x = rnd() * S, y = rnd() * S, r = rPori[0] + rnd() * (rPori[1] - rPori[0]);
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(.7, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  });
}

// ————————————————————————————————— geometrie di base —————————————————————————————————
// tornio: profilo [[r, y], …] attorno all'asse y; vProf (facoltativo) = la v della texture per ogni punto del profilo
function tornio(prof, seg, vProf = null) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg);
  if (vProf) {
    const uv = g.attributes.uv, n = prof.length;
    for (let i = 0; i <= seg; i++) for (let j = 0; j < n; j++) uv.setY(i * n + j, vProf[j]);
  }
  return g;
}
// la normale ai bordi della cucitura (u = 0 e u = 1 sono vertici doppi): media, niente riga
function saldaCucitura(g, NU, NV) {
  const n = g.attributes.normal, a = V3(), b = V3();
  for (let j = 0; j <= NU; j++) {
    const i0 = j * (NV + 1), i1 = i0 + NV;
    a.fromBufferAttribute(n, i0); b.fromBufferAttribute(n, i1); a.add(b).normalize();
    n.setXYZ(i0, a.x, a.y, a.z); n.setXYZ(i1, a.x, a.y, a.z);
  }
}
// tubo a griglia: fn(u, v) → [x, y, z] (u lungo il tubo 0…1, v intorno 0…1); chiuso agli estremi se il raggio va a 0
function griglia(NU, NV, fn, { uvU = 1, uvV = 1 } = {}) {
  const pos = new Float32Array((NU + 1) * (NV + 1) * 3), uv = new Float32Array((NU + 1) * (NV + 1) * 2), idx = [];
  for (let j = 0; j <= NU; j++) for (let i = 0; i <= NV; i++) {
    const k = j * (NV + 1) + i, p = fn(j / NU, i / NV);
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    uv[k * 2] = j / NU * uvU; uv[k * 2 + 1] = i / NV * uvV;
  }
  for (let j = 0; j < NU; j++) for (let i = 0; i < NV; i++) {
    const a = j * (NV + 1) + i, b = a + 1, c = a + NV + 2, d = a + NV + 1;
    idx.push(a, d, c, a, c, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); saldaCucitura(g, NU, NV);
  return g;
}
// nastro su una superficie: percorso di punti con la normale della superficie; sezione a cupola schiacciata (larghezza w, altezza h),
// il sotto affonda un filo nella superficie. w e h vanno a zero agli estremi (punte arrotondate).
function nastro(punti, normali, larg, alti, NV = 10) {
  const n = punti.length, T = V3(), B = V3();
  const P = [];
  for (let j = 0; j < n; j++) {
    const p = punti[j], N = normali[j];
    T.subVectors(punti[Math.min(n - 1, j + 1)], punti[Math.max(0, j - 1)]).normalize();
    B.crossVectors(T, N).normalize();
    const Nn = V3().crossVectors(B, T).normalize();
    P.push([p, Nn, B.clone(), larg[j], alti[j]]);
  }
  return griglia(n - 1, NV, (u, v) => {
    const [p, N, B, w, h] = P[Math.round(u * (n - 1))];
    const a = v * TAU, c = Math.cos(a), s = Math.sin(a);
    const hh = s > 0 ? Math.pow(s, .75) * h : s * h * .35;
    return [p.x + B.x * c * w + N.x * (hh + h * .1), p.y + B.y * c * w + N.y * (hh + h * .1), p.z + B.z * c * w + N.z * (hh + h * .1)];
  });
}
// profilo di un bicchiere (vetro spesso): fuori dal fondo in su, orlo tondo, dentro in giù, fondo interno
function profiloBicchiere({ H, rB, rT, parete, fondo, esp = 1.2, smusso = .22, n = 18 }) {
  const rO = y => rB + (rT - rB) * Math.pow(lim(y / H), esp);
  const P = [[0, .07], [rB * .55, .05], [rB - smusso * 1.2, .012]];
  for (let k = 1; k <= 5; k++) { const a = k / 5 * Math.PI / 2; P.push([rB - smusso + Math.sin(a) * smusso * .98, smusso - Math.cos(a) * smusso]); }
  const yR = H - parete / 2;
  for (let k = 1; k <= n; k++) { const y = smusso + (yR - smusso) * k / n; P.push([rO(y), y]); }
  const rc = rO(yR) - parete / 2;
  for (let k = 1; k < 10; k++) { const a = k / 10 * Math.PI; P.push([rc + Math.cos(a) * parete / 2, yR + Math.sin(a) * parete / 2]); }
  const yF = fondo + .35;
  for (let k = 0; k <= n; k++) { const y = yR - (yR - yF) * k / n; P.push([rO(y) - parete, y]); }
  const rI = rO(fondo) - parete;
  for (let k = 1; k <= 5; k++) { const a = k / 5 * Math.PI / 2; P.push([rI - .35 + Math.cos(a) * .35, fondo + .35 - Math.sin(a) * .35]); }
  P.push([rI * .5, fondo - .03], [0, fondo - .05]);
  return { P, rO, rI: y => rO(y) - parete };
}

// ————————————————————————————————— la spirale (panna montata, frozen yogurt) —————————————————————————————————
// Una sola superficie "a vite": inviluppo a cono che chiude a punta, un solco a elica tra un giro e l'altro (il cordone che si
// appoggia su quello di sotto) e le creste della bocchetta a stella che corrono lungo il giro. Continua per costruzione: niente
// cordone che si attraversa, niente alette. y → quota, φ → angolo; f = posizione dentro il giro (0 solco sotto, 1 solco sopra).
function vite(o) {
  const { yBase, H, R0, passo, creste = 4, prof = .1, solco = .42, NY = 160, NF = 96, seme = 1, fase = 0, esp = 1.35, cadente = 1.15, sotto = .5, torci = 0, tondo = .7, limite = null } = o;
  const n = simplex3(seme);
  const inv = t => Math.pow(Math.max(0, 1 - Math.pow(t, esp)), .85);             // l'inviluppo: 1 alla base, 0 in punta
  const giro = (y, fi) => {
    const s = (y - yBase) / passo - (fi + fase) / TAU, f = Math.pow(s - Math.floor(s), cadente);
    return { f, c: Math.pow(Math.max(0, Math.sin(Math.PI * f)), tondo) };            // la pancia del giro, solco stretto tra due giri
  };
  const raggio = (y, fi) => {
    const t = lim((y - yBase) / H), E = R0 * inv(t) * (1 + .025 * n(fi * .8, y * .4, seme));
    const { f, c } = giro(y, fi);
    const g = 1 - liscia(.72, .97, t), base = liscia(yBase - sotto, yBase + .4, y);
    let r = E - passo * solco * (1 - c) * g * base;
    r += passo * .5 * prof * Math.cos(TAU * creste * f + torci * fi + .6 * Math.sin(fi * 2)) * Math.sqrt(c) * g * base;
    if (limite) r = Math.min(r, limite(y));   // dentro la coppetta o il bicchiere resta dentro la parete
    return Math.max(0, r);
  };
  const P = (y, fi) => { const r = raggio(y, fi); return V3(Math.cos(fi) * r, y, Math.sin(fi) * r); };
  const y0 = yBase - sotto, y1 = yBase + H;
  const geo = griglia(NY, NF, (u, v) => { const y = mix(y0, y1, u), fi = v * TAU, r = raggio(y, fi); return [Math.cos(fi) * r, y, Math.sin(fi) * r]; }, { uvU: Math.round(H / passo * 3), uvV: 6 });
  // ombra di contatto nei vertici: scuro nel solco, un filo nelle valli delle creste
  const col = new Float32Array(geo.attributes.position.count * 3);
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NF; i++) {
    const y = mix(y0, y1, j / NY), fi = i / NF * TAU, t = lim((y - yBase) / H), { f, c } = giro(y, fi);
    const cr = .5 + .5 * Math.cos(TAU * creste * f + torci * fi + .6 * Math.sin(fi * 2)), g = 1 - liscia(.72, .97, t);
    const ao = (1 - .5 * (1 - liscia(0, .35, c)) * g) * (1 - .1 * (1 - cr) * g);
    const k = (j * (NF + 1) + i) * 3; col[k] = col[k + 1] = col[k + 2] = ao;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // punto sulla superficie (con la normale); fuori = spostamento lungo la normale
  const sulla = (y, fi, fuori = 0) => {
    const p = P(y, fi), dy = P(y + .02, fi).sub(P(y - .02, fi)), df = P(y, fi + .01).sub(P(y, fi - .01));
    const nn = V3().crossVectors(df, dy).normalize();
    if (nn.dot(V3(p.x, 0, p.z)) < 0 && p.x * p.x + p.z * p.z > .01) nn.negate();
    return { p: p.addScaledVector(nn, fuori), n: nn };
  };
  // la quota del giro k sopra l'angolo fi (f = dove dentro il giro: .5 la pancia)
  const cresta = (k, fi, f = .5) => yBase + passo * (k + Math.pow(f, 1 / cadente) + (fi + fase) / TAU);
  return { geo, sulla, cresta, raggio, alto: y1 };
}

// ————————————————————————————————— materiali —————————————————————————————————
const fisico = o => new THREE.MeshPhysicalMaterial(o);
function vetro({ spessore = .3, mappaSpessore = null, tinta = '#eef2e8' } = {}) {
  return fisico({ color: '#ffffff', roughness: .035, metalness: 0, transmission: 1, thickness: spessore, thicknessMap: mappaSpessore, ior: 1.5,
    specularIntensity: 1, attenuationColor: new THREE.Color(tinta), attenuationDistance: 7, envMapIntensity: 1.15 });
}
function cioccolatoLucido(colore = '#2f150b') {
  return fisico({ color: colore, roughness: .2, clearcoat: .9, clearcoatRoughness: .07, specularIntensity: .9, sheen: .15, sheenColor: new THREE.Color('#a8745a'), sheenRoughness: .4 });
}

// ————————————————————————————————— ombra morbida sul banco (piano opaco: il colore del fondo con l'ombra dipinta) —————————————————————————————————
function suolo(fondo, { contatto, morbido, dx = .12, dz = .16, forza = 1, lato = 60, ellisse = 1, caustica = 0 }) {
  const S = 512, c = tela(S, S, (g) => {
    g.fillStyle = fondo; g.fillRect(0, 0, S, S);
    const px = S / lato, cx = S / 2, cy = S / 2;
    const macchia = (x, y, r0, r1, a, col = '58,36,20') => {
      g.save(); g.translate(x, y); g.scale(1, ellisse);
      const gr = g.createRadialGradient(0, 0, r0, 0, 0, r1);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.5, `rgba(${col},${a * .45})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r1, 0, TAU); g.fill(); g.restore();
    };
    macchia(cx + dx * morbido * px, cy - dz * morbido * px, 0, morbido * px, .30 * forza);           // penombra larga, spostata dalla luce
    macchia(cx, cy, contatto * .7 * px, contatto * 1.18 * px, .42 * forza);                      // contatto: anello scuro sotto il bordo
    macchia(cx, cy, 0, contatto * 1.02 * px, .16 * forza);
    if (caustica) macchia(cx + dx * morbido * px * .9, cy - dz * morbido * px * .9, 0, contatto * .8 * px, caustica, '255,236,200');
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(lato, lato), new THREE.MeshBasicMaterial({ map: tex(c, { aniso: 8 }), toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = -.002;
  return m;
}

// ————————————————————————————————— 1. FRAPPÈ —————————————————————————————————
async function creaFrappe({ tel, fondo, grane }) {
  const g = new THREE.Group();
  const B = { H: 15, rB: 3.0, rT: 3.72, parete: .22, fondo: 1.45 };
  const { P, rO, rI } = profiloBicchiere({ ...B, esp: 1.35, n: tel ? 14 : 20 });
  const seg = tel ? 48 : 72;
  // spessore: fondo pieno (1) e parete sottile (.18), per la rifrazione
  const vP = P.map((_, j) => j / (P.length - 1));
  const iBase = 8, iFine = P.length - 8;
  const mSp = tela(4, 64, (c, w, h) => { for (let y = 0; y < h; y++) { const v = 1 - (y + .5) / h; const base = v < vP[iBase] || v > vP[iFine]; c.fillStyle = base ? '#fff' : '#2e2e2e'; c.fillRect(0, y, w, 1); } });
  const tSp = tex(mSp, { srgb: false }); tSp.minFilter = tSp.magFilter = THREE.LinearFilter; tSp.generateMipmaps = false;
  const bicchiere = new THREE.Mesh(tornio(P, seg), vetro({ spessore: 1.6, mappaSpessore: tSp }));
  bicchiere.receiveShadow = true;
  g.add(bicchiere);
  await cedi('frappè: bicchiere');

  // il frappè dentro: vaniglia, bollicine contro il vetro, cioccolato colato sulle pareti
  const yF = 14.35;
  const profF = [[0, B.fondo + .01], [rI(B.fondo) - .38, B.fondo + .01]];
  for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2; profF.push([rI(B.fondo + .35) - .35 + Math.sin(a) * .34, B.fondo + .36 - Math.cos(a) * .35]); }
  for (let k = 1; k <= 16; k++) { const y = B.fondo + .36 + (yF - B.fondo - .36) * k / 16; profF.push([rO(y) - .035, y]); }
  profF.push([rI(yF) - .05, yF + .06], [rI(yF) * .7, yF + .14], [0, yF + .2]);
  const vF = profF.map(([, y]) => lim(y / (yF + .2)));
  const W = tel ? 512 : 1024, Hh = tel ? 512 : 1024;
  const cF = tela(W, Hh, (c, w, h) => {
    c.fillStyle = '#efdfc2'; c.fillRect(0, 0, w, h);
    const rnd = casuale(71), nz = valorePeriodico(8, 72);
    // variazioni morbide (panna e latte non sono uniformi) e schiuma chiara in alto
    const im = c.getImageData(0, 0, w, h), d = im.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4, v = nz(x / w * 8, y / h * 8), top = liscia(.1, 0, y / h);
      d[k] += 8 * v + 10 * top; d[k + 1] += 8 * v + 10 * top; d[k + 2] += 9 * v + 14 * top;
    }
    c.putImageData(im, 0, 0);
    // bollicine contro il vetro
    for (let i = 0; i < (tel ? 900 : 2600); i++) {
      const x = rnd() * w, y = Math.pow(rnd(), 1.6) * h, r = (.6 + rnd() * 2.2) * w / 1024;
      c.fillStyle = `rgba(255,252,244,${.35 + rnd() * .4})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(150,110,70,.18)'; c.beginPath(); c.arc(x + r * .3, y + r * .3, r * .5, 0, TAU); c.fill();
    }
    // cioccolato colato sulle pareti di vetro: colate morbide che scendono dall'alto (in cima un velo continuo), goccia in fondo
    const ondaX = valorePeriodico(8, 73), k = w / 1024;
    c.fillStyle = 'rgba(92,48,22,.55)'; c.fillRect(0, 0, w, 10 * k);
    const righe = 8;
    for (let i = 0; i < righe; i++) {
      const x0 = (i + .15 + rnd() * .7) / righe * w, L = (.18 + rnd() * .5) * h, lw = (7 + rnd() * 13) * k, ph = rnd() * 8;
      const xAt = y => x0 + (10 * ondaX(ph + y / h * 3, i) + 5 * Math.sin(y / h * 9 + ph)) * k;
      const larg = y => lw * (1 - .5 * y / L) * (1 + .18 * ondaX(ph * 2 + y / h * 6, i + 3));
      for (const [f, col] of [[1.35, 'rgba(120,70,36,.35)'], [1, 'rgba(70,34,14,.9)'], [.4, 'rgba(40,18,8,.55)']]) {
        c.beginPath(); c.moveTo(xAt(0) - larg(0) * f, 0);
        for (let y = 0; y <= L; y += 3) c.lineTo(xAt(y) - larg(y) * f, y);
        c.arc(xAt(L), L, larg(L) * f * 1.25, Math.PI, 0, true);
        for (let y = L; y >= 0; y -= 3) c.lineTo(xAt(y) + larg(y) * f, y);
        c.closePath(); c.fillStyle = col; c.fill();
      }
    }
  });
  await cedi('frappè: tela');
  const tF = tex(cF, { rip: true }); tF.wrapT = THREE.ClampToEdgeWrapping;
  const frappe = new THREE.Mesh(tornio(profF, seg, vF), fisico({ map: tF, roughness: .38, sheen: .3, sheenColor: new THREE.Color('#fff3e0'), specularIntensity: .6 }));
  frappe.castShadow = frappe.receiveShadow = true;
  g.add(frappe);

  await cedi('frappè: liquido');
  // la panna montata: rosa a stella che esce dal bicchiere
  const panna = vite({ yBase: 14.9, H: 5.2, R0: 3.78, passo: 1.85, creste: 3, prof: .22, solco: .5, esp: 1.8, cadente: 1.15, sotto: .9, tondo: .55,
    NY: tel ? 150 : 230, NF: tel ? 72 : 110, seme: 5, fase: .4, limite: y => y < B.H ? rI(y) - .04 : 99 });
  const matPanna = fisico({ vertexColors: true, color: '#fdf8ef', roughness: .6, sheen: .7, sheenRoughness: .45, sheenColor: new THREE.Color('#fff2dc'), specularIntensity: .45,
    bumpMap: grane.panna, bumpScale: .35, emissive: new THREE.Color('#5c4a36'), emissiveIntensity: .3 });
  const mPanna = new THREE.Mesh(panna.geo, matPanna); mPanna.castShadow = mPanna.receiveShadow = true;
  g.add(mPanna);

  await cedi('frappè: panna');
  // il cioccolato: filo che gira sulla panna scendendo, scavalca l'orlo e cola fuori dal bicchiere (due colate)
  const matC = cioccolatoLucido();
  const pts = [], nrm = [], lw = [], lh = [];
  const N1 = tel ? 220 : 360;
  for (let j = 0; j <= N1; j++) {
    const s = j / N1, fi = -.3 - s * TAU * 2.15;                               // scende girando lungo l'elica, dalla punta all'orlo
    const y = panna.cresta(2, fi, .5 + .3 * Math.sin(s * 21) + .08 * Math.sin(s * 53));   // ondeggia dentro il giro, non scavalca i solchi
    const { p, n } = panna.sulla(y, fi, -.035);
    pts.push(p); nrm.push(n);
    const w = .16 * (.85 + .25 * Math.sin(s * 13)) * Math.pow(liscia(0, .04, s), .5), h = w * .5;
    lw.push(w); lh.push(h);
  }
  const filo = new THREE.Mesh(nastro(pts, nrm, lw, lh, 8), matC); filo.castShadow = true;
  g.add(filo);
  // colate sul vetro: dall'orlo in giù lungo la parete esterna, larghe in alto, collo, goccia tonda in fondo
  const colata = (th, L, larg) => {
    const pp = [], nn = [], ww = [], hh = [], M = tel ? 40 : 64;
    for (let j = 0; j <= M; j++) {
      const s = j / M;
      let p, n;
      if (s < .12) { // sopra l'orlo: scavalca
        const a = s / .12 * Math.PI / 2, rc = rO(B.H) - B.parete / 2, R = B.parete / 2 + .05;
        const r = rc + Math.sin(a) * R, y = B.H - B.parete / 2 + Math.cos(a) * R;
        p = V3(Math.sin(th) * r, y, Math.cos(th) * r); n = V3(Math.sin(th) * Math.sin(a), Math.cos(a), Math.cos(th) * Math.sin(a));
      } else {
        const y = B.H - B.parete / 2 - (s - .12) / .88 * L, a = th + .02 * Math.sin(y * 1.3);
        const r = rO(y) + .005;
        p = V3(Math.sin(a) * r, y, Math.cos(a) * r); n = V3(Math.sin(a), -.05, Math.cos(a)).normalize();
      }
      pp.push(p); nn.push(n);
      const e = 1 - s, bulbo = Math.exp(-(((s - .93) / .05) ** 2));
      const w = larg * ((.42 + .9 * Math.pow(e, 3) * liscia(.35, .1, s)) * (1 + .12 * Math.sin(s * 17 + th) + .06 * Math.sin(s * 41 + th * 3)) + .7 * bulbo) * Math.sqrt(liscia(1, .975, s)) * Math.pow(liscia(0, .02, s), .3);
      ww.push(w); hh.push(w * (.26 + .45 * bulbo));
    }
    const m = new THREE.Mesh(nastro(pp, nn, ww, hh, 10), matC); m.castShadow = true; return m;
  };
  g.add(colata(.35, 4.4, .27), colata(-.5, 2.4, .21), colata(1.25, 1.3, .17));
  { // il velo di cioccolato sull'orlo, da dove partono le colate
    const pp = [], nn = [], ww = [], hh = [], M = tel ? 50 : 80, rc = rO(B.H) - B.parete / 2;
    for (let j = 0; j <= M; j++) {
      const t = j / M, a = mix(-.85, 1.5, t);
      pp.push(V3(Math.sin(a) * rc, B.H + .02, Math.cos(a) * rc)); nn.push(V3(0, 1, 0));
      const w = .2 * (.7 + .5 * Math.exp(-(((a - .35) / .2) ** 2)) + .35 * Math.exp(-(((a + .5) / .2) ** 2)) + .25 * Math.sin(a * 9)) * Math.sqrt(liscia(0, .06, t) * liscia(1, .94, t));
      ww.push(Math.max(0, w)); hh.push(Math.max(0, w) * .45);
    }
    const m = new THREE.Mesh(nastro(pp, nn, ww, hh, 8), matC); m.castShadow = true; g.add(m);
  }

  await cedi('frappè: cioccolato');
  // la cannuccia di carta a righe (bianca e ocra), inclinata, con il foro in cima
  const cc = tela(64, 512, (c, w, h) => {
    c.fillStyle = '#f5efe4'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b8860f';
    for (let k = -4; k < 40; k++) { c.beginPath(); const y = k * 16; c.moveTo(0, y); c.lineTo(w, y + 22); c.lineTo(w, y + 30); c.lineTo(0, y + 8); c.fill(); }
    const nz = valorePeriodico(16, 9); const im = c.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % w, y = Math.floor(i / 4 / w), v = 6 * nz(x / w * 4, y / h * 32); d[i] += v; d[i + 1] += v; d[i + 2] += v; }
    c.putImageData(im, 0, 0);
  });
  const tC = tex(cc, { rip: true }); tC.repeat.set(1, 3.2);
  const L = 19.5, rS = .34;
  const cannuccia = new THREE.Group();
  const fuori = new THREE.Mesh(new THREE.CylinderGeometry(rS, rS, L, tel ? 20 : 28, 1, true), fisico({ map: tC, roughness: .72, sheen: .3, sheenColor: new THREE.Color('#ffffff') }));
  fuori.position.y = L / 2; fuori.castShadow = true;
  const dentro = new THREE.Mesh(new THREE.CylinderGeometry(rS - .035, rS - .035, 1.8, tel ? 20 : 28, 1, true), fisico({ color: '#8a7a66', roughness: .9, side: THREE.BackSide }));
  dentro.position.y = L - .9;
  const labbro = new THREE.Mesh(new THREE.RingGeometry(rS - .035, rS, tel ? 20 : 28), fisico({ color: '#efe6d6', roughness: .8 }));
  labbro.rotation.x = -Math.PI / 2; labbro.position.y = L;
  cannuccia.add(fuori, dentro, labbro);
  cannuccia.position.set(-1.6, 3, 1.0); cannuccia.rotation.set(-.12, 0, -.2);
  g.add(cannuccia);

  return { gruppo: g, R: B.rT + .2, alto: 23.0, ombra: suolo(fondo, { contatto: B.rB, morbido: 7.5, forza: .8, caustica: .35 }), elev: 11, riempi: .8, rH: .88, trasmissione: true };
}

// ————————————————————————————————— 2. FROZEN YOGURT —————————————————————————————————
async function creaYogurt({ tel, fondo, grane, logo }) {
  const g = new THREE.Group();
  const H = 6.3, rB = 3.05, rT = 4.35;
  const rO = y => rB + (rT - rB) * y / H;
  // la coppetta di carta: fondo rialzato, parete, orlo arrotolato in fuori, dentro chiaro
  const P = [[0, .3], [rB - .12, .3], [rB - .06, .26], [rB - .06, .02], [rB - .02, 0]];
  const nW = 14;
  for (let k = 1; k <= nW; k++) { const y = .04 + (H - .2 - .04) * k / nW; P.push([rO(y), y]); }
  const iOrlo0 = P.length;
  const cx = rT + .04, cy = H - .1, rr = .13;
  for (let k = 0; k <= 12; k++) { const a = (-110 + k / 12 * 300) * Math.PI / 180; P.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  const iDentro = P.length;
  for (let k = 0; k <= nW; k++) { const y = H - .15 - (H - .15 - .4) * k / nW; P.push([rO(y) - .05, y]); }
  P.push([rB - .3, .36], [0, .38]);
  // v: fuori .5…1 (metà di sopra della tela: marrone col logo), orlo e dentro 0….5 (chiaro)
  const vP = P.map(([, y], j) => j < iOrlo0 ? .52 + .46 * lim(y / H) : .48 - .46 * (j - iOrlo0) / (P.length - iOrlo0));
  const W = tel ? 1024 : 2048, Hc = W / 2;
  await cedi('yogurt: profilo');
  const imgLogo = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = logo; });
  const cT = tela(W, Hc, (c, w, h) => {
    const hF = h / 2;   // metà di sopra della tela = fuori
    c.fillStyle = '#6a4127'; c.fillRect(0, 0, w, hF);
    // carta patinata: leggera grana e due filetti crema vicino all'orlo e al fondo
    const nz = valorePeriodico(32, 41), im = c.getImageData(0, 0, w, hF), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const x = (i / 4) % w, y = Math.floor(i / 4 / w), v = 5 * nz(x / w * 64, y / hF * 16); d[i] += v; d[i + 1] += v * .8; d[i + 2] += v * .6; }
    c.putImageData(im, 0, 0);
    const vy = v => (1 - (.52 + .46 * v)) * h;   // quota della parete (0 fondo, 1 orlo) → y nella tela
    c.fillStyle = 'rgba(243,228,200,.9)';
    c.fillRect(0, vy(.93), w, h * .006); c.fillRect(0, vy(.07), w, h * .004);
    // il logo tondo: disegnato riga per riga, largo quanto serve perché sulla parete conica resti tondo
    const lato = 3.9, v0 = .2, v1 = v0 + lato / H;   // alto 3,9 cm
    for (const uC of [.25, .75]) {
      for (let y = Math.floor(vy(v1)); y < vy(v0); y++) {
        const v = 1 - y / h, vv = (v - .52) / .46, yy = vv * H;            // quota sulla parete
        const t = (vv - v0) / (v1 - v0);                                   // 0 in basso, 1 in alto nel logo
        const px = w / (TAU * rO(yy)), larg = lato * px;                   // larghezza del logo in pixel a questa quota
        c.drawImage(imgLogo, 0, (1 - t) * imgLogo.height, imgLogo.width, imgLogo.height / (vy(v0) - vy(v1)) + .5, uC * w - larg / 2, y, larg, 1.2);
      }
    }
    // dentro: carta chiara
    c.fillStyle = '#efe4d2'; c.fillRect(0, hF, w, h - hF);
  });
  await cedi('yogurt: tela della coppetta');
  const tT = tex(cT, { aniso: 8 });
  const coppetta = new THREE.Mesh(tornio(P, tel ? 48 : 72, vP), fisico({ map: tT, roughness: .5, clearcoat: .25, clearcoatRoughness: .4, sheen: .2, sheenColor: new THREE.Color('#fff0dc') }));
  coppetta.castShadow = coppetta.receiveShadow = true;
  g.add(coppetta);

  await cedi('yogurt: coppetta');
  // il frozen yogurt: spirale della macchina (bocchetta a stella), bianco un filo lucido
  const sp = vite({ yBase: 6.25, H: 6.2, R0: 4.15, passo: 2.1, creste: 3, prof: .1, solco: .56, esp: 1.55, cadente: 1.2, sotto: .8,
    NY: tel ? 150 : 230, NF: tel ? 72 : 110, seme: 17, fase: 2.2, limite: y => y < H - .05 ? rO(y) - .1 : 99 });
  const matY = fisico({ vertexColors: true, color: '#fbf8f2', roughness: .38, sheen: .5, sheenRoughness: .4, sheenColor: new THREE.Color('#ffffff'), specularIntensity: .7,
    bumpMap: grane.yogurt, bumpScale: .2, emissive: new THREE.Color('#5a4c40'), emissiveIntensity: .28 });
  const mY = new THREE.Mesh(sp.geo, matY); mY.castShadow = mY.receiveShadow = true;
  g.add(mY);

  await cedi('yogurt: spirale');
  // guarnizioni: lamponi, mirtilli, granella di nocciole
  const rnd = casuale(301);
  const lampone = (r) => {
    const parti = [], drupa = new THREE.IcosahedronGeometry(1, tel ? 1 : 2);
    const anelli = tel ? 7 : 8, colori = [];
    for (let a = 0; a < anelli; a++) {
      const t = (a + .5) / anelli, ang = t * Math.PI * .9;       // dalla punta (in basso) al fondo aperto
      const rr = Math.sin(ang) * .9, y = -Math.cos(ang) * 1.2, n = Math.max(5, Math.round(rr * 13));
      for (let k = 0; k < n; k++) {
        const f = (k + (a % 2) * .5) / n * TAU + rnd() * .12, q = drupa.clone();
        const s = .27 + .05 * rnd();
        q.scale(s, s * 1.12, s); q.translate(Math.cos(f) * rr, y, Math.sin(f) * rr);
        parti.push(q);
        const c = .8 + .3 * rnd(); for (let v = 0; v < q.attributes.position.count; v++) colori.push(c, c * (.92 + .1 * rnd()), c);
      }
    }
    const anima = new THREE.SphereGeometry(1, 16, 12); anima.scale(.78, 1.05, .78);
    parti.push(anima); for (let v = 0; v < anima.attributes.position.count; v++) colori.push(.45, .4, .42);
    const geo = unisci(parti); geo.setAttribute('color', new THREE.Float32BufferAttribute(colori, 3)); geo.scale(r, r, r);
    return geo;
  };
  const matL = fisico({ vertexColors: true, color: '#b8233f', roughness: .42, clearcoat: .25, clearcoatRoughness: .3, sheen: 1, sheenColor: new THREE.Color('#ffb3c0'), sheenRoughness: .5, specularIntensity: .8 });
  const mirtillo = (r) => {
    const geo = new THREE.SphereGeometry(1, tel ? 20 : 28, tel ? 14 : 20), p = geo.attributes.position, d = V3();
    for (let i = 0; i < p.count; i++) {
      d.fromBufferAttribute(p, i);
      const fi = Math.atan2(d.z, d.x), top = liscia(.8, .97, d.y);
      const stella = .5 + .5 * Math.cos(fi * 5);
      const fossa = top * (.16 - .09 * stella);
      d.multiplyScalar(1 - fossa); d.y *= .86;
      p.setXYZ(i, d.x, d.y, d.z);
    }
    geo.computeVertexNormals(); geo.scale(r, r, r); return geo;
  };
  const matM = fisico({ color: '#2d3252', roughness: .55, sheen: 1, sheenColor: new THREE.Color('#a8b0d8'), sheenRoughness: .6, specularIntensity: .5 });
  const posa = (geo, mat, k, fi, r, rot, f = .45) => {
    const { p, n } = sp.sulla(sp.cresta(k, fi, f), fi);
    const m = new THREE.Mesh(geo, mat); m.position.copy(p).addScaledVector(n, r * .42);
    m.quaternion.setFromUnitVectors(V3(0, 1, 0), n.clone().lerp(V3(0, 1, 0), .5).normalize()); m.rotateY(rot);
    m.castShadow = m.receiveShadow = true; g.add(m); return m;
  };
  const gL = lampone(.66);
  posa(gL, matL, 2, 1.9, .7, 0).rotateX(Math.PI);           // punta in su
  posa(gL, matL, 1, .5, .7, 1).rotateZ(Math.PI * .8);
  posa(gL, matL, 0, 3.4, .7, 2).rotateX(Math.PI * .7);
  await cedi('yogurt: lamponi');
  const gM = mirtillo(.52);
  for (const [k, fi] of [[1, 2.6], [0, 1.2], [2, .2], [0, 5.3], [1, 4.3]]) posa(gM, matM, k, fi, .5, rnd() * TAU).rotateX((rnd() - .5) * 1.2);
  await cedi('yogurt: mirtilli');
  // granella: pezzi irregolari (istanze)
  const pezzo = new THREE.IcosahedronGeometry(1, 1); {
    const p = pezzo.attributes.position, r2 = casuale(8), mappa = new Map();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!mappa.has(k)) mappa.set(k, .8 + r2() * .35);
      const s = mappa.get(k); p.setXYZ(i, p.getX(i) * s * 1.15, p.getY(i) * s * .62, p.getZ(i) * s * .9);
    }
    pezzo.computeVertexNormals();
  }
  const nG = tel ? 34 : 60;
  const matG = fisico({ color: '#ffffff', roughness: .62, sheen: .3, sheenColor: new THREE.Color('#ffe2b0') });
  const gran = new THREE.InstancedMesh(pezzo, matG, nG); gran.castShadow = gran.receiveShadow = true;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), M = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < nG; i++) {
    let fi, y, k = 0; do { fi = rnd() * TAU; y = sp.cresta(Math.floor(rnd() * 3), fi, .2 + rnd() * .6); } while (y > sp.alto - 1.4 && ++k < 20);
    const { p, n } = sp.sulla(y, fi, -.02);
    const s = .1 + rnd() * .12;
    e.set(rnd() * TAU, rnd() * TAU, rnd() * TAU); q.setFromEuler(e);
    M.compose(p.addScaledVector(n, s * .3), q, V3(s, s, s));
    gran.setMatrixAt(i, M);
    col.setHSL(.075 + rnd() * .025, .42 + rnd() * .15, .42 + rnd() * .22); gran.setColorAt(i, col);
  }
  g.add(gran);

  return { gruppo: g, R: rT + .3, alto: 13.2, ombra: suolo(fondo, { contatto: rB, morbido: 7, forza: 1 }), elev: 16, riempi: .8, rH: .74 };
}
// unisce geometrie (solo posizione, normale, uv) in una
function unisci(lista) {
  let n = 0, ni = 0; for (const g of lista) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of lista) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + o; oi += g.index.count; }
    else { for (let i = 0; i < g.attributes.position.count; i++) idx[oi + i] = o + i; oi += g.attributes.position.count; }
    o += g.attributes.position.count;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(pos, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); r.setIndex(new THREE.BufferAttribute(idx, 1));
  return r;
}

// ————————————————————————————————— 3. CRÊPE —————————————————————————————————
async function creaCrepe({ tel, fondo, occl }) {
  const g = new THREE.Group();
  // il piattino: porcellana bianca, piede, fondo piano, tesa che sale
  const yP = .55;
  const P = [[0, .18], [3.6, .16], [4.1, .02], [4.5, 0], [4.8, .06], [5.2, .3], [8.2, .55], [10.1, 1.05], [10.9, 1.34], [11.05, 1.46], [10.98, 1.55], [10.8, 1.54], [9.9, 1.3], [8.1, .82], [6.8, yP + .02], [5, yP], [0, yP]].map(([r, y]) => [r * 1.16, y]);
  const vPiatto = P.map((_, j) => j / (P.length - 1));
  const cPi = tela(4, 256, (c, w, h) => { c.fillStyle = '#fbf8f2'; c.fillRect(0, 0, w, h); const vv = vPiatto[12] + (vPiatto[13] - vPiatto[12]) * .3; c.fillStyle = '#b8862e'; c.fillRect(0, (1 - vv) * h - 1.2, w, 2.4); });
  const tPi = tex(cPi); tPi.minFilter = THREE.LinearFilter; tPi.generateMipmaps = false;
  const piatto = new THREE.Mesh(tornio(P, tel ? 64 : 96), fisico({ map: tPi, color: '#ffffff', roughness: .1, clearcoat: .8, clearcoatRoughness: .06, specularIntensity: .8, sheen: .1 }));
  piatto.castShadow = piatto.receiveShadow = true;
  g.add(piatto);

  await cedi('crêpe: piatto');
  // la crêpe piegata in quattro: un cuscino a spicchio (90°) con le pieghe tonde sui due lati dritti,
  // il bordo curvo sottile e mosso; la tela: dorata con le macchie di cottura a pizzo, zucchero a velo sopra
  const R = 11.6, hMax = 1.55;
  const n1 = simplex3(51);
  const bordo = a => R * (1 + .014 * Math.sin(a * 21 + .5) + .01 * Math.sin(a * 37 + 1.3) + .01 * n1(a * 3, 0, 0));
  const spess = (r, a) => hMax * (.62 + .38 * liscia(1.05, .25, r / R)) * (1 + .08 * n1(r * .35, a * 2.5, 1));
  // quota della superficie di sopra e di sotto per (r, a) con la sezione tonda vicino ai bordi
  const NS = tel ? 40 : 64, NT = tel ? 36 : 56;
  const pos = [], idx = [], uvs = [];
  const id = new Map(), vert = (key, [x, y, z, ux, uz]) => { if (id.has(key)) return id.get(key); const i = pos.length / 3; pos.push(x, y, z); uvs.push(ux / (1.42 * R), uz / (1.42 * R) + .5); id.set(key, i); return i; };
  const curva = t => .5 - .5 * Math.cos(Math.PI * t);   // più fitto vicino ai bordi
  const punto = (s, t, sopra) => {
    const a = (curva(t) - .5) * Math.PI / 2, rb = bordo(a), r = curva(s) * rb;
    const e1 = r * Math.sin(Math.PI / 4 - Math.abs(a)), e2 = rb - r;
    const h = spess(r, a), rP = h / 2;
    const eC = e2 / .55, curvo = eC < e1;      // il bordo curvo è più sottile (gli strati liberi)
    const e = Math.min(e1, eC);
    const k = e >= rP ? 1 : Math.sqrt(Math.max(0, 1 - (1 - e / rP) ** 2));
    const onda = .26 * Math.sin(r * .8 + a * 3) * liscia(0, 3, r) + .14 * n1(r * .45, a * 4, 7);
    const yMid = rP + onda * .5;
    const y = sopra ? yMid + rP * k + onda * .5 * k : yMid - rP * k;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // la tela segue il foglio che gira intorno alla piega: spostata verso fuori di quanto è lungo l'arco (niente righe sui fianchi)
    let ux = x, uz = z;
    if (e < rP) {
      const b0 = Math.asin(lim((rP - e) / rP)), beta = sopra ? b0 : Math.PI - b0, sp = rP * (beta - Math.sin(b0)) * (curvo ? .55 : 1);
      const sg = a >= 0 ? 1 : -1, fx = curvo ? Math.cos(a) : -sg * Math.SQRT1_2, fz = curvo ? Math.sin(a) : sg * Math.SQRT1_2;
      ux += fx * sp; uz += fz * sp;
    }
    return [x, Math.max(0, y) + yP, z, ux, uz];
  };
  for (const sopra of [true, false]) {
    for (let j = 0; j <= NS; j++) for (let i = 0; i <= NT; i++) {
      const bordoV = j === 0 || j === NS || i === 0 || i === NT;
      vert(bordoV ? `b${j},${i}` : `${sopra}${j},${i}`, punto(j / NS, i / NT, sopra));
    }
    for (let j = 0; j < NS; j++) for (let i = 0; i < NT; i++) {
      const k = (jj, ii) => id.get((jj === 0 || jj === NS || ii === 0 || ii === NT) ? `b${jj},${ii}` : `${sopra}${jj},${ii}`);
      const a = k(j, i), b = k(j, i + 1), c = k(j + 1, i + 1), d = k(j + 1, i);
      if (sopra) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
  }
  await cedi('crêpe: forma');
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const S = tel ? 512 : 1024;
  const cCr = await texCrepe(S, 7);
  const tCr = tex(cCr.colore, { aniso: 8 }), tBump = tex(cCr.rilievo, { srgb: false });
  const crepe = new THREE.Mesh(geo, fisico({ map: tCr, bumpMap: tBump, bumpScale: 2.2, roughness: .62, sheen: .5, sheenColor: new THREE.Color('#ffe0a8'), sheenRoughness: .5, specularIntensity: .45 }));
  crepe.castShadow = crepe.receiveShadow = true;
  const fan = new THREE.Group(); fan.add(crepe);
  await cedi('crêpe: tela');
  // la crema che esce dal bordo curvo, tra gli strati
  const matN = fisico({ color: '#4a2211', roughness: .26, clearcoat: .7, clearcoatRoughness: .1, sheen: .25, sheenColor: new THREE.Color('#c08a60') });
  {
    const pp = [], nn = [], ww = [], hh = [], M = tel ? 80 : 130, r2 = casuale(5);
    const blob = []; for (let k = 0; k < 9; k++) blob.push([r2() * .9 + .05, .35 + r2() * .6, .03 + r2() * .05]);
    for (let j = 0; j <= M; j++) {
      const t = j / M, a = (t - .5) * Math.PI / 2 * .97, rb = bordo(a) - .12;
      let gonfio = 0; for (const [c, h, s] of blob) gonfio += h * Math.exp(-(((t - c) / s) ** 2));
      const y = yP + spess(rb, a) * .42;
      pp.push(V3(Math.cos(a) * (rb + .03 + gonfio * .22), y, Math.sin(a) * (rb + .03 + gonfio * .22)));
      nn.push(V3(Math.cos(a), .15, Math.sin(a)).normalize());
      const w = (.13 + .17 * gonfio) * Math.sqrt(liscia(0, .03, t) * liscia(1, .97, t));
      ww.push(w); hh.push(.15 + .27 * gonfio);
    }
    const m = new THREE.Mesh(nastro(pp, nn, ww, hh, 10), matN); m.castShadow = true; fan.add(m);
  }
  await cedi('crêpe: crema');
  // righe di cioccolato sopra: la colata a zig-zag, passate quasi dritte da una piega all'altra
  {
    const pp = [], nn = [], ww = [], hh = [], passate = 6, M = tel ? 36 : 56, rr = casuale(12);
    const sopraIn = (x, z) => {   // punto sulla superficie di sopra per (x, z) nello spicchio
      const r = Math.hypot(x, z), a = Math.atan2(z, x), s0 = r / bordo(a), t0 = a / (Math.PI / 2) + .5;
      const P0 = punto(inversaCurva(lim(s0)), inversaCurva(lim(t0)), true);
      return V3(P0[0], P0[1], P0[2]);
    };
    for (let q = 0; q < passate; q++) {
      const x = 2.4 + q * 1.35 + (rr() - .5) * .3, inc = .12 + (rr() - .5) * .1, dir = q % 2 ? -1 : 1;
      const zMax = Math.min(x - .7, Math.sqrt(Math.max(0, (R - .9) ** 2 - x * x))) - .15;
      for (let j = 0; j <= M; j++) {
        const t = j / M, z = dir * mix(-zMax, zMax, t), xx = x + z * inc + .12 * Math.sin(t * 7 + q);
        const p = sopraIn(xx, z), p2 = sopraIn(xx + .05, z);
        pp.push(p); nn.push(V3(0, 1, 0).addScaledVector(p.clone().sub(p2), 3).normalize());
        const w = .17 * (.85 + .3 * Math.sin(t * 9 + q * 2)) * Math.sqrt(liscia(0, .04, t) * liscia(1, .96, t) + .25);
        ww.push(q === 0 && j === 0 || q === passate - 1 && j === M ? 0 : w); hh.push(w * .55);
      }
    }
    const m = new THREE.Mesh(nastro(pp, nn, ww, hh, 8), matN); m.castShadow = true; fan.add(m);
  }
  fan.position.set(-6.7, 0, 0);
  fan.rotation.y = .06;
  g.add(fan);
  await cedi('crêpe: righe');
  // "anche con il gelato": una pallina di fior di latte accanto, appoggiata al bordo della crêpe
  const palC = await fiordilatte(occl, { tel, seme: 57 });
  palC.mesh.scale.setScalar(2.35); palC.mesh.position.set(-3.2, yP + 1.9, 5.9); palC.mesh.rotation.set(.1, 2.4, -.05);
  g.add(palC.mesh);
  // zucchero a velo caduto sul piatto (decalcomania)
  const cZ = tela(512, 512, (c, w, h) => {
    const rnd = casuale(88);
    for (let i = 0; i < 2600; i++) {
      const a = rnd() * TAU, d = Math.pow(rnd(), .6) * w * .5, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
      const al = .5 * (1 - d / (w * .5)) * rnd();
      c.fillStyle = `rgba(255,255,255,${al})`; c.fillRect(x, y, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
  });
  const zuc = new THREE.Mesh(new THREE.CircleGeometry(9.4, 48), new THREE.MeshStandardMaterial({ map: tex(cZ), transparent: true, depthWrite: false, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2 }));
  zuc.rotation.x = -Math.PI / 2; zuc.position.y = yP + .01; zuc.receiveShadow = true;
  g.add(zuc);
  return { gruppo: g, R: 12.9, alto: 3.6, ombra: suolo(fondo, { contatto: 5.4, morbido: 15, forza: .9 }), elev: 30, riempi: .9, rH: .72 };
}
const inversaCurva = x => Math.acos(1 - 2 * x) / Math.PI;
// la tela della crêpe: dorata chiara, macchie di cottura a pizzo (celle), zone più cotte, zucchero a velo
async function texCrepe(S, seme) {
  const rnd = casuale(seme), zona = valorePeriodico(4, seme + 1), fine = valorePeriodico(12, seme + 2);
  const k = S / 1024;
  const colore = tela(S, S), g0 = colore.getContext('2d');
  await (async (g) => {
    g.fillStyle = '#f2d59c'; g.fillRect(0, 0, S, S);
    const z = (x, y) => lim(.5 + .55 * zona(x / S * 4, y / S * 4) + .3 * fine(x / S * 12, y / S * 12));
    // zone più cotte: velature larghe e morbide
    for (let i = 0; i < 30; i++) {
      const x = rnd() * S, y = rnd() * S, r = (90 + rnd() * 240) * k, gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(200,138,70,${.14 + rnd() * .2})`); gr.addColorStop(1, 'rgba(200,138,70,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // la brunitura su un livello a parte: chiazze sfumate, fitte dove la zona è cotta; poi le bolle la bucano (il pizzo).
    // niente sfocatura del canvas (Safari < 18 non la conosce): bordi morbidi con i gradienti radiali
    const macchia = (h, x, y, r, col, a) => {
      const gr = h.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.55, `rgba(${col},${a * .85})`); gr.addColorStop(1, `rgba(${col},0)`);
      h.fillStyle = gr; h.fillRect(x - r, y - r, r * 2, r * 2);
    };
    await cedi('crêpe: velature');
    const liv = tela(S, S), h = liv.getContext('2d');
    {
      for (let i = 0; i < 7000 * k * k; i++) {
        const x = rnd() * S, y = rnd() * S, zz = z(x, y);
        if (rnd() > Math.pow(zz, 1.5) * 1.25) continue;
        macchia(h, x, y, (4 + Math.pow(rnd(), 1.5) * 15) * k, `${160 + rnd() * 26 | 0},${92 + rnd() * 20 | 0},${38 + rnd() * 10 | 0}`, .3 + .55 * rnd() * zz);
      }
      await cedi('crêpe: brunitura');
      h.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 6000 * k * k; i++) macchia(h, rnd() * S, rnd() * S, (1.6 + Math.pow(rnd(), 1.8) * 5.5) * k, '0,0,0', .7 + .3 * rnd());
    }
    await cedi('crêpe: pizzo');
    g.drawImage(liv, 0, 0);
    // puntini scuri sparsi e grana fine
    for (let i = 0; i < 1400 * k * k; i++) { const x = rnd() * S, y = rnd() * S, r = (.8 + rnd() * 1.8) * k; g.fillStyle = `rgba(122,68,28,${.25 + .35 * rnd()})`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    for (let i = 0; i < 14000 * k * k; i++) { const x = rnd() * S, y = rnd() * S; g.fillStyle = rnd() < .5 ? 'rgba(120,70,30,.1)' : 'rgba(255,240,210,.1)'; g.fillRect(x, y, 1.5 * k, 1.5 * k); }
  })(g0);
  // rilievo: le parti cotte un filo più in rilievo e ruvide (dalla luminosità, prima dello zucchero)
  const rilievo = tela(S, S, (g) => g.drawImage(colore, 0, 0));   // il bump legge il rosso: chiaro = alto, cotto = basso
  const g = colore.getContext('2d');
  // zucchero a velo: velo morbido sul centro dello spicchio (u ≈ .42) e puntini
  const cx = S * .42, cy = S * .5, R = S * .36;
  const vel = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  vel.addColorStop(0, 'rgba(255,253,248,.5)'); vel.addColorStop(.6, 'rgba(255,253,248,.24)'); vel.addColorStop(1, 'rgba(255,253,248,0)');
  g.fillStyle = vel; g.fillRect(0, 0, S, S);
  for (let i = 0; i < S * 22; i++) {
    const a = rnd() * TAU, d = Math.pow(rnd(), .7) * R, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    g.fillStyle = `rgba(255,255,255,${(.35 + .6 * rnd()) * (1 - d / R)})`;
    const q = (.6 + rnd() * 1.3) * k; g.fillRect(x, y, q, q);
  }
  await pausa();
  return { colore, rilievo };
}

// ————————————————————————————————— la pallina di fior di latte —————————————————————————————————
// la pallina del cono (js/pallina.js: forma da porzionatore, rilievo vero dalla foto) con la foto del cioccolato schiarita:
// resta il disegno del porzionatore e dei pori, il colore diventa latte. Le immagini sono quelle del cono (già in cache).
async function fiordilatte(occl, { tel, seme = 91, indice = 0 }) {
  await Promise.all(['img/cioccolato-512.webp', 'img/cioccolato-rilievo.webp'].map(u => { const i = new Image(); i.src = u; return i.decode().catch(() => {}); }));
  await cedi('pallina: foto');
  const pal = await creaPallina({ gusto: 'cioccolato', seme, N: tel ? 30 : 46, occl, indice, telefono: true, schiaccia: .92,
    opzForma: { rilievoGeo: .03, grumi: .04 }, materiale: { colore: '#ffffff', ruvido: .6, lucido: .4, rilievo: .012, sheen: .45, sheenColor: '#fff6ea' } });
  await cedi('pallina: forma');
  const img = pal.uni.uGelColore.value.image;
  const cB = tela(img.width, img.height, (c, w, h) => {
    c.drawImage(img, 0, 0, w, h);
    const im = c.getImageData(0, 0, w, h), d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * .3 + d[i + 1] * .55 + d[i + 2] * .15) / 255, k = lim((l - .12) / .5);   // chiaroscuro della foto → fior di latte
      d[i] = 208 + 44 * k; d[i + 1] = 200 + 46 * k; d[i + 2] = 184 + 48 * k;
    }
    c.putImageData(im, 0, 0);
  });
  const tB = tex(cB); tB.generateMipmaps = true; tB.minFilter = THREE.LinearMipmapLinearFilter;
  pal.uni.uGelColore.value = tB;
  await cedi('pallina: fior di latte');
  return pal;
}

// ————————————————————————————————— 4. AFFOGATO AL CAFFÈ —————————————————————————————————
async function creaAffogato({ tel, fondo, occl }) {
  const SC = tel ? 256 : 512;
  const g = new THREE.Group();
  const B = { H: 7.4, rB: 3.35, rT: 4.05, parete: .24, fondo: 1.05 };
  const { P, rI, rO } = profiloBicchiere({ ...B, esp: 1.1, n: tel ? 10 : 14, smusso: .2 });
  const seg = tel ? 48 : 72;
  const vP = P.map((_, j) => j / (P.length - 1));
  const iBase = 8, iFine = P.length - 8;
  const mSp = tela(4, 64, (c, w, h) => { for (let y = 0; y < h; y++) { const v = 1 - (y + .5) / h; const base = v < vP[iBase] || v > vP[iFine]; c.fillStyle = base ? '#fff' : '#333'; c.fillRect(0, y, w, 1); } });
  const tSp = tex(mSp, { srgb: false }); tSp.minFilter = tSp.magFilter = THREE.LinearFilter; tSp.generateMipmaps = false;
  const bicchiere = new THREE.Mesh(tornio(P, seg), vetro({ spessore: 1.2, mappaSpessore: tSp }));
  bicchiere.receiveShadow = true;
  g.add(bicchiere);

  await cedi('affogato: bicchiere');
  // il caffè: colonna scura, in cima la crema (nocciola, tigrata) con il gelato che si scioglie intorno alla pallina
  const yC = 3.55;
  const profC = [[0, B.fondo + .01], [rI(B.fondo) - .36, B.fondo + .01]];
  for (let k = 0; k <= 4; k++) { const a = k / 4 * Math.PI / 2; profC.push([rI(B.fondo + .35) - .35 + Math.sin(a) * .34, B.fondo + .36 - Math.cos(a) * .35]); }
  for (let k = 1; k <= 6; k++) { const y = B.fondo + .36 + (yC - B.fondo - .36) * k / 6; profC.push([rO(y) - .035, y]); }
  const vC = profC.map(([, y]) => lim(y / yC) * .5);
  const cCaffe = tela(SC, SC, (c, w, h) => {
    // metà di sotto della tela (v 0….5): il fianco del caffè; metà di sopra: la crema vista dall'alto
    const lato = c.createLinearGradient(0, h, 0, h / 2);
    lato.addColorStop(0, '#140803'); lato.addColorStop(.86, '#241006'); lato.addColorStop(.95, '#7a4520'); lato.addColorStop(1, '#b67c45');
    c.fillStyle = lato; c.fillRect(0, h / 2, w, h / 2);
    const nz = valorePeriodico(16, 61), nz2 = valorePeriodico(48, 62), im = c.getImageData(0, 0, w, h / 2), d = im.data;
    for (let y = 0; y < h / 2; y++) for (let x = 0; x < w; x++) {
      const u = (x / w - .5) * 2, v = (y / (h / 2) - .5) * 2, r = Math.hypot(u, v), k = (y * w + x) * 4, ang = Math.atan2(v, u);
      const tigre = liscia(.35, .85, .5 + .45 * nz(x / w * 16, y / h * 32) + .25 * nz2(x / w * 48, y / h * 96));
      let col = [176 - 58 * tigre, 112 - 42 * tigre, 58 - 24 * tigre];
      // il fior di latte sciolto intorno alla pallina: anello chiaro a spirali che sfuma nella crema
      const sciolto = liscia(.74, .56, r + .07 * Math.sin(ang * 4 + r * 10) + .05 * nz(x / w * 16 + 5, y / h * 32)) * .9;
      col = col.map((c0, i) => mix(c0, [232, 214, 186][i], sciolto));
      const orlo = liscia(.9, .99, r) * .45;   // contro il vetro la crema sale e schiarisce
      col = col.map((c0, i) => mix(c0, [204, 150, 92][i], orlo));
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    c.putImageData(im, 0, 0);
    const rnd = casuale(64);
    for (let i = 0; i < 2400 * (w / 512) ** 2; i++) { const x = rnd() * w, y = rnd() * h / 2, r = (.4 + rnd() * 1.1) * w / 512; c.fillStyle = rnd() < .6 ? `rgba(236,196,146,${.2 + rnd() * .3})` : `rgba(90,48,20,${.15 + rnd() * .2})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  });
  await cedi('affogato: tela');
  const tCaffe = tex(cCaffe);
  const matCaffe = fisico({ map: tCaffe, roughness: .3, specularIntensity: .8, clearcoat: .4, clearcoatRoughness: .15 });
  const caffe = new THREE.Mesh(tornio(profC, seg, vC), matCaffe); caffe.receiveShadow = true;
  g.add(caffe);
  const rTop = rO(yC) - .035;
  const top = new THREE.Mesh(new THREE.CircleGeometry(rTop, seg), matCaffe);
  { const uv = top.geometry.attributes.uv, p = top.geometry.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, .5 + .5 * p.getX(i) / rTop, .5 + .5 * (.5 + .5 * p.getY(i) / rTop)); }
  top.rotation.x = -Math.PI / 2; top.position.y = yC; top.receiveShadow = true;
  g.add(top);

  await cedi('affogato: caffè');
  // la pallina di fior di latte (la stessa della crêpe)
  const pal = await fiordilatte(occl, { tel, seme: 91 });
  // il caffè che la avvolge: velo sopra, rivoli che scendono, bagnato sopra la linea del caffè; lucido dove è bagnata
  const R0 = 2.75, yPal = 5.35;
  const livello = (yC - yPal) / R0;
  inietta(pal.mat, 'caffe', sh => {
    sh.uniforms.uLiv = { value: livello };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uLiv;
        float gCaffeCop(vec3 p, out float denso) {
          vec3 d = normalize(p); float y = d.y, fi = atan(d.z, d.x);
          float cap = smoothstep(.5, .86, y + .07 * sin(fi * 3. + 1.) + .05 * sin(fi * 7. + 2.));
          float riv = 0., dens = 0.;
          for (int k = 0; k < 8; k++) {
            float fk = float(k);
            float a = fk * .7854 + .38 * sin(fk * 2.3) + .2 * sin(y * 4.3 + fk * 1.7) + .08 * sin(y * 11.7 + fk * 3.1) + .03 * sin(fi * 9. + y * 17.);
            float da = abs(mod(fi - a + 3.14159, 6.28318) - 3.14159) * sqrt(max(0., 1. - y * y));
            float larg = (.05 + .07 * fract(fk * .37 + .1)) * (.5 + .7 * smoothstep(-.5, .8, y)) * (1. + .35 * sin(y * 9. + fk * 2.));
            float fine = -.7 + .75 * fract(fk * .618 + .23);
            float lung = smoothstep(fine - .02, fine + .1, y);
            float punta = smoothstep(fine + .12, fine - .02, y);
            float w = larg * (1. + .5 * punta);
            float c = (1. - smoothstep(w * .55, w, da)) * lung;
            riv = max(riv, c); dens = max(dens, c * (1. - smoothstep(0., w * .7, da)) * (.6 + .4 * punta));
          }
          float fondo = 1. - smoothstep(uLiv - .02, uLiv + .16 + .04 * sin(fi * 6.), p.y);
          denso = max(dens, cap * .5);
          return clamp(max(max(cap * .85, riv), fondo * .9), 0., 1.);
        }`)
      .replace('diffuseColor.rgb *= gCol;', `diffuseColor.rgb *= gCol;
        float gDenso; float gCaffe = gCaffeCop(vGelObj, gDenso);
        vec3 gColC = mix(vec3(.17, .075, .028), vec3(.045, .017, .006), gDenso);
        diffuseColor.rgb = mix(diffuseColor.rgb, gColC * (.85 + .3 * gCol.r), gCaffe);`)
      .replace('roughnessFactor = mix(roughnessFactor, uGelLucido, gAux.g);', `roughnessFactor = mix(roughnessFactor, uGelLucido, gAux.g);
        roughnessFactor = mix(roughnessFactor, .14, gCaffe);`)
      .replace('float hh = (gAux.r - .5) * uGelRilAmp;', 'float hh = (gAux.r - .5) * uGelRilAmp * (1. - .85 * gCaffe) + gCaffe * .006;');
  });
  pal.mesh.scale.setScalar(R0);
  pal.mesh.position.set(0, yPal, 0);
  pal.mesh.rotation.y = 1.1;
  g.add(pal.mesh);
  return { gruppo: g, R: B.rT + .2, alto: 8.1, ombra: suolo(fondo, { contatto: B.rB, morbido: 6.5, forza: .8, caustica: .3 }), elev: 15, riempi: .74, rH: .62, trasmissione: true };
}

// ————————————————————————————————— il montaggio —————————————————————————————————
// radice: l'elemento che contiene le celle [data-oggetto="frappe|yogurt|crepe|affogato"]; in ogni cella si aggiunge una <canvas>.
export async function monta(radice, { telefono = false, ridotto = false, fondo = null, logo = 'img/logo-freddo.webp', dprMax = 2, cicloProprio = true } = {}) {
  const host = [...radice.querySelectorAll('[data-oggetto]')].filter(el => OGGETTI.includes(el.dataset.oggetto));
  if (!host.length) throw new Error('nonsolo: nessuna cella [data-oggetto]');
  const colFondo = fondo || coloreFondo(radice);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.3;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (telefono) renderer.transmissionResolutionScale = .6;
  const scena = new THREE.Scene();
  scena.background = new THREE.Color(colFondo);
  await cedi('renderer');
  scena.environment = studio(renderer).texture; scena.environmentIntensity = 1.1;
  await cedi('studio');
  const camera = new THREE.PerspectiveCamera(22, 1, 1, 400);
  const sole = new THREE.DirectionalLight('#fff0dc', 2.0);
  sole.castShadow = true; sole.shadow.mapSize.set(telefono ? 1024 : 2048, telefono ? 1024 : 2048);
  sole.shadow.bias = -.0004; sole.shadow.normalBias = .03; sole.shadow.intensity = .5; sole.shadow.radius = 3;
  scena.add(sole, sole.target);
  await pausa();

  // le texture di grana (bolle della panna, pelle dello yogurt) condivise
  const grane = {
    panna: tex(grana(telefono ? 128 : 256, 11, { ottave: [[8, 1], [16, .7], [32, .4]], pori: telefono ? 90 : 320, rPori: [.6, 2.4] }), { srgb: false, rip: true }),
    yogurt: tex(grana(telefono ? 128 : 256, 21, { ottave: [[4, 1], [8, .5], [16, .25]], pori: telefono ? 30 : 90, rPori: [.5, 1.6] }), { srgb: false, rip: true }),
  };
  await cedi('grane');
  const occl = creaOcclusione();
  const ctx = { tel: telefono, fondo: colFondo, grane, logo, occl };
  const costruttori = { frappe: creaFrappe, yogurt: creaYogurt, crepe: creaCrepe, affogato: creaAffogato };
  const oggetti = {};
  for (const id of OGGETTI) {
    if (!host.some(h => h.dataset.oggetto === id)) continue;
    const o = await costruttori[id](ctx);
    await cedi(id);
    const radiceO = new THREE.Group(), perno = new THREE.Group();
    perno.add(o.gruppo); radiceO.add(perno, o.ombra); radiceO.visible = false;
    scena.add(radiceO);
    oggetti[id] = { ...o, radice: radiceO, perno };
    await pausa();
  }

  // ————— le celle —————
  const dpr = () => Math.min(devicePixelRatio || 1, dprMax);
  const celle = host.map((el, i) => {
    const c = document.createElement('canvas');
    c.className = 'ns-tela'; c.setAttribute('aria-hidden', 'true');
    Object.assign(c.style, { display: 'block', width: '100%', height: '100%', touchAction: 'pan-y' });
    el.appendChild(c);
    const g2 = c.getContext('2d', { alpha: false });
    const cella = { el, c, g2, id: el.dataset.oggetto, o: oggetti[el.dataset.oggetto], w: 1, h: 1, visibile: false, sporco: true,
      ang: [-.6, .9, 2.2, -1.9][i % 4], vel: 0, hover: null, tilt: V3(), yawOff: 0, giro: null, drag: null, vista: null };
    g2.fillStyle = colFondo; g2.fillRect(0, 0, c.width, c.height);
    return cella;
  });
  let Wr = 0, Hr = 0;
  function misura() {
    const d = dpr();
    for (const k of celle) {
      const w = Math.max(1, Math.round(k.el.clientWidth * d)), h = Math.max(1, Math.round(k.el.clientHeight * d));
      if (w !== k.w || h !== k.h) { k.w = w; k.h = h; k.c.width = w; k.c.height = h; k.sporco = true; k.cornice = null; }
    }
    const w = Math.max(...celle.map(k => k.w)), h = Math.max(...celle.map(k => k.h));
    if (w !== Wr || h !== Hr) { Wr = w; Hr = h; renderer.setSize(w, h, false); }
  }
  misura();
  const ro = new ResizeObserver(() => { misura(); avvia(); }); celle.forEach(k => ro.observe(k.el));

  // inquadratura: l'oggetto (cilindro raggio R, alto `alto`) sta dentro la cella con il piede sempre alla stessa altezza
  const _v = V3();
  function cornice(k) {
    const o = k.o, asp = k.w / k.h, el = THREE.MathUtils.degToRad(k.vista?.elev ?? o.elev), fov = camera.fov;
    const cy = o.alto * .5, tgt = V3(0, k.vista?.y ?? cy, 0);
    let d = 60;
    const punti = [];
    for (let a = 0; a < 16; a++) for (const y of [0, o.alto]) punti.push(V3(Math.cos(a / 16 * TAU) * o.R, y, Math.sin(a / 16 * TAU) * o.R));
    const riempi = k.vista ? 1 : (o.riempi ?? .82), rH = k.vista ? .8 : (o.rH ?? .76);
    for (let it = 0; it < 4; it++) {
      camera.aspect = asp; camera.clearViewOffset();
      camera.position.set(0, tgt.y + Math.sin(el) * d, Math.cos(el) * d); camera.lookAt(tgt); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
      for (const p of punti) { _v.copy(p).project(camera); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); }
      const s = Math.max((x1 - x0) / 2 / riempi, (y1 - y0) / 2 / rH);
      d *= s;
      if (it === 3) k.cornice = { d, el, tgt, y0, y1 };
    }
    if (k.vista) { k.cornice.d *= k.vista.zoom ?? 1; k.cornice.libera = true; }
    void fov;
  }
  function posa(k) {
    if (!k.cornice) cornice(k);
    const { d, el, tgt, y0, y1, libera } = k.cornice, az = k.vista?.angolo ?? 0;
    camera.aspect = k.w / k.h; camera.clearViewOffset();
    camera.position.set(tgt.x + Math.sin(az) * Math.cos(el) * d, tgt.y + Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d);
    camera.lookAt(tgt);
    // il piede dell'oggetto a 8% dal fondo della cella (per tutti uguale), l'oggetto centrato in larghezza
    if (!libera) { const basso = -1 + .16, dy = (basso - y0) / 2 * k.h; camera.setViewOffset(k.w, k.h, 0, dy, k.w, k.h); }
    camera.updateProjectionMatrix();
    // luce: in alto a sinistra, davanti, fissa rispetto alla camera
    const o = k.o, dir = V3(-.55, .95, .62).normalize();
    dir.applyAxisAngle(V3(0, 1, 0), az);
    sole.position.copy(dir).multiplyScalar(40).add(V3(0, o.alto * .4, 0)); sole.target.position.set(0, o.alto * .4, 0);
    const sc = sole.shadow.camera, e = Math.max(o.R, o.alto * .6) * 1.25;
    Object.assign(sc, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 90 }); sc.updateProjectionMatrix();
  }

  // ————— interazione —————
  const lenta = ridotto ? 0 : .32;   // rad/s: il giro lento da sola
  for (const k of celle) {
    const c = k.c;
    c.style.cursor = 'pointer';
    c.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') k.hover = { x: 0, y: 0 }; avvia(); });
    c.addEventListener('pointerleave', () => { k.hover = null; avvia(); });
    c.addEventListener('pointermove', e => {
      const r = c.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = (e.clientY - r.top) / r.height * 2 - 1;
      if (e.pointerType === 'mouse' && k.hover) { k.hover.x = nx; k.hover.y = ny; }
      if (k.drag && e.pointerId === k.drag.id) {
        const dx = e.clientX - k.drag.x, t = performance.now();
        k.drag.tot += Math.abs(dx); k.drag.x = e.clientX;
        const da = dx / Math.max(160, r.width) * Math.PI * 1.25;
        k.ang += da; const dt = Math.max(1, t - k.drag.t) / 1000; k.vel = mix(k.vel, da / dt, .5); k.drag.t = t;
        if (k.drag.tot > 6) k.drag.mosso = true;
      }
      avvia();
    });
    c.addEventListener('pointerdown', e => {
      k.drag = { id: e.pointerId, x: e.clientX, t: performance.now(), tot: 0, t0: performance.now(), mosso: false };
      k.vel = 0; try { c.setPointerCapture(e.pointerId); } catch (_) {}
      avvia();
    });
    const fine = e => {
      if (!k.drag || e.pointerId !== k.drag.id) return;
      const tocco = !k.drag.mosso && performance.now() - k.drag.t0 < 500;
      if (e.type === 'pointercancel') k.vel = 0;
      k.drag = null;
      if (tocco && e.type === 'pointerup') gira(k);
      avvia();
    };
    c.addEventListener('pointerup', fine); c.addEventListener('pointercancel', fine);
  }
  function gira(k) {
    if (ridotto) { k.ang += Math.PI * 2; k.sporco = true; return; }   // con movimento ridotto niente animazione
    k.giro = { t: 0, dur: 1.35, da: 0 };
  }

  // ————— disegno —————
  let pronto = false, raf = 0, ultimo = 0, visibileSez = false, fermoTest = false;
  function disegna(k) {
    for (const id in oggetti) oggetti[id].radice.visible = oggetti[id] === k.o;
    const o = k.o;
    o.perno.rotation.set(k.tilt.x, k.ang + k.yawOff + (k.giro ? k.giro.da : 0), k.tilt.z, 'XZY');
    posa(k);
    renderer.setViewport(0, Hr - k.h, k.w, k.h); renderer.setScissor(0, Hr - k.h, k.w, k.h); renderer.setScissorTest(true);
    renderer.render(scena, camera);
    k.g2.drawImage(renderer.domElement, 0, 0, k.w, k.h, 0, 0, k.w, k.h);
    k.sporco = false; k.disegni = (k.disegni || 0) + 1;
    if (!k.pronta) { k.pronta = true; k.el.classList.add('pronta'); }
  }
  function passo(k, dt) {
    let muove = false;
    if (k.giro) {
      k.giro.t += dt; const t = lim(k.giro.t / k.giro.dur);
      k.giro.da = TAU * (1 - Math.pow(1 - t, 3.2)) * (t < 1 ? 1 : 1);
      if (t >= 1) { k.ang += TAU; k.giro = null; }
      muove = true;
    }
    if (!k.drag && !fermoTest) {
      const obi = k.hover ? 0 : lenta;
      k.vel = mix(k.vel, obi, 1 - Math.exp(-dt * (Math.abs(k.vel) > lenta * 1.5 ? 2.2 : 3)));
      if (ridotto && !k.hover) k.vel = Math.abs(k.vel) < .01 ? 0 : k.vel * Math.exp(-dt * 8);
      if (Math.abs(k.vel) > 1e-4) { k.ang += k.vel * dt; muove = true; }
    }
    // segue il cursore: si gira verso di lui e si inclina un filo
    const hx = k.hover && !ridotto ? k.hover.x : 0, hy = k.hover && !ridotto ? k.hover.y : 0;
    const f = 1 - Math.exp(-dt * 6);
    const ty = hx * .55, tx = hy * .1, tz = -hx * .085;
    const pY = k.yawOff, pX = k.tilt.x, pZ = k.tilt.z;
    k.yawOff = mix(k.yawOff, ty, f); k.tilt.x = mix(k.tilt.x, tx, f); k.tilt.z = mix(k.tilt.z, tz, f);
    if (Math.abs(k.yawOff - pY) + Math.abs(k.tilt.x - pX) + Math.abs(k.tilt.z - pZ) > 1e-5) muove = true;
    return muove;
  }
  const tempi = [];   // durata del lavoro di ogni fotogramma (ms), per le verifiche
  function ciclo(t) {
    raf = 0;
    if (!pronto) return;
    const t0 = performance.now();
    const dt = Math.min(.05, (t - (ultimo || t)) / 1000); ultimo = t;
    let ancora = false;
    for (const k of celle) {
      const m = passo(k, dt);
      if (k.visibile && (m || k.sporco)) disegna(k);
      if (k.visibile && (m || lenta > 0 || k.drag || k.giro || k.hover || Math.abs(k.vel) > 1e-4)) ancora = true;
    }
    tempi.push(performance.now() - t0); if (tempi.length > 240) tempi.shift();
    if (ancora && visibileSez && !fermo) raf = requestAnimationFrame(ciclo);
    else ultimo = 0;
  }
  function avvia() { if (!raf && visibileSez && !fermo && cicloProprio) raf = requestAnimationFrame(ciclo); }
  let fermo = false;
  const io = new IntersectionObserver(es => {
    for (const e of es) { const k = celle.find(q => q.el === e.target); if (k) { k.visibile = e.isIntersecting; if (e.isIntersecting) k.sporco = true; } }
    visibileSez = celle.some(k => k.visibile);
    avvia();
  });
  celle.forEach(k => io.observe(k.el));

  // shader compilati prima (in parallelo dove si può), poi un disegno di ogni oggetto: niente scatti quando entra la sezione
  await cedi('celle');
  for (const k of celle) {
    for (const id in oggetti) oggetti[id].radice.visible = oggetti[id] === k.o;
    posa(k);
    try { await renderer.compileAsync(scena, camera); } catch (_) { /* si compila al primo disegno */ }
    await cedi('shader ' + k.id);
    const tx = new Set(); k.o.radice.traverse(m => { if (m.material) for (const v of Object.values(m.material)) if (v && v.isTexture) tx.add(v); });
    for (const t of tx) { renderer.initTexture(t); await cedi('texture ' + k.id); }
  }
  for (const k of celle) { disegna(k); await cedi('primo disegno ' + k.id); }
  pronto = true;

  const api = {
    renderer, scena, camera, celle, oggetti,
    // ferma o riprende tutto (per esempio mentre un'altra sezione pesante è a schermo)
    ferma(s = true) { fermo = s; if (!s) avvia(); },
    // per le verifiche: blocca la rotazione (fermo = true) e fissa l'angolo
    fissa(ang = null, id = null) { fermoTest = true; for (const k of celle) { if (id && k.id !== id) continue; k.vel = 0; k.giro = null; if (ang != null) k.ang = ang; disegna(k); } },
    libera() { fermoTest = false; avvia(); },
    // camera libera su un oggetto: { angolo, elev, zoom, y } (null la rimette)
    vista(id, opz) { for (const k of celle) if (k.id === id) { k.vista = opz; k.cornice = null; disegna(k); } },
    gira(id) { const k = celle.find(q => q.id === id); if (k) { gira(k); avvia(); } },
    disegnaTutto() { for (const k of celle) disegna(k); },
    // lavoro per fotogramma (ms): media e 95° percentile degli ultimi 240
    tempi() { const t = [...tempi].sort((a, b) => a - b); return t.length ? { media: +(t.reduce((a, b) => a + b, 0) / t.length).toFixed(2), p95: +t[Math.floor(t.length * .95)].toFixed(2), n: t.length } : null; },
    info() {
      const out = { dpr: dpr(), tela: [Wr, Hr], celle: {} };
      for (const k of celle) {
        disegna(k);
        out.celle[k.id] = { w: k.w, h: k.h, triangoli: renderer.info.render.triangles, chiamate: renderer.info.render.calls, visibile: k.visibile, disegni: k.disegni };
      }
      out.programmi = renderer.info.programs?.length; out.geometrie = renderer.info.memory.geometries; out.texture = renderer.info.memory.textures;
      return out;
    },
    distruggi() { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); renderer.dispose(); celle.forEach(k => k.c.remove()); },
  };
  window.__nonsolo = api; window.__nonsoloPronto = true;
  avvia();
  return api;
}

// il colore del fondo dietro alle celle (il primo antenato con uno sfondo pieno)
function coloreFondo(el) {
  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor;
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) continue;
    const p = m[1].split(',').map(s => parseFloat(s));
    if (p.length < 4 || p[3] > .99) return '#' + p.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  }
  return '#f6ecd9';
}

// per le prove delle texture (verifiche): non serve alla pagina
export const _prove = { texCrepe: (...a) => texCrepe(...a), grana, vite };
