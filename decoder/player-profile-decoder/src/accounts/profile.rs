use carbon_core::borsh::{self, BorshDeserialize};

use shared::ProfileKey;

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
    fn deserialize_reader<R: std::io::Read>(
        reader: &mut R,
    ) -> Result<Self, std::io::Error> {
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
        use shared::decode_with_discriminator;
        decode_with_discriminator::<Self>(data, Self::DISCRIMINATOR)
    }
}
