// Doppio Strato · "Componi il tuo": il TUO burger si costruisce sul piatto di porcellana, dal basso. Ogni ingrediente scelto è uno
// strato vero ricavato dalle foto (lo stesso del palco): cade sul precedente con la gravità e un tonfo pesante, niente rimbalzi;
// il pane di sopra si solleva un attimo (come un coperchio) per farlo entrare, poi richiude cadendo col suo tonfo.
// Le miniature (lo strato da solo che gira piano) e la vista grande si disegnano con il renderer del palco (niente secondo
// contesto WebGL: stesse texture, stessi programmi) e si copiano ciascuna nella sua tela 2D (come nonsolo.js del gelato).
// uso: const c = monta(radice, { palco, D, ridotto }) → { aggiungi(id), togli(n), pane(id), ricomincia(), stato(), info() }
import * as THREE from 'three';
import { materiale, TIPI, NS } from './burger.js';
import { piatto, ombra, pietra, PIATTO_R, FONDO_PIATTO } from './palco.js';

const TAU = Math.PI * 2, FOV = 24;
const liscio = t => t * t * (3 - 2 * t);
const tra = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const mix = (a, b, t) => a + (b - a) * t;
const G = 200;                 // gravità (cm/s²): da 13 cm si cade in ~0,36 s
const ALTO_CADUTA = 6.5;       // da quanto sopra la pila arriva un ingrediente (cm): compare sotto il pane sollevato e cade
const COPERCHIO = { su: 8, dietro: -1.4, piega: -.12 };   // il pane di sopra aperto: più su, un filo indietro, inclinato
// come nel palco (burger chiuso "compatto" con c = 0,5): i morbidi affondano l'uno nell'altro e sbordano un filo
const MORB_C = { insalata: 1, bacon: 1, salsa: 1, anelli: .55, funghi: .8, cipolla: .6, cetrioli: .6, pomodoro: .4, manzo: .14, pane: .08 };
const MORBIDO = { pane: .06, insalata: .12, bacon: .1, salsa: .14, anelli: .05, funghi: .06, manzo: .03 };
const GONFIA = { salsa: .04, manzo: .012, insalata: .015 };
function polso(t, t0) { if (t < 0) return 0; const x = t / t0; return x * Math.exp(1 - x); }

