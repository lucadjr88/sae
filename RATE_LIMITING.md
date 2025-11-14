# Rate Limiting Configuration - Helius RPC

## Research Summary

Based on official Helius documentation (https://www.helius.dev/pricing):

### Helius Tier Limits

| Tier | Cost/Month | RPS Limit | Min Delay (1000ms/RPS) | Recommended Start |
|------|------------|-----------|------------------------|-------------------|
| **Free** | $0 | **10 RPS** | **100ms** | **150ms** (1.5x) |
| Developer | $49 | 50 RPS | 20ms | 30ms |
| Business | $499 | 200 RPS | 5ms | 8ms |
| Professional | $999 | 500 RPS | 2ms | 3ms |

## Current Implementation

**Target Tier**: Helius Free (10 RPS)

### Algorithm Parameters (`src/examples/06-transactions.ts`)

```typescript
let currentDelay = 150;          // Start at 150ms (1.5x safety margin)
const MIN_DELAY = 100;           // Helius Free: 10 RPS = 100ms
const MAX_DELAY = 3000;          // Max backoff: 3 seconds
const BACKOFF_MULTIPLIER = 2.0;  // Double delay on 429 error
const SUCCESS_REDUCTION = 0.85;  // Reduce by 15% on success
```

### How It Works

1. **Initial Requests**: Start at 150ms delay between transaction fetches
2. **On 429 Error**: 
   - Multiply delay by 2.0 (e.g., 150ms → 300ms → 600ms → 1200ms)
   - Retry up to 5 times with exponential backoff
   - Wait `currentDelay * (retries + 1)` before retry
3. **On Success**:
   - Reduce delay by 15% (multiply by 0.85)
   - Gradually approaches MIN_DELAY (100ms) if no errors
4. **Delay Application**: 
   - Applied every 10 transactions
   - Per-transaction delay during retry attempts

## Why These Values?

- **150ms start**: Conservative approach for Free tier (10 RPS limit)
- **2.0x backoff**: Aggressive response to rate limits (better than 1.5x)
- **0.85 reduction**: Faster return to optimal speed when stable
- **100ms minimum**: Respects Helius Free tier hard limit
- **3000ms maximum**: Prevents indefinite slowdown, fails fast instead

## Upgrade Path

If 429 errors persist even with these settings:

1. **Verify Tier**: Check Helius dashboard for actual tier/limits
2. **Developer Tier ($49/mo)**: 50 RPS → change MIN_DELAY to 20ms, start at 30ms
3. **Business Tier ($499/mo)**: 200 RPS → change MIN_DELAY to 5ms, start at 8ms
4. **Consider Batch Optimization**: Reduce batch size from 100 to 50 transactions

## Testing

To verify rate limiting behavior:
1. Check server logs for `[429] Rate limit hit` messages
2. Monitor `currentDelay` values in progress updates
3. Final stats show: `Initial/Final/Min/Max delays`

## Log Format

```
[429] Rate limit hit. Waiting 300ms (delay now: 150ms, errors: 1)
Analysis complete. Dynamic delay stats: 150ms → 150ms (min: 100ms, max: 3000ms)
```
