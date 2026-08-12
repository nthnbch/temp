// State
let historyData = [];
let activeFilter = '24h'; // '24h', '7d', 'all'
let chart = null;

// DOM Elements
const elLiveTemp = document.getElementById('live-temp');
const elLiveHumidity = document.getElementById('live-humidity');
const elTempUpdated = document.getElementById('temp-updated');
const elHumidityUpdated = document.getElementById('humidity-updated');
const elTempTrend = document.getElementById('temp-trend');
const elHumidityTrend = document.getElementById('humidity-trend');

const elBtnFetch = document.getElementById('btn-fetch');
const elBtnExportCSV = document.getElementById('btn-export-csv');
const elBtnExportJSON = document.getElementById('btn-export-json');
const officeSelect = document.getElementById('office-select');
const elOfficeName = document.getElementById('selected-office-name');
const elOfficeMeta = document.getElementById('selected-office-meta');
const elSensorId = document.getElementById('office-sensor-id');



const OFFICE_CONFIG = {
  portailcli: { label: 'PortailCLI', sensorId: 'LAS00097866091B', endpoint: 'indoor' },
  transverse: { label: 'Transverse', sensorId: 'LAS00108601091B', endpoint: 'verify' },
  ct: { label: 'CT', sensorId: 'LAS00108602091B', endpoint: 'verify' },
  m210: { label: 'M210', sensorId: 'LAS00108230091B', endpoint: 'indoor' },
  m221: { label: 'M221', sensorId: 'LAS00098009091B', endpoint: 'indoor' },
  m228: { label: 'M228', sensorId: 'LAS00108232091B', endpoint: 'indoor' }
};

const elTempMin = document.getElementById('stat-temp-min');
const elTempAvg = document.getElementById('stat-temp-avg');
const elTempMax = document.getElementById('stat-temp-max');
const elTempMinTime = document.getElementById('stat-temp-min-time');
const elTempMaxTime = document.getElementById('stat-temp-max-time');

const elHumidityMin = document.getElementById('stat-humidity-min');
const elHumidityAvg = document.getElementById('stat-humidity-avg');
const elHumidityMax = document.getElementById('stat-humidity-max');
const elHumidityMinTime = document.getElementById('stat-humidity-min-time');
const elHumidityMaxTime = document.getElementById('stat-humidity-max-time');

const elChartEmpty = document.getElementById('chart-empty');
const tabButtons = document.querySelectorAll('.tab-btn');

