## ESEMPIO DI IMPLEMENTAZIONE DELLA DECODIFICA CON orchestrazione batch+binario 

1 - ContractState (già fatto in ts): 1 fetch per tutti i contratti.

2 - RentalState: 1 fetch per ogni contratto che ha current_rental_state non nullo.

3 - Fleet: 1 fetch per ogni contratto (campo fleet).

4 - Thread: 1 fetch per ogni rental che ha un thread associato (campo thread in RentalState).

Ecco uno schema di orchestrazione ibrida batch+binario per coprire tutti e 4 i punti (ContractState, RentalState, Fleet, Thread) del programma SRSLY. L’obiettivo è:

fare le fetch in batch via TypeScript
passare i buffer raw a un binario Rust che restituisce i dati decodificati
unire i risultati in JS/TS
1. Schema generale orchestrazione


flowchart TD
    A[Batch fetch ContractState] -->|pubkey| B[Batch fetch RentalState]
    A -->|fleet pubkey| C[Batch fetch Fleet]
    B -->|thread pubkey| D[Batch fetch Thread]
    A & B & C & D --> E[Pass raw buffers a binario Rust]
    E --> F[Parse JSON output in TS]
    F --> G[Unisci risultati e salva/cache]


2. Esempio di orchestrazione in TypeScript


import { spawn } from 'child_process';

// 1. Batch fetch ContractState
const contractAccounts = await batchFetchAccounts(contractPubkeys);
// 2. Batch fetch RentalState
const rentalPubkeys = contractAccounts
  .map(acc => estraiRentalStatePubkey(acc))
  .filter(Boolean);
const rentalAccounts = await batchFetchAccounts(rentalPubkeys);
// 3. Batch fetch Fleet
const fleetPubkeys = contractAccounts.map(acc => estraiFleetPubkey(acc));
const fleetAccounts = await batchFetchAccounts(fleetPubkeys);
// 4. Batch fetch Thread
const threadPubkeys = rentalAccounts
  .map(acc => estraiThreadPubkey(acc))
  .filter(Boolean);
const threadAccounts = await batchFetchAccounts(threadPubkeys);

// 5. Prepara input per binario Rust
const allBuffers = [
  ...contractAccounts,
  ...rentalAccounts,
  ...fleetAccounts,
  ...threadAccounts,
].map(acc => acc.data);

// 6. Chiama il binario Rust
const rustProcess = spawn('./srsly-decoder', ['decode', '--json']);
rustProcess.stdin.write(JSON.stringify(allBuffers));
rustProcess.stdin.end();

let output = '';
rustProcess.stdout.on('data', (data) => { output += data; });
await new Promise(resolve => rustProcess.on('close', resolve));

// 7. Parse output JSON
const decoded = JSON.parse(output);

// 8. Unisci risultati in base ai pubkey
// ...logica di merge...


3. Vantaggi
Decodifica sempre fedele alle struct Rust.
Massima efficienza: tutte le fetch sono batch, e la decodifica è centralizzata.
Puoi aggiornare le struct Rust senza dover riscrivere la logica in TS.
