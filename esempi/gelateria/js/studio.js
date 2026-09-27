// Nuvola · luce da studio (PMREM), dallo studio di Soldi/Lumen: pannelli morbidi grandi, un diffusore caldo dall'alto,
// una fascia di controluce per i bordi e il pavimento crema (la luce rimbalzata dal banco colora un filo il sotto del gelato).
import * as THREE from 'three';

function tela(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
function pannello(scena, pos, w, h, forza, morbido = .35, colore = '#ffffff') {
  const c = tela(64, 64, g => {
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, colore); gr.addColorStop(1 - morbido, colore); gr.addColorStop(1, '#241c14');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  m.material.color.setScalar(forza); m.position.copy(pos); m.lookAt(0, 0, 0); scena.add(m);
}

export function studio(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    // stanza calda: crema chiaro in alto, crema più scuro in basso (il banco)
    fragmentShader: 'varying vec3 p; void main(){ float y = normalize(p).y; vec3 alto = vec3(.34,.30,.26), basso = vec3(.20,.16,.12); gl_FragColor = vec4(mix(basso, alto, smoothstep(-.35,.6,y)), 1.); }',
  })));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  pannello(s, V(-4, 13, 6), 22, 14, 2.0, .6, '#fff1dc');     // grande diffusore in alto a sinistra, caldo
  pannello(s, V(0, 4, 14), 24, 10, 1.15, .65, '#fff8ee');     // fronte, largo e morbido
  pannello(s, V(-13, 4, 2), 6, 18, 1.35, .5, '#ffeedd');      // lato sinistro
  pannello(s, V(13, 3, -1), 6, 16, .8, .5, '#f4f1ea');        // lato destro, più debole
  pannello(s, V(3, 7, -13), 18, 6, 1.5, .4, '#fff4e4');       // controluce: bordi chiari
  pannello(s, V(0, -9, 0), 30, 30, .5, .7, '#f1dfc2');        // il banco crema
  // due strisce strette e forti (softbox a striscia): danno i riflessi netti sul lucido (gocce, cioccolato, pezzi di fragola)
  pannello(s, V(-7, 5, 9), 1.6, 12, 5.5, .25, '#fff6ea');
  pannello(s, V(9, 4, 6), 1.2, 10, 3.2, .25, '#fffaf2');
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, .1, 100, { size: 256 });
  pm.dispose();
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  return rt;
}
