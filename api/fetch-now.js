import fs from 'fs';
import path from 'path';

const ROOM_CONFIG = {
  portailcli: { sensorId: 'LAS00097866091B', endpoint: 'indoor' },
  transverse: { sensorId: 'LAS00108601091B', endpoint: 'verify' },
  ct: { sensorId: 'LAS00108602091B', endpoint: 'verify' },
  m210: { sensorId: 'LAS00108230091B', endpoint: 'indoor' },
  m221: { sensorId: 'LAS00098009091B', endpoint: 'indoor' },
  m228: { sensorId: 'LAS00108232091B', endpoint: 'indoor' }
};

function getEgainUrl(roomKey) {
  const config = ROOM_CONFIG[roomKey] || ROOM_CONFIG.portailcli;
  const sensorId = config.sensorId;

  return `https://deployment.egain.io/api/indoor/${sensorId}`;
}

function getHistoryFilePath(roomKey) {
  const config = ROOM_CONFIG[roomKey] || ROOM_CONFIG.portailcli;
  return path.join(process.cwd(), 'data', `${config.sensorId}.json`);
}

function readHistory(roomKey) {
  const filePath = getHistoryFilePath(roomKey);
  try {
    if (fs.existsSync(filePath)) {
      const rawData = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(rawData);
    }
    return [];
  } catch (error) {
    return [];
  }
}

function writeHistory(roomKey, data) {
  const filePath = getHistoryFilePath(roomKey);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const roomKey = (req.query.room || 'portailcli').toLowerCase();
    const eGainUrl = getEgainUrl(roomKey);

    const response = await fetch(eGainUrl, {
      headers: {
        'User-Agent': 'egain-dashboard/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch from eGain API' });
    }

    const data = await response.json();
    const { temperature, humidity, timestamp } = data;

    if (temperature === undefined || humidity === undefined || !timestamp) {
      return res.status(400).json({ error: 'Invalid eGain response structure' });
    }

    const history = readHistory(roomKey);
    const isDuplicate = history.some(entry => entry.timestamp === timestamp);

    let resultEntry;
    if (!isDuplicate) {
      resultEntry = {
        timestamp,
        temperature: parseFloat(temperature),
        humidity: parseFloat(humidity)
      };
      history.push(resultEntry);
      writeHistory(roomKey, history);
    } else {
      resultEntry = history[history.length - 1];
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success: true, data: resultEntry });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}