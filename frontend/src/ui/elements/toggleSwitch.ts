import taxIcon from '@/assets/icons/taxes.png';
import resourcesIcon from '@/assets/icons/risorseIcon_4.png';
import rentalIcon from '@/assets/icons/rental2.svg'; // Nuova icona
import sduProgramIcon from '@/assets/icons/sduProgramWhite.png';
import { ensureSduProgramViewLoaded } from '@/ui/elements/sduProgram_playload';
//import { rentalState_playload } from './rentalState_playload';
//import { data } from '@/services/api';

type ToggleView = 'fee' | 'resource' | 'rental' | 'sdu';

let activeViewPreference: ToggleView = 'fee';

export const toggleSwitchHTML = `
  <input type="radio" id="opt-fee" name="view-selector" class="toggle-switch-input" value="fee" checked>
  <input type="radio" id="opt-resource" name="view-selector" class="toggle-switch-input" value="resource">
  <input type="radio" id="opt-rental" name="view-selector" class="toggle-switch-input" value="rental">
  <input type="radio" id="opt-sdu" name="view-selector" class="toggle-switch-input" value="sdu">

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

    <label for="opt-sdu" class="selector-item">
      <img src="${sduProgramIcon}" alt="SDU Program">
    </label>
  </div>`;

let cachedFeeView: HTMLElement | null = null;
let cachedResourceView: HTMLElement | null = null;
let cachedRentalView: HTMLElement | null = null;
let cachedSduView: HTMLElement | null = null;

export const setCachedFeeView = (view: HTMLElement) => { cachedFeeView = view; };
export const setCachedResourceView = (view: HTMLElement) => { cachedResourceView = view; };
export const setCachedRentalView = (view: HTMLElement) => { cachedRentalView = view; };
export const setCachedSduView = (view: HTMLElement) => { cachedSduView = view; };

function isToggleView(value: string | null): value is ToggleView {
  return value === 'fee' || value === 'resource' || value === 'rental' || value === 'sdu';
}

export function getActiveViewPreference(): ToggleView {
  return activeViewPreference;
}

export function setActiveViewPreference(view: ToggleView): void {
  activeViewPreference = view;
}

export function showCachedView(view: ToggleView, persist: boolean = true): void {
  const resultDiv = document.getElementById('result-container');
  if (!resultDiv) {
    return;
  }

  if (persist) {
    setActiveViewPreference(view);
  }

  const selectedInput = document.querySelector<HTMLInputElement>(`.toggle-switch-input[name="view-selector"][value="${view}"]`);
  if (selectedInput) {
    selectedInput.checked = true;
  }

  const targetView = view === 'fee'
    ? cachedFeeView
    : view === 'resource'
      ? cachedResourceView
      : view === 'rental'
        ? cachedRentalView
        : cachedSduView;

  if (targetView) {
    resultDiv.replaceChildren(targetView);
    if (view === 'sdu') {
      void ensureSduProgramViewLoaded(targetView);
    }
    return;
  }

  if (view !== 'fee' && cachedFeeView) {
    resultDiv.replaceChildren(cachedFeeView);
  }
}

export function initializeToggleSwitch(): void {
  const inputs = document.querySelectorAll<HTMLInputElement>('.toggle-switch-input[name="view-selector"]');
  const resultDiv = document.getElementById('result-container');

  if (!inputs.length || !resultDiv) {
    console.log('[initializeToggleSwitch] Elementi necessari non trovati');
    return;
  }

  inputs.forEach(input => {
    if (input.dataset.toggleBound === 'true') {
      return;
    }

    input.dataset.toggleBound = 'true';
    input.addEventListener('change', () => {
      if (!input.checked || !isToggleView(input.value)) return;
      showCachedView(input.value);
    });
  });

  showCachedView(getActiveViewPreference(), false);
}