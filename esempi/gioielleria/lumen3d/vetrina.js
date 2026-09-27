// Lumen 3D · vetrina: UN orologio della libreria in una pagina, con lo stesso comportamento del modulo p2.
// Giro completo con lo scroll che finisce di fronte, trascinamento con inerzia che poi torna, inclinazione verso il cursore,
// sfondo trasparente, telefono in verticale che si allontana per stare nella larghezza, pausa quando non si vede.
// uso: const o = await monta(host, { modello: 'meridiano-verde', a0, giro, el, esposizione }); o.vai(0..1)
// opzioni: modello (id o modulo), a0 (angolo iniziale), giro (radianti, di serie fino al giro intero: finisce di fronte), el (elevazione),
// esposizione, luce ('lumen' | 'p2'), ombra (ombra di contatto sotto l'anello), conserva (legge i pixel, solo verifiche),
// orto (semialtezza in mm: camera ortografica, solo verifiche), innesti/altre → passate al modello in ctx.opzioni
// In più (facoltative, senza di loro tutto resta com'era):
//   curva: p → angolo | [angolo, elevazione]   lo scroll decide la posa con questa funzione invece di a0/giro/el (es. soste sulle parti)
//   resta: true                                 dopo un trascinamento l'orologio resta dove l'hai lasciato finché la pagina non scorre
// e nell'oggetto restituito: angolo(), su('angolo' | 'vicino', cb), proietta([x, y, z], normale?), guarda(a, e), lascia(), sospendi(sì),
// avvicina([x, y, z], k | { mm, riempi }), allontana(), nitido(nome, hd, base) (vedi LEGGIMI.md)
import * as THREE from 'three';
import { preparaRenderer, creaMotore, RADICE } from './motore.js';
import { carica } from './modelli/indice.js';

