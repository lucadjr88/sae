function drawPieChart(canvasId, legendId, data, prices) {
  console.log(`Drawing pie chart: ${canvasId}`, data);
  const canvas = document.getElementById(canvasId);
  const legend = document.getElementById(legendId);
  if (!canvas || !legend) {
    console.error("Canvas or legend element not found");
    return;
  }
  const canvasAny = canvas;
  if (canvasAny._chartInstance) {
    try {
      canvasAny._chartInstance.destroy();
    } catch (error) {
      console.warn("Error destroying previous chart instance:", error);
    }
    canvasAny._chartInstance = null;
  }
  const chartData = {
    labels: data.map((item) => item.label),
    datasets: [{
      data: data.map((item) => item.value),
      backgroundColor: data.map((item) => item.color),
      borderWidth: 1
    }]
  };
  const chartInstance = new Chart(canvas, {
    type: "pie",
    data: chartData,
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: true,
          callbacks: {
            title: function() {
              return "";
            },
            label: function(context) {
              try {
                const dataset = context.dataset;
                const value = context.raw || dataset.data[context.dataIndex] || 0;
                const total2 = dataset.data.reduce((s, v) => s + (Number(v) || 0), 0);
                const pct = total2 ? (Number(value) / total2 * 100).toFixed(1) + "%" : "0.0%";
                return pct;
              } catch (e) {
                console.error("Tooltip calculation error:", e);
                return "";
              }
            }
          }
        }
      }
    }
  });
  canvasAny._chartInstance = chartInstance;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let legendHtml = "<table>";
  data.forEach((item, index) => {
    const percentage = total ? (item.value / total * 100).toFixed(1) : "0.0";
    const solValue = (item.value / 1e9).toFixed(6);
    const usdValue = prices?.solana ? (item.value / 1e9 * prices.solana.usd).toFixed(2) : "--";
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
  legendHtml += "</table>";
  legend.innerHTML = legendHtml;
}
export {
  drawPieChart
};
