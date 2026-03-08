// @ts-nocheck

// Implementazione reale spostata da app
import { normalizeOpName } from '@services/utils';
import { updateProgress } from '@ui/elements/loading';
import { displayResults } from '../resultpage';
import type { FleetsRequest, FleetsResponse, WalletSageFeesStreamRequest, FleetBreakdownRequest, FleetBreakdownResponse, ApiError } from '@types/api';
import type { FeesByFleet } from '@types/operation-list';

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
	// Ensure any inline display:none set by hideCacheTooltipAndSidebar is cleared
	if (cacheTooltip) cacheTooltip.style.display = '';
	const cacheTooltipIcon = document.getElementById('cacheTooltipIcon');
	const cacheTooltipTitle = document.getElementById('cacheTooltipTitle');
	const cacheTooltipStatus = document.getElementById('cacheTooltipStatus');
	const cacheTooltipAge = document.getElementById('cacheTooltipAge');
	if (profileIcon && cacheTooltip) {
		// ensure no stale status classes remain before applying new state
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

		if (cacheTimestamp) {
			const cacheAge = Date.now() - parseInt(cacheTimestamp);
			const sixHoursMs = 6 * 60 * 60 * 1000;
			const ageMinutes = (cacheAge / 60000).toFixed(1);
			const ageHours = (cacheAge / 3600000).toFixed(1);
			if (cacheAge < sixHoursMs) {
				// recent data -> green background
				profileIcon.classList.add('cache-fresh');
				cacheTooltipIcon.textContent = cacheHit === 'disk' ? '✅' : '✨';
				cacheTooltipTitle.textContent = cacheHit === 'disk' ? 'Cache Fresh' : 'Fresh Data';
				cacheTooltipStatus.textContent = cacheHit === 'disk' ? 'Data loaded from cache' : 'Just fetched from API';
				cacheTooltipAge.textContent = ageHours < 1 ? `Age: ${ageMinutes} minutes` : `Age: ${ageHours} hours`;
			} else {
				// stale data -> red background
				profileIcon.classList.add('cache-stale');
				cacheTooltipIcon.textContent = '⚠️';
				cacheTooltipTitle.textContent = 'Cache Stale';
				cacheTooltipStatus.textContent = 'Cache is older than 6 hours';
				cacheTooltipAge.textContent = `Age: ${ageHours} hours`;
			}
		} else {
			// no timestamp -> treat as fresh (green)
			profileIcon.classList.add('cache-fresh');
			cacheTooltipIcon.textContent = '✨';
			cacheTooltipTitle.textContent = 'Fresh Data';
			cacheTooltipStatus.textContent = 'Just fetched from API';
			cacheTooltipAge.textContent = 'No cached data';
		}
	}
}

import { setCurrentProfileId, setLastAnalysisParams, setAnalysisStartTime, setProgressInterval, progressInterval, currentProfileId } from '@utils/state';

