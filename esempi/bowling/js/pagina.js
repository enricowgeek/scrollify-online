// Velluto · la pagina: le informazioni che accompagnano il viaggio in 3D (entrano ed escono con lo scroll, coi veli che le
// rendono leggibili), la prenotazione della pista (sera, ora, quanti siete, a tempo o a partite, totale stimato, messaggio
// WhatsApp già scritto), feste ed eventi, non solo bowling, dove siamo e orari, domande. Tutto da window.DATI.
import { profiloBirillo } from './misure.js';

const D = window.DATI, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lis = x => x * x * (3 - 2 * x);
const euro = n => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')) + ' €';
const ridotto = matchMedia('(prefers-reduced-motion: reduce)').matches;
const telefono = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const stretto = matchMedia('(max-width: 820px)');

// ————— i contenuti (dai DATI)
const P = D.piste;
$('#righeTariffe').innerHTML = [
  [`Pista <small>fino a ${P.perPista} giocatori</small>`, `${euro(P.oraPista)} l’ora`],
  ['Una partita <small>a persona</small>', euro(P.partita)],
].map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('') + `<div class="solo"><dt>Scarpe ${esc(P.scarpe)} · ${esc(P.dettagli.charAt(0).toLowerCase() + P.dettagli.slice(1))}</dt></div>`;
$('#numeri').innerHTML = D.numeri.map(([n, c]) => `<span class="num">${esc(n)}</span> ${esc(c)}`).join(' · ');
$('#torneoBreve').textContent = D.torneoBreve;
$('#festeBreve').textContent = D.festeBreve;
const sezioneListino = s => `<h3 class="k">${esc(s.titolo)}</h3><dl class="righe">${s.voci.map(([n, d, p]) => `<div><dt>${esc(n)}${d ? ` <small>${esc(d)}</small>` : ''}</dt><dd>${euro(p)}</dd></div>`).join('')}</dl>`;
const testaBar = `<p class="serif" style="font-size:clamp(1.7rem,2.3vw,2.3rem)">${esc(D.frasi.bar)}</p>`;
$('#listinoIntero').innerHTML = testaBar + D.listino.map(sezioneListino).join('');
const pagine = [[0], [1], [2, 3]];
$$('.listino.pagina').forEach(el => { const i = +el.dataset.pagina; el.innerHTML = (i === 0 ? testaBar.replace('clamp(1.7rem,2.3vw,2.3rem)', 'clamp(1.7rem,7.4vw,2.2rem)') : '') + pagine[i].map(k => sezioneListino(D.listino[k])).join(''); });

// orari: dalle sere, raggruppate (lunedì – giovedì, venerdì e sabato, domenica)
const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const ora = h => `${String(h % 24).padStart(2, '0')}:00`;
function gruppiOrari() {
  const ordine = [1, 2, 3, 4, 5, 6, 0], out = [];
  for (const g of ordine) {
    const [a, b] = D.sere[g], ult = out[out.length - 1];
    if (ult && ult.a === a && ult.b === b) ult.giorni.push(g); else out.push({ a, b, giorni: [g] });
  }
  return out.map(({ a, b, giorni }) => [giorni.length === 1 ? GIORNI[giorni[0]] : giorni.length === 2 ? `${GIORNI[giorni[0]]} e ${GIORNI[giorni[1]].toLowerCase()}` : `${GIORNI[giorni[0]]} – ${GIORNI[giorni[giorni.length - 1]].toLowerCase()}`, `${ora(a)} – ${ora(b)}`]);
}
$('#orari').innerHTML = gruppiOrari().map(([g, o]) => `<dt>${g}</dt><dd>${o}</dd>`).join('');
$('#via').textContent = D.indirizzo.via; $('#citta').textContent = D.indirizzo.citta; $('#nota').textContent = D.indirizzo.nota;
$('#elenco').innerHTML = D.nonSolo.map(([n, d]) => `<div><dt>${esc(n)}</dt><dd>${esc(d)}</dd></div>`).join('');
$('#torneo').textContent = D.torneo;
$('#listaDomande').innerHTML = D.domande.map(([q, r]) => `<details><summary>${esc(q)}</summary><p>${esc(r)}</p></details>`).join('');
$('#piedeNome').textContent = `${D.nome} · ${D.sottotitolo} · ${D.indirizzo.via}, ${D.indirizzo.citta}`;
if (D.demo) $('#piedeNota').innerHTML = 'Locale immaginario, prezzi d’esempio: sito dimostrativo, la sala è tutta in 3D. <a href="https://scrollify.online/#esempi">Fatto con Scrollify</a>';
// il segno del marchio: la sagoma vera del birillo (lo stesso profilo del 3D)
{
  const pr = profiloBirillo(40, 12), k = 120 / .381, cx = 20;
  const d = pr.map(([r, h], i) => `${i ? 'L' : 'M'}${(cx + r * k).toFixed(2)} ${(120 - h * k).toFixed(2)}`).join('') + [...pr].reverse().map(([r, h]) => `L${(cx - r * k).toFixed(2)} ${(120 - h * k).toFixed(2)}`).join('') + 'Z';
  $('#segno path').setAttribute('d', d);
}

