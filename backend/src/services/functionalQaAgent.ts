import { BrowserContext, Page, Route } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/config';
import { ExecutionResult, PageExecutionResult } from './playwrightExecutionService';
import { MatchedPage } from './crawlAgent';

/**
 * Navigation validation result
 */
export interface NavigationResult {
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  redirectChain?: string[];
  loadTime?: number;
}

/**
 * Form submission result
 */
export interface FormSubmissionResult {
  formSelector: string;
  formAction?: string;
  formMethod?: string;
  success: boolean;
  submitted: boolean;
  error?: string;
  responseUrl?: string;
  responseStatus?: number;
}

/**
 * Broken link information
 */
export interface BrokenLink {
  url: string;
  sourceUrl: string;
  sourceSelector: string;
  statusCode?: number;
  error: string;
  linkText?: string;
}

/**
 * JavaScript runtime error
 */
export interface JSRuntimeError {
  message: string;
  source: string;
  line?: number;
  column?: number;
  stack?: string;
  timestamp: string;
  url: string;
}

/**
 * Functional QA result for a single page
 */
export interface PageFunctionalResult {
  url: string;
  normalizedPath: string;
  navigation: NavigationResult;
  forms: FormSubmissionResult[];
  brokenLinks: BrokenLink[];
  jsErrors: JSRuntimeError[];
  harPath?: string;
  errors: string[];
}

/**
 * Functional QA result for a site
 */
export interface SiteFunctionalResult {
  baseUrl: string;
  pages: PageFunctionalResult[];
  summary: {
    totalPages: number;
    pagesWithNavigationIssues: number;
    pagesWithFormIssues: number;
    totalBrokenLinks: number;
    totalJSErrors: number;
    pagesWithJSErrors: number;
  };
}

/**
 * Complete functional QA result
 */
export interface FunctionalQAResult {
  baseline: SiteFunctionalResult;
  candidate: SiteFunctionalResult;
  artifactPaths: string[];
}

/**
 * FunctionalQaAgent - Performs functional QA testing
 * Validates navigation, forms, links, and captures JS errors and HAR files
 */
