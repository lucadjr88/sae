import { Prices } from './details';

declare global {
  interface Window {
    prices?: Prices;
  }

  function copyToClipboard(text: string, event?: Event): void;
  function toggleFleet(fleetId: string): void;
}