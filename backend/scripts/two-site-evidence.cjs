const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const pixelmatch = require('pixelmatch');
const { PNG } = require('pngjs');

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_').replace(/^_+|_+$/g, '') || 'index';
}

function normalizeBaseUrl(input) {
  const value = String(input || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '');
  return `https://${value.replace(/\/+$/, '')}`;
}

function normalizePathname(rawPath) {
  const p = String(rawPath || '').trim();
  if (!p || p === '/') return '/';
  const normalized = p.startsWith('/') ? p : `/${p}`;
  return normalized.replace(/\/+$/, '') || '/';
}

async function writeJson(p, obj) {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(obj, null, 2), 'utf-8');
}

function colorKey(rgba) {
  return rgba.replace(/\s+/g, '');
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function overlapRatio(a, b) {
  const left = new Set(a || []);
  const right = new Set(b || []);
  const union = new Set([...(a || []), ...(b || [])]);
  if (union.size === 0) return 1;
  let inter = 0;
  for (const item of left) {
    if (right.has(item)) inter += 1;
  }
  return inter / union.size;
}

function calcPixelDiffPercent(img1buf, img2buf) {
  const img1 = PNG.sync.read(img1buf);
  const img2 = PNG.sync.read(img2buf);
  if (img1.width !== img2.width || img1.height !== img2.height) return 100;
  const { width, height } = img1;
  const diff = new PNG({ width, height });
  const count = pixelmatch(img1.data, img2.data, diff.data, width, height, { threshold: 0.1 });
  const total = width * height;
  return (count / total) * 100;
}

async function discoverPaths(browser, baselineUrl, maxPages) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const base = new URL(baselineUrl);
  const discovered = new Set(['/']);
  const visited = new Set();

  // Prefer explicit PATHS when provided.
  const fromEnv = String(process.env.PATHS || '')
    .split(',')
    .map((v) => String(v || '').trim())
    .filter((v) => v.length > 0)
    .map((v) => normalizePathname(v));
  if (fromEnv.length > 0) {
    await context.close();
    return unique(['/'].concat(fromEnv)).slice(0, maxPages);
  }

  // Try sitemap discovery first.
  try {
    const res = await page.request.get(`${baselineUrl}/sitemap.xml`, { timeout: 30000 });
    if (res.ok()) {
      const xml = await res.text();
      const matches = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/gi)).map((m) => m[1]);
      for (const value of matches) {
        try {
          const u = new URL(value);
          if (u.host !== base.host) continue;
          discovered.add(normalizePathname(u.pathname));
          if (discovered.size >= maxPages) break;
        } catch (_) {
          // ignore invalid URL entries
        }
      }
    }
  } catch (_) {
    // sitemap is optional
  }

  // Then recursively crawl same-origin links to improve coverage.
  try {
    const queue = ['/'];
    while (queue.length > 0 && discovered.size < maxPages) {
      const currentPath = queue.shift();
      if (!currentPath || visited.has(currentPath)) continue;
      visited.add(currentPath);

      try {
        await page.goto(`${baselineUrl}${currentPath}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch (_) {
        continue;
      }

      await page.waitForTimeout(800);
      const hrefs = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        return anchors.map((a) => (a.getAttribute('href') || '').trim()).filter(Boolean);
      });

      for (const href of hrefs) {
        try {
          const u = new URL(href, baselineUrl);
          if (u.host !== base.host) continue;
          if (/\.(pdf|jpg|jpeg|png|webp|gif|svg|zip|mp4|mp3|woff2?|css|js)$/i.test(u.pathname)) continue;
          const normalized = normalizePathname(u.pathname);
          if (!discovered.has(normalized)) {
            discovered.add(normalized);
            queue.push(normalized);
          }
          if (discovered.size >= maxPages) break;
        } catch (_) {
          // ignore malformed hrefs
        }
      }
    }
  } catch (_) {
    // fall back to root-only when crawl fails
  }

  await context.close();
  return Array.from(discovered).slice(0, maxPages);
}

async function captureInteractionEvidence(page, maxElements) {
  const candidates = await page.evaluate((maxCount) => {
    function selectorFor(el) {
      if (!el || !(el instanceof Element)) return null;
      if (el.id) return `#${CSS.escape(el.id)}`;
      const tag = el.tagName.toLowerCase();
      const cls = String(el.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length > 0) return `${tag}.${cls.map((c) => CSS.escape(c)).join('.')}`;
      return tag;
    }

    const nodes = Array.from(document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]'));
    const out = [];
    for (const el of nodes) {
      if (out.length >= maxCount) break;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const selector = selectorFor(el);
      if (!selector) continue;
      out.push({
        selector,
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 80),
      });
    }
    return out;
  }, maxElements);

  const evidence = [];
  for (const candidate of candidates) {
    const locator = page.locator(candidate.selector).first();
    try {
      if (!(await locator.isVisible())) continue;

      const before = await locator.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          outline: cs.outline,
          outlineWidth: cs.outlineWidth,
          boxShadow: cs.boxShadow,
          borderColor: cs.borderColor,
        };
      });

      await locator.hover({ force: true, timeout: 10000 }).catch(() => {});
      const hover = await locator.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          outline: cs.outline,
          outlineWidth: cs.outlineWidth,
          boxShadow: cs.boxShadow,
          borderColor: cs.borderColor,
        };
      });

      await locator.focus().catch(() => {});
      const focus = await locator.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          color: cs.color,
          backgroundColor: cs.backgroundColor,
          outline: cs.outline,
          outlineWidth: cs.outlineWidth,
          boxShadow: cs.boxShadow,
          borderColor: cs.borderColor,
          hasFocusRing:
            (String(cs.outlineWidth || '0px') !== '0px') ||
            (String(cs.boxShadow || 'none') !== 'none'),
        };
      });

      evidence.push({
        selector: candidate.selector,
        tag: candidate.tag,
        text: candidate.text,
        styles: {
          default: before,
          hover,
          focus,
        },
      });
    } catch (_) {
      // continue gathering remaining interactions
    }
  }

  return evidence;
}

