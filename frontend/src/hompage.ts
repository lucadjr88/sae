
import '@/style.css';
import '@/ui/styles/heroTitle_elements.css';
import '@/ui/styles/startButtons.css';
import '@/ui/styles/privacyPolicy.css';
import '@/ui/styles/footBar.css';
import '@/ui/styles/alertInstructions.css';
import '@/ui/styles/manualLogin.css';
import '@/ui/styles/loading.css';
import '@/ui/styles/sideBar.css';
import '@/ui/styles/resultsComponent.css';
import '@/ui/styles/backGround.css';

import { createHeroTitle } from '@/ui/elements/heroTitle_elements';
import { createStartButtonsElement } from '@/ui/elements/startButtons';
import { createPrivacyPolicyStartElement } from '@/ui/elements/privacyPolicy';
import { createFootBarElement } from '@/ui/elements/footBar';
import { createBackground } from '@/ui/elements/backGround';
import { connectedWalletIcon } from '@/utils/state';
import { applyProfileFactionIcon, getCachedProfileFaction, normalizeProfileFaction, renderProfileFactionIconMarkup, saveProfileFactionToCache } from '@/utils/faction';
import defaultWalletIcon from '@/assets/icons/seedvault2.png';

import { createLoadingElement, setLoadingBackgroundState } from '@/ui/elements/loading';
import { analyzeFees } from '@/services/api';
import { createManualLoginElement } from '@/ui/elements/manualLogin';

import personaggio2 from '@/assets/personaggio2.png';
import personaggio3 from '@/assets/personaggio3.png';

export function createHomePage(): void {
  const mainContainer = document.querySelector<HTMLDivElement>('#mainContainer')!;

  mainContainer.innerHTML = ''; // Clear previous content

  const backgroundDiv = document.createElement('div');
  backgroundDiv.id = 'background-container';
  backgroundDiv.appendChild(createBackground());
  mainContainer.appendChild(backgroundDiv);

  const heroDiv = document.createElement('div');
  heroDiv.id = 'hero-container';
  heroDiv.appendChild(createHeroTitle());

  const startDiv = document.createElement('div');
  startDiv.id = 'buttons-container';
  if (!(window as any).skipWalletPage) {
    startDiv.appendChild(createStartButtonsElement());
  }

  const privacyDiv = document.createElement('div');
  privacyDiv.id = 'privacy-container';
  privacyDiv.appendChild(createPrivacyPolicyStartElement());

  const priceTickerBar = document.createElement('div');
  priceTickerBar.id = 'price-ticker-container';
  priceTickerBar.appendChild(createFootBarElement());

  // Aggiungiamo il personaggio in basso a destra
  const character2 = document.createElement('img');
  character2.src = personaggio2;
  character2.className = 'character2';
  character2.alt = 'Star Atlas Character';
  mainContainer.appendChild(character2);

  // Aggiungiamo il personaggio in basso a destra
  const character3 = document.createElement('img');
  character3.src = personaggio3;
  character3.className = 'character3';
  character3.alt = 'Star Atlas Character';
  mainContainer.appendChild(character3);

  mainContainer.appendChild(heroDiv);
  mainContainer.appendChild(startDiv);
  mainContainer.appendChild(privacyDiv);
  mainContainer.appendChild(priceTickerBar);
}

export function getWalletIcon(wallet: any): string {

  // Gestione compatibilità mobile/desktop
  let name = "";
  let icon = undefined;
  if (wallet.adapter) {
    name = (wallet.adapter.name || wallet.name || "").toLowerCase();
    icon = wallet.adapter.icon || wallet.icon;
  } else {
    // Mobile: wallet non ha adapter, solo icon opzionale
    name = (wallet.name || "mobile").toLowerCase();
    icon = wallet.icon;
  }
  console.log('[DEBUG WALLET]', { name, icon, wallet });
  /*if (name.includes("solflare")) return "https://www.solflare.com/wp-content/uploads/2024/11/App-Icon.svg";
  if (name.includes("phantom")) return "https://mintcdn.com/phantom-e50e2e68/fkWrmnMWhjoXSGZ9/resources/images/Phantom_SVG_Icon.svg?w=1100&fit=max&auto=format&n=fkWrmnMWhjoXSGZ9&q=85&s=d9602893116f9314145e2a303d675ccc";
  if (name.includes("backpack")) return "https://lh3.googleusercontent.com/YQnjQjJ6NuY_rxRwy8JA177ONpmPiOdFpud8zK-ebcS8-r3mQzwrzmqlueLSvKw1SsaoeBYua7XePZ632xXM4aHUzw=s60";
  if (name.includes("jupiter")) return "https://cryptologos.cc/logos/jupiter-ag-jup-logo.png?v=040";
  */// Mobile: usa icona se presente
  if (icon) return icon;
  return defaultWalletIcon;
}



