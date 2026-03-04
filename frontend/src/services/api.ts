// @ts-nocheck

// Implementazione reale spostata da app
import { normalizeOpName } from '@services/utils';
import type { FleetsRequest, FleetsResponse, WalletSageFeesStreamRequest, FleetBreakdownRequest, FleetBreakdownResponse, ApiError } from '@types/api';
import type { FeesByFleet } from '@types/operation-list';
import { updateCacheTooltip } from '@services/wipe_reload';
import { displayResults } from '../resultpage';
import { wallet } from './wallet';

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



import { setCurrentProfileId, setLastAnalysisParams, setAnalysisStartTime, setProgressInterval, progressInterval, currentProfileId, connectedWalletPublicKey } from '@utils/state';
import { updateProgress as updateProgressFunc } from '@ui/elements/loading';

export function processAnalysisData(data: any, walletPublicKey?: string | null) {
	const fleets = data.fleets || [];
	const walletPubkey = walletPublicKey || data.walletAuthority || data.feePayer || null;
	const fleetNames: { [account: string]: string } = {};
	const fleetIsRented: { [account: string]: boolean } = {};
	// Costruisci set di tutte le chiavi/callsign delle rentedFleets
	const rentedFleetKeys = new Set();
	if (Array.isArray(data.rentedFleets)) {
		data.rentedFleets.forEach(f => {
			if (typeof f === 'string') {
				rentedFleetKeys.add(f.trim());
			} else if (f && typeof f === 'object') {
				if (f.fleet) rentedFleetKeys.add(String(f.fleet).trim());
				if (f.fleet_ships) rentedFleetKeys.add(String(f.fleet_ships).trim());
				if (f.fleet_label) rentedFleetKeys.add(String(f.fleet_label).trim());
				if (f.callsign) rentedFleetKeys.add(String(f.callsign).trim());
			}
		});
	}
	fleets.forEach((f: any) => {
		if (f && f.data) {
			const callsign = f.callsign?.trim();
			const key = f.key?.trim();
			const fleetShips = f.data.fleetShips?.trim();
			let reason = [];
			if (f.isRented || rentedFleetKeys.has(callsign) || rentedFleetKeys.has(key) || rentedFleetKeys.has(fleetShips)) {
				f.isRented = true;
				reason.push('isRented:true');
				//console.log('trovata rented fleet:', { callsign, key, fleetShips, reason });
			}
			if (f.data.fleetShips) {
				fleetNames[f.data.fleetShips] = f.callsign;
				fleetIsRented[f.data.fleetShips] = f.isRented;
			}
			fleetNames[f.key] = f.callsign;
			fleetIsRented[f.key] = f.isRented;
			if (f.data.fuelTank) {
				fleetNames[f.data.fuelTank] = f.callsign;
				fleetIsRented[f.data.fuelTank] = f.isRented;
			}
			if (f.data.ammoBank) {
				fleetNames[f.data.ammoBank] = f.callsign;
				fleetIsRented[f.data.ammoBank] = f.isRented;
			}
			if (f.data.cargoHold) {
				fleetNames[f.data.cargoHold] = f.callsign;
				fleetIsRented[f.data.cargoHold] = f.isRented;
			}
		}
	});
	return {
		fleets,
		walletPubkey,
		fleetNames,
		fleetIsRented
	};
}


