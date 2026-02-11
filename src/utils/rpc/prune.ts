// prune.ts
// Gestione logica prune modulare per pool RPC

import fs from 'fs/promises';
import path from 'path';

const RPC_POOL_COMPLETE = path.join(process.cwd(), 'utility', 'rpc-pool-complete.json');

async function postGetVersion(url: string, timeoutMs = 5000) {
  // Usa il modulo https nativo invece di fetch per maggiore compatibilità
  const https = await import('https');
  const { URL } = await import('url');
  
  return new Promise<{ httpCode: number; body: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout'));
    }, timeoutMs);

    try {
      const parsedUrl = new URL(url);
      const postData = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getVersion', params: [] });
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          clearTimeout(timer);
          resolve({ httpCode: res.statusCode || 0, body });
        });
      });

      req.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });

      req.write(postData);
      req.end();
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}
export async function pruneEndpoints(criteria: { unhealthy?: boolean, minFailures?: number } = {}): Promise<any[]> {
  const raw = await fs.readFile(RPC_POOL_COMPLETE, 'utf8');
  const endpoints = JSON.parse(raw);
  console.log(`[prune] Testing ${endpoints.length} endpoints...`);
  
  // Chiamate parallele HTTP POST getVersion
  const probes = await Promise.allSettled(endpoints.map(async (ep: any) => {
    try {
      const res = await postGetVersion(ep.url, 4000);
      if (res.httpCode === 200) {
        console.log(`[prune] ✓ ${ep.name}`);
        return ep;
      } else {
        console.log(`[prune] ✗ ${ep.name} HTTP ${res.httpCode}`);
      }
    } catch (e: any) {
      console.log(`[prune] ✗ ${ep.name} Error: ${e.message}`);
    }
    return null;
  }));
  
  const valid = probes.map(p => (p.status === 'fulfilled' && p.value) ? p.value : null).filter(Boolean);
  console.log(`[prune] Valid endpoints: ${valid.length}/${endpoints.length}`);
  
  // Se nessun endpoint è valido, ritorna l'intero pool invece di un array vuoto
  if (valid.length === 0) {
    console.warn(`[prune] WARNING: No valid endpoints found, returning full pool as fallback`);
    return endpoints;
  }
  
  return valid;
}

export async function restorePruned(): Promise<any[]> {
  // Stub: in futuro si può mantenere lista pruned e ripristinare
  return pruneEndpoints();
}

export async function getPrunedList(): Promise<any[]> {
  // Stub: in futuro si può mantenere lista pruned
  return [];
}
