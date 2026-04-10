const fs = require('fs');
const path = require('path');

async function run(url, runId) {
  try {
    const lighthouse = require('lighthouse');
    const chromeLauncher = require('chrome-launcher');
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless=new', '--no-sandbox'] });
    const opts = { port: chrome.port, output: 'json' };
    const runnerResult = await lighthouse(url, opts);
    const lhr = runnerResult.lhr;
    const summary = {
      score: Math.round((lhr.categories.performance?.score || 0) * 100),
      lcp: lhr.audits['largest-contentful-paint']?.numericValue,
      cls: lhr.audits['cumulative-layout-shift']?.numericValue,
      tbt: lhr.audits['total-blocking-time']?.numericValue,
      full: lhr
    };
    await chrome.kill();

    if (runId) {
      const artifacts = path.join(__dirname, '..', 'data', 'artifacts', runId);
      try { fs.mkdirSync(artifacts, { recursive: true }); } catch {}
      const out = path.join(artifacts, 'lighthouse.json');
      fs.writeFileSync(out, JSON.stringify(summary, null, 2), 'utf8');
      console.log('Wrote Lighthouse summary to', out);
    } else {
      console.log('Lighthouse summary:', JSON.stringify(summary, null, 2));
    }
  } catch (e) {
    console.error('Lighthouse run failed:', e && e.message ? e.message : e);
    process.exit(2);
  }
}

const url = process.argv[2] || 'http://localhost:8080';
const runId = process.argv[3];
run(url, runId).catch(e=>{ console.error(e); process.exit(3); });
