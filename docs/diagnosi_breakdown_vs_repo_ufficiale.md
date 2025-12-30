---

## Analisi mapping accountToFleet per Rainbow Cargo

### Chiavi mappate per la fleet "Rainbow Cargo" (`7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5`):

```
{
  fleetKey: "7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5",
  ownerProfile: "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",
  fleetShips: "i2UuLs9LM4HGsBqa6sPkNJhC6gUX2yRVdtLV53ac5sB",
  subProfile.key: "11111111111111111111111111111111",
  subProfileInvalidator: "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",
  cargoHold: "2DHK7mpfq6YCKiXNeH7As8oi46CCBwmhVPp8M4RHzxwX",
  fuelTank: "BRZW9BoY7FDaRJ6qsJcrnDtvvdAyUvnBFddrf8HDHFEJ",
  ammoBank: "BLMrUSBdTBuzF4P7MtgqmLF9AimtvrSA92ywvsG5uyCA"
}
```

### accountKeys della transazione normalizzata:

```
[
  "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY",
  "3LDBxBFhgJAU6q2JaUgENXckNZrVdTh2gt8Nn3bAhGoq",
  "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",
  "2wiJqnokfbzzG3xUBtWJRdENQ71Si1mAszCkYHM4PxHP",
  "8geoPAWxnCBVEzu2XneLmbZiXZHquJet6sDN92SdjGmL",
  ...
  "7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5",
  ...
]
```

### Osservazione
- Almeno una delle chiavi mappate (fleetKey, ownerProfile, ecc.) è presente in accountKeys della transazione.
- La logica di matching dovrebbe quindi associare la transazione alla fleet Rainbow Cargo.

### Prossimo step
- Se la logica non funziona, verificare che il flag `enableSubAccountMapping` sia attivo nella chiamata API e nella pipeline.
- Se non lo è, forzare l'attivazione o modificarne il default.
# Diagnosi step-by-step breakdown fleet/tx vs repo ufficiale

## 1. Analisi logica di matching in sae-main

- La funzione di aggregazione (`getWalletSageFeesDetailedStreaming`) in `sae-main` associa le transazioni alle flotte confrontando gli `accountKeys` delle transazioni normalizzate con i `fleetAccounts` forniti come parametro.
- Se almeno una chiave di `accountKeys` matcha una delle `fleetAccounts`, la transazione viene attribuita a quella fleet.
- Se nessuna chiave matcha, la transazione viene aggregata sotto "Other Operations".
- La normalizzazione delle transazioni è robusta e popola sempre il campo `accountKeys`.

## 2. Dump di una transazione normalizzata (esempio reale)

- Da dump manuale e grep, i tipi di transazione e i programId sono correttamente estratti e normalizzati.
- Tuttavia, la breakdown API restituisce breakdown vuote: nessuna transazione viene associata a nessuna fleet.
- Possibili cause:
  - Gli `accountKeys` delle transazioni non contengono effettivamente nessuna delle chiavi in `fleetAccounts`.
  - La logica di matching è troppo restrittiva o la struttura dati non è allineata.

## 3. Confronto con la repo ufficiale star-atlas-decoders-main

- Nella repo ufficiale, la logica di associazione fleet/tx può essere più flessibile o usare mapping diversi (es. sub-account, mapping secondari, chiavi derivate).
- Potrebbero essere usati altri campi o mapping per attribuire le transazioni alle flotte (es. owner, subProfile, fleetShips, ecc).
- Serve analisi dettagliata dei decoder e delle funzioni di aggregazione nella repo ufficiale.

## 4. Prossimi step

- Dump di esempio di transazione normalizzata e fleetAccounts per verifica manuale.
- Analisi delle funzioni di mapping/aggregazione nella repo ufficiale.
- Proposta di patch o refactor per allineare la logica di matching.

---

_Questo file verrà aggiornato con i risultati dei prossimi step e con eventuali patch suggerite._


---

## Dump di esempio: transazione normalizzata e fleetAccounts

### Esempio di fleetAccounts (Rainbow Cargo)

```
[
  "3LDBxBFhgJAU6q2JaUgENXckNZrVdTh2gt8Nn3bAhGoq", // ReFoxScan
  "4t17D2wDf1AxF4ywsjZ8X9J8iXq8qJMwSvxQxZ24TojW",
  "7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5", // Rainbow Cargo
  ...
]
```

### Esempio di transazione normalizzata (estratta da 4NMWPgorXKxgSqpPbm9fLvW5AxLxVdjvY8Np2tGTVYxQzX9br3CDjnQdFGaxFz7f1Csx68v9nhykRBffusu54iei)

```
{
  accountKeys: [
    "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY",
    "3LDBxBFhgJAU6q2JaUgENXckNZrVdTh2gt8Nn3bAhGoq",
    "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",
    "2wiJqnokfbzzG3xUBtWJRdENQ71Si1mAszCkYHM4PxHP",
    "8geoPAWxnCBVEzu2XneLmbZiXZHquJet6sDN92SdjGmL",
    ...
    "7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5", // Rainbow Cargo
    ...
  ],
  type: "cargo",
  amount: undefined,
  timestamp: "1767132975",
  txid: "4NMWPgorXKxgSqpPbm9fLvW5AxLxVdjvY8Np2tGTVYxQzX9br3CDjnQdFGaxFz7f1Csx68v9nhykRBffusu54iei",
  raw: { ... }
}
```

### Osservazione
- La chiave della fleet "Rainbow Cargo" (`7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5`) è presente sia in `fleetAccounts` sia in `accountKeys` della transazione normalizzata.
- La transazione è correttamente normalizzata come tipo `cargo`.

### Prossimo step
- Analizzare la funzione di matching e aggregazione: perché la transazione non viene associata alla fleet Rainbow Cargo?
- Confrontare con la logica della repo ufficiale.
