import { currentProfileId } from '@/utils/state';
import { createLoadingElement, updateProgress, setLoadingBackgroundState } from './loading';
import { rentalStateBackup } from './rentalState_playload';
import refresh_icon from '@/assets/icons/refresh_button.png';
import { createRentalContractWindow } from './rental_detail';

// creiamo un dom da esportare come copia backup
//export let rentalContractsBackup: HTMLElement | null = null;

export interface RentalContract {
  address: string;
  owner: string;
  owner_profile: string;
  fleet: string;
  fleet_name?: string;
  fleet_composition?: string;
  starbase?: 'mud' | 'oni' | 'ustur';
  game_id: string;
  rate: number;
  duration_min: number;
  duration_max: number;
  payment_frequency: string;
  to_close: boolean;
  current_rental_state: string | null;
  rental_start_time?: number;
  fuel_level?: number;
  rental_end_time?: number;
  owner_token_account: string;
  crew_count?: number;
  rented_crew?: number;
  cargo_hold?: string;
  cargo_stats?: {
    cargo_capacity: number;
    // altri campi se vuoi
  };
}

function formatRate(rate: number): string {
  return rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/*function formatTs(ts: number | undefined): string {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}*/

// DIV CONTENITORE FILTRI E ORDINAMENTO
// Aggiungiamo il parametro callback
function createFilterBar(onFilterChange: (
  faction: string,
  fleet: string,
  logic: 'OR' | 'AND',
  state: string,
  minRate: number,
  maxRate: number,
  rateEnabled: boolean
) => void): HTMLDivElement {
  ///// VARIABILI DI STATO PER IL FILTRO RATE
  // Variabili di stato interne alla barra per ricordare cosa è selezionato
  let currentFaction = 'all';
  let currentFleetTerm = '';
  let currentLogic: 'OR' | 'AND' = 'OR'; // Default a OR
  let currentState = 'all';
  let minRate = 0;
  let maxRate = Infinity;
  let rateEnabled = false;


  const update = () => {
    onFilterChange(currentFaction, currentFleetTerm, currentLogic, currentState, minRate, maxRate, rateEnabled);
  };

  const filterBar = document.createElement('div');
  filterBar.className = 'rental-filter-bar';



  //1. FILTRO STATO (ALL, ACTIVE, AVAILABLE)
  const stateFilter = document.createElement('div');
  stateFilter.className = 'state-filter';
  stateFilter.innerHTML = `
    <label><input type="radio" name="state" value="all" checked> All</label>
    <label><input type="radio" name="state" value="active"> Active</label>
    <label><input type="radio" name="state" value="available"> Available</label>
  `;
  stateFilter.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'state') {
      currentState = target.value; // Aggiorno lo stato locale
      update(); // Invio entrambi i valori
    }
  });

  // 2. FILTRO STARBASE
  const sbFilter = document.createElement('div');
  sbFilter.className = 'starbase-filter';
  sbFilter.innerHTML = `
    <label><input type="radio" name="starbase" value="all" checked> All</label>
    <label><input type="radio" name="starbase" value="mud"> MUD</label>
    <label><input type="radio" name="starbase" value="oni"> ONI</label>
    <label><input type="radio" name="starbase" value="ustur"> USTUR</label>
  `;
  sbFilter.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.name === 'starbase') {
      currentFaction = target.value; // Aggiorno lo stato locale
      update(); // Invio entrambi i valori
    }
  });

  // 3. FILTRO FLEET (TEXT)
  const fleetFilter = document.createElement('div');
  fleetFilter.className = 'fleet-filter';
  fleetFilter.innerHTML = `
    <div class="input-group">
      <label>Ships (comma separated):</label>
      <input type="text" id="fleet-search" placeholder="e.g. Opod, Om">
    </div>
    <div class="logic-selector">
      <label><input type="radio" name="logic" value="OR" checked> OR</label>
      <label><input type="radio" name="logic" value="AND"> AND</label>
    </div>
  `;

  // Listener per il testo
  fleetFilter.querySelector('input')?.addEventListener('input', (e) => {
    currentFleetTerm = (e.target as HTMLInputElement).value;
    update();
  });

  // Listener per la logica (AND/OR)
  fleetFilter.querySelectorAll('input[name="logic"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentLogic = (e.target as HTMLInputElement).value as 'OR' | 'AND';
      update();
    });
  });

  // 4. Filtro rate (2 input sovrapposti per min e max ed un checkbox per attivare/disattivare il filtro) 


  const rateFilter = document.createElement('div');
  rateFilter.className = 'rate-filter';
  rateFilter.innerHTML = `
    <label><input type="checkbox" id="rate-filter-toggle"> Filter Rate</label>
    <div class="rate-inputs" style="display: flex; margin-top: 10px;">
      <input type="number" id="min-rate" placeholder="Min" style="width: 80px">
      <input type="number" id="max-rate" placeholder="Max" style="width: 80px">
    </div>
  `;

  const rateToggle = rateFilter.querySelector('#rate-filter-toggle') as HTMLInputElement;
  const minInput = rateFilter.querySelector('#min-rate') as HTMLInputElement;
  const maxInput = rateFilter.querySelector('#max-rate') as HTMLInputElement;

  // Toggle per attivare/disattivare il filtro
  rateToggle.addEventListener('change', () => {
    rateEnabled = rateToggle.checked;
    update();
  });

  // Listener per i valori numerici
  minInput.addEventListener('input', () => {
    minRate = minInput.value === '' ? 0 : parseFloat(minInput.value);
    update();
  });

  maxInput.addEventListener('input', () => {
    maxRate = maxInput.value === '' ? Infinity : parseFloat(maxInput.value);
    update();
  });



  filterBar.appendChild(stateFilter);
  filterBar.appendChild(sbFilter);
  filterBar.appendChild(fleetFilter);
  filterBar.appendChild(rateFilter);
  return filterBar;
}
// Variabili di stato per il sorting
let currentSortCol: string | null = null;
let isAsc = true;

