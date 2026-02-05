import { fetchAndCacheWalletTxs } from '../utils/fetchAndCacheWalletTxs';
export async function fetchAllProfileWalletTxs(profileId, walletAuthority, feePayer, sinceMs) {
    const txsAuthority = await fetchAndCacheWalletTxs(walletAuthority, profileId, sinceMs);
    const txsFeePayer = walletAuthority !== feePayer ? await fetchAndCacheWalletTxs(feePayer, profileId, sinceMs) : [];
    return [...txsAuthority, ...txsFeePayer];
}
