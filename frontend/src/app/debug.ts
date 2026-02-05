// Enable debug mode globally for development
declare global {
  interface Window {
    DEBUG_MODE?: boolean;
  }
}

window.DEBUG_MODE = true;

export {};

