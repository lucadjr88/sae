import { setActiveViewPreference } from "./toggleSwitch";

export async function rentTx({
  contractAddress,
  borrower,
  borrowerProfile,
  starbase,
  amount,
  duration,
  durationUnit,
  onSuccess,
}: {
  contractAddress: string;
  borrower: string;
  borrowerProfile: string;
  starbase: string;
  amount: number;
  duration: number;
  durationUnit: string;
  onSuccess?: (signature: string) => Promise<void>;
}): Promise<string> {
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
        duration,
        durationUnit,
      })
    });
    const rawText = await response.text();
    console.log("[DEBUG] Raw response status:", response.status, response.statusText);
    console.log("[DEBUG] Raw response body:", rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("[DEBUG][rent] Failed to parse backend response as JSON", e);
      return `Failed to parse backend response as JSON: ${e instanceof Error ? e.message : String(e)}`;
    }

    if (!response.ok) {
      return `Backend returned non-OK response: ${typeof data?.error === "string" ? data.error : JSON.stringify(data)}`;
    }

    try {
      const { Transaction } = await import("@solana/web3.js");
      function base64ToUint8Array(base64: string) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }

      const tx = Transaction.from(base64ToUint8Array(data.transaction));
      if (!window.wallet || !window.wallet.adapter || typeof window.wallet.adapter.signTransaction !== "function") {
        return "Wallet desktop not connected or unsupported!";
      }

      const signedTx = await window.wallet.adapter.signTransaction(tx);
      const rawTx = signedTx.serialize();
      const base64Tx = btoa(String.fromCharCode(...rawTx));
      const sendResp = await fetch("/api/send-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transaction: base64Tx,
          signingRequestId: data.signingRequestId,
          contractAddress,
          rentalState: data.rentalState,
          rentalCacheSeed: data.rentalCacheSeed,
        })
      });
      const sendData = await sendResp.json();
      if (!sendResp.ok) throw new Error(sendData.error || "Errore broadcast tx");

      const signature = String(sendData?.signature || "").trim();
      console.log("[DEBUG] Signature inviata:", signature);
      if (!signature) {
        return "Transaction sent but no signature was returned by the backend.";
      }

      setActiveViewPreference("rental");
      if (onSuccess) {
        try {
          await onSuccess(signature);
        } catch (refreshErr) {
          console.error("[DEBUG][rent] onSuccess callback failed:", refreshErr);
        }
      }

      return signature;
    } catch (e) {
      console.error(e);
      return `Error during sign/send phase: ${e instanceof Error ? e.message : String(e)}`;
    }
  } catch (err) {
    console.error("[DEBUG][rent] Network or request setup error:", err);
    return `Network or request setup error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function cancelRentTx({
  fleet_id,
  borrower,
}: {
  fleet_id: string;
  borrower: string;
}): Promise<string> {
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
      return `Failed to parse backend response as JSON: ${e instanceof Error ? e.message : String(e)}`;
    }

    console.log("[DEBUG][cancel-rent] Parsed backend payload:", data);

    if (!response.ok) {
      console.error("[DEBUG][cancel-rent] Backend returned non-OK response:", data);
      return `Backend returned non-OK response: ${typeof data?.error === "string" ? data.error : JSON.stringify(data)}`;
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
        return "Wallet desktop not connected or unsupported!";
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
      const { currentProfileId } = await import("@/utils/state");
      const cancelTxMeta = {
        operation: "cancel-rent",
        profileId: currentProfileId || undefined,
        fleet_id,
        borrower,
        contract: data?.derivedAccounts?.contract,
        rentalState: data?.derivedAccounts?.rentalState,
        rentalThread: data?.derivedAccounts?.rentalThread,
      };
      console.log("[DEBUG][cancel-rent] Signed transaction serialized:", {
        rawLength: rawTx.length,
        base64Length: base64Tx.length,
        meta: cancelTxMeta,
      });
      console.log("[DEBUG][cancel-rent] Sending signed transaction to /api/send-tx");
      const sendResp = await fetch("/api/send-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: base64Tx, signingRequestId: data.signingRequestId, txMeta: cancelTxMeta }),
      });
      const sendData = await sendResp.json();
      console.log("[DEBUG][cancel-rent] /api/send-tx response:", sendData);
      if (!sendResp.ok) {
        throw new Error(sendData.error || "Errore broadcast tx");
      }

      const signature = String(sendData?.signature || "").trim();
      console.log("[DEBUG][cancel-rent] Signature inviata:", signature);
      if (!signature) {
        return "Transaction sent but no signature was returned by the backend.";
      }

      setActiveViewPreference("rental");
      try {
        if (cancelTxMeta.profileId) {
          const { analyzeFees } = await import("@/services/api");
          console.log("[DEBUG][cancel-rent] Refreshing rental status for profile:", cancelTxMeta.profileId);
          await analyzeFees(cancelTxMeta.profileId, false);
        } else {
          console.warn("[DEBUG][cancel-rent] Missing profileId for refresh, falling back to page reload");
        }
      } catch (refreshErr: any) {
        console.error("[DEBUG][cancel-rent] Failed to refresh rental status after successful cancel:", refreshErr);
      }

      return signature;
    } catch (e) {
      console.error("[DEBUG][cancel-rent] Error during sign/send phase:", e);
      return `Error during sign/send phase: ${e instanceof Error ? e.message : String(e)}`;
    }
  } catch (err) {
    console.error("[DEBUG][cancel-rent] Network or request setup error:", err);
    return `Network or request setup error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function delistFleetTx({
  fleet_id,
  owner,
  contractAddress,
} : {
  fleet_id: string;
  owner: string;
  contractAddress?: string;
}): Promise<String> {
  console.log("[DEBUG][delist] Starting delistFleetTx with:", {
    fleet_id,
    owner,
    contractAddress,
  });
  try {
    console.log("[DEBUG][delist] Sending POST /api/delist-fleet");
    const response = await fetch("/api/delist-fleet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fleet_id,
        owner,
        contractAddress,
      }),
    });
    const rawText = await response.text();
    console.log("[DEBUG][delist] Raw response status:", response.status, response.statusText);
    console.log("[DEBUG][delist] Raw response body:", rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("[DEBUG][delist] Failed to parse backend response as JSON", e);
      //alert("Risposta non JSON dal backend: " + rawText);
      return ("data = JSON.parse(rawText);" + e.message);
    }

    console.log("[DEBUG][delist] Parsed backend payload:", data);

    if (!response.ok) {
      console.error("[DEBUG][delist] Backend returned non-OK response:", data);
      //alert("Errore: " + data.error);
      return ("Backend returned non-OK response: " + JSON.stringify(data));
    }

    console.log("[DEBUG][delist][COPY-BACKEND-UNSIGNED-TX-START]");
    console.log(data.transaction);
    console.log("[DEBUG][delist][COPY-BACKEND-UNSIGNED-TX-END]");

    try {
      const { Transaction } = await import("@solana/web3.js");
      function base64ToUint8Array(base64: string) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      }

      const tx = Transaction.from(base64ToUint8Array(data.transaction));
      console.log("[DEBUG][delist] Transaction decoded:", {
        feePayer: tx.feePayer?.toBase58?.(),
        recentBlockhash: tx.recentBlockhash,
        instructionCount: tx.instructions.length,
      });

      if (!window.wallet || !window.wallet.adapter || typeof window.wallet.adapter.signTransaction !== "function") {
        console.error("[DEBUG][delist] Wallet adapter unavailable for signing");
        //alert("Wallet desktop non connesso o non supportato!");
         return ("Wallet desktop not connected or unsupported!");
      }

      const signedTx = await window.wallet.adapter.signTransaction(tx);
      const rawTx = signedTx.serialize();
      const base64Tx = btoa(String.fromCharCode(...rawTx));
      const { currentProfileId } = await import("@/utils/state");
      const delistTxMeta = {
        operation: "delist-fleet",
        profileId: currentProfileId || undefined,
        fleet_id,
        owner,
        contract: data?.derivedAccounts?.contract || contractAddress,
        rentalState: data?.derivedAccounts?.rentalState,
      };

      console.log("[DEBUG][delist] Sending signed transaction to /api/send-tx", delistTxMeta);
      const sendResp = await fetch("/api/send-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: base64Tx, signingRequestId: data.signingRequestId, txMeta: delistTxMeta }),
      });
      const sendData = await sendResp.json();
      console.log("[DEBUG][delist] /api/send-tx response:", sendData);
      if (!sendResp.ok) {
        throw new Error(sendData.error || "Errore broadcast tx");
      }

      //alert("Transazione di delist inviata! Signature: " + sendData.signature);
      setActiveViewPreference("rental");
      try {
        if (delistTxMeta.profileId) {
          const { analyzeFees } = await import("@/services/api");
          await analyzeFees(delistTxMeta.profileId, false);
          return sendData.signature; // Return signature or success indicator as needed
        } else {
          return (sendData.signature + " - Missing profileId for refresh, consider reloading the page to see updated status.");
        }
      } catch (refreshErr: any) {
        console.error("[DEBUG][delist] Failed to refresh rental status:", refreshErr);
        return ("Failed to refresh rental status: " + refreshErr.message);
      }
    } catch (e) {
      console.error("[DEBUG][delist] Error during sign/send phase:", e);
      return ("Error during sign/send phase: " + e.message);
    }
  } catch (err) {
    console.error("[DEBUG][delist] Network or request setup error:", err);
    return ("Network or request setup error: " + err.message);
  }
}

