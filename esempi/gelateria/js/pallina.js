// Gelateria · la pallina di gelato. La forma è una sfera "a cubo" (vertici distribuiti uguali, niente poli) deformata:
// grumi larghi, l'orlo sfrangiato in basso dove il porzionatore l'ha tagliata, e il rilievo vero preso dalla foto della pallina.
// La superficie è la FOTO (img/<gusto>.webp, sluminata in src/prepara.py) proiettata da sei lati e sfumata dove i lati si
// incontrano: davanti si vede la foto, girando si vedono le altre facce; la luce la mette la scena (rilievo + lucido dalla foto).
// Nel vertex shader: i piani di contatto con le palline vicine (si schiacciano l'una contro l'altra invece di compenetrarsi)
// e il vincolo del cono (la parte che entra nella bocca si adatta alla parete).
import * as THREE from 'three';
import { simplex3 } from './rumore.js';
import { inietta, conOmbre } from './occlusione.js';

// le sei proiezioni: asse, destra e su dell'immagine (l'alto della foto resta in alto), spostamento per non ripetere uguale
const PROI = [
  [[0, 0, 1], [1, 0, 0], [0, 1, 0], [0, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0], [.05, .02]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0], [-.04, .03]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0], [.04, -.02]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1], [0, .06]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1], [0, 0]],
];
const RP = 1.0;   // raggio della pallina nella foto ↔ raggio della forma
const V = a => `vec3(${a.map(x => x.toFixed(1)).join(',')})`;
const GLSL_PROI = `
  const vec3 PA[6] = vec3[6](${PROI.map(p => V(p[0])).join(',')});
  const vec3 PE1[6] = vec3[6](${PROI.map(p => V(p[1])).join(',')});
  const vec3 PE2[6] = vec3[6](${PROI.map(p => V(p[2])).join(',')});
  const vec2 POFF[6] = vec2[6](${PROI.map(p => `vec2(${p[3][0].toFixed(3)},${p[3][1].toFixed(3)})`).join(',')});`;

// campionatore bilineare di un'immagine (canale c, 0…1) per la forma calcolata in JS
function campionatore(img, S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  return (u, v, ch) => {
    const x = Math.min(S - 1.001, Math.max(0, u * S - .5)), y = Math.min(S - 1.001, Math.max(0, (1 - v) * S - .5));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = (y0 * S + x0) * 4 + ch;
    const a = d[i], b = d[i + 4], cc = d[i + S * 4], dd = d[i + S * 4 + 4];
    return ((a + (b - a) * fx) * (1 - fy) + (cc + (dd - cc) * fx) * fy) / 255;
  };
}
// rilievo della foto nel punto di direzione d (stessa miscela delle sei proiezioni dello shader)
function rilievoIn(camp, d) {
  let s = 0, w = 0;
  for (const [A, E1, E2, O] of PROI) {
    let k = Math.max(0, d[0] * A[0] + d[1] * A[1] + d[2] * A[2]); k = k * k; k = k * k * k;
    if (k < .003) continue;
    const u = .5 + .5 * (d[0] * E1[0] + d[1] * E1[1] + d[2] * E1[2]) / RP + O[0], v = .5 + .5 * (d[0] * E2[0] + d[1] * E2[1] + d[2] * E2[2]) / RP + O[1];
    s += k * camp(u, v, 0); w += k;
  }
  return w ? s / w : .5;
}

// sfera a cubo con i vertici condivisi sugli spigoli (normali senza cuciture)
function sferaCubo(N) {
  const facce = [[[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]]];
  const dir = [], idx = [], mappa = new Map();
  const vert = (x, y, z) => {
    // cubo → sfera con la mappa "uniforme" (celle quasi uguali)
    const sx = x * Math.sqrt(1 - y * y / 2 - z * z / 2 + y * y * z * z / 3), sy = y * Math.sqrt(1 - z * z / 2 - x * x / 2 + z * z * x * x / 3), sz = z * Math.sqrt(1 - x * x / 2 - y * y / 2 + x * x * y * y / 3);
    const k = `${Math.round(sx * 1e5)},${Math.round(sy * 1e5)},${Math.round(sz * 1e5)}`;
    let i = mappa.get(k); if (i === undefined) { i = dir.length / 3; dir.push(sx, sy, sz); mappa.set(k, i); }
    return i;
  };
  for (const [n, r, u] of facce) {
    const id = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const a = i / N * 2 - 1, b = j / N * 2 - 1;
      id.push(vert(n[0] + a * r[0] + b * u[0], n[1] + a * r[1] + b * u[1], n[2] + a * r[2] + b * u[2]));
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = id[j * (N + 1) + i], b = id[j * (N + 1) + i + 1], c = id[(j + 1) * (N + 1) + i + 1], d = id[(j + 1) * (N + 1) + i];
      idx.push(a, b, c, a, c, d);
    }
  }
  return { dir: new Float32Array(dir), idx };
}

