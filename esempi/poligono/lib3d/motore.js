// Pistola 3D · motore: luce da studio (PMREM), tone mapping, materiali per finitura con cache, texture procedurali
// (satinatura dell'acciaio, micro-grana del polimero, puntini esagonali dell'impugnatura, fiammata, fumo).
// Dalla libreria Lumen della gioielleria (motore.js), adattata a un'arma nera su pagina nera: stesso studio, finiture nuove.
// Unità: mm. Un motore per renderer.
import * as THREE from 'three';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// resa approvata in Lumen: NeutralToneMapping, niente ACES; fondo trasparente
export function preparaRenderer(renderer, { esposizione = 1 } = {}) {
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = esposizione;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

// numeri casuali ripetibili (mai Math.random: i confronti devono venire uguali a ogni caricamento)
export function casuale(seme) { let a = seme >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function liscia(arr, r) { const n = arr.length, o = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let k = -r; k <= r; k++) s += arr[(i + k + n) % n]; o[i] = s / (2 * r + 1); } return o; }
function tela(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
// campo di altezze (W×H, periodico) → normal map
function normaliDa(h, W, H, forza) {
  return tela(W, H, g => {
    const I = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, du = h[y * W + (x + 1) % W] - h[y * W + (x - 1 + W) % W], dv = h[((y + 1) % H) * W + x] - h[((y - 1 + H) % H) * W + x];
      const nx = -du * forza, ny = -dv * forza, l = Math.hypot(nx, ny, 1);
      I.data[i * 4] = (nx / l * .5 + .5) * 255; I.data[i * 4 + 1] = (ny / l * .5 + .5) * 255; I.data[i * 4 + 2] = (1 / l * .5 + .5) * 255; I.data[i * 4 + 3] = 255;
    }
    g.putImageData(I, 0, 0);
  });
}
function rip(t, maxAniso, mm) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / mm[0], 1 / mm[1]); t.anisotropy = maxAniso; t.colorSpace = THREE.NoColorSpace; return t; }

// ————— satinatura (spazzolatura): righe fitte lungo u; uv delle facce in mm, una ripetizione ogni 6 × 3 mm —————
function satinatura(maxAniso) {
  const N = 512, rnd = casuale(11);
  const base = Float32Array.from({ length: N }, () => rnd() * 2 - 1);
  const r2 = liscia(base, 2), r3 = liscia(Float32Array.from({ length: N }, () => rnd() * 2 - 1), 10);
  const fase = Float32Array.from({ length: N }, () => rnd() * 6.283), freq = Float32Array.from({ length: N }, () => 1 + Math.floor(rnd() * 3));
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const m = .65 + .35 * Math.sin(x / N * 6.283 * freq[y] + fase[y]);
    h[y * N + x] = (base[y] * .5 + r2[y] * .8 + r3[y] * .45) * m;
  }
  const cn = normaliDa(h, N, N, 1.2);
  const cr = tela(N, N, g => {
    const I = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, r = Math.min(1, Math.max(0, .8 + (r2[y] * .5 + r3[y] * .5) * .35 * (.7 + .3 * Math.sin(x / N * 6.283 * freq[y] + fase[y]))));
      I.data[i * 4] = I.data[i * 4 + 1] = I.data[i * 4 + 2] = r * 255; I.data[i * 4 + 3] = 255;
    }
    g.putImageData(I, 0, 0);
  });
  return { normale: rip(new THREE.CanvasTexture(cn), maxAniso, [6, 3]), ruvido: rip(new THREE.CanvasTexture(cr), maxAniso, [6, 3]) };
}

