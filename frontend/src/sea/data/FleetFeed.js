import { Emitter } from '../util/emitter.js';

// Eventi: 'snapshot' (snapshot), 'status' ('connected' | 'disconnected').
export class FleetFeed extends Emitter {
  constructor({ profileId, pollMs = 20000 }) {
    super();
    this.profileId = profileId;
    this.pollMs = pollMs;
    this.lastSnapshot = null;
    this.timer = null;
    this.stopped = false;
    this.ws = null;
    this.wsEndpoints = [];
    this.wsIndex = 0;
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }

  start() {
    this.stopped = false;
    this.initWsAndFallback();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }

  async initWsAndFallback() {
    // 1. Fetch snapshot iniziale via HTTP per popolare subito la mappa
    await this.pollOnce();

    // 2. Recupera gli endpoint WebSocket dal backend SAE (pool RPC)
    try {
      const res = await fetch(`/api/sea/ws-endpoints?profileId=${this.profileId}`);
      const data = await res.json();
      if (data && Array.isArray(data.endpoints)) {
        this.wsEndpoints = data.endpoints;
      }
    } catch {}

    // 3. Prova a connettersi ai WebSocket disponibili, altrimenti usa il polling HTTP
    if (this.wsEndpoints.length > 0) {
      this.connectNextWs();
    } else {
      this.startPollingLoop();
    }
  }

  connectNextWs() {
    if (this.stopped || this.isConnecting) return;
    if (this.wsIndex >= this.wsEndpoints.length) {
      console.warn('[FleetFeed] Tutti i WebSocket della pool hanno esaurito i tentativi. Utilizzo polling HTTP stabile.');
      this.startPollingLoop();
      return;
    }

    this.isConnecting = true;
    const ep = this.wsEndpoints[this.wsIndex];
    const wsUrl = ep.ws;

    try {
      console.log(`[FleetFeed] Connessione WebSocket in corso su: ${ep.name || wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      const connTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
          try { this.ws.close(); } catch {}
        }
      }, 6000);

      this.ws.onopen = () => {
        clearTimeout(connTimeout);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log(`[FleetFeed] WebSocket stabilito con successo su: ${ep.name || wsUrl}`);
        this.emit('status', 'connected');
        
        // Avvia un polling di riserva più lento (es. ogni 45s) per sincronizzazioni periodiche
        this.startPollingLoop(45000);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.method === 'slotNotification' || msg.method === 'accountNotification' || msg.params) {
            await this.pollOnce();
          }
        } catch {}
      };

      this.ws.onerror = () => {
        clearTimeout(connTimeout);
        try { this.ws.close(); } catch {}
      };

      this.ws.onclose = () => {
        clearTimeout(connTimeout);
        this.isConnecting = false;
        if (this.stopped) return;

        this.reconnectAttempts++;
        if (this.reconnectAttempts <= 2) {
          // Riprova lo stesso endpoint prima di passare al successivo
          console.warn(`[FleetFeed] Riconnessione WebSocket (${this.reconnectAttempts}/2) su ${ep.name || wsUrl}...`);
          setTimeout(() => this.connectNextWs(), 2000 * this.reconnectAttempts);
        } else {
          console.warn(`[FleetFeed] Endpoint ${ep.name || wsUrl} esaurito, passo al prossimo.`);
          this.wsIndex++;
          this.connectNextWs();
        }
      };
    } catch {
      this.isConnecting = false;
      this.wsIndex++;
      this.connectNextWs();
    }
  }

  startPollingLoop(interval = this.pollMs) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      await this.pollOnce();
      this.startPollingLoop(interval);
    }, interval);
  }

  async pollOnce() {
    try {
      const query = new URLSearchParams({ profileId: this.profileId });
      const response = await fetch(`/api/sea/snapshot?${query}`);
      const snapshot = await response.json();
      if (!response.ok) throw new Error(snapshot.error);
      this.lastSnapshot = snapshot;
      this.emit('status', 'connected');
      this.emit('snapshot', snapshot);
    } catch {
      this.emit('status', 'disconnected');
      if (this.lastSnapshot) this.emit('snapshot', { ...this.lastSnapshot, error: 'SEA_SNAPSHOT_UNAVAILABLE' });
    }
  }

  async poll() {
    return this.pollOnce();
  }
}
