// @ts-nocheck
import * as utils from '@utils/utils';
import "./app/debug.js";
// Load app initialization module first
import './app.js';
import { formatCraftingType } from '@ui/craftingType';
import { renderCraftingDetailsRows } from '@ui/renderDetails';
import { updateProgress, displayPartialResults, displayResults, toggleFleet } from './app';
import './services/wallet.js';

// Define unknown types for now
type UnknownDecoded = { _brand: "unknown_decoded" };
type UnknownBurns = { _brand: "unknown_burns" };
type UnknownClaims = { _brand: "unknown_claims" };
type UnknownEntry = { _brand: "unknown_entry" };

// Global type declarations
import { setSidebarVisible } from '@ui/sidebar';
declare global {
  interface Window {
    toggleFleet: typeof toggleFleet;
    copyToClipboard: (text: string, event: Event) => void;
    inferRecipeName: (decoded: UnknownDecoded, burns: UnknownBurns, claims: UnknownClaims) => string | null;
    inferMaterialLabel: (entry: UnknownEntry, decoded: UnknownDecoded) => string;
    formatCraftingType: typeof formatCraftingType;
    renderCraftingDetailsRows: typeof renderCraftingDetailsRows;
    updateProgress: typeof updateProgress;
    displayPartialResults: typeof displayPartialResults;
    displayResults: typeof displayResults;
    setSidebarVisible: typeof setSidebarVisible;
    currentProfileId: string | null;
    analysisStartTime: Date | null;
    progressInterval: number | null;
    lastAnalysisParams: any; // TODO: define proper type
    analyzeFees: (profileIdParam?: string) => void; // TODO: define proper type
  }
}

window.toggleFleet = toggleFleet;
window.setSidebarVisible = setSidebarVisible;

// Espone funzioni globali per compatibilità con chiamate legacy e moduli
window.copyToClipboard = utils.copyToClipboard;
window.inferRecipeName = utils.inferRecipeName;
window.inferMaterialLabel = utils.inferMaterialLabel;
window.formatCraftingType = formatCraftingType;
window.renderCraftingDetailsRows = renderCraftingDetailsRows;
window.updateProgress = updateProgress;
window.displayPartialResults = displayPartialResults;
window.displayResults = displayResults;
window.analysisStartTime = null;
window.progressInterval = null;
window.lastAnalysisParams = null;

// Espone analyzeFees per l'onclick HTML legacy
import { analyzeFees } from '@services/api';
window.analyzeFees = analyzeFees;


const connectBtn = document.getElementById('connectWalletBtn') as HTMLButtonElement | null;
const startScreen = document.getElementById('start-screen') as HTMLElement | null;
const mainContainer = document.getElementById('mainContainer') as HTMLElement | null;

// Nascondi la dashboard (mainContainer) all'avvio
if (mainContainer) mainContainer.style.display = 'none';

if (connectBtn) {
  connectBtn.disabled = false;
  connectBtn.addEventListener('click', () => {
    //console.log('[DEBUG] Connect Wallet button pressed');
    if (!window.wallet) {
      alert('window.wallet non è definito!');
      console.error('[DEBUG] window.wallet non è definito!');
      return;
    }
    // Multi-wallet: mostra sempre il modal custom
    //console.log('[DEBUG] window.wallet prima di connect:', window.wallet);
    window.wallet.connect().then(() => {
      //console.log('[DEBUG] Connect chiamato, stato wallet:', window.wallet);
    }).catch((err) => {
      alert('Errore durante la connessione al wallet: ' + (err?.message || err));
      console.error('[DEBUG] Errore connect wallet:', err);
    });
  });
}

      function getWalletIcon(wallet: any): string {
        if (!wallet) return "src/assets/icons/seedvault2.png";
        const name = (wallet.adapter?.name || wallet.name || "").toLowerCase();
        if (name.includes("solflare")) return "https://www.solflare.com/wp-content/uploads/2024/11/App-Icon.svg";
        if (name.includes("phantom")) return "https://mintcdn.com/phantom-e50e2e68/fkWrmnMWhjoXSGZ9/resources/images/Phantom_SVG_Icon.svg?w=1100&fit=max&auto=format&n=fkWrmnMWhjoXSGZ9&q=85&s=d9602893116f9314145e2a303d675ccc";
        if (name.includes("backpack")) return "https://lh3.googleusercontent.com/YQnjQjJ6NuY_rxRwy8JA177ONpmPiOdFpud8zK-ebcS8-r3mQzwrzmqlueLSvKw1SsaoeBYua7XePZ632xXM4aHUzw=s60";
        return "src/assets/icons/seedvault2.png";
      }
