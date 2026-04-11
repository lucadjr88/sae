Crea un modulo minimale in Node.js per validare l'integrità di una transazione firmata proveniente dal front-end.
​Obiettivo: Verificare che l'utente abbia firmato esattamente i dati generati dal back-end, senza alcuna modifica a importi, destinatari o parametri (es. nonce).
​Requisiti del modulo:
​Funzione generateTransactionData: Crea l'oggetto transazione, genera un hash dei dati e lo salva temporaneamente (simula un DB/Cache) associandolo a un ID sessione.
​Funzione verifyAndBroadcast:
​Riceve la transazione firmata e l'ID sessione.
​Recupera i dati originali dal "DB".
​Utilizza una libreria (es. ethers.js) per recuperare l'indirizzo del mittente dalla firma (ecrecover).
​Confronta i dati ricostruiti dalla firma con quelli originali salvati.
​Ritorna un errore se anche un solo parametro (importo, gas, data, destinatario) è differente.
​Sicurezza: Aggiungi un controllo per prevenire Replay Attack tramite l'uso di un timestamp o nonce.
​Output richiesto: Fornisci il codice del modulo back-end e un esempio minimale di integrazione in una rotta Express.js."
​Perché questo prompt funziona:
​Verifica dell'indirizzo: Chiedendo di recuperare l'indirizzo dalla firma (ecrecover), costringi Copilot a implementare la crittografia asimmetrica reale, non un semplice if (a == b).
​Stato "Pending": L'uso del DB/Cache è fondamentale. Se il server non ricorda cosa ha inviato, non può sapere se il front-end ha mentito.
​Minimalismo: Evita codice superfluo concentrandosi sulla logica di confronto.
​Una nota sulla sicurezza "attiva"
​Quando Copilot genererà il codice, assicurati che la logica segua questo schema:
​Backend: "Voglio che l'utente A mandi 1 ETH a B. Salvo questa intenzione con ID 123."
​Frontend: Firma l'intenzione ID 123.
​Backend: Riceve la firma. Non guarda cosa dice il frontend, ma riprende l'intenzione ID 123 dal DB, vede che era "1 ETH a B" e controlla se la firma ricevuta è valida per quel contenuto.