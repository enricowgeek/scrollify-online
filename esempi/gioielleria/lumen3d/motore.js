// Lumen 3D · motore: tutto ciò che è condiviso fra gli orologi e non dipende dal modello.
// Luce da studio (PMREM), tone mapping, materiali per finitura con cache, texture procedurali (satinatura, pelle),
// quadrante fotografico con le ombre dei pezzi 3D, vetro, ombra di contatto, centratura e ingombro.
// Un motore per renderer: più orologi nella stessa scena usano la stessa PMREM, la stessa satinatura e gli stessi materiali.
// Unità: mm. Assi dei modelli: +z quadrante (verso chi guarda), +y ore 12, +x corona (ore 3).
import * as THREE from 'three';

// cartella del sito (gioielleria/): i percorsi degli asset dei modelli sono relativi a questa, da qualunque pagina
export const RADICE = new URL('../', import.meta.url);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ————————————————————————————— renderer —————————————————————————————
// resa approvata (p2): NeutralToneMapping, niente ACES; fondo trasparente
export function preparaRenderer(renderer, { esposizione = 1 } = {}) {
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = esposizione;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

// ————————————————————————————— casuale con seme —————————————————————————————
// le texture procedurali devono venire uguali a ogni caricamento (confronti ripetibili): mai Math.random
export function casuale(seme) { let a = seme >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function liscia(arr, r) { const n = arr.length, o = new Float32Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let k = -r; k <= r; k++) s += arr[(i + k + n) % n]; o[i] = s / (2 * r + 1); } return o; }
function tela(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }

// da un campo di altezze (N×N, periodico) a una normal map in canvas
function normaliDa(h, N, forza) {
  return tela(N, N, g => {
    const I = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, du = h[y * N + (x + 1) % N] - h[y * N + (x - 1 + N) % N], dv = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      const nx = -du * forza, ny = -dv * forza, l = Math.hypot(nx, ny, 1);
      I.data[i * 4] = (nx / l * .5 + .5) * 255; I.data[i * 4 + 1] = (ny / l * .5 + .5) * 255; I.data[i * 4 + 2] = (1 / l * .5 + .5) * 255; I.data[i * 4 + 3] = 255;
    }
    g.putImageData(I, 0, 0);
  });
}

// ————————————————————————————— satinatura (dal modulo p2) —————————————————————————————
// righe fitte lungo u (normale + ruvidità); uv delle facce in mm, una ripetizione ogni 5×3 mm
function satinatura(maxAniso) {
  const N = 512, rnd = casuale(11);
  const base = Float32Array.from({ length: N }, () => rnd() * 2 - 1);
  const r1 = base, r2 = liscia(base, 2), r3 = liscia(Float32Array.from({ length: N }, () => rnd() * 2 - 1), 10);
  const fase = Float32Array.from({ length: N }, () => rnd() * 6.283), freq = Float32Array.from({ length: N }, () => 1 + Math.floor(rnd() * 3));
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const m = .65 + .35 * Math.sin(x / N * 6.283 * freq[y] + fase[y]);
    h[y * N + x] = (r1[y] * .5 + r2[y] * .8 + r3[y] * .45) * m;
  }
  const cn = normaliDa(h, N, 1.2);
  const cr = tela(N, N, g => {
    const I = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x, r = Math.min(1, Math.max(0, .8 + (r2[y] * .5 + r3[y] * .5) * .35 * (.7 + .3 * Math.sin(x / N * 6.283 * freq[y] + fase[y]))));
      I.data[i * 4] = I.data[i * 4 + 1] = I.data[i * 4 + 2] = r * 255; I.data[i * 4 + 3] = 255;
    }
    g.putImageData(I, 0, 0);
  });
  const tn = new THREE.CanvasTexture(cn), tr = new THREE.CanvasTexture(cr);
  for (const t of [tn, tr]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 5, 1 / 3); t.anisotropy = maxAniso; t.colorSpace = THREE.NoColorSpace; }
  return { normale: tn, ruvido: tr };
}

