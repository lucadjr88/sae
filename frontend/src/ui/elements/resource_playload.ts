import { getActiveViewPreference, setCachedResourceView, showCachedView } from '@/ui/elements/toggleSwitch';
import { normalizeOpName, resolveTxTimeRange } from '@/utils/utils';
import resourceMintImageCsvRaw from '@/assets/staratlas_resource_mint_image.csv?raw';
import { TICKER_CONFIG } from './footBar';


const atlasIcon = `<img style="width: 25%" src="${TICKER_CONFIG.find(c => c.id === 'star-atlas')?.img}"/>`;

type ResourceOperationStats = {
  in: number;
  out: number;
  count: number;
};

type ResourceMaterial = {
  mint?: string;
  name?: string;
  symbol?: string;
  totalIn?: number;
  totalOut?: number;
  net?: number;
  operations?: Record<string, ResourceOperationStats>;
};

type ResourceFlows = {
  profileId?: string;
  timeWindow?: string;
  summary?: {
    totalMaterialsIn?: number;
    totalMaterialsOut?: number;
    totalAtlasIn?: number;
    totalAtlasOut?: number;
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
  atlasUnitPriceSell?: number | null;
  atlasUnitPriceBuy?: number | null;
  atlasUnitMedianPrice?: number | null;
  totalAtlasIn?: number;
  totalAtlasOut?: number;
  operations?: Record<string, ResourceOperationStats>;
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

type ResourceSummaryMetrics = NonNullable<ResourceFlows['summary']>;

type ResourceSummaryRender = {
  element: HTMLDivElement;
  update: (summary?: ResourceSummaryMetrics) => void;
};

const RESOURCE_CATALOG = parseResourceCatalog(resourceMintImageCsvRaw);
const HIDDEN_RESOURCE_MINTS = new Set([
  'ATLASXmbPQxBUYbxPsV97usA3fPQYEqzQBUHgiFCUsXx'
]);
const RESOURCE_ATLAS_PRICE_SELL_CACHE = new Map<string, number | null>();
const RESOURCE_ATLAS_PRICE_BUY_CACHE = new Map<string, number | null>();
const DEFAULT_UNCHECKED_RESOURCE_OPS = new Set<string>([
  'SB Upgrade',
  'TraderMarketBuy',
  'TraderMarketSell',
]);

function isResourceOpCheckedByDefault(opName: string): boolean {
  return !DEFAULT_UNCHECKED_RESOURCE_OPS.has(normalizeOpName(opName));
}
function resolveMedianPrice(buy?: number | null, sell?: number | null): number | null {
  const validBuy = Number.isFinite(buy) && buy && buy > 0 ? buy : null;
  const validSell = Number.isFinite(sell) && sell && sell > 0 ? sell : null;

  if (validBuy !== null && validSell !== null) {
    return (validBuy + validSell) / 2;
  }

  return validBuy ?? validSell ?? null;
}

async function loadAtlasPricesForMints(mints: string[]): Promise<boolean> {
  const pendingMints = [...new Set(mints.filter((mint) => mint && (
    !RESOURCE_ATLAS_PRICE_SELL_CACHE.has(mint)
    || !RESOURCE_ATLAS_PRICE_BUY_CACHE.has(mint)
  )))];
  if (!pendingMints.length) return false;

  let changed = false;
  for (let i = 0; i < pendingMints.length; i += 50) {
    const batch = pendingMints.slice(i, i + 50);

    try {
      const response = await fetch('/api/prezzi-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ricchiesta_prezzi: batch })
      });

      if (!response.ok) {
        throw new Error(`prices-batch failed: ${response.status}`);
      }

      const payload = await response.json();
      batch.forEach((mint) => {
        const atlas = payload?.prezzi?.[mint]?.atlas;
        // salviamo sia prezzo_sell che prezzo_buy 
        const atlasUnitPriceSell = typeof atlas?.prezzo_sell === 'number' ? atlas.prezzo_sell : null;
        const atlasUnitPriceBuy = typeof atlas?.prezzo_buy === 'number' ? atlas.prezzo_buy : null;
        RESOURCE_ATLAS_PRICE_SELL_CACHE.set(mint, atlasUnitPriceSell);
        RESOURCE_ATLAS_PRICE_BUY_CACHE.set(mint, atlasUnitPriceBuy);
        changed = true;
      });
    } catch (error) {
      console.warn('[resource_playload] Failed to load ATLAS prices for mints:', batch, error);
      batch.forEach((mint) => {
        RESOURCE_ATLAS_PRICE_SELL_CACHE.set(mint, null);
        RESOURCE_ATLAS_PRICE_BUY_CACHE.set(mint, null);
        changed = true;
      });
    }
  }

  return changed;
}

function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeResourceOperations(operations: Record<string, ResourceOperationStats>): Map<string, ResourceOperationStats> {
  const normalizedOperations = new Map<string, ResourceOperationStats>();

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

  return normalizedOperations;
}

function buildResourceSummaryMetrics(totalIn: number, totalOut: number, atlasUnitMedianPrice?: number | null): ResourceSummaryMetrics {
  const validAtlasPrice = Number.isFinite(atlasUnitMedianPrice) && atlasUnitMedianPrice && atlasUnitMedianPrice > 0
    ? atlasUnitMedianPrice
    : 0;

  return {
    totalMaterialsIn: totalIn,
    totalMaterialsOut: totalOut,
    totalAtlasIn: totalIn * validAtlasPrice,
    totalAtlasOut: totalOut * validAtlasPrice,
  };
}

function buildSelectedSummaryMetrics(
  operations: Map<string, ResourceOperationStats>,
  atlasUnitMedianPrice?: number | null,
  selectedOps?: Set<string>,
  baseSummary?: ResourceSummaryMetrics
): ResourceSummaryMetrics {
  let selectedIn = 0;
  let selectedOut = 0;

  operations.forEach((stats, opName) => {
    if (selectedOps && !selectedOps.has(opName)) {
      return;
    }

    selectedIn += toNumber(stats.in);
    selectedOut += toNumber(stats.out);
  });

  const selectedAtlasSummary = buildResourceSummaryMetrics(selectedIn, selectedOut, atlasUnitMedianPrice);
  return {
    totalMaterialsIn: baseSummary ? toNumber(baseSummary.totalMaterialsIn) : selectedAtlasSummary.totalMaterialsIn,
    totalMaterialsOut: baseSummary ? toNumber(baseSummary.totalMaterialsOut) : selectedAtlasSummary.totalMaterialsOut,
    totalAtlasIn: selectedAtlasSummary.totalAtlasIn,
    totalAtlasOut: selectedAtlasSummary.totalAtlasOut,
  };
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 1});
}

