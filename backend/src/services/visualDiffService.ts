import { promises as fs } from 'fs';
import path from 'path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { DATA_DIR } from '../config/config';
import { ExecutionResult, ScreenshotArtifact, PageExecutionResult } from './playwrightExecutionService';
import { ViewportConfig } from './playwrightExecutionService';

/**
 * Severity levels for visual differences
 */
export type DiffSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Layout shift information
 */
export interface LayoutShift {
  x: number; // Horizontal shift in pixels
  y: number; // Vertical shift in pixels
  magnitude: number; // Total shift magnitude
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Pixel diff metrics
 */
export interface PixelDiffMetrics {
  totalPixels: number;
  differentPixels: number;
  diffPercentage: number;
  diffRatio: number; // 0-1, where 1 is completely different
}

/**
 * Visual diff result for a single screenshot comparison
 */
export interface ScreenshotDiffResult {
  baselinePath: string;
  candidatePath: string;
  diffPath: string;
  heatmapPath: string;
  viewport: ViewportConfig;
  normalizedPath: string;
  pixelMetrics: PixelDiffMetrics;
  layoutShifts: LayoutShift[];
  severity: DiffSeverity;
  timestamp: string;
}

/**
 * Visual diff result for a page (all viewports)
 */
export interface PageDiffResult {
  normalizedPath: string;
  baselineUrl: string;
  candidateUrl: string;
  screenshotDiffs: ScreenshotDiffResult[];
  overallSeverity: DiffSeverity;
  totalDiffPercentage: number;
  hasLayoutShifts: boolean;
}

/**
 * Complete visual diff result
 */
export interface VisualDiffResult {
  pages: PageDiffResult[];
  summary: {
    totalPages: number;
    pagesWithDiffs: number;
    pagesWithLayoutShifts: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    noneIssues: number;
    averageDiffPercentage: number;
  };
  artifactPaths: string[];
}

/**
 * VisualDiffService - Compares baseline and candidate screenshots
 * Detects layout shifts, pixel differences, and generates heatmaps
 */
export class VisualDiffService {
  private readonly artifactsDir: string;
  private readonly diffThreshold: number; // Pixel difference threshold (0-1)
  private readonly layoutShiftThreshold: number; // Minimum pixels for layout shift detection

  constructor(
    diffThreshold: number = 0.1, // 10% difference threshold
    layoutShiftThreshold: number = 5 // 5 pixels minimum for layout shift
  ) {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
    this.diffThreshold = diffThreshold;
    this.layoutShiftThreshold = layoutShiftThreshold;
  }

  /**
   * Load PNG image from file
   */
  private async loadPNG(filePath: string): Promise<PNG> {
    const data = await fs.readFile(filePath);
    return PNG.sync.read(data);
  }

  /**
   * Save PNG image to file
   */
  private async savePNG(png: PNG, filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const buffer = PNG.sync.write(png);
    await fs.writeFile(filePath, buffer);
  }

  /**
   * Calculate severity based on diff metrics
   */
  private calculateSeverity(diffPercentage: number, hasLayoutShifts: boolean): DiffSeverity {
    if (diffPercentage === 0 && !hasLayoutShifts) {
      return 'none';
    }

    if (hasLayoutShifts && diffPercentage > 0.5) {
      return 'critical';
    }

    if (hasLayoutShifts || diffPercentage > 0.3) {
      return 'high';
    }

    if (diffPercentage > 0.1) {
      return 'medium';
    }

    if (diffPercentage > 0.05) {
      return 'low';
    }

    return 'none';
  }

