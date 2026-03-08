
import { analyzeFees } from '@services/api';
import { createLoadingElement } from '@ui/elements/loading';

export function updateCacheTooltip(cacheHit: string | null, cacheTimestamp: string | null) {
    //console.log('[updateCacheTooltip] called with cacheHit:', cacheHit, 'cacheTimestamp:', cacheTimestamp);
    const profileIcon = document.getElementById('profileIcon');
    const cacheTooltip = document.getElementById('cacheTooltip');
    //console.log('[updateCacheTooltip] profileIcon:', !!profileIcon, 'cacheTooltip:', !!cacheTooltip);
    if (cacheTooltip) cacheTooltip.classList.remove('is-hidden');
    const cacheTooltipIcon = document.getElementById('cacheTooltipIcon');
    const cacheTooltipTitle = document.getElementById('cacheTooltipTitle');
    const cacheTooltipStatus = document.getElementById('cacheTooltipStatus');
    const cacheTooltipAge = document.getElementById('cacheTooltipAge');
    /*console.log('[updateCacheTooltip] elements found:', {
        icon: !!cacheTooltipIcon,
        title: !!cacheTooltipTitle,
        status: !!cacheTooltipStatus,
        age: !!cacheTooltipAge
    });*/

    if (!profileIcon || !cacheTooltip || !cacheTooltipIcon || !cacheTooltipTitle || !cacheTooltipStatus || !cacheTooltipAge) {
        console.error('[updateCacheTooltip] missing elements, aborting');
        return;
    }

    profileIcon.classList.remove('cache-fresh', 'cache-stale');
    profileIcon.title = '';
    let hideTimeout: number | null = null;
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
        const parsedTimestamp = Number.parseInt(cacheTimestamp, 10);
        if (Number.isNaN(parsedTimestamp)) {
            console.warn('[updateCacheTooltip] cacheTimestamp parsing failed');
            return;
        }

        const cacheAge = Date.now() - parsedTimestamp;
        const sixHoursMs = 6 * 60 * 60 * 1000;
        const ageMinutes = cacheAge / 60000;
        const ageHours = cacheAge / 3600000;
        if (cacheAge < sixHoursMs) {
            profileIcon.classList.add('cache-fresh');
            cacheTooltipIcon.textContent = cacheHit === 'disk' ? '✅' : '✨';
            cacheTooltipTitle.textContent = cacheHit === 'disk' ? 'Cache Fresh' : 'Fresh Data';
            cacheTooltipStatus.textContent = cacheHit === 'disk' ? 'Data loaded from cache' : 'Just fetched from API';
            cacheTooltipAge.textContent = ageHours < 1 ? `Age: ${ageMinutes.toFixed(1)} minutes` : `Age: ${ageHours.toFixed(1)} hours`;
        } else {
            profileIcon.classList.add('cache-stale');
            cacheTooltipIcon.textContent = '⚠️';
            cacheTooltipTitle.textContent = 'Cache Stale';
            cacheTooltipStatus.textContent = 'Cache is older than 6 hours';
            cacheTooltipAge.textContent = `Age: ${ageHours.toFixed(1)} hours`;
        }
    } else {
        profileIcon.classList.add('cache-fresh');
        cacheTooltipIcon.textContent = '✨';
        cacheTooltipTitle.textContent = 'Fresh Data';
        cacheTooltipStatus.textContent = 'Just fetched from API';
        cacheTooltipAge.textContent = 'No cached data';
    }

}

// chiamata da addEventListener del bottone "Wipe Cache" on sideBar.ts, che a sua volta chiama analyzeFees con forceReload=true, forzando il backend a bypassare la cache e aggiornare i dati, e poi aggiorna il tooltip della cache di conseguenza
export function wipeAndReload(profileId?: string): void {
    console.log('[wipeAndReload] called with profileId:', profileId);
    const resultsContainer = document.getElementById('results') as HTMLDivElement | null;
    if (!resultsContainer) {
        console.error('[wipeAndReload] resultsContainer not found');
        return;
    }
    console.log('[wipeAndReload] Initiating wipe and reload process');
    resultsContainer .innerHTML = ''; // Clear previous results
    const loading = createLoadingElement('Processing transaction data, this may take up to 5 minutes depending on your tx/day...<br>Analyzing profile (this may take a while)...');
    resultsContainer.appendChild(loading);
    console.log('[manualProfileEntryListener] Calling analyzeFees with profileId:', profileId);
    analyzeFees(profileId, true);
    const cacheTooltip = document.getElementById('cacheTooltip');
    cacheTooltip.onmouseleave = () => { cacheTooltip.classList.remove('visible'); };
}