                        # Analisi `star-atlas-decoders-main` per normalizzazione dati `resources`

## Obiettivo

Valutare cosa offre la repo ufficiale `star-atlas-decoders-main` per interpretare meglio i flussi materiali (`resourceFlows`) e costruire una normalizzazione robusta da identificativi on-chain (`mint`, account id, indici ingredienti) a nomi/simboli leggibili.

## Scope analizzato

- Repo ufficiale: `star-atlas-decoders-main`
  - Decoder: `sage-starbased-decoder`, `sage-holosim-decoder`, `cargo-decoder`, `crafting-decoder`
  - IDL: `idl/SAGE2...`, `idl/SAgEe...`
  - Meta schema: `docs/schema_reference.json`
- Repo locale SAE:
  - `src/utils/resources_analyses.ts`
  - `frontend/src/ui/elements/resource_playload.ts`

## Cosa è utile nei decoder ufficiali

### 1) Fonti ufficiali identità risorsa (`mint -> nome`)

1. `MineItem` (SAGE)
   - File: `carbon-decoders/sage-starbased-decoder/src/accounts/mine_item.rs`
   - File: `carbon-decoders/sage-holosim-decoder/src/accounts/mine_item.rs`
   - Campi chiave:
     - `name: [u8; 64]`
     - `mint: Pubkey`
   - Valore pratico: è la fonte on-chain più importante per legare un mint a un nome materiale.

2. `RegisterMineItemInput` (SAGE)
   - File: `.../types/register_mine_item_input.rs`
   - Campo: `name: Vec<u8>`
   - Valore pratico: il nome materiale viene registrato esplicitamente a livello istruzione.

3. `Game.mints` (SAGE)
   - File: `.../accounts/game.rs`
   - Tipo: `Mints` in `.../types/mints.rs`
   - Campi: `atlas`, `polis`, `ammo`, `food`, `fuel`, `repair_kit`
   - Valore pratico: alias ufficiali per token core del gioco.

4. `CargoType` (Cargo)
   - File: `carbon-decoders/cargo-decoder/src/accounts/cargo_type.rs`
   - Campo chiave: `mint: Pubkey`
   - Valore pratico: join stabile da `cargo_type` account a token mint.

5. `Recipe` / `RecipeInputsOutputs` (Crafting)
   - File: `carbon-decoders/crafting-decoder/src/accounts/recipe.rs`
   - File: `carbon-decoders/crafting-decoder/src/types/recipe_inputs_outputs.rs`
   - Campi chiave: `recipe_items[]` con `amount` + `mint`
   - Valore pratico: mappa ufficiale ingredienti/output per ricette.

6. `CraftableItem`
   - File: `carbon-decoders/crafting-decoder/src/accounts/craftable_item.rs`
   - Campo: `mint: Pubkey`
   - Valore pratico: output craftabile legato direttamente a mint.

### 2) Fonti utili per quantificare In/Out

Le istruzioni SAGE/Cargo esponogono spesso `amount` e/o `token_mint`.

Esempi rilevanti:

- `DepositCargoToFleetInput.amount`
  - `sage-starbased-decoder/src/types/deposit_cargo_to_fleet_input.rs`
- `WithdrawCargoFromFleetInput.amount`
  - `.../withdraw_cargo_from_fleet_input.rs`
- `TransferCargoWithinFleetInput.amount`
  - `.../transfer_cargo_within_fleet_input.rs`
- `StarbaseDepositCraftingIngredientInput.amount`
  - `.../starbase_deposit_crafting_ingredient_input.rs`
- `StarbaseWithdrawCraftingIngredientInput.amount`
  - `.../starbase_withdraw_crafting_ingredient_input.rs`
- `AddCargo.cargo_amount` / `RemoveCargo.cargo_amount`
  - `cargo-decoder/src/instructions/add_cargo.rs`
  - `cargo-decoder/src/instructions/remove_cargo.rs`

Istruzioni con `ingredient_index` (quantità derivabile da ricetta + processo):

- `BurnCraftingConsumables` (`IngredientIndexInput`)
- `ClaimCraftingOutputs` (`IngredientIndexInput`)
- `BurnConsumableIngredientInput` e `ClaimRecipeOutputInput` nel decoder crafting

Per questi casi la quantità effettiva non è tutta nel payload istruzione: va risolta usando `recipe_items[ingredient_index]` e, quando applicabile, `crafting_process.quantity`.

### 3) Join account-level utili alla normalizzazione

Pattern ripetuto nelle istruzioni:

