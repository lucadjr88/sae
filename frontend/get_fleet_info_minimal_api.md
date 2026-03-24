# API: getFleetInfoMinimal

Questa API backend espone le informazioni minime di una fleet SAGE su Solana, invocando il decoder Rust ufficiale.

## Endpoint

    GET /api/getFleetInfoMinimal?rpcUrl=<RPC_URL>&fleetId=<FLEET_ID>

- **rpcUrl**: URL RPC Solana (inclusa eventuale API key)
- **fleetId**: Pubkey della fleet SAGE

## Esempio di chiamata

```sh
curl 'http://localhost:3000/api/getFleetInfoMinimal?rpcUrl=https://mainnet.helius-rpc.com/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a&fleetId=3GewAmbfXfN3EekmmcX4dVdZJ1J1FXEra8AVZ12nmDak'
```

## Esempio di output

```json
{
  "ammo": {
    "capacity": 83600,
    "level": 12095,
    "stats_definition": {
      "authority": { "base58": "ADM1NZJQ7QYLvghj1t9aAjYaVzX6m7ao5MHRsapf5Q9Q" },
      "default_cargo_type": { "base58": "11111111111111111111111111111111" },
      "seq_id": 0,
      "stats_count": 1,
      "version": 0
    },
    "stats_definition_pubkey": "CSTatsVpHbvZmwHbCjZKVfYQT5JXfsXccXufhEcwCqTg"
  },
  "cargo": {
    "capacity": 61312,
    "level": 1445,
    "stats_definition": { ... },
    "stats_definition_pubkey": "..."
  },
  "cargo_tokens": [
    {
      "account": "76PWWhFRjaCtmCNZA2QJCNq6ZQK4j8ZbvZ3A19NNLNsU",
      "amount": "1444",
      "decimals": 0,
      "mint": "foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG"
    },
    { ... }
  ],
  "crew_required": 32,
  "crew_total": 32,
  "fuel": {
    "capacity": 51088,
    "level": 3216,
    "stats_definition": { ... },
    "stats_definition_pubkey": "..."
  },
  "posizione": {
    "asteroid": "CNw9h5mfJrjWn6W22ryp61Xs8UZ9KFCdBPs7C9XVJf8Y",
    "sector_xy": [ -25, 15 ],
    "state": "MineAsteroid"
  }
}
```

## Note
- L'output è quello ufficiale del decoder Rust, senza alterazioni.
- In caso di errore, viene restituito un oggetto `{ error, details, raw }`.