// Helpers
function formatTime(isoString) {
  if (!isoString) return '--:--';
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getSelectedOffice() {
  const selectedValue = officeSelect ? officeSelect.value : 'portailcli';
  const office = OFFICE_CONFIG[selectedValue] || OFFICE_CONFIG.portailcli;
  return { ...office, key: selectedValue || 'portailcli' };
}

function updateSelectedOfficeInfo() {
  const office = getSelectedOffice();
  const metaText = `Détecteur localisé dans la salle ${office.label} • Fréquence de rafraîchissement automatique : 5 min`;

  if (elOfficeName) {
    elOfficeName.textContent = `TDI • ${office.label}`;
  }

  if (elOfficeMeta) {
    elOfficeMeta.textContent = metaText;
  }

  const footerMeta = document.querySelector('.footer-meta');
  if (footerMeta) {
    footerMeta.textContent = metaText;
  }

  if (elSensorId) {
    elSensorId.textContent = office.sensorId;
  }
}

// Initial Fetch & Update Dashboard
async function updateDashboard(isManual = false) {
  try {
    const office = getSelectedOffice();
    const roomKey = office.key || 'portailcli';

    // 1. Fetch live reading and history in parallel for the selected room
    const [liveRes, historyRes] = await Promise.all([
      fetch(`/api/latest?room=${encodeURIComponent(roomKey)}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/history?room=${encodeURIComponent(roomKey)}`).then(r => r.ok ? r.json() : [])
    ]);

    historyData = historyRes || [];

    // 2. Update live cards
    let liveTemp = '--.-';
    let liveHum = '--';
    let liveTime = null;

    if (liveRes) {
      liveTemp = parseFloat(liveRes.temperature).toFixed(1);
      liveHum = Math.round(liveRes.humidity);
      liveTime = liveRes.timestamp;
    } else if (historyData.length > 0) {
      // Fallback to latest in history
      const latest = historyData[historyData.length - 1];
      liveTemp = latest.temperature.toFixed(1);
      liveHum = Math.round(latest.humidity);
      liveTime = latest.timestamp;
    }

    elLiveTemp.textContent = liveTemp;
    elLiveHumidity.textContent = liveHum;

    const formattedTimeStr = liveTime ? `Mise à jour à ${formatTime(liveTime)}` : 'Mise à jour --:--';
    elTempUpdated.textContent = formattedTimeStr;
    elHumidityUpdated.textContent = formattedTimeStr;

    // 3. Compute trends
    updateTrends(liveTemp, liveHum);

    // 4. Render chart and statistics
    processAndRenderData();

  } catch (error) {
    console.error('Error updating dashboard:', error);
  }
}

// Compute trends (compared to previous stored record)
function updateTrends(currentTemp, currentHum) {
  if (historyData.length < 2) {
    setTrend(elTempTrend, 'stable');
    setTrend(elHumidityTrend, 'stable');
    return;
  }

  const currentT = parseFloat(currentTemp);
  const currentH = parseFloat(currentHum);
  
  // Find the last record in history that has a different timestamp than the live one
  let lastEntry = historyData[historyData.length - 2];
  
  if (isNaN(currentT) || isNaN(currentH) || !lastEntry) {
    setTrend(elTempTrend, 'stable');
    setTrend(elHumidityTrend, 'stable');
    return;
  }

  const prevT = lastEntry.temperature;
  const prevH = lastEntry.humidity;

  // Temperature trend
  if (currentT > prevT + 0.05) {
    setTrend(elTempTrend, 'up');
  } else if (currentT < prevT - 0.05) {
    setTrend(elTempTrend, 'down');
  } else {
    setTrend(elTempTrend, 'stable');
  }

  // Humidity trend
  if (currentH > prevH + 0.5) {
    setTrend(elHumidityTrend, 'up');
  } else if (currentH < prevH - 0.5) {
    setTrend(elHumidityTrend, 'down');
  } else {
    setTrend(elHumidityTrend, 'stable');
  }
}

function setTrend(element, direction) {
  element.className = 'trend-indicator'; // Reset classes
  const arrow = element.querySelector('.trend-arrow');
  const text = element.querySelector('.trend-text');

  if (direction === 'up') {
    element.classList.add('up');
    arrow.textContent = '▲';
    text.textContent = 'En hausse';
  } else if (direction === 'down') {
    element.classList.add('down');
    arrow.textContent = '▼';
    text.textContent = 'En baisse';
  } else {
    element.classList.add('stable');
    arrow.textContent = '—';
    text.textContent = 'Stable';
  }
}

// Filter, Statistics and Chart Rendering
function processAndRenderData() {
  const filtered = filterHistory(historyData, activeFilter);

  if (filtered.length === 0) {
    elChartEmpty.classList.remove('hidden');
    if (chart) {
      chart.destroy();
      chart = null;
    }
    resetStats();
    return;
  }

  elChartEmpty.classList.add('hidden');
  renderChart(filtered);
  computeStats(filtered);
}

// Filter records based on timeframe
function filterHistory(data, filter) {
  if (data.length === 0) return [];
  
  const now = new Date();
  let timeLimit = null;

  if (filter === '24h') {
    timeLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (filter === '7d') {
    timeLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (!timeLimit) return [...data]; // 'all' - return copy

  return data.filter(d => new Date(d.timestamp) >= timeLimit);
}

// Stats Calculation
function computeStats(data) {
  if (data.length === 0) {
    resetStats();
    return;
  }

  let tempSum = 0;
  let humSum = 0;
  
  let tempMin = Infinity;
  let tempMax = -Infinity;
  let tempMinTime = '';
  let tempMaxTime = '';
  
  let humMin = Infinity;
  let humMax = -Infinity;
  let humMinTime = '';
  let humMaxTime = '';

  data.forEach(d => {
    const t = d.temperature;
    const h = d.humidity;
    const timeStr = formatTime(d.timestamp);

    tempSum += t;
    humSum += h;

    if (t < tempMin) {
      tempMin = t;
      tempMinTime = timeStr;
    }
    if (t > tempMax) {
      tempMax = t;
      tempMaxTime = timeStr;
    }

    if (h < humMin) {
      humMin = h;
      humMinTime = timeStr;
    }
    if (h > humMax) {
      humMax = h;
      humMaxTime = timeStr;
    }
  });

  const count = data.length;
  
  elTempMin.textContent = `${tempMin.toFixed(1)} °C`;
  elTempMax.textContent = `${tempMax.toFixed(1)} °C`;
  elTempAvg.textContent = `${(tempSum / count).toFixed(1)} °C`;
  elTempMinTime.textContent = `à ${tempMinTime}`;
  elTempMaxTime.textContent = `à ${tempMaxTime}`;

  elHumidityMin.textContent = `${Math.round(humMin)} %`;
  elHumidityMax.textContent = `${Math.round(humMax)} %`;
  elHumidityAvg.textContent = `${Math.round(humSum / count)} %`;
  elHumidityMinTime.textContent = `à ${humMinTime}`;
  elHumidityMaxTime.textContent = `à ${humMaxTime}`;
}

function resetStats() {
  elTempMin.textContent = '--.- °C';
  elTempMax.textContent = '--.- °C';
  elTempAvg.textContent = '--.- °C';
  elTempMinTime.textContent = '--:--';
  elTempMaxTime.textContent = '--:--';

  elHumidityMin.textContent = '-- %';
  elHumidityMax.textContent = '-- %';
  elHumidityAvg.textContent = '-- %';
  elHumidityMinTime.textContent = '--:--';
  elHumidityMaxTime.textContent = '--:--';
}

// Chart.js Configuration & Creation
function renderChart(data) {
  const ctx = document.getElementById('historyChart').getContext('2d');
  
  const labels = data.map(d => formatDate(d.timestamp));
  const tempValues = data.map(d => d.temperature);
  const humidityValues = data.map(d => d.humidity);

  // Gradient configurations for the fills
  const tempGradient = ctx.createLinearGradient(0, 0, 0, 300);
  tempGradient.addColorStop(0, 'rgba(255, 91, 91, 0.25)');
  tempGradient.addColorStop(1, 'rgba(255, 91, 91, 0.00)');

  const humGradient = ctx.createLinearGradient(0, 0, 0, 300);
  humGradient.addColorStop(0, 'rgba(56, 189, 248, 0.25)');
  humGradient.addColorStop(1, 'rgba(56, 189, 248, 0.00)');

  if (chart) {
    // If chart exists, update values
    chart.data.labels = labels;
    chart.data.datasets[0].data = tempValues;
    chart.data.datasets[1].data = humidityValues;
    chart.update();
    return;
  }

  // Create new chart
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Température (°C)',
          data: tempValues,
          borderColor: '#ff5b5b',
          borderWidth: 3,
          backgroundColor: tempGradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#ff5b5b',
          pointBorderColor: '#090d16',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'yTemp'
        },
        {
          label: 'Humidité (%rH)',
          data: humidityValues,
          borderColor: '#38bdf8',
          borderWidth: 3,
          backgroundColor: humGradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#38bdf8',
          pointBorderColor: '#090d16',
          pointBorderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
          yAxisID: 'yHum'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: {
              family: 'Inter',
              size: 12,
              weight: 500
            },
            padding: 20,
            usePointStyle: true,
            boxWidth: 8
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#1e293b',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          titleFont: {
            family: 'Outfit',
            size: 13,
            weight: 600
          },
          bodyFont: {
            family: 'Inter',
            size: 12
          },
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += context.parsed.y + (context.datasetIndex === 0 ? ' °C' : ' %');
              }
              return label;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.03)',
            borderColor: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#64748b',
            font: {
              family: 'Inter',
              size: 10
            },
            maxRotation: 45,
            autoSkip: true,
            maxTicksLimit: 12
          }
        },
        yTemp: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Température (°C)',
            color: '#ff5b5b',
            font: {
              family: 'Outfit',
              weight: 600,
              size: 11
            }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.03)',
            borderColor: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#ff8a53',
            font: {
              family: 'Inter',
              size: 10
            }
          }
        },
        yHum: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Humidité (%rH)',
            color: '#38bdf8',
            font: {
              family: 'Outfit',
              weight: 600,
              size: 11
            }
          },
          grid: {
            drawOnChartArea: false, // only show grid lines for temperature to prevent clutter
            borderColor: 'rgba(255, 255, 255, 0.05)'
          },
          ticks: {
            color: '#38bdf8',
            font: {
              family: 'Inter',
              size: 10
            }
          },
          min: 0,
          max: 100
        }
      }
    }
  });
}

