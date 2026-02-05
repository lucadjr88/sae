use carbon_core::{CarbonDeserialize, borsh};

use super::ProfilePermissions;

#[derive(
    CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash,
)]
pub struct AddKeyInput {
    pub scope: solana_pubkey::Pubkey,
    pub expire_time: i64,
    pub permissions: [u8; 8],
}

impl AddKeyInput {
    /// Convert the raw permission bytes to a u64 value.
    pub fn permissions_as_u64(&self) -> u64 {
        u64::from_le_bytes(self.permissions)
    }

    /// Get the permissions as a ProfilePermissions bitflags type.
    pub fn permissions_flags(&self) -> ProfilePermissions {
        ProfilePermissions::from_le_bytes(self.permissions)
    }

    /// Check if this input has a specific permission flag set.
    pub fn has_permission(&self, flag: ProfilePermissions) -> bool {
        self.permissions_flags().contains(flag)
    }

    /// Check if this input grants auth permission.
    pub fn is_auth(&self) -> bool {
        self.has_permission(ProfilePermissions::AUTH)
    }
}
