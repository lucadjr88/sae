const { PublicKey, Connection } = require('@solana/web3.js');
const fs = require('fs/promises');
const { spawn } = require('child_process');
const path = require('path');
const bs58 = require('bs58');
const { CONTRACT_DISCRIMINATOR } = require('../decode');

// Configurazione
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const PROGRAM_ID = process.env.SRSLY_PROGRAM_ID || 'SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT';
const OUT_FILE = 'contracts_decoded_rust.json';

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID);

  // 1. Scarica tutti gli account contracts (raw buffer)
  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(CONTRACT_DISCRIMINATOR) } }],
    commitment: 'confirmed',
  });

  // 2. Prepara array di buffer raw
  const buffers = accounts.map(acc => Array.from(acc.account.data));

  // 3. Invoca il binario Rust passando i buffer come JSON su stdin
  const rustBin = path.resolve(__dirname, '../decoder/dist/srsly-decoder');
  const decoded = await runRustDecoder(rustBin, buffers);

  // 4. Salva il risultato
  await fs.writeFile(OUT_FILE, JSON.stringify(decoded, null, 2), 'utf8');
  console.log('Salvato', OUT_FILE);
}

function runRustDecoder(binPath, buffers) {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (data) => (out += data));
    proc.stderr.on('data', (data) => (err += data));
    proc.on('close', (code) => {
      if (code === 0) {
        try {
          resolve(JSON.parse(out));
        } catch (e) {
          reject(new Error('Rust decoder output non-JSON: ' + out));
        }
      } else {
        reject(new Error('Rust decoder error: ' + err));
      }
    });
    proc.stdin.write(JSON.stringify(buffers));
    proc.stdin.end();
  });
}

main().catch(console.error);
