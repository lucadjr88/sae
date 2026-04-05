import { listFleetTx } from './rental_tx';

export interface ListingDetailWindowOptions {
  title?: string;
  fleets?: any[];
  selectedFleet?: string;
}

function removeListingDetailWindow() {
  document.getElementById('listingDetailWindow')?.remove();
  document.querySelector('.listingDetailOverlay')?.remove();
}

function normalizeFleetOption(fleet: any): { value: string; label: string } | null {
  const value = String(fleet?.key || fleet?.fleet || fleet?.pubkey || fleet?.data?.fleetShips || '').trim();
  const label = String(fleet?.callsign || fleet?.fleet_label || fleet?.fleet_name || value || '').trim();

  if (!value && !label) {
    return null;
  }

  return {
    value: value || label,
    label: label || value,
  };
}

export function createListingDetailWindow(
  fleetName: string = '',
  options: ListingDetailWindowOptions = {}
) {
  const {
    title = 'Listing Details',
    fleets = [],
    selectedFleet = fleetName,
  } = options;

  console.log('[listing-window] Opening listing detail window', {
    title,
    fleetsCount: Array.isArray(fleets) ? fleets.length : 0,
    selectedFleet,
  });

  removeListingDetailWindow();

  const overlay = document.createElement('div');
  overlay.className = 'rentalContractOverlay listingDetailOverlay';
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      removeListingDetailWindow();
    }
  });

  const listingWindow = document.createElement('div');
  listingWindow.id = 'listingDetailWindow';
  listingWindow.className = 'rental-contract-window listing-detail-window';
  listingWindow.style.zIndex = '9999';
  listingWindow.innerHTML = `
    <div class="window-header">
      <h2>${title}</h2>
      <button id="closeListingDetailWindow" class="closeWindow" aria-label="Close">&times;</button>
    </div>

    <div class="window-content" style="display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 16px; padding-top: 24px;">
      <select id="listingFleetSelect" style="min-width: 320px; padding: 12px; border-radius: 8px; font-size: 1rem;"></select>
      <div id="listingActionArea" style="display: none; flex-direction: column; gap: 12px; width: 320px;">
        <input id="listingRateInput" type="number" min="1" step="1" placeholder="Rate / day" class="listingRateInput">
        <button id="listingSubmitButton" class="listingSubmitButton" type="button">List</button>
      </div>
    </div>
  `;

  listingWindow.querySelector('#closeListingDetailWindow')?.addEventListener('click', () => {
    removeListingDetailWindow();
  });

  overlay.appendChild(listingWindow);
  document.body.appendChild(overlay);

  const fleetSelect = listingWindow.querySelector('#listingFleetSelect') as HTMLSelectElement | null;
  const listingActionArea = listingWindow.querySelector('#listingActionArea') as HTMLDivElement | null;
  const rateInput = listingWindow.querySelector('#listingRateInput') as HTMLInputElement | null;
  const submitButton = listingWindow.querySelector('#listingSubmitButton') as HTMLButtonElement | null;
  if (!fleetSelect || !listingActionArea || !rateInput || !submitButton) {
    return listingWindow;
  }

  const updateActionAreaVisibility = () => {
    listingActionArea.style.display = fleetSelect.value ? 'flex' : 'none';
    submitButton.disabled = !fleetSelect.value;
    console.log('[listing-window] Action area visibility updated', {
      selectedFleet: fleetSelect.value || null,
      actionAreaDisplay: listingActionArea.style.display,
      submitDisabled: submitButton.disabled,
    });
  };

  const optionsList = Array.isArray(fleets)
    ? Array.from(
        new Map(
          fleets
            .filter((fleet) => !fleet?.isListed && !fleet?.isLoaned && !fleet?.isRented)
            .map(normalizeFleetOption)
            .filter((fleet): fleet is { value: string; label: string } => Boolean(fleet))
            .map((fleet) => [fleet.value, fleet])
        ).values()
      )
    : [];

  console.log('[listing-window] Prepared listable fleet options', {
    optionsCount: optionsList.length,
    sample: optionsList.slice(0, 5),
  });

  if (!optionsList.length) {
    console.warn('[listing-window] No listable fleets available in cache');
    fleetSelect.appendChild(new Option('No fleets available in cache', ''));
    fleetSelect.disabled = true;
    listingActionArea.style.display = 'none';
    return listingWindow;
  }

  fleetSelect.appendChild(new Option('Select fleet', ''));
  for (const fleet of optionsList) {
    fleetSelect.appendChild(new Option(fleet.label, fleet.value));
  }

  if (selectedFleet) {
    const matchedOption = optionsList.find((fleet) => fleet.value === selectedFleet || fleet.label === selectedFleet);
    if (matchedOption) {
      fleetSelect.value = matchedOption.value;
    }
  }

  const submitListing = async () => {
    const fleetId = fleetSelect.value.trim();
    const ratePerDay = Number.parseInt(rateInput.value, 10);
    const owner = window.wallet?.adapter?.publicKey?.toBase58?.();

    console.log('[listing-window] Submit requested', {
      fleetId,
      rateInput: rateInput.value,
      parsedRatePerDay: ratePerDay,
      owner,
    });

    if (!fleetId) {
      console.warn('[listing-window] Submit blocked: missing fleet selection');
      alert('Select a fleet first');
      return;
    }

    if (!owner) {
      console.warn('[listing-window] Submit blocked: wallet not connected');
      alert('Wallet non connesso');
      return;
    }

    if (!Number.isFinite(ratePerDay) || ratePerDay <= 0) {
      console.warn('[listing-window] Submit blocked: invalid rate/day', { rateInput: rateInput.value });
      alert('Inserisci un rate/day valido');
      rateInput.focus();
      return;
    }

    submitButton.disabled = true;
    fleetSelect.disabled = true;
    rateInput.disabled = true;
    const previousText = submitButton.textContent;
    submitButton.textContent = 'Listing...';

    try {
      const { currentProfileId } = await import('@/utils/state');
      console.log('[listing-window] Calling listFleetTx', {
        fleetId,
        ratePerDay,
        owner,
        profileId: currentProfileId || undefined,
      });
      const listed = await listFleetTx({
        fleet_id: fleetId,
        rate: ratePerDay,
        owner,
        profileId: currentProfileId || undefined,
      });

      console.log('[listing-window] listFleetTx completed', { listed, fleetId, ratePerDay });
      if (listed) {
        removeListingDetailWindow();
      }
    } finally {
      console.log('[listing-window] Restoring UI state after listing attempt');
      submitButton.disabled = false;
      fleetSelect.disabled = false;
      rateInput.disabled = false;
      submitButton.textContent = previousText;
    }
  };

  fleetSelect.addEventListener('change', () => {
    console.log('[listing-window] Fleet selection changed', { selectedFleet: fleetSelect.value || null });
    updateActionAreaVisibility();
  });
  submitButton.addEventListener('click', () => {
    void submitListing();
  });
  rateInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitListing();
    }
  });
  updateActionAreaVisibility();

  return listingWindow;
}