  /**
   * Detect layout shifts by comparing element positions
   * This is a simplified version - in production, you'd use more sophisticated methods
   */
  private detectLayoutShifts(
    baselineImg: PNG,
    candidateImg: PNG,
    diffImg: PNG
  ): LayoutShift[] {
    const shifts: LayoutShift[] = [];

    // Simple heuristic: detect large contiguous regions of differences
    // that suggest layout shifts rather than content changes
    const width = baselineImg.width;
    const height = baselineImg.height;
    const visited = new Set<string>();

    // Scan for difference regions
    for (let y = 0; y < height; y += 10) {
      for (let x = 0; x < width; x += 10) {
        const key = `${x},${y}`;
        if (visited.has(key)) continue;

        // Check if this region has significant differences
        let diffCount = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;

        for (let dy = 0; dy < 10 && y + dy < height; dy++) {
          for (let dx = 0; dx < 10 && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            const r = diffImg.data[idx];
            const g = diffImg.data[idx + 1];
            const b = diffImg.data[idx + 2];

            if (r > 0 || g > 0 || b > 0) {
              diffCount++;
              minX = Math.min(minX, x + dx);
              maxX = Math.max(maxX, x + dx);
              minY = Math.min(minY, y + dy);
              maxY = Math.max(maxY, y + dy);
            }
          }
        }

        // If significant differences found, mark as potential layout shift
        if (diffCount > this.layoutShiftThreshold) {
          // Calculate shift magnitude (simplified - compare center of mass)
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          const expectedX = width / 2;
          const expectedY = height / 2;

          const shiftX = Math.abs(centerX - expectedX);
          const shiftY = Math.abs(centerY - expectedY);
          const magnitude = Math.sqrt(shiftX * shiftX + shiftY * shiftY);

          if (magnitude > this.layoutShiftThreshold) {
            shifts.push({
              x: shiftX,
              y: shiftY,
              magnitude,
              region: {
                x: minX,
                y: minY,
                width: maxX - minX,
                height: maxY - minY,
              },
            });

            // Mark region as visited
            for (let dy = 0; dy < 10 && y + dy < height; dy++) {
              for (let dx = 0; dx < 10 && x + dx < width; dx++) {
                visited.add(`${x + dx},${y + dy}`);
              }
            }
          }
        }
      }
    }

    return shifts;
  }

  /**
   * Generate heatmap from diff image
   */
  private generateHeatmap(diffImg: PNG, baselineImg: PNG, candidateImg: PNG): PNG {
    const heatmap = new PNG({ width: diffImg.width, height: diffImg.height });

    for (let y = 0; y < diffImg.height; y++) {
      for (let x = 0; x < diffImg.width; x++) {
        const idx = (y * diffImg.width + x) * 4;

        // Get diff intensity
        const r = diffImg.data[idx];
        const g = diffImg.data[idx + 1];
        const b = diffImg.data[idx + 2];
        const intensity = Math.max(r, g, b);

        // Generate heatmap color (red for high diff, yellow for medium, green for low)
        let heatR: number;
        let heatG: number;
        let heatB: number;

        if (intensity > 200) {
          // High difference - red
          heatR = 255;
          heatG = 0;
          heatB = 0;
        } else if (intensity > 100) {
          // Medium difference - yellow/orange
          heatR = 255;
          heatG = Math.floor(255 * (intensity / 200));
          heatB = 0;
        } else if (intensity > 0) {
          // Low difference - green/yellow
          heatR = Math.floor(255 * (intensity / 100));
          heatG = 255;
          heatB = 0;
        } else {
          // No difference - use baseline with transparency
          heatR = baselineImg.data[idx];
          heatG = baselineImg.data[idx + 1];
          heatB = baselineImg.data[idx + 2];
        }

        heatmap.data[idx] = heatR;
        heatmap.data[idx + 1] = heatG;
        heatmap.data[idx + 2] = heatB;
        heatmap.data[idx + 3] = 255; // Full opacity
      }
    }

    return heatmap;
  }

