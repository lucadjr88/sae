import { PublicKey } from "@solana/web3.js";
import { RpcPoolConnection } from "../../utils/rpc/pool-connection.js";
import { nlog } from "../../utils/log-normalizer.js";
import { FleetAccountData } from "../../types/fleet.js";

/**
 * Fetch fleet account data using RpcPoolConnection and manual Anchor deserialization.
 * @param pubkey Fleet account public key
 * @param rpcPool RpcPoolConnection instance
 * @param sageProgram Anchor Program instance (for coder)
 * @returns {Promise<{ key: PublicKey, data: FleetAccountData } | null>} Fleet account object or null if not found/invalid
 */
// (rimossa la vecchia dichiarazione duplicata, lasciando solo quella aggiornata)
export async function fetchFleetAccountPoolAware(pubkey: PublicKey, rpcPool: RpcPoolConnection, sageProgram: any): Promise<{ key: PublicKey, data: FleetAccountData } | null> {
  let lastError: any = null;
  let endpointsTried: string[] = [];
  nlog(`[fleet-fetcher-pool-DEBUG] START fetchFleetAccountPoolAware for key=${pubkey.toString()}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const accountInfo = await rpcPool.getAccountInfo(pubkey, { timeoutMs: 10000 });
      const endpoint = 'pool';
      endpointsTried.push(endpoint);
      nlog(`[fleet-fetcher-pool-DEBUG] Attempt ${attempt+1} endpoint=${endpoint} key=${pubkey.toString()} accountInfo=${accountInfo ? 'OK' : 'NULL'} dataLen=${accountInfo?.data?.length ?? 0}`);
      if (!accountInfo || !accountInfo.data || accountInfo.data.length === 0) {
        nlog(`[fleet-fetcher-pool] No data for fleet ${pubkey.toString()} (endpoint ${endpoint})`);
        continue;
      }
      try {
        nlog(`[fleet-fetcher-pool-DEBUG] Raw data (base64) for key=${pubkey.toString()}: ${accountInfo.data.toString('base64').slice(0, 128)}...`);
        const decoded = sageProgram.coder.accounts.decode('fleet', accountInfo.data);
        nlog(`[fleet-fetcher-pool] Decoded fleet ${pubkey.toString()} (endpoint ${endpoint})`);
        nlog(`[fleet-fetcher-pool-DEBUG] Decoded object for key=${pubkey.toString()}: ${JSON.stringify(decoded)}`);
        return {
          key: pubkey,
          data: { data: decoded },
        };
      } catch (decodeErr) {
        nlog(`[fleet-fetcher-pool] Decode error for ${pubkey.toString()} (endpoint ${endpoint}): ${decodeErr instanceof Error ? decodeErr.message : String(decodeErr)}`);
        nlog(`[fleet-fetcher-pool-DEBUG] Decode error stack: ${decodeErr instanceof Error && decodeErr.stack ? decodeErr.stack : ''}`);
        return {
          key: pubkey,
          data: { data: null, error: { type: 'decode_error', decodeErr: decodeErr instanceof Error ? decodeErr.message : String(decodeErr), endpoint } },
        };
      }
    } catch (err: any) {
      lastError = err;
      const endpoint = (err && err.endpoint) ? err.endpoint : '?';
      endpointsTried.push(endpoint);
      nlog(`[fleet-fetcher-pool] Error fetching fleet ${pubkey.toString()} (endpoint ${endpoint}, attempt ${attempt+1}): ${err instanceof Error ? err.message : String(err)}`);
      nlog(`[fleet-fetcher-pool-DEBUG] Error stack: ${err instanceof Error && err.stack ? err.stack : ''}`);
      if (err?.message?.includes('429') || err?.toString().includes('429')) {
        await new Promise(res => setTimeout(res, 250 * (attempt+1)));
        continue;
      } else {
        break;
      }
    }
  }
  nlog(`[fleet-fetcher-pool] Failed to fetch fleet ${pubkey.toString()} after ${endpointsTried.length} endpoints. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  nlog(`[fleet-fetcher-pool-DEBUG] END fetchFleetAccountPoolAware for key=${pubkey.toString()} endpointsTried=${JSON.stringify(endpointsTried)} lastError=${lastError instanceof Error ? lastError.message : String(lastError)}`);
  return {
    key: pubkey,
    data: { data: null, error: { type: 'fetch_error', endpointsTried, lastError: lastError instanceof Error ? lastError.message : String(lastError) } },
  };
}
