// Gelateria · il cono: cialda a rombi arrotolata (un foglio che fa un giro e si sovrappone: si vede il bordo del foglio
// che scende di traverso, come nel cono vero), orlo irregolare, spessore, e la fascetta di carta con il logo.
// La texture della cialda viene dalla foto del biscotto a cialda (img/cialda.webp, tassello di 4 × 4 celle), mappata sul
// foglio "srotolato" (il piano del cono aperto): le celle hanno la stessa misura dalla punta all'orlo, come sul cono vero.
// Unità: raggio della bocca = 1. Punta in (0, 0, 0), bocca in alto (y = H). Il davanti è +z.
import * as THREE from 'three';
import { casuale, simplex3 } from './rumore.js';
import { conOmbre } from './occlusione.js';

export const CONO = { R: 1, H: 3.85, spessore: .075, fascettaDa: .4, fascettaA: .79, cella: 1.0 };
const L = Math.hypot(CONO.H, CONO.R), SINA = CONO.R / L, COSA = CONO.H / L, K = CONO.R / CONO.H;

// l'orlo: onde lente + dentini (il foglio tagliato storto), più alto dove finisce lo strato di fuori
const nOrlo = simplex3(41);
export function orlo(t) {   // t = angolo dal bordo del foglio (0 … 2π)
  return CONO.H + .05 * Math.sin(2 * t + .7) + .035 * Math.sin(5 * t + 2.2) + .018 * nOrlo(Math.cos(t) * 2.4, Math.sin(t) * 2.4, .5) + .05 * Math.max(0, (t - 5.2) / 1.08);
}
// il bordo del foglio scende di traverso: a che angolo sta, alla quota y
const BORDO0 = .55, BORDO_K = .5;
export const bordoFoglio = y => BORDO0 + BORDO_K * (CONO.H - y);

function carica(url) { return new THREE.TextureLoader().loadAsync(url); }

export async function materialiCialda(renderer, occl) {
  const [col, ril] = await Promise.all([carica('img/cialda.webp'), carica('img/cialda-rilievo.webp')]);
  const an = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const t of [col, ril]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = an; }
  col.colorSpace = THREE.SRGBColorSpace;
  // fuori: dorata, tostata (la foto del biscotto è più chiara del cono); dentro: più chiara e meno in rilievo
  const fuori = new THREE.MeshPhysicalMaterial({ map: col, bumpMap: ril, bumpScale: 2.2, color: new THREE.Color('#f2d2a4'), vertexColors: true, roughness: .7, specularIntensity: .45, sheen: .12, sheenRoughness: .6, sheenColor: new THREE.Color('#ffc880') });
  const dentro = new THREE.MeshPhysicalMaterial({ map: col, bumpMap: ril, bumpScale: 2.5, color: new THREE.Color('#dcaa74'), vertexColors: true, roughness: .7, side: THREE.BackSide });
  conOmbre(fuori, occl); conOmbre(dentro, occl);
  return { fuori, dentro, col, ril };
}

