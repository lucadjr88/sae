import { currentProfileId, connectedWalletPublicKey, connectedWalletIcon } from '@/utils/state';
import { applyProfileFactionIcon, getCachedProfileFaction } from '@/utils/faction';
import { normalizeOpName, resolveTxTimeRange } from '@/utils/utils';
import { drawPieChart } from '@/services/charts';
import { createFleetList, createOperationList, createOtherOperationsList } from '@/services/fleet-operations';
import { toggleFleet } from '@/utils/ui';
import { showSidebar, hideSidebar, canHideSidebarFromScroll } from '@/ui/elements/sideBar';
import { setCachedFeeView} from '@/ui/elements/toggleSwitch';
import { createResultPage } from '@/resultpage';

import solIcon from '@/assets/icons/sol.svg';

type OpStats = { totalFee: number; count: number };
type FleetFeeEntry = { totalFee: number; feePercentage?: number; totalOperations?: number; isRented?: boolean; isListed?: boolean; isLoaned?: boolean; operations?: Record<string, OpStats> };
type TxLite = {
  blockTime?: number;
  timestamp?: number;
  fee?: number;
  meta?: { fee?: number };
  txInfo?: { fee?: number; meta?: { fee?: number } };
};
type DisplayData = {
  feesByFleet: Record<string, FleetFeeEntry>;
  feesByOperation?: Record<string, OpStats>;
  sageFees24h: number;
  transactionCount24h: number;
  unknownOperations: number;
  transactions?: TxLite[];
  allTransactions?: TxLite[];
  firstTxTime?: number;
  lastTxTime?: number;
  hourlyFees24h?: number[];
  timeWindow?: string;
};
type FleetMeta = { key: string; callsign?: string; isRented?: boolean; isListed?: boolean; isLoaned?: boolean; data?: { fleetShips?: string } };

function lamportsToSol(value: number | undefined | null): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue / 1e9 : 0;
}

function normalizeHourlyFeeSeries(hourlyFees?: number[]): number[] {
  return Array.from({ length: 24 }, (_, index) => {
    const sourceIndex = (hourlyFees?.length ?? 0) - 24 + index;
    const value = sourceIndex >= 0 ? Number(hourlyFees?.[sourceIndex] ?? 0) : 0;
    return Number.isFinite(value) ? value : 0;
  });
}

function buildHourlyFeeSeriesFromTransactions(data: DisplayData): number[] {
  const txs = (data?.transactions?.length ? data.transactions : data?.allTransactions) ?? [];
  const nowSec = Math.floor(Date.now() / 1000);
  const buckets = Array.from({ length: 24 }, () => 0);

  txs.forEach((tx) => {
    const rawTimestamp = Number(tx?.blockTime ?? (tx?.timestamp ? Math.floor(Number(tx.timestamp) / 1000) : NaN));
    const rawFee = Number(tx?.fee ?? tx?.meta?.fee ?? tx?.txInfo?.fee ?? tx?.txInfo?.meta?.fee ?? 0);

    if (!Number.isFinite(rawTimestamp) || !Number.isFinite(rawFee) || rawFee <= 0) {
      return;
    }

    const ageHours = Math.floor((nowSec - rawTimestamp) / 3600);
    if (ageHours < 0 || ageHours > 23) {
      return;
    }

    buckets[23 - ageHours] += rawFee;
  });

  return buckets;
}

