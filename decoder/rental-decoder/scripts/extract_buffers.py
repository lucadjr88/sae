import json

# Percorso del file contracts.json
CONTRACTS_PATH = "/home/luca/sae/cache/4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8/rented_contracts/contracts.json"
BUFFERS_PATH = "buffers.json"

with open(CONTRACTS_PATH) as f:
    contracts = json.load(f)

# Estrai i buffer binari (current_rental_state) da ogni contratto
buffers = [c["data"]["current_rental_state"] for c in contracts if "current_rental_state" in c["data"]]

# Salva i buffer in formato JSON pronto per lo stdin del decoder
with open(BUFFERS_PATH, "w") as f:
    json.dump(buffers, f)

print(f"Creato {BUFFERS_PATH} con {len(buffers)} buffer.")
print("Per testare il decoder:")
print("cat buffers.json | cargo run --bin srsly-decoder")
