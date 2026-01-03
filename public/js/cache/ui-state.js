// public/js/cache/ui-state.js
import { setSidebarVisible } from '../ui/sidebar.js';

export function hideCacheTooltipAndSidebar() {
  const tooltip = document.getElementById('cacheTooltip');
  if (tooltip) tooltip.classList.remove('visible');
  setSidebarVisible(false);
}

export function setCacheIconState(state, title = null) {
  const icon = document.getElementById('profileIcon');
  if (!icon) return;
  
  icon.classList.remove('cache-fresh', 'cache-stale');
  
  switch (state) {
    case 'loading':
      icon.style.opacity = '0.5';
      icon.title = title || 'Loading...';
      break;
    case 'fresh':
      icon.classList.add('cache-fresh');
      icon.style.opacity = '1';
      icon.title = title || 'Fresh data';
      break;
    case 'stale':
      icon.classList.add('cache-stale');
      icon.style.opacity = '1';
      icon.title = title || 'Stale data';
      break;
  }
}

export function setCacheButtonState(buttonId, disabled, text) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.disabled = disabled;
  btn.textContent = text;
}

export function resetAllCacheButtons() {
  setCacheButtonState('cacheUpdateBtn', false, '⚡ Update Cache');
  setCacheButtonState('cacheRefreshBtn', false, '🔄 Force Refresh');
  setCacheButtonState('cacheWipeBtn', false, '🗑️ Wipe & Reload');
  setCacheIconState('fresh');
}