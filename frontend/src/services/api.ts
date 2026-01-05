// @ts-nocheck

// Implementazione reale spostata da app
import { normalizeOpName } from '@utils/utils.js';
import type { FleetsRequest, FleetsResponse, WalletSageFeesStreamRequest, FleetBreakdownRequest, FleetBreakdownResponse, ApiError } from '@types/api.js';
import type { FeesByFleet } from '@types/operation-list.js';

async function fetchJson<Req, Res>(url: string, init: RequestInit & { body?: Req }): Promise<Res> {
  const headers = { 'Content-Type': 'application/json', ...init.headers };
  const body = init.body ? JSON.stringify(init.body) : undefined;
  try {
    const response = await fetch(url, { ...init, headers, body });
    if (!response.ok) {
      throw { type: 'http' as const, status: response.status, message: response.statusText };
    }
		const data = await response.json();
    return data as Res;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'type' in error) {
      throw error as ApiError;
    }
    throw { type: 'network' as const, error: error as Error };
  }
}

export function updateCacheTooltip(cacheHit: string | null, cacheTimestamp: string | null) {
	const profileIcon = document.getElementById('profileIcon');
	const cacheTooltip = document.getElementById('cacheTooltip');
	const cacheTooltipIcon = document.getElementById('cacheTooltipIcon');
	const cacheTooltipTitle = document.getElementById('cacheTooltipTitle');
	const cacheTooltipStatus = document.getElementById('cacheTooltipStatus');
	const cacheTooltipAge = document.getElementById('cacheTooltipAge');
	if (profileIcon && cacheTooltip) {
		profileIcon.classList.remove('cache-fresh', 'cache-stale');
		profileIcon.title = '';
		profileIcon.style.opacity = '1';
		let hideTimeout = null;
		profileIcon.onmouseenter = () => {
			if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
			cacheTooltip.classList.add('visible');
		};
		profileIcon.onmouseleave = () => {
			hideTimeout = setTimeout(() => { cacheTooltip.classList.remove('visible'); }, 200);
		};
		cacheTooltip.onmouseenter = () => { if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; } };
		cacheTooltip.onmouseleave = () => { cacheTooltip.classList.remove('visible'); };
		const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');
		const cacheRefreshBtn = document.getElementById('cacheRefreshBtn');
		if (cacheHit === 'disk' && cacheTimestamp) {
			const cacheAge = Date.now() - parseInt(cacheTimestamp);
			const sixHoursMs = 6 * 60 * 60 * 1000;
			const ageMinutes = (cacheAge / 60000).toFixed(1);
			const ageHours = (cacheAge / 3600000).toFixed(1);
			if (cacheAge < sixHoursMs) {
				profileIcon.classList.add('cache-fresh');
				cacheTooltipIcon.textContent = '✅';
				cacheTooltipTitle.textContent = 'Cache Fresh';
				cacheTooltipStatus.textContent = 'Data loaded from cache';
				cacheTooltipAge.textContent = ageHours < 1 ? `Age: ${ageMinutes} minutes` : `Age: ${ageHours} hours`;
				if (cacheUpdateBtn) cacheUpdateBtn.style.display = '';
				if (cacheRefreshBtn) cacheRefreshBtn.style.display = 'none';
			} else {
				profileIcon.classList.add('cache-stale');
				cacheTooltipIcon.textContent = '⚠️';
				cacheTooltipTitle.textContent = 'Cache Stale';
				cacheTooltipStatus.textContent = 'Cache is older than 6 hours';
				cacheTooltipAge.textContent = `Age: ${ageHours} hours`;
				if (cacheUpdateBtn) cacheUpdateBtn.style.display = 'none';
				if (cacheRefreshBtn) cacheRefreshBtn.style.display = '';
			}
		} else {
			profileIcon.classList.add('cache-fresh');
			cacheTooltipIcon.textContent = '✨';
			cacheTooltipTitle.textContent = 'Fresh Data';
			cacheTooltipStatus.textContent = 'Just fetched from API';
			cacheTooltipAge.textContent = 'No cached data';
			if (cacheUpdateBtn) cacheUpdateBtn.style.display = 'none';
			if (cacheRefreshBtn) cacheRefreshBtn.style.display = '';
		}
		const updateBtn = document.getElementById('cacheUpdateBtn');
		const refreshBtn = document.getElementById('cacheRefreshBtn');
		const wipeBtn = document.getElementById('cacheWipeBtn');
		if (updateBtn) { updateBtn.disabled = false; updateBtn.textContent = '⚡ Update Cache'; }
		if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '🔄 Force Refresh'; }
		if (wipeBtn) { wipeBtn.disabled = false; wipeBtn.textContent = '🗑️ Wipe & Reload'; }
	}
}