const TAU = Math.PI * 2;
// a in (−π, π]
const giroCorto = a => ((a % TAU) + TAU * 1.5) % TAU - Math.PI;
// avvicina/allontana: molla smorzata critica (parte piano, arriva piano, niente rimbalzi; segue anche un bersaglio che si muove).
// OMEGA 7,5 → arrivata al 95% in circa 0,63 s, ferma a 0,8 s
const OMEGA = 7.5;
export async function monta(host, O = {}) {
  const mobile = matchMedia('(pointer:coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!O.conserva });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 2 : 2));
  preparaRenderer(renderer, { esposizione: O.esposizione ?? O.regola?.esposizione ?? 1 });
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block', touchAction: 'pan-y' });

  const motore = creaMotore(renderer, { luce: O.luce, riempimento: O.riempimento });
  const scene = new THREE.Scene();
  const t0 = performance.now();
  // modello: id dell'indice, oppure direttamente un modulo { id, nome, costruisci } (bozze e campionari)
  const mod = typeof O.modello === 'object' ? O.modello : await carica(O.modello ?? 'meridiano-verde');
  const pezzo = await mod.costruisci({ motore, opzioni: O });
  const tCostruzione = performance.now() - t0;
  const { gruppo, ingombro } = pezzo;
  // centra() ha spostato i figli del gruppo di −centro: il primo figlio (il pezzo dell'officina, creato a posizione zero) lo dice.
  // Serve a proietta(): i punti dei modelli sono nelle coordinate di costruisci(), prima di centra()
  const spost = gruppo.children[0]?.position.clone() ?? new THREE.Vector3();
  // inquadratura: quella del modello o, se manca, dall'ingombro con le proporzioni del Meridiano Verde (p2)
  const inq = pezzo.inquadratura ?? { altezza: ingombro.dimensioni[1] * 1.29, larghezza: ingombro.raggioXZ * 2 * 1.06 };
  if (O.ombra) { const om = motore.ombraContatto({ larghezza: ingombro.dimensioni[0] * .9, lunghezza: ingombro.dimensioni[2] * 1.3 }); om.position.y = ingombro.min[1] - .3; gruppo.add(om); }

  const giro = new THREE.Group(), incl = new THREE.Group();
  giro.add(gruppo); incl.add(giro); scene.add(incl);
  const camera = O.orto ? new THREE.OrthographicCamera(-O.orto, O.orto, O.orto, -O.orto, 1, 4000) : new THREE.PerspectiveCamera(22, 1, 4, 4000);
  host.classList.add('pronto');

  let W = 1, H = 1;
  function misura() {
    const w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    W = w; H = h;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    if (O.orto) { camera.left = -O.orto * w / h; camera.right = O.orto * w / h; }
    camera.updateProjectionMatrix();
  }
  misura(); new ResizeObserver(misura).observe(host);

  // trascinamento con inerzia; poi torna piano al giro intero (così lo scroll finisce sempre di fronte)
  // mira: la posa chiesta da guarda() (angolo assoluto, già srotolato vicino a quello attuale); trattieni: niente ritorno finché la pagina non scorre
  let tira = 0, vt = 0, x0 = null, fermo = 0, mx = 0, my = 0, tx = 0, ty = 0;
  // pFermo: lo scroll quando la posa è stata fissata (la pagina deve scorrere di almeno 0,3% della sezione per liberarla: le code di Lenis no)
  let mira = null, eMira = 0, kE = 0, trattieni = false, corsa = 0, pFermo = 0;
  function lascia() { if (mira === null && !trattieni) return; mira = null; trattieni = false; fermo = 41; }
  host.addEventListener('pointerdown', e => {
    x0 = e.clientX; vt = 0; corsa = 0; host.setPointerCapture?.(e.pointerId);
    if (mira !== null) { mira = null; trattieni = !!O.resta; pFermo = p; }   // la mano vince su guarda(): si riparte dalla posa di adesso
  });
  host.addEventListener('pointermove', e => {
    const r = host.getBoundingClientRect(); mx = ((e.clientX - r.left) / r.width) * 2 - 1; my = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (x0 === null) return; vt = (e.clientX - x0) * .008; tira += vt; corsa += Math.abs(e.clientX - x0); x0 = e.clientX; fermo = 0;
  });
  const molla = () => { if (x0 !== null && O.resta && corsa > 6) { trattieni = true; pFermo = p; } x0 = null; };
  host.addEventListener('pointerup', molla); host.addEventListener('pointercancel', molla);
  host.addEventListener('pointerleave', () => { mx = my = 0; });

  let p = 0, cur = 0, visibile = true, sospeso = false, fisso = null, zoom = [1, 0, 0];
  let ang = 0, el = 0;
  const tInizio = performance.now();
  new IntersectionObserver(es => { visibile = es[0].isIntersecting; }).observe(host);
  const liscio = x => x * x * (3 - 2 * x);
  const a0 = O.a0 ?? 0, fine = Math.ceil((a0 + .001) / TAU) * TAU || TAU, arco = O.giro ?? fine - a0;
  // posa decisa dallo scroll: la curva della pagina, se c'è, altrimenti il giro da a0 che finisce di fronte
  const base = x => {
    x = Math.min(1, Math.max(0, x));
    if (!O.curva) return [a0 + arco * liscio(x), O.el ?? .12];
    const c = O.curva(x); return Array.isArray(c) ? c : [c, O.el ?? .12];
  };
  const fov = THREE.MathUtils.degToRad(camera.fov ?? 22);
  const ascolta = { angolo: new Set(), vicino: new Set() };
  const Qg = new THREE.Quaternion(), V = new THREE.Vector3(), N = new THREE.Vector3(), C = new THREE.Vector3(), C0 = new THREE.Vector3();
  // distanza della camera per l'inquadratura intera: l'altezza dell'inquadratura entra nella finestra; in verticale si allontana per la larghezza
  function distanza() {
    if (O.orto) return 1000;
    let d = inq.altezza / 2 / Math.tan(fov / 2);
    if (camera.aspect < .8) d = Math.max(d, (inq.larghezza / camera.aspect) / 2 / Math.tan(fov / 2));
    return d;
  }
  // ——— da vicino (avvicina / allontana): la camera va verso un punto del modello e lo tiene al centro della tela ———
  // vicino = { p: punto nelle coordinate del gruppo (già spostato da centra), punto: quello chiesto, k: ingrandimento, pV: lo scroll di allora }
  // lk = ln dell'ingrandimento di adesso (1 = inquadratura intera), Cz = centro inquadrato di adesso (mondo); vlk, vCz le loro velocità
  let vicino = null, lk = 0, vlk = 0, tPrec = null, attesaFerma = [];
  const quandoFerma = () => new Promise(r => attesaFerma.push(r));
  const Cz = new THREE.Vector3(), vCz = new THREE.Vector3(), CzT = new THREE.Vector3();
  const Qa = new THREE.Quaternion(), Qi = new THREE.Quaternion(), Eu = new THREE.Euler(), SU = new THREE.Vector3(0, 1, 0);
  // dove sarà il punto quando l'orologio arriva alla posa chiesta da guarda() (così la camera va dritta lì, senza inseguire il giro);
  // senza guarda() (trascinato, o lasciato allo scroll) dove è adesso: la camera lo segue mentre la mano gira l'orologio
  function bersaglio(out, oscilla) {
    const aT = mira !== null ? mira + oscilla : ang, eT = mira !== null ? eMira + tx : el;
    Qa.setFromAxisAngle(SU, -aT); Qi.setFromEuler(Eu.set(eT, fisso ? 0 : ty * .6, 0, 'XYZ'));
    return out.copy(vicino.p).applyQuaternion(Qa).applyQuaternion(Qi);
  }
  function smorza(x, v, xT, dt) { const a = OMEGA * OMEGA * (xT - x) - 2 * OMEGA * v; v += a * dt; return [x + v * dt, v]; }
  function disegna(t) {
    const dt = tPrec === null ? 1 / 60 : Math.min(.05, Math.max(0, (t - tPrec) / 1000)); tPrec = t;
    cur += (p - cur) * .09;
    const [aB, eB] = base(cur);
    if (x0 === null) {
      tira += vt; vt *= .94;
      if (mira !== null) tira += (mira - aB - tira) * .075;   // guarda(): gira morbido verso la posa chiesta e resta lì
      else if (Math.abs(vt) < .002 && !trattieni && !vicino) { fermo++; if (fermo > 40) { const m = Math.round(tira / TAU) * TAU; tira += (m - tira) * .03; } }
    }
    kE += ((mira !== null ? 1 : 0) - kE) * .075;
    tx += (my * .1 - tx) * .06; ty += (mx * .16 - ty) * .06;
    const oscilla = Math.sin((t - tInizio) / 2400) * .035;
    ang = fisso ? fisso[0] : aB + tira + oscilla;
    el = fisso ? fisso[1] : eB + (eMira - eB) * kE + tx;
    giro.rotation.y = -ang; incl.rotation.x = el; incl.rotation.y = fisso ? 0 : ty * .6;
    // da vicino: le due molle (ingrandimento in scala logaritmica e centro) con la stessa costante arrivano insieme
    if (vicino) bersaglio(CzT, oscilla); else CzT.set(0, 0, 0);
    [lk, vlk] = smorza(lk, vlk, vicino ? Math.log(vicino.k) : 0, dt);
    for (const c of ['x', 'y', 'z']) [Cz[c], vCz[c]] = smorza(Cz[c], vCz[c], CzT[c], dt);
    if (!vicino && Math.abs(lk) < 1e-4 && Math.abs(vlk) < 1e-4 && Cz.lengthSq() < 1e-6) { lk = vlk = 0; Cz.set(0, 0, 0); vCz.set(0, 0, 0); }
    // chi aspetta la camera ferma (nitido: il lavoro pesante si fa quando non si vede): molle quasi ferme (sotto 1 mm/s: l'oscillazione
    // lenta dell'orologio sposta il centro di ~0,35 mm/s, non conta), niente mano, giro arrivato
    if (attesaFerma.length && x0 === null && Math.abs(vlk) < .005 && vCz.lengthSq() < 1 && (mira === null || Math.abs(mira - aB - tira) < .01)) {
      const a = attesaFerma; attesaFerma = []; setTimeout(() => a.forEach(f => f()), 0);
    }
    // la camera guarda sempre lungo −z: da lontano il centro dell'orologio a distanza d, da vicino il punto a distanza d / k
    const d = distanza(), k = Math.exp(lk);
    camera.position.set(Cz.x + zoom[1], Cz.y + zoom[2], Cz.z + d / (zoom[0] * k)); camera.lookAt(Cz.x + zoom[1], Cz.y + zoom[2], Cz.z);
    pezzo.anima?.(t);
    renderer.render(scene, camera);
    // dopo il disegno le matrici sono quelle del fotogramma: chi ascolta può proiettare i suoi punti
    if (ascolta.angolo.size) { gruppo.getWorldQuaternion(Qg); const s = stato(); for (const f of ascolta.angolo) f(s); }
  }
  // k = ingrandimento di adesso (1 = inquadratura intera), kMira = quello chiesto da avvicina() (1 se nessuno)
  const stato = () => ({ a: ((ang % TAU) + TAU) % TAU, e: el, giro: ang, k: Math.exp(lk), kMira: vicino ? vicino.k : 1 });
  // l'ingrandimento che fa entrare mm millimetri (attorno al punto) nella frazione riempi del lato corto della tela
  const kPer = (mm, riempi = .88) => distanza() / (mm / (2 * Math.tan(fov / 2) * riempi * Math.min(1, camera.aspect)));
  const avvisaVicino = () => { const s = vicino ? { punto: vicino.punto, k: vicino.k } : null; for (const f of ascolta.vicino) f(s); };
  function allontana() { if (!vicino) return; vicino = null; avvisaVicino(); }
  renderer.setAnimationLoop(t => { if (visibile && !sospeso) disegna(t); });
  // solo per le verifiche
  window.__zoom = (k = 1, x = 0, y = 0) => { zoom = [k, x, y]; disegna(performance.now()); };            // ingrandimento k (2 = due volte più vicino), centro x, y in mm
  window.__orologio = (a, e) => { fisso = a === undefined ? null : [a, e ?? .12]; disegna(performance.now()); };
  window.__info = () => ({ modello: mod.id, costruzioneMs: Math.round(tCostruzione), triangoli: renderer.info.render.triangles, disegni: renderer.info.render.calls, ingombro, inquadratura: inq, viste: mod.viste ?? null, pixelRatio: renderer.getPixelRatio() });
  return {
    vai: x => {
      x = Math.min(1, Math.max(0, x));
      if ((mira !== null || trattieni) && Math.abs(x - pFermo) > .003) lascia();   // la pagina scorre: guarda() e trattieni finiscono, l'orologio torna allo scroll
      if (vicino && Math.abs(x - vicino.pV) > .003) allontana();                    // e la camera torna all'orologio intero
      p = x;
    },
    // angolo di adesso: a in [0, 2π) (0 = di fronte, π/2 = lato corona), e = elevazione, giro = angolo non ridotto,
    // k = ingrandimento di adesso (1 = intero), kMira = quello chiesto da avvicina()
    angolo: stato,
    // su('angolo', cb): cb({ a, e, giro, k, kMira }) a ogni fotogramma disegnato, dopo il disegno (fermo quando l'orologio non si vede).
    // su('vicino', cb): cb({ punto, k }) quando avvicina() parte, cb(null) quando si allontana (allontana(), o la pagina che scorre).
    // Restituisce la funzione per staccarsi
    su(evento, cb) { const s = ascolta[evento]; if (!s) throw new Error(`lumen3d/vetrina: evento "${evento}" sconosciuto (angolo, vicino)`); s.add(cb); return () => s.delete(cb); },
    // avvicina([x, y, z], k): la camera va (morbida, ~0,7 s) verso il punto del modello (mm, coordinate di costruisci) e lo tiene al centro
    // della tela, k volte più vicino dell'inquadratura intera; k = { mm, riempi } lo calcola perché mm millimetri attorno al punto riempiano
    // la frazione riempi (di serie 0,88) del lato corto della tela. Resta vicina mentre la mano gira l'orologio (il punto resta al centro);
    // finisce con allontana() o quando la pagina scorre (come guarda()). Per girare l'orologio verso la parte: guarda(a, e) insieme
    avvicina(pt, k = 2) {
      if (typeof k === 'object') k = kPer(k.mm, k.riempi);
      vicino = { p: new THREE.Vector3(pt[0], pt[1], pt[2]).add(spost), punto: pt, k: Math.min(8, Math.max(1, k)), pV: p };
      avvisaVicino();
      return vicino.k;
    },
    allontana,
    // proietta un punto del modello (mm, coordinate di costruisci) sulla tela: { x, y } in px CSS dall'angolo in alto a sinistra dell'host,
    // davanti = la sua faccia guarda chi guarda (con la normale: coseno > 0,2; senza: il punto sta dal lato della camera), dot = quel coseno
    proietta(pt, n) {
      V.set(pt[0], pt[1], pt[2]).add(spost); gruppo.localToWorld(V);
      let dot = null, davanti;
      if (n) { N.set(n[0], n[1], n[2]).normalize().applyQuaternion(Qg); dot = N.dot(C.copy(camera.position).sub(V).normalize()); davanti = dot > .2; }
      else { gruppo.getWorldPosition(C0); davanti = V.distanceTo(camera.position) < C0.distanceTo(camera.position); }
      V.project(camera);
      return { x: (V.x + 1) / 2 * W, y: (1 - V.y) / 2 * H, davanti, dot };
    },
    // gira morbido verso l'angolo a (elevazione e, facoltativa) per la via più corta e resta lì finché la pagina non scorre o la mano non lo gira
    guarda(a, e) {
      mira = ang - (Math.sin((performance.now() - tInizio) / 2400) * .035) + giroCorto(a - ang);
      if (e !== undefined) eMira = e; else if (kE < .01) eMira = el - tx;
      vt = 0; fermo = 0; pFermo = p;
    },
    lascia,
    // sospendi(true): niente disegni (es. mentre una foto a tutto schermo lo copre); sospendi(false) riprende
    sospendi(s = true) { sospeso = !!s; },
    nitido,
    modello: mod, pezzo, motore, renderer, camera,
    libera() {
      renderer.setAnimationLoop(null); motore.libera(); gruppo.traverse(o => { o.geometry?.dispose(); if (o.userData.nitido) { o.material.map?.dispose(); o.material.dispose(); } });
      renderer.dispose(); renderer.domElement.remove(); ascolta.angolo.clear(); ascolta.vicino.clear();
    },
  };

  // nitido(nome, hd, base): la foto grande di una mesh fotografica del modello (es. 'quadrante', il disco di motore.quadrante) per
  // guardarla da vicino. Si scarica solo quando la chiami (una volta: le chiamate dopo danno la stessa Promise). Le ombre che il motore
  // ha dipinto sulla foto piccola (base) si riportano sulla grande: rapporto fra la texture dipinta e la foto base (le ombre sono
  // morbide: basta a 512 px), moltiplicato sulla grande. Il risultato va in un disco uguale (stessa geometria, stesso posto, 0,02 mm
  // sopra), trasparente, sotto i pezzi 3D e sotto il vetro. Restituisce Promise → { velo(x) } con x 0…1 = quanto si vede (0 = spento).
  // Il file si scarica e si decodifica subito (fuori dal filo principale); disegno, ombre e caricamento sulla scheda video (initTexture)
  // aspettano la camera ferma. Chi la usa poi dissolve con velo().
  function nitido(nome, hd, basePercorso) {
    const chiave = nome + '|' + hd;
    nitido.cache ??= new Map();
    if (nitido.cache.has(chiave)) return nitido.cache.get(chiave);
    const pr = (async () => {
      const m = gruppo.getObjectByName(nome);
      if (!m?.isMesh) throw new Error(`lumen3d/vetrina: nel modello non c'è la mesh "${nome}"`);
      // la foto grande, decodificata fuori dal filo principale; la base (già in memoria: la texture del motore)
      const blob = await (await fetch(new URL(hd, RADICE))).blob();
      const [im, baseIm] = await Promise.all([createImageBitmap(blob), basePercorso ? motore.immagine(basePercorso) : null]);
      // disegno, ombre e caricamento sulla scheda video costano qualche decina di ms: si fanno a camera ferma (lì un fotogramma lungo
      // non si vede), non durante l'avvicinamento
      await quandoFerma();
      const S = im.width, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0, S, S); im.close?.();
      const dipinta = m.material.map?.image;
      if (baseIm && dipinta && dipinta !== baseIm) {
        const L = 512, leggi = src => { const t = document.createElement('canvas'); t.width = t.height = L; const q = t.getContext('2d', { willReadFrequently: true }); q.drawImage(src, 0, 0, L, L); return q.getImageData(0, 0, L, L); };
        const A = leggi(dipinta), B = leggi(baseIm), F = new ImageData(L, L);
        for (let i = 0; i < A.data.length; i += 4) {
          const f = Math.min(1, (A.data[i] + A.data[i + 1] + A.data[i + 2] + 3) / (B.data[i] + B.data[i + 1] + B.data[i + 2] + 3));
          F.data[i] = F.data[i + 1] = F.data[i + 2] = Math.round(f * 255); F.data[i + 3] = 255;
        }
        const fc = document.createElement('canvas'); fc.width = fc.height = L; fc.getContext('2d').putImageData(F, 0, 0);
        g.globalCompositeOperation = 'multiply'; g.imageSmoothingQuality = 'high'; g.drawImage(fc, 0, 0, S, S); g.globalCompositeOperation = 'source-over';
      }
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, opacity: 0, depthWrite: false });
      const disco = new THREE.Mesh(m.geometry, mat);
      disco.position.copy(m.position); disco.quaternion.copy(m.quaternion); disco.scale.copy(m.scale); disco.position.z += .02;
      disco.renderOrder = 1; disco.visible = false; disco.name = nome + '-nitido'; disco.userData.nitido = true;
      m.parent.add(disco);
      renderer.initTexture(tex);
      return { velo(x) { x = Math.min(1, Math.max(0, x)); mat.opacity = x; disco.visible = x > .002; }, texture: tex, mesh: disco };
    })();
    nitido.cache.set(chiave, pr);
    pr.catch(() => nitido.cache.delete(chiave));
    return pr;
  }
}
