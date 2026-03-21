use carbon_srsly_decoder::accounts::{contract_state::ContractState, fleet::Fleet, rental_state::RentalState, thread::Thread};
use std::io::{self, Read};
use serde_json::json;

fn main() {
    // Leggi tutto lo stdin come un unico buffer JSON
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap();
    let buffers: Vec<Vec<u8>> = serde_json::from_str(&input).expect("Input non valido");

    let mut results = Vec::new();
    for (i, buf) in buffers.iter().enumerate() {
        eprintln!("[LOG] Buffer {}: len={} first8={:?}", i, buf.len(), &buf[..buf.len().min(8)]);
        if let Some(cs) = ContractState::decode(buf) {
            eprintln!("[LOG] Buffer {}: decoded as ContractState", i);
            results.push(json!({"type": "ContractState", "data": cs}));
            continue;
        }
        if let Some(rs) = RentalState::decode(buf) {
            eprintln!("[LOG] Buffer {}: decoded as RentalState", i);
            results.push(json!({"type": "RentalState", "data": rs}));
            continue;
        }
        if let Some(fleet) = Fleet::decode(buf) {
            eprintln!("[LOG] Buffer {}: decoded as Fleet", i);
            results.push(json!({"type": "Fleet", "data": fleet}));
            continue;
        }
        if let Some(thread) = Thread::decode(buf) {
            eprintln!("[LOG] Buffer {}: decoded as Thread", i);
            results.push(json!({"type": "Thread", "data": thread}));
            continue;
        }
        eprintln!("[LOG] Buffer {}: decode failed, marked as Unknown", i);
        results.push(json!({"type": "Unknown", "data": base64::encode(buf)}));
    }
    println!("{}", serde_json::to_string(&results).unwrap());
}
