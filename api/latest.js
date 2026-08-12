const ROOM_CONFIG = {
  portailcli: { label: 'PortailCLI', sensorId: 'LAS00097866091B', endpoint: 'indoor' },
  transverse: { label: 'Transverse', sensorId: 'LAS00108601091B', endpoint: 'verify' },
  ct: { label: 'CT', sensorId: 'LAS00108602091B', endpoint: 'verify' },
  m210: { label: 'M210', sensorId: 'LAS00108230091B', endpoint: 'indoor' },
  m221: { label: 'M221', sensorId: 'LAS00098009091B', endpoint: 'indoor' },
  m228: { label: 'M228', sensorId: 'LAS00108232091B', endpoint: 'indoor' }
};

function getEgainUrl(roomKey) {
  const config = ROOM_CONFIG[roomKey] || ROOM_CONFIG.portailcli;
  const sensorId = config.sensorId;

  return `https://deployment.egain.io/api/indoor/${sensorId}`;
}

export default async function handler(req, res) {
  try {
    const roomKey = (req.query.room || 'portailcli').toLowerCase();
    const eGainUrl = getEgainUrl(roomKey);

    const response = await fetch(eGainUrl);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch live sensor data from eGain (status ${response.status})`
      });
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
