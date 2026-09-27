// Rimbalzo 3D · la palestra. Tutto "cotto" (materiali senza luci, come la foto): costa poco e resta fedele ai colori della foto.
//  · parete di fondo: la foto parete-fondo.png (solo la fascia del muro, 25,9 × 8,6 m) su un piano vero (la parete è piatta:
//    con la camera che si muove resta giusta), 5,6 m dietro la linea di fondo; davanti, le protezioni grigie imbottite (come in
//    palestra-pov.png) fra i due pilastri centrali;
//  · pareti laterali e parete in fondo (dietro chi tira: non si vedono mai, servono per i riflessi e la luce del pallone);
//  · soffitto costruito: lamiera grecata a 9,75 m, travi reticolari ogni 1,6 m (correnti e diagonali istanziati), due travi
//    maestre, due condotte tonde vicino alla parete, pannelli luminosi 62 × 62 cm in file (4 per fila, ogni 4,8 m), ombreggiatura
//    fissa per faccia (sotto più chiaro: la luce rimbalza dal parquet);
//  · parquet: la foto parquet.png ripetuta (listoni lungo il campo), le righe regolamentari FIBA calcolate nello shader (nitide
//    a ogni distanza): fondo, laterali, area 4,90 × 5,80, tiro libero, lunetta (metà tratteggiata dentro l'area), semicerchio
//    no-sfondamento, linea da tre (6,75 m, tratti dritti a 6,60), trattini dell'area, metà campo; pozze di luce sotto i pannelli;
//    lucido: trasparente secondo Fresnel sopra il mondo specchiato (sotto il pavimento: pareti sfocate, soffitto con i bagliori
//    delle luci, protezioni, e le copie di canestro e palla che scena.js aggiorna a ogni fotogramma).
import * as THREE from 'three';

export const SALA = { zParete: -8.0, zFondo: 36.0, mezza: 12.95, hParete: 8.61, soffitto: 9.75, linea: 0.025 };
const tela = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; };
const texDa = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t; };

