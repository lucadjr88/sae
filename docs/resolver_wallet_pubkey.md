# Allineamento app: input Player Profile ID / Wallet Public Key

## Obiettivo

Replicare nell'app il comportamento del frontend web per un unico campo manuale e un unico comando `Analyze`.

L'utente inserisce un indirizzo Solana. L'app determina automaticamente se e' un Player Profile ID tramite la fazione associata. Solo quando non esiste una fazione associata, l'input viene trattato come Wallet Public Key e viene presentata la lista dei profili disponibili.

## Flusso UI

1. L'utente inserisce il valore e seleziona `Analyze`.
2. L'app invia `GET /api/debug/profile-faction?profileId=<input>`.
3. Se la risposta contiene `profileFaction` non nullo:
	 - l'input e' un Player Profile ID;
	 - avvia direttamente l'analisi con quell'ID;
	 - opzionalmente salva la fazione nella cache locale dell'app.
4. Se `profileFaction` e' nullo, oppure la richiesta fallisce:
	 - l'input e' trattato come Wallet Public Key;
	 - invia `GET /api/debug/player-profile-id?wallet=<input>`;
	 - mostra tutti gli elementi di `variants` con `profileId` valorizzato.
5. Quando l'utente seleziona un profilo dalla lista, avvia l'analisi usando il `profileId` selezionato.

Nel flusso manuale, la lista profili non deve mostrare l'header, l'icona o la chiave `Wallet Connected`. Questi elementi restano esclusivi del flusso di connessione wallet reale.

## Contratti API

### Rilevamento fazione

`GET /api/debug/profile-faction?profileId=<base58>`

Risposta:

```json
{
	"profileFactionAccount": "<base58>|null",
	"profileFactionId": 1,
	"profileFaction": "mud"
}
```

Valori possibili di `profileFaction`: `mud`, `oni`, `ustur`, `unaligned`, `null`.

La condizione per avviare direttamente l'analisi e' esclusivamente `profileFaction !== null`.

### Risoluzione wallet

`GET /api/debug/player-profile-id?wallet=<base58>`

Risposta:

```json
{
	"wallet": "<base58>",
	"variants": [
		{
			"profileId": "<base58>",
			"profileFaction": "mud",
			"profileFactionId": 1,
			"profileFactionAccount": "<base58>"
		}
	]
}
```

Filtrare la lista su `variant.profileId` non vuoto. La risposta puo' contenere piu' profili: non selezionare automaticamente il primo.

### Avvio analisi

`POST /api/analyze-profile`

```json
{
	"profileId": "<profile-id>",
	"wipeCache": false
}
```

Inviare sempre il Player Profile ID selezionato o rilevato, mai il Wallet Public Key. La risposta puo' restituire il `profileId` canonico: usare quello per cache e stato dell'app.

## Riferimenti web

- `frontend/src/hompage.ts`: routing dell'input manuale e rendering lista.
- `frontend/src/services/api.ts`: chiamata `POST /api/analyze-profile`.
- `src/analysis/debug/index.ts`: route `GET /api/debug/profile-faction`.
- `src/analysis/debug/playerProfileId.ts`: route `GET /api/debug/player-profile-id`.
- `src/utils/getProfileFaction.ts`: sorgente della verita' per il rilevamento della fazione.