import { setCurrentProfileId, setLastAnalysisParams, setAnalysisStartTime, setProgressInterval, progressInterval } from '@utils/state.js';

export async function analyzeFees() {
	const profileId = document.getElementById('profileId').value.trim();
	const resultsDiv = document.getElementById('results');
	const btn = document.getElementById('analyzeBtn');
	if (!profileId) {
		alert('Inserisci un Player Profile ID!');
		return;
	}
	setCurrentProfileId(profileId);
	const formBox = document.querySelector('.form-box');
	if (formBox) formBox.style.display = 'none';
	window.setSidebarVisible(false);
	btn.disabled = true;
	btn.textContent = 'Loading...';
	setAnalysisStartTime(Date.now());
	const startTime = Date.now();
	window.updateProgress('Initializing...');
	if (progressInterval) clearInterval(progressInterval);
	setProgressInterval(setInterval(() => {
		if (startTime) {
			const seconds = Math.floor((Date.now() - startTime) / 1000);
			const resultsDiv = document.getElementById('results');
			if (resultsDiv) {
				const loadingDiv = resultsDiv.querySelector('.loading');
				if (loadingDiv) {
					const span = loadingDiv.querySelector('span');
					if (span) {
						const text = span.textContent;
						const messageMatch = text.match(/\((.+?)(?:\s-\s\d+s)?\)$/);
						const message = messageMatch ? messageMatch[1] : text.replace(/\(|\)/g, '').split(' - ')[0];
						span.textContent = `(${message} - ${seconds}s)`;
					}
				}
			}
		}
	}, 1000));
	try {
		window.updateProgress('Fetching fleet data...');
		const fleetsData: FleetsResponse = await fetchJson<FleetsRequest, FleetsResponse>('/api/fleets', {
			method: 'POST',
			body: { profileId }
		});
		if (!fleetsData.walletAuthority) throw new Error('Could not derive wallet from fleet transactions');
		const walletPubkey = fleetsData.walletAuthority;
		const fleets = fleetsData.fleets;
		window.updateProgress(`Found ${fleets.length} fleets, deriving wallet...`);
		const allFleetAccounts: string[] = [];
		const fleetNames: { [account: string]: string } = {};
		const fleetRentalStatus: { [account: string]: boolean } = {};
		fleets.forEach(f => {
			allFleetAccounts.push(f.data.fleetShips);
			allFleetAccounts.push(f.key);
			if (f.data.fuelTank) allFleetAccounts.push(f.data.fuelTank);
			if (f.data.ammoBank) allFleetAccounts.push(f.data.ammoBank);
			if (f.data.cargoHold) allFleetAccounts.push(f.data.cargoHold);
			fleetNames[f.data.fleetShips] = f.callsign;
			fleetNames[f.key] = f.callsign;
			if (f.data.fuelTank) fleetNames[f.data.fuelTank] = f.callsign;
			if (f.data.ammoBank) fleetNames[f.data.ammoBank] = f.callsign;
			if (f.data.cargoHold) fleetNames[f.data.cargoHold] = f.callsign;
			const initialRented = !!f.isRented;
			fleetRentalStatus[f.data.fleetShips] = initialRented;
			fleetRentalStatus[f.key] = initialRented;
			if (f.data.fuelTank) fleetRentalStatus[f.data.fuelTank] = initialRented;
			if (f.data.ammoBank) fleetRentalStatus[f.data.ammoBank] = initialRented;
			if (f.data.cargoHold) fleetRentalStatus[f.data.cargoHold] = initialRented;
		});
		const uniqueFleetAccounts = [...new Set(allFleetAccounts)];
		window.updateProgress(`Analyzing ${fleets.length} fleet accounts...`);
		const requestBody: WalletSageFeesStreamRequest = { 
			profileId: profileId, 
			fleetAccounts: uniqueFleetAccounts,
			fleetNames,
			fleetRentalStatus,
			hours: 24,
			enableSubAccountMapping: false
		};
		const response = await fetch('/api/wallet-sage-fees-stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody)
		});
		if (!response.ok) throw new Error('Streaming request failed');
		const cacheHit = response.headers.get('X-Cache-Hit');
		const cacheTimestamp = response.headers.get('X-Cache-Timestamp');
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let data = null;
		let lastProgress = null;
		let fromCache = false;
		let stopReading = false;
		while (true) {
			if (stopReading) break;
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const messages = buffer.split('\n\n');
			buffer = messages.pop() || '';
			for (const message of messages) {
				if (!message.trim() || !message.startsWith('data: ')) continue;
				const jsonStr = message.substring(6);
				try {
					const update = JSON.parse(jsonStr);
					if (update.type === 'progress') {
						lastProgress = update;
						if (update.stage === 'signatures') {
							window.updateProgress(`${update.message} (${update.processed}/${update.total})`);
						} else if (update.stage === 'transactions') {
							const msg = `Processing: ${update.processed}/${update.total} tx (${update.percentage}%)`;
							window.updateProgress(msg);
							if (update.feesByFleet && Object.keys(update.feesByFleet).length > 0) {
								window.displayPartialResults(update, fleets, fleetRentalStatus);
							}
						}
					} else if (update.type === 'complete') {
						data = update;
						fromCache = !!update.fromCache;
						try { await reader.cancel(); } catch {}
						stopReading = true;
						break;
					} else if (update.error) {
						throw new Error(update.error);
					}
				} catch (e) {
					console.error('Failed to parse SSE message:', e);
				}
			}
		}
		if (!data && buffer.trim()) {
			const lines = buffer.split(/\n/).filter(l => l.startsWith('data: '));
			for (const l of lines) {
				try {
					const obj = JSON.parse(l.substring(6));
					if (obj.type === 'complete') {
						data = obj;
						break;
					}
				} catch {}
			}
		}
		if (!data && lastProgress) {
			data = {
				...lastProgress,
				type: 'complete',
				synthetic: true
			};
		}
		if (!data) throw new Error('Analysis failed - no data received');
		setLastAnalysisParams({
			profileId,
			fleetAccounts: uniqueFleetAccounts,
			fleetNames,
			fleetRentalStatus,
			fleets
		});
		const totalSigs = data.totalSignaturesFetched || 'N/A';
		const processedTxs = data.transactionCount24h || 0;
		const cacheMsg = fromCache ? ' (from cache)' : '';
		window.updateProgress(`Completed: ${processedTxs}/${totalSigs} transactions${cacheMsg}`);
		updateCacheTooltip(cacheHit, cacheTimestamp);
		const rentedFleetNames = new Set();
		try {
			fleets.forEach(f => {
				const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data.fleetShips]);
				if (isRented) rentedFleetNames.add(f.callsign);
			});
		} catch {}
		try {
			Object.entries(data.feesByFleet || {}).forEach(([name, entry]) => {
				const isRent = rentedFleetNames.has(String(name)) || rentedFleetNames.has(String(name).trim());
				if (isRent) { entry.isRented = true; }
			});
		} catch {}
		window.displayResults(data, fleetNames, rentedFleetNames);
		
		// Load detailed fleet breakdown for pie charts
		loadFleetBreakdown(profileId, uniqueFleetAccounts, fleetNames, fleetRentalStatus);
		const sidebar = document.getElementById('sidebar');
		const sidebarProfileId = document.getElementById('sidebarProfileId');
		const container = document.querySelector('.container');
		if (sidebar) {
			sidebar.style.display = 'flex';
			if (sidebarProfileId) { sidebarProfileId.textContent = profileId.substring(0, 6) + '...'; }
		}
		if (container) container.classList.add('with-sidebar');
	} catch (error) {
		console.error('Analysis error:', error);
		resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
	} finally {
		if (progressInterval) { clearInterval(progressInterval); setProgressInterval(null); }
		btn.disabled = false;
		btn.textContent = 'Analyze 24h';
	}
}

