// Gelateria · il laboratorio: il cono da solo (con la fascetta e il logo) e il biscotto a cialda di fianco, che girano piano
// su se stessi. Si monta quando la sezione si avvicina; si ferma quando esce dallo schermo. Il biscotto è la foto vera
// (img/biscotto.webp) su un disco smerlato col contorno della foto (js/biscotto-bordo.js), con lo spessore e il bordo cotto.
import * as THREE from 'three';
import { studio } from './studio.js';
import { creaOcclusione } from './occlusione.js';
import { creaCono, CONO } from './cialda.js';
import { BORDO } from './biscotto-bordo.js';

async function creaBiscotto(renderer) {
  const tex = await new THREE.TextureLoader().loadAsync('img/biscotto.webp');
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const Rc = 1.15, forma = new THREE.Shape();
  BORDO.forEach((r, i) => { const a = i / BORDO.length * Math.PI * 2, x = Math.cos(a) * r * Rc, y = Math.sin(a) * r * Rc; i ? forma.lineTo(x, y) : forma.moveTo(x, y); });
  forma.closePath();
  const g = new THREE.ExtrudeGeometry(forma, { depth: .07, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 2, curveSegments: 1 });
  g.translate(0, 0, -.035);
  // uv dalla posizione: sopra e sotto la foto; sui fianchi il bordo cotto della foto
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, .5 + .5 * p.getX(i) / Rc, .5 + .5 * p.getY(i) / Rc);
  const mat = new THREE.MeshPhysicalMaterial({ map: tex, bumpMap: tex, bumpScale: 2.2, roughness: .7, specularIntensity: .45, sheen: .15, sheenRoughness: .6, sheenColor: new THREE.Color('#ffd49a'), color: new THREE.Color('#f3dcc4') });
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true;
  return m;
}

