/**
 * Playwright wrapper for deterministic page capture, network interception, and stabilization.
 */
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { GuardConfig } from '../config';

export interface CapturedPage {
  url: string;
  html: string;
  screenshot: Buffer;
  consoleMessages: Array<{ type: string; text: string }>;
  networkRequests: Array<{ url: string; method: string; postData?: string | undefined }>;
}

/**
 * Lightweight exponential backoff helper.
 */
function backoff(attempt: number) {
  return Math.min(1000 * Math.pow(2, attempt), 10000);
}

export class BrowserRunner {
  private browser?: Browser;
  constructor(private cfg: GuardConfig) {}

  async start() {
    if (!this.browser) this.browser = await chromium.launch({ headless: true });
  }

  async stop() {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  /**
   * Capture a single URL with retries, stabilization, analytics interception and masking.
   */
  async capture(url: string, opts?: { maskSelectors?: string[]; timeoutMs?: number }): Promise<CapturedPage> {
    const attempts = 3;
    let lastErr: any;
    for (let a = 0; a < attempts; a++) {
      try {
        return await this._captureOnce(url, opts);
      } catch (err) {
        lastErr = err;
        const wait = backoff(a);
        await new Promise(r => setTimeout(r, wait));
      }
    }
    throw lastErr;
  }

  private async _captureOnce(url: string, opts?: { maskSelectors?: string[]; timeoutMs?: number }): Promise<CapturedPage> {
    if (!this.browser) await this.start();
    const context = await this.browser!.newContext({ ignoreHTTPSErrors: true, userAgent: 'migrate-guard-bot/1.0' });
    const page = await context.newPage();
    const consoleMessages: Array<{ type: string; text: string }> = [];
    const networkRequests: Array<{ url: string; method: string; postData?: string | undefined }> = [];

    page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
    page.on('request', req => {
      networkRequests.push({ url: req.url(), method: req.method(), postData: req.postData() ?? undefined });
    });

    // Block heavy resources optionally (fonts/images) - simple heuristic
    await page.route('**/*', (route) => {
      const req = route.request();
      const ct = req.resourceType();
      if (ct === 'font') return route.abort();
      return route.continue();
    });

    const timeout = opts?.timeoutMs ?? 30000;

    await page.addInitScript(() => {
      // Freeze time and disable animations
      (window as any).__migrate_guard_now = Date.now();
      Date.now = () => (window as any).__migrate_guard_now;
      const style = document.createElement('style');
      style.innerHTML = '*{animation:none!important;transition:none!important;caret-color:transparent!important;}';
      document.head.appendChild(style);
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout });

    // mask volatile selectors
    if (opts?.maskSelectors && opts.maskSelectors.length) {
      await page.evaluate((sels) => {
        for (const s of sels) {
          const nodes = Array.from(document.querySelectorAll(s));
          for (const n of nodes) {
            (n as HTMLElement).style.background = '#000';
            (n as HTMLElement).style.color = 'transparent';
            (n as HTMLElement).innerHTML = '';
          }
        }
      }, opts.maskSelectors);
    }

    // wait briefly for any dynamic loads
    await page.waitForTimeout(250);

    const html = await page.content();
    const screenshot = await page.screenshot({ fullPage: true }) as Buffer;

    await context.close();
    return { url, html, screenshot, consoleMessages, networkRequests };
  }
}
