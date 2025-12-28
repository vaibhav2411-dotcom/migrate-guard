import { chromium, Browser, BrowserContext, Page, ViewportSize } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/config';
import { MatchedPage } from './crawlAgent';

/**
 * Viewport configuration for screenshot capture
 */
export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
}

/**
 * Default viewports to capture
 */
const DEFAULT_VIEWPORTS: ViewportConfig[] = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 },
];

/**
 * Console message captured from browser
 */
export interface ConsoleMessage {
  type: 'log' | 'error' | 'warning' | 'info' | 'debug';
  text: string;
  timestamp: string;
  url?: string;
}

/**
 * Network request/response information
 */
export interface NetworkRequest {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  timestamp: string;
  failed?: boolean;
  failureText?: string;
}

/**
 * DOM snapshot data
 */
export interface DOMSnapshot {
  html: string;
  textContent: string;
  url: string;
  timestamp: string;
  viewport: ViewportSize;
}

/**
 * Screenshot artifact
 */
export interface ScreenshotArtifact {
  path: string;
  url: string;
  viewport: ViewportConfig;
  timestamp: string;
}

/**
 * Execution result for a single page
 */
export interface PageExecutionResult {
  url: string;
  normalizedPath: string;
  screenshots: ScreenshotArtifact[];
  domSnapshots: DOMSnapshot[];
  consoleMessages: ConsoleMessage[];
  networkRequests: NetworkRequest[];
  networkFailures: NetworkRequest[];
  errors: string[];
  loadTime?: number;
}

/**
 * Execution result for a site (baseline or candidate)
 */
export interface SiteExecutionResult {
  baseUrl: string;
  pages: PageExecutionResult[];
  executionLog: string[];
  errors: string[];
}

/**
 * Complete execution result with both sites
 */
export interface ExecutionResult {
  baseline: SiteExecutionResult;
  candidate: SiteExecutionResult;
  matchedPages: MatchedPage[];
  artifactPaths: string[];
  baselineContext?: BrowserContext;
  candidateContext?: BrowserContext;
}

/**
 * PlaywrightExecutionService - Executes Playwright tests on baseline and candidate sites
 * Captures screenshots, DOM snapshots, console errors, and network failures
 */
export class PlaywrightExecutionService {
  private baselineBrowser: Browser | null = null;
  private candidateBrowser: Browser | null = null;
  private baselineContext: BrowserContext | null = null;
  private candidateContext: BrowserContext | null = null;
  private readonly artifactsDir: string;
  private readonly viewports: ViewportConfig[];

  constructor(viewports: ViewportConfig[] = DEFAULT_VIEWPORTS) {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
    this.viewports = viewports;
  }

  /**
   * Initialize browser instances and contexts
   */
  async initialize(): Promise<void> {
    if (!this.baselineBrowser) {
      this.baselineBrowser = await chromium.launch({
        headless: true,
      });
    }

    if (!this.candidateBrowser) {
      this.candidateBrowser = await chromium.launch({
        headless: true,
      });
    }

    if (!this.baselineContext) {
      this.baselineContext = await this.baselineBrowser.newContext({
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });
    }

    if (!this.candidateContext) {
      this.candidateContext = await this.candidateBrowser.newContext({
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
      });
    }
  }

  /**
   * Cleanup browser instances and contexts
   */
  async cleanup(): Promise<void> {
    if (this.baselineContext) {
      await this.baselineContext.close();
      this.baselineContext = null;
    }

    if (this.candidateContext) {
      await this.candidateContext.close();
      this.candidateContext = null;
    }

    if (this.baselineBrowser) {
      await this.baselineBrowser.close();
      this.baselineBrowser = null;
    }

    if (this.candidateBrowser) {
      await this.candidateBrowser.close();
      this.candidateBrowser = null;
    }
  }

