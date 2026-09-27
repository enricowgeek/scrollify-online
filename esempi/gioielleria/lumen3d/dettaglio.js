// Lumen 3D · dettaglio: il Meridiano Verde da vicino, parte per parte (sezione a scroll con il pin).
// L'orologio (vetrina.js) fa il giro mentre scorri, con una sosta su ogni parte, e finisce di fronte; si trascina e resta dove lo lasci
// finché la pagina non scorre. Accanto (sotto sul telefono) la descrizione della parte che guarda chi guarda: cambia con lo scroll,
// con la mano e con i punti sull'orologio (agganciati ai "punti" del modello, visibili solo quando la loro parte è girata verso di noi).
// DA VICINO, nella sezione stessa (niente foto a tutto schermo, niente pagine nuove): un punto (o un tocco sul quadrante 3D di fronte,
// o il link "Guarda il quadrante da vicino") gira l'orologio verso la sua parte e ci avvicina la camera, con un ingrandimento adatto alla
// parte (il quadrante più forte, fondello e chiusura meno); la descrizione accanto resta su quella parte. Da vicino il trascinamento gira
// l'orologio restando vicino; si torna all'orologio intero con un secondo clic sullo stesso punto (o sul quadrante), con "allontana"
// sotto l'orologio, con Esc, o riprendendo a scorrere. Sul quadrante, a fine avvicinamento, la sua foto grande (3d/lumen/…-quadrante-hd)
// si dissolve dentro il disco del quadrante 3D (stesso posto, stessa scala: vetrina.nitido), così da vicino resta nitido.
// In fondo nome, prezzo e "Aggiungi al carrello".
// uso: const d = await monta(sezione, { aggiungi }); ad ogni scroll d.aggiorna(p) con p = avanzamento nella sezione 0…1
// opzioni: aggiungi() (il pulsante del carrello), modello (di serie 'meridiano-verde'), senza3d (forza la foto al posto del 3D),
// ripiego (foto al posto del 3D, di serie img/orologio-2.webp), margine (quanto prima montare il 3D, di serie '100% 0px'),
// vetrina (opzioni in più per vetrina.js), vicino ({ parte: { c, mm } } per cambiare le inquadrature da vicino, vedi VICINO),
// nitido ({ parte: [foto grande, foto base] }, di serie il quadrante del Verde; false = niente foto grande), testata (l'elemento della
// testata fissa, di serie il primo <header>; null = nessuna: i punti si mostrano fino al bordo alto della tela).
// Il markup è quello di index.html (section.dettaglio).
const TAU = Math.PI * 2;
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const liscio = x => x * x * (3 - 2 * x);
const giroCorto = a => ((a % TAU) + TAU * 1.5) % TAU - Math.PI;
// le parti della sezione: soste di questa posa lungo lo scroll (il resto sono i giri fra una sosta e l'altra)
const INIZIO = .06, FINE = .9, SOSTA = .42;
// le inquadrature da vicino del Meridiano Verde: c = il centro inquadrato (mm, coordinate di costruisci; senza, il punto della parte),
// mm = quanta scena attorno al centro riempie il lato corto della tela (meno mm = più vicino). Quadrante: il disco (Ø 31,3) con un filo
// di lunetta; corona: la corona col fianco; fondello e chiusura più larghi (tutta la raggiera con le viti, tutta la placca)
const VICINO = {
  quadrante: { c: [0, 0, -2.55], mm: 34 },
  lunetta: { c: [11.2, 11.2, -.42], mm: 30 },
  corona: { c: [21.6, 0, -7.35], mm: 23 },
  fondello: { c: [0, 0, -11.3], mm: 40 },
  chiusura: { c: [0, -3.2, -53.8], mm: 36 },
  bracciale: { c: [0, 16, -48], mm: 38 },
  cassa: { c: [-20.6, 0, -6.6], mm: 34 },
};
// la foto grande del quadrante del Verde (2048 px, da src/lumen3d/quadrante-hd.py) e quella base del modello (le ombre dipinte si
// ricavano dal loro rapporto)
const NITIDO = { quadrante: ['3d/lumen/meridiano-verde-quadrante-hd.webp', '3d/lumen/meridiano-verde-quadrante.webp'] };
// la foto grande serve quando il quadrante da vicino, sullo schermo (px veri: CSS × densità), è più grande dei px veri della foto dietro
// la texture base (il quadrante nella foto frontale è largo 484 px: la base da 1024 è quella foto ingrandita)
const BASE_PX = 484;

