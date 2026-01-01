// Estrazione fleet secondo logica ufficiale per Mining/Scan/SDU
// Restituisce la chiave fleet se l'istruzione è riconosciuta, altrimenti undefined

export function extractFleetFromInstruction(rawTx: any): string | undefined {
  if (!rawTx?.transaction?.message?.instructions) return undefined;
  const instructions = rawTx.transaction.message.instructions;

  // Mining: la chiave fleet è il 4° account (indice 3) secondo la patch Rust
  // Scan/SDU: stessa logica, se necessario estendere con altri pattern
  for (const ix of instructions) {
    if (!ix.programId) continue;
    // Mining
    if (ix.programId === 'Point2iBvz7j5TMVef8nEgpmz4pDr7tU7v3RjAfkQbM') {
      if (ix.accounts && ix.accounts.length > 3) {
        return rawTx.transaction.message.accountKeys[ix.accounts[3]];
      }
    }
    // Scan/SDU: aggiungere qui altri controlli se servono
    // Esempio: if (ix.programId === '...') { ... }
  }
  return undefined;
}