  /**
   * Compare two screenshots
   */
  async compareScreenshots(
    baselinePath: string,
    candidatePath: string,
    normalizedPath: string,
    viewport: ViewportConfig,
    runId: string
  ): Promise<ScreenshotDiffResult> {
    // Load images
    const baselineImg = await this.loadPNG(baselinePath);
    const candidateImg = await this.loadPNG(candidatePath);

    // Ensure images are same size (resize candidate if needed)
    if (baselineImg.width !== candidateImg.width || baselineImg.height !== candidateImg.height) {
      // Create resized candidate image
      const resized = new PNG({ width: baselineImg.width, height: baselineImg.height });
      // Simple nearest-neighbor resize (in production, use proper image library)
      for (let y = 0; y < baselineImg.height; y++) {
        for (let x = 0; x < baselineImg.width; x++) {
          const srcX = Math.floor((x / baselineImg.width) * candidateImg.width);
          const srcY = Math.floor((y / baselineImg.height) * candidateImg.height);
          const srcIdx = (srcY * candidateImg.width + srcX) * 4;
          const dstIdx = (y * baselineImg.width + x) * 4;

          resized.data[dstIdx] = candidateImg.data[srcIdx];
          resized.data[dstIdx + 1] = candidateImg.data[srcIdx + 1];
          resized.data[dstIdx + 2] = candidateImg.data[srcIdx + 2];
          resized.data[dstIdx + 3] = candidateImg.data[srcIdx + 3];
        }
      }
      candidateImg.width = resized.width;
      candidateImg.height = resized.height;
      candidateImg.data = resized.data;
    }

    // Create diff image
    const diffImg = new PNG({ width: baselineImg.width, height: baselineImg.height });

    // Compare images using pixelmatch
    const numDiffPixels = pixelmatch(
      baselineImg.data,
      candidateImg.data,
      diffImg.data,
      baselineImg.width,
      baselineImg.height,
      {
        threshold: this.diffThreshold,
        includeAA: false,
      }
    );

    // Calculate metrics
    const totalPixels = baselineImg.width * baselineImg.height;
    const diffPercentage = (numDiffPixels / totalPixels) * 100;
    const diffRatio = numDiffPixels / totalPixels;

    const pixelMetrics: PixelDiffMetrics = {
      totalPixels,
      differentPixels: numDiffPixels,
      diffPercentage,
      diffRatio,
    };

    // Detect layout shifts
    const layoutShifts = this.detectLayoutShifts(baselineImg, candidateImg, diffImg);

    // Generate heatmap
    const heatmap = this.generateHeatmap(diffImg, baselineImg, candidateImg);

    // Save diff and heatmap images
    const sanitizedPath = this.sanitizePath(normalizedPath);
    const diffPath = path.join(
      this.artifactsDir,
      runId,
      'visual-diffs',
      sanitizedPath,
      `diff-${viewport.name}.png`
    );
    const heatmapPath = path.join(
      this.artifactsDir,
      runId,
      'visual-diffs',
      sanitizedPath,
      `heatmap-${viewport.name}.png`
    );

    await this.savePNG(diffImg, diffPath);
    await this.savePNG(heatmap, heatmapPath);

    // Calculate severity
    const severity = this.calculateSeverity(diffRatio, layoutShifts.length > 0);

    return {
      baselinePath,
      candidatePath,
      diffPath: diffPath.replace(/^.*[\\/]data[\\/]/, 'data/'),
      heatmapPath: heatmapPath.replace(/^.*[\\/]data[\\/]/, 'data/'),
      viewport,
      normalizedPath,
      pixelMetrics,
      layoutShifts,
      severity,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compare execution results for all matched pages
   */
  async compareExecutionResults(
    executionResult: ExecutionResult,
    runId: string
  ): Promise<VisualDiffResult> {
    const pageDiffs: PageDiffResult[] = [];
    const artifactPaths: string[] = [];

    // Match pages by normalized path
    const baselinePagesByPath = new Map<string, PageExecutionResult>();
    const candidatePagesByPath = new Map<string, PageExecutionResult>();

    for (const page of executionResult.baseline.pages) {
      baselinePagesByPath.set(page.normalizedPath, page);
    }

    for (const page of executionResult.candidate.pages) {
      candidatePagesByPath.set(page.normalizedPath, page);
    }

    // Compare each matched page
    for (const matchedPage of executionResult.matchedPages) {
      const baselinePage = baselinePagesByPath.get(matchedPage.baseline.normalizedPath);
      const candidatePage = candidatePagesByPath.get(matchedPage.candidate.normalizedPath);

      if (!baselinePage || !candidatePage) {
        continue; // Skip if page not found in execution results
      }

      const screenshotDiffs: ScreenshotDiffResult[] = [];

      // Compare screenshots for each viewport
      for (const baselineScreenshot of baselinePage.screenshots) {
        const candidateScreenshot = candidatePage.screenshots.find(
          (s) => s.viewport.name === baselineScreenshot.viewport.name
        );

        if (!candidateScreenshot) {
          continue; // Skip if viewport not found in candidate
        }

        // Resolve absolute paths
        const baselineAbsPath = path.resolve(DATA_DIR, baselineScreenshot.path.replace(/^data[\\/]/, ''));
        const candidateAbsPath = path.resolve(DATA_DIR, candidateScreenshot.path.replace(/^data[\\/]/, ''));

        try {
          const diffResult = await this.compareScreenshots(
            baselineAbsPath,
            candidateAbsPath,
            baselinePage.normalizedPath,
            baselineScreenshot.viewport,
            runId
          );
          screenshotDiffs.push(diffResult);
        } catch (error) {
          // Log error but continue with other comparisons
          console.error(`Error comparing screenshots for ${baselinePage.normalizedPath}:`, error);
        }
      }

      // Calculate overall page metrics
      const totalDiffPercentage = screenshotDiffs.reduce(
        (sum, diff) => sum + diff.pixelMetrics.diffPercentage,
        0
      ) / screenshotDiffs.length || 0;

      const hasLayoutShifts = screenshotDiffs.some((diff) => diff.layoutShifts.length > 0);

      const severities = screenshotDiffs.map((diff) => diff.severity);
      const overallSeverity = this.getOverallSeverity(severities);

      pageDiffs.push({
        normalizedPath: baselinePage.normalizedPath,
        baselineUrl: baselinePage.url,
        candidateUrl: candidatePage.url,
        screenshotDiffs,
        overallSeverity,
        totalDiffPercentage,
        hasLayoutShifts,
      });
    }

    // Generate summary
    const summary = this.generateSummary(pageDiffs);

    // Save diff results
    const diffResultsPath = path.join(this.artifactsDir, runId, 'visual-diff-results.json');
    await fs.mkdir(path.dirname(diffResultsPath), { recursive: true });
    await fs.writeFile(
      diffResultsPath,
      JSON.stringify({ pages: pageDiffs, summary }, null, 2)
    );
    artifactPaths.push(diffResultsPath);

    return {
      pages: pageDiffs,
      summary,
      artifactPaths,
    };
  }

  /**
   * Get overall severity from array of severities
   */
  private getOverallSeverity(severities: DiffSeverity[]): DiffSeverity {
    const severityOrder: DiffSeverity[] = ['none', 'low', 'medium', 'high', 'critical'];
    let maxSeverity: DiffSeverity = 'none';

    for (const severity of severities) {
      const currentIndex = severityOrder.indexOf(severity);
      const maxIndex = severityOrder.indexOf(maxSeverity);
      if (currentIndex > maxIndex) {
        maxSeverity = severity;
      }
    }

    return maxSeverity;
  }

  /**
   * Generate summary statistics
   */
  private generateSummary(pageDiffs: PageDiffResult[]) {
    const pagesWithDiffs = pageDiffs.filter((p) => p.totalDiffPercentage > 0).length;
    const pagesWithLayoutShifts = pageDiffs.filter((p) => p.hasLayoutShifts).length;

    const severityCounts: Record<DiffSeverity, number> = {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const pageDiff of pageDiffs) {
      severityCounts[pageDiff.overallSeverity]++;
    }

    const totalDiffPercentage = pageDiffs.reduce(
      (sum, p) => sum + p.totalDiffPercentage,
      0
    ) / pageDiffs.length || 0;

    return {
      totalPages: pageDiffs.length,
      pagesWithDiffs,
      pagesWithLayoutShifts,
      criticalIssues: severityCounts.critical,
      highIssues: severityCounts.high,
      mediumIssues: severityCounts.medium,
      lowIssues: severityCounts.low,
      noneIssues: severityCounts.none,
      averageDiffPercentage: totalDiffPercentage,
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

