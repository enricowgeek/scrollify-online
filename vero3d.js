// Scrollify — "dal disegno al vero": cinque vetrine 3D nate da un'immagine.
// Ogni vetrina passa per tre fasi mentre scorri: 01 disegno (punti sulle linee) · 02 volume (grigio) · 03 reale (colori veri).
// Oggetti (pizza, cocktail, auto): 3D da una foto, la camera gira attorno.
// Ambienti (camera d'hotel, piscina): ogni pixel è un punto alla sua profondità; la camera parte indietro e si ferma
// dove l'immagine è stata scattata, e all'arrivo sfuma nell'immagine originale in alta risoluzione.
// La scena si crea quando la sezione si avvicina e si spegne quando è lontana: sul telefono restano al massimo due scene vive.
import * as THREE from 'three';
import { SparkRenderer, SplatMesh, dyno } from '@sparkjsdev/spark';

const VETRINE = {
  camera:   { file: '3d/camera.sog',   img: '3d/camera.jpg',  prof: '3d/camera_prof.png',  modo: 2, amb: true, da: 1, a: 6, hf: 65, vf: 51.1, indietro: 1.1 },
  piscina:  { file: '3d/piscina.sog',  img: '3d/piscina.jpg', prof: '3d/piscina_prof.png', modo: 2, amb: true, da: 1, a: 6, hf: 70, vf: 50.0, indietro: 1.1 },
  pizza:    { file: '3d/pizza.sog',    modo: 1, centro: [-.006, .004, -.011], da: 0, a: .5, el: .75, r: 1.75, giro: 1.4, gx: .7, gy: .25, dopo: .5 },
  cocktail: { file: '3d/cocktail.sog', modo: 0, asse: [0, -1, 0], da: -.484, a: .478, el: .26, r: 2.6, giro: 1.1, gx: .6, gy: .2, dopo: .45 },
  auto:     { file: '3d/auto.sog',     modo: 0, asse: [-1, 0, 0], da: -.465, a: .475, el: .14, r: 1.8, giro: 1.0, gx: .35, gy: .12, dopo: .2 },   // dopo poco: dietro l'auto si scioglie
};
const mobile = matchMedia('(max-width:760px)').matches || matchMedia('(pointer:coarse)').matches;
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
const deg = THREE.MathUtils.degToRad, rad = THREE.MathUtils.radToDeg;
// modalità "dritta" (per i reel): gli oggetti girano poco e finiscono di fronte come nella foto, gli ambienti partono meno inclinati
const dritto = !!window.__veroDritto;
const n = v => Number(v ?? 0).toFixed(4);   // nel codice per la scheda grafica i numeri vanno scritti decimali
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// le tre fasi, punto per punto: stesso programma per tutte le vetrine, cambia solo il verso in cui avanzano
function modificatore(O, P) {
  const C = O.centro || [0, 0, 0], A = O.asse || [0, 0, 0];
  return dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
    const d = new dyno.Dyno({
      inTypes: { gsplat: dyno.Gsplat, p: 'float' },
      outTypes: { gsplat: dyno.Gsplat },
      globals: () => [dyno.unindent(/* glsl */ `
        vec3 hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(vec3(p.x * p.y * p.z, p.x + p.y * p.z, p.x * p.y + p.z)); }
        float fase(float p, float a, float b, float f) { return smoothstep(f * .7, f * .7 + .3, (p - a) / (b - a)); }
      `)],
      statements: ({ inputs, outputs }) => dyno.unindentLines(/* glsl */ `
        ${outputs.gsplat} = ${inputs.gsplat};
        vec3 c = ${inputs.gsplat}.center;
        // f: 0 = il punto parte per primo, 1 = per ultimo (dal centro, lungo un asse, o dal vicino al fondo)
        float f;
        if (${O.modo} == 1) f = clamp(length(c.xz - vec2(${n(C[0])}, ${n(C[2])})) / ${n(O.a)}, 0., 1.);
        else if (${O.modo} == 2) f = clamp((length(c) - ${n(O.da)}) / ${n(O.a - O.da)}, 0., 1.);
        else f = clamp((dot(c, vec3(${A.map(n).join(', ')})) - (${n(O.da)})) / ${n(O.a - O.da)}, 0., 1.);
        vec3 h = hash3(c * 37.1);
        float p = ${inputs.p};
        float a1 = fase(p, .02, .30, f), a2 = fase(p, .36, .64, f), a3 = fase(p, .70, .98, f);
        vec4 col = ${inputs.gsplat}.rgba;
        float lum = dot(col.rgb, vec3(.299, .587, .114));
        vec3 rgb = mix(mix(vec3(.66, 1., .38) * (.75 + .5 * h.x), vec3(.18 + .72 * lum), a2), col.rgb, a3);
        float fr1 = exp(-60. * abs((p - .02) / .28 - (f * .7 + .15))) * (1. - a2);
        float fr3 = exp(-60. * abs((p - .70) / .28 - (f * .7 + .15))) * a2;
        rgb += vec3(.5, .9, .3) * fr1 * .6 + vec3(1.) * fr3 * .25;
        // il disegno: solo i punti sulle linee (anelli e raggi · sezioni e quote · contorni dell'immagine)
        float linee;
        if (${O.modo} == 2) linee = step(.75, col.a);
        else if (${O.modo} == 1) {
          float ang = atan(c.z - ${n(C[2])}, c.x - ${n(C[0])}) / 6.2832 + .5;
          linee = max(step(fract(f * 9.), .06), step(fract(ang * 28.), .035));
        } else linee = max(step(fract(f * 11.), .07), step(fract(-c.y * 7.), .07));
        float tieni = ${O.modo} == 2 ? max(linee * step(h.z, .9), step(h.y, .012)) : max(linee * step(h.z, .55), step(h.y, .04));
        tieni = max(tieni, step(h.y, a2));
        float bordi = 1.;
        if (${O.modo} == 2) {
          float ex = abs(c.x / c.z) / ${n(Math.tan(deg(O.hf || 60) / 2))}, ey = abs(c.y / c.z) / ${n(Math.tan(deg(O.vf || 40) / 2))};
          bordi = smoothstep(1., .9, max(ex, ey));
        }
        ${outputs.gsplat}.scales = mix(vec3(.0016), ${inputs.gsplat}.scales, a2);
        ${outputs.gsplat}.rgba = vec4(rgb, a1 * tieni * bordi * (${O.amb ? 1 : 0} == 1 ? 1. : mix(1., col.a, a2)));
      `),
    });
    return { gsplat: d.apply({ gsplat, p: P }).gsplat };
  });
}


