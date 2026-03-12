import { setCachedResourceView } from '@/ui/elements/toggleSwitch';
import { normalizeOpName } from '@/services/utils';
import resourceMintImageCsvRaw from '@/assets/staratlas_resource_mint_image.csv?raw';

type ResourceMaterial = {
  mint?: string;
  name?: string;
  symbol?: string;
  totalIn?: number;
  totalOut?: number;
  net?: number;
  operations?: Record<string, { in: number; out: number; count: number }>;
};

type ResourceFlows = {
  profileId?: string;
  timeWindow?: string;
  summary?: {
    totalMaterialsIn?: number;
    totalMaterialsOut?: number;
    materialsTracked?: number;
  };
  byMaterial?: Record<string, ResourceMaterial>;
};

type MaterialEntry = {
  mint: string;
  label: string;
  symbol: string;
  imageUrl?: string;
  totalIn: number;
  totalOut: number;
  volume: number;
  operations?: Record<string, { in: number; out: number; count: number }>;
};

type ResourceCatalogEntry = {
  mint: string;
  imageUrl: string;
  name: string;
  symbol: string;
};

type ResourceCatalog = {
  byMint: Map<string, ResourceCatalogEntry>;
  bySymbol: Map<string, ResourceCatalogEntry>;
};

type TxLite = {
  blockTime?: number;
  timestamp?: number;
};

const RESOURCE_CATALOG = parseResourceCatalog(resourceMintImageCsvRaw);
const HIDDEN_RESOURCE_MINTS = new Set([
  'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx'
]);

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseResourceCatalog(rawCsv: string): ResourceCatalog {
  const byMint = new Map<string, ResourceCatalogEntry>();
  const bySymbol = new Map<string, ResourceCatalogEntry>();

  if (!rawCsv) {
    return { byMint, bySymbol };
  }

  const lines = rawCsv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return { byMint, bySymbol };
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const mintIndex = headers.indexOf('mint');
  const imageUrlIndex = headers.indexOf('image_url');
  const nameIndex = headers.indexOf('name');
  const symbolIndex = headers.indexOf('symbol');

  if (mintIndex < 0 || imageUrlIndex < 0 || nameIndex < 0 || symbolIndex < 0) {
    return { byMint, bySymbol };
  }

  for (let i = 1; i < lines.length; i += 1) {
    const fields = parseCsvLine(lines[i]);
    const mint = (fields[mintIndex] || '').trim();

    if (!mint) continue;

    const entry: ResourceCatalogEntry = {
      mint,
      imageUrl: (fields[imageUrlIndex] || '').trim(),
      name: (fields[nameIndex] || '').trim(),
      symbol: (fields[symbolIndex] || '').trim()
    };

    byMint.set(mint, entry);

    const symbolKey = normalizeLookupKey(entry.symbol);
    if (symbolKey && !bySymbol.has(symbolKey)) {
      bySymbol.set(symbolKey, entry);
    }
  }

  return { byMint, bySymbol };
}

function resolveResourceCatalogEntry(mint: string, symbol?: string): ResourceCatalogEntry | null {
  const byMint = RESOURCE_CATALOG.byMint.get(mint);
  if (byMint) return byMint;

  const symbolKey = normalizeLookupKey(symbol || '');
  if (!symbolKey) return null;

  return RESOURCE_CATALOG.bySymbol.get(symbolKey) || null;
}

function normalizeMaterialName(material: ResourceMaterial, mintKey: string, catalogEntry: ResourceCatalogEntry | null): string {
  if (catalogEntry?.name) return catalogEntry.name;
  if (material.name && material.name.trim()) return material.name.trim();
  if (catalogEntry?.symbol) return catalogEntry.symbol;
  if (material.symbol && material.symbol.trim()) return material.symbol.trim();
  return `Token ${mintKey.slice(0, 8)}...`;
}

function resolveResourceFlows(data: any): ResourceFlows | null {
  if (data?.resourceFlows && typeof data.resourceFlows === 'object') return data.resourceFlows as ResourceFlows;
  if (data?.data?.resourceFlows && typeof data.data.resourceFlows === 'object') return data.data.resourceFlows as ResourceFlows;
  if (data?.breakdown?.resourceFlows && typeof data.breakdown.resourceFlows === 'object') return data.breakdown.resourceFlows as ResourceFlows;
  return null;
}

function normalizeLookupKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isR4Material(entry: MaterialEntry): boolean {
  const mintKey = normalizeLookupKey(entry.mint);
  const labelKey = normalizeLookupKey(entry.label);
  const symbolKey = normalizeLookupKey(entry.symbol);

  if (mintKey.startsWith('food') || mintKey.startsWith('fuel') || mintKey.startsWith('ammo') || mintKey.startsWith('tool') || mintKey.startsWith('repair')) {
    return true;
  }

  if (labelKey === 'food' || labelKey === 'fuel' || labelKey === 'ammo' || labelKey === 'toolkit' || labelKey === 'repairkit') {
    return true;
  }

  if (symbolKey === 'food' || symbolKey === 'fuel' || symbolKey === 'ammo' || symbolKey === 'toolkit' || symbolKey === 'rkit') {
    return true;
  }

  

  return false;
}

function shouldHideMaterialEntry(entry: MaterialEntry): boolean {
  if (HIDDEN_RESOURCE_MINTS.has(entry.mint)) {
    return true;
  }

  const labelKey = normalizeLookupKey(entry.label);
  const symbolKey = normalizeLookupKey(entry.symbol);
  return labelKey === 'atlas' || symbolKey === 'atlas';
}

function resolveMaterialImageCandidates(entry: MaterialEntry): string[] {
  const imageUrl = entry.imageUrl?.trim() || '';
  if (!imageUrl) return [];
  return [imageUrl];
}

function resolveFirstTxTimeLabel(data: any): string {
  let firstTxTimeLabel = 'N/A';

  try {
    const txs = (data?.transactions?.length ? data.transactions : data?.allTransactions) ?? [];

    if (data?.firstTxTime) {
      const date = new Date(data.firstTxTime * 1000);
      firstTxTimeLabel = date.toLocaleString();
      return firstTxTimeLabel;
    }

    if (txs.length) {
      const times = (txs as TxLite[])
        .map((tx) => {
          if (tx.blockTime) return new Date(tx.blockTime * 1000);
          if (tx.timestamp) return new Date(tx.timestamp);
          return null;
        })
        .filter(Boolean) as Date[];

      if (times.length) {
        const earliest = new Date(Math.min(...times.map((date) => date.getTime())));
        firstTxTimeLabel = earliest.toLocaleString();
      }
    }
  } catch {
    return firstTxTimeLabel;
  }

  return firstTxTimeLabel;
}

function renderResourceOpsTable(operations: Record<string, { in: number; out: number; count: number }>): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'resource-ops-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th>Operation</th>
    <th style="text-align: right;">Claimed</th>
    <th style="text-align: right;">Burned</th>
    <th style="text-align: right;">Count</th>
  `;
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const normalizedOperations = new Map<string, { in: number; out: number; count: number }>();
  Object.entries(operations).forEach(([opName, stats]) => {
    const normalizedName = normalizeOpName(opName);
    const existing = normalizedOperations.get(normalizedName);
    if (existing) {
      existing.in += toNumber(stats.in);
      existing.out += toNumber(stats.out);
      existing.count += toNumber(stats.count);
      return;
    }

    normalizedOperations.set(normalizedName, {
      in: toNumber(stats.in),
      out: toNumber(stats.out),
      count: toNumber(stats.count)
    });
  });

  normalizedOperations.forEach((stats, opName) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="resource-op-name">${opName}</td>
      <td style="text-align: right; color: #49c89a;">${formatAmount(stats.in)}</td>
      <td style="text-align: right; color: #ce4f4f;">${formatAmount(stats.out)}</td>
      <td style="text-align: right;">${stats.count}</td>
    `;
    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  return table;
}

