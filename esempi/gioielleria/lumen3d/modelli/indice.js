// Lumen 3D · elenco dei modelli, nell'ordine della giostra. Ogni modello vive in un file suo (modelli/<id>.js):
// i costruttori lavorano in parallelo senza toccare file comuni. Un file che ancora non esiste dà un errore chiaro.
export const MODELLI = [
  { id: 'meridiano-blu', nome: 'Meridiano Blu', file: './meridiano-blu.js' },
  { id: 'meridiano-verde', nome: 'Meridiano Verde', file: './meridiano-verde.js' },
  { id: 'abisso-bianco', nome: 'Abisso Bianco', file: './abisso-bianco.js' },
  { id: 'aurora', nome: 'Aurora', file: './aurora.js' },
  { id: 'rosa', nome: 'Rosa', file: './rosa.js' },
];

// carica il modulo di un modello per id (import dinamico, una volta sola) → { id, nome, costruisci, … }
const moduli = new Map();
export function carica(id) {
  const voce = MODELLI.find(m => m.id === id);
  if (!voce) return Promise.reject(new Error(`lumen3d: modello "${id}" non in elenco (${MODELLI.map(m => m.id).join(', ')})`));
  if (!moduli.has(id)) moduli.set(id, import(new URL(voce.file, import.meta.url).href).then(m => {
    const mod = m.default;
    if (!mod || typeof mod.costruisci !== 'function') throw new Error(`lumen3d: ${voce.file} deve esportare di default { id, nome, costruisci(ctx) }`);
    if (mod.id !== id) throw new Error(`lumen3d: ${voce.file} dichiara id "${mod.id}" invece di "${id}"`);
    return mod;
  }).catch(e => { moduli.delete(id); throw e.message?.startsWith('lumen3d') ? e : new Error(`lumen3d: non riesco a caricare modelli/${voce.file.slice(2)} (manca ancora o ha un errore): ${e.message}`); }));
  return moduli.get(id);
}
// i modelli che esistono già (per la giostra durante i lavori: salta quelli non ancora pronti)
export async function disponibili() {
  const r = await Promise.allSettled(MODELLI.map(m => carica(m.id)));
  return MODELLI.filter((_, i) => r[i].status === 'fulfilled');
}
