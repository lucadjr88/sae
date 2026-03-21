use carbon_core::deserialize::CarbonDeserialize;

/// Decodifica un oggetto T da un buffer binario, controllando il discriminator.
pub fn decode_with_discriminator<T: CarbonDeserialize>(data: &[u8], discriminator: &[u8]) -> Option<T> {
    if data.len() < discriminator.len() {
        return None;
    }
    let (disc, rest) = data.split_at(discriminator.len());
    if disc != discriminator {
        return None;
    }
    <T as CarbonDeserialize>::deserialize(rest)
}
