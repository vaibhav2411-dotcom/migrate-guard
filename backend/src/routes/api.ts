import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import { ComparisonJobService, RunService } from '../services/domainServices';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { FileStorage } from '../services/fileStorage';
import { CrawlConfig, TestMatrix, PageMap } from '../models';

const storage = new FileStorage();
const jobService = new ComparisonJobService(storage);
const runService = new RunService(storage);

  // Helper: find a file under data/artifacts/{runId} matching suffix (recursive)
  async function findFileBySuffix(runId: string, suffix: string): Promise<string | null> {
    const fs = await import('fs/promises');
    const start = path.join(__dirname, '..', '..', 'data', 'artifacts', runId);
    async function walk(dir: string): Promise<string | null> {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (e) {
        return null;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isFile()) {
          if (ent.name.toLowerCase().endsWith(suffix.toLowerCase())) return full;
        } else if (ent.isDirectory()) {
          const found = await walk(full);
          if (found) return found;
        }
      }
      return null;
    }
    return await walk(start);
  }

  async function readArtifactJson<T>(runId: string, suffixes: string[]): Promise<T | null> {
    const fs = await import('fs/promises');

    for (const suffix of suffixes) {
      const filePath = await findFileBySuffix(runId, suffix);
      if (!filePath) {
        continue;
      }

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content) as T;
      } catch (error) {
        console.error('Failed to read artifact JSON:', error, 'path:', filePath);
      }
    }

    return null;
  }

  function hydrateFunctionalFinding(report: any, functionalQa: any, networkSummary: any) {
    if (!report || typeof report !== 'object' || !Array.isArray(report.technicalFindings)) {
      return report;
    }

    const baselineSummary = functionalQa?.baseline?.summary;
    const candidateSummary = functionalQa?.candidate?.summary;
    if (!baselineSummary || !candidateSummary) {
      return report;
    }

    const baselineFailedRequests = (
      (networkSummary?.baseline?.requests ?? []).filter((request: any) => typeof request?.status === 'number' && request.status >= 400).length +
      (networkSummary?.baseline?.failures ?? []).length
    );
    const candidateFailedRequests = (
      (networkSummary?.candidate?.requests ?? []).filter((request: any) => typeof request?.status === 'number' && request.status >= 400).length +
      (networkSummary?.candidate?.failures ?? []).length
    );

    const baselineBrokenCount = Math.max(baselineSummary.totalBrokenLinks ?? 0, baselineFailedRequests);
    const candidateBrokenCount = Math.max(candidateSummary.totalBrokenLinks ?? 0, candidateFailedRequests);
    const baselineJsCount = baselineSummary.totalJSErrors ?? 0;
    const candidateJsCount = candidateSummary.totalJSErrors ?? 0;
    const candidateAffectedPages = Array.isArray(functionalQa?.candidate?.pages)
      ? functionalQa.candidate.pages
          .filter((page: any) => !page?.navigation?.success || (page?.brokenLinks?.length ?? 0) > 0 || (page?.jsErrors?.length ?? 0) > 0)
          .map((page: any) => page.normalizedPath)
      : [];

    const nextFunctionalFinding = {
      category: 'functional',
      severity: candidateBrokenCount + candidateJsCount > 20 ? 'critical' : candidateBrokenCount + candidateJsCount > 10 ? 'high' : candidateBrokenCount + candidateJsCount > 5 ? 'medium' : candidateBrokenCount + candidateJsCount > 0 ? 'low' : 'none',
      title: 'Functional Issues Detected',
      description: `Candidate issues: ${candidateBrokenCount} broken requests/links, ${candidateJsCount} JavaScript errors. Baseline reference: ${baselineBrokenCount} broken requests/links, ${baselineJsCount} JavaScript errors.`,
      impact: `Candidate site recorded ${candidateBrokenCount} broken requests/links and ${candidateJsCount} JavaScript errors. Baseline reference recorded ${baselineBrokenCount} broken requests/links and ${baselineJsCount} JavaScript errors.`,
      recommendation: 'Fix broken links, failed resources, and JavaScript errors before deployment.',
      evidence: `Candidate navigation issues: ${candidateSummary.pagesWithNavigationIssues ?? 0} pages. Baseline navigation issues: ${baselineSummary.pagesWithNavigationIssues ?? 0} pages.`,
      affectedPages: candidateAffectedPages,
    };

    const functionalIndex = report.technicalFindings.findIndex((finding: any) => finding?.category === 'functional');
    if (functionalIndex >= 0) {
      report.technicalFindings[functionalIndex] = {
        ...report.technicalFindings[functionalIndex],
        ...nextFunctionalFinding,
      };
    } else if (candidateBrokenCount > 0 || candidateJsCount > 0 || baselineBrokenCount > 0 || baselineJsCount > 0) {
      report.technicalFindings.push(nextFunctionalFinding);
    }

    return report;
  }

  function hydrateUiIntegrityFinding(report: any, uiIntegrity: any) {
    if (!report || typeof report !== 'object' || !Array.isArray(report.technicalFindings)) {
      return report;
    }

    const summary = uiIntegrity?.summary;
    if (!summary) {
      return report;
    }

    const failCount = (summary.fail ?? 0) + (summary.critical ?? 0);
    const warnCount = summary.warn ?? 0;
    const severity = (summary.critical ?? 0) > 0
      ? 'critical'
      : failCount > 0
        ? 'high'
        : warnCount > 0
          ? 'medium'
          : 'none';

    const affectedSections = Array.isArray(uiIntegrity?.regions)
      ? uiIntegrity.regions
          .filter((region: any) => region?.severity && region.severity !== 'pass')
          .map((region: any) => region.region)
          .slice(0, 20)
      : [];

    const nextFinding = {
      category: 'ui',
      severity,
      title: 'UI Integrity And Accessibility Findings',
      description: `UI checks reported ${summary.critical ?? 0} critical, ${summary.fail ?? 0} failed, and ${summary.warn ?? 0} warning items.`,
      impact: 'Structural, interaction, and responsive issues can degrade accessibility and trust during migration cutover.',
      recommendation: 'Address critical and high UI/accessibility findings before go-live, then re-run comparison for validation.',
      evidence: `UI pass=${summary.pass ?? 0}, warn=${summary.warn ?? 0}, fail=${summary.fail ?? 0}, critical=${summary.critical ?? 0}`,
      affectedPages: affectedSections,
    };

    const findingIndex = report.technicalFindings.findIndex((finding: any) => finding?.category === 'ui');
    if (findingIndex >= 0) {
      report.technicalFindings[findingIndex] = {
        ...report.technicalFindings[findingIndex],
        ...nextFinding,
      };
    } else if (failCount > 0 || warnCount > 0) {
      report.technicalFindings.push(nextFinding);
    }

    return report;
  }

  async function readRunSummaryMetrics(runId: string): Promise<{
    riskScore?: number;
    goNoGo?: string;
    issuesFound?: number;
    criticalIssues?: number;
    passRate?: number;
  } | null> {
    const aiSummary = await readArtifactJson<any>(runId, ['ai-reasoning-results.json']);
    if (aiSummary?.executiveSummary) {
      return {
        riskScore: aiSummary.executiveSummary.riskScore,
        goNoGo: aiSummary.executiveSummary.goNoGo,
        issuesFound: aiSummary.executiveSummary.keyMetrics?.issuesFound,
        criticalIssues: aiSummary.executiveSummary.keyMetrics?.criticalIssues,
        passRate: aiSummary.executiveSummary.keyMetrics?.passRate,
      };
    }

    const report = await readArtifactJson<any>(runId, ['report.json']);
    if (report?.executiveSummary) {
      return {
        riskScore: report.executiveSummary.riskScore,
        goNoGo: report.executiveSummary.goNoGo,
        issuesFound: report.executiveSummary.keyMetrics?.issuesFound,
        criticalIssues: report.executiveSummary.keyMetrics?.criticalIssues,
        passRate: report.executiveSummary.keyMetrics?.passRate,
      };
    }

    return null;
  }

  function classifyRegression(currentRisk?: number, previousRisk?: number) {
    if (typeof currentRisk !== 'number' || typeof previousRisk !== 'number') {
      return { status: 'unknown', delta: null as number | null };
    }

    const delta = currentRisk - previousRisk;
    if (delta >= 5) {
      return { status: 'regressed', delta };
    }
    if (delta <= -5) {
      return { status: 'improved', delta };
    }

    return { status: 'stable', delta };
  }

