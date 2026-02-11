use super::PlayerProfileDecoder;
pub mod accept_role_invitation;
pub mod add_existing_member_to_role;
pub mod add_keys;
pub mod adjust_auth;
pub mod create_profile;
pub mod create_role;
pub mod invite_member_to_role;
pub mod join_role;
pub mod leave_role;
pub mod remove_keys;
pub mod remove_member_from_role;
pub mod remove_role;
pub mod set_name;
pub mod set_role_accepting_members;
pub mod set_role_authorizer;
pub mod set_role_name;
pub mod set_role_not_accepting_members;

#[derive(
    carbon_core::InstructionType,
    serde::Serialize,
    serde::Deserialize,
    PartialEq,
    Eq,
    Debug,
    Clone,
    Hash,
)]
pub enum PlayerProfileInstruction {
    AcceptRoleInvitation(accept_role_invitation::AcceptRoleInvitation),
    AddExistingMemberToRole(add_existing_member_to_role::AddExistingMemberToRole),
    AddKeys(add_keys::AddKeys),
    AdjustAuth(adjust_auth::AdjustAuth),
    CreateProfile(create_profile::CreateProfile),
    CreateRole(create_role::CreateRole),
    InviteMemberToRole(invite_member_to_role::InviteMemberToRole),
    JoinRole(join_role::JoinRole),
    LeaveRole(leave_role::LeaveRole),
    RemoveKeys(remove_keys::RemoveKeys),
    RemoveMemberFromRole(remove_member_from_role::RemoveMemberFromRole),
    RemoveRole(remove_role::RemoveRole),
    SetName(set_name::SetName),
    SetRoleAcceptingMembers(set_role_accepting_members::SetRoleAcceptingMembers),
    SetRoleAuthorizer(set_role_authorizer::SetRoleAuthorizer),
    SetRoleName(set_role_name::SetRoleName),
    SetRoleNotAcceptingMembers(set_role_not_accepting_members::SetRoleNotAcceptingMembers),
}

impl<'a> carbon_core::instruction::InstructionDecoder<'a> for PlayerProfileDecoder {
    type InstructionType = PlayerProfileInstruction;

    fn decode_instruction(
        &self,
        instruction: &solana_instruction::Instruction,
    ) -> Option<carbon_core::instruction::DecodedInstruction<Self::InstructionType>> {
        carbon_core::try_decode_instructions!(instruction,
            PlayerProfileInstruction::AcceptRoleInvitation => accept_role_invitation::AcceptRoleInvitation,
            PlayerProfileInstruction::AddExistingMemberToRole => add_existing_member_to_role::AddExistingMemberToRole,
            PlayerProfileInstruction::AddKeys => add_keys::AddKeys,
            PlayerProfileInstruction::AdjustAuth => adjust_auth::AdjustAuth,
            PlayerProfileInstruction::CreateProfile => create_profile::CreateProfile,
            PlayerProfileInstruction::CreateRole => create_role::CreateRole,
            PlayerProfileInstruction::InviteMemberToRole => invite_member_to_role::InviteMemberToRole,
            PlayerProfileInstruction::JoinRole => join_role::JoinRole,
            PlayerProfileInstruction::LeaveRole => leave_role::LeaveRole,
            PlayerProfileInstruction::RemoveKeys => remove_keys::RemoveKeys,
            PlayerProfileInstruction::RemoveMemberFromRole => remove_member_from_role::RemoveMemberFromRole,
            PlayerProfileInstruction::RemoveRole => remove_role::RemoveRole,
            PlayerProfileInstruction::SetName => set_name::SetName,
            PlayerProfileInstruction::SetRoleAcceptingMembers => set_role_accepting_members::SetRoleAcceptingMembers,
            PlayerProfileInstruction::SetRoleAuthorizer => set_role_authorizer::SetRoleAuthorizer,
            PlayerProfileInstruction::SetRoleName => set_role_name::SetRoleName,
            PlayerProfileInstruction::SetRoleNotAcceptingMembers => set_role_not_accepting_members::SetRoleNotAcceptingMembers,
        )
    }
}
