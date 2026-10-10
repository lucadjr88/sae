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
    this.toolbar = document.createElement('div');
    this.toolbar.className = 'map-controls';
    this.toolbar.setAttribute('role', 'toolbar');
    this.toolbar.setAttribute('aria-label', 'Controlli della mappa');
    for (const [action, title, image, className] of [
      ['rotate', 'Ruota in senso antiorario (Q)', 'semifreccia_oraria.png', 'counterclockwise'],
      ['zoom', 'Aumenta zoom', "icons8-lente-d'ingrandimento-68.png", 'zoom-in'],
      ['zoom', 'Riduci zoom', "icons8-lente-d'ingrandimento-68.png", 'zoom-out'],
      ['rotate', 'Ruota in senso orario (E)', 'semifreccia_oraria.png', 'clockwise'],
    ]) {
      const btn = document.createElement('button');
      btn.title = title;
      btn.setAttribute('aria-label', title);
      btn.className = className;
      const imageElement = document.createElement('img');
      imageElement.src = `/sea/assets/${image}`;
      imageElement.alt = '';
      btn.append(imageElement);
      if (action === 'zoom') {
        const mark = document.createElement('span');
        mark.className = 'zoom-mark';
        //mark.textContent = className === 'zoom-in' ? '+' : '−';
        btn.append(mark);
      }
      btn.addEventListener('click', () => this.emit(action, className === 'clockwise' || className === 'zoom-in' ? -1 : 1));
      this.toolbar.append(btn);
    }
    document.body.append(this.toolbar);
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.list = document.createElement('div');
    root.append(this.status, this.list);
    this.renderTimer = setInterval(() => this.render(), 1000);
  }

  destroy() {
    clearInterval(this.renderTimer);
    this.toolbar.remove();
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
