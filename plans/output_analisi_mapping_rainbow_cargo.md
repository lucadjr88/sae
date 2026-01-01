# Analisi Mapping Rainbow Cargo – Stato Attuale e Validazione

## 1. Elenco account effettivamente mappati per Rainbow Cargo

| Tipo Account | Pubkey                                      |
|--------------|----------------------------------------------|
| fleetKey     | 7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5 |
| cargoHold    | 2DHK7mpfq6YCKiXNeH7As8oi46CCBwmhVPp8M4RHzxwX |
| fuelTank     | BRZW9BoY7FDaRJ6qsJcrnDtvvdAyUvnBFddrf8HDHFEJ |
| ammoBank     | BLMrUSBdTBuzF4P7MtgqmLF9AimtvrSA92ywvsG5uyCA |

**Nota:** Solo questi quattro account sono effettivamente mappati nella logica attuale.

---

## 2. Tabella schema standard e mapping attuale

| Tipo Account          | Rainbow Cargo (cache)                    | Attualmente mappato? |
|----------------------|-------------------------------------------|----------------------|
| fleetKey             | 7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5 | ✓                    |
| ownerProfile         | 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8 | ✗                    |
| fleetShips           | i2UuLs9LM4HGsBqa6sPkNJhC6gUX2yRVdtLV53ac5sB  | ✗                    |
| subProfile           | 11111111111111111111111111111111             | ✗                    |
| subProfileInvalidator| 4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8 | ✗                    |
| cargoHold            | 2DHK7mpfq6YCKiXNeH7As8oi46CCBwmhVPp8M4RHzxwX | ✓                    |
| fuelTank             | BRZW9BoY7FDaRJ6qsJcrnDtvvdAyUvnBFddrf8HDHFEJ | ✓                    |
| ammoBank             | BLMrUSBdTBuzF4P7MtgqmLF9AimtvrSA92ywvsG5uyCA | ✓                    |

---

## 3. Flowchart logico di match

1. Per ogni transazione, estrai la lista degli account coinvolti.
2. Per ogni account della transazione:
   - Se l'account è presente come chiave in `accountToFleet`, associa la transazione alla flotta corrispondente.
   - Se nessun account della transazione è presente in `accountToFleet`, la transazione viene marcata come "flotta fantasma".
3. Se più account corrispondono a flotte diverse, gestire come caso limite (es. warning o scelta prioritaria).

---

## 4. Esempi di log diagnostico

```
[DEBUG][MAPPING] Rainbow Cargo: {fleetKey: 7hhSmvcH..., cargoHold: 2DHK7m..., fuelTank: BRZW9B..., ammoBank: BLMrUS...}
[WARN][MULTI-FLEET] Op: Mining | Accounts: [a, b, c] | Match: a → F1, b → F2
[WARN][NO-MATCH] Op: Load | Accounts: [x, y, z] | Nessun match in accountToFleet
```

---

## 5. Matrice di test e criteri di successo

| Test case                                              | Atteso                                 |
|--------------------------------------------------------|----------------------------------------|
| Dock con fleetKey Rainbow Cargo                        | Associazione a Rainbow Cargo           |
| Dock con cargoHold Rainbow Cargo                       | Associazione a Rainbow Cargo           |
| Dock con fuelTank Rainbow Cargo                        | Associazione a Rainbow Cargo           |
| Dock con ammoBank Rainbow Cargo                        | Associazione a Rainbow Cargo           |
| Operazione con account non mappati                     | Warning flotta fantasma                |
| Operazione con più account di flotte diverse           | Warning multi-flotta                   |
| Combinazioni varie (matrice combinatoria)              | Associazione o warning secondo regole  |

**Criteri di successo:**
- Ogni account mappato porta ad associazione corretta.
- Nessun account mappato → warning di flotta fantasma.
- Più flotte matchate → warning multi-flotta.

---

*File generato automaticamente secondo strategia allegata.*
