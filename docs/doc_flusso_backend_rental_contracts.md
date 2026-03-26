# Flusso Backend: Recupero Informazioni Rental Contracts

Questo documento descrive dettagliatamente il flusso backend per ottenere le informazioni relative ai "rental contracts" all'interno del progetto. Verranno specificati i vari step di fetch, i servizi coinvolti e i principali campi ottenuti durante il processo.

---

## 1. Panoramica del Flusso

Il backend espone delle API che permettono di recuperare le informazioni sui contratti di noleggio (rental contracts). Il flusso tipico prevede:

1. **Ricezione della richiesta** da frontend/API client.
2. **Fetch dei dati** da fonti esterne (blockchain, database, cache, ecc.).
3. **Parsing e aggregazione** delle informazioni rilevanti.
4. **Restituzione della risposta** strutturata al chiamante.

---

## 2. Dettaglio Step-by-Step

### 2.1 Ricezione Richiesta

- Endpoint tipico: `/api/rental/contracts` oppure `/rentalService.getRentalContracts()`
- Parametri accettati: wallet address, fleet id, filtri opzionali (stato, data, ecc.)

### 2.2 Fetch Dati Esterni

#### a) Fetch da Blockchain/API
- **Metodo:** chiamata a servizi blockchain o API esterne per ottenere la lista dei contratti attivi/terminati.
- **Campi ottenuti:**
  - `contractId`
  - `owner`
  - `renter`
  - `fleetId`
  - `startTimestamp`
  - `endTimestamp`
  - `status` (active, ended, cancelled)
  - `terms` (fee, duration, ecc.)

#### b) Fetch da Database/Cache Locale
- **Metodo:** query su database locale o cache per arricchire i dati con informazioni aggiuntive (es. dettagli fleet, storico pagamenti).
- **Campi ottenuti:**
  - `fleetDetails` (nome, asset, ecc.)
  - `paymentHistory`
  - `rentalEvents`

### 2.3 Parsing e Aggregazione

- Unione dei dati provenienti da fonti diverse.
- Normalizzazione dei campi (es. conversione timestamp, mapping status).
- Eventuale calcolo di metriche derivate (es. durata effettiva, fee totale pagata).

### 2.4 Restituzione Risposta

- **Formato tipico:** JSON
- **Esempio di risposta:**

```json
{
  "contracts": [
    {
      "contractId": "...",
      "owner": "...",
      "renter": "...",
      "fleetId": "...",
      "fleetDetails": { ... },
      "startTimestamp": 1710000000,
      "endTimestamp": 1710500000,
      "status": "active",
      "terms": { "fee": 100, "duration": 3600 },
      "paymentHistory": [ ... ],
      "rentalEvents": [ ... ]
    }
  ]
}
```

---


## 3. Servizi, Moduli e Funzioni Coinvolte

Di seguito l'elenco dettagliato delle principali funzioni e componenti coinvolti nel recupero, aggregazione e arricchimento dei dati dei rental contracts, con nome, file e numero di riga:

- **getContracts**  
  File: `src/backend/rental/rentalService.ts`  
  Riga: 62-66  
  Funzione principale di orchestrazione per il recupero dei contratti filtrati.

- **fetchContractsOnChain**  
  File: `src/backend/rental/rentalService.ts`  
  Riga: 145-283  
  Recupera i contratti dalla blockchain e aggrega i dettagli tecnici delle flotte (crew, cargo, fuel, stats).

- **populateFleetMetadata**  
  File: `src/backend/rental/rentalService.ts`  
  Riga: 321-363  
  Arricchisce i contratti con i nomi delle flotte, composizione e starbase di riferimento.

- **populateRentalTimes**  
  File: `src/backend/rental/rentalService.ts`  
  Riga: 430-468  
  Recupera e associa i timestamp di inizio e fine noleggio (start_time, end_time) ai contratti attivi.

- **applyFilters**  
  File: `src/backend/rental/rentalService.ts`  
  Riga: 470-494  
  Applica filtri ai contratti recuperati (stato, rate, ricerca testuale).

- **[GET] /rentals/contracts**  
  File: `src/backend/routes/rental.ts`  
  Riga: 32-58  
  Endpoint API che espone i dati processati dal `RentalService`.

- **fetchProfileRentedFleets**  
  File: `src/utils/fetchProfileRentedFleets.ts`  
  Riga: 216-398  
  Funzione di utilità che recupera e aggrega i contratti di noleggio attivi (sia presi in prestito che prestati) per uno specifico profilo utente, gestendo anche il caching locale.

---

## 4. Considerazioni

- **Performance:** uso di cache locale per minimizzare i fetch ripetitivi.
- **Consistenza:** sincronizzazione periodica con la blockchain per mantenere i dati aggiornati.
- **Sicurezza:** validazione dei parametri in ingresso e gestione degli errori nelle chiamate esterne.

---

## 5. Glossario Campi Principali

- `contractId`: identificativo univoco del contratto
- `owner`: wallet address del proprietario della flotta
- `renter`: wallet address del noleggiatore
- `fleetId`: identificativo della flotta
- `fleetDetails`: dettagli della flotta (nome, asset, ecc.)
- `startTimestamp` / `endTimestamp`: inizio/fine del contratto (epoch)
- `status`: stato attuale del contratto
- `terms`: condizioni economiche e temporali
- `paymentHistory`: storico pagamenti associati
- `rentalEvents`: eventi rilevanti del contratto

---

Per ulteriori dettagli consultare il codice sorgente in `src/backend/rental/rentalService.ts` e i relativi moduli di supporto.