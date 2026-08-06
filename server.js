import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Setup static files directory
app.use(express.static(path.join(__dirname, 'public')));

// Path to data file
const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_ROOM = 'portailcli';
const ROOM_CONFIG = {
  portailcli: { label: 'PortailCLI', sensorId: 'LAS00097866091B', endpoint: 'indoor' },
  transverse: { label: 'Transverse', sensorId: 'LAS00108601091B', endpoint: 'verify' },
  ct: { label: 'CT', sensorId: 'LAS00108602091B', endpoint: 'verify' },
  m210: { label: 'M210', sensorId: 'LAS00108230091B', endpoint: 'indoor' },
  m221: { label: 'M221', sensorId: 'LAS00098009091B', endpoint: 'indoor' },
  m228: { label: 'M228', sensorId: 'LAS00108232091B', endpoint: 'indoor' }
};

function getRoomConfig(roomKey = DEFAULT_ROOM) {
  const normalized = String(roomKey || DEFAULT_ROOM).toLowerCase();
  return ROOM_CONFIG[normalized] || ROOM_CONFIG[DEFAULT_ROOM];
}

function resolveSensorId(roomKey = DEFAULT_ROOM) {
  return getRoomConfig(roomKey).sensorId;
}

function getEgainUrl(roomKey = DEFAULT_ROOM) {
  const config = getRoomConfig(roomKey);
  const sensorId = config.sensorId;

  if (config.endpoint === 'verify') {
    return `https://deployment.egain.io/device/verify/${sensorId}`;
  }

  return `https://deployment.egain.io/indoor/${sensorId}?unit=9`;
}

function getHistoryFilePath(roomKey = DEFAULT_ROOM) {
  const sensorId = resolveSensorId(roomKey);
  return path.join(DATA_DIR, `${sensorId}.json`);
}

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

Object.keys(ROOM_CONFIG).forEach((roomKey) => {
  const historyFile = getHistoryFilePath(roomKey);
  if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify([], null, 2), 'utf-8');
  }
});

// Helper to read history
function readHistory(roomKey = DEFAULT_ROOM) {
  const filePath = getHistoryFilePath(roomKey);

  try {
    const rawData = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error(`Error reading history for ${roomKey}, resetting to empty array:`, error);
    return [];
  }
}

// Helper to write history
function writeHistory(roomKey, data) {
  const filePath = getHistoryFilePath(roomKey);

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing history for ${roomKey}:`, error);
  }
}

// Function to fetch latest data and append to history if new
async function pollSensorData(roomKey = DEFAULT_ROOM) {
  const sensorId = resolveSensorId(roomKey);
  const eGainUrl = getEgainUrl(roomKey);
  console.log(`[${new Date().toISOString()}] Polling sensor data for ${roomKey} (${sensorId}) from eGain...`);
  try {
    const response = await fetch(eGainUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    const temp = data.temperature;
    const hum = data.humidity;
    const timestamp = data.timestamp;

    if (temp === undefined || hum === undefined || !timestamp) {
      console.warn('Invalid response structure received from eGain:', data);
      return null;
    }

    const history = readHistory(roomKey);
    const isDuplicate = history.some(entry => entry.timestamp === timestamp);

    if (!isDuplicate) {
      const newEntry = {
        timestamp,
        temperature: parseFloat(temp),
        humidity: parseFloat(hum)
      };

      history.push(newEntry);
      writeHistory(roomKey, history);
      console.log(`Added new data point for ${roomKey}: Temp ${temp}°C, Humidity ${hum}% at ${timestamp}`);
      return newEntry;
    }

    console.log(`Data for timestamp ${timestamp} already stored for ${roomKey}. Skipping.`);
    return history[history.length - 1];
  } catch (error) {
    console.error(`Failed to poll eGain API for ${roomKey}:`, error.message);
    return null;
  }
}

// API Endpoint: Get latest live reading directly
app.get('/api/latest', async (req, res) => {
  try {
    const roomKey = req.query.room || DEFAULT_ROOM;
    const eGainUrl = getEgainUrl(roomKey);
    const response = await fetch(eGainUrl);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from eGain API' });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API Endpoint: Get aggregated history
app.get('/api/history', (req, res) => {
  const roomKey = req.query.room || DEFAULT_ROOM;
  const history = readHistory(roomKey);
  res.json(history);
});

// API Endpoint: Force poll now
app.post('/api/fetch-now', async (req, res) => {
  const roomKey = req.query.room || DEFAULT_ROOM;
  const result = await pollSensorData(roomKey);
  if (result) {
    res.json({ success: true, data: result });
  } else {
    res.status(500).json({ success: false, error: 'Could not fetch or store data' });
  }
});

// Start background polling for temperature every 5 minutes
const TEMP_FETCH_INTERVAL_MS = 5 * 60 * 1000;
setInterval(() => {
  Object.keys(ROOM_CONFIG).forEach((roomKey) => {
    pollSensorData(roomKey);
  });
}, TEMP_FETCH_INTERVAL_MS);

// Run initial fetch on startup
Object.keys(ROOM_CONFIG).forEach((roomKey) => {
  pollSensorData(roomKey);
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  eGain Sensor Aggregator Server Running`);
  console.log(`  Local Address: http://localhost:${PORT}`);
  console.log(`  Sensor ID:     ${SENSOR_ID}`);
  console.log(`  Interval:      Every 5 minutes`);
  console.log(`==================================================`);
});
