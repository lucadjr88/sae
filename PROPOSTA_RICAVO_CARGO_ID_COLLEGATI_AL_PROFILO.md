# Proposta: ricavo Cargo ID Starbase collegati al profilo

## Premessa (scope reale)

Assunto esplicito:

- I Cargo ID dei fleet (owned + rented) sono gia ricavati correttamente.
- Il gap attuale riguarda solo i Cargo ID legati alle Starbase.

Questa proposta copre quindi solo la parte Starbase.

## Obiettivo

Derivare un set affidabile di CargoPod Starbase collegati a un `profileId`, con stato `ACTIVE/CLOSED`, da usare insieme al set fleet/rented gia esistente.

Output atteso:

- `starbaseCargoIds` (set canonico)
- `starbaseCargoState` (lifecycle)
- metadati minimi per classificare correttamente `Port Of Entry` in/out

## Evidenze dai decoder ufficiali allegati

Riferimenti chiave usati:

- `carbon-decoders/sage-starbased-decoder/src/accounts/starbase_player.rs`
  - `player_profile`, `starbase`, `sage_player_profile`
- `carbon-decoders/sage-starbased-decoder/src/accounts/sage_player_profile.rs`
  - `player_profile`
- `carbon-decoders/sage-starbased-decoder/src/types/starbase_loading_bay.rs`
  - associa fleet <-> starbase durante loading bay
- `carbon-decoders/sage-starbased-decoder/src/instructions/create_cargo_pod.rs`
  - account `cargo_pod`
- `carbon-decoders/sage-starbased-decoder/src/instructions/remove_cargo_pod.rs`
  - account `cargo_pod`
- `carbon-decoders/sage-starbased-decoder/src/instructions/deposit_cargo_to_game.rs`
  - account `cargo_pod`
- `carbon-decoders/sage-starbased-decoder/src/instructions/withdraw_cargo_from_game.rs`
  - account `cargo_pod`
- `carbon-decoders/sage-starbased-decoder/src/instructions/transfer_cargo_at_starbase.rs`
  - account `cargo_pod_from`, `cargo_pod_to`
- `carbon-decoders/sage-starbased-decoder/src/instructions/close_starbase_cargo_token_account.rs`
  - account `cargo_pod`
- `carbon-decoders/cargo-decoder/src/accounts/cargo_pod.rs`
  - `CargoPod.authority`

## Problema tecnico preciso

Il set ownership usato oggi nel backend e orientato ai pod fleet.
Per la Starbase manca una closure dedicata su:

- authority operative Starbase (`starbase_player`, `sage_player_profile`, eventuali wallet autorizzati)
- pod creati/usati/chiusi in istruzioni Starbase
- riconciliazione account-based su `CargoPod.authority`

## Proposta tecnica (solo Starbase)

### 1) Costruire StarbaseAuthoritySet

Input:

- `profileId`
- `allowedWallets` da cache profilo
- mapping `profile -> sage_player_profile`
- mapping `profile -> starbase_player`

Regola:

- `StarbaseAuthoritySet = { allowedWallets, sage_player_profiles, starbase_players }`

Nota:

- Non include i cargo fleet/rented (gia coperti altrove).

### 2) Estrazione tx-based dei CargoPod Starbase

Scansionare tx decode SAGE e prendere CargoPod solo da istruzioni Starbase:

- `CreateCargoPod`: `cargo_pod`
- `RemoveCargoPod`: `cargo_pod`
- `DepositCargoToGame`: `cargo_pod`     // Port of Entry In
- `WithdrawCargoFromGame`: `cargo_pod`  // Port of Entry Out
- `TransferCargoAtStarbase`: `cargo_pod_from`, `cargo_pod_to`
- `CloseStarbaseCargoTokenAccount`: `cargo_pod`

Regola di accettazione tx:

- La tx e valida per il profilo se tocca almeno una authority in `StarbaseAuthoritySet`.
- Solo in quel caso i pod estratti entrano nel set Starbase.

### 3) Reconciliation account-based (necessaria)

Integrare con scansione account Cargo program:

- Decodificare tutti gli account `CargoPod` (decoder ufficiale cargo).
- Prendere `CargoPod.authority`.
- Se `authority in StarbaseAuthoritySet`, includere il pod in `starbaseCargoIds`.

Questo copre pod Starbase non apparsi nelle tx della finestra locale.

### 4) Lifecycle

Mantenere stato per ogni pod Starbase:

- `ACTIVE` quando visto in create/deposit/withdraw/transfer
- `CLOSED` quando visto in remove/close

Conservare:

- `firstSeenSlot`
- `lastSeenSlot`
- `sources` (istruzioni che lo hanno referenziato)

## Output canonico (solo Starbase)

Persistenza suggerita:

- `cache/<profileId>/cargo-ids/starbase.json`

Schema:

```json
{
  "profileId": "...",
  "generatedAt": 0,
  "starbaseAuthorities": ["..."],
  "starbaseCargoIds": ["..."],
  "starbaseCargoState": {
    "CargoPodPubkey": {
      "state": "ACTIVE",
      "firstSeenSlot": 0,
      "lastSeenSlot": 0,
      "sources": ["CreateCargoPod", "TransferCargoAtStarbase"]
    }
  }
}
```

## Integrazione con pipeline esistente

Dato che fleet/rented sono gia risolti:

1. Non toccare il modulo che ricava cargo fleet/rented.
2. Aggiungere un modulo dedicato Starbase, ad esempio:
   - `src/utils/deriveStarbaseCargoIdsForProfile.ts`
3. Eseguire il modulo dopo `fetchProfileFleets/fetchProfileRentedFleets`.
4. In `resources_analyses.ts` usare:
   - `allCargoIds = fleetCargoIds UNION starbaseCargoIds`

## Impatto su Port Of Entry

Con `starbaseCargoIds` affidabile:

- `Port Of Entry In`: delta positivo verso un cargo in `allCargoIds` da controparte esterna
- `Port Of Entry Out`: delta negativo da un cargo in `allCargoIds` verso controparte esterna
- trasferimenti tra due cargo in `allCargoIds`: interni, non Port Of Entry

## Verifiche consigliate

1. Un profilo con operazioni loading bay frequenti.
2. Coerenza cardinalita:
   - `starbaseCargoIds` non vuoto dove ci sono `CreateCargoPod`/`TransferCargoAtStarbase`.
3. Spot check su firme note:
   - presenza `starbase_player` e `cargo_pod` estratti.
4. Nessun gonfiaggio claim da movimenti interni tra pod Starbase gia noti.

## Piano implementativo minimo

1. Implementare `deriveStarbaseCargoIdsForProfile(profileId)`.
2. Salvare `cargo-ids/starbase.json`.
3. Unire set in `resources_analyses.ts` senza modificare la parte fleet/rented.
4. Validare `Port Of Entry` con almeno 2 profili reali.
