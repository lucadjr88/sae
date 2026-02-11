use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0x7d4e4dd0cf7ff60e")]
pub struct RemoveMemberFromRole {
    pub key_index: u16,
    pub key_index_in_role_account: u16,
    pub key_index_in_membership_account: u16,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct RemoveMemberFromRoleInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub member: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub role_membership_account: solana_pubkey::Pubkey,
    pub role_account: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for RemoveMemberFromRole {
    type ArrangedAccounts = RemoveMemberFromRoleInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let member = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let role_membership_account = next_account(&mut iter)?;
        let role_account = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;

        Some(RemoveMemberFromRoleInstructionAccounts {
            funder,
            member,
            profile,
            role_membership_account,
            role_account,
            system_program,
        })
    }
}
