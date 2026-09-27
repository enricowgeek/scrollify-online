// Soldi · la banconota di fantasia, disegnata in codice (canvas 2D) → atlante con fronte e retro affiancati.
// Niente elementi di valute vere: nessun nome di stato o banca, nessun simbolo di valuta, nessuna firma, niente ologrammi.
// Fronte chiaro (carta verde pallido, inchiostro verde scuro) con il "Signor Salvadanaio" in un medaglione inciso;
// retro verde scuro con la montagna di soldi. "ESEMPIO" grande su tutte e due le facce.

export const FW = 1016, FH = 432, PAD = 16;           // una faccia: 1016 × 432 px (rapporto 2,35 : 1)
export const AW = FW * 2 + PAD, AH = FH;              // atlante: fronte | retro
export const RAPPORTO = FH / FW;                      // altezza / lunghezza della banconota (0,425)

// verde "dollaroni": fronte verde banconota pieno (non carta bianca), retro verde ricco; chiari solo cartigli e medaglione
const INK = '#10331d', INK2 = '#2c5d37', PALE = '#d6e6bf', CREMA = '#e9f2d4';
const TAU = Math.PI * 2;

function casuale(seme) { let a = seme >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// testo in Archivo (stretto, pesante), con spaziatura e contorno facoltativi
function testo(g, s, x, y, px, o = {}) {
  const { peso = 800, stretto = .74, colore = INK, allinea = 'center', spazio = 0, contorno = 0, coloreContorno = colore, base = 'alphabetic' } = o;
  g.save();
  g.font = `${peso} ${px}px Archivo, "Arial Narrow", Arial, sans-serif`;
  g.textAlign = allinea; g.textBaseline = base;
  if ('letterSpacing' in g) g.letterSpacing = spazio + 'px';
  g.translate(x, y); g.scale(stretto, 1);
  if (contorno) { g.lineJoin = 'round'; g.lineWidth = contorno / stretto; g.strokeStyle = coloreContorno; g.strokeText(s, 0, 0); }
  if (colore) { g.fillStyle = colore; g.fillText(s, 0, 0); }
  g.restore();
}

// curva chiusa in coordinate polari (per rosette e anelli a guilloche)
function polare(g, cx, cy, f, ex = 1, ey = 1, passi = 720) {
  g.beginPath();
  for (let i = 0; i <= passi; i++) { const t = i / passi * TAU, r = f(t); const x = cx + Math.cos(t) * r * ex, y = cy + Math.sin(t) * r * ey; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.closePath();
}
// rosetta a guilloche: due famiglie di curve ondulate sfasate (il reticolo a "moiré" delle banconote)
function rosetta(g, cx, cy, R, colore, lw = .9, { n = 16, k = 9, fondo = .55, ex = 1, ey = 1 } = {}) {
  g.save(); g.strokeStyle = colore; g.lineWidth = lw;
  for (let j = 0; j < n; j++) {
    const f = j / n * TAU / k;
    polare(g, cx, cy, t => R * (fondo + (1 - fondo) * (.5 + .5 * Math.sin(k * t + f))), ex, ey); g.stroke();
    polare(g, cx, cy, t => R * (fondo * .75 + (1 - fondo) * .6 * (.5 + .5 * Math.sin((k + 2) * t - f * 1.3))), ex, ey); g.stroke();
  }
  g.restore();
}
// anello a guilloche fra r0 e r1 (onde sfasate lungo il giro)
function anello(g, cx, cy, r0, r1, colore, lw = .8, { n = 12, k = 36, ex = 1, ey = 1 } = {}) {
  g.save(); g.strokeStyle = colore; g.lineWidth = lw;
  const m = (r0 + r1) / 2, a = (r1 - r0) / 2;
  for (let j = 0; j < n; j++) { const f = j / n * TAU / k * 2; polare(g, cx, cy, t => m + a * Math.sin(k * t + f), ex, ey, 1440); g.stroke(); }
  g.restore();
}
// fascia a guilloche dritta (reticolo di sinusoidi) dentro un rettangolo, lungo x oppure lungo y
function fascia(g, x, y, w, h, colore, lw = .8, { n = 7, lungo = 'x', onde = 26 } = {}) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = colore; g.lineWidth = lw;
  const L = lungo === 'x' ? w : h, S = lungo === 'x' ? h : w, k = onde * TAU / L;
  for (let j = 0; j < n; j++) {
    const f = j / n * TAU;
    for (const segno of [1, -1]) {
      g.beginPath();
      for (let i = 0; i <= L; i += 2) {
        const o = S / 2 + (S / 2 - 1) * Math.sin(k * i * segno + f);
        lungo === 'x' ? (i ? g.lineTo(x + i, y + o) : g.moveTo(x + i, y + o)) : (i ? g.lineTo(x + o, y + i) : g.moveTo(x + o, y + i));
      }
      g.stroke();
    }
  }
  g.restore();
}
function rettArrotondato(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// carta: fibre, macchioline, pieghe e bordi un po' consumati
function usura(g, W, H, rnd, scura) {
  g.save();
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * TAU, l = 3 + rnd() * 9;
    g.strokeStyle = scura ? `rgba(200,225,190,${.03 + rnd() * .05})` : `rgba(55,85,55,${.04 + rnd() * .07})`; g.lineWidth = .6 + rnd() * .6;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 1) * l * .5, y + Math.sin(a + 1) * l * .5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 90, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, scura ? 'rgba(10,30,15,.10)' : 'rgba(90,100,60,.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  // bordi consumati
  const v = g.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, W * .62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, scura ? 'rgba(5,20,8,.28)' : 'rgba(70,80,45,.16)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  // piega a metà (verticale) e una più leggera orizzontale
  for (const [x0, y0, x1, y1, f] of [[W / 2 + 3, 0, W / 2 - 4, H, 1], [0, H / 2 + 2, W, H / 2 - 3, .5]]) {
    g.lineWidth = 2; g.strokeStyle = `rgba(255,255,240,${.22 * f})`; g.beginPath(); g.moveTo(x0 - 1, y0); g.lineTo(x1 - 1, y1); g.stroke();
    g.lineWidth = 1.4; g.strokeStyle = `rgba(20,40,20,${.2 * f})`; g.beginPath(); g.moveTo(x0 + 1, y0); g.lineTo(x1 + 1, y1); g.stroke();
  }
  g.restore();
}

// il Signor Salvadanaio: un maialino-salvadanaio col monocolo, inciso a tratteggio (inventato)
function porcellino(g, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.lineJoin = 'round'; g.lineCap = 'round';
  const tratteggio = (clip, luceX, luceY, passo = 3.6, lw = 1.1, obliquo = .18) => {
    g.save(); clip(); g.clip();
    const gr = g.createLinearGradient(luceX * s, luceY * s, -luceX * s, -luceY * s);
    gr.addColorStop(0, 'rgba(23,63,37,0)'); gr.addColorStop(.45, 'rgba(23,63,37,.25)'); gr.addColorStop(1, 'rgba(23,63,37,.95)');
    g.strokeStyle = gr; g.lineWidth = lw;
    for (let y = -1.3 * s; y < 1.3 * s; y += passo) { g.beginPath(); g.moveTo(-1.3 * s, y); g.lineTo(1.3 * s, y + obliquo * 2.6 * s); g.stroke(); }
    g.restore();
  };
  // orecchie
  for (const sx of [-1, 1]) {
    const orecchio = () => { g.beginPath(); g.moveTo(sx * .38 * s, -.6 * s); g.quadraticCurveTo(sx * .78 * s, -1.08 * s, sx * 1.02 * s, -1.02 * s); g.quadraticCurveTo(sx * 1.06 * s, -.62 * s, sx * .8 * s, -.3 * s); g.closePath(); };
    orecchio(); g.fillStyle = PALE; g.fill();
    tratteggio(orecchio, -.5 * sx, -1.1, 3.2, 1);
    orecchio(); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
    g.beginPath(); g.moveTo(sx * .5 * s, -.62 * s); g.quadraticCurveTo(sx * .8 * s, -.92 * s, sx * .94 * s, -.9 * s); g.lineWidth = 1.3; g.stroke();
  }
  // testa
  const testa = () => { g.beginPath(); g.ellipse(0, 0, .9 * s, .8 * s, 0, 0, TAU); };
  testa(); g.fillStyle = PALE; g.fill();
  // curve di livello (l'incisione segue la forma), più fitte in ombra
  g.save(); testa(); g.clip();
  for (let i = 1; i < 14; i++) { const k = 1 - i * .066; g.beginPath(); g.ellipse(.07 * s * i / 14, .06 * s * i / 14, .9 * s * k, .8 * s * k, 0, 0, TAU); g.strokeStyle = `rgba(23,63,37,${.1 + .02 * i})`; g.lineWidth = .8; g.stroke(); }
  g.restore();
  tratteggio(testa, -.55, -.75, 3.4, 1.15);
  testa(); g.strokeStyle = INK; g.lineWidth = 2.8; g.stroke();
  // fessura per le monete
  rettArrotondato(g, -.24 * s, -.66 * s, .48 * s, .085 * s, .04 * s); g.fillStyle = INK; g.fill();
  g.beginPath(); g.moveTo(-.2 * s, -.585 * s); g.lineTo(.2 * s, -.585 * s); g.strokeStyle = 'rgba(233,236,217,.8)'; g.lineWidth = 1; g.stroke();
  // guance
  for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * .55 * s, .2 * s, .13 * s, Math.PI * .1, Math.PI * .9); g.strokeStyle = 'rgba(23,63,37,.5)'; g.lineWidth = 1.2; g.stroke(); }
  // occhi, sopracciglio alzato e monocolo
  for (const sx of [-1, 1]) {
    g.beginPath(); g.ellipse(sx * .33 * s, -.16 * s, .075 * s, .095 * s, 0, 0, TAU); g.fillStyle = INK; g.fill();
    g.beginPath(); g.arc(sx * .33 * s - .025 * s, -.19 * s, .022 * s, 0, TAU); g.fillStyle = PALE; g.fill();
    g.beginPath(); g.moveTo(sx * .2 * s, -.34 * s + (sx > 0 ? -.05 * s : 0)); g.quadraticCurveTo(sx * .33 * s, (sx > 0 ? -.47 : -.4) * s, sx * .46 * s, -.33 * s + (sx > 0 ? -.04 * s : 0));
    g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
  }
  g.beginPath(); g.arc(.33 * s, -.16 * s, .17 * s, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
  g.beginPath(); g.arc(.33 * s, -.16 * s, .145 * s, 0, TAU); g.strokeStyle = 'rgba(23,63,37,.35)'; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.moveTo(.47 * s, -.08 * s); g.bezierCurveTo(.62 * s, .2 * s, .8 * s, .3 * s, .74 * s, .62 * s); g.setLineDash([3, 3]); g.lineWidth = 1.6; g.stroke(); g.setLineDash([]);
  // grugno
  const grugno = () => { g.beginPath(); g.ellipse(0, .24 * s, .36 * s, .25 * s, 0, 0, TAU); };
  grugno(); g.fillStyle = '#c9ddb0'; g.fill();
  tratteggio(grugno, -.3, -.2, 2.8, .9, .05);
  grugno(); g.strokeStyle = INK; g.lineWidth = 2.6; g.stroke();
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * .12 * s, .24 * s, .052 * s, .088 * s, sx * .15, 0, TAU); g.fillStyle = INK; g.fill(); }
  // sorriso furbo
  g.beginPath(); g.moveTo(-.28 * s, .56 * s); g.quadraticCurveTo(.02 * s, .7 * s, .34 * s, .5 * s); g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke();
  g.beginPath(); g.moveTo(.3 * s, .47 * s); g.lineTo(.38 * s, .53 * s); g.lineWidth = 2; g.stroke();
  // papillon
  g.save(); g.translate(0, .9 * s);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-.34 * s, -.14 * s); g.lineTo(-.34 * s, .14 * s); g.closePath(); g.moveTo(0, 0); g.lineTo(.34 * s, -.14 * s); g.lineTo(.34 * s, .14 * s); g.closePath();
  g.fillStyle = INK; g.fill(); g.beginPath(); g.ellipse(0, 0, .07 * s, .08 * s, 0, 0, TAU); g.fill();
  g.restore();
  g.restore();
}

