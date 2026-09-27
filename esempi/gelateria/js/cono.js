// Gelateria · la scena del cono che si riempie scrollando. monta(host, { telefono, ridotto, zona }) → { avanza(p), ... }
// p = avanzamento della sezione (0…1), reversibile: tornando su tutto si smonta senza scatti.
//   cono vuoto che gira piano → 1 FRAGOLA cade e si posa a sinistra (schiaccia, rimbalza) → 2 CIOCCOLATO a destra, contro la
//   fragola: dalla fragola colano gocce rosa → 3 PISTACCHIO sopra, al centro: colano gocce di cioccolato (e un'altra rosa)
//   → il cono fa un giro completo.
// zona(): lo spazio libero per il 3D in pixel { cx (0…1 della larghezza), alto, basso } (i testi della pagina stanno fuori).
import * as THREE from 'three';
import { studio } from './studio.js';
import { creaOcclusione, conOmbre } from './occlusione.js';
import { creaCono, CONO, orloA, PENDENZA } from './cialda.js';
import { creaPallina, aggiornaContatti } from './pallina.js';
import { creaGoccia } from './gocce.js';
import { creaTavolo } from './tavolo.js';
import { pezziFragola, granella, scaglie } from './guarnizioni.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lim = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const liscia = (a, b, x) => { const t = lim((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// la linea del tempo (in p)
export const TEMPI = {
  F: [.07, .16],           // fragola: cade da … tocca a
  C: [.27, .36],           // cioccolato
  P: [.48, .57],           // pistacchio
  rimbalzo: .07,           // quanto dura il rimbalzo dopo il contatto
  goccePink: [.36, .52],
  gocceCioc: [.57, .74],
  guarnizioni: [.71, .83],  // granella sul pistacchio, scaglie sul cioccolato
  giro: [.8, .97],
};

// dove si posa ogni pallina (nello spazio del cono: punta in 0, bocca a y = H)
const POSA = {
  F: { pos: V3(-.63, CONO.H + .34, .2), rot: new THREE.Euler(.06, .12, .27), r: 1.03 },
  C: { pos: V3(.64, CONO.H + .29, -.17), rot: new THREE.Euler(-.04, -.15, -.29), r: 1.02 },
  P: { pos: V3(.03, CONO.H + 1.64, -.02), rot: new THREE.Euler(.12, .35, .06), r: 1.0 },
};

