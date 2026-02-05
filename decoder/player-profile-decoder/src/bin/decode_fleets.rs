
use carbon_player_profile_decoder::PlayerProfileDecoder;
use carbon_player_profile_decoder::accounts::PlayerProfileAccount;
use carbon_core::account::AccountDecoder;
use solana_client::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use serde_json::json;
use std::env;
use std::str::FromStr;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: decode_fleets <PROFILE_ID>");
        std::process::exit(1);
    }
    let profile_id = &args[1];

    // Usa endpoint mainnet o custom
    let rpc_url = "https://api.mainnet-beta.solana.com";
    let client = RpcClient::new(rpc_url.to_string());

    // Parse profileId come Pubkey
    let profile_pubkey = match Pubkey::from_str(profile_id) {
        Ok(pk) => pk,
        Err(_) => {
            eprintln!("Invalid profileId: {}", profile_id);
            std::process::exit(1);
        }
    };

    // Fetch account data
    let account = match client.get_account(&profile_pubkey) {
        Ok(acc) => acc,
        Err(e) => {
            eprintln!("Error fetching account for {}: {}", profile_id, e);
            std::process::exit(1);
        }
    };

    // Decodifica con PlayerProfileDecoder
    let decoder = PlayerProfileDecoder;
    let decoded = decoder.decode_account(&account);

    let mut fleets = vec![];
    if let Some(decoded) = decoded {
        if let PlayerProfileAccount::Profile(profile) = decoded.data {
            for key in profile.profile_keys {
                fleets.push(json!({
                    "fleet_key": key.key.to_string(),
                    "scope": key.scope.to_string(),
                    "expire_time": key.expire_time,
                    "permissions": key.permissions_as_u64(),
                }));
            }
        }
    }

    let result = json!({
        "profileId": profile_id,
        "fleets": fleets
    });
    println!("{}", result);
}
