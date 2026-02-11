// Utility per scan owner profilo (stub, da integrare con fetch reale)
export async function scanProfileOwnerUtil(profileId: string): Promise<{ asciiCandidates: string[]; bs58Candidates: string[]; knownOwnerFound: boolean }> {
  // TODO: integrare fetch reale e scan
  return { asciiCandidates: [], bs58Candidates: [], knownOwnerFound: false };
}
