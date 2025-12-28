import { Page, BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/config';
import { ExecutionResult, PageExecutionResult } from './playwrightExecutionService';
import { MatchedPage } from './crawlAgent';

/**
 * Text content extraction result
 */
export interface TextContent {
  url: string;
  normalizedPath: string;
  visibleText: string;
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  links: Array<{ text: string; href: string }>;
  metadata: {
    title?: string;
    description?: string;
    keywords?: string;
  };
}

/**
 * Table data structure
 */
export interface TableData {
  selector: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
  columnCount: number;
}

/**
 * Pricing information
 */
export interface PricingData {
  selector: string;
  currency?: string;
  amount?: number;
  period?: string; // e.g., "per month", "per year"
  originalPrice?: number;
  discount?: number;
  text: string;
}

/**
 * JSON API response
 */
export interface APIResponse {
  url: string;
  method: string;
  statusCode: number;
  contentType?: string;
  data: any;
  timestamp: string;
}

/**
 * Field comparison result
 */
export type FieldStatus = 'match' | 'mismatch' | 'missing_baseline' | 'missing_candidate' | 'changed';

export interface FieldDiff {
  field: string;
  path: string; // JSON path or table position
  status: FieldStatus;
  baselineValue?: any;
  candidateValue?: any;
  difference?: string;
}

/**
 * Structured data comparison result
 */
export interface StructuredDataDiff {
  type: 'table' | 'pricing' | 'json' | 'text';
  selector?: string;
  url?: string;
  fieldDiffs: FieldDiff[];
  summary: {
    totalFields: number;
    matchedFields: number;
    mismatchedFields: number;
    missingInBaseline: number;
    missingInCandidate: number;
    changedFields: number;
  };
}

/**
 * Data integrity result for a single page
 */
export interface PageDataIntegrityResult {
  url: string;
  normalizedPath: string;
  baselineText: TextContent;
  candidateText: TextContent;
  textDiff?: {
    similarity: number; // 0-1
    addedText: string[];
    removedText: string[];
    changedText: Array<{ baseline: string; candidate: string }>;
  };
  tables: {
    baseline: TableData[];
    candidate: TableData[];
    diffs: StructuredDataDiff[];
  };
  pricing: {
    baseline: PricingData[];
    candidate: PricingData[];
    diffs: StructuredDataDiff[];
  };
  apiResponses: {
    baseline: APIResponse[];
    candidate: APIResponse[];
    diffs: StructuredDataDiff[];
  };
  overallStatus: 'match' | 'mismatch' | 'partial';
}

/**
 * Complete data integrity result
 */
export interface DataIntegrityResult {
  pages: PageDataIntegrityResult[];
  summary: {
    totalPages: number;
    pagesWithMismatches: number;
    pagesWithMissingData: number;
    totalFieldDiffs: number;
    criticalMismatches: number;
  };
  artifactPaths: string[];
}

/**
 * DataIntegrityAgent - Validates data integrity between baseline and candidate
 * Extracts and compares text content, structured data, and API responses
 */
export class DataIntegrityAgent {
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  /**
   * Extract visible text content from a page
   */
  async extractTextContent(page: Page, url: string, normalizedPath: string): Promise<TextContent> {
    const content = await page.evaluate(() => {
      // Get visible text (excluding script and style tags)
      const getVisibleText = (element: Element): string => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const style = window.getComputedStyle(parent);
            if (style.display === 'none' || style.visibility === 'hidden') {
              return NodeFilter.FILTER_REJECT;
            }
            if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        });

        let text = '';
        let node;
        while ((node = walker.nextNode())) {
          text += node.textContent + ' ';
        }
        return text.trim();
      };

      // Extract headings
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => ({
        level: parseInt(h.tagName.charAt(1)),
        text: h.textContent?.trim() || '',
      }));

      // Extract paragraphs
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .map((p) => p.textContent?.trim())
        .filter((text) => text.length > 0);

      // Extract links
      const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        text: a.textContent?.trim() || '',
        href: (a as HTMLAnchorElement).href,
      }));

      // Extract metadata
      const getMeta = (name: string) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return meta?.getAttribute('content') || undefined;
      };

      return {
        visibleText: getVisibleText(document.body),
        headings,
        paragraphs,
        links,
        metadata: {
          title: document.title,
          description: getMeta('description') || getMeta('og:description'),
          keywords: getMeta('keywords'),
        },
      };
    });

    return {
      url,
      normalizedPath,
      ...content,
    };
  }

  /**
   * Extract table data from a page
   */
  async extractTables(page: Page): Promise<TableData[]> {
    const tables = await page.$$eval('table', (tables) => {
      return tables.map((table, index) => {
        const headers: string[] = [];
        const headerRows = table.querySelectorAll('thead tr, tr:first-child');
        if (headerRows.length > 0) {
          const headerCells = headerRows[0].querySelectorAll('th, td');
          headerCells.forEach((cell) => {
            headers.push(cell.textContent?.trim() || '');
          });
        }

        const rows: string[][] = [];
        const dataRows = table.querySelectorAll('tbody tr, tr');
        dataRows.forEach((row, rowIndex) => {
          // Skip header row if it was in tbody
          if (rowIndex === 0 && headers.length === 0) {
            const cells = row.querySelectorAll('th, td');
            cells.forEach((cell) => {
              headers.push(cell.textContent?.trim() || '');
            });
            return;
          }

          const cells = row.querySelectorAll('td');
          if (cells.length > 0) {
            const rowData: string[] = [];
            cells.forEach((cell) => {
              rowData.push(cell.textContent?.trim() || '');
            });
            rows.push(rowData);
          }
        });

        return {
          index,
          selector: `table:nth-of-type(${index + 1})`,
          headers,
          rows,
          rowCount: rows.length,
          columnCount: headers.length || (rows[0]?.length || 0),
        };
      });
    });

    return tables.map((t) => ({
      selector: t.selector,
      headers: t.headers,
      rows: t.rows,
      rowCount: t.rowCount,
      columnCount: t.columnCount,
    }));
  }

  /**
   * Extract pricing information from a page
   */
  async extractPricing(page: Page): Promise<PricingData[]> {
    const pricing = await page.evaluate(() => {
      const pricingElements: PricingData[] = [];
      const pricePattern = /[\$€£¥]?\s*(\d+(?:[.,]\d{2})?)/g;

      // Look for common pricing selectors
      const selectors = [
        '.price',
        '.pricing',
        '[class*="price"]',
        '[class*="cost"]',
        '[data-price]',
        '[data-pricing]',
      ];

      selectors.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element) => {
          const text = element.textContent?.trim() || '';
          const matches = Array.from(text.matchAll(pricePattern));
          if (matches.length > 0) {
            const match = matches[0];
            const amount = parseFloat(match[1].replace(',', '.'));
            const currency = text.match(/[\$€£¥]/)?.[0];

            pricingElements.push({
              selector: selector,
              currency,
              amount,
              text,
            });
          }
        });
      });

      return pricingElements;
    });

    return pricing;
  }

  /**
   * Extract JSON API responses from network requests
   */
  async extractAPIResponses(page: Page, baseUrl: string): Promise<APIResponse[]> {
    // This would need to be integrated with network request capture
    // For now, we'll extract JSON-LD structured data from the page
    const apiResponses: APIResponse[] = [];

    try {
      const jsonLd = await page.$$eval('script[type="application/ld+json"]', (scripts) => {
        return scripts.map((script) => {
          try {
            return JSON.parse(script.textContent || '{}');
          } catch {
            return null;
          }
        }).filter(Boolean);
      });

      jsonLd.forEach((data, index) => {
        apiResponses.push({
          url: `${baseUrl}#json-ld-${index}`,
          method: 'GET',
          statusCode: 200,
          contentType: 'application/ld+json',
          data,
          timestamp: new Date().toISOString(),
        });
      });
    } catch (error) {
      console.error('Error extracting JSON-LD:', error);
    }

    return apiResponses;
  }

  /**
   * Compare text content
   */
  compareTextContent(baseline: TextContent, candidate: TextContent): {
    similarity: number;
    addedText: string[];
    removedText: string[];
    changedText: Array<{ baseline: string; candidate: string }>;
  } {
    const baselineWords = new Set(baseline.visibleText.toLowerCase().split(/\s+/));
    const candidateWords = new Set(candidate.visibleText.toLowerCase().split(/\s+/));

    const intersection = new Set([...baselineWords].filter((x) => candidateWords.has(x)));
    const union = new Set([...baselineWords, ...candidateWords]);
    const similarity = union.size > 0 ? intersection.size / union.size : 1;

    const addedText = [...candidateWords].filter((x) => !baselineWords.has(x));
    const removedText = [...baselineWords].filter((x) => !candidateWords.has(x));

    // Simple change detection (can be enhanced)
    const changedText: Array<{ baseline: string; candidate: string }> = [];
    const baselineSentences = baseline.visibleText.split(/[.!?]+/).filter((s) => s.trim().length > 0);
    const candidateSentences = candidate.visibleText.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    // Compare sentences at same positions
    const maxLength = Math.max(baselineSentences.length, candidateSentences.length);
    for (let i = 0; i < maxLength; i++) {
      const baselineSentence = baselineSentences[i]?.trim() || '';
      const candidateSentence = candidateSentences[i]?.trim() || '';
      if (baselineSentence && candidateSentence && baselineSentence !== candidateSentence) {
        changedText.push({ baseline: baselineSentence, candidate: candidateSentence });
      }
    }

    return {
      similarity,
      addedText: Array.from(addedText),
      removedText: Array.from(removedText),
      changedText,
    };
  }

  /**
   * Compare table data
   */
  compareTables(baseline: TableData[], candidate: TableData[]): StructuredDataDiff[] {
    const diffs: StructuredDataDiff[] = [];

    // Match tables by selector or structure
    const matchedTables = new Map<number, { baseline: TableData; candidate: TableData }>();

    for (let i = 0; i < Math.max(baseline.length, candidate.length); i++) {
      const baselineTable = baseline[i];
      const candidateTable = candidate[i];

      if (!baselineTable && candidateTable) {
        // Table missing in baseline
        diffs.push({
          type: 'table',
          selector: candidateTable.selector,
          fieldDiffs: [{
            field: 'table',
            path: candidateTable.selector,
            status: 'missing_baseline',
            candidateValue: candidateTable,
          }],
          summary: {
            totalFields: candidateTable.rowCount * candidateTable.columnCount,
            matchedFields: 0,
            mismatchedFields: 0,
            missingInBaseline: candidateTable.rowCount * candidateTable.columnCount,
            missingInCandidate: 0,
            changedFields: 0,
          },
        });
        continue;
      }

      if (baselineTable && !candidateTable) {
        // Table missing in candidate
        diffs.push({
          type: 'table',
          selector: baselineTable.selector,
          fieldDiffs: [{
            field: 'table',
            path: baselineTable.selector,
            status: 'missing_candidate',
            baselineValue: baselineTable,
          }],
          summary: {
            totalFields: baselineTable.rowCount * baselineTable.columnCount,
            matchedFields: 0,
            mismatchedFields: 0,
            missingInBaseline: 0,
            missingInCandidate: baselineTable.rowCount * baselineTable.columnCount,
            changedFields: 0,
          },
        });
        continue;
      }

      if (baselineTable && candidateTable) {
        // Compare table structure and content
        const fieldDiffs: FieldDiff[] = [];

        // Compare headers
        if (baselineTable.headers.length !== candidateTable.headers.length) {
          fieldDiffs.push({
            field: 'headers',
            path: `${baselineTable.selector}/headers`,
            status: 'mismatch',
            baselineValue: baselineTable.headers,
            candidateValue: candidateTable.headers,
            difference: `Header count: ${baselineTable.headers.length} vs ${candidateTable.headers.length}`,
          });
        } else {
          baselineTable.headers.forEach((header, idx) => {
            if (header !== candidateTable.headers[idx]) {
              fieldDiffs.push({
                field: `header[${idx}]`,
                path: `${baselineTable.selector}/headers[${idx}]`,
                status: 'changed',
                baselineValue: header,
                candidateValue: candidateTable.headers[idx],
              });
            }
          });
        }

        // Compare rows
        const maxRows = Math.max(baselineTable.rows.length, candidateTable.rows.length);
        for (let rowIdx = 0; rowIdx < maxRows; rowIdx++) {
          const baselineRow = baselineTable.rows[rowIdx];
          const candidateRow = candidateTable.rows[rowIdx];

          if (!baselineRow && candidateRow) {
            fieldDiffs.push({
              field: `row[${rowIdx}]`,
              path: `${baselineTable.selector}/rows[${rowIdx}]`,
              status: 'missing_baseline',
              candidateValue: candidateRow,
            });
          } else if (baselineRow && !candidateRow) {
            fieldDiffs.push({
              field: `row[${rowIdx}]`,
              path: `${baselineTable.selector}/rows[${rowIdx}]`,
              status: 'missing_candidate',
              baselineValue: baselineRow,
            });
          } else if (baselineRow && candidateRow) {
            // Compare cells
            const maxCells = Math.max(baselineRow.length, candidateRow.length);
            for (let cellIdx = 0; cellIdx < maxCells; cellIdx++) {
              const baselineCell = baselineRow[cellIdx];
              const candidateCell = candidateRow[cellIdx];

              if (baselineCell !== candidateCell) {
                fieldDiffs.push({
                  field: `row[${rowIdx}][${cellIdx}]`,
                  path: `${baselineTable.selector}/rows[${rowIdx}][${cellIdx}]`,
                  status: baselineCell && candidateCell ? 'changed' : baselineCell ? 'missing_candidate' : 'missing_baseline',
                  baselineValue: baselineCell,
                  candidateValue: candidateCell,
                });
              }
            }
          }
        }

        if (fieldDiffs.length > 0) {
          const matchedFields = (baselineTable.rowCount * baselineTable.columnCount) - fieldDiffs.length;
          diffs.push({
            type: 'table',
            selector: baselineTable.selector,
            fieldDiffs,
            summary: {
              totalFields: baselineTable.rowCount * baselineTable.columnCount,
              matchedFields,
              mismatchedFields: fieldDiffs.filter((f) => f.status === 'mismatch').length,
              missingInBaseline: fieldDiffs.filter((f) => f.status === 'missing_baseline').length,
              missingInCandidate: fieldDiffs.filter((f) => f.status === 'missing_candidate').length,
              changedFields: fieldDiffs.filter((f) => f.status === 'changed').length,
            },
          });
        }
      }
    }

    return diffs;
  }

  /**
   * Compare pricing data
   */
  comparePricing(baseline: PricingData[], candidate: PricingData[]): StructuredDataDiff[] {
    const diffs: StructuredDataDiff[] = [];

    // Match pricing by selector
    const baselineBySelector = new Map<string, PricingData>();
    const candidateBySelector = new Map<string, PricingData>();

    baseline.forEach((p) => baselineBySelector.set(p.selector, p));
    candidate.forEach((p) => candidateBySelector.set(p.selector, p));

    const allSelectors = new Set([...baselineBySelector.keys(), ...candidateBySelector.keys()]);

    for (const selector of allSelectors) {
      const baselinePricing = baselineBySelector.get(selector);
      const candidatePricing = candidateBySelector.get(selector);

      const fieldDiffs: FieldDiff[] = [];

      if (!baselinePricing && candidatePricing) {
        fieldDiffs.push({
          field: 'pricing',
          path: selector,
          status: 'missing_baseline',
          candidateValue: candidatePricing,
        });
      } else if (baselinePricing && !candidatePricing) {
        fieldDiffs.push({
          field: 'pricing',
          path: selector,
          status: 'missing_candidate',
          baselineValue: baselinePricing,
        });
      } else if (baselinePricing && candidatePricing) {
        // Compare pricing fields
        if (baselinePricing.amount !== candidatePricing.amount) {
          fieldDiffs.push({
            field: 'amount',
            path: `${selector}/amount`,
            status: 'changed',
            baselineValue: baselinePricing.amount,
            candidateValue: candidatePricing.amount,
            difference: `${baselinePricing.amount} vs ${candidatePricing.amount}`,
          });
        }

        if (baselinePricing.currency !== candidatePricing.currency) {
          fieldDiffs.push({
            field: 'currency',
            path: `${selector}/currency`,
            status: 'changed',
            baselineValue: baselinePricing.currency,
            candidateValue: candidatePricing.currency,
          });
        }
      }

      if (fieldDiffs.length > 0) {
        diffs.push({
          type: 'pricing',
          selector,
          fieldDiffs,
          summary: {
            totalFields: 2, // amount and currency
            matchedFields: 2 - fieldDiffs.length,
            mismatchedFields: 0,
            missingInBaseline: fieldDiffs.filter((f) => f.status === 'missing_baseline').length,
            missingInCandidate: fieldDiffs.filter((f) => f.status === 'missing_candidate').length,
            changedFields: fieldDiffs.filter((f) => f.status === 'changed').length,
          },
        });
      }
    }

    return diffs;
  }

  /**
   * Compare JSON API responses
   */
  compareJSONResponses(baseline: APIResponse[], candidate: APIResponse[]): StructuredDataDiff[] {
    const diffs: StructuredDataDiff[] = [];

    // Match by URL
    const baselineByUrl = new Map<string, APIResponse>();
    const candidateByUrl = new Map<string, APIResponse>();

    baseline.forEach((r) => baselineByUrl.set(r.url, r));
    candidate.forEach((r) => candidateByUrl.set(r.url, r));

    const allUrls = new Set([...baselineByUrl.keys(), ...candidateByUrl.keys()]);

    for (const url of allUrls) {
      const baselineResponse = baselineByUrl.get(url);
      const candidateResponse = candidateByUrl.get(url);

      const fieldDiffs: FieldDiff[] = [];

      if (!baselineResponse && candidateResponse) {
        fieldDiffs.push({
          field: 'response',
          path: url,
          status: 'missing_baseline',
          candidateValue: candidateResponse.data,
        });
      } else if (baselineResponse && !candidateResponse) {
        fieldDiffs.push({
          field: 'response',
          path: url,
          status: 'missing_candidate',
          baselineValue: baselineResponse.data,
        });
      } else if (baselineResponse && candidateResponse) {
        // Deep compare JSON objects
        const jsonDiffs = this.compareJSONObjects(baselineResponse.data, candidateResponse.data, url);
        fieldDiffs.push(...jsonDiffs);
      }

      if (fieldDiffs.length > 0) {
        diffs.push({
          type: 'json',
          url,
          fieldDiffs,
          summary: {
            totalFields: this.countJSONFields(baselineResponse?.data || candidateResponse?.data || {}),
            matchedFields: this.countJSONFields(baselineResponse?.data || candidateResponse?.data || {}) - fieldDiffs.length,
            mismatchedFields: fieldDiffs.filter((f) => f.status === 'mismatch').length,
            missingInBaseline: fieldDiffs.filter((f) => f.status === 'missing_baseline').length,
            missingInCandidate: fieldDiffs.filter((f) => f.status === 'missing_candidate').length,
            changedFields: fieldDiffs.filter((f) => f.status === 'changed').length,
          },
        });
      }
    }

    return diffs;
  }

  /**
   * Deep compare JSON objects
   */
  private compareJSONObjects(baseline: any, candidate: any, basePath: string): FieldDiff[] {
    const diffs: FieldDiff[] = [];

    if (typeof baseline !== typeof candidate) {
      diffs.push({
        field: basePath,
        path: basePath,
        status: 'mismatch',
        baselineValue: baseline,
        candidateValue: candidate,
        difference: `Type mismatch: ${typeof baseline} vs ${typeof candidate}`,
      });
      return diffs;
    }

    if (baseline === null || candidate === null || typeof baseline !== 'object') {
      if (baseline !== candidate) {
        diffs.push({
          field: basePath.split('.').pop() || basePath,
          path: basePath,
          status: 'changed',
          baselineValue: baseline,
          candidateValue: candidate,
        });
      }
      return diffs;
    }

    if (Array.isArray(baseline) && Array.isArray(candidate)) {
      const maxLength = Math.max(baseline.length, candidate.length);
      for (let i = 0; i < maxLength; i++) {
        const itemDiffs = this.compareJSONObjects(
          baseline[i],
          candidate[i],
          `${basePath}[${i}]`
        );
        diffs.push(...itemDiffs);
      }
      return diffs;
    }

    // Compare object properties
    const allKeys = new Set([...Object.keys(baseline), ...Object.keys(candidate)]);

    for (const key of allKeys) {
      const path = basePath === '' ? key : `${basePath}.${key}`;
      const baselineValue = baseline[key];
      const candidateValue = candidate[key];

      if (!(key in baseline) && key in candidate) {
        diffs.push({
          field: key,
          path,
          status: 'missing_baseline',
          candidateValue,
        });
      } else if (key in baseline && !(key in candidate)) {
        diffs.push({
          field: key,
          path,
          status: 'missing_candidate',
          baselineValue,
        });
      } else {
        const nestedDiffs = this.compareJSONObjects(baselineValue, candidateValue, path);
        diffs.push(...nestedDiffs);
      }
    }

    return diffs;
  }

  /**
   * Count fields in JSON object
   */
  private countJSONFields(obj: any): number {
    if (obj === null || typeof obj !== 'object') {
      return 1;
    }

    if (Array.isArray(obj)) {
      return obj.reduce((sum, item) => sum + this.countJSONFields(item), 0);
    }

    return Object.keys(obj).reduce((sum, key) => sum + this.countJSONFields(obj[key]), 0);
  }

  /**
   * Execute data integrity check on execution results
   */
  async executeDataIntegrityCheck(
    executionResult: ExecutionResult,
    runId: string
  ): Promise<DataIntegrityResult> {
    const pageResults: PageDataIntegrityResult[] = [];

    // We need to re-navigate to pages to extract data
    // For now, we'll work with the DOM snapshots if available
    // In a full implementation, you'd use browser contexts

    // Match pages by normalized path
    const baselinePagesByPath = new Map<string, PageExecutionResult>();
    const candidatePagesByPath = new Map<string, PageExecutionResult>();

    for (const page of executionResult.baseline.pages) {
      baselinePagesByPath.set(page.normalizedPath, page);
    }

    for (const page of executionResult.candidate.pages) {
      candidatePagesByPath.set(page.normalizedPath, page);
    }

    // Process each matched page
    for (const matchedPage of executionResult.matchedPages) {
      const baselinePage = baselinePagesByPath.get(matchedPage.baseline.normalizedPath);
      const candidatePage = candidatePagesByPath.get(matchedPage.candidate.normalizedPath);

      if (!baselinePage || !candidatePage) {
        continue;
      }

      // Extract text content from DOM snapshots
      const baselineText: TextContent = {
        url: baselinePage.url,
        normalizedPath: baselinePage.normalizedPath,
        visibleText: baselinePage.domSnapshots[0]?.textContent || '',
        headings: [],
        paragraphs: [],
        links: [],
        metadata: {},
      };

      const candidateText: TextContent = {
        url: candidatePage.url,
        normalizedPath: candidatePage.normalizedPath,
        visibleText: candidatePage.domSnapshots[0]?.textContent || '',
        headings: [],
        paragraphs: [],
        links: [],
        metadata: {},
      };

      // Compare text content
      const textDiff = this.compareTextContent(baselineText, candidateText);

      // For tables, pricing, and APIs, we'd need to re-navigate or parse DOM
      // This is a simplified version - in production, you'd use browser contexts

      const pageResult: PageDataIntegrityResult = {
        url: baselinePage.url,
        normalizedPath: baselinePage.normalizedPath,
        baselineText,
        candidateText,
        textDiff,
        tables: {
          baseline: [],
          candidate: [],
          diffs: [],
        },
        pricing: {
          baseline: [],
          candidate: [],
          diffs: [],
        },
        apiResponses: {
          baseline: [],
          candidate: [],
          diffs: [],
        },
        overallStatus: textDiff.similarity > 0.9 ? 'match' : textDiff.similarity > 0.5 ? 'partial' : 'mismatch',
      };

      pageResults.push(pageResult);
    }

    // Generate summary
    const summary = {
      totalPages: pageResults.length,
      pagesWithMismatches: pageResults.filter((p) => p.overallStatus === 'mismatch').length,
      pagesWithMissingData: pageResults.filter((p) => 
        p.tables.diffs.some((d) => d.summary.missingInBaseline > 0 || d.summary.missingInCandidate > 0) ||
        p.pricing.diffs.some((d) => d.summary.missingInBaseline > 0 || d.summary.missingInCandidate > 0) ||
        p.apiResponses.diffs.some((d) => d.summary.missingInBaseline > 0 || d.summary.missingInCandidate > 0)
      ).length,
      totalFieldDiffs: pageResults.reduce((sum, p) => 
        sum + p.tables.diffs.reduce((s, d) => s + d.fieldDiffs.length, 0) +
        p.pricing.diffs.reduce((s, d) => s + d.fieldDiffs.length, 0) +
        p.apiResponses.diffs.reduce((s, d) => s + d.fieldDiffs.length, 0),
        0
      ),
      criticalMismatches: pageResults.filter((p) => p.overallStatus === 'mismatch').length,
    };

    // Save results
    const resultsPath = path.join(this.artifactsDir, runId, 'data-integrity-results.json');
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });

    const result: DataIntegrityResult = {
      pages: pageResults,
      summary,
      artifactPaths: [resultsPath],
    };

    await fs.writeFile(resultsPath, JSON.stringify(result, null, 2));

    return result;
  }

  /**
   * Execute data integrity check with browser contexts
   */
  async executeDataIntegrityCheckWithContexts(
    baselineContext: BrowserContext,
    candidateContext: BrowserContext,
    matchedPages: MatchedPage[],
    baselineUrl: string,
    candidateUrl: string,
    runId: string
  ): Promise<DataIntegrityResult> {
    const pageResults: PageDataIntegrityResult[] = [];

    for (const matchedPage of matchedPages) {
      // Extract from baseline
      const baselinePage = await baselineContext.newPage();
      let baselineText: TextContent;
      let baselineTables: TableData[] = [];
      let baselinePricing: PricingData[] = [];
      let baselineAPIs: APIResponse[] = [];

      try {
        await baselinePage.goto(matchedPage.baseline.url, { waitUntil: 'networkidle' });
        baselineText = await this.extractTextContent(baselinePage, matchedPage.baseline.url, matchedPage.baseline.normalizedPath);
        baselineTables = await this.extractTables(baselinePage);
        baselinePricing = await this.extractPricing(baselinePage);
        baselineAPIs = await this.extractAPIResponses(baselinePage, baselineUrl);
      } finally {
        await baselinePage.close();
      }

      // Extract from candidate
      const candidatePage = await candidateContext.newPage();
      let candidateText: TextContent;
      let candidateTables: TableData[] = [];
      let candidatePricing: PricingData[] = [];
      let candidateAPIs: APIResponse[] = [];

      try {
        await candidatePage.goto(matchedPage.candidate.url, { waitUntil: 'networkidle' });
        candidateText = await this.extractTextContent(candidatePage, matchedPage.candidate.url, matchedPage.candidate.normalizedPath);
        candidateTables = await this.extractTables(candidatePage);
        candidatePricing = await this.extractPricing(candidatePage);
        candidateAPIs = await this.extractAPIResponses(candidatePage, candidateUrl);
      } finally {
        await candidatePage.close();
      }

      // Compare
      const textDiff = this.compareTextContent(baselineText, candidateText);
      const tableDiffs = this.compareTables(baselineTables, candidateTables);
      const pricingDiffs = this.comparePricing(baselinePricing, candidatePricing);
      const apiDiffs = this.compareJSONResponses(baselineAPIs, candidateAPIs);

      const overallStatus = 
        textDiff.similarity > 0.9 && tableDiffs.length === 0 && pricingDiffs.length === 0 && apiDiffs.length === 0
          ? 'match'
          : textDiff.similarity > 0.5 && tableDiffs.length === 0 && pricingDiffs.length === 0
          ? 'partial'
          : 'mismatch';

      pageResults.push({
        url: baselineText.url,
        normalizedPath: baselineText.normalizedPath,
        baselineText,
        candidateText,
        textDiff,
        tables: {
          baseline: baselineTables,
          candidate: candidateTables,
          diffs: tableDiffs,
        },
        pricing: {
          baseline: baselinePricing,
          candidate: candidatePricing,
          diffs: pricingDiffs,
        },
        apiResponses: {
          baseline: baselineAPIs,
          candidate: candidateAPIs,
          diffs: apiDiffs,
        },
        overallStatus,
      });
    }

    // Generate summary
    const summary = {
      totalPages: pageResults.length,
      pagesWithMismatches: pageResults.filter((p) => p.overallStatus === 'mismatch').length,
      pagesWithMissingData: pageResults.filter((p) => 
        p.tables.diffs.some((d) => d.summary.missingInBaseline > 0 || d.summary.missingInCandidate > 0) ||
        p.pricing.diffs.some((d) => d.summary.missingInBaseline > 0 || d.summary.missingInCandidate > 0) ||
        p.apiResponses.diffs.some((d) => d.summary.missingInBaseline > 0 || d.summary.missingInCandidate > 0)
      ).length,
      totalFieldDiffs: pageResults.reduce((sum, p) => 
        sum + p.tables.diffs.reduce((s, d) => s + d.fieldDiffs.length, 0) +
        p.pricing.diffs.reduce((s, d) => s + d.fieldDiffs.length, 0) +
        p.apiResponses.diffs.reduce((s, d) => s + d.fieldDiffs.length, 0),
        0
      ),
      criticalMismatches: pageResults.filter((p) => p.overallStatus === 'mismatch').length,
    };

    // Save results
    const resultsPath = path.join(this.artifactsDir, runId, 'data-integrity-results.json');
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });

    const result: DataIntegrityResult = {
      pages: pageResults,
      summary,
      artifactPaths: [resultsPath],
    };

    await fs.writeFile(resultsPath, JSON.stringify(result, null, 2));

    return result;
  }
}

