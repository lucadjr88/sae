#!/bin/sh

# Script: build-and-copy-srsly-decoder.sh
# Compila e copia i binari Rust necessari per il backend Node.js
# - srsly-decoder (rental-decoder)
# - decode_fleets (player-profile-decoder)
# Entrambi saranno disponibili in dist/backend/rental/

SCRIPT_DIR="$(cd -- "$(dirname "$0")" >/dev/null 2>&1 ; pwd -P)"


# ROOT_DIR deve essere la root del progetto (dove si trova questa cartella scripts)
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DECODER_DIR="$ROOT_DIR/decoder"
DIST_DIR="$ROOT_DIR/dist/backend/decoder"

echo "SCRIPT_DIR: $SCRIPT_DIR"
echo "ROOT_DIR: $ROOT_DIR"
echo "DECODER_DIR: $DECODER_DIR"
echo "DIST_DIR: $DIST_DIR"


# Compila l'intero workspace Rust (debug)
cd "$DECODER_DIR" || { echo "Errore: impossibile accedere a $DECODER_DIR"; exit 1; }
#cargo build --features serde

# Assicura che la cartella di destinazione esista
mkdir -p "$DIST_DIR"

# Copia i binari risultanti dalla build release
cp "$DECODER_DIR/target/release/srsly-decoder" "$DIST_DIR/srsly-decoder"
chmod +x "$DIST_DIR/srsly-decoder"

cp "$DECODER_DIR/target/release/decode_fleets" "$DIST_DIR/decode_fleets"
chmod +x "$DIST_DIR/decode_fleets"