export function monta(radice, { palco, D, ridotto }) {
  const R = palco.risorse, renderer = R.renderer, C = D.componi;
  const MAX = C.max ?? 8, MAX_UGUALI = C.maxUguali ?? 2;
  const $ = s => radice.querySelector(s);

  // ——— gli ingredienti: da quale burger e quale strato ———
  const voce = new Map();
  const tutte = [...C.pane.map(p => ({ ...p, pane: true, strato: 'pane-sopra' })), ...C.ingredienti];
  for (const v of tutte) {
    const B = R.burger(v.da); if (!B) throw new Error(`componi: burger ${v.da} non pronto`);
    const k = B.strati.findIndex(s => s.nome === v.strato);
    if (k < 0) throw new Error(`componi: ${v.da} non ha lo strato ${v.strato}`);
    voce.set(v.id, { ...v, B, k, s: B.strati[k] });
    if (v.pane) { const k2 = B.strati.findIndex(s => s.nome === 'pane-sotto'); voce.get(v.id).sotto = { B, k: k2, s: B.strati[k2] }; }
  }
  // geometria di uno strato: gli stessi attributi del burger (niente copie sulla scheda video), solo un intervallo di indici
  const geoCache = new Map();
  function geoStrato(B, k) {
    const chiave = B.id + ':' + k;
    if (!geoCache.has(chiave)) {
      const g = new THREE.BufferGeometry();
      for (const [n, a] of Object.entries(B.geo.attributes)) g.setAttribute(n, a);
      g.setIndex(B.geo.index);
      const [a0, n] = B.geo.userData.intervalli[k]; g.setDrawRange(a0, n);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 30);
      geoCache.set(chiave, g);
    }
    return geoCache.get(chiave);
  }
  const FONDO = { value: R.fondo.clone() };
  const FRONTE_VISTA = { value: 1 }, FRONTE_MINI = { value: 1 };
  // uno strato come oggetto a sé: sua mesh, suo materiale (sue uniform: schiacciamento, aria, velo), stesso programma del palco
  function pezzo(B, k, fronte) {
    const s = B.strati[k];
    const U = {
      uStrato: { value: Array.from({ length: NS }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uStrato2: { value: Array.from({ length: NS }, () => new THREE.Vector4(0, 1, 0, 0)) },
      uStrato3: { value: Array.from({ length: NS }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uCola: { value: .7 }, uColaV: B.U.uColaV, uLuce: { value: 1 }, uVelo: { value: 1 }, uFondo: FONDO, uFrangia: B.U.uFrangia, uFronte: fronte,
    };
    const mesh = new THREE.Mesh(geoStrato(B, k), materiale(B.C, U, .38));
    mesh.frustumCulled = false;
    const w = MORB_C[s.tipo] ?? .3, c = .5;
    return { B, k, s, U, mesh, tipo: s.tipo, spess: s.spessore,
      sqC: Math.max(.55, s.T.schiaccia * (1 - .28 * w * c)), affC: Math.min(.9, s.T.affonda + .5 * w * c), gC: 1 + .1 * w * c };
  }
  function luci(scena) {
    const spot = new THREE.SpotLight(0xffdfb8, 3.2, 0, .5, .5, 0); spot.position.set(0, 72, 10); spot.target.position.set(0, 3, 0);
    const chiave = new THREE.DirectionalLight(0xfff6ec, 2.2); chiave.position.set(-12, 20, 30);
    const contro = new THREE.DirectionalLight(0xffc88a, 1.9); contro.position.set(8, 16, -30);
    const sotto = new THREE.DirectionalLight(0xffe0c0, .4); sotto.position.set(0, -10, 14);
    const emi = new THREE.HemisphereLight(0xfff4ea, 0x2a2420, .45);
    scena.add(spot, spot.target, chiave, contro, sotto, emi);
    scena.environment = R.ambiente; scena.background = R.fondo;
  }

  // ——— la vista grande: pietra, piatto, la pila ———
  const scena = new THREE.Scene(); luci(scena);
  scena.fog = new THREE.Fog(R.fondo, 60, 150);
  scena.add(pietra());
  const perno = new THREE.Group(); scena.add(perno);
  perno.add(piatto());
  const oT = ombra(PIATTO_R * 1.18, .85, .4); oT.position.y = .02; perno.add(oT);
  const oP = ombra(6.2, .8, .45); oP.position.y = FONDO_PIATTO + .015; perno.add(oP);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 600);

  // ——— la pila: [pane di sotto, …ingredienti, pane di sopra]; ogni elemento ha la sua quota y (base del nucleo, sul piatto) ———
  let pane = C.paneIniziale ?? C.pane[0].id;
  const pila = [];
  const vie = [];   // quelli che se ne vanno (si rimpiccioliscono e salgono)
  let seme = 7; const rnd = () => (seme = (seme * 16807) % 2147483647) / 2147483647 - .5;
  function elemento(B, k, id, ruolo) {
    const e = pezzo(B, k, FRONTE_VISTA);
    Object.assign(e, { id, ruolo, y: 0, v: 0, yT: 0, scala: 1, scalaT: 1, z: 0, piega: 0, tonfo: 0, atterrato: true, storto: [rnd() * .05, rnd() * .06, rnd() * .25, rnd() * .25] });
    perno.add(e.mesh);
    return e;
  }
  function paneDi(id) { const v = voce.get(id); return { sopra: [v.B, v.k], sotto: [v.sotto.B, v.sotto.k] }; }
  { const p = paneDi(pane); pila.push(elemento(...p.sotto, pane, 'sotto'), elemento(...p.sopra, pane, 'sopra')); }
  const base = () => FONDO_PIATTO + pila[0].s.sotto;
  // quote d'arrivo dal basso (come il burger chiuso del palco)
  function quote() {
    let y = base();
    for (let i = 0; i < pila.length; i++) {
      const e = pila[i];
      if (i > 0) { const g = pila[i - 1]; y += g.spess * g.sqC - e.spess * e.sqC * e.affC; }
      e.yT = y;
    }
  }
  quote();
  for (const e of pila) e.y = e.yT;
  const coperchio = () => pila[pila.length - 1];
  const cima = () => { const t = pila[pila.length - 2]; return t.yT + t.spess * t.sqC; };   // dove poggia il pane di sopra

  // ——— la coda: il pane si apre, l'ingrediente cade, il pane richiude ———
  const coda = [];
  let tProssimo = 0, tChiudi = 0, aperto = 0, sporco = true, tonfoCam = 0;
  function aggiungi(id) {
    const v = voce.get(id);
    if (!v || v.pane) return { ok: false };
    const dentro = pila.length - 2 + coda.length;
    if (dentro >= MAX) return { ok: false, motivo: 'pieno' };
    if (pila.filter(e => e.id === id).length + coda.filter(x => x === id).length >= MAX_UGUALI) return { ok: false, motivo: 'uguali' };
    coda.push(id); sporco = true; aggiorna();
    return { ok: true };
  }
  function lancia(id, t) {
    const v = voce.get(id), e = elemento(v.B, v.k, id, 'dentro');
    pila.splice(pila.length - 1, 0, e); quote();
    e.y = ridotto ? e.yT : e.yT + ALTO_CADUTA; e.v = 0; e.atterrato = !!ridotto;
    if (!ridotto) e.scala = .6;   // compare in un attimo (80 ms) e cade
    tProssimo = t + 170;
  }
  function togli(n) {   // n = posizione fra gli ingredienti (0 = il primo sopra il pane)
    const i = n + 1;
    if (i < 1 || i > pila.length - 2) return false;
    const [e] = pila.splice(i, 1); quote();
    e.scalaT = 0; e.via = true; vie.push(e);
    sporco = true; aggiorna(); return true;
  }
  function ricomincia() {
    coda.length = 0;
    for (let i = pila.length - 2; i >= 1; i--) { const [e] = pila.splice(i, 1); e.scalaT = 0; e.via = true; vie.push(e); }
    quote(); sporco = true; aggiorna();
  }
  function cambiaPane(id) {
    if (id === pane || !voce.get(id)?.pane) return;
    pane = id;
    const p = paneDi(id), vecchi = [pila[0], pila[pila.length - 1]];
    const sotto = elemento(...p.sotto, id, 'sotto'), sopra = elemento(...p.sopra, id, 'sopra');
    pila[0] = sotto; pila[pila.length - 1] = sopra; quote();
    for (const e of [sotto, sopra]) { e.y = e.yT; e.scala = ridotto ? 1 : .001; }
    for (const e of vecchi) { e.scalaT = 0; e.via = true; vie.push(e); }
    sporco = true; aggiorna();
  }
  function libera(e) { perno.remove(e.mesh); e.mesh.material.dispose(); }   // la geometria è condivisa: non si libera

  // ——— fisica di ogni fotogramma ———
  const tonfi = [];
  function passo(dt, t) {
    const s = dt / 1000;
    // il coperchio: aperto se c'è qualcosa in coda o in caduta; richiude 180 ms dopo l'ultimo arrivo
    const cade = pila.some(e => e.ruolo === 'dentro' && !e.atterrato);
    if (coda.length || cade) tChiudi = t + 180;
    // movimento ridotto: niente coperchio né cadute, gli strati compaiono al loro posto
    if (ridotto) { while (coda.length) lancia(coda.shift(), t); tChiudi = 0; }
    const apri = !ridotto && t < tChiudi ? 1 : 0;
    if (!ridotto && coda.length && aperto > .8 && t >= tProssimo) lancia(coda.shift(), t);
    const ap0 = aperto; aperto += (apri - aperto) * (ridotto ? 1 : 1 - Math.exp(-dt / (apri ? 90 : 120))); if (Math.abs(apri - aperto) < 1e-3) aperto = apri;
    if (aperto !== ap0) sporco = true;
    const cop = coperchio();
    for (let i = 0; i < pila.length; i++) {
      const e = pila[i];
      let yT = e.yT;
      if (e === cop && apri) yT = cima() + COPERCHIO.su;   // aperto: sollevato
      if (e.y > yT + 1e-3) {   // cade (gravità) fino alla quota, poi tonfo
        if (e === cop && apri) { e.y += (yT - e.y) * (1 - Math.exp(-dt / 80)); }
        else {
          e.v += G * s; e.y -= e.v * s;
          if (e.y <= yT) {
            const vel = e.v; e.y = yT; e.v = 0;
            if (!e.atterrato || vel > 8) {
              const forza = Math.min(1, vel / 70) * (e === cop ? 1.25 : 1);
              if (!ridotto && forza > .05) { tonfi.push({ t: 0, e, forza }); if (e === cop) tonfoCam = 1; }
            }
            e.atterrato = true;
          }
        }
        sporco = true;
      } else if (e.y < yT - 1e-3) { e.y += (yT - e.y) * (ridotto ? 1 : 1 - Math.exp(-dt / 70)); e.v = 0; sporco = true; if (Math.abs(yT - e.y) < 1e-3) e.y = yT; }
      else if (!e.atterrato && e.ruolo === 'dentro') e.atterrato = true;
      // il coperchio aperto va un po' indietro e si inclina; richiudendo torna dritto
      const zT = e === cop ? COPERCHIO.dietro * aperto : 0, pT = e === cop ? COPERCHIO.piega * aperto : 0;
      if (Math.abs(zT - e.z) > 1e-4 || Math.abs(pT - e.piega) > 1e-4) { const k = ridotto ? 1 : 1 - Math.exp(-dt / 90); e.z += (zT - e.z) * k; e.piega += (pT - e.piega) * k; sporco = true; }
      if (e.scala !== e.scalaT) { e.scala += (e.scalaT - e.scala) * (ridotto ? 1 : 1 - Math.exp(-dt / 70)); if (Math.abs(e.scalaT - e.scala) < 2e-3) e.scala = e.scalaT; sporco = true; }
    }
    for (let i = vie.length - 1; i >= 0; i--) {
      const e = vie[i];
      e.scala += (0 - e.scala) * (ridotto ? 1 : 1 - Math.exp(-dt / 60)); e.y += (ridotto ? 0 : 3 * s); sporco = true;
      if (e.scala < .02) { libera(e); vie.splice(i, 1); }
    }
    // tonfi: lo strato arrivato e quelli sotto si schiacciano per ~70 ms
    for (const e of pila) e.tonfo = 0;
    for (let j = tonfi.length - 1; j >= 0; j--) {
      const q = tonfi[j]; q.t += s;
      const i = pila.indexOf(q.e), f = polso(q.t, .07) * q.forza;
      if (i >= 0) for (let k = i; k >= 0; k--) pila[k].tonfo += f * (k === i ? 1 : .8);
      if (q.t > .5) tonfi.splice(j, 1);
    }
    if (tonfi.length) sporco = true;
    tonfoCam = Math.max(0, tonfoCam - s * 3);
    // uniform degli strati: schiacciamento, allargamento, aria sopra e sotto (ombre di contatto), un filo storti se poggiati
    for (let i = 0; i < pila.length; i++) {
      const e = pila[i], k = e.k, sq = e.sqC * (1 - e.tonfo * (MORBIDO[e.tipo] ?? .02)), g = e.gC * (1 + e.tonfo * (GONFIA[e.tipo] ?? .006));
      const su = i < pila.length - 1 ? pila[i + 1].y - (e.y + e.spess * sq) : 9, giu = i > 0 ? e.y - (pila[i - 1].y + pila[i - 1].spess * pila[i - 1].sqC) : 0;
      e.U.uStrato.value[k].set(0, 0, sq, Math.max(0, su));
      e.U.uStrato2.value[k].set(Math.max(0, giu), g, 0, 0);
      const st = e.atterrato && !(e === cop && aperto > .02) ? e.storto : [0, 0, 0, 0];
      e.U.uStrato3.value[k].set(st[0], st[1], st[2], st[3]);
      e.mesh.position.set(0, e.y, e.z); e.mesh.rotation.x = e.piega; e.mesh.scale.setScalar(Math.max(.001, e.scala));
    }
    for (const e of vie) { e.mesh.position.y = e.y; e.mesh.scale.setScalar(Math.max(.001, e.scala)); }
  }

  // ——— DOM: le miniature (bottoni), la lista, il conteggio ———
  const griglia = { pane: $('[data-griglia=pane]'), dentro: $('[data-griglia=dentro]') };
  const pr = () => renderer.getPixelRatio();
  const mini = [];
  for (const v of tutte) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ing'; b.dataset.id = v.id;
    b.setAttribute('aria-label', v.pane ? `${v.nome}` : `Aggiungi ${v.nome}`);
    if (v.pane) b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<canvas aria-hidden="true"></canvas><span class="n">${v.nome}</span><span class="c" aria-hidden="true"></span>`;
    (v.pane ? griglia.pane : griglia.dentro).appendChild(b);
    const vv = voce.get(v.id), p = pezzo(vv.B, vv.k, FRONTE_MINI);
    mini.push({ v: vv, b, tela: b.querySelector('canvas'), g2: null, p, visibile: false, fase: mini.length * 1.3, w: 0, h: 0, disegnata: false });
  }
  const scenaMini = new THREE.Scene(); luci(scenaMini);
  const camMini = new THREE.PerspectiveCamera(FOV, 16 / 10, 1, 400);
  for (const m of mini) { m.p.mesh.visible = false; scenaMini.add(m.p.mesh); m.p.U.uCola.value = .5; }
  const osserva = new IntersectionObserver(es => { for (const x of es) { const m = mini.find(q => q.tela === x.target); if (m) m.visibile = x.isIntersecting; } }, { rootMargin: '60px' });
  for (const m of mini) osserva.observe(m.tela);
  function misuraMini() {
    for (const m of mini) {
      const r = m.tela.getBoundingClientRect(), w = Math.max(1, Math.round(r.width * pr())), h = Math.max(1, Math.round(r.height * pr()));
      if (w !== m.w || h !== m.h) { m.w = w; m.h = h; m.tela.width = w; m.tela.height = h; m.g2 = m.tela.getContext('2d'); m.disegnata = false; }
    }
  }

  const lista = $('[data-lista]'), conto = $('[data-conto]'), msg = $('[data-msg]');
  const nomeDi = id => voce.get(id).nome;
  function aggiorna() {
    const ids = [...pila.slice(1, -1).map(e => e.id), ...coda];
    const n = ids.length;
    conto.textContent = n ? `${n} di ${MAX}` : `fino a ${MAX}`;
    // la lista dall'alto in basso, come il burger
    const righe = [`<li><span>${nomeDi(pane)}</span></li>`];
    for (let i = n - 1; i >= 0; i--) righe.push(`<li><span>${nomeDi(ids[i])}</span><button type="button" data-togli="${i}" aria-label="Togli ${nomeDi(ids[i])}">togli</button></li>`);
    righe.push(`<li><span>${nomeDi(pane)}</span></li>`);
    lista.innerHTML = righe.join('');
    for (const m of mini) {
      const q = ids.filter(x => x === m.v.id).length;
      if (m.v.pane) { m.b.classList.toggle('scelto', m.v.id === pane); m.b.setAttribute('aria-pressed', m.v.id === pane ? 'true' : 'false'); }
      else {
        m.b.classList.toggle('scelto', q > 0);
        m.b.querySelector('.c').textContent = q > 1 ? `×${q}` : '';
        m.b.classList.toggle('spento', n >= MAX || q >= MAX_UGUALI);
      }
    }
    radice.dispatchEvent(new CustomEvent('cambia', { detail: { ids, pane } }));
  }
  radice.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !radice.contains(b)) return;
    if (b.dataset.togli !== undefined) {
      const ids = [...pila.slice(1, -1).map(x => x.id)], i = +b.dataset.togli;
      if (i < ids.length) togli(i); else { coda.splice(i - ids.length, 1); aggiorna(); }
      msg.textContent = ''; return;
    }
    if (b.hasAttribute('data-ricomincia')) { ricomincia(); msg.textContent = ''; return; }
    if (b.classList.contains('ing')) {
      const v = voce.get(b.dataset.id);
      if (v.pane) { cambiaPane(v.id); msg.textContent = ''; return; }
      const r = aggiungi(v.id);
      msg.textContent = r.ok ? '' : r.motivo === 'pieno' ? `Al massimo ${MAX} strati: togline uno.` : `${v.nome}: al massimo ${MAX_UGUALI} volte.`;
    }
  });

  // ——— trascinare la vista gira il burger ———
  const vista = $('[data-vista]'), tela = vista.querySelector('canvas');
  let giroMano = 0, giroV = 0, presa = null, tMano = 0;
  tela.addEventListener('pointerdown', e => { presa = { id: e.pointerId, x: e.clientX, y0: e.clientY, asse: 0 }; });
  tela.addEventListener('pointermove', e => {
    if (!presa || presa.id !== e.pointerId) return;
    const dx = e.clientX - presa.x; presa.x = e.clientX;
    if (!presa.asse) { if (Math.abs(e.clientX - presa.x) > 6 || Math.abs(dx) > 3) presa.asse = Math.abs(e.clientY - presa.y0) > Math.abs(dx) * 1.5 ? 2 : 1; if (presa.asse === 1) tela.setPointerCapture?.(e.pointerId); }
    if (presa.asse !== 1) return;
    giroV = dx * .01; giroMano += giroV; tMano = performance.now(); sporco = true;
  });
  const lascia = e => { if (presa?.id === e.pointerId) { presa = null; if (performance.now() - tMano > 90) giroV = 0; } };
  tela.addEventListener('pointerup', lascia); tela.addEventListener('pointercancel', lascia);

  // ——— disegno: prima le miniature (una alla volta, scissor), poi la vista grande; ognuna copiata nella sua tela 2D ———
  let W = 0, H = 0, g2 = null, hS = 0;
  function misuraVista() {
    const r = tela.getBoundingClientRect(), w = Math.max(1, Math.round(r.width * pr())), h = Math.max(1, Math.round(r.height * pr()));
    if (w !== W || h !== H) { W = w; H = h; tela.width = w; tela.height = h; g2 = tela.getContext('2d'); sporco = true; }
  }
  const dim = new THREE.Vector2();
  function regione(w, h) {   // viewport in alto a sinistra della tela del renderer (px CSS), w e h in px veri
    renderer.getDrawingBufferSize(dim);
    const p = pr(), wc = w / p, hc = h / p, Hc = dim.y / p;
    renderer.setViewport(0, Hc - hc, wc, hc); renderer.setScissor(0, Hc - hc, wc, hc); renderer.setScissorTest(true);
    return w <= dim.x && h <= dim.y;
  }
  function disegnaMini(m, t) {
    if (!m.g2 || !m.w) return;
    const p = m.p, s = p.s, ang = ridotto ? .55 : m.fase + t / 1000 * .55;
    p.mesh.visible = true; p.mesh.rotation.y = ang;
    FRONTE_MINI.value = Math.max(0, (Math.cos(ang) - .8) / .2);
    const alto = s.sopra + s.sotto, yc = (s.sopra - s.sotto) / 2, r = s.raggio;
    camMini.aspect = m.w / m.h;
    // quasi di lato: si vede la foto (la faccia di sopra è solo una media del colore)
    const e = s.tipo === 'salsa' ? .1 : .17, Dh = (alto + r * .3) * 1.25 / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)), Dw = r * 2.08 / 2 / (Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * camMini.aspect);
    const Dd = Math.max(Dh, Dw);
    camMini.position.set(0, yc + Dd * Math.sin(e), Dd * Math.cos(e)); camMini.lookAt(0, yc, 0); camMini.near = Dd * .3; camMini.far = Dd * 3; camMini.updateProjectionMatrix();
    if (regione(m.w, m.h)) { renderer.render(scenaMini, camMini); m.g2.drawImage(renderer.domElement, 0, 0, m.w, m.h, 0, 0, m.w, m.h); }
    p.mesh.visible = false; m.disegnata = true;
  }
  function disegnaVista(dt, t) {
    if (!g2 || !W) return;
    // l'altezza da inquadrare (lisciata): la pila + il pane aperto sopra + quello che sta cadendo
    const cop = coperchio();
    const hM = Math.max(cop.y + cop.s.sopra, cima() + 3) + 1.5;
    hS = hS && dt ? hS + (hM - hS) * (1 - Math.exp(-dt / (hM > hS ? 140 : 600))) : hM;   // si allarga svelta (il pane che si alza resta dentro), si stringe con calma
    const asp = W / H; camera.aspect = asp;
    const tanM = Math.tan(THREE.MathUtils.degToRad(FOV / 2)), e = .16;
    const hF = Math.max(hS + 1.5, 13), wF = PIATTO_R * 2 * .98;
    const Dd = Math.max(hF / 2 / tanM, wF / 2 / (tanM * asp));
    const yc = hF / 2 - .6, scossa = tonfoCam > 0 ? polso(1 - tonfoCam, .23) * .18 : 0;
    camera.position.set(0, yc + Dd * Math.sin(e) - scossa, Dd * Math.cos(e)); camera.lookAt(0, yc - scossa, 0);
    camera.near = Dd * .2; camera.far = Dd * 4 + 100; camera.updateProjectionMatrix();
    // il burger dondola piano (o lo gira la mano); di fronte la foto frastagliata
    if (!presa && Math.abs(giroV) > 1e-4) { giroMano += giroV * dt / 16.7; giroV *= Math.pow(.93, dt / 16.7); }
    else if (!presa && performance.now() - tMano > 2500) giroMano *= Math.exp(-dt / 700);
    const ang = (ridotto ? 0 : .26 * Math.sin(t / 7000 * TAU)) + giroMano;
    perno.rotation.y = ang;
    FRONTE_VISTA.value = Math.max(0, (Math.cos(ang) - .8) / .2);
    if (regione(W, H)) { renderer.render(scena, camera); g2.drawImage(renderer.domElement, 0, 0, W, H, 0, 0, W, H); }
  }

  // ——— ciclo: solo quando la sezione si vede ———
  let visibile = false, raf = 0, tPrima = 0, fotogramma = 0;
  const tempi = [];
  function ciclo(t) {
    raf = requestAnimationFrame(ciclo);
    const dt = tPrima ? Math.min(50, t - tPrima) : 16.7; tPrima = t;
    passo(dt, t);
    fotogramma++;
    const t0 = performance.now();
    palco.prestito(() => {
      // miniature: metà per fotogramma (girano piano: 30 fps bastano), solo quelle che si vedono; ferme se ridotto
      for (let i = 0; i < mini.length; i++) {
        const m = mini[i];
        if (!m.visibile) continue;
        if (ridotto ? !m.disegnata : (i + fotogramma) % 2 === 0) disegnaMini(m, t);
      }
      disegnaVista(dt, t);
    });
    if (window.__misuraComponi) tempi.push(performance.now() - t0);
  }
  function accendi(si) {
    if (si === visibile) return; visibile = si;
    if (si) { misuraMini(); misuraVista(); tPrima = 0; raf = requestAnimationFrame(ciclo); } else cancelAnimationFrame(raf);
  }
  new IntersectionObserver(es => accendi(es[0].isIntersecting), { rootMargin: '80px' }).observe(radice);
  new ResizeObserver(() => { misuraMini(); misuraVista(); }).observe(radice);

  aggiorna();
  return {
    aggiungi, togli, ricomincia, pane: cambiaPane,
    stato: () => ({ pane, ids: pila.slice(1, -1).map(e => e.id), coda: [...coda], aperto: +aperto.toFixed(2), fermo: !coda.length && pila.every(e => e.atterrato && Math.abs(e.y - e.yT) < 1e-3) && !vie.length && aperto < .01 }),
    nomi: () => [pane, ...pila.slice(1, -1).map(e => e.id)].map(nomeDi),
    // verifiche: tutto arrivato, subito (simula 3 s)
    assesta() { const t = performance.now(); for (let i = 0; i < 180; i++) passo(16.7, t + i * 16.7); },
    info: () => ({ miniature: mini.length, visibili: mini.filter(m => m.visibile).length, pila: pila.length, tempiMs: tempi.length ? +(tempi.reduce((a, b) => a + b, 0) / tempi.length).toFixed(2) : null }),
  };
}
