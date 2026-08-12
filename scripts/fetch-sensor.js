import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root (since we run this from repo root)
const DATA_DIR = path.join(process.cwd(), 'data');

const OFFICE_CONFIG = {
  portailcli: { label: 'PortailCLI', sensorId: 'LAS00097866091B', endpoint: 'indoor' },
  transverse: { label: 'Transverse', sensorId: 'LAS00108601091B', endpoint: 'verify' },
  ct: { label: 'CT', sensorId: 'LAS00108602091B', endpoint: 'verify' },
  m210: { label: 'M210', sensorId: 'LAS00108230091B', endpoint: 'indoor' },
  m221: { label: 'M221', sensorId: 'LAS00098009091B', endpoint: 'indoor' },
  m228: { label: 'M228', sensorId: 'LAS00108232091B', endpoint: 'indoor' }
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`Created directory: ${DATA_DIR}`);
  }
}

function getSensorFilePath(sensorId) {
  return path.join(DATA_DIR, `${sensorId}.json`);
}

function readHistory(sensorId) {
  const filePath = getSensorFilePath(sensorId);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
    return [];
  } catch (error) {
    console.warn(`Error reading/parsing database for ${sensorId}, resetting array:`, error.message);
    return [];
  }
}

function writeHistory(sensorId, history) {
  const filePath = getSensorFilePath(sensorId);
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), 'utf-8');
}

async function fetchSensorData(sensorId, endpoint) {
  const EGAIN_API_URL = endpoint === 'verify' 
    ? `https://deployment.egain.io/device/verify/${sensorId}`
    : `https://deployment.egain.io/indoor/${sensorId}?unit=9`;

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
  console.log(`[${new Date().toISOString()}] Initiating eGain sensor data poll for all rooms...`);
  ensureDataDir();

  // Fetch data for all known offices
  for (const [officeKey, officeConfig] of Object.entries(OFFICE_CONFIG)) {
    const sensorId = officeConfig.sensorId;
    const endpoint = officeConfig.endpoint;
    const result = await fetchSensorData(sensorId, endpoint);

    if (result) {
      let history = readHistory(sensorId);
      const isDuplicate = history.some(entry => entry.timestamp === result.timestamp);

      if (!isDuplicate) {
        const newEntry = {
          timestamp: result.timestamp,
          temperature: result.temperature,
          humidity: result.humidity
        };
        history.push(newEntry);
        writeHistory(sensorId, history);
        console.log(`Recorded data for ${officeKey} (${sensorId}): Temp ${result.temperature}°C, Humidity ${result.humidity}% at ${result.timestamp}`);
      } else {
        console.log(`Data point for ${result.timestamp} already exists in database for ${officeKey} (${sensorId}). No update needed.`);
      }
    }
  }

  console.log(`Finished poll for all rooms.`);
}

main().catch(error => {
  console.error('Unexpected failure in fetch workflow:', error);
});