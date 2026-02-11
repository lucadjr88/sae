// @ts-nocheck

// Implementazione reale spostata da app
import { normalizeOpName } from '@utils/utils';
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
		const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');
		const cacheWipeBtn = document.getElementById('cacheWipeBtn');
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
		const updateBtn = document.getElementById('cacheUpdateBtn');
		const wipeBtn = document.getElementById('cacheWipeBtn');
		if (updateBtn) { updateBtn.disabled = false; }
		if (wipeBtn) { wipeBtn.disabled = false; }
	}
}

import { setCurrentProfileId, setLastAnalysisParams, setAnalysisStartTime, setProgressInterval, progressInterval } from '@utils/state';

export function processAnalysisData(data: any) {
	const fleets = data.fleets || [];
	const walletPubkey = data.walletAuthority || data.feePayer || null;
	const allFleetAccounts: string[] = [];
	const fleetNames: { [account: string]: string } = {};
	const fleetRentalStatus: { [account: string]: boolean } = {};
	fleets.forEach((f: any) => {
		if (f && f.data) {
			if (f.data.fleetShips) allFleetAccounts.push(f.data.fleetShips);
			if (f.key) allFleetAccounts.push(f.key);
			if (f.data.fuelTank) allFleetAccounts.push(f.data.fuelTank);
			if (f.data.ammoBank) allFleetAccounts.push(f.data.ammoBank);
			if (f.data.cargoHold) allFleetAccounts.push(f.data.cargoHold);
			fleetNames[f.data.fleetShips] = f.callsign;
			fleetNames[f.key] = f.callsign;
			if (f.data.fuelTank) fleetNames[f.data.fuelTank] = f.callsign;
			if (f.data.ammoBank) fleetNames[f.data.ammoBank] = f.callsign;
			if (f.data.cargoHold) fleetNames[f.data.cargoHold] = f.callsign;
			const initialRented = !!f.isRented;
			if (f.data.fleetShips) fleetRentalStatus[f.data.fleetShips] = initialRented;
			if (f.key) fleetRentalStatus[f.key] = initialRented;
			if (f.data.fuelTank) fleetRentalStatus[f.data.fuelTank] = initialRented;
			if (f.data.ammoBank) fleetRentalStatus[f.data.ammoBank] = initialRented;
			if (f.data.cargoHold) fleetRentalStatus[f.data.cargoHold] = initialRented;
		}
	});
	const uniqueFleetAccounts = [...new Set(allFleetAccounts)];
	const rentedFleetNames = new Set();
	try {
		fleets.forEach(f => {
			const isRented = !!(fleetRentalStatus[f.key] || fleetRentalStatus[f.data?.fleetShips]);
			if (isRented) rentedFleetNames.add(f.callsign);
		});
	} catch {}
	return {
		fleets,
		walletPubkey,
		uniqueFleetAccounts,
		fleetNames,
		fleetRentalStatus,
		rentedFleetNames
	};
}

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
		// Call the project's main analyze endpoint directly with profileId.
		// The backend will derive wallet/fleets and produce the full playload.
		window.updateProgress('Analyzing profile (this may take a while)...');
		let data;
		let cacheHit: string | null = null;
		let cacheTimestamp: string | null = null;
		try {
			const response = await fetch('/api/analyze-profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileId })
			});
			cacheHit = response.headers.get('X-Cache-Hit');
			cacheTimestamp = response.headers.get('X-Cache-Timestamp');
			if (!response.ok) {
				throw new Error('analyze-profile request failed: ' + response.statusText);
			}
			data = await response.json();
		} catch (error) {
			throw new Error('analyze-profile request failed: ' + (error.message || error));
		}
		const processed = processAnalysisData(data);
		window.updateProgress(`Analyzed ${processed.fleets.length} fleets`);
		setLastAnalysisParams({
			walletPubkey: processed.walletPubkey,
			fleetAccounts: processed.uniqueFleetAccounts,
			fleetNames: processed.fleetNames,
			fleetRentalStatus: processed.fleetRentalStatus,
			fleets: processed.fleets
		});
		const totalSigs = data.totalSignaturesFetched || 'N/A';
		const processedTxs = data.transactionCount24h || 0;
		const cacheMsg = data.fromCache ? ' (from cache)' : '';
		window.updateProgress(`Completed: ${processedTxs}/${totalSigs} transactions${cacheMsg}`);
		updateCacheTooltip(cacheHit, cacheTimestamp);
		try {
			const profileIconEnd = document.getElementById('profileIcon');
			if (profileIconEnd) { profileIconEnd.textContent = '👤'; profileIconEnd.title = ''; }
		} catch (_) {}
		try {
			Object.entries(data.feesByFleet || {}).forEach(([name, entry]) => {
				const isRent = processed.rentedFleetNames.has(String(name)) || processed.rentedFleetNames.has(String(name).trim());
				if (isRent) { entry.isRented = true; }
			});
		} catch {}
		if (!data.feesByFleet || typeof data.feesByFleet !== 'object') {
			data.feesByFleet = {};
		}
		window.displayResults(data, processed.fleetNames, processed.rentedFleetNames, processed.fleets);
		if (data && data.breakdown && data.breakdown.feesByFleet && typeof data.breakdown.feesByFleet === 'object') {
			displayFleetOperationCharts(data.breakdown.feesByFleet, processed.fleetNames);
		} else if (data && data.breakdown_pending) {
			showBreakdownPending();
		} else {
			// Do not perform any additional backend calls — the frontend must wait
			// for the playload returned by the initial POST /api/analyze-profile.
			// Show pending breakdown state instead of triggering other endpoints.
			showBreakdownPending();
		}
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
async function loadFleetBreakdown(profileId: string, walletPubkey: string, fleetAccounts: string[], fleetNames: { [account: string]: string }, fleetRentalStatus: { [account: string]: boolean }) {
  // Disabled: prevent any network calls after the user pressed Analyze.
  // The frontend must wait for the playload returned by the original POST /api/analyze-profile.
  console.log('loadFleetBreakdown skipped: avoiding additional backend calls.');
  return;
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

window.analyzeFees = analyzeFees;

