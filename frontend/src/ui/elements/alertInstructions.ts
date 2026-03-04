// Modulo per l'alert istruzioni (allert_istruzioni)
// Esporta funzione per creare la struttura reale dell'alert istruzioni

export function createAlertInstructionsElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.id = 'allert_istruzioni';
    div.className = 'container';
    div.innerHTML = `
      <div class="content-column">
        <svg class="info-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <p class="body-medium">
          You can find your profileId in Sage under Player Information and Details in CSS Starbase // Details
        </p>
      </div>
    `;
    return div;
}

// Se serve come stringa HTML (template):
export const alertInstructionsHTML = `
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
