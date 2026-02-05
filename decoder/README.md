# Decoder Standalone per new sae

Questa cartella contiene un decoder Rust per estrarre le fleets associate a un profileId Star Atlas.

## Build

Posizionati nella cartella `decoder` e lancia:

```
cargo build --release
```

## Uso

```
target/release/decode_fleets <PROFILE_ID>
```

Restituisce un JSON con le fleets associate.

## Dipendenze
- carbon-player-profile-decoder
- solana-client
- solana-sdk

Assicurati di avere Rust installato e accesso a internet per il fetch RPC.
