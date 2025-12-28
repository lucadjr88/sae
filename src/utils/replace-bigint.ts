/**
 * Helper per convertire BigInt in stringa per la serializzazione JSON
 */
export function replaceBigInt(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}