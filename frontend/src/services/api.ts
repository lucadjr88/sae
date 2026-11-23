// @ts-nocheck

// Implementazione reale spostata da ap
import { normalizeOpName } from '@/utils/utils';
import { setLoadingBackgroundState, updateProgress } from '@/ui/elements/loading';
import { displayFeeResults } from '@/ui/elements/fees_playload';
import { displayResourceResults } from '@/ui/elements/resource_playload';
import { fetchAndDisplayRentals } from '@/ui/elements/rental_playload';
import { setCachedSduView, setRentalLoader } from '@/ui/elements/toggleSwitch';
import type { FleetsRequest, FleetsResponse, WalletSageFeesStreamRequest, FleetBreakdownRequest, FleetBreakdownResponse, ApiError } from '@/types/api';
import type { FeesByFleet } from '@/types/operation-list';
import { initializeToggleSwitch } from '@/ui/elements/toggleSwitch';
import { rentalState_playload } from '@/ui/elements/rentalState_playload';
import { createSduProgramView } from '@/ui/elements/sduProgram_playload';
import { startHideTimer } from '@/ui/elements/sideBar';
import { applyProfileFactionIcon, getCachedProfileFaction, saveProfileFactionToCache } from '@/utils/faction';
import { connectedWalletPublicKey } from '@/utils/state';
import { saveProfileIdToCache } from '@/hompage';
import { fetchProfileAnalysis } from '@/services/analysis-api';
import { processAnalysisData } from '@/services/analysis-data';

export { processAnalysisData } from '@/services/analysis-data';

export let data: any = null; // Variabile globale per condividere i dati con rentalState_playload

async function fetchJson<Req, Res>(url: string, init: RequestInit & { body?: Req }): Promise<Res> {
	const headers = { 'Content-Type': 'application/json', ...init.headers };
	const body = init.body ? JSON.stringify(init.body) : undefined;
	try {
		const response = await fetch(url, { ...init, headers, body });
		if (!response.ok) {
			throw { type: 'http' as const, status: response.status, message: response.statusText };
		}
		 data = await response.json();
		// Aggiorniamo la variabile globale con i dati ricevuti

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

import { setCurrentProfileId, setLastAnalysisParams, setAnalysisStartTime, setProgressInterval, progressInterval, currentProfileId } from '@/utils/state';

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
		setLoadingBackgroundState(false);
		//alert('Inserisci un Player Profile ID!');
		console.warn('[analyzeFees] profileId missing, aborting');
		return;
	}
	setCurrentProfileId(profileId);
	console.log('[analyzeFees] currentProfileId dopo set:', currentProfileId);
	applyProfileFactionIcon(document.getElementById('profileIcon'), getCachedProfileFaction(profileId));
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
		console.log('[analyzeFees] Error in updateProgress():', error);
	}

	try {
		let data;
		let cacheHit: string | null = null;
		let cacheTimestamp: string | null = null;
		console.log('[analyzeFees] About to fetch /api/analyze-profile');
		try {
			({ data, cacheHit, cacheTimestamp } = await fetchProfileAnalysis({
				profileId, wipeCache, walletPubKey: connectedWalletPublicKey,
			}));
			if (data && data.profileId) {
				profileId = data.profileId;
				setCurrentProfileId(profileId);
				saveProfileIdToCache(profileId);
			}
			console.log('[analyzeFees] Fetch successful, data:', data);
		} catch (error) {
			throw new Error('analyze-profile request failed: ' + (error.message || error));
		}
		console.log('[analyzeFees] About to process data');
		// Patch minima: aggiungi profileId al payload per la logica di fleetStatus
		if (profileId) data.profileId = profileId;
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
			const resolvedFaction = saveProfileFactionToCache(profileId, data?.profileFaction ?? data?.profileFactionId)
				?? getCachedProfileFaction(profileId);
			applyProfileFactionIcon(profileIconEnd, resolvedFaction);
		} catch (_) { }
		if (!data.feesByFleet || typeof data.feesByFleet !== 'object') {
			data.feesByFleet = {};
		}
		// Passa direttamente la mappa fleetIsRented e lascia che la UI usi solo il campo isRented del backend
		displayFeeResults(data, processed.fleetNames, processed.fleetIsRented, processed.fleets);
		displayResourceResults(data);
		//setRentalLoader(fetchAndDisplayRentals);
		rentalState_playload(data);
		const sduFleetIds = Array.from(new Set(
			(processed.fleets || [])
				.map((fleet: any) => (fleet?.key || fleet?.data?.fleetShips || '').trim())
				.filter((fleetId: string) => !!fleetId)
		));
		setCachedSduView(createSduProgramView({ fleetIds: sduFleetIds, days: 10 }));

		if (data && data.feesByFleet && typeof data.feesByFleet === 'object') {
			displayFleetOperationCharts(data.feesByFleet, processed.fleetNames);
			const sidebar = document.getElementById('sidebar');
			if (sidebar) sidebar.style.display = '';
		} else {
			console.log('Data error:', data);
			const resultsDiv = document.getElementById('results') as HTMLDivElement | null;
			if (resultsDiv) {
				resultsDiv.innerHTML = `<div class="error">Error: ${data}</div>`;
			}
		}
		updateCacheTooltip(cacheHit, cacheTimestamp);
	} catch (error) {
		console.log('Analysis error:', error);
		const resultsDiv = document.getElementById('results') as HTMLDivElement | null;
		if (resultsDiv) {
			resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
		}
	} finally {
		if (progressInterval) { clearInterval(progressInterval); setProgressInterval(null); }
		setLoadingBackgroundState(false);
		if (btn) {
			btn.disabled = false;
			btn.textContent = 'Analyze 24h';
		}

		// Initialize toggle switch (only once)
		initializeToggleSwitch();

		startHideTimer();
		//console.log('[displayFeeResults] Results displayed successfully');
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