function monta(host) {
  const nome = host.dataset.vero, O = VETRINE[nome];
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
  scene.add(new SparkRenderer({ renderer }));
  const P = dyno.dynoFloat(0);
  // il cursore sopra l'immagine sposta il punto di vista; fuori dall'immagine si torna piano al centro
  let tx = 0, ty = 0, lx = 0, ly = 0;
  host.addEventListener('pointermove', e => { const r = host.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width - .5; ty = (e.clientY - r.top) / r.height - .5; });
  // tieni premuto: la scena torna al disegno (il colore si ritira, restano le linee); lasci e torna vera
  let premuto = false;
  const ac = new AbortController();   // per togliere gli ascoltatori sulla finestra quando la vetrina si spegne
  host.addEventListener('pointerleave', () => { tx = ty = 0; premuto = false; });
  host.addEventListener('pointerdown', () => { premuto = true; });
  addEventListener('pointerup', () => { premuto = false; }, { signal: ac.signal });
  addEventListener('pointercancel', () => { premuto = false; }, { signal: ac.signal });
  host.addEventListener('contextmenu', e => e.preventDefault());
  let spenta = false, mesh = null, pronta = false;
  // se il 3D non è ancora arrivato (rete lenta, scroll veloce) al posto del vuoto compare "slow down!" con la percentuale;
  // appare solo dopo un attimo, così con la rete buona non si vede mai
  const cartello = document.createElement('div'); cartello.className = 'carica'; cartello.setAttribute('aria-hidden', 'true');
  cartello.innerHTML = '<b>slow down!</b><span>rete lenta? vai piano,<br>che carica tutto con calma · <i>0%</i></span>';
  host.appendChild(cartello);
  const nato = performance.now();
  // il file arriva dalla memoria (vedi scarica): se la sezione si spegne mentre il 3D si sta preparando, viene lasciato cadere senza errori.
  // Questo esempio è sullo schermo: il suo file passa davanti agli altri
  davanti = O.file;
  const file = scarica(O.file); precedenza();
  file.then(buf => {
    if (spenta) return;
    mesh = new SplatMesh({ fileBytes: buf, fileName: O.file });
    if (!O.amb) mesh.quaternion.set(1, 0, 0, 0);   // i file nati da una foto escono con la y verso il basso
    scene.add(mesh);
    return mesh.initialized.then(() => { if (spenta) return; mesh.objectModifier = modificatore(O, P); mesh.updateGenerator(); pronta = true; });
  }).catch(() => {});

  // ambienti: l'immagine originale, alla distanza del fondo e grande quanto l'inquadratura, arriva alla fine
  let foto = null;
  if (O.img) {
    const ld = new THREE.TextureLoader(), tex = ld.load(O.img), dep = ld.load(O.prof);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    // ogni vertice sta sul raggio del suo pixel, alla stessa distanza dei punti 3D (1–6): la geometria combacia con la nuvola
    foto = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, mobile ? 160 : 320, mobile ? 110 : 220), new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { map: { value: tex }, dmap: { value: dep }, op: { value: 0 },
        th: { value: Math.tan(deg(O.hf) / 2) }, tv: { value: Math.tan(deg(O.vf) / 2) } },
      vertexShader: `uniform sampler2D dmap; uniform float th, tv; varying vec2 vUv;
        void main() { vUv = uv; float d = texture2D(dmap, uv).r; float z = 1. / (1. / 6. + d * (1. - 1. / 6.));
          gl_Position = projectionMatrix * modelViewMatrix * vec4((uv.x - .5) * 2. * th * z, (uv.y - .5) * 2. * tv * z, -z, 1.); }`,
      // i bordi dell'immagine sfumano nel fondo della pagina: niente rettangolo netto
      fragmentShader: `uniform sampler2D map; uniform float op; varying vec2 vUv;
        void main() { vec2 e = min(vUv, 1. - vUv); float bordo = smoothstep(0., .07, e.x) * smoothstep(0., .07, e.y);
          gl_FragColor = vec4(texture2D(map, vUv).rgb, op * bordo);
          #include <colorspace_fragment>
        }`,
    }));
    foto.renderOrder = 10; foto.frustumCulled = false; scene.add(foto);
  }

  let fov0 = 35;
  function size() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // ambienti: tutta l'immagine sempre in vista, niente zoom
    fov0 = O.amb ? Math.max(O.vf, rad(2 * Math.atan(Math.tan(deg(O.hf) / 2) / camera.aspect))) * 1.02 : (camera.aspect < .8 ? 50 : 35);
    camera.fov = fov0; camera.updateProjectionMatrix();
  }
  size();
  const ro = new ResizeObserver(size); ro.observe(host);

  // dopo: finite le tre fasi la pagina tiene l'esempio sul vero per un tratto (window.__pH_<nome> da 0 a 1): intanto continua a muoversi piano
  let cur = 0, vis = 0, dopo = 0;
  function disegna() {
    // solo se il file sta ancora arrivando: quando è già qui e il 3D si sta solo preparando non è colpa della rete
    const aspetta = !pronta && (arrivato.get(O.file) || 0) < 1 && performance.now() - nato > 800;
    cartello.classList.toggle('su', aspetta);
    if (aspetta) { const pct = Math.round((arrivato.get(O.file) || 0) * 100) + '%', i = cartello.querySelector('i'); if (i.textContent !== pct) i.textContent = pct; }
    const target = window['__pV_' + nome] || 0;
    cur += (target - cur) * (reduced ? 1 : .09);
    // cur guida la camera, vis le tre fasi: premendo torna indietro solo vis, la camera resta dov'è
    vis += ((premuto ? Math.min(cur, .3) : cur) - vis) * (reduced ? 1 : premuto ? .06 : .08);
    P.value = vis; mesh?.updateVersion();
    dopo += ((window['__pH_' + nome] || 0) - dopo) * (reduced ? 1 : .09);
    lx += (tx - lx) * .1; ly += (ty - ly) * .1;
    if (O.amb) {
      // parte da fuori (la stanza come un plastico sospeso) e si ferma nel punto di scatto;
      // il cursore sposta il punto di vista mentre lo sguardo resta sul fondo: le cose vicine si muovono più di quelle lontane
      const k = sstep(0, .92, cur);
      // sul vero la camera scivola appena di lato e avanza di un filo: l'immagine ha la sua profondità, quindi si muove come una scena
      const sx = lx + dopo * .3;
      camera.position.set(sx * .1, -ly * .065, O.indietro * (dritto ? .45 : 1) * (1 - k) - dopo * .12);
      camera.lookAt(0, 0, -6);
      // mentre ti sposti l'inquadratura stringe appena (al massimo 4%), così i bordi dell'immagine non si vedono mai
      camera.fov = fov0 * (1 - .04 * Math.min(1, Math.hypot(sx, ly) * 2)); camera.updateProjectionMatrix();
      if (foto) { const o = sstep(.9, .99, vis); foto.material.uniforms.op.value = o; foto.visible = o > .001; }
    } else {
      const ang = Math.PI / 2 + (dritto ? (1 - cur) * O.giro * .35 : (cur - .5) * O.giro) + dopo * (O.dopo ?? .4) + lx * O.gx, r = O.r * (1.08 - .12 * cur), e = O.el - ly * O.gy;
      camera.position.set(Math.sin(ang) * Math.cos(e) * r, Math.sin(e) * r, Math.cos(ang) * Math.cos(e) * r);
      camera.lookAt(0, 0, 0);
    }
    renderer.render(scene, camera);
  }
  function smonta() {
    if (davanti === O.file) { davanti = null; precedenza(); }
    spenta = true; ro.disconnect(); ac.abort(); mesh?.dispose?.(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); cartello.remove();
  }
  return { disegna, smonta };
}

