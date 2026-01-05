/**
 * Pre-initialization pattern (OLD logic restored)
 * Only fleets present in accountToFleetMap get pre-initialized.
 * Fleets without cached data will be created on-demand during processing.
 */

export interface FleetBucketInit {
  fleetAccounts: string[];
  fleetNames: { [key: string]: string };
  fleetRentalStatus: { [key: string]: boolean };
  accountToFleetMap?: Map<string, string> | null;
  existingBuckets?: Record<string, FleetBucket>;
}

export interface FleetBucket {
  totalFee: number;
  feePercentage: number;
  totalOperations: number;
  isRented: boolean;
  operations: Record<string, OperationStats>;
  fleetName: string;
}

export interface OperationStats {
  count: number;
  totalFee: number;
  avgFee: number;
  details: string[];
}

/**
 * Initialize fleet buckets (OLD logic: only from accountToFleetMap)
 * Pre-init ONLY fleets present in accountToFleetMap (requires mapping to be built)
 *
 * @param opts - Initialization parameters
 * @returns feesByFleet record with fleet entries from mapping
 */
export function initializeFleetBuckets(opts: FleetBucketInit): Record<string, FleetBucket> {
  const feesByFleet: Record<string, FleetBucket> = opts.existingBuckets || {};

  // Phase 1: Pre-init ONLY from accountToFleetMap (OLD behavior)
  // Only fleets with cached data (in accountToFleetMap) get pre-initialized
  if (opts.accountToFleetMap?.size) {
    opts.accountToFleetMap.forEach((fleetKey) => {
      if (!feesByFleet[fleetKey]) {
        feesByFleet[fleetKey] = createFleetBucket(
          fleetKey,
          opts.fleetNames[fleetKey] || fleetKey,
          opts.fleetRentalStatus[fleetKey] || false
        );
      }
    });
  }

  return feesByFleet;
}

/**
 * Create a fresh fleet bucket with zero values
 */
function createFleetBucket(
  fleetKey: string,
  fleetName: string,
  isRented: boolean
): FleetBucket {
  return {
    totalFee: 0,
    feePercentage: 0,
    totalOperations: 0,
    isRented,
    operations: {},
    fleetName
  };
}

/**
 * On-demand fallback: Ensure fleet bucket exists, create if missing
 * This is called during transaction processing as a safety net.
 * Idempotent: Multiple calls for same fleet are safe (no-op if exists).
 *
 * @param feesByFleet - Record to potentially add entry to
 * @param fleetKey - Fleet account pubkey
 * @param fleetNames - Map of fleet name overrides
 * @param fleetRentalStatus - Map of rental status
 */
export function ensureFleetBucket(
  feesByFleet: Record<string, any>,
  fleetKey: string | undefined | null,
  fleetNames?: { [key: string]: string },
  fleetRentalStatus?: { [key: string]: boolean }
): void {
  // Guard against invalid keys
  if (!fleetKey || typeof fleetKey !== 'string' || fleetKey.trim().length === 0) {
    return;
  }

  // Only create if doesn't exist (idempotent)
  if (!feesByFleet[fleetKey]) {
    feesByFleet[fleetKey] = {
      totalFee: 0,
      feePercentage: 0,
      totalOperations: 0,
      isRented: (fleetRentalStatus?.[fleetKey] || false),
      operations: {},
      fleetName: fleetNames?.[fleetKey] || fleetKey
    };
  }
}
