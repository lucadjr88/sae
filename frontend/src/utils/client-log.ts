const LOG_ENDPOINT = '/api/log';
const RATE_LIMIT_MS = 1000; // max 1 invio al secondo per evitare inondazione del server
let lastSendTime = 0;

function safeArgs(args: unknown[]): string[] {
  return args.map(a => {
    try { return JSON.stringify(a); } catch { return String(a); }
  });
}

async function sendLog(level: string, message: string, args: unknown[]) {
  const now = Date.now();
  if (now - lastSendTime < RATE_LIMIT_MS) return;
  lastSendTime = now;
  try {
    await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        level,
        message,
        args: safeArgs(args),
        timestamp: new Date().toISOString(),
        source: 'frontend',
      }),
    });
  } catch {
    // Silenzioso: non deve mai bloccare l'app se il server non risponde
  }
}

export function installClientLogInterceptor() {
  const methods: Array<keyof Console> = ['log', 'debug', 'info', 'warn', 'error'];
  for (const method of methods) {
    const original = (console[method] as (...args: any[]) => void).bind(console);
    console[method] = ((...args: unknown[]) => {
      original(...args); // stampa sempre in console DevTools
      const message = args.map(a => String(a)).join(' ');
      sendLog(method, message, args);
    }) as any;
  }
}