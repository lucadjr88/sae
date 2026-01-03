
// public/app.js
import './js/ui-helpers.js';
import './js/cache/cache-operations.js';
import './js/results-display.js';
import './js/fleet-operations.js';
import './js/charts.js';
import './js/event-setup.js';

// Importare le funzioni per renderle globali
import { displayResults, displayPartialResults } from './js/results-display.js';
import { updateProgress, toggleFleet } from './js/ui-helpers.js';

// Esportare funzioni che devono essere globali per compatibilità HTML
export { displayResults, displayPartialResults };
export { updateProgress, toggleFleet };

// Rendere disponibili globalmente se necessario
window.displayResults = displayResults;
window.displayPartialResults = displayPartialResults;
window.updateProgress = updateProgress;
window.toggleFleet = toggleFleet;



