sudo pkill -9 -x node || true; cd ~/sae && rm -rf dist log && npm install --no-audit --no-fund && npm --prefix frontend install --no-audit --no-fund && npm run build && mkdir -p log && nohup node dist/app.js > "log/server-$(date +%Y%m%d-%H%M%S).log" 2>&1 &

git remote set-url origin https://github.com/lucadjr88/sae.git
cd ~/sae
git add -A  
git commit -m "Update changes"
git push origin main // git push -u origin sea     