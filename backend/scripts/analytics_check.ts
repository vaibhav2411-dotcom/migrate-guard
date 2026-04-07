import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import Ajv from 'ajv';

const ajv = new Ajv();

async function run() {
  const url = process.argv[2] || 'http://127.0.0.1:5173';
  const schemaPath = process.argv[3];
  let validate: ((d: any) => boolean) | null = null;
  if (schemaPath) {
    const s = JSON.parse(await fs.promises.readFile(schemaPath, 'utf8'));
    validate = ajv.compile(s) as any;
  }

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const posts: any[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST') {
        const url = req.url();
        const postPromise = (async () => {
          try {
            const body = await req.postData();
            let json = null;
            try { json = body ? JSON.parse(body) : null; } catch {}
            posts.push({ url, body, json });
          } catch (e) {}
        })();
        void postPromise;
      }
    });

    console.log('Navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(5000);

    if (posts.length === 0) {
      console.log('No POST requests captured during visit.');
    } else {
      console.log('Captured', posts.length, 'POST(s)');
      let failures = 0;
      if (validate) {
        for (const p of posts) {
          if (!p.json) {
            console.warn('  Non-JSON payload for', p.url);
            failures++;
            continue;
          }
          const ok = validate(p.json);
          if (!ok) {
            console.error('  Payload validation failed for', p.url, ajv.errorsText(validate.errors));
            failures++;
          } else {
            console.log('  Payload OK for', p.url);
          }
        }
      } else {
        for (const p of posts) console.log('  POST to', p.url, 'bodyLen=', String(p.body).length);
      }

      if (failures > 0) process.exit(2);
    }

    console.log('Analytics check finished.');
    process.exit(0);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Analytics check errored:', err);
  process.exit(3);
});
