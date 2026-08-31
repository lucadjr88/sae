// Modulo per inserire lo sfondo di background e la versione app
// Crea e restituisce un elemento contenente lo sfondo e la versione

import backgroundImage from '@/assets/wp14018865-4k-earth-pc-wallpapers.jpg';

export function createBackground(): HTMLElement {
    // Crea il div di background
    const bgDiv = document.createElement('div');
    bgDiv.className = 'background-image';
    bgDiv.style.backgroundImage = `url('${backgroundImage}')`;
    
    // App version
    const versionDiv = document.createElement('div');
    versionDiv.className = 'app-version';
    versionDiv.textContent = 'Sae v1.6';

    // Wrapper per entrambi
    const wrapper = document.createElement('div');
    wrapper.appendChild(bgDiv);
    wrapper.appendChild(versionDiv);
    return wrapper;
}
