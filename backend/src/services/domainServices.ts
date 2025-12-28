import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  Job,
  ComparisonJob,
  Run,
  RunArtifact,
  StoragePort,
  JobServicePort,
  ComparisonJobServicePort,
  RunServicePort,
  CrawlConfig,
  TestMatrix,
  PageMap,
} from '../models';
import { CrawlAgent, MatchedPage } from './crawlAgent';
import { PlaywrightExecutionService } from './playwrightExecutionService';
import runTwoSiteCapture from '../runner/playwrightRunner';
import { VisualDiffService, VisualDiffResult } from './visualDiffService';
import { FunctionalQaAgent, FunctionalQAResult } from './functionalQaAgent';
import { DataIntegrityAgent, DataIntegrityResult } from './dataIntegrityAgent';
import { AiReasoningService } from './aiReasoningService';
import { ReportAgent } from './reportAgent';
import { DATA_DIR } from '../config/config';

/**
 * Default crawl configuration
 */
const defaultCrawlConfig: CrawlConfig = {
  depth: 1,
  maxPages: 10,
  followExternalLinks: false,
};

/**
 * Default test matrix (all tests enabled)
 */
const defaultTestMatrix: TestMatrix = {
  visual: true,
  functional: true,
  data: true,
  seo: true,
};

/**
 * ComparisonJobService - Manages ComparisonJob domain model
 * Enforces dual-site comparison (baseline vs candidate)
 */
export class ComparisonJobService implements ComparisonJobServicePort {
  constructor(private readonly storage: StoragePort) {}

  async listJobs(): Promise<ComparisonJob[]> {
    const snapshot = await this.storage.load();
    return snapshot.comparisonJobs || [];
  }

