use carbon_core::borsh::{self, BorshDeserialize};

use crate::types::ProfileKey;

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct Profile {
    pub version: u8,
    pub auth_key_count: u16,
    pub key_threshold: u8,
    pub next_seq_id: u64,
    pub created_at: i64,
    pub profile_keys: Vec<ProfileKey>,
}

impl borsh::de::BorshDeserialize for Profile
where
    u8: borsh::BorshDeserialize,
    u16: borsh::BorshDeserialize,
    u8: borsh::BorshDeserialize,
    u64: borsh::BorshDeserialize,
    i64: borsh::BorshDeserialize,
{
    fn deserialize_reader<R: borsh::maybestd::io::Read>(
        reader: &mut R,
    ) -> Result<Self, borsh::maybestd::io::Error> {
        Ok(Self {
            version: borsh::BorshDeserialize::deserialize_reader(reader)?,
            auth_key_count: borsh::BorshDeserialize::deserialize_reader(reader)?,
            key_threshold: borsh::BorshDeserialize::deserialize_reader(reader)?,
            next_seq_id: borsh::BorshDeserialize::deserialize_reader(reader)?,
            created_at: borsh::BorshDeserialize::deserialize_reader(reader)?,
            profile_keys: Vec::new(),
        })
    }
}
#[automatically_derived]
impl carbon_core::deserialize::CarbonDeserialize for Profile {
    const DISCRIMINATOR: &'static [u8] = &[184u8, 101u8, 165u8, 188u8, 95u8, 63u8, 127u8, 188u8];
    fn deserialize(data: &[u8]) -> Option<Self> {
        if data.len() < Self::DISCRIMINATOR.len() {
            return None;
        }

        let (disc, mut rest) = data.split_at(Self::DISCRIMINATOR.len());

        if disc != Self::DISCRIMINATOR {
            return None;
        }

        // Profile has RemainingData = UnorderedList<ProfileKey, u16>
        // The u16 length prefix is stored after the fixed fields (20 bytes total)
        // Byte layout: version(1) + auth_key_count(2) + key_threshold(1) + next_seq_id(8) + created_at(8) = 20 bytes
        if rest.len() < 22 {
            // 20 bytes fixed + 2 bytes u16 length
            return None;
        }

        let list_length = &rest[20..=21]; // u16 length at bytes 20-21
        let list_length = u16::from_le_bytes(list_length.try_into().unwrap());

        let profile: Profile = match BorshDeserialize::deserialize(&mut rest) {
            Ok(res) => res,
            Err(_) => return None,
        };

        rest = &rest[2..];
        let mut profile_keys = Vec::new();
        for _ in 0..list_length {
            match BorshDeserialize::deserialize(&mut rest) {
                Ok(profile_key) => profile_keys.push(profile_key),
                Err(_) => return None,
            }
        }

        let mut final_profile = profile;
        final_profile.profile_keys = profile_keys;

        if !rest.is_empty() {
            carbon_core::log::debug!(
                "Not all bytes were read when deserializing {}: {} bytes remaining",
                stringify!(Profile),
                rest.len(),
            );
        }

        Some(final_profile)
    }
}
