// Gelateria · le cose vere sopra e dentro il gelato, in 3D (lucide, prendono la luce mentre il cono gira):
// i pezzi di fragola nella pallina di fragola, e nel finale la granella di pistacchio e le scaglie di cioccolato che cadono.
import * as THREE from 'three';
import { casuale, simplex3 } from './rumore.js';
import { conOmbre } from './occlusione.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// pezzo arrotondato: cubo "morbido" (superellissoide) con bozzi, vertici condivisi (spigoli smussati)
function pezzo(N, n, rnd, bozzi = .12) {
  const g = new THREE.BoxGeometry(1, 1, 1, N, N, N), p = g.attributes.position, nz = simplex3(Math.floor(rnd() * 1e4));
  const ofs = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const v = V3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const r = 1 / Math.pow(Math.abs(v.x) ** n + Math.abs(v.y) ** n + Math.abs(v.z) ** n, 1 / n);
    const k = r * (1 + bozzi * nz(v.x * 1.7 + ofs, v.y * 1.7, v.z * 1.7));
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  // BoxGeometry ha i vertici doppi sugli spigoli: si fondono per avere normali morbide
  const m = new Map(), idx = [], pos = [];
  const old = g.index.array;
  const id = i => { const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`; let j = m.get(k); if (j === undefined) { j = pos.length / 3; pos.push(p.getX(i), p.getY(i), p.getZ(i)); m.set(k, j); } return j; };
  for (let i = 0; i < old.length; i++) idx.push(id(old[i]));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx); out.computeVertexNormals();
  g.dispose();
  return out;
}

// unisce tanti pezzi (geometria, matrice, colore per vertice) in una geometria sola: una chiamata di disegno
function unisci(parti) {
  let nv = 0, ni = 0; for (const { g } of parti) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0; const v = V3(), n = V3(), nm = new THREE.Matrix3();
  for (const { g, m, colore } of parti) {
    nm.getNormalMatrix(m);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      pos.set([v.x, v.y, v.z], (ov + i) * 3); nor.set([n.x, n.y, n.z], (ov + i) * 3);
      const c = colore(P.getX(i), P.getY(i), P.getZ(i)); col.set(c, (ov + i) * 3);
    }
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
    ov += P.count; oi += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// un punto sulla superficie della pallina nella direzione d (coordinate della pallina, prima della scala della mesh)
function superficie(pal, d, affonda = 0) {
  const r = pal.forma([d.x, d.y, d.z]) - affonda;
  return V3(d.x * r, d.y * r * pal.schiaccia, d.z * r);
}
function orienta(m, pos, normale, giro, scala) {
  const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), normale);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), giro));
  return m.compose(pos, q, scala);
}

// ————— pezzi di fragola: rossi, lucidi come sciroppo, un filo più chiari al centro del taglio —————
export function pezziFragola(pal, occl, { n = 7, seme = 5, telefono = false } = {}) {
  const rnd = casuale(seme), parti = [];
  const rosso = new THREE.Color('#d8202e'), chiaro = new THREE.Color('#ff7a86'), scuro = new THREE.Color('#b0101e');
  // direzioni: tutto attorno ma non sotto (dentro il cono) né dove si appoggiano cioccolato (+x) e pistacchio (in alto a destra)
  const dirs = [];
  while (dirs.length < n) {
    const d = V3(rnd() * 2 - 1, rnd() * 1.3 - .35, rnd() * 2 - 1).normalize();
    if (d.y < -.3 || (d.x > .35 && d.y < .6) || (d.x > .1 && d.y > .5)) continue;
    if (dirs.some(e => e.distanceTo(d) < .62)) continue;
    dirs.push(d);
  }
  for (const d of dirs) {
    const g = pezzo(telefono ? 3 : 4, 3.2, rnd, .16);
    const s = .1 + rnd() * .05, sc = V3(s * (1 + rnd() * .4), s * (.8 + rnd() * .3), s * (.45 + rnd() * .2));
    const m = orienta(new THREE.Matrix4(), superficie(pal, d, s * .38), d, rnd() * 6.28, sc);
    const tinta = rnd();
    parti.push({ g, m, colore: (x, y, z) => { const c = rosso.clone().lerp(scuro, .35 * tinta); const k = Math.max(0, z) * (1 - Math.min(1, Math.hypot(x, y) * .9)); c.lerp(chiaro, .7 * k); return [c.r, c.g, c.b]; } });
  }
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .28, clearcoat: 1, clearcoatRoughness: .06, specularIntensity: .9, sheen: .3, sheenColor: new THREE.Color('#ff8090'), sheenRoughness: .4 });
  conOmbre(mat, occl);
  const mesh = new THREE.Mesh(unisci(parti), mat); mesh.castShadow = true; mesh.receiveShadow = true;
  parti.forEach(p => p.g.dispose());
  return mesh;
}

// ————— granella di pistacchio: pezzi spigolosi verdi, alcuni con la pellicina viola; cadono sopra nel finale —————
export function granella(pal, occl, { n = 70, seme = 9 } = {}) {
  const rnd = casuale(seme);
  // pezzetti tondeggianti con qualche spigolo (pistacchio tritato), lisci: niente sfaccettature da poligono
  const g = pezzo(3, 3.0, rnd, .18);
  { // pezzo di pistacchio: dentro verde chiaro, da un lato la pellicina viola (il colore di ogni pezzo si moltiplica)
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), pel = Math.min(1, Math.max(0, (x - .25) / .35));
      const k = .82 + .22 * Math.max(0, y);
      c[i * 3] = k * (1 - pel) + .78 * pel; c[i * 3 + 1] = k * (1 - pel) + .42 * pel; c[i * 3 + 2] = k * (1 - pel) + .5 * pel;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .72, sheen: .3, sheenColor: new THREE.Color('#eef0c8'), sheenRoughness: .7, specularIntensity: .4 });
  conOmbre(mat, occl);
  const mesh = new THREE.InstancedMesh(g, mat, n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const verdi = ['#a9a95f', '#bdb872', '#cfc88c', '#9a9d55', '#d9d09c', '#b3b066'].map(c => new THREE.Color(c)), pelle = ['#7c4a52', '#8a5c46', '#6f4656'].map(c => new THREE.Color(c));
  const pezzi = [];
  for (let i = 0; i < n; i++) {
    // sulla calotta in alto (un po' verso il davanti), appoggiati e mezzi affondati: il lato piatto sulla superficie
    let d;
    do { d = V3(rnd() * 2 - 1, .45 + rnd() * .6, rnd() * 2 - 1.2).normalize(); } while (d.y < .45);
    const s = .03 + rnd() * .045;
    const fine = superficie(pal, d, s * .42);
    // normale della superficie (non la direzione): due punti vicini
    const t1 = V3(0, 1, 0).cross(d).normalize(), t2 = d.clone().cross(t1).normalize();
    const a = superficie(pal, d.clone().addScaledVector(t1, .02).normalize()), b = superficie(pal, d.clone().addScaledVector(t2, .02).normalize()), c0 = superficie(pal, d);
    const nrm = a.sub(c0).cross(b.sub(c0)).normalize(); if (nrm.dot(d) < 0) nrm.negate();
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), nrm).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), rnd() * 6.3)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - .5) * .5, 0, (rnd() - .5) * .5)));
    pezzi.push({ fine, q, s: V3(s * (1 + rnd() * .4), s * (.45 + rnd() * .2), s * (.85 + rnd() * .35)), ritardo: rnd() * .7, giro: V3(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(6) });
    mesh.setColorAt(i, rnd() < .12 ? pelle[Math.floor(rnd() * pelle.length)] : verdi[Math.floor(rnd() * verdi.length)]);
  }
  const m = new THREE.Matrix4(), pos = V3(), q = new THREE.Quaternion(), e = new THREE.Quaternion();
  // t = 0…1 nel finale: cadono dall'alto, con un ritardo ciascuno, e si posano
  function cadi(t) {
    mesh.visible = t > 0;
    if (!mesh.visible) return;
    pezzi.forEach((p, i) => {
      const k = Math.min(1, Math.max(0, (t - p.ritardo * .6) / .4)), h = (1 - k) * (1 - k) * 4.5;
      pos.copy(p.fine); pos.y += h;
      e.setFromEuler(new THREE.Euler(p.giro.x * (1 - k), p.giro.y * (1 - k), p.giro.z * (1 - k)));
      q.copy(p.q).multiply(e);
      mesh.setMatrixAt(i, m.compose(pos, q, k > 0 ? p.s : V3(0, 0, 0)));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  cadi(0);
  return { mesh, cadi };
}

// ————— scaglie di cioccolato: schegge sottili e spigolose, fondente lucido; cadono sopra nel finale —————
export function scaglie(pal, occl, { n = 16, seme = 13 } = {}) {
  const rnd = casuale(seme);
  const forma = new THREE.Shape();
  const k = 7; for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2, r = .7 + rnd() * .5; const x = Math.cos(a) * r * 1.3, y = Math.sin(a) * r; i ? forma.lineTo(x, y) : forma.moveTo(x, y); }
  const g = new THREE.ExtrudeGeometry(forma, { depth: .28, bevelEnabled: true, bevelThickness: .08, bevelSize: .08, bevelSegments: 1 });
  g.center();
  const mat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: .3, clearcoat: .6, clearcoatRoughness: .15, specularIntensity: .9 });
  conOmbre(mat, occl);
  const mesh = new THREE.InstancedMesh(g, mat, n);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  const toni = ['#5b301c', '#6a3a22', '#4a2616', '#7a4a2c'].map(c => new THREE.Color(c));
  const pezzi = [];
  for (let i = 0; i < n; i++) {
    // sulla spalla libera del cioccolato (il pistacchio gli sta sopra a sinistra)
    let d; do { d = V3(rnd() * 1.4 - .15, .2 + rnd() * .6, rnd() * 2 - .9).normalize(); } while (d.y < .22 || d.y > .82 || d.x < -.05);
    const s = .075 + rnd() * .055;
    const fine = superficie(pal, d, s * .2);
    // appoggiata inclinata sulla superficie
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 0, 1), d).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * .9 - .45, rnd() * .9 - .45, rnd() * 6.3)));
    pezzi.push({ fine, q, s: V3(s, s, s), ritardo: rnd() * .7, giro: V3(rnd() - .5, rnd() - .5, rnd() - .5).multiplyScalar(8) });
    mesh.setColorAt(i, toni[Math.floor(rnd() * toni.length)]);
  }
  const m = new THREE.Matrix4(), pos = V3(), q = new THREE.Quaternion(), e = new THREE.Quaternion();
  function cadi(t) {
    mesh.visible = t > 0;
    if (!mesh.visible) return;
    pezzi.forEach((p, i) => {
      const k = Math.min(1, Math.max(0, (t - p.ritardo * .6) / .4)), h = (1 - k) * (1 - k) * 4.5;
      pos.copy(p.fine); pos.y += h;
      e.setFromEuler(new THREE.Euler(p.giro.x * (1 - k), p.giro.y * (1 - k), p.giro.z * (1 - k)));
      q.copy(p.q).multiply(e);
      mesh.setMatrixAt(i, m.compose(pos, q, k > 0 ? p.s : V3(0, 0, 0)));
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  cadi(0);
  return { mesh, cadi };
}