// ————— il viaggio: i momenti seguono lo scroll; i veli si scuriscono dove c'è del testo
const sezione = $('#sala'), palco = $('#palco'), tela = $('#tela'), apertura = $('#apertura');
// p va da 0 a 1 + CODA: oltre 1 la scena resta ferma al bar (la coda in fondo a #sala) e resta il listino
const CODA = 200 / 1180;
const avanzamento = () => { const r = sezione.getBoundingClientRect(), corsa = sezione.offsetHeight - palco.offsetHeight; return cl(-r.top / corsa) * (1 + CODA); };
const momenti = $$('.momento').map(el => { const [a, b] = el.dataset.p.split(' ').map(Number); return { el, a, b, velo: (el.dataset.velo || '').split(' ').filter(Boolean) }; });
let leggendo = 0;   // quanto è visibile la scritta del momento (0…1): lo scroll accompagnato rallenta quando c'è da leggere
function testi(p) {
  const d = .01, v = { alto: 0, basso: 0, sx: 0, dx: 0 }, tel = stretto.matches;
  leggendo = 0;
  for (const m of momenti) {
    if (!m.el.getClientRects().length) continue;   // nascosto su questo schermo
    const dentro = lis(cl((p - m.a) / d)), fuori = lis(cl((p - m.b + d) / d)), o = dentro * (1 - fuori);
    m.el.style.opacity = Math.max(.002, o).toFixed(3);
    m.el.style.transform = ridotto ? '' : `translate3d(0,${((1 - dentro) * 18 - fuori * 18).toFixed(1)}px,0)`;
    m.el.style.visibility = o < .003 ? 'hidden' : 'visible';
    leggendo = Math.max(leggendo, o);
    for (const z of m.velo) if (!(tel && (z === 'sx' || z === 'dx'))) v[z] = Math.max(v[z], o);
  }
  const a = lis(cl((p - .07) / .026));   // la frase d'apertura resta per le prime scrollate
  apertura.style.opacity = (1 - a).toFixed(3); apertura.style.visibility = a >= 1 ? 'hidden' : 'visible';
  leggendo = Math.max(leggendo, 1 - a);
  apertura.style.transform = ridotto ? '' : `translate3d(0,${(a * 14).toFixed(1)}px,0)`;
  if (tel) v.basso = Math.max(v.basso, 1 - a); else v.basso = Math.max(v.basso, (1 - a) * .7), v.sx = Math.max(v.sx, (1 - a) * .6);
  for (const k in v) palco.style.setProperty('--v' + k[0], v[k].toFixed(3));
}
let scena = null;
// lo scroll "accompagnato": scena e scritte seguono lo scroll con una velocità massima. Una scrollata forte non salta lo
// strike e le informazioni: il racconto scorre fino a dove sei arrivato, alla sua andatura. Fuori dalla sala (o se salti
// col link a "Prenota") recupera subito. Con il movimento ridotto segue lo scroll e basta.
// velocità massima in unità della scena al secondo: piano dove c'è una scritta da leggere, più svelto fra un momento e l'altro
const V_LEGGI = .05, V_VIAGGIO = .12;
let pMeta = 0, pMostra = 0, rafP = 0, tPrima = 0;
function mostra(p) { scena?.avanza(Math.min(p, 1)); testi(p); segnaVoce(); }
function segui(t) {
  const dt = tPrima ? Math.min(.05, (t - tPrima) / 1000) : 1 / 60; tPrima = t;
  const diff = pMeta - pMostra, r = sezione.getBoundingClientRect(), dentro = r.top <= 1 && r.bottom >= innerHeight - 1;
  const vmax = dentro ? V_VIAGGIO + (V_LEGGI - V_VIAGGIO) * leggendo : 4;
  const passo = Math.max(-vmax * dt, Math.min(vmax * dt, diff * (1 - Math.exp(-dt / .16))));
  pMostra = Math.abs(diff) < .0004 ? pMeta : pMostra + passo;
  mostra(pMostra);
  if (pMostra === pMeta) { rafP = 0; tPrima = 0; } else rafP = requestAnimationFrame(segui);
}
// ————— la navigazione in alto: dentro la sala salta al momento (buio breve, niente corsa della scena), fuori va alle sezioni
const navi = $('#navi'), voci = $$('#navi [data-voce]');
navi.querySelector('.navi-segno path').setAttribute('d', $('#segno path').getAttribute('d'));
navi.querySelector('.navi-nome').textContent = D.nome;
function vaiSala(p) {
  const corsa = sezione.offsetHeight - palco.offsetHeight, top = sezione.offsetTop + p / (1 + CODA) * corsa;
  const salta = () => { scrollTo({ top, behavior: 'instant' }); pMeta = pMostra = p; testi(p); scena?.salta(Math.min(p, 1)); segnaVoce(); };
  const r = sezione.getBoundingClientRect(), inVista = r.top < innerHeight && r.bottom > 0;
  if (ridotto || !inVista || Math.abs(p - pMostra) < .04) return salta();
  palco.classList.add('buio');
  setTimeout(() => { salta(); requestAnimationFrame(() => requestAnimationFrame(() => palco.classList.remove('buio'))); }, 270);
}
navi.addEventListener('click', e => { const a = e.target.closest('a[data-p]'); if (!a) return; e.preventDefault(); vaiSala(+a.dataset.p); });
// la voce accesa: nella sala le piste o il bar, poi la sezione che occupa il terzo alto dello schermo
const SEZ_VOCE = [['prenota', 'prenota'], ['feste', 'feste'], ['altro', 'feste'], ['dove', 'dove'], ['domande', 'dove']];
let voceAccesa = null;
function segnaVoce() {
  let v = null; const r = sezione.getBoundingClientRect();
  if (r.bottom > innerHeight * .4) v = r.top <= 1 ? (pMostra < .6 ? 'piste' : 'bar') : null;
  else for (const [id, voce] of SEZ_VOCE) { const e = document.getElementById(id); if (e && e.getBoundingClientRect().top < innerHeight * .4) v = voce; }
  if (v === voceAccesa) return; voceAccesa = v;
  for (const a of voci) a.dataset.voce === v ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current');
}
function aggiorna() {
  segnaVoce();
  pMeta = avanzamento();
  if (ridotto) { pMostra = pMeta; mostra(pMostra); return; }
  if (!rafP) rafP = requestAnimationFrame(segui);
}
addEventListener('scroll', aggiorna, { passive: true });
addEventListener('resize', aggiorna);
pMeta = pMostra = avanzamento(); testi(pMostra);