async function captureSite(page, baseDir, label, navigationResponse) {
  const report = {
    label,
    screenshots: [],
    htmlPath: null,
    domStructurePath: null,
    meta: {},
    logo: null,
    palette: [],
    designTokens: {},
    uiLayers: {},
    elementInventory: {},
    headingMap: {},
    interactionEvidence: [],
    console: [],
    networkFailures: [],
    responseHeaders: navigationResponse ? navigationResponse.headers() : null,
  };

  // capture HTML
  const html = await page.content();
  const htmlPath = path.join(baseDir, `${label}.html`);
  await fs.writeFile(htmlPath, html, 'utf-8');
  report.htmlPath = htmlPath.replace(/\\/g, '/');

  // meta tags and title
  try {
    const meta = await page.evaluate(() => {
      const title = document.title || null;
      const metas = Array.from(document.querySelectorAll('meta')).map(m => ({ name: m.getAttribute('name') || m.getAttribute('property') || m.getAttribute('http-equiv'), content: m.getAttribute('content') }));
      return { title, metas };
    });
    report.meta = meta;
  } catch {}

  // DOM structure snapshot
  try {
    const structure = await page.evaluate(() => ({
      title: document.title,
      h1s: Array.from(document.querySelectorAll('h1')).map(e => e.textContent.trim()),
      h2s: Array.from(document.querySelectorAll('h2')).map(e => e.textContent.trim()),
      h3s: Array.from(document.querySelectorAll('h3')).map(e => e.textContent.trim()),
      hasHeader: !!document.querySelector('header, [role="banner"]'),
      hasNav: !!document.querySelector('nav, [role="navigation"]'),
      hasMain: !!document.querySelector('main, [role="main"]'),
      hasFooter: !!document.querySelector('footer, [role="contentinfo"]'),
      hasAside: !!document.querySelector('aside, [role="complementary"]'),
      hasSection: document.querySelectorAll('section').length,
      hasArticle: document.querySelectorAll('article').length,
      logoSelectors: [
        'img[alt*="logo" i]', 'img[src*="logo" i]', '.logo', '[aria-label*="logo" i]'
      ],
      imgCount: document.querySelectorAll('img').length,
      linkCount: document.querySelectorAll('a[href]').length,
    }));
    const domPath = path.join(baseDir, `${label}-dom.json`);
    await writeJson(domPath, structure);
    report.domStructurePath = domPath.replace(/\\/g, '/');
  } catch {}

  // palette and logo detection + sample contrasts
  try {
    const extra = await page.evaluate(() => {
      function rgbaToKey(v) { return v ? v.replace(/\s+/g,'') : ''; }
      const logoEl = document.querySelector('img[alt*="logo" i], img[src*="logo" i], .logo, [aria-label*="logo" i]');
      const logo = logoEl ? { src: logoEl.src || null, alt: logoEl.alt || null } : null;
      const all = Array.from(document.querySelectorAll('*')).slice(0, 500);
      const colorMap = {};
      const fonts = {};
      for (const el of all) {
        try {
          const cs = getComputedStyle(el);
          const fg = rgbaToKey(cs.color || '');
          const bg = rgbaToKey(cs.backgroundColor || '');
          const ff = (cs.fontFamily || '').trim();
          if (fg) colorMap[fg] = (colorMap[fg] || 0) + 1;
          if (bg) colorMap[bg] = (colorMap[bg] || 0) + 1;
          if (ff) fonts[ff] = (fonts[ff] || 0) + 1;
        } catch {}
      }
      const palette = Object.entries(colorMap).sort((a,b)=>b[1]-a[1]).slice(0,40).map(([c])=>c);
      const topFonts = Object.entries(fonts).sort((a,b)=>b[1]-a[1]).slice(0,10);

      const root = document.documentElement;
      const rootStyle = getComputedStyle(root);
      const bodyStyle = getComputedStyle(document.body);
      const designTokens = {
        colorPrimary: rootStyle.getPropertyValue('--color-primary').trim(),
        colorSecondary: rootStyle.getPropertyValue('--color-secondary').trim(),
        fontFamilyBase: rootStyle.getPropertyValue('--font-family-base').trim(),
        bodyFontFamily: bodyStyle.fontFamily,
        bodyBackground: bodyStyle.backgroundColor,
        bodyColor: bodyStyle.color,
      };

      const layers = Array.from(document.querySelectorAll('*'))
        .map((el) => {
          const cs = getComputedStyle(el);
          return {
            tag: el.tagName.toLowerCase(),
            position: cs.position,
            zIndex: cs.zIndex,
          };
        })
        .filter((it) => ['fixed', 'sticky', 'absolute', 'relative'].includes(it.position));

      const zIndexed = layers
        .filter((it) => it.zIndex && it.zIndex !== 'auto')
        .slice(0, 100);

      const elementInventory = {
        forms: document.querySelectorAll('form').length,
        buttons: document.querySelectorAll('button, [role="button"]').length,
        inputs: document.querySelectorAll('input, select, textarea').length,
        cards: document.querySelectorAll('.card, [class*="card" i]').length,
        tables: document.querySelectorAll('table').length,
        lists: document.querySelectorAll('ul, ol').length,
      };

      return {
        logo,
        palette,
        topFonts,
        designTokens,
        uiLayers: {
          totalLayerCandidates: layers.length,
          zIndexedCount: zIndexed.length,
          sample: zIndexed.slice(0, 40),
        },
        elementInventory,
      };
    });
    report.logo = extra.logo;
    report.palette = extra.palette;
    report.designTokens = extra.designTokens;
    report.uiLayers = extra.uiLayers;
    report.elementInventory = extra.elementInventory;
    report.headingMap = {
      h1: Array.isArray(report.meta?.metas) ? undefined : undefined,
      topFonts: extra.topFonts,
    };
    const palPath = path.join(baseDir, `${label}-palette.json`);
    await writeJson(palPath, extra.palette);
    const tokenPath = path.join(baseDir, `${label}-design-tokens.json`);
    await writeJson(tokenPath, extra.designTokens);
    const layersPath = path.join(baseDir, `${label}-ui-layers.json`);
    await writeJson(layersPath, extra.uiLayers);
    const inventoryPath = path.join(baseDir, `${label}-element-inventory.json`);
    await writeJson(inventoryPath, extra.elementInventory);
  } catch {}

  try {
    report.interactionEvidence = await captureInteractionEvidence(page, Number(process.env.UI_ELEMENT_MAX ?? 14));
    const interactionsPath = path.join(baseDir, `${label}-interaction-evidence.json`);
    await writeJson(interactionsPath, report.interactionEvidence);
  } catch (_) {
    report.interactionEvidence = [];
  }

  return report;
}

