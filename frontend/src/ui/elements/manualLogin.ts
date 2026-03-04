// Modulo per il form di login manuale (Manual Search)
// Esporta funzione per creare la struttura reale del form manuale

export function createManualLoginElement(): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.id = 'ricerca_manuale';
    wrapper.innerHTML = `
      <div class="form-box centered">
        <input type="text" id="profileId" placeholder="Player Profile ID" list="profileId-suggestions">
        <datalist id="profileId-suggestions"></datalist>
        <button id="analyzeBtn">Analyze</button>
      </div>
      <div id="results"></div>
      <div id="allert_istruzioni" class="container">
        <div class="content-column">
          <svg class="info-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          <p class="body-medium">
            You can find your profileId in Sage under Player Information and Details in CSS Starbase // Details
          </p>
        </div>
      </div>
    `;
    return wrapper;
}

// Se serve come stringa HTML (template):
export const manualLoginHTML = `
<div id="ricerca_manuale" class="hero">
  <div class="hero-title">Star Atlas Explorer</div>
  <div class="hero-subtitle">POWERED BY THE PEOPLE</div>
  <div class="form-box centered">
    <input type="text" id="profileId" placeholder="Player Profile ID" list="profileId-suggestions">
    <datalist id="profileId-suggestions"></datalist>
    <button id="analyzeBtn">Analyze</button>
  </div>
  <div id="results"></div>
  <div id="allert_istruzioni" class="container">
    <div class="content-column">
      <svg class="info-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
      </svg>
      <p class="body-medium">
        You can find your profileId in Sage under Player Information and Details in CSS Starbase // Details
      </p>
    </div>
  </div>
</div>
`;