// ————————————————————————————— pelle —————————————————————————————
// grana fine (rumore a due ottave) + pori; con scaglie > 0 aggiunge le squame (celle di Voronoi, lato ≈ scaglie mm)
// il costruttore può specializzarla (altra forma, altro seme) chiedendo motore.texPelle({ ... }) e passandola al materiale
function pelle({ scaglie = 0, seme = 7, lato = 24 } = {}) {
  const N = 512, rnd = casuale(seme), h = new Float32Array(N * N);
  const griglia = (G) => { const v = Float32Array.from({ length: G * G }, () => rnd()); return (x, y) => { const gx = x / N * G, gy = y / N * G, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, s = t => t * t * (3 - 2 * t); const a = v[(y0 % G) * G + x0 % G], b = v[(y0 % G) * G + (x0 + 1) % G], c = v[((y0 + 1) % G) * G + x0 % G], d = v[((y0 + 1) % G) * G + (x0 + 1) % G]; return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy); }; };
  const g1 = griglia(64), g2 = griglia(160);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = g1(x, y) * .6 + g2(x, y) * .4;
  for (let k = 0; k < 2600; k++) { const x = rnd() * N | 0, y = rnd() * N | 0; h[y * N + x] -= .9; }   // pori
  if (scaglie > 0) {
    // celle: centri su una griglia mossa; altezza = distanza dal bordo (cuscinetto), solco scuro fra le celle
    const G = Math.max(2, Math.round(lato / scaglie)), L = N / G, C = [];
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) C.push([(i + .2 + rnd() * .6) * L, (j + .2 + rnd() * .6) * L]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let d1 = 1e9, d2 = 1e9;
      const ci = Math.floor(x / L), cj = Math.floor(y / L);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj, ii = (i + G) % G, jj = (j + G) % G, [cx, cy] = C[jj * G + ii];
        const d = Math.hypot(x - (cx + (i - ii) * L), y - (cy + (j - jj) * L)); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      h[y * N + x] += Math.min(1, (d2 - d1) / L * 5) * 4;
    }
  }
  const tn = new THREE.CanvasTexture(normaliDa(h, N, scaglie > 0 ? 1.5 : 2.2));
  // colore: 1 sul cuscinetto, più scuro nei solchi e nei pori (in sRGB: 200 ≈ metà luce)
  const tc = new THREE.CanvasTexture(tela(N, N, g => {
    const I = g.createImageData(N, N);
    let mn = Infinity, mx = -Infinity; for (const x of h) { if (x < mn) mn = x; if (x > mx) mx = x; }
    for (let i = 0; i < N * N; i++) { const k = (h[i] - mn) / (mx - mn || 1), c = scaglie > 0 ? 170 + 85 * Math.min(1, k * 1.6) : 225 + 30 * k; I.data[i * 4] = I.data[i * 4 + 1] = I.data[i * 4 + 2] = c; I.data[i * 4 + 3] = 255; }
    g.putImageData(I, 0, 0);
  }));
  for (const t of [tn, tc]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / lato, 1 / lato); }
  tn.colorSpace = THREE.NoColorSpace; tc.colorSpace = THREE.SRGBColorSpace;
  return { normale: tn, colore: tc };
}

