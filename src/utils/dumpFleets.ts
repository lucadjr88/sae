// Utility per fetch e dump fleets (stub, da integrare con fetch reale)
export async function dumpFleetsUtil(profileId: string): Promise<{ ownedFleets: any[]; rentedFleets: any[] }> {
  // TODO: integrare fetch reale (es. via Carbon/Star Atlas)
  return { ownedFleets: [], rentedFleets: [] };
}
