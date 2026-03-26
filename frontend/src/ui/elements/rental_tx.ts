export async function rentTx({
  contractAddress,
  borrowerProfile,
  borrowerProfileFaction,
  starbase,
  amount,
  duration
}){
              // Recupera i dati necessari dal form o dallo stato dell’app
          /*const contractAddress = "1GPi779d3e3fXCWrBnPLu2Tc29RQYgZCkhJCg74fmwt"; // esempio
          const borrowerProfile = "Eyf2QJ8yTCu3ZXBz2V3x1J4xQ8twekMgGHChH4g6qA8";
          const borrowerProfileFaction = "FazionePubkey";
          const starbase = "StarbasePubkey";
          const amount = 836; // esempio
          const duration = 1; // esempio*/

          try {
            const response = await fetch("/api/rent-fleet", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contractAddress,
                borrowerProfile,
                borrowerProfileFaction,
                starbase,
                amount,
                duration
              })
            });

            const data = await response.json();
            if (response.ok) {
              // Deserializza la transazione base64 e stampa a log
              try {
                // Import dinamico per evitare errori in ambienti non browser
                const { Transaction } = await import("@solana/web3.js");
                // Polyfill base64 -> Uint8Array compatibile browser
                function base64ToUint8Array(base64: string): Uint8Array {
                  const binary = atob(base64);
                  const len = binary.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
                  return bytes;
                }
                const tx = Transaction.from(base64ToUint8Array(data.transaction));
                console.log("[DEBUG] Transazione deserializzata:", tx);
                alert("Transazione ricevuta e deserializzata. Vedi console log.");
              } catch (e) {
                alert("Errore deserializzazione tx: " + e.message);
              }
            } else {
              alert("Errore: " + data.error);
            }
          } catch (err) {
            alert("Errore di rete: " + err.message);
          }
}