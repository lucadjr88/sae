#!/bin/bash
set -euo pipefail

echo "=== FINAL OPTIMIZATION ==="

# 1. Bundle Analysis
echo "1. 📦 Bundle analysis..."
if command -v npx > /dev/null 2>&1; then
    npx webpack-bundle-analyzer dist/static/js/*.js --output bundle-report.html 2>/dev/null || echo "Bundle analyzer not available"
else
    echo "ℹ️  Bundle analyzer not available"
fi

# 2. Dependency Cleanup
echo "2. 🧹 Dependency cleanup..."
npm audit fix --dry-run > audit_fix_preview.txt
echo "📋 Audit fix preview saved to audit_fix_preview.txt"

# 3. Cache Optimization
echo "3. 💾 Cache optimization..."
find cache/ -name "*.json" -mtime +7 -delete 2>/dev/null || true
echo "✅ Old cache files cleaned"

# 4. Log Rotation
echo "4. 📝 Log rotation..."
if [ -d logs/ ]; then
    find logs/ -name "*.log" -size +10M -exec gzip {} \; 2>/dev/null || true
    echo "✅ Large log files compressed"
else
    echo "ℹ️  No logs directory found"
fi

echo "🎉 Optimization complete"