export async function monta(host, { telefono = false, ridotto = false, logo, marchio } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  const pausa = () => new Promise(r => requestAnimationFrame(() => r()));   // il lavoro si spezza su più fotogrammi: niente scatto
  const scena = new THREE.Scene(); scena.environment = studio(renderer).texture; scena.environmentIntensity = 1.0;
  await pausa();
  const camera = new THREE.PerspectiveCamera(24, 1, .1, 60);
  const sole = new THREE.DirectionalLight('#fff0dc', 1.35); sole.position.set(-3, 7, 9); sole.castShadow = true;
  sole.shadow.mapSize.set(1024, 1024); Object.assign(sole.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4 }); sole.shadow.bias = -.0005; sole.shadow.normalBias = .02; sole.shadow.intensity = .7;
  scena.add(sole);
  const occl = creaOcclusione();
  const cono = await creaCono(renderer, { telefono, occl, logoUrl: logo, marchio });
  await pausa();
  const perno = new THREE.Group(); perno.add(cono.gruppo); cono.gruppo.position.y = -CONO.H / 2; scena.add(perno);
  perno.position.set(-.95, 0, 0);
  const biscotto = await creaBiscotto(renderer);
  await pausa();
  const pB = new THREE.Group(); pB.add(biscotto); scena.add(pB);
  pB.position.set(1.35, -.55, .2); biscotto.rotation.set(0, 0, .1);
  // ombre morbide disegnate sotto
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(60,40,25,.4)'); gr.addColorStop(.4, 'rgba(60,40,25,.16)'); gr.addColorStop(1, 'rgba(60,40,25,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tO = new THREE.CanvasTexture(c);
  const ombra = (x, z, sx, sz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: tO, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(x, -2.55, z); scena.add(m); };
  ombra(-.95, 0, 1.6, 1.4); ombra(1.35, .2, 2.6, 1);

  let W = 1, H = 1;
  function misura() {
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    renderer.setSize(W, H, false); camera.aspect = W / H;
    const fov = THREE.MathUtils.degToRad(camera.fov), alto = 5.1, largo = 4.9;
    const d = Math.max(alto / 2 / Math.tan(fov / 2), largo / 2 / Math.tan(fov / 2) / camera.aspect);
    camera.position.set(0, d * Math.sin(.12), d * Math.cos(.12)); camera.lookAt(0, -.2, 0); camera.updateProjectionMatrix();
  }
  misura(); new ResizeObserver(misura).observe(host);
  // shader compilati in parallelo (senza bloccare la pagina), poi un primo disegno
  try { await renderer.compileAsync(scena, camera); } catch (e) { /* senza compilazione parallela: si compila al primo disegno */ }
  await pausa();
  renderer.render(scena, camera);
  // ————— interazione: sul computer il cono e il biscotto seguono il cursore (si voltano e si inclinano verso di lui);
  // al clic fanno un giro completo. Sul telefono si girano col dito (trascinamento orizzontale) e al tocco fanno il giro;
  // lo scroll verticale della pagina resta libero (touch-action: pan-y).
  const el = renderer.domElement;
  Object.assign(el.style, { touchAction: 'pan-y', cursor: 'grab' });
  const oggetti = [
    { g: perno, yaw: -.4, vel: .45, off: 0, tx: 0, tz: 0, v: 0, giro: null },
    { g: pB, yaw: .6, vel: -.6, off: 0, tx: 0, tz: 0, v: 0, giro: null },
  ];
  const _p = new THREE.Vector3();
  const schermo = o => { o.g.getWorldPosition(_p); _p.project(camera); return [_p.x, _p.y]; };
  const vicino = (x, y) => { let m = null, dm = 1e9; for (const o of oggetti) { const [sx, sy] = schermo(o), d = Math.hypot(sx - x, (sy - y) * .6); if (d < dm) { dm = d; m = o; } } return m; };
  const ndc = e => { const r = el.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1)]; };
  let cursore = null, presa = null, x0 = 0, xUlt = 0, tUlt = 0, mosso = 0;
  el.addEventListener('pointermove', e => {
    const q = ndc(e);
    if (e.pointerType === 'mouse') cursore = q;
    if (!presa) return;
    const dx = e.clientX - xUlt, now = performance.now();
    presa.yaw += dx * .012; presa.v = dx * .012 / Math.max(.008, (now - tUlt) / 1000);
    xUlt = e.clientX; tUlt = now; mosso += Math.abs(dx);
  });
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') cursore = null; });
  el.addEventListener('pointerdown', e => {
    const [x, y] = ndc(e); presa = vicino(x, y); presa.v = 0; presa.giro = null;
    x0 = xUlt = e.clientX; tUlt = performance.now(); mosso = 0;
    el.style.cursor = 'grabbing';
    if (e.pointerType === 'mouse') el.setPointerCapture?.(e.pointerId);
  });
  const lascia = e => {
    if (!presa) return;
    // tocco o clic senza trascinare: un giro completo
    if (e.type === 'pointerup' && mosso < 6 && !ridotto) { presa.giro = { t0: performance.now(), da: presa.yaw }; presa.v = 0; }
    presa = null; el.style.cursor = 'grab';
  };
  el.addEventListener('pointerup', lascia); el.addEventListener('pointercancel', lascia);
  // ganci per le verifiche
  host.__lab = { oggetti, gira: i => { const o = oggetti[i]; o.giro = { t0: performance.now(), da: o.yaw }; } };

  let visibile = true, ultimo = performance.now(), a = 0;
  new IntersectionObserver(es => { visibile = es[0].isIntersecting; ultimo = performance.now(); }).observe(host);
  const molla = (x, y, k, dt) => x + (y - x) * (1 - Math.exp(-k * dt));
  renderer.setAnimationLoop(t => {
    if (!visibile) return;
    const dt = Math.min(.05, (t - ultimo) / 1000); ultimo = t;
    if (!ridotto) a += dt;
    for (const o of oggetti) {
      const [sx, sy] = schermo(o);
      // seguire il cursore: si volta verso di lui (fino a ~40°) e si inclina un poco
      const segui = cursore && !presa;
      const dx = segui ? Math.max(-1.2, Math.min(1.2, cursore[0] - sx)) : 0, dy = segui ? Math.max(-1, Math.min(1, cursore[1] - sy)) : 0;
      o.off = molla(o.off, dx * .75, 5, dt); o.tx = molla(o.tx, -dy * .28, 5, dt); o.tz = molla(o.tz, -dx * .12, 5, dt);
      // da solo gira piano (più piano se lo guardi col cursore); col dito o col mouse gira quanto lo trascini, con l'inerzia
      if (o !== presa && !o.giro) {
        o.v = molla(o.v, 0, 2.2, dt);
        if (!ridotto) o.yaw += (o.vel * (segui ? .15 : 1) + o.v) * dt;
      }
      let yaw = o.yaw;
      if (o.giro) {
        const k = Math.min(1, (performance.now() - o.giro.t0) / 1150), e = 1 - Math.pow(1 - k, 3);
        yaw = o.giro.da + e * Math.PI * 2 * Math.sign(o.vel || 1);
        if (k >= 1) { o.yaw = yaw; o.giro = null; }
      }
      o.g.rotation.set(o.tx, yaw + o.off, o.tz);
    }
    perno.position.y = ridotto ? 0 : Math.sin(a * 1.1) * .05;
    pB.position.y = -.55 + (ridotto ? 0 : Math.sin(a * 1.1 + 1.6) * .06);
    renderer.render(scena, camera);
  });
  return { renderer };
}