// ————— micro-grana del polimero (stampo a buccia fine, come nella foto): rumore a due ottave + crateri, 24 mm per ripetizione —————
function microGrana(maxAniso) {
  const N = 512, rnd = casuale(23), h = new Float32Array(N * N);
  const griglia = G => { const vv = Float32Array.from({ length: G * G }, () => rnd()); return (x, y) => { const gx = x / N * G, gy = y / N * G, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, s = t => t * t * (3 - 2 * t); const a = vv[(y0 % G) * G + x0 % G], b = vv[(y0 % G) * G + (x0 + 1) % G], c = vv[((y0 + 1) % G) * G + x0 % G], d = vv[((y0 + 1) % G) * G + (x0 + 1) % G]; return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy); }; };
  const g1 = griglia(48), g2 = griglia(128);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = g1(x, y) * .55 + g2(x, y) * .45;
  // "buccia": celle morbide
  for (let k = 0; k < 900; k++) {
    const cx = rnd() * N, cy = rnd() * N, r = 3 + rnd() * 5;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const d = Math.hypot(dx, dy) / r; if (d < 1) { const X = ((cx + dx) | 0 + N) % N, Y = ((cy + dy) | 0 + N) % N; h[Y * N + X] += (1 - d * d) * .35; } }
  }
  return rip(new THREE.CanvasTexture(normaliDa(h, N, N, 1.6)), maxAniso, [24, 24]);
}

// ————— puntini esagonali dell'impugnatura: reticolo a nido d'ape di bottoni a cupola (passo 1,55 mm), 16 × 18 per ripetizione —————
function esagoni(maxAniso) {
  const W = 512, H = 512, nx = 16, ny = 18, px = W / nx, py = H / ny, h = new Float32Array(W * H), r = px * .44;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = 1e9;
    const j0 = Math.floor(y / py);
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      const off = (((j % ny) + ny) % 2) * px / 2, i0 = Math.floor((x - off) / px);
      for (let i = i0 - 1; i <= i0 + 1; i++) {
        // distanza "esagonale" (bottoni a esagono, come nella foto), non tonda
        const dx = Math.abs(x - (i * px + off + px / 2)), dy = Math.abs(y - (j * py + py / 2));
        const d = Math.max(dx, dx * .5 + dy * .866); if (d < best) best = d;
      }
    }
    // bottone a tronco di piramide: cima piatta, fianchi a falde
    const t = Math.max(0, 1 - best / r);
    h[y * W + x] = Math.min(1, t * 2.4);
  }
  // passo 1,55 mm fra i bottoni di una fila, file a 1,38 mm: la piastrella è 24,8 × 24,8 mm
  return rip(new THREE.CanvasTexture(normaliDa(h.map(x => -x), W, H, 1.8)), maxAniso, [24.8, 24.8]);
}

