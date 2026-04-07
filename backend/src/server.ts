import Fastify from 'fastify';
import cors from '@fastify/cors';
import apiRoutes from './routes/api';
import { DEFAULT_PORT } from './config/config';
import path from 'path';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';

export async function buildServer() {
  const fastify = Fastify({
    logger: true,
  });

  // Enable CORS for frontend integration
  await fastify.register(cors, {
    origin: true, // Allow all origins in development
    credentials: true,
  });

  // Serve artifacts under /data/* so frontend can load images and reports
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataDir = path.join(__dirname, '..', 'data');
  try {
    await fastify.register(fastifyStatic, {
      root: dataDir,
      prefix: '/data/',
      decorateReply: false,
    });
  } catch (err) {
    // ignore static registration errors in some environments
  }

  await fastify.register(apiRoutes);

  // Health check endpoint
  fastify.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return fastify;
}

// Always start the server when this file is run with tsx/node.
// When running tests (Vitest) we avoid auto-starting the server to prevent process.exit calls.
if (!process.env.VITEST) {
  buildServer()
    .then((fastify) => {
      fastify
        .listen({ port: DEFAULT_PORT, host: '0.0.0.0' })
        .catch((err) => {
          fastify.log.error(err);
          process.exit(1);
        });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server', err);
      process.exit(1);
    });
}