// User Actions: Manual Refresh
async function forceRefresh() {
  const icon = elBtnFetch.querySelector('.icon-spin-target');
  
  // Add animation
  icon.classList.add('spinning');
  elBtnFetch.disabled = true;

  try {
    const office = getSelectedOffice();
    const roomKey = office.key || 'portailcli';
    const response = await fetch(`/api/fetch-now?room=${encodeURIComponent(roomKey)}`, { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      console.log('Force fetch completed successfully:', result.data);
    } else {
      console.warn('Force fetch returned failure:', result.error);
    }
  } catch (error) {
    console.error('Error during manual refresh fetch:', error);
  } finally {
    // Reload dashboard state
    await updateDashboard(true);
    
    // Stop animation
    setTimeout(() => {
      icon.classList.remove('spinning');
      elBtnFetch.disabled = false;
    }, 600); // minor delay for nice visual feedback
  }
}

// Export Data (JSON & CSV)
function exportData(format) {
  if (historyData.length === 0) {
    alert('Aucune donnée à exporter.');
    return;
  }

  let content = '';
  let filename = `egain_sensor_history_${new Date().toISOString().split('T')[0]}`;
  let mimeType = '';

  if (format === 'json') {
    content = JSON.stringify(historyData, null, 2);
    filename += '.json';
    mimeType = 'application/json';
  } else if (format === 'csv') {
    // Generate CSV columns
    const headers = ['Timestamp', 'Temperature_C', 'Humidity_Percent'];
    const rows = historyData.map(d => [d.timestamp, d.temperature, d.humidity].join(','));
    content = [headers.join(','), ...rows].join('\n');
    filename += '.csv';
    mimeType = 'text/csv';
  }

  // Trigger download
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Event Listeners
if (officeSelect) {
  officeSelect.addEventListener('change', () => {
    updateSelectedOfficeInfo();
    // Destroy chart so it re-creates with fresh gradients for the new room
    if (chart) {
      chart.destroy();
      chart = null;
    }
    updateDashboard();
  });
}

elBtnFetch.addEventListener('click', forceRefresh);
elBtnExportCSV.addEventListener('click', () => exportData('csv'));
elBtnExportJSON.addEventListener('click', () => exportData('json'));

tabButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    tabButtons.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeFilter = e.target.dataset.filter;
    processAndRenderData();
  });
});

// Auto refresh frontend UI state (not forcing server hit, just loading history) every 60 seconds
setInterval(() => {
  updateDashboard();
}, 60000);

// Init Load
updateSelectedOfficeInfo();
updateDashboard();
