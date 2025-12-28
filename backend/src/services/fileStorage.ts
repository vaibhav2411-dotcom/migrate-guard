import { promises as fs } from 'fs';
import path from 'path';
import { StoragePort, StorageSnapshot } from '../models';

const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');

const emptySnapshot: StorageSnapshot = {
  jobs: [],
  runs: [],
  artifacts: [],
};

export class FileStorage implements StoragePort {
  async load(): Promise<StorageSnapshot> {
    try {
      const buf = await fs.readFile(SNAPSHOT_FILE, 'utf-8');
      return JSON.parse(buf) as StorageSnapshot;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.ensureDir();
        await this.save(emptySnapshot);
        return emptySnapshot;
      }
      throw err;
    }
  }

  async save(snapshot: StorageSnapshot): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}