export async function monta(sezione, opzioni = {}) {
  const $ = s => sezione.querySelector(s), $$ = s => [...sezione.querySelectorAll(s)];
  const tela = $('.tela'), strato = $('.punti'), btnAllontana = $('.allontana');
  const voci = $$('.parti > li'), intro = $('.intro'), scheda = $('.scheda'), dito = $('.dito');
  const nomeModello = opzioni.modello ?? 'meridiano-verde';
  const inquadrature = { ...VICINO, ...(opzioni.vicino ?? {}) };
  const fotoGrandi = opzioni.nitido === false ? {} : { ...NITIDO, ...(opzioni.nitido ?? {}) };
  sezione.classList.add('vivo');

  // ——— le parti: testi dal markup; punto, normale e posa dal modello ("punti", letti quando si monta il 3D); inquadratura da VICINO ———
  const parti = voci.map((li, i) => ({ id: li.dataset.parte, i, li, nome: li.dataset.nome ?? li.dataset.parte,
    titolo: li.querySelector('h3')?.textContent ?? li.dataset.parte, p: null, n: null, a: i / voci.length * TAU, e: .12, bottone: null,
    link: li.querySelector('.da-vicino'), c: inquadrature[li.dataset.parte]?.c ?? null, mm: inquadrature[li.dataset.parte]?.mm ?? 36 }));
  const n = parti.length;
  let punti = {}, A = [], E = [];
  // angoli delle soste srotolati nell'ordine del giro (sempre crescenti), più il ritorno di fronte alla fine
  function soste(pt) {
    punti = pt ?? {};
    for (const q of parti) { const m = punti[q.id]; if (m) Object.assign(q, { p: m.p ?? null, n: m.n ?? null, a: m.a ?? q.a, e: m.e ?? .12 }); }
    A = []; E = [];
    parti.forEach((q, i) => { A.push(i ? A[i - 1] + ((q.a - A[i - 1]) % TAU + TAU) % TAU : q.a); E.push(q.e); });
    A.push(A[0] + Math.ceil((A.at(-1) - A[0] + .001) / TAU) * TAU); E.push(E[0]);
  }
  soste();
  // senza 3D (o finché non c'è) la parte la decide lo scroll: la sosta più vicina
  const parteDaScroll = x => Math.round(cl((x - INIZIO) / (FINE - INIZIO)) * n) % n;
  // scroll → posa: sosta (SOSTA della tratta divisa fra le due soste), poi giro morbido fino alla parte dopo
  function curva(p) {
    const u = cl((p - INIZIO) / (FINE - INIZIO)) * n, i = Math.min(n - 1, Math.floor(u)), f = u - i;
    const g = liscio(cl((f - SOSTA / 2) / (1 - SOSTA)));
    return [A[i] + (A[i + 1] - A[i]) * g, E[i] + (E[i + 1] - E[i]) * g];
  }

  // ——— stato ———
  let p = 0, v = null, scelta = null, pScelta = 0, attiva = -1, schedaOn = null, introOn = null, ditoOn = null;
  let vicinoId = null, richiesta = null;   // la parte guardata da vicino (null = orologio intero); quella chiesta alla vetrina
  const telefono = matchMedia('(max-width:640px)');

  // la parte più vicina all'angolo (con un filo di isteresi: nessun tremolio a metà strada)
  function piuVicina(a) {
    let best = 0, dBest = 1e9;
    parti.forEach((q, i) => { const d = Math.abs(giroCorto(a - q.a)); if (d < dBest) { dBest = d; best = i; } });
    if (attiva >= 0 && best !== attiva && Math.abs(giroCorto(a - parti[attiva].a)) - dBest < .06) return attiva;
    return best;
  }
  function mostra(i) {
    if (i === attiva) return;
    attiva = i;
    parti.forEach((q, k) => { q.li.classList.toggle('on', k === i); q.bottone?.classList.toggle('on', k === i); });
    aggiornaTesti();
  }
  // intro all'inizio, scheda alla fine; sul telefono la scheda prende il posto della descrizione quando l'orologio è di fronte
  // (da vicino resta la descrizione della parte); il suggerimento "trascina · tocca i punti" lascia il posto ad "allontana"
  function aggiornaTesti() {
    const inIntro = p < INIZIO * .7 && scelta === null;
    const finale = p > FINE - .005;
    const sch = finale && !vicinoId && (!telefono.matches || parti[attiva]?.id === parti[0].id);
    if (inIntro !== introOn) { introOn = inIntro; intro?.classList.toggle('on', inIntro); sezione.classList.toggle('in-intro', inIntro); }
    if (sch !== schedaOn) { schedaOn = sch; scheda?.classList.toggle('on', sch); sezione.classList.toggle('in-scheda', sch); }
    const d = !inIntro && p < .97 && !vicinoId;
    if (d !== ditoOn) { ditoOn = d; dito?.classList.toggle('on', d); }
  }

  // ——— i punti sull'orologio (creati quando il modello dice dove sono) ———
  function creaPunti() { for (const q of parti) {
    if (!q.p || !strato || q.bottone) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'punto'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true');
    b.setAttribute('aria-label', `${q.titolo}: guarda da vicino`);
    b.innerHTML = `<i></i><span class="nome">${q.nome}</span>`;
    b.addEventListener('click', () => scegli(q, true));
    strato.appendChild(b); q.bottone = b; q.vis = false; q.x = q.y = -1;
  } }
  // gira verso una parte; col punto (o il link, o il quadrante 3D) ci si avvicina; di nuovo sulla stessa parte: ci si allontana
  function scegli(q, avvicina) {
    if (avvicina && vicinoId === q.id) { allontana(); return; }
    scelta = q.i; pScelta = p;
    v?.guarda(q.a, q.e);
    mostra(q.i); aggiornaTesti();
    if (!avvicina) return;
    if (v) {
      richiesta = q.id;
      v.avvicina(q.c ?? q.p, { mm: q.mm });
      if (fotoGrandi[q.id]) preparaNitido(q.id);
    } else if (sezione.classList.contains('senza3d') && q.id === parti[0].id) imposta(q.id);   // senza 3D: la foto si ingrandisce sul quadrante
  }
  function allontana() {
    if (v) v.allontana(); else imposta(null);
  }
  // lo stato "da vicino" (dall'evento della vetrina, o senza 3D direttamente): classe della sezione, punto acceso, link e "allontana"
  function imposta(id) {
    if (id === vicinoId) return;
    vicinoId = id;
    sezione.classList.toggle('vicino', !!id);
    for (const q of parti) {
      const dentro = q.id === id;
      q.bottone?.classList.toggle('dentro', dentro);
      q.bottone?.setAttribute('aria-label', dentro ? `${q.titolo}: allontana` : `${q.titolo}: guarda da vicino`);
      if (q.link) { q.link.textContent = dentro ? q.link.dataset.via : q.link.dataset.vai; q.link.setAttribute('aria-pressed', dentro ? 'true' : 'false'); }
    }
    if (btnAllontana) { btnAllontana.tabIndex = id ? 0 : -1; btnAllontana.setAttribute('aria-hidden', id ? 'false' : 'true'); }
    if (!id && document.activeElement === btnAllontana) (parti.find(q => q.vis)?.bottone ?? tela)?.focus?.({ preventScroll: true });
    aggiornaTesti();
  }
  // la foto grande (solo le parti che ce l'hanno, solo la prima volta che ci si avvicina, solo se sullo schermo serve davvero)
  const nitidi = new Map();   // id → null mentre arriva, poi { ctl, x } (x = quanto si vede)
  function preparaNitido(id) {
    if (nitidi.has(id) || !v?.nitido) return;
    const q = parti.find(x => x.id === id), lato = Math.min(TW, TH) * v.renderer.getPixelRatio();
    // diametro del disco da vicino in px veri ≈ lato corto × riempi × (disco / mm): se non supera i px veri della foto base, basta quella
    if (lato * .88 * (31.3 / q.mm) < BASE_PX) return;
    nitidi.set(id, null);
    v.nitido(id, ...fotoGrandi[id]).then(ctl => nitidi.set(id, { ctl, x: 0 })).catch(e => { nitidi.delete(id); console.info('Lumen dettaglio: foto grande non disponibile, resta la texture.', e.message); });
  }
  // i link "Guarda … da vicino" nella descrizione: stesso comportamento del punto (il testo diventa "Allontana" da vicino)
  for (const q of parti) if (q.link) {
    q.link.dataset.vai = q.link.textContent; q.link.dataset.via ??= 'Allontana';
    q.link.setAttribute('aria-pressed', 'false');
    q.link.addEventListener('click', () => scegli(q, true));
  }
  btnAllontana?.addEventListener('click', allontana);
  if (btnAllontana) { btnAllontana.tabIndex = -1; btnAllontana.setAttribute('aria-hidden', 'true'); }
  // Esc: ci si allontana (solo se la sezione è sullo schermo e si è vicini)
  addEventListener('keydown', e => { if (e.key === 'Escape' && vicinoId && !e.defaultPrevented) { const b = sezione.getBoundingClientRect(); if (b.bottom > 0 && b.top < innerHeight) { e.preventDefault(); allontana(); } } });

  // a ogni fotogramma: posizione dei punti visibili, descrizione dall'angolo (se nessuno ha scelto a mano), dissolvenza della foto grande
  // (misure della tela tenute da parte: niente letture di layout dentro il fotogramma)
  // ALTO: la striscia in cima alla tela che sta sotto la testata fissa della pagina (il primo <header>): lì i punti non si mostrano,
  // altrimenti da vicino un "+" può finire sotto al logo (e il tocco andrebbe al logo). Sul telefono la tela parte già sotto la testata.
  let TW = 1, TH = 1, ALTO = 0, sfuma = 0;
  const testata = opzioni.testata === undefined ? document.querySelector('header') : opzioni.testata;
  const misuraAlto = () => { const pin = tela.closest('.pin') ?? sezione, sopra = tela.getBoundingClientRect().top - pin.getBoundingClientRect().top;
    ALTO = testata ? Math.max(0, testata.offsetHeight - sopra + 8) : 0; };
  if (tela) new ResizeObserver(() => { TW = tela.clientWidth; TH = tela.clientHeight; misuraAlto(); }).observe(tela);
  function fotogramma(s) {
    for (const q of parti) {
      if (!q.bottone) continue;
      const r = v.proietta(q.p, q.n), vis = r.davanti && r.x > 0 && r.y > ALTO && r.x < TW && r.y < TH;
      if (vis !== q.vis) { q.vis = vis; q.bottone.classList.toggle('vis', vis); q.bottone.tabIndex = vis ? 0 : -1; q.bottone.setAttribute('aria-hidden', vis ? 'false' : 'true'); }
      if (vis && (Math.abs(r.x - q.x) > .25 || Math.abs(r.y - q.y) > .25)) { q.x = r.x; q.y = r.y; q.bottone.style.transform = `translate3d(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px,0)`; }
    }
    if (scelta === null) mostra(piuVicina(s.a));
    // da vicino l'orologio esce dalla tela: il bordo verso il testo sfuma (CSS: .tela.sfuma, --sfuma 0…1 con l'ingrandimento), così non
    // c'è un taglio netto; da lontano niente maschera
    const sf = Math.round(cl((s.k - 1) / .5) * 50) / 50;
    if (sf !== sfuma) { sfuma = sf; tela.style.setProperty('--sfuma', sf); tela.classList.toggle('sfuma', sf > 0); }
    // la foto grande: entra nell'ultimo tratto dell'avvicinamento (da ~75% in su dell'ingrandimento, in scala logaritmica), esce subito
    // quando ci si allontana; ogni passo è morbido (~0,3 s)
    for (const [id, N] of nitidi) {
      if (!N) continue;
      const avanzato = vicinoId === id && s.kMira > 1.01 ? cl(Math.log(s.k) / Math.log(s.kMira)) : 0;
      const voluto = liscio(cl((avanzato - .75) / .23));
      let x = N.x + (voluto - N.x) * .16;
      if (Math.abs(voluto - x) < .01) x = voluto;   // l'ultimo tratto a scatto (invisibile): arriva davvero a 0 o a 1
      if (x !== N.x) { N.x = x; N.ctl.velo(x); }
    }
  }
  // la mano sull'orologio: finisce la scelta fatta coi punti (da vicino si resta vicini); un tocco (senza trascinare) sul quadrante
  // di fronte ci avvicina (o, se ci si è già, ci allontana)
  let giu = null;
  tela?.addEventListener('pointerdown', e => { giu = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  tela?.addEventListener('pointermove', e => {
    if (giu && Math.hypot(e.clientX - giu.x, e.clientY - giu.y) > 8 && scelta !== null && !vicinoId) { scelta = null; }
    if (e.pointerType === 'mouse' && v) tela.classList.toggle('sul-quadrante', !giu && sulQuadrante(e));
  });
  tela?.addEventListener('pointerup', e => {
    if (!giu) return;
    const tap = Math.hypot(e.clientX - giu.x, e.clientY - giu.y) < 8 && performance.now() - giu.t < 450; giu = null;
    if (tap && v && sulQuadrante(e)) { const q = parti.find(x => x.id === 'quadrante'); if (q) scegli(q, true); }
  });
  tela?.addEventListener('pointercancel', () => { giu = null; });
  tela?.addEventListener('pointerleave', () => tela.classList.remove('sul-quadrante'));
  // il quadrante è di fronte (coseno > 0,55) e il punto è dentro il suo cerchio proiettato
  const raggioQ = 14.5;
  function sulQuadrante(e) {
    const Q = punti.quadrante;
    if (!Q || !v) return false;
    const c = v.proietta([0, 0, Q.p[2]], [0, 0, 1]);
    if (!(c.dot > .55)) return false;
    const r = v.proietta([raggioQ, 0, Q.p[2]]), r2 = v.proietta([0, raggioQ, Q.p[2]]);
    const R = Math.max(Math.hypot(r.x - c.x, r.y - c.y), Math.hypot(r2.x - c.x, r2.y - c.y));
    const b = tela.getBoundingClientRect();
    return Math.hypot(e.clientX - b.left - c.x, e.clientY - b.top - c.y) < R;
  }
  $('.scheda .btn')?.addEventListener('click', () => opzioni.aggiungi?.());

  // ——— il 3D: si monta quando la sezione si avvicina; senza WebGL2 (o se non si carica) resta la foto ———
  const webgl2 = opzioni.senza3d ? false : (() => { try { const gl = document.createElement('canvas').getContext('webgl2'); gl?.getExtension('WEBGL_lose_context')?.loseContext(); return !!gl; } catch (e) { return false; } })();
  function ripiego(motivo) {
    if (motivo) console.warn('Lumen dettaglio: orologio 3D non disponibile, resta la foto.', motivo);
    sezione.classList.add('senza3d');
    if (tela && !tela.querySelector('.ripiego')) {
      const im = document.createElement('img'); im.className = 'ripiego'; im.alt = ''; im.decoding = 'async'; im.loading = 'lazy';
      im.onload = () => im.classList.add('on'); im.src = opzioni.ripiego ?? 'img/orologio-2.webp'; tela.appendChild(im);
    }
  }
  const pronto = new Promise(risolvi => {
    if (!webgl2) { ripiego(opzioni.senza3d ? null : 'WebGL2 non disponibile'); return risolvi(null); }
    new IntersectionObserver((es, io) => {
      if (!es.some(e => e.isIntersecting)) return;
      io.disconnect();
      // prima il modello (i suoi punti fanno le soste della curva), poi la vetrina con quel modulo
      Promise.all([import('./vetrina.js'), import('./modelli/indice.js').then(m => m.carica(nomeModello))]).then(([V, mod]) => {
        soste(mod.punti); creaPunti();
        return V.monta(tela, { modello: mod, curva, resta: true, ...(opzioni.vetrina ?? {}) });
      }).then(o => {
        v = o; v.vai(p); v.su('angolo', fotogramma);
        // da vicino / di nuovo intero: lo dice la vetrina (anche quando si allontana da sola perché la pagina scorre)
        v.su('vicino', s => imposta(s ? richiesta : null));
        sezione.classList.add('con3d'); risolvi(v);
      }).catch(e => { ripiego(e.message); risolvi(null); });
    }, { rootMargin: opzioni.margine ?? '100% 0px' }).observe(sezione);
  });

  function aggiorna(x) {
    p = cl(x);
    if (scelta !== null && Math.abs(p - pScelta) > .003) { scelta = null; if (!v && vicinoId) imposta(null); }   // la pagina scorre: la scelta fatta a mano finisce
    if (v) v.vai(p);
    else mostra(parteDaScroll(p));
    aggiornaTesti();
  }
  telefono.addEventListener?.('change', () => { schedaOn = null; aggiornaTesti(); });
  aggiorna(0);

  return {
    aggiorna,
    pronto,                                     // Promise → la vetrina (o null se resta la foto)
    get vetrina() { return v; },
    parti: parti.map(q => q.id),
    scegli: id => { const q = parti.find(x => x.id === id); if (q) scegli(q, false); },
    // da vicino a mano (come il punto della parte) e di nuovo intero
    avvicina: id => { const q = parti.find(x => x.id === id); if (q && vicinoId !== id) scegli(q, true); },
    allontana,
    // per le verifiche
    stato: () => {
      const a = v?.angolo();
      return {
        p: +p.toFixed(4), parte: parti[attiva]?.id ?? null, scelta: scelta === null ? null : parti[scelta].id,
        angolo: v ? +a.a.toFixed(3) : null, punti: parti.filter(q => q.vis).map(q => ({ id: q.id, x: Math.round(q.x), y: Math.round(q.y) })),
        intro: !!introOn, scheda: !!schedaOn, senza3d: sezione.classList.contains('senza3d'),
        vicino: vicinoId, k: v ? +a.k.toFixed(3) : null, kMira: v ? +a.kMira.toFixed(3) : null,
        nitido: Object.fromEntries([...nitidi].map(([id, N]) => [id, N ? +N.x.toFixed(3) : 'in arrivo'])),
      };
    },
  };
}
