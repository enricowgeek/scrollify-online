// Soldi · luce da studio (PMREM), dallo studio di Lumen/pistola: pannelli morbidi grandi, una fascia calda dall'alto,
// e il pavimento verde (la luce rimbalzata dal fondo "verde dollaro" colora un filo il sotto delle banconote).
import * as THREE from 'three';

function tela(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; }
function pannello(scena, pos, w, h, forza, morbido = .35, colore = '#ffffff') {
  const c = tela(64, 64, g => {
    const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, colore); gr.addColorStop(1 - morbido, colore); gr.addColorStop(1, '#202020');
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
    // cielo grigio caldo in alto, verde (il fondo della pagina) in basso
    fragmentShader: 'varying vec3 p; void main(){ float y = normalize(p).y; vec3 alto = vec3(.30,.30,.29), basso = vec3(.10,.20,.08); gl_FragColor = vec4(mix(basso, alto, smoothstep(-.35,.6,y)), 1.); }',
  })));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  pannello(s, V(-3, 12, 5), 20, 14, 1.9, .55, '#fff6ea');      // grande diffusore in alto, un filo caldo
  pannello(s, V(0, 5, 13), 22, 9, 1.25, .6);                   // fronte, largo e morbido
  pannello(s, V(-12, 3, 3), 6, 18, 1.5, .5);                   // lato sinistro
  pannello(s, V(12, 2, -2), 6, 18, 1.0, .5, '#eef6ff');        // lato destro, freddo e più debole
  pannello(s, V(2, 6, -12), 16, 6, 1.4, .4);                   // controluce (bordi chiari)
  pannello(s, V(0, -9, 0), 30, 30, .55, .7, '#86bb66');        // pavimento verde
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0, .1, 100, { size: 256 });
  pm.dispose();
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
  return rt;
}