// si accende solo l'esempio scelto (classe "on"), quando la sezione è vicina; quello lasciato sfuma e poi si spegne.
// così resta viva al massimo una scena, più quella che sta sfumando
const vive = new Map(), forzate = new Set();
const hosts = [...document.querySelectorAll('[data-vero]')];
const palco = hosts[0]?.parentElement;

// online ogni file 3D pesa 2–3 MB: se si scaricasse solo quando il suo esempio si accende, chi scorre veloce
// troverebbe tutti gli esempi vuoti. Appena questo script parte (al primo scroll) si scaricano in fila, nell'ordine del menu,
// e restano in memoria: accendere o riaccendere un esempio non riscarica niente.
// Rete lenta o ballerina (il telefono in treno): se per un po' non arriva niente il download si interrompe e riprende
// da dove era arrivato (il server accetta i "Range"), con attese sempre più lunghe; riparte subito quando torna la rete
// o quando si torna sulla pagina. Si scarica un file alla volta e l'esempio sullo schermo passa davanti (vedi precedenza).
const byte = new Map(), arrivato = new Map();   // arrivato: quanto del file è già qui, da 0 a 1 (per la scritta di caricamento)
const lavori = new Map();                       // file → download in corso (pezzi arrivati, pausa, tentativo attuale)
let davanti = null;                             // il file dell'esempio sullo schermo
const svegliami = new Set();
const sveglia = () => { for (const r of svegliami) r(); svegliami.clear(); };
addEventListener('online', sveglia);
document.addEventListener('visibilitychange', () => { if (!document.hidden) sveglia(); });
const riposa = ms => new Promise(r => { const t = setTimeout(fine, ms); function fine() { clearTimeout(t); svegliami.delete(fine); r(); } svegliami.add(fine); });

