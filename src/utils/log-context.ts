import fs from 'node:fs';
import path from 'node:path';

const LOG_CONTEXT_INSTALLED = Symbol.for('sae.logContextInstalled');

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

function installSharedLogFile() {
  const directory = process.env.SAE_LOG_DIR || '/home/luca/condivisione/sae log condivisi';
  const startedAt = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const pmId = process.env.pm_id ?? process.env.NODE_APP_INSTANCE ?? 'local';
  const filename = `server-${startedAt}-pm2-${pmId}-pid-${process.pid}.log`;
  let stream: fs.WriteStream;

  try {
    fs.mkdirSync(directory, { recursive: true });
    stream = fs.createWriteStream(path.join(directory, filename), { flags: 'a', mode: 0o640 });
  } catch (error) {
    process.stderr.write(`[log-context] unable to open shared log file: ${String(error)}\n`);
    return;
  }

  const tee = (target: NodeJS.WriteStream) => {
    const originalWrite = target.write.bind(target);
    target.write = ((chunk: string | Uint8Array, encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void) => {
      try {
        const encoding = typeof encodingOrCallback === 'string' ? encodingOrCallback : 'utf8';
        stream.write(typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk));
      } catch {
        // Preserve the original process output if the shared log is unavailable.
      }
      return originalWrite(chunk, encodingOrCallback as BufferEncoding, callback);
    }) as typeof target.write;
  };

  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  stream.on('error', error => {
    originalStderrWrite(`[log-context] shared log write failed: ${String(error)}\n`);
  });
  tee(process.stdout);
  tee(process.stderr);
}

export function buildProcessLogPrefix(now = new Date()) {
  const timestamp = now.toISOString();
  const parts = [`[${timestamp}]`, `[pid=${process.pid}]`];

  const pmId = process.env.pm_id ?? process.env.NODE_APP_INSTANCE;
  if (pmId !== undefined && pmId !== '') {
    parts.push(`[pm2=${pmId}]`);
  }

  return parts.join(' ');
}

export function installProcessLogContext() {
  const globalScope = globalThis as typeof globalThis & { [key: symbol]: boolean | undefined };
  if (globalScope[LOG_CONTEXT_INSTALLED]) return;
  globalScope[LOG_CONTEXT_INSTALLED] = true;

  installSharedLogFile();

  const methods: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug'];

  for (const method of methods) {
    const original = console[method].bind(console);
    console[method] = ((...args: unknown[]) => {
      const prefix = buildProcessLogPrefix();
      if (args.length === 0) {
        original(prefix);
        return;
      }
      original(prefix, ...args);
    }) as typeof console[typeof method];
  }
}
