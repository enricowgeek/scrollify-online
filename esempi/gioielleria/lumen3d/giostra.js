// Lumen 3D · giostra: tutti gli orologi della libreria in UNA scena, un solo renderer, un solo motore.
// La posizione x (0 … N−1, continua) arriva da fuori (lo scroll della pagina). L'orologio a distanza d = i − x dal centro
// va di lato, indietro, girato verso il centro e in penombra; quello al centro è in luce, gira piano da fermo, si trascina
// (inerzia, poi torna di fronte) e si inclina verso il cursore. Mentre arriva al centro lo attraversa una lama di luce:
// una striscia dello studio vista nel riflesso (vetro, piani lucidi, satinato), non un velo disegnato sopra.
// uso: const g = await monta(host, { modelli, prova: 'verde×5', x: 0 }); g.vai(x); g.su('centro', (n, voce) => …)
// opzioni: modelli (id di modelli/indice.js, di serie tutti; quelli che non esistono ancora sono saltati), prova ('verde×5' =
// cinque Meridiano Verde, prova di carico), x (posizione iniziale), esposizione, pixelRatio (massimo, 2), ombra (true),
// fermo (niente dondolo né inclinazione: di serie con prefers-reduced-motion), lama (forza, 0 = spenta), fondo (colore della pagina
// dietro ai laterali, '#111112': chi entra sfuma da lì), zona ({ su, giu, lato }: margini del centrale nell'host, frazioni),
// conserva (legge i pixel, solo verifiche)
// opzioni per l'apertura di index.html (la giostra è l'eroe della pagina):
//   anello (la fila si chiude in cerchio: a ogni posizione ci sono orologi da tutte e due le parti; chi esce da un lato rientra
//   dall'altro, fuori schermo e al buio) · panoramica (0 … 1 di partenza: 1 = tutti raccolti in profondità, il centrale davanti,
//   i lontani più piccoli e al buio; 0 = la giostra; poi panoramica(k)) · primaIlCentro (scarica e costruisce prima il centrale, i moduli degli altri solo dopo il primo
//   fotogramma: le voci sono quelle dell'elenco e uno che non si carica diventa un 'errore', al posto di essere saltato) ·
//   zona anche come funzione (W, H) → { su, giu, lato }
// larghezze: il centrale non supera una frazione dello schermo che dipende dalla forma della zona (CENTRALE_MAX) e i laterali si
// mettono dopo il suo bordo (SOVRAPPOSTO, PASSO_LARGO): a 800 px non gli finiscono addosso
// restituisce { voci, N, saltati, tutti (promessa), vai(x, subito), panoramica(k, subito), su(evento, f), x(), centro(), pausa(), fermo(), info(), libera() }
// eventi (su): 'centro' (n, voce) quando cambia l'orologio al centro · 'scelta' (n, voce) click/tap su un laterale ·
// 'scorri' (±1) trascinamento fuori dal centrale · 'costruito' (n, voce) · 'tutti' () · 'errore' (voce, e)
import * as THREE from 'three';
import { preparaRenderer, creaMotore } from './motore.js';
import { MODELLI, carica } from './modelli/indice.js';

const TAU = Math.PI * 2;
// misura comune (inquadratura del Verde, mm): ogni orologio si scala per starci dentro, così appaiono tutti grandi uguali
const RIF = { altezza: 94, larghezza: 70 };
const FOV = 24, ELEVAZIONE = .1;   // gradi; radianti (la camera guarda un filo dall'alto: il piano delle ombre si vede)

// disposizione: valori chiave a distanza |d| = 0, 1, 2, 3, 4. fx = posizione orizzontale in mezze larghezze visibili a quella
// profondità (1 = bordo dello schermo), z = profondità (mm), ang = quanto è girato verso il centro (rad), luce = penombra.
// LARGO per lo schermo orizzontale, ALTO per il telefono in verticale (laterali appena visibili ai bordi); in mezzo si mescolano
const LARGO = { fx: [0, .5, .9, 1.28, 1.66], z: [0, -85, -175, -265, -355], ang: [0, .62, .86, 1, 1.1], luce: [1, .4, .12, .03, 0], tuffo: 26 };
const ALTO = { fx: [0, 1.3, 1.85, 2.4, 2.9], z: [0, -75, -155, -235, -315], ang: [0, .72, .92, 1.02, 1.1], luce: [1, .32, .12, .03, 0], tuffo: 40 };
// tuffo (mm): durante lo scambio i due orologi arretrano un poco (a mezzo passo), si incrociano e il nuovo torna avanti
// larghezza massima del centrale (mezza larghezza, in frazioni di mezzo schermo) secondo la forma della zona (larghezza / altezza):
// sul telefono riempie la larghezza, a 800 px resta a metà e lascia aria ai laterali, sugli schermi larghi comanda l'altezza
const CENTRALE_MAX = [[.8, .86], [1, .64], [1.35, .5], [1.9, .4]];
// schermo largo: il primo laterale comincia dove finisce il centrale (può coprirne al massimo SOVRAPPOSTO), i successivi a
// PASSO_LARGO larghezze l'uno dall'altro; mai più vicini dei valori di LARGO
const SOVRAPPOSTO = .06, PASSO_LARGO = .89;
// panoramica (l'apertura): i cinque raccolti in profondità, come una giostra piccola vista da più lontano: il centrale davanti e
// più grande, i due vicini più indietro, i due estremi ancora più indietro (più piccoli, più al buio). Per |d| = 0, 1, 2:
// q = grandezza rispetto al centrale della giostra (è la profondità: la distanza dalla camera è D / q); sigma = distanza fra i
// centri in larghezze (sotto 1 si sovrappongono); sy = altezza del centrale sullo schermo (frazione dall'alto); alza = quanto i
// lontani salgono verso l'orizzonte (0 = centri in riga, 1 = tutti sullo stesso pavimento, come nella giostra); ang = girati
// verso il centro; bordo = gli estremi dentro questa frazione di mezzo schermo; alt = altezza massima del centrale (frazione
// dello schermo: sopra e sotto c'è il testo di benvenuto). Scorrendo ognuno va dal suo posto qui al suo posto nella giostra
const PANO_LARGO = { q: [.66, .48, .37], sigma: .7, sy: .54, alza: .35, ang: [0, .3, .5], luce: [1, .8, .6], bordo: .84, alt: .45 };
const PANO_ALTO = { q: [.82, .54, .4], sigma: .5, sy: .52, alza: .4, ang: [0, .42, .66], luce: [1, .76, .54], bordo: 1.35, alt: .42 };
const TENUTA = .45;       // quanto l'orologio "resta" al centro prima di scivolare via (0 = lineare con lo scroll)
const LAMA = { forza: 11, larghezza: .006, altezza: .45, corsa: .17 };   // larghezza e altezza: mezze, in radianti; corsa = di quanto scorre

