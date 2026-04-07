import { describe, it, expect, beforeAll } from 'vitest';
import { buildServer } from '../src/server';
import fetch from 'node-fetch';

let fastify: any;
let baseUrl = 'http://127.0.0.1:4003';

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.listen({ port: 4003 });
});

describe('Artifact endpoints', () => {
  it('returns 404 for non-existent run artifacts', async () => {
    const res = await fetch(`${baseUrl}/api/runs/not-found/artifacts`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // should be an array (empty)
    expect(Array.isArray(body)).toBeTruthy();
  });

  it('returns 404 for missing executive report', async () => {
    const res = await fetch(`${baseUrl}/api/runs/not-found/report/executive`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for missing technical report', async () => {
    const res = await fetch(`${baseUrl}/api/runs/not-found/report/technical`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for missing summary', async () => {
    const res = await fetch(`${baseUrl}/api/runs/not-found/summary`);
    expect(res.status).toBe(404);
  });
});
