import "./utils/ui-helpers.js";
import "./results-display.js";
import "./services/fleet-operations.js";
import "./app/charts.js";
import "./services/event-setup.js";
import { displayResults, displayPartialResults } from "./results-display.js";
import { updateProgress, toggleFleet } from "@utils/ui-helpers.js";
window.displayResults = displayResults;
window.displayPartialResults = displayPartialResults;
window.updateProgress = updateProgress;
window.toggleFleet = toggleFleet;
export {
  displayPartialResults,
  displayResults,
  toggleFleet,
  updateProgress
};