// ————————————————————————————— luce da studio —————————————————————————————
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
// tipo 'acciaio' (metalli, ceramica, pelle) o 'vetro'; luce 'p2' = lo studio approvato com'era, 'lumen' = p2 + riempimenti
function studio(renderer, tipo, luce = 'lumen', riemp = 1) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { k: { value: tipo === 'vetro' ? 0 : 1 } },
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform float k; varying vec3 p; void main(){ float y = normalize(p).y; gl_FragColor = vec4(vec3(.03 + .07 * smoothstep(-.3,.9,y)) * k, 1.); }',
  })));
  if (tipo === 'vetro') {
    pannello(s, V3(-6, 7, 9), 2.2, 14, 3.2, .15);
    pannello(s, V3(8, 3, 6), 1.2, 12, 1.6, .15);
    pannello(s, V3(10, 4, 2), 10, 14, 1.1, .7);    // velo largo e tenue di lato (si vede solo di sbieco)
    pannello(s, V3(-10, 0, 1), 10, 14, .9, .7);
  } else {
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
    if (luce !== 'p2') {
      // riempimenti morbidi sulle diagonali rimaste scure (facce della lunetta, fianchi e fondello a 30-45°, 150°, 210°, 330° del giro):
      // tolgono il nero pieno senza spegnere il contrasto chiaro/scuro degli smussi. Misura (lumen-viste --giro24, Verde):
      // pixel quasi neri 13,8% → 9,4%, punti luce 5,6% → 6,0%, luminanza media fra i fotogrammi 71-147 → 93-152
      pannello(s, V3(9, 2, 9), 9, 16, 1.8 * riemp, .7);        // davanti-destra
      pannello(s, V3(-9, 2, 9), 9, 16, 1.45 * riemp, .7);      // davanti-sinistra
      pannello(s, V3(-8.5, 0, -8.5), 10, 16, 1.3 * riemp, .7); // dietro-sinistra
      pannello(s, V3(10, 1, -6), 8, 16, 1.1 * riemp, .7);      // dietro-destra
    }
  }
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, .1, 100, { size: 512 });
  pm.dispose();
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  return rt;
}

// ————————————————————————————— finiture —————————————————————————————
// metalli: sat (satinato anisotropo), luc (lucido), rag (raggiera del fondello), lanc (lancette e indici: lucido più brillante)
export const METALLI = {
  acciaio: { colore: 0xd2cfcc },
  'oro-rosa': { colore: 0xe6bd9f },   // tarato sulle foto di Aurora (#eac2a0 nelle luci medie)
};
// ruoli dell'officina → finitura; un modello chiede motore.ruoli('acciaio') e ha le chiavi pronte per Officina.mesh()
const RUOLI_METALLO = ['sat', 'luc', 'rag', 'lanc'];

