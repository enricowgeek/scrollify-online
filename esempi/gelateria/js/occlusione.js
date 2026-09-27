// Gelateria · ombre di contatto analitiche: ogni pallina è una sfera che scurisce quello che le sta vicino (occlusione di una
// sfera, formula di Íñigo Quílez), e la bocca del cono scurisce il fondo delle palline. Costa pochissimo e toglie l'effetto
// "oggetti appoggiati uno sull'altro senza toccarsi". Si inietta in qualsiasi MeshPhysicalMaterial.
import * as THREE from 'three';

export function creaOcclusione() {
  return {
    uSfere: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -99, 0, 0)) },   // xyz = centro (mondo), w = raggio
    uOrlo: { value: new THREE.Vector4(0, -99, 0, 1) },                            // x, z = asse del cono; y = quota dell'orlo; w = raggio della bocca
    uConoAsse: { value: new THREE.Vector3() },                                    // punta del cono (mondo): per il vincolo delle palline
  };
}

// catena di iniezioni per material.onBeforeCompile (più moduli possono aggiungere la loro)
export function inietta(mat, chiave, fn) {
  const lista = mat.userData.iniezioni || (mat.userData.iniezioni = []);
  lista.push(fn); mat.userData.chiavi = (mat.userData.chiavi || '') + '|' + chiave;
  mat.onBeforeCompile = sh => { for (const f of mat.userData.iniezioni) f(sh); };
  mat.customProgramCacheKey = () => 'gel' + mat.userData.chiavi;
}

// escludi: indice della sfera che è l'oggetto stesso (la pallina non si fa ombra da sola); orlo: scurisce vicino alla bocca del cono
export function conOmbre(mat, occl, { escludi = -1, orlo = false, forza = .85 } = {}) {
  inietta(mat, `ombre${escludi}${orlo ? 'o' : ''}`, sh => {
    Object.assign(sh.uniforms, occl);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGelMondo;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 gw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            gw = instanceMatrix * gw;
          #endif
          vGelMondo = (modelMatrix * gw).xyz; }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGelMondo;\nuniform vec4 uSfere[4];\nuniform vec4 uOrlo;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        {
          vec3 nW = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float aoG = 1.0;
          for (int i = 0; i < 4; i++) {
            ${escludi >= 0 ? `if (i == ${escludi}) continue;` : ''}
            vec4 s = uSfere[i]; if (s.w <= 0.0) continue;
            vec3 di = s.xyz - vGelMondo; float l = max(length(di), 1e-3);
            float occ = clamp(dot(nW, di / l) * (s.w * s.w) / (l * l), 0.0, 1.0);
            aoG *= 1.0 - occ * ${forza.toFixed(3)};
          }
          ${orlo ? `
          float dyO = vGelMondo.y - uOrlo.y, rrO = length(vGelMondo.xz - uOrlo.xz);
          float vic = 1.0 - smoothstep(uOrlo.w * .82, uOrlo.w * 1.28, rrO);
          aoG *= mix(1.0, .28 + .72 * smoothstep(-.12, .42, dyO), vic);` : ''}
          reflectedLight.indirectDiffuse *= aoG; reflectedLight.indirectSpecular *= aoG;
          reflectedLight.directDiffuse *= mix(1.0, aoG, .45); reflectedLight.directSpecular *= mix(1.0, aoG, .6);
        }`);
  });
}
