import { RentalService } from '../rentalService';
import { PublicKey } from '@solana/web3.js';
const rentalService = new RentalService(new PublicKey(process.env.SRSLY_PROGRAM_ID!), 30000);
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import path from 'path';

async function fetchAndDecodeWithRust(profileId: string) {
  // 1. Scarica contracts (decodificati JS, ma serve raw buffer)
  // Qui si assume che rentalService abbia un metodo per ottenere gli accounts raw (aggiungere se serve)
  // Per ora, usiamo solo la decodifica JS come esempio
  const contracts = await rentalService.fetchContractsOnChain(profileId);

  // 2. Per ogni contract, recupera il buffer raw (qui serve implementazione custom se non esiste)
  // Simuliamo: contractsRawBuffers: Buffer[]
  // TODO: Sostituire con fetch raw buffer degli accounts
  // const contractsRawBuffers = ...

  // 3. Salva ogni buffer su file temporaneo e invoca binario Rust
  // Esempio: /home/luca/sae/src/backend/rental/decoder/dist/srsly-decoder
  const rustBin = path.resolve(__dirname, '../decoder/dist/srsly-decoder');
  const decodedContracts: any[] = [];

  for (const contract of contracts) {
    // Qui dovresti avere il buffer raw, non solo l'oggetto JS
    // const rawBuffer = ...
    // await fs.writeFile('/tmp/contract.bin', rawBuffer);
    // const result = await runRustDecoder(rustBin, '/tmp/contract.bin');
    // decodedContracts.push(result);
    // Per ora, pushiamo solo il contract JS
    decodedContracts.push(contract);
  }

  // 4. Salva contracts decodificati (output Rust) su file
  await fs.writeFile('contracts_decoded_rust.json', JSON.stringify(decodedContracts, null, 2), 'utf8');
  console.log('Salvato contracts_decoded_rust.json');
}

// Funzione di utilità per chiamare il binario Rust
function runRustDecoder(binPath: string = '/home/luca/sae/dist/backend/decoder/carbon_decoder', filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, [filePath]);
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
  });
}

// Esegui test
fetchAndDecodeWithRust('default').catch(console.error);
