import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root (since we run this from repo root)
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'history.json');

const ENDPOINT_TO_SENSOR = {
  indoor: 'LAS00097866091B',
  verify: 'LAS00108601091B'
};

const OFFICE_CONFIG = {
  portailcli: { label: 'PortailCLI', sensorId: 'LAS00097866091B', endpoint: 'indoor' },
  transverse: { label: 'Transverse', sensorId: 'LAS00108601091B', endpoint: 'verify' },
  ct: { label: 'CT', sensorId: 'LAS00108602091B', endpoint: 'verify' },
  m210: { label: 'M210', sensorId: 'LAS00108230091B', endpoint: 'indoor' },
  m221: { label: 'M221', sensorId: 'LAS00098009091B', endpoint: 'indoor' },
  m228: { label: 'M228', sensorId: 'LAS00108232091B', endpoint: 'indoor' }
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created directory: ${DATA_DIR}`);
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
    console.log(`Created empty history database: ${DATA_FILE}`);
  }
}

function readHistory() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Error reading/parsing database, resetting array:', error.message);
    return [];
  }
}

function writeHistory(history) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

async function fetchSensorData(sensorId) {
  const EGAIN_API_URL = `https://deployment.egain.io/api/indoor/${sensorId}`;

  try {
    const response = await fetch(EGAIN_API_URL, {
      headers: {
        'User-Agent': 'egain-dashboard/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const temp = data?.temperature;
    const hum = data?.humidity;
    const timestamp = data?.timestamp;

    if (temp === undefined || hum === undefined || !timestamp) {
      console.warn('Invalid JSON structure returned by eGain API for', sensorId, ':', data);
      return null;
    }

    return {
      sensorId,
      temperature: parseFloat(temp),
      humidity: parseFloat(hum),
      timestamp
    };
  } catch (error) {
    console.warn(`Failed to fetch data for ${sensorId}:`, error.message);
    return null;
  }
}

async function main() {
  console.log(`[${new Date().toISOString()}] Initiating eGain sensor data poll...`);
  ensureDataFile();

  let history = readHistory();

  // Fetch data for all known offices
  for (const [officeKey, officeConfig] of Object.entries(OFFICE_CONFIG)) {
    const sensorId = officeConfig.sensorId;
    const result = await fetchSensorData(sensorId);

    if (result) {
      const isDuplicate = history.some(entry => entry.timestamp === result.timestamp);

      if (!isDuplicate) {
        const newEntry = {
          timestamp: result.timestamp,
          temperature: result.temperature,
          humidity: result.humidity
        };
        history.push(newEntry);
        console.log(`Recorded data for ${officeKey}: Temp ${result.temperature}°C, Humidity ${result.humidity}% at ${result.timestamp}`);
      } else {
        console.log(`Data point for ${result.timestamp} already exists in database for ${officeKey}. No update needed.`);
      }
    }
  }

  writeHistory(history);
  console.log(`Finished poll. Total records: ${history.length}`);
}

main().catch(error => {
  console.error('Unexpected failure in fetch workflow:', error);
});