// --- Minimal Connect Wallet screen logic ---
window.addEventListener('walletStateChanged', async () => {
  const wallet = window.wallet;
  if (wallet && wallet.isConnected && wallet.publicKey) {
    // Nascondi start screen
    if (startScreen) startScreen.style.display = 'none';
    if (mainContainer) {

      mainContainer.style.display = 'block';
      // Titolo hero, poi wallet header, poi card profili
      mainContainer.innerHTML = `
        <div class="hero">
          <div class="hero-title">Star Atlas Explorer</div>
          <div class="hero-subtitle">POWERED BY THE PEOPLE</div>
        </div>
        <div class="profile-card-minimal-wrapper">
          <div class="wallet-minimal-header">
            <img src="${getWalletIcon(wallet)}" alt="Wallet" class="wallet-minimal-icon">
            <div class="wallet-minimal-info">
              <div class="wallet-minimal-label">Wallet Connected</div>
              <div class="wallet-minimal-pubkey">${wallet.publicKey.toString().slice(0, 6)}...${wallet.publicKey.toString().slice(-8)}</div>
            </div>
          </div>
          <div class="profile-card-minimal">
            <div class="profile-card-minimal-title" id="profileCardTitle">CHOOSE PLAYER PROFILE</div>
            <div class="profile-list-minimal" id="profileList">Caricamento...</div>
          </div>
        </div>
        <div id="results"></div>
      `;
      // Carica lista profili associati al wallet
      const profileListDiv = mainContainer.querySelector('#profileList') as HTMLDivElement;
      try {
        const resp = await fetch(`/api/debug/player-profile-id?wallet=${wallet.publicKey.toString()}`);
        const data = await resp.json();
        let html = "";
        const titleDiv = mainContainer.querySelector('#profileCardTitle') as HTMLDivElement;
        if (Array.isArray(data.variants) && data.variants.length > 0 && data.variants.some((v: any) => v.profileId)) {
          html = data.variants
            .filter((v: any) => v.profileId)
            .map((v: any, idx: number, arr: any[]) =>
              `<div class=\"profile-list-minimal-item\" data-profileid=\"${v.profileId}\">\n  <span class=\"profile-list-minimal-icon\" style=\"color:#3bb3ff;\">&#128100;</span>\n  <span class=\"profile-list-minimal-id\">${v.profileId}</span>\n</div>\n${idx < arr.length - 1 ? '<div class=\\"profile-list-minimal-divider\\"></div>' : ''}`
            ).join('');
          if (titleDiv) {
            titleDiv.textContent = 'CHOOSE PLAYER PROFILE';
            titleDiv.style.color = '';
          }
        } else {
          // Nessun profilo trovato
          if (titleDiv) {
            titleDiv.textContent = 'NO PROFILE FOUND';
            titleDiv.style.color = '#ff3b3b';
          }
        }
        // Voce "Type in manually..." sempre presente
        html += `<div class=\"profile-list-minimal-divider\"></div>\n<div class=\"profile-list-minimal-item manual\" id=\"manualProfileEntry\">\n  <span class=\"profile-list-minimal-icon\" style=\"color:#3bb3ff;opacity:0.7;\">&#9998;</span>\n  <span class=\"profile-list-minimal-id manual\">Type in manually...</span>\n</div>`;
        profileListDiv.innerHTML = html;
      } catch (e) {
        profileListDiv.innerHTML = '<span>Errore nel caricamento profili.</span>';
      }
      // Gestione click su profileid (solo su .profile-list-item, no highlight)
      mainContainer.querySelectorAll('.profile-list-minimal-item').forEach(item => {
        item.addEventListener('click', (e: any) => {
          if (item.id === 'manualProfileEntry') {
            // Richiama la stessa funzione del pulsante 'enter no wallet'
            // Nascondi info wallet nella sidebar
            const sidebarWalletInfo = document.getElementById('sidebarWalletInfo');
            if (sidebarWalletInfo) {
              sidebarWalletInfo.innerHTML = '';
              sidebarWalletInfo.style.display = 'none';
            }
            exitStartScreen();
            return;
          }
          const pid = item.getAttribute('data-profileid');
          const sidebar = document.getElementById('sidebar');
          const sidebarProfileId = document.getElementById('sidebarProfileId');
          const sidebarWalletInfo = document.getElementById('sidebarWalletInfo');
          mainContainer.style.display = 'block';
          mainContainer.innerHTML = `
            <div class="hero">
              <div class="hero-title">Star Atlas Explorer</div>
              <div class="hero-subtitle">POWERED BY THE PEOPLE</div>
            </div>
            <div id="results"></div>
          `;
          if (sidebar) sidebar.style.display = 'flex';
          // Mostra logo wallet SOLO se la selezione avviene da wallet connect
          if (sidebarWalletInfo && window.wallet && window.wallet.isConnected && window.wallet.publicKey) {
            sidebarWalletInfo.innerHTML = `
              <img src="${getWalletIcon(window.wallet)}" alt="Wallet" class="wallet-minimal-icon" style="width:28px;height:28px;margin-bottom:2px;">
              <div class="profile-id" style="font-size:11px;margin-top:2px;">${window.wallet.publicKey.toString().slice(0, 4)}...${window.wallet.publicKey.toString().slice(-4)}</div>
            `;
            sidebarWalletInfo.style.display = '';
          } else if (sidebarWalletInfo) {
            sidebarWalletInfo.innerHTML = '';
            sidebarWalletInfo.style.display = 'none';
          }
          if (sidebarProfileId) {
            const profileId = pid || (mainContainer.querySelector('#profileId') as HTMLInputElement)?.value.trim();
            if (profileId) sidebarProfileId.textContent = profileId.substring(0, 4) + '...' + profileId.substring(profileId.length - 4);
          }
          const resultsDiv = mainContainer.querySelector('#results') as HTMLDivElement;
          resultsDiv.innerHTML = '<div class="loading">Loading...</div>';
          if (window.analyzeFees) window.analyzeFees(pid);
        });
      });
    }
  }
});

  const exitStartScreen = () => {
    if (startScreen) startScreen.style.display = 'none';
    if (mainContainer) {
      mainContainer.style.display = 'block';
      mainContainer.innerHTML = `
        <div class="hero">
          <div class="hero-title">Star Atlas Explorer</div>
          <div class="hero-subtitle">POWERED BY THE PEOPLE</div>
        </div>
        <div class="form-box centered">
          <input type="text" id="profileId" placeholder="Player Profile ID">
          <button id="analyzeBtn">Analyze</button>
        </div>
        <div id="results"></div>
      `;
      const analyzeBtn = mainContainer.querySelector('#analyzeBtn') as HTMLButtonElement | null;
      analyzeBtn?.addEventListener('click', () => {
        const profileId = (mainContainer.querySelector('#profileId') as HTMLInputElement)?.value.trim();
        if (!profileId) {
          alert('Inserisci un Player Profile ID!');
          return;
        }
        const resultsDiv = mainContainer.querySelector('#results') as HTMLDivElement;
        resultsDiv.innerHTML = '<div class="loading">Loading...</div>';
        if (window.analyzeFees) window.analyzeFees(profileId);
      });
    }
  };

const initStartScreen = () => {
  const startScreen = document.getElementById('start-screen') as HTMLElement | null;
  const enterBtn = document.getElementById('enterNoWalletBtn') as HTMLButtonElement | null;
  const mainContainer = document.getElementById('mainContainer') as HTMLElement | null;


  if (!startScreen || !enterBtn) {
    return;
  }
  if (startScreen) startScreen.style.display = 'flex';



  enterBtn.addEventListener('click', exitStartScreen);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStartScreen);
} else {
  initStartScreen();
}

