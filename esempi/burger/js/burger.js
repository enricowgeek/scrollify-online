// Doppio Strato · un burger dalla sua foto "esplosa" (dati e atlante da src/prepara.py).
// Ogni strato è un solido di rotazione con la sagoma della foto (raggio per riga); tutti gli strati di un burger stanno in UNA
// geometria (un solo disegno): il vertex shader sposta ogni strato col suo uniform (aperto/chiuso, schiacciato, tonfo).
// Nel fragment shader la foto si proietta sul solido: davanti è la foto (x = xc + r·sinθ), dietro due copie della fascia
// centrale della foto (niente pixel stirati ai lati), con passaggi a macchia (rumore) invece che sfumati. Trasparenza dalla foto
// (alphaToCoverage: bordi morbidi con l'MSAA), rilievo e ruvidità dalla mappa aux, formaggio che cola (uCola) sugli strati di carne.
import * as THREE from 'three';

// per tipo: affonda = quanto lo strato entra in quello sotto quando è chiuso (frazione del suo spessore), schiaccia = altezza da
// chiuso (1 = come nella foto esplosa), lucido = clearcoat
export const TIPI = {
  pane: { affonda: .03, schiaccia: 1, lucido: .55 },
  salsa: { affonda: .6, schiaccia: .55, lucido: 1 },
  cetrioli: { affonda: .1, schiaccia: .92, lucido: .7 },
  cipolla: { affonda: .08, schiaccia: .95, lucido: .8 },
  bacon: { affonda: .4, schiaccia: .72, lucido: .45 },
  manzo: { affonda: .05, schiaccia: 1, lucido: .6 },
  pomodoro: { affonda: .06, schiaccia: .97, lucido: .9 },
  insalata: { affonda: .3, schiaccia: .7, lucido: .45 },
  anelli: { affonda: .12, schiaccia: .9, lucido: .25 },
  funghi: { affonda: .2, schiaccia: .85, lucido: .5 },
};
export const NS = 12;
const FRANGIA = new Set(['insalata', 'bacon', 'salsa', 'anelli', 'funghi', 'cetrioli']);   // sagoma frastagliata: alfa della foto fino al bordo
const PIENI = new Set(['pane', 'pomodoro']);   // strati al massimo per burger (uniform array)
export const DIAMETRO = 11;   // cm: il pane di sotto di ogni burger (così i piatti sono uguali)

async function immagine(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`burger: ${url} ${r.status}`);
  const b = await r.blob();
  // decodifica fuori dal filo principale; niente premoltiplicazione (il colore fuori dal bordo serve alle mipmap)
  return createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}
function texture(img, srgb) {
  const t = new THREE.Texture(img);
  t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
  return t;
}
export async function carica(id, base = 'img/') {
  const [dati, col, aux] = await Promise.all([fetch(`${base}${id}.json`).then(r => r.json()), immagine(`${base}${id}.webp`), immagine(`${base}${id}-aux.webp`)]);
  return { dati, col: texture(col, true), aux: texture(aux, false) };
}

