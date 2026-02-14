# MODULI AUTH - DOCUMENTAZIONE IMPLEMENTAZIONE

## Panoramica

Sono stati creati 5 moduli core per l'autenticazione Web3 Solana:

### 1. `src/utils/auth/verifySignature.ts`
Verifica la firma Ed25519 di un messaggio utilizzando nacl.sign.detached.verify

**Funzione principale:**
- `verifySignature(input: VerifySignatureInput): Promise<VerifySignatureResult>`

**Input:**
- `pubkey` (string): pubkey base58 Solana
- `message` (string): messaggio in base64
- `signature` (string): firma 64-byte in base64

**Output:**
- `valid` (boolean): true se firma valida
- `error` (string): messaggio di errore se valido=false
- Buffer decodificati per uso avanzato

**Validazioni:**
- Pubkey deve essere 32 bytes (base58)
- Message deve essere valido base64
- Signature deve essere esattamente 64 bytes

### 2. `src/utils/auth/jwtHandler.ts`
Gestisce generazione e verifica di JWT HS256 con scadenza 7 giorni

**Funzioni principali:**
- `generateToken(pubkey: string): string` - Genera JWT
- `verifyToken(token: string): JwtPayload` - Valida e decodifica JWT
- `decodeToken(token: string): JwtPayload | null` - Decodifica senza verifica

**Payload JWT:**
```json
{
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY",
  "type": "auth",
  "iat": 1708019400,
  "exp": 1708624200
}
```

**Configurazione:**
- `JWT_SECRET` (env): minimo 32 bytes, obbligatorio
- `JWT_EXPIRY_SECONDS` (env): default 604800 (7 giorni)

### 3. `src/utils/auth/wallet-whitelist.ts`
Carica e cachea la lista di wallet autorizzati da multiple fonti

**Funzioni principali:**
- `getAuthorizedWallets(profileId?: string): Promise<Set<string>>`
- `isWalletAuthorized(pubkey: string, profileId?: string): Promise<boolean>`
- `clearWhitelistCache(profileId?: string): void`

**Ordine di caricamento (first-match):**
1. **Environment:** `ALLOWED_WALLETS` (comma-separated)
2. **Cache locale:** `cache/<profileId>/<profileId>.json` → allowedWallets[]
3. **RPC on-chain:** `getWalletAuthorityUtil(profileId)` via Solana RPC pool

**Caching:** 5 minuti TTL in memoria

### 4. `src/backend/middleware/authenticateToken.ts`
Middleware Express che protegge le rotte successive

**Utilizzo:**
```typescript
import { authenticateToken } from './middleware/authenticateToken.js';
app.use('/api/protected', authenticateToken, protectedRouter);
```

**Comportamento:**
- Legge header `Authorization: Bearer <token>`
- Verifica JWT signature e scadenza
- Injetta `req.user = { pubkey: string }` se valido
- Ritorna 401 se token mancante/scaduto, 403 se non valido

### 5. `src/backend/routes/auth.ts`
Endpoint REST per login e token generation

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY",
  "message": "TG9naW4gcmVxdWVzdA==",
  "signature": "SIGNATURE_64BYTES_BASE64",
  "profileId": "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8"
}
```

**Response OK (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800,
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY"
}
```

**Response Errors:**
- `400`: Missing required fields
- `403`: Invalid signature
- `401`: Wallet not in allowed list
- `500`: Server error

## Integrazione in app.ts

Aggiunto:
```typescript
import authRouter from './backend/routes/auth.js';
app.use('/auth', authRouter);
```

L'endpoint è disponibile a `POST http://localhost:3000/auth/login`

## Environment Setup

Crea `.env` nella root (non committare):
```bash
JWT_SECRET=your-very-secret-random-string-at-least-32-bytes-long-here
JWT_EXPIRY_SECONDS=604800
ALLOWED_WALLETS=9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY
NODE_ENV=development
```

Vedi `.env.example` per template.

## Testing Locale

```bash
# 1. Genera messaggio base64
export MESSAGE=$(echo -n "Login $(date +%s)" | base64)

# 2. Firma con Phantom/wallet (nel browser o via CLI Solana)
export PUBKEY="9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY"
export SIGNATURE="<signature_64_byte_base64>"

# 3. Test endpoint
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d "{
    \"pubkey\": \"$PUBKEY\",
    \"message\": \"$MESSAGE\",
    \"signature\": \"$SIGNATURE\"
  }"

# 4. Usa token su rotta protetta
export TOKEN="<jwt_token_from_response>"
curl http://localhost:3000/api/protected \
  -H "Authorization: Bearer $TOKEN"
```

## Dipendenze Aggiunte

- `tweetnacl@^1.0.3`: Ed25519 signature verification
- `jsonwebtoken@^9.0.0`: JWT generation/verification
- `@types/jsonwebtoken@^9.0.0`: TypeScript types

Aggiunte a package.json e installate via `npm install`.

## Note Architetturali

- **Zero Reimplement:** Usa getWalletAuthorityUtil() esistente per caricamento wallets
- **Isolamento:** Funzioni auth separate in cartella `utils/auth/`
- **Caching:** Whitelist cachea 5 minuti per ridurre RPC load
- **Error Handling:** Dettagli errori solo in dev mode
- **ESM:** Tutti i file usano import/export (conforme custom instructions)
