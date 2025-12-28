import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve data directory relative to backend/src/config, going up to backend root
export const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
export const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');

export const DEFAULT_PORT = Number(process.env.PORT ?? 4000);
