# Carbon Player Profile Decoder

<p align="center">
  <a href="https://crates.io/crates/carbon-player-profile-decoder">
    <img src="https://img.shields.io/crates/v/carbon-player-profile-decoder?logo=rust" />
  </a>
  <a href="https://docs.rs/carbon-player-profile-decoder">
    <img src="https://img.shields.io/docsrs/carbon-player-profile-decoder?logo=docsdotrs" />
  </a>
  <a href="https://github.com/staratlasmeta/star-atlas-decoders/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache%202.0-blue" />
  </a>
</p>

Rust decoder for the Star Atlas Player Profile program on Solana, generated using [Carbon CLI](https://github.com/sevenlabs-hq/carbon).

## Program Information

- **Program ID**: `pprofELXjL5Kck7Jn5hCpwAL82DpTkSYBENzahVtbc9`
- **Network**: Solana Mainnet
- **Description**: Star Atlas Player Profile program for managing player identities, permissions, and role-based access control within the Star Atlas ecosystem.

## Features

- Decodes all Player Profile account types
- Full instruction parsing support
- Integration with Carbon indexing framework
- Permission bitflags support for ergonomic permission checking
- Helper methods for key expiration and authorization checks

## Usage

Add this crate to your `Cargo.toml`:

```toml
[dependencies]
carbon-player-profile-decoder = "0.10.0"
```

### Decoding Accounts

```rust
use carbon_player_profile_decoder::{PlayerProfileDecoder, PlayerProfileAccount};
use carbon_core::account::AccountDecoder;

let decoder = PlayerProfileDecoder;
let decoded_account = decoder.decode_account(&account);

if let Some(decoded) = decoded_account {
    match decoded.data {
        PlayerProfileAccount::Profile(profile) => {
            println!("Profile has {} keys", profile.profile_keys.len());
            for key in &profile.profile_keys {
                println!("  Key: {}, Scope: {}", key.key, key.scope);
            }
        }
        PlayerProfileAccount::PlayerName(player_name) => {
            let name_str = String::from_utf8_lossy(&player_name.name);
            println!("Player Name: {}", name_str);
        }
        PlayerProfileAccount::Role(role) => {
            println!("Role has {} members", role.members.len());
            for member in &role.members {
                println!("  Member: {}", member.key);
            }
        }
        PlayerProfileAccount::ProfileRoleMembership(membership) => {
            println!("Profile has {} role memberships", membership.memberships.len());
        }
    }
}
```

### Decoding Instructions

The decoder supports parsing all Player Profile instructions with full account resolution:

```rust
use carbon_player_profile_decoder::{PlayerProfileDecoder, PlayerProfileInstruction};
use carbon_core::instruction::InstructionDecoder;

let decoder = PlayerProfileDecoder;
let decoded_ix = decoder.decode_instruction(&instruction);

if let Some(decoded) = decoded_ix {
    match decoded.data {
        PlayerProfileInstruction::AddKeys(add_keys) => {
            println!("Adding {} keys to profile", add_keys.keys_to_add.len());

            // Access the instruction data (permissions)
            for (i, key_input) in add_keys.keys_to_add.iter().enumerate() {
                println!("  Key {}: scope={}, expire={}",
                    i, key_input.scope, key_input.expire_time);
            }

            // Access the actual account pubkeys being added
            for (i, pubkey) in decoded.accounts.keys_to_add_accounts.iter().enumerate() {
                println!("  Account {}: {}", i, pubkey);
            }
        }
        PlayerProfileInstruction::CreateProfile(create_profile) => {
            println!("Creating profile with {} keys", create_profile.key_permissions.len());
            println!("Key threshold: {}", create_profile.key_threshold);

            // Access the initial key account pubkeys
            for pubkey in &decoded.accounts.init_keys_accounts {
                println!("  Init key: {}", pubkey);
            }
        }
        _ => {
            // Handle other instructions
        }
    }
}
```

**Note:** The `AddKeys` and `CreateProfile` instructions include both:
- **Instruction data** (`keys_to_add`, `key_permissions`) - Contains permission scopes and metadata
- **Account lists** (`keys_to_add_accounts`, `init_keys_accounts`) - Contains the actual pubkeys of the keys being added

### Working with Permissions

The decoder includes ergonomic permission handling with bitflags:

```rust
use carbon_player_profile_decoder::{ProfileKey, ProfilePermissions};

// Check if a key has specific permissions
let key: ProfileKey = /* ... */;

if key.is_auth() {
    println!("This is an auth key");
}

if key.has_permission(ProfilePermissions::ADD_KEYS) {
    println!("This key can add other keys");
}

// Check if a key has expired
let current_time = /* current unix timestamp */;
if key.is_expired(current_time) {
    println!("This key has expired");
}

// Get permission flags
let flags = key.permissions_flags();
if flags.contains(ProfilePermissions::CREATE_ROLE | ProfilePermissions::REMOVE_ROLE) {
    println!("This key can manage roles");
}
```

### Account Types

This decoder supports all Player Profile account types:
- `Profile` - Player profile with keys and metadata
- `PlayerName` - Player name registration
- `Role` - Role definition with permissions
- `ProfileRoleMembership` - Membership relationship between profiles and roles

### Account Fields (RemainingData)

All account types include dynamically-sized fields deserialized from RemainingData:

#### Profile
- `profile_keys: Vec<ProfileKey>` - List of all keys associated with this profile
  - Each key includes: public key, scope, expiration time, and permissions
  - Maximum of 65,535 keys (u16 length prefix)

#### PlayerName
- `name: Vec<u8>` - UTF-8 encoded player name bytes
  - Variable length, stored as raw bytes without length prefix
  - Example: `String::from_utf8_lossy(&player_name.name)`

#### Role
- `members: Vec<RoleMembership>` - List of all members in this role
  - Each membership includes: member key and status (Active/Inactive)
  - Maximum of 256 members (u32 length prefix, enforced by MAX_MEMBERSHIPS)

#### ProfileRoleMembership
- `memberships: Vec<RoleMembership>` - List of all roles this profile belongs to
  - Each membership includes: role key and status (Active/Inactive)
  - Maximum of 256 memberships (u32 length prefix, enforced by MAX_MEMBERSHIPS)

### Permission Flags

The `ProfilePermissions` bitflags type includes:
- `AUTH` - Auth key with full profile control
- `ADD_KEYS` - Can add non-auth keys
- `REMOVE_KEYS` - Can remove non-auth keys
- `CHANGE_NAME` - Can change player name
- `CREATE_ROLE` - Can create new roles
- `REMOVE_ROLE` - Can remove roles
- `SET_AUTHORIZER` - Can set role authorizer
- `JOIN_ROLE` - Can add profile to a role
- `LEAVE_ROLE` - Can remove profile from a role
- `TOGGLE_ACCEPTING_NEW_MEMBERS` - Can toggle accepting new members
- `ADD_MEMBER` - Can add members to roles
- `REMOVE_MEMBER` - Can remove members from roles
- `DRAIN_SOL_VAULT` - Can withdraw from SOL vault (scope-agnostic)

## Documentation

Full documentation is available at [docs.rs](https://docs.rs/carbon-player-profile-decoder).

## Repository

See the [main repository](https://github.com/staratlasmeta/star-atlas-decoders) for build instructions and contribution guidelines.

## License

Licensed under the [Apache-2.0](https://github.com/staratlasmeta/star-atlas-decoders/blob/main/LICENSE) license.
