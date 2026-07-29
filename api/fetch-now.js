import fs from 'fs';
import path from 'path';

const SENSOR_ID = 'LAS00097866091B';
const EGAIN_API_URL = `https://deployment.egain.io/api/indoor/${SENSOR_ID}`;
const DATA_FILE = path.join(process.cwd(), 'data', 'history.json');

function readHistory() {
  try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(rawData);
  } catch (error) {
    return [];
  }
}

function writeHistory(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(EGAIN_API_URL);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from eGain API' });
    }

    const data = await response.json();
    const { temperature, humidity, timestamp } = data;

    if (temperature === undefined || humidity === undefined || !timestamp) {
      return res.status(400).json({ error: 'Invalid eGain response structure' });
    }

    const history = readHistory();
    const isDuplicate = history.some(entry => entry.timestamp === timestamp);

    let resultEntry;
    if (!isDuplicate) {
      resultEntry = {
        timestamp,
        temperature: parseFloat(temperature),
        humidity: parseFloat(humidity)
      };
      history.push(resultEntry);
      writeHistory(history);
    } else {
      resultEntry = history[history.length - 1];
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, data: resultEntry });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