// Request/Response schemas for validation
const createJobSchema = {
  type: 'object',
  required: ['name'],
  anyOf: [
    { required: ['baselineUrl', 'candidateUrl'] },
    { required: ['sourceUrl', 'targetUrl'] },
  ],
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    baselineUrl: { type: 'string', format: 'uri' },
    candidateUrl: { type: 'string', format: 'uri' },
    // legacy fields
    sourceUrl: { type: 'string', format: 'uri' },
    targetUrl: { type: 'string', format: 'uri' },
    crawlConfig: {
      type: 'object',
      properties: {
        depth: { type: 'number', minimum: 0 },
        includePaths: { type: 'array', items: { type: 'string' } },
        excludePaths: { type: 'array', items: { type: 'string' } },
        maxPages: { type: 'number', minimum: 1 },
        followExternalLinks: { type: 'boolean' },
      },
    },
    pageMap: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          baselinePath: { type: 'string' },
          candidatePath: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    testMatrix: {
      type: 'object',
      properties: {
        visual: { type: 'boolean' },
        functional: { type: 'boolean' },
        data: { type: 'boolean' },
        seo: { type: 'boolean' },
        performance: { type: 'boolean' },
        security: { type: 'boolean' },
        uiIntegrity: { type: 'boolean' },
        accessibility: { type: 'boolean' },
      },
    },
  },
};

const updateJobSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    baselineUrl: { type: 'string', format: 'uri' },
    candidateUrl: { type: 'string', format: 'uri' },
    crawlConfig: {
      type: 'object',
      properties: {
        depth: { type: 'number', minimum: 0 },
        includePaths: { type: 'array', items: { type: 'string' } },
        excludePaths: { type: 'array', items: { type: 'string' } },
        maxPages: { type: 'number', minimum: 1 },
        followExternalLinks: { type: 'boolean' },
      },
    },
    pageMap: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          baselinePath: { type: 'string' },
          candidatePath: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
    testMatrix: {
      type: 'object',
      properties: {
        visual: { type: 'boolean' },
        functional: { type: 'boolean' },
        data: { type: 'boolean' },
        seo: { type: 'boolean' },
        performance: { type: 'boolean' },
        security: { type: 'boolean' },
        uiIntegrity: { type: 'boolean' },
        accessibility: { type: 'boolean' },
      },
    },
    status: { type: 'string', enum: ['pending', 'active', 'completed', 'failed'] },
  },
};

const triggerRunSchema = {
  type: 'object',
  properties: {
    triggeredBy: { type: 'string', default: 'system' },
    runSettings: {
      type: 'object',
      properties: {
        useAI: { type: 'boolean' },
      },
    },
  },
};

interface CreateJobBody {
  name: string;
  description?: string;
  baselineUrl: string;
  candidateUrl: string;
  crawlConfig?: CrawlConfig;
  pageMap?: PageMap[];
  testMatrix?: TestMatrix;
}

interface UpdateJobBody {
  name?: string;
  description?: string;
  baselineUrl?: string;
  candidateUrl?: string;
  crawlConfig?: CrawlConfig;
  pageMap?: PageMap[];
  testMatrix?: TestMatrix;
  status?: 'pending' | 'active' | 'completed' | 'failed';
}

interface TriggerRunBody {
  triggeredBy?: string;
  runSettings?: { useAI?: boolean };
}