// ————————————————————————————— motore —————————————————————————————
// opz.luce: 'lumen' (di serie) o 'p2' (lo studio approvato senza riempimenti, per i confronti); opz.riempimento: forza dei riempimenti (1)
export function creaMotore(renderer, opz = {}) {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const rtAcc = studio(renderer, 'acciaio', opz.luce, opz.riempimento ?? 1), rtVetro = studio(renderer, 'vetro');
  const env = rtAcc.texture, envVetro = rtVetro.texture;
  const materiali = new Map(), texture = new Map(), tessuti = new Map(), geometrie = new Map(), dipinti = new Map();
  let sat = null, ombraTex = null;
  const satin = () => sat ??= satinatura(maxAniso);

  // costruttori delle finiture: (opzioni) → materiale. Tutti con envMap esplicita: il modello non dipende da scene.environment
  const F = {};
  for (const [nome, M] of Object.entries(METALLI)) {
    const col = o => new THREE.Color(o.colore ?? M.colore);
    F[nome + '.sat'] = o => new THREE.MeshPhysicalMaterial({
      color: col(o), metalness: 1, roughness: o.ruvido ?? .36, roughnessMap: satin().ruvido, normalMap: satin().normale, normalScale: new THREE.Vector2(.12, .12),
      anisotropy: o.aniso ?? .7, anisotropyRotation: Math.PI / 2,
    });
    F[nome + '.rag'] = o => new THREE.MeshPhysicalMaterial({
      color: col(o), metalness: 1, roughness: o.ruvido ?? .3, roughnessMap: satin().ruvido, normalMap: satin().normale, normalScale: new THREE.Vector2(.08, .08),
      anisotropy: o.aniso ?? .45, anisotropyRotation: Math.PI / 2,
    });
    F[nome + '.luc'] = o => new THREE.MeshPhysicalMaterial({ color: col(o).offsetHSL(0, 0, .04), metalness: 1, roughness: o.ruvido ?? .07 });
    // lancette e indici: specchio quasi perfetto e un po' più di luce riflessa, per il lampo bianco della foto
    F[nome + '.lanc'] = o => new THREE.MeshPhysicalMaterial({ color: col(o).offsetHSL(0, 0, .06), metalness: 1, roughness: o.ruvido ?? .05, envMapIntensity: 1.35 });
  }
  // ceramica bianca: dielettrico (non metallo) con clearcoat; opaca = satinata morbida, lucida = smalto a specchio
  F['ceramica-bianca.opaca'] = o => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(o.colore ?? 0xf1f1ee), metalness: 0, roughness: o.ruvido ?? .62, clearcoat: .12, clearcoatRoughness: .5, envMapIntensity: o.env ?? 1.8 });
  F['ceramica-bianca.lucida'] = o => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(o.colore ?? 0xecece9), metalness: 0, roughness: o.ruvido ?? .22, clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: o.env ?? 1.6 });
  // pelle: colore + grana (normal map procedurale); scaglie in mm per il cocco (0 = liscia)
  F['pelle'] = o => {
    const t = motore.texPelle({ scaglie: o.scaglie ?? 0 });
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(o.colore ?? 0x4a1418), map: t.colore, metalness: 0, roughness: o.ruvido ?? .5, normalMap: t.normale,
      normalScale: new THREE.Vector2(o.rilievo ?? .6, o.rilievo ?? .6), clearcoat: .3, clearcoatRoughness: .4, sheen: .12, sheenRoughness: .7,
      sheenColor: new THREE.Color(o.colore ?? 0x4a1418).lerp(new THREE.Color(1, 1, 1), .25), envMapIntensity: o.env ?? 1.6,
    });
  };
  // cuciture, fodera, dettagli tessili: dielettrico opaco
  F['filo'] = o => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(o.colore ?? 0x5c1a20), metalness: 0, roughness: o.ruvido ?? .7, envMapIntensity: 1.4 });
  F['lume'] = o => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(o.colore ?? 0xf6f6f1), metalness: 0, roughness: .3, clearcoat: .8, clearcoatRoughness: .08, emissive: new THREE.Color(o.colore ?? 0xf6f6f1), emissiveIntensity: o.luce ?? .2, envMapIntensity: 1.5 });
  F['nero'] = () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, metalness: .6, roughness: .5 });
  // vetro zaffiro: solo riflesso (additivo), studio suo con poche strisce nette
  F['vetro'] = o => new THREE.MeshPhysicalMaterial({ color: 0x000000, metalness: 0, roughness: .03, envMap: envVetro, envMapIntensity: o.forza ?? 1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

  const motore = {
    THREE, renderer, maxAniso, env, envVetro, RADICE, luce: opz.luce ?? 'lumen',
    finiture: () => Object.keys(F),
    satinatura: satin,
    // materiale condiviso: stesso nome e stesse opzioni → stesso oggetto. o.vc = false per le geometrie senza attributo color
    materiale(nome, o = {}) {
      const chiave = nome + '|' + JSON.stringify(o);
      if (materiali.has(chiave)) return materiali.get(chiave);
      if (!F[nome]) throw new Error(`lumen3d: finitura sconosciuta "${nome}". Disponibili: ${Object.keys(F).join(', ')}`);
      const m = F[nome](o);
      if (!m.envMap) m.envMap = env;
      m.vertexColors = nome !== 'vetro' && o.vc !== false;   // colore per vertice = occlusione finta cotta dall'officina
      if (o.env !== undefined) m.envMapIntensity = o.env;
      m.name = chiave;
      materiali.set(chiave, m);
      return m;
    },
    // le chiavi dell'officina (sat, luc, rag, lanc, lume, nero) per un metallo; extra = altre chiavi del modello
    ruoli(metallo = 'acciaio', extra = {}) {
      const r = {};
      for (const k of RUOLI_METALLO) r[k] = motore.materiale(`${metallo}.${k}`);
      r.lume = motore.materiale('lume'); r.nero = motore.materiale('nero');
      return Object.assign(r, extra);
    },
    // texture da file (relativa alla cartella del sito), una sola volta anche se la chiedono più orologi
    texture(percorso, { srgb = true } = {}) {
      const url = new URL(percorso, RADICE).href, chiave = url + (srgb ? '' : '|lin');
      if (!texture.has(chiave)) texture.set(chiave, new THREE.TextureLoader().loadAsync(url).then(t => {
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = maxAniso; return t;
      }));
      return texture.get(chiave);
    },
    // immagine per disegnarci sopra (canvas): la stessa del file, già caricata
    async immagine(percorso) { return (await motore.texture(percorso)).image; },
    // pelle procedurale { normale, colore } (colore = solchi più scuri fra le scaglie, da moltiplicare al colore della pelle)
    texPelle(o = {}) {
      const chiave = JSON.stringify(o);
      if (!tessuti.has(chiave)) { const t = pelle(o); t.normale.anisotropy = t.colore.anisotropy = maxAniso; tessuti.set(chiave, t); }
      return tessuti.get(chiave);
    },
    // geometria condivisa per chiave (es. vetro dello stesso raggio): il costruttore la crea una volta sola
    geometria(chiave, crea) { if (!geometrie.has(chiave)) geometrie.set(chiave, crea()); return geometrie.get(chiave); },

    // quadrante fotografico: disco con la foto (colori della foto, senza tone mapping).
    // Q = { texture, raggio (mm coperti dalla texture), z, segmenti, ombre: [{ punti: [[x,y],…] mm, alto: mm, forza }] }
    // con le ombre, la foto viene copiata in un canvas e ci si dipingono sotto i pezzi 3D le loro ombre morbide
    async quadrante(Q) {
      const t = await motore.texture(Q.texture);
      let map = t;
      const chiave = 'quadrante|' + Q.texture + '|' + Q.raggio + '|' + JSON.stringify(Q.ombre ?? []);
      if (dipinti.has(chiave)) map = dipinti.get(chiave);
      else if (Q.ombre?.length) {
        const S = t.image.width, k = S / (2 * Q.raggio), X = x => S / 2 + x * k, Y = y => S / 2 - y * k;
        const c = tela(S, S, g => {
          g.drawImage(t.image, 0, 0, S, S);
          // luce dall'alto: ombra spostata in basso e un po' a destra, sfumata quanto il pezzo è alto
          for (const { punti, alto, forza = .45 } of Q.ombre) {
            g.save(); g.shadowColor = `rgba(0,0,0,${forza})`; g.shadowBlur = alto * 1.1 * k; g.shadowOffsetX = -2 * S + alto * .12 * k; g.shadowOffsetY = alto * .75 * k;
            g.fillStyle = '#000'; g.beginPath(); punti.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](X(x) + 2 * S, Y(y))); g.closePath(); g.fill(); g.restore();
          }
        });
        map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = maxAniso;
        dipinti.set(chiave, map);
      }
      // stesso quadrante (stessa foto e stesse ombre) → stessa texture, stesso materiale, stessa geometria
      const g = motore.geometria(`disco|${Q.raggio}|${Q.segmenti ?? 128}`, () => new THREE.CircleGeometry(Q.raggio, Q.segmenti ?? 128));
      if (!materiali.has(chiave)) materiali.set(chiave, new THREE.MeshBasicMaterial({ map, toneMapped: false }));
      const disco = new THREE.Mesh(g, materiali.get(chiave));
      disco.position.z = Q.z; disco.name = 'quadrante';
      return disco;
    },
    // vetro piatto (cilindro sottile) con la faccia alta a quota z
    vetro({ raggio, spessore = .3, z = 0, forza = 1 }) {
      const g = motore.geometria(`vetro|${raggio}|${spessore}`, () => new THREE.CylinderGeometry(raggio, raggio, spessore, 128, 1));
      const m = new THREE.Mesh(g, motore.materiale('vetro', { forza }));
      m.rotation.x = Math.PI / 2; m.position.z = z - spessore / 2; m.renderOrder = 2; m.name = 'vetro';
      return m;
    },
    // ombra di contatto morbida (piano orizzontale, da mettere sotto l'orologio: y = ingombro.min[1])
    ombraContatto({ larghezza = 40, lunghezza = 70, forza = .75 } = {}) {
      ombraTex ??= (() => {
        const t = new THREE.CanvasTexture(tela(256, 256, (g, w, h) => {
          const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
          gr.addColorStop(0, 'rgba(0,0,0,.8)'); gr.addColorStop(.3, 'rgba(0,0,0,.55)'); gr.addColorStop(.65, 'rgba(0,0,0,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
        })); return t;
      })();
      const gruppo = new THREE.Group(); gruppo.name = 'ombra';
      for (const [w, l, o] of [[larghezza, lunghezza, forza], [larghezza * .4, lunghezza * .37, forza * .93]]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: ombraTex, transparent: true, opacity: o, depthWrite: false, toneMapped: false }));
        m.rotation.x = -Math.PI / 2; m.renderOrder = -1; gruppo.add(m);
      }
      return gruppo;
    },
    libera() {
      for (const m of materiali.values()) m.dispose();
      for (const p of texture.values()) p.then(t => t.dispose());
      for (const t of tessuti.values()) { t.normale.dispose(); t.colore.dispose(); }
      for (const g of geometrie.values()) g.dispose();
      for (const t of dipinti.values()) t.dispose();
      if (sat) { sat.normale.dispose(); sat.ruvido.dispose(); }
      ombraTex?.dispose(); rtAcc.dispose(); rtVetro.dispose();
      materiali.clear(); texture.clear(); tessuti.clear(); geometrie.clear(); dipinti.clear();
    },
  };
  return motore;
}