function formatAtlasValue(amount: number, atlasUnitPrice?: number | null): string {
  if (!Number.isFinite(amount) || !Number.isFinite(atlasUnitPrice) || !atlasUnitPrice || atlasUnitPrice <= 0) {
    return '-';
  }

  const atlasValue = amount * atlasUnitPrice;
  if (!Number.isFinite(atlasValue) || atlasValue === 0) {
    return '-';
  }

  return ` <span style="display:flex; flex-flow: row; align-items: center;">(${formatAmount(atlasValue)} ${atlasIcon})</span>`;
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

export function resolveResourceCatalogEntry(mint: string, symbol?: string): ResourceCatalogEntry | null {
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

export function resolveMaterialImageCandidates(entry: MaterialEntry): string[] {
  const imageUrl = entry.imageUrl?.trim() || '';
  if (!imageUrl) return [];
  return [imageUrl];
}

function renderResourceOpsTable(
  operations: Record<string, ResourceOperationStats>,
  atlasUnitMedianPrice?: number | null,
  onSelectionChange?: (summary?: ResourceSummaryMetrics) => void,
  baseSummary?: ResourceSummaryMetrics
): HTMLTableElement {
  const table = document.createElement('table');
  table.className = 'resource-ops-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th>Operation</th>
    <th></th>
    <th style="text-align: right;">Claimed</th>
    <th style="text-align: right;">Atlas Buy</th>
    <th style="text-align: right;">Burned</th>
    <th style="text-align: right;">Atlas Sell</th>
    <th style="text-align: right;">Count</th>
  `;
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const normalizedOperations = normalizeResourceOperations(operations);

  const emitSelectionChange = () => {
    if (!onSelectionChange) return;

    const selectedOps = new Set<string>();
    tbody.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-op-name]').forEach((input) => {
      const opName = input.dataset.opName;
      if (input.checked && opName) {
        selectedOps.add(opName);
      }
    });

    onSelectionChange(buildSelectedSummaryMetrics(normalizedOperations, atlasUnitMedianPrice, selectedOps, baseSummary));
  };

  normalizedOperations.forEach((stats, opName) => {
        const checkedAttr = isResourceOpCheckedByDefault(opName) ? 'checked' : '';
const row = document.createElement('tr');
    row.innerHTML = `
      <td class="resource-op-name">${opName}</td>
      <td><input type="checkbox" data-op-name="${opName}" ${checkedAttr}></td>
      <td style="text-align: right; color: #49c89a;">${formatAmount(stats.in)}</td>
      <td style="text-align: right; color: #49c89a;">${formatAmount(stats.in * atlasUnitMedianPrice)}</td>
      <td style="text-align: right; color: #ce4f4f;">${formatAmount(stats.out)}</td>
      <td style="text-align: right; color: #ce4f4f;">${formatAmount(stats.out * atlasUnitMedianPrice)}</td>
      <td style="text-align: right;">${stats.count}</td>
    `;

    const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"][data-op-name]');
    if (checkbox) {
      const syncRowState = () => {
        row.style.opacity = checkbox.checked ? '1' : '0.45';
      };

      checkbox.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      checkbox.addEventListener('change', () => {
        syncRowState();
        emitSelectionChange();
      });
      syncRowState();
    }

    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  emitSelectionChange();
  return table;
}

//seconda tab, sotto toggle switch "Resources", mostra 2 dati: comulativo dopo 7 giorni e comulativo dopo 30 giorni, con sommatoria e segno
function renderResourceSummary(summary: ResourceSummaryMetrics | undefined): ResourceSummaryRender {
  const summaryTable7 = document.createElement('table');
  summaryTable7.className = 'summary-ops-table';
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = `
    <th></th>
    <th style="text-align: right;">Net in 7 days</th>
  `;
  summaryTable7.appendChild(headerRow);
  const dataRow = document.createElement('tr');
  dataRow.innerHTML = `
    <td class="summary-net-amount" style="text-align: right;"></td>
    <td class="summary-net-atlas" style="text-align: right;"></td>
    `;
  summaryTable7.appendChild(dataRow);

  const summaryTable30 = document.createElement('table');
  summaryTable30.className = 'summary-ops-table';
  const headerRow30 = document.createElement('tr');
  headerRow30.innerHTML = `
    <th></th>
    <th style="text-align: right;">Net in 30 days</th>
  `;
  summaryTable30.appendChild(headerRow30);
  const dataRow30 = document.createElement('tr');
  dataRow30.innerHTML = `
    <td class="summary-net-amount" style="text-align: right;"></td>
    <td class="summary-net-atlas" style="text-align: right;"></td>
  `;
  summaryTable30.appendChild(dataRow30);

  const summaryDiv = document.createElement('div');
  summaryDiv.className = 'resource-summary';
  summaryDiv.appendChild(summaryTable7);
  summaryDiv.appendChild(summaryTable30);

  const net7AmountCell = dataRow.querySelector<HTMLTableCellElement>('.summary-net-amount');
  const net7AtlasCell = dataRow.querySelector<HTMLTableCellElement>('.summary-net-atlas');
  const net30AmountCell = dataRow30.querySelector<HTMLTableCellElement>('.summary-net-amount');
  const net30AtlasCell = dataRow30.querySelector<HTMLTableCellElement>('.summary-net-atlas');

  const update = (nextSummary?: ResourceSummaryMetrics) => {
    const totalIn = toNumber(nextSummary?.totalMaterialsIn);
    const totalOut = toNumber(nextSummary?.totalMaterialsOut);
    const totalAtlasBuy = toNumber(nextSummary?.totalAtlasIn);
    const totalAtlasSell = toNumber(nextSummary?.totalAtlasOut);
    const net = totalIn - totalOut;
    const atlasNet = totalAtlasBuy - totalAtlasSell;
    const color = net >= 0 ? '#49c89a' : '#ce4f4f';

    if (net7AmountCell) {
      net7AmountCell.textContent = formatAmount(net * 7);
      net7AmountCell.style.color = color;
    }
    if (net7AtlasCell) {
      net7AtlasCell.textContent = `${formatAmount(atlasNet * 7)} Atlas`;
      net7AtlasCell.style.color = color;
    }
    if (net30AmountCell) {
      net30AmountCell.textContent = formatAmount(net * 30);
      net30AmountCell.style.color = color;
    }
    if (net30AtlasCell) {
      net30AtlasCell.textContent = `${formatAmount(atlasNet * 30)} Atlas`;
      net30AtlasCell.style.color = color;
    }
  };

  update(summary);
  return { element: summaryDiv, update };
}

function updateResourceFlowRowDisplay(
  row: HTMLDivElement,
  entry: MaterialEntry,
  summary: ResourceSummaryMetrics
): void {
  const inBar = row.querySelector<HTMLDivElement>('.resource-flow-bar-in');
  const outBar = row.querySelector<HTMLDivElement>('.resource-flow-bar-out');
  const inValue = inBar?.querySelector<HTMLSpanElement>('.resource-flow-value-inline');
  const outValue = outBar?.querySelector<HTMLSpanElement>('.resource-flow-value-inline');

  if (inValue) {
    inValue.innerHTML = `${formatAmount(entry.totalIn)}${formatAtlasValue(toNumber(summary.totalAtlasIn), 1)}`;
  }
  if (outValue) {
    outValue.innerHTML = `${formatAmount(entry.totalOut)}${formatAtlasValue(toNumber(summary.totalAtlasOut), 1)}`;
  }
}

function buildResourceFlowTable(
  entries: MaterialEntry[],
  emptyMessage: string,
  onEntrySummaryChange?: (mint: string, summary: ResourceSummaryMetrics) => void
): HTMLDivElement {
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
    const mintId = entry.mint;
    const materialId = 'material-' + mintId.substring(0, 8);

    const hasOps = entry.operations && Object.keys(entry.operations).length > 0;

    const row = document.createElement('div');
    row.className = hasOps ? 'resource-flow-row has-toggle' : 'resource-flow-row';
    row.id = materialId;
    row.innerHTML = `
      <div class="resource-material-cell">
        <div class="resource-material-entry">
          ${materialImage ? `<img class="resource-material-icon" src="${materialImage}" alt="${materialSymbol}" loading="lazy" decoding="async" onclick="window.open('https://flaresplay.xyz/detail.html?id=${mintId}', '_blank')">` : ''}
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
                <span class="resource-flow-value-inline">${formatAmount(entry.totalIn)}${formatAtlasValue(entry.totalIn, entry.atlasUnitMedianPrice)}</span>
              </div>
            </div>
            <div class="resource-flow-bar-row">
              <div class="resource-flow-bar resource-flow-bar-out" style="width:${outPct.toFixed(2)}%">
                <span class="resource-flow-value-inline">${formatAmount(entry.totalOut)}${formatAtlasValue(entry.totalOut, entry.atlasUnitMedianPrice)}</span>
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

    const defaultSummary = buildResourceSummaryMetrics(entry.totalIn, entry.totalOut, entry.atlasUnitMedianPrice);

    if (hasOps) {
      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'resource-flow-details';

      const tablesLayout = document.createElement('div');
      tablesLayout.className = 'resource-ops-layout';

      const summaryTable = renderResourceSummary(defaultSummary);
      const applySelection = (nextSummary?: ResourceSummaryMetrics) => {
        const activeSummary = nextSummary ?? defaultSummary;
        summaryTable.update(activeSummary);
        updateResourceFlowRowDisplay(row, entry, activeSummary);
        onEntrySummaryChange?.(entry.mint, activeSummary);
      };

      const opsTable = renderResourceOpsTable(
        entry.operations,
        entry.atlasUnitMedianPrice,
        applySelection,
        defaultSummary
      );

      tablesLayout.appendChild(opsTable);
      tablesLayout.appendChild(summaryTable.element);
      detailsDiv.appendChild(tablesLayout);

      row.appendChild(detailsDiv);
    } else {
      onEntrySummaryChange?.(entry.mint, defaultSummary);
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
  const materialMints = Object.keys(byMaterial).filter((mint) => !HIDDEN_RESOURCE_MINTS.has(mint));

  void loadAtlasPricesForMints(materialMints).then((changed) => {
    if (!changed) return;
    displayResourceResults(data);
  });

  const materialEntries: MaterialEntry[] = Object.entries(byMaterial)
    .map(([mint, material]) => {
      const totalIn = toNumber(material.totalIn);
      const totalOut = toNumber(material.totalOut);
      const catalogEntry = resolveResourceCatalogEntry(mint, material.symbol);
      const atlasUnitPriceSell = RESOURCE_ATLAS_PRICE_SELL_CACHE.get(mint) ?? null;
      const atlasUnitPriceBuy = RESOURCE_ATLAS_PRICE_BUY_CACHE.get(mint) ?? null;
      const atlasUnitMedianPrice = resolveMedianPrice(atlasUnitPriceBuy, atlasUnitPriceSell);
      const totalAtlasIn = Number.isFinite(atlasUnitMedianPrice) && atlasUnitMedianPrice ? totalIn * atlasUnitMedianPrice : 0;
      const totalAtlasOut = Number.isFinite(atlasUnitMedianPrice) && atlasUnitMedianPrice ? totalOut * atlasUnitMedianPrice : 0;

      return {
        mint,
        label: normalizeMaterialName(material, mint, catalogEntry),
        symbol: (catalogEntry?.symbol || material.symbol || '').trim(),
        imageUrl: catalogEntry?.imageUrl || '',
        totalIn,
        totalOut,
        volume: totalIn + totalOut,
        atlasUnitPriceSell,
        atlasUnitPriceBuy,
        atlasUnitMedianPrice,
        totalAtlasIn,
        totalAtlasOut,
        operations: material.operations || {}
      };
    })
    .filter((entry) => entry.volume > 0 && !shouldHideMaterialEntry(entry))
    .sort((a, b) => b.volume - a.volume);

  const r4Entries = materialEntries.filter((entry) => isR4Material(entry));
  const otherEntries = materialEntries.filter((entry) => !isR4Material(entry));
  const selectionMetricsByMint = new Map<string, ResourceSummaryMetrics>(
    materialEntries.map((entry) => ([
      entry.mint,
      buildResourceSummaryMetrics(entry.totalIn, entry.totalOut, entry.atlasUnitMedianPrice)
    ]))
  );
  const hasAtlasPricing = materialEntries.some(
    (entry) => toNumber(entry.totalAtlasIn) > 0 || toNumber(entry.totalAtlasOut) > 0
  );
  const { timeFirstTx, timeLastTx, ageLastTx } = resolveTxTimeRange(data);

  const analysisPeriod = document.createElement('div');
  analysisPeriod.className = 'analysis-period';
  const windowLabel = resourceFlows.timeWindow || '24h';
  analysisPeriod.textContent = `Resource flows in the last ${windowLabel}: ${timeFirstTx} → ${timeLastTx} , Age: (${ageLastTx})`;
  const timerSpan = document.createElement('span');
  timerSpan.className = 'timer timer-emphasis';
  analysisPeriod.appendChild(timerSpan);

  const headerContainer = document.createElement('div');
  headerContainer.className = 'resource-header';
  headerContainer.appendChild(analysisPeriod);

  const flareplayinfo = document.createElement('div');
  flareplayinfo.className = 'flareplay-info';
  flareplayinfo.innerHTML = `Prices provided by <a class="flareplay-link" href="https://flaresplay.xyz" target="_blank" rel="noopener noreferrer">flaresplay.xyz</a>`;
  headerContainer.appendChild(flareplayinfo);

  resourceResults.appendChild(headerContainer);

  const statsGrid = document.createElement('div');
  statsGrid.className = 'stats-grid';

  const totalOutCard = document.createElement('div');
  totalOutCard.className = 'stat-card';
  const totalOutLabel = document.createElement('div');
  totalOutLabel.className = 'stat-label';
  totalOutLabel.textContent = 'Total Burned / Out';
  const totalOutValue = document.createElement('div');
  totalOutValue.className = 'stat-value resource-stat-burned';
  totalOutCard.appendChild(totalOutLabel);
  totalOutCard.appendChild(totalOutValue);

  const totalInCard = document.createElement('div');
  totalInCard.className = 'stat-card';
  const totalInLabel = document.createElement('div');
  totalInLabel.className = 'stat-label';
  totalInLabel.textContent = 'Total Claimed / In';
  const totalInValue = document.createElement('div');
  totalInValue.className = 'stat-value resource-stat-claimed';
  totalInCard.appendChild(totalInLabel);
  totalInCard.appendChild(totalInValue);

  const updateHeaderTotals = () => {
    let totalAtlasInValue = 0;
    let totalAtlasOutValue = 0;
    let totalMaterialsInValue = 0;
    let totalMaterialsOutValue = 0;

    selectionMetricsByMint.forEach((summary) => {
      totalAtlasInValue += toNumber(summary.totalAtlasIn);
      totalAtlasOutValue += toNumber(summary.totalAtlasOut);
      totalMaterialsInValue += toNumber(summary.totalMaterialsIn);
      totalMaterialsOutValue += toNumber(summary.totalMaterialsOut);
    });

if (hasAtlasPricing) {
      totalOutValue.innerHTML = formatAmount(totalAtlasOutValue) + atlasIcon;
      totalInValue.innerHTML = formatAmount(totalAtlasInValue) + atlasIcon;
      return;
    }

    totalOutValue.textContent = `${formatAmount(totalMaterialsOutValue)} units`;
    totalInValue.textContent = `${formatAmount(totalMaterialsInValue)} units`;
  };
  
  updateHeaderTotals();

  statsGrid.appendChild(totalOutCard);
  statsGrid.appendChild(totalInCard);
  resourceResults.appendChild(statsGrid);

  const handleEntrySummaryChange = (mint: string, summary: ResourceSummaryMetrics) => {
    selectionMetricsByMint.set(mint, summary);
    updateHeaderTotals();
  };

  const sectionTitle = document.createElement('h2');
  sectionTitle.className = 'section-title';
  sectionTitle.textContent = 'R4 Materials (Food / Fuel / Ammo / Toolkit)';
  resourceResults.appendChild(sectionTitle);

  const r4Table = buildResourceFlowTable(
    r4Entries,
    'No R4 deltas in selected window',
    handleEntrySummaryChange
  );
  resourceResults.appendChild(r4Table);

  const otherSectionTitle = document.createElement('h2');
  otherSectionTitle.className = 'section-title';
  otherSectionTitle.textContent = 'Other Materials';
  resourceResults.appendChild(otherSectionTitle);

  const otherTable = buildResourceFlowTable(
    otherEntries,
    'No non-R4 deltas in selected window',
    handleEntrySummaryChange
  );
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
  if (getActiveViewPreference() === 'resource') {
    showCachedView('resource', false);
  }
}
