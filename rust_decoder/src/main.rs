use std::env;
use std::str::FromStr;
use serde_json::json;

use solana_account::Account as SolAccount;
use solana_pubkey::Pubkey;
use solana_instruction::Instruction;

// Account decoders
use carbon_crafting_decoder::accounts::CraftingAccount;
use carbon_crafting_decoder::CraftingDecoder;

// Instruction decoders
use carbon_crafting_decoder::instructions::CraftingInstruction;
use carbon_sage_starbased_decoder::instructions::SageInstruction as StarbasedInstruction;
use carbon_sage_starbased_decoder::SageDecoder as SageStarbasedDecoder;
use carbon_sage_holosim_decoder::SageDecoder as SageHolosimDecoder;

// Core traits
use carbon_core::account::AccountDecoder;
use carbon_core::instruction::InstructionDecoder;

fn hex_to_bytes(s: &str) -> Option<Vec<u8>> {
    let mut hex = s.trim();
    if hex.starts_with("0x") {
        hex = &hex[2..];
    }
    if hex.len() % 2 != 0 { return None; }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i+2], 16).ok())
        .collect()
}

/// Helper to extract discriminator from first 8 bytes of data
fn extract_discriminator(data: &[u8]) -> Option<[u8; 8]> {
    if data.len() < 8 {
        return None;
    }
    let mut disc = [0u8; 8];
    disc.copy_from_slice(&data[0..8]);
    Some(disc)
}

/// Decode a Crafting account (account-only operation)
fn decode_crafting_account(data: &[u8]) -> serde_json::Value {
    let acc = SolAccount {
        lamports: 0,
        data: data.to_vec(),
        owner: Pubkey::new_from_array([0u8; 32]),
        executable: false,
        rent_epoch: 0,
    };
    let decoder = CraftingDecoder;
    match decoder.decode_account(&acc) {
        Some(d) => {
            match d.data {
                CraftingAccount::CraftableItem(i) => {
                    json!({"kind":"CraftableItem","program":"Crafting","value":i})
                },
                CraftingAccount::CraftingFacility(f) => {
                    json!({"kind":"CraftingFacility","program":"Crafting","value":f})
                },
                CraftingAccount::CraftingProcess(p) => {
                    json!({"kind":"CraftingProcess","program":"Crafting","value":p})
                },
                CraftingAccount::Domain(dv) => {
                    json!({"kind":"Domain","program":"Crafting","value":dv})
                },
                CraftingAccount::Recipe(r) => {
                    json!({"kind":"Recipe","program":"Crafting","value":r})
                },
                CraftingAccount::RecipeCategory(rc) => {
                    json!({"kind":"RecipeCategory","program":"Crafting","value":rc})
                },
            }
        }
        None => json!({"decoded":null,"program":"Crafting"})
    }
}

/// Decode a SAGE instruction from hex-encoded Instruction struct
fn decode_sage_instruction(hex: &str) -> serde_json::Value {
    // Try to parse as JSON first (for cases where instruction is serialized as JSON)
    if let Ok(instr_obj) = serde_json::from_str::<serde_json::Value>(hex) {
        if let Some(program_id) = instr_obj.get("programId").and_then(|v| v.as_str()) {
            let decoder = SageStarbasedDecoder;
            // The actual instruction data should be available in the object
            // For now, return a structured response
            return json!({
                "kind": "SageInstruction",
                "program": "Sage-Starbased",
                "programId": program_id,
                "parsed": true,
                "value": instr_obj
            });
        }
    }
    
    // Fallback: return unknown
    json!({"decoded":null,"program":"Unknown","error":"Invalid instruction format"})
}

/// Decodes an array of SAGE instructions passed as a JSON string
fn decode_composite_instructions(instructions_json: &str) -> serde_json::Value {
    let v: serde_json::Value = serde_json::from_str(instructions_json).unwrap_or(json!([]));
    let mut decoded_results = Vec::new();
    let starbased_decoder = SageStarbasedDecoder;
    let holosim_decoder = SageHolosimDecoder;

    if let Some(ix_list) = v.as_array() {
        for ix_val in ix_list {
            let program_id_str = ix_val["programId"].as_str().unwrap_or("");
            let data_hex = ix_val["data"].as_str().unwrap_or("");
            
            if let (Ok(program_id), Some(data)) = (Pubkey::from_str(program_id_str), hex_to_bytes(data_hex)) {
                let solana_ix = Instruction {
                    program_id,
                    accounts: vec![], 
                    data,
                };

                let mut decoded_val = None;

                if program_id_str == "SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE" {
                    if let Some(decoded) = starbased_decoder.decode_instruction(&solana_ix) {
                        let data_val = serde_json::to_value(&decoded.data).unwrap_or(json!({}));
                        let name = if data_val.is_string() {
                            data_val.as_str().unwrap_or("Unknown").to_string()
                        } else if data_val.is_object() {
                            data_val.as_object().unwrap().keys().next().unwrap_or(&"Unknown".to_string()).clone()
                        } else {
                            format!("{:?}", decoded.data)
                        };

                        decoded_val = Some(json!({
                            "name": name,
                            "data": decoded.data,
                            "success": true
                        }));
                    }
                } else if program_id_str == "SAGE9G967S9mYvSWS99sS99sS99sS99sS99sS99sS99" {
                    if let Some(decoded) = holosim_decoder.decode_instruction(&solana_ix) {
                        let data_val = serde_json::to_value(&decoded.data).unwrap_or(json!({}));
                        let name = if data_val.is_string() {
                            data_val.as_str().unwrap_or("Unknown").to_string()
                        } else if data_val.is_object() {
                            data_val.as_object().unwrap().keys().next().unwrap_or(&"Unknown".to_string()).clone()
                        } else {
                            format!("{:?}", decoded.data)
                        };

                        decoded_val = Some(json!({
                            "name": name,
                            "data": decoded.data,
                            "success": true
                        }));
                    }
                }

                if let Some(val) = decoded_val {
                    decoded_results.push(val);
                } else {
                    decoded_results.push(json!({"error": "Unknown or undecodable instruction", "success": false, "programId": program_id_str}));
                }
            }
        }
    }
    json!(decoded_results)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: carbon_crafting_decoder <hex-data> [--instruction] [--mode composite]");
        eprintln!("  If --instruction is not provided, decodes as account data");
        eprintln!("  If --instruction is provided, decodes as instruction data");
        eprintln!("  If --mode composite is provided, decodes an array of instructions from JSON");
        std::process::exit(2);
    }
    
    let hex = &args[1];
    
    // Check for composite mode
    if args.contains(&"--mode".to_string()) && args.contains(&"composite".to_string()) {
        let output = decode_composite_instructions(hex);
        println!("{}", serde_json::to_string_pretty(&output).unwrap());
        return;
    }

    let is_instruction = args.len() > 2 && args[2] == "--instruction";
    
    let data = match hex_to_bytes(hex) {
        Some(d) => d,
        None => { eprintln!("Invalid hex input"); std::process::exit(3); }
    };
    
    let output = if is_instruction {
        // For instructions, we'd need the full Instruction struct
        // For now, try to parse as JSON representation
        decode_sage_instruction(hex)
    } else {
        // Decode as account data
        // Try crafting decoder first
        let crafting_result = decode_crafting_account(&data);
        
        // Check if we got a meaningful result
        if crafting_result.get("decoded").is_some() || crafting_result.get("kind").is_some() {
            crafting_result
        } else {
            json!({"decoded":null,"error":"Unable to decode account"})
        }
    };
    
    println!("{}", serde_json::to_string_pretty(&output).unwrap());
}