//seconda tab, sotto toggle switch "Resources", mostra 2 dati: comulativo dopo 7 giorni e comulativo dopo 30 giorni, con sommatoria e segno
function renderResourceSummary(summary: ResourceFlows['summary']): HTMLDivElement {

  const totalIn = toNumber(summary?.totalMaterialsIn);
  const totalOut = toNumber(summary?.totalMaterialsOut);
  const net = totalIn - totalOut;

  const summaryTable7 = document.createElement('table');
  summaryTable7.className = 'summary-ops-table';
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th style="text-align: right;">Net in 7 days</th>
  `;
  summaryTable7.appendChild(headerRow);
  const dataRow = document.createElement('tr');
  dataRow.innerHTML = `
    <td style="text-align: right; color: ${net >= 0 ? '#49c89a' : '#ce4f4f'};">${formatAmount(net * 7)}</td>
    `;
  summaryTable7.appendChild(dataRow);

    const summaryTable30 = document.createElement('table');
  summaryTable30.className = 'summary-ops-table';
  const headerRow30 = document.createElement('tr');
  headerRow30.innerHTML = `
    <th style="text-align: right;">Net in 30 days</th>

  `;
  summaryTable30.appendChild(headerRow30);
  const dataRow30 = document.createElement('tr');
  dataRow30.innerHTML = `
    <td style="text-align: right; color: ${net >= 0 ? '#49c89a' : '#ce4f4f'};">${formatAmount(net * 30)}</td>
  `;
  summaryTable30.appendChild(dataRow30);

  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'resource-summary';
  
  summaryDiv.appendChild(summaryTable7);
  summaryDiv.appendChild(summaryTable30);

  return summaryDiv;
}

function buildResourceFlowTable(entries: MaterialEntry[], emptyMessage: string): HTMLDivElement {
  const tableWrap = document.createElement('div');
  tableWrap.className = 'resource-flow-table-wrap';

  const table = document.createElement('div');
  table.className = 'resource-flow-table';

  const headRow = document.createElement('div');
  headRow.className = 'resource-flow-head';
  headRow.innerHTML = `
    <div class="resource-flow-head-cell">Material</div>
    <div class="resource-flow-head-cell">Flow (Claimed / Burned)</div>
  `;
  table.appendChild(headRow);

  const body = document.createElement('div');
  body.className = 'resource-flow-body';
  let renderedRows = 0;

  entries.forEach((entry) => {
    if (entry.totalIn == entry.totalOut) return;
    const rowMax = Math.max(entry.totalOut, entry.totalIn);
    const outPct = rowMax > 0 ? (entry.totalOut / rowMax) * 100 : 0;
    const inPct = rowMax > 0 ? (entry.totalIn / rowMax) * 100 : 0;
    const materialImageCandidates = resolveMaterialImageCandidates(entry);
    const materialImage = materialImageCandidates[0] || '';
    const materialSymbol = entry.symbol || entry.mint.slice(0, 8);
    const materialId = 'material-' + entry.mint.substring(0, 8);

    const hasOps = entry.operations && Object.keys(entry.operations).length > 0;

    const row = document.createElement('div');
    row.className = hasOps ? 'resource-flow-row has-toggle' : 'resource-flow-row';
    row.id = materialId;
    row.innerHTML = `
      <div class="resource-material-cell">
        <div class="resource-material-entry">
          ${materialImage ? `<img class="resource-material-icon" src="${materialImage}" alt="${materialSymbol}" loading="lazy" decoding="async">` : ''}
          <div class="resource-material-text">
            <div class="resource-material-name">${entry.label}</div>
            <div class="resource-material-symbol">${materialSymbol}</div>
          </div>
          ${hasOps ? '<div class="resource-flow-arrow">▼</div>' : ''}
        </div>
      </div>
      <div class="resource-flow-cell">
        <div class="resource-flow-dual">
          <div class="resource-flow-bar-dual-track">
            <div class="resource-flow-bar-row">
              <div class="resource-flow-bar resource-flow-bar-in" style="width:${inPct.toFixed(2)}%">
                <span class="resource-flow-value-inline">${formatAmount(entry.totalIn)}</span>
              </div>
            </div>
            <div class="resource-flow-bar-row">
              <div class="resource-flow-bar resource-flow-bar-out" style="width:${outPct.toFixed(2)}%">
                <span class="resource-flow-value-inline">${formatAmount(entry.totalOut)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const materialIcon = row.querySelector<HTMLImageElement>('.resource-material-icon');
    if (materialIcon) {
      let candidateIndex = 1;
      materialIcon.addEventListener('error', () => {
        const nextCandidate = materialImageCandidates[candidateIndex];
        candidateIndex += 1;

        if (nextCandidate) {
          materialIcon.src = nextCandidate;
          return;
        }

        materialIcon.remove();
      });
    }

    if (hasOps) {
      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'resource-flow-details';

      const tablesLayout = document.createElement('div');
      tablesLayout.className = 'resource-ops-layout';

      const opsTable = renderResourceOpsTable(entry.operations);

      const summaryTable = renderResourceSummary(entry.operations ? { totalMaterialsIn: entry.totalIn, totalMaterialsOut: entry.totalOut } : undefined);

      tablesLayout.appendChild(opsTable);
      tablesLayout.appendChild(summaryTable);
      detailsDiv.appendChild(tablesLayout);

      row.appendChild(detailsDiv);
    }

    body.appendChild(row);
    renderedRows += 1;
  });

  if (!renderedRows) {
    const emptyRow = document.createElement('div');
    emptyRow.className = 'resource-flow-row resource-flow-row-empty';
    emptyRow.innerHTML = `<div class="resource-flow-empty">${emptyMessage}</div>`;
    body.appendChild(emptyRow);
  }

  table.appendChild(body);
  tableWrap.appendChild(table);
  return tableWrap;
}