// ————————————————————————————— luce per orologio e lama (nello shader dei materiali del motore) —————————————————————————————
// ogni orologio ha i suoi cloni dei materiali (stesse texture, stessi programmi) con le sue uniform: uLuce (penombra), uVelo
// (entrata: da 0 = colore del fondo a 1 = pieno; così chi arriva dopo non compare come sagoma nera), uLama (azimut della
// striscia nello spazio vista, forza, mezza larghezza, mezza altezza) e uLamaY (quota del riflesso al centro).
// La lama è una striscia dello studio, lontana, a bordi netti come un softbox: si somma dove il riflesso R la guarda; i bordi
// si ammorbidiscono con la ruvidità (vetro e lucido = riga netta, satinato = velo largo e debole)
const GLSL_PARS = '#include <common>\nuniform float uLuce;\nuniform float uVelo;\nuniform vec3 uFondo;\nuniform vec4 uLama;\nuniform float uLamaY;';
const GLSL_LAMA = `{
  vec3 lamaR = reflect( - geometryViewDir, normal );
  float lamaS = sin( uLama.x ), lamaC = cos( uLama.x ), lamaY = lamaR.y - uLamaY;
  float lamaP = lamaR.x * lamaC - lamaR.z * lamaS + lamaY * .3;   // un filo inclinata: sul vetro passa in diagonale
  float lamaM = .0015 + material.roughness * material.roughness * 1.2;   // bordo: netto sul vetro e sul lucido, sfatto sul satinato
  float lamaB = ( 1. - smoothstep( uLama.z - lamaM, uLama.z + lamaM, abs( lamaP ) ) )
    * smoothstep( 0., .3, lamaR.x * lamaS + lamaR.z * lamaC ) * ( 1. - smoothstep( uLama.w, uLama.w + .25, abs( lamaY ) ) );
  vec3 lamaF = max( material.specularColor, vec3( .3 ) );   // anche vetro e smalti la mostrano (è la loro riga bianca)
  lamaF += ( 1. - lamaF ) * pow( 1. - saturate( dot( normal, geometryViewDir ) ), 5. );
  outgoingLight += uLama.y * lamaB * lamaF * pow( ( uLama.z + .0015 ) / ( uLama.z + lamaM ), 1.5 );
}
outgoingLight = mix( uFondo, outgoingLight * uLuce, uVelo );
#include <opaque_fragment>`;
const GLSL_LUCE = 'outgoingLight = mix( uFondo, outgoingLight * uLuce, uVelo );\n#include <opaque_fragment>';
function conLama(s) { s.fragmentShader = s.fragmentShader.replace('#include <common>', GLSL_PARS).replace('#include <opaque_fragment>', GLSL_LAMA); }
function soloLuce(s) { s.fragmentShader = s.fragmentShader.replace('#include <common>', GLSL_PARS).replace('#include <opaque_fragment>', GLSL_LUCE); }
// clona un materiale del motore per un orologio: le uniform U sono dell'orologio, il programma resta condiviso (stessa chiave).
// Il fondo verso cui sfuma l'entrata: nero per il vetro (additivo), il colore della pagina per gli altri (con o senza tone mapping)
const NERO = { value: new THREE.Color(0, 0, 0) };
function clona(m, U, F) {
  const c = m.clone();
  const fisico = m.isMeshStandardMaterial, fondo = m.blending === THREE.AdditiveBlending ? NERO : m.toneMapped ? F.tm : F.lin;
  c.onBeforeCompile = s => {
    Object.assign(s.uniforms, { uLuce: U.uLuce, uVelo: U.uVelo, uFondo: fondo, uLama: U.uLama, uLamaY: U.uLamaY });
    (fisico ? conLama : soloLuce)(s);
  };
  c.customProgramCacheKey = () => fisico ? 'lumen-giostra-lama' : 'lumen-giostra-luce';
  return c;
}