// ————— WhatsApp: nel sito vero apre la chat col messaggio già scritto; qui (demo) lo mostra
function whatsapp(testo, el) {
  const url = D.whatsapp ? `https://wa.me/${D.whatsapp}?text=${encodeURIComponent(testo)}` : null;
  window.__ultimoMessaggio = { testo, url };
  if (!url) { el.textContent = 'Sito dimostrativo: nel sito vero si apre WhatsApp con questo messaggio già scritto: '; const q = document.createElement('q'); q.textContent = testo; el.appendChild(q); return; }
  el.textContent = '';
  if (!window.__provaModulo) window.open(url, '_blank', 'noopener');
}

// ————— prenota una pista: sera, ora, giocatori, a tempo o a partite → totale e messaggio
const B = D.prenota, oggi = new Date(), sett = new Intl.DateTimeFormat('it-IT', { weekday: 'long' }), breve = new Intl.DateTimeFormat('it-IT', { weekday: 'short' }), mese = new Intl.DateTimeFormat('it-IT', { month: 'long' });
const sere = Array.from({ length: 7 }, (_, i) => { const d = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + i); return { d, i }; });
const stato = { sera: 0, ora: 21, giocatori: 4, modo: 'tempo', quanto: 0 };
const nomeSera = (s, lungo) => s.i === 0 ? (lungo ? 'stasera' : 'Oggi') : s.i === 1 ? (lungo ? 'domani' : 'Domani') : lungo ? `${sett.format(s.d)} ${s.d.getDate()} ${mese.format(s.d)}` : breve.format(s.d).replace('.', '');
$('#giorni').innerHTML = sere.map(s => `<label class="opz"><input type="radio" name="sera" value="${s.i}"><span><small>${esc(nomeSera(s, false))}</small><b>${s.d.getDate()}</b></span></label>`).join('');
const inizi = []; for (let h = B.inizio[0]; h <= B.inizio[1]; h++) inizi.push(h);
$('#ore').innerHTML = inizi.map(h => `<label class="opz"><input type="radio" name="ora" value="${h}"><span>${ora(h)}</span></label>`).join('');
const MODI = [['tempo', 'A tempo', `${euro(P.oraPista)} l’ora a pista`], ['partite', 'A partite', `${euro(P.partita)} a persona a partita`]];
$('#modi').innerHTML = MODI.map(([v, n, d]) => `<label class="opz"><input type="radio" name="modo" value="${v}"><span><b>${n}</b><small>${esc(d)}</small></span></label>`).join('');
const valori = () => stato.modo === 'tempo' ? B.ore : B.partite;
const oreTesto = h => h === 1 ? '1 ora' : h === 1.5 ? '1 ora e mezza' : Number.isInteger(h) ? `${h} ore` : `${Math.floor(h)} ore e mezza`;
const quantoTesto = () => { const v = valori()[stato.quanto]; return stato.modo === 'tempo' ? oreTesto(v) : v === 1 ? '1 partita' : `${v} partite`; };
function conto() {
  const g = stato.giocatori, piste = Math.ceil(g / P.perPista), v = valori()[stato.quanto];
  const totale = stato.modo === 'tempo' ? piste * v * P.oraPista : g * v * P.partita;
  const dett = stato.modo === 'tempo'
    ? `${piste} ${piste > 1 ? 'piste' : 'pista'} × ${String(v).replace('.', ',')} ${v === 1 ? 'ora' : 'ore'} × ${euro(P.oraPista)}`
    : `${g} ${g > 1 ? 'giocatori' : 'giocatore'} × ${v} ${v > 1 ? 'partite' : 'partita'} × ${euro(P.partita)}`;
  return { totale, dett, piste, v };
}
// l'ora si può scegliere se la sala è ancora aperta alla fine (a tempo) o almeno un'ora prima della chiusura; stasera, non nel passato
function oraPossibile(sera, h) {
  const [, chiude] = D.sere[sere[sera].d.getDay()], dur = stato.modo === 'tempo' ? valori()[stato.quanto] : 1;
  if (h + dur > chiude) return false;
  if (sera === 0 && h <= oggi.getHours()) return false;
  return true;
}
function disegna() {
  const g = stato.giocatori, { totale, dett, piste } = conto();
  // la sera: se stasera è tutto passato, si parte da domani
  $$('#giorni input').forEach(i => { i.checked = +i.value === stato.sera; i.disabled = +i.value === 0 && !inizi.some(h => oraPossibile(0, h)); });
  $$('#ore input').forEach(i => { i.disabled = !oraPossibile(stato.sera, +i.value); i.checked = +i.value === stato.ora; });
  $$('#modi input').forEach(i => { i.checked = i.value === stato.modo; });
  $('#outGiocatori').innerHTML = `${g}<small>${g > 1 ? 'giocatori' : 'giocatore'}</small>`;
  $('#notaGiocatori').textContent = piste > 1 ? `${piste} piste affiancate (fino a ${P.perPista} per pista)` : `Fino a ${P.perPista} per pista; oltre, due piste affiancate.`;
  $('#menoG').disabled = g <= B.giocatori[0]; $('#piuG').disabled = g >= B.giocatori[1];
  $('#legQuanto').textContent = stato.modo === 'tempo' ? 'Quanto tempo' : 'Quante partite a testa';
  $('#outQuanto').textContent = quantoTesto();
  $('#menoQ').disabled = stato.quanto <= 0; $('#piuQ').disabled = stato.quanto >= valori().length - 1;
  $('#notaOre').textContent = `· ${sere[stato.sera].i === 0 ? 'stasera' : nomeSera(sere[stato.sera], true)} si chiude alle ${ora(D.sere[sere[stato.sera].d.getDay()][1])}`;
  $('#totale').innerHTML = `${euro(totale).replace(' €', '')}<small> €</small>`;
  $('#dettaglio').textContent = dett;
  $('#riepilogo').textContent = `${cap(nomeSera(sere[stato.sera], true))}, alle ${ora(stato.ora)} · ${g} ${g > 1 ? 'persone' : 'persona'} · ${quantoTesto()}${stato.modo === 'partite' ? ' a testa' : ''}`;
  $('#notaConto').textContent = `Scarpe ${P.scarpe}. Il totale è una stima: si paga in sala.`;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
// se l'ora scelta non va più (sera cambiata, più tempo), si prende la prima possibile vicina
function sistemaOra() {
  if (oraPossibile(stato.sera, stato.ora)) return;
  const ok = inizi.filter(h => oraPossibile(stato.sera, h));
  if (ok.length) stato.ora = ok.reduce((a, b) => Math.abs(b - stato.ora) < Math.abs(a - stato.ora) ? b : a);
  else if (stato.modo === 'tempo' && stato.quanto > 0) { stato.quanto--; sistemaOra(); }
}
if (!inizi.some(h => oraPossibile(0, h))) stato.sera = 1;
sistemaOra();
$('#modulo').addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'sera') stato.sera = +t.value;
  if (t.name === 'ora') stato.ora = +t.value;
  if (t.name === 'modo') { stato.modo = t.value; stato.quanto = 0; }
  sistemaOra(); disegna(); $('#msgPrenota').textContent = '';
});
const passo = (id, fn) => $(id).addEventListener('click', () => { fn(); sistemaOra(); disegna(); $('#msgPrenota').textContent = ''; });
passo('#menoG', () => { stato.giocatori = Math.max(B.giocatori[0], stato.giocatori - 1); });
passo('#piuG', () => { stato.giocatori = Math.min(B.giocatori[1], stato.giocatori + 1); });
passo('#menoQ', () => { stato.quanto = Math.max(0, stato.quanto - 1); });
passo('#piuQ', () => { stato.quanto = Math.min(valori().length - 1, stato.quanto + 1); });
$('#modulo').addEventListener('submit', e => e.preventDefault());
$('#prenotaWa').addEventListener('click', () => {
  const g = stato.giocatori, { totale, piste } = conto(), s = sere[stato.sera];
  const quando = s.i === 0 ? 'stasera' : s.i === 1 ? 'domani' : nomeSera(s, true);
  const cosa = piste > 1 ? `${piste === 2 ? 'due' : piste} piste` : 'una pista';
  const durata = stato.modo === 'tempo' ? oreTesto(valori()[stato.quanto]) : `${quantoTesto()} a testa`;
  const testo = `Ciao! Vorrei prenotare ${cosa} ${quando} alle ${ora(stato.ora)} per ${g} ${g > 1 ? 'persone' : 'persona'}, ${durata}. Totale stimato ${euro(totale)}. Grazie!`;
  whatsapp(testo, $('#msgPrenota'));
});
disegna();
window.__prenota = { stato, disegna, conto, sere: sere.map(s => s.d.toDateString()) };

