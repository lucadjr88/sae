// Chart rendering logic extracted from app.js

export function drawPieChart(canvasId, legendId, data, prices) {
  console.log(`Drawing pie chart: ${canvasId}`, data);
  const canvas = document.getElementById(canvasId);
  const legend = document.getElementById(legendId);

  // Destroy previous chart instance if exists
  if (canvas._chartInstance) {
    canvas._chartInstance.destroy();
    canvas._chartInstance = null;
  }

  // Prepare data for Chart.js
  const chartData = {
    labels: data.map(item => item.label),
    datasets: [{
      data: data.map(item => item.value),
      backgroundColor: data.map(item => item.color),
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
          // Show only color swatch + percentage (no title, no label name)
          displayColors: true,
          callbacks: {
            title: function() { return ''; },
            label: function(context) {
              try {
                const dataset = context.dataset;
                const value = context.raw || dataset.data[context.dataIndex] || 0;
                const total = dataset.data.reduce((s, v) => s + (Number(v) || 0), 0);
                const pct = total ? ((Number(value) / total) * 100).toFixed(1) + '%' : '0.0%';
                return `${pct}`;
              } catch (e) { return ''; }
            }
          }
        }
      }
    }
  });
  canvas._chartInstance = chartInstance;

  // Calculate total value for percentage
  const total = data.reduce((sum, item) => sum + item.value, 0);
  // Create legend with format: Nome | Ops | % | SOL
  let legendHtml = '<table>';
  data.forEach((item, index) => {
    const percentage = total ? ((item.value / total) * 100).toFixed(1) : '0.0';
    const solValue = (item.value / 1e9).toFixed(6);
    legendHtml += `
      <tr>
        <td><div style="width: 8px; height: 8px; background: ${item.color}; border-radius: 1px;"></div></td>
        <td>${item.label}</td>
        <td>${item.count} ops</td>
        <td>${percentage}%</td>
        <td>${solValue} SOL <span style="color:#7dd3fc;font-size:13px;">($${prices && prices.solana ? ((item.value / 1e9) * prices.solana.usd).toFixed(2) : '--'})</span></td>
      </tr>
    `;
  });
  legendHtml += '</table>';
  legend.innerHTML = legendHtml;
}
