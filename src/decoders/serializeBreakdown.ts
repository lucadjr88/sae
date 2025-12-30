import { SubAccountBreakdown } from './scanWalletTxsForSubAccounts';

export function serializeBreakdown(breakdown: SubAccountBreakdown, format: 'json'|'csv' = 'json'): string {
  if (format === 'json') {
    return JSON.stringify(breakdown, null, 2);
  }
  if (format === 'csv') {
    const rows = [
      'fleetKey,subAccount,count,totalAmount',
    ];
    for (const sa in breakdown.subAccounts) {
      const data = breakdown.subAccounts[sa];
      rows.push(`${breakdown.fleetKey},${sa},${data.count},${data.totalAmount}`);
    }
    return rows.join('\n');
  }
  throw new Error('Formato non supportato');
}
