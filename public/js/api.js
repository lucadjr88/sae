

// Implementazione reale spostata da app.js
export function updateCacheTooltip(cacheHit, cacheTimestamp) {
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

import { setCurrentProfileId, setLastAnalysisParams, setAnalysisStartTime, setProgressInterval, progressInterval } from './state.js';

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
		const fleetsResponse = await fetch('/api/fleets', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ profileId })
		});
		if (!fleetsResponse.ok) throw new Error('Failed to fetch fleets');
		const fleetsData = await fleetsResponse.json();
		if (!fleetsData.walletAuthority) throw new Error('Could not derive wallet from fleet transactions');
		const walletPubkey = fleetsData.walletAuthority;
		const fleets = fleetsData.fleets;
		window.updateProgress(`Found ${fleets.length} fleets, deriving wallet...`);
		const allFleetAccounts = [];
		const fleetNames = {};
		const fleetRentalStatus = {};
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
		const response = await fetch('/api/wallet-sage-fees-stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ 
				walletPubkey, 
				fleetAccounts: uniqueFleetAccounts,
				fleetNames: fleetNames,
				fleetRentalStatus: fleetRentalStatus,
				hours: 24 
			})
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
			walletPubkey,
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

window.analyzeFees = analyzeFees;
