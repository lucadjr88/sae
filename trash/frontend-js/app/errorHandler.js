function logError(message, error) {
  console.error(`[ERROR] ${message}`, error || "");
}
function logWarn(message, warn) {
  console.warn(`[WARN] ${message}`, warn || "");
}
function logDebug(message, data) {
  if (window.DEBUG_MODE) {
    console.debug(`[DEBUG] ${message}`, data || "");
  }
}
export {
  logDebug,
  logError,
  logWarn
};
