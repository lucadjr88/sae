
// public/app.ts
import './utils/ui-helpers.js';
import './results-display.js';
import './services/fleet-operations.js';
import './app/charts.js';
import './services/event-setup.js';

// Importare le funzioni per renderle globali
import { displayResults, displayPartialResults } from './results-display';
import { updateProgress, toggleFleet } from '@utils/ui-helpers';

// Global type declarations
declare global {
  interface Window {
    displayResults: typeof displayResults;
    displayPartialResults: typeof displayPartialResults;
    updateProgress: typeof updateProgress;
    toggleFleet: typeof toggleFleet;
  }
}

// Esportare funzioni che devono essere globali per compatibilità HTML
export { displayResults, displayPartialResults };
export { updateProgress, toggleFleet };

// Rendere disponibili globalmente se necessario
window.displayResults = displayResults;
window.displayPartialResults = displayPartialResults;
window.updateProgress = updateProgress;
window.toggleFleet = toggleFleet;

