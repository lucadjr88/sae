import sduProgramBlackIcon from '@/assets/icons/sduProgramBlack.png';
import { drawVerticalBarChart } from '@/services/charts';

type SduPoint = {
  date: string;
  sduSum: number;
  avgScannedPercent?: number;
  scanFindRatio?: number;
};

type SduFleetSeries = {
  fleetId: string;
  fleetName: string;
  series: SduPoint[];
};

type FleetChartDataResponse = {
  days?: number;
  fleets?: SduFleetSeries[];
  processed?: number;
};

const SDU_API_URL = '/api/fleet-chart-data';

type CreateSduProgramViewOptions = {
  fleetIds: string[];
  days?: number;
};

function setChartsBody(container: HTMLElement, node: HTMLElement): void {
  const body = container.querySelector<HTMLElement>('.sdu-program-charts');
  if (!body) return;
  body.replaceChildren(node);
}

function createMessage(message: string, className: string): HTMLDivElement {
  const msg = document.createElement('div');
  msg.className = className;
  msg.textContent = message;
  return msg;
}

function computeFleetStats(fleet: SduFleetSeries) {
  const series = [...(fleet.series || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const count = series.length;
  const last = count > 0 ? series[count - 1] : undefined;

  const totalSdu = series.reduce((sum, point) => sum + (Number(point.sduSum) || 0), 0);
  const avgDailySdu = count > 0 ? totalSdu / count : 0;

  const scannedValues = series.map(point => Number(point.avgScannedPercent) || 0);
  const scanFindValues = series.map(point => Number(point.scanFindRatio) || 0);

  const avgScannedPercent = scannedValues.length
    ? scannedValues.reduce((sum, value) => sum + value, 0) / scannedValues.length
    : 0;
  const avgScanFindRatio = scanFindValues.length
    ? scanFindValues.reduce((sum, value) => sum + value, 0) / scanFindValues.length
    : 0;

  return {
    totalSdu,
    last24hSdu: Number(last?.sduSum) || 0,
    avgDailySdu,
    last24hScannedPercent: Number(last?.avgScannedPercent) || 0,
    avgScannedPercent,
    last24hScanFindRatio: Number(last?.scanFindRatio) || 0,
    avgScanFindRatio,
  };
}

function updateSummary(container: HTMLElement, fleets: SduFleetSeries[]): void {
  const totalEl = container.querySelector<HTMLElement>('.sdu-summary-total-value');
  const listEl = container.querySelector<HTMLElement>('.sdu-summary-fleet-list');
  const kpisEl = container.querySelector<HTMLElement>('.sdu-summary-kpis');
  if (!totalEl || !listEl || !kpisEl) {
    return;
  }

  if (!fleets.length) {
    totalEl.textContent = '0';
    kpisEl.innerHTML = '<div class="sdu-summary-kpi">24h SDU: 0</div><div class="sdu-summary-kpi">Avg/day SDU: 0</div><div class="sdu-summary-kpi">24h %: 0.0%</div><div class="sdu-summary-kpi">Avg %: 0.0%</div><div class="sdu-summary-kpi">24h S/F: 0.0</div><div class="sdu-summary-kpi">Avg S/F: 0.0</div>';
    listEl.replaceChildren(createMessage('No fleet summary available.', 'sdu-summary-empty'));
    return;
  }

  const statsByFleet = fleets.map((fleet) => ({
    fleet,
    stats: computeFleetStats(fleet),
  }));

  const fleetCount = Math.max(1, statsByFleet.length);
  const grandTotal = statsByFleet.reduce((sum, item) => sum + item.stats.totalSdu, 0);
  const grandLast24hSdu = statsByFleet.reduce((sum, item) => sum + item.stats.last24hSdu, 0);
  const grandAvgDailySdu = statsByFleet.reduce((sum, item) => sum + item.stats.avgDailySdu, 0);
  const avgLast24hPct = statsByFleet.reduce((sum, item) => sum + item.stats.last24hScannedPercent, 0) / fleetCount;
  const avgPct = statsByFleet.reduce((sum, item) => sum + item.stats.avgScannedPercent, 0) / fleetCount;
  const avgLast24hScanFind = statsByFleet.reduce((sum, item) => sum + item.stats.last24hScanFindRatio, 0) / fleetCount;
  const avgScanFind = statsByFleet.reduce((sum, item) => sum + item.stats.avgScanFindRatio, 0) / fleetCount;

  totalEl.textContent = new Intl.NumberFormat('en-US').format(grandTotal);
  kpisEl.innerHTML = `
    <div class="sdu-summary-kpi">24h SDU: ${new Intl.NumberFormat('en-US').format(grandLast24hSdu)}</div>
    <div class="sdu-summary-kpi">Avg/day SDU: ${new Intl.NumberFormat('en-US').format(Math.round(grandAvgDailySdu))}</div>
    <div class="sdu-summary-kpi">24h %: ${avgLast24hPct.toFixed(1)}%</div>
    <div class="sdu-summary-kpi">Avg %: ${avgPct.toFixed(1)}%</div>
    <div class="sdu-summary-kpi">24h S/F: ${avgLast24hScanFind.toFixed(1)}</div>
    <div class="sdu-summary-kpi">Avg S/F: ${avgScanFind.toFixed(1)}</div>
  `;

  const entries = statsByFleet
    .map(({ fleet, stats }) => ({
      name: fleet.fleetName || fleet.fleetId,
      total: stats.totalSdu,
      last24hSdu: stats.last24hSdu,
      avgDailySdu: stats.avgDailySdu,
      last24hPct: stats.last24hScannedPercent,
      avgPct: stats.avgScannedPercent,
      last24hScanFind: stats.last24hScanFindRatio,
      avgScanFind: stats.avgScanFindRatio,
    }))
    .sort((a, b) => b.total - a.total);

  const frag = document.createDocumentFragment();
  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'sdu-summary-fleet-row';

    const head = document.createElement('div');
    head.className = 'sdu-summary-fleet-head';

    const name = document.createElement('span');
    name.className = 'sdu-summary-fleet-name';
    name.textContent = entry.name;

    const value = document.createElement('span');
    value.className = 'sdu-summary-fleet-value';
    value.textContent = new Intl.NumberFormat('en-US').format(entry.total);

    head.appendChild(name);
    head.appendChild(value);

    const metrics = document.createElement('div');
    metrics.className = 'sdu-summary-fleet-kpis';
    metrics.innerHTML = `
      <div class="sdu-summary-fleet-kpi"><span class="sdu-summary-fleet-kpi-label">24h SDU</span><span class="sdu-summary-fleet-kpi-value">${new Intl.NumberFormat('en-US').format(entry.last24hSdu)}</span></div>
      <div class="sdu-summary-fleet-kpi"><span class="sdu-summary-fleet-kpi-label">Avg/day SDU</span><span class="sdu-summary-fleet-kpi-value">${new Intl.NumberFormat('en-US').format(Math.round(entry.avgDailySdu))}</span></div>
      <div class="sdu-summary-fleet-kpi"><span class="sdu-summary-fleet-kpi-label">24h %</span><span class="sdu-summary-fleet-kpi-value">${entry.last24hPct.toFixed(1)}%</span></div>
      <div class="sdu-summary-fleet-kpi"><span class="sdu-summary-fleet-kpi-label">Avg %</span><span class="sdu-summary-fleet-kpi-value">${entry.avgPct.toFixed(1)}%</span></div>
      <div class="sdu-summary-fleet-kpi"><span class="sdu-summary-fleet-kpi-label">24h S/F</span><span class="sdu-summary-fleet-kpi-value">${entry.last24hScanFind.toFixed(1)}</span></div>
      <div class="sdu-summary-fleet-kpi"><span class="sdu-summary-fleet-kpi-label">Avg S/F</span><span class="sdu-summary-fleet-kpi-value">${entry.avgScanFind.toFixed(1)}</span></div>
    `;

    row.appendChild(head);
    row.appendChild(metrics);
    frag.appendChild(row);
  });

  listEl.replaceChildren(frag);
}

