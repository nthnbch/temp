import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, 'data', 'history.json');

// Generate 24 hours of data points (every 30 minutes = 48 points)
const history = [];
const now = new Date();

let baseTemp = 25.5;
let baseHum = 52;

for (let i = 48; i >= 0; i--) {
  const timestamp = new Date(now.getTime() - i * 30 * 60 * 1000);
  
  // Create realistic sinusoidal fluctuations (warmer in mid-afternoon, cooler at night)
  const hour = timestamp.getHours();
  // Temp peak around 15:00, trough around 05:00
  const tempVar = Math.sin((hour - 9) * Math.PI / 12) * 2; 
  // Humidity is inversely proportional to temperature
  const humVar = -Math.sin((hour - 9) * Math.PI / 12) * 6;

  // Add some random noise
  const tempNoise = (Math.random() - 0.5) * 0.4;
  const humNoise = (Math.random() - 0.5) * 2;

  const temp = parseFloat((baseTemp + tempVar + tempNoise).toFixed(2));
  const hum = Math.round(Math.min(100, Math.max(0, baseHum + humVar + humNoise)));

  history.push({
    timestamp: timestamp.toISOString(),
    temperature: temp,
    humidity: hum
  });
}

fs.writeFileSync(DATA_FILE, JSON.stringify(history, null, 2), 'utf-8');
console.log(`Successfully seeded ${history.length} historical data points into ${DATA_FILE}`);
