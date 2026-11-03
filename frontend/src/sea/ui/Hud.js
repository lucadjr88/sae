import { Emitter } from '../util/emitter.js';
import { STALE_AFTER_MS } from '../config.js';
import { shipLook } from '../map/shipSprites.js';
import { buildScanFilterPayload, fuelReachableRadius, requestScanFilter, resolveStarbaseList, simulateScanFilterResponse } from '../automation/scanFilter.js';
import { resolveScanOperation } from '../automation/scanOperation.js';
import { ScanPolicy } from '../automation/scanPolicy.js';
import { SeaTransactionClient } from '../automation/seaTransactionClient.js';
import { LocalSigner } from '../automation/localSigner.js';

const fmtSector = s => `(${s[0]}, ${s[1]})`;

// Log compatto su una riga: [SDU] step fleet=abcd12 k=v ...
const trace = (step, fleetId, info = {}) => {
  const kv = Object.entries(info).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' ');
  console.debug(`[SDU] ${step} fleet=${String(fleetId).slice(0, 6)}${kv ? ` ${kv}` : ''}`);
};

function fmtEta(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function describe(fleet, now, nameAt, scanSummary) {
  if (fleet.state === 'MoveWarp' || fleet.state === 'MoveSubwarp') {
    const kind = fleet.state === 'MoveWarp' ? 'warp' : 'subwarp';
    return `${kind} → ${nameAt(fleet.to)} · arrivo ${fmtEta(fleet.arrival - now)}`;
  }
  if (fleet.state === 'Idle' && scanSummary) return scanSummary;
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

    function appendAutomationInput(parent, labelText, value = '', readOnly = false, param = '') {
  const field = document.createElement('label');
  field.className = 'automation-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value == null ? '' : String(value);
  input.readOnly = readOnly;
  input.dataset.configKey = param || `field:${labelText}`;
  if (param) input.dataset.scanParam = param;
  if (readOnly) input.title = 'Dato letto dalla flotta on-chain';
  field.append(label, input);
  parent.append(field);
  return input;
}

function appendAutomationCheckbox(parent, labelText, checked = false, param = '') {
  const field = document.createElement('label');
  field.className = 'automation-checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset.configKey = param || `field:${labelText}`;
  if (param) input.dataset.scanParam = param;
  const label = document.createElement('span');
  label.textContent = labelText;
  field.append(input, label);
  parent.append(field);
  return input;
}

function appendAutomationRadioGroup(parent, labelText, options, selected, param) {
  const field = document.createElement('fieldset');
  field.className = 'automation-radio-group';
  const legend = document.createElement('legend');
  legend.textContent = labelText;
  field.append(legend);
  for (const [value, optionLabel] of options) {
    const option = document.createElement('label');
    option.className = 'automation-radio-option';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `sea-${param}`;
    input.value = value;
    input.checked = value === selected;
    input.dataset.configKey = param;
    const text = document.createElement('span');
    text.textContent = optionLabel;
    option.append(input, text);
    field.append(option);
  }
  parent.append(field);
  return field;
}

function appendSettingsInput(parent, labelText, value = '', readOnly = false, param = '') {
  const field = document.createElement('div');
  field.className = 'settings-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value == null ? '' : String(value);
  input.readOnly = readOnly;
  input.dataset.configKey = param || `field:${labelText}`;
  if (param) input.dataset.scanParam = param;
  field.append(label, input);
  parent.append(field);
  return input;
}

function appendSettingsCheckbox(parent, labelText, checked = false, param = '') {
  const field = document.createElement('label');
  field.className = 'settings-checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.dataset.configKey = param || `field:${labelText}`;
  if (param) input.dataset.scanParam = param;
  const label = document.createElement('span');
  label.textContent = labelText;
  field.append(input, label);
  parent.append(field);
  return input;
}

// Eventi: 'select' (fleetId). Usa solo textContent: i nomi flotta sono dati esterni.
export class Hud extends Emitter {
  constructor(root, starbases = [], wallet = null) {
    super();
    this.root = root;
    this.wallet = wallet ?? window.wallet ?? null;
    this.localSigner = new LocalSigner();
    this.transactionClient = new SeaTransactionClient(this.wallet, fetch, this.localSigner);
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
    this.automationForm.addEventListener('input', () => this.captureActiveAutomationConfig());
    this.automationForm.addEventListener('change', () => this.captureActiveAutomationConfig());
    this.automationStatus = document.createElement('div');
    this.automationStatus.className = 'automation-status';
    this.automationStatus.setAttribute('role', 'status');
    this.automationLeft = document.createElement('div');
    this.automationLeft.className = 'automation-column';
    this.automationRight = document.createElement('div');
    this.automationRight.className = 'automation-column';
    this.automationForm.append(this.automationLeft, this.automationRight);
    this.automationRequestButton = document.createElement('button');
    this.automationRequestButton.className = 'automation-request';
    this.automationRequestButton.type = 'button';
    this.automationRequestButton.textContent = 'Richiedi destinazione';
    this.automationRequestButton.hidden = true;
    this.automationResult = document.createElement('div');
    this.automationResult.className = 'automation-result';
    this.automationResult.setAttribute('role', 'status');
    this.automationScanButton = document.createElement('button');
    this.automationScanButton.className = 'automation-scan-preview';
    this.automationScanButton.type = 'button';
    this.automationScanButton.textContent = 'Prepara scan';
    this.automationScanButton.hidden = true;
    this.automationScanResult = document.createElement('pre');
    this.automationScanResult.className = 'automation-scan-result';
    this.automationScanResult.hidden = true;
    this.automationScanSubmitButton = document.createElement('button');
    this.automationScanSubmitButton.className = 'automation-scan-submit';
    this.automationScanSubmitButton.type = 'button';
    this.automationScanSubmitButton.textContent = 'Firma e invia scan';
    this.automationScanSubmitButton.hidden = true;
    this.automationSaveButton = document.createElement('button');
    this.automationSaveButton.className = 'automation-save';
    this.automationSaveButton.type = 'button';
    this.automationSaveButton.textContent = 'Salva';
    this.automationSaveButton.hidden = true;
    this.automationToggleButton = document.createElement('button');
    this.automationToggleButton.className = 'automation-toggle';
    this.automationToggleButton.type = 'button';
    this.automationToggleButton.textContent = 'Avvia automazione';
    this.automationToggleButton.hidden = true;
    this.automationToggleButton.disabled = true;
    this.automationFleetStates = new Map();
    this.fleetAutomations = new Map();
    this.fleetScanSummaries = new Map();
    this.fleetStatusOverrides = new Map();
    this.automationSelect.addEventListener('change', () => {
      if (this.automationSelect.value !== 'sdu-program') this.stopAutomation();
      this.automationForm.hidden = this.automationSelect.value !== 'sdu-program';
      this.automationRequestButton.hidden = this.automationSelect.value !== 'sdu-program';
      this.automationSaveButton.hidden = this.automationSelect.value !== 'sdu-program';
      this.automationToggleButton.hidden = this.automationSelect.value !== 'sdu-program';
      this.refreshAutomationState();
      this.automationResult.textContent = '';
      this.automationScanButton.hidden = true;
      this.automationScanResult.hidden = true;
      this.automationScanSubmitButton.hidden = true;
      if (this.automationSelect.value === 'sdu-program') this.updateAutomationActionButton();
      this.refreshAutomationState();
    });
    automationContent.append(automationTitle, this.automationSelect, this.automationForm, this.automationSaveButton, this.automationRequestButton, this.automationToggleButton, this.automationResult, this.automationScanButton, this.automationScanSubmitButton, this.automationScanResult, this.automationStatus);
    this.automationSaveButton.addEventListener('click', () => this.saveAutomationConfig());
    this.automationRequestButton.addEventListener('click', () => this.requestAutomationDestination());
    this.automationScanButton.addEventListener('click', () => this.prepareAutomationScan());
    this.automationScanSubmitButton.addEventListener('click', () => this.submitPreparedScan());
    this.automationToggleButton.addEventListener('click', () => {
      const auto = this.getCurrentAutoState();
      if (auto?.running) this.stopAutomation(auto.fleetId);
      else if (auto?.faulted) this.acknowledgeAutomationFault(auto.fleetId);
      else this.startAutomation();
    });
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

    // --- Settings overlay (parametri globali, non per-flotta) ---
    this.settingsEl = document.getElementById('settings');
    this.settingsClose = document.createElement('button');
    this.settingsClose.className = 'settings-close';
    this.settingsClose.type = 'button';
    this.settingsClose.setAttribute('aria-label', 'Chiudi impostazioni');
    this.settingsClose.textContent = '\\u00d7';
    this.settingsFormEl = this.settingsEl.querySelector('.settings-form');
    this.settingsLeft = document.createElement('div');
    this.settingsLeft.className = 'settings-column';
    this.settingsRight = document.createElement('div');
    this.settingsRight.className = 'settings-column';
    this.settingsFormEl.append(this.settingsLeft, this.settingsRight);

    const settingsBtn = document.querySelector('.sea-topbar__settings');
    if (settingsBtn) {
      settingsBtn.style.cursor = 'pointer';
      settingsBtn.addEventListener('click', () => this.openSettings());
    }
    this.settingsClose.addEventListener('click', () => this.closeSettings());
    this.settingsEl.addEventListener('click', event => {
      if (event.target === this.settingsEl) this.closeSettings();
    });
    this.settingsEl.addEventListener('keydown', event => {
      if (event.key === 'Escape') this.closeSettings();
    });

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
    for (const fleetId of this.fleetAutomations.keys()) this.stopAutomation(fleetId);
    clearInterval(this.renderTimer);
    this.toolbar.remove();
    this.infoOverlay.remove();
    this.automationOverlay.remove();
    this.settingsEl.hidden = true;
    this.content.replaceChildren();
  }

  openFleetInfo(fleet) {
    this.infoTitle.textContent = fleet.name;
    this.infoBody.replaceChildren();
    appendInfoData(this.infoBody, {
      fleetName: fleet.name,
      fleetId: fleet.id,
      profileId: this.snapshot.profileId,
      lastScanResult: this.fleetScanSummaries.get(fleet.id) ?? null,
      ...fleet.chainData,
    });
    this.infoOverlay.hidden = false;
    this.infoClose.focus();
  }

  closeFleetInfo() {
    this.infoOverlay.hidden = true;
  }

  getFleetAutomation(fleetId) {
    if (!this.fleetAutomations.has(fleetId)) {
      this.fleetAutomations.set(fleetId, {
        fleetId,
        running: false,
        faulted: false,
        runId: 0,
        requestId: 0,
        runTimer: null,
        destination: null,
        lastScanSummary: '',
        scanTransaction: null,
        preparedResult: null,
        preparedAction: null,
        resources: null,
        resourcesLoadedFor: null,
        resourcesLoadedAt: 0,
        config: null,
        initialScanPending: false,
        initialScanReady: false,
        resumeAfterExit: false,
        waitingForEta: false,
        awaitingMovementStart: false,
        awaitingMovementExit: false,
        needsScanAfterMovement: false,
        submissionPending: false,
        actionPending: false,
        postScanReady: false,
        resupply: null,
        resupplyRequested: false,
        lastKnownSector: null,
        fuelCurrent: null,
        fuelCapacity: null,
        scanPolicy: new ScanPolicy(),
      });
    }
    return this.fleetAutomations.get(fleetId);
  }

  getAutoState(fleetId) {
    return this.getFleetAutomation(fleetId);
  }

  getCurrentAutoState() {
    return this.automationFleet ? this.getFleetAutomation(this.automationFleet.id) : null;
  }

  isAutomationFleetSelected(fleetId) {
    return Boolean(fleetId && this.automationFleet?.id === fleetId);
  }

  // Mantiene in memoria le modifiche della flotta corrente quando si cambia pannello.
  saveActiveFleetAutomation() {
    const auto = this.getCurrentAutoState();
    if (auto && !this.automationOverlay.hidden) auto.config = this.readAutomationConfig();
  }

  captureActiveAutomationConfig() {
    if (!this.automationOverlay.hidden) this.saveActiveFleetAutomation();
  }

  readAutomationConfig(includeReadonlyScanParams = true) {
    const config = {};
    for (const control of this.automationForm.querySelectorAll('[data-config-key]')) {
      if (control.readOnly && (!includeReadonlyScanParams || !control.dataset.scanParam)) continue;
      if (control instanceof HTMLInputElement && control.type === 'radio' && !control.checked) continue;
      config[control.dataset.configKey] = control instanceof HTMLInputElement && control.type === 'checkbox'
        ? control.checked
        : control.value;
    }
    return config;
  }

  applyAutomationConfig(config) {
    for (const control of this.automationForm.querySelectorAll('[data-config-key]')) {
      if (control.readOnly || !(control.dataset.configKey in config)) continue;
      if (control instanceof HTMLInputElement && control.type === 'radio') {
        control.checked = control.value === String(config[control.dataset.configKey]);
      } else if (control instanceof HTMLInputElement && control.type === 'checkbox') {
        control.checked = Boolean(config[control.dataset.configKey]);
      } else {
        control.value = String(config[control.dataset.configKey]);
      }
    }
  }

  loadFleetAutomationForm(fleet, auto) {
    this.populateAutomationForm(fleet);
    this.loadAutomationConfig(fleet);
    if (auto.config) this.applyAutomationConfig(auto.config);
    auto.config = this.readAutomationConfig();
    this.updateRecommendedRange();
  }

  openAutomation(fleet) {
    if (this.automationFleet?.id !== fleet.id) this.saveActiveFleetAutomation();
    const auto = this.getFleetAutomation(fleet.id);
    const continuing = auto.running || auto.faulted;
    this.automationFleet = fleet;

    if (!continuing) {
      auto.scanPolicy.reset();
      auto.runId += 1;
      auto.requestId += 1;
      auto.running = false;
      clearTimeout(auto.runTimer);
      auto.runTimer = null;
      this.automationSelect.value = '';
      this.automationForm.hidden = true;
      this.automationRequestButton.hidden = true;
      this.automationSaveButton.hidden = true;
      this.automationToggleButton.hidden = true;
      this.automationResult.textContent = '';
      auto.destination = null;
      auto.lastScanSummary = '';
      auto.scanTransaction = null;
      auto.preparedResult = null;
      auto.preparedAction = null;
      this.automationScanButton.hidden = true;
      this.automationScanResult.hidden = true;
      this.automationScanSubmitButton.hidden = true;
      auto.resources = null;
      auto.initialScanPending = false;
      auto.initialScanReady = false;
      auto.resumeAfterExit = false;
      auto.waitingForEta = false;
      auto.awaitingMovementStart = false;
      auto.awaitingMovementExit = false;
      auto.needsScanAfterMovement = false;
      auto.submissionPending = false;
      auto.actionPending = false;
      auto.faulted = this.automationFleetStates.get(fleet.id) === 'faulted';
      if ((fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp') && fleet.to) {
        auto.destination = { x: fleet.to[0], y: fleet.to[1], sb: null };
      }
      this.automationRequestButton.disabled = true;
      this.automationToggleButton.disabled = true;
      this.setAutomationFleetState(fleet.id, 'unavailable');
      this.automationStatus.textContent = 'Lettura risorse on-chain…';
      this.loadFleetAutomationForm(fleet, auto);
    } else {
      this.automationFleet = this.snapshot.fleets.find(item => item.id === fleet.id) ?? fleet;
      this.automationSelect.value = 'sdu-program';
      this.automationForm.hidden = false;
      this.automationRequestButton.hidden = false;
      this.automationSaveButton.hidden = false;
      this.automationToggleButton.hidden = false;
      this.loadFleetAutomationForm(this.automationFleet, auto);
      if (auto.destination) this.updateAutomationActionButton(fleet.id);
      this.refreshAutomationState();
    }
    this.automationResult.textContent = auto.lastScanSummary;
    this.automationScanResult.textContent = auto.preparedResult ? JSON.stringify(auto.preparedResult, null, 2) : '';
    this.automationScanResult.hidden = !auto.preparedResult;
    this.automationScanSubmitButton.hidden = !auto.scanPrepareId;
    if (auto.running) this.automationStatus.textContent = 'Automazione attiva';
    else if (auto.faulted) this.automationStatus.textContent = 'Automazione bloccata per errore · premi Arresta per sbloccare';
    else if (auto.resources) {
      this.automationStatus.textContent = `Fuel ${auto.resources.fuelCurrent.toFixed(2)} / ${auto.resources.fuelCapacity.toFixed(2)} (${auto.resources.fuelCurrentPct.toFixed(1)}%) · Food ${auto.resources.foodCurrent.toFixed(2)}`;
    }
    this.automationOverlay.hidden = false;
    if (auto.destination) this.updateAutomationActionButton(fleet.id);
    this.automationClose.focus();
    if (!continuing) {
      const requestId = ++auto.requestId;
      this.loadAutomationResources(fleet, requestId);
    }
  }

  async loadAutomationResources(fleet, requestId) {
    const auto = this.getFleetAutomation(fleet.id);
    if (requestId !== auto.requestId) return false;
    const now = Date.now();
    // Se conosciamo già il fuel in modo locale (aggiornato dopo un movement start,
    // modello Sly: zero RPC durante movimento/scan cooldown), riusiamo il valore
    // senza chiamare /api/sea/fleet-resources.
    if (
      auto.fuelCurrent != null &&
      auto.fuelCapacity != null &&
      (fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp' || auto.awaitingMovementExit)
    ) {
      const resources = {
        fuelCurrent: auto.fuelCurrent,
        fuelCapacity: auto.fuelCapacity,
        fuelCurrentPct: auto.fuelCapacity > 0 ? (auto.fuelCurrent / auto.fuelCapacity) * 100 : 0,
        foodCurrent: auto.resources?.foodCurrent ?? 0,
      };
      auto.resources = resources;
      auto.resourcesLoadedFor = fleet.id;
      auto.resourcesLoadedAt = now;
      this.observeAutomationFuel(resources, fleet.id);
      if (requestId !== auto.requestId) return;
      if (this.isAutomationFleetSelected(fleet.id)) {
        this.automationRequestButton.disabled = auto.running;
        this.automationStatus.textContent = `Fuel locale ${resources.fuelCurrent.toFixed(2)} / ${resources.fuelCapacity.toFixed(2)} (${resources.fuelCurrentPct.toFixed(1)}%) · movimento in corso`;
        this.refreshAutomationState(fleet.id);
      }
      return true;
    }
    // Evita chiamate duplicate per lo stesso fleetId entro una soglia breve:
    // i dati on-chain (fuel/food) cambiano lentamente, riusare la cache evita RPC inutili.
    if (
      auto.resourcesLoadedFor === fleet.id &&
      auto.resources &&
      now - auto.resourcesLoadedAt < 30_000
    ) {
      if (requestId !== auto.requestId) return;
      const resources = auto.resources;
      for (const key of ['fuelCurrent', 'fuelCapacity', 'fuelCurrentPct', 'foodCurrent']) {
        if (typeof resources[key] !== 'number' || !Number.isFinite(resources[key])) {
          throw new Error(`INVALID_FLEET_RESOURCES_CACHE:${key}`);
        }
      }
      this.observeAutomationFuel(resources, fleet.id);
      if (this.isAutomationFleetSelected(fleet.id)) {
        this.automationRequestButton.disabled = auto.running;
        this.automationStatus.textContent = `Fuel ${resources.fuelCurrent.toFixed(2)} / ${resources.fuelCapacity.toFixed(2)} (${resources.fuelCurrentPct.toFixed(1)}%) · Food ${resources.foodCurrent.toFixed(2)}`;
        this.refreshAutomationState(fleet.id);
      }
      return true;
    }

    try {
      const query = new URLSearchParams({ profileId: this.snapshot.profileId, fleetId: fleet.id });
      const response = await fetch(`/api/sea/fleet-resources?${query}`);
      const resources = await response.json();
      if (!response.ok) throw new Error(resources.error || 'resource lookup failed');
      // Validazione difensiva: i campi numerici devono essere presenti e finiti
      for (const key of ['fuelCurrent', 'fuelCapacity', 'fuelCurrentPct', 'foodCurrent']) {
        if (typeof resources[key] !== 'number' || !Number.isFinite(resources[key])) {
          throw new Error(`INVALID_FLEET_RESOURCES:${key}`);
        }
      }
      if (requestId !== auto.requestId) return;
      auto.resources = resources;
      auto.resourcesLoadedFor = fleet.id;
      auto.resourcesLoadedAt = now;
      this.observeAutomationFuel(resources, fleet.id);
      trace('resources', fleet.id, { fuel: resources?.fuelCurrent, fuelPct: resources?.fuelCurrentPct?.toFixed?.(1), food: resources?.foodCurrent });
      if (this.isAutomationFleetSelected(fleet.id)) {
        this.automationRequestButton.disabled = auto.running;
        this.automationStatus.textContent = `Fuel ${resources.fuelCurrent.toFixed(2)} / ${resources.fuelCapacity.toFixed(2)} (${resources.fuelCurrentPct.toFixed(1)}%) · Food ${resources.foodCurrent.toFixed(2)}`;
        this.refreshAutomationState(fleet.id);
      }
      return true;
    } catch (error) {
      if (requestId !== auto.requestId) return false;
      console.error('[SDU] fleet resource read failed', { fleetId: fleet.id, error });
      auto.resources = null;
      if (this.isAutomationFleetSelected(fleet.id)) {
        this.automationRequestButton.disabled = true;
        this.automationStatus.textContent = 'Risorse on-chain non disponibili';
        this.refreshAutomationState(fleet.id);
      }
      return false;
    }
  }

  async requestAutomationDestination(fleetId = this.automationFleet?.id) {
    if (!fleetId) return false;
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    const auto = this.getFleetAutomation(fleetId);
    const runId = auto.runId;
    try {
      if (!fleet) throw new Error('Flotta assente dallo snapshot aggiornato');
      if (fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp') {
        if (fleet.to) auto.destination = { x: fleet.to[0], y: fleet.to[1], sb: null };
        this.updateAutomationActionButton(fleetId);
        const remaining = Math.max(0, fleet.arrival - Date.now());
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationResult.textContent = remaining > 0
            ? `${fleet.state} in corso · uscita disponibile tra ${Math.ceil(remaining / 1000)}s`
            : `${fleet.state} arrivato · prepara l’uscita prima di richiedere una nuova destinazione`;
        }
        return false;
      }
      if (fleet.state !== 'Idle' || !fleet.sector) throw new Error('Flotta non pronta per una richiesta di destinazione');
      const previousCell = fleet.sector;
      const strikeThresholdRaw = auto.config?.pause_strike_iniziale
        ?? this.automationForm.querySelector('[data-scan-param="pause_strike_iniziale"]')?.value;
      const minimumPctRaw = auto.config?.percentuale_minima
        ?? this.automationForm.querySelector('[data-scan-param="percentuale_minima"]')?.value;
      const policy = auto.scanPolicy;
      const strikeBeforeRequest = policy.pauseStrike;
      const requestType = policy.takeRequestType(strikeThresholdRaw);
      const resetCounts = policy.takeResetCounts();
      if (requestType === 'area') {
        console.info('[SDU] area request selected', {
          fleetId: fleet.id,
          pauseStrike: strikeBeforeRequest,
          strikeThreshold: strikeThresholdRaw,
        });
      }
      const payload = buildScanFilterPayload({
        form: this.automationForm,
        config: auto.config,
        fleet,
        currentCoords: previousCell,
        resources: auto.resources,
        movementMode: auto.config?.movementMode
          ?? this.automationForm.querySelector('input[name="sea-movementMode"]:checked')?.value
          ?? 'subwarp',
        requestType,
        resetCounts,
        lastScanOutcome: auto.pendingScanOutcome ? {
          ...auto.pendingScanOutcome,
          strike: `${strikeBeforeRequest}/${Number.isFinite(Number.parseInt(String(strikeThresholdRaw ?? '').trim(), 10)) ? Number.parseInt(String(strikeThresholdRaw).trim(), 10) : 5}`,
        } : null,
      });
      console.info(`[SDU] scan-filter payload\n${JSON.stringify(payload, null, 2)}`);
      const simulate = this.settingsSimulateScanFilter?.checked ?? false;
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationRequestButton.disabled = true;
        this.automationResult.textContent = 'Selezione destinazione…';
      }
      auto.scanTransaction = null;
      if (this.isAutomationFleetSelected(fleetId)) this.automationScanResult.hidden = true;
      console.debug('[SDU] destination selection started', { fleetId: fleet.id, simulate });
      const result = simulate
        ? simulateScanFilterResponse(payload, strikeBeforeRequest)
        : await requestScanFilter({
          host: this.settingsApiHost?.value,
          port: this.settingsApiPort?.value,
          timeoutSeconds: this.settingsRequestTimeout?.value,
          payload,
        });
      if (auto.runId !== runId) return false;
      if (payload.esito_ultimo_scan) auto.pendingScanOutcome = null;
      const currentStrike = policy.completeSelection({
        requestType,
        minimumPct: minimumPctRaw,
      });
      const parsedThreshold = Number.parseInt(String(strikeThresholdRaw ?? '').trim(), 10);
      const thresholdDisplay = Number.isFinite(parsedThreshold) ? parsedThreshold : 5;
      console.info('[SDU] pause_strike updated', {
        fleetId: fleet.id,
        requestType,
        strike: `${currentStrike}/${thresholdDisplay}`,
      });
      auto.destination = { x: Number(result.x), y: Number(result.y), sb: result.sb ?? null };
      this.updateAutomationActionButton(fleetId);
      if (this.isAutomationFleetSelected(fleetId)) this.automationScanResult.hidden = true;
      if (simulate) console.debug('[SDU] simulated scan-filter response', result);
      const destinationSummary = `Destinazione ${result.x},${result.y} [${requestType}]${result.sb ? ` · SB ${result.sb}` : ''}${result['%'] == null ? '' : ` · API ${result['%']}%`} · strike ${currentStrike}/${thresholdDisplay}${result.source === 'simulated' ? ' · simulata' : ''}`;
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationResult.textContent = [auto.lastScanSummary, destinationSummary].filter(Boolean).join(' · ');
      }
      return true;
    } catch (error) {
      if (auto.runId !== runId) return false;
      console.error('[SDU] destination selection failed', { fleetId: fleet?.id, error });
      auto.destination = null;
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationScanButton.hidden = true;
        this.automationResult.textContent = error instanceof Error ? error.message : 'Errore richiesta destinazione';
      }
      return false;
    } finally {
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationRequestButton.disabled = auto.running || !auto.resources;
      }
    }
  }

  async prepareAutomationScan(fleetId = this.automationFleet?.id) {
    if (!fleetId) return false;
    const auto = this.getFleetAutomation(fleetId);
    const runId = auto.runId;
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    const destination = auto.destination;
    if (!fleet || !destination) {
      console.debug('[SDU] prepareAutomationScan: missing fleet or destination', { fleetId, hasDestination: Boolean(destination) });
      return false;
    }
    if (!this.isAutomationFleetSelected(fleetId) && !auto.running) return false;
    const movementMode = auto.config?.movementMode
      ?? this.automationForm.querySelector('input[name="sea-movementMode"]:checked')?.value
      ?? 'subwarp';
    const starbase = auto.config?.sbCoords
      ?? this.automationForm.querySelector('[data-scan-param="sbCoords"]')?.value;
    let operation = resolveScanOperation(fleet, destination, movementMode);
    trace('prepare', fleet.id, { state: fleet.state, dest: `${destination.x},${destination.y}`, action: operation?.action, needsScan: auto.needsScanAfterMovement });
    // Dopo una movement exit già confermata su chain, lo snapshot può essere obsoleto (MoveSubwarp).
    // Forziamo la scan invece di preparare una exit ridondante.
    if (auto.needsScanAfterMovement && !auto.resumeAfterExit) {
      const lastAction = auto.preparedAction;
      if (lastAction === 'subwarp_start' || lastAction === 'warp_start') {
        operation = { status: 'ready', action: lastAction === 'subwarp_start' ? 'subwarp_exit' : 'warp_exit' };
        console.debug('[SDU] prepareAutomationScan: forced exit after movement start', { fleetId: fleet.id, lastAction, action: operation.action });
      } else {
        // Movimento già completato su chain o exit già fatta: procediamo con lo scan.
        operation = { status: 'ready', action: 'scan' };
        console.debug('[SDU] prepareAutomationScan: forced scan after movement exit (snapshot stale)', { fleetId: fleet.id, lastAction });
      }
    }
    if (operation.status === 'waiting') {
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationScanResult.hidden = false;
        this.automationScanResult.textContent = 'Movimento in corso; attendere l’arrivo chain.';
      }
      return false;
    }
    if (operation.status !== 'ready') {
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationScanResult.hidden = false;
        this.automationScanResult.textContent = `Stato flotta ${fleet.state}: preparazione non disponibile.`;
      }
      return false;
    }
    const { action } = operation;
    if (auto.initialScanPending && action === 'scan' && !auto.initialScanReady) {
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationScanResult.hidden = false;
        this.automationScanResult.textContent = 'Scan non ancora disponibile: cooldown on-chain attivo.';
      }
      return false;
    }
    if (this.isAutomationFleetSelected(fleetId)) {
      this.automationScanButton.disabled = true;
      this.automationScanResult.hidden = false;
      this.automationScanResult.textContent = 'Connessione wallet e simulazione…';
    }
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        const result = await this.transactionClient.prepareAction({
        profileId: this.snapshot.profileId,
        fleetId: fleet.id,
        destination: action.endsWith('_exit') && fleet.to
          ? { x: fleet.to[0], y: fleet.to[1] }
          : destination,
        action,
        starbase: action === 'subwarp_start' || action === 'warp_start'
          ? destination.sb || starbase
          : undefined,
        feeMode: this.settingsUseSlyFee?.checked ? 'sly' : 'wallet',
        priorityFeeLamports: this.settingsPriorityFeeInput?.value ?? '1',
      });
      if (auto.runId !== runId) return false;
      // Sly: se il backend segnala che la flotta è già Idle (exit precedente andata a buon fine
      // ma conferma persa su WebSocket instabile), procediamo direttamente con la scan usando
      // il sector reale restituito dal backend, invece di fallire con 409 o coordinate undefined.
      if (result.status === 'ALREADY_IDLE') {
        auto.awaitingMovementExit = false;
        auto.resumeAfterExit = false;
        auto.needsScanAfterMovement = true;
        auto.initialScanPending = true;
        auto.initialScanReady = false;
        if (result.sector) {
          auto.destination = { x: result.sector[0], y: result.sector[1], sb: null };
        }
        if (this.isAutomationFleetSelected(fleetId)) this.automationScanResult.textContent = 'Movimento già completato su chain · avvio scansione';
        await this.beginInitialAutomationScan(auto.runId, result, fleetId);
        return true;
      }
      auto.scanTransaction = result.transaction;
      auto.preparedResult = result;
      auto.scanPrepareId = result.prepareId ?? null;
      auto.preparedAction = result.action;
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationScanSubmitButton.textContent = auto.preparedAction === 'subwarp_start'
          ? 'Firma e avvia Subwarp'
          : auto.preparedAction === 'warp_start'
            ? 'Firma e avvia Warp'
          : auto.preparedAction === 'subwarp_exit'
            ? 'Firma e completa Subwarp'
            : auto.preparedAction === 'warp_exit'
              ? 'Firma e completa Warp'
            : 'Firma e invia scan';
        this.automationScanSubmitButton.hidden = !result.prepareId || Boolean(result.simulation.err);
        this.automationScanResult.textContent = JSON.stringify({
        action: result.action ?? action,
        fleetId: result.fleetId,
        coordinates: result.coordinates,
        fuelCurrent: result.fuelCurrent,
        fuelRequiredRoundTrip: result.fuelRequiredRoundTrip,
        arrivalSeconds: result.arrivalSeconds,
        instructions: result.instructions,
        feePolicy: result.feePolicy,
        simulation: result.simulation,
        }, null, 2);
      }
      if (result.simulation.err) {
        const auto2 = this.getFleetAutomation(fleet.id);
        auto2.scanTransaction = null;
        auto2.scanPrepareId = null;
        console.error('[SDU] transaction simulation rejected', {
          fleetId: fleet.id,
          coordinates: result.coordinates,
          error: result.simulation.err,
          logs: result.simulation.logs ?? [],
        });
      }
      console.info('[SDU] scan prepared and simulated', {
        action: result.action ?? action,
        fleetId: result.fleetId,
        coordinates: result.coordinates,
        instructions: result.instructions,
        simulationError: result.simulation.err,
        unitsConsumed: result.simulation.unitsConsumed,
      });
      const prepared = Boolean(result.prepareId && !result.simulation.err);
      if (!prepared && auto.initialScanPending && auto.running) this.failAutomation(fleetId);
      return prepared;
    } catch (error) {
      const auto3 = this.getFleetAutomation(fleet.id);
      auto3.scanTransaction = null;
      auto3.preparedResult = null;
      auto3.scanPrepareId = null;
      if (this.isAutomationFleetSelected(fleetId)) this.automationScanSubmitButton.hidden = true;
      const movementExit = action === 'subwarp_exit' || action === 'warp_exit';
      const movementExitCompletedOnChain =
        movementExit && error instanceof Error && error.message === 'FLEET_NOT_IN_MOVEMENT';
      if (movementExitCompletedOnChain && auto.running) {
        console.warn(
          '[SDU] movement exit rejected during preparation: fleet already Idle on chain; proceeding to scan',
          { fleetId: fleet.id, action }
        );
        auto.awaitingMovementExit = false;
        auto.resumeAfterExit = false;
        auto.needsScanAfterMovement = true;
        auto.initialScanPending = true;
        auto.initialScanReady = false;
        if (this.isAutomationFleetSelected(fleetId)) this.automationScanResult.textContent = 'Movimento già completato su chain · avvio scansione';
        console.debug('[SDU] prepareAutomationScan: FLEET_NOT_IN_MOVEMENT, retrying initial scan with preparedResult', { fleetId: fleet.id, action, hasPreparedResult: Boolean(auto3?.preparedResult), coordinates: auto3?.preparedResult?.coordinates });
        await this.beginInitialAutomationScan(auto.runId, auto3?.preparedResult ?? null, fleetId);
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      const isRpcTemporary = /503|Service Unavailable|429|Too Many Requests|fetch failed|socket hang up|ECONNREFUSED|ENOTFOUND|getaddrinfo|timeout|timed out|failed to get info about account/i.test(message);
      if (
        isRpcTemporary &&
        attempt + 1 < maxRetries &&
        auto.running
      ) {
        console.warn(
          '[SDU] RPC temporary error during action preparation, retrying',
          { attempt: attempt + 1, maxRetries, fleetId: fleet.id, action, message }
        );
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationScanResult.textContent = `Errore RPC temporaneo, riprovo (${attempt + 1}/${maxRetries})…`;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationScanResult.textContent = error instanceof Error ? error.message : 'Preparazione azione non riuscita';
      }
      console.error('[SDU] action preparation failed', {
        fleetId: fleet.id,
        coordinates: [destination.x, destination.y],
        action,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error ?? 'Unknown error'),
        },
      });
      // Fuel insufficiente per il movimento: rifornimento alla base (modello Sly handleResupply)
      if (/^(SUBWARP|WARP)_FUEL_INSUFFICIENT$/.test(message) && (action === 'subwarp_start' || action === 'warp_start') && !auto.resupply && auto.running) {
        auto.resupplyRequested = true;
        trace('fuel insufficient', fleetId, { action, message });
        return false;
      }
      if (auto.initialScanPending && auto.running) this.failAutomation(fleetId);
      return false;
    } finally {
      if (this.isAutomationFleetSelected(fleetId)) this.automationScanButton.disabled = auto.running;
    }}
    return false;
  }

  updateAutomationActionButton(fleetId = this.automationFleet?.id) {
    if (!this.isAutomationFleetSelected(fleetId)) return;
    const auto = this.getFleetAutomation(fleetId);
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    const destination = auto.destination;
    if (!fleet || !destination) {
      this.automationScanButton.hidden = true;
      return;
    }
    this.automationScanButton.hidden = false;
    const movementMode = auto.config?.movementMode
      ?? this.automationForm.querySelector('input[name="sea-movementMode"]:checked')?.value
      ?? 'subwarp';
    let operation = resolveScanOperation(fleet, destination, movementMode);
    if (auto.needsScanAfterMovement) {
      operation = { status: 'ready', action: 'scan' };
    }
    if (operation.status === 'waiting') {
      this.automationScanButton.textContent = operation.action === 'warp_exit' ? 'Warp in corso' : 'Subwarp in corso';
      this.automationScanButton.disabled = true;
    } else if (operation.status === 'ready') {
      if (auto.initialScanPending && operation.action === 'scan' && !auto.initialScanReady) {
        this.automationScanButton.textContent = 'Cooldown scan attivo';
        this.automationScanButton.disabled = true;
        return;
      }
      this.automationScanButton.textContent = {
        scan: 'Prepara scan',
        subwarp_start: 'Prepara Subwarp',
        subwarp_exit: 'Completa Subwarp',
        warp_start: 'Prepara Warp',
        warp_exit: 'Completa Warp',
      }[operation.action];
      if (auto.initialScanPending && operation.action === 'scan') {
        this.automationScanButton.textContent = 'Prepara scan iniziale';
      }
      this.automationScanButton.disabled = auto.running;
    } else {
      this.automationScanButton.textContent = 'Azione non disponibile';
      this.automationScanButton.disabled = true;
    }
  }

  async submitPreparedScan(retryExpiredPreparation = true, fleetId = this.automationFleet?.id) {
    const auto = fleetId ? this.getFleetAutomation(fleetId) : null;
    if (!auto || auto.submissionPending || !(this.wallet || this.localSigner.unlocked) || !auto.scanTransaction || !auto.scanPrepareId) return;
    const submittedAction = auto.preparedAction;
    const preparedResult = auto.preparedResult;
    const scanAction = submittedAction === 'scan';
    const movementStart = submittedAction === 'subwarp_start' || submittedAction === 'warp_start';
    const movementExit = submittedAction === 'subwarp_exit' || submittedAction === 'warp_exit';
    const runId = auto.runId;
    let submitTimeout = null;
    auto.submissionPending = true;
    if (this.isAutomationFleetSelected(fleetId)) this.automationScanSubmitButton.disabled = true;
    try {
      trace('submit', fleetId, { action: submittedAction, prepareId: auto.scanPrepareId });
      const t0 = Date.now();
      const submitPromise = this.transactionClient.signAndSubmit({
        prepareId: auto.scanPrepareId,
        profileId: this.snapshot.profileId,
        transaction: auto.scanTransaction,
        action: submittedAction,
      });
      const timeoutPromise = new Promise((_, reject) =>
        submitTimeout = setTimeout(() => reject(new Error('TRANSACTION_SUBMIT_TIMEOUT')), 120_000)
      );
      const result = await Promise.race([submitPromise, timeoutPromise]);
      clearTimeout(submitTimeout);
      submitTimeout = null;
      trace('submit ok', fleetId, { action: submittedAction, ms: Date.now() - t0 });
      auto.submissionPending = false;
      auto.scanPrepareId = null;
      auto.scanTransaction = null;
      auto.preparedResult = null;
      if (this.isAutomationFleetSelected(fleetId)) this.automationScanSubmitButton.hidden = true;
      console.info('[SDU] on-chain action confirmed', { fleetId, action: result.action, signature: result.signature });
      console.info('[SDU] transaction fee', { fleetId, signature: result.signature, ...result.fee });
      if (this.isAutomationFleetSelected(fleetId)) this.automationScanResult.textContent = JSON.stringify(result, null, 2);
      if (result.action === 'scan') {
        auto.scanPolicy.observeScanResult(result.scanResult?.probabilityPct);
        auto.lastScanSummary = this.formatScanResult(result.scanResult);
        const fleetScanSummary = this.formatFleetScanStatus(result.scanResult);
        this.fleetScanSummaries.set(fleetId, fleetScanSummary);
        auto.pendingScanOutcome = Number.isFinite(result.scanResult?.probabilityPct)
          ? { scanPercent: result.scanResult.probabilityPct, sdu: result.scanResult.sduFound ?? 0 }
          : null;
        this.fleetStatusOverrides.delete(fleetId);
        if (this.isAutomationFleetSelected(fleetId)) this.automationResult.textContent = auto.lastScanSummary;
        console.info('[SDU] scan result', { fleetId, ...result.scanResult });
        this.render();
      }
      if (scanAction && auto.running && runId === auto.runId) {
        auto.initialScanPending = false;
        auto.initialScanReady = false;
        auto.needsScanAfterMovement = false;
        auto.postScanReady = true;
        auto.destination = null;
        if (this.isAutomationFleetSelected(fleetId)) this.automationStatus.textContent = 'Scan confermata · selezione destinazione…';
        await this.continueAutomationAfterInitialScan(runId, fleetId);
      } else if (movementExit && auto.running && runId === auto.runId) {
        // Salva il sector attuale (destinazione dell'exit) prima di perdere il riferimento.
        // Dopo l'exit la flotta è fisicamente a fleet.to; lo snapshot WS potrebbe non essere
        // ancora aggiornato (stato ancora MoveSubwarp, sector null), quindi dobbiamo preservare
        // il sector noto per poter procedere con la scan iniziale (modello Sly: stato reale prima di operare).
        if (auto.destination) {
          auto.lastKnownSector = [auto.destination.x, auto.destination.y];
        }
        auto.awaitingMovementStart = false;
        auto.awaitingMovementExit = false;
        auto.resumeAfterExit = false;
        auto.needsScanAfterMovement = true;
        auto.initialScanPending = true;
        auto.initialScanReady = false;
        auto.destination = null;
        console.info('[SDU] movement exit confirmed on-chain · starting local scan', { fleetId: fleetId, action: result.action, signature: result.signature, hasPreparedResult: Boolean(preparedResult), coordinates: preparedResult?.coordinates });
        await this.beginInitialAutomationScan(runId, preparedResult, fleetId);
      } else if (movementStart && auto.running && runId === auto.runId) {
        const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
        auto.lastKnownSector = fleet?.sector ?? null;
        // Aggiorna il fuel locale (modello Sly: scanLastFuelAmount) così durante
        // il movimento non serve richiamare /api/sea/fleet-resources (zero RPC).
        if (preparedResult?.fuelCurrent != null) {
          auto.fuelCurrent = Number(preparedResult.fuelAfterStart ?? preparedResult.fuelCurrent);
          auto.fuelCapacity = Number(
            fleet?.chainData?.stats?.cargo_stats?.fuel_capacity ??
            auto.resources?.fuelCapacity ??
            0
          );
        }
        const expectedState = submittedAction === 'warp_start' ? 'MoveWarp' : 'MoveSubwarp';
        const target = preparedResult?.coordinates ?? auto.destination;
        const targetX = target?.[0] ?? target?.x ?? '?';
        const targetY = target?.[1] ?? target?.y ?? '?';
        const mode = submittedAction === 'warp_start' ? 'warp' : 'subwarp';
        const eta = Number(preparedResult?.arrivalSeconds);
        this.fleetScanSummaries.delete(fleetId);
        this.fleetStatusOverrides.set(fleetId, {
          arrivalMs: Number.isFinite(eta) ? Date.now() + eta * 1000 : null,
          text: `${mode} → (${targetX}, ${targetY}) · arrivo ${Number.isFinite(eta) ? fmtEta(eta * 1000) : 'in corso'}`,
          expectedState,
          target: [Number(targetX), Number(targetY)],
        });
        this.render();
        clearTimeout(auto.runTimer);
        auto.runTimer = null;
        auto.awaitingMovementStart = false;
        auto.awaitingMovementExit = false;
        auto.resumeAfterExit = false;
        auto.needsScanAfterMovement = true;
        auto.waitingForEta = false;
        clearTimeout(auto.runTimer);
        auto.runTimer = null;
        if (!fleet) {
          console.error('[SDU] movement start confirmed but fleet missing from snapshot', { fleetId, action: result.action });
          this.failAutomation(fleetId);
          return;
        }
        console.info('[SDU] movement start confirmed on-chain · waiting for movement arrival', { fleetId: fleet.id, action: result.action, hasPreparedResult: Boolean(preparedResult), arrivalSeconds: preparedResult?.arrivalSeconds });
        this.waitForMovementArrival(fleet, runId, preparedResult);
      } else {
        this.stopAutomation(fleetId);
      }
    } catch (error) {
      auto.submissionPending = false;
      auto.scanPrepareId = null;
      auto.scanTransaction = null;
      auto.preparedResult = null;
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationScanSubmitButton.hidden = true;
        this.automationScanResult.textContent = error instanceof Error ? error.message : 'Firma o invio scan non riuscito';
      }
      console.error('[SDU] transaction action failed', {
        fleetId,
        action: submittedAction,
        name: error?.name,
        message: error?.message ?? String(error),
        code: error?.code,
        logs: error?.logs ?? error?.data?.logs ?? error?.cause?.logs,
        cause: error?.cause?.message ?? error?.cause,
      });
      const expiredBeforeSend = error instanceof Error && error.message === 'SCAN_TRANSACTION_BLOCKHASH_EXPIRED';
      if (
        expiredBeforeSend &&
        retryExpiredPreparation &&
        auto.running &&
        runId === auto.runId
      ) {
        console.warn(
          '[SDU] submit failed, preparing a fresh transaction',
          { attempt: 'retry', fleetId, message: error.message }
        );
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationScanResult.textContent = 'Invio transazione fallito · preparo una nuova transazione';
        }
        if (movementExit && auto.running && runId === auto.runId) {
          auto.needsScanAfterMovement = true;
        }
        const prepared = await this.prepareAutomationScan(fleetId);
        if (prepared && auto.running && runId === auto.runId) {
          auto.submissionPending = false;
          await this.submitPreparedScan(false, fleetId);
          return;
        }
      }
      // Se il backend rifiuta l'exit perché la flotta è già Idle su chain
      // (snapshot frontend obsoleto: il movimento è già concluso), trattiamo il
      // movimento come completato e passiamo alla fase di scansione, coerente
      // con la logica di riferimento SLY (operateFleet: moving && chain == Idle
      // => aggiorna stato a Idle e procedi con lo scan).
      const movementExitCompletedOnChain =
        movementExit &&
        error instanceof Error &&
        error.message === 'FLEET_NOT_IN_MOVEMENT';
      if (
        movementExitCompletedOnChain &&
        auto.running &&
        runId === auto.runId
      ) {
        console.debug(
          '[SDU] submitPreparedScan: FLEET_NOT_IN_MOVEMENT, retrying initial scan with preparedResult',
          { fleetId, action: submittedAction, hasPreparedResult: Boolean(preparedResult), coordinates: preparedResult?.coordinates }
        );
        console.warn(
          '[SDU] movement exit rejected: fleet already Idle on chain; proceeding to scan',
          { fleetId, action: submittedAction }
        );
        auto.awaitingMovementExit = false;
        auto.needsScanAfterMovement = true;
        auto.initialScanPending = true;
        auto.initialScanReady = false;
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationStatus.textContent = 'Movimento già completato su chain · avvio scansione';
        }
        await this.beginInitialAutomationScan(runId, preparedResult, fleetId);
        return;
      }
      // Timeout di submit: la tx può essere comunque andata a buon fine, si verifica lo stato reale prima di fallire
      if (movementStart && error?.message === 'TRANSACTION_SUBMIT_TIMEOUT' && auto.running && runId === auto.runId) {
        for (let i = 0; i < 10 && auto.running && runId === auto.runId; i += 1) {
          this.emit('refresh');
          await new Promise(resolve => setTimeout(resolve, 3000));
          const live = this.snapshot.fleets.find(item => item.id === fleetId);
          if (live?.state === 'MoveSubwarp' || live?.state === 'MoveWarp') {
            console.info('[SDU] submit timeout but movement started on-chain; continuing', { fleetId, state: live.state });
            return;
          }
        }
      }
      if ((scanAction || movementStart || movementExit) && auto.running && runId === auto.runId) this.failAutomation(fleetId);
    } finally {
      if (submitTimeout) clearTimeout(submitTimeout);
      auto.submissionPending = false;
      if (this.isAutomationFleetSelected(fleetId)) this.automationScanSubmitButton.disabled = false;
    }
  }

  formatScanResult(scanResult) {
    if (!scanResult) return 'Scan confermata · risultato chain non disponibile';
    const details = [];
    if (Number.isFinite(scanResult.probabilityPct)) details.push(`Probabilità scan ${scanResult.probabilityPct.toFixed(2)}%`);
    if (Number.isFinite(scanResult.sduFound)) details.push(`SDU +${scanResult.sduFound}`);
    return `Scan confermata${details.length ? ` · ${details.join(' · ')}` : ''}`;
  }

  formatFleetScanStatus(scanResult) {
    if (!scanResult) return 'Scan confermata';
    const details = [];
    if (Number.isFinite(scanResult.probabilityPct)) details.push(`${Math.round(scanResult.probabilityPct)}%`);
    if (Number.isFinite(scanResult.sduFound)) details.push(`+${Number(scanResult.sduFound).toFixed(0)}SDU`);
    return `Scan confermata${details.length ? ` · ${details.join(' ')}` : ''}`;
  }

  populateAutomationForm(fleet) {
    this.automationLeft.replaceChildren();
    this.automationRight.replaceChildren();
    const chainData = fleet.chainData ?? {};
    const movementStats = chainData.stats?.movement_stats ?? {};
    const miscStats = chainData.stats?.misc_stats ?? {};
    const scanCost = miscStats.scan_cost == null ? Number.NaN : Number(miscStats.scan_cost);
    const hasScanCost = Number.isFinite(scanCost);
    const rawSubwarpSpeed = movementStats.subwarp_speed;
    const subwarpSpeed = rawSubwarpSpeed == null || !Number.isFinite(Number(rawSubwarpSpeed))
      ? ''
      : (Number(rawSubwarpSpeed) / 1_000_000).toFixed(4).replace('.', ',');
    const addInput = (parent, label, value = '', readOnly = false, param = '') => appendAutomationInput(parent, label, value, readOnly, param);
    const addCheck = (parent, label, checked = false, param = '') => appendAutomationCheckbox(parent, label, checked, param);

    addInput(this.automationLeft, 'Nome Flotta', fleet.name, true, 'nomeFlotta');
    addCheck(this.automationLeft, 'doubleSB', false, 'doubleSB');
    const baseCoordsInput = addInput(this.automationLeft, 'Starbase base', '-14,-16', false, 'sbCoords');
    baseCoordsInput.closest('.automation-field').hidden = true;
    addInput(this.automationLeft, 'Prima SB', '11,-16', false, 'primaSB');
    addInput(this.automationLeft, 'Range cella', '3', false, 'maxdistanceFromFleet1');
    addInput(this.automationLeft, 'Range SB', '30', false, 'rangeSB');
    addInput(this.automationLeft, 'Peso count', '0.2', false, 'count');
    addInput(this.automationLeft, 'Peso growing', '0.2', false, 'growing');
    addInput(this.automationLeft, 'Fuel minimo', '30', false, 'fuel_min');
    addInput(this.automationLeft, 'Fuel max', '40', false, 'fuel_max');
    this.automationCooldownInput = addInput(this.automationLeft, 'Cooldown', '300', false, 'scanCooldown');
    addInput(this.automationLeft, 'Safety mult', '1.15');
    this.automationSpeedInput = addInput(this.automationLeft, 'Subwarp Speed', subwarpSpeed, true);
    appendAutomationRadioGroup(this.automationLeft, 'Movimento', [['warp', 'Warp'], ['subwarp', 'Subwarp']], 'subwarp', 'movementMode')
      .addEventListener('change', () => this.updateAutomationActionButton());
    addCheck(this.automationLeft, 'smartRange', true, 'smartRange');
    addCheck(this.automationLeft, 'coeffsdu1', true, 'coeffsdu1');

    addInput(this.automationRight, 'Id Flotta', fleet.id, true, 'idFlotta');
    addInput(this.automationRight, 'Seconda SB', '-14,-16', false, 'secondaSB');
    this.automationRangeInput = addInput(this.automationRight, 'Range consigliato', 'N/A', true);
    addInput(this.automationRight, 'Area range', '15', false, 'maxareaFromFleet');
    addInput(this.automationRight, 'Peso sdu', '0.0002', false, 'sdu');
    addInput(this.automationRight, 'Time Window', '0', false, 'timeWindow');
    addInput(this.automationRight, 'Fuel range min', '10', false, 'fuel_range_min');
    addInput(this.automationRight, 'Scan cost on-chain', hasScanCost ? scanCost : 'N/D', true);
    addInput(this.automationRight, 'Food min', hasScanCost && scanCost === 0 ? '0' : '10', hasScanCost && scanCost === 0, 'food_min');
    addInput(this.automationRight, 'Timeout API', '10', false, 'requestTimeout');
    addInput(this.automationRight, 'Fuel/unit', '0.65');
    addInput(this.automationRight, 'Fuel reserve %', '2');
    addCheck(this.automationRight, 'coeffcount1', true, 'coeffcount1');
    addCheck(this.automationRight, 'coeffgrowing1', true, 'coeffgrowing1');
    addInput(this.automationRight, '% minima (pause strike)', '10', false, 'percentuale_minima');
    addInput(this.automationRight, 'Strike soglia', '5', false, 'pause_strike_iniziale');
    this.updateRecommendedRange();
    this.updateFeeControls();
    this.automationCooldownInput.addEventListener('input', () => this.updateRecommendedRange());
  }

  // Nessun data-config-key: chiave e password non devono finire nella configurazione salvata.
  appendLocalSignerControls(parent) {
    const box = document.createElement('div');
    box.className = 'automation-signer';
    const status = document.createElement('div');
    status.setAttribute('role', 'status');
    const makeField = (labelText, placeholder) => {
      const field = document.createElement('label');
      field.className = 'automation-field';
      const label = document.createElement('span');
      label.textContent = labelText;
      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.placeholder = placeholder;
      field.append(label, input);
      return { field, input };
    };
    const secret = makeField('Chiave segreta burner', '[82, 194, ...]');
    const password = makeField('Password di cifratura', 'minimo 8 caratteri');
    const makeButton = (text, handler) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'automation-request';
      button.textContent = text;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await handler();
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : 'Operazione non riuscita';
        } finally {
          button.disabled = false;
          refresh();
        }
      });
      return button;
    };
    const importButton = makeButton('Salva e sblocca', async () => {
      await this.localSigner.importKey(secret.input.value.trim(), password.input.value);
      secret.input.value = '';
      password.input.value = '';
    });
    const unlockButton = makeButton('Sblocca', async () => {
      await this.localSigner.unlock(password.input.value);
      password.input.value = '';
    });
    const lockButton = makeButton('Blocca', async () => this.localSigner.lock());
    const forgetButton = makeButton('Rimuovi chiave', async () => this.localSigner.forget());
    const refresh = () => {
      const stored = this.localSigner.storedPublicKey();
      if (this.localSigner.unlocked) status.textContent = `Firma locale attiva · ${this.localSigner.publicKey.toBase58()}`;
      else if (stored) status.textContent = `Chiave salvata (bloccata) · ${stored}`;
      else status.textContent = 'Firma locale non configurata · si usa il wallet del browser';
      secret.field.hidden = Boolean(stored);
      importButton.hidden = Boolean(stored);
      unlockButton.hidden = !stored || this.localSigner.unlocked;
      password.field.hidden = this.localSigner.unlocked;
      lockButton.hidden = !this.localSigner.unlocked;
      forgetButton.hidden = !stored;
    };
    box.append(status, secret.field, password.field, importButton, unlockButton, lockButton, forgetButton);
    parent.append(box);
    refresh();
  }

  populateSettingsForm() {
    this.settingsLeft.replaceChildren();
    this.settingsRight.replaceChildren();
    const addInput = (parent, label, value = '', readOnly = false, param = '') => appendSettingsInput(parent, label, value, readOnly, param);
    const addCheck = (parent, label, checked = false, param = '') => appendSettingsCheckbox(parent, label, checked, param);

    this.settingsApiHost = addInput(this.settingsLeft, 'IP API', '127.0.0.1', false, 'apiHost');
    addCheck(this.settingsLeft, 'Onchain mode');
    this.settingsSimulateScanFilter = addCheck(this.settingsLeft, 'Simula scan-filter locale', true, 'simulateScanFilter');
    addInput(this.settingsLeft, 'Onchain URL', 'http://127.0.0.1:3010/intent');
    this.settingsUseSlyFee = addCheck(this.settingsLeft, 'Usa fee Sly', false, 'useSlyFee');
    this.settingsPriorityFeeInput = addInput(this.settingsLeft, 'Fee base Sly (lamports)', '1', false, 'priorityFeeLamports');
    this.settingsPriorityFeeInput.type = 'number';
    this.settingsPriorityFeeInput.min = '0';
    this.settingsPriorityFeeInput.max = '50000';
    this.settingsPriorityFeeInput.step = '1';
    this.settingsPriorityFeeInput.maxLength = 5;
    this.appendLocalSignerControls(this.settingsLeft);
    this.settingsUseSlyFee.addEventListener('change', () => this.updateFeeControls());

    this.settingsApiPort = addInput(this.settingsRight, 'Porta API', '3000', false, 'apiPort');
    this.settingsRequestTimeout = addInput(this.settingsRight, 'Timeout API', '10', false, 'requestTimeout');
    addCheck(this.settingsRight, 'Fallback legacy', true);
    addCheck(this.settingsRight, 'Test senza status click', true);
    addCheck(this.settingsRight, 'Safety checks', true);

    const actionsRow = document.createElement('div');
    actionsRow.className = 'settings-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'settings-btn';
    saveBtn.textContent = 'Salva';

    this.settingsSaveButton = saveBtn;
    this.settingsSaveButton.addEventListener('click', () => this.saveSettings());

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'settings-btn';
    clearBtn.textContent = 'Cancella';
    clearBtn.addEventListener('click', () => this.clearSettings());

    actionsRow.append(saveBtn, clearBtn);
    this.settingsFormEl.append(actionsRow);

    this.loadSettings();
  }

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('sae:sea-settings') || '{}');
      for (const control of this.settingsFormEl.querySelectorAll('[data-config-key]')) {
        if (control.readOnly || !(control.dataset.configKey in saved)) continue;
        if (control instanceof HTMLInputElement && control.type === 'radio') control.checked = control.value === String(saved[control.dataset.configKey]);
        else if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(saved[control.dataset.configKey]);
        else control.value = String(saved[control.dataset.configKey]);
      }
      this.updateFeeControls();
    } catch {
      console.error('[Settings] configurazione globale non valida');
    }
  }

  saveSettings() {
    const config = {};
    for (const control of this.settingsFormEl.querySelectorAll('[data-config-key]')) {
      if (control.readOnly) continue;
      if (control instanceof HTMLInputElement && control.type === 'radio' && !control.checked) continue;
      config[control.dataset.configKey] = control instanceof HTMLInputElement && control.type === 'checkbox'
        ? control.checked
        : control.value;
    }
    try {
      localStorage.setItem('sae:sea-settings', JSON.stringify(config));
      console.info('[Settings] configurazione globale salvata', { savedFields: Object.keys(config).length });
    } catch (error) {
      console.error('[Settings] salvataggio configurazione globale fallito', error);
    }
  }

  clearSettings() {
    if (!confirm('Eliminare i parametri globali? Saranno ripristinati i valori di default.')) return;
    try {
      localStorage.removeItem('sae:sea-settings');
      this.populateSettingsForm();
      console.info('[Settings] configurazione globale eliminata');
    } catch (error) {
      console.error('[Settings] cancellazione configurazione fallita', error);
    }
  }

  updateFeeControls() {
    const useSlyFee = this.settingsUseSlyFee?.checked ?? false;
    if (this.settingsPriorityFeeInput) this.settingsPriorityFeeInput.disabled = !useSlyFee;
  }

  updateRecommendedRange() {
    const cooldown = Number(this.automationCooldownInput?.value.trim().replace(',', '.'));
    const speed = Number(this.automationSpeedInput?.value.trim().replace(',', '.'));
    this.automationRangeInput.value = Number.isFinite(cooldown) && cooldown >= 0 && Number.isFinite(speed) && speed > 0
      ? (Math.ceil(cooldown * speed * 10) / 10).toFixed(1)
      : 'N/A';
  }

  closeAutomation() {
    this.automationOverlay.hidden = true;
  }

  openSettings() {
    this.settingsEl.hidden = false;
    this.populateSettingsForm();
    this.settingsClose.focus();
  }

  closeSettings() {
    this.saveSettings();
    this.settingsEl.hidden = true;
  }

  startAutomation(fleetId = this.automationFleet?.id) {
    const auto = fleetId ? this.getFleetAutomation(fleetId) : null;
    if (!auto || auto.running) return;
    if (!this.canStartAutomation(fleetId)) {
      this.refreshAutomationState(fleetId);
      return;
    }
    if (this.localSigner.storedPublicKey() && !this.localSigner.unlocked) {
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationStatus.textContent = 'Chiave locale salvata ma bloccata · inserisci la password e premi Sblocca';
      }
      return;
    }
    console.info('[SDU] signer mode', { mode: this.localSigner.unlocked ? 'local' : 'wallet' });
    const runId = ++auto.runId;
    auto.running = true;
    auto.faulted = false;
    auto.initialScanPending = true;
    auto.initialScanReady = false;
    auto.resumeAfterExit = false;
    this.setAutomationFleetState(fleetId, 'running');
    console.info('[SDU] automation started with scan at current sector', { fleetId });
    if (this.isAutomationFleetSelected(fleetId)) {
      this.automationToggleButton.textContent = 'Arresta automazione';
      this.automationToggleButton.setAttribute('aria-pressed', 'true');
      this.automationToggleButton.disabled = false;
      this.automationRequestButton.disabled = true;
      this.automationStatus.textContent = 'Scan iniziale richiesta sulla posizione corrente';
    }

    // Stagger avvio flotte (modello Sly: 1500ms per flotta) per evitare raffiche RPC simultanee
    const alreadyRunning = Array.from(this.fleetAutomations.values()).filter(a => a.running).length - 1;
    const staggerMs = Math.max(0, alreadyRunning) * 1500;
    if (staggerMs > 0 && this.isAutomationFleetSelected(fleetId)) {
      this.automationStatus.textContent = `Avvio in coda (${staggerMs / 1000}s) · scan iniziale sulla posizione corrente`;
    }
    clearTimeout(auto.runTimer);
    auto.runTimer = setTimeout(() => {
      auto.runTimer = null;
      if (auto.running && runId === auto.runId) this.beginInitialAutomationScan(runId, null, fleetId);
    }, staggerMs);
  }

  async beginInitialAutomationScan(runId, preparedResult = null, fleetId = this.automationFleet?.id) {
    const auto = this.getFleetAutomation(fleetId);
    if (!auto || !auto.running || runId !== auto.runId) return;
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    if (!fleet) {
      console.error('[SDU] initial scan stopped: fleet missing from snapshot', { fleetId });
      this.failAutomation(fleetId);
      return;
    }
    trace('initial scan', fleet.id, { run: runId, state: fleet.state, sector: fleet.sector, needsScan: auto.needsScanAfterMovement, prepared: Boolean(preparedResult) });
    if (fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp') {
      if (auto.needsScanAfterMovement && !auto.resumeAfterExit) {
        // Il movimento è già confermato su chain (exit o timeout): ignoriamo lo snapshot obsoleto e procediamo con lo scan
        // Coerente con il modello Sly: stato reale prima di operare, nessun attesa di aggiornamenti chain obsoleti.
        auto.awaitingMovementExit = false;
        auto.needsScanAfterMovement = true;
        auto.initialScanPending = true;
        auto.initialScanReady = true;
        const coords = preparedResult?.coordinates ?? preparedResult?.sector ?? fleet.sector ?? auto.lastKnownSector;
        console.debug('[SDU] beginInitialAutomationScan: movement stale, forcing scan after exit', { fleetId: fleet.id, state: fleet.state, coordsSource: preparedResult?.coordinates ? 'preparedResult' : preparedResult?.sector ? 'preparedResult.sector' : fleet.sector ? 'fleet.sector' : 'automationLastKnownSector', coords });
        if (!coords) {
          console.error('[SDU] initial scan stopped: no coordinates available', { fleetId: fleet.id, state: fleet.state, sector: fleet.sector, automationLastKnownSector: auto.lastKnownSector });
          this.failAutomation(fleetId);
          return;
        }
        auto.destination = { x: coords[0], y: coords[1], sb: null };
        this.updateAutomationActionButton(fleetId);
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationStatus.textContent = 'Preparo la scan iniziale sulla posizione corrente';
        }
        await this.runAutomationAction(runId, fleetId);
        return;
      } else {
        // Movimento già completato su chain (ETA scaduto) ma snapshot obsoleto (MoveSubwarp/MoveWarp).
        // Non attendiamo ulteriormente: forziamo l'uscita per proseguire con la scan iniziale.
        // Coerente con il modello Sly: stato reale prima di operare, nessun attesa di aggiornamenti chain obsoleti.
        auto.resumeAfterExit = true;
        if (this.isAutomationFleetSelected(fleetId)) this.automationStatus.textContent = 'Movimento arrivato · preparo uscita';
        await this.runAutomationAction(runId, fleetId);
        return;
      }
    }
    const docked = fleet.state === 'StarbaseLoadingBay' && fleet.sector;
    if (docked || (fleet.state === 'Idle' && fleet.sector && this.isStarbaseCoord(`${fleet.sector[0]},${fleet.sector[1]}`, auto)
      && auto.resupplyDoneAt !== `${fleet.sector[0]},${fleet.sector[1]}`)) {
      // Flotta su una SB (docked o idle): rifornimento completo prima della scan
      auto.resupply = { base: [fleet.sector[0], fleet.sector[1]] };
      auto.destination = { x: fleet.sector[0], y: fleet.sector[1], sb: null };
      auto.initialScanPending = true;
      if (this.isAutomationFleetSelected(fleetId)) this.automationStatus.textContent = `Flotta alla SB ${fleet.sector[0]},${fleet.sector[1]} · rifornimento`;
      if (!auto.actionPending) {
        auto.actionPending = true;
        try { await this.performResupply(runId, fleetId); } finally { auto.actionPending = false; }
      }
      return;
    }
    if (fleet.state !== 'Idle' || !fleet.sector) {
      console.error('[SDU] initial scan stopped: unsupported fleet state', { fleetId: fleet.id, state: fleet.state, sector: fleet.sector });
      this.failAutomation(fleetId);
      return;
    }
    auto.destination = { x: fleet.sector[0], y: fleet.sector[1], sb: null };
    this.updateAutomationActionButton(fleetId);
    const cooldownRemaining = Math.max(0, Number(fleet.scanCooldownEnd ?? 0) - Date.now());
    if (cooldownRemaining > 0) {
      if (auto.needsScanAfterMovement) {
        console.debug('[SDU] beginInitialAutomationScan: scan cooldown active, waiting before scan', { fleetId: fleet.id, cooldownRemainingMs: cooldownRemaining, cooldownRemainingSec: Math.ceil(cooldownRemaining / 1000) });
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationStatus.textContent = `Scan cooldown chain · attendo ${Math.ceil(cooldownRemaining / 1000)}s`;
        }
        clearTimeout(auto.runTimer);
        auto.runTimer = setTimeout(() => {
          auto.runTimer = null;
          if (auto.running && runId === auto.runId) this.beginInitialAutomationScan(runId, null, fleetId);
        }, cooldownRemaining);
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationScanButton.textContent = 'Cooldown scan attivo';
          this.automationScanButton.disabled = true;
          this.automationScanButton.hidden = false;
        }
        return;
      }
      auto.initialScanPending = false;
      auto.initialScanReady = false;
      if (this.isAutomationFleetSelected(fleetId)) {
        this.automationStatus.textContent = 'Scan in cooldown · richiedo la prossima destinazione';
      }
      await this.continueAutomationAfterInitialScan(runId, fleetId);
      return;
    }
    auto.initialScanReady = true;
    this.updateAutomationActionButton(fleetId);
    if (this.isAutomationFleetSelected(fleetId)) {
      this.automationStatus.textContent = 'Preparo la scan iniziale sulla posizione corrente';
    }
    await this.runAutomationAction(runId, fleetId);
  }

  async waitForMovementArrival(fleet, runId, preparedResult = null) {
    const auto = this.getFleetAutomation(fleet.id);
    if (!preparedResult && !fleet.to) {
      console.error('[SDU] movement recovery stopped: on-chain target missing', { fleetId: fleet.id, state: fleet.state });
      this.failAutomation(fleet.id);
      return;
    }
    const target = preparedResult?.coordinates ?? fleet.to;
    auto.destination = { x: target[0], y: target[1], sb: null };
    this.updateAutomationActionButton(fleet.id);
    const arrivalMs = preparedResult?.arrivalSeconds
      ? Date.now() + Number(preparedResult.arrivalSeconds) * 1000
      : Number(fleet.arrival ?? 0);
    const remaining = Math.max(0, arrivalMs - Date.now());
    const movementName = fleet.state === 'MoveWarp' ? 'Warp' : 'Subwarp';
    trace('wait arrival', fleet.id, { run: runId, state: fleet.state, movement: movementName, remainingSec: Math.ceil(remaining / 1000) });
    if (remaining === 0) {
      clearTimeout(auto.runTimer);
      auto.runTimer = null;
      auto.waitingForEta = false;
      if (this.isAutomationFleetSelected(fleet.id)) {
        this.automationStatus.textContent = `${movementName} arrivato · prepara uscita`;
      }
      if (auto.running && runId === auto.runId) await this.runAutomationAction(runId, fleet.id);
      return;
    }
    if (this.isAutomationFleetSelected(fleet.id)) {
      this.automationStatus.textContent = `${movementName} in corso · attendo ETA chain`;
    }
    if (auto.waitingForEta) {
      console.debug('[SDU] waitForMovementArrival: already waiting for ETA, skipping', { fleetId: fleet.id, remaining });
      return;
    }
    clearTimeout(auto.runTimer);
    auto.waitingForEta = true;
    auto.runTimer = setTimeout(() => {
      auto.runTimer = null;
      auto.waitingForEta = false;
      console.debug('[SDU] waitForMovementArrival: ETA timer expired, starting initial scan', { fleetId: fleet.id, runId });
      if (auto.running && runId === auto.runId) this.beginInitialAutomationScan(runId, null, fleet.id);
    }, remaining);
  }

  async continueAutomationAfterInitialScan(runId, fleetId = this.automationFleet?.id) {
    const auto = this.getFleetAutomation(fleetId);
    if (!auto || !auto.running || runId !== auto.runId) return;
    let fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    // Snapshot ancora in movimento dopo l'exit confermato: forza il refresh e attende Idle con settore
    for (let i = 0; i < 15 && (!fleet?.sector || fleet.state !== 'Idle') && auto.running && runId === auto.runId; i += 1) {
      this.emit('refresh');
      await new Promise(resolve => setTimeout(resolve, 2000));
      fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    }
    if (!auto.running || runId !== auto.runId) return;
    // Scan confermata on-chain ma snapshot ancora in movimento: la flotta è Idle al settore noto
    if (fleet && auto.postScanReady && auto.lastKnownSector && (!fleet.sector || fleet.state !== 'Idle')) {
      console.warn('[SDU] post-scan: snapshot stale, using last known sector', { fleetId, state: fleet.state, sector: auto.lastKnownSector });
      fleet = { ...fleet, state: 'Idle', sector: auto.lastKnownSector };
    }
    trace('post-scan', fleetId, { run: runId, state: fleet?.state, sector: fleet?.sector, ready: auto.postScanReady });
    if (!fleet || (!auto.postScanReady && fleet.state !== 'Idle') || !fleet.sector) {
      console.error('[SDU] post-scan destination request blocked: fleet is not Idle', { fleetId: fleet?.id, state: fleet?.state, sector: fleet?.sector, automationPostScanReady: auto.postScanReady });
      this.failAutomation(fleetId);
      return;
    }
    auto.postScanReady = false;
    const requestId = ++auto.requestId;
    if (!await this.loadAutomationResources(fleet, requestId)) {
      console.error('[SDU] continueAutomationAfterInitialScan: loadAutomationResources failed', { fleetId: fleet.id });
      if (auto.running && runId === auto.runId) this.failAutomation(fleetId);
      return;
    }
    if (!auto.running || runId !== auto.runId) return;
    // Se il fuel non permette nemmeno un salto di 1 settore con ritorno alla base, si rifornisce prima della richiesta
    const radius = fuelReachableRadius({
      fuelCurrent: auto.resources?.fuelCurrent,
      fleet,
      movementMode: auto.config?.movementMode ?? this.automationForm.querySelector('input[name="sea-movementMode"]:checked')?.value ?? 'subwarp',
      currentCoords: fleet.sector,
      sbCoords: resolveStarbaseList(this.automationForm, auto.config),
      rangeSB: auto.config?.rangeSB ?? this.automationForm.querySelector('[data-scan-param="rangeSB"]')?.value,
    });
    if (!auto.resupply && radius < 1) {
      console.info('[SDU] fuel cannot cover any destination with return: resupply', { fleetId, fuel: auto.resources?.fuelCurrent, radius });
      if (await this.startResupply(runId, fleetId)) return;
    }
    if (!await this.requestAutomationDestination(fleetId)) {
      console.error('[SDU] continueAutomationAfterInitialScan: requestAutomationDestination failed', { fleetId: fleet.id });
      if (auto.running && runId === auto.runId) this.failAutomation(fleetId);
      return;
    }
    await this.runAutomationAction(runId, fleetId);
  }

  async runAutomationAction(runId, fleetId = this.automationFleet?.id) {
    const auto = this.getFleetAutomation(fleetId);
    if (!auto || !auto.running || runId !== auto.runId) return;
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    if (!fleet || !auto.destination) {
      console.error('[SDU] automatic action missing fleet or destination', { fleetId, destination: auto.destination });
      this.failAutomation(fleetId);
      return;
    }
    const movementMode = auto.config?.movementMode
      ?? this.automationForm.querySelector('input[name="sea-movementMode"]:checked')?.value
      ?? 'subwarp';
    let operation = resolveScanOperation(fleet, auto.destination, movementMode);
    trace('action', fleet.id, { run: runId, state: fleet.state, dest: `${auto.destination.x},${auto.destination.y}`, action: operation?.action, prepared: auto.preparedAction, needsScan: auto.needsScanAfterMovement });
    // Se il movimento è già confermato su chain (exit o start), lo snapshot può
    // essere obsoleto (MoveSubwarp/MoveWarp): forziamo la scan per non attendere
    // invano l'aggiornamento chain o l'arrivo di un movimento già concluso.
    if (auto.needsScanAfterMovement && !auto.resumeAfterExit) {
      // Dopo subwarp_start/warp_start serve prima l'exit, non la scan diretta:
      // saltare l'exit porta a FLEET_NOT_AT_SCAN_COORDINATE (la flotta è ancora in movimento).
      const lastAction = auto.preparedAction;
      if (lastAction === 'subwarp_start' || lastAction === 'warp_start') {
        operation = { status: 'ready', action: lastAction === 'subwarp_start' ? 'subwarp_exit' : 'warp_exit' };
        console.debug('[SDU] runAutomationAction: forced exit after movement start', { fleetId: fleet.id, lastAction, action: operation.action });
      } else {
        // Movimento già completato su chain o exit già fatta: procediamo con lo scan.
        operation = { status: 'ready', action: 'scan' };
        console.debug('[SDU] runAutomationAction: forced scan after movement exit (needsScanAfterMovement)', { fleetId: fleet.id, lastAction });
      }
    }
    if (operation.status === 'waiting') {
      this.waitForMovementArrival(fleet, runId);
      return;
    }
    if (operation.status !== 'ready') {
      console.error('[SDU] automatic action unavailable', { fleetId: fleet.id, state: fleet.state, reason: operation.reason });
      this.failAutomation(fleetId);
      return;
    }
    // Flotta sulle coordinate di una SB (arrivo casuale, avvio, o rifornimento richiesto): dock, scarico, refuel, undock, poi scan
    const destinationKey = `${auto.destination.x},${auto.destination.y}`;
    if (operation.action === 'scan' && (auto.resupply || (this.isStarbaseCoord(destinationKey, auto) && auto.resupplyDoneAt !== destinationKey))) {
      if (auto.actionPending) return;
      auto.resupply ??= { base: [auto.destination.x, auto.destination.y] };
      auto.actionPending = true;
      try { await this.performResupply(runId, fleetId); } finally { auto.actionPending = false; }
      return;
    }
    if (operation.action === 'scan') {
      const remaining = Math.max(0, Number(fleet.scanCooldownEnd ?? 0) - Date.now());
      if (remaining > 0) {
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationStatus.textContent = `Scan cooldown chain · attendo ${Math.ceil(remaining / 1000)}s`;
        }
        clearTimeout(auto.runTimer);
        auto.runTimer = setTimeout(() => {
          auto.runTimer = null;
          if (auto.running && runId === auto.runId) this.runAutomationAction(runId, fleetId);
        }, remaining);
        return;
      }
    }
    if (auto.actionPending) return;
    auto.actionPending = true;
    let prepared = false;
    try {
      prepared = await this.prepareAutomationScan(fleetId);
    } finally {
      auto.actionPending = false;
    }
    if (!prepared) {
      if (auto.resupplyRequested) {
        auto.resupplyRequested = false;
        if (auto.running && runId === auto.runId && await this.startResupply(runId, fleetId)) return;
      }
      if (auto.running && runId === auto.runId) this.failAutomation(fleetId);
      return;
    }
    if (!auto.running || runId !== auto.runId) return;
    if (operation.action === 'subwarp_start' || operation.action === 'warp_start') {
      auto.preparedAction = operation.action;
      auto.resupplyDoneAt = null;
      auto.awaitingMovementStart = true;
      auto.needsScanAfterMovement = true;
      console.debug('[SDU] runAutomationAction: awaiting movement start', { fleetId: fleet.id, action: operation.action, expectedState: operation.action === 'warp_start' ? 'MoveWarp' : 'MoveSubwarp' });
    }
    if (operation.action === 'subwarp_exit' || operation.action === 'warp_exit') auto.awaitingMovementExit = true;
    await this.submitPreparedScan(true, fleetId);
  }

  async startResupply(runId, fleetId) {
    const auto = this.getFleetAutomation(fleetId);
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    const sbCoords = resolveStarbaseList(this.automationForm, auto.config);
    const bases = String(sbCoords).split(';').map(item => item.split(',').map(Number)).filter(pair => pair.length === 2 && pair.every(Number.isFinite));
    if (!fleet?.sector || !bases.length) return false;
    const [x, y] = bases.sort((a, b) => Math.hypot(a[0] - fleet.sector[0], a[1] - fleet.sector[1]) - Math.hypot(b[0] - fleet.sector[0], b[1] - fleet.sector[1]))[0];
    auto.resupply = { base: [x, y] };
    auto.destination = { x, y, sb: `${x},${y}` };
    console.info('[SDU] fuel insufficient: resupply at nearest starbase', { fleetId, base: [x, y] });
    if (this.isAutomationFleetSelected(fleetId)) this.automationStatus.textContent = `Fuel insufficiente · rifornimento alla base ${x},${y}`;
    await this.runAutomationAction(runId, fleetId);
    return true;
  }

  isStarbaseCoord(key, auto) {
    return resolveStarbaseList(this.automationForm, auto.config).split(';').includes(key);
  }

  // Sequenza di handleResupply (Sly): dock → scarico SDU → carico fuel → undock
  async performResupply(runId, fleetId) {
    const auto = this.getFleetAutomation(fleetId);
    const [x, y] = auto.resupply.base;
    const alreadyDocked = this.snapshot.fleets.find(item => item.id === fleetId)?.state === 'StarbaseLoadingBay';
    try {
      for (const step of alreadyDocked ? ['unload_sdu', 'load_fuel', 'undock'] : ['dock', 'unload_sdu', 'load_fuel', 'undock']) {
        if (!auto.running || runId !== auto.runId) return;
        if (this.isAutomationFleetSelected(fleetId)) this.automationStatus.textContent = `Rifornimento ${x},${y} · ${step}`;
        for (let attempt = 0; ; attempt += 1) {
          const result = await this.transactionClient.prepareResupply({
            profileId: this.snapshot.profileId,
            fleetId,
            step,
            starbase: `${x},${y}`,
            feeMode: this.settingsUseSlyFee?.checked ? 'sly' : 'wallet',
            priorityFeeLamports: this.settingsPriorityFeeInput?.value ?? '1',
          });
          if (result.status === 'SKIP') break;
          if (!result.prepareId || result.simulation?.err) throw new Error(`RESUPPLY_${step.toUpperCase()}_SIMULATION_FAILED`);
          try {
            const submitted = await this.transactionClient.signAndSubmit({
              prepareId: result.prepareId,
              profileId: this.snapshot.profileId,
              transaction: result.transaction,
              action: step,
            });
            console.info('[SDU] resupply step confirmed', { fleetId, step, amount: result.amount, signature: submitted.signature });
            break;
          } catch (error) {
            if (attempt >= 1 || error?.message !== 'SCAN_TRANSACTION_BLOCKHASH_EXPIRED') throw error;
          }
        }
      }
    } catch (error) {
      console.error('[SDU] resupply failed', { fleetId, name: error?.name, message: error?.message ?? String(error) });
      if (this.isAutomationFleetSelected(fleetId)) this.automationStatus.textContent = `Rifornimento non riuscito: ${error?.message ?? error}`;
      if (auto.running && runId === auto.runId) this.failAutomation(fleetId);
      return;
    }
    auto.resupply = null;
    auto.resupplyRequested = false;
    auto.resupplyDoneAt = `${x},${y}`;
    trace('resupply done', fleetId, { base: `${x},${y}` });
    auto.needsScanAfterMovement = false;
    auto.awaitingMovementExit = false;
    auto.resumeAfterExit = false;
    auto.preparedAction = null;
    auto.fuelCurrent = null;
    // Attende lo snapshot aggiornato (Idle al settore della base) prima della scan
    for (let i = 0; i < 15 && auto.running && runId === auto.runId; i += 1) {
      this.emit('refresh');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
      if (fleet?.state === 'Idle' && fleet.sector) break;
    }
    if (!auto.running || runId !== auto.runId) return;
    console.info('[SDU] resupply completed; scanning at starbase', { fleetId });
    auto.initialScanPending = true;
    // Il chiamante tiene actionPending: va rilasciato prima di riprendere con la scan
    auto.actionPending = false;
    await this.beginInitialAutomationScan(runId, null, fleetId);
  }

  observeAutomationFuel(resources, fleetId) {
    const auto = this.getFleetAutomation(fleetId);
    const fuelMinimum = Number(auto.config?.fuel_min
      ?? (this.isAutomationFleetSelected(fleetId)
        ? this.automationForm.querySelector('[data-scan-param="fuel_min"]')?.value
        : undefined));
    const crossing = auto.scanPolicy.observeFuel(resources.fuelCurrentPct, fuelMinimum);
    if (!crossing) return;
    console.info('[SDU] fuel crossed minimum; next request is area', {
      fleetId,
      ...crossing,
      fuelMinimum,
    });
  }

  stopAutomation(fleetId = this.automationFleet?.id) {
    const auto = fleetId ? this.fleetAutomations.get(fleetId) : null;
    if (!auto) return;
    const wasRunning = auto.running;
    auto.running = false;
    auto.faulted = false;
    auto.runId += 1;
    auto.requestId += 1;
    if (auto.runTimer) clearTimeout(auto.runTimer);
    auto.runTimer = null;
    auto.initialScanPending = false;
    auto.initialScanReady = false;
    auto.resumeAfterExit = false;
    auto.waitingForEta = false;
    auto.awaitingMovementStart = false;
    auto.awaitingMovementExit = false;
    auto.needsScanAfterMovement = false;
    auto.submissionPending = false;
    auto.actionPending = false;
    auto.postScanReady = false;
    auto.resupply = null;
    auto.resupplyDoneAt = null;
    auto.resupplyRequested = false;
    auto.lastKnownSector = null;
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    this.setAutomationFleetState(
      fleetId,
      auto.resources && this.canFleetAutomationProceed(fleet) ? 'stopped' : 'unavailable'
    );
    if (this.isAutomationFleetSelected(fleetId)) {
      this.automationToggleButton.textContent = 'Avvia automazione';
      this.automationToggleButton.setAttribute('aria-pressed', 'false');
      this.refreshAutomationState(fleetId);
    }
    if (wasRunning) console.info('[SDU] automation stopped', { fleetId });
  }

  failAutomation(fleetId = this.automationFleet?.id) {
    const auto = fleetId ? this.fleetAutomations.get(fleetId) : null;
    if (!auto) return;
    auto.running = false;
    auto.faulted = true;
    auto.runId += 1;
    auto.requestId += 1;
    if (auto.runTimer) clearTimeout(auto.runTimer);
    auto.runTimer = null;
    auto.initialScanPending = false;
    auto.initialScanReady = false;
    auto.resumeAfterExit = false;
    auto.waitingForEta = false;
    auto.awaitingMovementStart = false;
    auto.needsScanAfterMovement = false;
    auto.submissionPending = false;
    auto.actionPending = false;
    auto.postScanReady = false;
    auto.lastKnownSector = null;
    if (fleetId) this.setAutomationFleetState(fleetId, 'faulted');
    if (this.isAutomationFleetSelected(fleetId)) {
      this.automationStatus.textContent = 'Automazione bloccata per errore · premi Arresta per sbloccare';
      this.refreshAutomationState(fleetId);
    }
  }

  acknowledgeAutomationFault(fleetId = this.automationFleet?.id) {
    const auto = fleetId ? this.getFleetAutomation(fleetId) : null;
    if (!auto || !auto.faulted) return;
    auto.faulted = false;
    if (this.isAutomationFleetSelected(fleetId)) {
      this.automationStatus.textContent = 'Errore riconosciuto · automazione arrestata';
      this.refreshAutomationState(fleetId);
    }
    console.info('[SDU] automation error acknowledged by user', { fleetId });
  }

  canStartAutomation(fleetId = this.automationFleet?.id) {
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    const auto = fleetId ? this.getFleetAutomation(fleetId) : null;
    return this.automationSelect.value === 'sdu-program'
      && Boolean(auto?.resources)
      && this.canFleetAutomationProceed(fleet);
  }

  canFleetAutomationProceed(fleet) {
    const canResumeMovement = (fleet?.state === 'MoveSubwarp' || fleet?.state === 'MoveWarp') && Boolean(fleet.to);
    return Boolean(fleet?.sector) && (fleet.state === 'Idle' || fleet.state === 'StarbaseLoadingBay') || canResumeMovement;
  }

  refreshAutomationState(fleetId = this.automationFleet?.id) {
    if (!this.automationToggleButton || !this.isAutomationFleetSelected(fleetId)) return;
    const auto = this.getFleetAutomation(fleetId);
    if (this.automationRequestButton) this.automationRequestButton.disabled = auto?.running || !auto?.resources;
    const state = auto?.running ? 'running'
      : auto?.faulted ? 'faulted'
        : this.canStartAutomation(fleetId) ? 'stopped' : 'unavailable';
    this.automationToggleButton.textContent = state === 'running' || state === 'faulted'
      ? 'Arresta automazione'
      : 'Avvia automazione';
    this.automationToggleButton.setAttribute('aria-pressed', String(state === 'running'));
    this.automationToggleButton.disabled = state === 'unavailable';
    this.setAutomationFleetState(fleetId, state);
  }

  setAutomationFleetState(fleetId, state) {
    this.automationFleetStates.set(fleetId, state);
    for (const button of this.list.querySelectorAll('[data-automation-fleet-id]')) {
      if (button.dataset.automationFleetId !== fleetId) continue;
      button.classList.remove('is-running', 'is-stopped', 'is-unavailable');
      button.classList.add(`is-${state}`);
      const label = state === 'running' ? 'Automazione attiva' : state === 'stopped' ? 'Automazione arrestata' : 'Automazione non avviabile';
      button.title = label;
      button.setAttribute('aria-label', label);
    }
  }

  automationConfigKey(fleet) {
    return `sae:sdu-program:${this.snapshot.profileId}:${fleet.id}`;
  }

  loadAutomationConfig(fleet) {
    try {
      const saved = JSON.parse(localStorage.getItem(this.automationConfigKey(fleet)) || '{}');
      const legacyKeyMap = {
        percentuale_minima: 'field:% minima (pause strike)',
        pause_strike_iniziale: 'field:Strike soglia',
      };
      for (const control of this.automationForm.querySelectorAll('[data-config-key]')) {
        if (control.readOnly) continue;
        const key = control.dataset.configKey in saved
          ? control.dataset.configKey
          : legacyKeyMap[control.dataset.configKey];
        if (!key || !(key in saved)) continue;
        if (control instanceof HTMLInputElement && control.type === 'radio') control.checked = control.value === String(saved[key]);
        else if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(saved[key]);
        else control.value = String(saved[key]);
      }
      this.updateRecommendedRange();
      this.updateFeeControls();
    } catch {
      console.error('[SDU] fleet configuration load failed', { fleetId: fleet.id });
      this.automationStatus.textContent = 'Configurazione salvata non valida';
    }
  }

  saveAutomationConfig() {
    const fleet = this.automationFleet;
    if (!fleet) return;
    this.getFleetAutomation(fleet.id).config = this.readAutomationConfig();
    const config = this.readAutomationConfig(false);
    try {
      localStorage.setItem(this.automationConfigKey(fleet), JSON.stringify(config));
      console.info('[SDU] fleet configuration saved', { fleetId: fleet.id, savedFields: Object.keys(config).length });
      if (this.isAutomationFleetSelected(fleet.id)) {
        this.automationStatus.textContent = 'Parametri salvati nel browser';
      }
    } catch (error) {
      console.error('[SDU] fleet configuration save failed', { fleetId: fleet.id, error });
      if (this.isAutomationFleetSelected(fleet.id)) {
        this.automationStatus.textContent = 'Salvataggio locale non riuscito';
      }
    }
  }

  nameAt(sector) {
    const name = this.baseNames.get(sector.join(','));
    return name ? `${name} ${fmtSector(sector)}` : fmtSector(sector);
  }

  setSnapshot(snapshot) {
    this.snapshot = snapshot;
    this.reconcileFleetStatusOverrides();
    this.rebuildList();
    const selectedAuto = this.getCurrentAutoState();
    if (selectedAuto?.destination) this.updateAutomationActionButton(selectedAuto.fleetId);
    for (const [fleetId, auto] of this.fleetAutomations) {
      if (!auto.running) continue;
      if (auto.submissionPending) {
        this.refreshAutomationState(fleetId);
        continue;
      }
      this.processFleetAutomationSnapshot(auto);
    }
    this.refreshAutomationState();
    this.render();
  }

  processFleetAutomationSnapshot(auto) {
    const { fleetId, runId } = auto;
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    if (!fleet) {
      auto.missingSnapshots = (auto.missingSnapshots ?? 0) + 1;
      if (auto.missingSnapshots < 3) {
        console.warn('[SDU] fleet missing from snapshot · forcing refresh', { fleetId, attempt: auto.missingSnapshots });
        this.emit('refresh');
        return;
      }
      console.error('[SDU] automation stopped: fleet missing from snapshot', { fleetId });
      this.failAutomation(fleetId);
      return;
    }
    auto.missingSnapshots = 0;
    const expectedMovement = (auto.preparedAction === 'subwarp_start' && fleet.state === 'MoveSubwarp')
      || (auto.preparedAction === 'warp_start' && fleet.state === 'MoveWarp');
    if (auto.awaitingMovementStart) {
      console.debug('[SDU] setSnapshot: automationAwaitingMovementStart active', { fleetId, updatedState: fleet.state, expectedMovement, automationPreparedAction: auto.preparedAction });
      if (expectedMovement) {
        auto.awaitingMovementStart = false;
        auto.resumeAfterExit = true;
        this.waitForMovementArrival(fleet, runId);
      } else if (fleet.state === 'Idle') {
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationStatus.textContent = 'Movimento confermato · attendo aggiornamento chain';
        }
        this.refreshAutomationState(fleetId);
      } else {
        console.error('[SDU] movement start produced unexpected fleet state', {
          fleetId,
          state: fleet.state,
        });
        this.failAutomation(fleetId);
      }
    } else if (auto.awaitingMovementExit) {
      if (fleet.state === 'Idle' && fleet.sector) {
        auto.awaitingMovementExit = false;
        auto.resumeAfterExit = false;
        auto.needsScanAfterMovement = true;
        auto.initialScanPending = true;
        auto.initialScanReady = false;
        auto.destination = null;
        console.info('[SDU] signed movement exit observed on-chain; starting local scan', { fleetId });
        this.beginInitialAutomationScan(runId, null, fleetId);
      } else if (fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp') {
        if (this.isAutomationFleetSelected(fleetId)) {
          this.automationStatus.textContent = 'Uscita firmata · attendo conferma chain';
        }
        this.refreshAutomationState(fleetId);
      } else {
        console.error('[SDU] movement exit produced unexpected fleet state', {
          fleetId,
          state: fleet.state,
        });
        this.failAutomation(fleetId);
      }
    } else if (auto.resumeAfterExit) {
      if (fleet.state === 'Idle' && fleet.sector) {
        auto.resumeAfterExit = false;
        auto.initialScanPending = true;
        auto.initialScanReady = false;
        auto.destination = null;
        console.info('[SDU] movement exit observed on-chain; starting local scan', { fleetId });
        this.beginInitialAutomationScan(runId, null, fleetId);
      } else if (fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp') {
        this.waitForMovementArrival(fleet, runId);
      } else {
        console.error('[SDU] movement exit produced unexpected fleet state', {
          fleetId,
          state: fleet.state,
        });
        this.failAutomation(fleetId);
      }
        } else if (expectedMovement) {
      auto.resumeAfterExit = true;
      this.waitForMovementArrival(fleet, runId);
    } else if (auto.resupply && fleet.state === 'StarbaseLoadingBay') {
      // Durante il rifornimento la flotta è legittimamente nella loading bay della base
      this.refreshAutomationState(fleetId);
    } else if (!this.canFleetAutomationProceed(fleet)) {
      console.error('[SDU] automation stopped: fleet preconditions no longer hold', { fleetId });
      this.failAutomation(fleetId);
    } else {
      this.refreshAutomationState(fleetId);
    }
  }

  reconcileFleetStatusOverrides() {
    for (const [fleetId, override] of this.fleetStatusOverrides) {
      const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
      if (!fleet || fleet.state !== override.expectedState) continue;
      if (override.target && fleet.to
        && (fleet.to[0] !== override.target[0] || fleet.to[1] !== override.target[1])) continue;
      this.fleetStatusOverrides.delete(fleetId);
    }
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
        if (label === 'Automazione') {
          action.classList.add('automation-icon', 'is-unavailable');
          action.dataset.automationFleetId = fleet.id;
          action.setAttribute('aria-label', 'Automazione non avviabile');
          action.title = 'Automazione non avviabile';
        } else {
          action.setAttribute('aria-label', label);
          action.title = label;
        }
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
    for (const [fleetId, state] of this.automationFleetStates) this.setAutomationFleetState(fleetId, state);
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
    for (const { detail, fleet } of this.rows.values()) {
      const override = this.fleetStatusOverrides.get(fleet.id);
      if (override?.arrivalMs && Date.now() > override.arrivalMs) this.fleetStatusOverrides.delete(fleet.id);
      detail.textContent = this.fleetStatusOverrides.get(fleet.id)?.text
        ?? describe(fleet, now, s => this.nameAt(s), this.fleetScanSummaries.get(fleet.id));
    }
  }
}
