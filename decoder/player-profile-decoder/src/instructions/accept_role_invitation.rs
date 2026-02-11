use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0xfefc992c29e8386b")]
pub struct AcceptRoleInvitation {
    pub key_index: u16,
    pub key_index_in_role_account: u16,
    pub key_index_in_membership_account: u16,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct AcceptRoleInvitationInstructionAccounts {
    pub new_member: solana_pubkey::Pubkey,
    pub role_account: solana_pubkey::Pubkey,
    pub role_membership_account: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for AcceptRoleInvitation {
    type ArrangedAccounts = AcceptRoleInvitationInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let new_member = next_account(&mut iter)?;
        let role_account = next_account(&mut iter)?;
        let role_membership_account = next_account(&mut iter)?;

        Some(AcceptRoleInvitationInstructionAccounts {
            new_member,
            role_account,
            role_membership_account,
        })
    }
}
