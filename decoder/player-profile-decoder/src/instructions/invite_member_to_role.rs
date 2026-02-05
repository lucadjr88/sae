use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0xfd86f832580b8d90")]
pub struct InviteMemberToRole {
    pub key_index: u16,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct InviteMemberToRoleInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub new_member: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub role_membership_account: solana_pubkey::Pubkey,
    pub role_account: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for InviteMemberToRole {
    type ArrangedAccounts = InviteMemberToRoleInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let new_member = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let role_membership_account = next_account(&mut iter)?;
        let role_account = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;

        Some(InviteMemberToRoleInstructionAccounts {
            funder,
            new_member,
            profile,
            role_membership_account,
            role_account,
            system_program,
        })
    }
}