export async function getWalletConnection(wallet: any, profileData?: any, showWalletHeader = true) {

  const buttonsContainer = document.getElementById('buttons-container') as HTMLDivElement | null;
  if (buttonsContainer) {
    if (!showWalletHeader) setLoadingBackgroundState(false);
    console.log('[DEBUG] walletStateChanged event received, wallet state:', wallet);
    if (!wallet.publicKey) {
      console.warn('[DEBUG] Wallet publicKey is null, aborting wallet display');
      return;
    }
    const walletPubKeyStr = wallet.publicKey.toString();
    //buttonsContainer.style.display = 'block';
    // Titolo hero, poi wallet header, poi card profili
    buttonsContainer.innerHTML = `
        <div class="profile-card-minimal-wrapper">
          ${showWalletHeader ? `<div class="wallet-minimal-header">
            <img src="${connectedWalletIcon}" alt="Wallet" class="wallet-minimal-icon">
            <div class="wallet-minimal-info">
              <div class="wallet-minimal-label">Wallet Connected</div>
              <div class="wallet-minimal-pubkey">${walletPubKeyStr.slice(0, 6)}...${walletPubKeyStr.slice(-8)}</div>
            </div>
          </div>` : ''}
          <div class="profile-card-minimal">
            <div class="profile-card-minimal-title" id="profileCardTitle">CHOOSE PLAYER PROFILE</div>
            <div class="profile-list-minimal" id="profileList">Caricamento...</div>
          </div>
        </div>
        <div id="results"></div>
      `;
    // Carica lista profili associati al wallet
    const profileListDiv = buttonsContainer.querySelector('#profileList') as HTMLDivElement;
    try {
      const data = profileData ?? await fetch(`/api/debug/player-profile-id?wallet=${walletPubKeyStr}`)
        .then(resp => resp.json());
      let html = "";
      const titleDiv = buttonsContainer.querySelector('#profileCardTitle') as HTMLDivElement;
      if (Array.isArray(data.variants) && data.variants.length > 0 && data.variants.some((v: any) => v.profileId)) {
        html = data.variants
          .filter((v: any) => v.profileId)
          .map((v: any, idx: number, arr: any[]) => {
            const resolvedFaction = saveProfileFactionToCache(v.profileId, v.profileFaction ?? v.profileFactionId)
              ?? getCachedProfileFaction(v.profileId);
            const normalizedFaction = normalizeProfileFaction(resolvedFaction) ?? '';
            return `<div class=\"profile-list-minimal-item\" data-profileid=\"${v.profileId}\" data-profile-faction=\"${normalizedFaction}\">\n  <span class=\"profile-list-minimal-icon profile-list-minimal-icon-primary\">${renderProfileFactionIconMarkup(resolvedFaction)}</span>\n  <span class=\"profile-list-minimal-id\">${v.profileId}</span>\n</div>\n${idx < arr.length - 1 ? '<div class=\\"profile-list-minimal-divider\\"></div>' : ''}`;
          }).join('');
        if (titleDiv) {
          titleDiv.textContent = 'CHOOSE PLAYER PROFILE';
          titleDiv.classList.remove('profile-card-minimal-title-error');
        }
      } else {
        // Nessun profilo trovato
        if (titleDiv) {
          titleDiv.textContent = 'NO PROFILE FOUND';
          titleDiv.classList.add('profile-card-minimal-title-error');
        }
      }
      // Voce "Type in manually..." sempre presente
      html += `<div class=\"profile-list-minimal-divider\"></div>\n<div class=\"profile-list-minimal-item manual\" id=\"manualProfileEntry\">\n  <span class=\"profile-list-minimal-icon profile-list-minimal-icon-manual\">&#9998;</span>\n  <span class=\"profile-list-minimal-id manual\">Type in manually...</span>\n</div>`;
      profileListDiv.innerHTML = html;

      // Aggiungi listener click su ogni profilo
      const sidebarWalletInfo = document.getElementById('sidebarWalletInfo');

      profileListDiv.querySelectorAll('.profile-list-minimal-item').forEach(item => {
        item.addEventListener('click', (e: any) => {
          if (item.id === 'manualProfileEntry') {
            // Richiama la stessa funzione del pulsante 'enter no wallet'
            // Nascondi info wallet nella sidebar
            if (sidebarWalletInfo) {
              sidebarWalletInfo.innerHTML = '';
              sidebarWalletInfo.style.display = 'none';
            }
            manualProfileEntryListener();
            console.log('[DEBUG] Manual profile entry selected', { item, e });
            return;
          }
          const pid = item.getAttribute('data-profileid');
          const cachedFaction = item.getAttribute('data-profile-faction') || getCachedProfileFaction(pid);
          applyProfileFactionIcon(document.getElementById('profileIcon') as HTMLDivElement | null, cachedFaction);

          const profileCardWrapper = buttonsContainer.querySelector('.profile-card-minimal-wrapper') as HTMLDivElement;
          profileCardWrapper.style.display = 'none';
          if (!showWalletHeader) {
            startManualProfileAnalysis(pid);
            return;
          }
          const resultsDiv = buttonsContainer.querySelector('#results') as HTMLDivElement | null;
          if (resultsDiv) {
            resultsDiv.innerHTML = '';
            const loading = createLoadingElement('Processing transaction data, this may take up to 5 minutes depending on your tx/day...<br>Analyzing profile (this may take a while)...');
            resultsDiv.appendChild(loading);
          }
          console.log('[DEBUG] Ricerca tramite wallet:', pid);
          analyzeFees(pid);

          //if (window.analyzeFees) window.analyzeFees(pid);
        });
      });

    } catch (e) {
      profileListDiv.innerHTML = '<span>Errore nel caricamento profili.</span>';
    }
  }
}
// --- ProfileId Cache Helpers ---
const PROFILEID_CACHE_KEY = 'recentProfileIds';
export function getRecentProfileIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(PROFILEID_CACHE_KEY) || '[]');
  } catch { return []; }
}