function renderHourlyFeeChart(hourlyFeesLamports: number[]): HTMLDivElement {
  const series = normalizeHourlyFeeSeries(hourlyFeesLamports);
  const totalLamports = series.reduce((sum, value) => sum + value, 0);
  const maxLamports = Math.max(...series, 0);

  const card = document.createElement('div');
  card.className = 'chart-card hourly-fee-card';

  const title = document.createElement('div');
  title.className = 'chart-title';
  title.innerHTML = `
  <span>Hourly Fees (last 24h)</span>
  <span>peak ${lamportsToSol(maxLamports).toFixed(4)} <img src="${solIcon}" style="width: 1.8vh;height: auto;vertical-align: middle;" alt="SOL"/>/h</span>
  `;



  const subtitle = document.createElement('div');
  subtitle.className = 'hourly-fee-subtitle';
  subtitle.textContent = totalLamports > 0
    ? 'Each column represents one hour. Hover or tap for the SOL value.'
    : 'No fee activity detected in the current 24h window.';

  const chart = document.createElement('div');
  chart.className = 'hourly-fee-chart';

  const now = new Date();
  series.forEach((feeLamports, index) => {
    const hoursAgo = 23 - index;
    const bucketTime = new Date(now.getTime() - (hoursAgo * 60 * 60 * 1000));
    const barWrap = document.createElement('div');
    barWrap.className = 'hourly-fee-bar-wrap';

    const bar = document.createElement('div');
    bar.className = `hourly-fee-bar${feeLamports <= 0 ? ' is-empty' : ''}`;
    const heightPct = maxLamports > 0 ? Math.max(6, (feeLamports / maxLamports) * 100) : 6;
    bar.style.height = `${heightPct}%`;
    bar.title = `${bucketTime.getHours().toString().padStart(2, '0')}:00 · ${lamportsToSol(feeLamports).toFixed(4)} {solIcon}`;

    barWrap.appendChild(bar);
    chart.appendChild(barWrap);
  });

  const axis = document.createElement('div');
  axis.className = 'hourly-fee-axis';
  axis.innerHTML = `
    <span>-23h</span>
    <span>-18h</span>
    <span>-12h</span>
    <span>-6h</span>
    <span>now</span>
  `;

  card.appendChild(title);
  card.appendChild(subtitle);
  card.appendChild(chart);
  card.appendChild(axis);

  return card;
}