// ————————————————————————————— geometria —————————————————————————————
// posizione in cm nel sistema dello strato (y = 0 al fondo del nucleo, asse in x = z = 0); aFoto = (θ, v atlante, raggio u,
// centro u); aInfo = (strato, rel = 0 in cima … 1 in fondo, carne 0/1, tappo: 1 sopra, −1 sotto, 0 fianco)
function geometria(D, S, SEG) {
  const pos = [], nor = [], fot = [], inf = [], idx = [], nuc = [], cap = [];
  const Wf = D.larghezza, Hf = D.righe;
  const intervalli = [];   // per strato: [primo indice, quanti indici] (per disegnare uno strato da solo: componi.js)
  D.strati.forEach((st, k) => {
    const i0 = idx.length;
    let P = st.profilo; const ref = st.nucleo[1];
    if (st.nome === 'pane-sopra' && P[0][0] > 2) {
      // la sagoma in cima è piatta (la foto vede la cupola un filo dall'alto): si chiude con una calotta tonda
      const r0 = P[0][0], y0 = P[0][1], h = r0 * .22, cal = [];
      for (let i = 6; i >= 1; i--) { const t = i / 6, a = t * Math.PI / 2; cal.push([r0 * Math.cos(a), y0 - h * Math.sin(a)]); }
      P = [[0, y0 - h], ...cal.slice(1), ...P];
    }
    const vA = row => (st.fascia[0] + (row - (st.top - st.pad))) / Hf;
    const rAt = row => {   // raggio (px foto) alla riga, dal profilo
      if (row <= P[0][1]) return P[0][0];
      for (let i = 1; i < P.length; i++) if (row <= P[i][1]) { const [r0, y0] = P[i - 1], [r1, y1] = P[i]; return r0 + (r1 - r0) * (row - y0) / Math.max(1e-6, y1 - y0); }
      return P[P.length - 1][0];
    };
    const xcU = (st.xc - D.x0) / Wf, carne = st.tipo === 'manzo' ? 1 : 0, alt = Math.max(1, st.bot - st.top);
    const capD = Math.min(24, alt * .2);
    const [nT, nB] = st.nucleo;
    // la foto sul fianco: la cupola del pane di sopra non prende le primissime righe (l'orlo della sagoma, mezzo trasparente)
    const margine = 0;
    const rigaF = row => Math.max(st.top + margine, row);
    // anelli: [r (px), row (px), nr, ny, rowFoto, rFoto, tappo]
    const strisce = [];
    // tappi al nucleo (non alla punta più alta della sagoma: sopra e sotto il nucleo il fianco continua come una frangia
    // trasparente dove la foto è verde: riccioli dell'insalata, punte del bacon, gocce). La foto sul tappo: le righe appena
    // dentro il nucleo, compresse verso il centro
    // il tappo: la foto proiettata in piano (davanti = la riga dell'orlo, dietro = righe più dentro): niente raggi dal centro
    const tappo = (row, su) => { const r0 = rAt(row); return [0, .3, .6, .82, 1].map(f => [r0 * f, row, 0, su ? 1 : -1, row, r0, su ? 1 : -1, f, (su ? 1 : -1) * capD]); };
    // gli strati frastagliati (insalata, bacon, salse, anelli, funghi…) non hanno tappi: dall'alto si vede la frangia di dentro,
    // non un disco piatto
    const aperto = st.tipo === 'salsa';   // le salse: un velo senza fondo; gli altri frastagliati hanno un fondo al nucleo (visto fra i riccioli)
    if (!aperto) strisce.push(tappo(FRANGIA.has(st.tipo) ? Math.round(nT + (nB - nT) * .4) : nT, true));
    // normali da un profilo molto lisciato (i riccioli e le onde della sagoma non devono fare anelli di luce: il dettaglio
    // lo ha già la foto); negli strati frastagliati tirate ancora verso l'orizzontale
    const y0p = Math.floor(st.top), n = Math.ceil(st.bot) - y0p + 1, liscio = new Float32Array(n);
    for (let i = 0; i < n; i++) liscio[i] = rAt(y0p + i);
    const sig = st.tipo === 'pane' ? 4 : 11, ker = [];
    for (let d = -3 * sig; d <= 3 * sig; d++) ker.push(Math.exp(-d * d / (2 * sig * sig)));
    const lis = new Float32Array(n);
    for (let i = 0; i < n; i++) { let a = 0, w = 0; for (let d = -3 * sig; d <= 3 * sig; d++) { const j = i + d; if (j < 0 || j >= n) continue; const k = ker[d + 3 * sig]; a += liscio[j] * k; w += k; } lis[i] = a / w; }
    const piatto = FRANGIA.has(st.tipo) ? .45 : 0;
    const fianco = P.map(p => {
      const i = Math.min(n - 1, Math.max(0, Math.round(p[1] - y0p))), a = lis[Math.max(0, i - 3)], b = lis[Math.min(n - 1, i + 3)];
      // tangente (giù lungo il profilo): dr, dy (in px, y verso il basso) → normale verso fuori: (dy, dr) con y in su
      let dr = b - a, dy = Math.min(n - 1, i + 3) - Math.max(0, i - 3); const l = Math.hypot(dr, dy) || 1; dr /= l; dy /= l;
      dr *= 1 - piatto; dy = dy + (1 - dy) * piatto;
      const rf = rigaF(p[1]);
      return [p[0], p[1], dy, dr, rf, rf === p[1] ? p[0] : rAt(rf), 0, -1, 0];
    });
    strisce.push(fianco);
    if (!aperto) strisce.push(tappo(nB, false).reverse());
    for (const anelli of strisce) {
      const base = pos.length / 3;
      for (const [r, row, nr, ny, rowF, rF, tp, fC, dC] of anelli) {
        const y = (ref - row) * S, rr = r * S, ln = Math.hypot(nr, ny) || 1;
        for (let j = 0; j <= SEG; j++) {
          const th = -Math.PI + 2 * Math.PI * j / SEG, s = Math.sin(th), c = Math.cos(th);
          pos.push(rr * s, y, rr * c); nor.push(nr / ln * s, ny / ln, nr / ln * c);
          fot.push(th, vA(rowF), rF / Wf, xcU);
          inf.push(k, Math.min(1, Math.max(0, (rowF - st.top) / alt)), carne, tp);
          nuc.push(tp !== 0 || (row >= nT - 1 && row <= nB + 1) || (st.nome === 'pane-sopra' && row < nT) ? 1 : 0);
          cap.push(fC, dC / Hf);
        }
      }
      for (let a = 0; a < anelli.length - 1; a++) for (let j = 0; j < SEG; j++) {
        const i0 = base + a * (SEG + 1) + j, i1 = i0 + SEG + 1;
        idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1);
      }
    }
    intervalli.push([i0, idx.length - i0]);
  });
  const g = new THREE.BufferGeometry();
  g.userData.intervalli = intervalli;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aFoto', new THREE.Float32BufferAttribute(fot, 4));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(inf, 4));
  g.setAttribute('aNucleo', new THREE.Float32BufferAttribute(nuc, 1));
  g.setAttribute('aTappo', new THREE.Float32BufferAttribute(cap, 2));
  g.setIndex(idx);
  return g;
}

