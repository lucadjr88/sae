import { Connection } from "@solana/web3.js";
import { readAllFromRPC } from "@staratlas/data-source";

export async function readAllFromRPCWithRetry(
  conn: Connection,
  prog: any,
  dataClass: any,
  commitment: any,
  filters: any,
  maxRetries: number = 3
) {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await readAllFromRPC(conn, prog, dataClass, commitment, filters);
      return result;
    } catch (err: any) {
      lastError = err;
      const msg = err?.message?.toLowerCase() || '';
      const is429 = msg.includes('429') || msg.includes('rate limit');
      const delay = is429 ? (500 * Math.pow(2, attempt)) : (200 * Math.pow(1.5, attempt));
      if (attempt < maxRetries) {
        console.log(`[readAllFromRPC] Attempt ${attempt + 1} failed (${is429 ? '429' : 'other'}), retrying in ${delay}ms...`, err?.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}