// un tentativo: chiede il resto del file; se per `muto` ms non arriva niente (neanche la risposta) lo interrompe
async function tentativo(L, muto) {
  const ac = L.ac = new AbortController();
  let cane = setTimeout(() => ac.abort(), muto);
  try {
    // If-Range: se nel frattempo il file è cambiato sul server, arriva intero da capo invece di un pezzo del file nuovo
    const r = await fetch(L.f, { signal: ac.signal, headers: L.n ? { Range: `bytes=${L.n}-`, ...(L.etag && { 'If-Range': L.etag }) } : {} });
    if (r.status === 416) { L.pezzi = []; L.n = 0; throw new Error('range'); }
    if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) { const e = new Error(L.f); e.fine = true; throw e; }
    if (!r.ok) throw new Error(r.status);
    if (r.status === 206) {
      const m = /bytes (\d+)-\d+\/(\d+)/.exec(r.headers.get('content-range') || '');
      if (!m || +m[1] !== L.n) { L.pezzi = []; L.n = 0; throw new Error('range'); }   // pezzo sbagliato: si ricomincia pulito
      L.tot = +m[2];
    } else { L.pezzi = []; L.n = 0; L.tot = +r.headers.get('content-length') || 0; L.etag = r.headers.get('etag'); }  // il server manda tutto da capo
    if (!r.body) { clearTimeout(cane); const b = new Uint8Array(await r.arrayBuffer()); L.pezzi.push(b); L.n += b.length; return true; }
    const rd = r.body.getReader();
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      clearTimeout(cane); cane = setTimeout(() => ac.abort(), muto);
      L.pezzi.push(value); L.n += value.length; L.muto = 0;
      if (L.tot) arrivato.set(L.f, Math.min(.99, L.n / L.tot));
    }
    return !L.tot || L.n >= L.tot;   // finito davvero, o la connessione si è chiusa a metà
  } finally { clearTimeout(cane); L.ac = null; }
}

