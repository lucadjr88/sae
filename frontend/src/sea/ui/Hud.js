import { Emitter } from '../util/emitter.js';
import { fleetPosition } from '../model/fleetPosition.js';
import { STALE_AFTER_MS } from '../config.js';
import { shipLook } from '../map/shipSprites.js';

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

function infoLabel(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, char => char.toUpperCase());
}

function appendInfoData(parent, data, title = '') {
  const section = document.createElement('section');
  section.className = 'fleet-info-section';
  if (title) {
    const heading = document.createElement('h3');
    heading.textContent = infoLabel(title);
    section.append(heading);
  }
  const fields = document.createElement('dl');
  fields.className = 'fleet-info-fields';
  for (const [key, value] of Object.entries(data ?? {})) {
    if (key === 'raw' && typeof value === 'string') {
      const raw = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = 'Account grezzo (Base64)';
      const content = document.createElement('pre');
      content.textContent = value;
      raw.append(summary, content);
      section.append(raw);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      appendInfoData(section, value, key);
    } else {
      const row = document.createElement('div');
      row.className = 'fleet-info-field';
      const label = document.createElement('dt');
      label.textContent = infoLabel(key);
      const valueText = document.createElement('dd');
      valueText.textContent = Array.isArray(value) ? value.join(', ') || '—' : value == null ? '—' : String(value);
      row.append(label, valueText);
      fields.append(row);
    }
  }
  if (fields.childElementCount) section.append(fields);
  parent.append(section);
}

function appendAutomationInput(parent, labelText, value = '', readOnly = false) {
  const field = document.createElement('label');
  field.className = 'automation-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value == null ? '' : String(value);
  input.readOnly = readOnly;
  if (readOnly) input.title = 'Dato letto dalla flotta on-chain';
  field.append(label, input);
  parent.append(field);
}

function appendAutomationCheckbox(parent, labelText, checked = false) {
  const field = document.createElement('label');
  field.className = 'automation-checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const label = document.createElement('span');
  label.textContent = labelText;
  field.append(input, label);
  parent.append(field);
}