// ————— fiammata (stella a raggi, additiva) e fumo (nuvola morbida) —————
function texFiamma() {
  const t = new THREE.CanvasTexture(tela(256, 256, (g, w, h) => {
    const cx = w / 2, cy = h / 2, rnd = casuale(5);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const a = i / 26 * Math.PI * 2 + rnd() * .2, L = (.32 + rnd() * .18) * w, wd = 5 + rnd() * 7;
      g.save(); g.translate(cx, cy); g.rotate(a);
      const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,240,200,.9)'); gr.addColorStop(.35, 'rgba(255,170,60,.5)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -wd); g.lineTo(L, 0); g.lineTo(0, wd); g.closePath(); g.fill(); g.restore();
    }
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, w * .28); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(.3, 'rgba(255,220,140,.85)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
// lingua di fuoco vista di lato (lungo la canna): allungata, più calda alla base
function texLingua() {
  const t = new THREE.CanvasTexture(tela(256, 128, (g, w, h) => {
    const rnd = casuale(9); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 14; i++) {
      const y = h / 2 + (rnd() - .5) * h * .35, L = w * (.55 + rnd() * .45), th = h * (.08 + rnd() * .1);
      const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,245,210,.85)'); gr.addColorStop(.3, 'rgba(255,180,70,.55)'); gr.addColorStop(1, 'rgba(255,80,10,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, y - th); g.quadraticCurveTo(L * .5, y - th * .9, L, y); g.quadraticCurveTo(L * .5, y + th * .9, 0, y + th); g.closePath(); g.fill();
    }
    const gr = g.createRadialGradient(0, h / 2, 0, 0, h / 2, h * .6); gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(1, 'rgba(255,160,50,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
  t.colorSpace = THREE.SRGBColorSpace; return t;
}
function texFumo() {
  const t = new THREE.CanvasTexture(tela(128, 128, (g, w, h) => {
    const rnd = casuale(17);
    // nuvola a ciuffi: tante macchie piccole e tenui lungo due volute (non un disco)
    for (let i = 0; i < 70; i++) {
      const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * w * .3, x = w / 2 + Math.cos(a) * rr + Math.sin(a * 3) * 6, y = h / 2 + Math.sin(a) * rr * .8, r = w * (.05 + rnd() * .12);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }
  }));
  t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ————— luce da studio (quella di Lumen, con due strisce in più per gli spigoli di un oggetto scuro) —————
function pannello(scena, pos, w, h, forza, morbido = .35) {
  const c = tela(128, 128, g => {
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1 - morbido, '#e8e8e8'); gr.addColorStop(1, '#303030');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  m.material.color.setScalar(forza); m.position.copy(pos); m.lookAt(0, 0, 0); scena.add(m);
}
function studio(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'varying vec3 p; void main(){ float y = normalize(p).y; gl_FragColor = vec4(vec3(.03 + .07 * smoothstep(-.3,.9,y)), 1.); }',
  })));
  pannello(s, V3(0, 12, 2), 18, 12, 1.8);          // soffitto
  pannello(s, V3(0, 7, 10), 16, 8, 1.5, .5);       // grande diffusore davanti-alto
  pannello(s, V3(-11, 1, 2), 3, 20, 4, .2);        // striscia sinistra
  pannello(s, V3(11, 0, 0), 3, 20, 3.5, .2);       // striscia destra
  pannello(s, V3(-8, 1, -8), 2.2, 16, 5, .15);     // strisce dietro ai lati (fianchi lucidi)
  pannello(s, V3(8.5, -1, -7.5), 2.2, 16, 4.2, .15);
  pannello(s, V3(0, -.5, 13), 26, 7, 1.35, .55);   // fronte: fascia larga e morbida
  pannello(s, V3(2, 5, -12), 14, 5, 2.6);          // controluce
  pannello(s, V3(-7, 8, -6), 1, 10, 7, .1);        // linea netta per gli smussi
  pannello(s, V3(7, -6, 8), 8, 1.2, 4, .1);
  pannello(s, V3(0, -10, 0), 20, 20, .22, .6);     // pavimento
  pannello(s, V3(9, 2, 9), 9, 16, 1.8, .7);        // riempimenti morbidi sulle diagonali
  pannello(s, V3(-9, 2, 9), 9, 16, 1.45, .7);
  pannello(s, V3(-8.5, 0, -8.5), 10, 16, 1.3, .7);
  pannello(s, V3(10, 1, -6), 8, 16, 1.1, .7);
  // per l'arma: due strisce orizzontali nette (luce che scorre lungo il carrello e sugli smussi alti)
  pannello(s, V3(0, 9, 7), 26, 1.1, 3.6, .08);
  pannello(s, V3(0, 3.5, -11), 26, .9, 4.5, .08);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, .1, 100, { size: 512 });
  pm.dispose();
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  return rt;
}

