use carbon_core::{CarbonDeserialize, account_utils::next_account, borsh};

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
#[carbon(discriminator = "0x0961b0241c13295d")]
pub struct SetRoleName {
    pub key_index: u16,
    pub name: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq, Clone, Hash, serde::Serialize, serde::Deserialize)]
pub struct SetRoleNameInstructionAccounts {
    pub funder: solana_pubkey::Pubkey,
    pub profile: solana_pubkey::Pubkey,
    pub role: solana_pubkey::Pubkey,
    pub name: solana_pubkey::Pubkey,
    pub system_program: solana_pubkey::Pubkey,
}

impl carbon_core::deserialize::ArrangeAccounts for SetRoleName {
    type ArrangedAccounts = SetRoleNameInstructionAccounts;

    fn arrange_accounts(
        accounts: &[solana_instruction::AccountMeta],
    ) -> Option<Self::ArrangedAccounts> {
        let mut iter = accounts.iter();
        let funder = next_account(&mut iter)?;
        let profile = next_account(&mut iter)?;
        let role = next_account(&mut iter)?;
        let name = next_account(&mut iter)?;
        let system_program = next_account(&mut iter)?;

        Some(SetRoleNameInstructionAccounts {
            funder,
            profile,
            role,
            name,
            system_program,
        })
    }
}
