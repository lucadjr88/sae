#!/bin/bash
set -euo pipefail  # Exit on error, undefined vars, pipe failures

echo "=== FULL TEST SUITE - $(date) ==="

# 1. Build test
echo "1. 🔨 Build test..."
if npm run build > build_test.log 2>&1; then
    echo "✅ Build successful"
else
    echo "❌ Build failed - check build_test.log"
    exit 1
fi

# 2. TypeScript check
echo "2. 🔍 TypeScript check..."
if npx tsc --noEmit > ts_test.log 2>&1; then
    echo "✅ TypeScript check passed"
else
    echo "❌ TypeScript check failed - check ts_test.log"
    exit 1
fi

# 3. API Tests
echo "3. 🌐 API Tests..."

# Test fleets API
echo "   Testing fleets API..."
if response=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/fleets \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8","refresh":true}'); then
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -eq 200 ]; then
        fleet_count=$(echo "$body" | jq '.fleets | length' 2>/dev/null || echo "0")
        if [ "$fleet_count" -gt 0 ]; then
            echo "✅ Fleets API working ($fleet_count fleets)"
        else
            echo "❌ Fleets API returned empty or invalid data"
            exit 1
        fi
    else
        echo "❌ Fleets API HTTP $http_code"
        exit 1
    fi
else
    echo "❌ Fleets API curl failed"
    exit 1
fi

# Test wallet fees
echo "   Testing wallet fees API..."
if curl -s -X POST http://localhost:3000/api/wallet-fees-detailed \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8"}' \
  | jq '.totalFees' > fees_test.txt 2>/dev/null; then
    echo "✅ Wallet fees API working"
else
    echo "❌ Wallet fees API failed"
    exit 1
fi

echo "✅ API tests completed"

# 4. Cache Validation
echo "4. 💾 Cache validation..."
if [ -d "cache/fleets" ] && [ "$(ls -A cache/fleets/ | wc -l)" -gt 5 ]; then
    echo "✅ Cache populated ($(ls cache/fleets/ | wc -l) files)"
else
    echo "❌ Cache not populated or insufficient files"
    exit 1
fi

# 5. Performance test
echo "5. ⚡ Performance test..."
start_time=$(date +%s.%3N)
if curl -s -X POST http://localhost:3000/api/fleets \
  -H "Content-Type: application/json" \
  -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8"}' \
  > /dev/null 2>&1; then
    
    end_time=$(date +%s.%3N)
    response_time=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0")
    
    if (( $(echo "$response_time < 5.0" | bc -l 2>/dev/null || echo "1") )); then
        echo "✅ Performance acceptable (${response_time}s)"
    else
        echo "❌ Performance degraded (${response_time}s)"
        exit 1
    fi
else
    echo "❌ Performance test failed"
    exit 1
fi

echo "🎉 ALL TESTS PASSED - $(date)"
