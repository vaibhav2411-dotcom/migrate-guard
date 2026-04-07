import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

async function run() {
  const url = process.argv[2] || 'http://127.0.0.1:5173';
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    // inject axe-core from CDN
    const cdn = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.6.3/axe.min.js';
    await page.addScriptTag({ url: cdn });
    const result = await page.evaluate(async () => {
      // @ts-ignore
      return await (window as any).axe.run();
    });
    console.log('Axe results violations:', result.violations.length);
    for (const v of result.violations) {
      console.log('-', v.id, v.description, 'nodes:', v.nodes.length);
    }
    if (result.violations.length > 0) process.exit(2);
    console.log('No axe violations');
    process.exit(0);
  } finally {
    await browser.close();
  }
}

run().catch((e) => { console.error('axe check failed', e); process.exit(3); });