  /**
   * Execute a deterministic Playwright capture for the two job URLs (baseline & candidate)
   * - Updates run status to 'running' -> 'completed'|'failed'
   * - Persists artifacts under `data/artifacts/{runId}` and registers them in storage
   */
  private async executePlaywrightRun(runId: string, job: ComparisonJob): Promise<void> {
    const snapshot = await this.storage.load();
    const run = snapshot.runs.find((r) => r.id === runId);
    if (!run) return;

    // Mark running
    const runningRun: Run = { ...run, status: 'running' };
    const runningSnapshot: typeof snapshot = {
      ...snapshot,
      runs: snapshot.runs.map((r) => (r.id === runId ? runningRun : r)),
    };
    await this.storage.save(runningSnapshot);

    const now = new Date().toISOString();
    const artifacts: RunArtifact[] = [];

    try {
      // Use the lightweight runner to capture baseline and candidate pages
      const artifactPaths = await runTwoSiteCapture(job.baselineUrl, job.candidateUrl, runId);

      for (const p of artifactPaths) {
        const relativePath = p.replace(/^.*[\\\/]data[\\\/]/, 'data/');
        artifacts.push({
          id: randomUUID(),
          runId,
          type: p.endsWith('.png') ? 'screenshot' : p.endsWith('.log') ? 'log' : 'report',
          label: this.getArtifactLabel(p),
          path: relativePath,
          createdAt: now,
        });
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorPath = `data/artifacts/${runId}/playwright-error.log`;
      try {
        await fs.mkdir(path.dirname(path.join(DATA_DIR, 'artifacts', runId)), { recursive: true });
        await fs.writeFile(path.join(DATA_DIR, 'artifacts', runId, 'playwright-error.log'), errorMessage, 'utf-8');
      } catch {}

      artifacts.push({
        id: randomUUID(),
        runId,
        type: 'log',
        label: 'Playwright Error',
        path: errorPath,
        createdAt: now,
      });

      const failedRun: Run = { ...runningRun, status: 'failed', completedAt: new Date().toISOString() };
      const failedSnapshot: typeof snapshot = {
        ...runningSnapshot,
        runs: runningSnapshot.runs.map((r) => (r.id === runId ? failedRun : r)),
        artifacts: [...runningSnapshot.artifacts, ...artifacts],
      };
      await this.storage.save(failedSnapshot);
      return;
    }

    // Completed
    const completedRun: Run = { ...runningRun, status: 'completed', completedAt: new Date().toISOString() };
    const finalSnapshot: typeof snapshot = {
      ...runningSnapshot,
      runs: runningSnapshot.runs.map((r) => (r.id === runId ? completedRun : r)),
      artifacts: [...runningSnapshot.artifacts, ...artifacts],
    };
    await this.storage.save(finalSnapshot);
  }

  async getJobById(id: string): Promise<ComparisonJob | undefined> {
    const snapshot = await this.storage.load();
    return snapshot.comparisonJobs?.find((j) => j.id === id);
  }

  async createJob(
    input: Omit<ComparisonJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'migratedFrom' | 'snapshotVersion' | 'crawlConfig' | 'testMatrix'> & {
      crawlConfig?: CrawlConfig;
      testMatrix?: TestMatrix;
    }
  ): Promise<ComparisonJob> {
    const snapshot = await this.storage.load();
    const now = new Date().toISOString();

    // Ensure both baseline and candidate URLs are provided
    if (!input.baselineUrl || !input.candidateUrl) {
      throw new Error('Both baselineUrl and candidateUrl are required for comparison');
    }

    // Ensure URLs are different
    if (input.baselineUrl === input.candidateUrl) {
      throw new Error('baselineUrl and candidateUrl must be different');
    }

    const job: ComparisonJob = {
      id: randomUUID(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      pageMap: input.pageMap || [],
      snapshotVersion: '2.0',
      crawlConfig: input.crawlConfig ?? defaultCrawlConfig,
      testMatrix: input.testMatrix ?? defaultTestMatrix,
      name: input.name,
      description: input.description,
      baselineUrl: input.baselineUrl,
      candidateUrl: input.candidateUrl,
    };

    const next: typeof snapshot = {
      ...snapshot,
      comparisonJobs: [...(snapshot.comparisonJobs || []), job],
    };

    await this.storage.save(next);
    return job;
  }

  async updateJob(
    id: string,
    input: Partial<Omit<ComparisonJob, 'id' | 'createdAt' | 'migratedFrom' | 'snapshotVersion'>>
  ): Promise<ComparisonJob> {
    const snapshot = await this.storage.load();
    const jobIndex = snapshot.comparisonJobs?.findIndex((j) => j.id === id) ?? -1;

    if (jobIndex === -1) {
      throw new Error(`ComparisonJob ${id} not found`);
    }

    const existingJob = snapshot.comparisonJobs![jobIndex];

    // Validate URLs if being updated
    if (input.baselineUrl || input.candidateUrl) {
      const baselineUrl = input.baselineUrl ?? existingJob.baselineUrl;
      const candidateUrl = input.candidateUrl ?? existingJob.candidateUrl;

      if (!baselineUrl || !candidateUrl) {
        throw new Error('Both baselineUrl and candidateUrl are required');
      }

      if (baselineUrl === candidateUrl) {
        throw new Error('baselineUrl and candidateUrl must be different');
      }
    }

    const updatedJob: ComparisonJob = {
      ...existingJob,
      ...input,
      id: existingJob.id, // Ensure ID cannot be changed
      createdAt: existingJob.createdAt, // Ensure createdAt cannot be changed
      updatedAt: new Date().toISOString(),
      migratedFrom: existingJob.migratedFrom, // Preserve migration metadata
      snapshotVersion: existingJob.snapshotVersion, // Preserve version
    };

    const next: typeof snapshot = {
      ...snapshot,
      comparisonJobs: snapshot.comparisonJobs!.map((j, idx) => (idx === jobIndex ? updatedJob : j)),
    };

    await this.storage.save(next);
    return updatedJob;
  }

  async deleteJob(id: string): Promise<boolean> {
    const snapshot = await this.storage.load();
    const jobIndex = snapshot.comparisonJobs?.findIndex((j) => j.id === id) ?? -1;

    if (jobIndex === -1) {
      return false;
    }

    // Also remove associated runs and artifacts
    const associatedRunIds = snapshot.runs.filter((r) => r.jobId === id).map((r) => r.id);
    const next: typeof snapshot = {
      ...snapshot,
      comparisonJobs: snapshot.comparisonJobs!.filter((j) => j.id !== id),
      runs: snapshot.runs.filter((r) => r.jobId !== id),
      artifacts: snapshot.artifacts.filter((a) => !associatedRunIds.includes(a.runId)),
    };

    await this.storage.save(next);
    return true;
  }

  async migrateLegacyJobs(): Promise<number> {
    const snapshot = await this.storage.load();
    
    // If no legacy jobs exist, return 0
    if (!snapshot.jobs || snapshot.jobs.length === 0) {
      return 0;
    }

    // Migrate each legacy job
    const migratedJobs: ComparisonJob[] = snapshot.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      description: job.description,
      baselineUrl: job.sourceUrl,
      candidateUrl: job.targetUrl,
      crawlConfig: defaultCrawlConfig,
      pageMap: [],
      testMatrix: defaultTestMatrix,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: new Date().toISOString(),
      migratedFrom: job.id,
      snapshotVersion: '2.0',
    }));