// Eventi: 'select' (fleetId). Usa solo textContent: i nomi flotta sono dati esterni.
export class Hud extends Emitter {
  constructor(root, starbases = []) {
    super();
    this.root = root;
    this.content = root.querySelector('.hud-content');
    this.baseNames = new Map(starbases.map(sb => [sb.sector.join(','), sb.name]));
    this.snapshot = { updatedAt: 0, error: null, fleets: [] };
    this.connection = 'disconnected';
    this.selectedId = null;
    this.rows = new Map();
    this.infoOverlay = document.createElement('div');
    this.infoOverlay.className = 'fleet-info-overlay';
    this.infoOverlay.hidden = true;
    const infoPanel = document.createElement('section');
    infoPanel.className = 'fleet-info-panel';
    infoPanel.setAttribute('role', 'dialog');
    infoPanel.setAttribute('aria-modal', 'true');
    infoPanel.setAttribute('aria-labelledby', 'fleet-info-title');
    const infoContent = document.createElement('div');
    infoContent.className = 'fleet-info-content';
    this.infoClose = document.createElement('button');
    this.infoClose.className = 'fleet-info-close';
    this.infoClose.type = 'button';
    this.infoClose.setAttribute('aria-label', 'Chiudi informazioni flotta');
    this.infoClose.textContent = '\u00d7';
    this.infoTitle = document.createElement('h2');
    this.infoTitle.id = 'fleet-info-title';
    this.infoBody = document.createElement('div');
    this.infoBody.className = 'fleet-info-body';
    const infoFrame = document.createElement('div');
    infoFrame.className = 'fleet-info-frame';
    infoFrame.setAttribute('aria-hidden', 'true');
    infoContent.append(this.infoTitle, this.infoBody);
    infoPanel.append(this.infoClose, infoContent, infoFrame);
    this.infoOverlay.append(infoPanel);
    this.infoClose.addEventListener('click', () => this.closeFleetInfo());
    this.infoOverlay.addEventListener('click', event => {
      if (event.target === this.infoOverlay) this.closeFleetInfo();
    });
    this.infoOverlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeFleetInfo();
    });
    document.body.append(this.infoOverlay);
    this.automationOverlay = document.createElement('div');
    this.automationOverlay.className = 'fleet-info-overlay';
    this.automationOverlay.hidden = true;
    const automationPanel = document.createElement('section');
    automationPanel.className = 'fleet-info-panel';
    automationPanel.setAttribute('role', 'dialog');
    automationPanel.setAttribute('aria-modal', 'true');
    automationPanel.setAttribute('aria-label', 'Automazioni flotta');
    const automationContent = document.createElement('div');
    automationContent.className = 'fleet-info-content';
    const automationTitle = document.createElement('h2');
    automationTitle.textContent = 'Automation';
    this.automationSelect = document.createElement('select');
    this.automationSelect.className = 'automation-select';
    this.automationSelect.setAttribute('aria-label', 'Seleziona un’automazione');
    const emptyAutomation = document.createElement('option');
    emptyAutomation.value = '';
    emptyAutomation.selected = true;
    const sduAutomation = document.createElement('option');
    sduAutomation.value = 'sdu-program';
    sduAutomation.textContent = 'SDU Program';
    this.automationSelect.append(emptyAutomation, sduAutomation);
    this.automationForm = document.createElement('div');
    this.automationForm.className = 'automation-form';
    this.automationForm.hidden = true;
    this.automationLeft = document.createElement('div');
    this.automationLeft.className = 'automation-column';
    this.automationRight = document.createElement('div');
    this.automationRight.className = 'automation-column';
    this.automationForm.append(this.automationLeft, this.automationRight);
    this.automationSelect.addEventListener('change', () => {
      this.automationForm.hidden = this.automationSelect.value !== 'sdu-program';
    });
    automationContent.append(automationTitle, this.automationSelect, this.automationForm);
    this.automationClose = document.createElement('button');
    this.automationClose.className = 'fleet-info-close';
    this.automationClose.type = 'button';
    this.automationClose.setAttribute('aria-label', 'Chiudi automazioni');
    this.automationClose.textContent = '\u00d7';
    const automationFrame = document.createElement('div');
    automationFrame.className = 'fleet-info-frame';
    automationFrame.setAttribute('aria-hidden', 'true');
    automationPanel.append(this.automationClose, automationContent, automationFrame);
    this.automationOverlay.append(automationPanel);
    this.automationClose.addEventListener('click', () => this.closeAutomation());
    this.automationOverlay.addEventListener('click', event => {
      if (event.target === this.automationOverlay) this.closeAutomation();
    });
    this.automationOverlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeAutomation();
    });
    document.body.append(this.automationOverlay);
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
      btn.addEventListener('click', () => this.emit(action, className === 'clockwise' || className === 'zoom-out' ? -1 : 1));
      this.toolbar.append(btn);
    }
    document.body.append(this.toolbar);
    this.status = document.createElement('div');
    this.status.className = 'status';
    this.list = document.createElement('div');
    this.list.className = 'fleet-list';
    this.content.append(this.status, this.list);
    this.renderTimer = setInterval(() => this.render(), 1000);
  }

  destroy() {
    clearInterval(this.renderTimer);
    this.toolbar.remove();
    this.infoOverlay.remove();
    this.automationOverlay.remove();
    this.content.replaceChildren();
  }

  openFleetInfo(fleet) {
    this.infoTitle.textContent = fleet.name;
    this.infoBody.replaceChildren();
    appendInfoData(this.infoBody, {
      fleetName: fleet.name,
      fleetId: fleet.id,
      profileId: this.snapshot.profileId,
      ...fleet.chainData,
    });
    this.infoOverlay.hidden = false;
    this.infoClose.focus();
  }

  closeFleetInfo() {
    this.infoOverlay.hidden = true;
  }

  openAutomation(fleet) {
    this.automationSelect.value = '';
    this.automationForm.hidden = true;
    this.populateAutomationForm(fleet);
    this.automationOverlay.hidden = false;
    this.automationClose.focus();
  }

  populateAutomationForm(fleet) {
    this.automationLeft.replaceChildren();
    this.automationRight.replaceChildren();
    const chainData = fleet.chainData ?? {};
    const movementStats = chainData.stats?.movement_stats ?? {};
    const rawSubwarpSpeed = movementStats.subwarp_speed;
    const subwarpSpeed = rawSubwarpSpeed == null || !Number.isFinite(Number(rawSubwarpSpeed))
      ? ''
      : (Number(rawSubwarpSpeed) / 1_000_000).toFixed(4).replace('.', ',');
    const addInput = (parent, label, value = '', readOnly = false) => appendAutomationInput(parent, label, value, readOnly);
    const addCheck = (parent, label, checked = false) => appendAutomationCheckbox(parent, label, checked);

    addInput(this.automationLeft, 'IP API', '127.0.0.1');
    addInput(this.automationLeft, 'Nome Flotta', fleet.name, true);
    addCheck(this.automationLeft, 'doubleSB');
    addInput(this.automationLeft, 'Prima SB', '11,-16');
    addInput(this.automationLeft, 'Range cella', '3');
    addInput(this.automationLeft, 'Range SB', '30');
    addInput(this.automationLeft, 'Peso count', '0.2');
    addInput(this.automationLeft, 'Peso growing', '0.2');
    addInput(this.automationLeft, 'Fuel minimo', '30');
    addInput(this.automationLeft, 'Fuel max', '40');
    addInput(this.automationLeft, 'Cooldown', '300');
    addCheck(this.automationLeft, 'Onchain mode');
    addCheck(this.automationLeft, 'Simula scan-filter locale', true);
    addInput(this.automationLeft, 'Safety mult', '1.15');
    addInput(this.automationLeft, 'Onchain URL', 'http://127.0.0.1:3010/intent');
    addInput(this.automationLeft, 'Subwarp Speed', subwarpSpeed, true);
    addCheck(this.automationLeft, 'smartRange', true);
    addCheck(this.automationLeft, 'coeffsdu1', true);

    addInput(this.automationRight, 'Porta API', '3000');
    addInput(this.automationRight, 'Id Flotta', fleet.id, true);
    addInput(this.automationRight, 'Seconda SB', '-14,-16');
    addInput(this.automationRight, 'Range consigliato', '1.5');
    addInput(this.automationRight, 'Area range', '15');
    addInput(this.automationRight, 'Peso sdu', '0.0002');
    addInput(this.automationRight, 'Time Window', '0');
    addInput(this.automationRight, 'Fuel range min', '10');
    addInput(this.automationRight, 'Food min', '10');
    addInput(this.automationRight, 'Timeout API', '10');
    addCheck(this.automationRight, 'Fallback legacy', true);
    addCheck(this.automationRight, 'Test senza status click', true);
    addCheck(this.automationRight, 'Safety checks', true);
    addInput(this.automationRight, 'Fuel/unit', '0.65');
    addInput(this.automationRight, 'Fuel reserve %', '2');
    addCheck(this.automationRight, 'coeffcount1', true);
    addCheck(this.automationRight, 'coeffgrowing1', true);
    addInput(this.automationRight, '% minima (pause strike)', '10');
    addInput(this.automationRight, 'Strike soglia', '5');

  }

  closeAutomation() {
    this.automationOverlay.hidden = true;
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
      const icon = document.createElement('img');
      icon.className = 'ship-icon';
      icon.src = `/sea/assets/ships_clean/${shipLook(fleet).model}_furled.png`;
      icon.alt = '';
      icon.setAttribute('aria-hidden', 'true');
      const name = document.createElement('div');
      name.className = 'name';
      const nameText = document.createElement('span');
      nameText.className = 'fleet-name';
      nameText.textContent = fleet.name;
      const actions = document.createElement('span');
      actions.className = 'fleet-actions';
      for (const [label, symbol] of [['Informazioni', 'i'], ['Automazione', '\u2699']]) {
        const action = document.createElement('button');
        action.className = 'fleet-action';
        action.setAttribute('aria-label', label);
        action.title = label;
        action.textContent = symbol;
        action.type = 'button';
        action.addEventListener('click', event => {
          event.stopPropagation();
          if (label === 'Informazioni') this.openFleetInfo(fleet);
          else this.openAutomation(fleet);
        });
        actions.append(action);
      }
      name.append(nameText, actions);
      const detail = document.createElement('div');
      detail.className = 'detail';
      el.append(icon, name, detail);
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
