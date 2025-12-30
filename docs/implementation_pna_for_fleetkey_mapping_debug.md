# implementation_pna_for_fleetkey_mapping_debug.md

## Obiettivo
Diagnosticare e correggere la mancata associazione delle operazioni Dock/Undock/Load/Unload alla flotta Rainbow Cargo (7hhSmvcH43xrScmfvVMX6uqMDQEmFbGDA3XeHqADRyK5) e la presenza di flotte fantasma.

---

## Strategia

### 1. Analisi attuale
- I log mostrano che le operazioni Dock/Undock/Load/Unload non vengono mai associate a Rainbow Cargo.
- Le Crafting non sono più assegnate a flotte reali (corretto).
- Le Subwarp/Scan spesso non trovano fleetKey (flotte fantasma).

### 2. Ipotesi
- Il mapping tra accountKeys e fleetKey per Rainbow Cargo è incompleto o errato.
- Alcuni account secondari (cargoHold, fuelTank, ammoBank, fleetShips, subProfile.key, ownerProfile, subProfileInvalidator) potrebbero non essere inclusi in accountToFleet.

### 3. Piano operativo
1. **Aggiungere log dettagliato in fase di setup**
   - Stampare tutti gli accountKeys di Rainbow Cargo.
   - Stampare il mapping accountToFleet relativo a Rainbow Cargo.
2. **Verificare la presenza di tutti gli account secondari nel mapping**
   - Confrontare i valori di cargoHold, fuelTank, ammoBank, fleetShips, subProfile.key, ownerProfile, subProfileInvalidator con le chiavi di accountToFleet.
3. **Correggere la costruzione di accountToFleet**
   - Assicurarsi che tutti gli account secondari siano mappati correttamente.
4. **Test e validazione**
   - Eseguire la chiamata API e verificare nei log che le operazioni Dock/Undock/Load/Unload vengano associate a Rainbow Cargo.
   - Verificare la scomparsa delle flotte fantasma.

---

## Prossimi passi
- Implementare i log in fase di setup.
- Analizzare l'output e correggere il mapping se necessario.
- Validare la soluzione con nuovi test.
