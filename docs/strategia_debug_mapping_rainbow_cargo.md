
# 1. Obiettivo e Contesto

**Obiettivo:**
Correggere la mancata associazione delle operazioni Dock/Undock/Load/Unload alla flotta "Rainbow Cargo" (`7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5`) e risolvere la presenza di flotte fantasma e Crafting errate nel breakdown delle operazioni.

**Attenzione AI:**
- Non saltare nessuno step.
- Non inventare dati: usa solo quelli reali estratti dalla cache.
- Mantieni la struttura numerata e referenziabile.

---

# 2. Glossario

| Termine              | Definizione                                                                 |
|----------------------|----------------------------------------------------------------------------|
| fleetKey             | Chiave pubblica principale della flotta                                    |
| accountToFleet       | Mappa che associa ogni account secondario (cargoHold, fuelTank, ecc.) alla flotta |
| sub-account          | Account derivati o associati a una flotta (cargoHold, fuelTank, ecc.)      |
| Flotta fantasma      | Flotta non riconosciuta dalla mappa accountToFleet                         |

---

## Obiettivo
Correggere la mancata associazione delle operazioni Dock/Undock/Load/Unload alla flotta "Rainbow Cargo" (7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5) e risolvere la presenza di flotte fantasma e Crafting errate nel breakdown delle operazioni.

---


# 3. Analisi del Problema

## 3.1 Mancata Associazione Operazioni

- Le operazioni Dock/Undock/Load/Unload non vengono associate a nessuna flotta, risultando sempre con FleetKey `<none>` e FleetName `<none>`.
- Le operazioni Subwarp, Mining, Scan, ecc. generano warning di "FLOTTA FANTASMA" anche quando tra gli account c’è la chiave della Rainbow Cargo.
- Alcune transazioni hanno tra gli account la fleetKey della Rainbow Cargo, ma non vengono associate.

**Output atteso:**
Lista di operazioni e relativi account, con evidenza di match/mancato match.

## 3.2 Esempio reale: Account Rainbow Cargo

Tabella degli account reali estratti dalla cache (non modificare, non inventare):

| Tipo Account           | Pubkey                                      |
|------------------------|----------------------------------------------|
| fleetKey               | 7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5 |
| ownerProfile           | 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8 |
| fleetShips             | i2UuLs9LM4HGsBqa6sPkNJhC6gUX2yRVdtLV53ac5sB  |
| subProfile             | 11111111111111111111111111111111             |
| subProfileInvalidator  | 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8 |
| cargoHold              | 2DHK7mpfq6YCKiXNeH7As8oi46CCBwmhVPp8M4RHzxwX |
| fuelTank               | BRZW9BoY7FDaRJ6qsJcrnDtvvdAyUvnBFddrf8HDHFEJ |
| ammoBank               | BLMrUSBdTBuzF4P7MtgqmLF9AimtvrSA92ywvsG5uyCA |

**Attenzione AI:**
Non aggiungere o rimuovere colonne senza verifica sui dati reali.

## 3.3 Tabella comparativa: Rainbow Cargo vs Miner1

Scopo: confronto diretto tra due flotte per validare la struttura degli account.

| Flotta          | fleetKey                                   | ownerProfile                                 | fleetShips                                 | cargoHold                                 | fuelTank                                 | ammoBank                                 |
|-----------------|--------------------------------------------|----------------------------------------------|--------------------------------------------|--------------------------------------------|-------------------------------------------|-------------------------------------------|
| Rainbow Cargo   | 7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5 | 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8 | i2UuLs9LM4HGsBqa6sPkNJhC6gUX2yRVdtLV53ac5sB | 2DHK7mpfq6YCKiXNeH7As8oi46CCBwmhVPp8M4RHzxwX | BRZW9BoY7FDaRJ6qsJcrnDtvvdAyUvnBFddrf8HDHFEJ | BLMrUSBdTBuzF4P7MtgqmLF9AimtvrSA92ywvsG5uyCA |
| Miner1          | 4t17D2wDf1AxF4ywsjZ8X9J8iXq8qJMwSvxQxZ24TojW | 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8 | 5vsxW5ZoZ5G83a9VFdBhkrnkcJvHHegb1kDd7hyXRSUi | 6GEz6dc2WMYQh62HURDoaGykKNU8YtN2HygyyGkaauQb | CVnaCSE5sm2RMDn2qVXoTF13CUJhdwB1wF2g1xETP8D6 | CnhcbjPw9HvCossMNE2cyWMkUi6REHFaiUhvfUFDqQoL |

