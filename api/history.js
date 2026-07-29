import fs from 'fs';
import path from 'path';

const DATA_FILE = path.join(process.cwd(), 'data', 'history.json');

export default async function handler(req, res) {
  try {
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const history = JSON.parse(rawData);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(history);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
