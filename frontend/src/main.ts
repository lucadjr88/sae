// @ts-nocheck
import * as utils from '@utils/utils';
import "./app/debug.js";
// Load app initialization module first
import './app.js';
import { setSidebarVisible } from '@ui/sidebar';
import { formatCraftingType } from '@ui/craftingType';
import { renderCraftingDetailsRows } from '@ui/renderDetails';
import { updateProgress, displayPartialResults, displayResults, toggleFleet } from './app';

// Define unknown types for now
type UnknownDecoded = { _brand: "unknown_decoded" };
type UnknownBurns = { _brand: "unknown_burns" };
type UnknownClaims = { _brand: "unknown_claims" };
type UnknownEntry = { _brand: "unknown_entry" };

// Global type declarations
declare global {
  interface Window {
    toggleFleet: typeof toggleFleet;
    copyToClipboard: (text: string, event: Event) => void;
    inferRecipeName: (decoded: UnknownDecoded, burns: UnknownBurns, claims: UnknownClaims) => string | null;
    inferMaterialLabel: (entry: UnknownEntry, decoded: UnknownDecoded) => string;
    formatCraftingType: typeof formatCraftingType;
    setSidebarVisible: typeof setSidebarVisible;
    renderCraftingDetailsRows: typeof renderCraftingDetailsRows;
    updateProgress: typeof updateProgress;
    displayPartialResults: typeof displayPartialResults;
    displayResults: typeof displayResults;
    currentProfileId: string | null;
    analysisStartTime: Date | null;
    progressInterval: number | null;
    lastAnalysisParams: any; // TODO: define proper type
    analyzeFees: () => void; // TODO: define proper type
  }
}

window.toggleFleet = toggleFleet;

// Espone funzioni globali per compatibilità con chiamate legacy e moduli
window.copyToClipboard = utils.copyToClipboard;
window.inferRecipeName = utils.inferRecipeName;
window.inferMaterialLabel = utils.inferMaterialLabel;
window.formatCraftingType = formatCraftingType;
window.setSidebarVisible = setSidebarVisible;
window.renderCraftingDetailsRows = renderCraftingDetailsRows;
window.updateProgress = updateProgress;
window.displayPartialResults = displayPartialResults;
window.displayResults = displayResults;
window.currentProfileId = null;
window.analysisStartTime = null;
window.progressInterval = null;
window.lastAnalysisParams = null;

// Qui andrà la logica di avvio dell'app, ad esempio:

// Espone analyzeFees per l'onclick HTML legacy
import { analyzeFees } from '@services/api';
window.analyzeFees = analyzeFees;

const initStartScreen = () => {
  const startScreen = document.getElementById('start-screen') as HTMLElement | null;
  const enterBtn = document.getElementById('enterNoWalletBtn') as HTMLButtonElement | null;

  if (!startScreen || !enterBtn) {
    return;
  }

  document.body.classList.add('start-screen-active');
  startScreen.style.display = 'flex';

  const exitStartScreen = () => {
    document.body.classList.remove('start-screen-active');
    startScreen.style.display = 'none';
  };

  enterBtn.addEventListener('click', exitStartScreen);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initStartScreen);
} else {
  initStartScreen();
}

