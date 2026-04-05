import { RentalContract } from './rental_playload';
import { resolveMaterialImageCandidates, resolveResourceCatalogEntry } from './resource_playload';
import { rentTx } from './rental_tx';
import { currentProfileId } from '@/utils/state';
import { TICKER_CONFIG } from './footBar';


function formatRate(rate: number): string {
  return rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Funzione per creare la finestra dei dettagli del contratto da aprire al click su nome fleet e a cui passare i dettagli del contratto da visualizzare
export function createRentalContractWindow(fleetName: string, contractDetails: RentalContract) {
  const rate = formatRate(contractDetails.rate);
  const composition = contractDetails.fleet_composition ?? '-';
  // Esempio se vuoi trasformare la virgola in un a capo visivo
  const formattedComposition = composition.split(',').join('<br>');

  // Crea overlay
  const overlay = document.createElement('div');
  overlay.className = 'rentalContractOverlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      document.getElementById('rentalContractWindow')?.remove();
      overlay.remove();
    }
  });

  // Crea la finestra modale
  const contractWindow = document.createElement('div');
  contractWindow.id = 'rentalContractWindow';
  contractWindow.className = 'rental-contract-window';
  contractWindow.style.zIndex = '9999';
  contractWindow.innerHTML = `
    <div class="window-header">
      <h2>Rental Contract Details</h2>
      <button id="closeWindow" class="closeWindow" aria-label="Close">&times;</button>
    </div>

    <div class="window-content">
      <div class="detail-card">
        <div class="detail-item">
          <span class="label">Fleet Name</span>
          <span class="value">${fleetName}</span>
        </div>
        
        <div class="detail-item">
          <span class="label">Rate</span>
          <span class="value price">${rate}</span>
        </div>
        
        <div class="detail-item">
          <span class="label">Composition</span>
          <span class="value">${formattedComposition}</span>
        </div>
        <div class="rental-tx" class="rental-tx">
        </div>
      </div>
      <div id="additionalDetails" class="additional-details">
        
      </div>
    </div>
  `;

  // Aggiungi event listener per chiudere la finestra
  contractWindow.querySelector('#closeWindow')?.addEventListener('click', () => {
    document.getElementById('rentalContractWindow')?.remove();
    document.getElementsByClassName('rentalContractOverlay')[0]?.remove();
  });

  overlay.appendChild(contractWindow);
  document.body.appendChild(overlay);

  // riempiamo la sezione dei dettagli aggiuntivi con un template di caricamento e poi con la risposta API
  const additionalDetails = document.getElementById('additionalDetails') as HTMLDivElement;
  if (additionalDetails) {
    const loadingTemplate = `
      <div class="detail-card loading-card">
        <div class="spinner-container">
          <div class="spinner"></div>
          <span>Loading Fleet Details...</span>
        </div>
      </div>
      `;
    additionalDetails.innerHTML = loadingTemplate;


    // chiamata minimale al backend via fetch condivisa col frontend
    (async () => {
      try {
        const fleetId = contractDetails.fleet;
        const res = await fetch(`/api/getFleetInfoMinimal?fleetId=${encodeURIComponent(fleetId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // Mostra la risposta in modo semplice
        try {
          // 1. Calcolo percentuali con protezione contro divisioni per zero o dati mancanti
          const fuelPercent = data.fuel?.capacity > 0 ? ((data.fuel.level / data.fuel.capacity) * 100).toFixed(1) : "0";
          const ammoPercent = data.ammo?.capacity > 0 ? ((data.ammo.level / data.ammo.capacity) * 100).toFixed(1) : "0";

          // 2. Gestione sicura della posizione e del fallback "Starbase"
          // Se sector_xy esiste ed è un array, lo uniamo, altrimenti scriviamo "Starbase"
          const sectorDisplay = (data.posizione && Array.isArray(data.posizione.sector_xy))
            ? `[${data.posizione.sector_xy.join(', ')}]`
            : data.posizione?.starbase_name || "- -";


          // 4. Rendering dei token (con controllo se l'array esiste)
          let cargoHtml = (data.cargo_tokens || []).map(item => {
            const catalogEntry = resolveResourceCatalogEntry(item.mint, item.symbol);
            const entry = {
              mint: item.mint,
              label: catalogEntry?.name || item.symbol || item.mint,
              symbol: (catalogEntry?.symbol || item.symbol || '').trim(),
              imageUrl: catalogEntry?.imageUrl || '',
              totalIn: 0,
              totalOut: 0,
              volume: 0,
              operations: undefined
            };
            const materialImageCandidates = resolveMaterialImageCandidates(entry);
            const materialImage = materialImageCandidates[0] || '';
            const materialSymbol = entry.symbol || entry.mint.slice(0, 8);


            // Assumendo che materialImageCandidates sia l'URL o che tu voglia visualizzarlo
            return `
              <div class="rental-material-cell">
                <div class="resource-material-entry">
                  <img src="${materialImage}" alt="${materialSymbol}" loading="lazy" decoding="async" class="rental-material-icon">
                </div>
                <span class="resource-material-quantity"><strong>${item.amount}</strong></span>
              </div>
            `;
          }).join('');

          if (cargoHtml === "") cargoHtml = '<div class="cargo-item">Empty Hold</div>';

          additionalDetails.innerHTML = `
            <div class="rental-fleet-details">
              <div class="fleet-state-position">
                <span class="status-badge">${data.posizione?.state || '-'}</span>
                <span class="sector-info">${sectorDisplay}</span>
              </div>
            </div>

            <div class="rental-fleet-details">
              <div class="stat-box">
                <span class="rent-stat-label">Fuel</span>
                <span class="rent-stat-value">${data.fuel?.level || 0} / ${data.fuel?.capacity || 0} (${fuelPercent}%)</span>
              </div>
              <div class="stat-box">
                <span class="rent-stat-label">Ammo</span>
                <span class="rent-stat-value">${data.ammo?.level || 0} / ${data.ammo?.capacity || 0} (${ammoPercent}%)</span>
              </div>
              <div class="stat-box">
                <span class="rent-stat-label">Crew</span>
                <span class="rent-stat-value"> ${data.crew_total || 0} / ${data.crew_required || 0}</span>
              </div>
            </div>
            <div class="rental-fleet-details">
              <h4>CARGO</h4>
              <div class="cargo-list">
                ${cargoHtml}
              </div>
            </div>
        `;
        } catch (e) {
          console.error(e);
          additionalDetails.innerHTML = `<div class="error-card">Errore nel rendering: ${e.message}</div>`;
        }
      } catch (e) {
        additionalDetails.innerHTML = `<div class="detail-card error-card">Errore caricamento dettagli fleet.<br>${e}</div>`;
      } finally {
        // carica rental tx inserendo un input text numerico ed un pulsante "rent"
        // solo se const state = c.current_rental_state ? 'Active' : 'Available'; è "Available"
        const state = contractDetails.current_rental_state ? 'Active' : 'Available';
        const rentalTxDiv = document.querySelector('.rental-tx') as HTMLDivElement;
        const atlasIcon = `<img style="width: 25%" src="${TICKER_CONFIG.find(c => c.id === 'star-atlas')?.img}"/>`;

        if (state === 'Available') {
          const baseRate = Number(contractDetails.rate || 0);

          rentalTxDiv.innerHTML = `
            <div>
              <div class="custom-number-input">
                <button id="rentButton" disabled>Rent</button>
                <button id="rentMinus" type="button">-</button>
                <input type="number" id="rentDuration" min="0" max="24" value="0">
                <button id="rentPlus" type="button">+</button>
              </div>
              <div id="rentPriceTotal">Total: 0 ${atlasIcon}</div>
            </div>
          `;

          const inputRentDuration = document.getElementById('rentDuration') as HTMLInputElement;
          const rentMinusButton = document.getElementById('rentMinus') as HTMLButtonElement;
          rentMinusButton.style.backgroundColor = 'darkcyan';
          const rentPlusButton = document.getElementById('rentPlus') as HTMLButtonElement;
          rentPlusButton.style.backgroundColor = 'darkcyan';

          rentMinusButton.onclick = () => {
            inputRentDuration.stepDown();
            inputRentDuration.dispatchEvent(new Event('change'));
          };
          rentPlusButton.onclick = () => {
            inputRentDuration.stepUp();
            inputRentDuration.dispatchEvent(new Event('change'));
          };
          const rentButton = document.getElementById('rentButton') as HTMLButtonElement;
          const rentPriceTotal = document.getElementById('rentPriceTotal') as HTMLDivElement;

          const updateRentPriceTotal = () => {
            const durationMin = Number(contractDetails.duration_min) || 1;
            const durationMax = Number(contractDetails.duration_max) || 24;
            const duration = Number(inputRentDuration.value) || 1;
            if (duration >= durationMin && duration <= durationMax) {
              rentButton.disabled = false;
            } else {
              rentButton.disabled = true;
            }
            const durationValue = Math.max(1, Number.parseInt(inputRentDuration.value, 10) || 1);
            rentPriceTotal.innerHTML = `Total: ${formatRate(durationValue * baseRate)} ${atlasIcon}`;

          };

          //attiviamo event listner sull'on-change dell'input per aggiornare il prezzo totale e abilitare/disabilitare il pulsante di rent in base alla validità della durata inserita
          inputRentDuration.addEventListener('change', () => {
            updateRentPriceTotal();
          });
          inputRentDuration.addEventListener('input', () => {
            updateRentPriceTotal();
          });

          rentButton.addEventListener('click', () => {
            // Prendi il profileId utente connesso
            const contractAddress = contractDetails.address;
            const borrower = (window as any).wallet?.adapter?.publicKey?.toBase58?.() || currentProfileId;
            const borrowerProfile = currentProfileId;
            // Usa i campi definiti in RentalContract
            const starbase = contractDetails.starbase || '';
            const amount = contractDetails.rate || 1;
            const duration = Number.parseInt(inputRentDuration.value, 10);
            // "payment_frequency": "Hourly", "payment_frequency": "Minute"
            const rentPeriod = contractDetails.payment_frequency ? contractDetails.payment_frequency.toLowerCase() : 'day';
            const durationUnit = rentPeriod ?? 'day';
            rentTx({
              contractAddress,
              borrower,
              borrowerProfile,
              starbase,
              amount,
              duration,
              durationUnit,
              onSuccess: async () => {
                // Chiudi la modale
                document.getElementById('rentalContractWindow')?.remove();
                document.getElementsByClassName('rentalContractOverlay')[0]?.remove();
                // Rileggi dalla cache backend e aggiorna rentalStateBackup
                if (!currentProfileId) return;
                const res = await fetch('/api/analyze-profile', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ profileId: currentProfileId, wipeCache: false })
                });
                if (!res.ok) return;
                const data = await res.json();
                const rentalModule = await import('./rentalState_playload');
                rentalModule.rentalState_playload(data);
                const resultDiv = document.getElementById('result-container');
                if (resultDiv && rentalModule.rentalStateBackup) {
                  resultDiv.replaceChildren(rentalModule.rentalStateBackup);
                }
              }
            });
          });
        } else {
          rentalTxDiv.innerHTML = `<span class="status-badge active">Currently Rented</span>`;
        }
      }
    })();
  }

}