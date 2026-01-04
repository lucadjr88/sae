import { readAllFromRPCWithRetry } from '../fleets-readAllFromRPCWithRetry.js';
import { Fleet } from "@staratlas/sage";
import { FleetFetcherInput, FleetFetcherOutput } from './interfaces.js';

/**
 * Modulo per fetch delle flotte owned e rented.
 * Responsabilità: Recuperare flotte possedute e noleggiate in parallelo.
 */
export async function fetchFleets(input: FleetFetcherInput): Promise<FleetFetcherOutput> {
  const { sageProgram, playerProfilePubkey, connection } = input;

  console.log(`[FleetFetcher] Fetching owned and rented fleets for ${playerProfilePubkey.toString()}`);
  const fetchStart = Date.now();

  const [ownedFleets, rentedFleets] = await Promise.all([
    // Owned fleets: owningProfile matches at offset 41
    readAllFromRPCWithRetry(
      connection,
      sageProgram as any,
      Fleet,
      'processed',
      [{
        memcmp: {
          offset: 41, // 8 (discriminator) + 1 (version) + 32 (gameId) = 41
          bytes: playerProfilePubkey.toBase58(),
        },
      }],
    ),
    // Rented fleets: subProfile matches at offset 73
    readAllFromRPCWithRetry(
      connection,
      sageProgram as any,
      Fleet,
      'processed',
      [{
        memcmp: {
          offset: 73, // subProfile offset
          bytes: playerProfilePubkey.toBase58(),
        },
      }],
    ),
  ]);

  console.log(`[FleetFetcher] Found ${ownedFleets.length} owned + ${rentedFleets.length} rented fleets in ${Date.now() - fetchStart}ms`);

  return {
    ownedFleets,
    rentedFleets,
  };
}