import fs from 'fs/promises';
import path from 'path';
import { PublicKey } from '@solana/web3.js';
import { getCache } from './cache.js';
import { findPlayerProfilesForWalletWithRpc } from './derivePlayerProfilePDA.js';

function isUsableCachedPlayload(payloadData: any) {
    if (!payloadData || typeof payloadData !== 'object') return false;
    return !(
        Object.keys(payloadData.feesByFleet || {}).length === 0
        && Number(payloadData.transactionCount24h || 0) === 0
        && Number(payloadData.sageFees24h || 0) === 0
    );
}

export async function resolveToPlayerProfileId(rawInput: string, wipeCache: boolean = false): Promise<string> {
    const input = rawInput.trim();
    if (!input) return input;

    // STEP 1: Se non è richiesto il wipeCache, verifica se l'input ha già un payload valido in cache
    if (!wipeCache) {
        try {
            const cachedPlayload = await getCache('playload', 'latest', input);
            if (cachedPlayload && cachedPlayload.data && isUsableCachedPlayload(cachedPlayload.data)) {
                return input;
            }
        } catch {
            // Nessuna cache diretta trovata
        }
    }

    let pubkey: PublicKey;
    try {
        pubkey = new PublicKey(input);
    } catch {
        return input;
    }

    // STEP 2: Non è in cache -> verifica se l'input è un Wallet PubKey associato a un profileId
    try {
        const profiles = await findPlayerProfilesForWalletWithRpc(pubkey, undefined);
        const matched = Array.isArray(profiles) ? profiles.find((p: any) => p && typeof p.profileId === 'string' && p.profileId.trim().length > 0) : null;
        if (matched && matched.profileId) {
            const resolved = matched.profileId.trim();

            // Pulizia di sicurezza se era stata creata per errore una cartella col wallet
            if (rawInput !== resolved) {
                try {
                    await fs.rm(path.join(process.cwd(), 'cache', rawInput), { recursive: true, force: true });
                } catch {}
            }
            return resolved;
        }
    } catch (e) {
        console.warn(`[resolveToPlayerProfileId] Wallet resolution check failed for ${input}:`, e);
    }

    return input;
}
