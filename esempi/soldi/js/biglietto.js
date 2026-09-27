// Soldi · una banconota sola, grande, che gira piano su sé stessa. Si trascina per girarla (con inerzia),
// poi torna a girare da sola; il cursore la inclina appena. Stessa banconota disegnata in codice della montagna.
import * as THREE from 'three';
import { disegnaAtlante, FW, PAD, AW, RAPPORTO } from './banconota.js';
import { studio } from './studio.js';

export async function monta(host, { ridotto = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y', cursor: 'grab' });

  const scena = new THREE.Scene();
  const env = studio(renderer); scena.environment = env.texture;
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 50);

  // atlante fronte | retro, disegnato più grande: qui la banconota si vede da vicino
  const atl = await disegnaAtlante(2);
  const tex = new THREE.CanvasTexture(atl);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // foglio lungo 2, con un arco leggero e la piega a metà (come le banconote della montagna)
  const L = 2, H = L * RAPPORTO, geo = new THREE.PlaneGeometry(L, H, 64, 8), pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / L; pos.setZ(i, .07 * Math.cos(x * Math.PI) - .035 * Math.abs(x) * 2); }
  geo.computeVertexNormals();
  // uv: il fronte prende la metà sinistra dell'atlante, il retro la destra specchiata (così da dietro si legge dritto)
  const uv = geo.attributes.uv, uvF = uv.clone(), uvB = uv.clone();
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i); uvF.setX(i, u * FW / AW); uvB.setX(i, (FW + PAD + (1 - u) * FW) / AW); }
  const gF = geo.clone(); gF.setAttribute('uv', uvF);
  const gB = geo.clone(); gB.setAttribute('uv', uvB);
  const carta = side => new THREE.MeshPhysicalMaterial({ map: tex, side, roughness: .58, metalness: 0, sheen: .35, sheenRoughness: .6, sheenColor: new THREE.Color('#e9f2d4'), clearcoat: .06, clearcoatRoughness: .5 });
  const banconota = new THREE.Group();
  banconota.add(new THREE.Mesh(gF, carta(THREE.FrontSide)), new THREE.Mesh(gB, carta(THREE.BackSide)));
  const incl = new THREE.Group(); incl.add(banconota); scena.add(incl);

  function misura() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // la banconota (lunga 2) riempie quasi tutta la larghezza (girando di lato si accorcia), senza uscire in altezza
    const fov = THREE.MathUtils.degToRad(camera.fov), perLargo = (L / .96) / camera.aspect / 2 / Math.tan(fov / 2), perAlto = (H * 1.55) / 2 / Math.tan(fov / 2);
    camera.position.set(0, 0, Math.max(perLargo, perAlto)); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  }
  misura(); new ResizeObserver(misura).observe(host);

  // trascinamento con inerzia; da sola gira piano (ferma con il movimento ridotto)
  const auto = ridotto ? 0 : .55;
  let ang = -.5, vel = auto, x0 = null, mx = 0, my = 0, tx = 0, ty = 0, ultimo = performance.now();
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { x0 = e.clientX; vel = 0; el.setPointerCapture?.(e.pointerId); el.style.cursor = 'grabbing'; });
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width * 2 - 1; my = (e.clientY - r.top) / r.height * 2 - 1;
    if (x0 === null) return; const d = (e.clientX - x0) * .011; ang += d; vel = d * 60; x0 = e.clientX;
  });
  const lascia = () => { x0 = null; el.style.cursor = 'grab'; };
  el.addEventListener('pointerup', lascia); el.addEventListener('pointercancel', lascia);
  el.addEventListener('pointerleave', () => { mx = my = 0; });

  let visibile = true;
  new IntersectionObserver(es => { visibile = es[0].isIntersecting; if (visibile) ultimo = performance.now(); }).observe(host);
  renderer.setAnimationLoop(t => {
    if (!visibile) return;
    const dt = Math.min(.05, (t - ultimo) / 1000); ultimo = t;
    if (x0 === null) { vel += (auto - vel) * Math.min(1, dt * 1.6); ang += vel * dt; }
    tx += (my * .22 - tx) * .06; ty += (mx * .18 - ty) * .06;
    banconota.rotation.y = ang;
    incl.rotation.x = .12 + tx + (ridotto ? 0 : Math.sin(t / 1600) * .03);
    incl.rotation.z = -.06 + ty * .4;
    incl.position.y = ridotto ? 0 : Math.sin(t / 1300) * .03;
    renderer.render(scena, camera);
  });
  return { renderer };
}
