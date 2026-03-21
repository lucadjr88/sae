import taxIcon from '@/assets/icons/taxes.png';
import resourcesIcon from '@/assets/icons/risorseIcon_4.png';
import rentalIcon from '@/assets/icons/rental2.svg'; // Nuova icona
//import { rentalState_playload } from './rentalState_playload';
//import { data } from '@/services/api';

export const toggleSwitchHTML = `
  <input type="radio" id="opt-fee" name="view-selector" class="toggle-switch-input" value="fee" checked>
  <input type="radio" id="opt-resource" name="view-selector" class="toggle-switch-input" value="resource">
  <input type="radio" id="opt-rental" name="view-selector" class="toggle-switch-input" value="rental">

  <div class="vertical-selector">
    <label for="opt-fee" class="selector-item">
      <img src="${taxIcon}" alt="Fee">
    </label>
    
    <label for="opt-resource" class="selector-item">
      <img src="${resourcesIcon}" alt="Resources">
    </label>
    
    <label for="opt-rental" class="selector-item">
      <img src="${rentalIcon}" alt="Rental">
    </label>
  </div>`;

let cachedFeeView: HTMLElement | null = null;
let cachedResourceView: HTMLElement | null = null;
let cachedRentalView: HTMLElement | null = null;

export const setCachedFeeView = (view: HTMLElement) => { cachedFeeView = view; };
export const setCachedResourceView = (view: HTMLElement) => { cachedResourceView = view; };
export const setCachedRentalView = (view: HTMLElement) => { cachedRentalView = view; };


export function initializeToggleSwitch(): void {
  const inputs = document.querySelectorAll<HTMLInputElement>('.toggle-switch-input[name="view-selector"]');
  const resultDiv = document.getElementById('result-container');

  if (!inputs.length || !resultDiv) {
    console.log('[initializeToggleSwitch] Elementi necessari non trovati');
    return;
  }

  inputs.forEach(input => {
    input.addEventListener('change', () => {
      if (!input.checked) return;

      switch (input.value) {
        case 'fee':
           resultDiv.replaceChildren(cachedFeeView);
          break;
        case 'resource':
          resultDiv.replaceChildren(cachedResourceView);
          break;
        case 'rental':
          resultDiv.replaceChildren(cachedRentalView);
          break;
      }
    });
  });
}