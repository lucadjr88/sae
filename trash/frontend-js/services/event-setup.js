import { updatePriceTicker } from "@app/ticker.js";
import { renderPriceTicker } from "@app/renderPriceTicker.js";
import { updateCache, wipeAndReload } from "./cache-manager.js";
document.addEventListener("DOMContentLoaded", () => {
  const renderTicker = (prices) => renderPriceTicker(prices || void 0);
  updatePriceTicker(renderTicker);
  setInterval(() => updatePriceTicker(renderTicker), 6e4);
  const cacheUpdateBtn = document.querySelector("#cacheUpdateBtn");
  const cacheWipeBtn = document.querySelector("#cacheWipeBtn");
  if (cacheUpdateBtn) {
    const handler = (e) => {
      e.stopPropagation();
      console.log("Cache update button clicked");
      updateCache();
    };
    cacheUpdateBtn.addEventListener("click", handler);
  }
  if (cacheWipeBtn) {
    const handler = (e) => {
      e.stopPropagation();
      console.log("Cache wipe button clicked");
      wipeAndReload();
    };
    cacheWipeBtn.addEventListener("click", handler);
  }
  const tf = document.querySelector("#tab-fees");
  if (tf) {
    const handler = () => showFees();
    tf.addEventListener("click", handler);
  }
});
