use carbon_core::borsh::{self, BorshDeserialize};

use crate::types::RoleMembership;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct ProfileRoleMembership {
    pub version: u8,
    pub profile: solana_pubkey::Pubkey,
    pub member: solana_pubkey::Pubkey,
    pub bump: u8,
    pub memberships: Vec<RoleMembership>,
}

impl borsh::de::BorshDeserialize for ProfileRoleMembership
where
    u8: borsh::BorshDeserialize,
    solana_pubkey::Pubkey: borsh::BorshDeserialize,
{
    fn deserialize_reader<R: std::io::Read>(
        reader: &mut R,
    ) -> Result<Self, std::io::Error> {
        Ok(Self {
            version: borsh::BorshDeserialize::deserialize_reader(reader)?,
            profile: borsh::BorshDeserialize::deserialize_reader(reader)?,
            member: borsh::BorshDeserialize::deserialize_reader(reader)?,
            bump: borsh::BorshDeserialize::deserialize_reader(reader)?,
            memberships: Vec::new(),
        })
    }
}

#[automatically_derived]
impl carbon_core::deserialize::CarbonDeserialize for ProfileRoleMembership {
    const DISCRIMINATOR: &'static [u8] = &[45u8, 2u8, 86u8, 111u8, 110u8, 121u8, 5u8, 1u8];
    fn deserialize(data: &[u8]) -> Option<Self> {
        use shared::decode_with_discriminator;
        decode_with_discriminator::<Self>(data, Self::DISCRIMINATOR)
    }
}
