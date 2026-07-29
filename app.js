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

const STORAGE_KEY = 'sensorHistory';
const LAST_FETCH_KEY = 'sensorLastFetchAt';
const MIN_FETCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HISTORY_POINTS = 288;

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

function loadSavedHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveHistory(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Unable to save sensor history locally:', error);
  }
}

function normalizeReading(data) {
  if (!data || !data.timestamp) return null;
  const temperature = parseFloat(data.temperature);
  const humidity = parseFloat(data.humidity);
  if (Number.isNaN(temperature) || Number.isNaN(humidity)) return null;
  return { timestamp: data.timestamp, temperature, humidity };
}

function appendHistoryPoint(point) {
  if (!point || !point.timestamp) return loadSavedHistory();
  const history = loadSavedHistory();
  if (history.some(entry => entry.timestamp === point.timestamp)) {
    return history;
  }

  history.push(point);
  const clipped = history.slice(-MAX_HISTORY_POINTS);
  saveHistory(clipped);
  return clipped;
}

async function loadFallbackHistory() {
  try {
    const url = new URL('data/history.json', window.location.href);
    url.searchParams.set('t', Date.now().toString());
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Fallback history load failed:', error);
    return [];
  }
}

async function loadApiHistory() {
  try {
    const url = new URL('/api/history', window.location.origin);
    url.searchParams.set('t', Date.now().toString());
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    return [];
  }
}

async function getInitialHistory() {
  let history = loadSavedHistory();
  if (history.length > 0) return history;

  history = await loadApiHistory();
  if (history.length > 0) {
    saveHistory(history);
    return history;
  }

  history = await loadFallbackHistory();
  if (history.length > 0) saveHistory(history);
  return history;
}

function shouldFetchLatest(isManual) {
  if (isManual) return true;
  const lastFetch = parseInt(localStorage.getItem(LAST_FETCH_KEY), 10);
  if (Number.isNaN(lastFetch)) return true;
  return Date.now() - lastFetch >= MIN_FETCH_INTERVAL_MS;
}

async function fetchLatestReading() {
  const url = new URL('/api/latest', window.location.origin);
  url.searchParams.set('t', Date.now().toString());
  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch latest reading: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return normalizeReading(data);
}

async function updateDashboard(isManual = false) {
  try {
    historyData = await getInitialHistory();

    if (shouldFetchLatest(isManual)) {
      const latestReading = await fetchLatestReading();
      if (latestReading) {
        historyData = appendHistoryPoint(latestReading);
        localStorage.setItem(LAST_FETCH_KEY, Date.now().toString());
      }
    }

    let liveTemp = '--.-';
    let liveHum = '--';
    let liveTime = null;

    if (historyData.length > 0) {
      const latest = historyData[historyData.length - 1];
      liveTemp = latest.temperature.toFixed(1);
      liveHum = Math.round(latest.humidity);
      liveTime = latest.timestamp;
    }

    elLiveTemp.textContent = liveTemp;
    elLiveHumidity.textContent = liveHum;

    const formattedTimeStr = liveTime ? `Dernière mesure : ${formatTime(liveTime)}` : 'Aucune donnée';
    elTempUpdated.textContent = formattedTimeStr;
    elHumidityUpdated.textContent = formattedTimeStr;

    updateTrends(liveTemp, liveHum);
    processAndRenderData();
  } catch (error) {
    console.error('Error updating dashboard:', error);
    historyData = loadSavedHistory();
    if (historyData.length === 0) {
      elChartEmpty.classList.remove('hidden');
      elChartEmpty.querySelector('p').textContent = 'Les données ne sont pas encore disponibles.';
      elChartEmpty.querySelector('.subtitle').textContent = 'Vérifie ta connexion ou relance la page.';
      resetStats();
    }
  }
}

// Compute trends (comparing the latest point with the second-to-last)
function updateTrends(currentTemp, currentHum) {
  if (historyData.length < 2) {
    setTrend(elTempTrend, 'stable');
    setTrend(elHumidityTrend, 'stable');
    return;
  }

  const currentT = parseFloat(currentTemp);
  const currentH = parseFloat(currentHum);
  const lastEntry = historyData[historyData.length - 2];
  
  if (isNaN(currentT) || isNaN(currentH) || !lastEntry) {
    setTrend(elTempTrend, 'stable');
    setTrend(elHumidityTrend, 'stable');
    return;
  }

  const prevT = lastEntry.temperature;
  const prevH = lastEntry.humidity;

  // Temp trend
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
            drawOnChartArea: false,
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
    await updateDashboard(true);
  } catch (error) {
    console.error('Error during manual refresh fetch:', error);
  } finally {
    setTimeout(() => {
      icon.classList.remove('spinning');
      elBtnFetch.disabled = false;
    }, 600);
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
    const headers = ['Timestamp', 'Temperature_C', 'Humidity_Percent'];
    const rows = historyData.map(d => [d.timestamp, d.temperature, d.humidity].join(','));
    content = [headers.join(','), ...rows].join('\n');
    filename += '.csv';
    mimeType = 'text/csv';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Event Listeners
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

// Poll the latest sensor reading every 5 minutes while the page is open
setInterval(() => {
  updateDashboard();
}, MIN_FETCH_INTERVAL_MS);

// Init Load
updateDashboard();
