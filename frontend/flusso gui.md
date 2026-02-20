## SPIEGAZIONE DEL FLUSSO DELLA GUI

# PRIMA SCHERMATA (Landing):
- Titolo grande: **"Star Atlas Explorer"**
- Sottotitolo: **"powered by the people"** (tutto maiuscolo nel frontend)
- Due bottoni centrali:
	- **Connect Wallet** (`id="connectWalletBtn"`)
	- **Enter No Wallet** (`id="enterNoWalletBtn"`)
- Nessun altro elemento visibile (sidebar, form, risultati nascosti)
- Sidebar (`id="sidebar"`) nascosta (`display: none`)
- Container principale (`id="mainContainer"`) nascosto

**Riferimenti tecnici:**
- Struttura HTML: [frontend/index.html](frontend/index.html#L6-L44)
- Logica visibilità bottoni/schermata: [frontend/src/main.ts](frontend/src/main.ts#L61-L126)


# SECONDA SCHERMATA - Enter No Wallet:
- Titolo e sottotitolo restano visibili in alto
- Mostra una **textbox** per inserire il Profile ID (`id="profileId"`)
- Mostra un **pulsante Analyze** (`id="analyzeBtn"`)
- Sidebar sempre **nascosta** (`setSidebarVisible(false)`)
- Nessuna lista di profili, nessun walletpubkey
- Al click su Analyze:
	- Se il campo è vuoto: mostra alert "Inserisci un Player Profile ID!"
	- Se compilato: parte la richiesta, mostra loader e poi i risultati
- I risultati vengono visualizzati nella sezione centrale (`id="results"`)

**Riferimenti tecnici:**
- Gestione analyze: [frontend/src/services/api.ts](frontend/src/services/api.ts#L133-L240)
- Alert su campo vuoto: [frontend/src/services/api.ts](frontend/src/services/api.ts#L137-L138)
- Sidebar nascosta: [frontend/src/ui/sidebar.ts](frontend/src/ui/sidebar.ts#L3-L13)


# SECONDA SCHERMATA - Connect Wallet:
- Durante la connessione:
	- La pagina resta invariata.
- Dopo la connessione e risposta backend:
    bottoni centrali scompaiono, titolo e sottotitolo restano visibili.
	- Card minimale con elenco visibile mostra:
		- **walletpubkey** (testo, es. `sidebarProfileId`)
		- **Lista dei profileid** ritornati dal backend (aggiungere lista se non presente)
		- Ultima voce: **"digita profilo"** (per inserimento manuale, porta alla seconda schermata "Enter No Wallet")
	- Selezione di un profileid aggiorna la view centrale
	- Se nessun profileid disponibile, invita a digitare manualmente
- Il resto della pagina resta invariato

**Riferimenti tecnici:**
- Logica connessione wallet: [frontend/src/services/wallet.ts](frontend/src/services/wallet.ts#L1-L60)
- Aggiornamento sidebar: [frontend/src/main.ts](frontend/src/main.ts#L77-L99)
- Visualizzazione walletpubkey: [frontend/index.html](frontend/index.html#L34-L36)
- (TODO) Lista profileid: da implementare, suggerito in [frontend/flusso gui.md](frontend/flusso%20gui.md)


# TERZA SCHERMATA - Visualizzazione risultati:
- Sidebar visibile mostra:
	- **walletpubkey** (se connesso)
	- **profileid**
- Sezione centrale (`id="results"`):
	- Mostra dati analizzati, breakdown, grafici, tabelle
	- Mostra loader/progresso durante l'analisi
- La struttura della pagina non cambia, solo i contenuti centrali si aggiornano

**Riferimenti tecnici:**
- Visualizzazione risultati: [frontend/src/results-display.ts](frontend/src/results-display.ts#L1-L285)
- Sidebar/profileid: [frontend/index.html](frontend/index.html#L34-L36)
- Gestione sidebar: [frontend/src/ui/sidebar.ts](frontend/src/ui/sidebar.ts#L3-L13)

---

## NOTE TECNICHE PER UNIFORMITÀ FRONTEND

- Usare sempre gli stessi `id` e classi CSS per elementi chiave (`connectWalletBtn`, `enterNoWalletBtn`, `sidebar`, `mainContainer`, `profileId`, `analyzeBtn`, `results`)
- Sidebar deve essere gestita tramite `setSidebarVisible(true/false)`
- La lista dei profileid dopo login wallet va implementata se mancante
- Il campo manuale "digita profilo" deve essere sempre disponibile come fallback
- I risultati devono essere sempre centrali, sidebar solo informativa
- Loader, errori e messaggi devono essere visibili e chiari

**Riferimenti tecnici generali:**
- Sidebar: [frontend/src/ui/sidebar.ts](frontend/src/ui/sidebar.ts)
- Main container/results: [frontend/index.html](frontend/index.html#L47-L49)
- Loader/error: [frontend/src/results-display.ts](frontend/src/results-display.ts#L1-L285), [frontend/src/services/api.ts](frontend/src/services/api.ts#L133-L240)