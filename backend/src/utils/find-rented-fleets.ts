import { Connection, PublicKey, ParsedInstruction, ParsedTransactionWithMeta } from "@solana/web3.js";
import { decodeAccountWithRust } from "../decoders/rust-wrapper.js";

type RpcEndpoint = { url: string; name?: string };

/**
 * Trova le flotte in rent analizzando le transazioni recenti di una lista di wallet.
 * @param connection Solana connection
 * @param wallets Array di wallet (authority, proprietario)
 * @param ownedFleets Set di fleet account posseduti
 * @param options Opzioni: { limitTx, programIds }
 * @returns Set di fleet account trovati in rent
 */
export async function findRentedFleetsForWallets({
  rpcPool,
  wallets,
  ownedFleets = new Set(),
  limitTx = 1000,
  programIds = [
    "SRSLY1fq9TJqCk1gNSE7VZL2bztvTn9wm4VR8u8jMKT",
    "SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE"
  ]
}: {
  rpcPool: RpcEndpoint[],
  wallets: string[],
  ownedFleets?: Set<string>,
  limitTx?: number,
  programIds?: string[]
}): Promise<Set<string>> {
  const candidateFleets = new Set<string>();
  let rpcIdx = 0;
  function nextConnection() {
    const ep = rpcPool[rpcIdx % rpcPool.length];
    rpcIdx++;
    return { connection: new Connection(ep.url, "confirmed"), name: ep.name || ep.url };
  }
  for (const wallet of wallets) {
    let done = false;
    let attempts = 0;
    while (!done && attempts < rpcPool.length) {
      const { connection, name } = nextConnection();
      try {
        const pubkey = new PublicKey(wallet);
        let allSigs: any[] = [];
        let before: string | undefined = undefined;
        const maxPages = 10; // Sicurezza: max 10 pagine (10k firme) per evitare loop infiniti
        for (let page = 0; page < maxPages; page++) {
          const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 1000, before });
          if (!sigs.length) break;
          allSigs.push(...sigs);
          before = sigs[sigs.length - 1].signature;
        }
        if (!allSigs.length) break;
        const txs = await connection.getParsedTransactions(allSigs.map(s => s.signature));
        for (const tx of txs) {
          if (!tx || !tx.meta || !tx.transaction) continue;
          const instructions = tx.transaction.message.instructions as ParsedInstruction[];
          for (const ix of instructions) {
            if (!programIds.includes(ix.programId.toString())) continue;
            for (const acc of (ix as any).accounts || []) {
              const accStr = acc.toString();
              if (!ownedFleets.has(accStr)) {
                candidateFleets.add(accStr);
              }
            }
          }
        }
        done = true;
      } catch (e: any) {
        if (typeof e.message === "string" && e.message.includes("429")) {
          console.warn(`[findRentedFleetsForWallets] 429 su ${name}, ruoto endpoint...`);
          attempts++;
        } else {
          console.warn(`[findRentedFleetsForWallets] Errore su wallet ${wallet} (${name}):`, e instanceof Error ? e.message : String(e));
          break;
        }
      }
    }
  }

  // Fase 2: fetch e decode stato fleet account
  const fleets = Array.from(candidateFleets);
  const inRentFleets = new Set<string>();
  if (fleets.length === 0) return inRentFleets;
  // Usa il primo endpoint della pool per la fetch massiva
  const { connection: fleetConn, name: fleetConnName } = nextConnection();
  let accountInfos: (import("@solana/web3.js").AccountInfo<Buffer> | null)[] = [];
  try {
    accountInfos = await fleetConn.getMultipleAccountsInfo(fleets.map(f => new PublicKey(f)));
  } catch (e) {
    console.warn(`[findRentedFleetsForWallets] Errore batch getMultipleAccountsInfo:`, e instanceof Error ? e.message : String(e));
    // Fallback: fetch singole
    accountInfos = [];
    for (const f of fleets) {
      try {
        const acc = await fleetConn.getAccountInfo(new PublicKey(f));
        accountInfos.push(acc);
      } catch (e2) {
        accountInfos.push(null);
      }
    }
  }
  for (let i = 0; i < fleets.length; ++i) {
    const accInfo = accountInfos[i];
    if (!accInfo || !accInfo.data) continue;
    const decoded = decodeAccountWithRust(accInfo.data);
    // Heuristica: se decode fallisce, includi comunque (fallback)
    if (!decoded) {
      // console.warn(`[findRentedFleetsForWallets][DEBUG] Decode fallito per fleet ${fleets[i]}, inclusa come fallback.`);
      inRentFleets.add(fleets[i]);
      continue;
    }
    // Log dettagliato per debug
    const status = decoded.status ?? decoded.data?.status;
    const owner = decoded.owner ?? decoded.data?.owner;
    const authority = decoded.authority ?? decoded.data?.authority;
    // console.log(`[findRentedFleetsForWallets][DEBUG] Fleet ${fleets[i]}: status=`, status, ", owner=", owner, ", authority=", authority);
    if (status === 1 || status === "in_rent" || status === "rented") {
      inRentFleets.add(fleets[i]);
    }
    // Altre euristiche possibili: owner diverso da authority, campi specifici, ecc.
  }
  return inRentFleets;
}
