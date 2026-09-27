// Gelateria · le gocce che colano dalla pallina lungo la cialda. Ogni goccia è un nastro schiacciato sulla superficie
// del cono (metà dentro la cialda, non si vede), sottile in alto e con la goccia tonda in punta; cresce dall'orlo verso il basso
// seguendo la superficie. g = 0…1 la fa crescere (e tornando su si ritira). Più lucida del gelato.
import * as THREE from 'three';
import { raggioFuori, orloA, PENDENZA } from './cialda.js';

const NU = 30, NV = 12;

export function creaGoccia({ mat, th, lung = 1.2, largo = .075, deriva = .07, sopra = .05 }) {
  const n = (NU + 1) * NV, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
  for (let j = 0; j < NU; j++) for (let i = 0; i < NV; i++) {
    const a = j * NV + i, b = j * NV + (i + 1) % NV, c = (j + 1) * NV + (i + 1) % NV, d = (j + 1) * NV + i;
    idx.push(a, c, d, a, b, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.visible = false;
  const y0 = orloA(th) + sopra;           // parte da sotto la pallina, appena sopra l'orlo (coperto dalla pallina che sborda)
  let gPrima = -1;
  const P = new THREE.Vector3(), N = new THREE.Vector3(), T = new THREE.Vector3(), B = new THREE.Vector3();
  // punto del percorso a distanza s dall'inizio (lungo la superficie, verso il basso)
  function telaio(s) {
    const y = y0 - s / Math.sqrt(1 + PENDENZA * PENDENZA);
    const a = th + deriva * Math.sin(s * 2.3 + th * 3);
    const yO = orloA(a);
    let r = raggioFuori(a, Math.min(y, yO)) + .004;
    if (y > yO) r += (y - yO) * .5;         // sopra l'orlo: scavalca il bordo
    P.set(r * Math.sin(a), y, r * Math.cos(a));
    N.set(Math.sin(a), -PENDENZA, Math.cos(a)).normalize();
    T.set(-PENDENZA * Math.sin(a), -1, -PENDENZA * Math.cos(a)).normalize();
    B.crossVectors(N, T).normalize();
  }
  const fase = th * 7.3, u0 = .5 + .12 * Math.sin(th * 5), v0 = .72 + .06 * Math.cos(th * 3);
  function cresci(g) {
    g = Math.max(0, Math.min(1, g));
    if (Math.abs(g - gPrima) < 1e-4) return;
    gPrima = g;
    mesh.visible = g > .002;
    if (!mesh.visible) return;
    const L = sopra + .03 + lung * g;          // lunghezza del nastro (una parte sta sotto la pallina)
    const w1 = largo * (.62 + .06 * g);        // il collo, più stretto dell'attacco
    const rb = Math.min(w1 * 1.3, L * .3);     // la goccia in punta: poco più larga del collo
    for (let j = 0; j <= NU; j++) {
      const u = j / NU, s = L * (1 - Math.pow(1 - u, 1.5));   // più fitto verso la punta
      telaio(s);
      // largo all'attacco, collo che si stringe con un'ondina, goccia tonda che chiude
      const k = Math.min(1, s / Math.max(.001, L * .6)), liscio = k * k * (3 - 2 * k);
      let w = (largo + (w1 - largo) * liscio) * (1 + .1 * Math.sin(s * 9 + fase) + .05 * Math.sin(s * 23 + fase * 2));
      const dc = s - (L - rb);
      if (dc > 0) w = Math.max(0, Math.sqrt(Math.max(0, rb * rb - dc * dc)) * (rb / Math.max(rb, 1e-4)));
      else if (dc > -rb) w = Math.max(w, Math.sqrt(Math.max(0, rb * rb - dc * dc)));
      if (j === NU) w = 0;
      // velo sottile che copre le creste, la goccia in punta più piena
      const bulbo = dc > -rb ? Math.sqrt(Math.max(0, 1 - (dc / rb) ** 2)) : 0;
      const t = w * (.34 + .22 * bulbo);
      for (let i = 0; i < NV; i++) {
        const ps = i / NV * Math.PI * 2, cw = Math.cos(ps) * w, sn = Math.sin(ps);
        // sezione a cupola schiacciata: il sotto sta nella cialda
        const kk = (j * NV + i) * 3, h = sn > 0 ? Math.pow(sn, .8) * t : sn * .03;
        pos[kk] = P.x + B.x * cw + N.x * (h + .018);
        pos[kk + 1] = P.y + B.y * cw + N.y * (h + .018);
        pos[kk + 2] = P.z + B.z * cw + N.z * (h + .018);
        uv[(j * NV + i) * 2] = u0 + cw * .45;
        uv[(j * NV + i) * 2 + 1] = v0 - s * .45;
      }
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.uv.needsUpdate = true;
    geo.computeVertexNormals();
  }
  return { mesh, cresci };
}