// ————————————————————————————— shader —————————————————————————————
const VERT_PARS = `#include <common>
uniform float uFrangia[ ${NS} ];
attribute vec4 aFoto; attribute vec4 aInfo; attribute float aNucleo; varying float vNucleo; attribute vec2 aTappo; varying vec3 vTappo;
uniform vec4 uStrato[${NS}];   // x, y: spostamento (cm), z: altezza (schiacciato), w: aria sopra (cm)
uniform vec4 uStrato2[${NS}];  // x: aria sotto (cm), y: gonfia (tonfo: si allarga un filo quando si schiaccia)
uniform vec4 uStrato3[${NS}];  // chiuso: inclinazioni (rotola, beccheggia, rad) e spostamenti (x, z, cm): gli strati non sono in bolla
varying vec4 vFoto; varying vec4 vInfo; varying vec2 vAria;`;
const VERT_NORMAL = `#include <beginnormal_vertex>
int kS = int( aInfo.x + .5 );
vec4 S1 = uStrato[ kS ]; vec4 S2 = uStrato2[ kS ];
objectNormal = normalize( vec3( objectNormal.x / S2.y, objectNormal.y / S1.z, objectNormal.z / S2.y ) );
vec4 S3 = uStrato3[ kS ];
float cR = cos( S3.x ), sR = sin( S3.x ), cP = cos( S3.y ), sP = sin( S3.y );
mat3 inclina = mat3( cR, sR, 0., -sR, cR, 0., 0., 0., 1. ) * mat3( 1., 0., 0., 0., cP, sP, 0., -sP, cP );
objectNormal = inclina * objectNormal;`;
const VERT_POS = `#include <begin_vertex>
// strati frastagliati: di lato e dietro la frangia non è un anello perfetto (sporge e ondeggia); davanti resta la foto
if ( uFrangia[ kS ] > .5 ) {
  float thV = aFoto.x, kk = aInfo.x, lato = smoothstep( .55, 1.35, abs( thV ) );
  float n1 = sin( thV * 5. + kk * 1.7 ) * .55 + sin( thV * 9. - kk * 2.3 + 1.3 ) * .3 + sin( thV * 17. + kk ) * .15;
  float n2 = sin( thV * 7. + kk * 2.9 + .7 ) * .6 + sin( thV * 13. - kk * .8 ) * .4;
  float bordo = abs( aInfo.y - .5 ) * 2.;
  transformed.xz *= 1. + .05 * n1 * ( .45 + .55 * bordo ) * lato;
  transformed.y += .24 * n2 * ( .35 + .65 * bordo ) * lato;
}
transformed.y *= S1.z; transformed.xz *= S2.y;
transformed = inclina * transformed; transformed.xz += S3.zw;
transformed.x += S1.x; transformed.y += S1.y;
vFoto = aFoto; vInfo = aInfo; vAria = vec2( S1.w, S2.x ); vNucleo = aNucleo;
vTappo = vec3( aTappo.x * sin( aFoto.x ), aTappo.x * cos( aFoto.x ), aTappo.y );`;

