## PROMPT COMANDI

# COMANDO PER BUILDARE ED AVVIARE IL SERVER IN BACKGROUND CON NOHUP log_<timestamp>.log in /logs

pkill -9 node; cd ~/Scaricati/sae-main; rm -r logs 2>/dev/null; rm -r cache 2>/dev/null; rm -r dist 2>/dev/null; sleep 1; npm run build && mkdir -p logs && nohup npm run dev > logs/log-$(date +%Y%m%d-%H%M%S).log 2>&1 &

# RICHIESTA API PRICE

curl -sS localhost:3000/api/prices | head -c 4000