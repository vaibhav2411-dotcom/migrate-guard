import { describe, it, expect, beforeEach } from 'vitest';
import { JobService, RunService } from '../src/services/domainServices';
import { StoragePort, StorageSnapshot } from '../src/models';

class InMemoryStorage implements StoragePort {
  private snapshot: StorageSnapshot = { jobs: [], runs: [], artifacts: [] };

  async load(): Promise<StorageSnapshot> {
    return this.snapshot;
  }

  async save(snapshot: StorageSnapshot): Promise<void> {
    this.snapshot = snapshot;
  }
}

describe('JobService and RunService', () => {
  let storage: InMemoryStorage;
  let jobService: JobService;
  let runService: RunService;

  beforeEach(() => {
    storage = new InMemoryStorage();
    jobService = new JobService(storage);
    runService = new RunService(storage);
  });

  it('creates and lists jobs', async () => {
    const created = await jobService.createJob({
      name: 'Test Job',
      description: 'A job for testing',
      sourceUrl: 'https://old.example.com',
      targetUrl: 'https://new.example.com',
    });

    expect(created.id).toBeDefined();
    expect(created.status).toBe('pending');

    const jobs = await jobService.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('Test Job');
  });

  it('triggers a run for an existing job', async () => {
    const job = await jobService.createJob({
      name: 'Job with run',
      description: 'Job to trigger run',
      sourceUrl: 'https://old.example.com',
      targetUrl: 'https://new.example.com',
    });

    const run = await runService.triggerRun(job.id, 'tester');

    expect(run.jobId).toBe(job.id);
    expect(run.status).toBe('queued');

    const runs = await runService.listRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(run.id);
  });

  it('throws when triggering a run for a missing job', async () => {
    await expect(runService.triggerRun('missing-id', 'tester')).rejects.toThrow('not found');
  });
});
