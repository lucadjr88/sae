use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0x4a45a8a3f8038200")]
pub struct RemoveRole {
    pub role_name_bump: u8,
    pub key_index: u16,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct RemoveRoleInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub role_account: solana_pubkey::Pubkey,
    pub role_name_account: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for RemoveRole {
    type ArrangedAccounts = RemoveRoleInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let role_account = next_account(&mut iter)?;
        let role_name_account = next_account(&mut iter)?;

        Some(RemoveRoleInstructionAccounts {
            funder,
            profile,
            role_account,
            role_name_account,
        })
    }
}
