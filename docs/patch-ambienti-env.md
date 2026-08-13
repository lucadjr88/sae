# Patch minima per i dati sensibili e cleanup codice morto

## Verifica e pulizia applicata

Ho verificato il codice letto in runtime e rimosso il codice morto non funzionale.

### Variabili realmente usate dal progetto

- `SDU_FLEET_CHART_URL` — letta in [src/backend/routes/sdu.ts](../src/backend/routes/sdu.ts). Se assente, usa un valore di fallback locale.
- `GECKOTERMINAL_WPAC_TOKEN` — letta in [src/backend/routes/prices.ts](../src/backend/routes/prices.ts). Se assente, usa un fallback hardcoded.
- `GECKOTERMINAL_NETWORK` — letta in [src/backend/routes/prices.ts](../src/backend/routes/prices.ts). Se assente, usa `bsc`.
- `FLARES_PREZZI_BATCH_URL` — letta in [src/backend/routes/richiestaPrezziBckend.ts](../src/backend/routes/richiestaPrezziBckend.ts). Se assente, usa un default URL pubblico.
- `TX_SIGNING_STORE_DIR` — letta in [src/backend/security/txSigningGuard.ts](../src/backend/security/txSigningGuard.ts). Se assente, usa una cartella `cache/security/tx-signing-requests` in root.
- `TX_SIGNING_MAX_WALLET_TIP_LAMPORTS` — letta in [src/backend/security/txSigningGuard.ts](../src/backend/security/txSigningGuard.ts). Se assente, usa `2000000`.


### Variabili non necessarie al funzionamento del codice

- `PORT` — il server usa `3000` hardcoded in [src/app.ts](../src/app.ts).
- `HELIUS_API_KEY`, `GETBLOCK_API_KEY`, `SOLANA_RPC_URLS` — non compare nel sorgente del backend.

## Patch minima consigliata

Il template pubblico deve contenere solo le variabili realmente usate o con fallback dichiarato nel codice.

```env
# App / runtime
NODE_ENV=development

# SDU upstream endpoint
SDU_FLEET_CHART_URL=http://localhost:3001/api/fleet-chart-data

# Optional pricing overrides
GECKOTERMINAL_WPAC_TOKEN=
GECKOTERMINAL_NETWORK=bsc
FLARES_PREZZI_BATCH_URL=https://flaresplay.xyz/api/prezzi-batch

# Optional transaction signing storage
TX_SIGNING_STORE_DIR=cache/security/tx-signing-requests
TX_SIGNING_MAX_WALLET_TIP_LAMPORTS=2000000
```

## Regola di sicurezza

- Nessun valore reale in Git.
- Nessun token, endpoint privato, path locale o key di servizio nei file versionati.
- I file di log, cache e documentazione vanno puliti prima della pubblicazione.
- La base di lavoro deve essere mantenuta fedele al codice: nulla di extra, niente variabili “mettere in .env” senza lettura nel runtime.

## File modificati nella patch

- Rimosso: [src/backend/middleware/authenticateToken.ts](../src/backend/middleware/authenticateToken.ts)
- Modificato: [src/app.ts](../src/app.ts) (rimosso import authRouter e mount /auth)
- Modificato: [.env.example](../.env.example) (rimosso JWT_SECRET, JWT_EXPIRY_SECONDS, ALLOWED_WALLETS)

## Passo successivo: cleanup storia git

Prima di rendere il repository pubblico su GitHub, consulta [cleanup-git-history.md](./cleanup-git-history.md) per rimuovere i file sensibili dalla storia git (utility/rpc-pool-complete.json e altri file di debug contenenti chiavi API).

