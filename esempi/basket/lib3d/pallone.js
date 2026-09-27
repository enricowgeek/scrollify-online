// Rimbalzo 3D · il pallone (Ø 24 cm). Materiale fisico con lo shader ritoccato (onBeforeCompile):
//  · cuciture calcolate sulla sfera (niente texture, nitide a ogni distanza): due cerchi massimi perpendicolari (piani y = 0 e
//    x = 0) e due anelli attorno ai poli ±x, "a sella" (distanza dal polo 59,7° + 16,1° cos 2ψ: 75,8° sul davanti, 43,6° in alto),
//    misurati sulla foto pallone-grande.png: visto di fronte fa la croce e le due parentesi ")(" del pallone vero; 8 spicchi.
//    Canale largo 4,8 mm, nero gommoso, con i bordi arrotondati che prendono la luce; ai lati una fascia liscia di 1,2 mm;
//  · grana a bolli (img/grana.webp: normale + altezza, piastrella di 32 mm, passo dei bolli 3,2 mm) con mappatura triplanare
//    nelle coordinate della palla: i bolli girano con lei; colore fra il fondo giallo-arancio e le cupole rosso-arancio.
// La palla si schiaccia con la scala dell'oggetto (le cuciture restano attaccate alla superficie).
import * as THREE from 'three';
import { R_PALLA } from './fisica.js';

export function creaPallone(ctx) {
  const { env, grana, dettaglio = 1, opacita = 1, stencil = false } = ctx;
  const geo = new THREE.SphereGeometry(R_PALLA, Math.round(96 * dettaglio), Math.round(64 * dettaglio));
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0, envMap: env, envMapIntensity: 1.0, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xff9a5a) });
  const u = { grana: { value: grana }, piastrella: { value: 0.032 }, intensita: { value: 1 }, velo: { value: 0 } };
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vAx; varying vec3 vAy; varying vec3 vAz;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vAx = normalize(normalMatrix * vec3(1.,0.,0.)); vAy = normalize(normalMatrix * vec3(0.,1.,0.)); vAz = normalize(normalMatrix * vec3(0.,0.,1.));');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vOP; varying vec3 vAx; varying vec3 vAy; varying vec3 vAz;
        uniform sampler2D grana; uniform float piastrella; uniform float intensita; uniform float velo;
        const float T0 = 1.0420, T1 = 0.2810, MEZZA = 0.0200;   // anelli (rad) e mezza larghezza del canale (2,4 mm / 120 mm)
        float cuciture(vec3 n) {
          float d1 = abs(asin(clamp(n.y, -1., 1.)));
          float d2 = abs(asin(clamp(n.x, -1., 1.)));
          float th = acos(clamp(abs(n.x), 0., 1.));
          float psi = atan(n.y, n.z);
          float c2 = cos(2. * psi), s2 = sin(2. * psi);
          float pend = -2. * T1 * s2 / max(sin(th), 0.05);
          float d3 = abs(th - (T0 + T1 * c2)) / sqrt(1. + pend * pend);
          return min(min(d1, d2), d3);
        }
        // profilo del canale: 0 fuori, −1 sul fondo; i bordi arrotondati su 1 mm
        float canale(float d) { return -(1. - smoothstep(MEZZA - 0.004, MEZZA + 0.0045, d)); }
        vec4 tri(vec3 p, vec3 w) {
          vec4 a = texture2D(grana, p.zy / piastrella), b = texture2D(grana, p.xz / piastrella), c = texture2D(grana, p.xy / piastrella);
          return a * w.x + b * w.y + c * w.z;
        }
        float gCuc, gFascia, gBollo; vec3 gNO;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 n = normalize(vOP);
          float d = cuciture(n), fw = max(fwidth(d), 1e-5);
          // bordo del canale con l'antialias (fw: radianti per pixel)
          gCuc = 1. - smoothstep(MEZZA - fw * .7, MEZZA + fw * .7, d);
          gFascia = smoothstep(MEZZA + 0.004, MEZZA + 0.013, d);          // niente bolli vicino alla cucitura
          vec3 w = pow(abs(n), vec3(4.)); w /= (w.x + w.y + w.z);
          vec4 g = tri(vOP, w);
          gBollo = g.a * gFascia;
          vec3 fondo = vec3(0.93, 0.36, 0.085), cupola = vec3(0.74, 0.19, 0.045), nero = vec3(0.022, 0.02, 0.019);
          vec3 pan = mix(fondo, cupola, smoothstep(0.08, 0.6, gBollo));
          diffuseColor.rgb = mix(pan, nero, gCuc) * intensita;
          // normale della grana (triplanare, fusione "whiteout") nelle coordinate della palla
          vec3 tX = texture2D(grana, vOP.zy / piastrella).xyz * 2. - 1., tY = texture2D(grana, vOP.xz / piastrella).xyz * 2. - 1., tZ = texture2D(grana, vOP.xy / piastrella).xyz * 2. - 1.;
          float k = gFascia * (1. - gCuc) * 0.9;
          tX.xy *= k; tY.xy *= k; tZ.xy *= k;
          tX = vec3(tX.xy + n.zy, abs(tX.z) * n.x); tY = vec3(tY.xy + n.xz, abs(tY.z) * n.y); tZ = vec3(tZ.xy + n.xy, abs(tZ.z) * n.z);
          vec3 no = normalize(tX.zyx * w.x + tY.xzy * w.y + tZ.xyz * w.z);
          // canale: pendenza del profilo lungo il gradiente della distanza (differenze finite sulla sfera)
          vec3 t1 = normalize(cross(n, abs(n.y) < 0.95 ? vec3(0., 1., 0.) : vec3(1., 0., 0.))), t2 = cross(n, t1);
          float e = 0.0015, d0 = d;
          float g1 = (cuciture(normalize(n + e * t1)) - d0) / e, g2 = (cuciture(normalize(n + e * t2)) - d0) / e;
          float hp = (canale(d0 + 0.0005) - canale(d0 - 0.0005)) / 0.001;   // pendenza del profilo (per radiante)
          float prof = 0.0011 / ${R_PALLA.toFixed(3)};                       // 1,1 mm di profondità, in radianti
          float fade = clamp(0.0035 / fw - 0.5, 0., 1.);                      // se il bordo è più stretto di un pixel e mezzo, si spegne
          no = normalize(no - (hp * prof * fade) * (g1 * t1 + g2 * t2));
          gNO = no;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.66 - 0.1 * gBollo, 0.5, gCuc);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(gNO.x * vAx + gNO.y * vAy + gNO.z * vAz) * (gl_FrontFacing ? 1. : -1.);`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.), velo);`);
  };
  mat.customProgramCacheKey = () => 'pallone-v1';
  // copia per il riflesso nel vetro: trasparente, solo dentro la sagoma del vetro (stencil = 1)
  if (opacita < 1) { mat.transparent = true; mat.opacity = opacita; mat.depthWrite = false; }
  if (stencil) { mat.stencilWrite = true; mat.stencilRef = 1; mat.stencilFunc = THREE.EqualStencilFunc; mat.stencilZPass = THREE.KeepStencilOp; mat.stencilFail = THREE.KeepStencilOp; mat.stencilZFail = THREE.KeepStencilOp; }
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'pallone';
  mesh.matrixAutoUpdate = false;
  return { mesh, mat, uniformi: u };
}
