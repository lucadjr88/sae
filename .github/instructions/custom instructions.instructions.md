---
applyTo: '**'
---
## Regola
Per ogni task complesso, inizia sempre proponendo una strategia in uno dei seguenti modi:
- In un blocco markdown all'inizio della sessione operativa
- In un file dedicato denominato `implementation_pna_for_<task>.md`

## Obiettivo
Scomporre il problema in sotto-task atomici per garantire coerenza logica e ridurre il carico cognitivo della sessione.
Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

## Gestione Terminali e Server
Quando si lavora con server in esecuzione (ad esempio, avviare un'applicazione con `npm run dev` o simili), evita di eseguire comandi successivi nello stesso terminale che potrebbero interrompere il processo in background. Utilizza sempre terminali separati per:
- Avviare il server in background (usando `isBackground: true` se necessario).
- Eseguire chiamate API, test o altri comandi che richiedono il server attivo.

Se devi eseguire comandi che interagiscono con il server (come richieste HTTP), assicurati che il server sia già in esecuzione in un terminale dedicato e non fermarlo accidentalmente concatenando comandi.