// Doppio Strato · la linea del tempo della sezione, in "schermi" di scroll (niente three: la usa anche la pagina senza 3D).
// intro: il nome e i burger raccolti · per ogni burger: entra (gli altri escono, la camera va all'altezza degli occhi), fermo,
// apri (gli strati salgono uno alla volta), tieni (aperto, con tutte le etichette), chiudi (la soglia: cade tutto, in tempo
// vero), chiuso (il formaggio cola; il nome e la riga), esce + gira (la giostra torna in vista e porta avanti il burger dopo).
// La sezione è alta 100svh + tot schermi (× FATTORE_COMPUTER sul computer).
export const PASSI = { intro: .2, entra: .32, fermo: .12, apri: .95, tieni: .28, chiuso: .52, esce: .3, gira: .5, coda: .7 };
export const FATTORE_COMPUTER = .85;
export function linea(N) {
  const Q = PASSI, seg = [];
  let t = Q.intro;
  for (let k = 0; k < N; k++) {
    const g = { k, entra: [t, t + Q.entra] };
    g.apri = [t + Q.entra + Q.fermo, t + Q.entra + Q.fermo + Q.apri];   // un attimo chiuso davanti, poi si apre
    g.chiudi = g.apri[1] + Q.tieni;
    if (k < N - 1) {
      g.esce = [g.chiudi + Q.chiuso, g.chiudi + Q.chiuso + Q.esce];
      g.gira = [g.esce[0] + .1, g.esce[0] + .1 + Q.gira];
      t = g.gira[1] - .12;
    } else { g.esce = null; g.gira = null; }
    seg.push(g);
  }
  return { seg, tot: seg[N - 1].chiudi + Q.coda, pano: [.03, .42] };
}