export function displayResourceResults(data: any): void {
  const toggleMaterial = (materialId: string) => {
    const materialEl = document.getElementById(materialId) as HTMLElement | null;
    if (materialEl && materialEl.classList.contains('has-toggle')) {
      materialEl.classList.toggle('expanded');
    }
  };

  (window as any).toggleMaterial = toggleMaterial;

  const resourceFlows = resolveResourceFlows(data);

  const resourceResults = document.createElement('div');
  resourceResults.id = 'resourceResults';
  resourceResults.className = 'resource-results';

  if (!resourceFlows) {
    const empty = document.createElement('div');
    empty.className = 'fleet-item';
    empty.textContent = 'No resource data available';
    resourceResults.appendChild(empty);
    setCachedResourceView(resourceResults);
    return;
  }

  const byMaterial = resourceFlows.byMaterial || {};
  const materialEntries: MaterialEntry[] = Object.entries(byMaterial)
    .map(([mint, material]) => {
      const totalIn = toNumber(material.totalIn);
      const totalOut = toNumber(material.totalOut);
      const catalogEntry = resolveResourceCatalogEntry(mint, material.symbol);

      return {
        mint,
        label: normalizeMaterialName(material, mint, catalogEntry),
        symbol: (catalogEntry?.symbol || material.symbol || '').trim(),
        imageUrl: catalogEntry?.imageUrl || '',
        totalIn,
        totalOut,
        volume: totalIn + totalOut,
        operations: material.operations || {}
      };
    })
    .filter((entry) => entry.volume > 0 && !shouldHideMaterialEntry(entry))
    .sort((a, b) => b.volume - a.volume);

  const r4Entries = materialEntries.filter((entry) => isR4Material(entry));
  const otherEntries = materialEntries.filter((entry) => !isR4Material(entry));
  const firstTxTimeLabel = resolveFirstTxTimeLabel(data);

  const analysisPeriod = document.createElement('div');
  analysisPeriod.className = 'analysis-period';
  const windowLabel = resourceFlows.timeWindow || '24h';
  analysisPeriod.textContent = `Resource flows in the last ${windowLabel} from: ${firstTxTimeLabel}`;
  const timerSpan = document.createElement('span');
  timerSpan.className = 'timer timer-emphasis';
  analysisPeriod.appendChild(timerSpan);
  resourceResults.appendChild(analysisPeriod);

  const statsGrid = document.createElement('div');
  statsGrid.className = 'stats-grid';

  const totalOutCard = document.createElement('div');
  totalOutCard.className = 'stat-card';
  const totalOutLabel = document.createElement('div');
  totalOutLabel.className = 'stat-label';
  totalOutLabel.textContent = 'Total Burned / Out';
  const totalOutValue = document.createElement('div');
  totalOutValue.className = 'stat-value resource-stat-burned';
  totalOutValue.textContent = formatAmount(toNumber(resourceFlows.summary?.totalMaterialsOut));
  totalOutCard.appendChild(totalOutLabel);
  totalOutCard.appendChild(totalOutValue);

  const totalInCard = document.createElement('div');
  totalInCard.className = 'stat-card';
  const totalInLabel = document.createElement('div');
  totalInLabel.className = 'stat-label';
  totalInLabel.textContent = 'Total Claimed / In';
  const totalInValue = document.createElement('div');
  totalInValue.className = 'stat-value resource-stat-claimed';
  totalInValue.textContent = formatAmount(toNumber(resourceFlows.summary?.totalMaterialsIn));
  totalInCard.appendChild(totalInLabel);
  totalInCard.appendChild(totalInValue);

  statsGrid.appendChild(totalOutCard);
  statsGrid.appendChild(totalInCard);
  resourceResults.appendChild(statsGrid);

  const sectionTitle = document.createElement('h2');
  sectionTitle.className = 'section-title';
  sectionTitle.textContent = 'R4 Materials (Food / Fuel / Ammo / Toolkit)';
  resourceResults.appendChild(sectionTitle);

  const r4Table = buildResourceFlowTable(r4Entries, 'No R4 deltas in selected window');
  resourceResults.appendChild(r4Table);

  const otherSectionTitle = document.createElement('h2');
  otherSectionTitle.className = 'section-title';
  otherSectionTitle.textContent = 'Other Materials';
  resourceResults.appendChild(otherSectionTitle);

  const otherTable = buildResourceFlowTable(otherEntries, 'No non-R4 deltas in selected window');
  resourceResults.appendChild(otherTable);

  const materialRows = resourceResults.querySelectorAll<HTMLElement>('.resource-flow-row.has-toggle');
  materialRows.forEach((row) => {
    row.addEventListener('click', () => {
      const materialId = row.id;
      if (materialId) {
        toggleMaterial(materialId);
      }
    });
  });

  setCachedResourceView(resourceResults);
}
