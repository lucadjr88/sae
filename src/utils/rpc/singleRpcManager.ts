import fs from 'fs/promises';
import path from 'path';

// Funzione per testare un endpoint RPC con una POST getVersion
async function postGetVersion(url: string, timeoutMs = 5000): Promise<boolean> {
  const https = await import('https');
  const { URL } = await import('url');
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
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
          resolve(res.statusCode === 200);
        });
      });
      req.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      req.write(postData);
      req.end();
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

// Funzione principale: esegue prune e restituisce un endpoint valido
export async function getSingleHealthyRpc(): Promise<string | null> {
  const poolPath = path.resolve('utility/rpc-pool-complete.json');
  const raw = await fs.readFile(poolPath, 'utf8');
  const endpoints = JSON.parse(raw);
  for (const ep of endpoints) {
    if (await postGetVersion(ep.url, 4000)) {
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
    if (await postGetVersion(ep.url, 4000)) {
      healthy.push(ep.url);
    }
  }
  return healthy;
}
