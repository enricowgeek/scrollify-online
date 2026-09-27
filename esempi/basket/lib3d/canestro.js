// Rimbalzo 3D · il canestro, con le misure regolamentari e le proporzioni delle foto (canestro-fronte.png, canestro-lato.png):
//  · tabellone in vetro 1,80 × 1,05 × 12 mm (faccia a z = 1,20, bordo basso a 2,90), trasparente con il riflesso di Fresnel della
//    palestra (cubo catturato all'avvio) e il riflesso vero della palla (una palla specchiata dietro il vetro, ritagliata con lo
//    stencil sulla sagoma del vetro, al 14%);
//  · profilo d'alluminio bianco sul bordo (6 cm), rettangolo bianco 59 × 45 cm con righe da 5 cm (la riga bassa a filo del ferro);
//  · imbottitura nera sul bordo basso e sui fianchi fino a 40 cm, traversa nera dietro il vetro in alto, colonna nera Ø 12 cm che
//    scende dal soffitto dietro il tabellone con due fasce di bulloni, puntoni a V sotto il soffitto;
//  · ferro arancione (Ø 45 cm interno, tubo Ø 18 mm, bordo alto a 3,05) con la piastra sul vetro, le due alette e i 12 ganci;
//  · retina: fili bianchi (cilindri istanziati, un disegno) e nodi, posizioni dalla simulazione (fisica.js).
// Il gruppo "tabellone" (vetro, profili, imbottitura, ferro, retina) può vibrare: ruota di pochi millesimi di radiante attorno
// alla staffa alta.
import * as THREE from 'three';
import { CAN, RETE } from './fisica.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// unisce geometrie non indicizzate (posizioni, normali) in una
function unisci(geos) {
  const g = geos.map(x => x.index ? x.toNonIndexed() : x);
  let n = 0; for (const x of g) n += x.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const x of g) { P.set(x.attributes.position.array, o * 3); N.set(x.attributes.normal.array, o * 3); o += x.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}
const scatola = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// barra con gli spigoli arrotondati lungo x (sezione h × d, raggio r), lunga L, centrata
function barraTonda(L, h, d, r, segs = 3) {
  const s = new THREE.Shape(), a = h / 2 - r, b = d / 2 - r;
  s.moveTo(-b, -h / 2); s.lineTo(b, -h / 2); s.absarc(b, -a, r, -Math.PI / 2, 0); s.lineTo(d / 2, a); s.absarc(b, a, r, 0, Math.PI / 2);
  s.lineTo(-b, h / 2); s.absarc(-b, a, r, Math.PI / 2, Math.PI); s.lineTo(-d / 2, -a); s.absarc(-b, -a, r, Math.PI, Math.PI * 1.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false, curveSegments: segs });
  g.translate(0, 0, -L / 2); g.rotateY(Math.PI / 2);          // sezione nel piano y-z, lunghezza lungo x
  g.computeVertexNormals();
  return g;
}

