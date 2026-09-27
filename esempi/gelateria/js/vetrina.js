// Gelateria · la vetrina dei gusti in 3D. monta(host, opz) → { avanza(p), fissa(p), tappe, … }
// Una vetrina da gelateria: fila di vaschette d'acciaio satinato col gelato ammucchiato, le palette infilate, il vetro curvo
// davanti, luce calda. Scrollando la camera scorre lungo la vetrina e si ferma su ogni gusto; alla fine si allarga su tutta.
// Le superfici sono foto della vetrina (src/vetrina-prepara.py → img/vetrina/): colore raddrizzato,
// rilievo grosso nella mesh (altezza), rilievo fine e lucido nella mappa -n (pendenze + lucido).
// p = avanzamento della sezione (0…1), reversibile. Le texture si caricano poco alla volta, prima quelle dei primi gusti.
import * as THREE from 'three';

// ————— i gusti, in ordine lungo la vetrina: le sei vaschette fatte dalle foto —————
// mappa: nome dei file in img/vetrina/; paletta: [u, v, direzione del manico in gradi (0 = verso il fondo), inclinazione]
export const GUSTI = [
  { id: 'peperoncino', nome: 'Cioccolato e peperoncino', riga: 'Cioccolato al latte e peperoncino: dolce, poi un filo di caldo.', paletta: [.4, .06, 10, 8] },
  { id: 'panettone', nome: 'Crema e panettone', riga: 'Crema con pezzi di panettone e cioccolato fuso.', paletta: [.6, .06, -10, 8] },
  { id: 'menta', nome: 'Menta fresca', riga: 'Menta, con le foglie fresche sopra.', paletta: [.42, .06, 8, 8] },
  { id: 'nocciola', nome: 'Bacio e nocciola', riga: 'Nocciole intere, cioccolato bianco e scaglie di fondente.', paletta: [.58, .06, -8, 8] },
  { id: 'ovetti', nome: 'Ovetti di cioccolato', riga: 'Variegato al cioccolato con gli ovetti, interi e a metà.', paletta: [.4, .06, 10, 8] },
  { id: 'caramello', nome: 'Caramello salato', riga: 'Variegato al caramello, con il sale.', paletta: [.6, .06, -10, 8] },
];
// Gusti procedurali (spatolate + guarnizioni 3D): SPENTI in questa vetrina, restano per il template neutro di Scrollify.
// Per usarli: passarli in monta(host, { gusti: [...] }) con i loro id; le texture si fanno con vetrina-prepara.py <id>.
export const GUSTI_PROCEDURALI = [
  { id: 'fragola', nome: 'Fragola', riga: 'Fragole vere, dentro e sopra.', paletta: [.14, .12, -20, 36], guarn: [['fragola', 6, 21], ['fragolaIntera', 2, 22]] },
  { id: 'limone', nome: 'Sorbetto al limone', riga: 'Fresco e senza latte.', paletta: [.16, .14, -25, 36], guarn: [['limone', 3, 31], ['limoneFetta', 2, 32]] },
  { id: 'pistacchio', nome: 'Pistacchio', riga: 'Il classico, con la granella sopra.', paletta: [.84, .13, 20, 38], guarn: [['granella', 160, 42], ['pistacchio', 14, 41]] },
  { id: 'lamponi', nome: 'Bianco e lamponi', riga: 'Cioccolato bianco, lamponi e scaglie di fondente.', paletta: [.86, .14, 22, 38], guarn: [['scaglia', 6, 51], ['lampone', 9, 52]] },
  { id: 'wafer', nome: 'Wafer', riga: 'Crema con wafer e biscotti.', paletta: [.14, .12, -18, 36], guarn: [['wafer', 6, 61], ['biscotto', 4, 62]] },
  { id: 'fiordilatte', nome: 'Fior di latte', riga: 'Latte fresco e panna.', paletta: [.85, .14, 20, 38] },
];

// ————— misure (unità: 1 = 10 cm) —————
// vaschette lunghe e strette come nelle foto di riferimento (vetrina-chatgpt*.png): 15,5 × 45 cm; il gelato ammucchiato alto
const LX = 1.55, LZ = 4.5;            // apertura interna della vaschetta
const BORDO = .1, RI = .22;           // bordo piatto intorno, raggio degli angoli interni
const PASSO = LX + 2 * BORDO + .04;   // da centro a centro
const INCL = THREE.MathUtils.degToRad(5);   // le vaschette pendono un filo verso il cliente
const ALTO_MIN = -.2, ALTO_MAX = 1.6; // codifica della mappa -h (vetrina-prepara.py)
const PEND = 2.5;                     // codifica della mappa -n

const lim = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const liscia = (a, b, x) => { const t = lim((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const rad = THREE.MathUtils.degToRad;

function tela(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
// le texture si decodificano fuori dal thread principale (ImageBitmap): il caricamento sul GPU non blocca lo scroll.
// Dove createImageBitmap non c'è (o non accetta le opzioni) si ripiega su <img> decodificata.
async function caricaBitmap(src) {
  if (typeof createImageBitmap === 'function') {
    try {
      const r = await fetch(src); if (!r.ok) throw new Error('immagine non trovata: ' + src);
      return await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    } catch (e) { if (/non trovata/.test(e.message)) throw e; }
  }
  return caricaImg(src);
}
function caricaImg(src) { return new Promise((ok, no) => { const i = new Image(); i.decoding = 'async'; i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => ok(i)); i.onerror = () => no(new Error('immagine non trovata: ' + src)); i.src = src; }); }

// rettangolo con gli angoli tondi (centrato), come percorso chiuso
function rettTondo(w, h, r, forma = new THREE.Shape(), cx = 0) {
  const x = cx - w / 2, y = -h / 2;
  forma.moveTo(x + r, y); forma.lineTo(x + w - r, y); forma.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  forma.lineTo(x + w, y + h - r); forma.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  forma.lineTo(x + r, y + h); forma.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  forma.lineTo(x, y + r); forma.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return forma;
}
// punti lungo il perimetro del rettangolo tondo (in x, z) con la normale verso fuori
function perimetro(w, h, r, nArco = 8, nLato = 4) {
  const pts = [];
  const lato = (x0, z0, x1, z1, nx, nz) => { for (let i = 0; i < nLato; i++) { const t = i / nLato; pts.push([mix(x0, x1, t), mix(z0, z1, t), nx, nz]); } };
  const arco = (cx, cz, a0) => { for (let i = 0; i < nArco; i++) { const a = a0 + (i / nArco) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); } };
  const X = w / 2, Z = h / 2;
  lato(-X + r, -Z, X - r, -Z, 0, -1); arco(X - r, -Z + r, -Math.PI / 2);
  lato(X, -Z + r, X, Z - r, 1, 0); arco(X - r, Z - r, 0);
  lato(X - r, Z, -X + r, Z, 0, 1); arco(-X + r, Z - r, Math.PI / 2);
  lato(-X, Z - r, -X, -Z + r, -1, 0); arco(-X + r, -Z + r, Math.PI);
  return pts;
}
// distanza (negativa dentro) dal rettangolo tondo
function sdRett(x, z, w, h, r) {
  const qx = Math.abs(x) - w / 2 + r, qz = Math.abs(z) - h / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}

// ————— luce: la stanza della gelateria, per i riflessi (acciaio, vetro, gelato lucido) —————
function ambiente(renderer, pm) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `varying vec3 p; void main(){ float y = normalize(p).y;
      vec3 soffitto = vec3(.385,.38,.37), muro = vec3(.215,.21,.205), pavimento = vec3(.08,.075,.07);
      vec3 c = mix(pavimento, muro, smoothstep(-.5,.05,y)); c = mix(c, soffitto, smoothstep(.2,.8,y));
      gl_FragColor = vec4(c, 1.); }`,
  })));
  const piano = (w, h, pos, forza, colore = '#fff4e2', guarda = V3(0, 0, 0), morbido = .3) => {
    const t = new THREE.CanvasTexture(tela(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, colore); gr.addColorStop(1 - morbido, colore); gr.addColorStop(1, '#2a2018'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }));
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    m.material.color.setScalar(forza); m.position.copy(pos); m.lookAt(guarda); s.add(m);
  };
  piano(60, 1.6, V3(0, 9, -1), 7, '#fffaf4', V3(0, 0, -1), .15);     // la striscia di luce sotto la cappa della vetrina
  piano(40, 14, V3(0, 18, 6), 1.5, '#fbf8f4', V3(0, 0, 0), .6);      // soffitto chiaro
  piano(30, 10, V3(0, 5, 22), 1.4, '#fbf7f1', V3(0, 3, 0), .5);      // davanti: la sala e la porta a vetri
  piano(10, 16, V3(-24, 6, 4), 1.1, '#f8f0e6', V3(0, 3, 0), .5);     // fianchi
  piano(10, 16, V3(24, 6, 2), .8, '#f4eadc', V3(0, 3, 0), .5);
  // le lampadine a vista del negozio: puntini caldi che scorrono sull'acciaio e sul vetro
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffecd6').multiplyScalar(9) });
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.45, 12, 8), lamp); b.position.set(-15 + i * 5, 12 + (i % 2) * .8, 7 + (i % 3) * 1.5); s.add(b); }
  const rt = pm.fromScene(s, 0, .1, 100, { size: 256 });
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  return rt;
}

