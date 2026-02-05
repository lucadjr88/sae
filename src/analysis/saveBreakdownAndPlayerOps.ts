import { setCache } from '../utils/cache';

export async function saveBreakdownAndPlayerOps(profileId: string, fleetBreakdown: any[], playerOps: any[]) {
  await setCache('fleet-breakdowns', profileId, fleetBreakdown, profileId);
  await setCache('player-ops', profileId, playerOps, profileId);
}