- `token_mint` presente in molte istruzioni SAGE (confermato anche dagli IDL)
- `cargo_type` + `cargo_stats_definition` per contesto cargo
- `mine_item` e `resource` per contesto mining
- `crafting_recipe`, `craftable_item`, `crafting_process` per contesto crafting

Questi riferimenti consentono una risoluzione deterministica anche quando il nome non è già disponibile nel payload aggregato.

## Limiti della repo ufficiale (importante)

1. Non c’è un catalogo globale pronto `mint -> {name, symbol, decimals}` per tutte le risorse.
2. Il dominio SAGE fornisce nomi (`MineItem.name`) ma non sempre un simbolo breve standard.
3. La semantica business “In vs Out” finale dipende dal tuo punto di vista (fleet/wallet/starbase) e va definita nel tuo layer applicativo.

Conclusione: i decoder sono eccellenti come SSOT strutturale, ma la normalizzazione human-friendly completa richiede un resolver applicativo.

## Stato attuale SAE (gap)

Da `src/utils/resources_analyses.ts`:

- `MATERIAL_REGISTRY` è statico e contiene solo 3 mint (`Food`, `Hydrogen`, `Ammo`).
- Fallback corrente: `Token ${mint.substring(0, 8)}...`.
- `decodeResources()` aggrega principalmente da token deltas (`pre/postTokenBalances`) e owner account.

Impatti:

- copertura nomi incompleta;
- simboli incoerenti per mint non noti;
- qualità del labeling dipendente da hardcode manuale.

## Strategia consigliata di normalizzazione (ordine di priorità)

Implementare un resolver con priorità deterministica:

1. **Cache locale consolidata** (lookup O(1))
   - chiave: `mint`
   - valore: `{ name, symbol, category, decimals?, source, confidence }`

2. **Token core da `Game.mints`**
   - se il mint coincide con uno dei campi ufficiali (`food`, `fuel`, `ammo`, `atlas`, `polis`, `repair_kit`), usare alias canonico.

3. **Lookup `MineItem`**
   - risalire `mine_item -> mint + name`.
   - decodifica nome bytes: trim dei null byte e UTF-8 safe.

4. **Lookup `CargoType`**
   - risalire `cargo_type -> mint` quando l’istruzione porta solo account cargo.

5. **Lookup ricetta crafting**
   - `recipe.recipe_items[i].mint` e `amount` tramite `ingredient_index`.
   - output craft da `craftable_item.mint`.

6. **Fallback controllato**
   - nome: `Token <mint_prefix>`
   - simbolo: `<mint_prefix_4>`
   - `confidence: low`

## Mappatura quantità consigliata per `resourceFlows`

Regole pratiche:

- Se esiste `input.amount` o `cargo_amount`: usare quello come quantità primaria.
- Se c’è solo `ingredient_index`:
  - leggere `recipe_items[ingredient_index].amount`
  - moltiplicare per `crafting_process.quantity` quando l’operazione è batch
  - usare deltas token come validazione/backup.
- Per transfer interni (`transfer_cargo_within_fleet`) non conteggiare come produzione/consumo globale, ma come movimento interno.

## Proposta di struttura dati `MaterialIdentity`

```ts
type MaterialIdentity = {
  mint: string;
  name: string;
  symbol: string;
  category: 'consumable' | 'fuel' | 'crafting' | 'unknown';
  decimals?: number;
  source: 'game_mints' | 'mine_item' | 'cargo_type' | 'recipe' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
  updatedAt: number;
};
```

## Piano operativo minimo (MVP)

1. Estrarre/aggiornare registry dinamico durante `decodeResources()`:
   - popolamento da `Game.mints` e `MineItem`.
2. Sostituire `getMaterialInfo()` con resolver multi-sorgente.
3. Iniettare `source`/`confidence` dentro `byMaterial[mint]`.
4. Tenere fallback attuale solo come ultima opzione.

## Rischi da gestire

- **Mainnet vs Atlasnet**: non mescolare mapping tra ambienti (`SAGE2...` vs `SAgEe...`).
- **Name bytes non puliti**: possibile presenza di byte null / padding.
- **Decimali non uniformi**: in assenza di metadata, i deltas vanno trattati con attenzione.
- **Ingredient index invalidi**: validare bounds su `recipe_items`.

## Conclusione

La repo ufficiale fornisce tutto il necessario per una normalizzazione affidabile basata su identificativi on-chain, ma non offre un catalogo umano completo pronto all’uso. La combinazione migliore per SAE è:

- decoder ufficiali come SSOT strutturale,
- resolver locale multi-sorgente con cache,
- fallback sintetico solo per casi non risolti.

Questo approccio consente di passare da labeling statico/manuale a labeling deterministico e scalabile per `resourceFlows.byMaterial`.
