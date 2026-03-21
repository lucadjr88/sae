use carbon_core::borsh::{self, BorshDeserialize};

use crate::types::RoleMembership;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Role {
    pub version: u8,
    pub profile: solana_pubkey::Pubkey,
    pub authorizer: solana_pubkey::Pubkey,
    pub role_seq_id: u64,
    pub accepting_new_members: u8,
    pub bump: u8,
    pub members: Vec<RoleMembership>,
}

impl borsh::de::BorshDeserialize for Role
where
    u8: borsh::BorshDeserialize,
    solana_pubkey::Pubkey: borsh::BorshDeserialize,
    u64: borsh::BorshDeserialize,
{
    fn deserialize_reader<R: std::io::Read>(
        reader: &mut R,
    ) -> Result<Self, std::io::Error> {
        Ok(Self {
            version: borsh::BorshDeserialize::deserialize_reader(reader)?,
            profile: borsh::BorshDeserialize::deserialize_reader(reader)?,
            authorizer: borsh::BorshDeserialize::deserialize_reader(reader)?,
            role_seq_id: borsh::BorshDeserialize::deserialize_reader(reader)?,
            accepting_new_members: borsh::BorshDeserialize::deserialize_reader(reader)?,
            bump: borsh::BorshDeserialize::deserialize_reader(reader)?,
            members: Vec::new(),
        })
    }
}

#[automatically_derived]
impl carbon_core::deserialize::CarbonDeserialize for Role {
    const DISCRIMINATOR: &'static [u8] = &[46u8, 219u8, 197u8, 24u8, 233u8, 249u8, 253u8, 154u8];
    fn deserialize(data: &[u8]) -> Option<Self> {
        use shared::decode_with_discriminator;
        decode_with_discriminator::<Self>(data, Self::DISCRIMINATOR)
    }
}
