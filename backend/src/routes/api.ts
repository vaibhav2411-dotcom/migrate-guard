import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import { JobService, RunService } from '../services/domainServices';
import { FileStorage } from '../services/fileStorage';

const storage = new FileStorage();
const jobService = new JobService(storage);
const runService = new RunService(storage);

interface CreateJobBody {
  name: string;
  description?: string;
  sourceUrl: string;
  targetUrl: string;
}

interface TriggerRunBody {
  triggeredBy?: string;
}

async function apiRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  // Jobs
  fastify.post('/api/jobs', async (request, reply) => {
    const body = request.body as CreateJobBody;

    const job = await jobService.createJob({
      name: body.name,
      description: body.description,
      sourceUrl: body.sourceUrl,
      targetUrl: body.targetUrl,
    });

    reply.code(201).send(job);
  });

  fastify.get('/api/jobs', async (_request, reply) => {
    const jobs = await jobService.listJobs();
    reply.send(jobs);
  });

  fastify.get('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await jobService.getJobById(id);
    if (!job) {
      reply.code(404).send({ message: 'Job not found' });
      return;
    }
    reply.send(job);
  });

  fastify.post('/api/jobs/:id/run', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as TriggerRunBody | undefined;
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
  });

  // Runs
  fastify.get('/api/runs', async (_request, reply) => {
    const runs = await runService.listRuns();
    reply.send(runs);
  });

  fastify.get('/api/runs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = await runService.getRunById(id);
    if (!run) {
      reply.code(404).send({ message: 'Run not found' });
      return;
    }
    reply.send(run);
  });

  fastify.get('/api/runs/:id/artifacts', async (request, reply) => {
    const { id } = request.params as { id: string };
    const artifacts = await runService.listArtifactsByRun(id);
    reply.send(artifacts);
  });
}

export default fp(apiRoutes);
