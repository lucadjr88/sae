import { RentalContract } from './rental_playload';
import { resolveMaterialImageCandidates, resolveResourceCatalogEntry } from './resource_playload';
import { rentTx } from './rental_tx';
import { currentProfileId } from '@/utils/state';
import { normalizeDialogTxResult } from '@/utils/txFlow';
import { TICKER_CONFIG } from './footBar';
import { createBaseDialog, renderErrorCard, renderLoadingCard } from './modal_base';


function formatRate(rate: number): string {
  return rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function setRentalDetailDialogState(
  contentEl: HTMLDivElement,
  state: 'loading' | 'success' | 'error',
  options: { message: string; detail?: string; txSignature?: string }
) {
  contentEl.innerHTML = '';

  if (state === 'loading') {
    contentEl.appendChild(renderLoadingCard(options.message));
    return;
  }

  if (state === 'error') {
    contentEl.appendChild(renderErrorCard(options.message, options.detail));
    return;
  }

  const successCard = document.createElement('div');
  successCard.className = 'detail-card success-card';

  const messageEl = document.createElement('h3');
  messageEl.textContent = options.message;
  successCard.appendChild(messageEl);

  if (options.txSignature) {
    const signatureLabel = document.createElement('p');
    signatureLabel.textContent = 'Tx Signature:';

    const signatureEl = document.createElement('p');
    signatureEl.textContent = options.txSignature;
    signatureEl.style.wordBreak = 'break-all';
    signatureEl.style.cursor = 'pointer';
    signatureEl.style.color = 'blue';
    signatureEl.style.backgroundColor = '#8a2be25c';
    signatureEl.style.padding = '8px';
    signatureEl.style.borderRadius = '6px';
    signatureEl.title = 'Click to copy';

    const hintEl = document.createElement('p');
    hintEl.style.fontSize = '0.9em';
    hintEl.style.color = '#555';
    hintEl.textContent = '(Click the tx hash to copy)';

    signatureEl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(options.txSignature || '');
        hintEl.textContent = 'Copied to clipboard.';
      } catch {
        hintEl.textContent = 'Copy unavailable in this browser context.';
      }
    });

    const explorerLink = document.createElement('a');
    explorerLink.href = `https://solscan.io/tx/${options.txSignature}`;
    explorerLink.target = '_blank';
    explorerLink.rel = 'noopener noreferrer';
    explorerLink.textContent = 'Open on Solscan';

    successCard.appendChild(signatureLabel);
    successCard.appendChild(signatureEl);
    successCard.appendChild(hintEl);
    successCard.appendChild(explorerLink);
  }

  contentEl.appendChild(successCard);
}

