import fs from 'fs/promises';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'backend', 'data', 'cache-purge.log');

export async function broadcastPurge(keys: string[], options?: { endpoint?: string; authToken?: string }) {
  const endpoint = options?.endpoint ?? process.env.CACHE_PURGE_ENDPOINT;
  const auth = options?.authToken ?? process.env.CACHE_PURGE_TOKEN;

  const payload = { keys, timestamp: new Date().toISOString() };

  // If an endpoint is configured, attempt an HTTP POST
  if (endpoint) {
    try {
      // Node 18+ global fetch is available in the runtime used by this project
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      await fs.appendFile(LOG_PATH, `[${new Date().toISOString()}] Purge to ${endpoint} keys=${JSON.stringify(keys)} status=${res.status} response=${text}\n`);
      return { ok: res.ok, status: res.status, body: text };
    } catch (err) {
      await fs.appendFile(LOG_PATH, `[${new Date().toISOString()}] Purge to ${endpoint} failed: ${String(err)}\n`);
      throw err;
    }
  }

  // Otherwise, write a local log entry as a fallback for environments without a CDN API
  await fs.appendFile(LOG_PATH, `[${new Date().toISOString()}] Local purge log keys=${JSON.stringify(keys)}\n`);
  return { ok: true, status: 200, body: 'logged' };
}
