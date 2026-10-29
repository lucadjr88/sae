import { Emitter } from '../util/emitter.js';
import { STALE_AFTER_MS } from '../config.js';
import { shipLook } from '../map/shipSprites.js';
import { buildScanFilterPayload, requestScanFilter, simulateScanFilterResponse } from '../automation/scanFilter.js';
import { resolveScanOperation } from '../automation/scanOperation.js';
import { ScanPolicy } from '../automation/scanPolicy.js';
import { SeaTransactionClient } from '../automation/seaTransactionClient.js';
import { LocalSigner } from '../automation/localSigner.js';

const fmtSector = s => `(${s[0]}, ${s[1]})`;

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
    this.automationStatus = document.createElement('div');
    this.automationStatus.className = 'automation-status';
    this.automationStatus.setAttribute('role', 'status');
    this.automationRequestId = 0;
    this.automationResourcesLoadedFor = null;
    this.automationResourcesLoadedAt = 0;
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
    this.automationRunning = false;
    this.automationFaulted = false;
    this.automationRunTimer = null;
    this.automationWaitingForEta = false;
    this.automationAwaitingMovementStart = false;
    this.automationAwaitingMovementExit = false;
    this.automationSubmissionPending = false;
    this.automationActionPending = false;
    this.automationNeedsScanAfterMovement = false;
    this.automationRunId = 0;
    this.automationFleetStates = new Map();
    this.fleetScanSummaries = new Map();
    this.fleetStatusOverrides = new Map();
    this.scanPolicy = new ScanPolicy();
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
      if (this.automationRunning) this.stopAutomation();
      else if (this.automationFaulted) this.acknowledgeAutomationFault();
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
    this.stopAutomation();
    this.automationRequestId += 1;
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

  openAutomation(fleet) {
    const continuing = this.automationFleet?.id === fleet.id && (this.automationRunning || this.automationFaulted);
    if (!continuing) {
      if (this.automationRunning) this.stopAutomation();
      this.scanPolicy.reset();
      this.automationSelect.value = '';
      this.automationForm.hidden = true;
      this.automationRequestButton.hidden = true;
      this.automationSaveButton.hidden = true;
      this.automationToggleButton.hidden = true;
      this.automationResult.textContent = '';
      this.automationDestination = null;
      this.automationLastScanSummary = '';
      this.automationScanTransaction = null;
      this.automationPreparedResult = null;
      this.automationPreparedAction = null;
      this.automationScanButton.hidden = true;
      this.automationScanResult.hidden = true;
      this.automationScanSubmitButton.hidden = true;
      this.automationResources = null;
      this.automationFleet = fleet;
      this.automationInitialScanPending = false;
      this.automationInitialScanReady = false;
      this.automationResumeAfterExit = false;
      this.automationWaitingForEta = false;
      this.automationAwaitingMovementStart = false;
      this.automationAwaitingMovementExit = false;
      this.automationNeedsScanAfterMovement = false;
      this.automationSubmissionPending = false;
      this.automationActionPending = false;
      this.automationFaulted = this.automationFleetStates.get(fleet.id) === 'faulted';
      if ((fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp') && fleet.to) {
        this.automationDestination = { x: fleet.to[0], y: fleet.to[1], sb: null };
      }
      this.automationRequestButton.disabled = true;
      this.automationToggleButton.disabled = true;
      this.setAutomationFleetState(fleet.id, 'unavailable');
      this.automationStatus.textContent = 'Lettura risorse on-chain…';
      this.populateAutomationForm(fleet);
      this.loadAutomationConfig(fleet);
    } else {
      this.automationFleet = this.snapshot.fleets.find(item => item.id === fleet.id) ?? fleet;
      this.automationSelect.value = 'sdu-program';
      this.automationForm.hidden = false;
      this.automationRequestButton.hidden = false;
      this.automationSaveButton.hidden = false;
      this.automationToggleButton.hidden = false;
      if (this.automationDestination) this.updateAutomationActionButton();
      this.refreshAutomationState();
    }
    this.automationOverlay.hidden = false;
    this.automationClose.focus();
    if (!continuing) {
      const requestId = ++this.automationRequestId;
      this.loadAutomationResources(fleet, requestId);
    }
  }

  async loadAutomationResources(fleet, requestId) {
    const now = Date.now();
    // Evita chiamate duplicate per lo stesso fleetId entro una soglia breve:
    // i dati on-chain (fuel/food) cambiano lentamente, riusare la cache evita RPC inutili.
    if (
      this.automationResourcesLoadedFor === fleet.id &&
      this.automationResources &&
      now - this.automationResourcesLoadedAt < 30_000
    ) {
      console.debug('[SDU] fleet resources cached, skipping fetch', { fleetId: fleet.id });
      if (requestId !== this.automationRequestId) return;
      const resources = this.automationResources;
      for (const key of ['fuelCurrent', 'fuelCapacity', 'fuelCurrentPct', 'foodCurrent']) {
        if (typeof resources[key] !== 'number' || !Number.isFinite(resources[key])) {
          throw new Error(`INVALID_FLEET_RESOURCES_CACHE:${key}`);
        }
      }
      this.observeAutomationFuel(resources);
      this.automationRequestButton.disabled = this.automationRunning;
      this.automationStatus.textContent = `Fuel ${resources.fuelCurrent.toFixed(2)} / ${resources.fuelCapacity.toFixed(2)} (${resources.fuelCurrentPct.toFixed(1)}%) · Food ${resources.foodCurrent.toFixed(2)}`;
      this.refreshAutomationState();
      return true;
    }

    try {
      const query = new URLSearchParams({ profileId: this.snapshot.profileId, fleetId: fleet.id });
      console.debug('[SDU] loading fleet resources', { fleetId: fleet.id });
      const response = await fetch(`/api/sea/fleet-resources?${query}`);
      const resources = await response.json();
      if (!response.ok) throw new Error(resources.error || 'resource lookup failed');
      // Validazione difensiva: i campi numerici devono essere presenti e finiti
      for (const key of ['fuelCurrent', 'fuelCapacity', 'fuelCurrentPct', 'foodCurrent']) {
        if (typeof resources[key] !== 'number' || !Number.isFinite(resources[key])) {
          throw new Error(`INVALID_FLEET_RESOURCES:${key}`);
        }
      }
      if (requestId !== this.automationRequestId) return;
      this.automationResources = resources;
      this.automationResourcesLoadedFor = fleet.id;
      this.automationResourcesLoadedAt = now;
      this.observeAutomationFuel(resources);
      console.debug('[SDU] fleet resources loaded', resources);
      this.automationRequestButton.disabled = this.automationRunning;
      this.automationStatus.textContent = `Fuel ${resources.fuelCurrent.toFixed(2)} / ${resources.fuelCapacity.toFixed(2)} (${resources.fuelCurrentPct.toFixed(1)}%) · Food ${resources.foodCurrent.toFixed(2)}`;
      this.refreshAutomationState();
      return true;
    } catch (error) {
      if (requestId !== this.automationRequestId) return false;
      console.error('[SDU] fleet resource read failed', { fleetId: fleet.id, error });
      this.automationResources = null;
      this.automationRequestButton.disabled = true;
      this.automationStatus.textContent = 'Risorse on-chain non disponibili';
      this.refreshAutomationState();
      return false;
    }
  }

  async requestAutomationDestination() {
    const fleetId = this.automationFleet?.id;
    const fleet = this.snapshot.fleets.find(item => item.id === fleetId);
    try {
      if (!fleet) throw new Error('Flotta assente dallo snapshot aggiornato');
      this.automationFleet = fleet;
      if (fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp') {
        if (fleet.to) this.automationDestination = { x: fleet.to[0], y: fleet.to[1], sb: null };
        this.updateAutomationActionButton();
        const remaining = Math.max(0, fleet.arrival - Date.now());
        this.automationResult.textContent = remaining > 0
          ? `${fleet.state} in corso · uscita disponibile tra ${Math.ceil(remaining / 1000)}s`
          : `${fleet.state} arrivato · prepara l’uscita prima di richiedere una nuova destinazione`;
        return false;
      }
      if (fleet.state !== 'Idle' || !fleet.sector) throw new Error('Flotta non pronta per una richiesta di destinazione');
      const previousCell = fleet.sector;
      const requestType = this.scanPolicy.takeRequestType();
      if (requestType === 'area') console.info('[SDU] one-shot area request selected', { fleetId: fleet.id });
      const payload = buildScanFilterPayload({
        form: this.automationForm,
        fleet,
        currentCoords: previousCell,
        resources: this.automationResources,
        requestType,
      });
      console.info(`[SDU] scan-filter payload\n${JSON.stringify(payload, null, 2)}`);
      const simulate = this.settingsSimulateScanFilter?.checked ?? false;
      this.automationRequestButton.disabled = true;
      this.automationResult.textContent = 'Selezione destinazione…';
      this.automationScanTransaction = null;
      this.automationScanResult.hidden = true;
      console.debug('[SDU] destination selection started', { fleetId: fleet.id, simulate });
      const result = simulate
        ? simulateScanFilterResponse(payload)
        : await requestScanFilter({
          host: this.settingsApiHost?.value,
          port: this.settingsApiPort?.value,
          timeoutSeconds: this.settingsRequestTimeout?.value,
          payload,
        });
      this.automationDestination = { x: Number(result.x), y: Number(result.y), sb: result.sb ?? null };
      this.updateAutomationActionButton();
      this.automationScanResult.hidden = true;
      if (simulate) console.debug('[SDU] simulated scan-filter response', result);
      const destinationSummary = `Destinazione ${result.x},${result.y}${result.sb ? ` · SB ${result.sb}` : ''}${result['%'] == null ? '' : ` · API ${result['%']}%`}${result.source === 'simulated' ? ' · simulata' : ''}`;
      this.automationResult.textContent = [this.automationLastScanSummary, destinationSummary].filter(Boolean).join(' · ');
      return true;
    } catch (error) {
      console.error('[SDU] destination selection failed', { fleetId: fleet?.id, error });
      this.automationDestination = null;
      this.automationScanButton.hidden = true;
      this.automationResult.textContent = error instanceof Error ? error.message : 'Errore richiesta destinazione';
      return false;
    } finally {
      this.automationRequestButton.disabled = this.automationRunning || !this.automationResources;
    }
  }

  async prepareAutomationScan() {
    const fleet = this.snapshot.fleets.find(item => item.id === this.automationFleet?.id);
    const destination = this.automationDestination;
    if (!fleet || !destination) return false;
    this.automationFleet = fleet;
    const movementMode = this.automationForm.querySelector('input[name="sea-movementMode"]:checked')?.value ?? 'subwarp';
    const operation = resolveScanOperation(fleet, destination, movementMode);
    if (operation.status === 'waiting') {
      this.automationScanResult.hidden = false;
      this.automationScanResult.textContent = 'Movimento in corso; attendere l’arrivo chain.';
      return false;
    }
    if (operation.status !== 'ready') {
      this.automationScanResult.hidden = false;
      this.automationScanResult.textContent = `Stato flotta ${fleet.state}: preparazione non disponibile.`;
      return false;
    }
    const { action } = operation;
    if (this.automationInitialScanPending && action === 'scan' && !this.automationInitialScanReady) {
      this.automationScanResult.hidden = false;
      this.automationScanResult.textContent = 'Scan non ancora disponibile: cooldown on-chain attivo.';
      return false;
    }
    this.automationScanButton.disabled = true;
    this.automationScanResult.hidden = false;
    this.automationScanResult.textContent = 'Connessione wallet e simulazione…';
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
          ? destination.sb || this.automationForm.querySelector('[data-scan-param="sbCoords"]')?.value
          : undefined,
        feeMode: this.settingsUseSlyFee?.checked ? 'sly' : 'wallet',
        priorityFeeLamports: this.settingsPriorityFeeInput?.value ?? '1',
      });
      this.automationScanTransaction = result.transaction;
      this.automationPreparedResult = result;
      this.automationScanPrepareId = result.prepareId ?? null;
      this.automationPreparedAction = result.action;
      this.automationScanSubmitButton.textContent = this.automationPreparedAction === 'subwarp_start'
        ? 'Firma e avvia Subwarp'
        : this.automationPreparedAction === 'warp_start'
          ? 'Firma e avvia Warp'
        : this.automationPreparedAction === 'subwarp_exit'
          ? 'Firma e completa Subwarp'
          : this.automationPreparedAction === 'warp_exit'
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
      if (result.simulation.err) {
        this.automationScanTransaction = null;
        this.automationScanPrepareId = null;
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
      if (!prepared && this.automationInitialScanPending && this.automationRunning) this.failAutomation();
      return prepared;
    } catch (error) {
      this.automationScanTransaction = null;
      this.automationPreparedResult = null;
      this.automationScanPrepareId = null;
      this.automationScanSubmitButton.hidden = true;
      const movementExit = action === 'subwarp_exit' || action === 'warp_exit';
      const movementExitCompletedOnChain =
        movementExit && error instanceof Error && error.message === 'FLEET_NOT_IN_MOVEMENT';
      if (movementExitCompletedOnChain && this.automationRunning) {
        console.warn(
          '[SDU] movement exit rejected during preparation: fleet already Idle on chain; proceeding to scan',
          { fleetId: fleet.id, action }
        );
        this.automationAwaitingMovementExit = false;
        this.automationNeedsScanAfterMovement = true;
        this.automationInitialScanPending = true;
        this.automationInitialScanReady = false;
        this.automationScanResult.textContent = 'Movimento già completato su chain · avvio scansione';
        await this.beginInitialAutomationScan(this.automationRunId);
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      const isRpcTemporary = /503|Service Unavailable|429|Too Many Requests|fetch failed|socket hang up|ECONNREFUSED|ENOTFOUND|getaddrinfo|timeout|timed out|failed to get info about account/i.test(message);
      if (
        isRpcTemporary &&
        attempt + 1 < maxRetries &&
        this.automationRunning &&
        this.automationInitialScanPending
      ) {
        console.warn(
          '[SDU] RPC temporary error during scan preparation, retrying',
          { attempt: attempt + 1, maxRetries, fleetId: fleet.id, message }
        );
        this.automationScanResult.textContent = `Errore RPC temporaneo, riprovo (${attempt + 1}/${maxRetries})…`;
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      this.automationScanResult.textContent = error instanceof Error ? error.message : 'Preparazione scan non riuscita';
      console.error('[SDU] scan preparation failed', { fleetId: fleet.id, coordinates: [destination.x, destination.y], error });
      if (this.automationInitialScanPending && this.automationRunning) this.failAutomation();
      return false;
    } finally {
      this.automationScanButton.disabled = this.automationRunning;
    }
    return false;
  }

  updateAutomationActionButton() {
    const fleet = this.snapshot.fleets.find(item => item.id === this.automationFleet?.id);
    const destination = this.automationDestination;
    if (!fleet || !destination) {
      this.automationScanButton.hidden = true;
      return;
    }
    this.automationScanButton.hidden = false;
    const movementMode = this.automationForm.querySelector('input[name="sea-movementMode"]:checked')?.value ?? 'subwarp';
    const operation = resolveScanOperation(fleet, destination, movementMode);
    if (operation.status === 'waiting') {
      this.automationScanButton.textContent = operation.action === 'warp_exit' ? 'Warp in corso' : 'Subwarp in corso';
      this.automationScanButton.disabled = true;
    } else if (operation.status === 'ready') {
      if (this.automationInitialScanPending && operation.action === 'scan' && !this.automationInitialScanReady) {
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
      if (this.automationInitialScanPending && operation.action === 'scan') {
        this.automationScanButton.textContent = 'Prepara scan iniziale';
      }
      this.automationScanButton.disabled = this.automationRunning;
    } else {
      this.automationScanButton.textContent = 'Azione non disponibile';
      this.automationScanButton.disabled = true;
    }
  }

  async submitPreparedScan(retryExpiredPreparation = true) {
    if (this.automationSubmissionPending || !(this.wallet || this.localSigner.unlocked) || !this.automationScanTransaction || !this.automationScanPrepareId || !this.automationFleet) return;
    const submittedAction = this.automationPreparedAction;
    const preparedResult = this.automationPreparedResult;
    const scanAction = submittedAction === 'scan';
    const movementStart = submittedAction === 'subwarp_start' || submittedAction === 'warp_start';
    const movementExit = submittedAction === 'subwarp_exit' || submittedAction === 'warp_exit';
    const runId = this.automationRunId;
    this.automationSubmissionPending = true;
    this.automationScanSubmitButton.disabled = true;
    try {
      const result = await this.transactionClient.signAndSubmit({
        prepareId: this.automationScanPrepareId,
        profileId: this.snapshot.profileId,
        transaction: this.automationScanTransaction,
        action: submittedAction,
      });
      this.automationSubmissionPending = false;
      this.automationScanPrepareId = null;
      this.automationScanTransaction = null;
      this.automationPreparedResult = null;
      this.automationScanSubmitButton.hidden = true;
      console.info('[SDU] on-chain action confirmed', { fleetId: this.automationFleet.id, action: result.action, signature: result.signature });
      console.info('[SDU] transaction fee', { fleetId: this.automationFleet.id, signature: result.signature, ...result.fee });
      this.automationScanResult.textContent = JSON.stringify(result, null, 2);
      if (result.action === 'scan') {
        this.automationLastScanSummary = this.formatScanResult(result.scanResult);
        const fleetScanSummary = this.formatFleetScanStatus(result.scanResult);
        if (fleetScanSummary) this.fleetScanSummaries.set(this.automationFleet.id, fleetScanSummary);
        this.automationResult.textContent = this.automationLastScanSummary;
        console.info('[SDU] scan result', { fleetId: this.automationFleet.id, ...result.scanResult });
        this.render();
      }
      if (scanAction && this.automationRunning && runId === this.automationRunId) {
        this.automationInitialScanPending = false;
        this.automationInitialScanReady = false;
        this.automationNeedsScanAfterMovement = false;
        this.automationDestination = null;
        this.automationStatus.textContent = 'Scan confermata · selezione destinazione…';
        await this.continueAutomationAfterInitialScan(runId);
      } else if (movementExit && this.automationRunning && runId === this.automationRunId) {
        this.automationAwaitingMovementStart = false;
        this.automationAwaitingMovementExit = false;
        const fleet = this.snapshot.fleets.find(item => item.id === this.automationFleet.id);
        const exitTarget = preparedResult?.coordinates ?? this.automationDestination;
        this.fleetStatusOverrides.set(this.automationFleet.id, {
          text: `Idle · (${exitTarget?.[0] ?? exitTarget?.x ?? '?'}, ${exitTarget?.[1] ?? exitTarget?.y ?? '?'}) · exit confermato`,
          expectedState: 'Idle',
        });
        this.render();
        if (fleet?.state === 'Idle' && fleet.sector) {
          this.automationResumeAfterExit = false;
          this.automationNeedsScanAfterMovement = true;
          this.automationInitialScanPending = true;
          this.automationInitialScanReady = false;
          this.automationDestination = null;
          this.beginInitialAutomationScan(runId);
        } else {
          clearTimeout(this.automationRunTimer);
          this.automationRunTimer = null;
          this.automationWaitingForEta = false;
          this.automationResumeAfterExit = true;
          this.automationAwaitingMovementExit = true;
          this.automationStatus.textContent = 'Uscita confermata · attendo stato Idle on-chain';
          console.info('[SDU] movement exit confirmed; waiting for Idle snapshot', { fleetId: this.automationFleet.id, action: result.action });
        }
      } else if (movementStart && this.automationRunning && runId === this.automationRunId) {
        const fleet = this.snapshot.fleets.find(item => item.id === this.automationFleet.id);
        const expectedState = submittedAction === 'warp_start' ? 'MoveWarp' : 'MoveSubwarp';
        const target = preparedResult?.coordinates ?? this.automationDestination;
        const targetX = target?.[0] ?? target?.x ?? '?';
        const targetY = target?.[1] ?? target?.y ?? '?';
        const mode = submittedAction === 'warp_start' ? 'warp' : 'subwarp';
        const eta = Number(preparedResult?.arrivalSeconds);
        this.fleetStatusOverrides.set(this.automationFleet.id, {
          text: `${mode} → (${targetX}, ${targetY}) · arrivo ${Number.isFinite(eta) ? fmtEta(eta * 1000) : 'in corso'}`,
          expectedState,
          target: [Number(targetX), Number(targetY)],
        });
        this.render();
        clearTimeout(this.automationRunTimer);
        this.automationRunTimer = null;
        this.automationResumeAfterExit = true;
        if (fleet?.state === expectedState) {
          this.automationAwaitingMovementStart = false;
          this.waitForMovementArrival(fleet, runId);
        } else {
          this.automationAwaitingMovementStart = true;
          this.automationStatus.textContent = `${expectedState} confermato · attendo snapshot chain`;
        }
      } else {
        this.stopAutomation();
      }
    } catch (error) {
      this.automationScanPrepareId = null;
      this.automationScanTransaction = null;
      this.automationPreparedResult = null;
      this.automationScanSubmitButton.hidden = true;
      this.automationScanResult.textContent = error instanceof Error ? error.message : 'Firma o invio scan non riuscito';
      console.error('[SDU] transaction action failed', {
        fleetId: this.automationFleet.id,
        action: submittedAction,
        name: error?.name,
        message: error?.message ?? String(error),
        code: error?.code,
        logs: error?.logs ?? error?.data?.logs ?? error?.cause?.logs,
        cause: error?.cause?.message ?? error?.cause,
      });
      const expiredBeforeSend = error instanceof Error && error.message === 'SCAN_TRANSACTION_BLOCKHASH_EXPIRED';
      if (expiredBeforeSend && retryExpiredPreparation && this.automationRunning && runId === this.automationRunId) {
        console.warn('[SDU] prepared transaction expired before send; preparing a fresh transaction');
        this.automationScanResult.textContent = 'Transazione scaduta prima dell’invio · preparo un nuovo messaggio da confermare';
        const prepared = await this.prepareAutomationScan();
        if (prepared && this.automationRunning && runId === this.automationRunId) {
          this.automationSubmissionPending = false;
          await this.submitPreparedScan(false);
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
        this.automationRunning &&
        runId === this.automationRunId
      ) {
        console.warn(
          '[SDU] movement exit rejected: fleet already Idle on chain; proceeding to scan',
          { fleetId: this.automationFleet.id, action: submittedAction }
        );
        this.automationAwaitingMovementExit = false;
        this.automationNeedsScanAfterMovement = true;
        this.automationInitialScanPending = true;
        this.automationInitialScanReady = false;
        this.automationStatus.textContent =
          'Movimento già completato su chain · avvio scansione';
        await this.beginInitialAutomationScan(runId);
        return;
      }
      if ((scanAction || movementStart || movementExit) && this.automationRunning && runId === this.automationRunId) this.failAutomation();
    } finally {
      this.automationSubmissionPending = false;
      this.automationScanSubmitButton.disabled = false;
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
    if (!scanResult || !Number.isFinite(scanResult.probabilityPct) || !Number.isFinite(scanResult.sduFound)) return null;
    return `Scanned: ${Math.round(scanResult.probabilityPct)}% +${Number(scanResult.sduFound).toFixed(0)}SDU`;
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
    addInput(this.automationRight, '% minima (pause strike)', '10');
    addInput(this.automationRight, 'Strike soglia', '5');
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

  startAutomation() {
    if (this.automationRunning) return;
    if (!this.canStartAutomation()) {
      this.refreshAutomationState();
      return;
    }
    if (this.localSigner.storedPublicKey() && !this.localSigner.unlocked) {
      this.automationStatus.textContent = 'Chiave locale salvata ma bloccata · inserisci la password e premi Sblocca';
      return;
    }
    console.info('[SDU] signer mode', { mode: this.localSigner.unlocked ? 'local' : 'wallet' });
    this.automationRunning = true;
    const runId = ++this.automationRunId;
    this.automationInitialScanPending = true;
    this.automationInitialScanReady = false;
    this.automationResumeAfterExit = false;
    this.setAutomationFleetState(this.automationFleet.id, 'running');
    console.info('[SDU] automation started with scan at current sector', { fleetId: this.automationFleet.id });
    this.automationToggleButton.textContent = 'Arresta automazione';
    this.automationToggleButton.setAttribute('aria-pressed', 'true');
    this.automationToggleButton.disabled = false;
    this.automationRequestButton.disabled = true;
    this.automationStatus.textContent = 'Scan iniziale richiesta sulla posizione corrente';
    this.beginInitialAutomationScan(runId);
  }

  async beginInitialAutomationScan(runId) {
    if (!this.automationRunning || runId !== this.automationRunId) return;
    const fleet = this.snapshot.fleets.find(item => item.id === this.automationFleet?.id);
    if (!fleet) {
      console.error('[SDU] initial scan stopped: fleet missing from snapshot', { fleetId: this.automationFleet?.id });
      this.failAutomation();
      return;
    }
    this.automationFleet = fleet;
    if (fleet.state === 'MoveSubwarp' || fleet.state === 'MoveWarp') {
      this.automationResumeAfterExit = true;
      this.waitForMovementArrival(fleet, runId);
      return;
    }
    if (fleet.state !== 'Idle' || !fleet.sector) {
      console.error('[SDU] initial scan stopped: unsupported fleet state', { fleetId: fleet.id, state: fleet.state });
      this.failAutomation();
      return;
    }
    this.automationDestination = { x: fleet.sector[0], y: fleet.sector[1], sb: null };
    this.updateAutomationActionButton();
    const cooldownRemaining = Math.max(0, Number(fleet.scanCooldownEnd ?? 0) - Date.now());
    if (cooldownRemaining > 0) {
      if (this.automationNeedsScanAfterMovement) {
        this.automationStatus.textContent = `Scan cooldown chain · attendo ${Math.ceil(cooldownRemaining / 1000)}s`;
        clearTimeout(this.automationRunTimer);
        this.automationRunTimer = setTimeout(() => {
          this.automationRunTimer = null;
          if (this.automationRunning && runId === this.automationRunId) this.beginInitialAutomationScan(runId);
        }, cooldownRemaining);
        this.automationScanButton.textContent = 'Cooldown scan attivo';
        this.automationScanButton.disabled = true;
        this.automationScanButton.hidden = false;
        return;
      }
      this.automationInitialScanPending = false;
      this.automationInitialScanReady = false;
      this.automationStatus.textContent = 'Scan in cooldown · richiedo la prossima destinazione';
      await this.continueAutomationAfterInitialScan(runId);
      return;
    }
    this.automationInitialScanReady = true;
    this.updateAutomationActionButton();
    this.automationStatus.textContent = 'Preparo la scan iniziale sulla posizione corrente';
    await this.runAutomationAction(runId);
  }

  async waitForMovementArrival(fleet, runId) {
    if (!fleet.to) {
      console.error('[SDU] movement recovery stopped: on-chain target missing', { fleetId: fleet.id, state: fleet.state });
      this.failAutomation();
      return;
    }
    this.automationFleet = fleet;
    this.automationDestination = { x: fleet.to[0], y: fleet.to[1], sb: null };
    this.updateAutomationActionButton();
    const remaining = Math.max(0, Number(fleet.arrival ?? 0) - Date.now());
    const movementName = fleet.state === 'MoveWarp' ? 'Warp' : 'Subwarp';
    if (remaining === 0) {
      clearTimeout(this.automationRunTimer);
      this.automationRunTimer = null;
      this.automationWaitingForEta = false;
      this.automationStatus.textContent = `${movementName} arrivato · prepara uscita`;
      if (this.automationRunning && runId === this.automationRunId) await this.runAutomationAction(runId);
      return;
    }
    this.automationStatus.textContent = `${movementName} in corso · attendo ETA chain`;
    if (this.automationWaitingForEta) return;
    clearTimeout(this.automationRunTimer);
    this.automationWaitingForEta = true;
    this.automationRunTimer = setTimeout(() => {
      this.automationRunTimer = null;
      this.automationWaitingForEta = false;
      if (this.automationRunning && runId === this.automationRunId) this.beginInitialAutomationScan(runId);
    }, remaining);
  }

  async continueAutomationAfterInitialScan(runId) {
    if (!this.automationRunning || runId !== this.automationRunId) return;
    const fleet = this.snapshot.fleets.find(item => item.id === this.automationFleet?.id);
    if (!fleet || fleet.state !== 'Idle' || !fleet.sector) {
      console.error('[SDU] post-scan destination request blocked: fleet is not Idle', { fleetId: fleet?.id, state: fleet?.state });
      this.failAutomation();
      return;
    }
    this.automationFleet = fleet;
    if (!await this.loadAutomationResources(fleet, this.automationRequestId)) {
      if (this.automationRunning && runId === this.automationRunId) this.failAutomation();
      return;
    }
    if (!this.automationRunning || runId !== this.automationRunId) return;
    if (!await this.requestAutomationDestination()) {
      if (this.automationRunning && runId === this.automationRunId) this.failAutomation();
      return;
    }
    await this.runAutomationAction(runId);
  }

  async runAutomationAction(runId) {
    if (!this.automationRunning || runId !== this.automationRunId) return;
    const fleet = this.snapshot.fleets.find(item => item.id === this.automationFleet?.id);
    if (!fleet || !this.automationDestination) {
      console.error('[SDU] automatic action missing fleet or destination', { fleetId: this.automationFleet?.id, destination: this.automationDestination });
      this.failAutomation();
      return;
    }
    this.automationFleet = fleet;
    const movementMode = this.automationForm.querySelector('input[name="sea-movementMode"]:checked')?.value ?? 'subwarp';
    const operation = resolveScanOperation(fleet, this.automationDestination, movementMode);
    if (operation.status === 'waiting') {
      this.waitForMovementArrival(fleet, runId);
      return;
    }
    if (operation.status !== 'ready') {
      console.error('[SDU] automatic action unavailable', { fleetId: fleet.id, state: fleet.state, reason: operation.reason });
      this.failAutomation();
      return;
    }
    if (operation.action === 'scan') {
      const remaining = Math.max(0, Number(fleet.scanCooldownEnd ?? 0) - Date.now());
      if (remaining > 0) {
        this.automationStatus.textContent = `Scan cooldown chain · attendo ${Math.ceil(remaining / 1000)}s`;
        clearTimeout(this.automationRunTimer);
        this.automationRunTimer = setTimeout(() => {
          this.automationRunTimer = null;
          if (this.automationRunning && runId === this.automationRunId) this.runAutomationAction(runId);
        }, remaining);
        return;
      }
    }
    if (this.automationActionPending) return;
    this.automationActionPending = true;
    let prepared = false;
    try {
      prepared = await this.prepareAutomationScan();
    } finally {
      this.automationActionPending = false;
    }
    if (!prepared) {
      if (this.automationRunning && runId === this.automationRunId) this.failAutomation();
      return;
    }
    if (!this.automationRunning || runId !== this.automationRunId) return;
    if (operation.action === 'subwarp_start' || operation.action === 'warp_start') {
      this.automationAwaitingMovementStart = true;
      this.automationNeedsScanAfterMovement = true;
    }
    if (operation.action === 'subwarp_exit' || operation.action === 'warp_exit') this.automationAwaitingMovementExit = true;
    await this.submitPreparedScan();
  }

  observeAutomationFuel(resources) {
    const fuelMinimum = Number(this.automationForm.querySelector('[data-scan-param="fuel_min"]')?.value);
    const crossing = this.scanPolicy.observeFuel(resources.fuelCurrentPct, fuelMinimum);
    if (!crossing) return;
    console.info('[SDU] fuel crossed minimum; next request is area', {
      fleetId: this.automationFleet?.id,
      ...crossing,
      fuelMinimum,
    });
  }

  stopAutomation() {
    const wasRunning = this.automationRunning;
    this.automationRunning = false;
    this.automationRunId += 1;
    clearTimeout(this.automationRunTimer);
    this.automationRunTimer = null;
    this.automationInitialScanPending = false;
    this.automationInitialScanReady = false;
    this.automationResumeAfterExit = false;
    this.automationWaitingForEta = false;
    this.automationAwaitingMovementStart = false;
    this.automationNeedsScanAfterMovement = false;
    if (wasRunning) this.automationFaulted = false;
    if (this.automationToggleButton) {
      this.automationToggleButton.textContent = 'Avvia automazione';
      this.automationToggleButton.setAttribute('aria-pressed', 'false');
    }
    this.refreshAutomationState();
    if (wasRunning) console.info('[SDU] automation stopped', { fleetId: this.automationFleet?.id });
  }

  failAutomation() {
    this.automationRunning = false;
    this.automationFaulted = true;
    this.automationInitialScanPending = false;
    this.automationInitialScanReady = false;
    this.automationResumeAfterExit = false;
    this.automationWaitingForEta = false;
    this.automationAwaitingMovementStart = false;
    this.automationNeedsScanAfterMovement = false;
    this.automationRunId += 1;
    clearTimeout(this.automationRunTimer);
    this.automationRunTimer = null;
    if (this.automationFleet) this.setAutomationFleetState(this.automationFleet.id, 'faulted');
    this.automationStatus.textContent = 'Automazione bloccata per errore · premi Arresta per sbloccare';
    this.refreshAutomationState();
  }

  acknowledgeAutomationFault() {
    if (!this.automationFaulted) return;
    this.automationFaulted = false;
    this.automationStatus.textContent = 'Errore riconosciuto · automazione arrestata';
    this.refreshAutomationState();
    console.info('[SDU] automation error acknowledged by user', { fleetId: this.automationFleet?.id });
  }

  canStartAutomation() {
    const fleet = this.snapshot.fleets.find(item => item.id === this.automationFleet?.id);
    const canResumeMovement = (fleet?.state === 'MoveSubwarp' || fleet?.state === 'MoveWarp') && Boolean(fleet.to);
    return this.automationSelect.value === 'sdu-program'
      && Boolean(this.automationResources)
      && (Boolean(fleet?.sector) && fleet.state === 'Idle' || canResumeMovement);
  }

  refreshAutomationState() {
    if (!this.automationToggleButton) return;
    if (this.automationRequestButton) this.automationRequestButton.disabled = this.automationRunning || !this.automationResources;
    const state = this.automationRunning ? 'running'
      : this.automationFaulted ? 'faulted'
        : this.canStartAutomation() ? 'stopped' : 'unavailable';
    this.automationToggleButton.textContent = state === 'running' || state === 'faulted'
      ? 'Arresta automazione'
      : 'Avvia automazione';
    this.automationToggleButton.setAttribute('aria-pressed', String(state === 'running'));
    this.automationToggleButton.disabled = state === 'unavailable';
    if (this.automationFleet) this.setAutomationFleetState(this.automationFleet.id, state);
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
      for (const control of this.automationForm.querySelectorAll('[data-config-key]')) {
        if (control.readOnly || !(control.dataset.configKey in saved)) continue;
        if (control instanceof HTMLInputElement && control.type === 'radio') control.checked = control.value === String(saved[control.dataset.configKey]);
        else if (control instanceof HTMLInputElement && control.type === 'checkbox') control.checked = Boolean(saved[control.dataset.configKey]);
        else control.value = String(saved[control.dataset.configKey]);
      }
      this.updateRecommendedRange();
      this.updateFeeControls();
      console.debug('[SDU] fleet configuration loaded', { fleetId: fleet.id, savedFields: Object.keys(saved).length });
    } catch {
      console.error('[SDU] fleet configuration load failed', { fleetId: fleet.id });
      this.automationStatus.textContent = 'Configurazione salvata non valida';
    }
  }

  saveAutomationConfig() {
    const fleet = this.automationFleet;
    if (!fleet) return;
    const config = {};
    for (const control of this.automationForm.querySelectorAll('[data-config-key]')) {
      if (control.readOnly) continue;
      if (control instanceof HTMLInputElement && control.type === 'radio' && !control.checked) continue;
      config[control.dataset.configKey] = control instanceof HTMLInputElement && control.type === 'checkbox'
        ? control.checked
        : control.value;
    }
    try {
      localStorage.setItem(this.automationConfigKey(fleet), JSON.stringify(config));
      console.info('[SDU] fleet configuration saved', { fleetId: fleet.id, savedFields: Object.keys(config).length });
      this.automationStatus.textContent = 'Parametri salvati nel browser';
    } catch (error) {
      console.error('[SDU] fleet configuration save failed', { fleetId: fleet.id, error });
      this.automationStatus.textContent = 'Salvataggio locale non riuscito';
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
    if (!this.automationOverlay.hidden && this.automationDestination) this.updateAutomationActionButton();
    if (this.automationRunning && this.automationSubmissionPending) {
      this.refreshAutomationState();
      this.render();
      return;
    }
    const updatedAutomationFleet = this.snapshot.fleets.find(item => item.id === this.automationFleet?.id);
    const expectedMovement = (this.automationPreparedAction === 'subwarp_start' && updatedAutomationFleet?.state === 'MoveSubwarp')
      || (this.automationPreparedAction === 'warp_start' && updatedAutomationFleet?.state === 'MoveWarp');
    if (this.automationRunning && this.automationAwaitingMovementStart) {
      if (expectedMovement) {
        this.automationAwaitingMovementStart = false;
        this.automationResumeAfterExit = true;
        this.waitForMovementArrival(updatedAutomationFleet, this.automationRunId);
      } else if (updatedAutomationFleet?.state === 'Idle') {
        this.automationStatus.textContent = 'Movimento confermato · attendo aggiornamento chain';
        this.refreshAutomationState();
      } else {
        console.error('[SDU] movement start produced unexpected fleet state', {
          fleetId: this.automationFleet?.id,
          state: updatedAutomationFleet?.state,
        });
        this.failAutomation();
      }
    } else if (this.automationRunning && this.automationAwaitingMovementExit) {
      if (updatedAutomationFleet?.state === 'Idle' && updatedAutomationFleet.sector) {
        this.automationAwaitingMovementExit = false;
        this.automationResumeAfterExit = false;
        this.automationNeedsScanAfterMovement = true;
        this.automationInitialScanPending = true;
        this.automationInitialScanReady = false;
        this.automationFleet = updatedAutomationFleet;
        this.automationDestination = null;
        console.info('[SDU] signed movement exit observed on-chain; starting local scan', { fleetId: updatedAutomationFleet.id });
        this.beginInitialAutomationScan(this.automationRunId);
      } else if (updatedAutomationFleet?.state === 'MoveSubwarp' || updatedAutomationFleet?.state === 'MoveWarp') {
        this.automationStatus.textContent = 'Uscita firmata · attendo conferma chain';
        this.refreshAutomationState();
      } else {
        console.error('[SDU] movement exit produced unexpected fleet state', {
          fleetId: this.automationFleet?.id,
          state: updatedAutomationFleet?.state,
        });
        this.failAutomation();
      }
    } else if (this.automationRunning && this.automationResumeAfterExit) {
      if (updatedAutomationFleet?.state === 'Idle' && updatedAutomationFleet.sector) {
        this.automationResumeAfterExit = false;
        this.automationInitialScanPending = true;
        this.automationInitialScanReady = false;
        this.automationFleet = updatedAutomationFleet;
        this.automationDestination = null;
        console.info('[SDU] movement exit observed on-chain; starting local scan', { fleetId: updatedAutomationFleet.id });
        this.beginInitialAutomationScan(this.automationRunId);
      } else if (updatedAutomationFleet?.state === 'MoveSubwarp' || updatedAutomationFleet?.state === 'MoveWarp') {
        this.waitForMovementArrival(updatedAutomationFleet, this.automationRunId);
      } else {
        console.error('[SDU] movement exit produced unexpected fleet state', {
          fleetId: this.automationFleet?.id,
          state: updatedAutomationFleet?.state,
        });
        this.failAutomation();
      }
    } else if (this.automationRunning && expectedMovement) {
      this.automationResumeAfterExit = true;
      this.waitForMovementArrival(updatedAutomationFleet, this.automationRunId);
    } else if (this.automationRunning && !this.canStartAutomation()) {
      console.error('[SDU] automation stopped: fleet preconditions no longer hold', { fleetId: this.automationFleet?.id });
      this.failAutomation();
    } else {
      this.refreshAutomationState();
    }
    this.render();
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
      detail.textContent = this.fleetStatusOverrides.get(fleet.id)?.text
        ?? describe(fleet, now, s => this.nameAt(s), this.fleetScanSummaries.get(fleet.id));
    }
  }
}