export async function monta(host, { telefono = false, ridotto = false, zona = () => ({ cx: .5, alto: 0, basso: 0 }), logo = 'img/logo-freddo.webp', marchio = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });

  const scena = new THREE.Scene();
  const env = studio(renderer); scena.environment = env.texture; scena.environmentIntensity = .75;
  const camera = new THREE.PerspectiveCamera(22, 1, .1, 120);
  const sole = new THREE.DirectionalLight('#fff0dc', 1.9);
  // l'ombra vera serve dentro il gelato (palline sul cono e l'una sull'altra); sul banco c'è un'ombra morbida disegnata
  sole.castShadow = true; sole.shadow.mapSize.set(telefono ? 1024 : 1536, telefono ? 1024 : 1536);
  Object.assign(sole.shadow.camera, { left: -2.6, right: 2.6, top: 4.4, bottom: -4.4, near: .5, far: 30 });
  sole.shadow.bias = -.0005; sole.shadow.normalBias = .02; sole.shadow.intensity = .8;
  scena.add(sole, sole.target);

  const occl = creaOcclusione();
  const tavolo = creaTavolo(renderer, { telefono, occl, quota: -.62 });
  scena.add(tavolo.gruppo);
  const gelato = new THREE.Group(); scena.add(gelato);
  const cono = await creaCono(renderer, { telefono, occl, logoUrl: logo, marchio });
  gelato.add(cono.gruppo);

  const N = telefono ? 36 : 48;
  const [F, C, P] = await Promise.all([
    creaPallina({ gusto: 'fragola', seme: 11, N, occl, indice: 0, telefono, opzForma: { rilievoGeo: .032 }, materiale: { colore: '#fbe0e5', ruvido: .72, lucido: .5, rilievo: .011, sheen: .3, sheenColor: '#ffdfe3' } }),
    creaPallina({ gusto: 'cioccolato', seme: 23, N, occl, indice: 1, telefono, opzForma: { rilievoGeo: .032 }, materiale: { colore: '#e2d0c8', ruvido: .6, lucido: .42, rilievo: .012, sheen: .25, sheenColor: '#c89070', clearcoat: .04 } }),
    creaPallina({ gusto: 'pistacchio', seme: 37, N, occl, indice: 2, telefono, schiaccia: .9,
      // porzionatore vero: più bassa e larga, cupola meno tonda, orlo sfrangiato ben visibile sopra le altre due, il ricciolo in alto
      opzForma: { grumi: .045, rilievoGeo: .032, orlo: .045, orloLat: -.3, appiattisci: .05, ricciolo: { a: [.62, .5, .6], s0: .42, w: .13, amp: .09 } }, materiale: { colore: '#f4f8ec', ruvido: .74, lucido: .56, rilievo: .011, sheen: .35, sheenColor: '#f4f2d6' } }),
  ]);
  const palline = { F, C, P };
  for (const [k, p] of Object.entries(palline)) {
    p.perno = new THREE.Group(); p.perno.add(p.mesh); gelato.add(p.perno); p.chiave = k; p.posa = POSA[k];
    p.mesh.scale.setScalar(POSA[k].r);
  }

  // gocce: materiale lucido con i colori della pallina
  const matGoccia = (colore, sheen, mappa) => {
    const m = new THREE.MeshPhysicalMaterial({ map: mappa, color: new THREE.Color(colore), roughness: .24, clearcoat: 1, clearcoatRoughness: .06, sheen: .2, sheenRoughness: .4, sheenColor: new THREE.Color(sheen) });
    conOmbre(m, occl);
    return m;
  };
  // le gocce prendono il colore dalla foto della loro pallina (stessa texture, un pezzo largo): stesso gelato, sciolto
  const mRosa = matGoccia('#f3c9d0', '#ffd6dc', F.uni.uGelColore.value), mCioc = matGoccia('#f0e2da', '#a8745a', C.uni.uGelColore.value);
  mRosa.roughness = mCioc.roughness = .2;
  const gocce = [
    { g: creaGoccia({ mat: mRosa, th: -.5, lung: .52, largo: .15 }), t: [TEMPI.goccePink[0], TEMPI.goccePink[1] - .02] },
    { g: creaGoccia({ mat: mRosa, th: -.93, lung: .74, largo: .17 }), t: [TEMPI.goccePink[0] + .02, TEMPI.goccePink[1]] },
    { g: creaGoccia({ mat: mCioc, th: .64, lung: .66, largo: .16 }), t: [TEMPI.gocceCioc[0], TEMPI.gocceCioc[1]] },
    { g: creaGoccia({ mat: mCioc, th: 1.05, lung: .38, largo: .13 }), t: [TEMPI.gocceCioc[0] + .03, TEMPI.gocceCioc[1] - .02] },
    { g: creaGoccia({ mat: mRosa, th: -.14, lung: .36, largo: .13 }), t: [TEMPI.gocceCioc[0] + .02, TEMPI.gocceCioc[1] - .01] },
  ];
  for (const d of gocce) gelato.add(d.g.mesh);
  // dentro e sopra: pezzi di fragola (sempre), granella e scaglie (cadono nel finale)
  F.mesh.add(pezziFragola(F, occl, { telefono }));
  const gran = granella(P, occl, { n: telefono ? 44 : 70 }); P.mesh.add(gran.mesh);
  const scag = scaglie(C, occl, { n: telefono ? 10 : 16 }); C.mesh.add(scag.mesh);

  // ————— stato —————
  let pVis = 0, pObi = 0, yawIdle = 0, tempoFermo = false, vista = null, sporco = true, ultimo = performance.now();
  // ————— inquadratura —————
  let W = 1, H = 1;
  function misura() {
    W = host.clientWidth || 1; H = host.clientHeight || 1;
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    sporco = true;
  }
  const ro = new ResizeObserver(misura); ro.observe(host); misura();

  const _c = V3(0, 0, 0);

  // caduta + schiacciamento + rimbalzo di una pallina (deterministico in p)
  function posaPallina(pal, [t0, t1], extraSchiaccia = 0, spinta = V3(0, 0, 0)) {
    const vis = pal.visibile = p > t0;
    pal.perno.visible = vis;
    if (!vis) return;
    const tau = lim((p - t0) / (t1 - t0)), a = (p - t1) / TEMPI.rimbalzo;
    let yOff = 0, sy = 1;
    // gelato vero: pesante e plastico. Cade, all'impatto si schiaccia di colpo e RESTA un filo schiacciato dove appoggia:
    // niente molla, niente rimbalzo (prima oscillava come una gelatina)
    if (tau < 1) { yOff = 7.5 * (1 - tau * tau); sy = 1 + .03 * tau * tau; }
    else if (!ridotto) {
      sy = 1 - (.035 + .075 * Math.exp(-7 * a)) * (1 - Math.exp(-45 * a));
      yOff = (sy - 1) * .55 * pal.posa.r;
    }
    sy -= extraSchiaccia;
    const sxz = 1 / Math.sqrt(sy);
    pal.perno.position.copy(pal.posa.pos).add(spinta); pal.perno.position.y += yOff;
    pal.perno.rotation.copy(pal.posa.rot); pal.perno.rotation.y += (1 - tau) * .45;
    pal.mesh.scale.set(sxz * pal.posa.r, sy * pal.posa.r, sxz * pal.posa.r);
  }
  // spinta breve (0 → 1 → 0) intorno a un contatto: per chi sta sotto quando arriva quella sopra
  const colpo = (t) => { const a = (p - t) / TEMPI.rimbalzo; return a <= 0 ? 0 : (1 - Math.exp(-40 * a)) * Math.exp(-9 * a); };   // un colpo sordo, senza ritorno

  let p = 0;
  function componi(pp, t) {
    p = pp;
    // tuffo del cono a ogni contatto
    const tuffo = ridotto ? 0 : colpo(TEMPI.F[1]) + colpo(TEMPI.C[1]) * 1.1 + colpo(TEMPI.P[1]) * 1.3;
    // giro: in apertura gira piano da solo; poi segue lo scroll; alla fine un giro completo
    const idle = liscia(.06, 0, p);
    const giro = liscia(TEMPI.giro[0], TEMPI.giro[1], p) * Math.PI * 2;
    const yawScroll = -.18 + .3 * liscia(.05, .7, p) + giro;
    let yi = yawIdle % (Math.PI * 2); if (yi > Math.PI) yi -= Math.PI * 2;
    gelato.rotation.y = mix(yawScroll, yawScroll + yi, idle);
    gelato.position.y = -.035 * tuffo + (ridotto ? 0 : .04 * Math.sin(t / 900) * idle);

    posaPallina(F, TEMPI.F, .035 * colpo(TEMPI.C[1]) + .03 * colpo(TEMPI.P[1]), V3(-.03 * liscia(TEMPI.C[1] - .01, TEMPI.C[1] + .03, p), 0, 0));
    posaPallina(C, TEMPI.C, .03 * colpo(TEMPI.P[1]));
    posaPallina(P, TEMPI.P);
    for (const d of gocce) d.g.cresci(ridotto ? liscia(d.t[0], d.t[0] + .02, p) : Math.pow(liscia(d.t[0], d.t[1], p), .8));
    const [g0, g1] = TEMPI.guarnizioni;
    gran.cadi(lim((p - g0) / (g1 - g0))); scag.cadi(lim((p - g0 - .015) / (g1 - g0)));
  }

  function aggiornaUniform() {
    scena.updateMatrixWorld(true);
    // sfere delle palline (mondo) per le ombre di contatto
    const sf = occl.uSfere.value, lista = [F, C, P];
    lista.forEach((pal, i) => {
      if (!pal.perno.visible) { sf[i].set(0, -99, 0, 0); return; }
      pal.mesh.getWorldPosition(_c);
      const s = pal.mesh.scale;
      sf[i].set(_c.x, _c.y, _c.z, .92 * Math.cbrt(s.x * s.y * s.z));
    });
    const punta = V3(0, 0, 0).applyMatrix4(gelato.matrixWorld);
    occl.uConoAsse.value.copy(punta);
    occl.uOrlo.value.set(punta.x, punta.y + CONO.H, punta.z, CONO.R);
    const conoU = { punta: punta.y, pendenza: PENDENZA, orlo: punta.y + CONO.H - .02 };
    // contatti: la fragola si adatta al cioccolato, il pistacchio a tutte e due (le sfere un po' più piccole della forma vera)
    const info = (pal, k) => pal.perno.visible ? { centro: pal.mesh.getWorldPosition(new THREE.Vector3()), raggio: k * Math.cbrt(pal.mesh.scale.x * pal.mesh.scale.y * pal.mesh.scale.z) } : null;
    if (F.perno.visible) aggiornaContatti(F, [info(C, .9), null], conoU);
    if (C.perno.visible) aggiornaContatti(C, [null, null], conoU);
    if (P.perno.visible) aggiornaContatti(P, [info(F, .9), info(C, .9)], null);
    // l'ombra morbida sul banco: la punta e, quando ci sono, le palline
    const quante = [F, C, P].filter(x => x.perno.visible && x.perno.position.y < CONO.H + 3).length;
    tavolo.contatto(punta.x, punta.z, punta.y - tavolo.quota, quante);
  }

  // camera: tiene dentro la parte che serve (il cono vuoto, poi con una, due, tre palline) nella zona libera
  const fovY = THREE.MathUtils.degToRad(camera.fov);
  function inquadra() {
    const z = vista?.zonaLibera ? { cx: .5, alto: 0, basso: 0 } : zona();
    const k1 = liscia(TEMPI.F[0], TEMPI.F[1] + .02, p), k3 = liscia(TEMPI.P[0] - .04, TEMPI.P[1], p);
    const alto = mix(mix(CONO.H + .55, CONO.H + 1.55, k1), CONO.H + 2.85, k3);
    const basso = -.35;
    const largo = mix(2.4, 3.9, k1);
    const hz = Math.max(80, H - z.alto - z.basso);          // pixel liberi in altezza
    const hFr = hz / H;                                      // frazione dell'altezza
    const elev = THREE.MathUtils.degToRad(mix(15, 7, liscia(.03, .3, p)) + 2 * liscia(TEMPI.giro[0], TEMPI.giro[1], p));
    const hW = (alto - basso) * (telefono ? 1.05 : 1.1), wW = largo * 1.08;
    let dist = Math.max(hW / 2 / Math.tan(fovY / 2) / hFr, wW / 2 / Math.tan(fovY / 2) / camera.aspect);
    const cy = (alto + basso) / 2;
    if (vista) dist *= vista.zoom ?? 1;
    const az = vista ? vista.angolo : 0;
    const tgt = V3(vista?.x ?? 0, vista?.y ?? cy, 0);
    const el = vista?.elev != null ? THREE.MathUtils.degToRad(vista.elev) : elev;
    camera.position.set(tgt.x + Math.sin(az) * Math.cos(el) * dist, tgt.y + Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(tgt);
    // sposta l'immagine: il centro della scena va al centro della zona libera
    const cyPx = z.alto + hz / 2, cxPx = z.cx * W;
    camera.setViewOffset(W, H, W / 2 - cxPx, H / 2 - cyPx, W, H);
    camera.updateProjectionMatrix();
    // luce fissa rispetto alla camera (in alto a sinistra, davanti)
    const dx = V3().subVectors(camera.position, tgt).normalize(), dxr = V3().crossVectors(V3(0, 1, 0), dx).normalize();
    sole.position.copy(tgt).addScaledVector(dx, 6).addScaledVector(dxr, -4.5).add(V3(0, 8, 0));
    sole.target.position.copy(tgt).setY(cy - .6);
  }

  function disegna(t) {
    const m = window.__misura, t0 = m ? performance.now() : 0;
    componi(pVis, t);
    const t1 = m ? performance.now() : 0;
    aggiornaUniform();
    const t2 = m ? performance.now() : 0;
    inquadra();
    renderer.render(scena, camera);
    sporco = false;
    if (m) { const t3 = performance.now(); if (t3 - t0 > 12) (window.__tempi ||= []).push({ p: +pVis.toFixed(3), componi: +(t1 - t0).toFixed(1), uniform: +(t2 - t1).toFixed(1), disegno: +(t3 - t2).toFixed(1) }); }
  }

  // ciclo: gira solo se serve (scroll che sta arrivando, rotazione d'apertura visibile)
  let visibile = true, fermo = false;
  new IntersectionObserver(es => { visibile = es[0].isIntersecting; }).observe(host);
  renderer.setAnimationLoop(t => {
    const dt = Math.min(.05, (t - ultimo) / 1000); ultimo = t;
    if (!visibile || fermo) return;
    const idle = pVis < .06 && !ridotto && !tempoFermo;
    if (idle) yawIdle += dt * .35;
    const prima = pVis;
    if (tempoFermo) pVis = pObi;
    else pVis += (pObi - pVis) * (1 - Math.exp(-dt * (ridotto ? 30 : 9)));
    if (Math.abs(pObi - pVis) < 1e-5) pVis = pObi;
    if (idle || sporco || pVis !== prima) disegna(tempoFermo ? 0 : t);
  });

  const api = {
    avanza(pp) { pObi = lim(pp); },
    // per le verifiche: progresso fissato (niente rincorsa, niente rotazione d'apertura)
    fissa(pp) { tempoFermo = true; yawIdle = 0; pObi = pVis = lim(pp); disegna(0); },
    vista(opz) { vista = opz; sporco = true; if (tempoFermo) disegna(0); },
    ferma(s) { fermo = s; },
    info: () => ({ p: pVis, triangoli: renderer.info.render.triangles, chiamate: renderer.info.render.calls, dpr, W, H }),
    renderer, scena, camera,
  };
  // prima di mostrare: un disegno con tutto in scena (p = 1, poi a metà caduta) compila tutti gli shader e le ombre subito,
  // così non c'è lo scatto quando la prima pallina entra
  misura();
  for (const pp of [1, .55, 0]) { pVis = pp; disegna(0); }
  return api;
}
