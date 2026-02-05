use super::super::types::*;

use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0xe1cdea8f11ba32dc")]
pub struct CreateProfile {
    pub key_permissions: Vec<AddKeyInput>,
    pub key_threshold: u8,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct CreateProfileInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
    pub init_keys_accounts: Vec<solana_pubkey::Pubkey>,
}

impl carbon_core::deserialize::ArrangeAccounts for CreateProfile {
    type ArrangedAccounts = CreateProfileInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;

        // Collect remaining accounts (the initial keys being added to the new profile)
        let init_keys_accounts = iter.map(|acc| acc.pubkey).collect();

        Some(CreateProfileInstructionAccounts {
            funder,
            profile,
            system_program,
            init_keys_accounts,
        })
    }
}