  /**
   * Execute on a single page with a specific context
   */
  async executePage(
    context: BrowserContext,
    url: string,
    normalizedPath: string,
    siteType: 'baseline' | 'candidate',
    runId: string
  ): Promise<PageExecutionResult> {
    const page = await context.newPage();
    const result: PageExecutionResult = {
      url,
      normalizedPath,
      screenshots: [],
      domSnapshots: [],
      consoleMessages: [],
      networkRequests: [],
      networkFailures: [],
      errors: [],
    };

    const consoleMessages: ConsoleMessage[] = [];
    const networkRequests: NetworkRequest[] = [];
    const networkFailures: NetworkRequest[] = [];

    try {
      // Set up console message listener
      page.on('console', (msg) => {
        const message: ConsoleMessage = {
          type: msg.type() as ConsoleMessage['type'],
          text: msg.text(),
          timestamp: new Date().toISOString(),
          url: page.url(),
        };
        consoleMessages.push(message);
      });

      // Set up network request listener
      page.on('request', (request) => {
        const networkRequest: NetworkRequest = {
          url: request.url(),
          method: request.method(),
          requestHeaders: request.headers(),
          timestamp: new Date().toISOString(),
        };
        networkRequests.push(networkRequest);

        request.response()
          .then((response) => {
            if (response) {
              networkRequest.status = response.status();
              networkRequest.statusText = response.statusText();
              networkRequest.responseHeaders = response.headers();
            }
          })
          .catch(() => {
            // Request failed
            networkRequest.failed = true;
            networkRequest.failureText = 'Request failed';
            networkFailures.push(networkRequest);
          });
      });

      // Set up network failure listener
      page.on('requestfailed', (request) => {
        const networkRequest: NetworkRequest = {
          url: request.url(),
          method: request.method(),
          timestamp: new Date().toISOString(),
          failed: true,
          failureText: request.failure()?.errorText || 'Unknown failure',
        };
        networkFailures.push(networkRequest);
      });

      // Navigate to page
      const startTime = Date.now();
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      const loadTime = Date.now() - startTime;
      result.loadTime = loadTime;

      if (!response || response.status() >= 400) {
        result.errors.push(`Page load failed: ${response?.status() || 'No response'}`);
        await page.close();
        return result;
      }

      // Wait for page to be fully loaded
      await page.waitForLoadState('networkidle');

      // Capture DOM snapshot for default viewport
      const defaultViewport = await page.viewportSize();
      if (defaultViewport) {
        const html = await page.content();
        const textContent = await page.evaluate(() => document.body.innerText);
        result.domSnapshots.push({
          html,
          textContent,
          url: page.url(),
          timestamp: new Date().toISOString(),
          viewport: defaultViewport,
        });
      }

      // Capture screenshots for each viewport
      for (const viewport of this.viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        
        // Wait for layout to stabilize
        await page.waitForTimeout(500);

        // Capture screenshot
        const screenshotPath = path.join(
          this.artifactsDir,
          runId,
          siteType,
          this.sanitizePath(normalizedPath),
          `screenshot-${viewport.name}.png`
        );
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });

        result.screenshots.push({
          path: screenshotPath.replace(/^.*[\\/]data[\\/]/, 'data/'),
          url: page.url(),
          viewport,
          timestamp: new Date().toISOString(),
        });

        // Capture DOM snapshot for this viewport
        const html = await page.content();
        const textContent = await page.evaluate(() => document.body.innerText);
        result.domSnapshots.push({
          html,
          textContent,
          url: page.url(),
          timestamp: new Date().toISOString(),
          viewport: { width: viewport.width, height: viewport.height },
        });
      }

      // Reset to default viewport
      await page.setViewportSize({ width: 1920, height: 1080 });

