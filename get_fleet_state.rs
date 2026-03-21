// Script Rust minimale per recuperare e salvare lo stato di una fleet dato un fleet id
// Usa le stesse dipendenze e logica del decoder-explorer

use std::env;
use std::fs::File;
use std::io::{Read, Write};
use anyhow::{Context, Result};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{pubkey::Pubkey, account::Account};
use carbon_sage_starbased_decoder::{SageDecoder, accounts::SageAccount};
use carbon_core::account::AccountDecoder;
use serde_json::{Value, json};

fn main() -> Result<()> {
    // Parametri: <RPC_URL> <CONTRACTS_PATH>
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        eprintln!("Usage: {} <RPC_URL> <CONTRACTS_PATH>", args[0]);
        std::process::exit(1);
    }
    let rpc_url = &args[1];
    let contracts_path = &args[2];

    // Leggi contracts.json
    let mut file = File::open(contracts_path).context("Impossibile aprire contracts.json")?;
    let mut data = String::new();
    file.read_to_string(&mut data).context("Impossibile leggere contracts.json")?;
    let mut contracts: Vec<Value> = serde_json::from_str(&data).context("Formato JSON non valido")?;

    // Inizializza client
    let client = RpcClient::new(rpc_url.clone());
    let decoder = SageDecoder;

    // Per ogni contratto, arricchisci con fleet_data
    for contract in contracts.iter_mut() {
        if let Some(fleet_id) = contract.get("fleet").and_then(|v| v.as_str()) {
            if let Ok(fleet_pubkey) = Pubkey::from_str(fleet_id) {
                match client.get_account(&fleet_pubkey) {
                    Ok(account) => {
                        match decoder.decode_account(&account) {
                            Ok(decoded) => {
                                if let SageAccount::Fleet(fleet) = decoded.data {
                                    // Inserisci i dati della fleet come oggetto JSON
                                    if let Ok(fleet_json) = serde_json::to_value(&fleet) {
                                        contract["fleet_data"] = fleet_json;
                                    } else {
                                        contract["fleet_data"] = json!({"error": "Serializzazione fleet fallita"});
                                    }
                                } else {
                                    contract["fleet_data"] = json!({"error": "Account non è una Fleet"});
                                }
                            }
                            Err(e) => {
                                contract["fleet_data"] = json!({"error": format!("Decodifica fallita: {}", e)});
                            }
                        }
                    }
                    Err(e) => {
                        contract["fleet_data"] = json!({"error": format!("Account non trovato: {}", e)});
                    }
                }
            } else {
                contract["fleet_data"] = json!({"error": "Fleet id non valido"});
            }
        } else {
            contract["fleet_data"] = json!({"error": "Fleet id mancante"});
        }
    }

    // Sovrascrivi lo stesso file con il payload arricchito
    let mut file = File::create(contracts_path).context("Impossibile scrivere contracts.json")?;
    let enriched = serde_json::to_string_pretty(&contracts)?;
    file.write_all(enriched.as_bytes())?;
    println!("contracts.json arricchito con i dati delle fleet.");
    Ok(())
}
