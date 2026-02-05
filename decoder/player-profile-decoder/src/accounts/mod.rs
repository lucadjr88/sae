use carbon_core::account::AccountDecoder;
use carbon_core::deserialize::CarbonDeserialize;

use super::PlayerProfileDecoder;
pub mod player_name;
pub mod profile;
pub mod profile_role_membership;
pub mod role;

#[derive(Debug, serde::Serialize)]
pub enum PlayerProfileAccount {
    PlayerName(player_name::PlayerName),
    Profile(profile::Profile),
    ProfileRoleMembership(profile_role_membership::ProfileRoleMembership),
    Role(role::Role),
}

impl<'a> AccountDecoder<'a> for PlayerProfileDecoder {
    type AccountType = PlayerProfileAccount;
    fn decode_account(
        &self,
        account: &solana_account::Account,
    ) -> Option<carbon_core::account::DecodedAccount<Self::AccountType>> {
        if let Some(decoded_account) = player_name::PlayerName::deserialize(account.data.as_slice())
        {
            return Some(carbon_core::account::DecodedAccount {
                lamports: account.lamports,
                data: PlayerProfileAccount::PlayerName(decoded_account),
                owner: account.owner,
                executable: account.executable,
                rent_epoch: account.rent_epoch,
            });
        }

        if let Some(decoded_account) = profile::Profile::deserialize(account.data.as_slice()) {
            return Some(carbon_core::account::DecodedAccount {
                lamports: account.lamports,
                data: PlayerProfileAccount::Profile(decoded_account),
                owner: account.owner,
                executable: account.executable,
                rent_epoch: account.rent_epoch,
            });
        }

        if let Some(decoded_account) =
            profile_role_membership::ProfileRoleMembership::deserialize(account.data.as_slice())
        {
            return Some(carbon_core::account::DecodedAccount {
                lamports: account.lamports,
                data: PlayerProfileAccount::ProfileRoleMembership(decoded_account),
                owner: account.owner,
                executable: account.executable,
                rent_epoch: account.rent_epoch,
            });
        }

        if let Some(decoded_account) = role::Role::deserialize(account.data.as_slice()) {
            return Some(carbon_core::account::DecodedAccount {
                lamports: account.lamports,
                data: PlayerProfileAccount::Role(decoded_account),
                owner: account.owner,
                executable: account.executable,
                rent_epoch: account.rent_epoch,
            });
        }

        None
    }
}