// ————— feste ed eventi: che cosa, quante persone → preventivo su WhatsApp
const E = D.eventi, ev = { id: E[0].id, ospiti: E[0].da };
$('#eventi').innerHTML = E.map(e => `<label class="evento"><input type="radio" name="evento" value="${e.id}"><span class="dentro"><h3>${esc(e.nome)}</h3><span class="per">${esc(e.per)}</span><p>${esc(e.riga)}</p><dl><dt>Da</dt><dd>${e.da} persone</dd><dt>Prezzo</dt><dd>da ${euro(e.prezzo)} a persona</dd></dl></span></label>`).join('');
function disegnaEventi() {
  $$('#eventi input').forEach(i => { i.checked = i.value === ev.id; });
  $('#outOspiti').innerHTML = `${ev.ospiti}<small>persone, più o meno</small>`;
  $('#menoO').disabled = ev.ospiti <= 5; $('#piuO').disabled = ev.ospiti >= 150;
}
$('#eventi').addEventListener('change', e => { ev.id = e.target.value; const x = E.find(v => v.id === ev.id); ev.ospiti = Math.max(ev.ospiti, x.da); disegnaEventi(); $('#msgFeste').textContent = ''; });
$('#menoO').addEventListener('click', () => { ev.ospiti = Math.max(5, ev.ospiti - (ev.ospiti > 30 ? 5 : 1)); disegnaEventi(); });
$('#piuO').addEventListener('click', () => { ev.ospiti = Math.min(150, ev.ospiti + (ev.ospiti >= 30 ? 5 : 1)); disegnaEventi(); });
$('#preventivo').addEventListener('click', () => {
  const x = E.find(v => v.id === ev.id);
  whatsapp(`Ciao! Vorrei un preventivo per ${x.chiedi} (${x.per}), circa ${ev.ospiti} persone. Grazie!`, $('#msgFeste'));
});
disegnaEventi();

