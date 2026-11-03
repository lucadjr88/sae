function normalizeCoordPair(value) {
  const cleaned = Array.isArray(value) ? value.join(',') : String(value ?? '').replace(/\s/g, '');
  const parts = cleaned.split(',');
  if (parts.length !== 2 || parts.some(part => part === '' || !Number.isSafeInteger(Number(part)))) {
    throw new Error(`Coordinate non valide: ${cleaned}`);
  }
  return `${parts[0]},${parts[1]}`;
}

function distance(left, right) {
  const [leftX, leftY] = left.split(',').map(Number);
  const [rightX, rightY] = right.split(',').map(Number);
  return Math.hypot(rightX - leftX, rightY - leftY);
}

function valueOf(form, name, config) {
  if (config && Object.hasOwn(config, name)) {
    const value = config[name];
    return typeof value === 'boolean' ? value : String(value).trim();
  }
  const control = form.querySelector(`[data-scan-param="${name}"]`);
  return control instanceof HTMLInputElement && control.type === 'checkbox'
    ? control.checked
    : control?.value.trim() ?? '';
}

function formatNumericForPayload(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(2).replace(/\.?0+$/, '');
}

export function buildScanFilterPayload({ form, config, fleet, currentCoords, resources, requestType = 'cell', resetCounts = false }) {
  if (!fleet?.name || !fleet?.id) throw new Error('Nome e ID flotta sono obbligatori');
  if (!resources || !Number.isFinite(Number(resources.fuelCurrentPct))) throw new Error('Fuel on-chain non disponibile');
  if (!Number.isFinite(Number(resources.foodCurrent))) throw new Error('Food on-chain non disponibile');

  const current = normalizeCoordPair(currentCoords);
  const doubleSB = valueOf(form, 'doubleSB', config);
  const firstSB = doubleSB ? normalizeCoordPair(valueOf(form, 'primaSB', config)) : '';
  const secondSB = doubleSB ? normalizeCoordPair(valueOf(form, 'secondaSB', config)) : '';
  let sbCoords = normalizeCoordPair(valueOf(form, 'sbCoords', config));

  if (doubleSB) {
    const bases = [firstSB, secondSB].sort((left, right) => distance(current, left) - distance(current, right));
    sbCoords = bases.join(';');
  }

  return {
    nomeFlotta: fleet.name.trim(),
    idFlotta: fleet.id.trim(),
    count: valueOf(form, 'count', config),
    sdu: valueOf(form, 'sdu', config),
    growing: valueOf(form, 'growing', config),
    scanCooldown: valueOf(form, 'scanCooldown', config),
    currentCoords: current,
    sbCoords,
    primaSB: firstSB,
    secondaSB: secondSB,
    rangeSB: valueOf(form, 'rangeSB', config),
    smartRange: valueOf(form, 'smartRange', config),
    fuel: formatNumericForPayload(resources.fuelCurrentPct),
    fuel_min: valueOf(form, 'fuel_min', config),
    fuel_range_min: valueOf(form, 'fuel_range_min', config),
    fuel_max: valueOf(form, 'fuel_max', config),
    food: formatNumericForPayload(resources.foodCurrent),
    food_min: valueOf(form, 'food_min', config),
    maxareaFromFleet: valueOf(form, 'maxareaFromFleet', config),
    coeffcount1: valueOf(form, 'coeffcount1', config),
    coeffsdu1: valueOf(form, 'coeffsdu1', config),
    coeffgrowing1: valueOf(form, 'coeffgrowing1', config),
    maxdistanceFromFleet1: valueOf(form, 'maxdistanceFromFleet1', config),
    reset_counts: resetCounts,
    requestType,
  };
}

export function simulateScanFilterResponse(payload, pauseStrike = 0) {
  const [currentX, currentY] = payload.currentCoords.split(',').map(Number);
  const requestType = payload.requestType || 'cell';
  const configuredRange = requestType === 'area' ? payload.maxareaFromFleet : payload.maxdistanceFromFleet1;
  const radius = Math.max(1, Math.round(Number(configuredRange) || (requestType === 'area' ? 15 : 3)));
  const pattern = [[radius, 0], [0, radius], [-radius, 0], [0, -radius]];
  const [deltaX, deltaY] = pattern[Math.abs(pauseStrike) % pattern.length];
  const probability = (requestType === 'area' ? 22 : 18) + Math.min(8, Math.max(0, pauseStrike));
  return {
    x: Math.round(currentX + deltaX),
    y: Math.round(currentY + deltaY),
    sb: payload.sbCoords.split(';')[0],
    '%': Math.round(probability * 10) / 10,
    coeff: Math.round((1 + Math.min(3, Math.max(0, pauseStrike) / 4)) * 100) / 100,
    source: 'simulated',
  };
}

export async function requestScanFilter({ host, port, timeoutSeconds = 10, payload, fetchImpl = fetch }) {
  const cleanHost = String(host ?? '').trim() || '127.0.0.1';
  const cleanPort = String(port ?? '').trim() || '3000';
  if (!/^(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\])$/.test(cleanHost)) throw new Error('Host API non valido');
  if (!/^\d{1,5}$/.test(cleanPort) || Number(cleanPort) < 1 || Number(cleanPort) > 65535) throw new Error('Porta API non valida');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutSeconds) || 10) * 1000);
  try {
    const url = '/api/sea/scan-filter';
    console.info('[SDU] scan-filter proxy request', { endpoint: url, host: cleanHost, port: cleanPort, timeoutSeconds });
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: cleanHost, port: Number(cleanPort), timeoutSeconds, payload }),
      signal: controller.signal,
    });
    const result = await response.json();
    console.info('[SDU] scan-filter response', { status: response.status, ok: response.ok, result });
    if (!response.ok) throw new Error(result?.error || `API scan-filter: HTTP ${response.status}`);
    if (result?.x == null || result?.y == null
      || !Number.isSafeInteger(Number(result.x))
      || !Number.isSafeInteger(Number(result.y))) {
      throw new Error('Risposta scan-filter senza coordinate valide');
    }
    return result;
  } catch (error) {
    console.error('[SDU] scan-filter failed', { host: cleanHost, port: cleanPort, error });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}