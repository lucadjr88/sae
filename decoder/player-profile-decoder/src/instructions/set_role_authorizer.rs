use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0x4adbd0f8ed99bce5")]
pub struct SetRoleAuthorizer {
    pub key_index: u16,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct SetRoleAuthorizerInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub role_account: solana_pubkey::Pubkey,
    pub authorizer: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for SetRoleAuthorizer {
    type ArrangedAccounts = SetRoleAuthorizerInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let role_account = next_account(&mut iter)?;
        let authorizer = next_account(&mut iter)?;

        Some(SetRoleAuthorizerInstructionAccounts {
            funder,
            profile,
            role_account,
            authorizer,
        })
    }
}
