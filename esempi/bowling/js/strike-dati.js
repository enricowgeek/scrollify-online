// GENERATO da src/prepara/simula.mjs ({"x0":0.06,"ang":5.5,"v0":7.4,"giro":10}): lo strike simulato, in js/strike.bin
// 351 fotogrammi a 120 Hz, 11 corpi (0 = palla, poi i birilli 1…10), ognuno [x, y, z] (int16 × 0,2 mm, rispetto al birillo 1) e quaternione (int16).
export const STRIKE = { hz: 120, fotogrammi: 351, corpi: 11, scalaPos: .0002, baricentro: 0.147,
  palla: { x: [0.06674,0.10900,0.22853], v: [-0.70926,0.00000,-7.36593], w: [-67.5774,10.0000,6.5070] },
  toccati: [0.010,0.031,0.062,0.065,0.087,0.094,0.129,0.158,0.190,0.137] };