// i riflessi del vetro: stanza buia, restano solo le luci (striscia della cappa, lampadine, la porta a vetri)
function riflessiVetro(renderer, pm) {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x000000);
  const luce = (geo, pos, colore, forza, guarda) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(colore).multiplyScalar(forza), side: THREE.DoubleSide })); m.position.copy(pos); if (guarda) m.lookAt(guarda); s.add(m); };
  luce(new THREE.PlaneGeometry(60, .5), V3(0, 9, -1), '#fff4e4', .7, V3(0, 0, -1));
  luce(new THREE.PlaneGeometry(14, 5), V3(-6, 4, 24), '#fff6ea', .5, V3(0, 3, 0));         // la porta a vetri, dietro al cliente
  luce(new THREE.PlaneGeometry(8, 5), V3(12, 4, 24), '#fff6ea', .35, V3(0, 3, 0));
  luce(new THREE.PlaneGeometry(40, 10), V3(0, 18, 6), '#fff3e4', .12, V3(0, 0, 0));        // soffitto, appena
  for (let i = 0; i < 7; i++) luce(new THREE.SphereGeometry(.4, 10, 8), V3(-15 + i * 5, 12 + (i % 2) * .8, 7 + (i % 3) * 1.5), '#ffd9a8', 5);
  const rt = pm.fromScene(s, 0, .1, 100, { size: 128 });
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt;
}

// ————— la griglia di sfiato davanti alle vaschette (fessure scure su acciaio) —————
function texGriglia() {
  const c = tela(512, 64, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      const x = i * 32 + 6; g.fillStyle = '#3a342c';
      g.beginPath(); g.roundRect(x, 27, 20, 9, 4.5); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x + 3, 37, 14, 1.2);
    }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
// il fronte del mobile: pannelli bianchi incorniciati (luce dall'alto: filo chiaro sopra, ombra sotto)
function texPannelli(N) {
  const n = Math.max(3, Math.round(N / 3)), c = tela(256 * n, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const pw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * pw + 18, y = 30, ww = pw - 36, hh = h - 78;
      g.fillStyle = 'rgba(120,96,70,.16)'; g.fillRect(x, y + hh, ww, 3); g.fillRect(x + ww, y, 3, hh + 3);
      g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(x, y - 2, ww, 2); g.fillRect(x - 2, y, 2, hh);
      g.fillStyle = 'rgba(120,96,70,.08)'; g.fillRect(x + 6, y + 6, ww - 12, 2);
    }
    const gr = g.createLinearGradient(0, h - 26, 0, h); gr.addColorStop(0, 'rgba(90,70,50,.0)'); gr.addColorStop(1, 'rgba(90,70,50,.28)');
    g.fillStyle = gr; g.fillRect(0, h - 26, w, 26);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// ombra morbida sotto il mobile (per la vista finale)
function texOmbra() {
  const c = tela(256, 128, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = Math.max(0, Math.abs(x - w / 2) / (w / 2) - .78) / .22, dy = Math.max(0, Math.abs(y - h / 2) / (h / 2) - .5) / .5;
      const d = Math.min(1, Math.hypot(dx, dy)), a = Math.pow(1 - d, 2.2) * .5;
      const i = (y * w + x) * 4; img.data[i] = 70; img.data[i + 1] = 50; img.data[i + 2] = 34; img.data[i + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
  });
  return new THREE.CanvasTexture(c);
}

// ————— il materiale del gelato: colore dalla foto, rilievo fine e lucido dalla mappa -n —————
function materialeGelato(uni) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .55, metalness: 0 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vVet; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVet = uv; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vVet; varying vec3 vObjN;
        uniform sampler2D uColore, uRil; uniform mat3 uRot; uniform float uRilievo, uRuvido, uLiscio, uPronto;`)
      .replace('#include <map_fragment>', `
        vec4 gCol = texture2D(uColore, vVet);
        vec3 gRil = texture2D(uRil, vVet).rgb;
        diffuseColor.rgb *= mix(vec3(.93, .86, .76), gCol.rgb, uPronto);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(uRuvido, uLiscio, gRil.b);')
      .replace('#include <normal_fragment_maps>', `{
        vec2 gd = (gRil.rg * 2. - 1.) * ${PEND.toFixed(2)} * uRilievo * uPronto;
        vec3 no = normalize(vObjN); float ny = max(no.y, .18);
        vec3 nO = normalize(vec3(no.x / ny - gd.x, 1., no.z / ny - gd.y));
        normal = normalize((viewMatrix * vec4(uRot * nO, 0.)).xyz);
      }`);
  };
  m.customProgramCacheKey = () => 'vetrina-gelato';
  return m;
}