export class FunctionalQaAgent {
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  /**
   * Validate navigation to a URL
   */
  async validateNavigation(page: Page, url: string): Promise<NavigationResult> {
    const result: NavigationResult = {
      url,
      success: false,
    };

    try {
      const startTime = Date.now();
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      const loadTime = Date.now() - startTime;
      result.loadTime = loadTime;

      if (response) {
        result.statusCode = response.status();
        result.success = response.status() < 400;
        result.redirectChain = response.request().redirectedFrom()
          ? [response.request().url()]
          : [];

        if (!result.success) {
          result.error = `HTTP ${result.statusCode}: ${response.statusText()}`;
        }
      } else {
        result.error = 'No response received';
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * Execute form submissions on a page
   */
  async executeFormSubmissions(page: Page): Promise<FormSubmissionResult[]> {
    const results: FormSubmissionResult[] = [];

    try {
      // Find all forms on the page
      const forms = await page.$$eval('form', (forms) =>
        forms.map((form, index) => ({
          index,
          selector: `form:nth-of-type(${index + 1})`,
          action: form.action || undefined,
          method: form.method || 'get',
          hasInputs: form.querySelectorAll('input, textarea, select').length > 0,
        }))
      );

      for (const formInfo of forms) {
        if (!formInfo.hasInputs) {
          continue; // Skip forms without inputs
        }

        const result: FormSubmissionResult = {
          formSelector: formInfo.selector,
          formAction: formInfo.action,
          formMethod: formInfo.method,
          success: false,
          submitted: false,
        };

        try {
          // Fill form with test data
          const inputs = await page.$$(`${formInfo.selector} input[type="text"], ${formInfo.selector} input[type="email"], ${formInfo.selector} textarea`);
          for (const input of inputs) {
            const inputType = await input.getAttribute('type');
            const placeholder = await input.getAttribute('placeholder');
            const name = await input.getAttribute('name');

            if (inputType === 'email') {
              await input.fill('test@example.com');
            } else if (placeholder?.toLowerCase().includes('name')) {
              await input.fill('Test User');
            } else if (name?.toLowerCase().includes('message') || name?.toLowerCase().includes('comment')) {
              await input.fill('Test message');
            } else {
              await input.fill('test');
            }
          }

          // Select first option in select elements
          const selects = await page.$$(`${formInfo.selector} select`);
          for (const select of selects) {
            const options = await select.$$('option');
            if (options.length > 1) {
              await select.selectOption({ index: 1 });
            }
          }

          // Submit form and wait for response
          const [response] = await Promise.all([
            page.waitForResponse((resp) => resp.status() < 500, { timeout: 10000 }).catch(() => null),
            page.click(`${formInfo.selector} button[type="submit"], ${formInfo.selector} input[type="submit"]`).catch(() => null),
          ]);

          result.submitted = true;

          if (response) {
            result.responseUrl = response.url();
            result.responseStatus = response.status();
            result.success = response.status() < 400;
          } else {
            // Check if page navigated
            await page.waitForTimeout(1000);
            const currentUrl = page.url();
            if (currentUrl !== page.url()) {
              result.success = true;
              result.responseUrl = currentUrl;
            } else {
              result.error = 'No response received from form submission';
            }
          }
        } catch (error) {
          result.error = error instanceof Error ? error.message : String(error);
        }

        results.push(result);
      }
    } catch (error) {
      // If form detection fails, continue
      console.error('Error detecting forms:', error);
    }

    return results;
  }

  /**
   * Detect broken links on a page
   */
  async detectBrokenLinks(page: Page, baseUrl: string): Promise<BrokenLink[]> {
    const brokenLinks: BrokenLink[] = [];

    try {
      // Get all links on the page
      const links = await page.$$eval('a[href]', (anchors, base) => {
        return anchors.map((a) => {
          const anchor = a as HTMLAnchorElement;
          return {
            href: anchor.href,
            text: anchor.textContent?.trim() || '',
            selector: `a[href="${anchor.getAttribute('href')}"]`,
          };
        });
      }, baseUrl);

      // Check each link
      for (const link of links) {
        try {
          // Skip mailto, tel, javascript, and anchor links
          if (
            link.href.startsWith('mailto:') ||
            link.href.startsWith('tel:') ||
            link.href.startsWith('javascript:') ||
            link.href.startsWith('#')
          ) {
            continue;
          }

          // Check if it's an external link (different domain)
          const linkUrl = new URL(link.href);
          const baseUrlObj = new URL(baseUrl);
          const isExternal = linkUrl.host !== baseUrlObj.host;

          // For external links, we'll do a quick HEAD request
          // For internal links, we can navigate and check
          if (isExternal) {
            // Skip external link validation for now (can be added later)
            continue;
          }

          // Try to navigate to the link
          const response = await page.goto(link.href, {
            waitUntil: 'domcontentloaded',
            timeout: 10000,
          });

          if (!response || response.status() >= 400) {
            brokenLinks.push({
              url: link.href,
              sourceUrl: page.url(),
              sourceSelector: link.selector,
              statusCode: response?.status(),
              error: response ? `HTTP ${response.status()}` : 'No response',
              linkText: link.text,
            });
          }

          // Navigate back
          await page.goBack({ waitUntil: 'domcontentloaded' });
        } catch (error) {
          brokenLinks.push({
            url: link.href,
            sourceUrl: page.url(),
            sourceSelector: link.selector,
            error: error instanceof Error ? error.message : String(error),
            linkText: link.text,
          });
        }
      }
    } catch (error) {
      console.error('Error detecting broken links:', error);
    }

    return brokenLinks;
  }

  /**
   * Capture JavaScript runtime errors
   */
  async captureJSErrors(page: Page): Promise<JSRuntimeError[]> {
    const errors: JSRuntimeError[] = [];

    // Listen for console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const location = msg.location();
        errors.push({
          message: msg.text(),
          source: location.url || page.url(),
          line: location.lineNumber,
          column: location.columnNumber,
          timestamp: new Date().toISOString(),
          url: page.url(),
        });
      }
    });

    // Listen for page errors
    page.on('pageerror', (error) => {
      errors.push({
        message: error.message,
        source: error.name,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        url: page.url(),
      });
    });

    // Also capture errors from window.onerror
    await page.addInitScript(() => {
      window.addEventListener('error', (event) => {
        console.error('Window error:', event.message, event.filename, event.lineno, event.colno);
      });

      window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
      });
    });

    return errors;
  }

  /**
   * Capture HAR file for a page using Playwright's CDP
   */
  async captureHAR(context: BrowserContext, page: Page, runId: string, normalizedPath: string, siteType: 'baseline' | 'candidate'): Promise<string | undefined> {
    try {
      // Use CDP to enable network domain and capture HAR
      const client = await context.newCDPSession(page);
      await client.send('Network.enable');
      await client.send('Page.enable');

      const harPath = path.join(
        this.artifactsDir,
        runId,
        'har',
        siteType,
        `${this.sanitizePath(normalizedPath)}.har`
      );
      await fs.mkdir(path.dirname(harPath), { recursive: true });

      // Collect network events
      const entries: any[] = [];
      const pages: any[] = [];

      client.on('Network.responseReceived', (event) => {
        entries.push({
          request: {
            method: 'GET',
            url: event.response.url,
            headers: {},
          },
          response: {
            status: event.response.status,
            statusText: event.response.statusText,
            headers: event.response.headers,
            content: {
              size: event.response.headers['content-length'] ? parseInt(event.response.headers['content-length']) : 0,
            },
          },
          time: event.response.timing?.requestTime || 0,
        });
      });

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Get performance timing
      const performanceTiming = await page.evaluate(() => {
        const perf = performance.timing;
        return {
          navigationStart: perf.navigationStart,
          domContentLoadedEventEnd: perf.domContentLoadedEventEnd,
          loadEventEnd: perf.loadEventEnd,
        };
      });

      // Generate HAR structure
      const har = {
        log: {
          version: '1.2',
          creator: {
            name: 'Migrate Guard FunctionalQaAgent',
            version: '1.0',
          },
          browser: {
            name: 'Chromium',
            version: '1.0',
          },
          pages: [
            {
              startedDateTime: new Date(performanceTiming.navigationStart).toISOString(),
              id: 'page_1',
              title: await page.title(),
              pageTimings: {
                onContentLoad: performanceTiming.domContentLoadedEventEnd - performanceTiming.navigationStart,
                onLoad: performanceTiming.loadEventEnd - performanceTiming.navigationStart,
              },
            },
          ],
          entries,
        },
      };

      await fs.writeFile(harPath, JSON.stringify(har, null, 2));
      await client.detach();

      return harPath.replace(/^.*[\\/]data[\\/]/, 'data/');
    } catch (error) {
      console.error('Error capturing HAR:', error);
      // Fallback: create a basic HAR structure
      try {
        const harPath = path.join(
          this.artifactsDir,
          runId,
          'har',
          siteType,
          `${this.sanitizePath(normalizedPath)}.har`
        );
        await fs.mkdir(path.dirname(harPath), { recursive: true });
        const har = await this.generateHARFromPage(page);
        await fs.writeFile(harPath, JSON.stringify(har, null, 2));
        return harPath.replace(/^.*[\\/]data[\\/]/, 'data/');
      } catch (fallbackError) {
        return undefined;
      }
    }
  }

  /**
   * Generate basic HAR structure from page (fallback method)
   */
  private async generateHARFromPage(page: Page): Promise<any> {
    // Add performance timing
    const performanceTiming = await page.evaluate(() => {
      const perf = performance.timing;
      return {
        navigationStart: perf.navigationStart,
        domContentLoadedEventEnd: perf.domContentLoadedEventEnd,
        loadEventEnd: perf.loadEventEnd,
      };
    });

    return {
      log: {
        version: '1.2',
        creator: {
          name: 'Migrate Guard FunctionalQaAgent',
          version: '1.0',
        },
        browser: {
          name: 'Chromium',
          version: '1.0',
        },
        pages: [
          {
            startedDateTime: new Date(performanceTiming.navigationStart).toISOString(),
            id: 'page_1',
            title: await page.title(),
            pageTimings: {
              onContentLoad: performanceTiming.domContentLoadedEventEnd - performanceTiming.navigationStart,
              onLoad: performanceTiming.loadEventEnd - performanceTiming.navigationStart,
            },
          },
        ],
        entries: [], // Network entries would be populated from actual requests
      },
    };
  }

  /**
   * Execute functional QA on a single page
   */
  async executePageQA(
    context: BrowserContext,
    page: Page,
    url: string,
    normalizedPath: string,
    baseUrl: string,
    runId: string,
    siteType: 'baseline' | 'candidate'
  ): Promise<PageFunctionalResult> {
    const result: PageFunctionalResult = {
      url,
      normalizedPath,
      navigation: { url, success: false },
      forms: [],
      brokenLinks: [],
      jsErrors: [],
      errors: [],
    };

    try {
      // Set up JS error capture
      const jsErrorPromise = this.captureJSErrors(page);

      // Validate navigation
      result.navigation = await this.validateNavigation(page, url);

      // Wait for page to be fully loaded
      await page.waitForLoadState('networkidle');

      // Execute form submissions
      result.forms = await this.executeFormSubmissions(page);

      // Detect broken links
      result.brokenLinks = await this.detectBrokenLinks(page, baseUrl);

      // Get captured JS errors
      result.jsErrors = await jsErrorPromise;

      // Capture HAR file
      result.harPath = await this.captureHAR(context, page, runId, normalizedPath, siteType);

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Execute functional QA on execution results
   */
  async executeFunctionalQA(
    executionResult: ExecutionResult,
    runId: string
  ): Promise<FunctionalQAResult> {
    const baselineResults: PageFunctionalResult[] = [];
    const candidateResults: PageFunctionalResult[] = [];

    // We need browser contexts to execute QA
    // For now, we'll create a simplified version that works with the execution results
    // In a full implementation, you'd reuse the Playwright contexts

    // Create summary for baseline
    const baselineSummary = {
      totalPages: executionResult.baseline.pages.length,
      pagesWithNavigationIssues: 0,
      pagesWithFormIssues: 0,
      totalBrokenLinks: 0,
      totalJSErrors: 0,
      pagesWithJSErrors: 0,
    };

    // Create summary for candidate
    const candidateSummary = {
      totalPages: executionResult.candidate.pages.length,
      pagesWithNavigationIssues: 0,
      pagesWithFormIssues: 0,
      totalBrokenLinks: 0,
      totalJSErrors: 0,
      pagesWithJSErrors: 0,
    };

    // Note: Full implementation would require browser contexts
    // This is a placeholder structure that can be enhanced

    const artifactPaths: string[] = [];

    // Save functional QA results
    const resultsPath = path.join(this.artifactsDir, runId, 'functional-qa-results.json');
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });

    const functionalResult: FunctionalQAResult = {
      baseline: {
        baseUrl: executionResult.baseline.baseUrl,
        pages: baselineResults,
        summary: baselineSummary,
      },
      candidate: {
        baseUrl: executionResult.candidate.baseUrl,
        pages: candidateResults,
        summary: candidateSummary,
      },
      artifactPaths,
    };

    await fs.writeFile(resultsPath, JSON.stringify(functionalResult, null, 2));
    artifactPaths.push(resultsPath);

    return functionalResult;
  }

  /**
   * Execute functional QA with browser contexts
   */
  async executeFunctionalQAWithContexts(
    baselineContext: BrowserContext,
    candidateContext: BrowserContext,
    matchedPages: MatchedPage[],
    baselineUrl: string,
    candidateUrl: string,
    runId: string
  ): Promise<FunctionalQAResult> {
    const baselineResults: PageFunctionalResult[] = [];
    const candidateResults: PageFunctionalResult[] = [];

    for (const matchedPage of matchedPages) {
      // Execute on baseline
      const baselinePage = await baselineContext.newPage();
      try {
        const baselineResult = await this.executePageQA(
          baselineContext,
          baselinePage,
          matchedPage.baseline.url,
          matchedPage.baseline.normalizedPath,
          baselineUrl,
          runId,
          'baseline'
        );
        baselineResults.push(baselineResult);
      } finally {
        await baselinePage.close();
      }

      // Execute on candidate
      const candidatePage = await candidateContext.newPage();
      try {
        const candidateResult = await this.executePageQA(
          candidateContext,
          candidatePage,
          matchedPage.candidate.url,
          matchedPage.candidate.normalizedPath,
          candidateUrl,
          runId,
          'candidate'
        );
        candidateResults.push(candidateResult);
      } finally {
        await candidatePage.close();
      }
    }

    // Generate summaries
    const baselineSummary = this.generateSummary(baselineResults);
    const candidateSummary = this.generateSummary(candidateResults);

    const artifactPaths: string[] = [];

    // Save functional QA results
    const resultsPath = path.join(this.artifactsDir, runId, 'functional-qa-results.json');
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });

    const functionalResult: FunctionalQAResult = {
      baseline: {
        baseUrl: baselineUrl,
        pages: baselineResults,
        summary: baselineSummary,
      },
      candidate: {
        baseUrl: candidateUrl,
        pages: candidateResults,
        summary: candidateSummary,
      },
      artifactPaths: [resultsPath],
    };

    await fs.writeFile(resultsPath, JSON.stringify(functionalResult, null, 2));
    artifactPaths.push(resultsPath);

    return functionalResult;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(results: PageFunctionalResult[]) {
    let pagesWithNavigationIssues = 0;
    let pagesWithFormIssues = 0;
    let totalBrokenLinks = 0;
    let totalJSErrors = 0;
    let pagesWithJSErrors = 0;

    for (const result of results) {
      if (!result.navigation.success) {
        pagesWithNavigationIssues++;
      }

      const failedForms = result.forms.filter((f) => !f.success);
      if (failedForms.length > 0) {
        pagesWithFormIssues++;
      }

      totalBrokenLinks += result.brokenLinks.length;
      totalJSErrors += result.jsErrors.length;

      if (result.jsErrors.length > 0) {
        pagesWithJSErrors++;
      }
    }

    return {
      totalPages: results.length,
      pagesWithNavigationIssues,
      pagesWithFormIssues,
      totalBrokenLinks,
      totalJSErrors,
      pagesWithJSErrors,
    };
  }

  /**
   * Sanitize path for filesystem use
   */
  private sanitizePath(pathStr: string): string {
    return pathStr
      .replace(/^\/+/, '')
      .replace(/\/+/g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'index';
  }
}

