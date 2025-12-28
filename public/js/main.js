import * as utils from './utils.js';
import "./app/debug.js";
import { setSidebarVisible } from './ui/sidebar.js';
import { formatCraftingType } from './ui/craftingType.js';
import { renderCraftingDetailsRows } from './ui/renderDetails.js';
import { updateProgress, displayPartialResults, displayResults, toggleFleet } from '../app.js';
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
// - setup event listeners
// - carica dati iniziali
// - gestisci stato globale
// - chiama api e aggiorna la UI


// Espone analyzeFees per l'onclick HTML legacy
import { analyzeFees } from './api.js';
window.analyzeFees = analyzeFees;