function buildTable(contracts: RentalContract[]) {
  let currentData = [...contracts]; // Copia locale dei dati originali
  let filteredData = [...contracts]; // Dati attualmente visualizzati (dopo filtro)

  const table = document.createElement('table');
  table.className = 'rental-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th data-key="fleet_name">Fleet</th>
    <th data-key="starbase">Starbase</th>
    <th data-key="rate">Rate</th>
    <th>Composition</th>
    <th data-key="current_rental_state">State</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  table.appendChild(tbody);

  // Funzione di rendering
  const renderBody = (data: RentalContract[]) => {
    tbody.innerHTML = '';
    data.forEach(c => {
      const tr = document.createElement('tr');
      const state = c.current_rental_state ? 'Active' : 'Available';
      const stateClass = c.current_rental_state ? 'state-active' : 'state-available';

      tr.innerHTML = `
        <td id="fleet_${c.fleet}" title="${c.fleet}">${c.fleet_name ?? c.fleet.slice(0, 8) + '…'}</td>
        <td>${c.starbase?.toUpperCase() ?? '-'}</td>
        <td style="font-weight:bold">${formatRate(c.rate)}</td>
        <td class="composition-cell" title="${c.fleet_composition ?? '-'}">${c.fleet_composition ?? '-'}</td>
        <td><span class="state-pill ${stateClass}">${state}</span></td>
      `;
      tbody.appendChild(tr);
      // Aggiungiamo un event listener alla cella della fleet per aprire la finestra dei dettagli al click
      const fleetCell = tr.querySelector(`#fleet_${c.fleet}`) as HTMLElement;
      fleetCell.addEventListener('click', () => {
        createRentalContractWindow(c.fleet_name ?? c.fleet, c);
      });
    });
  };

  // Logica di ordinamento (corretta per usare filteredData)
  thead.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const key = target.getAttribute('data-key') as keyof RentalContract;
    if (!key) return;

    isAsc = (currentSortCol === key) ? !isAsc : true;
    currentSortCol = key;

    filteredData.sort((a, b) => {
      let valA = a[key] ?? '';
      let valB = b[key] ?? '';
      if (typeof valA === 'number' && typeof valB === 'number') {
        return isAsc ? valA - valB : valB - valA;
      }
      return isAsc ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
    });

    renderBody(filteredData);
  });

  // Render iniziale
  renderBody(filteredData);

  // RESTITUIAMO sia la tabella che una funzione per aggiornarla
  return {
    tableElement: table,
    applyFilter: (faction: string, fleet: string, logic: 'OR' | 'AND', state: string, minRate: number, maxRate: number, rateEnabled: boolean) => {
      let results = [...currentData];

      // Filtro Fazione
      if (faction !== 'all') {
        results = results.filter(c => c.starbase?.toLowerCase() === faction.toLowerCase());
      }

      // Filtro Fleet con logica dinamica
      if (fleet.trim() !== "") {
        const searchTerms = fleet.toLowerCase().split(',').map(t => t.trim()).filter(t => t !== "");

        results = results.filter(c => {
          const composition = c.fleet_composition?.toLowerCase() ?? "";

          if (logic === 'OR') {
            // Almeno uno dei termini deve essere presente
            return searchTerms.some(term => composition.includes(term));
          } else {
            // Tutti i termini devono essere presenti
            return searchTerms.every(term => composition.includes(term));
          }
        });
      }

      // Filtro Stato
      if (state !== 'all') {
        results = results.filter(c => {
          const isActive = c.current_rental_state ? 'active' : 'available';
          return isActive === state.toLowerCase();
        });
      }

      // Filtro Rate
      if (rateEnabled) {
        results = results.filter(c => c.rate >= minRate && c.rate <= maxRate);
      }

      filteredData = results;
      renderBody(filteredData);
    }


  };
}