// la forma: d = direzione (unitaria) → raggio
function forma(seme, camp, o) {
  const n1 = simplex3(seme), n2 = simplex3(seme + 1), n3 = simplex3(seme + 2);
  return d => {
    const [x, y, z] = d;
    let r = 1 + o.grumi * n1(x * 1.4, y * 1.4, z * 1.4) + o.grumi * .5 * n2(x * 3, y * 3, z * 3);
    // orlo sfrangiato del porzionatore, sotto l'equatore
    const lat = y, anello = Math.exp(-(((lat - o.orloLat) / .11) ** 2));
    r += anello * (o.orlo + o.orlo * .9 * n3(x * 5.5, y * 5.5, z * 5.5) + o.orlo * .6 * n2(x * 13, y * 13, z * 13));
    // sotto l'orlo rientra (la parte tagliata)
    const sotto = Math.min(1, Math.max(0, (o.orloLat - .06 - lat) / (1 + o.orloLat)));
    r -= .16 * sotto * sotto;
    // sopra meno sferica: la cupola si appiattisce un poco
    if (o.appiattisci) { const t = Math.min(1, Math.max(0, (y - .35) / .65)); r *= 1 - o.appiattisci * t * t; }
    // il "ricciolo" del porzionatore: una cresta che attraversa la parte alta, con il solco davanti (il labbro che si arrotola)
    if (o.ricciolo) {
      const { a, s0, w, amp } = o.ricciolo, sA = x * a[0] + y * a[1] + z * a[2];
      const alto = Math.min(1, Math.max(0, (y + .1) / .5)), vario = .65 + .35 * n1(x * 2.2 + 7, y * 2.2, z * 2.2);
      r += amp * vario * alto * (Math.exp(-(((sA - s0) / w) ** 2)) - .7 * Math.exp(-(((sA - s0 + w * 1.25) / (w * .55)) ** 2)));
    }
    // il rilievo vero della foto
    r += (rilievoIn(camp, d) - .5) * o.rilievoGeo;
    return r;
  };
}

