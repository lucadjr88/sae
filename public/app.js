// Main application logic for SAGE Fleet Fees Analysis

async function analyzeFees() {
  const profileId = document.getElementById('profileId').value.trim();
  const resultsDiv = document.getElementById('results');
  const btn = document.getElementById('analyzeBtn');
  
  if (!profileId) {
    alert('Inserisci un Player Profile ID!');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Loading...';
  resultsDiv.innerHTML = '<div class="loading">Processing transaction data...</div>';

  try {
    // Get fleets first to derive wallet from transactions
    console.log('Fetching fleets for profile:', profileId);
    const fleetsResponse = await fetch('/api/fleets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId })
    });
    
    if (!fleetsResponse.ok) {
      throw new Error('Failed to fetch fleets');
    }
    
    const fleetsData = await fleetsResponse.json();
    
    if (!fleetsData.walletAuthority) {
      throw new Error('Could not derive wallet from fleet transactions');
    }
    
    const walletPubkey = fleetsData.walletAuthority;
    const fleets = fleetsData.fleets;
    
    console.log('Derived wallet:', walletPubkey);
    console.log('Fleets found:', fleets.length);
    
    // Collect all fleet-related accounts
    const allFleetAccounts = [];
    const fleetNames = {};
    
    fleets.forEach(f => {
      // Main accounts
      allFleetAccounts.push(f.data.fleetShips);
      allFleetAccounts.push(f.key);
      
      // Fuel, ammo, cargo
      if (f.data.fuelTank) allFleetAccounts.push(f.data.fuelTank);
      if (f.data.ammoBank) allFleetAccounts.push(f.data.ammoBank);
      if (f.data.cargoHold) allFleetAccounts.push(f.data.cargoHold);
      
      // Map names
      fleetNames[f.data.fleetShips] = f.callsign;
      fleetNames[f.key] = f.callsign;
      if (f.data.fuelTank) fleetNames[f.data.fuelTank] = f.callsign;
      if (f.data.ammoBank) fleetNames[f.data.ammoBank] = f.callsign;
      if (f.data.cargoHold) fleetNames[f.data.cargoHold] = f.callsign;
    });
    
    const uniqueFleetAccounts = [...new Set(allFleetAccounts)];
    console.log('Fleet accounts collected:', uniqueFleetAccounts.length);
    
    // Get detailed fees
    console.log('Fetching detailed fees...');
    const response = await fetch('/api/wallet-sage-fees-detailed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        walletPubkey, 
        fleetAccounts: uniqueFleetAccounts,
        fleetNames: fleetNames,
        hours: 24 
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Analysis failed');
    }
    
    console.log('Analysis complete. Transactions:', data.transactionCount24h);
    
    // Display results
    displayResults(data, fleetNames);
    
  } catch (error) {
    console.error('Analysis error:', error);
    resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Analyze 24h';
  }
}

