import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root (since we run this from repo root)
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'history.json');
const SENSOR_ID = 'LAS00097866091B';
const EGAIN_API_URL = `https://deployment.egain.io/api/indoor/${SENSOR_ID}`;

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

async function main() {
  console.log(`[${new Date().toISOString()}] Initiating eGain API poll...`);
  ensureDataFile();

  let history = readHistory();

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
      console.warn('Invalid JSON structure returned by eGain API:', data);
      return;
    }

    const isDuplicate = history.some(entry => entry.timestamp === timestamp);

    if (!isDuplicate) {
      const newEntry = {
        timestamp,
        temperature: parseFloat(temp),
        humidity: parseFloat(hum)
      };

      history.push(newEntry);
      writeHistory(history);
      console.log(`Successfully recorded: Temp ${temp}°C, Humidity ${hum}% at ${timestamp}`);
    } else {
      console.log(`Data point for ${timestamp} already exists in database. No update needed.`);
    }
  } catch (error) {
    console.warn(`Skipping update due to fetch error: ${error.message}`);
  }
}

main().catch(error => {
  console.error('Unexpected failure in fetch workflow:', error);
});
