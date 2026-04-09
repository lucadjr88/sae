import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function toEnvKey(binaryName: string) {
  return `SAE_${binaryName.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase()}_PATH`;
}

function dedupe(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)));
}

export function getNativeBinaryCandidates(binaryName: string): string[] {
  const envPath = process.env[toEnvKey(binaryName)];
  const envDir = process.env.SAE_NATIVE_BIN_DIR;

  return dedupe([
    envPath,
    envDir ? path.join(envDir, binaryName) : null,
    path.join(process.cwd(), 'utility', 'bin', binaryName),
    path.join(process.cwd(), 'dist', 'utility', 'bin', binaryName),
    path.resolve(moduleDir, '../utility/bin', binaryName),
    path.resolve(moduleDir, '../../utility/bin', binaryName),
  ]);
}

export function resolveNativeBinary(binaryName: string): string | null {
  for (const candidate of getNativeBinaryCandidates(binaryName)) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // ignore missing candidates
    }
  }

  return null;
}

export function describeNativeBinaryLookup(binaryName: string) {
  return {
    binaryName,
    cwd: process.cwd(),
    candidates: getNativeBinaryCandidates(binaryName),
    resolvedPath: resolveNativeBinary(binaryName),
  };
}
