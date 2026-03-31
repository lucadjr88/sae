export async function rentTx({
  contractAddress,
  borrowerProfile,
  borrowerProfileFaction,
  starbase,
  amount,
  duration
}) {
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
    const rawText = await response.text();
    console.log("[DEBUG] Raw response status:", response.status, response.statusText);
    console.log("[DEBUG] Raw response body:", rawText);
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      alert("Risposta non JSON dal backend: " + rawText);
      return;
    }
    if (response.ok) {
      // Firma e invia la transazione con il wallet desktop
      try {
        const { Transaction, Connection } = await import("@solana/web3.js");
        // Polyfill base64 -> Uint8Array compatibile browser
        function base64ToUint8Array(base64) {
          const binary = atob(base64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        }
        const tx = Transaction.from(base64ToUint8Array(data.transaction));
        // Firma con il wallet desktop (wallet-adapter)
        if (!window.wallet || !window.wallet.adapter || typeof window.wallet.adapter.signTransaction !== "function") {
          alert("Wallet desktop non connesso o non supportato!");
          return;
        }
        const signedTx = await window.wallet.adapter.signTransaction(tx);
        // Invia la transazione firmata
        // Usa la stessa connection del progetto, oppure creane una nuova se necessario

        const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=746b2d69-ddf7-4f2a-8a81-ff88b195679a");
        const rawTx = signedTx.serialize();
        const txid = await connection.sendRawTransaction(rawTx);
        alert("Transazione inviata! Signature: " + txid);
        console.log("[DEBUG] Signature inviata:", txid);
      } catch (e) {
        alert("Errore firma o invio tx: " + e.message);
        console.error(e);
      }
    } else {
      alert("Errore: " + data.error);
    }
  } catch (err) {
    alert("Errore di rete: " + err.message);
  }
}