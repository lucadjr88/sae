## README

# INSTALL DEPENDENCIES IN BACKEND AND FRONTEND
cd ~/sae && npm install && cd frontend && npm install

# PROMPT COMMAND TO START THE SERVER IN PM2 MODE
pm2 kill; pm2 delete all; cd /home/luca/sae && rm -rf cache dist log interna_cache && npm install && cd frontend && npm install && cd .. && npm run build && sleep 1 && mkdir -p log && nohup pm2 start /home/luca/sae/dist/app.js --name "sae" -i 9 --cwd /home/luca/sae > /home/luca/sae/log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &

pkill -9 node; cd /home/luca/sae && rm -rf cache dist log interna_cache && npm install && cd frontend && npm install && cd .. && npm run build && sleep 1 && mkdir -p log && npm run dev > /home/luca/sae/log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 &

``` 