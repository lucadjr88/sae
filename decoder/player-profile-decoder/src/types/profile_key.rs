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
    /// Convert the raw permission bytes to a u64 value.
    pub fn permissions_as_u64(&self) -> u64 {
        u64::from_le_bytes(self.permissions)
    }

    /// Get the permissions as a ProfilePermissions bitflags type.
    pub fn permissions_flags(&self) -> ProfilePermissions {
        ProfilePermissions::from_le_bytes(self.permissions)
    }

    /// Check if this key has a specific permission flag set.
    pub fn has_permission(&self, flag: ProfilePermissions) -> bool {
        self.permissions_flags().contains(flag)
    }

    /// Check if this key is an auth key (has AUTH permission).
    pub fn is_auth(&self) -> bool {
        self.has_permission(ProfilePermissions::AUTH)
    }

    /// Check if this key has expired based on the given current time.
    /// Keys with negative expire_time never expire.
    pub fn is_expired(&self, current_time: i64) -> bool {
        self.expire_time >= 0 && self.expire_time < current_time
    }
}
