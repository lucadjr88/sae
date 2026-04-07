export interface BaseDialogOptions {
  id: string;
  title: string;
  overlayClassName?: string;
  windowClassName?: string;
  contentClassName?: string;
  closeButtonId?: string;
  zIndex?: string;
  closeOnOverlay?: boolean;
}

export function removeDialogById(id: string, overlaySelector?: string) {
  document.getElementById(id)?.remove();
  if (overlaySelector) {
    document.querySelector(overlaySelector)?.remove();
  }
}

export function renderLoadingCard(message: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'detail-card loading-card';
  container.innerHTML = `
    <div class="spinner-container">
      <div class="spinner"></div>
      <span>${message}</span>
    </div>
  `;
  return container;
}

export function renderErrorCard(message: string, detail?: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'detail-card error-card';
  container.innerHTML = `${message}${detail ? `<br>${detail}` : ''}`;
  return container;
}

export interface BaseDialogHandle {
  overlay: HTMLDivElement;
  windowEl: HTMLDivElement;
  contentEl: HTMLDivElement;
  close: () => void;
}

export function createBaseDialog(options: BaseDialogOptions): BaseDialogHandle {
  const {
    id,
    title,
    overlayClassName = 'rentalContractOverlay',
    windowClassName = 'rental-contract-window',
    contentClassName = 'window-content',
    closeButtonId = `${id}CloseButton`,
    zIndex = '9999',
    closeOnOverlay = true,
  } = options;

  const overlay = document.createElement('div');
  overlay.className = overlayClassName;

  const windowEl = document.createElement('div');
  windowEl.id = id;
  windowEl.className = windowClassName;
  windowEl.style.zIndex = zIndex;

  const headerEl = document.createElement('div');
  headerEl.className = 'window-header';

  const titleEl = document.createElement('h2');
  titleEl.textContent = title;

  const closeButton = document.createElement('button');
  closeButton.id = closeButtonId;
  closeButton.className = 'closeWindow';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.innerHTML = '&times;';

  const contentEl = document.createElement('div');
  contentEl.className = contentClassName;

  const close = () => {
    windowEl.remove();
    overlay.remove();
  };

  if (closeOnOverlay) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });
  }

  closeButton.addEventListener('click', close);

  headerEl.appendChild(titleEl);
  headerEl.appendChild(closeButton);
  windowEl.appendChild(headerEl);
  windowEl.appendChild(contentEl);
  overlay.appendChild(windowEl);
  document.body.appendChild(overlay);

  return {
    overlay,
    windowEl,
    contentEl,
    close,
  };
}


