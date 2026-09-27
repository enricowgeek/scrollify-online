// Soldi · la montagna di soldi interattiva (Three.js r180): banconote in un solo InstancedMesh, fisica in fisica.js.
// monta(host, opz) → API: rifai(), crolla(), info(), e i ganci di prova (ferma, avanza, passa, prendi, muovi, lascia, lancia, vista…).
// Gesti:
//   mouse   — passarci dentro veloce = scia che taglia; premi su una banconota e trascina = la prendi, lasci = la lanci;
//             gesto veloce e largo sulla parte bassa (o avanti e indietro) = crollo.
//   dito    — trascinare di lato = scia (lo scroll verticale resta del browser: touch-action pan-y);
//             tieni premuto ~0,17 s su una banconota = la prendi (da lì lo scroll si ferma finché non lasci) e la lanci.
import * as THREE from 'three';
import { disegnaAtlante, disegnaOro, FW, PAD, AW, RAPPORTO } from './banconota.js';
import { creaMucchio, casuale, NASCOSTA, RIPOSO, VOLO, PIOGGIA, PRESA, SALITA } from './fisica.js';
import { studio } from './studio.js';

const FOV = 30, TAN = Math.tan(FOV / 2 * Math.PI / 180);

export async function monta(host, opz = {}) {
  const { n = 1500, ridotto = false, telefono = false, suStato = () => {}, suOro = () => {}, suOroLanciato = () => {} } = opz;
  const t0 = performance.now();
  // ——— renderer ———
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const dprMax = telefono ? 1.75 : 2;
  let dpr = Math.min(window.devicePixelRatio || 1, dprMax);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.02;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const tela = renderer.domElement; tela.style.touchAction = 'pan-y'; tela.style.display = 'block';
  host.appendChild(tela);
  const scena = new THREE.Scene();
  const rtStudio = studio(renderer); scena.environment = rtStudio.texture; scena.environmentIntensity = .95;
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 250);

  // ——— banconote ———
  const atlante = await disegnaAtlante(1);
  const tex = new THREE.CanvasTexture(atlante);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mucchio = creaMucchio({ n, larga: RAPPORTO, seme: 7 });
  const { P, Q, S, piega, mosso, ease, edur, EP, EQ } = mucchio;
  const monte = mucchio.deposita();

  const geo = new THREE.PlaneGeometry(1, RAPPORTO, 8, 2); geo.rotateX(-Math.PI / 2);
  const aPiega = new THREE.InstancedBufferAttribute(piega, 4); aPiega.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aPiega', aPiega);
  const uTempo = { value: 0 };
  // il gold ticket: UNA banconota d'oro nascosta nella montagna (attributo per istanza + seconda texture)
  const oro = new Float32Array(n), aOro = new THREE.InstancedBufferAttribute(oro, 1); geo.setAttribute('aOro', aOro);
  const texOro = new THREE.CanvasTexture(await disegnaOro(1));
  texOro.colorSpace = THREE.SRGBColorSpace; texOro.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  let ORO = -1;
  const PIEGA_N = /* glsl */`
    float pgX = position.x, pgZ = position.z, pgF = aPiega.w + uTempo * 9.0;
    float pgW = 0.35 + 2.6 * pgX * pgX, pgS = sin(pgX * 7.0 + pgF), pgC = cos(pgX * 7.0 + pgF);
    float pgDx = 2.0 * aPiega.x * pgX + aPiega.y * pgZ * 9.4 + aPiega.z * (7.0 * pgC * pgW + pgS * 5.2 * pgX);
    float pgDz = aPiega.y * pgX * 9.4;
    vec3 objectNormal = normalize(vec3(-pgDx, 1.0, -pgDz));`;
  const PIEGA_P = /* glsl */`
    vec3 transformed = vec3(position);
    { float qX = position.x, qZ = position.z, qF = aPiega.w + uTempo * 9.0;
      transformed.y += aPiega.x * (qX * qX - 0.083) + aPiega.y * qX * qZ * 9.4 + aPiega.z * sin(qX * 7.0 + qF) * (0.35 + 2.6 * qX * qX); }`;
  const testa = '#include <common>\nattribute vec4 aPiega;\nuniform float uTempo;';
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .5, metalness: 0, side: THREE.DoubleSide });   // carta opaca con un filo di lucido
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTempo = uTempo; sh.uniforms.tOro = { value: texOro };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', testa + '\nattribute float aOro;\nvarying float vOro;').replace('#include <beginnormal_vertex>', PIEGA_N).replace('#include <begin_vertex>', PIEGA_P + '\n    vOro = aOro;');
    // fronte e retro dall'atlante (il retro specchiato: si legge girando la banconota); il gold ticket ha la sua texture e luccica
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tOro;\nvarying float vOro;').replace('#include <map_fragment>', /* glsl */`
      #ifdef USE_MAP
        vec2 pgUv = vMapUv;
        if (vOro > .5) diffuseColor *= texture2D( tOro, vec2(gl_FrontFacing ? pgUv.x : 1.0 - pgUv.x, pgUv.y) );
        else {
          pgUv.x = gl_FrontFacing ? pgUv.x * ${(FW / AW).toFixed(6)} : ${((FW + PAD) / AW).toFixed(6)} + (1.0 - pgUv.x) * ${(FW / AW).toFixed(6)};
          diffuseColor *= texture2D( map, pgUv );
        }
      #endif`).replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness + vOro * .8;').replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness - vOro * .22;');
  };
  mat.customProgramCacheKey = () => 'soldi-banconota';
  const matOmbra = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  matOmbra.onBeforeCompile = sh => {
    sh.uniforms.uTempo = uTempo;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', testa).replace('#include <begin_vertex>', PIEGA_P);
  };
  matOmbra.customProgramCacheKey = () => 'soldi-ombra';
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true; mesh.customDepthMaterial = matOmbra;
  { // tinte: banconote nuove e vecchie, un filo più calde o più fredde
    const r = casuale(33), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const b = .86 + r() * .18, w = r() - .5; c.setRGB(b * (1 + w * .05), b, b * (1 - w * .06)); mesh.setColorAt(i, c); }
  }
  scena.add(mesh);

  // ——— luce e pavimento (solo ombre: il fondo verde è quello della pagina) ———
  const sole = new THREE.DirectionalLight(0xfff3e2, 1.55);
  sole.position.set(-5.5, 11, 6.5); scena.add(sole); scena.add(sole.target);
  sole.castShadow = true; sole.shadow.mapSize.setScalar(telefono ? 1024 : 2048);
  { const c = sole.shadow.camera, L = Math.max(7, monte.R * 2.3); c.left = -L; c.right = L; c.top = L; c.bottom = -L; c.near = 1; c.far = 40; }
  sole.shadow.bias = -.0005; sole.shadow.normalBias = .02; sole.shadow.radius = 3;
  const pavimento = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.ShadowMaterial({ color: 0x0c3317, opacity: .3 }));
  pavimento.rotation.x = -Math.PI / 2; pavimento.receiveShadow = true; scena.add(pavimento);
  // ombra di contatto morbida sotto la montagna (si spegne quando la montagna non c'è più)
  const ao = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(6,34,14,.62)'); gr.addColorStop(.55, 'rgba(6,34,14,.3)'); gr.addColorStop(1, 'rgba(6,34,14,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0, toneMapped: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = .004; m.scale.setScalar(monte.R * 2.9); m.renderOrder = -1; scena.add(m); return m;
  })();

  // ——— inquadratura ———
  let abbassata = 0, dprVisto = window.devicePixelRatio;
  let L = { w: 1, h: 1, dist: 10, el: .2, yaw: 0, offY: 0, bersaglio: new THREE.Vector3(), verticale: false };
  const vista = { yaw: 0, el: 0, yawT: 0, elT: 0, speciale: null };
  const box = { x0: 0, x1: 0, y0: 0, y1: 0, w: 1, h: 1 };
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
  function posizionaCamera() {
    const yaw = L.yaw + vista.yaw, el = L.el + vista.el, b = L.bersaglio;
    camera.position.set(b.x + Math.sin(yaw) * Math.cos(el) * L.dist, b.y + Math.sin(el) * L.dist, b.z + Math.cos(yaw) * Math.cos(el) * L.dist);
    camera.lookAt(b); camera.updateMatrixWorld();
  }
  function aggiornaBox() {
    const p = (x, y, z) => { _v.set(x, y, z).project(camera); return [(_v.x * .5 + .5) * L.w, (1 - (_v.y * .5 + .5)) * L.h]; };
    const e = camera.matrixWorld.elements, rx = e[0] * monte.R, rz = e[2] * monte.R;
    const cima = p(0, monte.H, 0), sx = p(-rx, 0, -rz), dx = p(rx, 0, rz), fr = p(e[8] * monte.R, 0, e[10] * monte.R);
    box.x0 = Math.min(sx[0], dx[0]); box.x1 = Math.max(sx[0], dx[0]); box.y0 = cima[1]; box.y1 = Math.max(fr[1], sx[1]); box.w = box.x1 - box.x0; box.h = box.y1 - box.y0;
  }
  // spazio(): { alto, basso, largo } in px della tela — dove deve stare la punta, dove la base, quanta larghezza può prendere
  const spazio = opz.spazio || ((w, h) => ({ alto: h * .28, basso: h * .88, largo: w * .6 }));
  function inquadra() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    // densità dello schermo (cambia se la finestra passa su un altro monitor), meno gli scalini tolti dall'adattamento
    const dprVoluto = Math.max(1, Math.min(window.devicePixelRatio || 1, dprMax) - abbassata * .25);
    if (dprVoluto !== dpr) { dpr = dprVoluto; renderer.setPixelRatio(dpr); }
    dprVisto = window.devicePixelRatio;
    L.w = w; L.h = h; L.verticale = w / h < .9;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    L.el = L.verticale ? .2 : .17; L.yaw = 0;
    L.bersaglio.set(0, monte.H * .42, 0);
    sceltaOro();
    const sp = spazio(w, h);
    // distanza: la montagna (punta → base) alta quanto lo spazio, e larga non più di sp.largo
    L.dist = Math.max(monte.H / ((sp.basso - sp.alto) / h * 2 * TAN), 2 * monte.R / (sp.largo / w * 2 * TAN * camera.aspect));
    for (let k = 0; k < 4; k++) {
      camera.clearViewOffset(); camera.updateProjectionMatrix(); posizionaCamera();
      _v.set(0, monte.H, 0).project(camera); const ya = (1 - (_v.y * .5 + .5)) * h;
      _v.set(0, 0, monte.R * .7).project(camera); const yb = (1 - (_v.y * .5 + .5)) * h;
      _v.set(camera.matrixWorld.elements[0] * monte.R, 0, camera.matrixWorld.elements[2] * monte.R).project(camera); const xr = (_v.x * .5 + .5) * w;
      const f = Math.max((yb - ya) / (sp.basso - sp.alto), (2 * (xr - w / 2)) / sp.largo);
      L.dist *= f; if (Math.abs(f - 1) < .01) break;
    }
    camera.clearViewOffset(); camera.updateProjectionMatrix(); posizionaCamera();
    _v.set(0, 0, monte.R * .7).project(camera);
    L.offY = (1 - (_v.y * .5 + .5)) * h - sp.basso; camera.setViewOffset(w, h, 0, L.offY, w, h); camera.updateProjectionMatrix();
    // il cielo: quota del bordo alto dello schermo alla distanza della montagna (da lì piovono)
    _v.set(0, 1, .5).unproject(camera).sub(camera.position).normalize();
    const oriz = Math.hypot(_v.x, _v.z) || 1e-3, dOr = Math.hypot(camera.position.x, camera.position.z);
    mucchio.cielo = camera.position.y + _v.y * dOr / oriz + .6;
    aggiornaBox();
    daDisegnare = true;
  }

  // ——— matrici delle istanze (solo quelle che si sono mosse) ———
  const MA = mesh.instanceMatrix.array;
  function scriviMatrici() {
    let cambi = 0;
    for (let i = 0; i < n; i++) {
      if (!mosso[i]) continue; mosso[i] = 0; cambi++;
      const o = i * 16;
      if (S[i] === NASCOSTA) { MA.fill(0, o, o + 16); continue; }
      let px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2], x = Q[i * 4], y = Q[i * 4 + 1], z = Q[i * 4 + 2], w = Q[i * 4 + 3];
      if (ease[i] > 0) {
        let f = 1 - ease[i] / Math.abs(edur[i]); f = edur[i] < 0 ? f * f : f * f * (3 - 2 * f);
        px = EP[i * 3] + (px - EP[i * 3]) * f; py = EP[i * 3 + 1] + (py - EP[i * 3 + 1]) * f; pz = EP[i * 3 + 2] + (pz - EP[i * 3 + 2]) * f;
        let ax = EQ[i * 4], ay = EQ[i * 4 + 1], az = EQ[i * 4 + 2], aw = EQ[i * 4 + 3];
        if (ax * x + ay * y + az * z + aw * w < 0) { ax = -ax; ay = -ay; az = -az; aw = -aw; }
        x = ax + (x - ax) * f; y = ay + (y - ay) * f; z = az + (z - az) * f; w = aw + (w - aw) * f;
        const l = Math.hypot(x, y, z, w); x /= l; y /= l; z /= l; w /= l;
      }
      const x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
      MA[o] = 1 - (yy + zz); MA[o + 1] = xy + wz; MA[o + 2] = xz - wy; MA[o + 3] = 0;
      MA[o + 4] = xy - wz; MA[o + 5] = 1 - (xx + zz); MA[o + 6] = yz + wx; MA[o + 7] = 0;
      MA[o + 8] = xz + wy; MA[o + 9] = yz - wx; MA[o + 10] = 1 - (xx + yy); MA[o + 11] = 0;
      MA[o + 12] = px; MA[o + 13] = py; MA[o + 14] = pz; MA[o + 15] = 1;
    }
    if (cambi) { mesh.instanceMatrix.needsUpdate = true; aPiega.needsUpdate = true; }
    return cambi;
  }

  // ——— proiezione dei centri sullo schermo (per la scia) ———
  const SX = new Float32Array(n), SY = new Float32Array(n), SD = new Float32Array(n), _m = new THREE.Matrix4();
  function proietta() {
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); const e = _m.elements;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], w = e[3] * x + e[7] * y + e[11] * z + e[15];
      SX[i] = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / w * .5 + .5) * L.w; SY[i] = (.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / w * .5) * L.h; SD[i] = w;
    }
  }
  const pxMondo = d => 2 * d * TAN / L.h;   // unità di mondo per pixel alla profondità d

  // ——— la scia: tutto ciò che è vicino al segmento percorso dal puntatore vola via nella direzione del gesto ———
  const rndI = casuale(99);
  let ultimaScia = 0;
  function lama(ax, ay, bx, by, dtp) {
    const dx = bx - ax, dy = by - ay, lg = Math.hypot(dx, dy); if (lg < 1) return 0;
    const s = lg / Math.max(dtp, 1 / 240), S0 = Math.min(L.w, L.h);
    if (s < S0 * .85) return 0;
    const ux = dx / lg, uy = dy / lg;
    // spessore della lama legato alla grandezza delle banconote sullo schermo (uguale su computer e telefono):
    // circa un terzo di banconota, un po' di più se il gesto è molto veloce
    const lpx = 1 / pxMondo(L.dist), r = lpx * .32 + Math.min(14, s * .003);
    const e = camera.matrixWorld.elements;   // colonne: destra, su, indietro
    let wx = e[0] * ux - e[4] * uy, wy = e[1] * ux - e[5] * uy, wz = e[2] * ux - e[6] * uy; const wl = Math.hypot(wx, wy, wz); wx /= wl; wy /= wl; wz /= wl;
    let colpite = 0, vMedia = 0;
    for (let i = 0; i < n; i++) {
      const st = S[i]; if (st === NASCOSTA || st === SALITA || st === PRESA) continue;
      const px = SX[i] - ax, py = SY[i] - ay, t = Math.min(lg, Math.max(0, px * ux + py * uy)), qx = px - ux * t, qy = py - uy * t, d = Math.hypot(qx, qy);
      if (d > r * 1.5 || SD[i] <= 0) continue;
      const k = d < r ? 1 : .35 * (1 - (d - r) / (.5 * r));
      const v = Math.min(17, s * pxMondo(SD[i]) * .5) * k;
      if (st === RIPOSO && v < .9) continue;
      const lato = (qx * -uy + qy * ux) > 0 ? -1 : 1;   // sopra o sotto la linea: un filo verso l'alto o verso il basso
      const ok = mucchio.sveglia(i,
        wx * v + (rndI() - .5) * 1.4 * k, wy * v + (1 + rndI() * 2.4 + lato * .8) * k, wz * v + (rndI() - .5) * 1.4 * k,
        (rndI() - .5) * 16 * k, (rndI() - .5) * 16 * k, (rndI() - .5) * 16 * k);
      if (ok) { colpite++; vMedia += v; }
    }
    if (colpite) {
      const f = Math.min(9, vMedia / colpite);
      mucchio.scia.x = wx; mucchio.scia.y = wy; mucchio.scia.z = wz; mucchio.scia.forza = Math.max(mucchio.scia.forza, f);
      ultimaScia = orologio;
    }
    return colpite;
  }

  // ——— puntatore ———
  const coda = [];                 // campioni {x, y, t} arrivati dall'ultimo fotogramma
  const storia = [];               // ultimi 1,5 s (per velocità, crollo, lancio)
  let ultimo = null, dentroHost = false, hoverDa = false, orologio = performance.now() / 1000;
  let presa = null;                // { i, piano, tipo }
  let premuto = null;              // tocco in attesa della pressione lunga
  let ultimoCrollo = -9, ultimaAzione = -9;
  const raggio = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _piano = new THREE.Plane();
  function coordinate(e) { const r = tela.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function scegli(x, y, largo = 1) {
    _ndc.set(x / L.w * 2 - 1, -(y / L.h * 2 - 1)); raggio.setFromCamera(_ndc, camera);
    const o = raggio.ray.origin, d = raggio.ray.direction, Wm = RAPPORTO / 2 * largo * 1.1, Lm = .5 * largo * 1.04;
    let meglio = 1e9, idx = -1;
    for (let i = 0; i < n; i++) {
      const st = S[i]; if (st === NASCOSTA || st === SALITA) continue;
      const qx = Q[i * 4], qy = Q[i * 4 + 1], qz = Q[i * 4 + 2], qw = Q[i * 4 + 3];
      const nx = 2 * (qx * qy - qw * qz), ny = 1 - 2 * (qx * qx + qz * qz), nz = 2 * (qy * qz + qw * qx);
      const den = d.x * nx + d.y * ny + d.z * nz; if (Math.abs(den) < 1e-4) continue;
      const cx = P[i * 3] - o.x, cy = P[i * 3 + 1] - o.y, cz = P[i * 3 + 2] - o.z, t = (cx * nx + cy * ny + cz * nz) / den;
      if (t <= 0 || t >= meglio) continue;
      const hx = d.x * t - cx, hy = d.y * t - cy, hz = d.z * t - cz;
      const Xx = 1 - 2 * (qy * qy + qz * qz), Xy = 2 * (qx * qy + qw * qz), Xz = 2 * (qx * qz - qw * qy);
      const Zx = 2 * (qx * qz + qw * qy), Zy = 2 * (qy * qz - qw * qx), Zz = 1 - 2 * (qx * qx + qy * qy);
      if (Math.abs(hx * Xx + hy * Xy + hz * Xz) < Lm && Math.abs(hx * Zx + hy * Zy + hz * Zz) < Wm) { meglio = t; idx = i; }
    }
    if (idx < 0 && largo > 1) {   // col dito: la banconota più vicina entro 30 px
      proietta(); let dm = 30 * 30;
      for (let i = 0; i < n; i++) { if (S[i] === NASCOSTA || S[i] === SALITA) continue; const q = (SX[i] - x) ** 2 + (SY[i] - y) ** 2; if (q < dm && SD[i] > 0) { dm = q; idx = i; } }
    }
    return idx;
  }
  function prendi(i, x, y, tipo) {
    if (i < 0 || !mucchio.prendi(i)) return false;
    // piano davanti alla camera, al 38% della distanza: la banconota si stacca dal mucchio e viene verso chi guarda
    const e = camera.matrixWorld.elements; _v.set(-e[8], -e[9], -e[10]);
    _v2.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); _v2.addScaledVector(_v, -.62 * _v2.clone().sub(camera.position).dot(_v));
    _piano.setFromNormalAndCoplanarPoint(_v, _v2);
    presa = { i, piano: _piano.clone(), tipo, x, y, prof: _v2.clone().sub(camera.position).dot(_v) };
    if (i === ORO) suOro();
    mucchio.piega[i * 4 + 2] = .03; ultimaAzione = orologio; aggiornaCursore();
    return true;
  }
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m3 = new THREE.Matrix4(), _pt = new THREE.Vector3();
  function muoviPresa(dt, x, y) {
    const i = presa.i;
    _ndc.set(x / L.w * 2 - 1, -(y / L.h * 2 - 1)); raggio.setFromCamera(_ndc, camera);
    if (!raggio.ray.intersectPlane(presa.piano, _pt)) return;
    const k = 1 - Math.exp(-24 * dt), j = i * 3;
    const nx = P[j] + (_pt.x - P[j]) * k, ny = P[j + 1] + (_pt.y - P[j + 1]) * k, nz = P[j + 2] + (_pt.z - P[j + 2]) * k;
    const vx = (nx - P[j]) / dt, vy = (ny - P[j + 1]) / dt, vz = (nz - P[j + 2]) / dt;
    P[j] = nx; P[j + 1] = ny; P[j + 2] = nz;
    // guarda la camera (fronte verso chi la tiene), dondola con la velocità
    const e = camera.matrixWorld.elements, vr = vx * e[0] + vy * e[1] + vz * e[2], vu = vx * e[4] + vy * e[5] + vz * e[6];
    _q.setFromRotationMatrix(camera.matrixWorld); _q2.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2 - .25); _q.multiply(_q2);
    _e.set(Math.max(-.7, Math.min(.7, -vu * .05)), 0, Math.max(-.7, Math.min(.7, -vr * .04))); _q2.setFromEuler(_e); _q.multiply(_q2);
    _q2.set(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]).slerp(_q, 1 - Math.exp(-12 * dt));
    Q[i * 4] = _q2.x; Q[i * 4 + 1] = _q2.y; Q[i * 4 + 2] = _q2.z; Q[i * 4 + 3] = _q2.w;
    mosso[i] = 1;
  }
  function velocitaPuntatore(finestra = .08) {
    const ora = storia.length ? storia[storia.length - 1].t : 0; let a = null;
    for (let k = storia.length - 1; k >= 0; k--) { if (ora - storia[k].t > finestra) break; a = storia[k]; }
    const b = storia[storia.length - 1]; if (!a || !b || b.t - a.t < .012) return [0, 0];
    return [(b.x - a.x) / (b.t - a.t), (b.y - a.y) / (b.t - a.t)];
  }
  function lancia() {
    if (!presa) return;
    const i = presa.i, [vx, vy] = velocitaPuntatore(), e = camera.matrixWorld.elements, k = pxMondo(presa.prof);
    let wx = (e[0] * vx - e[4] * vy) * k, wy = (e[1] * vx - e[5] * vy) * k, wz = (e[2] * vx - e[6] * vy) * k;
    const sp = Math.hypot(wx, wy, wz), cap = 42; if (sp > cap) { wx *= cap / sp; wy *= cap / sp; wz *= cap / sp; }
    const f = Math.min(sp, cap) * .22;   // un po' dentro la scena
    wx -= e[8] * f; wy -= e[9] * f; wz -= e[10] * f;
    // gira su sé stessa come un frisbee (attorno alla sua normale)
    const q = i * 4, qx = Q[q], qy = Q[q + 1], qz = Q[q + 2], qw = Q[q + 3], nx = 2 * (qx * qy - qw * qz), ny = 1 - 2 * (qx * qx + qz * qz), nz = 2 * (qy * qz + qw * qx);
    const giro = (sp > 3 ? 7 : 1) * (rndI() < .5 ? -1 : 1);
    mucchio.lascia(i, wx, wy + (sp > 3 ? 1.5 : 0), wz, nx * giro + (rndI() - .5) * 2, ny * giro, nz * giro + (rndI() - .5) * 2, sp > 3 ? .14 : 1);
    presa = null; ultimaAzione = orologio; aggiornaCursore();
    if (i === ORO) suOroLanciato();
  }
  function sceltaOro() {
    if (ORO >= 0) return;
    // DENTRO la montagna: a un terzo dell'altezza, a un terzo del raggio verso chi guarda. Da fuori non si vede:
    // salta fuori solo tagliando o facendo crollare la montagna, e cade in mezzo alle altre
    const SP = mucchio.SP, H = monte.H, R = monte.R, cx = Math.sin(L.yaw), cz = Math.cos(L.yaw), fino = Math.floor(monte.nMonte * .6);
    let migliore = -1, punti = 1e9;
    for (let i = 0; i < fino; i++) {
      const x = SP[i * 3], y = SP[i * 3 + 1], z = SP[i * 3 + 2], r = Math.hypot(x, z), d = r > 1e-6 ? (x * cx + z * cz) / r : 1;
      const rQui = R * Math.max(.05, 1 - y / H);   // raggio della montagna a quella quota (circa)
      const q = Math.abs(y / H - .33) + Math.abs(r / rQui - .35) + (1 - d) * .3;
      if (q < punti) { punti = q; migliore = i; }
    }
    if (migliore < 0) migliore = 0;
    ORO = migliore; oro[ORO] = 1; aOro.needsUpdate = true; mucchio.oro = ORO;
    mesh.setColorAt(ORO, new THREE.Color(1, 1, 1)); mesh.instanceColor.needsUpdate = true;
  }
  function aggiornaCursore(idx = -1) { tela.style.cursor = presa ? 'grabbing' : (idx >= 0 ? 'grab' : ''); }

  function campione(x, y, t) {
    const c = { x, y, t }; coda.push(c); storia.push(c);
    while (storia.length && t - storia[0].t > 1.5) storia.shift();
  }
  tela.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const [x, y] = coordinate(e); orologio = Math.max(orologio, e.timeStamp / 1000);
    ultimo = { x, y, t: e.timeStamp / 1000 }; storia.length = 0; campione(x, y, e.timeStamp / 1000);
    if (e.pointerType === 'mouse') {
      const i = scegli(x, y);
      if (i >= 0) { e.preventDefault(); try { tela.setPointerCapture(e.pointerId); } catch (_) { } prendi(i, x, y, 'mouse'); }
    } else {
      // dito: pressione lunga su una banconota = la prendi (lo scroll resta libero fino a quel momento)
      premuto = { x, y, id: e.pointerId, timer: setTimeout(() => {
        if (!premuto) return;
        const i = scegli(premuto.x, premuto.y, 1.35);
        if (i >= 0 && prendi(i, premuto.x, premuto.y, 'tocco')) { try { tela.setPointerCapture(premuto.id); } catch (_) { } navigator.vibrate?.(8); }
        premuto = null;
      }, 170) };
    }
  });
  tela.addEventListener('pointermove', e => {
    const [x, y] = coordinate(e), t = e.timeStamp / 1000; dentroHost = true;
    if (premuto && Math.hypot(x - premuto.x, y - premuto.y) > 12) { clearTimeout(premuto.timer); premuto = null; }
    if (premuto) { premuto.x = x; premuto.y = y; }
    campione(x, y, t); hoverDa = true;
  });
  const fine = e => {
    if (premuto) { clearTimeout(premuto.timer); premuto = null; }
    if (presa) { const [x, y] = coordinate(e); campione(x, y, e.timeStamp / 1000); lancia(); }
    if (e.pointerType !== 'mouse') { ultimo = null; coda.length = 0; }
  };
  tela.addEventListener('pointerup', fine); tela.addEventListener('pointercancel', fine);
  tela.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !presa) { dentroHost = false; ultimo = null; coda.length = 0; vista.yawT = vista.elT = 0; } });
  // mentre tieni una banconota col dito la pagina non scorre
  tela.addEventListener('touchmove', e => { if (presa && e.cancelable) e.preventDefault(); }, { passive: false });
  tela.addEventListener('contextmenu', e => { if (presa || premuto) e.preventDefault(); });

  // ——— crollo: gesto veloce e largo sulla parte bassa, oppure avanti e indietro ———
  function controllaCrollo(ora) {
    if (ora - ultimoCrollo < 1.6 || presa || storia.length < 3) return;
    const S0 = Math.min(L.w, L.h);
    // A: gli ultimi 0,32 s
    let x0 = 1e9, x1 = -1e9, lung = 0, ym = 0, k0 = storia.length - 1, cnt = 0;
    for (let k = storia.length - 1; k > 0 && ora - storia[k - 1].t < .32; k--) {
      const a = storia[k - 1], b = storia[k]; lung += Math.hypot(b.x - a.x, b.y - a.y); x0 = Math.min(x0, a.x, b.x); x1 = Math.max(x1, a.x, b.x); ym += b.y; cnt++; k0 = k - 1;
    }
    const dur = storia[storia.length - 1].t - storia[k0].t;
    if (cnt >= 2 && dur > .03) {
      ym /= cnt; const vel = lung / dur, span = Math.min(x1, box.x1) - Math.max(x0, box.x0);
      if (span > box.w * .78 && vel > S0 * 1.9 && ym > box.y0 + box.h * .56 && ym < box.y1 + box.h * .08) return crolla(storia[storia.length - 1].x - storia[k0].x, 0, vel / (2.2 * S0));
    }
    // B: avanti e indietro dentro la montagna nell'ultimo 1,2 s
    let dentro = 0, giri = 0, dirPrima = 0;
    for (let k = storia.length - 1; k > 0 && ora - storia[k - 1].t < 1.2; k--) {
      const a = storia[k - 1], b = storia[k], dt = b.t - a.t; if (dt <= 0) continue;
      const v = Math.hypot(b.x - a.x, b.y - a.y) / dt, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (v > S0 * 1.1 && mx > box.x0 && mx < box.x1 && my > box.y0 && my < box.y1) {
        dentro += Math.hypot(b.x - a.x, b.y - a.y);
        const d = Math.sign(b.x - a.x); if (d && dirPrima && d !== dirPrima) giri++; if (d) dirPrima = d;
      }
    }
    if (dentro > box.w * 2.1 && giri >= 2) crolla(storia[storia.length - 1].x - storia[storia.length - 2].x, 0, 1.1);
  }
  function crolla(dxs = 1, dys = 0, forza = 1) {
    const e = camera.matrixWorld.elements;
    let dx = e[0] * dxs - e[4] * dys, dz = e[2] * dxs - e[6] * dys; if (!dx && !dz) dx = 1;
    mucchio.crollo(dx, dz, Math.max(.8, Math.min(1.6, forza)));
    ultimoCrollo = orologio; ultimaAzione = orologio; crolli++;
  }
  let crolli = 0;

  // gestione dei campioni arrivati: scia per ogni tratto, crollo, cursore, parallasse
  function gestisciPuntatore(ora) {
    if (coda.length && !presa) {
      proietta();
      for (const c of coda) {
        if (ultimo) { const dt = c.t - ultimo.t; if (dt > 0 && dt < .25) { if (lama(ultimo.x, ultimo.y, c.x, c.y, dt)) ultimaAzione = ora; } }
        ultimo = c;
      }
      controllaCrollo(ora);
    } else if (coda.length) ultimo = coda[coda.length - 1];
    coda.length = 0;
    if (presa && ultimo) muoviPresa(dtFrame, ultimo.x, ultimo.y);
    if (hoverDa && !presa && !telefono && ultimo) { aggiornaCursore(scegli(ultimo.x, ultimo.y)); }
    hoverDa = false;
    if (ultimo && dentroHost && !telefono && !ridotto) { vista.yawT = (ultimo.x / L.w - .5) * .1; vista.elT = (ultimo.y / L.h - .5) * .035; }
  }

  // ——— ciclo ———
  let tSim = 0, dtFrame = 1 / 60, daDisegnare = true, visibile = true, fermo = false, raf = 0, ultimoT = performance.now();
  const tempi = []; let msFisica = 0, msFisicaMax = 0;
  function passo(dt) {
    dtFrame = dt;
    gestisciPuntatore(orologio);
    const a = performance.now();
    // il gold ticket è leggero: quando scende plana piano, così atterra per ultimo, sopra le altre (in mezzo al mucchio, ma si trova)
    if (ORO >= 0 && S[ORO] === VOLO && mucchio.V[ORO * 3 + 1] < 0) mucchio.resist[ORO] = 2.6;
    mucchio.passo(dt, tSim); tSim += dt;
    if (ORO >= 0) { if (S[ORO] === VOLO) oroDaRialzare = true; else if (oroDaRialzare && S[ORO] === RIPOSO) { const c = mucchio.conta(); if (c.volo === 0) { oroDaRialzare = false; mucchio.rialzaOro(); } } }
    const ms = performance.now() - a; msFisica = msFisica * .9 + ms * .1; if (ms > msFisicaMax) msFisicaMax = ms;
    mucchio.scia.forza *= Math.exp(-dt * 5);
    // parallasse morbida
    const k = 1 - Math.exp(-dt * 4), yaw0 = vista.yaw, el0 = vista.el;
    vista.yaw += (vista.yawT - vista.yaw) * k; vista.el += (vista.elT - vista.el) * k;
    if (Math.abs(vista.yaw - yaw0) + Math.abs(vista.el - el0) > 1e-5 && !vista.speciale) { posizionaCamera(); aggiornaBox(); daDisegnare = true; }
  }
  let aoCache = -1, statoCache = ''; let oroDaRialzare = false;
  function disegna() {
    uTempo.value = tSim;
    const cambi = scriviMatrici();
    if (cambi || daDisegnare) {
      const c = mucchio.conta();
      const aoT = Math.min(1, c.aPosto / monte.nMonte) * .85; if (Math.abs(aoT - aoCache) > .01) { ao.material.opacity = aoT; aoCache = aoT; }
      renderer.render(scena, camera); daDisegnare = false;
      const disordine = 1 - c.aPosto / n, s = `${disordine > .04 && c.pioggia === 0 && c.salita === 0 && c.nascoste === 0 ? 1 : 0}`;
      if (s !== statoCache) { statoCache = s; suStato({ disordinata: s === '1', ...c }); }
      return true;
    }
    return false;
  }
  // tetto alla risoluzione se il telefono fatica: media dei fotogrammi con qualcosa in volo
  let campioniT = [];
  function adatta(ms, attivo) {
    if (!attivo) return;
    campioniT.push(ms); if (campioniT.length < 50) return;
    const m = campioniT.reduce((a, b) => a + b) / campioniT.length; campioniT = [];
    if (m > 21 && dpr > 1 && abbassata < 4) { dpr = Math.max(1, dpr - .25); renderer.setPixelRatio(dpr); renderer.setSize(L.w, L.h); abbassata++; daDisegnare = true; }
  }
  function ciclo(ora) {
    raf = requestAnimationFrame(ciclo);
    const dt = Math.min(.05, Math.max(.001, (ora - ultimoT) / 1000)); ultimoT = ora;
    if (!visibile || document.hidden) return;
    orologio = ora / 1000;
    if (window.devicePixelRatio !== dprVisto) inquadra();
    tempi.push(dt * 1000); if (tempi.length > 120) tempi.shift();
    if (!fermo) { passo(dt); const c = disegna(); adatta(dt * 1000, c); }
  }
  // pausa quando la montagna non si vede
  const io = new IntersectionObserver(v => { visibile = v[v.length - 1].isIntersecting; if (visibile) { ultimoT = performance.now(); daDisegnare = true; } }, { threshold: 0 });
  io.observe(host);
  let ultimaMisura = { w: 0, h: 0 };
  const ro = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight;
    // su telefono la barra del browser cambia l'altezza di continuo: sotto i 120 px non si rifà l'inquadratura
    if (w === ultimaMisura.w && Math.abs(h - ultimaMisura.h) < 120 && ultimaMisura.w) { renderer.setSize(w, h); L.h = h; camera.aspect = w / h; camera.setViewOffset(w, h, 0, L.offY, w, h); camera.updateProjectionMatrix(); daDisegnare = true; return; }
    ultimaMisura = { w, h }; inquadra();
  });
  ro.observe(host);

  inquadra();
  // shader compilati prima del primo fotogramma
  if (ridotto) mucchio.tuttaFatta(); else mucchio.piovi(tSim + .35, n > 1000 ? 2.4 : 2);
  scriviMatrici();
  await renderer.compileAsync?.(scena, camera);
  renderer.render(scena, camera);
  const msPronta = performance.now() - t0;
  raf = requestAnimationFrame(ciclo);

  // ——— API e ganci di prova ———
  function avanza(sec, passoFisso = 1 / 60) {
    const k = Math.max(1, Math.round(sec / passoFisso));
    for (let s = 0; s < k; s++) { orologio += passoFisso; passo(passoFisso); }
    daDisegnare = true; disegna();
  }
  // gesto del puntatore: in pausa lo simula passo passo, dal vivo lo distribuisce sui fotogrammi
  function passa(x0, y0, x1, y1, ms = 200, curva = 0) {
    const pt = f => [x0 + (x1 - x0) * f + Math.sin(f * Math.PI) * curva, y0 + (y1 - y0) * f];
    if (fermo) {
      const passi = Math.max(2, Math.round(ms / 1000 * 60));
      ultimo = { x: x0, y: y0, t: orologio }; storia.length = 0; campione(x0, y0, orologio); coda.length = 0;
      for (let s = 1; s <= passi; s++) { orologio += 1 / 60; const [x, y] = pt(s / passi); campione(x, y, orologio); passo(1 / 60); }
      daDisegnare = true; disegna(); ultimo = null; return Promise.resolve();
    }
    return new Promise(res => {
      const a = performance.now(); ultimo = { x: x0, y: y0, t: a / 1000 }; campione(x0, y0, a / 1000);
      const f = () => { const o = performance.now(), u = Math.min(1, (o - a) / ms), [x, y] = pt(u); campione(x, y, o / 1000); if (u < 1) requestAnimationFrame(f); else { setTimeout(() => { ultimo = null; res(); }, 30); } };
      requestAnimationFrame(f);
    });
  }
  const api = {
    renderer, scena, camera, mucchio, monte, atlante, get box() { return { ...box }; }, get L() { return L; },
    rifai() { presa = null; if (ridotto) mucchio.tuttaFatta(); else mucchio.rifai(tSim, n > 1000 ? 2.4 : 2); ultimaAzione = orologio; daDisegnare = true; },
    crolla: (dx = 1) => crolla(dx, 0, 1.2),
    get oro() { return ORO; },
    info() {
      const t = [...tempi].sort((a, b) => a - b), med = t[t.length >> 1] || 0, fps = t.length ? 1000 / (t.reduce((a, b) => a + b) / t.length) : 0;
      return { n, ...mucchio.conta(), crolli, fps: +fps.toFixed(1), msMediano: +med.toFixed(2), msFisica: +msFisica.toFixed(2), msFisicaMax: +msFisicaMax.toFixed(2), dpr, disegni: renderer.info.render.calls, triangoli: renderer.info.render.triangles,
        msPronta: Math.round(msPronta), monte: { R: +monte.R.toFixed(2), H: +monte.H.toFixed(2), nMonte: monte.nMonte } };
    },
    azzeraPicco() { msFisicaMax = 0; },
    ferma(v = true) { fermo = v; if (!v) ultimoT = performance.now(); },
    avanza, passa,
    // prende la banconota sotto (x, y) (px dall'angolo in alto a sinistra della tela); -1 se non c'è
    prendi(x, y, largo = 1) { const i = scegli(x, y, largo); if (i >= 0) { prendi(i, x, y, 'prova'); ultimo = { x, y, t: orologio }; storia.length = 0; campione(x, y, orologio); coda.length = 0; } return i; },
    muovi(x, y, ms = 150) {   // trascina la banconota presa fino a (x, y) in ms
      if (!presa) return Promise.resolve();
      const x0 = ultimo?.x ?? x, y0 = ultimo?.y ?? y, passi = Math.max(2, Math.round(ms / 1000 * 60));
      if (fermo) { for (let s = 1; s <= passi; s++) { orologio += 1 / 60; const f = s / passi; campione(x0 + (x - x0) * f, y0 + (y - y0) * f, orologio); passo(1 / 60); } daDisegnare = true; disegna(); return Promise.resolve(); }
      return new Promise(res => { const a = performance.now(); const f = () => { const u = Math.min(1, (performance.now() - a) / ms); campione(x0 + (x - x0) * u, y0 + (y - y0) * u, performance.now() / 1000); if (u < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    },
    lascia() { lancia(); },
    async lancia(x, y, ms = 120) { await api.muovi(x, y, ms); lancia(); },
    presa: () => presa?.i ?? -1,
    schermo(i) { proietta(); return [SX[i], SY[i]]; },
    cima() { _v.set(0, monte.H, 0).project(camera); return [(_v.x * .5 + .5) * L.w, (1 - (_v.y * .5 + .5)) * L.h]; },
    tutta() { mucchio.tuttaFatta(); daDisegnare = true; disegna(); },
    // camere speciali per i fogli di verifica
    vista(nome, arg) {
      vista.speciale = nome;
      if (!nome) { camera.setViewOffset(L.w, L.h, 0, L.offY, L.w, L.h); camera.updateProjectionMatrix(); posizionaCamera(); }
      else if (nome === 'banconota') {   // primo piano di una banconota ferma in cima al fronte
        let best = -1, bz = -1e9;
        for (let i = 0; i < n; i++) if (S[i] === RIPOSO && P[i * 3 + 1] > monte.H * .3) { const s = P[i * 3 + 2] + P[i * 3 + 1] * .6 - Math.abs(P[i * 3]) * 1.5; if (s > bz) { bz = s; best = i; } }
        const i = arg ?? best, c = _v2.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        const q = i * 4, qx = Q[q], qy = Q[q + 1], qz = Q[q + 2], qw = Q[q + 3], nn = _v.set(2 * (qx * qy - qw * qz), 1 - 2 * (qx * qx + qz * qz), 2 * (qy * qz + qw * qx));
        if (nn.y < 0) nn.negate();
        camera.clearViewOffset(); camera.updateProjectionMatrix();
        camera.position.copy(c).addScaledVector(nn, 1.45).add(_pt.set(0, .25, .35)); camera.lookAt(c); camera.updateMatrixWorld();
        return i;
      }
      daDisegnare = true; disegna();
    },
    disegna() { daDisegnare = true; disegna(); },
    sospendi() { cancelAnimationFrame(raf); },
    libera() { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); renderer.dispose(); geo.dispose(); mat.dispose(); matOmbra.dispose(); tex.dispose(); rtStudio.dispose(); tela.remove(); },
  };
  return api;
}
