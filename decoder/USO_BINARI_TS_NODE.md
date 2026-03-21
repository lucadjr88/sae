# Documentazione: Utilizzo dei Binari Rust in Ambiente TypeScript/Node.js

## Introduzione
Questa guida spiega come utilizzare i binari di decodifica Rust (`decode_fleets` e `srsly-decoder`) all'interno di un progetto Node.js/TypeScript, permettendo di integrare la logica di decodifica Rust in applicazioni JavaScript moderne.

## Prerequisiti
- Node.js installato (consigliata versione >= 18)
- TypeScript installato (opzionale, per progetti TS)
- I binari Rust (`decode_fleets`, `srsly-decoder`) devono essere compilati e accessibili (es. in `target/debug/` o installati globalmente)

## Passaggi

### 1. Compilare i Binari Rust
Assicurati che i binari siano compilati:

```sh
cargo build --workspace
```

Troverai i binari in `target/debug/`.

### 2. Invocare i Binari da Node.js
Puoi eseguire i binari Rust da Node.js usando il modulo `child_process`.

#### Esempio in TypeScript
```ts
import { spawn } from 'child_process';

function decodeWithRust(binaryPath: string, inputData: Buffer | string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
    proc.stdin.write(inputData);
    proc.stdin.end();
  });
}

// Esempio d'uso:
const binary = './target/debug/decode_fleets'; // o './target/debug/srsly-decoder'
const input = Buffer.from('...dati binari...');
decodeWithRust(binary, input)
  .then((result) => {
    console.log('Output Rust:', result);
  })
  .catch(console.error);
```

### 3. Gestione Input/Output
- **Input**: Passa i dati da decodificare tramite `stdin` del processo Rust.
- **Output**: Leggi il risultato da `stdout` del processo Rust.
- **Errori**: Gli errori vengono stampati su `stderr` e possono essere gestiti tramite eventi Node.js.

### 4. Integrazione in Progetti TypeScript
- Installa i tipi per Node.js:
  ```sh
  npm install --save-dev @types/node
  ```
- Assicurati che il percorso del binario sia corretto rispetto alla root del progetto Node.js.

### 5. Esempio Completo
Supponiamo di voler decodificare un fleet:

```ts
import { readFileSync } from 'fs';

const binary = './target/debug/decode_fleets';
const inputData = readFileSync('fleet_data.bin');

decodeWithRust(binary, inputData)
  .then(console.log)
  .catch(console.error);
```

## Best Practice
- Gestisci i percorsi dei binari in modo dinamico (es. variabili d'ambiente).
- Valida sempre l'output e gestisci i possibili errori di esecuzione.
- Per grandi volumi di dati, considera l'uso di stream.

## Riferimenti
- [Node.js child_process](https://nodejs.org/api/child_process.html)
- [Rust Book: Writing CLI Apps](https://doc.rust-lang.org/book/ch12-01-accepting-command-line-arguments.html)

---
Ultimo aggiornamento: 20 marzo 2026
