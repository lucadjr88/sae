use carbon_core::borsh::{self, BorshDeserialize};

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct PlayerName {
    pub version: u8,
    pub profile: solana_pubkey::Pubkey,
    pub bump: u8,
    pub name: Vec<u8>,
}

impl borsh::de::BorshDeserialize for PlayerName
where
    u8: borsh::BorshDeserialize,
    solana_pubkey::Pubkey: borsh::BorshDeserialize,
    u8: borsh::BorshDeserialize,
{
    fn deserialize_reader<R: std::io::Read>(
        reader: &mut R,
    ) -> Result<Self, std::io::Error> {
        Ok(Self {
            version: borsh::BorshDeserialize::deserialize_reader(reader)?,
            profile: borsh::BorshDeserialize::deserialize_reader(reader)?,
            bump: borsh::BorshDeserialize::deserialize_reader(reader)?,
            name: Vec::new(),
        })
    }
}

#[automatically_derived]
impl carbon_core::deserialize::CarbonDeserialize for PlayerName {
    const DISCRIMINATOR: &'static [u8] = &[102u8, 9u8, 241u8, 98u8, 96u8, 196u8, 212u8, 161u8];
    fn deserialize(data: &[u8]) -> Option<Self> {
        use shared::decode_with_discriminator;
        decode_with_discriminator::<Self>(data, Self::DISCRIMINATOR)
    }
}
