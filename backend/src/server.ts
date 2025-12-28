import Fastify from 'fastify';
import apiRoutes from './routes/api';

const PORT = Number(process.env.PORT ?? 4000);

export async function buildServer() {
  const fastify = Fastify({
    logger: true,
  });

  await fastify.register(apiRoutes);

  return fastify;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Run as a standalone server
  buildServer()
    .then((fastify) => {
      fastify.listen({ port: PORT, host: '0.0.0.0' }).catch((err) => {
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
