# Guida API Prezzi — Star Atlas Flares NovaGrid
fornita da [Flares Play](https://flaresplay.xyz)
## Panoramica

L'endpoint `/api/prezzi-batch` permette di ottenere i **prezzi di mercato in tempo reale** degli asset NFT di Star Atlas (navi, risorse, ecc.) dal **Galactic Marketplace** on-chain.

Per ogni mint richiesto, l'API restituisce:
- **prezzo_buy** — il miglior ordine di acquisto (bid più alto) in ATLAS
- **prezzo_sell** — il miglior ordine di vendita (ask più basso) in ATLAS

---

## Endpoint

```
POST /api/prezzi-batch
```

**Content-Type:** `application/json`

---

## Corpo della Richiesta (Request Body)

```json
{
  "ricchiesta_prezzi": [
    "MINT_ADDRESS_1",
    "MINT_ADDRESS_2",
    "MINT_ADDRESS_3"
  ]
}
```

| Campo               | Tipo       | Obbligatorio | Descrizione                                      |
|---------------------|------------|:------------:|--------------------------------------------------|
| `ricchiesta_prezzi` | `string[]` | ✅           | Array di indirizzi mint (pubkey Solana in base58) |

### Regole sull'input

- **Minimo 1 mint**, massimo **50 mint** per richiesta.
- I duplicati vengono rimossi automaticamente.
- I valori vuoti o nulli vengono ignorati.
- Ogni mint deve essere una **pubkey Solana valida** in formato base58 (32-44 caratteri, senza i caratteri `0`, `O`, `I`, `l`).
- I mint non validi vengono scartati silenziosamente. Se dopo la validazione non resta nessun mint valido, l'API risponde con errore 400.

---

## Risposta Successo (HTTP 200)

```json
{
  "prezzi": {
    "HzBx8PP86pyPrrboTHqPYWhxnEB5vXDHDBP8femWfGPM": {
      "atlas": {
        "prezzo_buy": 1234.5,
        "prezzo_sell": 1500.0
      },
      "usdc": {
        "prezzo_buy": 98.50,
        "prezzo_sell": 105.00
      }
    },
    "foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG": {
      "atlas": {
        "prezzo_buy": null,
        "prezzo_sell": null
      },
      "usdc": {
        "prezzo_buy": 0.0052,
        "prezzo_sell": 0.0061
      }
    }
  }
}
```

Ogni mint ha due sotto-oggetti: `atlas` e `usdc`, ciascuno con:

| Campo          | Tipo             | Descrizione                                                                 |
|----------------|------------------|-----------------------------------------------------------------------------|
| `prezzo_buy`   | `number \| null` | Prezzo del miglior ordine di acquisto (bid più alto). `null` = nessun ordine buy presente |
| `prezzo_sell`  | `number \| null` | Prezzo del miglior ordine di vendita (ask più basso). `null` = nessun ordine sell presente |

### Note sui valori

- Ogni mint restituisce prezzi in **due valute**: ATLAS e USDC.
- Le navi tendono ad avere ordini in **ATLAS**, le risorse (food, ammo, fuel, toolkit) tendono ad avere ordini in **USDC**.
- `null` significa che **non ci sono ordini aperti** di quel tipo/valuta sul marketplace per quel mint.
- Se un mint è valido ma la query on-chain fallisce, il mint compare comunque nella risposta con tutti i valori a `null`.

---

## Risposte di Errore

| HTTP | Body                                                                         | Causa                                            |
|------|------------------------------------------------------------------------------|--------------------------------------------------|
| 400  | `{ "error": "Serve un array \"ricchiesta_prezzi\" con almeno un mint" }`     | Campo `ricchiesta_prezzi` mancante, non array, o vuoto |
| 400  | `{ "error": "Nessun mint valido fornito" }`                                 | Tutti i mint forniti sono in formato non valido  |
| 500  | `{ "error": "Errore interno" }`                                             | Errore generico del server                        |

---

## Performance e Cache

- Ogni mint ha una **cache di 30 secondi**. Richieste ripetute per lo stesso mint entro 30s sono istantanee.
- Quando ci sono più mint nella richiesta, tra una query e l'altra c'è un delay di **80ms** per non sovraccaricare l'RPC Solana.
- Tempo medio di risposta: ~100ms per mint (prima richiesta), istantaneo se in cache.

---

## Dove trovare i Mint Address

I mint address sono le **pubkey Solana** che identificano ogni asset NFT di Star Atlas. Si possono ottenere da:

1. **NFT Index di Star Atlas** — L'elenco ufficiale degli asset con i relativi mint.
2. **Star Atlas Explorer / Marketplaces** — Ogni pagina di un asset mostra il suo mint address.
3. **File `nft-index-cached.json`** — Se presente sul server, contiene l'indice completo cachato localmente.

### Esempi di mint comuni

| Asset                | Mint Address                                      |
|----------------------|---------------------------------------------------|
| Fuel (combustibile)  | `fueL3hBZjLLLJHiFH9cqZoozTG3XQZ53diwFPwbzNim`   |
| Food (cibo)          | `foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG`    |
| Ammo (munizioni)     | `ammoK8AkX2wnebQb35cDAZtTkvsXQbi82cGeTnUvvfK`    |
| Toolkit (strumenti)  | `tooLsNYLiVqzg8o4m3L2Uetbn62mvMWRqkog6PQeYKL`    |

---

## Esempi di Utilizzo

### cURL

```bash
curl -X POST https://flaresplay.xyz/api/prezzi-batch -H "Content-Type: application/json" -d '{"ricchiesta_prezzi":["SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM"]}'
{"prezzi":{"SDUsgfSZaDhhZ76U3ZgvtFiXsfnHbf2VrzYxjBZ5YbM":{"atlas":{"prezzo_buy":0.102,"prezzo_sell":0.10597777},"usdc":{"prezzo_buy":null,"prezzo_sell":null}}}}        
```

curl -X POST https://flaresplay.xyz/api/prezzi-batch -H "Content-Type: application/json" -d '{"ricchiesta_prezzi":["foodQJAztMzX1DKpLaiounNe2BDMds5RNuPC6jsNrDG"]}'

### JavaScript (fetch)

```javascript
async function getPrezzi(mintList) {
  const response = await fetch('https://portal.flaresplay.xyz/api/prezzi-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ricchiesta_prezzi: mintList })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Errore sconosciuto');
  }

  const data = await response.json();
  return data.prezzi;
}

// Utilizzo
const prezzi = await getPrezzi([
  'HzBx8PP86pyPrrboTHqPYWhxnEB5vXDHDBP8femWfGPM',
  '2iMhgB4pbdKvwJHVyitpvX5z1NBNypFonUgaSAt9dtDt'
]);

for (const [mint, info] of Object.entries(prezzi)) {
  console.log(`${mint}:`);
  console.log(`  ATLAS — Buy: ${info.atlas.prezzo_buy ?? '-'} | Sell: ${info.atlas.prezzo_sell ?? '-'}`);
  console.log(`  USDC  — Buy: ${info.usdc.prezzo_buy ?? '-'} | Sell: ${info.usdc.prezzo_sell ?? '-'}`);
}
```

### Python (requests)

```python
import requests

url = "https://tuo-server.com/api/prezzi-batch"
payload = {
    "ricchiesta_prezzi": [
        "HzBx8PP86pyPrrboTHqPYWhxnEB5vXDHDBP8femWfGPM",
        "2iMhgB4pbdKvwJHVyitpvX5z1NBNypFonUgaSAt9dtDt"
    ]
}

response = requests.post(url, json=payload)
response.raise_for_status()

prezzi = response.json()["prezzi"]

for mint, info in prezzi.items():
    atlas = info["atlas"]
    usdc = info["usdc"]
    print(f"{mint}:")
    print(f"  ATLAS — Buy={atlas['prezzo_buy']} | Sell={atlas['prezzo_sell']}")
    print(f"  USDC  — Buy={usdc['prezzo_buy']} | Sell={usdc['prezzo_sell']}")
```

### Node.js (axios)

```javascript
const axios = require('axios');

async function getPrezzi(mintList) {
  const { data } = await axios.post('https://tuo-server.com/api/prezzi-batch', {
    ricchiesta_prezzi: mintList
  });
  return data.prezzi;
}

// Utilizzo
getPrezzi(['HzBx8PP86pyPrrboTHqPYWhxnEB5vXDHDBP8femWfGPM'])
  .then(prezzi => console.log(prezzi));
```

---

## Caso d'Uso: Monitoraggio Prezzi Periodico

```javascript
// Controlla i prezzi ogni 60 secondi
const MINTS_DA_MONITORARE = [
  'HzBx8PP86pyPrrboTHqPYWhxnEB5vXDHDBP8femWfGPM',
  '2iMhgB4pbdKvwJHVyitpvX5z1NBNypFonUgaSAt9dtDt'
];

setInterval(async () => {
  try {
    const prezzi = await getPrezzi(MINTS_DA_MONITORARE);
    for (const [mint, info] of Object.entries(prezzi)) {
      const sellAtlas = info.atlas.prezzo_sell;
      const sellUsdc = info.usdc.prezzo_sell;
      if (sellAtlas !== null && sellAtlas < 1000) {
        console.log(`⚠️ Prezzo basso ATLAS per ${mint}: ${sellAtlas}`);
      }
      if (sellUsdc !== null && sellUsdc < 10) {
        console.log(`⚠️ Prezzo basso USDC per ${mint}: $${sellUsdc}`);
      }
    }
  } catch (err) {
    console.error('Errore monitoraggio:', err.message);
  }
}, 60000);
```

---

## Caso d'Uso: Calcolo Spread

```javascript
const prezzi = await getPrezzi(['HzBx8PP86pyPrrboTHqPYWhxnEB5vXDHDBP8femWfGPM']);
const info = prezzi['HzBx8PP86pyPrrboTHqPYWhxnEB5vXDHDBP8femWfGPM'];

// Spread in ATLAS
const a = info.atlas;
if (a.prezzo_buy !== null && a.prezzo_sell !== null) {
  const spread = a.prezzo_sell - a.prezzo_buy;
  const spreadPct = ((spread / a.prezzo_sell) * 100).toFixed(2);
  console.log(`Spread ATLAS: ${spread.toFixed(4)} (${spreadPct}%)`);
}

// Spread in USDC
const u = info.usdc;
if (u.prezzo_buy !== null && u.prezzo_sell !== null) {
  const spread = u.prezzo_sell - u.prezzo_buy;
  const spreadPct = ((spread / u.prezzo_sell) * 100).toFixed(2);
  console.log(`Spread USDC: $${spread.toFixed(4)} (${spreadPct}%)`);
}
```

---

## FAQ

### In che valute sono i prezzi?
Ogni mint restituisce prezzi in **due valute**: ATLAS e USDC. Le navi hanno tipicamente ordini in ATLAS, le risorse (food, ammo, fuel) in USDC.

### Cosa succede se passo più di 50 mint?
L'array viene troncato a 50 elementi. I mint oltre il 50° vengono ignorati.

### Perché un prezzo è `null`?
Significa che non ci sono ordini aperti di quel tipo (buy o sell) **in quella valuta** sul marketplace per quel mint. L'asset potrebbe non essere scambiato in quella valuta. Controlla l'altra valuta.

### Quanto sono aggiornati i prezzi?
I dati vengono letti direttamente dalla blockchain Solana (ordini on-chain). C'è una cache di 30 secondi, quindi nel caso peggiore i dati hanno al massimo 30 secondi di ritardo.

### Posso usare l'endpoint senza autenticazione?
Sì, l'endpoint non richiede autenticazione. Tuttavia è consigliato rispettare un uso ragionevole per non sovraccaricare il server.
