let currentProfileId = null;
let analysisStartTime = null;
let progressInterval = null;
let lastAnalysisParams = null;
const txDetailsCache = {};
function setCurrentProfileId(val) {
  currentProfileId = val;
}
function setAnalysisStartTime(val) {
  analysisStartTime = val;
}
function setProgressInterval(val) {
  progressInterval = val;
}
function setLastAnalysisParams(val) {
  lastAnalysisParams = val;
}
function clearTxDetailsCache() {
  for (const k in txDetailsCache) delete txDetailsCache[k];
}
export {
  analysisStartTime,
  clearTxDetailsCache,
  currentProfileId,
  lastAnalysisParams,
  progressInterval,
  setAnalysisStartTime,
  setCurrentProfileId,
  setLastAnalysisParams,
  setProgressInterval,
  txDetailsCache
};
