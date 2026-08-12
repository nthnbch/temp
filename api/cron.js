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
  const config = ROOM_CONFIG[roomKey];
  const sensorId = config.sensorId;

  return `https://deployment.egain.io/api/indoor/${sensorId}`;
}

function getHistoryFilePath(roomKey) {
  const config = ROOM_CONFIG[roomKey];
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

async function pollSensorData(roomKey) {
  const eGainUrl = getEgainUrl(roomKey);

  const response = await fetch(eGainUrl, {
    headers: {
      'User-Agent': 'egain-dashboard/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch from eGain API for ${roomKey}`);
  }

  const data = await response.json();
  const { temperature, humidity, timestamp } = data;

  if (temperature === undefined || humidity === undefined || !timestamp) {
    throw new Error(`Invalid eGain response structure for ${roomKey}`);
  }

  const history = readHistory(roomKey);
  const isDuplicate = history.some(entry => entry.timestamp === timestamp);

  if (!isDuplicate) {
    const newEntry = {
      timestamp,
      temperature: parseFloat(temperature),
      humidity: parseFloat(humidity)
    };
    history.push(newEntry);
    writeHistory(roomKey, history);
    return { status: 'added', entry: newEntry };
  }

  return { status: 'skipped', lastEntry: history[history.length - 1] };
}

export default async function handler(req, res) {
  // Optional security check (Vercel sets CRON_SECRET header if configured)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {};
  const errors = {};

  for (const roomKey of Object.keys(ROOM_CONFIG)) {
    try {
      const result = await pollSensorData(roomKey);
      results[roomKey] = result;
    } catch (err) {
      errors[roomKey] = err.message;
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    success: Object.keys(errors).length === 0,
    results,
    errors
  });
}