// Load detailed fleet breakdown and display operation pie charts for each fleet
async function loadFleetBreakdown(profileId: string, fleetAccounts: string[], fleetNames: { [account: string]: string }, fleetRentalStatus: { [account: string]: boolean }) {
	try {
		   console.log('Loading fleet breakdown...');
		   // Filtra fleetAccounts per rimuovere null e non-stringhe
		   const filteredFleetAccounts = Array.isArray(fleetAccounts)
			   ? fleetAccounts.filter(f => typeof f === 'string' && !!f)
			   : [];
		   const payload: FleetBreakdownRequest = {
			   profileId,
			   fleetAccounts: filteredFleetAccounts,
			   fleetNames,
			   fleetRentalStatus,
			   enableSubAccountMapping: false
		   };
		   console.log('Fleet breakdown payload:', payload);
		   try {
			   const breakdownData: FleetBreakdownResponse = await fetchJson<FleetBreakdownRequest, FleetBreakdownResponse>('/api/debug/fleet-breakdown', {
				   method: 'POST',
				   body: payload
			   });
			   console.log('Fleet breakdown loaded:', breakdownData);

			   // Add fleet operation charts to the UI
			   displayFleetOperationCharts(breakdownData.feesByFleet, fleetNames);
		   } catch (error) {
			   console.warn('Fleet breakdown endpoint not available', error);
			   return;
		   }
		
	} catch (error) {
		console.error('Error loading fleet breakdown:', error);
	}
}

