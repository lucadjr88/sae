use carbon_core::{CarbonDeserialize, borsh};
use super::ProfilePermissions;

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct ProfileKey {
    pub key: solana_pubkey::Pubkey,
    pub scope: solana_pubkey::Pubkey,
    pub expire_time: i64,
    pub permissions: [u8; 8],
}

impl ProfileKey {
    pub fn permissions_as_u64(&self) -> u64 {
        u64::from_le_bytes(self.permissions)
    }
    pub fn permissions_flags(&self) -> ProfilePermissions {
        ProfilePermissions::from_bits(u64::from_le_bytes(self.permissions)).unwrap_or_else(ProfilePermissions::empty)
    }
    pub fn has_permission(&self, flag: ProfilePermissions) -> bool {
        self.permissions_flags().contains(flag)
    }
    pub fn is_auth(&self) -> bool {
        self.has_permission(ProfilePermissions::AUTH)
    }
    pub fn is_expired(&self, current_time: i64) -> bool {
        self.expire_time >= 0 && self.expire_time < current_time
    }
}