// righe (frazioni dell'altezza): fitte dove la cialda si vede (punta e parte alta), rade sotto la fascetta
function righe(fitto) {
  const v = [], seg = [[0, CONO.fascettaDa + .02, fitto ? 46 : 26], [CONO.fascettaDa + .02, CONO.fascettaA - .03, 6], [CONO.fascettaA - .03, 1, fitto ? 44 : 26]];
  for (const [a, b, n] of seg) for (let i = (v.length ? 1 : 0); i <= n; i++) v.push(a + (b - a) * i / n);
  return v;
}
// rilievo della cialda (dalla foto): campionatore periodico del canale R
function campRilievo(img) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  return (u, v) => {
    const x = ((u % 1) + 1) % 1 * S - .5, y = (1 - (((v % 1) + 1) % 1)) * S - .5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const X0 = (x0 + S) % S, X1 = (x0 + 1 + S) % S, Y0 = (y0 + S) % S, Y1 = (y0 + 1 + S) % S;
    const q = (X, Y) => d[(Y * S + X) * 4] / 255;
    return (q(X0, Y0) * (1 - fx) + q(X1, Y0) * fx) * (1 - fy) + (q(X0, Y1) * (1 - fx) + q(X1, Y1) * fx) * fy;
  };
}
// un punto del foglio: t = angolo dal bordo del foglio, v = frazione d'altezza, faccia fuori/dentro → posizione, normale, uv
function puntoFoglio(t, v, esterno, ril) {
  const yTop = orlo(t), y = yTop * v, th = t + bordoFoglio(y), giro = t / (Math.PI * 2);
  let r = y * K + CONO.spessore * (esterno ? .5 + .9 * giro : -.5 + .9 * giro);
  const s = y / COSA, ph = t * SINA, X = s * Math.sin(ph), Y = s * Math.cos(ph);
  const a = Math.PI / 4, U = (X * Math.cos(a) - Y * Math.sin(a)) / CONO.cella, V = (X * Math.sin(a) + Y * Math.cos(a)) / CONO.cella;
  // rilievo vero: le creste della cialda escono (fuori); dentro l'impronta è più morbida
  const h = ril ? (ril(U, V) - .5) * (esterno ? .05 : -.022) * Math.min(1, v / .04) : 0;
  const nx = Math.sin(th), nz = Math.cos(th), nl = Math.hypot(1, K);
  r = Math.max(esterno ? .004 : 0, r + h * nl);
  return { p: [r * Math.sin(th), y + h * -K / nl * 0, r * Math.cos(th)], n: [nx / nl, -K / nl, nz / nl], uv: [U, V], X, Y };
}
function foglio(faccia, NA, fitto, ril) {
  const esterno = faccia === 'fuori', V_ = righe(fitto), NS = V_.length - 1;
  const pos = [], uv = [], col = [], idx = [];
  const nC = simplex3(7);
  for (let j = 0; j <= NS; j++) {
    for (let i = 0; i <= NA; i++) {
      const t = i / NA * Math.PI * 2, v = V_[j];
      const q = puntoFoglio(t, v, esterno, ril);
      pos.push(...q.p); uv.push(...q.uv);
      // cotto: più scuro all'orlo, vicino alla punta e sul bordo del foglio; qualche chiazza
      const cotto = .16 * Math.pow(v, 8) + .12 * Math.pow(1 - v, 4) + (esterno ? .1 * Math.max(0, 1 - (Math.PI * 2 - t) / .25) : 0) + .07 * nC(q.X * 1.3, q.Y * 1.3, 0);
      const c = 1 - Math.max(-.05, cotto);
      col.push(c, c * (.97 - .12 * Math.max(0, cotto)), c * (.93 - .25 * Math.max(0, cotto)));
    }
  }
  const W = NA + 1;
  for (let j = 0; j < NS; j++) for (let i = 0; i < NA; i++) { const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W; idx.push(a, b, c, a, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// il taglio del foglio: la striscia fra il fuori e il dentro all'orlo (in cima) e lungo il bordo del foglio (di traverso)
function tagli(NA, fitto, ril) {
  const pos = [], col = [], idx = [];
  const P = (t, v, e) => puntoFoglio(t, v, e, ril).p;
  for (let i = 0; i <= NA; i++) {
    const t = i / NA * Math.PI * 2;
    pos.push(...P(t, 1, true), ...P(t, 1, false));
    col.push(.86, .7, .5, .9, .76, .56);
  }
  for (let i = 0; i < NA; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  // bordo del foglio (t = 2π: la fine dello strato di fuori, che sta sopra quello di sotto)
  const b0 = pos.length / 3, V_ = righe(fitto), t = Math.PI * 2 - 1e-4;
  for (const v of V_) { pos.push(...P(t, v, true), ...P(0, v, true)); col.push(.78, .58, .38, .78, .58, .38); }
  for (let j = 0; j < V_.length - 1; j++) { const a = b0 + j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ————— la fascetta di carta: cono di carta attorno alla cialda, bordo di sotto un filo seghettato, logo davanti —————
const ys = () => [CONO.fascettaDa * CONO.H, CONO.fascettaA * CONO.H];
function disegnaCarta(logo, W, marchio) {
  const [ya, yb] = ys(), sa = ya / COSA * .9, sb = yb / COSA;
  const phMax = Math.PI * SINA * 1.08;
  const X0 = -sb * Math.sin(phMax), X1 = -X0, Y0 = sa * Math.cos(phMax), Y1 = sb;
  const H = Math.round(W * (Y1 - Y0) / (X1 - X0));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (X, Y) => [(X - X0) / (X1 - X0) * W, (1 - (Y - Y0) / (Y1 - Y0)) * H];
  const k = W / (X1 - X0);   // pixel per unità
  // carta crema a righe (lungo il cono: raggi dalla punta)
  const [ax, ay] = px(0, 0);
  g.fillStyle = '#fbeedb'; g.fillRect(0, 0, W, H);
  const nR = 38;
  for (let i = -nR; i <= nR; i++) {
    if (i % 2) continue;
    const p0 = i / nR * phMax, p1 = (i + 1) / nR * phMax;
    g.beginPath(); g.moveTo(ax, ay);
    g.lineTo(...px(sb * 1.2 * Math.sin(p0), sb * 1.2 * Math.cos(p0))); g.lineTo(...px(sb * 1.2 * Math.sin(p1), sb * 1.2 * Math.cos(p1))); g.closePath();
    g.fillStyle = 'rgba(236, 196, 142, .38)'; g.fill();
  }
  // grana della carta: un tassello di rumore ripetuto (veloce anche sul telefono)
  const tn = document.createElement('canvas'); tn.width = tn.height = 128;
  { const gg = tn.getContext('2d'), I = gg.createImageData(128, 128), d = I.data, rnd = casuale(5);
    for (let i = 0; i < d.length; i += 4) { const n = 128 + (rnd() - .5) * 60; d[i] = d[i + 1] = d[i + 2] = n; d[i + 3] = 255; }
    gg.putImageData(I, 0, 0); }
  g.save(); g.globalAlpha = .1; g.globalCompositeOperation = 'overlay'; g.fillStyle = g.createPattern(tn, 'repeat'); g.fillRect(0, 0, W, H); g.restore();
  // il logo, davanti (t = 0 ⇒ φ = 0 ⇒ X = 0), a metà altezza della fascetta
  const sm = (sa / .9 + sb) / 2 + .02, rL = .47;
  const [lx, ly] = px(0, sm);
  g.save();
  if (logo) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = .96; const sv = 1.1; g.drawImage(logo, lx - rL * k, ly - rL * k * sv, 2 * rL * k, 2 * rL * k * sv); }   // un filo più alto: visto dall'alto sul cono inclinato torna tondo
  else {   // marchio tipografico (template senza logo): cerchio sottile, nome, riga sotto
    const r = rL * k * .92; g.fillStyle = '#fbf3e6'; g.beginPath(); g.arc(lx, ly, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(74,44,23,.85)'; g.lineWidth = r * .025; g.beginPath(); g.arc(lx, ly, r * .96, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(74,44,23,.92)'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `760 ${r * .36}px Archivo, sans-serif`; g.fillText(marchio?.nome || '', lx, ly - r * .06, r * 1.7);
    g.font = `500 ${r * .12}px Inter, sans-serif`; g.fillText((marchio?.sotto || '').toUpperCase(), lx, ly + r * .3, r * 1.5);
  }
  g.restore();
  // ritaglio: sopra dritto, sotto seghettato fine (carta strappata sulla perforazione)
  g.globalCompositeOperation = 'destination-in';
  g.beginPath();
  const N = 400;
  for (let i = 0; i <= N; i++) { const p = -phMax + 2 * phMax * i / N; g.lineTo(...px(sb * Math.sin(p), sb * Math.cos(p))); }
  for (let i = N; i >= 0; i--) {
    const p = -phMax + 2 * phMax * i / N, s = sa / .9 - .012 - .014 * (i % 2) - .01 * Math.sin(i * .37);
    g.lineTo(...px(s * Math.sin(p), s * Math.cos(p)));
  }
  g.closePath(); g.fillStyle = '#000'; g.fill();
  return { c, X0, X1, Y0, Y1 };
}

function geometriaFascetta(NA, NS, box) {
  const [ya, yb] = ys(), pos = [], uv = [], idx = [];
  const t0 = -Math.PI, t1 = Math.PI + .22;           // un pezzo in più: la carta si sovrappone dietro
  for (let j = 0; j <= NS; j++) {
    const y = (ya - .03) + (yb - ya + .03) * j / NS;
    for (let i = 0; i <= NA; i++) {
      const t = t0 + (t1 - t0) * i / NA;
      const giroC = Math.max(0, (t - Math.PI + .22) / .22);   // il pezzo sovrapposto sta un filo più fuori
      const r = y * K + CONO.spessore * 1.45 + .032 + .006 * giroC;
      pos.push(r * Math.sin(t), y, r * Math.cos(t));
      const s = y / COSA, tt = t > Math.PI ? t - 2 * Math.PI : t, ph = tt * SINA;
      const X = s * Math.sin(ph), Y = s * Math.cos(ph);
      uv.push((X - box.X0) / (box.X1 - box.X0), (Y - box.Y0) / (box.Y1 - box.Y0));
    }
  }
  const W = NA + 1;
  for (let j = 0; j < NS; j++) for (let i = 0; i < NA; i++) { const a = j * W + i; idx.push(a, a + 1, a + W + 1, a, a + W + 1, a + W); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export async function creaCono(renderer, { telefono = false, occl, logoUrl = 'img/logo-freddo.webp', marchio = null } = {}) {
  const mat = await materialiCialda(renderer, occl);
  const NA = telefono ? 96 : 132, fitto = !telefono;
  const ril = campRilievo(mat.ril.image);
  const gruppo = new THREE.Group();
  const fuori = new THREE.Mesh(foglio('fuori', NA, fitto, ril), mat.fuori);
  const dentro = new THREE.Mesh(foglio('dentro', NA, false, ril), mat.dentro);
  const taglio = new THREE.Mesh(tagli(NA, fitto, ril), new THREE.MeshPhysicalMaterial({ color: '#e8c08c', vertexColors: true, roughness: .8, side: THREE.DoubleSide }));
  conOmbre(taglio.material, occl);
  // fascetta
  const logo = logoUrl ? await new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = logoUrl; }) : null;
  if (!logo) await document.fonts?.load('760 40px Archivo').catch(() => {});
  const carta = disegnaCarta(logo, telefono ? 1400 : 2048, marchio);
  const tc = new THREE.CanvasTexture(carta.c); tc.colorSpace = THREE.SRGBColorSpace; tc.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const matCarta = new THREE.MeshPhysicalMaterial({ map: tc, emissiveMap: tc, emissive: new THREE.Color('#ffffff'), emissiveIntensity: .14, alphaTest: .5, side: THREE.DoubleSide, roughness: .78, sheen: .35, sheenRoughness: .7, sheenColor: new THREE.Color('#fff6e8') });
  conOmbre(matCarta, occl);
  const fascetta = new THREE.Mesh(geometriaFascetta(telefono ? 120 : 180, 10, carta), matCarta);
  for (const m of [fuori, dentro, taglio, fascetta]) { m.castShadow = true; m.receiveShadow = true; gruppo.add(m); }
  return { gruppo, fuori, dentro, fascetta, mat };
}

// per chi si appoggia alla cialda (le gocce): raggio della faccia di fuori e quota dell'orlo all'angolo vero th
const TAU = Math.PI * 2;
const angoloFoglio = (th, y) => { const t = (th - bordoFoglio(y)) % TAU; return t < 0 ? t + TAU : t; };
export function raggioFuori(th, y) { return y * K + CONO.spessore * (.5 + .9 * angoloFoglio(th, y) / TAU); }
export function orloA(th) { return orlo(angoloFoglio(th, CONO.H)); }
export const PENDENZA = K;
