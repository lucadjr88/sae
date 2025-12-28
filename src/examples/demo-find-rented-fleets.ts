
import { findRentedFleetsForWallets } from "../utils/find-rented-fleets.js";
import fs from "fs";

// Parametri demo: personalizza qui
const RPC_POOL_PATH = process.env.RPC_POOL_PATH || "public/rpc-pool-optimized.json";
const authority = process.env.AUTHORITY || "9ynTDJrA8EHqmSskLdooeptY7z4U4qrDUT1uQjEqKVJY";
const owner = process.env.OWNER || "GeUiZvjERgN95MFxU5wogLWPRUUpMgzQzdQnvyBkQHxv";

// Fleet possedute (opzionale, per demo lasciamo vuoto)
const ownedFleets = new Set<string>();


async function main() {
  const rpcPool = JSON.parse(fs.readFileSync(RPC_POOL_PATH, "utf-8"));
  console.log("[demo] Pool RPC:", rpcPool.map((e:any)=>e.name||e.url).join(", "));
  console.log("[demo] Authority:", authority);
  console.log("[demo] Owner:", owner);

  const rented = await findRentedFleetsForWallets({
    rpcPool,
    wallets: [authority, owner],
    ownedFleets,
    limitTx: 20 // batch ridotto per evitare errori
  });

  const rentedArr = Array.from(rented);
  const targetFleet = "EiYf15KAUXs8GZDnY99MEW8UMcs8Vq9aeWj41ii1dLJg";
  console.log("[demo] Flotte in rent trovate:", rentedArr);
  if (rentedArr.includes(targetFleet)) {
    console.log("[demo] SUCCESSO: la flotta target è stata trovata in rent!", targetFleet);
  } else {
    console.log("[demo] La flotta target NON è risultata in rent:", targetFleet);
  }
}

main().catch(e => {
  console.error("[demo] Errore:", e);
  process.exit(1);
});
