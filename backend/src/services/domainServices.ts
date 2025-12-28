import { randomUUID } from 'crypto';
import {
  Job,
  Run,
  RunArtifact,
  StoragePort,
  JobServicePort,
  RunServicePort,
} from '../models';

export class JobService implements JobServicePort {
  constructor(private readonly storage: StoragePort) {}

  async listJobs(): Promise<Job[]> {
    const snapshot = await this.storage.load();
    return snapshot.jobs;
  }

  async getJobById(id: string): Promise<Job | undefined> {
    const snapshot = await this.storage.load();
    return snapshot.jobs.find((j) => j.id === id);
  }

  async createJob(input: Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Job> {
    const snapshot = await this.storage.load();
    const now = new Date().toISOString();

    const job: Job = {
      id: randomUUID(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      ...input,
    };

    const next: typeof snapshot = {
      ...snapshot,
      jobs: [...snapshot.jobs, job],
    };

    await this.storage.save(next);
    return job;
  }
}

export class RunService implements RunServicePort {
  constructor(private readonly storage: StoragePort) {}

  async listRuns(): Promise<Run[]> {
    const snapshot = await this.storage.load();
    return snapshot.runs;
  }

  async getRunById(id: string): Promise<Run | undefined> {
    const snapshot = await this.storage.load();
    return snapshot.runs.find((r) => r.id === id);
  }

  async listArtifactsByRun(runId: string): Promise<RunArtifact[]> {
    const snapshot = await this.storage.load();
    return snapshot.artifacts.filter((a) => a.runId === runId);
  }

  async triggerRun(jobId: string, triggeredBy: string): Promise<Run> {
    const snapshot = await this.storage.load();

    const job = snapshot.jobs.find((j) => j.id === jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const now = new Date().toISOString();
    const run: Run = {
      id: randomUUID(),
      jobId,
      status: 'queued',
      triggeredBy,
      triggeredAt: now,
    };

    // Placeholder artifact metadata for Phase 1.
    // TODO: Integrate Playwright MCP, Crawl4AI, Azure OpenAI, and MS Agent Framework here
    // to actually execute the migration comparison and populate real artifacts.
    const placeholderArtifact: RunArtifact = {
      id: randomUUID(),
      runId: run.id,
      type: 'log',
      label: 'Execution log (placeholder)',
      path: '',
      createdAt: now,
    };

    const next: typeof snapshot = {
      ...snapshot,
      runs: [run, ...snapshot.runs],
      artifacts: [placeholderArtifact, ...snapshot.artifacts],
    };

    await this.storage.save(next);
    return run;
  }
}
