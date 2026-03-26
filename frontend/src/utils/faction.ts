// Mappa fazioni Star Atlas: nome -> public key
export const FACTION_PUBKEYS: Record<string, string> = {
  mud: "Fz9k6r6h8Qw1kQnX2U1QnX2U1QnX2U1QnX2U1QnX2U1Q", // esempio
  oni: "Gk8n2k6r6h8Qw1kQnX2U1QnX2U1QnX2U1QnX2U1QnX2U1Q", // esempio
  ustur: "Hj7n2k6r6h8Qw1kQnX2U1QnX2U1QnX2U1QnX2U1QnX2U1Q" // esempio
};

export function getFactionPubkey(faction: string): string | undefined {
  return FACTION_PUBKEYS[faction.toLowerCase()];
}
