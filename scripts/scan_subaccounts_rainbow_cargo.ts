import fs from 'fs';
import path from 'path';

// Sub-account keys di Rainbow Cargo
const SUBACCOUNTS = [
  '2DHK7mpfq6YCKiXNeH7As8oi46CCBwmhVPp8M4RHzxwX', // cargoHold
  'BRZW9BoY7FDaRJ6qsJcrnDtvvdAyUvnBFddrf8HDHFEJ', // fuelTank
  'BLMrUSBdTBuzF4P7MtgqmLF9AimtvrSA92ywvsG5uyCA', // ammoBank
];

const WALLET_TXS_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../cache/wallet-txs/9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY');

function scanFile(filePath: string) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    const keys: string[] = [];
    // Estrarre accountKeys principali
    if (json?.data?.transaction?.message?.accountKeys) {
      for (const k of json.data.transaction.message.accountKeys) {
        if (typeof k === 'string') keys.push(k);
        else if (k?.pubkey) keys.push(k.pubkey);
      }
    }
    // Estrarre accountKeys da innerInstructions
    if (json?.data?.meta?.innerInstructions) {
      for (const inner of json.data.meta.innerInstructions) {
        if (inner.instructions) {
          for (const instr of inner.instructions) {
            if (instr.accounts && Array.isArray(instr.accounts)) {
              keys.push(...instr.accounts);
            }
          }
        }
      }
    }
    // Cerca sub-account
    const found = SUBACCOUNTS.filter(sub => keys.includes(sub));
    return { file: path.basename(filePath), found };
  } catch (e) {
    return { file: path.basename(filePath), error: true };
  }
}

function main() {
  const files = fs.readdirSync(WALLET_TXS_DIR).filter(f => f.endsWith('.json'));
  let total = 0, matches = 0;
  for (const file of files) {
    total++;
    const result = scanFile(path.join(WALLET_TXS_DIR, file));
    if (result.error) {
      console.log(`[ERROR] ${result.file}`);
    } else if (result.found.length > 0) {
      matches++;
      console.log(`[MATCH] ${result.file}: ${result.found.join(', ')}`);
    } else {
      console.log(`[NO MATCH] ${result.file}`);
    }
  }
  console.log(`\nTotale file: ${total}, Match sub-account: ${matches}`);
}

main();
