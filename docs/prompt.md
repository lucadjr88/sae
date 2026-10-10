sudo pkill -9 -x node || true; cd ~/sae && rm -rf dist log && npm install --no-audit --no-fund && npm --prefix frontend install --no-audit --no-fund && npm run build && mkdir -p log && nohup node dist/app.js > "log/server-$(date +%Y%m%d-%H%M%S).log" 2>&1 &

