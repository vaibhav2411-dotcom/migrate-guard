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

  async updateJob(id: string, input: Partial<Omit<Job, 'id' | 'createdAt'>>): Promise<Job> {
    const snapshot = await this.storage.load();
    const jobIndex = snapshot.jobs.findIndex((j) => j.id === id);

    if (jobIndex === -1) {
      throw new Error(`Job ${id} not found`);
    }

    const existingJob = snapshot.jobs[jobIndex];
    const updatedJob: Job = {
      ...existingJob,
      ...input,
      id: existingJob.id, // Ensure ID cannot be changed
      createdAt: existingJob.createdAt, // Ensure createdAt cannot be changed
      updatedAt: new Date().toISOString(),
    };

    const next: typeof snapshot = {
      ...snapshot,
      jobs: snapshot.jobs.map((j, idx) => (idx === jobIndex ? updatedJob : j)),
    };

    await this.storage.save(next);
    return updatedJob;
  }

  async deleteJob(id: string): Promise<boolean> {
    const snapshot = await this.storage.load();
    const jobIndex = snapshot.jobs.findIndex((j) => j.id === id);

    if (jobIndex === -1) {
      return false;
    }

    // Also remove associated runs and artifacts
    const associatedRunIds = snapshot.runs.filter((r) => r.jobId === id).map((r) => r.id);
    const next: typeof snapshot = {
      ...snapshot,
      jobs: snapshot.jobs.filter((j) => j.id !== id),
      runs: snapshot.runs.filter((r) => r.jobId !== id),
      artifacts: snapshot.artifacts.filter((a) => !associatedRunIds.includes(a.runId)),
    };

    await this.storage.save(next);
    return true;
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

    // Save the run first
    const next: typeof snapshot = {
      ...snapshot,
      runs: [run, ...snapshot.runs],
      artifacts: [...snapshot.artifacts],
    };
    await this.storage.save(next);

    // Simulate async execution (in Phase 2, this will be replaced with actual test execution)
    // TODO: Phase 2 - Replace this placeholder with actual test execution:
    // 1. Initialize Playwright MCP connection
    // 2. Use Crawl4AI to crawl both sourceUrl and targetUrl
    // 3. Compare results using Azure OpenAI for intelligent diff analysis
    // 4. Use MS Agent Framework for orchestration
    // 5. Generate screenshots, logs, and reports as artifacts
    // 6. Update run status to 'completed' or 'failed' based on results
    this.simulateRunExecution(run.id, job).catch((err) => {
      console.error(`Error simulating run execution for run ${run.id}:`, err);
    });

    return run;
  }

  /**
   * Placeholder method that simulates test execution.
   * TODO: Phase 2 - Replace with actual Playwright + Crawl4AI integration:
   *
   * Expected implementation flow:
   * 1. Update run status to 'running'
   * 2. Initialize Playwright browser instance via MCP
   * 3. Navigate to job.sourceUrl and job.targetUrl
   * 4. Use Crawl4AI to extract content, metadata, and structure from both URLs
   * 5. Capture screenshots at key interaction points
   * 6. Use Azure OpenAI to analyze differences and generate insights
   * 7. Use MS Agent Framework to orchestrate the comparison workflow
   * 8. Generate artifacts:
   *    - Screenshots: visual-diff-{timestamp}.png
   *    - Logs: execution-{timestamp}.log
   *    - Reports: comparison-report-{timestamp}.json
   * 9. Update run status to 'completed' or 'failed'
   * 10. Store all artifacts in backend/data/artifacts/{runId}/
   */
  private async simulateRunExecution(runId: string, job: Job): Promise<void> {
    const snapshot = await this.storage.load();
    const run = snapshot.runs.find((r) => r.id === runId);
    if (!run) return;

    // Update status to running
    const runningRun: Run = { ...run, status: 'running' };
    const runningSnapshot: typeof snapshot = {
      ...snapshot,
      runs: snapshot.runs.map((r) => (r.id === runId ? runningRun : r)),
    };
    await this.storage.save(runningSnapshot);

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create placeholder artifacts
    const now = new Date().toISOString();
    const artifacts: RunArtifact[] = [
      {
        id: randomUUID(),
        runId,
        type: 'log',
        label: 'Execution log (placeholder)',
        path: `data/artifacts/${runId}/execution.log`,
        createdAt: now,
      },
      {
        id: randomUUID(),
        runId,
        type: 'screenshot',
        label: 'Source URL screenshot (placeholder)',
        path: `data/artifacts/${runId}/source-screenshot.png`,
        createdAt: now,
      },
      {
        id: randomUUID(),
        runId,
        type: 'screenshot',
        label: 'Target URL screenshot (placeholder)',
        path: `data/artifacts/${runId}/target-screenshot.png`,
        createdAt: now,
      },
      {
        id: randomUUID(),
        runId,
        type: 'report',
        label: 'Comparison report (placeholder)',
        path: `data/artifacts/${runId}/comparison-report.json`,
        createdAt: now,
      },
    ];

    // Update run to completed
    const completedRun: Run = {
      ...runningRun,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };

    const finalSnapshot: typeof snapshot = {
      ...runningSnapshot,
      runs: runningSnapshot.runs.map((r) => (r.id === runId ? completedRun : r)),
      artifacts: [...runningSnapshot.artifacts, ...artifacts],
    };
    await this.storage.save(finalSnapshot);
  }
}
