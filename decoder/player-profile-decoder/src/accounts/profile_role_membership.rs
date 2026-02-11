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
    fn deserialize_reader<R: borsh::maybestd::io::Read>(
        reader: &mut R,
    ) -> Result<Self, borsh::maybestd::io::Error> {
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
        if data.len() < Self::DISCRIMINATOR.len() {
            return None;
        }

        let (disc, mut rest) = data.split_at(Self::DISCRIMINATOR.len());

        if disc != Self::DISCRIMINATOR {
            return None;
        }

        // ProfileRoleMembership has RemainingData = UnorderedList<RoleMembership, u32>
        // The u32 length prefix is stored after the fixed fields (66 bytes total)
        // Byte layout: version(1) + profile(32) + member(32) + bump(1) = 66 bytes
        if rest.len() < 70 {
            // 66 bytes fixed + 4 bytes u32 length
            return None;
        }

        let list_length = &rest[66..70]; // u32 length at bytes 66-69
        let list_length = u32::from_le_bytes(list_length.try_into().unwrap());

        let profile_role_membership: ProfileRoleMembership =
            match BorshDeserialize::deserialize(&mut rest) {
                Ok(res) => res,
                Err(_) => return None,
            };

        rest = &rest[4..];
        let mut memberships = Vec::new();
        for _ in 0..list_length {
            match BorshDeserialize::deserialize(&mut rest) {
                Ok(membership) => memberships.push(membership),
                Err(_) => return None,
            }
        }

        let mut final_profile_role_membership = profile_role_membership;
        final_profile_role_membership.memberships = memberships;

        if !rest.is_empty() {
            carbon_core::log::debug!(
                "Not all bytes were read when deserializing {}: {} bytes remaining",
                stringify!(ProfileRoleMembership),
                rest.len(),
            );
        }

        Some(final_profile_role_membership)
    }
}