// accettiamo opzionalmente il parametro wipecache=true per forzare il refresh dei dati (utile durante lo sviluppo)
export async function fetchAndDisplayRentals(wipecache: boolean = false): Promise<void> {

  const resultDiv = document.getElementById('result-container');
  //console.log(rentalContractsBackup);
  //if (rentalContractsBackup == null) {
  if (!resultDiv) return;
  resultDiv.replaceChildren(); // Pulisce il contenuto precedente

  createLoadingElement('Loading rental contracts...').appendChild(document.createElement('br'));
  resultDiv.appendChild(createLoadingElement('Loading rental contracts...'));
  updateProgress();

  const container = document.createElement('div');

  try {
    const params = new URLSearchParams({
      state: 'all',
      //limit: '1000',
    });

    if (currentProfileId) {
      params.set('profileId', currentProfileId);
    }
    if (wipecache) {
      params.set('wipecache', 'true');
    }


    console.log('[fetchAndDisplayRentals] Richiesta rental contracts', { params: params.toString() });

    const res = await fetch(`/api/rentals/contracts?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contractsData: { contracts: RentalContract[]; total: number; createdAt?: string | number; } = await res.json();


    // Supporta sia stringa ISO che timestamp numerico
    let dateObj: Date;
    if (typeof contractsData.createdAt === 'number') {
      dateObj = new Date(contractsData.createdAt * 1000);
    } else {
      dateObj = new Date(contractsData.createdAt);
    }
    // calcola age dalla data di creazione per mostrare ore, minuti
    const now = new Date();
    const ageMs = now.getTime() - dateObj.getTime();
    const ageMinutes = Math.floor(ageMs / 60000);
    const ageHours = Math.floor(ageMinutes / 60);
    const ageDisplay = ageHours > 0 ? `${ageHours}h ${ageMinutes % 60}m ago` : `${ageMinutes}m ago`;



    container.id = 'rentalResults';

    // Header con titolo e data creazione
    const headerRow = document.createElement("div");
    headerRow.classList.add("rentalState-header");
    headerRow.innerHTML = `<h2>Rental Contracts <span class="rental-count">(${contractsData.total})</span> - Age: ${ageDisplay}</h2>`;
    container.appendChild(headerRow);



    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'row';
    buttonContainer.style.gap = '10px';
    headerRow.appendChild(buttonContainer);

    const reloadButton = document.createElement("button");
    reloadButton.id = "reloadButton";
    reloadButton.innerHTML = '<img src="' + refresh_icon + '" alt="Reload" style="width:16px;height:16px;">';
    buttonContainer.appendChild(reloadButton);

    reloadButton.addEventListener("click", async () => {
      //rentalContractsBackup = null; // Resettiamo il backup per forzare il reload dei dati
      resultDiv.replaceChildren(); // Pulisce il contenuto precedente
      await fetchAndDisplayRentals(true); // Ricarichiamo i dati
    });

    const rentalProgramButton = document.createElement("button");
    rentalProgramButton.id = "rentalProgramButton";
    rentalProgramButton.textContent = "Your Rentals";
    buttonContainer.appendChild(rentalProgramButton);

    rentalProgramButton.addEventListener("click", async () => {
      if (rentalStateBackup) {
        resultDiv.replaceChildren(rentalStateBackup);
      }
    });



    if (contractsData.contracts.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No contracts found.';
      container.appendChild(empty);
    } else {
      const filterBar = createFilterBar((faction, fleet, logic, state, minRate, maxRate, rateEnabled) => {
        table.applyFilter(faction, fleet, logic, state, minRate, maxRate, rateEnabled);
      });
      container.appendChild(filterBar);

      const table = buildTable(contractsData.contracts);
      container.appendChild(table.tableElement);
    }

    setLoadingBackgroundState(false);
    //rentalContractsBackup = container as HTMLElement;
  } catch (error) {
    const errDiv = document.createElement('div');
    errDiv.className = 'rental-error';
    errDiv.textContent = `Error loading rental data: ${error instanceof Error ? error.message : String(error)}`;
    resultDiv.replaceChildren(errDiv);
  }
  resultDiv.replaceChildren(container);
}

