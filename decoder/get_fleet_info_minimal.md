# get_fleet_info_minimal

## Funzionalità
Questo programma Rust estrae e restituisce in formato JSON le informazioni principali di una fleet SAGE su Solana:
- Crew totale e richiesta
- Livelli e capacità di fuel, ammo, cargo
- Token SPL contenuti nel cargo pod
- Posizione attuale della fleet (settore, stato)

## Esempio di utilizzo

Compilazione:
```sh
cargo build --release --bin get_fleet_info_minimal
```

Esecuzione:
```sh
./target/release/get_fleet_info_minimal <RPC_URL> <FLEET_ID>
```
Esempio reale:
```sh
./get_fleet_info_minimal https://mainnet.helius-rpc.com/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a 3GewAmbfXfN3EekmmcX4dVdZJ1J1FXEra8AVZ12nmDak
```

Output (estratto):
```json
{
  "crew_total": 32,
  "crew_required": 32,
  "fuel": { "level": 8144, "capacity": 51088, ... },
  "ammo": { "level": 26396, "capacity": 83600, ... },
  "cargo": { "level": 1445, "capacity": 61312, ... },
  "cargo_tokens": [
    { "account": "...", "mint": "...", "amount": "...", "decimals": 0 }
  ],
  "posizione": { "state": "MineAsteroid", "sector_xy": [-25, 15], ... }
}
```

## Integrazione in un progetto TypeScript

1. **Compila il binario** come sopra.
2. **Invoca il binario da Node.js/TypeScript** usando `child_process`:

```typescript
import { spawn } from 'child_process';

function getFleetInfo(rpcUrl: string, fleetId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('./target/release/get_fleet_info_minimal', [rpcUrl, fleetId]);
    let data = '';
    proc.stdout.on('data', chunk => data += chunk);
    proc.stderr.on('data', err => console.error('stderr:', err.toString()));
    proc.on('close', code => {
      if (code === 0) {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      } else {
        reject(new Error('Rust process exited with code ' + code));
      }
    });
  });
}

// Esempio d'uso:
getFleetInfo('https://mainnet.helius-rpc.com/?api-key=...', '3GewAmbfXfN3EekmmcX4dVdZJ1J1FXEra8AVZ12nmDak')
  .then(console.log)
  .catch(console.error);
```

**Nota:** Assicurati che il binario sia compilato e accessibile dal percorso specificato.