    // Add migrated jobs to comparisonJobs
    const next: typeof snapshot = {
      ...snapshot,
      comparisonJobs: [...(snapshot.comparisonJobs || []), ...migratedJobs],
      jobs: [], // Clear legacy jobs after migration
      metadata: {
        ...snapshot.metadata,
        lastMigration: new Date().toISOString(),
        migrationNotes: `Migrated ${migratedJobs.length} legacy jobs to ComparisonJob format`,
      },
    };

    await this.storage.save(next);
    return migratedJobs.length;
  }
}

/**
 * @deprecated Use ComparisonJobService instead
 * Kept for backward compatibility during migration
 */
export class JobService implements JobServicePort {
  constructor(private readonly storage: StoragePort) {}

  async listJobs(): Promise<Job[]> {
    const snapshot = await this.storage.load();
    return snapshot.jobs || [];
  }

  async getJobById(id: string): Promise<Job | undefined> {
    const snapshot = await this.storage.load();
    return snapshot.jobs?.find((j) => j.id === id);
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
      jobs: [...(snapshot.jobs || []), job],
    };

    await this.storage.save(next);
    return job;
  }

  async updateJob(id: string, input: Partial<Omit<Job, 'id' | 'createdAt'>>): Promise<Job> {
    const snapshot = await this.storage.load();
    const jobIndex = snapshot.jobs?.findIndex((j) => j.id === id) ?? -1;

    if (jobIndex === -1) {
      throw new Error(`Job ${id} not found`);
    }

    const existingJob = snapshot.jobs![jobIndex];
    const updatedJob: Job = {
      ...existingJob,
      ...input,
      id: existingJob.id,
      createdAt: existingJob.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const next: typeof snapshot = {
      ...snapshot,
      jobs: snapshot.jobs!.map((j, idx) => (idx === jobIndex ? updatedJob : j)),
    };

    await this.storage.save(next);
    return updatedJob;
  }

  async deleteJob(id: string): Promise<boolean> {
    const snapshot = await this.storage.load();
    const jobIndex = snapshot.jobs?.findIndex((j) => j.id === id) ?? -1;

    if (jobIndex === -1) {
      return false;
    }

    const associatedRunIds = snapshot.runs.filter((r) => r.jobId === id).map((r) => r.id);
    const next: typeof snapshot = {
      ...snapshot,
      jobs: snapshot.jobs!.filter((j) => j.id !== id),
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
    // Legacy method - redirects to triggerComparisonRun for ComparisonJobs
    return this.triggerComparisonRun(jobId, triggeredBy);
  }

  /**
   * Triggers a comparison run that enforces dual-site comparison
   * This is the primary method for ComparisonJob runs
   */
  async triggerComparisonRun(jobId: string, triggeredBy: string): Promise<Run> {
    const snapshot = await this.storage.load();

    // Try to find ComparisonJob first
    let comparisonJob = snapshot.comparisonJobs?.find((j) => j.id === jobId);
    
    // Fallback to legacy Job for backward compatibility
    if (!comparisonJob) {
      const legacyJob = snapshot.jobs?.find((j) => j.id === jobId);
      if (!legacyJob) {
        throw new Error(`Job ${jobId} not found`);
      }
      // Convert legacy job to comparison job format for this run
      comparisonJob = {
        id: legacyJob.id,
        name: legacyJob.name,
        description: legacyJob.description,
        baselineUrl: legacyJob.sourceUrl,
        candidateUrl: legacyJob.targetUrl,
        crawlConfig: defaultCrawlConfig,
        pageMap: [],
        testMatrix: defaultTestMatrix,
        status: legacyJob.status,
        createdAt: legacyJob.createdAt,
        updatedAt: legacyJob.updatedAt,
      };
    }

    // Enforce dual-site comparison: both URLs must be present and different
    if (!comparisonJob.baselineUrl || !comparisonJob.candidateUrl) {
      throw new Error('Both baselineUrl and candidateUrl are required for comparison');
    }

    if (comparisonJob.baselineUrl === comparisonJob.candidateUrl) {
      throw new Error('baselineUrl and candidateUrl must be different for comparison');
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

    // Start deterministic Playwright-based capture (baseline then candidate)
    this.executePlaywrightRun(run.id, comparisonJob).catch((err) => {
      console.error(`Error executing Playwright run for run ${run.id}:`, err);
    });

    return run;
  }

  /**
   * Execute comparison run with CrawlAgent integration
   * 
   * Implementation flow:
   * 1. Update run status to 'running'
   * 2. Use CrawlAgent to crawl both baselineUrl and candidateUrl
   * 3. Apply crawlConfig (depth, include/exclude paths, maxPages)
   * 4. Read sitemap.xml if present
   * 5. Normalize URLs and match equivalent pages
   * 6. Generate stable pageMap
   * 7. Store crawl artifacts and logs
   * 8. TODO: Phase 2 - Execute testMatrix:
   *    - Visual: Screenshot comparison, layout diff
   *    - Functional: Interaction testing, form validation
   *    - Data: Content comparison, API response validation
   *    - SEO: Meta tags, structured data, sitemap comparison
   * 9. TODO: Phase 2 - Use Azure OpenAI to analyze differences
   * 10. TODO: Phase 2 - Use MS Agent Framework for orchestration
   * 11. Update run status to 'completed' or 'failed'
   */
  private async simulateComparisonRunExecution(runId: string, job: ComparisonJob): Promise<void> {
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

    const now = new Date().toISOString();
    const artifacts: RunArtifact[] = [];

    try {
      // Initialize CrawlAgent and perform crawling
      const crawlAgent = new CrawlAgent();
      const crawlResult = await crawlAgent.crawlComparison(job, runId);

      // Store crawl artifacts
      for (const artifactPath of crawlResult.artifactPaths) {
        const relativePath = artifactPath.replace(/^.*[\\/]data[\\/]/, 'data/');
        artifacts.push({
          id: randomUUID(),
          runId,
          type: artifactPath.endsWith('.log') ? 'log' : 'report',
          label: this.getArtifactLabel(artifactPath),
          path: relativePath,
          createdAt: now,
        });
      }

      // Update job with generated pageMap if it's better than existing
      if (crawlResult.pageMap.length > 0 && (!job.pageMap || job.pageMap.length === 0)) {
        const jobIndex = snapshot.comparisonJobs?.findIndex((j) => j.id === job.id) ?? -1;
        if (jobIndex >= 0) {
          const updatedJob: ComparisonJob = {
            ...job,
            pageMap: crawlResult.pageMap,
            updatedAt: now,
          };
          const updatedSnapshot: typeof snapshot = {
            ...runningSnapshot,
            comparisonJobs: runningSnapshot.comparisonJobs!.map((j, idx) =>
              idx === jobIndex ? updatedJob : j
            ),
          };
          await this.storage.save(updatedSnapshot);
        }
      }

      // Create and save crawl summary
      const summary = {
        runId,
        jobId: job.id,
        baselineUrl: job.baselineUrl,
        candidateUrl: job.candidateUrl,
        baselinePagesCount: crawlResult.baselineResult.pages.length,
        candidatePagesCount: crawlResult.candidateResult.pages.length,
        matchedPagesCount: crawlResult.matchedPages.length,
        pageMapGenerated: crawlResult.pageMap.length,
        crawlConfig: job.crawlConfig,
        timestamp: now,
      };

      const summaryPath = path.join(DATA_DIR, 'artifacts', runId, 'crawl-summary.json');
      await fs.mkdir(path.dirname(summaryPath), { recursive: true });
      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

      artifacts.push({
        id: randomUUID(),
        runId,
        type: 'report',
        label: 'Crawl Summary',
        path: `data/artifacts/${runId}/crawl-summary.json`,
        createdAt: now,
      });

      // Collect all test results for AI analysis
      let visualDiffResult: VisualDiffResult | undefined;
      let functionalQaResult: FunctionalQAResult | undefined;
      let dataIntegrityResult: DataIntegrityResult | undefined;

      // Execute Playwright tests on matched pages
      if (crawlResult.matchedPages.length > 0) {
        const executionService = new PlaywrightExecutionService();
        const executionResult = await executionService.executeComparison(
          job.baselineUrl,
          job.candidateUrl,
          crawlResult.matchedPages,
          runId
        );

        // Store execution artifacts
        for (const artifactPath of executionResult.artifactPaths) {
          const relativePath = artifactPath.replace(/^.*[\\/]data[\\/]/, 'data/');
          artifacts.push({
            id: randomUUID(),
            runId,
            type: artifactPath.includes('screenshot') ? 'screenshot' : artifactPath.endsWith('.log') ? 'log' : 'report',
            label: this.getArtifactLabel(artifactPath),
            path: relativePath,
            createdAt: now,
          });
        }

        // Add screenshot artifacts for each page
        for (const pageResult of executionResult.baseline.pages) {
          for (const screenshot of pageResult.screenshots) {
            artifacts.push({
              id: randomUUID(),
              runId,
              type: 'screenshot',
              label: `Baseline: ${pageResult.normalizedPath} (${screenshot.viewport.name})`,
              path: screenshot.path,
              createdAt: screenshot.timestamp,
            });
          }
        }

        for (const pageResult of executionResult.candidate.pages) {
          for (const screenshot of pageResult.screenshots) {
            artifacts.push({
              id: randomUUID(),
              runId,
              type: 'screenshot',
              label: `Candidate: ${pageResult.normalizedPath} (${screenshot.viewport.name})`,
              path: screenshot.path,
              createdAt: screenshot.timestamp,
            });
          }
        }

        // Perform functional QA testing
        if (job.testMatrix.functional && executionResult.baselineContext && executionResult.candidateContext) {
          const functionalQaAgent = new FunctionalQaAgent();
          functionalQaResult = await functionalQaAgent.executeFunctionalQAWithContexts(
            executionResult.baselineContext,
            executionResult.candidateContext,
            crawlResult.matchedPages,
            job.baselineUrl,
            job.candidateUrl,
            runId
          );

          // Store functional QA artifacts
          for (const artifactPath of functionalQaResult!.artifactPaths) {
            const relativePath = artifactPath.replace(/^.*[\\/]data[\\/]/, 'data/');
            artifacts.push({
              id: randomUUID(),
              runId,
              type: 'report',
              label: 'Functional QA Results',
              path: relativePath,
              createdAt: now,
            });
          }

          // Store HAR files
          for (const pageResult of functionalQaResult!.baseline.pages) {
            if (pageResult.harPath) {
              artifacts.push({
                id: randomUUID(),
                runId,
                type: 'report',
                label: `Baseline HAR: ${pageResult.normalizedPath}`,
                path: pageResult.harPath,
                createdAt: now,
              });
            }
          }

          for (const pageResult of functionalQaResult!.candidate.pages) {
            if (pageResult.harPath) {
              artifacts.push({
                id: randomUUID(),
                runId,
                type: 'report',
                label: `Candidate HAR: ${pageResult.normalizedPath}`,
                path: pageResult.harPath,
                createdAt: now,
              });
            }
          }
        }

        // Perform data integrity check
        if (job.testMatrix.data && executionResult.baselineContext && executionResult.candidateContext) {
          const dataIntegrityAgent = new DataIntegrityAgent();
          dataIntegrityResult = await dataIntegrityAgent.executeDataIntegrityCheckWithContexts(
            executionResult.baselineContext,
            executionResult.candidateContext,
            crawlResult.matchedPages,
            job.baselineUrl,
            job.candidateUrl,
            runId
          );

          // Store data integrity artifacts
          for (const artifactPath of dataIntegrityResult!.artifactPaths) {
            const relativePath = artifactPath.replace(/^.*[\\/]data[\\/]/, 'data/');
            artifacts.push({
              id: randomUUID(),
              runId,
              type: 'report',
              label: 'Data Integrity Results',
              path: relativePath,
              createdAt: now,
            });
          }
        }

        // Cleanup browser contexts after all tests
        if (executionResult.baselineContext) {
          await executionResult.baselineContext.close();
        }
        if (executionResult.candidateContext) {
          await executionResult.candidateContext.close();
        }
        await executionService.cleanup();

        // Perform visual diff comparison
        if (job.testMatrix.visual) {
          const visualDiffService = new VisualDiffService();
          visualDiffResult = await visualDiffService.compareExecutionResults(
            executionResult,
            runId
          );

          // Store visual diff artifacts
          for (const artifactPath of visualDiffResult!.artifactPaths) {
            const relativePath = artifactPath.replace(/^.*[\\/]data[\\/]/, 'data/');
            artifacts.push({
              id: randomUUID(),
              runId,
              type: 'report',
              label: 'Visual Diff Results',
              path: relativePath,
              createdAt: now,
            });
          }

          // Store diff images and heatmaps
          for (const pageDiff of visualDiffResult!.pages) {
            for (const screenshotDiff of pageDiff.screenshotDiffs) {
              // Diff image
              artifacts.push({
                id: randomUUID(),
                runId,
                type: 'screenshot',
                label: `Diff: ${pageDiff.normalizedPath} (${screenshotDiff.viewport.name}) - ${screenshotDiff.severity}`,
                path: screenshotDiff.diffPath,
                createdAt: screenshotDiff.timestamp,
              });

              // Heatmap
              artifacts.push({
                id: randomUUID(),
                runId,
                type: 'screenshot',
                label: `Heatmap: ${pageDiff.normalizedPath} (${screenshotDiff.viewport.name})`,
                path: screenshotDiff.heatmapPath,
                createdAt: screenshotDiff.timestamp,
              });
            }
          }
        }
      }

      // Perform AI reasoning on all artifacts
      const aiReasoningService = new AiReasoningService();
      const aiResult = await aiReasoningService.analyzeArtifacts(
        visualDiffResult,
        functionalQaResult,
        dataIntegrityResult,
        runId
      );

      // Save AI reasoning results
      const aiResultsPath = await aiReasoningService.saveResults(aiResult, runId);
      artifacts.push({
        id: randomUUID(),
        runId,
        type: 'report',
        label: 'AI Reasoning Results',
        path: aiResultsPath.replace(/^.*[\\/]data[\\/]/, 'data/'),
        createdAt: now,
      });

      // Generate comprehensive report
      const reportAgent = new ReportAgent();
      const report = await reportAgent.generateReport(
        job,
        runningRun,
        aiResult,
        visualDiffResult,
        functionalQaResult,
        dataIntegrityResult,
        runId
      );

      // Save report in both formats
      const reportPaths = await reportAgent.saveReport(report, runId);
      artifacts.push({
        id: randomUUID(),
        runId,
        type: 'report',
        label: 'Migration Test Report (JSON)',
        path: reportPaths.jsonPath,
        createdAt: now,
      });
      artifacts.push({
        id: randomUUID(),
        runId,
        type: 'report',
        label: 'Migration Test Report (Markdown)',
        path: reportPaths.markdownPath,
        createdAt: now,
      });

    } catch (error) {
      // Log error and create error artifact
      const errorMessage = error instanceof Error ? error.message : String(error);
      artifacts.push({
        id: randomUUID(),
        runId,
        type: 'log',
        label: 'Crawl Error',
        path: `data/artifacts/${runId}/crawl-error.log`,
        createdAt: now,
      });

      // Update run to failed
      const failedRun: Run = {
        ...runningRun,
        status: 'failed',
        completedAt: new Date().toISOString(),
      };

      const failedSnapshot: typeof snapshot = {
        ...runningSnapshot,
        runs: runningSnapshot.runs.map((r) => (r.id === runId ? failedRun : r)),
        artifacts: [...runningSnapshot.artifacts, ...artifacts],
      };
      await this.storage.save(failedSnapshot);
      return;
    }

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

  /**
   * Get artifact label from file path
   */
  private getArtifactLabel(artifactPath: string): string {
    const filename = artifactPath.split(/[\\/]/).pop() || '';
    
    if (filename.includes('baseline-crawl')) return 'Baseline Crawl Results';
    if (filename.includes('candidate-crawl')) return 'Candidate Crawl Results';
    if (filename.includes('matched-pages')) return 'Matched Pages';
    if (filename.includes('generated-pageMap')) return 'Generated Page Map';
    if (filename.includes('crawl.log')) return 'Crawl Log';
    if (filename.includes('crawl-summary')) return 'Crawl Summary';
    if (filename.includes('crawl-error')) return 'Crawl Error Log';
    
    return filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '');
  }
}
