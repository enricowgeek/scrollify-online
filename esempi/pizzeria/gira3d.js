// "Adesso girala": la Margherita in 3D (3d/pizza.sog), da ruotare trascinando col dito o col mouse.
// Quando nessuno la tocca gira piano da sola; si disegna solo mentre è sullo schermo.
import * as THREE from 'three';
import { SparkRenderer, SplatMesh } from '@sparkjsdev/spark';

export function monta(host) {
  const mobile = matchMedia('(pointer:coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
  scene.add(new SparkRenderer({ renderer }));
  const pizza = new SplatMesh({ url: '3d/pizza.sog' });
  pizza.quaternion.set(1, 0, 0, 0);            // il file nato da una foto esce con la y verso il basso
  pizza.position.set(.006, -.004, .011);       // la pizza al centro della scena
  scene.add(pizza);
  pizza.initialized.then(() => host.classList.add('pronta')).catch(() => {});

  // giro (yaw) e inclinazione (pitch): il trascinamento li sposta, poi rallentano piano
  let yaw = 0, pitch = .72, vy = .0035, vp = 0, tocco = null, fermo = 0;
  host.addEventListener('pointerdown', e => { tocco = { x: e.clientX, y: e.clientY }; host.setPointerCapture(e.pointerId); vy = vp = 0; });
  host.addEventListener('pointermove', e => {
    if (!tocco) return;
    const dx = e.clientX - tocco.x, dy = e.clientY - tocco.y; tocco = { x: e.clientX, y: e.clientY };
    vy = dx * .006; vp = -dy * .004; yaw += vy; pitch = Math.min(1.35, Math.max(.2, pitch + vp)); fermo = performance.now();
  });
  const lascia = () => { tocco = null; };
  host.addEventListener('pointerup', lascia); host.addEventListener('pointercancel', lascia);

  function misura() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  misura(); new ResizeObserver(misura).observe(host);

  let visibile = false;
  new IntersectionObserver(es => { visibile = es[0].isIntersecting; }).observe(host);
  (function giro() {
    requestAnimationFrame(giro);
    if (!visibile) return;
    if (!tocco) {
      // dopo un trascinamento continua per inerzia, poi torna al giro lento
      vy *= .95; vp *= .9;
      const lento = performance.now() - fermo > 1500 ? .0035 : 0;
      yaw += Math.abs(vy) > lento ? vy : lento; pitch = Math.min(1.35, Math.max(.2, pitch + vp));
    }
    const r = 1.75;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * r, Math.sin(pitch) * r, Math.cos(yaw) * Math.cos(pitch) * r);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  })();
}
