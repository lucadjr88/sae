import { createBackground } from './ui/elements/backGround';
import { createHeroTitle } from './ui/elements/heroTitle_elements';
import { createFootBarElement } from './ui/elements/footBar';
import { createSidebarElement } from './ui/elements/sideBar';
import { currentProfileId, connectedWalletPublicKey, connectedWalletIcon } from '@utils/state';
import { normalizeOpName } from '@services/utils';
import { drawPieChart } from '@services/charts';
import { createFleetList, createOperationList, createOtherOperationsList } from '@services/fleet-operations';
import { toggleFleet } from '@utils/ui';



type OpStats = { totalFee: number; count: number };
type FleetFeeEntry = { totalFee: number; feePercentage?: number; totalOperations?: number; isRented?: boolean; operations?: Record<string, OpStats> };
type TxLite = { blockTime?: number; timestamp?: number };
type DisplayData = { feesByFleet: Record<string, FleetFeeEntry>; feesByOperation?: Record<string, OpStats>; sageFees24h: number; transactionCount24h: number; unknownOperations: number; transactions?: TxLite[]; allTransactions?: TxLite[]; firstTxTime?: number };
type FleetMeta = { key: string; callsign?: string; isRented?: boolean; data?: { fleetShips?: string } };

export function createResultPage(): void {
  const mainContainer = document.querySelector<HTMLDivElement>('#mainContainer')!;

  mainContainer.innerHTML = '';
  mainContainer.classList.add('main-container-results');

  const colonna1 = document.createElement('div');
  colonna1.id = 'colonna1';
  colonna1.className = 'results-sidebar-column';
  const colonna2 = document.createElement('div');
  colonna2.id = 'colonna2';
  colonna2.className = 'results-content-column';

  mainContainer.appendChild(colonna1);
  mainContainer.appendChild(colonna2);

  const sidebar = createSidebarElement();
  colonna1.appendChild(sidebar);

  const backgroundDiv = document.createElement('div');
  backgroundDiv.id = 'background-container';
  backgroundDiv.appendChild(createBackground());
  colonna2.appendChild(backgroundDiv);

  const heroDiv = document.createElement('div');
  heroDiv.id = 'hero-container';
  heroDiv.appendChild(createHeroTitle());

  const resultDiv = document.createElement('div');
  resultDiv.id = 'result-container';
  resultDiv.className = 'result-container';


  const results = document.createElement('div');
  results.id = 'results';

  resultDiv.appendChild(results);


  const priceTickerBar = document.createElement('div');
  priceTickerBar.id = 'price-ticker-container';
  priceTickerBar.appendChild(createFootBarElement());

  colonna2.appendChild(heroDiv);
  colonna2.appendChild(resultDiv);
  mainContainer.appendChild(priceTickerBar);
}