function compareEvidence(baseline, candidate, pixelDiffPercent) {
  const issues = [];

  if (pixelDiffPercent !== null) {
    if (pixelDiffPercent > 15) issues.push({ severity: 'high', rule: 'visual-diff-large', detail: `${pixelDiffPercent.toFixed(2)}% pixels differ` });
    else if (pixelDiffPercent > 5) issues.push({ severity: 'medium', rule: 'visual-diff-medium', detail: `${pixelDiffPercent.toFixed(2)}% pixels differ` });
    else if (pixelDiffPercent > 1) issues.push({ severity: 'low', rule: 'visual-diff-small', detail: `${pixelDiffPercent.toFixed(2)}% pixels differ` });
  }

  if ((baseline.console || []).some((x) => x.type === 'error') || (candidate.console || []).some((x) => x.type === 'error')) {
    issues.push({ severity: 'high', rule: 'console-error', detail: 'Console errors detected' });
  }

  if (!baseline.logo && candidate.logo) {
    issues.push({ severity: 'info', rule: 'logo-added', detail: 'Logo present in candidate but missing in baseline' });
  }
  if (baseline.logo && !candidate.logo) {
    issues.push({ severity: 'high', rule: 'logo-removed', detail: 'Logo missing in candidate' });
  }

  const bTitle = baseline.meta && baseline.meta.title;
  const cTitle = candidate.meta && candidate.meta.title;
  if (bTitle && cTitle && bTitle !== cTitle) {
    issues.push({ severity: 'medium', rule: 'title-changed', detail: `Title changed: "${bTitle}" -> "${cTitle}"` });
  }

  const paletteMatch = overlapRatio(baseline.palette || [], candidate.palette || []);
  if (paletteMatch < 0.2) {
    issues.push({ severity: 'high', rule: 'palette-diverged', detail: `Color palette overlap only ${(paletteMatch * 100).toFixed(1)}%` });
  } else if (paletteMatch < 0.4) {
    issues.push({ severity: 'medium', rule: 'palette-shifted', detail: `Color palette overlap ${(paletteMatch * 100).toFixed(1)}%` });
  }

  const bTokens = baseline.designTokens || {};
  const cTokens = candidate.designTokens || {};
  const tokenPairs = ['bodyFontFamily', 'bodyBackground', 'bodyColor'];
  for (const key of tokenPairs) {
    if (bTokens[key] && cTokens[key] && bTokens[key] !== cTokens[key]) {
      issues.push({ severity: 'low', rule: 'design-token-drift', detail: `${key} differs (${bTokens[key]} vs ${cTokens[key]})` });
    }
  }

  const bLayers = baseline.uiLayers || {};
  const cLayers = candidate.uiLayers || {};
  if (typeof bLayers.zIndexedCount === 'number' && typeof cLayers.zIndexedCount === 'number') {
    const delta = cLayers.zIndexedCount - bLayers.zIndexedCount;
    if (delta >= 8) {
      issues.push({ severity: 'medium', rule: 'layer-complexity-increased', detail: `Candidate has ${delta} more z-indexed layers` });
    }
  }

  const cInteractions = candidate.interactionEvidence || [];
  const missingFocus = cInteractions.filter((entry) => !entry?.styles?.focus?.hasFocusRing);
  if (missingFocus.length > 0) {
    issues.push({ severity: 'high', rule: 'focus-ring-missing', detail: `${missingFocus.length} interactive elements have no visible focus ring` });
  }

  const bInventory = baseline.elementInventory || {};
  const cInventory = candidate.elementInventory || {};
  if (typeof bInventory.forms === 'number' && typeof cInventory.forms === 'number' && bInventory.forms > 0 && cInventory.forms === 0) {
    issues.push({ severity: 'high', rule: 'forms-missing', detail: 'Baseline has forms but candidate has none' });
  }

  return issues;
}