async function leggi(L) {
  let attesa = 1000;
  for (;;) {
    if (L.pausa) await new Promise(r => { L.via = r; });
    const prima = L.n;
    try { if (await tentativo(L, 8000 + 4000 * Math.min(L.muto++, 5))) break; }   // chi non risponde ha sempre più tempo: 8 → 28 s
    catch (e) { if (e.fine) throw e; }
    if (L.pausa) continue;                         // interrotto apposta per far passare l'esempio sullo schermo: niente attesa
    if (L.n > prima) attesa = 1000;                // qualcosa era arrivato: la rete c'è, si riprova presto
    await riposa(attesa); attesa = Math.min(attesa * 2, 30000);
  }
  const buf = new Uint8Array(L.n); let i = 0;
  for (const p of L.pezzi) { buf.set(p, i); i += p.length; }
  L.pezzi = null; arrivato.set(L.f, 1);
  return buf.buffer;
}

// un file alla volta, con tutta la rete: quello dell'esempio sullo schermo, se non è ancora arrivato, altrimenti il primo in fila
// (nell'ordine del menu). Gli altri restano fermi e tengono i byte già presi
function precedenza() {
  const attivo = lavori.has(davanti) ? davanti : lavori.keys().next().value;
  for (const L of lavori.values()) {
    const ferma = L.f !== attivo;
    if (ferma && !L.pausa) { L.pausa = true; L.ac?.abort(); }
    if (!ferma && L.pausa) { L.pausa = false; L.via?.(); L.via = null; }
  }
}
function scarica(f) {
  if (!byte.has(f)) {
    const L = { f, pezzi: [], n: 0, tot: 0, muto: 0, pausa: false, ac: null, via: null };
    lavori.set(f, L); precedenza();
    byte.set(f, leggi(L).finally(() => { lavori.delete(f); precedenza(); }).catch(e => { byte.delete(f); arrivato.delete(f); throw e; }));
  }
  return byte.get(f);
}
let inFila = false;
async function scaricaTutti() {
  if (inFila) return; inFila = true;
  // con "risparmio dati" acceso non si scarica niente in anticipo: solo l'esempio che si guarda
  if (navigator.connection?.saveData) return;
  for (const h of hosts) {
    const O = VETRINE[h.dataset.vero];
    if (O.img) { new Image().src = O.img; new Image().src = O.prof; }
    try { await scarica(O.file); } catch {}
  }
}

let vicino = false, inSchermo = false;
if (palco) {
  new IntersectionObserver(es => { vicino = es[0].isIntersecting; }, { rootMargin: '150% 0px' }).observe(palco);
  scaricaTutti();
  new IntersectionObserver(es => { inSchermo = es[0].isIntersecting; }).observe(palco);
}
(function giro() {
  requestAnimationFrame(giro);
  const ora = performance.now();
  for (const h of hosts) {
    const scelta = (h.classList.contains('on') && vicino) || forzate.has(h);
    if (scelta && !vive.has(h)) vive.set(h, monta(h));
    const v = vive.get(h); if (!v) continue;
    if (scelta) { h._via = 0; if (inSchermo || forzate.has(h)) v.disegna(); continue; }
    h._via ||= ora;
    if (ora - h._via < 900 && vicino) { if (inSchermo) v.disegna(); }   // la lascio sfumare
    else { v.smonta(); vive.delete(h); h._via = 0; }
  }
})();
// solo per le verifiche: accende subito un esempio e lo disegna anche fuori schermo
window.__veroMonta = nome => { const h = hosts.find(x => x.dataset.vero === nome); forzate.add(h); };
window.__veroRete = () => ({ davanti, arrivato: Object.fromEntries(arrivato), lavori: [...lavori.values()].map(L => ({ f: L.f, n: L.n, tot: L.tot, pausa: L.pausa })) });