// ————— il "Prenota" sempre a portata (telefono): solo fuori dal viaggio e lontano dalla prenotazione e dalla fascia finale
{
  const b = $('#sempre'), vis = new Map();
  const osserva = new IntersectionObserver(v => { for (const e of v) vis.set(e.target.id, e.isIntersecting); b.classList.toggle('su', !vis.get('sala') && !vis.get('prenota') && !vis.get('pacchetto') && !vis.get('feste-cta') && !vis.get('marchio-fine')); }, { threshold: 0 });
  $('.fine').id = 'marchio-fine';
  for (const id of ['sala', 'prenota', 'pacchetto', 'marchio-fine']) osserva.observe(document.getElementById(id));
  const cta = $('.preventivo'); cta.id = 'feste-cta'; osserva.observe(cta);
}

// ————— il 3D: si monta dopo il primo disegno
async function monta3D() {
  try {
    const prova = document.createElement('canvas');
    if (!(prova.getContext('webgl2'))) throw new Error('WebGL2 non disponibile');
    const { monta } = await import('./scena.js');
    scena = await monta(tela, { telefono, ridotto, dati: D });
    tela.classList.add('pronta');
    new IntersectionObserver(v => { for (const e of v) e.isIntersecting ? scena.riprendi() : scena.ferma(); }).observe(sezione);
    document.addEventListener('visibilitychange', () => document.hidden ? scena.ferma() : scena.riprendi());
  } catch (e) { console.info('3D non disponibile:', e.message); sezione.classList.add('senza-3d'); window.__errore = e.message; }
  aggiorna();
  window.__scena = scena;
  window.__sala = p => { const corsa = sezione.offsetHeight - palco.offsetHeight; scrollTo({ top: sezione.offsetTop + p / (1 + CODA) * corsa, behavior: 'instant' }); pMeta = pMostra = p; testi(p); scena?.salta(Math.min(p, 1)); };
  window.__pronto = true;
}
requestAnimationFrame(() => setTimeout(monta3D, 0));
