// public/js/event-setup.ts
import { updatePriceTicker } from '@app/ticker';
import { renderPriceTicker } from '@app/renderPriceTicker';
import { updateCache, refreshAnalysis, wipeAndReload } from './cache-manager';

// Define shared types
type EventHandler<T extends Event> = (ev: T) => void;

// Assuming showFees is defined elsewhere
declare function showFees(): void;

document.addEventListener('DOMContentLoaded', () => {
  // Price ticker fetch and update
  const renderTicker = (prices: Record<string, any> | null) => renderPriceTicker(prices || undefined);
  updatePriceTicker(renderTicker);
  setInterval(() => updatePriceTicker(renderTicker), 60000);

  const cacheUpdateBtn = document.querySelector<HTMLButtonElement>('#cacheUpdateBtn');
  const cacheWipeBtn = document.querySelector<HTMLButtonElement>('#cacheWipeBtn');

  if (cacheUpdateBtn) {
    const handler: EventHandler<MouseEvent> = (e) => {
      e.stopPropagation();
      console.log('Cache update button clicked');
      updateCache();
    };
    cacheUpdateBtn.addEventListener('click', handler);
  }

  if (cacheWipeBtn) {
    const handler: EventHandler<MouseEvent> = (e) => {
      e.stopPropagation();
      console.log('Cache wipe button clicked');
      wipeAndReload();
    };
    cacheWipeBtn.addEventListener('click', handler);
  }

  const tf = document.querySelector<HTMLElement>('#tab-fees');
  if (tf) {
    const handler: EventHandler<MouseEvent> = () => showFees();
    tf.addEventListener('click', handler);
  }
});