// Funzione per creare la finestra dei dettagli del contratto da aprire al click su nome fleet e a cui passare i dettagli del contratto da visualizzare
export function createRentalContractWindow(fleetName: string, contractDetails: RentalContract) {
  const rate = formatRate(contractDetails.rate);
  const composition = contractDetails.fleet_composition ?? '-';
  // Esempio se vuoi trasformare la virgola in un a capo visivo
  const formattedComposition = composition.split(',').join('<br>');

  const { contentEl, close } = createBaseDialog({
    id: 'rentalContractWindow',
    title: 'Rental Contract Details',
    closeButtonId: 'closeWindow',
  });

  contentEl.innerHTML = `
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
  `;

  // riempiamo la sezione dei dettagli aggiuntivi con un template di caricamento e poi con la risposta API
  const additionalDetails = contentEl.querySelector('#additionalDetails') as HTMLDivElement | null;
  if (additionalDetails) {
    const loadingCard = renderLoadingCard('Loading Fleet Details...');
    additionalDetails.appendChild(loadingCard);


    // chiamata minimale al backend via fetch condivisa col frontend
    (async () => {
      try {
        const fleetId = contractDetails.fleet;
        const res = await fetch(`/api/getFleetInfoMinimal?fleetId=${encodeURIComponent(fleetId)}&profileId=${encodeURIComponent(currentProfileId || '')}`);
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
          const errorMessage = e instanceof Error ? e.message : String(e);
          additionalDetails.innerHTML = '';
          const errorCard = renderErrorCard('Error rendering fleet details:', errorMessage);
          additionalDetails.appendChild(errorCard);
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        additionalDetails.innerHTML = '';
        const errorCard = renderErrorCard('Errore caricamento dettagli fleet.', errorMessage);
        additionalDetails.appendChild(errorCard);
      } finally {
        // carica rental tx inserendo un input text numerico ed un pulsante "rent"
        // solo se const state = c.current_rental_state ? 'Active' : 'Available'; è "Available"
        const state = contractDetails.current_rental_state ? 'Active' : 'Available';
        const rentalTxDiv = contentEl.querySelector('.rental-tx') as HTMLDivElement | null;
        const atlasIcon = `<img style="width: 25%" src="${TICKER_CONFIG.find(c => c.id === 'star-atlas')?.img}"/>`;

        if (!rentalTxDiv) {
          return;
        }

        if (state === 'Available') {
          const baseRate = Number(contractDetails.rate || 0);

          rentalTxDiv.innerHTML = `
              <div class="custom-number-input">
                <button id="rentButton" disabled>Rent</button>
                <button id="rentMinus" type="button">-</button>
                <input type="number" id="rentDuration" min="0" max="24" value="0">
                <button id="rentPlus" type="button">+</button>
              </div>
              <div id="rentPriceTotal">Total: 0 ${atlasIcon}</div>
          `;

          const inputRentDuration = contentEl.querySelector('#rentDuration') as HTMLInputElement | null;
          const rentMinusButton = contentEl.querySelector('#rentMinus') as HTMLButtonElement | null;
          const rentPlusButton = contentEl.querySelector('#rentPlus') as HTMLButtonElement | null;
          const rentButton = contentEl.querySelector('#rentButton') as HTMLButtonElement | null;
          const rentPriceTotal = contentEl.querySelector('#rentPriceTotal') as HTMLDivElement | null;

          if (!inputRentDuration || !rentMinusButton || !rentPlusButton || !rentButton || !rentPriceTotal) {
            return;
          }

          rentMinusButton.style.backgroundColor = 'darkcyan';
          rentPlusButton.style.backgroundColor = 'darkcyan';

          rentMinusButton.onclick = () => {
            inputRentDuration.stepDown();
            inputRentDuration.dispatchEvent(new Event('change'));
          };
          rentPlusButton.onclick = () => {
            inputRentDuration.stepUp();
            inputRentDuration.dispatchEvent(new Event('change'));
          };

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

          inputRentDuration.addEventListener('change', () => {
            updateRentPriceTotal();
          });
          inputRentDuration.addEventListener('input', () => {
            updateRentPriceTotal();
          });

          const submitRent = async () => {
            const contractAddress = String(contractDetails.address || '').trim();
            const borrower = ((window as any).wallet?.adapter?.publicKey?.toBase58?.() || currentProfileId || '').trim();
            const borrowerProfile = String(currentProfileId || '').trim();
            const starbase = contractDetails.starbase || '';
            const amount = contractDetails.rate || 1;
            const durationMin = Number(contractDetails.duration_min) || 1;
            const durationMax = Number(contractDetails.duration_max) || 24;
            const duration = Number.parseInt(inputRentDuration.value, 10);
            const rentPeriod = contractDetails.payment_frequency ? contractDetails.payment_frequency.toLowerCase() : 'day';
            const durationUnit = rentPeriod ?? 'day';

            if (!contractAddress) {
              setRentalDetailDialogState(contentEl, 'error', {
                message: 'Unable to rent fleet',
                detail: 'Contract address not available.',
              });
              return;
            }

            if (!borrower) {
              setRentalDetailDialogState(contentEl, 'error', {
                message: 'Unable to rent fleet',
                detail: 'Wallet not connected.',
              });
              return;
            }

            if (!borrowerProfile) {
              setRentalDetailDialogState(contentEl, 'error', {
                message: 'Unable to rent fleet',
                detail: 'Profile ID not available.',
              });
              return;
            }

            if (!Number.isFinite(duration) || duration < durationMin || duration > durationMax) {
              setRentalDetailDialogState(contentEl, 'error', {
                message: 'Unable to rent fleet',
                detail: `Duration must be between ${durationMin} and ${durationMax}.`,
              });
              return;
            }

            rentButton.disabled = true;
            rentMinusButton.disabled = true;
            rentPlusButton.disabled = true;
            inputRentDuration.disabled = true;
            setRentalDetailDialogState(contentEl, 'loading', { message: 'Sending rent transaction...' });

            const result = await rentTx({
              contractAddress,
              borrower,
              borrowerProfile,
              starbase,
              amount,
              duration,
              durationUnit,
            });

            const normalizedResult = normalizeDialogTxResult(result);
            if (normalizedResult.state === 'success') {
              setRentalDetailDialogState(contentEl, 'success', {
                message: 'Fleet rented successfully!',
                txSignature: normalizedResult.txSignature,
              });

              setTimeout(async () => {
                close();
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
              }, 5000);
              return;
            }

            setRentalDetailDialogState(contentEl, 'error', {
              message: 'Failed to rent fleet',
              detail: normalizedResult.detail,
            });
          };

          rentButton.addEventListener('click', () => {
            void submitRent();
          });
        } else {
          rentalTxDiv.innerHTML = `<span class="status-badge active">Currently Rented</span>`;
        }
      }
    })();
  }

}