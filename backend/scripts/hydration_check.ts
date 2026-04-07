import { chromium } from 'playwright';

const CANDIDATE_URLS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000',
  'http://localhost:5173',
  'http://localhost:8080'
];

async function isReachable(url: string, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    // use global fetch (Node 18+). If unavailable, this will throw and be caught.
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(id);
    return res && res.status < 500;
  } catch (e) {
    return false;
  }
}

function matchesHydrationWarning(text: string) {
  const t = text.toLowerCase();
  return (
    t.includes('hydration') ||
    t.includes('did not match') ||
    t.includes('text content did not match') ||
    t.includes('did not expect server') ||
    t.includes('warning:') && t.includes('server')
  );
}

async function run() {
  const reachable: string[] = [];
  for (const u of CANDIDATE_URLS) {
    if (await isReachable(u)) reachable.push(u);
  }

  if (reachable.length === 0) {
    console.log('No local dev servers detected at known ports. Nothing to test.');
    process.exit(0);
  }

  const browser = await chromium.launch();
  try {
    let failures = 0;
    for (const url of reachable) {
      console.log('\nChecking', url);
      const context = await browser.newContext();
      const page = await context.newPage();
      const consoleMsgs: string[] = [];
      page.on('console', (msg) => {
        try {
          consoleMsgs.push(msg.text());
        } catch (e) {
          // ignore
        }
      });

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      } catch (e) {
        console.log('  Navigation failed:', (e as Error).message);
        await context.close();
        continue;
      }

      // allow some time for hydration-related console logs to appear
      await page.waitForTimeout(4000);

      const bad = consoleMsgs.filter((m) => matchesHydrationWarning(m));
      if (bad.length) {
        console.error('  Hydration-related console messages found:');
        for (const b of bad) console.error('   -', b);
        failures += 1;
      } else {
        console.log('  No hydration warnings detected.');
      }

      await context.close();
    }

    if (failures > 0) {
      console.error('\nHydration smoke test failed for', failures, 'site(s).');
      process.exit(2);
    }

    console.log('\nHydration smoke test passed for all reachable sites.');
    process.exit(0);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Hydration check errored:', err);
  process.exit(3);
});
