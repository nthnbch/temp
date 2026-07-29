const SENSOR_ID = 'LAS00097866091B';
const EGAIN_API_URL = `https://deployment.egain.io/api/indoor/${SENSOR_ID}`;

export default async function handler(req, res) {
  try {
    const response = await fetch(EGAIN_API_URL);

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