export function creaCanestro(ctx) {
  const { env, envCubo } = ctx;
  const gruppo = new THREE.Group(); gruppo.name = 'canestro';
  const tab = new THREE.Group(); tab.name = 'tabellone';        // vibra
  const perno = V(0, 3.86, CAN.zVetro - 0.17);                  // staffa alta sulla colonna
  tab.position.copy(perno); gruppo.add(tab);
  const dentro = new THREE.Group(); dentro.position.copy(perno).negate(); tab.add(dentro);

  const zV = CAN.zVetro, yB = CAN.yBasso, W = CAN.largh, H = CAN.alt, yC = yB + H / 2, sp = CAN.spess;
  // ——— materiali ———
  const mBianco = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.3, metalness: 0.25, envMap: env, envMapIntensity: 1.1, emissive: 0x7d7d7b });
  const mVernice = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0, envMap: env, envMapIntensity: 1.0, emissive: 0x8e8d8a });
  const mNero = new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.55, metalness: 0.1, envMap: env, envMapIntensity: 1.1 });
  const mImbott = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.72, metalness: 0, envMap: env, envMapIntensity: 1.0 });
  const mCol = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.38, metalness: 0.35, envMap: env, envMapIntensity: 1.2 });
  const mBulloni = new THREE.MeshStandardMaterial({ color: 0xb8b8b4, roughness: 0.3, metalness: 0.9, envMap: env });
  const mFerro = new THREE.MeshPhysicalMaterial({ color: 0xe0501a, roughness: 0.34, metalness: 0.15, clearcoat: 0.7, clearcoatRoughness: 0.25, envMap: env, envMapIntensity: 1.1 });
  const mRete = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMap: env, envMapIntensity: 1.1, emissive: 0x5e5e5c });

  // ——— vetro: una lastra con lo shader del vetro (tinta leggera + riflesso di Fresnel, alfa premoltiplicato) ———
  const vetroGeo = new THREE.BoxGeometry(W - 0.02, H - 0.02, sp).translate(0, yC, zV - sp / 2);
  const mVetro = new THREE.ShaderMaterial({
    uniforms: { cubo: { value: envCubo }, tinta: { value: new THREE.Color(0xc9d6d0) }, alfa: { value: 0.07 }, forza: { value: 1.0 }, lampo: { value: 0 } },
    vertexShader: `varying vec3 vW; varying vec3 vN;
      void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform samplerCube cubo; uniform vec3 tinta; uniform float alfa; uniform float forza; uniform float lampo; varying vec3 vW; varying vec3 vN;
      void main(){
        vec3 v = normalize(cameraPosition - vW), n = normalize(vN); if (dot(n, v) < 0.) n = -n;
        float c = clamp(dot(n, v), 0., 1.), F = 0.045 + 0.955 * pow(1. - c, 5.);
        vec3 r = textureCube(cubo, reflect(-v, n)).rgb;
        // lastra: la luce passa (1 − a), il riflesso si somma; di taglio il vetro diventa più verde e più riflettente
        float a = alfa + 0.25 * pow(1. - c, 3.);
        // il framebuffer è in sRGB: la somma (riflesso) va scritta come incremento, senza la conversione (che la gonfierebbe)
        vec3 add = tinta * a * 0.4 + r * F * (forza + lampo);
        gl_FragColor = vec4(add * 0.62, a);
      }`,
    transparent: true, depthWrite: false, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const vetro = new THREE.Mesh(vetroGeo, mVetro); vetro.renderOrder = 12; vetro.name = 'vetro'; dentro.add(vetro);
  // stencil: la sagoma del vetro (solo dove il vetro si vede) per il riflesso della palla
  const mStencil = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  const sagoma = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, H - 0.02).translate(0, yC, zV + 0.0005), mStencil); sagoma.renderOrder = 10; dentro.add(sagoma);

  // ——— profilo d'alluminio sul bordo (fronte 6 cm, profondo 4 cm) ———
  const bf = 0.06, pd = 0.04, zf = zV - sp / 2;
  const profilo = unisci([
    scatola(W, bf, pd, 0, yB + H - bf / 2, zf), scatola(W, bf, pd, 0, yB + bf / 2, zf),
    scatola(bf, H - 2 * bf, pd, -W / 2 + bf / 2, yC, zf), scatola(bf, H - 2 * bf, pd, W / 2 - bf / 2, yC, zf),
  ]);
  dentro.add(new THREE.Mesh(profilo, mBianco));
  // rettangolo: 59 × 45 cm fuori, righe da 5 cm, la riga bassa con il bordo alto a filo del ferro (3,05)
  const rw = 0.59, rh = 0.45, lw = 0.05, ry0 = 3.0, zr = zV + 0.0008;
  const rett = unisci([
    new THREE.PlaneGeometry(rw, lw).translate(0, ry0 + lw / 2, zr), new THREE.PlaneGeometry(rw, lw).translate(0, ry0 + rh - lw / 2, zr),
    new THREE.PlaneGeometry(lw, rh - 2 * lw).translate(-rw / 2 + lw / 2, ry0 + rh / 2, zr), new THREE.PlaneGeometry(lw, rh - 2 * lw).translate(rw / 2 - lw / 2, ry0 + rh / 2, zr),
  ]);
  dentro.add(new THREE.Mesh(rett, mVernice));
  // ——— imbottitura nera: sotto (lungo tutto il bordo) e sui fianchi fino a 40 cm ———
  const ib = 0.07, ip = 0.07;
  const imb = unisci([
    barraTonda(W + 0.05, ib, ip, 0.018).translate(0, yB - ib / 2 + 0.01, zV - sp / 2),
    barraTonda(0.4, ib, ip, 0.018).rotateZ(Math.PI / 2).translate(-W / 2 - 0.0, yB + 0.2, zV - sp / 2),
    barraTonda(0.4, ib, ip, 0.018).rotateZ(Math.PI / 2).translate(W / 2 + 0.0, yB + 0.2, zV - sp / 2),
  ]);
  dentro.add(new THREE.Mesh(imb, mImbott));
  // traversa nera dietro il vetro, in alto; piastre degli attacchi
  const zC = CAN.zVetro - 0.17;
  const neri = unisci([
    scatola(1.42, 0.05, 0.035, 0, 3.86, zV - sp - 0.02),
    scatola(0.22, 0.2, 0.05, 0, 3.86, zV - sp - 0.045), scatola(0.22, 0.2, 0.05, 0, 3.06, zV - sp - 0.045),
    scatola(0.07, 0.07, zV - sp - 0.07 - zC, 0, 3.86, (zV - sp - 0.07 + zC) / 2), scatola(0.07, 0.07, zV - sp - 0.07 - zC, 0, 3.06, (zV - sp - 0.07 + zC) / 2),
  ]);
  dentro.add(new THREE.Mesh(neri, mNero));

  // ——— colonna appesa: Ø 12 cm da 2,80 fino al soffitto, fasce con i bulloni, puntoni a V ———
  const fisso = new THREE.Group(); gruppo.add(fisso);          // non vibra
  const cima = 8.95;
  const col = unisci([
    new THREE.CylinderGeometry(0.06, 0.06, cima - 2.8, 28).translate(0, (cima + 2.8) / 2, zC),
    new THREE.CylinderGeometry(0.063, 0.063, 0.012, 28).translate(0, 2.8, zC),
    // fasce (morsetti) alla staffa alta e bassa
    scatola(0.2, 0.2, 0.2, 0, 3.86, zC), scatola(0.2, 0.2, 0.2, 0, 3.06, zC),
    // puntoni a V fino al soffitto e traverso
    ...[-1, 1].map(s => { const a = V(0, 6.9, zC), b = V(s * 1.7, cima, zC), L = a.distanceTo(b); return new THREE.CylinderGeometry(0.04, 0.04, L, 16).rotateZ(-s * Math.atan2(1.7, cima - 6.9)).translate((a.x + b.x) / 2, (a.y + b.y) / 2, zC); }),
    scatola(3.8, 0.09, 0.09, 0, cima - 0.04, zC),
  ]);
  fisso.add(new THREE.Mesh(col, mCol));
  const bul = [];
  for (const y of [3.86, 3.06]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) bul.push(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 10).rotateZ(Math.PI / 2).translate(sx * 0.106, y + sy * 0.07, zC + 0.06));
  fisso.add(new THREE.Mesh(unisci(bul), mBulloni));

  // ——— ferro, piastra, alette, ganci ———
  const A = CAN.anello;
  const ferroGeo = [new THREE.TorusGeometry(A.R, A.tubo, 14, 96).rotateX(Math.PI / 2).translate(A.x, A.y, A.z)];
  // piastra sul vetro (sotto il ferro, a cavallo del bordo basso)
  ferroGeo.push(scatola(0.2, 0.1, 0.01, 0, 3.0, zV + 0.005));
  // appoggio sotto il ferro (piatto) e due alette triangolari
  const zb = A.z - A.R - 0.005;
  ferroGeo.push(scatola(0.11, 0.01, zb - zV, 0, A.y - 0.014, (zb + zV) / 2));
  for (const s of [-1, 1]) {
    const t = new THREE.Shape(); t.moveTo(0, 0); t.lineTo(zb - zV + 0.01, 0); t.lineTo(0, -0.11); t.closePath();
    const g = new THREE.ExtrudeGeometry(t, { depth: 0.008, bevelEnabled: false }); g.rotateY(-Math.PI / 2);
    g.translate(s * 0.05 + 0.004, A.y - 0.016, zV); ferroGeo.push(g);
  }
  // 12 ganci sotto il tubo (piccoli anelli)
  for (let i = 0; i < RETE.N; i++) {
    const a = 2 * Math.PI * i / RETE.N;
    const g = new THREE.TorusGeometry(0.0075, 0.0022, 6, 12, Math.PI * 1.3).rotateZ(Math.PI * 1.35).rotateY(a + Math.PI / 2)
      .translate(A.x + (A.R - 0.002) * Math.sin(a), A.y - A.tubo - 0.004, A.z + (A.R - 0.002) * Math.cos(a));
    ferroGeo.push(g);
  }
  const ferro = new THREE.Mesh(unisci(ferroGeo.map(g => { g.computeVertexNormals(); return g; })), mFerro); ferro.name = 'ferro';
  dentro.add(ferro);

  // ——— retina: fili (due tratti per filo) e nodi ———
  const nT = 12 * RETE.giri * 2 * 2;
  const cil = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const fili = new THREE.InstancedMesh(cil, mRete, nT); fili.frustumCulled = false; fili.name = 'retina';
  fili.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const nodiMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mRete, 12 * RETE.giri); nodiMesh.frustumCulled = false;
  nodiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dentro.add(fili, nodiMesh);
  const _m = new THREE.Matrix4(), _a = V(0, 0, 0), _b = V(0, 0, 0), _d = V(0, 0, 0), _q = new THREE.Quaternion(), _y = V(0, 1, 0), _s = V(1, 1, 1);
  // X: posizioni dei nodi (mondo); tratti: coppie di indici. Il gruppo "dentro" ha lo spostamento del perno: le posizioni del
  // mondo vanno portate nelle coordinate del tabellone fermo (dentro = −perno, tab = +perno: a riposo l'identità)
  function aggiornaRete(X, tratti, nNodi, spesso = RETE.filo) {
    for (let k = 0; k < tratti.length; k++) {
      const [a, b] = tratti[k];
      _a.fromArray(X, a * 3); _b.fromArray(X, b * 3); _d.subVectors(_b, _a);
      const L = _d.length(); _q.setFromUnitVectors(_y, _d.divideScalar(L || 1));
      _m.compose(_a.add(_b).multiplyScalar(0.5), _q, _s.set(spesso, L + spesso * 0.6, spesso)); fili.setMatrixAt(k, _m);
    }
    fili.instanceMatrix.needsUpdate = true;
    // nodi (i giri sotto il ferro: dal 12 in poi fra i primi nNodi)
    for (let i = RETE.N; i < nNodi; i++) {
      _a.fromArray(X, i * 3); _m.compose(_a, _q.identity(), _s.setScalar(spesso * 1.9)); nodiMesh.setMatrixAt(i - RETE.N, _m);
    }
    nodiMesh.instanceMatrix.needsUpdate = true;
  }

  // vibrazione: ms dall'urto → rotazione attorno alla staffa alta (x) e un filo di torsione
  function vibra(ms, ridotto) {
    if (ms === null || ms < 0 || ms > 900 || ridotto) { tab.rotation.set(0, 0, 0); mVetro.uniforms.lampo.value = 0; return; }
    const t = ms / 1000, k = Math.exp(-t / 0.2);
    tab.rotation.x = 0.0045 * k * Math.sin(2 * Math.PI * 11 * t);
    tab.rotation.z = 0.0012 * k * Math.sin(2 * Math.PI * 7 * t + 1);
    mVetro.uniforms.lampo.value = 0.35 * Math.exp(-t / 0.12);
  }
  const materiali = { mBianco, mVernice, mNero, mImbott, mCol, mBulloni, mFerro, mRete, mVetro };
  return { gruppo, tab, dentro, fisso, vetro, sagoma, ferro, fili, nodiMesh, aggiornaRete, vibra, materiali };
}