// la superficie del gelato: griglia sopra l'apertura, alzata con la mappa dell'altezza
function geoGelato(nx, nz, alt) {
  const nV = (nx + 1) * (nz + 1), pos = new Float32Array(nV * 3), uv = new Float32Array(nV * 2), idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const u = i / nx, v = j / nz, k = j * (nx + 1) + i;
    const x = (u - .5) * LX, z = (v - .5) * LZ;
    let y = alt ? alt(u, v) : .15 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    // fuori dagli angoli tondi il gelato sta sotto il bordo (lo copre la tesa)
    const d = sdRett(x, z, LX, LZ, RI);
    if (d > -.01) y = Math.min(y, -.12 - d * 2);
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    uv[k * 2] = u; uv[k * 2 + 1] = v;
    if (i < nx && j < nz) { const a = k, b = k + 1, c = k + nx + 2, d2 = k + nx + 1; idx.push(a, d2, b, b, d2, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
// campionatore bilineare della mappa dell'altezza (PNG in scala di grigi)
function campAltezza(img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = tela(w, h, g => g.drawImage(img, 0, 0));
  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  return (u, v) => {
    const x = lim(u * w - .5, 0, w - 1.001), y = lim(v * h - .5, 0, h - 1.001), x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const a = d[(y0 * w + x0) * 4], b = d[(y0 * w + x0 + 1) * 4], c2 = d[((y0 + 1) * w + x0) * 4], e = d[((y0 + 1) * w + x0 + 1) * 4];
    return ALTO_MIN + (ALTO_MAX - ALTO_MIN) * ((a + (b - a) * fx) * (1 - fy) + (c2 + (e - c2) * fx) * fy) / 255;
  };
}

// ————— le guarnizioni in 3D (per i gusti fatti senza foto): fragole a metà, fette di limone, pistacchi, lamponi,
// scaglie di fondente, wafer e biscotti. Geometrie piccole, texture disegnate su canvas, una InstancedMesh per tipo e vaschetta.
function casuale(seme) { let a = seme >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function texCanvas(c, srgb = true) { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// unisce geometrie indicizzate (posizione, normale, uv) mettendo ognuna nel suo gruppo di materiale
function unisci(geos) {
  const g = new THREE.BufferGeometry(), P = [], Nn = [], U = [], I = []; let off = 0;
  geos.forEach((q, k) => {
    const p = q.attributes.position, n = q.attributes.normal, u = q.attributes.uv, idx = q.index ? q.index.array : [...Array(p.count).keys()];
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); Nn.push(n.getX(i), n.getY(i), n.getZ(i)); U.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
    g.addGroup(I.length, idx.length, k); for (const i of idx) I.push(i + off); off += p.count;
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I);
  return g;
}

const GUARNIZIONI = {
  // mezza fragola, il taglio in su: buccia rossa coi semini, dentro rosa col cuore chiaro
  fragola(tel) {
    const prof = [[0, 0], [.1, .04], [.22, .14], [.33, .3], [.4, .5], [.42, .65], [.39, .8], [.3, .92], [.16, .99], [0, 1]];
    const buccia = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), tel ? 10 : 16, 0, Math.PI);
    const forma = new THREE.Shape(); prof.forEach(([r, y], i) => i ? forma.lineTo(r, y) : forma.moveTo(r, y)); for (let i = prof.length - 2; i > 0; i--) forma.lineTo(-prof[i][0], prof[i][1]);
    const taglio = new THREE.ShapeGeometry(forma, 4);
    { const uv = taglio.attributes.uv, p = taglio.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / .84 + .5, p.getY(i)); }
    taglio.rotateY(-Math.PI / 2);
    const g = unisci([buccia, taglio]); g.scale(.42, .42, .42); g.rotateZ(-Math.PI / 2);   // sdraiata, taglio in su
    const tB = texCanvas(tela(256, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, '#9e0f1c'); gr.addColorStop(.6, '#c81d2a'); gr.addColorStop(1, '#d9483a'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 20; y += 16) for (let x = (y / 16 % 2) * 11; x < w; x += 22) { c.fillStyle = 'rgba(90,0,10,.45)'; c.beginPath(); c.ellipse(x, y, 4.5, 3.5, 0, 0, 7); c.fill(); c.fillStyle = '#e8c35a'; c.beginPath(); c.ellipse(x, y, 2, 1.4, 0, 0, 7); c.fill(); }
    }));
    // il taglio: la texture segue la sagoma (u = x/0.84 + 0.5, v = y): bordo rosso della buccia, polpa rossa, poi rosata, cuore chiaro
    const tT = texCanvas(tela(256, 256, (c, w, h) => {
      const r = casuale(3), cx = w / 2, cy = h * .5;
      const sagoma = (k) => { c.beginPath(); prof.forEach(([rr, y], i) => { const X = cx + (rr / .84 * w - 0) * k, Y = cy + ((1 - y) * h - cy) * (k * .5 + .5); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); for (let i = prof.length - 1; i >= 0; i--) { const [rr, y] = prof[i]; c.lineTo(cx - rr / .84 * w * k, cy + ((1 - y) * h - cy) * (k * .5 + .5)); } c.closePath(); };
      c.fillStyle = '#b01727'; c.fillRect(0, 0, w, h);
      sagoma(1); c.fillStyle = '#b01727'; c.fill();
      sagoma(.9); c.fillStyle = '#d23a48'; c.fill();
      const gr = c.createRadialGradient(cx, h * .45, 3, cx, h * .45, w * .34); gr.addColorStop(0, '#f7cfca'); gr.addColorStop(.55, '#ef9a9c'); gr.addColorStop(1, '#df5664');
      sagoma(.74); c.fillStyle = gr; c.fill();
      c.globalAlpha = .25; c.strokeStyle = '#fde6e2';
      for (let k = 0; k < 18; k++) { const a = r() * 6.283, l = w * (.12 + r() * .14); c.lineWidth = .8 + r(); c.beginPath(); c.moveTo(cx, h * .45); c.lineTo(cx + Math.cos(a) * l, h * .45 + Math.sin(a) * l * 1.3); c.stroke(); }
      c.globalAlpha = 1;
      c.save(); c.translate(cx, h * .42); c.scale(1, 3.4); const cu = c.createRadialGradient(0, 0, 1, 0, 0, w * .075); cu.addColorStop(0, 'rgba(252,232,226,.95)'); cu.addColorStop(1, 'rgba(246,196,192,0)'); c.fillStyle = cu; c.fillRect(-w, -h, 2 * w, 2 * h); c.restore();
    }));
    return { geo: g, mat: [new THREE.MeshStandardMaterial({ map: tB, roughness: .3 }), new THREE.MeshStandardMaterial({ map: tT, roughness: .5 })], su: .05, zona: 'centro', minD: .36, scala: [1.05, 1.3], gira: (r, e) => e.set(rad((r() - .5) * 50), r() * 6.283, rad((r() - .5) * 60), 'YXZ') };
  },
  // fragola intera col ciuffo verde, sdraiata
  fragolaIntera(tel) {
    const H = GUARNIZIONI.fragola(tel);
    const prof = [[0, 0], [.1, .04], [.22, .14], [.33, .3], [.4, .5], [.42, .65], [.39, .8], [.3, .92], [.16, .99], [0, 1]];
    const corpo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), tel ? 14 : 20);
    const foglie = [];
    for (let k = 0; k < 6; k++) {
      const f = new THREE.ConeGeometry(.07, .3, 3, 1); f.scale(1, 1, .25); f.translate(0, .15, 0); f.rotateZ(-Math.PI / 2 + .35); f.rotateY(k / 6 * 6.283); f.translate(0, .99, 0); foglie.push(f);
    }
    const gambo = new THREE.CylinderGeometry(.018, .025, .14, 5); gambo.translate(0, 1.06, 0); foglie.push(gambo);
    const v = unisci(foglie), g = unisci([corpo, v]);
    g.groups = [g.groups[0], { start: g.groups[1].start, count: g.index.count - g.groups[1].start, materialIndex: 1 }];
    g.scale(.42, .42, .42); g.rotateZ(-Math.PI / 2 + .12);
    return { geo: g, mat: [H.mat[0], new THREE.MeshStandardMaterial({ color: '#4f7a2c', roughness: .6, side: THREE.DoubleSide })], su: .1, zona: 'centro', minD: .5, scala: [1.05, 1.2], gira: (r, e) => e.set(rad((r() - .5) * 20), r() * 6.283, rad((r() - .5) * 20), 'YXZ') };
  },
  // mezza fetta di limone in piedi, infilata nel gelato
  limone(tel) {
    const g = new THREE.CylinderGeometry(.3, .3, .055, tel ? 20 : 32, 1, false, 0, Math.PI);
    g.rotateX(Math.PI / 2); g.rotateZ(Math.PI / 2);
    const tS = texCanvas(tela(512, 512, (c, w, h) => {
      const cx = w / 2, cy = h / 2, R = w / 2, r = casuale(7);
      c.fillStyle = '#e8c43a'; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();            // buccia
      c.fillStyle = '#f7f1d8'; c.beginPath(); c.arc(cx, cy, R * .95, 0, 7); c.fill();      // albedo bianco
      for (let k = 0; k < 10; k++) {
        const a0 = k / 10 * 6.283 + .035, a1 = (k + 1) / 10 * 6.283 - .035, am = (a0 + a1) / 2;
        c.save(); c.beginPath(); c.moveTo(cx + Math.cos(am) * R * .07, cy + Math.sin(am) * R * .07); c.arc(cx, cy, R * .87, a0, a1); c.closePath(); c.clip();
        const gr = c.createRadialGradient(cx, cy, R * .08, cx, cy, R * .87); gr.addColorStop(0, '#f6eaa6'); gr.addColorStop(.7, '#f1dc72'); gr.addColorStop(1, '#ecd35a');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        // le vescicole del succo: gocce allungate verso il centro
        for (let j = 0; j < 90; j++) {
          const aa = a0 + r() * (a1 - a0), rr = R * (.14 + r() * .7), l = 5 + r() * 9;
          c.fillStyle = r() < .5 ? 'rgba(255,250,215,.35)' : 'rgba(215,170,30,.18)';
          c.beginPath(); c.ellipse(cx + Math.cos(aa) * rr, cy + Math.sin(aa) * rr, l, 2 + r() * 1.5, aa, 0, 7); c.fill();
        }
        c.restore();
      }
      c.fillStyle = '#f7f1d8'; c.beginPath(); c.arc(cx, cy, R * .07, 0, 7); c.fill();
    }));
    const buccia = new THREE.MeshStandardMaterial({ color: '#e2bd2c', roughness: .5 });
    const sez = new THREE.MeshStandardMaterial({ map: tS, roughness: .16, emissive: '#ffffff', emissiveMap: tS, emissiveIntensity: .12 });
    return { geo: g, mat: [buccia, sez, sez], su: -.1, zona: 'centro', minD: .5, scala: [.95, 1.1], gira: (r, e) => e.set(rad(-25 + (r() - .5) * 30), r() * 6.283, rad((r() - .5) * 16), 'YXZ') };
  },
  // fetta intera di limone, sdraiata sul gelato (dall'alto si legge bene)
  limoneFetta(tel) {
    const L = GUARNIZIONI.limone(tel), g = new THREE.CylinderGeometry(.3, .3, .05, tel ? 24 : 36, 1);
    return { geo: g, mat: L.mat, su: .03, zona: 'centro', minD: .55, scala: [.95, 1.08], gira: (r, e) => e.set(rad((r() - .5) * 24), r() * 6.283, rad((r() - .5) * 24), 'YXZ') };
  },
  // granella di pistacchio: pezzetti irregolari verdi, a mucchio lungo il mezzo
  granella(tel) {
    const g = new THREE.IcosahedronGeometry(1, 0); g.scale(.028, .018, .024);
    return { geo: g, mat: new THREE.MeshStandardMaterial({ color: '#7d9a3a', roughness: .7, flatShading: true }), su: .012, zona: 'centro', minD: .045, scala: [.7, 1.4], gira: (r, e) => e.set(r() * 6.283, r() * 6.283, r() * 6.283, 'YXZ') };
  },
  // pistacchi sgusciati: verdi con la pellicina viola-bruna
  pistacchio(tel) {
    const g = new THREE.SphereGeometry(1, tel ? 8 : 12, tel ? 6 : 8); g.scale(.085, .042, .05);
    const t = texCanvas(tela(128, 64, (c, w, h) => {
      c.fillStyle = '#86a03e'; c.fillRect(0, 0, w, h); const r = casuale(5);
      for (let i = 0; i < 26; i++) { c.fillStyle = r() < .6 ? 'rgba(104,58,52,.75)' : 'rgba(170,150,90,.6)'; c.beginPath(); c.ellipse(r() * w, r() * h, 4 + r() * 12, 3 + r() * 6, r() * 3, 0, 7); c.fill(); }
    }));
    return { geo: g, mat: new THREE.MeshStandardMaterial({ map: t, roughness: .55 }), su: .03, zona: 'centro', minD: .1, scala: [.9, 1.25], gira: (r, e) => e.set(rad((r() - .5) * 40), r() * 6.283, rad((r() - .5) * 40), 'YXZ') };
  },
  // lamponi: tanti granelli (druplette) su una sfera, il buco sotto
  lampone(tel) {
    const g = new THREE.SphereGeometry(1, tel ? 20 : 28, tel ? 14 : 20), p = g.attributes.position, col = [];
    const dru = []; const nD = 64; for (let i = 0; i < nD; i++) { const y = 1 - 2 * (i + .5) / nD, r = Math.sqrt(1 - y * y), a = i * 2.39996; dru.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      let m = 0; for (const d of dru) { const c = v.x * d[0] + v.y * d[1] + v.z * d[2]; m = Math.max(m, c); }
      const bump = Math.pow(lim((m - .92) / .08), .8);
      const buco = liscia(-.72, -.92, v.y);
      v.multiplyScalar((1 + .14 * bump) * (1 - .35 * buco)); v.y *= 1.12; p.setXYZ(i, v.x, v.y, v.z);
      const k = .35 + .65 * bump; col.push(.66 * k + .08, .06 * k + .01, .12 * k + .03);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); g.scale(.1, .1, .1);
    return { geo: g, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .34 }), su: .08, zona: 'gruppi', minD: .24, scala: [1.2, 1.45], gira: (r, e) => e.set(rad((r() - .5) * 60), r() * 6.283, rad((r() - .5) * 60), 'YXZ') };
  },
  // scaglie di fondente: lastrine irregolari, lucide, infilate di sbieco
  scaglia(tel) {
    const r = casuale(17), gs = [];
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Shape(), n = 6 + Math.floor(r() * 3), R = .28 + r() * .16;
      for (let i = 0; i < n; i++) { const a = i / n * 6.283 + r() * .5, rr = R * (.55 + r() * .5); i ? f.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * .8) : f.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * .8); }
      const e = new THREE.ExtrudeGeometry(f, { depth: .024, bevelEnabled: true, bevelThickness: .006, bevelSize: .006, bevelSegments: 1 }); e.translate(0, 0, -.012); gs.push(e);
    }
    return { geo: gs, mat: new THREE.MeshStandardMaterial({ color: '#3a1e11', roughness: .16 }), su: -.04, zona: 'centro', minD: .42, scala: [1.1, 1.4], gira: (r, e) => e.set(rad(-40 + (r() - .5) * 40), r() * 6.283, rad((r() - .5) * 30), 'YXZ') };
  },
  // wafer: cialda a quadretti sopra e sotto, strati di crema ai lati; qualche biscotto al cacao
  wafer(tel) {
    const g = new THREE.BoxGeometry(.58, .08, .34);
    const tQ = texCanvas(tela(128, 128, (c, w, h) => {
      c.fillStyle = '#d9a55a'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 16) for (let y = 0; y < h; y += 16) { c.fillStyle = '#c38a3e'; c.fillRect(x + 3, y + 3, 10, 10); c.fillStyle = 'rgba(255,230,170,.5)'; c.fillRect(x + 3, y + 3, 10, 2); }
    }));
    const tL = texCanvas(tela(64, 64, (c, w, h) => { const s = ['#c9914a', '#f0dcb6', '#c9914a', '#f0dcb6', '#c9914a']; s.forEach((k, i) => { c.fillStyle = k; c.fillRect(0, i * h / 5, w, h / 5); }); }));
    tQ.wrapS = tQ.wrapT = THREE.RepeatWrapping;
    const q = new THREE.MeshStandardMaterial({ map: tQ, roughness: .7 }), l = new THREE.MeshStandardMaterial({ map: tL, roughness: .75 });
    return { geo: g, mat: [l, l, q, q, l, l], su: 0, zona: 'centro', minD: .5, scala: [1.05, 1.3], gira: (r, e) => e.set(rad(r() < .5 ? -35 - r() * 25 : (r() - .5) * 20), r() * 6.283, rad((r() - .5) * 20), 'YXZ') };
  },
  biscotto(tel) {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, r = casuale(9);
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (r() - .5) * .25), p.getY(i) * (1 + (r() - .5) * .25), p.getZ(i) * (1 + (r() - .5) * .25));
    g.computeVertexNormals(); g.scale(.13, .07, .11);
    return { geo: g, mat: new THREE.MeshStandardMaterial({ color: '#3d261a', roughness: .85, flatShading: true }), su: .03, minD: .4, scala: [1.2, 1.5], gira: (r, e) => e.set(rad((r() - .5) * 40), r() * 6.283, rad((r() - .5) * 40), 'YXZ') };
  },
};

