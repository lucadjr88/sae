# Fleet Fee Aggregation Strategy

## Overview
This service aggregates transaction fees for Star Atlas SAGE fleets with a **robust hybrid initialization pattern** that ensures all expected fleets have entries in the result, regardless of configuration state.

## Initialization Approach: Hybrid Robust Pattern

### Phase 1: Optimized Pre-Init (if enableSubAccountMapping=true)
- Pre-initializes fleets from `accountToFleetMap`
- Maps sub-accounts (cargoHold, fuelTank, etc.) to their parent fleets
- Only enabled when `enableSubAccountMapping=true`
- **Performance optimization** for large account sets

### Phase 2: Fallback Direct Init (ALWAYS)
- Initializes all `fleetAccounts` directly
- **Ensures no fleet is missed** regardless of `enableSubAccountMapping` setting
- **Critical safeguard** against `enableSubAccountMapping=false` edge case
- Runs unconditionally - belt-and-suspenders approach

### Phase 3: On-Demand Fallback (during processing)
- Calls `ensureFleetBucket()` when fleet is extracted from transaction
- Creates entry if missing from previous phases
- **Maximum robustness**: catches any edge cases or data inconsistencies
- Idempotent: Multiple calls for same fleet are safe (no-op if exists)

## Why This Works

| Scenario | Phase 1 | Phase 2 | Phase 3 | Result |
|----------|---------|---------|---------|--------|
| `enableSubAccountMapping=true`, accountToFleetMap populated | ✅ Pre-init from map | ✅ Direct init | ✅ On-demand | All fleets guaranteed |
| `enableSubAccountMapping=false` | ❌ Skipped | ✅ Direct init | ✅ On-demand | **All fleets guaranteed** |
| Large fleet with many sub-accounts | ✅ Pre-init (fast) | ✅ Direct init | ✅ On-demand | Optimized path + fallback |
| Edge case: corrupt accountToFleetMap | ❌ Partial | ✅ Direct init | ✅ On-demand | **Still covered** |

## Data Integrity Checks

After processing all transactions, the service performs **POST-PROCESSING VALIDATION**:

1. **Completeness Check**: Verifies all expected `fleetAccounts` have entries
   - If missing fleets detected → Emergency fallback creation with logger warnings
   - If all present → Success log message

2. **Data Integrity Check**: Validates each fleet bucket
   - Ensures `operations` field is a valid object
   - Ensures numeric fields (`totalFee`, `totalOperations`) are valid numbers
   - Auto-repairs corrupted data with logger messages

## Performance Impact

- **Minimal overhead** from on-demand checks (conditional, short-circuit creation)
- **Pre-init caches** most common fleets (early in processing)
- **Reduces check frequency** in transaction loop
- **Net result**: Faster than pure on-demand, more robust than pure pre-init
- **No breaking changes**: Compatible with all calling patterns

## File Structure

```
lib/
  initialize-fleet-buckets.ts    # Helper: initializeFleetBuckets, ensureFleetBucket
__tests__/
  initialize-fleet-buckets.test.ts # Unit tests (11 test cases)
index.ts                           # Main orchestrator with 3x on-demand fallback calls
types.ts                           # Type definitions
```

## Testing

### Unit Tests (11 cases)
```bash
npm test -- initialize-fleet-buckets.test.ts
```

Coverage:
- Direct fleet initialization with and without accountToFleetMap
- Pre-initialized buckets preservation
- Idempotency of ensureFleetBucket
- Large fleet list handling (100+ fleets)
- Edge cases: null keys, empty lists, defaults

### Manual Verification
```bash
# Watch for validation messages in logs:
npm run dev

# Expected in logs:
# ✅ "All X expected fleets initialized successfully"      (good case)
# ⚠️  "WARNING: X expected fleets missing"                 (should not happen after fix)
# ⚠️  "CORRUPT: Fleet ... has invalid operations field"    (should not happen)
```

## Backwards Compatibility

- ✅ No breaking changes to public exports
- ✅ No changes to transaction parsing
- ✅ No changes to fee calculation logic
- ✅ Existing code using `enableSubAccountMapping` still works
- ✅ Code NOT using `enableSubAccountMapping` now works correctly

## Implementation Details

### `initializeFleetBuckets(opts)`
Hybrid initialization combining optimized path (Phase 1/2):
- Input: fleetAccounts, accountToFleetMap, fleetNames, fleetRentalStatus
- Output: Record with all fleet buckets pre-created
- Idempotent: Safe to call with existing buckets

### `ensureFleetBucket(feesByFleet, fleetKey, ...)`
On-demand fallback for processing loop:
- Creates entry if missing
- Skips if already exists (preserves data)
- Gracefully handles null/undefined keys
- Called in 3 places during transaction processing