async function runComparison(baselineUrl, candidateUrl) {
  const runId = `evidence-${Date.now()}`;
  const artifactsDir = path.join(__dirname, '..', 'data', 'artifacts', runId);
  await fs.mkdir(artifactsDir, { recursive: true });

  const viewports = [375, 768, 1280, 1920];
  const maxPages = Number(process.env.MAX_PAGES ?? 10);
  const browser = await chromium.launch({ headless: true });
  const results = {
    runId,
    baselineUrl,
    candidateUrl,
    generatedAt: new Date().toISOString(),
    maxPages,
    pagesDiscovered: [],
    pages: [],
  };

  const pathsToTest = await discoverPaths(browser, baselineUrl, maxPages);
  results.pagesDiscovered = pathsToTest;
  await writeJson(path.join(artifactsDir, 'captured-paths.json'), { baselineUrl, candidateUrl, pathsToTest });

  for (const p of pathsToTest) {
    const pageReport = { path: p, viewports: [] , issues: [] };
    for (const width of viewports) {
      const contextB = await browser.newContext({ viewport: { width, height: 900 } });
      const pageB = await contextB.newPage();
      const contextC = await browser.newContext({ viewport: { width, height: 900 } });
      const pageC = await contextC.newPage();

      // collect console, request and response events to build HAR-like logs
      const bConsole = [];
      const cConsole = [];
      const bNetwork = [];
      const cNetwork = [];
      const bRequests = {};
      const cRequests = {};
      pageB.on('console', m => bConsole.push({ type: m.type(), text: m.text() }));
      pageC.on('console', m => cConsole.push({ type: m.type(), text: m.text() }));
      pageB.on('request', r => bRequests[`${r.method()}::${r.url()}`] = { url: r.url(), method: r.method(), headers: r.headers(), postData: r.postData() });
      pageC.on('request', r => cRequests[`${r.method()}::${r.url()}`] = { url: r.url(), method: r.method(), headers: r.headers(), postData: r.postData() });
      pageB.on('response', async r => {
        try {
          const req = bRequests[`${r.request().method()}::${r.request().url()}`] || { url: r.request().url(), method: r.request().method() };
          bNetwork.push({ url: r.url(), status: r.status(), statusText: r.statusText(), headers: r.headers(), request: req });
        } catch (e) {}
      });
      pageC.on('response', async r => {
        try {
          const req = cRequests[`${r.request().method()}::${r.request().url()}`] || { url: r.request().url(), method: r.request().method() };
          cNetwork.push({ url: r.url(), status: r.status(), statusText: r.statusText(), headers: r.headers(), request: req });
        } catch (e) {}
      });
      pageB.on('requestfailed', r => bNetwork.push({ url: r.url(), method: r.method(), failure: r.failure() && r.failure().errorText }));
      pageC.on('requestfailed', r => cNetwork.push({ url: r.url(), method: r.method(), failure: r.failure() && r.failure().errorText }));

      let bResp = null, cResp = null;
      try {
        bResp = await pageB.goto(baselineUrl + p, { waitUntil: 'networkidle', timeout: 120000 });
        await pageB.waitForLoadState('networkidle', { timeout: 60000 }).catch(()=>{});
        await pageB.waitForTimeout(2500);
      } catch (e) { bConsole.push({ type: 'pageerror', text: String(e) }); }
      try {
        cResp = await pageC.goto(candidateUrl + p, { waitUntil: 'networkidle', timeout: 120000 });
        await pageC.waitForLoadState('networkidle', { timeout: 60000 }).catch(()=>{});
        await pageC.waitForTimeout(2500);
      } catch (e) { cConsole.push({ type: 'pageerror', text: String(e) }); }

      // screenshot
      const safe = sanitize(p === '/' ? 'index' : p);
      const bshot = path.join(artifactsDir, `baseline-${safe}-${width}.png`);
      const cshot = path.join(artifactsDir, `candidate-${safe}-${width}.png`);
      try { await pageB.screenshot({ path: bshot, fullPage: true }); } catch (e) { bConsole.push({ type: 'screenshot-error', text: String(e) }); }
      try { await pageC.screenshot({ path: cshot, fullPage: true }); } catch (e) { cConsole.push({ type: 'screenshot-error', text: String(e) }); }

      // capture site data
      const baseDirB = path.join(artifactsDir, 'baseline', `${safe}-${width}`);
      const baseDirC = path.join(artifactsDir, 'candidate', `${safe}-${width}`);
      await fs.mkdir(baseDirB, { recursive: true });
      await fs.mkdir(baseDirC, { recursive: true });
      const bReport = await captureSite(pageB, baseDirB, `baseline-${safe}-${width}`, bResp);
      const cReport = await captureSite(pageC, baseDirC, `candidate-${safe}-${width}`, cResp);

      // attach collected console/network to reports and persist to files
      try {
        bReport.console = bConsole;
        bReport.networkFailures = bNetwork.filter(x=>x.failure);
        cReport.console = cConsole;
        cReport.networkFailures = cNetwork.filter(x=>x.failure);
        await writeJson(path.join(baseDirB, `console.json`), bConsole);
        await writeJson(path.join(baseDirC, `console.json`), cConsole);
        await writeJson(path.join(baseDirB, `network.json`), bNetwork);
        await writeJson(path.join(baseDirC, `network.json`), cNetwork);
        // write a simple HAR-like dump
        await writeJson(path.join(baseDirB, `har.json`), { log: { entries: bNetwork } });
        await writeJson(path.join(baseDirC, `har.json`), { log: { entries: cNetwork } });
      } catch (e) {}

      // pixel diff
      let pixelDiffPercent = null;
      try {
        const bbuf = await fs.readFile(bshot);
        const cbuf = await fs.readFile(cshot);
        pixelDiffPercent = calcPixelDiffPercent(bbuf, cbuf);
      } catch (e) {}

      // text diff: visible text
      let textDiff = null;
      try {
        const btext = await pageB.evaluate(() => document.body.innerText || '');
        const ctext = await pageC.evaluate(() => document.body.innerText || '');
        const bWords = (btext || '').replace(/\s+/g,' ').trim();
        const cWords = (ctext || '').replace(/\s+/g,' ').trim();
        textDiff = { baselineLength: bWords.length, candidateLength: cWords.length, baselineSample: bWords.slice(0,200), candidateSample: cWords.slice(0,200) };
      } catch (e) {}

      // deterministic evidence-based checks (branding, colors, layers, interactions, structure)
      const issues = compareEvidence(bReport, cReport, pixelDiffPercent);

      pageReport.viewports.push({ width, baseline: bReport, candidate: cReport, pixelDiffPercent, textDiff, issues, console: { baseline: bConsole, candidate: cConsole }, network: { baseline: bNetwork, candidate: cNetwork } });

      await pageB.close(); await contextB.close();
      await pageC.close(); await contextC.close();
    }

    // aggregate issues
    pageReport.issues = pageReport.viewports.flatMap(v => v.issues || []);
    results.pages.push(pageReport);
  }

  await browser.close();

  const outPath = path.join(artifactsDir, 'evidence-summary.json');
  await writeJson(outPath, results);
  await writeJson(path.join(artifactsDir, 'evidence-manifest.json'), {
    runId,
    baselineUrl,
    candidateUrl,
    capturedAt: new Date().toISOString(),
    pages: results.pages.map((page) => ({
      path: page.path,
      viewportCount: page.viewports.length,
      issueCount: (page.issues || []).length,
    })),
  });
  console.log('Evidence collection complete. Artifacts in:', artifactsDir);
  return { artifactsDir, outPath };
}

async function main() {
  const baseline = normalizeBaseUrl(process.env.BASELINE_URL || process.argv[2] || 'https://www.bbcbenelux.com');
  const candidate = normalizeBaseUrl(process.env.CANDIDATE_URL || process.argv[3] || 'https://stage.beta.bbcbenelux.com');
  if (!baseline || !candidate) {
    console.error('Both baseline and candidate URLs are required.');
    process.exit(2);
  }
  console.log('Baseline:', baseline);
  console.log('Candidate:', candidate);
  try {
    await runComparison(baseline, candidate);
    process.exit(0);
  } catch (e) {
    console.error('Error during evidence run:', e);
    process.exit(2);
  }
}

main();
