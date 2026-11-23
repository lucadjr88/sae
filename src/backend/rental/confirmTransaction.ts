import { PublicKey, type Connection, type SignatureStatus } from '@solana/web3.js';

type ExecuteRpc = <T>(profileId: string, operation: (connection: Connection) => Promise<T>) => Promise<T>;

export interface RentalConfirmationOptions {
  rentalState?: string | null;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

function isConfirmedSignatureStatus(status: SignatureStatus | null): boolean {
  if (!status || status.err) return false;
  const confirmationStatus = String(status.confirmationStatus || '').toLowerCase();
  return confirmationStatus === 'confirmed' || confirmationStatus === 'finalized';
}

export async function waitForRentalConfirmation(
  executeRpc: ExecuteRpc,
  profileId: string,
  signature: string,
  opts?: RentalConfirmationOptions,
): Promise<'signature-status' | 'rental-state'> {
  const timeoutMs = opts?.timeoutMs ?? 45_000;
  const pollIntervalMs = opts?.pollIntervalMs ?? 1_200;
  const startedAt = Date.now();
  const rentalStateKey = typeof opts?.rentalState === 'string' && opts.rentalState.trim().length > 0
    ? new PublicKey(opts.rentalState)
    : null;
  let lastTransientError: unknown = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await executeRpc(profileId, async (connection) => {
        const response = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
        const status = response?.value?.[0];

        if (status?.err) {
          throw new Error(`Transaction ${signature} failed on chain: ${JSON.stringify(status.err)}`);
        }
        if (isConfirmedSignatureStatus(status)) {
          return 'signature-status' as const;
        }
        if (rentalStateKey) {
          const accountInfo = await connection.getAccountInfo(rentalStateKey, 'confirmed');
          if (accountInfo?.data && accountInfo.data.length > 0) {
            return 'rental-state' as const;
          }
        }
        return null;
      });

      if (result) return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (/failed on chain/i.test(message)) throw error;
      lastTransientError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const lastErrorMessage = lastTransientError instanceof Error
    ? ` Last RPC error: ${lastTransientError.message}`
    : '';
  throw new Error(`Timed out waiting for on-chain confirmation for ${signature}.${lastErrorMessage}`);
}