export async function analyzeFees(profileId: string, wipeCache: boolean = false) {
    const buttonsContainer = document.getElementById('buttons-container') as HTMLDivElement | null;
    const btn = buttonsContainer?.querySelector('#analyzeBtn') as HTMLButtonElement | null;
    const resultsDiv = document.getElementById('results') as HTMLDivElement | null;

    // Validazione semplice
    if (!profileId) {
        alert('Inserisci un Player Profile ID!');
		console.warn('[analyzeFees] profileId missing, aborting');
		return;
    }

    //console.log(`[analyzeFees] Analisi avviata per: ${profileId} (wipeCache: ${wipeCache})`);

	setCurrentProfileId(profileId);
	//console.log('[analyzeFees] currentProfileId dopo set:', currentProfileId);
	const formBox = document.querySelector('.form-box');
	if (formBox) formBox.classList.add('is-hidden');
	if (btn) {
		btn.disabled = true;
		btn.textContent = 'Loading...';
	}

	//console.log('[analyzeFees] About to call updateProgress()');
	try {
		updateProgressFunc();
		//console.log('[analyzeFees] updateProgress() completed successfully');
	} catch (error) {
		console.error('[analyzeFees] Error in updateProgress():', error);
	}

	try {
		let data;
		let cacheHit: string | null = null;
		let cacheTimestamp: string | null = null;
		//console.log('[analyzeFees] About to fetch /api/analyze-profile');
		try {
			const walletPubkey = wallet.publicKey?.toString() || null;
			const response = await fetch('/api/analyze-profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId, wipeCache, walletPubkey })
			});
			cacheHit = response.headers.get('X-Cache-Hit');
			cacheTimestamp = response.headers.get('X-Cache-Timestamp');
			if (!response.ok) {
				throw new Error('analyze-profile request failed: ' + response.statusText);
			}
			data = await response.json();
			//console.log('[analyzeFees] Fetch successful, data:', data);
		} catch (error) {
			throw new Error('analyze-profile request failed: ' + (error.message || error));
		}
		//console.log('[analyzeFees] About to process data');
		const walletPublicKeyString = connectedWalletPublicKey || wallet.publicKey?.toString() || null;
		const processed = processAnalysisData(data, walletPublicKeyString);
		//console.log('Data processed for display:', processed);
		//console.log('[analyzeFees] About to call setLastAnalysisParams');
		setLastAnalysisParams({
			//walletPubkey: processed.walletPubkey,
			fleetNames: processed.fleetNames,
			fleetIsRented: processed.fleetIsRented,
			fleets: processed.fleets
		});
		//console.log('[analyzeFees] setLastAnalysisParams completed');
		const totalSigs = data.totalSignaturesFetched || 'N/A';
		const processedTxs = data.transactionCount24h || 0;
		const cacheMsg = data.fromCache ? ' (from cache)' : '';
		if (!data.feesByFleet || typeof data.feesByFleet !== 'object') {
			data.feesByFleet = {};
		}
		//console.log('[analyzeFees] About to call displayResults');
		// Passa direttamente la mappa fleetIsRented e lascia che la UI usi solo il campo isRented del backend
		displayResults(data, processed.fleetNames, processed.fleetIsRented, processed.fleets);
		//console.log('[analyzeFees] displayResults completed');
		//console.log('[analyzeFees] About to call updateCacheTooltip');
		updateCacheTooltip(cacheHit, cacheTimestamp);
		//console.log('[analyzeFees] updateCacheTooltip completed');
		try {
			const profileIconEnd = document.getElementById('profileIcon');
			if (profileIconEnd) { profileIconEnd.textContent = '👤'; profileIconEnd.title = ''; }
		} catch (_) { }
		if (data && data.breakdown && data.breakdown.feesByFleet && typeof data.breakdown.feesByFleet === 'object') {
			//console.log('[analyzeFees] About to call displayFleetOperationCharts');
			//displayFleetOperationCharts(data.breakdown.feesByFleet, processed.fleetNames);
			//console.log('[analyzeFees] displayFleetOperationCharts completed');
			const sidebar = document.getElementById('sidebar');
			if (sidebar) sidebar.classList.remove('is-hidden');
		} else {
			console.error('[analyzeFees] Data validation failed, missing breakdown:', data);
			const resultsDiv = document.getElementById('results');
			if (resultsDiv) resultsDiv.innerHTML = `<div class="error">Error: ${data}</div>`;
		}
	} catch (error) {
		console.error('[analyzeFees] Caught error:', error);
		const resultsDiv = document.getElementById('results');
		if (resultsDiv) resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
	} finally {
		//console.log('[analyzeFees] Entering finally block');
		if (progressInterval) { clearInterval(progressInterval); setProgressInterval(null); }
		if (btn) {
			btn.disabled = false;
			btn.textContent = 'Analyze 24h';
		}
		//console.log('[analyzeFees] Function completed');
	}
}

// Display operation pie charts for each fleet
/*function displayFleetOperationCharts(feesByFleet: FeesByFleet, fleetNames: { [account: string]: string }) {
	const resultsDiv = document.getElementById('results');
	if (!resultsDiv) {
		console.error('[displayFleetOperationCharts] CRITICAL: #results element not found - charts aborted');
		return;
	}

	// Find the fleet list section
	const fleetListSection = resultsDiv.querySelector('.fleet-list-section');
	if (!fleetListSection) {
		console.error('[displayFleetOperationCharts] CRITICAL: .fleet-list-section not found - charts aborted');
		return;
	}

	// Create a new section for fleet operation charts
	const chartsSection = document.createElement('div');
	chartsSection.className = 'fleet-charts-section';
	chartsSection.innerHTML = '<h2 class="section-title">Fleet Operation Breakdown</h2>';

	// For each fleet with operations data, create a pie chart
	Object.entries(feesByFleet).forEach(([fleetKey, fleetData]) => {
		if (!fleetData.operations || Object.keys(fleetData.operations).length === 0) {
			console.warn('[displayFleetOperationCharts] Skipping fleet %s - no operations', fleetKey);
			return;
		}

		const fleetName = fleetNames[fleetKey] || fleetKey;

		// Create chart container
		const chartContainer = document.createElement('div');
		chartContainer.className = 'fleet-chart-container';
		chartContainer.innerHTML = `
			<h3>${fleetName}</h3>
			<div class="fleet-chart-row">
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
}*/

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

// Show a simple pending UI for breakdown without making extra network calls
export function showBreakdownPending() {
	const resultsDiv = document.getElementById('results');
	if (!resultsDiv) {
		console.error('[showBreakdownPending] CRITICAL: #results element not found - pending message aborted');
		return;
	}
	// remove previous pending marker
	const existing = resultsDiv.querySelector('.breakdown-pending');
	if (existing) existing.remove();
	const pending = document.createElement('div');
	pending.className = 'breakdown-pending';
	pending.innerHTML = `<div class="loading"><span>(Breakdown pending — waiting for full playload)</span></div>`;
	resultsDiv.prepend(pending);
}


