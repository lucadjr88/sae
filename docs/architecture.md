# Architecture map

This map points to the current implementation, not a proposed directory layout.

## Entry points

- Backend: [`src/app.ts`](../src/app.ts) mounts Express routes and starts the server.
- Frontend: [`frontend/src/main.ts`](../frontend/src/main.ts) initializes the wallet and home page.
- Analysis: [`src/analysis/analyzeProfile.ts`](../src/analysis/analyzeProfile.ts) handles `/api/analyze-profile`; [`fleetOrchestrator.ts`](../src/analysis/fleetOrchestrator.ts) coordinates fleet analysis.
- Debug endpoints: [`src/analysis/debug/index.ts`](../src/analysis/debug/index.ts).

## Rental transaction flow

1. The UI calls the operation in [`rental_tx.ts`](../frontend/src/ui/elements/rental_tx.ts). Transaction decoding, wallet signer resolution, encoding and submission use [`rental-transactions.ts`](../frontend/src/services/rental-transactions.ts). Rent and cancel may connect a missing wallet; list and delist do not.
2. [`rental.ts`](../src/backend/routes/rental.ts) mounts the rent, cancel, delist and list routes in [`src/backend/rental/`](../src/backend/rental/).
3. Each operation prepares an unsigned transaction and signing request through [`txSigningMiddleware.ts`](../src/backend/security/txSigningMiddleware.ts). Builders are importable from [`acceptRentalTx.ts`](../src/backend/rental/acceptRentalTx.ts), [`cancelRentalTx.ts`](../src/backend/rental/cancelRentalTx.ts), [`buildListFleetTx.ts`](../src/backend/rental/buildListFleetTx.ts) and [`buildDelistFleetTx.ts`](../src/backend/rental/buildDelistFleetTx.ts).
4. The wallet signs in the frontend. `/api/send-tx` verifies the request through [`txSigningGuard.ts`](../src/backend/security/txSigningGuard.ts), then broadcasts via [`rentalRpc.ts`](../src/backend/rental/rentalRpc.ts).
5. [`confirmTransaction.ts`](../src/backend/rental/confirmTransaction.ts) checks signature status and, when provided, rental-account existence. The send route handles timeout and updates rental caches.

The signing guard maintains request expiry, intent validation and single-use state. A broadcast signature, rental-account existence and confirmed signature status are distinct observations; preserve the current route's timeout and cache behavior when changing this flow.

## Data and infrastructure

- RPC selection, health, concurrency and metrics: [`src/utils/rpc/`](../src/utils/rpc/). Individual operations can use different retry policies.
- Cached JSON and analysis locks: [`cache.ts`](../src/utils/cache.ts), [`profile-analysis-lock.ts`](../src/utils/profile-analysis-lock.ts). Some rental and price caches use their own paths.
- Analysis payload cache validity: [`cachedPayload.ts`](../src/analysis/cachedPayload.ts), shared by profile analysis and profile resolution.
- Profile history persistence: [`profileHistory.ts`](../src/analysis/profileHistory.ts).
- Wallet transaction collection: [`fetchProfileWalletTransactions.ts`](../src/analysis/fetchProfileWalletTransactions.ts), used by both profile analysis and the debug HTTP handler.
- Wallet history pagination and RPC transaction retrieval: [`solanaRpc.ts`](../src/utils/solanaRpc.ts). Retrieval respects pool backoff and concurrency limits; reaching the pagination limit fails the analysis, [`doubleCheckWallet.ts`](../src/utils/doubleCheckWallet.ts) retries failed signatures, and incomplete downloads fail the analysis.
- Signature collection disables web3.js automatic 429 retries so the pool can record the failure and select another endpoint.
- RPC connections and wallet transaction batches request uncompressed responses by default; an explicit endpoint `Accept-Encoding` header takes precedence.
- Successful wallet transactions are saved atomically as they arrive and reused on retry when valid. `wipeCache` explicitly removes them; successful analysis also removes them unless `cachePersist` is enabled. Profile locks remain active while their local owner process is running, even after the stale timeout.
- Wallet transaction downloads use JSON-RPC batches of up to five, falling back to single requests when an endpoint rejects batching. Responses are matched by ID; only failed items are retried. The per-process provider limiter starts at an average of two transaction calls per second (with a batch-sized burst) and two concurrent HTTP requests per host, adapts to 429s, and honors HTTP `Retry-After`. Logs report progress, endpoint attempts, failure categories, 429s, and average elapsed batch time including throttling. Provider limits and billing may count each item separately; the limiter does not coordinate across processes.
- A transaction response containing only null results is treated as an endpoint failure rather than a successful download; mixed responses retain their successful transactions without increasing the provider rate.
- Profile analysis decodes only the wallet signatures collected for that analysis, not unrelated older transactions retained in the cache.
- Decode cached wallet transactions and persist SAGE operations: [`decodeCachedSageOps.ts`](../src/analysis/decodeCachedSageOps.ts), used by analysis and the debug HTTP handler.
- Associate cached operations with fleets: [`associateSageOpsToFleets.ts`](../src/utils/associateSageOpsToFleets.ts), used by analysis and the debug HTTP handler.
- Aggregate cached profile data: [`buildCachedPayload.ts`](../src/analysis/buildCachedPayload.ts), used by analysis and the debug HTTP handler.
- Resource flow classification and aggregation: [`resources_analyses.ts`](../src/utils/resources_analyses.ts); token balance extraction: [`resourceTokenDeltas.ts`](../src/utils/resourceTokenDeltas.ts); material aliases and registry: [`resourceMaterials.ts`](../src/utils/resourceMaterials.ts).
- Native instruction decoder: [`decodeInstructions.ts`](../src/decoders/decodeInstructions.ts); binary lookup: [`native-binaries.ts`](../src/utils/native-binaries.ts); binaries: [`utility/bin/`](../utility/bin/).
- Contract queries and mapping: [`rentalService.ts`](../src/backend/rental/rentalService.ts), [`srslyV2Adapter.ts`](../src/backend/rental/srslyV2Adapter.ts).
- Rental duration normalization and conversion: [`rentalDuration.ts`](../src/backend/rental/rentalDuration.ts); optimistic cache mapping: [`rentalCacheUtils.ts`](../src/backend/rental/rentalCacheUtils.ts).
- Frontend profile analysis HTTP client: [`analysis-api.ts`](../frontend/src/services/analysis-api.ts); fleet mapping: [`analysis-data.ts`](../frontend/src/services/analysis-data.ts); orchestration and rendering: [`api.ts`](../frontend/src/services/api.ts), [`frontend/src/ui/elements/`](../frontend/src/ui/elements/).

## Navigation and change boundaries

- Search the relevant domain first. Read IDLs, assets, generated files and binary data only when the task requires them.
- Keep HTTP and UI adapters separate from reusable domain and transaction functions. Preserve existing route payloads, exported contracts and cache formats during extraction.
- Rust and official decoders are the source of truth for layouts; do not introduce a parallel Borsh implementation.
- Paths based on `process.cwd()` and module location, multi-process signing state, RPC retry policies and SSHFS execution permissions are runtime dependencies, not incidental directory details.