// Placeholder for displayResults - will be implemented when UI module is complete
export function displayResults(data: DisplayData, fleetNames: Record<string, string>, _fleetIsRented: Record<string, boolean>, fleets: FleetMeta[] = []): void {
  //console.log('[displayResults] Displaying results...');

  // Expose toggleFleet as global for inline onclick handlers
  (window as any).toggleFleet = toggleFleet;

  createResultPage();

  // Sidebar auto-hide after 10 seconds + toggle on click (mobile only)
  const isMobile = window.matchMedia('(max-width: 1200px) and (max-height: 2670px), (max-width: 2670px) and (max-height: 1200px)').matches;

  const colonna1 = document.getElementById('colonna1');
  const colonna2 = document.getElementById('colonna2');
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  const startHideTimer = () => {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      hideSidebar();
    }, 10000);
  };

  const showSidebar = () => {
    colonna1?.classList.remove('sidebar-hidden');
    document.body.classList.remove('sidebar-is-hidden');
    startHideTimer();
  };

  const hideSidebar = () => {
    colonna1?.classList.add('sidebar-hidden');
    document.body.classList.add('sidebar-is-hidden');//nasconde sidebar
    document.getElementById('cacheTooltip')?.classList.remove('visible'); // nasconde tooltip cache se aperto
    if (hideTimeout) clearTimeout(hideTimeout);
  };


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

      hideSidebar();

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


  const resultsDiv = document.getElementById('results') as HTMLDivElement | null;
  if (!resultsDiv) {
    console.error('[displayResults] CRITICAL: #results element not found - rendering aborted');
    return;
  }

  const prices = (typeof window !== 'undefined' ? (window as any).prices : undefined);

  // Prefer breakdown embedded by the server when present (fallback to top-level fields)
  const feesByFleet = (data && data.feesByFleet) ? data.feesByFleet : (data && (data as any).breakdown && (data as any).breakdown.feesByFleet ? (data as any).breakdown.feesByFleet : {});
  const feesByOperation = (data && data.feesByOperation) ? data.feesByOperation : (data && (data as any).breakdown && (data as any).breakdown.feesByOperation ? (data as any).breakdown.feesByOperation : {});
  const txs = (data.transactions?.length ? data.transactions : data.allTransactions) ?? [];

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
      console.warn('[displayResults] Skipping fleet - no valid key found for aliases:', aliases);
      return;
    }

    completeFeesByFleet[keyToAdd] = {
      totalFee: 0,
      feePercentage: 0,
      totalOperations: 0,
      isRented: f.isRented,
      operations: {}
    };
    usedDisplayNames.add((fleetNames[keyToAdd] || keyToAdd || '').toString().toLowerCase());
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

  //console.log('[displayResults] Top 5 fleets:', sortedFleets.slice(0, 5).map(([name, data]) => ({ name: fleetNames[name] || name, fee: data.totalFee })));
  //console.log('[displayResults] Top 5 operations:', sortedOps.slice(0, 5).map(([name, data]) => ({ name, fee: data.totalFee })));

  // Determine earliest transaction time
  let firstTxTimeLabel = 'N/A';
  try {
    if (data.firstTxTime) {
      const date = new Date(data.firstTxTime * 1000);
      firstTxTimeLabel = date.toLocaleString();
    } else if (txs.length) {
      const times = txs.map(t => {
        if (t.blockTime) return new Date(t.blockTime * 1000);
        if (t.timestamp) return new Date(t.timestamp);
        return null;
      }).filter(Boolean) as Date[];
      if (times.length) {
        const earliest = new Date(Math.min(...times.map(d => d.getTime())));
        firstTxTimeLabel = earliest.toLocaleString();
      }
    }
  } catch (e) {
    console.warn('[displayResults] Could not compute first transaction time:', e);
  }

  // Svuotiamo il contenitore prima di iniziare (equivalente a sovrascrivere innerHTML)
  resultsDiv.innerHTML = '';

  // 1. Analysis Period
  const analysisPeriod = document.createElement('div');
  analysisPeriod.className = 'analysis-period';
  analysisPeriod.textContent = `Fees for operations in the last 24h from: ${firstTxTimeLabel}`;

  const timerSpan = document.createElement('span');
  timerSpan.className = 'timer timer-emphasis';
  analysisPeriod.appendChild(timerSpan);

  resultsDiv.appendChild(analysisPeriod);

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
  valueTrans.textContent = data.transactionCount24h + ' ';

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

  const solAmount = (data.sageFees24h / 1e9).toFixed(6);
  valueFees.textContent = `${solAmount} SOL `;

  const valueUsd = document.createElement('span');
  valueUsd.className = 'value-usd';
  const usdPrice = (prices?.solana?.usd && typeof prices.solana.usd === 'number')
    ? ((data.sageFees24h / 1e9) * prices.solana.usd).toFixed(2)
    : '--';
  valueUsd.textContent = `($${usdPrice})`;

  valueFees.appendChild(valueUsd);
  statCardFees.appendChild(labelFees);
  statCardFees.appendChild(valueFees);

  statsGrid.appendChild(statCardTrans);
  statsGrid.appendChild(statCardFees);
  resultsDiv.appendChild(statsGrid);

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
  resultsDiv.appendChild(chartsRow);

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

    resultsDiv.appendChild(h2);
    resultsDiv.appendChild(div);
  });

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

  //console.log('[displayResults] Results displayed successfully');
}