# Proteggere le Rotte con authenticateToken

Questo documento spiega come proteggere le nuove rotte API con il middleware `authenticateToken`.

## Utilizzo Base

Per proteggere una singola rotta:

```typescript
import { authenticateToken } from '../middleware/authenticateToken.js';

router.get('/protected-endpoint', authenticateToken, async (req, res) => {
  const userPubkey = req.user.pubkey;
  // ... logica che richiede autenticazione
  res.json({ message: 'OK', pubkey: userPubkey });
});
```

## Proteggere Intere Router

Per proteggere tutte le rotte di un router:

```typescript
import { authenticateToken } from '../middleware/authenticateToken.js';
import protectedRouter from './protected.js';

app.use('/api/protected', authenticateToken, protectedRouter);
```

## Accesso ai Dati dell'Utente

Nel handler, accedi ai dati dell'utente autenticato tramite `req.user`:

```typescript
router.post('/user-profile', authenticateToken, async (req, res) => {
  // L'utente è stato validato dal middleware
  const pubkey = req.user.pubkey;
  
  // Usa pubkey per controllare i dati specifici dell'utente
  // Es. GET profilo per questa wallet, analizza flotte, ecc.
  
  res.json({ userPubkey: pubkey });
});
```

## Error Responses

Il middleware ritorna automaticamente:

- **401 Unauthorized**: Token mancante
- **401 Unauthorized**: Token scaduto (`Token expired`)
- **403 Forbidden**: Token non valido

```json
{
  "error": "Missing token"
}
```

oppure

```json
{
  "error": "Token expired"
}
```

oppure

```json
{
  "error": "Invalid token"
}
```

## Flusso Completo

1. **Client login:**
   ```bash
   POST /auth/login
   { "pubkey": "...", "message": "...", "signature": "..." }
   → Response: { "token": "eyJ..." }
   ```

2. **Client salva token** (localStorage, memory, cookie, ecc)

3. **Client chiama rotta protetta:**
   ```bash
   GET /api/protected
   Authorization: Bearer eyJ...
   ```

4. **Middleware `authenticateToken`:**
   - Estrae token da header Authorization
   - Verifica JWT signature (HS256)
   - Valida scadenza
   - Injetta `req.user.pubkey` se OK
   - Chiama `next()` → handler

5. **Handler** accede a `req.user.pubkey` e processa la richiesta

## Esempio Completo

```typescript
import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/authenticateToken.js';

const router = express.Router();

// Rotta PUBBLICA (chiunque può accedere)
router.get('/prices', async (req: Request, res: Response) => {
  res.json({ btc: 45000, sol: 150 });
});

// Rotta PROTETTA (richiede autenticazione)
router.get('/user-fleets', authenticateToken, async (req: Request, res: Response) => {
  const userPubkey = req.user.pubkey;
  
  // Ora conosci la wallet dell'utente
  // Puoi filtrare i dati per questa wallet specifica
  
  res.json({
    user: userPubkey,
    fleets: [
      { id: '...', owner: userPubkey }
    ]
  });
});

export default router;
```

## Integrazione con Analisi Profili

Se desideri proteggere `/api/analyze-profile`:

```typescript
import { authenticateToken } from '../middleware/authenticateToken.js';

// Nella rotta:
router.post('/analyze-profile', authenticateToken, async (req: Request, res: Response) => {
  const userPubkey = req.user.pubkey;
  const { profileId } = req.body;
  
  // Opzionale: controlla che l'utente sia il proprietario del profilo
  // const profileOwner = await getProfileOwner(profileId);
  // if (profileOwner !== userPubkey) {
  //   return res.status(403).json({ error: 'Not owner of this profile' });
  // }
  
  // Procedi con l'analisi...
});
```

## Testing

```bash
# 1. Ottieni token via login
export TOKEN=$(curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{...}' | jq -r .token)

# 2. Usa token su rotta protetta
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/user-fleets
```

## Note

- Il middleware DEVE essere posizionato come secondo argomento (dopo il path)
- L'ordine dei middleware nel router è importante
- Se una rotta non ha il middleware, è pubblica
- `req.user` è disponibile solo nelle rotte con `authenticateToken`
