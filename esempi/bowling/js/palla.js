// Velluto · la palla: resina nera con le venature d'oro (calcolate nello spazio della palla, così girano con lei), lucidissima,
// coi tre fori (pollice e due dita) e il bordo d'ottone: si vede girare anche da lontano.
import * as THREE from 'three';
import { PALLA } from './misure.js';
import { COSTANTI, RUMORE, INSEGNA, LUCI, AMBIENTE, NEBBIA } from './glsl.js';

const VERT = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec3 vColore;
#ifdef RASTRELLIERA
attribute vec3 iColore;
#endif
void main(){
  mat4 m = modelMatrix;
  #ifdef USE_INSTANCING
  m = m * instanceMatrix;
  #endif
  #ifdef RASTRELLIERA
  vColore = iColore;
  #else
  vColore = vec3(0.);
  #endif
  vO = normalize(position); vec4 w = m * vec4(position, 1.); vW = w.xyz; vN = normalize(mat3(m) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;

// i fori: direzioni nello spazio della palla e raggio (radianti sulla sfera)
const FORI = [[0, .96, -.28, .118], [-.17, .9, .4, .1], [.17, .9, .4, .1]].map(([x, y, z, r]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l, r]; });

const FRAG = /* glsl */`
${COSTANTI}${RUMORE}${INSEGNA}${LUCI}${AMBIENTE}${NEBBIA}
uniform float uSpecchio;
varying vec3 vW; varying vec3 vN; varying vec3 vO; varying vec3 vColore;
const vec4 F0 = vec4(${FORI[0].map(v => v.toFixed(4))}), F1 = vec4(${FORI[1].map(v => v.toFixed(4))}), F2 = vec4(${FORI[2].map(v => v.toFixed(4))});
float foro(vec3 o, vec4 f, out float bordo){
  float a = acos(clamp(dot(o, f.xyz), -1., 1.));
  bordo = smoothstep(f.w + .03, f.w + .005, a) * smoothstep(f.w - .012, f.w + .004, a);
  return smoothstep(f.w + .003, f.w - .006, a) * (.55 + .45 * smoothstep(f.w, f.w * .2, a));
}
void main(){
  vec3 p = vW;
  if (uSpecchio > .5 && p.y < -.002) discard;
  vec3 n = normalize(vN), V = normalize(cameraPosition - p), o = normalize(vO);
  // il marmo: rumore piegato su sé stesso (venature lunghe), tre toni
  vec3 w = o * 1.7 + vec3(fbm3(o * 1.3 + 3.1), fbm3(o * 1.3 + 7.7), fbm3(o * 1.3 + 1.9)) * 2.2;
  float m = fbm3(w * 1.4);
  float vena = smoothstep(.035, .0, abs(m - .52)) + smoothstep(.07, .0, abs(fbm3(w * 2.6 + 4.) - .5)) * .5;
  vena = clamp(vena, 0., 1.);
  vec3 alb = mix(vec3(.018, .016, .016), vec3(.035, .03, .026), smoothstep(.35, .65, m));
  // profondità della resina: un velo fumé sotto la lacca, dove guardi di fronte
  alb += vec3(.02, .016, .012) * pow(max(dot(n, V), 0.), 3.);
  float b0, b1, b2;
  float h = max(foro(o, F0, b0), max(foro(o, F1, b1), foro(o, F2, b2)));
  float bordo = max(b0, max(b1, b2));
  #ifdef RASTRELLIERA
  // le palle della rastrelliera: il loro colore, venato di un tono più chiaro dello stesso colore
  alb = mix(vColore * (.7 + .5 * smoothstep(.3, .7, m)), min(vColore * 2.2 + .02, vec3(1.)), vena * .6);
  vena = 0.; float spRast = .35;
  #else
  float spRast = 1.2;
  #endif
  alb = mix(alb, vec3(.006, .005, .005), h);
  vec3 ORO = vec3(1., .72, .34);
  float ao = mix(1., .55, smoothstep(.05, -.02, p.y - (p.z < FOSSA ? -.3 : 0.)));
  #ifdef RASTRELLIERA
  vec3 col = luci(p, n, V, alb, 40., spRast * (1. - h), 1.) * ao + alb * vec3(.03, .02, .03);
  #else
  vec3 col = luci(p, n, V, alb, 240., spRast * (1. - h), 1.) * ao + alb * vec3(.03, .02, .03);
  #endif
  float F = .045 + .955 * pow(1. - max(dot(n, V), 0.), 5.);
  col += ambiente(p, reflect(-V, n), .02) * F * (1. - h) * ao;
  // le venature d'oro (metallo: riflettono le luci calde) e l'anello d'ottone dei fori
  float oro = max(vena * (1. - h), bordo);
  col = mix(col, ORO * (ambiente(p, reflect(-V, n), .18) * 2.2 + luci(p, n, V, vec3(0.), 70., 1.4, 1.) + vec3(.03, .02, .012)) * ao, oro * .92);
  gl_FragColor = vec4(nebbia(col, p), 1.);
}`;

// le palle colorate della rastrelliera: [x, y, z, colore]
export function palleColorate(U, posti, tinte) {
  const geo = new THREE.SphereGeometry(PALLA.r, 40, 28), n = posti.length;
  const mesh = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, defines: { RASTRELLIERA: '' } }), n);
  const col = new Float32Array(n * 3), m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  posti.forEach(([x, y, z, c], i) => {
    q.setFromEuler(new THREE.Euler(i * 1.7, i * 2.3, i * .9));
    m.compose(v.set(x, y, z), q, s); mesh.setMatrixAt(i, m); col.set(tinte[c], i * 3);
  });
  geo.setAttribute('iColore', new THREE.InstancedBufferAttribute(col, 3));
  mesh.computeBoundingSphere();
  mesh.layers.enable(1);
  return mesh;
}

export function palla(scena, U, { telefono }) {
  const geo = new THREE.SphereGeometry(PALLA.r, telefono ? 48 : 64, telefono ? 32 : 44);
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG }));
  mesh.layers.enable(1);
  scena.add(mesh);
  return mesh;
}