export function processAnalysisData(data: any) {
	const fleets = data.fleets || [];
	const walletPubkey = data.walletAuthority || data.feePayer || null;
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
				console.log('trovata rented fleet:', { callsign, key, fleetShips, reason });
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


export async function analyzeFees(profileIdParam?: string, wipeCache: boolean = false) {
	// Unificata: profileIdParam può essere string o boolean (per wipeCache, default false). Se è boolean, è wipeCache e profileId viene preso da currentProfileId. Se è string, è profileId e wipeCache viene da argomento 2 o default false.
	let profileId = typeof profileIdParam === 'string' ? profileIdParam : undefined;
	//let wipeCache = false;
	if (typeof profileIdParam === 'boolean') {
		wipeCache = profileIdParam;
		profileId = currentProfileId;
	}
	if (typeof arguments[1] === 'boolean') {
		wipeCache = arguments[1];
	}
	const buttonsContainer = document.getElementById('buttons-container') as HTMLDivElement | null;
	const btn = buttonsContainer?.querySelector('#analyzeBtn') as HTMLButtonElement | null;
	console.log('[analyzeFees] called with profileIdParam:', profileIdParam);
	if (!profileId) {
		const input = buttonsContainer?.querySelector('#profileId') as HTMLInputElement | null;
		profileId = input?.value?.trim() || '';
	}
	if (!profileId) {
		alert('Inserisci un Player Profile ID!');
		console.warn('[analyzeFees] profileId missing, aborting');
		return;
	}
	setCurrentProfileId(profileId);
	console.log('[analyzeFees] currentProfileId dopo set:', currentProfileId);
	const formBox = document.querySelector('.form-box');
	if (formBox) formBox.style.display = 'none';
	if (btn) {
		btn.disabled = true;
		btn.textContent = 'Loading...';
	}

	console.log('[analyzeFees] About to call updateProgress()');
	try {
		updateProgress();
		console.log('[analyzeFees] updateProgress() completed successfully');
	} catch (error) {
		console.error('[analyzeFees] Error in updateProgress():', error);
	}

	try {
		let data;
		let cacheHit: string | null = null;
		let cacheTimestamp: string | null = null;
		console.log('[analyzeFees] About to fetch /api/analyze-profile');
		try {
			const response = await fetch('/api/analyze-profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId, wipeCache })
			});
			cacheHit = response.headers.get('X-Cache-Hit');
			cacheTimestamp = response.headers.get('X-Cache-Timestamp');
			if (!response.ok) {
				throw new Error('analyze-profile request failed: ' + response.statusText);
			}
			data = await response.json();
			console.log('[analyzeFees] Fetch successful, data:', data);
		} catch (error) {
			throw new Error('analyze-profile request failed: ' + (error.message || error));
		}
		console.log('[analyzeFees] About to process data');
		const processed = processAnalysisData(data);
		console.log('Data processed for display:', processed);
		//window.updateProgress(`Analyzed ${processed.fleets.length} fleets`);
		setLastAnalysisParams({
			walletPubkey: processed.walletPubkey,
			fleetNames: processed.fleetNames,
			fleetIsRented: processed.fleetIsRented,
			fleets: processed.fleets
		});
		const totalSigs = data.totalSignaturesFetched || 'N/A';
		const processedTxs = data.transactionCount24h || 0;
		const cacheMsg = data.fromCache ? ' (from cache)' : '';
		//window.updateProgress(`Completed: ${processedTxs}/${totalSigs} transactions${cacheMsg}`);
		
		try {
			const profileIconEnd = document.getElementById('profileIcon');
			if (profileIconEnd) { profileIconEnd.textContent = '👤'; profileIconEnd.title = ''; }
		} catch (_) { }
		if (!data.feesByFleet || typeof data.feesByFleet !== 'object') {
			data.feesByFleet = {};
		}
		// Passa direttamente la mappa fleetIsRented e lascia che la UI usi solo il campo isRented del backend
		displayResults(data, processed.fleetNames, processed.fleetIsRented, processed.fleets);
		if (data && data.breakdown && data.breakdown.feesByFleet && typeof data.breakdown.feesByFleet === 'object') {
			displayFleetOperationCharts(data.breakdown.feesByFleet, processed.fleetNames);
			const sidebar = document.getElementById('sidebar');
			if (sidebar) sidebar.style.display = '';
		} else {
			console.error('Data error:', data);
			const resultsDiv = document.getElementById('results') as HTMLDivElement | null;
			if (resultsDiv) {
				resultsDiv.innerHTML = `<div class="error">Error: ${data}</div>`;
			}
		}
		updateCacheTooltip(cacheHit, cacheTimestamp);
	} catch (error) {
		console.error('Analysis error:', error);
		const resultsDiv = document.getElementById('results') as HTMLDivElement | null;
		if (resultsDiv) {
			resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
		}
	} finally {
		if (progressInterval) { clearInterval(progressInterval); setProgressInterval(null); }
		if (btn) {
			btn.disabled = false;
			btn.textContent = 'Analyze 24h';
		}
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

// Show a simple pending UI for breakdown without making extra network calls
export function showBreakdownPending() {
	const resultsDiv = document.getElementById('results');
	if (!resultsDiv) return;
	// remove previous pending marker
	const existing = resultsDiv.querySelector('.breakdown-pending');
	if (existing) existing.remove();
	const pending = document.createElement('div');
	pending.className = 'breakdown-pending';
	pending.innerHTML = `<div class="loading"><span>(Breakdown pending — waiting for full playload)</span></div>`;
	resultsDiv.prepend(pending);
}