// ombreggiatura fissa per faccia: colore base × fattore secondo la normale (sotto chiaro, sopra scuro, fianchi medi)
function cuoci(geo, base, f = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.normal, c = new Float32Array(n.count * 3), col = new THREE.Color(base);
  const giu = f.giu ?? 1.08, su = f.su ?? 0.62, lato = f.lato ?? 0.84, fronte = f.fronte ?? 0.95, retro = f.retro ?? 0.8;
  for (let i = 0; i < n.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    let k = ny < -0.5 ? giu : ny > 0.5 ? su : Math.abs(nx) > 0.5 ? lato : nz > 0 ? fronte : retro;
    if (Math.abs(ny) <= 0.5 && Math.abs(ny) > 0.05) k = ny < 0 ? lato + (giu - lato) * (-ny) : lato + (su - lato) * ny;   // superfici curve
    c[i * 3] = col.r * k; c[i * 3 + 1] = col.g * k; c[i * 3 + 2] = col.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
function unisci(geos) {
  const g = geos.map(x => x.index ? x.toNonIndexed() : x);
  let n = 0; for (const x of g) n += x.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const nome of ['position', 'normal', 'color', 'uv']) {
    if (!g.every(x => x.attributes[nome])) continue;
    const k = g[0].attributes[nome].itemSize, A = new Float32Array(n * k); let o = 0;
    for (const x of g) { A.set(x.attributes[nome].array, o * k); o += x.attributes[nome].count; }
    out.setAttribute(nome, new THREE.BufferAttribute(A, k));
  }
  return out;
}

export async function creaPalestra(ctx) {
  const { renderer, carica } = ctx;
  const S = SALA;
  const [texParete, texRiflesso, texParquet] = await Promise.all([carica('img/parete.webp'), carica('img/parete-riflesso.webp'), carica('img/parquet.webp')]);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (const t of [texParete, texRiflesso, texParquet]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; }
  texParquet.wrapS = texParquet.wrapT = THREE.RepeatWrapping;
  const gruppo = new THREE.Group(); gruppo.name = 'palestra';
  const specchio = new THREE.Group(); specchio.name = 'specchio'; specchio.scale.y = -1;   // il mondo sotto il pavimento lucido
  const W = S.mezza * 2, H = S.hParete;
  const nebbia = { fog: true };

  // ——— parete di fondo (foto) ———
  const mParete = new THREE.MeshBasicMaterial({ map: texParete, toneMapped: false });
  const parete = new THREE.Mesh(new THREE.PlaneGeometry(W, H).translate(0, H / 2, S.zParete), mParete); parete.name = 'parete';
  gruppo.add(parete);
  // parete in fondo (dietro chi tira): la stessa, girata
  const fondo = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateY(Math.PI).translate(0, H / 2, S.zFondo), new THREE.MeshBasicMaterial({ map: texParete, toneMapped: false, ...nebbia }));
  gruppo.add(fondo);
  // pareti laterali: la parte sinistra della foto (pilastro, finestre alte, pannelli) ripetuta lungo il campo
  const lati = [];
  const L = S.zFondo - S.zParete, pezzo = 4.9, nP = Math.ceil(L / pezzo);
  for (const s of [-1, 1]) for (let i = 0; i < nP; i++) {
    const g = new THREE.PlaneGeometry(pezzo, H), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) < 0.5 ? 0.012 : 0.2);
    g.rotateY(s * -Math.PI / 2).translate(s * S.mezza, H / 2, S.zParete + (i + 0.5) * pezzo);
    lati.push(g);
  }
  const mLati = new THREE.MeshBasicMaterial({ map: texParete, toneMapped: false, color: 0xe6e0d6, ...nebbia });
  gruppo.add(new THREE.Mesh(unisci(lati), mLati));

  // ——— protezioni imbottite grigie davanti alla parete (fra i pilastri centrali, come nella foto della palestra) ———
  const texImb = texDa(tela(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8e9093'); gr.addColorStop(0.5, '#838588'); gr.addColorStop(1, '#76787b');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i <= 8; i++) { const x = i * w / 8; g.fillStyle = 'rgba(40,42,45,.55)'; g.fillRect(x - 1.5, 0, 3, h); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + 1.5, 0, 2, h); }
  }));
  const pw = 8.3, ph = 2.05, pp = 0.07;
  const imbGeo = new THREE.BoxGeometry(pw, ph, pp).translate(0, ph / 2 + 0.005, S.zParete + pp / 2 + 0.01);
  const mImb = [
    new THREE.MeshBasicMaterial({ color: 0x6e7073, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x6e7073, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0x9a9c9f, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x5a5c5f, toneMapped: false }),
    new THREE.MeshBasicMaterial({ map: texImb, toneMapped: false }), new THREE.MeshBasicMaterial({ color: 0x6e7073, toneMapped: false }),
  ];
  const imb = new THREE.Mesh(imbGeo, mImb); gruppo.add(imb);

  // ——— soffitto ———
  const cSoff = 0xcdb899, cAcc = 0xd8c6a8;
  // lamiera grecata (nervature lungo il campo, ogni 20 cm)
  const texLam = texDa(tela(64, 8, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#a99373'); gr.addColorStop(0.18, '#c8b393'); gr.addColorStop(0.55, '#d3c0a1'); gr.addColorStop(0.75, '#bca787'); gr.addColorStop(1, '#a99373');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
  texLam.wrapS = texLam.wrapT = THREE.RepeatWrapping; texLam.repeat.set(W / 0.2, 1);
  const lamiera = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(Math.PI / 2).translate(0, S.soffitto, (S.zParete + S.zFondo) / 2), new THREE.MeshBasicMaterial({ map: texLam, toneMapped: false, ...nebbia }));
  gruppo.add(lamiera);
  // travi reticolari (lungo x, ogni 1,6 m): correnti sopra e sotto, diagonali a zig-zag ogni 0,8 m
  const cubo = cuoci(new THREE.BoxGeometry(1, 1, 1), cAcc, { giu: 1.12, su: 0.55, lato: 0.86, fronte: 0.92, retro: 0.78 });
  const travi = [];
  const ySu = 9.62, yGiu = 8.98;
  for (let z = S.zParete + 0.8; z < S.zFondo; z += 1.6) {
    travi.push([0, ySu, z, W, 0.07, 0.09, 0], [0, yGiu, z, W, 0.07, 0.09, 0]);
    for (let x = -S.mezza; x < S.mezza - 0.1; x += 0.8) {
      const dx = 0.4, dy = ySu - yGiu, l = Math.hypot(dx, dy), a = Math.atan2(dx, dy);
      travi.push([x + dx / 2, (ySu + yGiu) / 2, z, 0.032, l, 0.032, -a], [x + dx * 1.5, (ySu + yGiu) / 2, z, 0.032, l, 0.032, a]);
    }
  }
  const mTravi = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, ...nebbia });
  const reticolo = new THREE.InstancedMesh(cubo, mTravi, travi.length);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    travi.forEach(([x, y, z, sx, sy, sz, rz], i) => { q.setFromEuler(e.set(0, 0, rz)); m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)); reticolo.setMatrixAt(i, m); }); }
  gruppo.add(reticolo);
  // travi maestre (lungo il campo), condotte, trave in cima alla parete
  const grandi = unisci([
    cuoci(new THREE.BoxGeometry(0.34, 0.8, L).translate(-7.6, 9.25, (S.zParete + S.zFondo) / 2), cAcc),
    cuoci(new THREE.BoxGeometry(0.34, 0.8, L).translate(7.6, 9.25, (S.zParete + S.zFondo) / 2), cAcc),
    cuoci(new THREE.BoxGeometry(W, 0.34, 0.4).translate(0, 8.74, S.zParete + 0.2), 0xd9c8ab, { fronte: 0.9 }),
    cuoci(new THREE.CylinderGeometry(0.2, 0.2, W, 20, 1, true).rotateZ(Math.PI / 2).translate(0, 8.72, S.zParete + 1.0), 0xdccbb0),
    cuoci(new THREE.CylinderGeometry(0.25, 0.25, W, 20, 1, true).rotateZ(Math.PI / 2).translate(0, 9.12, S.zParete + 2.5), 0xd6c4a6),
  ]);
  gruppo.add(new THREE.Mesh(grandi, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, ...nebbia })));
  // pannelli luminosi: 4 per fila, file ogni 4,8 m. Luce oltre il bianco (per il riflesso nella palla e nel ferro)
  const luci = [];
  for (let z = S.zParete + 2.2; z < S.zFondo - 1; z += 4.8) for (const x of [-9.3, -3.1, 3.1, 9.3]) luci.push([x, z]);
  const mLuce = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.975, 0.93).multiplyScalar(7), toneMapped: false, ...nebbia });
  const pannelli = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.62).rotateX(Math.PI / 2), mLuce, luci.length);
  const cornici = new THREE.InstancedMesh(cuoci(new THREE.BoxGeometry(0.7, 0.05, 0.7), 0xb9a88c), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, ...nebbia }), luci.length);
  { const m = new THREE.Matrix4(); luci.forEach(([x, z], i) => { pannelli.setMatrixAt(i, m.makeTranslation(x, 8.94, z)); cornici.setMatrixAt(i, m.makeTranslation(x, 8.97, z)); }); }
  gruppo.add(cornici, pannelli);
  // alone morbido attorno ai pannelli (additivo, leggero)
  const texAlone = texDa(tela(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,248,235,.5)'); gr.addColorStop(0.35, 'rgba(255,244,225,.14)'); gr.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
  const mAlone = new THREE.MeshBasicMaterial({ map: texAlone, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const aloni = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.9, 1.9).rotateX(Math.PI / 2), mAlone, luci.length); aloni.renderOrder = 3;
  { const m = new THREE.Matrix4(); luci.forEach(([x, z], i) => aloni.setMatrixAt(i, m.makeTranslation(x, 8.93, z))); }
  gruppo.add(aloni);

  // ——— parquet ———
  // pozze di luce sotto i pannelli (texture piccola: 1 px = 25 cm)
  const X0 = -S.mezza, Z0 = S.zParete;
  const nPx = Math.ceil(W / 0.25), nPz = Math.ceil(L / 0.25);
  const texPozze = texDa(tela(nPx, nPz, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (const [x, z] of luci) { const px = (x - X0) / 0.25, pz = (z - Z0) / 0.25, gr = g.createRadialGradient(px, pz, 0, px, pz, 22); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  }), false);
  texPozze.flipY = false;
  const mPav = new THREE.ShaderMaterial({
    uniforms: { legno: { value: texParquet }, pozze: { value: texPozze }, dim: { value: new THREE.Vector4(X0, Z0, nPx * 0.25, nPz * 0.25) }, zP: { value: S.zParete }, riflesso: { value: 1 },
      luci: { value: luci.filter(([x, z]) => z < 16).map(([x, z]) => new THREE.Vector3(x, 8.94, z)) } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      #define NL ${luci.filter(([x, z]) => z < 16).length}
      uniform sampler2D legno; uniform sampler2D pozze; uniform vec4 dim; uniform float zP; uniform float riflesso; uniform vec3 luci[NL]; varying vec3 vW;
      float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h); }
      // arco di cerchio (centro c, raggio r) solo dove la condizione vale (z > zmin)
      float arco(vec2 p, vec2 c, float r, float zmin){ return p.y >= zmin ? abs(length(p - c) - r) : 1e3; }
      void main(){
        vec2 p = vW.xz;
        // legno: i listoni (orizzontali nella foto) corrono lungo il campo; piastrella di 1,25 m
        vec3 c = texture2D(legno, vec2(p.y, p.x) / 1.25).rgb;
        float lum = dot(c, vec3(0.3, 0.55, 0.15));
        // vernice color miele (come nella foto della palestra)
        c *= vec3(0.93, 0.8, 0.6);
        // variazioni larghe (niente ripetizione che si vede) e luce: pozze sotto i pannelli, ombra sotto il tabellone e al piede del muro
        float v = 0.965 + 0.035 * sin(p.x * 0.73 + p.y * 0.21) * sin(p.y * 0.57 - p.x * 0.18);
        float luce = texture2D(pozze, (p - dim.xy) / dim.zw).r;
        float ombra = 1. - 0.13 * exp(-(pow(p.x / 1.3, 2.) + pow((p.y - 1.05) / 0.75, 2.)));
        ombra *= 1. - 0.35 * exp(-(p.y - zP) / 0.18);
        c *= v * (0.86 + 0.3 * luce) * ombra;
        // righe (FIBA): mezze larghezze 2,5 cm
        float d = 1e3;
        d = min(d, seg(p, vec2(-7.5, 0.), vec2(7.5, 0.)));                         // fondo
        d = min(d, seg(p, vec2(-7.5, 0.), vec2(-7.5, 14.))); d = min(d, seg(p, vec2(7.5, 0.), vec2(7.5, 14.)));   // laterali
        d = min(d, seg(p, vec2(-7.5, 14.), vec2(7.5, 14.)));                        // metà campo
        d = min(d, arco(p, vec2(0., 14.), 1.8, -1e3));                              // cerchio di centrocampo
        d = min(d, seg(p, vec2(-2.45, 0.), vec2(-2.45, 5.8))); d = min(d, seg(p, vec2(2.45, 0.), vec2(2.45, 5.8)));   // area
        d = min(d, seg(p, vec2(-2.45, 5.8), vec2(2.45, 5.8)));                      // tiro libero
        d = min(d, arco(p, vec2(0., 5.8), 1.8, 5.8));                               // lunetta (fuori dall'area)
        // lunetta dentro l'area: tratteggiata (tratti da 37,5 cm)
        float dT = 1e3, fase = 0.;
        if (p.y < 5.8) { float r = length(p - vec2(0., 5.8)); dT = abs(r - 1.8); fase = atan(p.x, 5.8 - p.y) * 1.8 / 0.75; }
        d = min(d, arco(p, vec2(0., 1.575), 1.25, 1.575));                          // semicerchio no-sfondamento
        d = min(d, seg(p, vec2(-1.25, 1.2), vec2(-1.25, 1.575))); d = min(d, seg(p, vec2(1.25, 1.2), vec2(1.25, 1.575)));
        d = min(d, arco(p, vec2(0., 1.575), 6.75, 2.99));                           // tre punti
        d = min(d, seg(p, vec2(-6.6, 0.), vec2(-6.6, 2.99))); d = min(d, seg(p, vec2(6.6, 0.), vec2(6.6, 2.99)));
        for (int i = 0; i < 4; i++) { float z = 1.75 + float(i) * 0.85 + (i > 0 ? 0.4 : 0.); d = min(d, seg(p, vec2(-2.55, z), vec2(-2.45, z)) + 0.01); d = min(d, seg(p, vec2(2.45, z), vec2(2.55, z)) + 0.01); }
        float aa = fwidth(d) * 0.8 + 1e-4;
        float inch = 1. - smoothstep(0.025 - aa, 0.025 + aa, d);
        // lunetta dentro l'area: tratti da 37,5 cm (maschera con il suo antialias, fuori dal campo delle distanze)
        { float aT = fwidth(dT) * 0.8 + 1e-4, fw = fwidth(fase) + 1e-4, f = fract(fase);
          float m = smoothstep(0., fw, f) * (1. - smoothstep(0.5 - fw, 0.5, f));
          inch = max(inch, (1. - smoothstep(0.025 - aT, 0.025 + aT, dT)) * m); }
        c = mix(c, vec3(0.075, 0.066, 0.058), inch * 0.94);
        // lucido: la parte riflessa (Fresnel, un poco rinforzato come nella foto) lascia vedere il mondo specchiato sotto
        vec3 vv = normalize(cameraPosition - vW);
        float ct = clamp(vv.y, 0., 1.), F = 0.045 + 0.955 * pow(1. - ct, 5.);
        float r = clamp((0.03 + 1.35 * F) * riflesso, 0., 0.58) * (1. - 0.4 * inch);
        // i pannelli del soffitto riflessi nella vernice lucida: un nucleo stretto e un alone (la vernice non è uno specchio);
        // calcolati qui perché il mondo specchiato non può andare oltre il bianco. La grana del legno li spezza appena
        vec3 R = reflect(-vv, vec3(0., 1., 0.));
        float hl = 0.;
        for (int i = 0; i < NL; i++) {
          vec3 d = luci[i] - vW; float k = dot(R, d) * inversesqrt(dot(d, d));
          if (k > 0.95) { hl += pow(k, 650.) * 0.55 + pow(k, 110.) * 0.11; }
        }
        hl *= (0.35 + 0.65 * smoothstep(0.02, 0.25, F + 0.05)) * (0.75 + 0.5 * lum) * (1. - 0.5 * inch) * riflesso;
        // alfa premoltiplicato, fatto a mano nello spazio del framebuffer (sRGB): legno × (1 − r) + riflesso sotto × r + luce
        vec3 o = linearToOutputTexel(vec4(c, 1.)).rgb * (1. - r) + vec3(1., 0.97, 0.9) * hl;
        gl_FragColor = vec4(o, 1. - r);
      }`,
    transparent: true, depthWrite: true, premultipliedAlpha: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const pavimento = new THREE.Mesh(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2).translate(0, 0, (S.zParete + S.zFondo) / 2), mPav);
  pavimento.renderOrder = 1; pavimento.name = 'parquet';
  gruppo.add(pavimento);

  // ——— il mondo specchiato (sotto il pavimento): pareti sfocate, soffitto con i bagliori, protezioni ———
  const mRifl = new THREE.MeshBasicMaterial({ map: texRiflesso, toneMapped: false, color: 0xf2eee8 });
  specchio.add(new THREE.Mesh(parete.geometry, mRifl));
  specchio.add(new THREE.Mesh(unisci(lati), new THREE.MeshBasicMaterial({ map: texRiflesso, toneMapped: false, color: 0xbdb6ab })));
  specchio.add(new THREE.Mesh(lamiera.geometry, new THREE.MeshBasicMaterial({ color: 0xb09c7e, toneMapped: false })));
  // (sfocate e sempre più deboli man mano che ci si allontana dal piede: come sul parquet lucido)
  const texImbS = texDa(tela(128, 64, (g, w, h) => {
    g.filter = 'blur(3px)'; g.drawImage(texImb.image, -6, -6, w + 12, h + 12); g.filter = 'none';
    g.globalCompositeOperation = 'destination-in'; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,.15)'); gr.addColorStop(0.7, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,.95)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
  const imbS = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph).translate(0, ph / 2, S.zParete + pp + 0.01), new THREE.MeshBasicMaterial({ map: texImbS, toneMapped: false, transparent: true, depthWrite: false }));
  imbS.renderOrder = -2; specchio.add(imbS);
  // bagliori delle luci nel lucido: dischi morbidi, più grandi del pannello (il parquet sfoca)
  const texBag = texDa(tela(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,252,244,1)'); gr.addColorStop(0.28, 'rgba(255,248,236,.75)'); gr.addColorStop(0.6, 'rgba(255,244,228,.18)'); gr.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
  const bagliori = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.25, 1.25).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: texBag, color: new THREE.Color(2.2, 2.15, 2.05), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }), luci.length);
  { const m = new THREE.Matrix4(); luci.forEach(([x, z], i) => bagliori.setMatrixAt(i, m.makeTranslation(x, 8.94, z))); }
  bagliori.renderOrder = -1;
  specchio.add(bagliori);
  gruppo.add(specchio);

  return { gruppo, specchio, pavimento, parete, luci, materiali: { mPav, mParete } };
}

// ombra di contatto (sotto la palla): disco sfumato scuro
export function texOmbra() {
  return texDa(tela(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(24,14,6,.62)'); gr.addColorStop(0.35, 'rgba(24,14,6,.34)'); gr.addColorStop(0.7, 'rgba(24,14,6,.08)'); gr.addColorStop(1, 'rgba(24,14,6,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }));
}
