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

// Request/Response schemas for validation
const createJobSchema = {
  type: 'object',
  required: ['name'],
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
      },
    },
    status: { type: 'string', enum: ['pending', 'active', 'completed', 'failed'] },
  },
};

const triggerRunSchema = {
  type: 'object',
  properties: {
    triggeredBy: { type: 'string', default: 'system' },
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
        const run = await runService.triggerComparisonRun(id, triggeredBy);
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
      const normalized = exec.path.replace(/^data[\\/]/, dataRoot).replace(/\\/g, path.sep).replace(/\//g, path.sep);
      const content = await fs.readFile(normalized, 'utf-8');
      reply.type('text/markdown').send(content);
      return;
    } catch (err) {
      // @ts-ignore
      console.error('Error reading executive report (primary path):', err, 'artifactPath:', exec.path);
      // fallback: search artifacts folder for any .md report
      const fallback = await findFileBySuffix(id, 'report.md') || await findFileBySuffix(id, '.md');
      if (fallback) {
        try {
          const content = await fs.readFile(fallback, 'utf-8');
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
    try {
      const dataRoot = path.join(__dirname, '..', '..', 'data') + path.sep;
      const normalized = tech.path.replace(/^data[\\/]/, dataRoot).replace(/\\/g, path.sep).replace(/\//g, path.sep);
      const content = await fs.readFile(normalized, 'utf-8');
      reply.type('application/json').send(JSON.parse(content));
      return;
    } catch (err) {
      // @ts-ignore
      console.error('Error reading technical report (primary):', err, 'artifactPath:', tech.path);
      const fallback = await findFileBySuffix(id, 'report.json') || await findFileBySuffix(id, '.json');
      if (fallback) {
        try {
          const content = await fs.readFile(fallback, 'utf-8');
          reply.type('application/json').send(JSON.parse(content));
          return;
        } catch (e) {
          // @ts-ignore
          console.error('Error reading technical report (fallback):', e, 'fallbackPath:', fallback);
        }
      }
      reply.code(500).send({ message: 'Failed to read technical report' });
    }
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
      const normalized = ai.path.replace(/^data[\\/]/, dataRoot).replace(/\\/g, path.sep).replace(/\//g, path.sep);
      const content = await fs.readFile(normalized, 'utf-8');
      const parsed = JSON.parse(content);
      // Derive a compact summary
      if (parsed.executiveSummary) {
        reply.send({ executive: parsed.executiveSummary, riskScore: parsed.riskScore });
      } else {
        reply.send(parsed);
      }
      return;
    } catch (err) {
      // @ts-ignore
      console.error('Error reading summary (primary):', err, 'artifactPath:', ai.path);
      const fallback = await findFileBySuffix(id, 'ai-reasoning-results.json') || await findFileBySuffix(id, 'report.json') || await findFileBySuffix(id, '.json');
      if (fallback) {
        try {
          const content = await fs.readFile(fallback, 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed.executiveSummary) {
            reply.send({ executive: parsed.executiveSummary, riskScore: parsed.riskScore });
          } else {
            reply.send(parsed);
          }
          return;
        } catch (e) {
          // @ts-ignore
          console.error('Error reading summary (fallback):', e, 'fallbackPath:', fallback);
        }
      }
      reply.code(500).send({ message: 'Failed to read summary' });
    }
  });
}

export default fp(apiRoutes);
