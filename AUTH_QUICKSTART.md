# QUICK START - MODULO AUTH

## Avvio Server (Comando Standard)

```bash
pkill -9 node; cd ~/sae ;rm -rf log cache dist; sleep 1; npm run build && mkdir -p log && nohup npm run dev > log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &
```

## Endpoint Disponibile

```
POST http://localhost:3000/auth/login
Content-Type: application/json
```

### Body Esempio

```json
{
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY",
  "message": "TG9naW4gYXQgMTcwODAxOTQwMA==",
  "signature": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  "profileId": "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8"
}
```

**Nota:** message e signature devono essere in base64. `profileId` è opzionale.

### Response Success

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800,
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY"
}
```

### Response Error

```json
{
  "error": "Invalid signature",
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY"
}
```

Oppure:

```json
{
  "error": "Wallet not authorized",
  "pubkey": "..."
}
```

## Configurazione .env

File `.env` nella root:

```bash
JWT_SECRET=your-very-secure-secret-at-least-32-bytes-long-xxx-here-123456789
JWT_EXPIRY_SECONDS=604800
ALLOWED_WALLETS=9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY
NODE_ENV=development
```

**Non committare .env nel git!** (è in .gitignore)

Usa `.env.example` come template.

## Testing Endpoint

```bash
# Test con pubkey non autorizzato (ritorna 403)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "pubkey":"GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv",
    "message":"dGVzdA==",
    "signature":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="
  }'

# Response:
# {
#   "error": "Signature verification failed",
#   "pubkey": "GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv"
# }
```

## Proteggere Rotte

Per proteggere una rotta con il middleware `authenticateToken`:

```typescript
import { authenticateToken } from '../middleware/authenticateToken.js';

router.get('/my-fleets', authenticateToken, async (req, res) => {
  const userPubkey = req.user.pubkey;
  // ... logica che conosce la wallet dell'utente
  res.json({ user: userPubkey, fleets: [...] });
});
```

Nel client, invia il token nell'header:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/my-fleets
```

## Test Completo con Firma Valida

Esegui lo script di test:

```bash
npx tsx src/test_auth_flow.ts
```

Output atteso: 7 test case con status HTTP corretti (400, 403, etc).

## Moduli Creati

```
src/utils/auth/
  ├── verifySignature.ts        (Ed25519 verification)
  ├── jwtHandler.ts            (JWT generation/verification)
  └── wallet-whitelist.ts      (Whitelist management)

src/backend/middleware/
  └── authenticateToken.ts     (Express middleware)

src/backend/routes/
  └── auth.ts                  (POST /auth/login endpoint)
```

## Dipendenze Aggiunte

- `tweetnacl@^1.0.3` - Ed25519 signature verification
- `jsonwebtoken@^9.0.0` - JWT handling
- `@types/jsonwebtoken@^9.0.0` - TypeScript types

## Documentazione Completa

- `modulo di verifica firma del wallet.md` - Specifiche tecniche complete
- `IMPLEMENTAZIONE_AUTH.md` - Guida implementazione dettagliata
- `PROTECT_ROUTES.md` - Come proteggere le rotte
- `COMPLETAMENTO.md` - Checklist di completamento

## Notes

- JWT scadenza: 7 giorni (configurable via JWT_EXPIRY_SECONDS)
- Whitelist carica da: .env → cache locale → RPC on-chain
- Server usa RPC Pool Manager per connessioni Solana
- Tutti i moduli in ESM (import/export)
- File size conforme (30-500 righe)
