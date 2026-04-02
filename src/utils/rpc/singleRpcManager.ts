import fs from 'fs/promises';
import path from 'path';
import { postGetSlot } from './prune';

// Funzione per testare un endpoint RPC con una POST getVersion


// Funzione principale: esegue prune e restituisce un endpoint valido
export async function getSingleHealthyRpc(): Promise<string | null> {
  const poolPath = path.resolve('utility/rpc-pool-complete.json');
  const raw = await fs.readFile(poolPath, 'utf8');
  const endpoints = JSON.parse(raw);
  for (const ep of endpoints) {
    const res = await postGetSlot(ep.url, 4000);
    if (res.httpCode === 200 && !res.data?.error) {
      return ep.url;
    }
  }
  return null;
}

// Funzione per ottenere tutti gli endpoint validi (opzionale)
export async function getAllHealthyRpcs(): Promise<string[]> {
  const poolPath = path.resolve('utility/rpc-pool-complete.json');
  const raw = await fs.readFile(poolPath, 'utf8');
  const endpoints = JSON.parse(raw);
  const healthy: string[] = [];
  for (const ep of endpoints) {
    const res = await postGetSlot(ep.url, 4000);
    if (res.httpCode === 200 && !res.data?.error) {
      healthy.push(ep.url);
    }
  }
  return healthy;
}
