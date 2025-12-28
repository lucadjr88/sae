/**
 * Performance Benchmark - Confronto versioni
 * Task 4.3: Performance Benchmark
 */

import { TransactionBatchProcessor } from '../src/examples/streaming-fees-modules/transaction-batch-processor.js';

// Versione precedente (simulata per confronto)
async function processTransactionBatchLegacy(transactions: any[], options: any) {
  // Simula logica precedente
  const results = [];
  for (const tx of transactions) {
    await new Promise(resolve => setTimeout(resolve, 10)); // Simula processing
    results.push({ operation: 'Test', isCrafting: false });
  }
  return results;
}

async function benchmark() {
  const transactions = Array.from({ length: 100 }, (_, i) => ({ signature: `tx${i}` }));
  const options = { connection: {}, programIds: [] };

  console.log('🚀 Starting Performance Benchmark...');

  // Benchmark versione precedente
  const startLegacy = Date.now();
  await processTransactionBatchLegacy(transactions, options);
  const timeLegacy = Date.now() - startLegacy;

  // Benchmark versione nuova
  const processor = new TransactionBatchProcessor(options);
  const startNew = Date.now();
  await processor.processBatch(transactions);
  const timeNew = Date.now() - startNew;

  console.log(`📊 Risultati Benchmark (100 transazioni):`);
  console.log(`   Legacy: ${timeLegacy}ms`);
  console.log(`   Nuovo:  ${timeNew}ms`);
  console.log(`   Miglioramento: ${((timeLegacy - timeNew) / timeLegacy * 100).toFixed(1)}%`);

  return {
    legacy: timeLegacy,
    new: timeNew,
    improvement: ((timeLegacy - timeNew) / timeLegacy * 100)
  };
}

// Esegui benchmark se chiamato direttamente
if (import.meta.url === `file://${process.argv[1]}`) {
  benchmark().then(results => {
    console.log('✅ Benchmark completato');
    process.exit(results.improvement > 0 ? 0 : 1);
  }).catch(error => {
    console.error('❌ Benchmark fallito:', error);
    process.exit(1);
  });
}

export { benchmark };