// la montagna di soldi (emblema del retro): mattoncini-banconota a triangolo, raggi dietro
function montagna(g, cx, base, larga, alta, colore, fondo) {
  g.save();
  const righe = 9, hR = alta / righe;
  for (let r = 0; r < righe; r++) {
    const quanti = r + 1, w = larga / righe * .98, y = base - alta + r * hR;
    for (let i = 0; i < quanti; i++) {
      const x = cx - quanti * w / 2 + i * w + (r % 2 ? 1.5 : -1.5);
      g.save(); g.translate(x + w / 2, y + hR / 2); g.rotate(((i * 7 + r * 3) % 5 - 2) * .025);
      g.fillStyle = colore; g.fillRect(-w / 2 + 1.2, -hR / 2 + 1.2, w - 2.4, hR - 2.4);
      g.strokeStyle = fondo; g.lineWidth = 1; g.strokeRect(-w / 2 + 4, -hR / 2 + 3.5, w - 8, hR - 7);
      g.beginPath(); g.arc(0, 0, hR * .22, 0, TAU); g.stroke();
      g.restore();
    }
  }
  g.restore();
}

function fronte(g, W, H) {
  const rnd = casuale(101);
  // carta
  let gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#bdd89b'); gr.addColorStop(1, '#a3c47f');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W * .62, H * .5, 0, W * .62, H * .5, W * .45); gr.addColorStop(0, 'rgba(214,236,186,.55)'); gr.addColorStop(1, 'rgba(214,236,186,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // microlinee ondulate di fondo
  g.save(); g.strokeStyle = 'rgba(24,74,40,.24)'; g.lineWidth = .8;
  for (let y = 26; y < H - 20; y += 6) { g.beginPath(); for (let x = 0; x <= W; x += 6) { const yy = y + 2.4 * Math.sin(x * .03 + y * .09); x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
  g.restore();
  // cornice: filo esterno, fascia a guilloche, filo interno
  g.strokeStyle = INK; g.lineWidth = 3; g.strokeRect(11, 11, W - 22, H - 22);
  const b0 = 17, b1 = 40;
  fascia(g, b0, b0, W - 2 * b0, b1 - b0, INK2, .8, { n: 6, onde: 70 });
  fascia(g, b0, H - b1, W - 2 * b0, b1 - b0, INK2, .8, { n: 6, onde: 70 });
  fascia(g, b0, b1, b1 - b0, H - 2 * b1, INK2, .8, { n: 6, onde: 26, lungo: 'y' });
  fascia(g, W - b1, b1, b1 - b0, H - 2 * b1, INK2, .8, { n: 6, onde: 26, lungo: 'y' });
  g.lineWidth = 1.2; g.strokeRect(b1 + 3, b1 + 3, W - 2 * b1 - 6, H - 2 * b1 - 6);
  // medaglione a sinistra con il Signor Salvadanaio
  const mx = 296, my = 212, ex = .84;
  g.save(); polare(g, mx, my, () => 150, ex, 1); g.fillStyle = '#c3dca5'; g.fill(); g.restore();
  anello(g, mx, my, 132, 150, INK2, .8, { n: 10, k: 44, ex });
  g.save(); polare(g, mx, my, () => 150, ex, 1); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); polare(g, mx, my, () => 131, ex, 1); g.lineWidth = 1.6; g.stroke(); g.restore();
  g.save(); polare(g, mx, my, () => 130, ex, 1); g.clip(); g.fillStyle = '#dcebc6'; g.fillRect(0, 0, W, H);
  for (let r = 8; r < 130; r += 4.5) { polare(g, mx, my + 20, () => r, ex, 1, 180); g.strokeStyle = 'rgba(61,107,69,.22)'; g.lineWidth = .8; g.stroke(); }
  porcellino(g, mx, my + 6, 92);
  g.restore();
  // cartiglio col nome sotto il medaglione
  rettArrotondato(g, mx - 118, 358, 236, 32, 6); g.fillStyle = '#dcebc6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.4; g.stroke();
  testo(g, 'IL SIGNOR SALVADANAIO', mx, 380, 18, { peso: 700, stretto: .8, spazio: 1 });
  // in alto al centro
  testo(g, 'BANCONOTA  DI  ESEMPIO', 612, 96, 36, { peso: 800, stretto: .78, spazio: 3 });
  g.fillStyle = INK; g.fillRect(452, 108, 320, 2.5);
  // ESEMPIO, grande
  testo(g, 'ESEMPIO', 598, 234, 106, { peso: 800, stretto: .64, colore: INK });
  testo(g, 'cento soldi, zero valore', 598, 276, 25, { peso: 500, stretto: .9, colore: INK2, spazio: 1 });
  // rosetta con il 100 a destra
  const rx = 868, ry = 222;
  g.save(); g.beginPath(); g.arc(rx, ry, 94, 0, TAU); g.fillStyle = '#c6dea8'; g.fill(); g.restore();
  rosetta(g, rx, ry, 94, 'rgba(61,107,69,.75)', .8, { n: 14, k: 11, fondo: .5 });
  g.beginPath(); g.arc(rx, ry, 95, 0, TAU); g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  g.beginPath(); g.arc(rx, ry, 58, 0, TAU); g.fillStyle = '#dcebc6'; g.fill(); g.lineWidth = 1.4; g.stroke();
  testo(g, '100', rx, ry + 27, 76, { peso: 800, stretto: .72 });
  // numeri di serie (inventati)
  testo(g, 'ES 000100 A', 520, 338, 22, { peso: 600, stretto: .95, colore: INK2, spazio: 2 });
  testo(g, 'ES 000100 A', 868, 340, 20, { peso: 600, stretto: .95, colore: INK2, spazio: 2 });
  // i quattro 100 negli angoli, su cartigli chiari
  for (const [x, y, al] of [[b0 + 6, b0 + 4, 'left'], [W - b0 - 6, b0 + 4, 'right'], [b0 + 6, H - b0 - 4, 'left'], [W - b0 - 6, H - b0 - 4, 'right']]) {
    const w = 118, h = 60, X = al === 'left' ? x : x - w, Y = y < H / 2 ? y : y - h;
    rettArrotondato(g, X, Y, w, h, 8); g.fillStyle = '#dcebc6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke();
    testo(g, '100', X + w / 2, Y + h - 9, 58, { peso: 800, stretto: .78 });
  }
  // micro-scritta lungo il bordo basso
  testo(g, 'NON VALE NIENTE · È SOLO UN ESEMPIO · NON VALE NIENTE', 666, H - b1 - 9, 11, { peso: 600, stretto: .9, colore: INK2, spazio: 1 });
  usura(g, W, H, rnd, false);
}

function retro(g, W, H) {
  const rnd = casuale(202);
  let gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#2f6e3c'); gr.addColorStop(1, '#255a31');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // reticolo a guilloche su tutto il fondo
  g.save(); g.strokeStyle = 'rgba(180,228,160,.2)'; g.lineWidth = .8;
  for (let j = 0; j < 22; j++) { g.beginPath(); for (let x = 0; x <= W; x += 4) { const y = H / 2 + (H / 2 - 6) * Math.sin(x * .014 + j * .29) * Math.cos(x * .0047 - j * .11); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
  g.restore();
  // cornice
  g.strokeStyle = CREMA; g.lineWidth = 2.5; g.strokeRect(11, 11, W - 22, H - 22);
  const b0 = 17, b1 = 38, luce = 'rgba(206,238,186,.62)';
  fascia(g, b0, b0, W - 2 * b0, b1 - b0, luce, .8, { n: 6, onde: 64 });
  fascia(g, b0, H - b1, W - 2 * b0, b1 - b0, luce, .8, { n: 6, onde: 64 });
  fascia(g, b0, b1, b1 - b0, H - 2 * b1, luce, .8, { n: 6, onde: 24, lungo: 'y' });
  fascia(g, W - b1, b1, b1 - b0, H - 2 * b1, luce, .8, { n: 6, onde: 24, lungo: 'y' });
  g.strokeStyle = CREMA; g.lineWidth = 1.2; g.strokeRect(b1 + 3, b1 + 3, W - 2 * b1 - 6, H - 2 * b1 - 6);
  // emblema al centro: ovale chiaro, raggi, la montagna di soldi
  const cx = W / 2, cy = 214, ex = 1.5;
  g.save(); polare(g, cx, cy, () => 122, ex, 1); g.fillStyle = '#cfe4b4'; g.fill(); g.clip();
  g.strokeStyle = 'rgba(39,79,48,.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 72; i++) { const a = i / 72 * TAU; g.beginPath(); g.moveTo(cx, cy + 40); g.lineTo(cx + Math.cos(a) * 400, cy + 40 + Math.sin(a) * 400); g.stroke(); }
  montagna(g, cx, cy + 92, 250, 170, '#255a31', '#cfe4b4');
  g.fillStyle = '#255a31'; g.fillRect(cx - 190, cy + 92, 380, 3);
  g.restore();
  anello(g, cx, cy, 122, 138, luce, .8, { n: 10, k: 50, ex });
  g.save(); polare(g, cx, cy, () => 138, ex, 1); g.strokeStyle = CREMA; g.lineWidth = 2; g.stroke(); polare(g, cx, cy, () => 121, ex, 1); g.lineWidth = 1.4; g.stroke(); g.restore();
  // ESEMPIO in alto, CENTO SOLDI in basso
  rettArrotondato(g, cx - 150, 44, 300, 50, 8); g.fillStyle = '#20502c'; g.fill();
  testo(g, 'ESEMPIO', cx, 88, 54, { peso: 800, stretto: .78, colore: CREMA, spazio: 6 });
  testo(g, 'CENTO SOLDI', cx, 386, 38, { peso: 800, stretto: .78, colore: CREMA, spazio: 5 });
  // due 100 grandi ai lati, pieni di righe
  for (const x of [168, W - 168]) {
    g.save();
    g.font = '800 170px Archivo, "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center';
    g.translate(x, 282); g.scale(.62, 1);
    g.lineJoin = 'round'; g.lineWidth = 3.2 / .62; g.strokeStyle = CREMA; g.strokeText('100', 0, 0);
    g.fillStyle = 'rgba(214,236,200,.24)'; g.fillText('100', 0, 0);
    g.restore();
  }
  // angoli
  for (const [x, y] of [[b1 + 62, b1 + 50], [W - b1 - 62, b1 + 50], [b1 + 62, H - b1 - 10], [W - b1 - 62, H - b1 - 10]]) testo(g, '100', x, y, 48, { peso: 800, stretto: .78, colore: CREMA });
  usura(g, W, H, rnd, true);
}

// l'atlante: fronte a sinistra, retro a destra (specchiato nel materiale), con un margine fra i due
export async function disegnaAtlante(scala = 1) {
  try { await document.fonts.load('800 100px Archivo'); await document.fonts.load('600 100px Archivo'); } catch (e) { /* va bene anche il ripiego */ }
  const c = document.createElement('canvas'); c.width = Math.round(AW * scala); c.height = Math.round(AH * scala);
  const g = c.getContext('2d');
  g.scale(scala, scala);
  g.fillStyle = '#6f8f68'; g.fillRect(0, 0, AW, AH);
  g.save(); g.beginPath(); g.rect(0, 0, FW, FH); g.clip(); fronte(g, FW, FH); g.restore();
  g.save(); g.translate(FW + PAD, 0); g.beginPath(); g.rect(0, 0, FW, FH); g.clip(); retro(g, FW, FH); g.restore();
  return c;
}

// ——— il gold ticket: UN solo biglietto d'oro nascosto nella montagna (stessa misura delle banconote) ———
const ORO_INK = '#4a3108', ORO_INK2 = 'rgba(110,74,14,.75)';
function stella(g, cx, cy, r, colore) {
  g.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .42 : r; k ? g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fillStyle = colore; g.fill();
}
export async function disegnaOro(scala = 1) {
  try { await document.fonts.load('800 100px Archivo'); } catch (e) { /* va bene anche il ripiego */ }
  const c = document.createElement('canvas'); c.width = Math.round(FW * scala); c.height = Math.round(FH * scala);
  const g = c.getContext('2d'), W = FW, H = FH; g.scale(scala, scala);
  // lamina d'oro: fasce chiare e scure in diagonale
  let gr = g.createLinearGradient(0, 0, W, H);
  [['#fbe7a0', 0], ['#e0b347', .22], ['#f8df8e', .42], ['#c99530', .68], ['#f5d880', .86], ['#d6a43c', 1]].forEach(([col, t]) => gr.addColorStop(t, col));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.save(); g.strokeStyle = 'rgba(120,80,15,.22)'; g.lineWidth = .8;
  for (let y = 26; y < H - 20; y += 6) { g.beginPath(); for (let x = 0; x <= W; x += 6) { const yy = y + 2.4 * Math.sin(x * .03 + y * .09); x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
  g.restore();
  // cornice
  g.strokeStyle = ORO_INK; g.lineWidth = 3; g.strokeRect(11, 11, W - 22, H - 22);
  const b0 = 17, b1 = 40;
  fascia(g, b0, b0, W - 2 * b0, b1 - b0, ORO_INK2, .8, { n: 6, onde: 70 });
  fascia(g, b0, H - b1, W - 2 * b0, b1 - b0, ORO_INK2, .8, { n: 6, onde: 70 });
  fascia(g, b0, b1, b1 - b0, H - 2 * b1, ORO_INK2, .8, { n: 6, onde: 26, lungo: 'y' });
  fascia(g, W - b1, b1, b1 - b0, H - 2 * b1, ORO_INK2, .8, { n: 6, onde: 26, lungo: 'y' });
  g.lineWidth = 1.2; g.strokeRect(b1 + 3, b1 + 3, W - 2 * b1 - 6, H - 2 * b1 - 6);
  // medaglione con la stella
  const mx = 230, my = 216;
  g.save(); g.beginPath(); g.arc(mx, my, 128, 0, TAU); g.fillStyle = 'rgba(255,240,190,.55)'; g.fill(); g.restore();
  anello(g, mx, my, 110, 128, ORO_INK2, .8, { n: 10, k: 40 });
  rosetta(g, mx, my, 106, 'rgba(110,74,14,.55)', .8, { n: 14, k: 11, fondo: .5 });
  g.beginPath(); g.arc(mx, my, 128, 0, TAU); g.strokeStyle = ORO_INK; g.lineWidth = 2; g.stroke();
  stella(g, mx, my, 62, ORO_INK);
  // la scritta
  testo(g, 'GOLD', 640, 190, 132, { peso: 800, stretto: .62, colore: ORO_INK });
  testo(g, 'TICKET', 640, 306, 132, { peso: 800, stretto: .62, colore: ORO_INK });
  testo(g, "l'unico biglietto d'oro  ·  1 di 1", 640, 352, 24, { peso: 600, stretto: .9, colore: ORO_INK2, spazio: 1 });
  return c;
}
