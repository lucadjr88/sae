const LOG_CONTEXT_INSTALLED = Symbol.for('sae.logContextInstalled');

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

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
