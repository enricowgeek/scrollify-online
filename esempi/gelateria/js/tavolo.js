// Gelateria · il banco di marmo chiaro sotto il cono: marmo disegnato su canvas (nuvole calde + venature sottili), lucido
// e morbido, che sfuma nel fondo crema della pagina; più un'ombra di contatto morbida sotto la punta del cono.
import * as THREE from 'three';
import { casuale } from './rumore.js';
import { conOmbre, inietta } from './occlusione.js';

function marmo(S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rnd = casuale(77);
  g.fillStyle = '#f1e9de'; g.fillRect(0, 0, S, S);
  // nuvole calde (ripetute ai bordi: il tassello si ripete)
  const ripeti = (fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy); };
  for (let i = 0; i < 60; i++) {
    const x = rnd() * S, y = rnd() * S, r = S * (.08 + rnd() * .22), a = .035 + rnd() * .05;
    const tinta = rnd() < .5 ? '196,178,156' : '226,212,192';
    ripeti((dx, dy) => { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, `rgba(${tinta},${a})`); gr.addColorStop(1, `rgba(${tinta},0)`); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); });
  }
  // venature: passeggiate casuali, prima larghe e sfocate poi sottili
  const vena = (larg, alfa, col, sf) => {
    g.save(); g.filter = `blur(${sf}px)`; g.strokeStyle = `rgba(${col},${alfa})`; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let v = 0; v < 7; v++) {
      let x = rnd() * S, y = rnd() * S, ang = -.6 + rnd() * .5; const pts = [[x, y]];
      for (let k = 0; k < 90; k++) { ang += (rnd() - .5) * .5; x += Math.cos(ang) * S * .012; y += Math.sin(ang) * S * .012; pts.push([x, y]); }
      ripeti((dx, dy) => { g.lineWidth = larg * (.5 + rnd()); g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a + dx, b + dy) : g.moveTo(a + dx, b + dy)); g.stroke(); });
    }
    g.restore();
  };
  vena(S * .016, .06, '176,160,140', S * .008);
  vena(S * .0035, .12, '160,142,122', S * .002);
  vena(S * .0012, .1, '170,146,112', S * .0006);
  return c;
}

export function creaTavolo(renderer, { telefono = false, occl, quota = -.55 }) {
  const t = new THREE.CanvasTexture(marmo(telefono ? 512 : 1024));
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mat = new THREE.MeshPhysicalMaterial({ map: t, roughness: .32, clearcoat: .5, clearcoatRoughness: .22, transparent: true, depthWrite: false });
  const uni = { uSfuma: { value: new THREE.Vector2(5.5, 12) } };
  conOmbre(mat, occl);
  inietta(mat, 'tavolo', sh => { Object.assign(sh.uniforms, uni);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec2 uSfuma;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(uSfuma.x, uSfuma.y, length(vGelMondo.xz));'); });
  const piano = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mat);
  piano.rotation.x = -Math.PI / 2; piano.position.y = quota; piano.renderOrder = -2;
  // ombra di contatto morbida sotto la punta
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(60,40,25,.55)'); gr.addColorStop(.35, 'rgba(60,40,25,.25)'); gr.addColorStop(1, 'rgba(60,40,25,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tO = new THREE.CanvasTexture(c);
  const macchia = () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tO, transparent: true, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.y = quota + .004; m.renderOrder = -1; return m; };
  const ombra = macchia(), larga = macchia(); larga.position.y = quota + .002;
  const gruppo = new THREE.Group(); gruppo.add(piano, larga, ombra);
  // h = altezza della punta sul banco (più è vicina, più l'ombra è piccola e scura); quante = palline sul cono (l'ombra larga cresce)
  function contatto(x, z, h, quante = 0) {
    const k = Math.max(0, h);
    ombra.position.x = x; ombra.position.z = z;
    ombra.scale.setScalar(.7 + k * .9);
    ombra.material.opacity = Math.min(1, .8 / (1 + k * 1.4));
    larga.position.x = x + .35; larga.position.z = z - .5;
    larga.scale.set(2.6 + .45 * quante, 1, 2.1 + .35 * quante);
    larga.material.opacity = .22 + .09 * quante;
  }
  return { gruppo, piano, contatto, quota, uni };
}
