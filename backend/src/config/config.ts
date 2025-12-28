import path from 'path';

export const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
export const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');

export const DEFAULT_PORT = Number(process.env.PORT ?? 4000);
