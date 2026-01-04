// src/decoders/material-type.ts
// Funzione estratta da universal-decoder.ts
import type { DecodedInstruction } from './instruction-maps.js';

/**
 * Estrae il tipo di materiale da una DecodedInstruction o dai log
 */
export function extractMaterialType(
  instruction: DecodedInstruction | undefined,
  logs?: string[]
): string | undefined {
  if (!instruction) return undefined;
  // Check instruction name for material hints
  const ixName = instruction.name?.toLowerCase() ?? '';
  if (/ore/i.test(ixName)) return 'Ore';
  if (/fuel/i.test(ixName)) return 'Fuel';
  if (/food/i.test(ixName)) return 'Food';
  if (/ammo/i.test(ixName)) return 'Ammo';
  if (/tool/i.test(ixName)) return 'Tool';
  if (/component/i.test(ixName)) return 'Component';

  // Check logs if provided
  if (logs) {
    const logStr = logs.join(' ').toLowerCase();
    if (/ore/i.test(logStr)) return 'Ore';
    if (/fuel/i.test(logStr)) return 'Fuel';
    if (/food/i.test(logStr)) return 'Food';
    if (/ammo/i.test(logStr)) return 'Ammo';
    if (/tool/i.test(logStr)) return 'Tool';
    if (/component/i.test(logStr)) return 'Component';
  }

  return undefined;
}