// ————— la scena —————
export async function monta(host, { telefono = false, ridotto = false, base = 'img/vetrina/', gusti: scelti = GUSTI, zona = () => ({ alto: 0, basso: 0, cx: .5 }), P0 = .1, P1 = .76 } = {}) {
  // i gusti della pagina (id, nome, riga) prendono forma e texture da GUSTI; un id sconosciuto usa la forma del primo
  const tutti = [...GUSTI, ...GUSTI_PROCEDURALI];
  const gusti = scelti.map(g => ({ ...(tutti.find(x => x.id === g.id) || GUSTI[0]), ...g }));
  // il montaggio è spezzato in pezzi piccoli con una pausa fra l'uno e l'altro (cedi): se parte mentre si scorre la pagina
  // (il cono sopra gira), nessun fotogramma resta bloccato a lungo. tempi: quanto costa ogni pezzo (per le verifiche)
  const t0 = performance.now(), tempi = [], segna = n => tempi.push([n, Math.round(performance.now() - t0)]);
  const cedi = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.LinearToneMapping; renderer.toneMappingExposure = .68;   // lineare: i colori delle foto restano quelli (la Neutral scalda i mezzitoni)
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scena = new THREE.Scene();
  segna('renderer'); await cedi();
  const pm = new THREE.PMREMGenerator(renderer);
  const env = ambiente(renderer, pm); scena.environment = env.texture; scena.environmentIntensity = 1;
  segna('luce'); await cedi();
  const envVetro = riflessiVetro(renderer, pm);
  pm.dispose();
  segna('riflessi del vetro'); await cedi();
  const camera = new THREE.PerspectiveCamera(telefono ? 40 : 30, 1, .5, 200);

  // la luce della cappa arriva da dietro e dall'alto; l'ombra segue il gusto inquadrato (radente sul gelato: le onde si leggono anche guardando dall'alto)
  const sole = new THREE.DirectionalLight('#fff9f0', 1.45);
  const luceDir = V3(-3, 9, -6);
  // riempimento morbido per le superfici opache (il mobile bianco, il gelato); l'acciaio non ne risente
  const cielo = new THREE.HemisphereLight('#f4f6f8', '#727170', .45); scena.add(cielo);
  const fronte0 = new THREE.DirectionalLight('#fffaf4', .45); fronte0.position.set(-2, 4, 12); scena.add(fronte0);
  sole.castShadow = true; sole.shadow.mapSize.set(telefono ? 1024 : 2048, telefono ? 1024 : 2048);
  Object.assign(sole.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 1, far: 40 });
  sole.shadow.bias = -.0004; sole.shadow.normalBias = .03; sole.shadow.radius = 3;
  scena.add(sole, sole.target);

  const N = gusti.length, L = N * PASSO;
  const xDi = i => (i - (N - 1) / 2) * PASSO;
  const vetrina = new THREE.Group(); scena.add(vetrina);
  const parti = {};
  const piano = new THREE.Group(); piano.rotation.x = INCL; vetrina.add(piano);   // il piano delle vaschette, inclinato

  // materiali
  const acciaio = new THREE.MeshStandardMaterial({ color: '#c6c5c2', metalness: 1, roughness: .22 });
  const acciaioScuro = new THREE.MeshStandardMaterial({ color: '#a3a29f', metalness: 1, roughness: .32 });
  const bianco = new THREE.MeshStandardMaterial({ color: '#f4eee4', roughness: .5, emissive: '#f4eee4', emissiveIntensity: .32 });
  const griglia = texGriglia(); griglia.repeat.set(L / 2.2, 1);
  const matGriglia = new THREE.MeshStandardMaterial({ color: '#c9c8c4', metalness: 1, roughness: .32, map: griglia });
  const manico = new THREE.MeshStandardMaterial({ color: '#c6a47c', roughness: .62 });

  // ——— le vaschette (tutte uguali: istanze) ———
  const tesaForma = rettTondo(LX + 2 * BORDO, LZ + 2 * BORDO, RI + BORDO); tesaForma.holes.push(rettTondo(LX, LZ, RI, new THREE.Path()));
  const geoTesa = new THREE.ExtrudeGeometry(tesaForma, { depth: .02, bevelEnabled: true, bevelThickness: .014, bevelSize: .016, bevelSegments: 2, curveSegments: telefono ? 6 : 10 });
  geoTesa.rotateX(-Math.PI / 2); geoTesa.translate(0, -.02, 0);
  // parete interna: dal bordo in giù, un filo rastremata
  const per = perimetro(LX, LZ, RI, telefono ? 6 : 10, 3);
  const nP = per.length, pp = new Float32Array(nP * 2 * 3), pn = new Float32Array(nP * 2 * 3), pi = [];
  per.forEach(([x, z, nx, nz], k) => {
    pp.set([x, -.005, z, x - nx * .06, -1.2, z - nz * .06], k * 6);
    pn.set([-nx, 0, -nz, -nx, 0, -nz], k * 6);
    const a = k * 2, b = ((k + 1) % nP) * 2; pi.push(a, a + 1, b, b, a + 1, b + 1);
  });
  const geoParete = new THREE.BufferGeometry(); geoParete.setAttribute('position', new THREE.BufferAttribute(pp, 3)); geoParete.setAttribute('normal', new THREE.BufferAttribute(pn, 3)); geoParete.setIndex(pi);
  const tese = new THREE.InstancedMesh(geoTesa, acciaio, N), pareti = new THREE.InstancedMesh(geoParete, acciaio, N);
  const _m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) { _m.makeTranslation(xDi(i), 0, 0); tese.setMatrixAt(i, _m); pareti.setMatrixAt(i, _m); }
  tese.receiveShadow = pareti.receiveShadow = true;
  piano.add(tese, pareti);

  // ——— il piano d'acciaio con i buchi delle vaschette ———
  const ZF = LZ / 2 + BORDO, ZB = -(LZ / 2 + BORDO);
  const pianoForma = new THREE.Shape(); { const x0 = -L / 2 - .35, x1 = L / 2 + .35, z0 = ZB - .5, z1 = ZF + .12; pianoForma.moveTo(x0, -z1); pianoForma.lineTo(x1, -z1); pianoForma.lineTo(x1, -z0); pianoForma.lineTo(x0, -z0); pianoForma.lineTo(x0, -z1); }
  for (let i = 0; i < N; i++) pianoForma.holes.push(rettTondo(LX + .1, LZ + .1, RI + .05, new THREE.Path(), xDi(i)));
  const geoPiano = new THREE.ShapeGeometry(pianoForma, telefono ? 4 : 6); geoPiano.rotateX(-Math.PI / 2); geoPiano.translate(0, -.03, 0);
  const pianoMesh = new THREE.Mesh(geoPiano, acciaioScuro); pianoMesh.receiveShadow = true; piano.add(pianoMesh);
  // il bordo dietro (lato del gelatiere): basso, d'acciaio
  const dietro = new THREE.Mesh(new THREE.BoxGeometry(L + .7, .22, .12), acciaio); dietro.position.set(0, .06, ZB - .56); piano.add(dietro);
  // le testate del piano (acciaio) ai due capi
  for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(.1, .3, ZF - ZB + .7), acciaio); t.position.set(sx * (L / 2 + .4), -.1, (ZF + ZB) / 2 - .19); piano.add(t); }

  // ——— davanti: la griglia di sfiato inclinata, il profilo e il vetro curvo ———
  // (fuori dal piano inclinato: coordinate della vetrina)
  const yF = -Math.sin(INCL) * (ZF + .12) - .03, zF = Math.cos(INCL) * (ZF + .12);
  const zDietro = Math.cos(INCL) * (ZB - .62), yDietro = -Math.sin(INCL) * (ZB - .62) + .17;   // cima del bordo dietro
  const geoGr = new THREE.PlaneGeometry(L + .7, .9); const gr = new THREE.Mesh(geoGr, matGriglia);
  gr.position.set(0, yF - .17, zF + .42); gr.rotation.x = -Math.PI / 2 + rad(22); gr.receiveShadow = true; vetrina.add(gr);
  const zV = zF + .9, yV = yF - .36;   // piede del vetro
  const profilo = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, L + .7, 12, 1), acciaio); profilo.rotation.z = Math.PI / 2; profilo.position.set(0, yV, zV); vetrina.add(profilo);
  // il vetro: sale dritto, poi curva all'indietro sopra le vaschette
  const RV = 2.35, hDritto = .95, zFine = -1.3, yCima = yV + hDritto + RV;
  const curvaV = [];
  for (let k = 0; k <= 3; k++) curvaV.push([zV, yV + hDritto * k / 3]);
  for (let k = 1; k <= 16; k++) { const a = (k / 16) * Math.PI / 2; curvaV.push([zV - RV + Math.cos(a) * RV, yV + hDritto + Math.sin(a) * RV]); }
  for (let k = 1; k <= 3; k++) curvaV.push([mix(zV - RV, zFine, k / 3), yCima]);
  const XV = L / 2 + .42;   // i fianchi di vetro
  const mv = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: .1, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide, envMap: envVetro.texture, envMapIntensity: .5 });
  // il vetro somma luce senza toccare l'alfa: sopra il fondo trasparente della tela i riflessi si sommano alla pagina
  Object.assign(mv, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  {
    const n = curvaV.length, pos = new Float32Array(n * 2 * 3), idx = [];
    curvaV.forEach(([z, y], k) => { pos.set([-XV, y, z, XV, y, z], k * 6); if (k < n - 1) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const vetro = new THREE.Mesh(g, mv);
    vetro.renderOrder = 5; vetrina.add(vetro); parti.vetro = vetro;
    // i fianchi: vetro piatto con la stessa curva, chiuso dietro fino al bordo
    const fianco = new THREE.Shape(); curvaV.forEach(([z, y], k) => k ? fianco.lineTo(-z, y) : fianco.moveTo(-z, y));
    fianco.lineTo(-zDietro, yDietro); fianco.lineTo(-zF, yF); fianco.lineTo(-zV, yV);
    const geoF = new THREE.ShapeGeometry(fianco); geoF.rotateY(Math.PI / 2);   // (x, y) della forma → (z, y) della vetrina
    const cornice = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvaV.map(([z, y]) => V3(0, y, z)).concat([V3(0, yDietro, zDietro)])), 48, .022, 6, false);
    for (const sx of [-1, 1]) {
      const f = new THREE.Mesh(geoF, mv); f.position.x = sx * XV; f.renderOrder = 5; vetrina.add(f);
      const c = new THREE.Mesh(cornice, acciaio); c.position.x = sx * XV; vetrina.add(c);
    }
  }

  // ——— il mobile bianco sotto, a pannelli come quello vero ———
  const HM = 8.2, zM0 = zV + .2, zM1 = zV - 6.0, yM = yV - .15;
  const mobile = new THREE.Mesh(new THREE.BoxGeometry(L + .9, HM, zM0 - zM1), bianco); mobile.position.set(0, yM - HM / 2, (zM0 + zM1) / 2); mobile.receiveShadow = true; vetrina.add(mobile);
  const pan = texPannelli(N), fronte = new THREE.Mesh(new THREE.PlaneGeometry(L + .9, HM), new THREE.MeshStandardMaterial({ color: '#f4eee4', roughness: .5, map: pan, emissive: '#f4eee4', emissiveMap: pan, emissiveIntensity: .32 }));
  fronte.position.set(0, yM - HM / 2, zM0 + .005); fronte.receiveShadow = true; vetrina.add(fronte);
  const paracolpi = new THREE.Mesh(new THREE.BoxGeometry(L + 1, .32, .5), bianco); paracolpi.position.set(0, yV - .2, zV + .12); vetrina.add(paracolpi);
  // il ripiano del gelatiere, dietro, un filo più basso
  const banco = new THREE.Mesh(new THREE.BoxGeometry(L + .9, .2, zDietro - zM1), bianco); banco.position.set(0, yDietro - .5, (zDietro + zM1) / 2); vetrina.add(banco);
  const ombra = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.3, 14), new THREE.MeshBasicMaterial({ map: texOmbra(), transparent: true, depthWrite: false, toneMapped: false }));
  ombra.rotation.x = -Math.PI / 2; ombra.position.set(0, yM - HM + .01, (zM0 + zM1) / 2 + .2); vetrina.add(ombra);

  // ——— i cartellini dei nomi davanti a ogni vaschetta, come in negozio: bianchi, piccoli, scritta in corsivo sobrio ———
  {
    const CW = 1.2, CH = .5, INC = rad(26), righe = Math.ceil(N / 2), cw = 512, ch = 224;
    const c = tela(1024, ch * righe, (g, w, h) => {
      g.fillStyle = '#e9e2d6'; g.fillRect(0, 0, w, h);
      gusti.forEach((gu, i) => {
        const x0 = (i % 2) * cw, y0 = Math.floor(i / 2) * ch;
        g.fillStyle = '#fbf8f2'; g.fillRect(x0 + 4, y0 + 4, cw - 8, ch - 8);
        g.strokeStyle = 'rgba(110, 88, 64, .5)'; g.lineWidth = 2; g.strokeRect(x0 + 18, y0 + 18, cw - 36, ch - 36);
        g.fillStyle = '#3a2a1e'; g.textAlign = 'center'; g.textBaseline = 'middle';
        let fs = 60; g.font = `italic 400 ${fs}px Georgia, "Times New Roman", serif`;
        // a capo come sui cartellini veri: "Cioccolato / e peperoncino"
        let righeT = [gu.nome];
        if (g.measureText(gu.nome).width > cw - 90) {
          // si va a capo prima di " e " se c'è, se no allo spazio più vicino al mezzo
          const spazi = [...gu.nome.matchAll(/ /g)].map(x => x.index), k = gu.nome.indexOf(' e ');
          const m = k > 0 ? k : spazi.reduce((a, b) => Math.abs(b - gu.nome.length / 2) < Math.abs(a - gu.nome.length / 2) ? b : a, spazi[0] ?? -1);
          if (m > 0) righeT = [gu.nome.slice(0, m), gu.nome.slice(m + 1)];
          while (Math.max(...righeT.map(t => g.measureText(t).width)) > cw - 90 && fs > 36) { fs -= 2; g.font = `italic 400 ${fs}px Georgia, "Times New Roman", serif`; }
        }
        righeT.forEach((t, k) => g.fillText(t, x0 + cw / 2, y0 + ch / 2 + (k - (righeT.length - 1) / 2) * fs * 1.08));
      });
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, maxAniso);
    const pos = [], uv = [], nor = [], idx = [], z0 = ZF + .06, y0 = -.03;
    const ny = Math.sin(INC), nz = Math.cos(INC);
    gusti.forEach((_, i) => {
      const x = xDi(i), u0 = (i % 2) / 2, v1 = 1 - Math.floor(i / 2) / righe, v0 = v1 - 1 / righe, b = pos.length / 3;
      const ya = y0 + CH * Math.cos(INC), za = z0 - CH * Math.sin(INC);
      pos.push(x - CW / 2, y0, z0, x + CW / 2, y0, z0, x + CW / 2, ya, za, x - CW / 2, ya, za);
      uv.push(u0, v0, u0 + .5, v0, u0 + .5, v1, u0, v1);
      for (let k = 0; k < 4; k++) nor.push(0, ny, nz);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    const cart = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: .6, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: .28, side: THREE.DoubleSide }));
    cart.receiveShadow = true; piano.add(cart); parti.cartellini = cart;
  }

  // ——— le palette: manico color nocciola, ghiera e lama d'acciaio (la lama entra nel gelato) ———
  const geoManico = new THREE.LatheGeometry([[0, 0], [.075, 0], [.082, .1], [.092, .9], [.097, 1.22], [.085, 1.33], [.048, 1.39], [0, 1.4]].map(([x, y]) => new THREE.Vector2(x, y)), telefono ? 12 : 18);
  geoManico.scale(1, .78, 1); geoManico.translate(0, .16, 0);   // più corto: la cima resta sotto i testi
  const geoGhiera = new THREE.CylinderGeometry(.08, .075, .18, telefono ? 12 : 18); geoGhiera.translate(0, .08, 0);
  const geoLama = new THREE.BoxGeometry(.34, .95, .022); geoLama.translate(0, -.45, 0);
  const manici = new THREE.InstancedMesh(geoManico, manico, N), ghiere = new THREE.InstancedMesh(geoGhiera, acciaio, N), lame = new THREE.InstancedMesh(geoLama, acciaio, N);
  for (const m of [manici, ghiere, lame]) { m.castShadow = true; m.receiveShadow = true; piano.add(m); }

  // ——— il gelato: una mesh per vaschetta (forma dalla sua mappa), texture che arrivano poco alla volta ———
  const passi = telefono ? [28, 82] : [44, 128];
  const rotPiano = new THREE.Matrix3();
  const vasche = gusti.map((g, i) => {
    const uni = {
      uColore: { value: null }, uRil: { value: null }, uRot: { value: rotPiano },
      uRilievo: { value: .55 }, uRuvido: { value: .6 }, uLiscio: { value: .2 }, uPronto: { value: 0 },
    };
    const mat = materialeGelato(uni);
    const mesh = new THREE.Mesh(geoGelato(4, 4, null), mat);
    mesh.position.x = xDi(i); mesh.castShadow = false; mesh.receiveShadow = true;   // finché la texture non arriva: una cupola color crema   // le onde non si fanno ombra da sole (la luce della vetrina è morbida): ombre solo di palette e guarnizioni
    piano.add(mesh);
    return { g, i, uni, mesh, stato: 'no' };
  });
  function mettiPaletta(v, alt) {
    const [u, w, dir, incl] = v.g.paletta;
    const x = (u - .5) * LX, z = (w - .5) * LZ, y = alt ? alt(u, w) : .2;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-rad(incl), rad(dir), 0, 'YXZ'));
    _m.compose(V3(xDi(v.i) + x, y + .04, z), q, V3(1, 1, 1));
    manici.setMatrixAt(v.i, _m); ghiere.setMatrixAt(v.i, _m);
    const q2 = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rad(8), 0)));
    _m.compose(V3(xDi(v.i) + x, y + .04, z), q2, V3(1, 1, 1)); lame.setMatrixAt(v.i, _m);
    manici.instanceMatrix.needsUpdate = ghiere.instanceMatrix.needsUpdate = lame.instanceMatrix.needsUpdate = true;
  }
  vasche.forEach(v => mettiPaletta(v, null));

  // guarnizioni: tipo → { geo, mat } fatte una volta sola; per ogni vaschetta una InstancedMesh
  const tipiG = {};
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = V3(1, 1, 1), _p = V3();
  function posaGuarnizioni(v, tipo, n, seme, alt) {
    const T = tipiG[tipo] || (tipiG[tipo] = GUARNIZIONI[tipo](telefono));
    const r = casuale(seme), [pu, pv] = v.g.paletta, geos = Array.isArray(T.geo) ? T.geo : [T.geo];
    const mesh = geos.map(g => new THREE.InstancedMesh(g, T.mat, n));
    const conta = geos.map(() => 0), presi = [];
    // dove: 'centro' = una striscia lungo il mezzo (come le mette il gelatiere), 'gruppi' = a mucchietti, altrimenti ovunque
    const centri = T.zona === 'gruppi' ? [0, 1, 2].map(() => [.3 + r() * .4, .22 + r() * .6]) : null;
    for (let k = 0, tent = 0; k < n && tent < 600; tent++) {
      let u, w;
      if (T.zona === 'centro') { w = .14 + r() * .74; u = .5 + (r() - .5) * .34 + Math.sin(w * 7 + seme) * .06; }
      else if (centri) { const c = centri[k % centri.length]; u = c[0] + (r() - .5) * .22; w = c[1] + (r() - .5) * .16; }
      else { u = .12 + r() * .76; w = .1 + r() * .82; }
      if (u < .08 || u > .92 || w < .07 || w > .93) continue;
      if (Math.hypot((u - pu) * LX, (w - pv) * LZ) < .45) continue;                                  // non sulla paletta
      if (presi.some(([a, b]) => Math.hypot((u - a) * LX, (w - b) * LZ) < (T.minD ?? .4))) continue;  // non una sull'altra
      presi.push([u, w]); k++;
      T.gira(r, _e); _q.setFromEuler(_e);
      const sc = T.scala[0] + r() * (T.scala[1] - T.scala[0]); _s.set(sc, sc, sc);
      _p.set(xDi(v.i) + (u - .5) * LX, alt(u, w) + T.su * sc, (w - .5) * LZ);
      const q = geos.length > 1 ? k % geos.length : 0;
      _m.compose(_p, _q, _s); mesh[q].setMatrixAt(conta[q]++, _m);
    }
    mesh.forEach((m, q) => { m.count = conta[q]; m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); if (m.count) piano.add(m); });
  }

  const suf = telefono ? '-t' : '';
  const tex = (img, srgb) => {
    const t = new THREE.Texture(img); t.flipY = false; t.needsUpdate = true;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(telefono ? 4 : 8, maxAniso); t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  async function carica(v) {
    if (v.stato !== 'no') return v.promessa;
    v.stato = 'carica';
    const m = v.g.mappa || v.g.id;
    v.promessa = Promise.all([caricaBitmap(base + `${m}${suf}.webp`), caricaBitmap(base + `${m}-n.webp`), caricaImg(base + `${m}-h.png`)]).then(async ([iC, iN, iH]) => {
      await cedi();
      const alt = campAltezza(iH);
      v.mesh.geometry.dispose(); v.mesh.geometry = geoGelato(passi[0], passi[1], alt);
      v.uni.uColore.value = tex(iC, true); v.uni.uRil.value = tex(iN, false);
      renderer.initTexture(v.uni.uColore.value); renderer.initTexture(v.uni.uRil.value);
      v.uni.uPronto.value = 1; v.stato = 'ok';
      mettiPaletta(v, alt);
      for (const [tipo, n, seme] of v.g.guarn || []) posaGuarnizioni(v, tipo, n, seme, alt);
      sporco = true;
    });
    return v.promessa;
  }

  // ————— tempi: dove si ferma la camera (P0 primo gusto, P1 ultimo; dopo P1 si allarga su tutta la vetrina) —————
  const tappe = gusti.map((_, i) => mix(P0, P1, i / (N - 1)));
  const passoP = (P1 - P0) / (N - 1);

  // ————— camera —————
  let W = 1, H = 1;
  function misura() {
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    sporco = true;
  }
  const ro = new ResizeObserver(misura); ro.observe(host);

  // ————— inquadrature —————
  // Ogni inquadratura è: direzione (elevazione, azimut in gradi), bersaglio, punti che devono stare dentro la zona libera.
  // risolvi() trova la distanza (i punti riempiono la zona) e lo spostamento dell'immagine (setViewOffset) che li mette al posto
  // giusto: sotto i testi, centrati. Tra un'inquadratura e l'altra si interpolano i parametri, non le posizioni.
  const _pj = V3(), _dir = V3();
  const camProva = new THREE.PerspectiveCamera();
  function risolvi(el, az, bersaglio, punti, allinea = 'alto', altoK = 1) {
    const z = zona(), mg = W < 600 ? 10 : 24;
    const x0 = mg, x1 = W - mg, y0 = z.alto * altoK + mg * .5, y1 = H - z.basso - mg;
    const aw = Math.max(40, x1 - x0), ah = Math.max(40, y1 - y0);
    camProva.fov = camera.fov; camProva.aspect = W / H; camProva.near = .5; camProva.far = 200; camProva.updateProjectionMatrix();
    const er = rad(el), ar = rad(az);
    _dir.set(Math.sin(ar) * Math.cos(er), Math.sin(er), Math.cos(ar) * Math.cos(er));
    let dist = 12, bx0 = 0, bx1 = 0, by0 = 0, by1 = 0, tx = 0;
    for (let it = 0; it < 5; it++) {
      camProva.position.copy(bersaglio).addScaledVector(_dir, dist); camProva.lookAt(bersaglio); camProva.updateMatrixWorld();
      bx0 = by0 = 1e9; bx1 = by1 = -1e9;
      for (const q of punti) { _pj.copy(q).project(camProva); const X = (_pj.x + 1) / 2 * W, Y = (1 - _pj.y) / 2 * H; bx0 = Math.min(bx0, X); bx1 = Math.max(bx1, X); by0 = Math.min(by0, Y); by1 = Math.max(by1, Y); }
      const k = Math.max((bx1 - bx0) / aw, (by1 - by0) / ah);
      if (Math.abs(k - 1) < .002) break;
      dist *= k;
    }
    _pj.copy(bersaglio).project(camProva); tx = (_pj.x + 1) / 2 * W;
    const ox = allinea === 'bersaglio' ? tx - (x0 + x1) / 2 : (bx0 + bx1) / 2 - (x0 + x1) / 2;
    const oy = allinea === 'alto' ? by0 - y0 : (by0 + by1) / 2 - (y0 + y1) / 2;
    return { el, az, dist, t: bersaglio.clone(), ox, oy };
  }
  const tel = () => W / H < .8;
  // su un gusto: la vaschetta (e un filo delle vicine) larga quanto la zona, sotto i testi
  function vistaGusto(i) {
    const largo = tel() ? PASSO * 1.16 : PASSO * (W / H > 1.45 ? 2.35 : 2.0);
    // sul telefono anche la cima del vetro sta sotto i testi (al primo e all'ultimo gusto il fianco curvo non passa sotto il nome)
    const vista = x => risolvi(tel() ? 57 : 45, 0, V3(x, .2, 0), [V3(x - largo / 2, 0, .2), V3(x + largo / 2, 0, .2), V3(x, 1.5, -LZ / 2), V3(x, -.5, zV + .1), ...(tel() ? [V3(x, yCima, zFine)] : [])], 'alto');
    let v = vista(xDi(i));
    // sul computer (si vedono tre vaschette e mezza) ai capi la camera si tiene un po' verso il centro: meno vuoto oltre la fine
    // della vetrina, ma ogni fermata resta diversa dalla vicina
    if (!tel()) {
      const mezzo = v.dist * Math.tan(rad(camera.fov) / 2) * (W / H), capo = L / 2 + .5;
      const x = mix(xDi(i), lim(xDi(i), -capo + mezzo * .8, capo - mezzo * .8), .55);
      if (x !== xDi(i)) v = vista(x);
    }
    return v;
  }
  // apertura: più in alto e di lato sul primo gusto
  function vistaApertura() {
    const x = xDi(0) + PASSO * (tel() ? .5 : .8), largo = PASSO * (tel() ? 1.9 : 3.4);
    const punti = [V3(x - largo / 2, 0, 1), V3(x + largo / 2, 0, -1), V3(x, 1.5, -LZ / 2), V3(x, -.5, zV + .1)];
    return risolvi(tel() ? 46 : 38, tel() ? -16 : -24, V3(x, .2, 0), punti, 'centro');
  }
  // finale: tutta la vetrina di tre quarti, in prospettiva (come la foto del negozio)
  function vistaTutta() {
    const X = L / 2 + .5, punti = [];
    // con sei vaschette la vetrina è corta: più dall'alto e più di fronte, il mobile tagliato in basso dal bordo (si vedono i gusti)
    for (const x of [-X, X]) for (const y of [yM - HM * .3, yCima]) for (const z of [zM1 + 2, zM0]) punti.push(V3(x, y, z));
    return risolvi(tel() ? 34 : 30, tel() ? -42 : -26, V3(0, -.5, 0), punti, 'centro', tel() ? 1 : .8);
  }
  const mixV = (A, B, k) => ({ el: mix(A.el, B.el, k), az: mix(A.az, B.az, k), dist: Math.exp(mix(Math.log(A.dist), Math.log(B.dist), k)), t: A.t.clone().lerp(B.t, k), ox: mix(A.ox, B.ox, k), oy: mix(A.oy, B.oy, k) });

  const _off = V3();
  let p = 0, pVis = 0, pObi = 0, sporco = true, tempoFermo = false, vistaFissa = null;
  function inquadra() {
    // posizione lungo la fila: si ferma su ogni gusto (velocità zero alle tappe)
    const f = lim((p - P0) / passoP, 0, N - 1), i0 = Math.min(N - 2, Math.floor(f)), fr = f - i0;
    const e = ridotto ? (fr < .5 ? 0 : 1) : fr - Math.sin(2 * Math.PI * fr) / (2 * Math.PI);   // movimento ridotto: stacchi netti, niente viaggi
    const viaggio = ridotto ? 0 : Math.sin(Math.PI * fr);
    let v = mixV(vistaGusto(i0), vistaGusto(i0 + 1), e);
    v.el += 2.5 * viaggio; v.dist *= 1 + .04 * viaggio;
    // entrata e finale
    let a = liscia(0, P0, p), b = liscia(P1 + .012, .985, p);
    if (ridotto) { a = a < .5 ? 0 : 1; b = b < .5 ? 0 : 1; }
    if (a < 1) v = mixV(vistaApertura(), v, a);
    if (b > 0) v = mixV(v, vistaTutta(), b);
    if (vistaFissa) {   // per le verifiche: una vaschetta sola, dall'alto come nelle foto
      const x = xDi(vistaFissa.i), m = vistaFissa.margine ?? .02;
      const punti = [V3(x - LX / 2 - m, 0, -LZ / 2 - m), V3(x + LX / 2 + m, 0, -LZ / 2 - m), V3(x - LX / 2 - m, 0, LZ / 2 + m), V3(x + LX / 2 + m, 0, LZ / 2 + m)];
      v = risolvi(vistaFissa.el ?? 72, vistaFissa.az ?? 0, V3(x, .1, 0), punti, 'centro');
    }
    const er = rad(v.el), ar = rad(v.az);
    _off.set(Math.sin(ar) * Math.cos(er), Math.sin(er), Math.cos(ar) * Math.cos(er)).multiplyScalar(v.dist);
    camera.position.copy(v.t).add(_off);
    camera.lookAt(v.t);
    camera.setViewOffset(W, H, v.ox, v.oy, W, H);
    camera.updateProjectionMatrix();
    // la luce e l'ombra seguono il punto guardato
    sole.position.copy(v.t).add(luceDir); sole.target.position.copy(v.t);
    const sc = sole.shadow.camera, ampio = b > .05;
    const r = ampio ? L * .6 : 6.5;
    if (sc.right !== r) { sc.left = -r; sc.right = r; sc.top = ampio ? 8 : 5.5; sc.bottom = ampio ? -8 : -5.5; sc.far = ampio ? 80 : 40; sc.updateProjectionMatrix(); }
    // carica le texture dei gusti vicini (e poi tutti, per la vista finale)
    const vicino = Math.round(f);
    for (let k = Math.max(0, vicino - 1); k <= Math.min(N - 1, vicino + 2); k++) carica(vasche[k]);
    if (p > P1 - passoP * 2) vasche.forEach(carica);
  }

  function disegna() {
    p = pVis;
    piano.updateMatrixWorld(true);
    rotPiano.setFromMatrix4(piano.matrixWorld);
    inquadra();
    renderer.render(scena, camera);
    sporco = false;
  }

  let visibile = false, attivo = false, ultimo = performance.now();   // attivo: il ciclo disegna solo a montaggio finito (materiali già compilati)
  const io = new IntersectionObserver(es => { visibile = es[0].isIntersecting; }); io.observe(host);
  renderer.setAnimationLoop(t => {
    const dt = Math.min(.05, (t - ultimo) / 1000); ultimo = t;
    if (!visibile || !attivo) return;
    const prima = pVis;
    if (tempoFermo || ridotto) pVis = pObi;
    else pVis += (pObi - pVis) * (1 - Math.exp(-dt * 10));
    if (Math.abs(pObi - pVis) < 2e-5) pVis = pObi;
    if (sporco || pVis !== prima) disegna();
  });

  // i primi gusti subito, gli altri in fila dietro (uno alla volta, per non intasare il telefono)
  misura();
  segna('scena'); await cedi();
  await Promise.all([0, 1].map(k => carica(vasche[k])));
  segna('primi due gusti'); await cedi();
  // i programmi dei materiali si compilano in parallelo (KHR_parallel_shader_compile) invece che al primo disegno
  inquadra(); await renderer.compileAsync(scena, camera).catch(() => {});
  segna('materiali'); await cedi();
  (async () => { for (const v of vasche) { try { await carica(v); await cedi(); } catch (e) { console.warn(e.message); } } segna('tutti i gusti'); })();

  const api = {
    avanza(pp) { pObi = lim(pp); },
    fissa(pp) { tempoFermo = true; pObi = pVis = lim(pp); disegna(); },
    libera() { tempoFermo = false; },
    tappe, passoP, P0, P1, gusti,
    // quale gusto è davanti (indice) e quanto è centrato (1 = fermo sulla tappa)
    davanti(pp = pVis) { const f = lim((pp - P0) / passoP, 0, N - 1), i = Math.round(f); return { i, centro: 1 - Math.min(1, Math.abs(f - i) * 2) }; },
    tutteCaricate: () => Promise.all(vasche.map(carica)),
    info: () => ({ p: pVis, triangoli: renderer.info.render.triangles, chiamate: renderer.info.render.calls, dpr, W, H, texture: renderer.info.memory.textures, geometrie: renderer.info.memory.geometries }),
    distruggi() { renderer.setAnimationLoop(null); ro.disconnect(); io.disconnect(); renderer.dispose(); env.dispose(); envVetro.dispose(); renderer.domElement.remove(); },
    vista(o) { vistaFissa = o; sporco = true; if (tempoFermo) disegna(); },
    renderer, scena, camera, parti, sole, ridisegna() { sporco = true; if (tempoFermo) disegna(); }, tempi,
  };
  disegna(); segna('primo disegno'); attivo = true;
  return api;
}
