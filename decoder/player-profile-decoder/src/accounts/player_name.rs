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
    fn deserialize_reader<R: borsh::maybestd::io::Read>(
        reader: &mut R,
    ) -> Result<Self, borsh::maybestd::io::Error> {
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
        if data.len() < Self::DISCRIMINATOR.len() {
            return None;
        }

        let (disc, mut rest) = data.split_at(Self::DISCRIMINATOR.len());

        if disc != Self::DISCRIMINATOR {
            return None;
        }

        let player_name: PlayerName = match BorshDeserialize::deserialize(&mut rest) {
            Ok(res) => res,
            Err(_) => return None,
        };

        // PlayerName has RemainingData = Bytes (no length prefix, just raw bytes)
        // All remaining bytes after the fixed fields are the player's name
        // Fixed fields: version(1) + profile(32) + bump(1) = 34 bytes
        let name = rest.to_vec();

        let mut final_player_name = player_name;
        final_player_name.name = name;

        Some(final_player_name)
    }
}
