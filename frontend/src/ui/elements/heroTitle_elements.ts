// Modulo per Hero Title e Hero Subtitle
// Esporta funzioni per creare gli elementi reali usati in index.html e main.ts

import staratlas from '@/assets/staratlas.png';

export function createHeroTitle(): HTMLElement {
    const container = document.createElement('div');
    // Wrapper per titolo e sottotitolo
    const heroDiv = document.createElement('div');
    heroDiv.className = 'hero';
    const heroImg = document.createElement('img');
    heroImg.src = staratlas;
    heroImg.alt = 'Star Atlas Explorer Logo';
    heroImg.className = 'hero-logo';
    heroDiv.appendChild(heroImg);
/*
    const title = document.createElement('div');
    title.className = 'hero-title';
    title.textContent = 'Star Atlas Explorer';

    const subtitle = document.createElement('div');
    subtitle.className = 'hero-subtitle';
    subtitle.textContent = 'POWERED BY THE PEOPLE';*/

    //heroDiv.appendChild(title);
    //heroDiv.appendChild(subtitle);
    container.appendChild(heroDiv);
    return container;
}
