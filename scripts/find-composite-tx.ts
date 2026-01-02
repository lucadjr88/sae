import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
const cacheDir = path.join(__dirname, '../cache/wallet-txs/9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY');

function findComposite() {
  const files = fs.readdirSync(cacheDir);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const content = JSON.parse(fs.readFileSync(path.join(cacheDir, file), 'utf8'));
    const instructions = content.data?.transaction?.message?.instructions || [];
    const sageIxs = instructions.filter((ix: any) => ix.programId === SAGE_PROGRAM_ID);
    if (sageIxs.length > 1) {
      console.log(`Found composite transaction: ${file} with ${sageIxs.length} SAGE instructions`);
      return;
    }
  }
  console.log('No composite transaction found in cache');
}

findComposite();