**Output atteso:**
Tabella coerente e validata con i dati cache.

**Implicazione:**
Se una di queste chiavi manca nella mappa accountToFleet, le operazioni non verranno associate correttamente.

---


# 4. Scomposizione in Sotto-task Atomici

## 4.1 Analisi e Documentazione Stato Attuale

- Esaminare la funzione/porzione di codice che costruisce la mappa `accountToFleet` (tipicamente un ciclo sulle flotte e i loro sub-account).

**Output atteso:** Elenco degli account effettivamente mappati per Rainbow Cargo:

| Tipo Account  | Pubkey                                      |
|---------------|----------------------------------------------|
| fleetKey      | 7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5 |
| cargoHold     | 2DHK7mpfq6YCKiXNeH7As8oi46CCBwmhVPp8M4RHzxwX |
| fuelTank      | BRZW9BoY7FDaRJ6qsJcrnDtvvdAyUvnBFddrf8HDHFEJ |
| ammoBank      | BLMrUSBdTBuzF4P7MtgqmLF9AimtvrSA92ywvsG5uyCA |

**Nota:**
- Solo questi quattro account vengono effettivamente mappati nella logica attuale (sia in wallet-sage-fees-detailed.ts che in buildAccountToFleetMap).
- Gli altri campi (ownerProfile, fleetShips, subProfile, subProfileInvalidator) NON sono inclusi nella mappa accountToFleet.
- Se si desidera includere anche questi, occorre modificare la funzione di mapping.

## 4.2 Mappatura Completa degli Account

- Definire uno schema standard di tutti i sub-account che devono essere inclusi nella mappa per OGNI flotta.

**Tabella schema standard (✓ = effettivamente mappato, ✗ = solo disponibile nei dati cache):**

| Tipo Account           | Rainbow Cargo (presente in cache)         | Attualmente mappato? |
|------------------------|-------------------------------------------|----------------------|
| fleetKey               | 7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5 | ✓                    |
| ownerProfile           | 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8 | ✗                    |
| fleetShips             | i2UuLs9LM4HGsBqa6sPkNJhC6gUX2yRVdtLV53ac5sB  | ✗                    |
| subProfile             | 11111111111111111111111111111111             | ✗                    |
| subProfileInvalidator  | 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8 | ✗                    |
| cargoHold              | 2DHK7mpfq6YCKiXNeH7As8oi46CCBwmhVPp8M4RHzxwX | ✓                    |
| fuelTank               | BRZW9BoY7FDaRJ6qsJcrnDtvvdAyUvnBFddrf8HDHFEJ | ✓                    |
| ammoBank               | BLMrUSBdTBuzF4P7MtgqmLF9AimtvrSA92ywvsG5uyCA | ✓                    |

**Nota:**
- Solo fleetKey, cargoHold, fuelTank, ammoBank sono effettivamente mappati nella logica attuale.
- Per una copertura completa, valutare se includere anche gli altri sub-account nella funzione di mapping.

## 4.3 Verifica Logica di Associazione

- Analizzare la funzione che effettua il match tra gli account della transazione e quelli presenti in `accountToFleet`.

**Flowchart logico (testuale):**

1. Per ogni transazione, estrai la lista degli account coinvolti.
2. Per ogni account della transazione:
   - Se l'account è presente come chiave in `accountToFleet`, associa la transazione alla flotta corrispondente.
   - Se nessun account della transazione è presente in `accountToFleet`, la transazione viene marcata come "flotta fantasma".
3. Se più account corrispondono a flotte diverse, gestire come caso limite (es. warning o scelta prioritaria).