function displayResults(data, fleetNames) {
  console.log('Displaying results...');
  const resultsDiv = document.getElementById('results');
  
  // Prepare data for charts
  const sortedFleets = Object.entries(data.feesByFleet)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .slice(0, 5); // Top 5 fleets
  
  const sortedOps = Object.entries(data.feesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .slice(0, 5); // Top 5 operations
  
  const fleetColors = ['#34d399', '#60a5fa', '#f59e0b', '#a78bfa', '#ec4899'];
  const opColors = ['#06b6d4', '#8b5cf6', '#f97316', '#10b981', '#fbbf24'];
  
  console.log('Top 5 fleets:', sortedFleets.map(([name, data]) => ({ name: fleetNames[name] || name, fee: data.totalFee })));
  console.log('Top 5 operations:', sortedOps.map(([name, data]) => ({ name, fee: data.totalFee })));
  
  let html = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Transactions</div>
        <div class="stat-value">${data.transactionCount24h}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Fees</div>
        <div class="stat-value highlight">${(data.sageFees24h / 1e9).toFixed(6)} SOL</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-card">
        <div class="chart-title">Fees by Fleet (Top 5)</div>
        <div class="chart-container">
          <canvas id="fleetChart" class="pie-chart"></canvas>
          <div class="chart-legend" id="fleetLegend"></div>
        </div>
      </div>
      <div class="chart-card">
        <div class="chart-title">Fees by Operation (Top 5)</div>
        <div class="chart-container">
          <canvas id="operationChart" class="pie-chart"></canvas>
          <div class="chart-legend" id="operationLegend"></div>
        </div>
      </div>
    </div>

    <h2 class="section-title">Fleet Breakdown</h2>
    <div id="fleetList"></div>

    <h2 class="section-title">Operations Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Operation</th>
          <th class="num">Count</th>
          <th class="num">Total (SOL)</th>
          <th class="num">Avg (SOL)</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  Object.entries(data.feesByOperation)
    .sort((a, b) => b[1].totalFee - a[1].totalFee)
    .forEach(([operation, stats]) => {
      html += `
        <tr>
          <td class="fleet-name">${operation}</td>
          <td class="num">${stats.count}</td>
          <td class="fee-value num">${(stats.totalFee / 1e9).toFixed(6)}</td>
          <td class="num">${(stats.avgFee / 1e9).toFixed(6)}</td>
        </tr>
      `;
    });
  
  html += `
      </tbody>
    </table>
  `;
  
  resultsDiv.innerHTML = html;
  
  // Create fleet list with fold/unfold
  createFleetList(data, fleetNames);
  
  // Draw pie charts
  drawPieChart('fleetChart', 'fleetLegend', sortedFleets.map(([name, data], index) => ({
    label: fleetNames[name] || name,
    value: data.totalFee,
    count: data.totalOperations,
    color: fleetColors[index]
  })));
  
  drawPieChart('operationChart', 'operationLegend', sortedOps.map(([name, data], index) => ({
    label: name,
    value: data.totalFee,
    count: data.count,
    color: opColors[index]
  })));
  
  console.log('Results displayed successfully');
}

function createFleetList(data, fleetNames) {
  const fleetListDiv = document.getElementById('fleetList');
  const sortedFleets = Object.entries(data.feesByFleet)
    .sort((a, b) => b[1].totalFee - a[1].totalFee);
  
  let html = '';
  sortedFleets.forEach(([fleetAccount, fleetData]) => {
    const fleetName = fleetNames[fleetAccount] || fleetAccount;
    const fleetId = 'fleet-' + fleetAccount.substring(0, 8);
    
    html += `
      <div class="fleet-item" onclick="toggleFleet('${fleetId}')">
        <div class="fleet-header">
          <div class="fleet-name">${fleetName} <span style="color: #7a8ba0; font-size: 10px;">(${fleetData.totalOperations} ops)</span></div>
          <div class="fleet-fee">${(fleetData.totalFee / 1e9).toFixed(6)} SOL</div>
          <div class="fleet-percent">${(fleetData.feePercentage * 100).toFixed(1)}%</div>
        </div>
        <div class="fleet-details" id="${fleetId}">
          <table class="fleet-ops-table">
    `;
    
    Object.entries(fleetData.operations)
      .sort((a, b) => b[1].totalFee - a[1].totalFee)
      .forEach(([op, stats]) => {
        html += `
          <tr>
            <td>${op}</td>
            <td>${stats.count}x</td>
            <td>${(stats.totalFee / 1e9).toFixed(6)} SOL</td>
            <td>${(stats.percentageOfFleet * 100).toFixed(1)}%</td>
          </tr>
        `;
      });
    
    html += `
          </table>
        </div>
      </div>
    `;
  });
  
  fleetListDiv.innerHTML = html;
}

function toggleFleet(fleetId) {
  const fleetItem = document.getElementById(fleetId).parentElement;
  fleetItem.classList.toggle('expanded');
}

function drawPieChart(canvasId, legendId, data) {
  console.log(`Drawing pie chart: ${canvasId}`, data);
  
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext('2d');
  const legend = document.getElementById(legendId);
  
  // Set canvas size with higher resolution
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 100 * dpr;
  canvas.height = 100 * dpr;
  canvas.style.width = '100px';
  canvas.style.height = '100px';
  ctx.scale(dpr, dpr);
  
  const centerX = 50;
  const centerY = 50;
  const radius = 45;
  
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  let currentAngle = -Math.PI / 2; // Start at top
  
  // Draw pie slices
  data.forEach((item, index) => {
    const sliceAngle = (item.value / total) * 2 * Math.PI;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = item.color;
    ctx.fill();
    
    // Add subtle border between slices
    ctx.strokeStyle = '#0b0e1a';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    currentAngle += sliceAngle;
  });
  
  // Create legend
  let legendHtml = '';
  data.forEach((item, index) => {
    const percentage = ((item.value / total) * 100).toFixed(1);
    const solValue = (item.value / 1e9).toFixed(6);
    const countText = item.count ? ` • ${item.count} ops` : '';
    legendHtml += `
      <div class="legend-item">
        <div class="legend-color" style="background: ${item.color}"></div>
        <div class="legend-label">${item.label}${countText}</div>
        <div class="legend-value">${solValue} SOL</div>
        <div class="legend-percentage">${percentage}%</div>
      </div>
    `;
  });
  legend.innerHTML = legendHtml;
}
