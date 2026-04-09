// Modulo per l'elemento di loading
// Esporta funzione per creare la struttura reale dell'elemento di loading
import { progressInterval, setAnalysisStartTime, setProgressInterval } from '@/utils/state';
import loadingBackgroundGif from '@/assets/sequenza_background.gif';
import personaggio1 from '@/assets/personaggio1.png';

export function setLoadingBackgroundState(isLoading: boolean): void {
    const backgroundElements = document.querySelectorAll<HTMLElement>('.background-image');
    backgroundElements.forEach((backgroundElement) => {
        if (isLoading) {
            if (!backgroundElement.dataset.defaultBackgroundImage) {
                backgroundElement.dataset.defaultBackgroundImage = backgroundElement.style.backgroundImage || '';
            }
            backgroundElement.style.backgroundImage = `url('${loadingBackgroundGif}')`;
            backgroundElement.classList.add('background-image-loading');
            //aggiungiamo il pupazzetto in basso a sinistra frontend/src/assets/personaggio1.png
            const character = document.createElement('img');
            character.src = personaggio1;
            character.className = 'loading-character';
            backgroundElement.appendChild(character);

            return;
        }

        backgroundElement.classList.remove('background-image-loading');
        if (backgroundElement.dataset.defaultBackgroundImage !== undefined) {
            backgroundElement.style.backgroundImage = backgroundElement.dataset.defaultBackgroundImage;
            delete backgroundElement.dataset.defaultBackgroundImage;
        }
    });

    const character2 = document.querySelector('.character2') as HTMLImageElement | null;
    // Rimuoviamo il pupazzetto in basso a sinistra
    if (character2) {
        character2.remove();
    }
    const character3 = document.querySelector('.character3') as HTMLImageElement | null;
    // Rimuoviamo il pupazzetto in basso a destra
    if (character3) {
        character3.remove();
    }

}

export function createLoadingElement(message: string): HTMLDivElement {
    setLoadingBackgroundState(true);
    const div = document.createElement('div');
    div.className = 'loading';
    div.id = 'loading';
    div.innerHTML = message + '<br><span id="secondsSpan">- 0s</span>';

    return div;
}


// Helper to update progress message
export function updateProgress(): void {
    setAnalysisStartTime(Date.now());
    const startTime = Date.now();
    if (progressInterval) clearInterval(progressInterval);
    setProgressInterval(setInterval(() => {
        if (startTime) {
            const seconds = Math.floor((Date.now() - startTime) / 1000);
            const span = document.getElementById('secondsSpan') as HTMLDivElement | null;
            if (span) span.textContent = `(- ${seconds}s)`;
        }
    }, 1000));
}