// ————————————————————————————— curve della disposizione —————————————————————————————
// Hermite fra i valori chiave a 0…4 (tangenti di Catmull-Rom); pari = simmetrica in d (tangente nulla al centro)
function curva(K, a, pari) {
  if (a >= 4) return K[4] + (K[4] - K[3]) * (a - 4);
  const i = Math.floor(a), t = a - i, p0 = K[i], p1 = K[i + 1];
  const m0 = i === 0 ? (pari ? 0 : K[1]) : (K[i + 1] - K[i - 1]) / 2;
  const m1 = i === 3 ? K[4] - K[3] : (K[i + 2] - K[i]) / 2;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (3 * t2 - 2 * t3) * p1 + (t3 - t2) * m1;
}
const liscio = t => t * t * (3 - 2 * t);
const tra = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
// tabella [[x, valore], …] a tratti lineari (fuori dai capi: il valore del capo)
function tabella(T, x) {
  if (x <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const [a, va] = T[i - 1], [b, vb] = T[i]; return va + (vb - va) * (x - a) / (b - a); }
  return T[T.length - 1][1];
}
// tre valori a |d| = 0, 1, 2, lineari fra loro (panoramica)
const tre = (V, a) => a >= 2 ? V[2] : a >= 1 ? V[1] + (V[2] - V[1]) * (a - 1) : V[0] + (V[1] - V[0]) * a;

// ————————————————————————————— elenco —————————————————————————————
// 'verde×5' → cinque volte meridiano-verde; un nome corto vale per l'id che finisce così
function elenco(O) {
  if (O.prova) {
    const m = /^(.+?)\s*[×x*]\s*(\d+)$/.exec(O.prova);
    if (!m) throw new Error(`lumen3d/giostra: prova "${O.prova}" non valida (es. 'verde×5')`);
    const id = MODELLI.find(v => v.id === m[1])?.id ?? MODELLI.find(v => v.id.endsWith(m[1]))?.id;
    if (!id) throw new Error(`lumen3d/giostra: nessun modello "${m[1]}"`);
    return Array.from({ length: +m[2] }, () => id);
  }
  return O.modelli ?? MODELLI.map(v => v.id);
}

