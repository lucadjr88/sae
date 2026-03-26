## PUNTI APERTI DA RISOLVERE

- alla connessione del wallet ricevo errore "Error during connection: WalletNotReadyError" 



- durante pruneEndPoints 
"
    try {
      const res = await postGetVersion(ep.url, 4000);
      if (res.httpCode === 200) {
        console.log(`[prune] ✓ ${ep.name}`);
        return ep;
      } else {
        console.log(`[prune] ✗ ${ep.name} HTTP ${res.httpCode}`);
      }
    } catch (e: any) {
      console.log(`[prune] ✗ ${ep.name} Error: ${e.message}`);
    }
    "
per ogni rpc aggiungere/aggiornare un campo che contenga lo storico dell'esito del pruned in modo da avere pruned = successo/totale (es. 3/5 se 3 successi su 5 tentativi) in utility/rpc-pool-complete.json. esempio totale +1, successo +1 solo se res.httpCode === 200.

- per ogni richiesta di analyze aggiungere/aggiornare un file in interna_cache che contenga lo storico delle richieste con data, ora, profileid e size del playload generato per quel proffilo.

- nella pagina fees, aggiungere un grafico a colonne delle ultime 24h con numero ops e fee ora per ora.

- gestione rental contracts: 
    - Al momento il playload contracts viene salvato nella cartella del profileid che ha eseguito la ricerca. vorrei che invece fosse salvato in /cache.