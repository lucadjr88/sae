// public/js/event-setup.js
import { updatePriceTicker } from './app/ticker.js';
import { renderPriceTicker } from './app/renderPriceTicker.js';
import { updateCache, refreshAnalysis, wipeAndReload } from './cache-manager.js';

document.addEventListener('DOMContentLoaded', () => {
  // Price ticker fetch and update
  updatePriceTicker(renderPriceTicker);
  setInterval(() => updatePriceTicker(renderPriceTicker), 60000);

  const cacheUpdateBtn = document.getElementById('cacheUpdateBtn');
  const cacheRefreshBtn = document.getElementById('cacheRefreshBtn');
  const cacheWipeBtn = document.getElementById('cacheWipeBtn');

  if (cacheUpdateBtn) {
    cacheUpdateBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Cache update button clicked');
      updateCache();
    });
  }

  if (cacheRefreshBtn) {
    cacheRefreshBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Cache refresh button clicked');
      refreshAnalysis();
    });
  }

  if (cacheWipeBtn) {
    cacheWipeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Cache wipe button clicked');
      wipeAndReload();
    });
  }

  const tf = document.getElementById('tab-fees');
  if (tf) tf.addEventListener('click', showFees);
});