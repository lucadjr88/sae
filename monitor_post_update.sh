#!/bin/bash
set -euo pipefail

echo "=== POST-UPDATE MONITORING - $(date) ==="

# 1. Health Check API
echo "1. �� Health check..."
if curl -s -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Server healthy"
else
    echo "❌ Server unhealthy - check logs"
    exit 1
fi

# 2. Memory Usage
echo "2. 🧠 Memory usage..."
if command -v htop > /dev/null 2>&1; then
    # Usa htop se disponibile
    htop -p $(pgrep -f "node.*app.js") --no-color --delay 1 | head -10 > memory_usage.txt
else
    # Fallback a ps
    ps aux --no-headers -o pid,ppid,cmd,%mem,%cpu --sort=-%mem | grep node | head -5 > memory_usage.txt
fi

memory_usage=$(grep -oP '\d+\.\d+' memory_usage.txt | head -1 || echo "0")
if (( $(echo "$memory_usage < 80.0" | bc -l 2>/dev/null || echo "1") )); then
    echo "✅ Memory usage acceptable (${memory_usage}%)"
else
    echo "⚠️  High memory usage (${memory_usage}%) - monitor closely"
fi

# 3. Error Rate Check
echo "3. 📊 Error rate check..."
error_count=$(grep -c "ERROR\|error\|Error" logs/app.log 2>/dev/null || echo "0")
total_requests=$(grep -c "POST\|GET" logs/app.log 2>/dev/null || echo "1")

if [ "$total_requests" -gt 0 ]; then
    error_rate=$((error_count * 100 / total_requests))
    if [ "$error_rate" -lt 5 ]; then
        echo "✅ Error rate acceptable (${error_rate}%)"
    else
        echo "⚠️  High error rate (${error_rate}%) - investigate"
    fi
else
    echo "ℹ️  No requests logged yet"
fi

# 4. Cache Integrity
echo "4. 💾 Cache integrity..."
corrupted_files=0
total_files=0

for file in cache/fleets/*.json; do
    if [ -f "$file" ]; then
        total_files=$((total_files + 1))
        if ! jq empty "$file" 2>/dev/null; then
            corrupted_files=$((corrupted_files + 1))
            echo "❌ Corrupted: $file"
        fi
    fi
done

if [ "$corrupted_files" -eq 0 ]; then
    echo "✅ Cache integrity good ($total_files files)"
else
    echo "⚠️  $corrupted_files corrupted cache files found"
fi

# 5. Performance Baseline
echo "5. 📈 Performance baseline..."
response_times=()
for i in {1..5}; do
    start=$(date +%s.%3N)
    curl -s -X POST http://localhost:3000/api/fleets \
      -H "Content-Type: application/json" \
      -d '{"profileId":"4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8"}' \
      > /dev/null 2>&1
    end=$(date +%s.%3N)
    response_time=$(echo "$end - $start" | bc 2>/dev/null || echo "0")
    response_times+=("$response_time")
done

# Calcola media
sum=0
for time in "${response_times[@]}"; do
    sum=$(echo "$sum + $time" | bc 2>/dev/null || echo "0")
done
avg_time=$(echo "scale=3; $sum / ${#response_times[@]}" | bc 2>/dev/null || echo "0")

if (( $(echo "$avg_time < 3.0" | bc -l 2>/dev/null || echo "1") )); then
    echo "✅ Performance good (avg ${avg_time}s)"
else
    echo "⚠️  Performance degraded (avg ${avg_time}s)"
fi

echo "📊 Monitoring complete - $(date)"
