// Velluto · le misure vere (metri): pista, birilli, palla. Niente Three qui: lo usa anche la simulazione (src/prepara/simula.mjs).
export const PISTA = {
  largo: 1.0541,          // 41,5 pollici, 39 tavole
  tavole: 39,
  canale: .235,           // canale laterale (9,25 pollici), profondo 4,8 cm
  canaleFondo: .048,
  passo: 1.7,             // da una pista all'altra (pista + due canali + separatore)
  testa: -18.288,         // z del birillo 1 (60 piedi dalla linea di lancio, che sta a z = 0)
  fila: .3048 * Math.sqrt(3) / 2,   // distanza fra le file del triangolo (26,4 cm)
  interasse: .3048,       // passo del triangolo (30,5 cm)
  fossa: .872,            // il bordo della fossa, dietro il birillo 1
  fossaFondo: .3,
  spondaX: .765,          // le sponde (kickback) ai lati del piano dei birilli
  cuscino: 1.57,          // la tenda in fondo alla fossa, dietro il birillo 1
};
export const PALLA = { r: .109, massa: 6.35 };
export const BIRILLO = { alto: .381, massa: 1.55, baricentro: .147 };

// il profilo del birillo (USBC): [altezza, raggio] in cm, dalla base fino al massimo della testa; sopra, un'ellisse
const PROFILO_CM = [[0, 2.45], [.18, 2.58], [1.905, 3.59], [3.8, 4.36], [5.715, 4.96], [8.573, 5.73], [11.43, 6.05], [14.92, 5.80], [18.42, 4.70],
  [21.91, 3.14], [23.81, 2.50], [25.4, 2.28], [27.62, 2.38], [29.85, 2.83], [31.75, 3.10], [34.3, 3.235]];

// interpolazione monotona (Fritsch–Carlson)
export function curva(pt) {
  const n = pt.length, x = pt.map(a => a[0]), y = pt.map(a => a[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / Math.max(1e-9, x[i + 1] - x[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return p => {
    if (p <= x[0]) return y[0];
    if (p >= x[n - 1]) return y[n - 1];
    let i = 0; while (p > x[i + 1]) i++;
    const h = x[i + 1] - x[i], t = (p - x[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// il profilo in metri: [raggio, altezza] dalla base (asse y) alla punta; n punti sul corpo, k sulla testa
export function profiloBirillo(n = 44, k = 12) {
  const r = curva(PROFILO_CM), pt = [[0, 0]];
  const h0 = .18, h1 = 34.3;
  pt.push([2.45 / 100, 0]);
  for (let i = 0; i <= n; i++) {
    // più fitto dove la curva gira (collo e testa)
    const u = i / n, h = h0 + (h1 - h0) * (u - Math.sin(u * Math.PI * 2) * .06);
    pt.push([r(h) / 100, h / 100]);
  }
  // la testa: ellisse da 34,3 cm (raggio 3,235) alla punta 38,1
  for (let i = 1; i <= k; i++) {
    const a = (i / k) * Math.PI / 2;
    pt.push([Math.max(0, Math.cos(a) * 3.235) / 100, (34.3 + Math.sin(a) * 3.8) / 100]);
  }
  pt[pt.length - 1][0] = 0;
  return pt;
}
// il raggio del birillo all'altezza h (m)
export function raggioBirillo(h) {
  const r = curva(PROFILO_CM), c = h * 100;
  if (c < 0 || c > 38.1) return 0;
  if (c > 34.3) { const s = (c - 34.3) / 3.8; return 3.235 * Math.sqrt(Math.max(0, 1 - s * s)) / 100; }
  return r(c) / 100;
}

// il triangolo: [x, z] rispetto al birillo 1 (1 davanti; 2 a sinistra e 3 a destra guardando dalla linea di lancio)
export function triangolo() {
  const { interasse: a, fila: f } = PISTA, out = [];
  const righe = [[1], [2, 3], [4, 5, 6], [7, 8, 9, 10]];
  righe.forEach((r, i) => r.forEach((n, j) => out[n - 1] = [(j - (r.length - 1) / 2) * a, -i * f]));
  return out;
}
