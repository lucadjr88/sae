// Scarica le fleets associate al profileId (uses fetchProfileFleets)
import { fetchProfileFleets } from './fetchProfileFleets';

export async function getFleetsUtil(profileId: string): Promise<any[]> {
  try {
    const fleets = await fetchProfileFleets(profileId);
    return fleets || [];
  } catch (e) {
    console.error(`[getFleetsUtil] error fetching fleets for ${profileId}: ${e}`);
    return [];
  }
}