**Esempio pratico:**
```text
Transazione: [a, b, c]
accountToFleet: { a: F1, b: F2, d: F3 }
Risultato:
- a → F1 (match)
- b → F2 (match)
- c → nessun match
→ La transazione coinvolge F1 e F2 (caso multi-flotta)
```

**Nota:**
- La logica attuale associa la transazione alla prima flotta trovata tra gli account matchati.
- I casi multi-flotta o nessun match devono essere gestiti con warning o log diagnostici.

## 4.4 Strategia di Logging Diagnostico

- Definire log strutturati che mostrino:
   - La costruzione della mappa (quanti e quali account per flotta)
   - Per ogni transazione, la lista degli account e il risultato del match

**Proposta di log diagnostico:**
```text
[DEBUG][MAPPING] Rainbow Cargo: {fleetKey: 7hhSmvcH..., cargoHold: 2DHK7m..., fuelTank: BRZW9B..., ammoBank: BLMrUS...}
[DEBUG][MATCH] Op: Dock | Accounts: [7hhSmvcH..., 2DHK7m..., ...] | Match: 2DHK7m... → Rainbow Cargo
[WARN][MULTI-FLEET] Op: Mining | Accounts: [a, b, c] | Match: a → F1, b → F2
[WARN][NO-MATCH] Op: Load | Accounts: [x, y, z] | Nessun match in accountToFleet
```

**Raccomandazione:**
- Abilitare questi log solo tramite flag di configurazione per evitare eccessiva verbosità in produzione.

## 4.5 Piano di Test e Validazione

- Definire test automatici/manuali che simulino transazioni con vari account e verifichino l’associazione corretta.

**Checklist test dettagliata:**
- [ ] Transazione Dock con fleetKey della Rainbow Cargo → deve essere associata a Rainbow Cargo.
- [ ] Transazione Dock con cargoHold della Rainbow Cargo → deve essere associata a Rainbow Cargo.
- [ ] Transazione Dock con fuelTank della Rainbow Cargo → deve essere associata a Rainbow Cargo.
- [ ] Transazione Dock con ammoBank della Rainbow Cargo → deve essere associata a Rainbow Cargo.
- [ ] Transazione con account non mappati → warning di flotta fantasma.
- [ ] Transazione con più account di flotte diverse → warning multi-flotta.
- [ ] Test combinatori: tutte le possibili combinazioni di account mappati e non mappati.

**Criteri di successo:**
- Ogni account mappato deve portare ad associazione corretta.
- Nessun account mappato → warning di flotta fantasma.
- Più flotte matchate → warning multi-flotta.

**Suggerimento:**
- Usare una matrice di test che copra tutte le combinazioni di account possibili per robustezza.

---

# 5. Tabella di Sotto-task

| #  | Sotto-task                                   | Output Atteso                                    | Dettagli Tecnici / Implicazioni / Suggerimenti |
|----|----------------------------------------------|--------------------------------------------------|-----------------------------------------------|
| 1  | Analisi costruzione accountToFleet attuale   | Elenco degli account mappati per Rainbow Cargo   | Estrarre mapping da log/codice, automatizzare estrazione |
| 2  | Definizione account secondari da includere   | Tabella account Rainbow Cargo                    | Definire schema standard, validazione automatica |
| 3  | Analisi logica di match                      | Flowchart/descrizione condizioni di match        | Annotare casi limite, documentare flow di match |
| 4  | Proposta logging diagnostico                 | Esempi di log dettagliati                        | Log strutturati, abilitabili via flag          |
| 5  | Definizione piano di test e criteri successo | Elenco test, criteri di successo, log attesi     | Matrice di test, copertura combinatoria        |

---

# 6. Note Finali
- Questa strategia non prevede modifiche al codice, ma solo analisi, documentazione e pianificazione.
- Ogni step deve produrre un output documentale (tabella, flowchart, esempio di log, ecc.) da allegare alla documentazione tecnica.
- Solo dopo aver completato tutti i sotto-task si procederà con eventuali modifiche al codice.
