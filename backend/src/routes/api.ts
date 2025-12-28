import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import { JobService, RunService } from '../services/domainServices';
import { FileStorage } from '../services/fileStorage';

const storage = new FileStorage();
const jobService = new JobService(storage);
const runService = new RunService(storage);

// Request/Response schemas for validation
const createJobSchema = {
  type: 'object',
  required: ['name', 'sourceUrl', 'targetUrl'],
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    sourceUrl: { type: 'string', format: 'uri' },
    targetUrl: { type: 'string', format: 'uri' },
  },
};

const updateJobSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    sourceUrl: { type: 'string', format: 'uri' },
    targetUrl: { type: 'string', format: 'uri' },
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
  sourceUrl: string;
  targetUrl: string;
}

interface UpdateJobBody {
  name?: string;
  description?: string;
  sourceUrl?: string;
  targetUrl?: string;
  status?: 'pending' | 'active' | 'completed' | 'failed';
}

interface TriggerRunBody {
  triggeredBy?: string;
}

async function apiRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // Jobs - CRUD operations
  fastify.post<{ Body: CreateJobBody }>(
    '/api/jobs',
    { schema: { body: createJobSchema } },
    async (request, reply) => {
      const body = request.body;

      const job = await jobService.createJob({
        name: body.name,
        description: body.description,
        sourceUrl: body.sourceUrl,
        targetUrl: body.targetUrl,
      });

      reply.code(201).send(job);
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
        if (err instanceof Error && err.message.includes('not found')) {
          reply.code(404).send({ message: 'Job not found' });
          return;
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

  fastify.post<{ Params: { id: string }; Body?: TriggerRunBody }>(
    '/api/jobs/:id/run',
    { schema: { body: triggerRunSchema } },
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;
      const triggeredBy = body?.triggeredBy ?? 'system';

      try {
        const run = await runService.triggerRun(id, triggeredBy);
        reply.code(202).send(run);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          reply.code(404).send({ message: 'Job not found' });
          return;
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
}

export default fp(apiRoutes);
