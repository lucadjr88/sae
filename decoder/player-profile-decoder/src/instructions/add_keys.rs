use super::super::types::*;

use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0x9ae110b0924c4e69")]
pub struct AddKeys {
    pub key_add_index: u16,
    pub key_permissions_index: u16,
    pub keys_to_add: Vec<AddKeyInput>,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct AddKeysInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub key: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
    pub keys_to_add_accounts: Vec<solana_pubkey::Pubkey>,
}

impl carbon_core::deserialize::ArrangeAccounts for AddKeys {
    type ArrangedAccounts = AddKeysInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let key = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;

        // Collect remaining accounts (the actual keys being added to the profile)
        let keys_to_add_accounts = iter.map(|acc| acc.pubkey).collect();

        Some(AddKeysInstructionAccounts {
            funder,
            key,
            profile,
            system_program,
            keys_to_add_accounts,
        })
    }
}