const FRAG_PARS = `#include <common>
uniform sampler2D uCol; uniform sampler2D uAux; uniform float uCola; uniform float uColaV;
uniform float uLuce; uniform float uVelo; uniform vec3 uFondo; uniform float uFrangia[ ${NS} ]; uniform float uFronte;
varying vec4 vFoto; varying vec4 vInfo; varying vec2 vAria; varying float vNucleo; varying vec3 vTappo;
float bH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float bN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3. - 2. * f );
  return mix( mix( bH( i ), bH( i + vec2( 1, 0 ) ), f.x ), mix( bH( i + vec2( 0, 1 ) ), bH( i + vec2( 1, 1 ) ), f.x ), f.y ); }
float bWrap( float a ) { return a - 6.2831853 * floor( ( a + 3.14159265 ) / 6.2831853 ); }
vec3 bPerturba( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
  vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) ); vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) ); vec3 vN = surf_norm;
  vec3 R1 = cross( vSigmaY, vN ); vec3 R2 = cross( vN, vSigmaX ); float fDet = dot( vSigmaX, R1 ) * faceDirection;
  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
  return normalize( abs( fDet ) * surf_norm - vGrad );
}
float bRuvido; float bLucido; float bAO; float bH0;`;

// davanti la foto (|θ| < ~60°), poi le copie A (centro +2,1 rad) e B (−2,1): ognuna stende ±1,2 rad di superficie sulla fascia
// centrale della foto (±1 rad → x da −0,84 a 0,84 del raggio). Due campioni sempre (niente rami con le derivate)
const FRAG_MAP = `
float th = vFoto.x, vv = vFoto.y, rU = vFoto.z, xcU = vFoto.w;
float at = abs( th );
float nz = bN( vec2( th * 5.5, vv * 55. ) ) + .5 * bN( vec2( th * 13., vv * 140. ) ) - .75;
float dA = bWrap( th - 2.1 ), dB = bWrap( th + 2.1 );
vec2 uvF = vec2( xcU + sin( th ) * rU, vv ), uvA = vec2( xcU + sin( dA / 1.2 ) * rU, vv ), uvB = vec2( xcU + sin( dB / 1.2 ) * rU, vv );
float dF = cos( th ) * rU, dAd = cos( dA / 1.2 ) * rU / 1.2, dBd = cos( dB / 1.2 ) * rU / 1.2;
vec2 uv1, uv2; float d1, d2, w2;
if ( at < 1.9 ) {
  uv1 = uvF; d1 = dF; bool pos = th >= 0.; uv2 = pos ? uvA : uvB; d2 = pos ? dAd : dBd;
  w2 = smoothstep( .3, .7, smoothstep( .72, 1.06, at ) + nz * .32 );   // davanti la foto fin dove è stirata al massimo 2×
} else {
  uv1 = uvA; d1 = dAd; uv2 = uvB; d2 = dBd;
  float wA = 1. - smoothstep( .86, 1.0, abs( dA ) / 1.2 + nz * .12 ), wB = 1. - smoothstep( .86, 1.0, abs( dB ) / 1.2 + nz * .12 );
  w2 = wB / max( wA + wB, 1e-3 );
}
vec2 dth = vec2( dFdx( th ), dFdy( th ) ); dth -= 6.2831853 * floor( dth / 6.2831853 + .5 );
vec2 dvv = vec2( dFdx( vv ), dFdy( vv ) );
vec2 gx1 = vec2( d1 * dth.x, dvv.x ), gy1 = vec2( d1 * dth.y, dvv.y ), gx2 = vec2( d2 * dth.x, dvv.x ), gy2 = vec2( d2 * dth.y, dvv.y );
if ( abs( vInfo.w ) > .5 ) {
  // tappo: proiezione in piano (x = la x della foto, la profondità = le righe della fascia vicino all'orlo), un filo sfocata
  vec2 uvT = vec2( xcU + vTappo.x * rU * .9, vv + .55 * vTappo.z );
  float fr0 = uFrangia[ int( vInfo.x + .5 ) ];
  // gradiente costante (non le derivate): il livello di sfocatura è lo stesso in tutto il tappo (niente "X" al centro dove i
  // triangoli sono piccoli)
  vec2 tx = vec2( fr0 > .5 ? .008 : .022, 0. ), ty = vec2( 0., fr0 > .5 ? .008 : .022 );
  uv1 = uvT; uv2 = uvT; w2 = 0.; gx1 = gx2 = tx; gy1 = gy2 = ty;
}
vec4 c1 = textureGrad( uCol, uv1, gx1, gy1 ), c2 = textureGrad( uCol, uv2, gx2, gy2 );
vec4 a1 = textureGrad( uAux, uv1, gx1, gy1 ), a2 = textureGrad( uAux, uv2, gx2, gy2 );
vec4 colF = mix( c1, c2, w2 ); vec3 auxF = mix( a1.rgb, a2.rgb, w2 );
// strati frastagliati (insalata, bacon, salse…): di fronte la sagoma è quella della foto fin quasi al bordo
float fr = uFrangia[ int( vInfo.x + .5 ) ];
colF.a = fr < -.5 ? max( smoothstep( .5, .9, vNucleo ), mix( c1.a, c2.a, w2 ) ) : mix( c1.a, c2.a, vInfo.w == 0. && fr > .5 ? mix( w2, smoothstep( 1.3, 1.56, at ), uFronte ) : w2 );
// il formaggio cola: sulla carne il formaggio si allunga verso il basso (si legge la maschera un po' più su)
if ( vInfo.z > .5 && uCola > .001 ) {
  float nc = bN( vec2( uv1.x * 26., 1.7 ) ), dv = uCola * uColaV * smoothstep( .03, .42, vInfo.y ) * ( .25 + 1.6 * nc * nc );   // alcune gocce scendono tanto, altre poco
  vec2 o = vec2( 0., -dv );
  vec4 cu1 = textureGrad( uCol, uv1 + o, gx1, gy1 ), cu2 = textureGrad( uCol, uv2 + o, gx2, gy2 );
  vec4 au1 = textureGrad( uAux, uv1 + o, gx1, gy1 ), au2 = textureGrad( uAux, uv2 + o, gx2, gy2 );
  vec4 cu = mix( cu1, cu2, w2 ); vec3 au = mix( au1.rgb, au2.rgb, w2 );
  float k = smoothstep( .3, .7, au.b ) * smoothstep( .05, .3, au.b - auxF.b );
  colF = mix( colF, vec4( cu.rgb, max( colF.a, cu.a ) ), k ); auxF = mix( auxF, vec3( .5, au.g, au.b ), k );
}
if ( abs( vInfo.w ) > .5 ) colF.rgb *= ( .86 + .28 * ( bN( vTappo.xy * 38. ) * .6 + bN( vTappo.xy * 95. ) * .4 ) ) * ( uFrangia[ int( vInfo.x + .5 ) ] > .5 ? .5 : 1. );   // la grana del taglio; il fondo dei frastagliati è in ombra
diffuseColor.rgb *= colF.rgb; diffuseColor.a *= colF.a;
bRuvido = max( auxF.g, .24 ); bH0 = auxF.r; bLucido = smoothstep( .46, .16, auxF.g );
// i tappi (facce piane orizzontali sotto la lampada): opachi e un po' mossi, se no fanno un disco lucido "di vetro"
if ( abs( vInfo.w ) > .5 ) { bRuvido = max( bRuvido, .62 ); bLucido *= .12; bH0 = bH0 * .5 + .5 * ( bN( vTappo.xy * 30. ) * .6 + bN( vTappo.xy * 75. ) * .4 ); }
// ombre di contatto: sotto lo strato di sopra (aria sopra piccola) e sopra quello di sotto; più forti sui tappi
float rel = vInfo.y, tp = vInfo.w;
float suS = ( 1. - smoothstep( 0., 1.1, vAria.x ) ) * ( tp > .5 ? .75 : ( 1. - smoothstep( 0., .2, rel ) ) * .6 );
float giuS = ( 1. - smoothstep( 0., 1.1, vAria.y ) ) * ( tp < -.5 ? .8 : ( 1. - smoothstep( .8, 1., rel ) ) * .5 );
float lontano = tp > .5 ? .28 * ( 1. - smoothstep( 0., 3.5, vAria.x ) ) : 0.;   // aperto: il tappo sta un po' all'ombra dello strato sopra
bAO = ( 1. - suS ) * ( 1. - giuS ) * ( 1. - lontano );
diffuseColor.rgb *= bAO;`;
const FRAG_ROUGH = `float roughnessFactor = roughness * bRuvido;`;
const FRAG_NORMAL = `#include <normal_fragment_maps>
{ vec2 dH = vec2( dFdx( bH0 ), dFdy( bH0 ) ) * .45; normal = bPerturba( - vViewPosition, normal, dH, faceDirection ); }`;
const FRAG_LIGHTS = `#include <lights_physical_fragment>
material.clearcoat *= bLucido * bAO; material.specularF90 *= mix( .35, 1., bAO );`;
const FRAG_OUT = `outgoingLight = mix( uFondo, outgoingLight * uLuce, uVelo );
#include <opaque_fragment>`;

