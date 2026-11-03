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
    this.wsSubscriptions = new Map();
    this.wsSubscribeRequests = new Map();
    this.wsRequestId = 0;
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
    this.wsSubscriptions.clear();
    this.wsSubscribeRequests.clear();
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
    let wsUrl = ep.ws;
    if (location.protocol === 'https:' && wsUrl.startsWith('ws://')) {
      wsUrl = wsUrl.replace('ws://', 'wss://');
    }

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
        this.refreshWsSubscriptions();

        // Refresh immediato dello snapshot alla (ri)connessione così
        // l'automazione in attesa riceve i dati chain aggiornati senza
        // dover attendere il prossimo ciclo di polling (45s).
        void this.pollOnce();

        // Avvia un polling di riserva più lento (es. ogni 45s) per sincronizzazioni periodiche
        this.startPollingLoop(45000);
      };

      this.ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (Number.isInteger(msg.id) && this.wsSubscribeRequests.has(msg.id)) {
            const fleetId = this.wsSubscribeRequests.get(msg.id);
            this.wsSubscribeRequests.delete(msg.id);
            if (Number.isInteger(msg.result)) {
              if (this.lastSnapshot?.fleets?.some(fleet => fleet.id === fleetId)) {
                this.wsSubscriptions.set(fleetId, msg.result);
              } else {
                this.sendWsRequest('accountUnsubscribe', [msg.result]);
              }
            }
            return;
          }
          if (msg.method === 'accountNotification') {
            const now = Date.now();
            if (!this.lastWsPoll || (now - this.lastWsPoll) > 20000) {
              this.lastWsPoll = now;
              await this.pollOnce();
            }
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
        this.wsSubscriptions.clear();
        this.wsSubscribeRequests.clear();
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

  refreshWsSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const fleetIds = new Set((this.lastSnapshot?.fleets ?? [])
      .map(fleet => fleet.id)
      .filter(fleetId => typeof fleetId === 'string'));
    for (const [fleetId, subscriptionId] of this.wsSubscriptions) {
      if (fleetIds.has(fleetId)) continue;
      this.sendWsRequest('accountUnsubscribe', [subscriptionId]);
      this.wsSubscriptions.delete(fleetId);
    }
    const pendingFleetIds = new Set(this.wsSubscribeRequests.values());
    for (const fleetId of fleetIds) {
      if (this.wsSubscriptions.has(fleetId) || pendingFleetIds.has(fleetId)) continue;
      const requestId = this.sendWsRequest('accountSubscribe', [fleetId, { commitment: 'confirmed' }]);
      if (requestId !== null) {
        this.wsSubscribeRequests.set(requestId, fleetId);
        pendingFleetIds.add(fleetId);
      }
    }
  }

  sendWsRequest(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return null;
    const id = ++this.wsRequestId;
    try {
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
      return id;
    } catch (error) {
      console.warn(`[FleetFeed] Richiesta WebSocket ${method} non inviata`, error);
      return null;
    }
  }

  async pollOnce() {
    try {
      const query = new URLSearchParams({ profileId: this.profileId });
      const response = await fetch(`/api/sea/snapshot?${query}`);
      const snapshot = await response.json();
      if (!response.ok) throw new Error(snapshot.error);
      this.lastSnapshot = snapshot;
      this.refreshWsSubscriptions();
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
