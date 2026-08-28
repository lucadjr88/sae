resolver wallet pubkey

Obiettivo: permettere l'inserimento manuale di un Wallet Public Key oltre al Player Profile ID, ricavando il profilo associato prima di avviare l'analisi.

File coinvolti:
- `/home/luca/sae/frontend/src/ui/elements/manualLogin.ts`: definisce il campo di input manuale e il placeholder `Player Profile ID`.
- `/home/luca/sae/frontend/src/hompage.ts`: gestisce il submit manuale e risolve l'input wallet prima di salvare la cache locale e chiamare l'analisi.
- `/home/luca/sae/frontend/src/services/api.ts`: contiene il fallback aggiuntivo durante `analyzeFees`, nel caso la prima analisi fallisca o restituisca un payload vuoto.
- `/home/luca/sae/src/analysis/debug/playerProfileId.ts`: espone l'endpoint locale usato per la risoluzione wallet.
- `/home/luca/sae/src/utils/derivePlayerProfilePDA.ts`: cerca on-chain gli account del programma Player Profile che contengono la wallet.

Flusso:
1. Il submit manuale chiama `/api/debug/player-profile-id?wallet=<input>`.
2. Il backend converte l'input in `PublicKey` e usa `findPlayerProfilesForWalletWithRpc` per cercare i profili associati tramite `getProgramAccounts` e filtro `memcmp` all'offset 30.
3. Se trova un profilo, il frontend usa il relativo `profileId`; altrimenti mantiene l'input originale per consentire il normale inserimento di un Player Profile ID.
4. Solo il `profileId` risolto viene salvato nella cache locale `recentProfileIds` e passato a `/api/analyze-profile`.
5. Il backend gestisce quindi la cache su `cache/<profileId>/`, non su `cache/<walletPubKey>/`.
6. `analyzeFees` ripete la risoluzione come rete di sicurezza se la prima richiesta fallisce oppure restituisce un payload senza dati.

Note:
- La risoluzione usa l'endpoint locale dell'applicazione, che interroga RPC Solana tramite il resolver esistente.
- Una wallet può avere più profili; il flusso manuale seleziona il primo `profileId` restituito.
- Se l'input non è una `PublicKey` valida, la chiamata di risoluzione fallisce e l'input viene trattato come `profileId`.