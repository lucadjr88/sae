// src/types/charts.ts
export interface ChartDataItem {
  label: string;
  value: number;
  color: string;
  count: number;
}

export interface PriceData {
  solana: {
    usd: number;
  };
}

// Chart.js type extensions
declare global {
  interface HTMLCanvasElement {
    _chartInstance?: import('chart.js').Chart | null;
  }
}