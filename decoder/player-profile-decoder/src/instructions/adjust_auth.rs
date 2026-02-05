use super::super::types::*;

use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0x06feb1576f480cd3")]
pub struct AdjustAuth {
    pub auth_indexes: Vec<u16>,
    pub new_key_permissions: Vec<AddKeyInput>,
    pub remove_range: [u16; 2],
    pub new_key_threshold: u8,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct AdjustAuthInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for AdjustAuth {
    type ArrangedAccounts = AdjustAuthInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;

        Some(AdjustAuthInstructionAccounts {
            funder,
            profile,
            system_program,
        })
    }
}
