import taxIcon from '@/assets/icons/taxes.png';
import resourcesIcon from '@/assets/icons/risorseIcon_4.png';

export const toggleSwitchHTML = `
<label class="vertical-switch">
  <input type="checkbox">
  <span class="slider">
    <span class="toggleSwitch-icon"><img src="${taxIcon}" alt="Fee"></span> <span class="toggleSwitch-icon"><img src="${resourcesIcon}" alt="Resources"></span> </span>
</label>`;

let cachedFeeView: HTMLElement | null = null;
let cachedResourceView: HTMLElement | null = null;

export function setCachedFeeView(view: HTMLElement): void {
  cachedFeeView = view;
}

export function setCachedResourceView(view: HTMLElement): void {
  cachedResourceView = view;
}

function createResourcePlaceholder(): HTMLElement {
  const div = document.createElement('div');
  div.id = 'resourceResults';
  div.className = 'resource-results';
  div.textContent = 'Resources view - coming soon';
  return div;
}

export function initializeToggleSwitch(): void {
  const toggleSwitch = document.querySelector('.vertical-switch input[type="checkbox"]') as HTMLInputElement | null;
  if (!toggleSwitch) {
    console.error('[initializeToggleSwitch] CRITICAL: Toggle switch input element not found');
    return;
  }

  console.log('[initializeToggleSwitch] Initial checked state:', toggleSwitch.checked);
  toggleSwitch.checked = true; // Forza lo stato iniziale a "Fee"
  console.log('[initializeToggleSwitch] After forced false:', toggleSwitch.checked);
  void toggleSwitch.offsetHeight;
  
  toggleSwitch.addEventListener('change', () => {
    const resultDiv = document.getElementById('result-container');
    if (!resultDiv) {
      console.error('[initializeToggleSwitch] CRITICAL: #result-container element not found');
      return;
    }

    if (!toggleSwitch.checked) {
      const resourceView = cachedResourceView || createResourcePlaceholder();
      resultDiv.replaceChildren(resourceView);
    } else {
      if (cachedFeeView) {
        resultDiv.replaceChildren(cachedFeeView);
      }
    }
  });
}

