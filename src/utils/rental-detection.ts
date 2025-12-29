import { RpcPoolConnection } from './rpc/pool-connection.js';
import { PublicKey } from '@solana/web3.js';
import { getCache, getCacheDataOnly, setCache } from './persist-cache.js';

export function isFleetRented(
  ownerStr: string | null,
  subStr: string | null,
  keyStr: string,
  playerProfileId: string,
  walletHeuristicKeys?: Set<string>,
  operatedByWalletKeys?: Set<string>,
  srslyHeuristicKeys?: Set<string>
) {
  const rentedBySubProfile = !!(
    subStr &&
    subStr === playerProfileId &&
    ownerStr &&
    ownerStr !== playerProfileId
  );
  const rentedByWalletHeuristic = !!(
    (walletHeuristicKeys?.has(keyStr) || operatedByWalletKeys?.has(keyStr)) &&
    (ownerStr ? (ownerStr !== playerProfileId) : true)
  );
  const rentedBySrsly = !!(
    srslyHeuristicKeys?.has(keyStr) &&
    (ownerStr ? (ownerStr !== playerProfileId) : true)
  );
  return rentedBySubProfile || rentedByWalletHeuristic || rentedBySrsly;
}

export async function detectRentedFleets(
  poolConn: RpcPoolConnection,
  feePayer: string,
  profileId: string,
  sigLimit = 1000,
  cacheTtlSeconds = 600,
  rpcOpts?: any
) {
  const cacheKey = `${feePayer}:${profileId}`;
  try {
    const cached = await getCache('rented-fleets', cacheKey);
    if (cached) {
      console.log('[detectRentedFleets] cache hit, returning cached result');
      return cached as any;
    }
  } catch (e) {
    // ignore cache errors
  }

  const SAGE_PROGRAM_ID = 'SAGE2HAwep459SNq61LHvjxPk4pLPEJLoMETef7f7EE';
  let signatures: any[] = [];
  let retries = 5;
  while (retries >= 0 && signatures.length === 0) {
    try {
      signatures = await poolConn.getSignaturesForAddress(new PublicKey(feePayer), { limit: Math.min(1000, sigLimit), ...(rpcOpts || {}) });
      if (signatures && signatures.length > 0) break;
    } catch (err) {
      const errMsg = (err as any)?.message || '';
      if (retries > 0 && (
        errMsg.includes('429') ||
        errMsg.includes('timeout') ||
        errMsg.includes('Temporary internal error') ||
        errMsg.includes('502') ||
        errMsg.includes('503') ||
        errMsg.includes('504')
      )) {
        await new Promise(r => setTimeout(r, 200 * (6 - retries)));
        retries--;
        continue;
      }
      break;
    }
    retries--;
  }
  console.log('[detectRentedFleets] fetched signatures count=', (signatures && signatures.length) || 0);

  const candidateKeys = new Set<string>();
  const checked = new Set<string>();

  // Parallelize parsing of transactions with limited concurrency
  const PARSED_CONCURRENCY = Number(process.env.RENTAL_PARSED_CONCURRENCY) || 6;
  const sigList = signatures.map(s => s.signature);

  async function processSignatureBatch(batch: string[]) {
    const promises = batch.map(sig => 
      (async () => {
        let tx: any = null;
        let retries = 5;
        while (retries >= 0 && !tx) {
          try {
            tx = await poolConn.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, ...(rpcOpts || {}) });
            if (tx) break;
          } catch (err) {
            const errMsg = (err as any)?.message || '';
            if (retries > 0 && (
              errMsg.includes('429') ||
              errMsg.includes('timeout') ||
              errMsg.includes('Temporary internal error') ||
              errMsg.includes('502') ||
              errMsg.includes('503') ||
              errMsg.includes('504')
            )) {
              await new Promise(r => setTimeout(r, 200 * (6 - retries)));
              retries--;
              continue;
            }
            break;
          }
          retries--;
        }
        return tx;
      })()
    );
    const results = await Promise.all(promises);
    for (let i = 0; i < results.length; i++) {
      const tx = results[i];
      const sig = batch[i];
      if (!tx) continue;
      try { await setCache(`wallet-txs/${feePayer}`, sig, tx); } catch (e) {}
      const accountKeys: any[] = (tx.transaction?.message as any)?.accountKeys || (tx.transaction?.message as any)?.staticAccountKeys || [];
      for (const ak of accountKeys) {
        const pub = (typeof ak === 'string') ? ak : (ak.pubkey?.toString?.() || ak.toString?.());
        if (!pub) continue;
        if (pub === SAGE_PROGRAM_ID) continue;
        if (pub === feePayer) continue;
        if (pub === '11111111111111111111111111111111') continue;
        if (checked.has(pub)) continue;
        checked.add(pub);
      }
    }
  }

  for (let i = 0; i < sigList.length; i += PARSED_CONCURRENCY) {
    const batch = sigList.slice(i, i + PARSED_CONCURRENCY);
    await processSignatureBatch(batch);
  }

  // Now fetch account infos in batches using getMultipleAccountsInfo to reduce RPC calls
  const ALL_KEYS = Array.from(checked);
  const ACC_BATCH = Number(process.env.RENTAL_ACCOUNT_BATCH) || 20;
  for (let i = 0; i < ALL_KEYS.length; i += ACC_BATCH) {
    const batchKeys = ALL_KEYS.slice(i, i + ACC_BATCH).map(k => new PublicKey(k));
    let infos: any[] = [];
    let retries = 5;
    while (retries >= 0 && infos.length === 0) {
      try {
        infos = await poolConn.getMultipleAccountsInfo(batchKeys, { ...(rpcOpts || {}) });
        if (infos && infos.length > 0) break;
      } catch (err) {
        const errMsg = (err as any)?.message || '';
        if (retries > 0 && (
          errMsg.includes('429') ||
          errMsg.includes('timeout') ||
          errMsg.includes('Temporary internal error') ||
          errMsg.includes('502') ||
          errMsg.includes('503') ||
          errMsg.includes('504')
        )) {
          await new Promise(r => setTimeout(r, 200 * (6 - retries)));
          retries--;
          continue;
        }
        break;
      }
      retries--;
    }
    for (let j = 0; j < infos.length; j++) {
      const info = infos[j];
      const pub = ALL_KEYS[i + j];
      if (!info) continue;
      try {
        if (info.owner.toString() === SAGE_PROGRAM_ID && info.data.length >= 202) {
          candidateKeys.add(pub);
        }
      } catch (e) {
        // ignore per-account parse errors
      }
    }
  }

  const fleets: Array<{ key: string; label: string; owner: string | null; sub?: string | null }> = [];
  for (const k of candidateKeys) {
    let info: any = null;
    let retries = 5;
    while (retries >= 0 && !info) {
      try {
        info = await poolConn.getAccountInfo(new PublicKey(k), { ...(rpcOpts || {}) });
        if (info) break;
      } catch (err) {
        const errMsg = (err as any)?.message || '';
        if (retries > 0 && (
          errMsg.includes('429') ||
          errMsg.includes('timeout') ||
          errMsg.includes('Temporary internal error') ||
          errMsg.includes('502') ||
          errMsg.includes('503') ||
          errMsg.includes('504')
        )) {
          await new Promise(r => setTimeout(r, 200 * (6 - retries)));
          retries--;
          continue;
        }
        break;
      }
      retries--;
    }
    if (!info) continue;
    try {
      const ownerBytes = info.data.slice(41, 73);
      const subBytes = info.data.slice(73, 105);
      let owner: string | null = null;
      let sub: string | null = null;
      try { owner = new PublicKey(ownerBytes).toString(); } catch { owner = null; }
      try { sub = new PublicKey(subBytes).toString(); } catch { sub = null; }
      const labelBytes = info.data.slice(170, 202);
      // Try to decode label as UTF-8, but sanitize non-printable or replacement characters.
      let rawLabel = Buffer.from(labelBytes).toString('utf8').replace(/\0/g, '').trim();
      const hasReplacement = rawLabel.includes('\uFFFD');
      // Remove control characters except common printable unicode ranges
      const cleaned = rawLabel.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim();
      let label = cleaned;
      if (!label || hasReplacement || /[\x00-\x1F]/.test(rawLabel)) {
        try {
          label = `<unnamed ${new PublicKey(k).toString().slice(0,6)}>`;
        } catch {
          label = '<unnamed>';
        }
      }
      fleets.push({ key: k, label, owner, sub });
    } catch (e) {
      // ignore
    }
  }

  const rented = fleets.filter(f => f.owner && f.owner !== profileId);
  const owned = fleets.filter(f => f.owner === profileId);
  const result = { rented, owned, all: fleets };

  try {
    await setCache('rented-fleets', cacheKey, result);
  } catch (e) {
    // ignore cache write errors
  }

  return result;
}
