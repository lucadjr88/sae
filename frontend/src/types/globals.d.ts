import { Prices } from './details';

declare global {
  interface Window {
    prices?: Prices;
  }
}

declare module './types/details' {
  export * from './details.js';
}

declare module './types/operation-list' {
  export * from './operation-list.js';
}

