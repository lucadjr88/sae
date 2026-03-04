// Modulo per i pulsanti di start (wallet connect e enter no wallet)
// Esporta funzione per creare la struttura reale dei pulsanti di start

import seedvaultIcon from '../../assets/icons/seedvault2.png';

export function createStartButtonsElement(): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'start-buttons';
    div.innerHTML = `
      <button class="start-button" id="connectWalletBtn">
        <span class="start-button__icon">
          <img src="${seedvaultIcon}" alt="Connect wallet">
        </span>
        <span class="start-button__label">CONNECT WALLET</span>
      </button>
      <button class="start-button is-muted" id="enterNoWalletBtn">
        <span class="start-button__icon">
          <img src="${seedvaultIcon}" alt="Enter without wallet">
        </span>
        <span class="start-button__label">ENTER NO WALLET</span>
      </button>

    `;
    return div;
}