function formatDateLabel(input: string): string {
  if (!input) return '';
  const parts = input.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return input;
}

function renderFleetCharts(container: HTMLElement, fleets: SduFleetSeries[]): void {
  if (!fleets.length) {
    updateSummary(container, []);
    setChartsBody(container, createMessage('No SDU data for selected fleets.', 'sdu-program-empty'));
    return;
  }

  const list = document.createElement('div');
  list.className = 'sdu-program-fleet-list';

  // --- TOTAL CHART ---
  // Merge all series by date
  const dateMap = new Map<string, number>();
  fleets.forEach(fleet => {
    (fleet.series || []).forEach(point => {
      const date = point.date;
      const prev = dateMap.get(date) || 0;
      dateMap.set(date, prev + (Number(point.sduSum) || 0));
    });
  });
  // Sort dates ascending
  const allDates = Array.from(dateMap.keys()).sort();
  const totalValues = allDates.map(date => dateMap.get(date) || 0);
  const totalCard = document.createElement('section');
  totalCard.className = 'sdu-program-fleet-card';
  const totalTitle = document.createElement('h3');
  totalTitle.className = 'sdu-program-fleet-title';
  totalTitle.textContent = 'Totale';
  totalCard.appendChild(totalTitle);
  const totalCanvas = document.createElement('canvas');
  totalCanvas.id = 'sdu-total-chart';
  totalCanvas.className = 'sdu-program-fleet-chart';
  totalCard.appendChild(totalCanvas);
  list.appendChild(totalCard);
  drawVerticalBarChart(totalCanvas, allDates.map(formatDateLabel), totalValues, 'SDU Totale');

  // --- PER-FLEET CHARTS ---
  fleets.forEach((fleet, index) => {
    const card = document.createElement('section');
    card.className = 'sdu-program-fleet-card';

    const title = document.createElement('h3');
    title.className = 'sdu-program-fleet-title';
    title.textContent = fleet.fleetName || fleet.fleetId;
    card.appendChild(title);

    const canvas = document.createElement('canvas');
    canvas.id = `sdu-fleet-chart-${index}`;
    canvas.className = 'sdu-program-fleet-chart';
    card.appendChild(canvas);

    list.appendChild(card);

    const labels = (fleet.series || []).map(point => formatDateLabel(point.date));
    const values = (fleet.series || []).map(point => Number(point.sduSum) || 0);
    drawVerticalBarChart(canvas, labels, values, 'SDU Sum');
  });

  updateSummary(container, fleets);
  setChartsBody(container, list);
}