async function apiRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // ComparisonJobs - CRUD operations
  fastify.post<{ Body: CreateJobBody }>(
    '/api/jobs',
    { schema: { body: createJobSchema } },
    async (request, reply) => {
      const body = request.body;

      try {
        const createInput: {
          name: string;
          description?: string;
          baselineUrl: string;
          candidateUrl: string;
          crawlConfig?: CrawlConfig;
          pageMap?: PageMap[];
          testMatrix?: TestMatrix;
        } = {
          name: body.name,
          description: body.description,
          baselineUrl: body.baselineUrl,
          candidateUrl: body.candidateUrl,
        };

        if (body.crawlConfig) {
          createInput.crawlConfig = body.crawlConfig;
        }
        if (body.pageMap) {
          createInput.pageMap = body.pageMap;
        }
        if (body.testMatrix) {
          createInput.testMatrix = body.testMatrix;
        }

            // Support legacy field names `sourceUrl`/`targetUrl`
            createInput.baselineUrl = body.baselineUrl ?? (body as any).sourceUrl;
            createInput.candidateUrl = body.candidateUrl ?? (body as any).targetUrl;

        const job = await jobService.createJob(createInput);

        reply.code(201).send(job);
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('required') || err.message.includes('different')) {
            reply.code(400).send({ message: err.message });
            return;
          }
        }
        throw err;
      }
    }
  );

  fastify.get('/api/jobs', async (_request, reply) => {
    const jobs = await jobService.listJobs();
    reply.send(jobs);
  });

  fastify.get<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params;
    const job = await jobService.getJobById(id);
    if (!job) {
      reply.code(404).send({ message: 'Job not found' });
      return;
    }
    reply.send(job);
  });

  fastify.put<{ Params: { id: string }; Body: UpdateJobBody }>(
    '/api/jobs/:id',
    { schema: { body: updateJobSchema } },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      try {
        const job = await jobService.updateJob(id, body);
        reply.send(job);
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('not found')) {
            reply.code(404).send({ message: 'Job not found' });
            return;
          }
          if (err.message.includes('required') || err.message.includes('different')) {
            reply.code(400).send({ message: err.message });
            return;
          }
        }
        throw err;
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = await jobService.deleteJob(id);
    if (!deleted) {
      reply.code(404).send({ message: 'Job not found' });
      return;
    }
    reply.code(204).send();
  });

  // Migration endpoint (optional, for manual migration)
  fastify.post('/api/jobs/migrate', async (_request, reply) => {
    try {
      const count = await jobService.migrateLegacyJobs();
      reply.send({ message: `Migrated ${count} legacy jobs to ComparisonJob format`, count });
    } catch (err) {
      if (err instanceof Error) {
        reply.code(500).send({ message: err.message });
        return;
      }
      throw err;
    }
  });

  // Trigger comparison run (enforces dual-site comparison)
  fastify.post<{ Params: { id: string }; Body?: TriggerRunBody }>(
    '/api/jobs/:id/run',
    { schema: { body: triggerRunSchema } },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;
      const triggeredBy = body?.triggeredBy ?? 'system';

      try {
          const runSettings = body?.runSettings;
          const run = await runService.triggerComparisonRun(id, triggeredBy, runSettings);
        reply.code(202).send(run);
      } catch (err) {
        if (err instanceof Error) {
          if (err.message.includes('not found')) {
            reply.code(404).send({ message: 'Job not found' });
            return;
          }
          if (err.message.includes('required') || err.message.includes('different')) {
            reply.code(400).send({ message: err.message });
            return;
          }
        }
        throw err;
      }
    }
  );

  // Runs
  fastify.get('/api/runs', async (_request, reply) => {
    const runs = await runService.listRuns();
    reply.send(runs);
  });

  fastify.get<{ Querystring: { limit?: string; jobId?: string } }>('/api/runs/trends', async (request, reply) => {
    const limit = Number(request.query.limit ?? 20);
    const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 20;
    const jobId = request.query.jobId;

    const allRuns = await runService.listRuns();
    const filteredRuns = allRuns
      .filter((run) => !jobId || run.jobId === jobId)
      .sort((left, right) => new Date(left.triggeredAt).getTime() - new Date(right.triggeredAt).getTime())
      .slice(-boundedLimit);

    const completedRuns = filteredRuns.filter((run) => run.status === 'completed');
    const points = await Promise.all(
      completedRuns.map(async (run) => {
        const metrics = await readRunSummaryMetrics(run.id);
        return {
          runId: run.id,
          jobId: run.jobId,
          status: run.status,
          triggeredAt: run.triggeredAt,
          completedAt: run.completedAt,
          riskScore: metrics?.riskScore,
          goNoGo: metrics?.goNoGo,
          issuesFound: metrics?.issuesFound,
          criticalIssues: metrics?.criticalIssues,
          passRate: metrics?.passRate,
        };
      })
    );

    const scoredPoints = points.filter((point) => typeof point.riskScore === 'number');
    const avgRiskScore = scoredPoints.length > 0
      ? Math.round(scoredPoints.reduce((sum, point) => sum + (point.riskScore as number), 0) / scoredPoints.length)
      : null;

    const latest = scoredPoints.length > 0 ? scoredPoints[scoredPoints.length - 1] : null;
    const previous = scoredPoints.length > 1 ? scoredPoints[scoredPoints.length - 2] : null;
    const regression = classifyRegression(latest?.riskScore, previous?.riskScore);

    reply.send({
      points,
      aggregates: {
        totalRuns: filteredRuns.length,
        completedRuns: completedRuns.length,
        failedRuns: filteredRuns.filter((run) => run.status === 'failed').length,
        avgRiskScore,
        latestRiskScore: latest?.riskScore ?? null,
        latestRunId: latest?.runId ?? null,
        riskDeltaVsPrevious: regression.delta,
        riskTrend: regression.status,
      },
    });
  });

  fastify.get<{ Params: { id: string }; Querystring: { limit?: string } }>('/api/jobs/:id/history', async (request, reply) => {
    const { id } = request.params;
    const limit = Number(request.query.limit ?? 25);
    const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 25;

    const job = await jobService.getJobById(id);
    if (!job) {
      reply.code(404).send({ message: 'Job not found' });
      return;
    }

    const runs = (await runService.listRuns())
      .filter((run) => run.jobId === id)
      .sort((left, right) => new Date(left.triggeredAt).getTime() - new Date(right.triggeredAt).getTime())
      .slice(-boundedLimit);

    const history = [] as Array<{
      runId: string;
      status: string;
      triggeredAt: string;
      completedAt?: string;
      riskScore?: number;
      goNoGo?: string;
      issuesFound?: number;
      criticalIssues?: number;
      passRate?: number;
      regression: { status: string; delta: number | null };
    }>;

    let previousRisk: number | undefined;
    for (const run of runs) {
      const metrics = run.status === 'completed' ? await readRunSummaryMetrics(run.id) : null;
      const regression = classifyRegression(metrics?.riskScore, previousRisk);
      history.push({
        runId: run.id,
        status: run.status,
        triggeredAt: run.triggeredAt,
        completedAt: run.completedAt,
        riskScore: metrics?.riskScore,
        goNoGo: metrics?.goNoGo,
        issuesFound: metrics?.issuesFound,
        criticalIssues: metrics?.criticalIssues,
        passRate: metrics?.passRate,
        regression,
      });

      if (typeof metrics?.riskScore === 'number') {
        previousRisk = metrics.riskScore;
      }
    }

    reply.send({
      job: {
        id: job.id,
        name: job.name,
        baselineUrl: job.baselineUrl,
        candidateUrl: job.candidateUrl,
      },
      history,
    });
  });

  fastify.get<{ Params: { id: string } }>('/api/runs/:id', async (request, reply) => {
    const { id } = request.params;
    const run = await runService.getRunById(id);
    if (!run) {
      reply.code(404).send({ message: 'Run not found' });
      return;
    }
    reply.send(run);
  });

  fastify.get<{ Params: { id: string } }>('/api/runs/:id/artifacts', async (request, reply) => {
    const { id } = request.params;
    const artifacts = await runService.listArtifactsByRun(id);
    reply.send(artifacts);
  });

  // Report endpoints
  fastify.get<{ Params: { id: string } }>('/api/runs/:id/report/executive', async (request, reply) => {
    const { id } = request.params;
    const artifacts = await runService.listArtifactsByRun(id);
    const exec = artifacts.find((a) => a.label && a.label.toLowerCase().includes('migration test report (markdown)')) || artifacts.find((a) => a.path && a.path.endsWith('report.md'));
    if (!exec) {
      reply.code(404).send({ message: 'Executive report not found' });
      return;
    }
    const fs = await import('fs/promises');
    try {
      const dataRoot = path.join(__dirname, '..', '..', 'data') + path.sep;
      const normalized = exec.path.replace(/^data[\\\/]/, dataRoot).replace(/\\/g, path.sep).replace(/\//g, path.sep);
      const content = await fs.readFile(normalized, 'utf-8');
      // If file looks like JSON (accidental) prefer returning raw content as text
      if (path.extname(normalized).toLowerCase() === '.json') {
        // Return JSON as text for executive endpoint to avoid double-parsing on client
        reply.type('application/json').send(JSON.parse(content));
      } else {
        reply.type('text/markdown').send(content);
      }
      return;
    } catch (err) {
      // @ts-ignore
      console.error('Error reading executive report (primary path):', err, 'artifactPath:', exec.path);
      // fallback: search artifacts folder for any .md or .json report
      const fallback = await findFileBySuffix(id, 'report.md') || await findFileBySuffix(id, '.md') || await findFileBySuffix(id, 'report.json') || await findFileBySuffix(id, '.json');
      if (fallback) {
        try {
          const content = await fs.readFile(fallback, 'utf-8');
          if (fallback.toLowerCase().endsWith('.json')) {
            // Safely parse JSON; if parse fails return raw text
            try {
              const parsed = JSON.parse(content);
              reply.type('application/json').send(parsed);
              return;
            } catch (parseErr) {
              console.error('JSON parse failed for fallback executive report:', parseErr, 'path:', fallback);
              reply.type('text/plain').send(content);
              return;
            }
          }
          reply.type('text/markdown').send(content);
          return;
        } catch (e) {
          // @ts-ignore
          console.error('Error reading executive report (fallback):', e, 'fallbackPath:', fallback);
        }
      }
      reply.code(500).send({ message: 'Failed to read report' });
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/runs/:id/report/technical', async (request, reply) => {
    const { id } = request.params;
    const artifacts = await runService.listArtifactsByRun(id);
    const tech = artifacts.find((a) => a.path && a.path.endsWith('report.json'));
    if (!tech) {
      reply.code(404).send({ message: 'Technical report not found' });
      return;
    }
    const fs = await import('fs/promises');
    const [functionalQa, networkSummary, uiIntegrity] = await Promise.all([
      readArtifactJson<any>(id, ['functional-qa-results.json']),
      readArtifactJson<any>(id, ['network-requests.json']),
      readArtifactJson<any>(id, ['ui-integrity.json']),
    ]);
    try {
      const dataRoot = path.join(__dirname, '..', '..', 'data') + path.sep;
      const normalized = tech.path.replace(/^data[\\\/]/, dataRoot).replace(/\\/g, path.sep).replace(/\//g, path.sep);
      const content = await fs.readFile(normalized, 'utf-8');
      try {
        const parsed = JSON.parse(content);
        const withFunctional = hydrateFunctionalFinding(parsed, functionalQa, networkSummary);
        reply.type('application/json').send(hydrateUiIntegrityFinding(withFunctional, uiIntegrity));
        return;
      } catch (parseErr) {
        console.error('JSON parse failed for technical report (primary):', parseErr, 'path:', normalized);
        // Fallback to raw text response to avoid 500
        reply.type('text/plain').send(content);
        return;
      }
    } catch (err) {
      // @ts-ignore
      console.error('Error reading technical report (primary):', err, 'artifactPath:', tech.path);
      const fallback = await findFileBySuffix(id, 'report.json') || await findFileBySuffix(id, '.json');
      if (fallback) {
        try {
          const content = await fs.readFile(fallback, 'utf-8');
          try {
            const parsed = JSON.parse(content);
            const withFunctional = hydrateFunctionalFinding(parsed, functionalQa, networkSummary);
            reply.type('application/json').send(hydrateUiIntegrityFinding(withFunctional, uiIntegrity));
            return;
          } catch (parseErr) {
            console.error('JSON parse failed for technical report (fallback):', parseErr, 'path:', fallback);
            reply.type('text/plain').send(content);
            return;
          }
        } catch (e) {
          // @ts-ignore
          console.error('Error reading technical report (fallback):', e, 'fallbackPath:', fallback);
        }
      }
      reply.code(500).send({ message: 'Failed to read technical report' });
    }
  });

  // HTML report: human-friendly table with screenshots and findings
  fastify.get<{ Params: { id: string } }>('/api/runs/:id/report/html', async (request, reply) => {
    const { id } = request.params;
    const [matchedPages, functionalQa, networkSummary, baselineExecution, candidateExecution] = await Promise.all([
      readArtifactJson<any[]>(id, ['matched-pages.json']),
      readArtifactJson<any>(id, ['functional-qa-results.json']),
      readArtifactJson<any>(id, ['network-requests.json']),
      readArtifactJson<any>(id, ['baseline-execution.json']),
      readArtifactJson<any>(id, ['candidate-execution.json']),
    ]);

    if (!matchedPages || !functionalQa) {
      reply.code(404).send({ message: 'Required artifacts not found to build HTML report' });
      return;
    }

    const makeImgTag = (side: string, pageKey: string, vp: string) => {
      const webPath = `data/artifacts/${id}/${side}/${pageKey}/screenshot-${vp}.png`;
      return `<a href="/${webPath}" target="_blank"><img src="/${webPath}" alt="${side} ${pageKey} ${vp}" style="max-width:120px; max-height:80px;"/></a>`;
    };

    function pageKeyFromNormalizedPath(normalized: string) {
      const trimmed = (normalized || '').replace(/\/+$/, '') || '/';
      if (trimmed === '/') return 'index';
      return trimmed.replace(/^\/+/, '').replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
    }

    const rows: string[] = [];
    for (const m of matchedPages) {
      const baseline = m.baseline || {};
      const candidate = m.candidate || {};
      const key = pageKeyFromNormalizedPath(baseline.normalizedPath);

      const fBaseline = (functionalQa?.baseline?.pages ?? []).find((p: any) => p.normalizedPath === baseline.normalizedPath || pageKeyFromNormalizedPath(p.normalizedPath) === key) || {};
      const fCandidate = (functionalQa?.candidate?.pages ?? []).find((p: any) => p.normalizedPath === candidate.normalizedPath || pageKeyFromNormalizedPath(p.normalizedPath) === key) || {};

      const brokenCount = (fCandidate.brokenLinks?.length ?? 0);
      const jsCount = (fCandidate.jsErrors?.length ?? 0);
      const nav = fCandidate.navigation?.success === false ? `<span style="color:crimson">failed</span>` : 'ok';

      const imgs = ['desktop','tablet','mobile'].map((vp) => makeImgTag('baseline', key, vp)).join('') + '<br/>' + ['desktop','tablet','mobile'].map((vp) => makeImgTag('candidate', key, vp)).join('');

      rows.push(`
        <tr>
          <td>${baseline.normalizedPath ?? baseline.url ?? key}</td>
          <td class="break-all"><a href="${baseline.url}" target="_blank">${baseline.url}</a></td>
          <td class="break-all"><a href="${candidate.url}" target="_blank">${candidate.url}</a></td>
          <td style="text-align:center">${brokenCount}</td>
          <td style="text-align:center">${jsCount}</td>
          <td style="text-align:center">${nav}</td>
          <td>${imgs}</td>
        </tr>
      `);
    }

    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Run ${id} - HTML Report</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background: #f4f4f4; text-align: left; }
          .break-all { word-break: break-all; }
          img { border: 1px solid #ccc; margin: 2px; }
        </style>
      </head>
      <body>
        <h1>Run ${id} - Report</h1>
        <p>Generated: ${new Date().toISOString()}</p>
        <table>
          <thead>
            <tr>
              <th>Page</th>
              <th>Baseline URL</th>
              <th>Candidate URL</th>
              <th>Broken</th>
              <th>JS Errors</th>
              <th>Navigation</th>
              <th>Screenshots</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join('\n')}
          </tbody>
        </table>
      </body>
      </html>`;

    reply.type('text/html').send(html);
  });

  fastify.get<{ Params: { id: string } }>('/api/runs/:id/summary', async (request, reply) => {
    const { id } = request.params;
    const artifacts = await runService.listArtifactsByRun(id);
    // Try to find ai-reasoning-results.json or report.json
    const ai = artifacts.find((a) => a.path && a.path.includes('ai-reasoning-results.json')) || artifacts.find((a) => a.path && a.path.endsWith('report.json'));
    if (!ai) {
      reply.code(404).send({ message: 'Summary not found' });
      return;
    }
    const fs = await import('fs/promises');
    try {
      const dataRoot = path.join(__dirname, '..', '..', 'data') + path.sep;
      const normalized = ai.path.replace(/^data[\\\/]/, dataRoot).replace(/\\/g, path.sep).replace(/\//g, path.sep);
      const content = await fs.readFile(normalized, 'utf-8');
      try {
        const parsed = JSON.parse(content);
        // Derive a compact summary
        if (parsed.executiveSummary) {
          reply.send({ executive: parsed.executiveSummary, riskScore: parsed.riskScore });
        } else {
          reply.send(parsed);
        }
        return;
      } catch (parseErr) {
        console.error('JSON parse failed for summary (primary):', parseErr, 'path:', normalized);
        // If parse fails, return raw content as plain text
        reply.type('text/plain').send(content);
        return;
      }
    } catch (err) {
      // @ts-ignore
      console.error('Error reading summary (primary):', err, 'artifactPath:', ai.path);
      const fallback = await findFileBySuffix(id, 'ai-reasoning-results.json') || await findFileBySuffix(id, 'report.json') || await findFileBySuffix(id, '.json');
      if (fallback) {
        try {
          const content = await fs.readFile(fallback, 'utf-8');
          try {
            const parsed = JSON.parse(content);
            if (parsed.executiveSummary) {
              reply.send({ executive: parsed.executiveSummary, riskScore: parsed.riskScore });
            } else {
              reply.send(parsed);
            }
            return;
          } catch (parseErr) {
            console.error('JSON parse failed for summary (fallback):', parseErr, 'path:', fallback);
            reply.type('text/plain').send(content);
            return;
          }
        } catch (e) {
          // @ts-ignore
          console.error('Error reading summary (fallback):', e, 'fallbackPath:', fallback);
        }
      }
      reply.code(500).send({ message: 'Failed to read summary' });
    }
  });

  fastify.get<{ Params: { id: string } }>('/api/runs/:id/evidence', async (request, reply) => {
    const { id } = request.params;

    const [crawlSummary, matchedPages, functionalQa, networkSummary, baselineExecution, candidateExecution] = await Promise.all([
      readArtifactJson<any>(id, ['crawl-summary.json']),
      readArtifactJson<any[]>(id, ['matched-pages.json']),
      readArtifactJson<any>(id, ['functional-qa-results.json']),
      readArtifactJson<any>(id, ['network-requests.json']),
      readArtifactJson<any>(id, ['baseline-execution.json']),
      readArtifactJson<any>(id, ['candidate-execution.json']),
    ]);

    const summarizeExecution = (execution: any) => {
      const pages = Array.isArray(execution?.pages) ? execution.pages : [];

      return {
        totalPages: pages.length,
        totalScreenshots: pages.reduce((sum: number, page: any) => sum + (Array.isArray(page?.screenshots) ? page.screenshots.length : 0), 0),
        totalDomSnapshots: pages.reduce((sum: number, page: any) => sum + (Array.isArray(page?.domSnapshots) ? page.domSnapshots.length : 0), 0),
        estimatedScrollScreens: pages.reduce((sum: number, page: any) => {
          const screenshotCount = Array.isArray(page?.screenshots) ? page.screenshots.length : 0;
          return sum + screenshotCount;
        }, 0),
      };
    };

    const normalizeNetworkSummary = (siteNetwork: any) => {
      const requests = Array.isArray(siteNetwork?.requests) ? siteNetwork.requests : [];
      const failures = Array.isArray(siteNetwork?.failures) ? siteNetwork.failures : [];
      const failedResponses = requests.filter((request: any) => typeof request?.status === 'number' && request.status >= 400);

      return {
        requestCount: requests.length,
        failureCount: failedResponses.length + failures.length,
        failedRequests: [...failedResponses, ...failures].slice(0, 200),
      };
    };

    reply.send({
      runId: id,
      crawlSummary,
      matchedPages: matchedPages ?? [],
      functionalQa,
      networkSummary: networkSummary
        ? {
            baseline: normalizeNetworkSummary(networkSummary.baseline),
            candidate: normalizeNetworkSummary(networkSummary.candidate),
          }
        : null,
      executionSummary: {
        baseline: summarizeExecution(baselineExecution),
        candidate: summarizeExecution(candidateExecution),
      },
    });
  });

  // Save developer-selected evidence (e.g., selected link row) into run artifacts
  fastify.post<{ Params: { id: string } }>('/api/runs/:id/evidence/save', async (request, reply) => {
    const { id } = request.params;
    const payload: any = request.body || {};

    try {
      const fs = await import('fs/promises');
      // fs is used extensively below for file operations; import here to ensure availability

      const artifactsRoot = path.resolve(__dirname, '../../data/artifacts');
      const runDir = path.join(artifactsRoot, id);
      await fs.mkdir(runDir, { recursive: true });
      const saveDir = path.join(runDir, 'saved-evidence');
      await fs.mkdir(saveDir, { recursive: true });

      // try to enrich payload with available screenshots and dom snapshot summaries
      const matchedPath = path.join(runDir, 'matched-pages.json');
      let normalizedPath: string | null = null;
      try {
        if (await fs.stat(matchedPath).then(() => true).catch(() => false)) {
          const matchedRaw = await fs.readFile(matchedPath, 'utf-8');
          const matched = JSON.parse(matchedRaw);
          const matchedPages = Array.isArray(matched) ? matched : (matched && Array.isArray(matched.matchedPages) ? matched.matchedPages : []);
          function pageKeyFromNormalizedPath(normalized: string) {
            const trimmed = (normalized || '').replace(/\/+$/, '') || '/';
            if (trimmed === '/') return 'index';
            return trimmed.replace(/^\/+/, '').replace(/[^a-zA-Z0-9-_]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase();
          }
          for (const m of matchedPages) {
            const baselineNorm = m?.baseline?.normalizedPath;
            const key = baselineNorm ? pageKeyFromNormalizedPath(baselineNorm) : null;
            if (key && key === (payload.pageKey || '')) {
              normalizedPath = baselineNorm;
              break;
            }
          }
        }
      } catch (e) {
        normalizedPath = null;
      }

      const evidence: any = { screenshots: [], domSnapshots: { baseline: [], candidate: [] } };

      // collect screenshot files if present under baseline/candidate folders
      const viewports = ['desktop', 'tablet', 'mobile'];
      for (const side of ['baseline', 'candidate']) {
        for (const vp of viewports) {
          const candidatePath = path.join(runDir, side, (payload.pageKey || 'index'), `screenshot-${vp}.png`);
          if (await fs.stat(candidatePath).then(() => true).catch(() => false)) {
            evidence.screenshots.push({ side, viewport: vp, path: `data/artifacts/${id}/${side}/${payload.pageKey}/screenshot-${vp}.png` });
          }
        }
      }

      // include dom-snapshots-summary entries if present
      const domSummaryPath = path.join(runDir, 'dom-snapshots-summary.json');
      if (await fs.stat(domSummaryPath).then(() => true).catch(() => false)) {
        try {
          const domRaw = await fs.readFile(domSummaryPath, 'utf-8');
          const dom = JSON.parse(domRaw);
          const findSnapshots = (arr: any[]) => {
            for (const item of arr || []) {
              if (item.normalizedPath === normalizedPath || (!item.normalizedPath && (payload.pageKey === 'index' || payload.pageKey === '/'))) {
                return item.snapshots || [];
              }
            }
            return [];
          };

          evidence.domSnapshots.baseline = findSnapshots(dom.baseline || []);
          evidence.domSnapshots.candidate = findSnapshots(dom.candidate || []);
        } catch (e) {
          // ignore
        }
      }

      const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${(payload.pageKey || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_')}.json`;
      const target = path.join(saveDir, fileName);
      const toWrite = { savedAt: new Date().toISOString(), payload, evidence };
      await fs.writeFile(target, JSON.stringify(toWrite, null, 2), 'utf-8');

      reply.send({ ok: true, path: `data/artifacts/${id}/saved-evidence/${fileName}` });
    } catch (err) {
      console.error('Failed to save evidence for run', id, err);
      reply.code(500).send({ ok: false, error: String(err) });
    }
  });

  // List saved evidence files for a run
  fastify.get<{ Params: { id: string } }>('/api/runs/:id/evidence/saved', async (request, reply) => {
    const { id } = request.params;
    const fs = await import('fs/promises');
    try {
      const artifactsRoot = path.resolve(__dirname, '..', '..', 'data', 'artifacts');
      const savedDir = path.join(artifactsRoot, id, 'saved-evidence');
      let entries: any[] = [];
      try {
        entries = await fs.readdir(savedDir, { withFileTypes: true });
      } catch (e) {
        // No saved-evidence folder yet
        reply.send([]);
        return;
      }

      const files = await Promise.all(
        entries
          .filter((e) => e.isFile())
          .map(async (ent) => {
            const full = path.join(savedDir, ent.name);
            const stat = await fs.stat(full);
            return {
              name: ent.name,
              path: `data/artifacts/${id}/saved-evidence/${ent.name}`,
              size: stat.size,
              createdAt: stat.birthtime.toISOString(),
              modifiedAt: stat.mtime.toISOString(),
            };
          })
      );

      reply.send(files.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
    } catch (err) {
      console.error('Failed listing saved evidence for run', id, err);
      reply.code(500).send({ ok: false, error: String(err) });
    }
  });

  // Admin: trigger cache invalidation / surrogate-key purge
  fastify.post('/api/cache/purge', async (request, reply) => {
    const body: any = request.body || {};
    const keys: string[] = Array.isArray(body.keys) ? body.keys : [];
    if (keys.length === 0) {
      reply.code(400).send({ message: 'keys array required' });
      return;
    }

    try {
      const { broadcastPurge } = await import('../services/cacheInvalidation');
      const res = await broadcastPurge(keys);
      reply.send({ ok: true, result: res });
    } catch (err) {
      reply.code(500).send({ message: 'Purge failed', error: String(err) });
    }
  });
}

export default fp(apiRoutes);
