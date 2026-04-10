import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import apiRoutes from '../src/routes/api';

// These tests exercise the HTTP layer with Fastify's inject, while the
// underlying storage still uses an in-memory JSON snapshot on disk.

function createTestServer() {
  const app = Fastify();
  app.register(apiRoutes);
  return app;
}

describe('API routes', () => {
  it('rejects job creation when both URL pairs are missing', async () => {
    const app = createTestServer();

    const res = await app.inject({
      method: 'POST',
      url: '/api/jobs',
      payload: {
        name: 'Invalid Job',
        description: 'Missing URLs',
      },
    });

    expect(res.statusCode).toBe(400);
  });

  it('creates and retrieves a job', async () => {
    const app = createTestServer();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/jobs',
        payload: {
        name: 'API Job',
        description: 'Created via API test',
        sourceUrl: 'http://localhost',
        targetUrl: 'http://localhost:8080',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { id: string };
    expect(created.id).toBeDefined();

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/jobs/${created.id}`,
    });

    expect(getRes.statusCode).toBe(200);
    const fetched = getRes.json() as { id: string };
    expect(fetched.id).toBe(created.id);
  });

  it('returns 404 for missing job', async () => {
    const app = createTestServer();

    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/non-existent',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns run trends payload', async () => {
    const app = createTestServer();

    const res = await app.inject({
      method: 'GET',
      url: '/api/runs/trends?limit=10',
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json() as {
      points: unknown[];
      aggregates: {
        totalRuns: number;
        completedRuns: number;
        failedRuns: number;
        riskTrend: string;
      };
    };
    expect(Array.isArray(payload.points)).toBe(true);
    expect(payload.aggregates).toBeDefined();
    expect(typeof payload.aggregates.totalRuns).toBe('number');
  });

  it('returns 404 for missing job history', async () => {
    const app = createTestServer();

    const res = await app.inject({
      method: 'GET',
      url: '/api/jobs/non-existent/history',
    });

    expect(res.statusCode).toBe(404);
  });
});
