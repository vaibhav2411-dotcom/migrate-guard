import Fastify from 'fastify';
import apiRoutes from './routes/api';
import { DEFAULT_PORT } from './config/config';

export async function buildServer() {
  const fastify = Fastify({
    logger: true,
  });

  await fastify.register(apiRoutes);

  return fastify;
}

// Always start the server when this file is run with tsx/node.
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