// Placeholder for displayFeeResults - will be implemented when UI module is complete
export function displayFeeResults(data: DisplayData, fleetNames: Record<string, string>, _fleetIsRented: Record<string, boolean>, fleets: FleetMeta[] = []): void {
  //console.log('[displayFeeResults] Displaying results...');

  // Expose toggleFleet as global for inline onclick handlers
  (window as any).toggleFleet = toggleFleet;

  createResultPage();

  // Sidebar auto-hide after 10 seconds + toggle on click (mobile only)
  const isMobile = window.matchMedia('(max-width: 1200px) and (max-height: 2670px), (max-width: 2670px) and (max-height: 1200px)').matches;


  const colonna2 = document.getElementById('colonna2');



  if (isMobile) {



    // Click on toggle tab to show sidebar
    const sidebarToggle = document.createElement('div');
    sidebarToggle.id = 'sidebar-toggle-tab';
    sidebarToggle.className = 'sidebar-toggle-tab';
    sidebarToggle.innerHTML = '◀';
    sidebarToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      showSidebar();
    });
    document.body.appendChild(sidebarToggle);

    // Click on colonna2 to hide sidebar
    colonna2?.addEventListener('click', hideSidebar);
  }

  // Hero logo shrink/fade on results scroll
  const contentColumn = document.getElementById('colonna2') as HTMLDivElement | null;
  const heroLogo = document.querySelector('.hero-logo') as HTMLImageElement | null;
  if (contentColumn && heroLogo) {
    const minScale = 0.1;
    const minOpacity = 0.3;
    const maxScrollForScale = 300;
    const maxScrollForOpacity = 500;

    heroLogo.style.transform = 'scale(1)';
    heroLogo.style.opacity = '1';

    contentColumn.addEventListener('scroll', () => {
      if (!isMobile || canHideSidebarFromScroll()) {
        hideSidebar();
      }

      const scrollY = contentColumn.scrollTop;
      const scale = Math.max(minScale, 1 - (scrollY / maxScrollForScale) * (1 - minScale));
      const opacity = Math.max(minOpacity, 1 - scrollY / maxScrollForOpacity);
      heroLogo.style.transform = `scale(${scale})`;
      heroLogo.style.opacity = `${opacity}`;
    });
  }


  // Show and update sidebar
  const sidebar = document.getElementById('sidebar');
  const sidebarProfileId = document.getElementById('sidebarProfileId');
  if (sidebar) {
    sidebar.classList.remove('is-hidden');
  }
  if (sidebarProfileId && currentProfileId) {
    sidebarProfileId.textContent = currentProfileId.substring(0, 4) + '...' + currentProfileId.substring(currentProfileId.length - 4);
    applyProfileFactionIcon(document.getElementById('profileIcon') as HTMLDivElement | null, getCachedProfileFaction(currentProfileId));
  }

  // Mostra logo wallet SOLO se la selezione avviene da wallet connect
  const sidebarWalletInfo = document.getElementById('sidebarWalletInfo');
  console.log('[DEBUG] prima di update sidebar', { sidebarWalletInfo, connectedWalletIcon, connectedWalletPublicKey });
  if (sidebarWalletInfo && connectedWalletIcon && connectedWalletPublicKey) {
    console.log('[DEBUG] wallet connected, showing wallet info in sidebar');
    sidebarWalletInfo.innerHTML = `
                <img src="${connectedWalletIcon}" alt="wallet" class="wallet-sidebar-icon">
                <div class="profile-id">${connectedWalletPublicKey.slice(0, 4)}...${connectedWalletPublicKey.slice(-4)}</div>
              `;
    sidebarWalletInfo.style.display = 'flex';
  } else {
    console.log('[DEBUG] wallet display skipped:', { sidebarWalletInfoExists: !!sidebarWalletInfo, connectedWalletIconExists: !!connectedWalletIcon, connectedWalletPublicKeyExists: !!connectedWalletPublicKey });
    if (sidebarWalletInfo) {
      sidebarWalletInfo.innerHTML = '';
      sidebarWalletInfo.style.display = 'none';
    }
  }

  const feeResults = document.createElement('div');
  feeResults.id = 'feeResults';

  if (!feeResults) {
    console.log('[displayFeeResults] CRITICAL: #feeResults element not found - rendering aborted');
    return;
  }

  const prices = (typeof window !== 'undefined' ? (window as any).prices : undefined);

  // Prefer breakdown embedded by the server when present (fallback to top-level fields)
  const feesByFleet = (data && data.feesByFleet) ? data.feesByFleet : {};
  const feesByOperation = (data && data.feesByOperation) ? data.feesByOperation : (data && (data as any).breakdown && (data as any).breakdown.feesByOperation ? (data as any).breakdown.feesByOperation : {});

  // Prepare data for charts - Include all fleets, even those with 0 fees
  const completeFeesByFleet: Record<string, FleetFeeEntry> = { ...feesByFleet };
  const usedDisplayNames = new Set(
    Object.keys(completeFeesByFleet).map(k => (fleetNames[k] || k || '').toString().toLowerCase())
  );
  fleets.forEach(f => {
    const aliases = [f.key, f.data?.fleetShips].filter(Boolean) as string[];
    const aliasDisplayNames = aliases.map(k => (fleetNames[k] || k || '').toString().toLowerCase());
    if (aliasDisplayNames.some(n => usedDisplayNames.has(n))) return;

    const keyToAdd = aliases.find(k => !completeFeesByFleet[k]) || aliases[0];
    if (!keyToAdd) {
      console.warn('[displayFeeResults] Skipping fleet - no valid key found for aliases:', aliases);
      return;
    }
    completeFeesByFleet[keyToAdd] = {
      totalFee: 0,
      feePercentage: 0,
      totalOperations: 0,
      isRented: f.isRented,
      isListed: f.isListed,      // AGGIUNGI QUESTO
      isLoaned: f.isLoaned,      // AGGIUNGI QUESTO
      operations: {}
    };
    usedDisplayNames.add((fleetNames[keyToAdd] || keyToAdd || '').toString().toLowerCase());
  });

  // Normalizza isListed/isLoaned/isRented anche per le flotte già presenti in completeFeesByFleet
  fleets.forEach(f => {
    if (!f || !f.key) return;
    const entry = completeFeesByFleet[f.key];
    if (entry) {
      if (typeof f.isListed === 'boolean') entry.isListed = f.isListed;
      if (typeof f.isLoaned === 'boolean') entry.isLoaned = f.isLoaned;
      if (typeof f.isRented === 'boolean') entry.isRented = f.isRented;
    }
  });

  const sortedFleets = Object.entries(completeFeesByFleet)
    .sort((a, b) => b[1].totalFee - a[1].totalFee);

  // Normalize operation names and aggregate stats (exclude "Unknown" operations from charts)
  const normalizedFeesByOperation: Record<string, OpStats> = {};
  Object.entries(feesByOperation).forEach(([opName, stats]) => {
    const normName = normalizeOpName(opName);
    if (normName.toLowerCase() === 'unknown') return;
    if (!normalizedFeesByOperation[normName]) {
      normalizedFeesByOperation[normName] = { totalFee: 0, count: 0 };
    }
    const opStats = stats as OpStats;
    normalizedFeesByOperation[normName].totalFee += opStats.totalFee;
    normalizedFeesByOperation[normName].count += opStats.count;
  });

  // Build sorted operation entries and ensure crafting-related categories are always present
  const opEntries = Object.entries(normalizedFeesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee);
  const topN = opEntries.slice(0, 10);

  // Ensure crafting-related categories are included
  const ensureNames = ['Crafting', 'CraftBurn', 'CraftStart', 'CraftClaim'];
  ensureNames.forEach(name => {
    const idx = opEntries.findIndex(e => e[0] === name);
    if (idx !== -1 && !topN.some(e => e[0] === name)) {
      topN.push(opEntries[idx]);
    }
  });

  // Add any operation whose name contains 'craft' (case-insensitive)
  const craftMatches = opEntries.filter(e => /craft/i.test(e[0]));
  craftMatches.forEach(match => {
    if (!topN.some(e => e[0] === match[0])) topN.push(match);
  });

  const sortedOps = topN.slice(0, 20);

  //console.log('[displayFeeResults] Top 5 fleets:', sortedFleets.slice(0, 5).map(([name, data]) => ({ name: fleetNames[name] || name, fee: data.totalFee })));
  //console.log('[displayFeeResults] Top 5 operations:', sortedOps.slice(0, 5).map(([name, data]) => ({ name, fee: data.totalFee })));

  // Svuotiamo il contenitore prima di iniziare (equivalente a sovrascrivere innerHTML)
  feeResults.innerHTML = '';

  // 1. Analysis Period
  const analysisPeriod = document.createElement('div');
  analysisPeriod.className = 'analysis-period';
  const feeWindowLabel = data.timeWindow || '24h';
  const { timeFirstTx, timeLastTx, ageLastTx } = resolveTxTimeRange(data);
  analysisPeriod.textContent = `Fees for operations in the last ${feeWindowLabel}: ${timeFirstTx} → ${timeLastTx} , Age: ${ageLastTx}`;

  const timerSpan = document.createElement('span');
  timerSpan.className = 'timer timer-emphasis';
  analysisPeriod.appendChild(timerSpan);

  feeResults.appendChild(analysisPeriod);

  // 2. Stats Grid
  const statsGrid = document.createElement('div');
  statsGrid.className = 'stats-grid';

  // --- Card: Transactions ---
  const statCardTrans = document.createElement('div');
  statCardTrans.className = 'stat-card';

  const labelTrans = document.createElement('div');
  labelTrans.className = 'stat-label';
  labelTrans.textContent = 'Transactions';

  const valueTrans = document.createElement('div');
  valueTrans.className = 'stat-value';
  // Logica condizionale per la classe errore
  if (data.unknownOperations > 0) {
    valueTrans.classList.add('stat-value-error');
  }
  valueTrans.innerHTML = `<span>${data.transactionCount24h}</span>`;

  // Logica condizionale per il sottotesto degli unknown
  if (data.unknownOperations > 0) {
    const subValue = document.createElement('span');
    subValue.className = 'stat-value-subtle';
    subValue.textContent = `(${data.unknownOperations})`;
    valueTrans.appendChild(subValue);
  }

  statCardTrans.appendChild(labelTrans);
  statCardTrans.appendChild(valueTrans);

  // --- Card: Total Fees ---
  const statCardFees = document.createElement('div');
  statCardFees.className = 'stat-card';

  const labelFees = document.createElement('div');
  labelFees.className = 'stat-label';
  labelFees.textContent = 'Total Fees';

  const valueFees = document.createElement('div');
  valueFees.className = 'stat-value highlight';

  const solAmount = lamportsToSol(data.sageFees24h).toFixed(6);
  valueFees.innerHTML = `<span>${solAmount} <img src="${solIcon}" style="width: 2.5vh; height: auto; vertical-align: middle;" alt="SOL"/></span>`;

  const valueUsd = document.createElement('span');
  valueUsd.className = 'value-usd';
  const usdPrice = (prices?.solana?.usd && typeof prices.solana.usd === 'number')
    ? (lamportsToSol(data.sageFees24h) * prices.solana.usd).toFixed(2)
    : '--';
  valueUsd.textContent = `($${usdPrice})`;

  valueFees.appendChild(valueUsd);
  statCardFees.appendChild(labelFees);
  statCardFees.appendChild(valueFees);

  statsGrid.appendChild(statCardTrans);
  statsGrid.appendChild(statCardFees);
  feeResults.appendChild(statsGrid);

  const hourlyFeeChart = renderHourlyFeeChart(data.hourlyFees24h || buildHourlyFeeSeriesFromTransactions(data));
  feeResults.appendChild(hourlyFeeChart);

  // 3. Charts Row (Helper rapido per le due chart uguali)
  const chartsRow = document.createElement('div');
  chartsRow.className = 'charts-row';

  const createChart = (titleText, canvasId, legendId) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    const title = document.createElement('div');
    title.className = 'chart-title';
    title.textContent = titleText;
    const container = document.createElement('div');
    container.className = 'chart-container';
    const canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.className = 'pie-chart';
    const legend = document.createElement('div');
    legend.id = legendId;
    legend.className = 'chart-legend';

    container.appendChild(canvas);
    container.appendChild(legend);
    card.appendChild(title);
    card.appendChild(container);
    return card;
  };

  chartsRow.appendChild(createChart('Fees by Fleet (Top 5)', 'fleetChart', 'fleetLegend'));
  chartsRow.appendChild(createChart('Fees by Operation (Top categories; Crafting always included)', 'operationChart', 'operationLegend'));
  feeResults.appendChild(chartsRow);

  // 4. Liste Finali (Breakdown e Summary)
  const sections = [
    { title: 'Fleet Breakdown', id: 'fleetList', class: 'fleet-list' },
    { title: 'Operations Summary', id: 'operationList', class: 'operation-list' },
    { title: 'All Other Operations', id: 'otherOperationsList', class: 'operation-list', extraClass: 'other-ops' }
  ];

  sections.forEach(sec => {
    const h2 = document.createElement('h2');
    h2.className = 'section-title' + (sec.extraClass ? ` ${sec.extraClass}` : '');
    h2.textContent = sec.title;

    const div = document.createElement('div');
    div.id = sec.id;
    div.className = sec.class;

    feeResults.appendChild(h2);
    feeResults.appendChild(div);
  });

  // Mount feeResults in DOM before rendering charts/lists (they use getElementById)
  const resultDiv = document.getElementById('result-container');
  if (resultDiv) {
    resultDiv.replaceChildren(feeResults);
  }

  // Draw pie charts
  const totalFleetFee = sortedFleets.reduce((sum, [_, data]) => sum + (data.totalFee || 0), 0);
  drawPieChart('fleetChart', 'fleetLegend', sortedFleets.map(([name, data], index) => {
    const fleetColors = ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#ec4899'];
    return {
      label: fleetNames[name] || name,
      value: data.totalFee,
      count: data.totalOperations,
      percentage: totalFleetFee ? ((data.totalFee / totalFleetFee) * 100) : 0,
      color: fleetColors[index % fleetColors.length]
    };
  }), prices);

  const opColors = ['#06b6d4', '#8b5cf6', '#f97316', '#10b981', '#fbbf24', '#ef4444', '#7c3aed', '#14b8a6', '#e879f9', '#60a5fa', '#06b6d4', '#f472b6', '#9ca3af', '#34d399', '#fb7185', '#60a5fa', '#fde68a', '#7dd3fc', '#a78bfa', '#34d399'];
  drawPieChart('operationChart', 'operationLegend', sortedOps.map(([name, data_item], index) => ({
    label: name,
    value: data_item.totalFee,
    count: data_item.count,
    percentage: data_item.totalFee / (data.sageFees24h || 1),
    color: opColors[index % opColors.length]
  })), prices);

  // Create fleet list with fold/unfold
  createFleetList({ ...data, feesByFleet: completeFeesByFleet } as any, fleetNames, new Set(Object.keys(data.feesByFleet || {}).filter(k => (data.feesByFleet as any)[k]?.isRented)));

  // Create operation list with fold/unfold
  createOperationList(data as any, fleetNames, new Set(Object.keys(data.feesByFleet || {}).filter(k => (data.feesByFleet as any)[k]?.isRented)));

  // Create other operations list (operations not shown in the main summary)
  const includedOperations = new Set(sortedOps.map(([name]) => name));
  createOtherOperationsList(data as any, fleetNames, new Set(Object.keys(data.feesByFleet || {}).filter(k => (data.feesByFleet as any)[k]?.isRented)), includedOperations);

  // Cache the fee view for toggle switch
  setCachedFeeView(feeResults);

}