use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0xff844cab91d57fd6")]
pub struct SetRoleAcceptingMembers {
    pub key_index: u16,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct SetRoleAcceptingMembersInstructionAccounts {
    pub profile: solana_pubkey::Pubkey,
    pub role_account: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for SetRoleAcceptingMembers {
    type ArrangedAccounts = SetRoleAcceptingMembersInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let profile = next_account(&mut iter)?;
        let role_account = next_account(&mut iter)?;

        Some(SetRoleAcceptingMembersInstructionAccounts {
            profile,
            role_account,
        })
    }
}
