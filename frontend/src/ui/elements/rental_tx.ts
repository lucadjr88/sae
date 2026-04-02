export async function rentTx({
  contractAddress,
  borrower,
  borrowerProfile,
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
        borrower,
        borrowerProfile,
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
        const { Transaction } = await import("@solana/web3.js");
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
        // Invia la transazione firmata tramite il backend (pool RPC)
        const rawTx = signedTx.serialize();
        const base64Tx = btoa(String.fromCharCode(...rawTx));
        const sendResp = await fetch("/api/send-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transaction: base64Tx })
        });
        const sendData = await sendResp.json();
        if (!sendResp.ok) throw new Error(sendData.error || "Errore broadcast tx");
        alert("Transazione inviata! Signature: " + sendData.signature);
        console.log("[DEBUG] Signature inviata:", sendData.signature);
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

export async function cancelRentTx({
  fleet_id,
  borrower,
}: {
  fleet_id: string;
  borrower: string;
}) {
  console.log("[DEBUG][cancel-rent] Starting cancelRentTx with:", {
    fleet_id,
    borrower,
  });
  try {
    console.log("[DEBUG][cancel-rent] Sending POST /api/cancel-rent");
    const response = await fetch("/api/cancel-rent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fleet_id,
        borrower,
      }),
    });
    const rawText = await response.text();
    console.log("[DEBUG][cancel-rent] Raw response status:", response.status, response.statusText);
    console.log("[DEBUG][cancel-rent] Raw response body:", rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("[DEBUG][cancel-rent] Failed to parse backend response as JSON", e);
      alert("Risposta non JSON dal backend: " + rawText);
      return;
    }

    console.log("[DEBUG][cancel-rent] Parsed backend payload:", data);

    if (!response.ok) {
      console.error("[DEBUG][cancel-rent] Backend returned non-OK response:", data);
      alert("Errore: " + data.error);
      return;
    }

    console.log("[DEBUG][cancel-rent][COPY-BACKEND-UNSIGNED-TX-START]");
    console.log(data.transaction);
    console.log("[DEBUG][cancel-rent][COPY-BACKEND-UNSIGNED-TX-END]");

    try {
      console.log("[DEBUG][cancel-rent] Decoding unsigned transaction from backend response");
      const { Transaction } = await import("@solana/web3.js");
      function base64ToUint8Array(base64: string) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }

      const tx = Transaction.from(base64ToUint8Array(data.transaction));
      console.log("[DEBUG][cancel-rent] Transaction decoded:", {
        feePayer: tx.feePayer?.toBase58?.(),
        recentBlockhash: tx.recentBlockhash,
        instructionCount: tx.instructions.length,
      });
      console.log("[DEBUG][cancel-rent] Pre-sign instruction dump:", tx.instructions.map((ix, index) => ({
        index,
        programId: ix.programId.toBase58(),
        dataHex: ix.data?.toString("hex") || "",
        accountCount: ix.keys.length,
      })));
      const unsignedSerialized = btoa(String.fromCharCode(...tx.serialize({ requireAllSignatures: false })));
      console.log("[DEBUG][cancel-rent][COPY-FRONTEND-PRESIGN-TX-START]");
      console.log(unsignedSerialized);
      console.log("[DEBUG][cancel-rent][COPY-FRONTEND-PRESIGN-TX-END]");
      if (!window.wallet || !window.wallet.adapter || typeof window.wallet.adapter.signTransaction !== "function") {
        console.error("[DEBUG][cancel-rent] Wallet adapter unavailable for signing");
        alert("Wallet desktop non connesso o non supportato!");
        return;
      }

      console.log("[DEBUG][cancel-rent] Requesting wallet signature");
      const signedTx = await window.wallet.adapter.signTransaction(tx);
      console.log("[DEBUG][cancel-rent] Transaction signed. Serialized length preview pending");
      console.log("[DEBUG][cancel-rent] Post-sign instruction dump:", signedTx.instructions.map((ix, index) => ({
        index,
        programId: ix.programId.toBase58(),
        dataHex: ix.data?.toString("hex") || "",
        accountCount: ix.keys.length,
      })));
      const rawTx = signedTx.serialize();
      const base64Tx = btoa(String.fromCharCode(...rawTx));
      console.log("[DEBUG][cancel-rent] Signed transaction serialized:", {
        rawLength: rawTx.length,
        base64Length: base64Tx.length,
      });
      console.log("[DEBUG][cancel-rent] Sending signed transaction to /api/send-tx");
      const sendResp = await fetch("/api/send-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: base64Tx }),
      });
      const sendData = await sendResp.json();
      console.log("[DEBUG][cancel-rent] /api/send-tx response:", sendData);
      if (!sendResp.ok) {
        throw new Error(sendData.error || "Errore broadcast tx");
      }

      alert("Transazione di cancel inviata! Signature: " + sendData.signature);
      console.log("[DEBUG][cancel-rent] Signature inviata:", sendData.signature);
    } catch (e) {
      console.error("[DEBUG][cancel-rent] Error during sign/send phase:", e);
      alert("Errore firma o invio tx: " + e.message);
      console.error(e);
    }
  } catch (err) {
    console.error("[DEBUG][cancel-rent] Network or request setup error:", err);
    alert("Errore di rete: " + err.message);
  }
}