use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0xe6979804ee0b640f")]
pub struct SetRoleNotAcceptingMembers {
    pub key_index: u16,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct SetRoleNotAcceptingMembersInstructionAccounts {
    pub profile: solana_pubkey::Pubkey,
    pub role_account: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for SetRoleNotAcceptingMembers {
    type ArrangedAccounts = SetRoleNotAcceptingMembersInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let profile = next_account(&mut iter)?;
        let role_account = next_account(&mut iter)?;

        Some(SetRoleNotAcceptingMembersInstructionAccounts {
            profile,
            role_account,
        })
    }
}
