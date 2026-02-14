## MODULO DI VERIFICA FIRMA DEL WALLET

Questo modulo implementa l'autenticazione Web3 per Solana via firma del wallet ed emette token JWT temporanei (7 giorni) che autorizzano le richieste successive.

### ARCHITETTURA GENERALE

```
[Client Web3] 
    ↓
  Sign Message (off-chain)
    ↓
POST /auth/login { pubkey, message, signature }
    ↓
[Auth Service]
  ├─ Verifica sig con nacl.sign.detached.verify()
  ├─ Controlla whitelist allowedWallets (da RPC/cache)
  └─ Genera JWT se valido
    ↓
Client riceve JWT in response
    ↓
Usa JWT negli header Authorization: Bearer <token>
    ↓
Middleware authenticateToken
  ├─ Valida signature JWT
  ├─ Estrae pubkey da payload
  └─ Injetta in req.user.pubkey
```

### FILE STRUCTURE

```
src/
├── backend/
│   └── routes/
│       ├── auth.ts              [NEW] Login endpoint + JWT generation
│       └── middleware/
│           └── authenticateToken.ts [NEW] JWT verification middleware
├── utils/
│   └── auth/
│       ├── verifySignature.ts   [NEW] Nacl signature verification
│       ├── jwtHandler.ts        [NEW] JWT encode/decode
│       └── wallet-whitelist.ts  [NEW] Load allowed wallets from cache/RPC
└── app.ts [MODIFIED] Mount auth router + middleware
```

### ENDPOINT: POST /auth/login

**Request Body:**
```json
{
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY",
  "message": "[base64] utf-8 encoded message",
  "signature": "[base64] 64-byte Ed25519 signature"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800,
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY"
}
```

**Response (403 - Invalid Signature):**
```json
{
  "error": "Invalid signature",
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY"
}
```

**Response (401 - Wallet not in whitelist):**
```json
{
  "error": "Wallet not authorized",
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY"
}
```

**Response (400 - Missing fields):**
```json
{
  "error": "Missing pubkey, message, or signature"
}
```

### PROCESSO DI VERIFICA DELLA FIRMA

1. **Client prepara il messaggio:** messaggio arbitrario (es. timestamp, nonce) in UTF-8 base64
2. **Client firma:** usa Solana wallet (Phantom, etc) per Ed25519 sign su message
3. **Backend riceve:** pubkey (base58), message (base64), signature (base64)
4. **Backend valida:**
   ```typescript
   import nacl from 'tweetnacl';
   import bs58 from 'bs58';
   
   const publicKeyBuffer = bs58.decode(pubkey);        // 32 bytes
   const messageBuffer = Buffer.from(message, 'base64'); // UTF-8
   const signatureBuffer = Buffer.from(signature, 'base64'); // 64 bytes
   
   const isValid = nacl.sign.detached.verify(
     messageBuffer,
     signatureBuffer,
     publicKeyBuffer
   );
   ```
5. **Se valido:** controlla whitelist (allowedWallets da [src/utils/getWalletAuthority.ts](src/utils/getWalletAuthority.ts))
6. **Se autorizzato:** genera JWT

### JWT TOKEN

**Header:**
```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

**Payload (7 giorni = 604800 secondi):**
```json
{
  "pubkey": "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY",
  "iat": 1708019400,
  "exp": 1708624200,
  "type": "auth"
}
```

**Secret:** `process.env.JWT_SECRET` (deve essere >= 32 bytes, salvato in `.env` non in git)

### MIDDLEWARE: authenticateToken

**Utilizzo:**
```typescript
app.use('/api/protected', authenticateToken, protectedRouter);
```

**Implementazione:**
```typescript
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { pubkey: payload.pubkey };
    next();
  } catch (e) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
```

**In rotte protette:**
```typescript
router.get('/api/user-profile', authenticateToken, async (req, res) => {
  const userPubkey = req.user.pubkey; // Disponibile dopo middleware
  // ...
});
```

### WHITELIST: allowedWallets

Le whitelist derivano da due fonti in ordine:

1. **Cache locale:** `cache/<profileId>/<profileId>.json` → `allowedWallets[]`
2. **RPC on-chain:** [src/utils/getWalletAuthority.ts](src/utils/getWalletAuthority.ts)
   - Legge account profilo Solana
   - Parsifica Borsh buffer
   - Estrae array di allowed pubkeys dai permessi

**Flusso di caricamento:**
```typescript
async function loadAllowedWallets(profileId?: string) {
  if (profileId) {
    // Prova cache prima
    const cached = await getCachedAllowedWallets(profileId);
    if (cached) return cached.map(w => w.pubkey);
  }
  
  // Fallback: query RPC pool
  const { allowedWallets } = await getWalletAuthorityUtil(profileId);
  return allowedWallets.map(w => w.pubkey);
}
```

### ERROR HANDLING

| Scenario | Status | Error Message |
|----------|--------|---------------|
| Firma invalida (nacl verify false) | 403 | `Invalid signature` |
| Wallet non in allowedWallets | 401 | `Wallet not authorized` |
| JWT scaduto (exp < now) | 403 | `Invalid or expired token` |
| JWT secret non configurato | 500 | `Server auth not configured` |
| Pubkey non base58 valido | 400 | `Invalid pubkey format` |
| Message non base64 valido | 400 | `Invalid message encoding` |
| Signature non 64 bytes | 400 | `Invalid signature format` |

### VARIABILI AMBIENTE

```bash
# .env (non committare)
JWT_SECRET=<random_hs256_secret_32+_bytes>
JWT_EXPIRY_SECONDS=604800

# Opzionale: whitelist hardcoded (fallback a RPC se non set)
ALLOWED_WALLETS=pubkey1,pubkey2,pubkey3
```

### INTEGRAZIONE CON RPC POOL

Usa [src/utils/rpc/rpc-pool-manager.ts](src/utils/rpc/rpc-pool-manager.ts) per caricamento dinamico allowedWallets:
- **Round-robin** connection picking
- **Health check** endpoint degradation
- **Fallback** su endpoint healthier se uno è in backoff

### TESTING

```bash
# 1. Ottieni pubkey dal tuo wallet
export PUBKEY="9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY"

# 2. Crea messaggio e firma (es. da Phantom)
export MESSAGE="$(echo -n 'Login request' | base64)"
export SIGNATURE="<64-byte-signature-in-base64>"

# 3. Test endpoint
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"pubkey\": \"$PUBKEY\", \"message\": \"$MESSAGE\", \"signature\": \"$SIGNATURE\"}"

# 4. Usa token su rotta protetta
export TOKEN="<jwt_from_login_response>"
curl http://localhost:3000/api/protected \
  -H "Authorization: Bearer $TOKEN"
```

### CONFORME

- ✅ Ed25519 signature verification (nacl.sign.detached)
- ✅ JWT 7 giorni scadenza
- ✅ HS256 secret-based signing
- ✅ Middleware per proteggere rotte
- ✅ Whitelist da on-chain allowedWallets
- ✅ Error handling robusto
- ✅ Integrato con RPC pool manager
- ✅ Base58 pubkey encoding (Solana nativo)