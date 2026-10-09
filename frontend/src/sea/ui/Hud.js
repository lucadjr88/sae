import { Emitter } from '../util/emitter.js';
import { fleetPosition } from '../model/fleetPosition.js';
import { STALE_AFTER_MS } from '../config.js';

const fmtSector = s => `(${s[0]}, ${s[1]})`;

function fmtEta(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function describe(fleet, now, nameAt) {
  if (fleet.state === 'MoveWarp' || fleet.state === 'MoveSubwarp') {
    const kind = fleet.state === 'MoveWarp' ? 'warp' : 'subwarp';
    return `${kind} → ${nameAt(fleet.to)} · arrivo ${fmtEta(fleet.arrival - now)}`;
  }
  if (fleet.sector) return `${fleet.state} · ${nameAt(fleet.sector)}${fleet.state === 'Idle' && fleet.scanCooldownEnd > now ? ' · scanning SDU' : ''}`;
  return `${fleet.state} · posizione n/d`;
}

// Eventi: 'select' (fleetId). Usa solo textContent: i nomi flotta sono dati esterni.
export class Hud extends Emitter {
  constructor(root, starbases = []) {
    super();
    this.root = root;
    this.baseNames = new Map(starbases.map(sb => [sb.sector.join(','), sb.name]));
    this.snapshot = { updatedAt: 0, error: null, fleets: [] };
    this.connection = 'disconnected';
    this.selectedId = null;
    this.rows = new Map();
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    for (const [text, dir, title] of [['⟲', -1, 'Ruota a sinistra (Q)'], ['⟳', 1, 'Ruota a destra (E)']]) {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.title = title;
      btn.addEventListener('click', () => this.emit('rotate', dir));
      toolbar.append(btn);
    }
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.list = document.createElement('div');
    root.append(toolbar, this.status, this.list);
    this.renderTimer = setInterval(() => this.render(), 1000);
  }

  destroy() {
    clearInterval(this.renderTimer);
    this.root.replaceChildren();
  }

  nameAt(sector) {
    const name = this.baseNames.get(sector.join(','));
    return name ? `${name} ${fmtSector(sector)}` : fmtSector(sector);
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    this.rebuildList();
    this.render();
  }

  setConnection(state) {
    this.connection = state;
    this.render();
  }

  setSelected(id) {
    this.selectedId = id;
    for (const [rowId, row] of this.rows) row.el.classList.toggle('selected', rowId === id);
  }

  rebuildList() {
    this.list.replaceChildren();
    this.rows.clear();
    for (const fleet of [...this.snapshot.fleets].sort((a, b) => a.name.localeCompare(b.name))) {
      const el = document.createElement('div');
      el.className = 'fleet';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = fleet.name;
      const detail = document.createElement('div');
      detail.className = 'detail';
      el.append(name, detail);
      el.addEventListener('click', () => this.emit('select', fleet.id));
      this.list.append(el);
      this.rows.set(fleet.id, { el, detail, fleet });
    }
    this.setSelected(this.selectedId);
  }

  render() {
    const now = Date.now();
    const { updatedAt, error } = this.snapshot;
    const age = updatedAt ? now - updatedAt : Infinity;
    const stale = age > STALE_AFTER_MS;
    this.status.classList.toggle('error', !!error || stale || this.connection !== 'connected');
    this.status.textContent =
      this.connection !== 'connected' ? 'Server non raggiungibile'
      : error ? `Errore RPC: ${error}`
      : !updatedAt ? 'In attesa dei dati…'
      : `Aggiornato ${fmtEta(age)} fa${stale ? ' (dati vecchi)' : ''}`;
    for (const { detail, fleet } of this.rows.values()) detail.textContent = describe(fleet, now, s => this.nameAt(s));
  }
}
