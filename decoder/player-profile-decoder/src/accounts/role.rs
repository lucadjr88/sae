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
    fn deserialize_reader<R: borsh::maybestd::io::Read>(
        reader: &mut R,
    ) -> Result<Self, borsh::maybestd::io::Error> {
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
        if data.len() < Self::DISCRIMINATOR.len() {
            return None;
        }

        let (disc, mut rest) = data.split_at(Self::DISCRIMINATOR.len());

        if disc != Self::DISCRIMINATOR {
            return None;
        }

        // Role has RemainingData = UnorderedList<RoleMembership, u32>
        // The u32 length prefix is stored after the fixed fields (75 bytes total)
        // Byte layout: version(1) + profile(32) + authorizer(32) + role_seq_id(8) + accepting_new_members(1) + bump(1) = 75 bytes
        if rest.len() < 79 {
            // 75 bytes fixed + 4 bytes u32 length
            return None;
        }

        let list_length = &rest[75..79]; // u32 length at bytes 75-78
        let list_length = u32::from_le_bytes(list_length.try_into().unwrap());

        let role: Role = match BorshDeserialize::deserialize(&mut rest) {
            Ok(res) => res,
            Err(_) => return None,
        };

        rest = &rest[4..];
        let mut members = Vec::new();
        for _ in 0..list_length {
            match BorshDeserialize::deserialize(&mut rest) {
                Ok(member) => members.push(member),
                Err(_) => return None,
            }
        }

        let mut final_role = role;
        final_role.members = members;

        if !rest.is_empty() {
            carbon_core::log::debug!(
                "Not all bytes were read when deserializing {}: {} bytes remaining",
                stringify!(Role),
                rest.len(),
            );
        }

        Some(final_role)
    }
}
