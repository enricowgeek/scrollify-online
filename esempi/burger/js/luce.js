// Doppio Strato · la luce come ambiente (PMREM) per i riflessi: sala nera e pulita, la lampada calda sopra il tavolo (disco
// morbido: il lucido del pane e del formaggio), due softbox rettangolari a bordi netti (le righe di luce pulite sullo smalto
// nero del piatto e sulle salse), una fascia di controluce dietro (i bordi) e tre luci lontane, appena accennate.
// Stessa tecnica di studio.js (pannelli in una scena che si "fotografa" in una PMREM).
import * as THREE from 'three';

function tela(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
// morbido: 0 = bordo netto (softbox), 1 = tutto sfumato
function pannello(scena, pos, w, h, forza, morbido = .35, colore = '#ffffff', tondo = false) {
  const c = tela(64, 64, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
    if (tondo || morbido > .05) {
      const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, colore); gr.addColorStop(Math.max(.01, 1 - morbido), colore); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      if (tondo) { g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill(); } else g.fillRect(0, 0, 64, 64);
    } else { g.fillStyle = colore; g.fillRect(2, 2, 60, 60); }
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  m.material.color.setScalar(forza); m.position.copy(pos); m.lookAt(0, 0, 0); scena.add(m);
}

export function pub(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    // sala nera, appena più chiara in alto
    fragmentShader: 'varying vec3 p; void main(){ float y = normalize(p).y; vec3 alto = vec3(.022,.02,.018), basso = vec3(.008,.008,.008); gl_FragColor = vec4(mix(basso, alto, smoothstep(-.3,.7,y)), 1.); }',
  })));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  pannello(s, V(0, 14, 3), 14, 14, 2.4, .5, '#ffe4c2', true);     // la lampada sopra il tavolo, calda
  pannello(s, V(-9, 9, 10), 9, 5, 1.6, 0, '#fff4e6');              // softbox rettangolare davanti a sinistra: riga netta sullo smalto
  pannello(s, V(10, 7, 8), 1.3, 9, 1.4, 0, '#fff1e2');             // striscia stretta a destra
  pannello(s, V(0, 6, -14), 24, 3.5, .8, .45, '#ffd7a8');          // controluce: la fascia dietro, bordi caldi
  pannello(s, V(0, -9, 0), 30, 30, .03, .7, '#6b5a4a');            // il piano di pietra
  for (const [x, y, z] of [[-12, 3, -9], [5, 3.4, -13], [13, 2.2, -6]]) pannello(s, V(x, y, z), .9, .9, 1.1, .35, '#ffc98e', true);   // luci lontane
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, .1, 100, { size: 256 });
  pm.dispose();
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  return rt;
}
