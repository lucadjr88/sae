curl -X POST http://localhost:3000/api/analyze-profile \  -H "Content-Type: application/json" \  -d '{                       "profileId": "4PsiXxqZZkRynC96UMZDQ6yDuMTWB1zmn4hr84vQwaz8",    "cachePersist": true
  }'


  pkill -9 node; cd ~/sae && rm -rf dist log && npm install && cd frontend && npm install && cd .. && npm run build && sleep 1 && mkdir -p log && nohup npm start > log/server-$(date +%Y%m%d-%H%M%S).log 2>&1 & 

  eval "$(ssh-agent -s)"      
  ssh-add ~/.ssh/sae  
git add .