// ————————————————————————————— motore —————————————————————————————
export function creaMotore(renderer) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const rt = studio(renderer), env = rt.texture;
  const materiali = new Map(), cache = {};
  const satin = () => cache.sat ??= satinatura(maxAniso);
  const micro = () => cache.micro ??= microGrana(maxAniso);
  const esa = () => cache.esa ??= esagoni(maxAniso);
  const fis = (o) => new THREE.MeshPhysicalMaterial(o);
  const acciaio = (colore, ruvido, aniso, normale = .12) => o => fis({
    color: new THREE.Color(o.colore ?? colore), metalness: 1, roughness: o.ruvido ?? ruvido, roughnessMap: satin().ruvido, normalMap: satin().normale,
    normalScale: new THREE.Vector2(normale, normale), anisotropy: aniso, anisotropyRotation: Math.PI / 2,
  });
  const F = {
    // carrello: acciaio nero satinato con spazzolatura lungo il carrello; smussi lucidi
    'carr': acciaio(0x575655, .4, .8, .16),
    'carrLuc': o => fis({ color: new THREE.Color(o.colore ?? 0x8a8987), metalness: 1, roughness: o.ruvido ?? .2 }),
    // acciaio grigio (canna, grilletto, leve, perni, fondello)
    'acc': acciaio(0xb9bbbe, .3, .7, .1),
    'accLuc': o => fis({ color: new THREE.Color(o.colore ?? 0xcfd1d4), metalness: 1, roughness: o.ruvido ?? .09 }),
    // blocco della camera della canna: acciaio lucido un filo satinato (riflessi morbidi, non uno specchio piatto) e i suoi fianchi
    'canna': acciaio(0xa7a9ac, .26, .6, .08),
    'cannaLuc': o => fis({ color: new THREE.Color(o.colore ?? 0xc3c5c8), metalness: 1, roughness: o.ruvido ?? .16, roughnessMap: satin().ruvido, anisotropy: .5, anisotropyRotation: Math.PI / 2 }),
    // brunito (corpo del caricatore, sgancio): acciaio scuro senza spazzolatura
    // corpo del caricatore: acciaio satinato più chiaro e più ruvido del carrello (di spigolo non diventa un blocco nero)
    'caric': acciaio(0x6d6d6e, .5, .5, .1),
    'brunito': o => fis({ color: new THREE.Color(o.colore ?? 0x575655), metalness: 1, roughness: o.ruvido ?? .45 }),
    // polimero nero opaco con la micro-grana dello stampo
    'poli': o => fis({
      color: new THREE.Color(o.colore ?? 0x17181a), metalness: 0, roughness: o.ruvido ?? .6, normalMap: micro(), normalScale: new THREE.Vector2(.55, .55),
      clearcoat: .18, clearcoatRoughness: .55, envMapIntensity: o.env ?? 1.7,
    }),
    // polimero con i puntini esagonali (pannelli dell'impugnatura)
    'poliGrip': o => fis({
      color: new THREE.Color(o.colore ?? 0x141517), metalness: 0, roughness: o.ruvido ?? .5, normalMap: esa(), normalScale: new THREE.Vector2(1.1, 1.1),
      clearcoat: .1, clearcoatRoughness: .5, envMapIntensity: o.env ?? 1.9,
    }),
    // incavo del pollice: polimero liscio (senza grana), appena più lucido
    'poliLiscio': o => fis({ color: new THREE.Color(o.colore ?? 0x111213), metalness: 0, roughness: o.ruvido ?? .42, clearcoat: .3, clearcoatRoughness: .35, envMapIntensity: o.env ?? 1.7 }),
    'ottone': o => fis({ color: new THREE.Color(o.colore ?? 0xd9a95e), metalness: 1, roughness: o.ruvido ?? .22, roughnessMap: satin().ruvido, anisotropy: .3, anisotropyRotation: Math.PI / 2 }),
    'rame': o => fis({ color: new THREE.Color(o.colore ?? 0xcb7a4c), metalness: 1, roughness: o.ruvido ?? .24 }),
    'nero': () => new THREE.MeshStandardMaterial({ color: 0x060607, metalness: .5, roughness: .55 }),
    'lume': o => fis({ color: new THREE.Color(o.colore ?? 0xefeadc), metalness: 0, roughness: .35, emissive: new THREE.Color(0xefeadc), emissiveIntensity: o.luce ?? .25, envMapIntensity: 1.4 }),
  };
  const motore = {
    THREE, renderer, env, maxAniso,
    materiale(nome, o = {}) {
      const chiave = nome + '|' + JSON.stringify(o);
      if (materiali.has(chiave)) return materiali.get(chiave);
      if (!F[nome]) throw new Error(`pistola3d: finitura sconosciuta "${nome}". Disponibili: ${Object.keys(F).join(', ')}`);
      const m = F[nome](o);
      m.envMap = env;
      m.vertexColors = o.vc !== false;
      if (o.env !== undefined) m.envMapIntensity = o.env;
      m.name = chiave; materiali.set(chiave, m);
      return m;
    },
    // tutti i ruoli usati dai pezzi
    ruoli() {
      const r = {};
      for (const k of Object.keys(F)) r[k] = motore.materiale(k);
      return r;
    },
    texFiamma: () => cache.fiamma ??= texFiamma(),
    texLingua: () => cache.lingua ??= texLingua(),
    texFumo: () => cache.fumo ??= texFumo(),
    libera() {
      for (const m of materiali.values()) m.dispose();
      for (const t of Object.values(cache)) { if (t.isTexture) t.dispose(); else for (const x of Object.values(t)) x.dispose?.(); }
      rt.dispose(); materiali.clear();
    },
  };
  return motore;
}