export function createSduProgramView(options: CreateSduProgramViewOptions): HTMLElement {
  const days = Number(options.days) > 0 ? Number(options.days) : 10;
  const fleetIds = Array.from(new Set((options.fleetIds || []).filter(Boolean)));

  const container = document.createElement('div');
  container.id = 'sduProgramResults';
  container.className = 'sdu-program-root';
  container.dataset.sduDays = String(days);
  container.dataset.sduFleetIds = JSON.stringify(fleetIds);
  container.dataset.sduLoaded = 'false';
  container.dataset.sduLoading = 'false';

  const body = document.createElement('div');
  body.className = 'sdu-program-body';

  const layout = document.createElement('div');
  layout.className = 'sdu-program-layout';

  const left = document.createElement('aside');
  left.className = 'sdu-program-left';

  const heroIcon = document.createElement('img');
  heroIcon.src = sduProgramBlackIcon;
  heroIcon.alt = 'SDU Program';
  heroIcon.className = 'sdu-program-hero-icon';
  left.appendChild(heroIcon);

  const title = document.createElement('h2');
  title.className = 'sdu-program-title';
  title.textContent = 'SDU Program';
  left.appendChild(title);

  const summary = document.createElement('div');
  summary.className = 'sdu-summary-box';
  summary.innerHTML = `
    <div class="sdu-summary-total">
      Total SDU: <span class="sdu-summary-total-value">0</span>
      <span class="sdu-summary-meta"> | Days: <span class="sdu-summary-days-value">${days}</span> | Fleets: <span class="sdu-summary-fleets-value">${fleetIds.length}</span></span>
    </div>
    <div class="sdu-summary-kpis">
      <div class="sdu-summary-kpi">24h SDU: 0</div>
      <div class="sdu-summary-kpi">Avg/day SDU: 0</div>
      <div class="sdu-summary-kpi">24h %: 0.0%</div>
      <div class="sdu-summary-kpi">Avg %: 0.0%</div>
      <div class="sdu-summary-kpi">24h S/F: 0.0</div>
      <div class="sdu-summary-kpi">Avg S/F: 0.0</div>
    </div>
    <div class="sdu-summary-fleet-list"><div class="sdu-summary-empty">Loading summary...</div></div>
  `;
  left.appendChild(summary);

  const right = document.createElement('div');
  right.className = 'sdu-program-charts';
  right.appendChild(createMessage('Loading SDU charts...', 'sdu-program-loading'));

  layout.appendChild(left);
  layout.appendChild(right);
  body.appendChild(layout);

  container.appendChild(body);
  return container;
}

export async function ensureSduProgramViewLoaded(container: HTMLElement, force = false): Promise<void> {
  if (!container) return;
  if (!force && container.dataset.sduLoaded === 'true') return;
  if (container.dataset.sduLoading === 'true') return;

  const fleetIds = JSON.parse(container.dataset.sduFleetIds || '[]') as string[];
  const days = Number(container.dataset.sduDays || '10') || 10;
  if (!fleetIds.length) {
    // Replace the whole SDU section with a centered icon and message
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'sdu-program-nofleet-wrap';
    const icon = document.createElement('img');
    icon.src = sduProgramBlackIcon;
    icon.alt = 'SDU Program';
    icon.className = 'sdu-program-nofleet-icon';
    wrap.appendChild(icon);
    const msg = document.createElement('div');
    msg.className = 'sdu-program-nofleet-msg';
    msg.textContent = 'no fleet found';
    wrap.appendChild(msg);
    container.appendChild(wrap);
    container.dataset.sduLoaded = 'true';
    return;
  }

  container.dataset.sduLoading = 'true';
  setChartsBody(container, createMessage('Loading SDU charts...', 'sdu-program-loading'));

  try {
    const response = await fetch(SDU_API_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fleetIds, days })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json() as FleetChartDataResponse;
    const fleets = Array.isArray(payload.fleets) ? payload.fleets : [];

    const daysEl = container.querySelector<HTMLElement>('.sdu-summary-days-value');
    const fleetsEl = container.querySelector<HTMLElement>('.sdu-summary-fleets-value');
    const resolvedDays = Number(payload.days) > 0 ? Number(payload.days) : days;
    const processed = Number(payload.processed) || fleets.length;
    if (daysEl) daysEl.textContent = String(resolvedDays);
    if (fleetsEl) fleetsEl.textContent = String(processed);

    renderFleetCharts(container, fleets);
    container.dataset.sduLoaded = 'true';
  } catch (error: any) {
    const message = error?.message || String(error);
    updateSummary(container, []);
    setChartsBody(container, createMessage(`Failed to load SDU data: ${message}`, 'sdu-program-error'));
  } finally {
    container.dataset.sduLoading = 'false';
  }
}
