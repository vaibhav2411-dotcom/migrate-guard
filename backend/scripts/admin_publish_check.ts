import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

/*
 Usage:
  - Simulate: npx ts-node backend/scripts/admin_publish_check.ts --simulate
  - Real publish: npx ts-node backend/scripts/admin_publish_check.ts --publishUrl=<url> --verifyUrl=<url> --token=<token>

  The script posts to the publish URL (if provided) with optional token, then polls verifyUrl
  for evidence of cache invalidation (checks header `x-cache-status` or response contains 'PURGED').
*/

function parseArgs() {
  const args = process.argv.slice(2);
  const out: any = {};
  for (const a of args) {
    if (a === '--simulate') out.simulate = true;
    else if (a.startsWith('--publishUrl=')) out.publishUrl = a.split('=')[1];
    else if (a.startsWith('--verifyUrl=')) out.verifyUrl = a.split('=')[1];
    else if (a.startsWith('--token=')) out.token = a.split('=')[1];
  }
  return out;
}

async function simulatePublish() {
  const log = path.resolve('backend', 'cache-purge.log');
  const entry = `SIMULATED-PUBLISH:${new Date().toISOString()}`;
  fs.appendFileSync(log, entry + '\n');
  console.log('Simulated publish recorded to', log);
  // simulate asynchronous purge propagation
  return entry;
}

async function verifySimulated(entry: string) {
  const log = path.resolve('backend', 'cache-purge.log');
  for (let i = 0; i < 6; i++) {
    const contents = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
    if (contents.includes(entry)) {
      console.log('Verified simulated purge entry present');
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.error('Simulated purge not observed');
  return false;
}

async function publishAndVerify(publishUrl: string, verifyUrl: string | undefined, token?: string) {
  console.log('Posting to publish URL:', publishUrl);
  const headers: any = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const body = { action: 'publish', timestamp: new Date().toISOString() };
  const res = await fetch(publishUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  console.log('Publish response status:', res.status);
  if (res.status >= 400) {
    console.error('Publish endpoint returned error');
    return false;
  }

  if (!verifyUrl) {
    console.log('No verifyUrl provided; assuming publish accepted');
    return true;
  }

  // Poll verifyUrl for evidence of cache invalidation
  for (let i = 0; i < 12; i++) {
    try {
      const v = await fetch(verifyUrl, { method: 'GET' });
      const cacheHeader = v.headers.get('x-cache-status') || v.headers.get('x-cache');
      const text = await v.text();
      if (cacheHeader && cacheHeader.toLowerCase().includes('miss')) {
        console.log('Verify success: cache header indicates MISS');
        return true;
      }
      if (text && text.includes('PURGED')) {
        console.log('Verify success: body contains PURGED');
        return true;
      }
    } catch (e) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error('Verification polling timed out without evidence of invalidation');
  return false;
}

async function main() {
  const args = parseArgs();
  if (args.simulate || !args.publishUrl) {
    console.log('Running in simulate mode');
    const entry = await simulatePublish();
    const ok = await verifySimulated(entry);
    process.exit(ok ? 0 : 2);
  }

  const ok = await publishAndVerify(args.publishUrl, args.verifyUrl, args.token);
  process.exit(ok ? 0 : 2);
}

main().catch((e) => { console.error('Admin publish check failed', e); process.exit(3); });