// ————————————————————————————— centratura e ingombro —————————————————————————————
// sposta i figli del gruppo perché il centro dell'ingombro sia l'origine (= perno di rotazione); restituisce l'ingombro in mm.
// raggioXZ = il raggio più grande attorno all'asse verticale: la larghezza che l'orologio occupa mentre gira
export function centra(gruppo, { escludi = o => o.name === 'ombra' } = {}) {
  gruppo.updateMatrixWorld(true);
  const box = new THREE.Box3(), p = V3();
  gruppo.traverse(o => { if (o.isMesh && !escludi(o)) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)); } });
  const c = box.getCenter(V3());
  for (const ch of gruppo.children) ch.position.sub(c);
  gruppo.updateMatrixWorld(true);
  let rxz = 0, r = 0, triangoli = 0;
  gruppo.traverse(o => {
    if (!o.isMesh || escludi(o)) return;
    const pos = o.geometry.attributes.position;
    triangoli += (o.geometry.index ? o.geometry.index.count : pos.count) / 3;
    for (let i = 0; i < pos.count; i += 3) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      rxz = Math.max(rxz, Math.hypot(p.x, p.z)); r = Math.max(r, p.length());
    }
  });
  const min = box.min.clone().sub(c), max = box.max.clone().sub(c), dim = box.getSize(V3());
  return { min: min.toArray(), max: max.toArray(), dimensioni: dim.toArray(), raggioXZ: rxz, raggio: r, triangoli: Math.round(triangoli) };
}