      // Collect all console messages and network data
      result.consoleMessages = consoleMessages;
      result.networkRequests = networkRequests;
      result.networkFailures = networkFailures;

    } catch (error) {
      result.errors.push(`Execution error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await page.close();
    }

    return result;
  }

  /**
   * Execute on multiple pages for a site
   */
  async executeSite(
    context: BrowserContext,
    baseUrl: string,
    pages: Array<{ url: string; normalizedPath: string }>,
    siteType: 'baseline' | 'candidate',
    runId: string
  ): Promise<SiteExecutionResult> {
    const result: SiteExecutionResult = {
      baseUrl,
      pages: [],
      executionLog: [],
      errors: [],
    };

    for (const pageInfo of pages) {
      try {
        result.executionLog.push(`Executing ${siteType} page: ${pageInfo.url}`);
        const pageResult = await this.executePage(
          context,
          pageInfo.url,
          pageInfo.normalizedPath,
          siteType,
          runId
        );
        result.pages.push(pageResult);
        result.executionLog.push(`Completed ${siteType} page: ${pageInfo.normalizedPath}`);
      } catch (error) {
        const errorMsg = `Failed to execute ${siteType} page ${pageInfo.url}: ${error instanceof Error ? error.message : String(error)}`;
        result.errors.push(errorMsg);
        result.executionLog.push(errorMsg);
      }
    }

    return result;
  }

  /**
   * Execute comparison on matched pages
   */
  async executeComparison(
    baselineUrl: string,
    candidateUrl: string,
    matchedPages: MatchedPage[],
    runId: string
  ): Promise<ExecutionResult> {
    await this.initialize();

    if (!this.baselineContext || !this.candidateContext) {
      throw new Error('Browser contexts not initialized');
    }

    try {
      // Prepare page lists for execution
      const baselinePages = matchedPages.map((mp) => ({
        url: mp.baseline.url,
        normalizedPath: mp.baseline.normalizedPath,
      }));

      const candidatePages = matchedPages.map((mp) => ({
        url: mp.candidate.url,
        normalizedPath: mp.candidate.normalizedPath,
      }));

      // Execute both sites in parallel
      const [baselineResult, candidateResult] = await Promise.all([
        this.executeSite(this.baselineContext, baselineUrl, baselinePages, 'baseline', runId),
        this.executeSite(this.candidateContext, candidateUrl, candidatePages, 'candidate', runId),
      ]);

      // Save structured artifacts
      const artifactPaths = await this.saveExecutionArtifacts(
        runId,
        baselineResult,
        candidateResult,
        matchedPages
      );

      const result: ExecutionResult = {
        baseline: baselineResult,
        candidate: candidateResult,
        matchedPages,
        artifactPaths,
        baselineContext: this.baselineContext,
        candidateContext: this.candidateContext,
      };

      // Note: Contexts are kept open for potential use by FunctionalQaAgent
      // They should be closed after FunctionalQaAgent completes

      return result;
    } catch (error) {
      // Cleanup on error
      await this.cleanup();
      throw error;
    }
    // Don't cleanup here - let caller handle cleanup after FunctionalQaAgent
  }

  /**
   * Save execution artifacts to disk
   */
  private async saveExecutionArtifacts(
    runId: string,
    baselineResult: SiteExecutionResult,
    candidateResult: SiteExecutionResult,
    matchedPages: MatchedPage[]
  ): Promise<string[]> {
    const artifactsDir = path.join(this.artifactsDir, runId);
    const artifactPaths: string[] = [];

    // Save baseline execution result
    const baselineFile = path.join(artifactsDir, 'baseline-execution.json');
    await fs.mkdir(path.dirname(baselineFile), { recursive: true });
    await fs.writeFile(baselineFile, JSON.stringify(baselineResult, null, 2));
    artifactPaths.push(baselineFile);

    // Save candidate execution result
    const candidateFile = path.join(artifactsDir, 'candidate-execution.json');
    await fs.writeFile(candidateFile, JSON.stringify(candidateResult, null, 2));
    artifactPaths.push(candidateFile);

    // Save console messages summary
    const consoleSummary = {
      baseline: baselineResult.pages.flatMap((p) => p.consoleMessages),
      candidate: candidateResult.pages.flatMap((p) => p.consoleMessages),
    };
    const consoleFile = path.join(artifactsDir, 'console-messages.json');
    await fs.writeFile(consoleFile, JSON.stringify(consoleSummary, null, 2));
    artifactPaths.push(consoleFile);

    // Save network requests summary
    const networkSummary = {
      baseline: {
        requests: baselineResult.pages.flatMap((p) => p.networkRequests),
        failures: baselineResult.pages.flatMap((p) => p.networkFailures),
      },
      candidate: {
        requests: candidateResult.pages.flatMap((p) => p.networkRequests),
        failures: candidateResult.pages.flatMap((p) => p.networkFailures),
      },
    };
    const networkFile = path.join(artifactsDir, 'network-requests.json');
    await fs.writeFile(networkFile, JSON.stringify(networkSummary, null, 2));
    artifactPaths.push(networkFile);

    // Save DOM snapshots summary (without full HTML to reduce size)
    const domSummary = {
      baseline: baselineResult.pages.map((p) => ({
        url: p.url,
        normalizedPath: p.normalizedPath,
        snapshots: p.domSnapshots.map((s) => ({
          url: s.url,
          viewport: s.viewport,
          timestamp: s.timestamp,
          textContentLength: s.textContent.length,
          htmlLength: s.html.length,
        })),
      })),
      candidate: candidateResult.pages.map((p) => ({
        url: p.url,
        normalizedPath: p.normalizedPath,
        snapshots: p.domSnapshots.map((s) => ({
          url: s.url,
          viewport: s.viewport,
          timestamp: s.timestamp,
          textContentLength: s.textContent.length,
          htmlLength: s.html.length,
        })),
      })),
    };
    const domFile = path.join(artifactsDir, 'dom-snapshots-summary.json');
    await fs.writeFile(domFile, JSON.stringify(domSummary, null, 2));
    artifactPaths.push(domFile);

    // Save execution log
    const executionLog = [
      '=== Baseline Execution Log ===',
      ...baselineResult.executionLog,
      '',
      '=== Candidate Execution Log ===',
      ...candidateResult.executionLog,
      '',
      '=== Errors ===',
      ...baselineResult.errors,
      ...candidateResult.errors,
    ];
    const logFile = path.join(artifactsDir, 'execution.log');
    await fs.writeFile(logFile, executionLog.join('\n'));
    artifactPaths.push(logFile);

    return artifactPaths;
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