export async function monta(host, O = {}) {
  const t0 = performance.now(), tempi = {};
  const grossolano = matchMedia('(pointer:coarse)').matches;
  const fermo = { ora: O.fermo ?? matchMedia('(prefers-reduced-motion:reduce)').matches };
  const lamaK = O.lama ?? 1;   // forza della lama (0 = spenta)

  const anello = !!O.anello;
  // modelli. Di serie: tutti i moduli prima di cominciare, e quelli che non esistono ancora (import fallito) si saltano senza errori.
  // primaIlCentro: le voci sono quelle dell'elenco (nomi da indice.js) e si scarica subito solo il modulo del centrale; gli altri
  // partono dopo il primo fotogramma (sulla rete lenta non rubano banda alla foto del quadrante del primo)
  const ids = elenco(O);
  let voci, saltati;
  if (O.primaIlCentro) {
    voci = ids.map((id, i) => ({ i, id, nome: MODELLI.find(m => m.id === id)?.nome ?? id, modulo: null, caricamento: null }));
    saltati = [];
  } else {
    const moduli = await Promise.allSettled(ids.map(id => carica(id)));
    voci = [];
    moduli.forEach((r, k) => { if (r.status === 'fulfilled') voci.push({ i: voci.length, id: ids[k], nome: r.value.nome, modulo: r.value }); });
    if (!voci.length) throw new Error('lumen3d/giostra: nessun modello disponibile');
    saltati = ids.filter((_, k) => moduli[k].status !== 'fulfilled');
  }
  const N = voci.length;
  // distanza nella fila: con l'anello si prende la via più corta intorno al cerchio (fra −N/2 e N/2)
  const avvolgi = d => (anello ? d - N * Math.round(d / N) : d);
  tempi.moduli = performance.now() - t0;

  // renderer, motore, scena, camera
  const prMax = Math.min(O.pixelRatio ?? 2, 2);
  let pr = Math.min(devicePixelRatio || 1, prMax);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!O.conserva });
  renderer.setPixelRatio(pr);
  preparaRenderer(renderer, { esposizione: O.esposizione ?? 1 });
  const tela = renderer.domElement;
  Object.assign(tela.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' });
  host.appendChild(tela);
  const motore = creaMotore(renderer, { luce: O.luce, riempimento: O.riempimento });
  const scena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 10, 3000);
  const vN = new THREE.Vector3(), vV = new THREE.Vector3(), vR = new THREE.Vector3(), vP = new THREE.Vector3();   // lama e panoramica, riusati a ogni fotogramma
  // fondo della pagina dietro ai laterali (per l'entrata): lineare per il quadrante (senza tone mapping) e "pre-tone mapping"
  // per gli altri (NeutralToneMapping sotto 0,08 dà circa 6,25·x²: si inverte)
  const fondoLin = new THREE.Color(O.fondo ?? '#111112');
  const FONDO = { lin: { value: fondoLin }, tm: { value: new THREE.Color(...fondoLin.toArray().map(c => (c < .04 ? Math.sqrt(c / 6.25) : c) / (O.esposizione ?? 1))) } };
  let sporco = true;   // qualcosa è cambiato: il prossimo fotogramma va disegnato
  tempi.motore = performance.now() - t0;

  // ——— misure: distanza della camera (il centrale entra nella zona), disposizione mescolata per il formato ———
  const L = { fx: new Float64Array(5), z: new Float64Array(5), ang: new Float64Array(5), luce: new Float64Array(5), tuffo: 0 };
  // panoramica: posti nel mondo per d = −2 … 2 (indice d + 2), girata e luce per |d| = 0, 1, 2
  const P = { pos: Array.from({ length: 5 }, () => new THREE.Vector3()), ang: [0, 0, 0], luce: [1, 1, 1], q: [1, 1, 1], sx: [0, 0, 0] };
  let W = 1, H = 1, aspetto = 1, D = 300, tanM = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), formaZona = 1;
  function misura() {
    W = host.clientWidth || innerWidth; H = host.clientHeight || innerHeight; aspetto = W / H;
    renderer.setSize(W, H, false);
    const zz = typeof O.zona === 'function' ? O.zona(W, H) : O.zona;
    const z = zz ?? (aspetto < .9 ? { su: .05, giu: .03, lato: .07 } : { su: .07, giu: .02, lato: .1 });
    const alto = Math.max(.2, 1 - z.su - z.giu), largo = Math.max(.2, 1 - 2 * z.lato);
    // la forma della zona del centrale (larghezza / altezza) decide tutto: così la disposizione è la stessa sia che l'host sia
    // solo la fascia degli orologi (prova-giostra3d) sia tutto lo schermo con il testo sotto (index.html)
    const za = formaZona = aspetto / alto;
    const cMax = Math.min(largo, tabella(CENTRALE_MAX, za));
    D = Math.max(RIF.altezza / 2 / tanM / alto, RIF.larghezza / 2 / (tanM * aspetto) / cMax);
    const k = liscio(tra(za, .77, 1.37));   // 0 = telefono in verticale, 1 = schermo largo
    // schermo largo: i laterali partono dal bordo del centrale (hc = sua mezza larghezza in frazioni di mezzo schermo; s = quanto
    // rimpicciolisce ciascuno con la profondità)
    const hc = RIF.larghezza / 2 / (D * tanM * aspetto), cE = Math.cos(ELEVAZIONE);
    const s = LARGO.z.map(q => D / (D - q * cE)), fxL = [0, Math.max(LARGO.fx[1], hc * (1 + s[1]) - SOVRAPPOSTO)];
    for (let i = 2; i < 5; i++) fxL[i] = Math.max(LARGO.fx[i], fxL[i - 1] + hc * (s[i - 1] + s[i]) * PASSO_LARGO);
    for (const c of ['z', 'ang', 'luce']) for (let i = 0; i < 5; i++) L[c][i] = ALTO[c][i] + (LARGO[c][i] - ALTO[c][i]) * k;
    for (let i = 0; i < 5; i++) L.fx[i] = ALTO.fx[i] + (fxL[i] - ALTO.fx[i]) * k;
    L.tuffo = ALTO.tuffo + (LARGO.tuffo - ALTO.tuffo) * k;
    camera.aspect = aspetto; camera.near = D * .2; camera.far = D * 4 + 900;
    // il centro della zona: la camera guarda l'origine, la finestra si sposta perché l'origine cada lì
    const yc = z.su + alto / 2;
    camera.setViewOffset(W, H, 0, (.5 - yc) * H, W, H);
    camera.position.set(0, D * Math.sin(ELEVAZIONE), D * Math.cos(ELEVAZIONE)); camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // panoramica: grandezze e distanze in frazioni dello schermo, poi il posto nello spazio della camera e da lì nel mondo
    // la fila dritta vuole spazio: sotto una zona larga il doppio che alta resta (in parte) il ventaglio del telefono, più grande
    const kp = liscio(tra(za, 1.1, 2));
    const mx = c => PANO_ALTO[c] + (PANO_LARGO[c] - PANO_ALTO[c]) * kp;
    for (const c of ['q', 'ang', 'luce']) for (let i = 0; i < 3; i++) P[c][i] = PANO_ALTO[c][i] + (PANO_LARGO[c][i] - PANO_ALTO[c][i]) * kp;
    const hC = RIF.altezza / (2 * D * tanM), sig = mx('sigma');
    const sx1 = hc * (P.q[0] + P.q[1]) * sig, sx2 = sx1 + hc * (P.q[1] + P.q[2]) * sig;
    const f = Math.min(1, mx('alt') / (hC * P.q[0]), mx('bordo') / (sx2 + hc * P.q[2]));   // sta nell'altezza e nella larghezza
    P.q = P.q.map(q => q * f); P.sx = [0, sx1 * f, sx2 * f];
    const sy = mx('sy'), alza = mx('alza');
    for (let d = -2; d <= 2; d++) {
      const j = Math.abs(d), dist = D / P.q[j];
      P.pos[d + 2].set(Math.sign(d) * P.sx[j] * dist * tanM * aspetto, (yc - sy) * 2 * dist * tanM, -dist).applyMatrix4(camera.matrixWorld);
    }
    // i lontani salgono verso il pavimento del centrale (la camera guarda un filo dall'alto: sullo schermo salgono verso l'orizzonte)
    for (let i = 0; i < 5; i++) if (i !== 2) P.pos[i].y += (P.pos[2].y - P.pos[i].y) * alza;
    sporco = true;
  }
  // posto nella panoramica per una distanza d continua (fra i posti interi, in linea retta; oltre ±2 esce di lato)
  function postoPano(d, out) {
    const c = Math.max(-2, Math.min(2, d)), i = Math.min(3, Math.floor(c + 2)), t = c + 2 - i;
    out.copy(P.pos[i]).lerp(P.pos[i + 1], t);
    if (Math.abs(d) > 2) out.x += (d - c) * (P.pos[4].x - P.pos[3].x);
    return out;
  }

  // ——— orologi: un posto per ciascuno (perno → inclinazione → giro → scala → modello) ———
  const posti = voci.map(v => {
    const perno = new THREE.Group(), incl = new THREE.Group(), giro = new THREE.Group(), scala = new THREE.Group();
    perno.add(incl); incl.add(giro); giro.add(scala); perno.visible = false; perno.name = 'posto-' + v.i;
    // i campi numerici nascono non interi (poi azzerati): V8 li tiene come double in posto, niente numeri nuovi a ogni fotogramma
    const o = { voce: v, perno, incl, giro, scala, pezzo: null, pronto: false, inCorso: false, nascita: .5, s: 1.5, ingombro: null,
      U: { uLuce: { value: 1 }, uVelo: { value: 1 }, uLama: { value: new THREE.Vector4(0, 0, LAMA.larghezza, LAMA.altezza) }, uLamaY: { value: 0 } },
      materiali: [], ombre: [], ombreBase: [], giroA: .5, giroV: .5, luce: .5, a: 9.5 };
    o.nascita = 0; o.s = 1; o.giroA = o.giroV = o.luce = 0; o.a = 9;
    return o;
  });

  let liberato = false;   // dopo libera(): le costruzioni ancora in coda si fermano
  async function costruisci(p) {
    if (p.pronto || p.inCorso || liberato) return;
    p.inCorso = true;
    const t = performance.now();
    try {
      // primaIlCentro: il modulo arriva qui (già chiesto dopo il primo fotogramma, o adesso)
      if (!p.voce.modulo) { p.voce.modulo = await (p.voce.caricamento ??= carica(p.voce.id)); p.voce.nome = p.voce.modulo.nome; }
      if (liberato) return;
      const pezzo = await p.voce.modulo.costruisci({ motore, opzioni: O });
      const inq = pezzo.inquadratura ?? { altezza: pezzo.ingombro.dimensioni[1] * 1.29, larghezza: pezzo.ingombro.raggioXZ * 2 * 1.06 };
      p.s = Math.min(RIF.altezza / inq.altezza, RIF.larghezza / inq.larghezza);
      p.pezzo = pezzo; p.ingombro = pezzo.ingombro;
      p.scala.scale.setScalar(p.s); p.scala.add(pezzo.gruppo);
      // materiali dell'orologio: cloni con la sua luce e la sua lama (texture e programmi restano condivisi)
      const cloni = new Map();
      pezzo.gruppo.traverse(o => {
        if (!o.isMesh) return;
        if (!cloni.has(o.material)) { const c = clona(o.material, p.U, FONDO); cloni.set(o.material, c); p.materiali.push(c); }
        o.material = cloni.get(o.material);
      });
      // ombra di contatto sotto l'anello (resta sul pavimento anche quando l'orologio gira)
      if (O.ombra !== false) {
        const g = pezzo.ingombro, om = motore.ombraContatto({ larghezza: g.dimensioni[0] * .95 * p.s, lunghezza: g.dimensioni[2] * 1.2 * p.s, forza: .7 });
        om.position.y = g.min[1] * p.s - .4;
        om.traverse(o => { if (o.isMesh) { p.ombre.push(o.material); p.ombreBase.push(o.material.opacity); } });
        p.perno.add(om);
      }
      // compila prima di mostrarlo (niente scatto quando entra in scena)
      p.perno.visible = true;
      await renderer.compileAsync(p.perno, camera, scena);
      if (liberato) return;
      scena.add(p.perno);
      p.pronto = true; p.nascita = performance.now(); p.tempo = performance.now() - t;
      sporco = true;
      emetti('costruito', p.voce.i, p.voce);
    } catch (e) {
      console.warn(`lumen3d/giostra: ${p.voce.id} non costruito`, e);
      p.fallito = true;
      emetti('errore', p.voce, e);
    }
    p.inCorso = false;
  }

  // ——— eventi ———
  const ascolta = {};
  function emetti(nome, ...a) { const l = ascolta[nome]; if (l) for (const f of l) f(...a); }

  // ——— stato ———
  let meta = Math.min(N - 1, Math.max(0, O.x ?? 0)), cur = meta, centro = Math.round(cur);
  // panoramica: 1 = tutti raccolti in profondità (apertura), 0 = giostra; segue la meta morbida come la posizione
  let panoMeta = Math.min(1, Math.max(0, O.panoramica ?? 0)), pano = panoMeta;
  let visibile = true, inPausa = false, ultimoMoto = performance.now(), dondolo = 0, tPrima = 0;
  // verso = da che parte va la fila (+1 = avanti: la lama è di chi arriva); presa = trascinamento in corso
  let mx = 0, my = 0, tx = 0, ty = 0, verso = 1, presa = null, moto = 0;   // moto: la fila si sta muovendo (la lama vive solo allora)

  misura();
  const osservaMisura = new ResizeObserver(misura); osservaMisura.observe(host);

  // il centrale per primo, poi il primo fotogramma
  await costruisci(posti[centro]);
  posti[centro].nascita = -1e9;   // il primo compare subito: la dissolvenza è per chi arriva dopo, ai lati
  aggiorna(0, performance.now());
  renderer.render(scena, camera);
  tempi.primoFotogramma = performance.now() - t0;
  host.classList.add('pronto');
  // primaIlCentro: adesso si chiedono i moduli degli altri (in parallelo; la costruzione resta a turno, qui sotto)
  if (O.primaIlCentro) for (const v of voci) if (!v.modulo) (v.caricamento ??= carica(v.id)).catch(() => {});

  // gli altri a turno, quando il browser è libero: sempre il più vicino al centro di adesso
  // (anche il primo passo aspetta: così 'tutti' arriva sempre dopo che la pagina ha potuto ascoltarlo)
  const quandoLibero = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 400 }) : setTimeout(f, 50));
  let fineTutti; const tutti = new Promise(r => { fineTutti = r; });
  function prossimo() {
    if (liberato) return;
    let migliore = null, dm = 1e9;
    for (const p of posti) if (!p.pronto && !p.inCorso && !p.fallito) { const d = Math.abs(avvolgi(p.voce.i - cur)); if (d < dm) { dm = d; migliore = p; } }
    if (!migliore) { tempi.tutti = performance.now() - t0; emetti('tutti'); fineTutti(); return; }
    costruisci(migliore).then(() => quandoLibero(prossimo));
  }
  quandoLibero(prossimo);

  // ——— puntatore: trascina il centrale (gira), click su un laterale (scelta), trascina fuori (scorri), inclinazione ———
  const v3 = new THREE.Vector3(), box = { x0: 0, x1: 0, y0: 0, y1: 0 };
  // rettangolo a schermo (px dell'host) dell'ingombro di un posto
  function rettangolo(p) {
    const g = p.ingombro; box.x0 = box.y0 = 1e9; box.x1 = box.y1 = -1e9;
    p.scala.updateWorldMatrix(true, false);
    for (let k = 0; k < 8; k++) {
      v3.set(k & 1 ? g.max[0] : g.min[0], k & 2 ? g.max[1] : g.min[1], k & 4 ? g.max[2] : g.min[2]).applyMatrix4(p.scala.matrixWorld).project(camera);
      const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * H;
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
    }
    return box;
  }
  // il posto sotto il puntatore (il più vicino al centro fra quelli che lo contengono), o −1
  function colpito(e) {
    const r = tela.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let k = -1, am = 1e9;
    for (const p of posti) {
      if (!p.pronto || !p.perno.visible || p.luce < .08) continue;
      const b = rettangolo(p), m = p.a < .5 ? 0 : 6;
      if (x > b.x0 - m && x < b.x1 + m && y > b.y0 - m && y < b.y1 + m && p.a < am) { am = p.a; k = p.voce.i; }
    }
    return k;
  }
  tela.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    const k = colpito(e);
    // gira il centrale; nella panoramica si gira quello che si prende, qualunque sia
    presa = { id: e.pointerId, x0: e.clientX, y0: e.clientY, xl: e.clientX, t: performance.now(), k, gira: k >= 0 && (pano > .5 || (k === Math.round(cur) && posti[k].a < .35)), mosso: false };
    if (presa.gira) { posti[k].giroV = 0; tela.setPointerCapture?.(e.pointerId); }
  });
  tela.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') { const r = tela.getBoundingClientRect(); mx = (e.clientX - r.left) / r.width * 2 - 1; my = (e.clientY - r.top) / r.height * 2 - 1; }
    if (presa && presa.id === e.pointerId) {
      const dx = e.clientX - presa.xl; presa.xl = e.clientX;
      if (Math.abs(e.clientX - presa.x0) > 6) presa.mosso = true;
      if (presa.gira) { const p = posti[presa.k], dv = dx * (grossolano ? .011 : .008); p.giroA += dv; p.giroV = dv; presa.tm = ultimoMoto = performance.now(); sporco = true; }
    } else if (e.pointerType === 'mouse' && !presa) {
      const k = colpito(e);
      tela.style.cursor = k < 0 ? '' : k === Math.round(cur) && pano < .5 ? 'grab' : 'pointer';
    }
  });
  const lascia = e => {
    if (!presa || presa.id !== e.pointerId) return;
    const q = presa; presa = null;
    if (q.gira && performance.now() - (q.tm ?? 0) > 90) posti[q.k].giroV = 0;   // il dito si era fermato: niente inerzia
    if (e.type === 'pointercancel') return;
    const dx = e.clientX - q.x0, dy = e.clientY - q.y0;
    if (!q.mosso && Math.abs(dy) < 10 && performance.now() - q.t < 600) {
      if (q.k >= 0 && (q.k !== Math.round(cur) || pano > .5)) emetti('scelta', q.k, voci[q.k]);   // nella panoramica anche il centrale
    } else if (!q.gira && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) emetti('scorri', dx < 0 ? 1 : -1);
  };
  tela.addEventListener('pointerup', lascia); tela.addEventListener('pointercancel', lascia);
  tela.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') mx = my = 0; });

  // ——— pausa quando non si vede ———
  const osservaVista = new IntersectionObserver(es => { visibile = es[0].isIntersecting; ciclo(); }); osservaVista.observe(host);
  function ciclo() { renderer.setAnimationLoop(visibile && !inPausa ? disegna : null); if (visibile && !inPausa) { tPrima = 0; sporco = true; } }

  // ——— ogni fotogramma (niente allocazioni) ———
  function aggiorna(dt, t) {
    // posizione: segue la meta morbida; la tenuta fa restare il centrale un attimo prima dello scambio
    const kx = dt ? 1 - Math.exp(-dt / 95) : 1;
    const prima = cur; cur += (meta - cur) * kx; if (Math.abs(meta - cur) < 1e-5) cur = meta;
    if (cur !== prima) { ultimoMoto = t; sporco = true; verso = cur > prima ? 1 : -1; }
    const pPrima = pano; pano += (panoMeta - pano) * kx; if (Math.abs(panoMeta - pano) < 1e-4) pano = panoMeta;
    if (pano !== pPrima) { ultimoMoto = t; sporco = true; }
    const e = liscio(pano);   // quanto siamo nella panoramica (0 = giostra)
    const n = Math.floor(cur), f = cur - n, xe = n + f + (liscio(f) - f) * TENUTA;
    const c = Math.min(N - 1, Math.max(0, Math.round(cur)));
    if (c !== centro) { centro = c; emetti('centro', c, voci[c]); }
    // fermo da un po' e nessuno lo tocca: il centrale dondola piano (si accende e si spegne morbido)
    const quieto = !fermo.ora && !presa && t - ultimoMoto > 1400 ? 1 : 0;
    // la lama si spegne piano se lo scroll si ferma a metà scambio (niente riga bianca congelata sul vetro)
    moto += ((t - ultimoMoto < 300 ? 1 : 0) - moto) * (dt ? 1 - Math.exp(-dt / 220) : 1);
    if (moto > 1e-3 && moto < .999) sporco = true;
    dondolo += (quieto - dondolo) * (dt ? 1 - Math.exp(-dt / 1100) : 1);
    // inclinazione verso il cursore (solo col mouse)
    const kt = dt ? 1 - Math.exp(-dt / 260) : 1;
    tx += ((fermo.ora ? 0 : my * .07) - tx) * kt; ty += ((fermo.ora ? 0 : mx * .14) - ty) * kt;
    if (Math.abs(tx) + Math.abs(ty) > 1e-4 || dondolo > 1e-3) sporco = true;

    const dist0 = D, hwK = tanM * aspetto;
    for (let i = 0; i < N; i++) {
      const p = posti[i];
      if (!p.pronto) continue;
      const d = avvolgi(p.voce.i - xe), a = Math.abs(d), sg = d < 0 ? -1 : 1;
      p.a = Math.abs(avvolgi(p.voce.i - cur));
      const sa = Math.sin(Math.PI * Math.min(1, a)), z = curva(L.z, a, true) - L.tuffo * sa * sa, fx = curva(L.fx, a, false);
      let ang = curva(L.ang, a, false);
      const nasce = liscio(tra(t - p.nascita, 0, 450));
      if (nasce < 1) sporco = true;
      let luce = Math.max(0, curva(L.luce, a, true));
      // panoramica: stessa distanza d, ma il posto della fila in vetrina (più piccoli, vicini, tutti in luce)
      if (e > 0) { luce += ((a > 2.5 ? 0 : tre(P.luce, a)) - luce) * e; ang += (tre(P.ang, a) - ang) * e; }
      p.luce = luce * nasce;
      p.perno.visible = p.luce > .004 && a < 3.6;
      if (!p.perno.visible) continue;
      const X = sg * fx * (dist0 - z * Math.cos(ELEVAZIONE)) * hwK;
      p.perno.position.set(X, 0, z);
      if (e > 0) p.perno.position.lerp(postoPano(d, vP), e);
      p.perno.rotation.y = -sg * ang;
      // centralità: 1 al centro, 0 da mezzo passo in là (dondolo, inclinazione, trascinamento); nella panoramica vale per tutti
      const cen = Math.max(liscio(1 - tra(a, 0, .5)), e);
      // giro: inerzia dopo il trascinamento, poi torna di fronte (al giro intero più vicino); i laterali tornano subito
      if (!(presa && presa.gira && presa.k === p.voce.i)) {
        if (Math.abs(p.giroV) > 1e-4) { p.giroA += p.giroV * (dt / 16.7); p.giroV *= Math.pow(.93, dt / 16.7); sporco = true; }
        else if (p.giroA !== 0) {
          const m = Math.round(p.giroA / TAU) * TAU, lento = cen > .5 && t - ultimoMoto < 900 ? 0 : 1;
          p.giroA += (m - p.giroA) * (1 - Math.exp(-dt / (cen > .5 ? 520 : 200))) * lento;
          if (Math.abs(m - p.giroA) < 1e-4) p.giroA = 0; else sporco = true;
        }
        p.giroV = Math.abs(p.giroV) > 1e-4 ? p.giroV : 0;
      }
      const dond = Math.sin(t / 11000 * TAU + i * 1.9 * e) * .2 * dondolo * cen;   // in fila ognuno col suo passo
      p.giro.rotation.y = p.giroA + dond;
      p.incl.rotation.set(tx * cen, ty * cen, 0);
      // lama: forza a campana mentre arriva (|d| da .65 a 0), la striscia scorre nel riflesso del vetro da un lato all'altro
      const u = 1 - tra(a, 0, .65), forza = sg === verso ? liscio(tra(u, .04, .34)) * (1 - liscio(tra(u, .74, .98))) : 0;
      let az = 0;
      if (forza > 0) {
        // riflesso del centro del quadrante, nello spazio vista: R = 2(N·V)N − V (N = normale del vetro, V = verso la camera)
        const th = p.perno.rotation.y + p.giro.rotation.y;
        vN.set(Math.sin(th), 0, Math.cos(th)).transformDirection(camera.matrixWorldInverse);
        vV.copy(p.perno.position).applyMatrix4(camera.matrixWorldInverse).negate().normalize();
        vR.copy(vN).multiplyScalar(2 * vN.dot(vV)).sub(vV);
        az = Math.atan2(vR.x, vR.z) + sg * LAMA.corsa * (2 * tra(u, .1, .9) - 1);
        p.U.uLamaY.value = vR.y;
      }
      p.U.uLama.value.x = az; p.U.uLama.value.y = forza * moto * LAMA.forza * lamaK * (1 - e);
      p.U.uLuce.value = luce; p.U.uVelo.value = nasce;
      for (let k = 0; k < p.ombre.length; k++) p.ombre[k].opacity = p.ombreBase[k] * Math.min(1, luce * 1.4) * nasce;
    }
  }

  // pixel ratio che si adatta: se il telefono non tiene i 60 fps, scende a 1,5 e poi a 1,25 (solo in giù, una volta per gradino)
  const intervalli = new Float32Array(90); let nInt = 0;
  function adatta(dt) {
    if (O.adatta === false || dt <= 0 || dt > 200) return;
    intervalli[nInt++] = dt;
    if (nInt < intervalli.length) return;
    nInt = 0; intervalli.sort();
    const mediana = intervalli[intervalli.length >> 1];
    if (mediana > 19.5 && pr > 1.25) { pr = pr > 1.5 ? 1.5 : 1.25; renderer.setPixelRatio(pr); misura(); tempi.pixelRatioAdattato = pr; }
  }

  function disegna(t) {
    const dt = tPrima ? Math.min(60, t - tPrima) : 16.7; tPrima = t;
    aggiorna(dt, t);
    for (let i = 0; i < N; i++) { const p = posti[i]; if (p.pronto && p.perno.visible && p.pezzo.anima) p.pezzo.anima(t); }
    if (!sporco) return;
    sporco = false;
    renderer.render(scena, camera);
    adatta(dt);
  }
  ciclo();

  tempi.monta = performance.now() - t0;
  return {
    voci: voci.map(({ i, id, nome }) => ({ i, id, nome })), N, saltati,
    tutti,   // promessa: tutti gli orologi costruiti
    // posizione continua nella fila (0 … N−1); subito = senza inseguimento (salti, verifiche)
    vai(x, subito = false) { const m = Math.min(N - 1, Math.max(0, +x || 0)); if (m !== meta) verso = m > meta ? 1 : -1; meta = m; if (subito) cur = meta; sporco = true; },
    // 1 = tutti raccolti in profondità (apertura), 0 = giostra; subito = senza inseguimento
    panoramica(k, subito = false) { panoMeta = Math.min(1, Math.max(0, +k || 0)); if (subito) pano = panoMeta; sporco = true; },
    pano: () => pano,
    su(nome, f) { (ascolta[nome] ??= []).push(f); return () => { ascolta[nome] = ascolta[nome].filter(g => g !== f); }; },
    x: () => cur, centro: () => centro,
    pausa(si = true) { inPausa = !!si; ciclo(); },
    fermo(si = true) { fermo.ora = !!si; sporco = true; },
    // disegna subito (verifiche: dopo vai(x, true) il fotogramma è già quello giusto)
    disegna() { const t = performance.now(); aggiorna(0, t); renderer.render(scena, camera); },
    // rettangoli a schermo (px dell'host) degli orologi visibili: verifiche, o per appoggiarci qualcosa della pagina
    rettangoli() { return posti.filter(p => p.pronto && p.perno.visible).map(p => ({ i: p.voce.i, ...rettangolo(p), luce: +p.luce.toFixed(3), larghezza: W, altezza: H })); },
    info() {
      const geo = new Set(), tex = new Set();
      scena.traverse(o => {
        if (!o.isMesh) return; geo.add(o.geometry);
        for (const k of ['map', 'normalMap', 'roughnessMap', 'envMap']) if (o.material[k]) tex.add(o.material[k]);
      });
      let byteGeo = 0, byteTex = 0;
      for (const g of geo) { for (const a of Object.values(g.attributes)) byteGeo += a.array.byteLength; if (g.index) byteGeo += g.index.array.byteLength; }
      for (const t of tex) { const im = t.image; if (im?.width) byteTex += im.width * im.height * (t.type === THREE.HalfFloatType ? 8 : 4) * (t.generateMipmaps !== false ? 4 / 3 : 1); }
      const r = renderer.info.render;
      return {
        voci: voci.map(v => v.id), saltati, costruiti: posti.filter(p => p.pronto).length, falliti: posti.filter(p => p.fallito).map(p => p.voce.i),
        panoramica: +pano.toFixed(3), formaZona: +formaZona.toFixed(2), distanza: Math.round(D),
        tempiCostruzioneMs: posti.map(p => p.tempo === undefined ? null : Math.round(p.tempo)),
        triangoliScena: posti.reduce((s, p) => s + (p.pronto ? p.ingombro.triangoli : 0), 0),
        triangoliFotogramma: r.triangles, disegniFotogramma: r.calls, programmi: renderer.info.programs?.length,
        geometrie: renderer.info.memory.geometries, texture: renderer.info.memory.textures,
        memoriaStimataMB: +((byteGeo + byteTex) / 1048576).toFixed(1), memoriaGeometrieMB: +(byteGeo / 1048576).toFixed(1),
        pixelRatio: renderer.getPixelRatio(), tela: [tela.width, tela.height], scale: posti.map(p => +p.s.toFixed(3)),
        tempi: Object.fromEntries(Object.entries(tempi).map(([k, v]) => [k, typeof v === 'number' && k !== 'pixelRatioAdattato' ? Math.round(v) : v])),
      };
    },
    renderer, motore, scena, camera,
    libera() {
      liberato = true; renderer.setAnimationLoop(null); osservaMisura.disconnect(); osservaVista.disconnect();
      for (const p of posti) { for (const m of p.materiali) m.dispose(); p.perno.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.parent?.name === 'ombra') o.material.dispose(); } }); }
      motore.libera(); renderer.dispose(); tela.remove();
    },
  };
}
