export function isUsableCachedPlayload(payloadData: any): boolean {
  if (!payloadData || typeof payloadData !== 'object') return false;
  return !(
    Object.keys(payloadData.feesByFleet || {}).length === 0
    && Number(payloadData.transactionCount24h || 0) === 0
    && Number(payloadData.sageFees24h || 0) === 0
  );
}

export function shouldServeCachedPlayloadAfterLockWait(wipeCache: unknown, payloadData: any): boolean {
  return !Boolean(wipeCache) && isUsableCachedPlayload(payloadData);
}
