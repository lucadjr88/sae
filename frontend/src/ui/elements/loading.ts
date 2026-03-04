// Modulo per l'elemento di loading
// Esporta funzione per creare la struttura reale dell'elemento di loading
import { progressInterval, setAnalysisStartTime, setProgressInterval } from '@utils/state';

export function createLoadingElement(message: string): HTMLDivElement {
    const div = document.createElement('div');
    div.className = 'loading';
    div.id = 'loading';
    div.innerHTML = message + '<span id="secondsSpan">- 0s</span>';

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
