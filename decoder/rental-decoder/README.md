# Carbon SRSLY Decoder

<p align="center">
  <a href="https://crates.io/crates/carbon-srsly-decoder">
    <img src="https://img.shields.io/crates/v/carbon-srsly-decoder?logo=rust" />
  </a>
  <a href="https://docs.rs/carbon-srsly-decoder">
    <img src="https://img.shields.io/docsrs/carbon-srsly-decoder?logo=docsdotrs" />
  </a>
  <a href="https://github.com/staratlasmeta/star-atlas-decoders/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache%202.0-blue" />
  </a>
</p>

Rust decoder for the Star Atlas Fleet Rentals (SRSLY) program on Solana, generated using [Carbon CLI](https://github.com/sevenlabs-hq/carbon).

## Program Information

- **Program ID**: `SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT`
- **Network**: Solana Mainnet
- **Description**: Star Atlas Fleet Rentals (SRSLY) program for managing fleet rental contracts, rental states, and automated payment processing in the Star Atlas ecosystem.

## Features

- Decodes all SRSLY account types
- Full instruction parsing support
- Integration with Carbon indexing framework
- Support for rental contracts, fleet management, and payment automation

## Usage

Add this crate to your `Cargo.toml`:

```toml
[dependencies]
carbon-srsly-decoder = "0.12.0"
```

### Decoding Accounts

```rust
use carbon_srsly_decoder::SrslyDecoder;
use carbon_core::account::AccountDecoder;

let decoder = SrslyDecoder;
let decoded_account = decoder.decode_account(&account);

if let Some(decoded) = decoded_account {
    match decoded.data {
        SrslyAccount::ContractState(contract) => {
            println!("Contract State: {:?}", contract);
        }
        SrslyAccount::Fleet(fleet) => {
            println!("Fleet: {:?}", fleet);
        }
        SrslyAccount::RentalState(rental) => {
            println!("Rental State: {:?}", rental);
        }
        SrslyAccount::Thread(thread) => {
            println!("Thread: {:?}", thread);
        }
    }
}
```

### Account Types

This decoder supports all SRSLY account types:
- `ContractState` - Rental contract configuration and state
- `Fleet` - Fleet data for rental management
- `RentalState` - Active rental state tracking
- `Thread` - Automated payment thread data

## Documentation

Full documentation is available at [docs.rs](https://docs.rs/carbon-srsly-decoder).

## Repository

See the [main repository](https://github.com/staratlasmeta/star-atlas-decoders) for build instructions and contribution guidelines.

## License

Licensed under the [Apache-2.0](https://github.com/staratlasmeta/star-atlas-decoders/blob/main/LICENSE) license.