export async function listFleetTx({
  fleet_id,
  rate,
  owner,
  profileId,
}: {
  fleet_id: string;
  rate: number;
  owner?: string;
  profileId?: string;
}): Promise< boolean | string | Error> {
  console.log("[DEBUG][list] Starting listFleetTx with:", {
    fleet_id,
    rate,
    owner,
    profileId,
  });

  try {
    const requestPayload = {
      fleet_id,
      rate,
      owner,
      profileId,
      paymentFrequency: "daily",
    };
    console.log("[DEBUG][list] Sending POST /api/list-fleet with payload:", requestPayload);
    const response = await fetch("/api/list-fleet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    const rawText = await response.text();
    console.log("[DEBUG][list] Raw response status:", response.status, response.statusText);
    console.log("[DEBUG][list] Raw response body:", rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error("[DEBUG][list] Failed to parse backend response as JSON", e);
      //alert("Risposta non JSON dal backend: " + rawText);
      return e;
    }

    console.log("[DEBUG][list] Parsed backend payload summary:", {
      hasTransaction: typeof data?.transaction === "string",
      derivedAccounts: data?.derivedAccounts,
      normalizedArgs: data?.normalizedArgs,
    });

    if (!response.ok) {
      console.error("[DEBUG][list] Backend returned non-OK response:", data);
      //alert("Errore: " + data.error);
      return data.error || "Errore sconosciuto dal backend"; // Return error message for display if needed
    }

    const { Transaction } = await import("@solana/web3.js");
    function base64ToUint8Array(base64: string) {
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    console.log("[DEBUG][list] Decoding unsigned transaction from backend response");
    const tx = Transaction.from(base64ToUint8Array(data.transaction));
    console.log("[DEBUG][list] Transaction decoded:", {
      feePayer: tx.feePayer?.toBase58?.(),
      recentBlockhash: tx.recentBlockhash,
      instructionCount: tx.instructions.length,
      derivedAccounts: data?.derivedAccounts,
    });

    if (!window.wallet || !window.wallet.adapter || typeof window.wallet.adapter.signTransaction !== "function") {
      console.error("[DEBUG][list] Wallet adapter unavailable for signing");
      //alert("Wallet desktop non connesso o non supportato!");
      return false;
    }

    console.log("[DEBUG][list] Requesting wallet signature for list transaction");
    const signedTx = await window.wallet.adapter.signTransaction(tx);
    const rawTx = signedTx.serialize();
    const base64Tx = btoa(String.fromCharCode(...rawTx));
    console.log("[DEBUG][list] Transaction signed and serialized:", {
      rawLength: rawTx.length,
      base64Length: base64Tx.length,
    });

    const { currentProfileId } = await import("@/utils/state");
    const resolvedProfileId = profileId || currentProfileId || undefined;
    const listTxMeta = {
      operation: "list-fleet",
      profileId: resolvedProfileId,
      fleet_id,
      owner: owner || window.wallet?.adapter?.publicKey?.toBase58?.(),
      contract: data?.derivedAccounts?.contract,
      ownerProfile: data?.derivedAccounts?.ownerProfile,
      rate: data?.normalizedArgs?.rate,
      durationMin: data?.normalizedArgs?.durationMin,
      durationMax: data?.normalizedArgs?.durationMax,
      paymentFrequency: data?.normalizedArgs?.paymentFrequency,
    };

    console.log("[DEBUG][list] Sending signed transaction to /api/send-tx", listTxMeta);
    const sendResp = await fetch("/api/send-tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transaction: base64Tx, signingRequestId: data.signingRequestId, txMeta: listTxMeta }),
    });
    const sendData = await sendResp.json();
    console.log("[DEBUG][list] /api/send-tx response:", sendData);
    if (!sendResp.ok) {
      return sendData.error || "Errore broadcast tx";
    }

    console.log("[DEBUG][list] List transaction broadcast completed", {
      signature: sendData.signature,
      profileId: resolvedProfileId,
      fleet_id,
    });
    //alert("Transazione di listing inviata! Signature: " + sendData.signature);
    setActiveViewPreference("rental");
    try {
      if (resolvedProfileId) {
        console.log("[DEBUG][list] Refreshing analyzeFees after successful listing", { resolvedProfileId });
        const { analyzeFees } = await import("@/services/api");
        await analyzeFees(resolvedProfileId, false);
      } else {
        console.warn("[DEBUG][list] Missing profileId for refresh, falling back to page reload");
        return "[DEBUG][list] Missing profileId for refresh, falling back to page reload";
      }
    } catch (refreshErr: any) {
      console.error("[DEBUG][list] Failed to refresh rental status:", refreshErr);
      return refreshErr;
    }

    return sendData.signature; // Return signature or success indicator as needed
  } catch (err: any) {
    const message = err?.message || String(err);
    const isRejected = /rejected|declined|cancelled|canceled/i.test(message);
    if (isRejected) {
      console.warn("[DEBUG][list] Wallet rejected the signature request:", err);
      //alert("Firma transazione rifiutata/annullata nel wallet.");
    } else {
      console.error("[DEBUG][list] Error during list flow:", err);
      //alert("Errore firma o invio tx: " + message);
    }
    return err;
  }
}