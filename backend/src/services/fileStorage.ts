import { promises as fs } from 'fs';
import { SNAPSHOT_FILE, DATA_DIR } from '../config/config';
import { StoragePort, StorageSnapshot } from '../models';

const CURRENT_VERSION = '2.0';

const emptySnapshot: StorageSnapshot = {
  version: CURRENT_VERSION,
  comparisonJobs: [],
  runs: [],
  artifacts: [],
  metadata: {},
};

export class FileStorage implements StoragePort {
  async load(): Promise<StorageSnapshot> {
    try {
      const buf = await fs.readFile(SNAPSHOT_FILE, 'utf-8');
      const parsed = JSON.parse(buf) as StorageSnapshot;
      
      // Migrate old format if needed
      if (!parsed.version || parsed.version !== CURRENT_VERSION) {
        return this.migrateSnapshot(parsed);
      }
      
      return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.ensureDir();
        await this.save(emptySnapshot);
        return emptySnapshot;
      }
      throw err;
    }
  }

  /**
   * Migrates old snapshot format to new format
   */
  private migrateSnapshot(oldSnapshot: any): StorageSnapshot {
    const migrated: StorageSnapshot = {
      version: CURRENT_VERSION,
      comparisonJobs: [],
      runs: oldSnapshot.runs || [],
      artifacts: oldSnapshot.artifacts || [],
      metadata: {
        lastMigration: new Date().toISOString(),
        migrationNotes: 'Migrated from v1.0 to v2.0 - converted Jobs to ComparisonJobs',
      },
    };

    // Migrate old jobs to comparison jobs if they exist
    if (oldSnapshot.jobs && Array.isArray(oldSnapshot.jobs)) {
      migrated.comparisonJobs = oldSnapshot.jobs.map((job: any) => ({
        id: job.id,
        name: job.name,
        description: job.description,
        baselineUrl: job.sourceUrl, // sourceUrl -> baselineUrl
        candidateUrl: job.targetUrl, // targetUrl -> candidateUrl
        crawlConfig: {
          depth: 1, // Default depth
          maxPages: 10, // Default max pages
          followExternalLinks: false,
        },
        pageMap: [], // No explicit mapping by default
        testMatrix: {
          visual: true,
          functional: true,
          data: true,
          seo: true,
        },
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        migratedFrom: job.id,
        snapshotVersion: '2.0',
      }));
    }

    return migrated;
  }

  async save(snapshot: StorageSnapshot): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}
