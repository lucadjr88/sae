// Chart rendering logic extracted from app

import type { ChartDataItem, PriceData } from '../types/charts';

// Use Chart from global window (loaded via CDN in HTML)
declare const Chart: any;

export function drawPieChart(
  canvasId: string,
  legendId: string,
  data: ChartDataItem[],
  prices?: PriceData
): void {
  console.log(`Drawing pie chart: ${canvasId}`, data);

  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const legend = document.getElementById(legendId) as HTMLElement | null;

  // Add null checks
  if (!canvas || !legend) {
    console.error('Canvas or legend element not found');
    return;
  }

  // Destroy previous chart instance if exists
  const canvasAny = canvas as any;
  if (canvasAny._chartInstance) {
    try {
      canvasAny._chartInstance.destroy();
    } catch (error) {
      console.warn('Error destroying previous chart instance:', error);
    }
    canvasAny._chartInstance = null;
  }

  // Prepare data for Chart
  const chartData: any = {
    labels: data.map((item: ChartDataItem) => item.label),
    datasets: [{
      data: data.map((item: ChartDataItem) => item.value),
      backgroundColor: data.map((item: ChartDataItem) => item.color),
      borderWidth: 1
    }]
  };

  // Create pie chart
  const chartInstance = new Chart(canvas, {
    type: 'pie',
    data: chartData,
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: true,
          callbacks: {
            title: function(): string { return ''; },
            label: function(context: any): string {
              try {
                const dataset = context.dataset;
                const value: number = (context.raw as number) || (dataset.data[context.dataIndex] as number) || 0;
                const total: number = dataset.data.reduce((s: number, v: any) => s + (Number(v) || 0), 0);
                const pct: string = total ? ((Number(value) / total) * 100).toFixed(1) + '%' : '0.0%';
                return pct;
              } catch (e) {
                console.error('Tooltip calculation error:', e);
                return '';
              }
            }
          }
        }
      }
    } as any
  });
  canvasAny._chartInstance = chartInstance;

  // Calculate total value for percentage
  const total: number = data.reduce((sum: number, item: ChartDataItem) => sum + item.value, 0);

  // Create legend with format: Nome | Ops | % | SOL
  let legendHtml = '<table>';
  data.forEach((item, index) => {
    const percentage: string = total ? ((item.value / total) * 100).toFixed(1) : '0.0';
    const solValue: string = (item.value / 1e9).toFixed(6);
    const usdValue: string = prices?.solana ? ((item.value / 1e9) * prices.solana.usd).toFixed(2) : '--';

    legendHtml += `
      <tr>
        <td><div style="width: 8px; height: 8px; background: ${item.color}; border-radius: 1px;"></div></td>
        <td>${item.label}</td>
        <td>${item.count} ops</td>
        <td>${percentage}%</td>
        <td>${solValue} SOL <span style="color:#7dd3fc;font-size:13px;">($${usdValue})</span></td>
      </tr>
    `;
  });
  legendHtml += '</table>';
  legend.innerHTML = legendHtml;
}