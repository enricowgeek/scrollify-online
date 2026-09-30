// Velluto · i birilli: profilo vero (LatheGeometry, js/misure.js), laccati avorio con le righe del collo nera e d'oro. Tutti in una sola chiamata (InstancedMesh): i 10 della nostra pista + i 40 delle piste
// accanto. Nel riflesso della pista si scartano i pezzi sotto il piano (i birilli caduti nella fossa).
import * as THREE from 'three';
import { profiloBirillo, triangolo, BIRILLO } from './misure.js';
import { S, COSTANTI, RUMORE, INSEGNA, LUCI, AMBIENTE, NEBBIA } from './glsl.js';

const VERT = /* glsl */`
varying vec3 vW; varying vec3 vN; varying float vH;
void main(){
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  vec4 w = m * vec4(position, 1.);
  vW = w.xyz; vN = normalize(mat3(m) * normal); vH = position.y + ${BIRILLO.baricentro.toFixed(4)};
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
${COSTANTI}${RUMORE}${INSEGNA}${LUCI}${AMBIENTE}${NEBBIA}
uniform float uSpecchio;
varying vec3 vW; varying vec3 vN; varying float vH;
void main(){
  vec3 p = vW;
  if (uSpecchio > .5 && p.y < -.002) discard;
  vec3 n = normalize(vN), V = normalize(cameraPosition - p);
  // le righe del collo: una nera, una d'oro (sottile, sopra)
  float nera = smoothstep(.2345, .2355, vH) - smoothstep(.2485, .2495, vH);
  float oro = smoothstep(.2555, .2565, vH) - smoothstep(.2625, .2635, vH);
  vec3 alb = mix(vec3(.86, .82, .74), vec3(.012, .01, .01), nera);
  alb = mix(alb, vec3(.0), oro);
  // piede appena più scuro (usurato), vicino a terra un filo d'ombra
  alb *= .9 + .1 * smoothstep(.0, .03, vH);
  float ao = mix(.45, 1., smoothstep(-.01, .09, p.y - (p.z < FOSSA ? -.3 : 0.))) ;
  vec3 col = luci(p, n, V, alb, 110., .45, 1.) * ao;
  col += alb * vec3(.025, .02, .03) * ao;
  // la lacca: riflesso dell'ambiente (l'insegna, i faretti); l'oro è metallo
  float F = .05 + .95 * pow(1. - max(dot(n, V), 0.), 5.);
  col += ambiente(p, reflect(-V, n), .06) * F * ao * (1. - oro);
  vec3 ORO = vec3(1., .74, .38);
  col += oro * ORO * (ambiente(p, reflect(-V, n), .15) * 1.6 + luci(p, n, V, vec3(0.), 80., 1.2, 1.)) * ao;
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

export function birilli(scena, U, { telefono }) {
  const geo = new THREE.LatheGeometry(profiloBirillo(46, 12).map(([r, h]) => new THREE.Vector2(r, h - BIRILLO.baricentro)), telefono ? 22 : 30);
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG });
  const sfera = new THREE.Sphere(new THREE.Vector3(0, .2, S.zt - .3), 5.2);
  const n = 50;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = true;
  mesh.layers.enable(1);
  scena.add(mesh);
  // le piste accanto: triangoli fermi
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const tri = triangolo();
  let k = 10;
  for (const xl of [-2, -1, 1, 2].map(i => i * S.passo)) for (const [x, z] of tri) {
    q.setFromAxisAngle(v.set(0, 1, 0), (k * 2.39) % 6.28);
    m.compose(v.set(xl + x, BIRILLO.baricentro, S.zt + z), q, s); mesh.setMatrixAt(k++, m);
  }
  // i nostri: fermi al loro posto finché non arriva la palla
  tri.forEach(([x, z], i) => { m.compose(v.set(x, BIRILLO.baricentro, S.zt + z), q.identity(), s); mesh.setMatrixAt(i, m); });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.boundingSphere = sfera;   // tutti i birilli stanno qui dentro: fuori campo (bar, scarpiera) non si disegnano
  return {
    mesh,
    // posa del birillo i (0…9) con posizione del baricentro e quaternione
    posa(i, pos, quat) { m.compose(pos, quat, s); mesh.setMatrixAt(i, m); },
    fatto() { mesh.instanceMatrix.needsUpdate = true; },
  };
}
