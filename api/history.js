import fs from 'fs';
import path from 'path';

const ROOM_CONFIG = {
  portailcli: { sensorId: 'LAS00097866091B' },
  transverse: { sensorId: 'LAS00108601091B' },
  ct: { sensorId: 'LAS00108602091B' },
  m210: { sensorId: 'LAS00108230091B' },
  m221: { sensorId: 'LAS00098009091B' },
  m228: { sensorId: 'LAS00108232091B' }
};

export default async function handler(req, res) {
  try {
    const roomKey = (req.query.room || 'portailcli').toLowerCase();
    const config = ROOM_CONFIG[roomKey] || ROOM_CONFIG.portailcli;
    const sensorId = config.sensorId;

    // Try per-sensor file first
    const sensorFile = path.join(process.cwd(), 'data', `${sensorId}.json`);

    let history = [];

    if (fs.existsSync(sensorFile)) {
      const rawData = fs.readFileSync(sensorFile, 'utf-8');
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        history = parsed;
      }
    }

    // Fallback for portailcli: read legacy history.json if sensor file was empty
    if (history.length === 0 && roomKey === 'portailcli') {
      const legacyFile = path.join(process.cwd(), 'data', 'history.json');
      if (fs.existsSync(legacyFile)) {
        const rawData = fs.readFileSync(legacyFile, 'utf-8');
        history = JSON.parse(rawData);
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(history);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
