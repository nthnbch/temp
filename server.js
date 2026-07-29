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
const DATA_FILE = path.join(DATA_DIR, 'history.json');
const SENSOR_ID = 'LAS00097866091B';
const EGAIN_API_URL = `https://deployment.egain.io/api/indoor/${SENSOR_ID}`;

// Ensure data directory and file exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
}

// Helper to read history
function readHistory() {
  try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(rawData);
  } catch (error) {
    console.error('Error reading history file, resetting to empty array:', error);
    return [];
  }
}

// Helper to write history
function writeHistory(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing to history file:', error);
  }
}

// Function to fetch latest data and append to history if new
async function pollSensorData() {
  console.log(`[${new Date().toISOString()}] Polling sensor data from eGain API...`);
  try {
    const response = await fetch(EGAIN_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Extract values
    const temp = data.temperature;
    const hum = data.humidity;
    const timestamp = data.timestamp; // e.g. "2026-07-29T09:14:15Z"

    if (temp === undefined || hum === undefined || !timestamp) {
      console.warn('Invalid response structure received from eGain:', data);
      return null;
    }

    const history = readHistory();
    
    // Check if timestamp already exists in history to prevent duplicates
    const isDuplicate = history.some(entry => entry.timestamp === timestamp);
    
    if (!isDuplicate) {
      const newEntry = {
        timestamp,
        temperature: parseFloat(temp),
        humidity: parseFloat(hum)
      };
      
      history.push(newEntry);
      writeHistory(history);
      console.log(`Added new data point: Temp ${temp}°C, Humidity ${hum}% at ${timestamp}`);
      return newEntry;
    } else {
      console.log(`Data for timestamp ${timestamp} already stored. Skipping.`);
      return history[history.length - 1];
    }
  } catch (error) {
    console.error('Failed to poll eGain API:', error.message);
    return null;
  }
}

// API Endpoint: Get latest live reading directly
app.get('/api/latest', async (req, res) => {
  try {
    const response = await fetch(EGAIN_API_URL);
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
  const history = readHistory();
  res.json(history);
});

// API Endpoint: Force poll now
app.post('/api/fetch-now', async (req, res) => {
  const result = await pollSensorData();
  if (result) {
    res.json({ success: true, data: result });
  } else {
    res.status(500).json({ success: false, error: 'Could not fetch or store data' });
  }
});

// Start background polling for temperature every 5 minutes
const TEMP_FETCH_INTERVAL_MS = 5 * 60 * 1000;
setInterval(pollSensorData, TEMP_FETCH_INTERVAL_MS);

// Run initial fetch on startup
pollSensorData();

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  eGain Sensor Aggregator Server Running`);
  console.log(`  Local Address: http://localhost:${PORT}`);
  console.log(`  Sensor ID:     ${SENSOR_ID}`);
  console.log(`  Interval:      Every 5 minutes`);
  console.log(`==================================================`);
});