export function materiale({ col, aux }, U, lucido = .55) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide, alphaTest: .5, alphaToCoverage: true,
    clearcoat: lucido, clearcoatRoughness: .22, envMapIntensity: .7,
  });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, U, { uCol: { value: col }, uAux: { value: aux } });
    s.vertexShader = s.vertexShader.replace('#include <common>', VERT_PARS).replace('#include <beginnormal_vertex>', VERT_NORMAL).replace('#include <begin_vertex>', VERT_POS);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', FRAG_PARS).replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH).replace('#include <normal_fragment_maps>', FRAG_NORMAL)
      .replace('#include <lights_physical_fragment>', FRAG_LIGHTS).replace('#include <opaque_fragment>', FRAG_OUT);
  };
  m.customProgramCacheKey = () => 'burger-strati';
  return m;
}

// ————————————————————————————— il burger —————————————————————————————
// costruisci(caricato, { seg, fondo }) → { gruppo, mesh, strati, altezzaChiuso, altezzaAperto, raggio, imposta(stato), U }
// stato: { apertura (0 chiuso … 1 esploso come nella foto, oppure array per strato), schiaccia (tonfo: 0…1 per strato o numero),
//          cola (0…1), luce, velo }
export function costruisci(C, O = {}) {
  const D = C.dati, N = D.strati.length;
  if (N > NS) throw new Error(`burger ${D.id}: troppi strati (${N} > ${NS})`);
  const fondo = D.strati[N - 1];
  const S = DIAMETRO / (2 * fondo.rmax);   // cm per px della foto
  const geo = geometria(D, S, O.seg ?? 48);
  const U = {
    uStrato: { value: Array.from({ length: NS }, () => new THREE.Vector4(0, 0, 1, 9)) },
    uStrato2: { value: Array.from({ length: NS }, () => new THREE.Vector4(9, 1, 0, 0)) },
    uStrato3: { value: Array.from({ length: NS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uCola: { value: 0 }, uColaV: { value: 26 / D.righe },
    uLuce: { value: 1 }, uVelo: { value: 1 }, uFondo: O.fondo ?? { value: new THREE.Color(0, 0, 0) },
    // 1 = sagoma frastagliata (alfa della foto fino al bordo, di fronte), −1 = pieno (pane, pomodoro: niente buchi), 0 = normale
    uFrangia: { value: Array.from({ length: NS }, (_, k) => FRANGIA.has(D.strati[k]?.tipo) ? 1 : PIENI.has(D.strati[k]?.tipo) ? -1 : 0) },
    uFronte: { value: 1 },   // 1 = il burger guarda la camera (la sagoma frastagliata della foto vale solo di fronte)
  };
  const mat = materiale(C, U, .38);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const gruppo = new THREE.Group(); gruppo.add(mesh);

  // misure per strato (cm): nucleo (per impilarli), posto nella foto esplosa, estremi veri (sagoma)
  const strati = D.strati.map((st, k) => {
    const T = TIPI[st.tipo] ?? TIPI.pane;
    return {
      k, nome: st.nome, tipo: st.tipo, T,
      spessore: (st.nucleo[1] - st.nucleo[0]) * S,                     // nucleo
      sopra: (st.nucleo[1] - st.top) * S, sotto: (st.bot - st.nucleo[1]) * S,   // dalla base del nucleo alla cima / al fondo della sagoma
      raggio: st.rmax * S,
      yA: (fondo.nucleo[1] - st.nucleo[1]) * S, xA: (st.xc - fondo.xc) * S,   // aperto = la foto
      yC: 0,
    };
  });
  // chiuso: dal basso, ogni strato poggia sul nucleo di quello sotto (meno quanto ci affonda)
  // chiuso: dal basso, ogni strato poggia sul nucleo di quello sotto e ci affonda un po'. Se la pila viene più alta della foto
  // chiusa (dati.chiusoRapporto = altezza / larghezza del pane di sotto), i morbidi si schiacciano di più, affondano l'uno
  // nell'altro e si allargano un filo (c = quanto, trovato per bisezione): il burger chiuso è compatto, non una torre
  const MORB_C = { insalata: 1, bacon: 1, salsa: 1, anelli: .55, funghi: .8, cipolla: .6, cetrioli: .6, pomodoro: .4, manzo: .14, pane: .08 };
  function impila(c) {
    for (const s of strati) {
      const w = MORB_C[s.tipo] ?? .3;
      // i morbidi più che schiacciarsi affondano l'uno nell'altro (la frangia trasparente lo permette) e sbordano un po'
      s.sqC = Math.max(.55, s.T.schiaccia * (1 - .28 * w * c)); s.affC = Math.min(.9, s.T.affonda + .5 * w * c); s.gC = 1 + .1 * w * Math.min(1, c);
    }
    let y = 0;
    for (let k = N - 1; k >= 0; k--) {
      const s = strati[k]; s.yC = y;
      if (k > 0) y += s.spessore * s.sqC - strati[k - 1].spessore * strati[k - 1].sqC * strati[k - 1].affC;
    }
    const t = strati[0];
    return t.yC + t.spessore * t.sqC + Math.max(0, t.sopra - t.spessore) * t.sqC;
  }
  const hT = O.altezzaChiusa ?? (D.chiusoRapporto ? D.chiusoRapporto * DIAMETRO : 0);
  let compatto = 0, altezzaChiuso = impila(0);
  if (hT && altezzaChiuso > hT) {
    let a = 0, b = 2;
    for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (impila(m) > hT) a = m; else b = m; }
    compatto = b; altezzaChiuso = impila(b);
  }
  const top = strati[0];
  const altezzaAperto = top.yA + top.sopra;
  const raggio = Math.max(...strati.map(s => s.raggio));
  const fondoSotto = strati[N - 1].sotto;   // sotto la base del nucleo del pane (fino al piatto)

  // chiuso, gli strati non sono perfettamente in bolla né centrati (valori ripetibili per burger e strato); aperti tornano come nella foto
  let seme = [...D.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647 || 1;
  const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647 - .5;
  const STORTO = strati.map(s => s.tipo === 'pane' && s.k === N - 1 ? [0, 0, 0, 0]
    : [rnd() * (s.tipo === 'pane' ? .035 : .05), rnd() * (s.tipo === 'pane' ? .04 : .06), rnd() * .3, rnd() * .3]);
  // stato corrente per strato (riusati: niente allocazioni per fotogramma)
  const Y = new Float32Array(N), SQ = new Float32Array(N), GF = new Float32Array(N);
  // morbidezza al tonfo (quanto si schiaccia in più) e quanto si allarga
  const MORBIDO = { pane: .06, insalata: .12, bacon: .1, salsa: .14, anelli: .05, funghi: .06, manzo: .03 };
  const GONFIA = { salsa: .04, manzo: .012, insalata: .015 };
  function imposta(st) {
    const ap = st.apertura ?? 0, sch = st.schiaccia ?? 0, y0 = st.y ?? 0, aria = st.aria ?? 1;   // aria: più spazio fra gli strati aperti
    let calo = 0;   // il tonfo: chi sta sopra scende di quanto si sono schiacciati quelli sotto
    for (let k = N - 1; k >= 0; k--) {
      const s = strati[k], a = typeof ap === 'number' ? ap : ap[k], q = typeof sch === 'number' ? sch : sch[k];
      const sq0 = s.sqC + (1 - s.sqC) * a, sq = sq0 * (1 - q * (MORBIDO[s.tipo] ?? .02));
      SQ[k] = sq; GF[k] = (1 + (s.gC - 1) * (1 - a)) * (1 + q * (GONFIA[s.tipo] ?? .006));
      Y[k] = s.yC + (s.yA * aria - s.yC) * a - calo + y0;
      calo += s.spessore * (sq0 - sq);
      U.uStrato.value[k].set(s.xA * a, Y[k], sq, 9);
      const c = 1 - a, T3 = STORTO[k]; U.uStrato3.value[k].set(T3[0] * c, T3[1] * c, T3[2] * c, T3[3] * c);
    }
    // aria fra gli strati (per le ombre di contatto): base del nucleo di chi sta sopra − cima del nucleo di chi sta sotto
    for (let k = 0; k < N; k++) {
      const su = k > 0 ? Y[k - 1] - (Y[k] + strati[k].spessore * SQ[k]) : 9;
      const giu = k < N - 1 ? Y[k] - (Y[k + 1] + strati[k + 1].spessore * SQ[k + 1]) : 0;
      U.uStrato.value[k].w = Math.max(0, su);
      U.uStrato2.value[k].set(Math.max(0, giu), GF[k], 0, 0);
    }
    U.uCola.value = st.cola ?? 0;
    if (st.luce !== undefined) U.uLuce.value = st.luce;
    if (st.velo !== undefined) U.uVelo.value = st.velo;
  }
  imposta({ apertura: 0 });
  return { id: D.id, gruppo, mesh, materiale: mat, strati, U, imposta, altezzaChiuso, altezzaAperto, raggio, fondoSotto, S, compatto, geo, C, triangoli: geo.index.count / 3 };
}