// Display operation pie charts for each fleet
function displayFleetOperationCharts(feesByFleet: FeesByFleet, fleetNames: { [account: string]: string }) {
	const resultsDiv = document.getElementById('results');
	if (!resultsDiv) return;
	
	// Find the fleet list section
	const fleetListSection = resultsDiv.querySelector('.fleet-list-section');
	if (!fleetListSection) return;
	
	// Create a new section for fleet operation charts
	const chartsSection = document.createElement('div');
	chartsSection.className = 'fleet-charts-section';
	chartsSection.innerHTML = '<h2 class="section-title">Fleet Operation Breakdown</h2>';
	
	// For each fleet with operations data, create a pie chart
	Object.entries(feesByFleet).forEach(([fleetKey, fleetData]) => {
		if (!fleetData.operations || Object.keys(fleetData.operations).length === 0) return;
		
		const fleetName = fleetNames[fleetKey] || fleetKey;
		
		// Create chart container
		const chartContainer = document.createElement('div');
		chartContainer.className = 'fleet-chart-container';
		chartContainer.innerHTML = `
			<h3>${fleetName}</h3>
			<div style="display: flex; gap: 20px; align-items: center;">
				<canvas id="chart-${fleetKey}" width="200" height="200"></canvas>
				<div id="legend-${fleetKey}"></div>
			</div>
		`;
		
		chartsSection.appendChild(chartContainer);
		
		// Prepare data for pie chart with normalized operation names
		const normalizedOps = {};
		Object.entries(fleetData.operations || {}).forEach(([opType, opData]) => {
			const normName = normalizeOpName(opType);
			if (!normalizedOps[normName]) {
				normalizedOps[normName] = { count: 0 };
			}
			normalizedOps[normName].count += opData.count;
		});

		const operationData = Object.entries(normalizedOps).map(([opType, opData]) => ({
			label: opType,
			value: opData.count,
			color: getOperationColor(opType)
		}));
		
		// Draw the chart
		setTimeout(() => {
			const { drawPieChart } = window;
			if (drawPieChart) {
				drawPieChart(`chart-${fleetKey}`, `legend-${fleetKey}`, operationData, window.prices);
			}
		}, 100);
	});
	
	// Insert the charts section after the fleet list
	fleetListSection.parentNode.insertBefore(chartsSection, fleetListSection.nextSibling);
}

// Get color for operation type
function getOperationColor(opType: string) {
	const norm = (opType || '').toLowerCase();
	const colors = {
		'cargo': '#34d399',
		'dock/undock/load/unload': '#34d399',
		'subwarp': '#60a5fa', 
		'mining': '#f59e0b',
		'startminingasteroid': '#f59e0b',
		'crafting': '#a78bfa',
		'createcraftingprocess': '#a78bfa',
		'burncraftingconsumables': '#a78bfa',
		'staking': '#ec4899',
		'token': '#06b6d4',
		'system': '#8b5cf6',
		'compute': '#f97316',
		'memo': '#10b981'
	};
	return colors[norm] || '#9ca3af';
}

window.analyzeFees = analyzeFees;
