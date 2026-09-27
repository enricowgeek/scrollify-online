// Rimbalzo 3D · la scena: un renderer, la palestra, il canestro, la palla, la retina, la camera in soggettiva.
// monta(host, opzioni) → { vai(p), stato(), sospendi(), libera(), SEZ }
//   p (0…1) = avanzamento nella sezione a scroll. p → s (tempo virtuale in secondi) con una curva monotona (niente scalini):
//   0–0,06 apertura (la palla in mano, in basso: si vede solo la cima) · 0,06–0,30 due palleggi (la camera guarda giù e
//   ondeggia appena a ogni spinta) · 0,30–0,40 raccolta, lo sguardo sale al canestro, il gesto · 0,40–0,585 il volo con il
//   backspin (la camera si avvicina e sale) · 0,585 il tabellone (vibra) · 0,585–0,70 dentro il ferro e giù per la retina
//   (rallentatore) · 0,70–0,93 la caduta, i rimbalzi che tornano verso chi ha tirato, la camera torna al suo posto ·
//   0,93–1 finale: la palla ferma sul parquet, il canestro in alto; col cursore si gira appena lo sguardo.
// Tutto è funzione di s (fisica calcolata all'avvio in fisica.js): tornando su si riavvolge senza stati. Solo la vibrazione del
// tabellone è a tempo vero (parte una volta per passaggio, scendendo).
// Verifiche: window.__pronto, window.__basket(p, { vib, tempo }) (fissa la sezione; null torna allo scroll), window.__info(),
// window.__controlli() (distanze minime palla–ferro/tabellone/retina lungo tutta la linea del tempo).
import * as THREE from 'three';
import { creaTraiettoria, creaRete, CAN, R_PALLA, OCCHI, T } from './fisica.js';
import { creaPalestra, SALA, texOmbra } from './palestra.js';
import { creaCanestro } from './canestro.js';
import { creaPallone } from './pallone.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = { io: t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2, sin: t => .5 - .5 * Math.cos(Math.PI * t), out: t => 1 - (1 - t) ** 3 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// curva monotona per punti (Fritsch–Carlson): p → s senza salti di velocità
function monotona(xs, ys) {
  const n = xs.length, d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  if (d[0] === 0) m[0] = 0;
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export async function monta(host, O = {}) {
  const ridotto = O.ridotto ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const liscio = O.liscio ?? .12;
  const mobile = matchMedia('(pointer:coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: true, preserveDrawingBuffer: !!O.conserva });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.75 : 2));
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xb9a78c, 1);
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' });
  const t0 = performance.now();
  const loader = new THREE.TextureLoader();
  const carica = url => loader.loadAsync(new URL('../' + url, import.meta.url).href);

  // ——— fisica (prima di tutto: il resto dipende dai suoi tempi) ———
  const traiettoria = creaTraiettoria();
  const rete = creaRete(traiettoria);
  const ev = traiettoria.eventi;
  const sTab = ev.tabellone.s, sFerro = ev.ferro.s, sFuori = ev.fuori.s, sTerra = ev.urti[0].s;
  const sFermo = traiettoria.FINE - 0.6;
  // la sezione: punti chiave p → s
  const SEZ = { apertura: .06, palleggi: .30, raccolta: .37, rilascio: .40, tabellone: .585, fuori: .70, terra: .75, fermo: .93 };
  const pS = monotona([0, SEZ.apertura, SEZ.palleggi, SEZ.raccolta, SEZ.rilascio, SEZ.tabellone, SEZ.fuori, SEZ.terra, SEZ.fermo, 1],
    [0, 0, T.palleggiA, T.raccoltaA, T.rilascio, sTab, sFuori, sTerra + 0.06, sFermo, sFermo + 0.25]);
  const tFisica = performance.now() - t0;

  // ——— scena, palestra, luce per i materiali fisici (cubo della palestra) ———
  const scene = new THREE.Scene();
  const palestra = await creaPalestra({ renderer, carica });
  scene.add(palestra.gruppo);
  const cuboRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cuboCam = new THREE.CubeCamera(0.05, 120, cuboRT); cuboCam.position.set(0, 3.0, 3.2); scene.add(cuboCam);
  cuboCam.update(renderer, scene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromCubemap(cuboRT.texture); pmrem.dispose();
  const env = envRT.texture;
  const grana = await carica('img/grana.webp');
  grana.wrapS = grana.wrapT = THREE.RepeatWrapping; grana.colorSpace = THREE.NoColorSpace; grana.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ——— canestro, palla, riflessi, ombra ———
  // una luce dall'alto (i pannelli del soffitto, un poco davanti): dà forma alla palla e al ferro, oltre al cubo della palestra
  const sole = new THREE.DirectionalLight(0xfff3e4, 1.5); sole.position.set(1.2, 9, 5); sole.target.position.set(0, 0, 2); scene.add(sole, sole.target);
  const can = creaCanestro({ env, envCubo: cuboRT.texture });
  scene.add(can.gruppo);
  const palla = creaPallone({ env, grana });
  scene.add(palla.mesh);
  // la palla riflessa nel vetro: dietro il vetro, specchiata sul suo piano, al 14%, solo dentro la sagoma del vetro
  const pallaVetro = creaPallone({ env, grana, dettaglio: 0.6, opacita: 0.14, stencil: true });
  pallaVetro.mesh.renderOrder = 11; scene.add(pallaVetro.mesh);
  const Mvetro = new THREE.Matrix4().makeTranslation(0, 0, 2 * CAN.zVetro).multiply(new THREE.Matrix4().makeScale(1, 1, -1));
  // copie nel mondo specchiato sotto il parquet: canestro (senza vetro), palla, retina. Matrici aggiornate a ogni fotogramma
  const Mpav = new THREE.Matrix4().makeScale(1, -1, 1);
  const copie = [];
  const copia = (o) => {
    let c;
    if (o.isInstancedMesh) { c = new THREE.InstancedMesh(o.geometry, o.material, o.count); c.instanceMatrix = o.instanceMatrix; c.frustumCulled = false; }
    else c = new THREE.Mesh(o.geometry, o.material);
    c.matrixAutoUpdate = false; c.matrixWorldAutoUpdate = false; c.renderOrder = o.renderOrder; scene.add(c); copie.push([c, o]);
  };
  can.gruppo.updateMatrixWorld(true);
  can.gruppo.traverse(o => { if (o.isMesh && o !== can.vetro && o !== can.sagoma) copia(o); });
  copia(palla.mesh);
  const ombra = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: texOmbra(), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  ombra.renderOrder = 2; scene.add(ombra);

  // ——— camera ———
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 90);
  let W_ = 1, H_ = 1, ritratto = false;
  function misura() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight; W_ = w; H_ = h;
    renderer.setSize(w, h, false); camera.aspect = w / h; ritratto = w / h < 0.8;
  }
  misura(); new ResizeObserver(misura).observe(host);
  // campo verticale: quello scelto sul largo; se lo schermo è stretto si allarga finché in orizzontale restano almeno ±20°
  const fovPer = (fov) => { const hMin = THREE.MathUtils.degToRad(ritratto ? 20.5 : 18); const v = 2 * Math.atan(Math.tan(hMin) / camera.aspect); return Math.max(fov, THREE.MathUtils.radToDeg(v)); };

  // la palla "lisciata" (media su ±0,1 s): la camera la segue senza gli strappi degli urti
  const _p = V(0, 0, 0), _q = new THREE.Quaternion();
  const pesi = [1, 2, 3, 4, 5, 4, 3, 2, 1], sommaPesi = 25;
  function pallaLiscia(s, out) { out.set(0, 0, 0); for (let k = 0; k < 9; k++) { traiettoria.posa(s + (k - 4) * 0.025, _p); out.addScaledVector(_p, pesi[k] / sommaPesi); } return out; }
  const A = CAN.anello;
  const RING = V(A.x, A.y, A.z);
  const _lb = V(0, 0, 0);
  // pose della camera: { C, L, fov } in funzione di s (alcune seguono la palla)
  const C0 = V(OCCHI.x, OCCHI.y, OCCHI.z);
  const POSE = {
    pov: s => ({ C: C0.clone(), L: V(0.03, ritratto ? 2.4 : 1.98, 1.6), fov: 55 }),
    palleggio: s => {
      // ondeggio a ogni spinta: la testa scende un poco mentre la mano spinge
      const tau = ((s - T.palleggiDa) / T.palleggio) % 1, k = s > T.palleggiDa && s < T.palleggiA ? Math.sin(Math.PI * Math.min(1, tau / 0.55)) ** 2 : 0;
      const b = ridotto ? 0 : k;
      return { C: V(0.03, 1.63 - 0.016 * b, 6.06 - 0.01 * b), L: V(0.19, -0.05 - 0.06 * b, 4.5), fov: 58 };
    },
    mira: s => ({ C: C0.clone(), L: V(0.02, ritratto ? 2.45 : 2.1, 1.6), fov: 55 }),
    volo: s => {
      const u = E.io(seg(s, T.rilascio - 0.1, sTab)), b = pallaLiscia(s, _lb);
      const C = C0.clone().lerp(V(0.1, 2.75, 3.95), u);
      const L = b.clone().lerp(V(0.0, 3.2, 1.45), 0.4);
      // sul telefono palla e tabellone salgono nel quadro: in basso resta posto per la frase
      if (ritratto) L.y -= 0.55 * Math.sin(Math.PI * seg(s, T.rilascio, sTab + 0.1));
      return { C, L, fov: 55 - 5 * u };
    },
    tabellone: s => { const b = pallaLiscia(s, _lb); return { C: V(0.12, 2.95, 3.75), L: b.clone().lerp(V(0.0, 3.1, 1.5), 0.6), fov: 49 }; },
    rete: s => ({ C: V(0.16, 3.2, 3.35), L: V(0.0, 2.82, 1.62), fov: 46 }),
    // la caduta: la camera si stacca un poco dalla retina e segue la palla verso il basso (la retina resta in alto nel quadro)
    caduta: s => {
      // la camera scende con la palla (una gru): a terra la palla in basso, la retina che oscilla in alto
      const b = pallaLiscia(s, _lb), u = E.io(seg(s, sFuori, sTerra + 0.12));
      const C = V(0.16, 2.75, 3.95).lerp(V(0.15, 1.95, 4.45), u);
      return { C, L: V(b.x * 0.5, 0.5 * b.y + 0.5 * 2.55, b.z * 0.5 + 0.5 * 1.62), fov: 52 + 6 * u };
    },
    // i rimbalzi: la camera torna indietro al suo posto e scende; guarda la palla (il rimbalzo smorzato) e il canestro sopra
    rimbalzi: s => {
      const b = pallaLiscia(s, _lb), u = E.io(seg(s, sp(0.76), sp(0.91)));
      const C = V(0.15, 1.95, 4.9).lerp(V(0.2, 1.68, 6.7), u);
      const L = V(b.x * 0.5, Math.min(b.y, 1.2) * 0.3 + 1.45, b.z * 0.5 + 1.6 * 0.5);
      return { C, L, fov: 55 + 5 * u };
    },
    // finale: un passo indietro dalla linea; il canestro in alto e la palla ferma sul parquet
    finale: s => { traiettoria.posa(sFermo, _lb); return { C: V(0.2, 1.66, 6.7), L: V(_lb.x * 0.5, ritratto ? 1.2 : 1.45, 2.2), fov: 60 }; },
  };
  // sequenza: fra due chiavi si passa da una posa all'altra con una curva morbida (entrambe calcolate allo stesso s)
  // (dopo la retina il tempo virtuale corre veloce rispetto allo scroll: le chiavi si danno in p e si convertono in s)
  const sp = x => pS(x);
  const SEQ = [
    [0, 'pov'], [0.42, 'palleggio'], [1.3, 'palleggio'], [1.9, 'mira'], [1.98, 'mira'], [2.3, 'volo'], [sTab - 0.06, 'volo'],
    [sTab + 0.03, 'tabellone'], [sFerro + 0.03, 'rete'], [sp(0.69), 'rete'], [sp(0.725), 'caduta'], [sp(0.745), 'caduta'], [sp(0.775), 'rimbalzi'], [sp(0.895), 'rimbalzi'], [sp(0.93), 'finale'],
  ];
  const _C = V(0, 0, 0);
  function inquadra(s) {
    let i = 0; while (i < SEQ.length - 1 && s > SEQ[i + 1][0]) i++;
    const a = POSE[SEQ[i][1]](s);
    if (i === SEQ.length - 1 || s <= SEQ[0][0]) return a;
    const b = POSE[SEQ[i + 1][1]](s), k = E.io(seg(s, SEQ[i][0], SEQ[i + 1][0]));
    return { C: a.C.lerp(b.C, k), L: a.L.lerp(b.L, k), fov: a.fov + (b.fov - a.fov) * k };
  }
  // sul telefono (verticale): più lontano nel ferro e nel tabellone (il vetro sta in larghezza), la palla in mano un poco più su
  function ritocca(c, s) {
    if (!ritratto) return c;
    const k = Math.sin(Math.PI * seg(s, T.rilascio + 0.4, sFuori + 0.6)) ** 2;
    c.C.add(V(0.05, 0.05, 0.9).multiplyScalar(k));
    return c;
  }

  // ——— stato e disegno ———
  let p = 0, cur = 0, pFisso = null, tempoFisso = null, visibile = true, sospeso = false, ultimo = null;
  let vibT = null, vibFisso = null, sPrima = 0, fotogrammi = 0, vista = null;
  let mx = 0, my = 0, gx = 0, gy = 0, tiraX = null, tira = 0;
  new IntersectionObserver(es => { visibile = es[0].isIntersecting && es[0].intersectionRatio > .002; }, { threshold: [0, .002, .01, .05] }).observe(host);
  // sguardo col cursore (solo sul finale) e trascinamento orizzontale col dito
  const finale = () => (pFisso ?? cur) > SEZ.fermo - 0.01;
  host.addEventListener('pointermove', e => {
    const r = host.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width) * 2 - 1; my = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (tiraX !== null) { tira = clamp(tira + (e.clientX - tiraX) / r.width * 1.6, -1, 1); tiraX = e.clientX; }
  });
  host.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && finale()) { tiraX = e.clientX; } });
  const lascia = () => { tiraX = null; };
  host.addEventListener('pointerup', lascia); host.addEventListener('pointercancel', lascia);
  host.addEventListener('pointerleave', () => { mx = my = 0; });

  const X = new Float32Array(rete.n * 3), ondeggio = new Float32Array(rete.n);
  for (let i = 0; i < rete.n; i++) ondeggio[i] = rete.fissi[i] ? 0 : Math.min(1, (A.y - rete.riposo[i * 3 + 1]) / 0.45);
  const tInizio = performance.now();
  const _M = new THREE.Matrix4(), _S = new THREE.Matrix4(), _R = new THREE.Matrix4(), _look = new THREE.Matrix4();
  const _dir = V(0, 0, 0), _su = V(0, 1, 0);
  function disegna(ora) {
    fotogrammi++;
    const tempo = tempoFisso ?? (ora - tInizio);
    // ripresa dopo una pausa (tela fuori schermo, scheda nascosta): si riparte da dove si è, senza rincorrere la linea del tempo
    if (pFisso === null && (ultimo === null || ora - ultimo > 250) && Math.abs(p - cur) > .005) cur = p;
    ultimo = ora;
    cur += (p - cur) * (pFisso !== null ? 1 : liscio);
    if (Math.abs(p - cur) < 1e-5) cur = p;
    const pp = pFisso ?? cur, s = pS(pp);
    // vibrazione del tabellone: parte quando si passa l'urto scendendo (una volta per passaggio)
    if (pFisso === null) {
      if (s >= sTab && sPrima < sTab && s - sPrima < 0.5) { vibT = ora; window.__vibrazioni = (window.__vibrazioni ?? 0) + 1; }
      if (s < sTab - 0.2) vibT = null;
    }
    sPrima = s;
    const msVib = pFisso !== null ? vibFisso : (vibT !== null ? ora - vibT : null);
    can.vibra(msVib, ridotto);
    // palla
    const sq = traiettoria.posa(s, _p, _q);
    // in mano all'apertura: respira con chi la tiene
    const respiro = ridotto ? 0 : (1 - seg(s, 0, 0.3)) * Math.sin(tempo / 900) * 0.006;
    _p.y += respiro;
    const sx = 1 + sq * 0.55, sy = 1 - sq;
    _M.makeTranslation(_p.x, _p.y, _p.z).multiply(_S.makeScale(sx, sy, sx)).multiply(_R.makeRotationFromQuaternion(_q));
    palla.mesh.matrix.copy(_M); palla.mesh.matrixWorldNeedsUpdate = true;
    pallaVetro.mesh.matrix.multiplyMatrices(Mvetro, _M); pallaVetro.mesh.matrixWorldNeedsUpdate = true;
    // ombra di contatto
    const h = Math.max(0, _p.y - R_PALLA * sy);
    ombra.position.set(_p.x, 0.003, _p.z); ombra.scale.setScalar(0.25 + 0.55 * h); ombra.material.opacity = Math.min(1, 1.25 * Math.exp(-h / 0.7));
    // retina: simulazione registrata + un respiro leggerissimo (aria)
    rete.stato(s, X);
    if (!ridotto) for (let i = 0; i < rete.n; i++) { const k = ondeggio[i]; if (!k) continue; X[i * 3] += 0.0012 * k * Math.sin(tempo / 1300 + i * 0.37); X[i * 3 + 2] += 0.0012 * k * Math.cos(tempo / 1700 + i * 0.21); }
    can.aggiornaRete(X, rete.tratti, rete.nNodi);
    // camera (o una vista fissa per le verifiche)
    const c = vista ? { C: V(...vista.C), L: V(...vista.L), fov: vista.fov ?? 40 } : ritocca(inquadra(s), s);
    if (!ridotto && s < 0.4) { const k = 1 - seg(s, 0, 0.4); c.C.y += Math.sin(tempo / 900) * 0.004 * k; c.L.x += Math.sin(tempo / 1400) * 0.02 * k; }
    // finale: lo sguardo segue un poco il cursore (o il dito)
    const kF = ridotto || pFisso !== null ? 0 : E.sin(seg(pp, SEZ.fermo - 0.01, SEZ.fermo + 0.03));
    if (tiraX === null) tira *= 0.94;
    gx += ((mx + tira) * kF - gx) * 0.06; gy += (my * kF - gy) * 0.06;
    camera.position.copy(c.C);
    _dir.subVectors(c.L, c.C);
    const dist = _dir.length();
    _dir.normalize();
    const yaw = -gx * 0.07, pitch = -gy * 0.04;
    _dir.applyAxisAngle(_su, yaw); const destra = V(0, 0, 0).crossVectors(_dir, _su).normalize(); _dir.applyAxisAngle(destra, pitch);
    camera.lookAt(_C.copy(c.C).addScaledVector(_dir, dist));
    const fv = vista ? c.fov : fovPer(c.fov);
    if (Math.abs(camera.fov - fv) > 1e-3) { camera.fov = fv; }
    camera.near = 0.05; camera.updateProjectionMatrix();
    // copie specchiate
    scene.updateMatrixWorld();
    for (const [cc, o] of copie) { cc.matrixWorld.multiplyMatrices(Mpav, o.matrixWorld); }
    renderer.render(scene, camera);
    if (!window.__pronto) { window.__pronto = true; host.classList.add('pronto'); }
  }
  // shader compilati prima del primo fotogramma
  try { misura(); camera.position.copy(C0); camera.lookAt(0, 2, 1.6); await renderer.compileAsync(scene, camera); } catch (e) { /* si compila al primo uso */ }
  renderer.setAnimationLoop(ora => { if ((visibile && !sospeso && !document.hidden) || pFisso !== null) disegna(ora); });

  // ——— per le verifiche ———
  window.__basket = (x, o = {}) => {
    pFisso = x === null || x === undefined ? null : x; vibFisso = o.vib ?? null; tempoFisso = pFisso === null ? null : (o.tempo ?? 0);
    cur = pFisso ?? cur; disegna(performance.now());
  };
  // vista fissa: { C: [x,y,z], L: [x,y,z], fov, nascondi: ['palla', 'testo'...] } (null: torna alla camera della sezione)
  window.__vista = v => { vista = v ?? null; palla.mesh.visible = !(v?.nascondi || []).includes('palla'); disegna(performance.now()); };
  // p della sezione per un tempo virtuale s (bisezione sulla curva monotona) e i tempi chiave
  window.__pDi = x => { let a = 0, b = 1; for (let i = 0; i < 40; i++) { const m = (a + b) / 2; if (pS(m) < x) a = m; else b = m; } return (a + b) / 2; };
  window.__tempi = () => ({ ...T, sTab, sFerro, sFuori, sTerra, sFermo, urti: ev.urti.map(u => u.s), SEZ });
  // dove stanno sullo schermo (px CSS) la palla (centro e raggio), il ferro (ellisse: centro, semiassi) e il tabellone (rettangolo)
  const _pr = V(0, 0, 0);
  const proietta = v => { _pr.copy(v).project(camera); return [(_pr.x + 1) / 2 * W_, (1 - _pr.y) / 2 * H_, _pr.z]; };
  window.__proietta = () => {
    const pb = V(0, 0, 0); traiettoria.posa(pS(pFisso ?? cur), pb);
    const c = proietta(pb), d = pb.distanceTo(camera.position), r = R_PALLA / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * H_ / 2;
    const bordo = [[-0.9, 2.9], [0.9, 2.9], [-0.9, 3.95], [0.9, 3.95]].map(([x, y]) => proietta(V(x, y, CAN.zVetro)));
    const anello = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; anello.push(proietta(V(A.x + A.R * Math.sin(a), A.y, A.z + A.R * Math.cos(a)))); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; anello.push(proietta(V(A.x + 0.15 * Math.sin(a), A.y - 0.43, A.z + 0.15 * Math.cos(a)))); }   // fondo della retina
    const box = pts => { const v = pts.filter(q => q[2] < 1); if (!v.length) return null; const xs = v.map(q => q[0]), ys = v.map(q => q[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
    return { palla: c[2] < 1 ? [c[0], c[1], r] : null, canestro: box(anello), tabellone: box(bordo), W: W_, H: H_ };
  };
  window.__info = () => {
    let tri = 0; scene.traverse(o => { if (o.isMesh && o.visible) tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); });
    return { fotogrammi, avvioMs: Math.round(performance.now() - t0), fisicaMs: Math.round(tFisica), triangoli: Math.round(tri), disegni: renderer.info.render.calls, triangoliDisegnati: renderer.info.render.triangles, pixelRatio: renderer.getPixelRatio(), ridotto, rete: rete.misure, tempi: { sTab, sFerro, sFuori, sTerra, sFermo }, fermo: (() => { const v = V(0, 0, 0); traiettoria.posa(sFermo, v); return v.toArray().map(x => +x.toFixed(3)); })() };
  };
  // distanze minime lungo tutta la linea del tempo (metri; negative = compenetrazione)
  window.__controlli = () => {
    const out = { ferro: 1e9, vetro: 1e9, retina: 1e9, pavimento: 1e9, dove: {} };
    const pp = V(0, 0, 0), Y = new Float32Array(rete.n * 3);
    for (let s = 0; s < traiettoria.FINE; s += 1 / 480) {
      const sq = traiettoria.posa(s, pp); const ry = R_PALLA * (1 - sq);
      // ferro: distanza dal cerchio del tubo
      const hx = pp.x - A.x, hz = pp.z - A.z, hr = Math.hypot(hx, hz), dF = Math.hypot(hr - A.R, pp.y - A.y) - A.tubo - R_PALLA;
      if (dF < out.ferro) { out.ferro = dF; out.dove.ferro = +s.toFixed(3); }
      // vetro (dentro la lastra, davanti)
      if (Math.abs(pp.x) < CAN.largh / 2 && pp.y > CAN.yBasso - R_PALLA && pp.y < CAN.yBasso + CAN.alt + R_PALLA && pp.z > CAN.zVetro - 0.2) {
        const dV = pp.z - R_PALLA - CAN.zVetro; if (dV < out.vetro) { out.vetro = dV; out.dove.vetro = +s.toFixed(3); }
      }
      const dP = pp.y - ry; if (dP < out.pavimento) { out.pavimento = dP; out.dove.pavimento = +s.toFixed(3); }
      if (s > rete.s0 && s < rete.s1) {
        rete.stato(s, Y);
        for (const [a, b] of rete.tratti) {
          const ax = Y[a * 3], ay = Y[a * 3 + 1], az = Y[a * 3 + 2], ex = Y[b * 3] - ax, ey = Y[b * 3 + 1] - ay, ez = Y[b * 3 + 2] - az;
          let t = ((pp.x - ax) * ex + (pp.y - ay) * ey + (pp.z - az) * ez) / (ex * ex + ey * ey + ez * ez || 1); t = clamp(t);
          const d = Math.hypot(ax + ex * t - pp.x, ay + ey * t - pp.y, az + ez * t - pp.z) - R_PALLA - 0.0036 * 0.5;
          if (d < out.retina) { out.retina = d; out.dove.retina = +s.toFixed(3); }
        }
      }
    }
    for (const k of ['ferro', 'vetro', 'retina', 'pavimento']) out[k] = +(out[k] * 1000).toFixed(1);   // millimetri
    return out;
  };
  return {
    SEZ, vai(x) { p = clamp(x); }, sospendi(v = true) { sospeso = !!v; },
    stato: () => ({ p, cur: +cur.toFixed(4), s: +pS(pFisso ?? cur).toFixed(3), sguardo: [+gx.toFixed(3), +gy.toFixed(3)], cursore: [+mx.toFixed(3), +my.toFixed(3)] }),
    renderer, camera, scene, traiettoria, rete,
    libera() { renderer.setAnimationLoop(null); scene.traverse(o => { o.geometry?.dispose(); }); renderer.dispose(); renderer.domElement.remove(); },
  };
}
