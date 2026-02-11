use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0xac41643f1fd03947")]
pub struct RemoveKeys {
    pub key_index: u16,
    pub keys_to_remove: [u16; 2],
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct RemoveKeysInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub key: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for RemoveKeys {
    type ArrangedAccounts = RemoveKeysInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let key = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;

        Some(RemoveKeysInstructionAccounts {
            funder,
            key,
            profile,
            system_program,
        })
    }
}
