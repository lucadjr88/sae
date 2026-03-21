//! Modulo condiviso: Equality
use carbon_core::borsh;

#[cfg_attr(feature = "serde", derive(serde::Serialize, serde::Deserialize))]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, borsh::BorshSerialize, borsh::BorshDeserialize, serde::Serialize)]
pub enum Equality {
    GreaterThanOrEqual,
    LessThanOrEqual,
}
