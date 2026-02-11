import fetchProfileRentedFleets from './fetchProfileRentedFleets';

// Scarica le fleets in rent per profileId
export async function getRentedFleetsUtil(profileId: string): Promise<any[]> {
  return await fetchProfileRentedFleets(profileId);
}