export function saveProfileIdToCache(profileId: string) {
  if (!profileId) return;
  let ids = getRecentProfileIds();
  ids = ids.filter(id => id !== profileId); // remove duplicates
  ids.unshift(profileId);
  if (ids.length > 8) ids = ids.slice(0, 8);
  localStorage.setItem(PROFILEID_CACHE_KEY, JSON.stringify(ids));
}

export function manualProfileEntryListener() {
  const buttonsContainer = document.getElementById('buttons-container') as HTMLDivElement | null;
  if (buttonsContainer) {
    console.log('[manualProfileEntryListener] Setting up manual profile entry form');
    //buttonsContainer.style.display = 'block';
    console.log('[DEBUG] manualProfileEntryListener called');
    buttonsContainer.innerHTML = '';
    buttonsContainer.appendChild(createManualLoginElement());
    // Popola suggerimenti
    const datalist = buttonsContainer.querySelector('#profileId-suggestions') as HTMLDataListElement | null;
    if (datalist) {
      datalist.innerHTML = getRecentProfileIds().map(pid => `<option value="${pid}"></option>`).join('');
    }
    const analyzeBtn = buttonsContainer.querySelector('#analyzeBtn') as HTMLButtonElement | null;
    analyzeBtn?.addEventListener('click', () => {
      const profileId = (buttonsContainer.querySelector('#profileId') as HTMLInputElement)?.value.trim();
      if (!profileId) {
        //alert('Inserisci un Player Profile ID!');
        return;
      }
      const allert_istruzioni = document.getElementById('allert_istruzioni');
      allert_istruzioni?.remove();
      buttonsContainer.querySelector('#loading')?.remove();
      (buttonsContainer.querySelector('.form-box') as HTMLDivElement | null)?.style.setProperty('display', 'none');
      buttonsContainer.appendChild(createLoadingElement('Looking up player profile...'));

      fetch(`/api/debug/profile-faction?profileId=${profileId}`)
        .then(resp => resp.json())
        .then(data => {
          if (data.profileFaction !== null) {
            saveProfileFactionToCache(profileId, data.profileFaction);
            startManualProfileAnalysis(profileId);
            return;
          }
          getWalletConnection({ publicKey: profileId }, undefined, false);
        })
        .catch(() => getWalletConnection({ publicKey: profileId }, undefined, false));
    });
  }
}

function startManualProfileAnalysis(profileId: string) {
  const buttonsContainer = document.getElementById('buttons-container') as HTMLDivElement | null;
  if (buttonsContainer) {
  const loadingMessage = 'Processing transaction data, this may take up to 5 minutes depending on your tx/day...<br>Analyzing profile (this may take a while)...';
  const loading = buttonsContainer.querySelector('#loading') as HTMLDivElement | null;
  if (loading) loading.innerHTML = `${loadingMessage}<br><span id="secondsSpan">- 0s</span>`;
  else buttonsContainer.appendChild(createLoadingElement(loadingMessage));
      console.log('[manualProfileEntryListener] Calling analyzeFees with profileId:', profileId);
      analyzeFees(profileId);
  }
}