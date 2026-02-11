use bitflags::bitflags;

bitflags! {
    /// Permissions for the player profile program.
    #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
    pub struct ProfilePermissions: u64 {
        /// Key is an auth key and can update the profile.
        /// Key can also edit any permissions on it's own other than AUTH.
        /// To edit AUTH permissions must meet the threshold.
        /// Key must not expire.
        const AUTH = 1 << 0;
        /// Key can add non-auth keys.
        /// May only add permissions that the key already has.
        const ADD_KEYS = 1 << 1;
        /// Key can remove non-auth keys.
        const REMOVE_KEYS = 1 << 2;
        /// Key can change the profile's player name.
        const CHANGE_NAME = 1 << 3;
        /// Key can create a new role on the profile.
        const CREATE_ROLE = 1 << 4;
        /// Key can remove a role from the profile.
        const REMOVE_ROLE = 1 << 5;
        /// Key can set a role's authorizer.
        const SET_AUTHORIZER = 1 << 6;
        /// Key can add profile to a role.
        const JOIN_ROLE = 1 << 7;
        /// Key can remove profile from a role.
        const LEAVE_ROLE = 1 << 8;
        /// Key can toggle accepting new members.
        const TOGGLE_ACCEPTING_NEW_MEMBERS = 1 << 9;
        /// Key can add a member to a role.
        const ADD_MEMBER = 1 << 10;
        /// Key can remove a member from a role.
        const REMOVE_MEMBER = 1 << 11;
        /// Key can withdraw from the SOL Vault. This permission is intended to work for any scope.
        const DRAIN_SOL_VAULT = 1 << 63;
    }
}

impl ProfilePermissions {
    /// Create ProfilePermissions from a u64 value, truncating any unknown bits.
    pub fn from_u64(bits: u64) -> Self {
        Self::from_bits_truncate(bits)
    }

    /// Convert ProfilePermissions to a u64 value.
    pub fn to_u64(self) -> u64 {
        self.bits()
    }

    /// Create ProfilePermissions from little-endian bytes.
    pub fn from_le_bytes(bytes: [u8; 8]) -> Self {
        Self::from_u64(u64::from_le_bytes(bytes))
    }

    /// Convert ProfilePermissions to little-endian bytes.
    pub fn to_le_bytes(self) -> [u8; 8] {
        self.to_u64().to_le_bytes()
    }
}