export async function creaPallina({ gusto, seme = 1, N = 56, occl, indice, schiaccia = .94, telefono = false, opzForma = {}, materiale = {} }) {
  const cartella = 'img/';
  const [imgCol, imgRil] = await Promise.all([`${gusto}${telefono ? '-512' : ''}.webp`, `${gusto}-rilievo.webp`].map(f => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = cartella + f; })));
  const camp = campionatore(imgRil, 128);
  const o = { grumi: .035, orlo: .045, orloLat: -.36, rilievoGeo: .05, ...opzForma };
  const f = forma(seme, camp, o);
  const { dir, idx } = sferaCubo(N);
  const nV = dir.length / 3, pos = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const d = [dir[i * 3], dir[i * 3 + 1], dir[i * 3 + 2]], r = f(d);
    pos[i * 3] = d[0] * r; pos[i * 3 + 1] = d[1] * r * schiaccia; pos[i * 3 + 2] = d[2] * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const tCol = new THREE.Texture(imgCol); tCol.colorSpace = THREE.SRGBColorSpace; tCol.needsUpdate = true;
  const tRil = new THREE.Texture(imgRil); tRil.needsUpdate = true;
  for (const t of [tCol, tRil]) { t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  const m = { colore: '#ffffff', ruvido: .52, lucido: .22, rilievo: .018, sheen: .4, sheenColor: '#ffffff', clearcoat: 0, ...materiale };
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(m.colore), roughness: m.ruvido, sheen: m.sheen, sheenRoughness: .55, sheenColor: new THREE.Color(m.sheenColor), clearcoat: m.clearcoat, clearcoatRoughness: .3, specularIntensity: .7 });
  const piani = [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)];   // sfere di contatto (coordinate locali, w = raggio; 0 = spenta)
  const uni = {
    uGelColore: { value: tCol }, uGelRilievo: { value: tRil }, uGelRilAmp: { value: m.rilievo }, uGelLucido: { value: m.lucido },
    uPiani: { value: piani }, uInvModel: { value: new THREE.Matrix4() }, uCono: { value: new THREE.Vector4(0, .25, 0, 0) },
  };
  // deformazione (piani di contatto, cono) — la stessa anche per l'ombra
  const deforma = /* glsl */`
    uniform vec4 uPiani[2]; uniform mat4 uInvModel; uniform vec4 uCono; uniform vec3 uConoAsse;
    float gSmin(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
    vec3 gDeforma(vec3 p, inout vec3 n) {
      // le palline che arrivano dopo (o che stanno sotto): questa si adatta alla loro sfera (un po' più piccola della forma vera,
      // così la parte adattata resta nascosta dentro l'altra e il bordo del contatto segue la curva dell'altra pallina)
      for (int i = 0; i < 2; i++) {
        vec4 sf = uPiani[i];
        if (sf.w > 0.0) {
          vec3 dv = p - sf.xyz; float d = max(length(dv), 1e-4);
          float dn = -gSmin(-d, -sf.w, .09);
          if (dn > d) {
            p = sf.xyz + dv * (dn / d);
            n = normalize(mix(n, -dv / d, clamp((dn - d) / .06, 0., 1.) * .8));
          }
        }
      }
      if (uCono.w > .5) {
        vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz;
        vec2 rel = wp.xz - uConoAsse.xz; float rr = max(length(rel), 1e-4);
        float rmax = max(0.0, (wp.y - uCono.x) * uCono.y - .035);
        float k = 1.0 - smoothstep(uCono.z - .3, uCono.z - .07, wp.y);
        float rn = mix(rr, min(rr, gSmin(rr, rmax, .06)), k);
        if (rn < rr) {
          wp.xz = uConoAsse.xz + rel * (rn / rr);
          vec3 nw = normalize(vec3(rel.x / rr, -uCono.y, rel.y / rr));
          vec3 nl = normalize(transpose(mat3(modelMatrix)) * nw);
          n = normalize(mix(n, nl, clamp((rr - rn) / .05, 0., 1.)));
          p = (uInvModel * vec4(wp, 1.0)).xyz;
        }
      }
      return p;
    }`;
  inietta(mat, 'pallina', sh => {
    Object.assign(sh.uniforms, uni); sh.uniforms.uConoAsse = occl.uConoAsse;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGelObj;\n' + deforma)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(normal); vGelObj = position; vec3 gP = gDeforma(position, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = gP;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGelObj; uniform sampler2D uGelColore, uGelRilievo; uniform float uGelRilAmp, uGelLucido;
        ${GLSL_PROI}
        vec3 gPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
          vec3 vSigmaX = normalize(dFdx(surf_pos.xyz)); vec3 vSigmaY = normalize(dFdy(surf_pos.xyz)); vec3 vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
          vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
          return normalize(abs(fDet) * surf_norm - vGrad);
        }`)
      .replace('#include <map_fragment>', `
        vec3 gDir = normalize(vGelObj); vec3 gdx = dFdx(vGelObj), gdy = dFdy(vGelObj);
        vec3 gCol = vec3(0.); vec2 gAux = vec2(0.); float gW = 0.;
        for (int i = 0; i < 6; i++) {
          float w = max(dot(gDir, PA[i]), 0.0); w = w * w; w = w * w * w;
          if (w > .003) {
            vec2 uv = .5 + .5 * vec2(dot(vGelObj, PE1[i]), dot(vGelObj, PE2[i])) / ${RP.toFixed(2)} + POFF[i];
            vec2 gx = .5 * vec2(dot(gdx, PE1[i]), dot(gdx, PE2[i])) / ${RP.toFixed(2)}, gy = .5 * vec2(dot(gdy, PE1[i]), dot(gdy, PE2[i])) / ${RP.toFixed(2)};
            gCol += w * textureGrad(uGelColore, uv, gx, gy).rgb;
            gAux += w * textureGrad(uGelRilievo, uv, gx, gy).rg;
            gW += w;
          }
        }
        gCol /= gW; gAux /= gW;
        diffuseColor.rgb *= gCol;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, uGelLucido, gAux.g);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { float hh = (gAux.r - .5) * uGelRilAmp; normal = gPerturb(-vViewPosition, normal, vec2(dFdx(hh), dFdy(hh)), faceDirection); }`);
  });
  conOmbre(mat, occl, { escludi: indice, orlo: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  // l'ombra usa la stessa deformazione
  const dep = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  dep.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uPiani: uni.uPiani, uInvModel: uni.uInvModel, uCono: uni.uCono, uConoAsse: occl.uConoAsse });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + deforma)
      .replace('#include <begin_vertex>', 'vec3 gN = vec3(0., 1., 0.); vec3 transformed = gDeforma(position, gN);');
  };
  dep.customProgramCacheKey = () => 'gel-dep';
  mesh.customDepthMaterial = dep;
  return { mesh, mat, uni, piani, forma: f, schiaccia, raggio: 1 };
}

// aggiorna le sfere di contatto (portate nelle coordinate locali della mesh) e il cono; dopo updateMatrixWorld.
// vicini: [{ centro (mondo), raggio (mondo) }] delle palline a cui questa si adatta
const _inv = new THREE.Matrix4(), _l = new THREE.Vector3(), _s = new THREE.Vector3();
export function aggiornaContatti(p, vicini, cono) {
  const M = p.mesh.matrixWorld;
  _inv.copy(M).invert(); p.uni.uInvModel.value.copy(_inv);
  _s.setFromMatrixScale(M); const sc = Math.cbrt(_s.x * _s.y * _s.z);
  for (let i = 0; i < 2; i++) {
    const v = vicini[i], sf = p.piani[i];
    if (!v) { sf.set(0, 0, 0, 0); continue; }
    _l.copy(v.centro).applyMatrix4(_inv);
    sf.set(_l.x, _l.y, _l.z, v.raggio / sc);
  }
  const u = p.uni.uCono.value;
  if (cono) u.set(cono.punta, cono.pendenza, cono.orlo, 1); else u.w = 0;
}
