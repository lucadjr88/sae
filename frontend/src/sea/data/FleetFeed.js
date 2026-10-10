import { Emitter } from '../util/emitter.js';

// Eventi: 'snapshot' (snapshot), 'status' ('connected' | 'disconnected').
export class FleetFeed extends Emitter {
  constructor({ profileId, pollMs = 15000 }) {
    super();
    this.profileId = profileId;
    this.pollMs = pollMs;
    this.lastSnapshot = null;
    this.timer = null;
    this.stopped = false;
  }

  start() {
    this.stopped = false;
    return this.poll();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  async poll() {
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
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => this.poll(), this.pollMs);
    }
  }
}
