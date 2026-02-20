## README

# PROMPT COMMAND TO START THE SERVER IN PM2 MODE
pm2 kill; pm2 delete all; cd ~/sae && rm -rf cache dist log internal_cache && npm install && cd frontend && npm install && cd .. && npm run build && sleep 1 && mkdir -p log && nohup pm2 start dist/app.js --name "sae" -i 9 > log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &

pkill -9 node; cd ~/sae && rm -rf cache dist log internal_cache && npm install && cd frontend && npm install && cd .. && npm run build && sleep 1 && mkdir -p log && npm run dev > log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &

``` 