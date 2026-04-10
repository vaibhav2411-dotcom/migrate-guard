import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR, config } from '../config/config';
import { VisualDiffResult } from './visualDiffService';
import { FunctionalQAResult } from './functionalQaAgent';
import { DataIntegrityResult } from './dataIntegrityAgent';

/**
 * Severity levels for AI analysis
 */
export type AISeverity = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * AI reasoning result for a specific category
 */
export interface CategoryAnalysis {
  category: 'visual' | 'functional' | 'data' | 'seo' | 'security';
  severity: AISeverity;
  confidence: number; // 0-1
  explanation: string;
  pass: boolean;
  falsePositives: string[]; // Identified false positives
  expectedChanges: string[]; // Identified expected changes
  keyFindings: string[];
}

/**
 * Complete AI reasoning result
 */
export interface AIReasoningResult {
  overallSeverity: AISeverity;
  overallConfidence: number;
  overallPass: boolean;
  overallExplanation: string;
  categoryAnalyses: CategoryAnalysis[];
  falsePositives: string[];
  expectedChanges: string[];
  recommendations: string[];
  artifactPaths: string[];
  // Governance metadata
  aiMode?: 'ON' | 'OFF';
  aiAvailable?: boolean;
  aiDegraded?: boolean;
}

/**
 * Artifact summary for AI analysis
 */
interface ArtifactSummary {
  visual?: {
    totalPages: number;
    pagesWithDiffs: number;
    criticalIssues: number;
    highIssues: number;
    averageDiffPercentage: number;
  };
  functional?: {
    totalPages: number;
    pagesWithNavigationIssues: number;
    totalBrokenLinks: number;
    totalJSErrors: number;
    baselineBrokenLinks: number;
    candidateBrokenLinks: number;
    baselineJSErrors: number;
    candidateJSErrors: number;
    baselinePagesWithNavigationIssues: number;
    candidatePagesWithNavigationIssues: number;
  };
  data?: {
    totalPages: number;
    pagesWithMismatches: number;
    totalFieldDiffs: number;
    criticalMismatches: number;
  };
  seo?: {
    // SEO data would come from future SEO agent
    [key: string]: any;
  };
}

/**
 * AiReasoningService - Uses Azure OpenAI to analyze test artifacts
 * Provides severity classification, confidence scoring, and recommendations
 */
export class AiReasoningService {
  private client: OpenAI | null = null;
  private readonly artifactsDir: string;
  private readonly deploymentName: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly useAzure: boolean;
  private readonly modelName: string;

  constructor() {
  
  
  
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    this.apiKey = process.env.AZURE_OPENAI_API_KEY || '';
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';
    // Support both Azure OpenAI and generic OpenAI-compatible endpoints
    const genericBase = process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || '';
    const genericKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
    this.useAzure = !!(this.endpoint && this.apiKey);
    this.modelName = process.env.AI_MODEL || this.deploymentName || 'gpt-4';

    if (this.useAzure) {
      // Azure OpenAI: deployment path is used in the baseURL
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: `${this.endpoint}/openai/deployments/${this.deploymentName}`,
        defaultQuery: { 'api-version': '2024-02-15-preview' },
        defaultHeaders: {
          'api-key': this.apiKey,
        },
      });
    } else if (genericBase && genericKey) {
      // Generic OpenAI-compatible endpoint
      this.client = new OpenAI({
        apiKey: genericKey,
        baseURL: genericBase,
      });
      this.apiKey = genericKey;
    } else if (!this.endpoint && !genericBase && !this.apiKey && !genericKey) {
      // no-op; client remains null and fallback analysis will be used
    }
  }

  /**
   * Log AI usage (tokens) per run. Aggregates counts per endpoint.
   */
  private async logAiUsage(runId: string, endpoint: string, inputTokens: number, outputTokens: number) {
    try {
      const file = path.join(DATA_DIR, 'artifacts', runId, 'ai-usage.json');
      await fs.mkdir(path.dirname(file), { recursive: true });
      let arr: any[] = [];
      try {
        const existing = await fs.readFile(file, 'utf8');
        arr = JSON.parse(existing) as any[];
      } catch {
        arr = [];
      }

      const found = arr.find((e) => e.endpoint === endpoint);
      if (found) {
        found.inputTokens = (found.inputTokens || 0) + (inputTokens || 0);
        found.outputTokens = (found.outputTokens || 0) + (outputTokens || 0);
        found.callCount = (found.callCount || 0) + 1;
      } else {
        arr.push({ endpoint, inputTokens: inputTokens || 0, outputTokens: outputTokens || 0, callCount: 1 });
      }

      await fs.writeFile(file, JSON.stringify(arr, null, 2));
    } catch (e) {
      console.error('Failed to log AI usage:', e);
    }
  }

  /**
   * Wrapper for chat completion that records usage and returns the raw response.
   */
  private async callChatCompletion(params: any, endpointName: string, runId: string) {
    if (!this.client) throw new Error('AI client not configured');
    const resp: any = await this.client!.chat.completions.create(params);
    // Attempt to read usage tokens
    try {
      const usage = resp?.usage || resp?.raw?.usage || null;
      const inputTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
      const outputTokens = usage?.total_tokens ?? usage?.completion_tokens ?? 0;
      await this.logAiUsage(runId, endpointName, inputTokens, outputTokens);
    } catch (e) {
      // swallow logging errors
    }
    return resp;
  }

  /**
   * Prepare image for vision calls: resize to max width 1024 and JPEG 75 if `sharp` is available.
   * Returns path to prepared image and detail level 'low'.
   */
  private async prepareImageForVision(imagePath: string): Promise<{ path: string; detail: string }> {
    try {
      // dynamic require to avoid optional dependency at runtime
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
      const sharp = require('sharp');
      const img = sharp(imagePath);
      const metadata = await img.metadata();
      if ((metadata.width || 0) > 1024) {
        const out = imagePath + '.resized.jpg';
        await img.resize({ width: 1024 }).jpeg({ quality: 75 }).toFile(out);
        return { path: out, detail: 'low' };
      }
      // Convert to jpeg with quality if not jpeg
      const ext = path.extname(imagePath).toLowerCase();
      if (ext !== '.jpg' && ext !== '.jpeg') {
        const out = imagePath + '.jpg';
        await img.jpeg({ quality: 75 }).toFile(out);
        return { path: out, detail: 'low' };
      }
      return { path: imagePath, detail: 'low' };
    } catch (e) {
      // sharp not available or error: fallback to original image and low detail
      return { path: imagePath, detail: 'low' };
    }
  }

  /**
   * Extract textual content from a model response across different provider shapes.
   * Supports: OpenAI-style choices->message.content, legacy choices->text,
   * response.output_text, response.output[0].content, and others.
   */
  private extractResponseContent(response: any): string | null {
    try {
      // OpenAI-style chat completion: choices[0].message.content
      const c1 = response?.choices?.[0]?.message?.content;
      if (typeof c1 === 'string' && c1.trim()) return c1.trim();

      // Some providers return choices[0].text
      const c2 = response?.choices?.[0]?.text;
      if (typeof c2 === 'string' && c2.trim()) return c2.trim();

      // Some newer models return output_text
      const c3 = response?.output_text;
      if (typeof c3 === 'string' && c3.trim()) return c3.trim();

      // Anthropic/structured: output[0]?.content?.[0]?.text or output[0]?.content
      const out = response?.output ?? response?.outputs ?? null;
      if (Array.isArray(out) && out.length > 0) {
        const first = out[0];
        if (typeof first === 'string' && first.trim()) return first.trim();
        const maybe = first?.content ?? first?.text ?? first?.message;
        if (typeof maybe === 'string' && maybe.trim()) return maybe.trim();
        // nested content array
        const nested = Array.isArray(first?.content) ? first.content.map((p: any) => p?.text || p).join('\n') : null;
        if (nested) return nested;
      }

      // As a final fallback stringify the whole response
      const asString = typeof response === 'string' ? response : JSON.stringify(response);
      return asString;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if Azure OpenAI is configured
   */
  isConfigured(): boolean {
    return this.client !== null && (this.useAzure || this.apiKey !== '');
  }

  /**
   * Determine whether AI should be used for a run.
   * Respects (in order): explicit per-run setting, environment override, and global feature flag.
   * Default: OFF unless explicitly enabled by one of these.
   */
  shouldUseAI(runSettings?: { useAI?: boolean } | null): boolean {
    // Per-run toggle has highest precedence when explicitly set
    if (runSettings && runSettings.useAI === false) return false;
    if (runSettings && runSettings.useAI === true) return true;

    // Environment override
    if (process.env.ENABLE_AI_REASONING === 'true') return true;
    if (process.env.ENABLE_AI_REASONING === 'false') return false;

    // Global config flag
    if (config?.features?.aiReasoning !== true) return false;

    // Only run when client/configuration is actually available.
    return this.isConfigured();
  }

  /**
   * Normalize functional metrics for summary and fallback analysis.
   */
  private getFunctionalMetrics(functionalQaResult: FunctionalQAResult) {
    const baseline = functionalQaResult.baseline.summary;
    const candidate = functionalQaResult.candidate.summary;

    return {
      totalPages: Math.max(baseline.totalPages, candidate.totalPages),
      baselineBrokenLinks: baseline.totalBrokenLinks,
      candidateBrokenLinks: candidate.totalBrokenLinks,
      baselineJSErrors: baseline.totalJSErrors,
      candidateJSErrors: candidate.totalJSErrors,
      baselinePagesWithNavigationIssues: baseline.pagesWithNavigationIssues,
      candidatePagesWithNavigationIssues: candidate.pagesWithNavigationIssues,
      totalBrokenLinks: baseline.totalBrokenLinks + candidate.totalBrokenLinks,
      totalJSErrors: baseline.totalJSErrors + candidate.totalJSErrors,
      pagesWithNavigationIssues: baseline.pagesWithNavigationIssues + candidate.pagesWithNavigationIssues,
    };
  }

  /**
   * Summarize artifacts for AI analysis
   */
  private summarizeArtifacts(
    visualDiffResult?: VisualDiffResult,
    functionalQaResult?: FunctionalQAResult,
    dataIntegrityResult?: DataIntegrityResult,
    securityResults?: any[]
  ): ArtifactSummary {
    const summary: ArtifactSummary = {};

    if (visualDiffResult) {
      summary.visual = {
        totalPages: visualDiffResult.summary.totalPages,
        pagesWithDiffs: visualDiffResult.summary.pagesWithDiffs,
        criticalIssues: visualDiffResult.summary.criticalIssues,
        highIssues: visualDiffResult.summary.highIssues,
        averageDiffPercentage: visualDiffResult.summary.averageDiffPercentage,
      };
    }

    if (functionalQaResult) {
      const functionalMetrics = this.getFunctionalMetrics(functionalQaResult);
      summary.functional = {
        totalPages: functionalMetrics.totalPages,
        pagesWithNavigationIssues: functionalMetrics.pagesWithNavigationIssues,
        totalBrokenLinks: functionalMetrics.totalBrokenLinks,
        totalJSErrors: functionalMetrics.totalJSErrors,
        baselineBrokenLinks: functionalMetrics.baselineBrokenLinks,
        candidateBrokenLinks: functionalMetrics.candidateBrokenLinks,
        baselineJSErrors: functionalMetrics.baselineJSErrors,
        candidateJSErrors: functionalMetrics.candidateJSErrors,
        baselinePagesWithNavigationIssues: functionalMetrics.baselinePagesWithNavigationIssues,
        candidatePagesWithNavigationIssues: functionalMetrics.candidatePagesWithNavigationIssues,
      };
    }

    if (dataIntegrityResult) {
      summary.data = {
        totalPages: dataIntegrityResult.summary.totalPages,
        pagesWithMismatches: dataIntegrityResult.summary.pagesWithMismatches,
        totalFieldDiffs: dataIntegrityResult.summary.totalFieldDiffs,
        criticalMismatches: dataIntegrityResult.summary.criticalMismatches,
      };
    }

    if (securityResults && Array.isArray(securityResults)) {
      summary.security = {
        totalPages: securityResults.length,
        pagesWithIssues: securityResults.filter((s:any)=> (s.issues||[]).length>0).length,
        totalIssues: securityResults.reduce((acc:any, s:any)=> acc + ((s.issues||[]).length), 0),
      } as any;
    }

    return summary;
  }

  /**
   * Analyze artifacts using Azure OpenAI
   */
  async analyzeArtifacts(
    visualDiffResult: VisualDiffResult | undefined,
    functionalQaResult: FunctionalQAResult | undefined,
    dataIntegrityResult: DataIntegrityResult | undefined,
    runId: string,
    seoResults?: any[],
    perfResults?: any[],
    securityResults?: any[],
    runSettings?: { useAI?: boolean }
  ): Promise<AIReasoningResult> {
    // Honor governance: do not call AI unless explicitly enabled
    if (!this.shouldUseAI(runSettings) || !this.isConfigured()) {
      // Fallback: Generate basic analysis without AI (include security results if present)
      const fallback = this.generateFallbackAnalysis(visualDiffResult, functionalQaResult, dataIntegrityResult, securityResults, runId);
      // Annotate fallback with AI metadata
      (fallback as any).aiMode = this.shouldUseAI(runSettings) ? 'ON' : 'OFF';
      (fallback as any).aiAvailable = this.isConfigured();
      (fallback as any).aiDegraded = false;
      return fallback;
    }

    const artifactSummary = this.summarizeArtifacts(visualDiffResult, functionalQaResult, dataIntegrityResult, securityResults);

    // Cost-control: skip sending visual analysis details if average diff percentage is below threshold
    const aiVisualThreshold = (config && config.comparison && config.comparison.aiVisualThreshold) || 0.5;
    if (visualDiffResult && artifactSummary.visual && artifactSummary.visual.averageDiffPercentage <= aiVisualThreshold) {
      // remove visual details to avoid triggering vision-related AI work
      delete (artifactSummary as any).visual;
    }

    // Build prompt for AI analysis
    const prompt = this.buildAnalysisPrompt(artifactSummary);

    try {
      // Build messages
      const messages = [
        {
          role: 'system',
          content: `You are an expert QA analyst specializing in website migration testing. Your role is to analyze test results and provide:\n1. Severity classification (none, low, medium, high, critical)\n2. Confidence scores (0-1)\n3. Clear explanations\n4. Pass/Fail recommendations\n5. Identification of false positives (cosmetic changes, expected updates)\n6. Identification of expected changes (intentional migrations)\n\nYou must be conservative and only flag real issues. Ignore:\n- Minor visual differences (< 1% pixel diff)\n- Expected content updates\n- Non-critical console warnings\n- External link failures (if not critical)\n- Minor layout shifts that don't affect functionality`,
        },
        { role: 'user', content: prompt },
      ];

      const params: any = {
        model: this.modelName,
        messages,
        temperature: 0.3,
      };

      // Note: avoid Azure-only `response_format` param to remain compatible with generic endpoints
      // Some models (or providers) return different shapes. Be resilient.
      // For newer models like gpt-5-mini, allow both `messages` and `input`.
      if ((this.modelName || '').toLowerCase().includes('gpt-5')) {
        // gpt-5-mini may prefer 'input' as a top-level value in some endpoints
        // Provide both to maximize compatibility.
        (params as any).input = messages.map((m: any) => `${m.role}: ${m.content}`).join('\n\n');
      }

      const completionPromise = this.callChatCompletion(params, 'analyzeArtifacts', runId);

      // Prevent long-hanging runs if upstream LLM endpoint is slow/unreachable.
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI analysis timed out after 60 seconds')), 60000);
      });

      const response = await Promise.race([completionPromise, timeoutPromise]);

      const aiResponse = this.extractResponseContent(response) || '';
      const parsed = await this.parseAIResponse(aiResponse, artifactSummary, runId);
      // Annotate AI metadata
      parsed.aiMode = 'ON';
      parsed.aiAvailable = true;
      parsed.aiDegraded = false;
      return parsed;
    } catch (error) {
      console.error('Azure OpenAI error:', error);
      // Fallback to rule-based analysis
      const fb = this.generateFallbackAnalysis(visualDiffResult, functionalQaResult, dataIntegrityResult, securityResults, runId);
      (fb as any).aiMode = 'ON';
      (fb as any).aiAvailable = this.isConfigured();
      (fb as any).aiDegraded = true;
      return fb;
    }
  }

  /**
   * Build analysis prompt from artifact summary
   */
  private buildAnalysisPrompt(summary: ArtifactSummary): string {
    let prompt = 'Analyze the following website migration test results:\n\n';

    if (summary.visual) {
      prompt += `VISUAL DIFFERENCES:\n`;
      prompt += `- Total pages tested: ${summary.visual.totalPages}\n`;
      prompt += `- Pages with differences: ${summary.visual.pagesWithDiffs}\n`;
      prompt += `- Critical issues: ${summary.visual.criticalIssues}\n`;
      prompt += `- High severity issues: ${summary.visual.highIssues}\n`;
      prompt += `- Average diff percentage: ${summary.visual.averageDiffPercentage.toFixed(2)}%\n\n`;
    }

    if (summary.functional) {
      prompt += `FUNCTIONAL ISSUES:\n`;
      prompt += `- Total pages tested: ${summary.functional.totalPages}\n`;
      prompt += `- Pages with navigation issues: ${summary.functional.pagesWithNavigationIssues}\n`;
      prompt += `- Total broken links: ${summary.functional.totalBrokenLinks}\n`;
      prompt += `- Total JavaScript errors: ${summary.functional.totalJSErrors}\n\n`;
      prompt += `- Baseline broken links: ${summary.functional.baselineBrokenLinks}\n`;
      prompt += `- Candidate broken links: ${summary.functional.candidateBrokenLinks}\n`;
      prompt += `- Baseline JavaScript errors: ${summary.functional.baselineJSErrors}\n`;
      prompt += `- Candidate JavaScript errors: ${summary.functional.candidateJSErrors}\n`;
      prompt += `- Baseline pages with navigation issues: ${summary.functional.baselinePagesWithNavigationIssues}\n`;
      prompt += `- Candidate pages with navigation issues: ${summary.functional.candidatePagesWithNavigationIssues}\n\n`;
    }

    if (summary.data) {
      prompt += `DATA INTEGRITY:\n`;
      prompt += `- Total pages tested: ${summary.data.totalPages}\n`;
      prompt += `- Pages with mismatches: ${summary.data.pagesWithMismatches}\n`;
      prompt += `- Total field differences: ${summary.data.totalFieldDiffs}\n`;
      prompt += `- Critical mismatches: ${summary.data.criticalMismatches}\n\n`;
    }

    prompt += `Provide your analysis in the following JSON format:
{
  "overallSeverity": "none|low|medium|high|critical",
  "overallConfidence": 0.0-1.0,
  "overallPass": true|false,
  "overallExplanation": "Brief explanation",
  "categoryAnalyses": [
    {
      "category": "visual|functional|data|seo",
      "severity": "none|low|medium|high|critical",
      "confidence": 0.0-1.0,
      "explanation": "Detailed explanation",
      "pass": true|false,
      "falsePositives": ["list of false positives"],
      "expectedChanges": ["list of expected changes"],
      "keyFindings": ["key findings"]
    }
  ],
  "falsePositives": ["overall false positives"],
  "expectedChanges": ["overall expected changes"],
  "recommendations": ["actionable recommendations"]
}`;

    return prompt;
  }

  /**
   * Parse AI response into structured result
   */
  private async parseAIResponse(
    aiResponse: string,
    summary: ArtifactSummary,
    runId: string
  ): Promise<AIReasoningResult> {
    try {
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          overallSeverity: parsed.overallSeverity || 'medium',
          overallConfidence: parsed.overallConfidence || 0.5,
          overallPass: parsed.overallPass ?? true,
          overallExplanation: parsed.overallExplanation || 'AI analysis completed',
          categoryAnalyses: parsed.categoryAnalyses || [],
          falsePositives: parsed.falsePositives || [],
          expectedChanges: parsed.expectedChanges || [],
          recommendations: parsed.recommendations || [],
          artifactPaths: [],
        };
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
    }

    // Fallback if JSON parsing fails
    return this.generateFallbackAnalysis(
      summary.visual ? { summary: summary.visual } as any : undefined,
      summary.functional ? { baseline: { summary: summary.functional }, candidate: { summary: summary.functional } } as any : undefined,
      summary.data ? { summary: summary.data } as any : undefined,
      undefined,
      runId
    );
  }

  /**
   * Generate fallback analysis without AI
   */
  private generateFallbackAnalysis(
    visualDiffResult?: VisualDiffResult,
    functionalQaResult?: FunctionalQAResult,
    dataIntegrityResult?: DataIntegrityResult,
    securityResults?: any[],
    runId?: string
  ): AIReasoningResult {
    const categoryAnalyses: CategoryAnalysis[] = [];
    let overallSeverity: AISeverity = 'none';
    let overallPass = true;

    // Analyze visual
    if (visualDiffResult) {
      const visualSeverity = this.calculateSeverityFromVisual(visualDiffResult);
      categoryAnalyses.push({
        category: 'visual',
        severity: visualSeverity,
        confidence: 0.8,
        explanation: `Visual differences found: ${visualDiffResult.summary.pagesWithDiffs} pages with differences, ${visualDiffResult.summary.criticalIssues} critical issues`,
        pass: visualSeverity === 'none' || visualSeverity === 'low',
        falsePositives: [],
        expectedChanges: [],
        keyFindings: [
          `${visualDiffResult.summary.pagesWithDiffs} pages have visual differences`,
          `Average diff percentage: ${visualDiffResult.summary.averageDiffPercentage.toFixed(2)}%`,
        ],
      });
      if (this.severityToNumber(visualSeverity) > this.severityToNumber(overallSeverity)) {
        overallSeverity = visualSeverity;
      }
      if (visualSeverity === 'high' || visualSeverity === 'critical') {
        overallPass = false;
      }
    }

    // Analyze functional
    if (functionalQaResult) {
      const functionalMetrics = this.getFunctionalMetrics(functionalQaResult);
      const functionalSeverity = this.calculateSeverityFromFunctional(functionalQaResult);
      categoryAnalyses.push({
        category: 'functional',
        severity: functionalSeverity,
        confidence: 0.8,
        explanation: `Candidate issues: ${functionalMetrics.candidateBrokenLinks} broken links, ${functionalMetrics.candidateJSErrors} JavaScript errors. Baseline reference: ${functionalMetrics.baselineBrokenLinks} broken links, ${functionalMetrics.baselineJSErrors} JavaScript errors.`,
        pass: functionalSeverity === 'none' || functionalSeverity === 'low',
        falsePositives: [],
        expectedChanges: [],
        keyFindings: [
          `Candidate: ${functionalMetrics.candidateBrokenLinks} broken links detected`,
          `Candidate: ${functionalMetrics.candidateJSErrors} JavaScript errors found`,
          `Baseline reference: ${functionalMetrics.baselineBrokenLinks} broken links, ${functionalMetrics.baselineJSErrors} JavaScript errors`,
        ],
      });
      if (this.severityToNumber(functionalSeverity) > this.severityToNumber(overallSeverity)) {
        overallSeverity = functionalSeverity;
      }
      if (functionalSeverity === 'high' || functionalSeverity === 'critical') {
        overallPass = false;
      }
    }

    // Analyze data
    if (dataIntegrityResult) {
      const dataSeverity = this.calculateSeverityFromData(dataIntegrityResult);
      categoryAnalyses.push({
        category: 'data',
        severity: dataSeverity,
        confidence: 0.8,
        explanation: `Data integrity issues: ${dataIntegrityResult.summary.pagesWithMismatches} pages with mismatches, ${dataIntegrityResult.summary.totalFieldDiffs} field differences`,
        pass: dataSeverity === 'none' || dataSeverity === 'low',
        falsePositives: [],
        expectedChanges: [],
        keyFindings: [
          `${dataIntegrityResult.summary.pagesWithMismatches} pages have data mismatches`,
          `${dataIntegrityResult.summary.totalFieldDiffs} field differences detected`,
        ],
      });
      if (this.severityToNumber(dataSeverity) > this.severityToNumber(overallSeverity)) {
        overallSeverity = dataSeverity;
      }
      if (dataSeverity === 'high' || dataSeverity === 'critical') {
        overallPass = false;
      }
    }

    // Analyze security
    if (securityResults && Array.isArray(securityResults) && securityResults.length > 0) {
      // severity from collected security pages
      const secSeverity = this.calculateSeverityFromSecurity(securityResults);
      categoryAnalyses.push({
        category: 'security',
        severity: secSeverity,
        confidence: 0.8,
        explanation: `Security issues detected on ${securityResults.filter((s:any)=> (s.issues||[]).length>0).length} pages`,
        pass: secSeverity === 'none' || secSeverity === 'low',
        falsePositives: [],
        expectedChanges: [],
        keyFindings: [`${securityResults.filter((s:any)=> (s.issues||[]).length>0).length} pages with security issues`],
      });
      if (this.severityToNumber(secSeverity) > this.severityToNumber(overallSeverity)) {
        overallSeverity = secSeverity;
      }
      if (secSeverity === 'high' || secSeverity === 'critical') {
        overallPass = false;
      }
    }

    return {
      overallSeverity,
      overallConfidence: 0.7,
      overallPass,
      overallExplanation: `Analysis completed: ${categoryAnalyses.length} categories analyzed`,
      categoryAnalyses,
      falsePositives: [],
      expectedChanges: [],
      recommendations: this.generateRecommendations(categoryAnalyses),
      artifactPaths: [],
    };
  }

  /**
   * Calculate severity from visual diff results
   */
  private calculateSeverityFromVisual(result: VisualDiffResult): AISeverity {
    if (result.summary.criticalIssues > 0) return 'critical';
    if (result.summary.highIssues > 0) return 'high';
    if (result.summary.averageDiffPercentage > 5) return 'medium';
    if (result.summary.averageDiffPercentage > 1) return 'low';
    return 'none';
  }

  /**
   * Calculate severity from functional QA results
   */
  private calculateSeverityFromFunctional(result: FunctionalQAResult): AISeverity {
    const candidateSummary = result.candidate.summary;
    const totalIssues = candidateSummary.totalBrokenLinks + candidateSummary.totalJSErrors;
    if (totalIssues > 20) return 'critical';
    if (totalIssues > 10) return 'high';
    if (totalIssues > 5) return 'medium';
    if (totalIssues > 0) return 'low';
    return 'none';
  }

  /**
   * Calculate severity from data integrity results
   */
  private calculateSeverityFromData(result: DataIntegrityResult): AISeverity {
    if (result.summary.criticalMismatches > 0) return 'critical';
    if (result.summary.totalFieldDiffs > 50) return 'high';
    if (result.summary.totalFieldDiffs > 20) return 'medium';
    if (result.summary.totalFieldDiffs > 0) return 'low';
    return 'none';
  }

  /**
   * Calculate severity from security results
   */
  private calculateSeverityFromSecurity(results: any[]): AISeverity {
    // If any page has a critical issue, treat as critical
    const pagesWithCritical = results.filter((r:any) => (r.issues||[]).some((i:any)=> i.severity === 'critical')).length;
    if (pagesWithCritical > 0) return 'critical';
    const pagesWithFail = results.filter((r:any) => (r.issues||[]).some((i:any)=> i.severity === 'fail')).length;
    if (pagesWithFail > 2) return 'high';
    if (results.reduce((acc:any, r:any)=> acc + ((r.issues||[]).length), 0) > 5) return 'medium';
    if (results.reduce((acc:any, r:any)=> acc + ((r.issues||[]).length), 0) > 0) return 'low';
    return 'none';
  }

  /**
   * Convert severity to number for comparison
   */
  private severityToNumber(severity: AISeverity): number {
    const map: Record<AISeverity, number> = {
      none: 0,
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return map[severity];
  }

  /**
   * Generate recommendations from category analyses
   */
  private generateRecommendations(analyses: CategoryAnalysis[]): string[] {
    const recommendations: string[] = [];

    for (const analysis of analyses) {
      if (!analysis.pass) {
        if (analysis.category === 'visual') {
          recommendations.push(`Review visual differences: ${analysis.explanation}`);
        } else if (analysis.category === 'functional') {
          recommendations.push(`Fix functional issues: ${analysis.explanation}`);
        } else if (analysis.category === 'data') {
          recommendations.push(`Resolve data integrity issues: ${analysis.explanation}`);
        }
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('No critical issues found. Migration appears ready for deployment.');
    }

    return recommendations;
  }

  /**
   * Save AI reasoning results
   */
  async saveResults(result: AIReasoningResult, runId: string): Promise<string> {
    const resultsPath = path.join(this.artifactsDir, runId, 'ai-reasoning-results.json');
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });
    await fs.writeFile(resultsPath, JSON.stringify(result, null, 2));
    return resultsPath;
  }

  /**
   * Generate AI-enhanced UI integrity suggestions.
   * Returns an array of suggestion objects or an empty array on fallback/error.
   */
  async analyzeUiIntegrity(uiResult: any, runId: string, runSettings?: { useAI?: boolean }): Promise<Array<any>> {
    if (!this.shouldUseAI(runSettings) || !this.isConfigured()) {
      return [];
    }

    const prompt = `You are a web accessibility and frontend UX expert. Given the following UI integrity analysis JSON, produce an array of remediation suggestions. Each suggestion must be JSON with keys: id, title, severity (low|medium|high|critical), snippet (optional CSS or HTML), and note. Respond ONLY with valid JSON array.\n\nUI_ANALYSIS:\n${JSON.stringify(uiResult, null, 2)}`;

    try {
      const messages = [
        { role: 'system', content: 'You are an expert frontend QA assistant focused on accessibility, responsiveness, and branding.' },
        { role: 'user', content: prompt },
      ];

      const params: any = {
        model: this.modelName,
        messages,
        temperature: 0.2,
      };

      const resp = await this.client!.chat.completions.create(params);
      const content = this.extractResponseContent(resp) || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('analyzeUiIntegrity error:', e);
    }

    return [];
  }

  /**
   * Analyze SEO result and return AI suggestions array
   */
  async analyzeSeo(seoResult: any, runId: string, runSettings?: { useAI?: boolean }): Promise<Array<any>> {
    if (!this.shouldUseAI(runSettings) || !this.isConfigured()) return [];
    const prompt = `You are an SEO specialist. Given the following SEO result JSON, produce an array of remediation suggestions. Each suggestion must be JSON with keys: id, title, severity (low|medium|high|critical), snippet (optional), and note. Respond ONLY with valid JSON array.\n\nSEO_RESULT:\n${JSON.stringify(seoResult, null, 2)}`;
    try {
      const messages = [
        { role: 'system', content: 'You are an SEO expert focused on migration and indexability.' },
        { role: 'user', content: prompt },
      ];
      const params: any = { model: this.modelName, messages, temperature: 0.2 };
      const resp = await this.client!.chat.completions.create(params);
      const content = this.extractResponseContent(resp) || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('analyzeSeo error:', e);
    }
    return [];
  }

  /**
   * Analyze Performance result and return AI suggestions array
   */
  async analyzePerformance(perfResult: any, runId: string, runSettings?: { useAI?: boolean }): Promise<Array<any>> {
    if (!this.shouldUseAI(runSettings) || !this.isConfigured()) return [];
    const prompt = `You are a web performance engineer. Given the following performance result JSON, produce an array of remediation suggestions. Each suggestion must be JSON with keys: id, title, severity (low|medium|high|critical), snippet (optional), and note. Respond ONLY with valid JSON array.\n\nPERF_RESULT:\n${JSON.stringify(perfResult, null, 2)}`;
    try {
      const messages = [
        { role: 'system', content: 'You are a performance optimization expert focusing on core web vitals.' },
        { role: 'user', content: prompt },
      ];
      const params: any = { model: this.modelName, messages, temperature: 0.2 };
      const resp = await this.client!.chat.completions.create(params);
      const content = this.extractResponseContent(resp) || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('analyzePerformance error:', e);
    }
    return [];
  }

  /**
   * Analyze Security result and return AI suggestions array
   */
  async analyzeSecurity(securityResult: any, runId: string, runSettings?: { useAI?: boolean }): Promise<Array<any>> {
    if (!this.shouldUseAI(runSettings) || !this.isConfigured()) return [];
    const prompt = `You are a web security analyst. Given the following security result JSON, produce an array of remediation suggestions. Each suggestion must be JSON with keys: id, title, severity (low|medium|high|critical), snippet (optional), and note. Respond ONLY with valid JSON array.\n\nSECURITY_RESULT:\n${JSON.stringify(securityResult, null, 2)}`;
    try {
      const messages = [
        { role: 'system', content: 'You are a security expert focused on web security headers, CSP, HSTS, mixed content, and analytics leakage.' },
        { role: 'user', content: prompt },
      ];
      const params: any = { model: this.modelName, messages, temperature: 0.2 };
      const resp = await this.client!.chat.completions.create(params);
      const content = this.extractResponseContent(resp) || '';
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('analyzeSecurity error:', e);
    }
    return [];
  }

  /**
   * Classify technical findings in batches of up to 10 per call.
   * Returns an array of classifications matching input order: { severity, falsePositive, note }
   * Also returns aggregated false positives (unique strings)
   */
  async classifyFindings(findings: Array<any>, runId: string): Promise<{ classifications: Array<any>; falsePositives: string[] }> {
    const resultClassifications: any[] = [];
    const falsePositives: Set<string> = new Set();

    if (!Array.isArray(findings) || findings.length === 0) {
      return { classifications: [], falsePositives: [] };
    }

    if (!this.shouldUseAI() || !this.isConfigured()) {
      // No AI: return defaults (preserve severities if present)
      return {
        classifications: findings.map((f) => ({ severity: f.severity || 'low', falsePositive: false, note: '' })),
        falsePositives: [],
      };
    }

    const maxFindings = (config && config.comparison && config.comparison.aiMaxFindingsPerRun) || 200;
    const toClassify = findings.slice(0, maxFindings);
    const batchSize = 10;

    for (let i = 0; i < toClassify.length; i += batchSize) {
      const chunk = toClassify.slice(i, i + batchSize);
      // Build prompt with chunk
      const payload = chunk.map((f, idx) => ({ index: i + idx, title: f.title, description: f.description, evidence: f.evidence || '' }));
      const system = `You are a concise classifier that assigns a severity (none|low|medium|high|critical) and detects whether a finding is a false positive. Respond ONLY with valid JSON array of objects with keys: index, severity, falsePositive (true|false), note.`;
      const user = `FINDINGS:\n${JSON.stringify(payload, null, 2)}`;
      const messages = [{ role: 'system', content: system }, { role: 'user', content: user }];
      const params: any = { model: this.modelName, messages, temperature: 0.0 };

      try {
        const resp: any = await this.callChatCompletion(params, 'classifyFindings', runId);
        const content = this.extractResponseContent(resp) || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          for (const p of parsed) {
            resultClassifications[p.index] = { severity: p.severity || 'low', falsePositive: !!p.falsePositive, note: p.note || '' };
            if (p.falsePositive && p.note) falsePositives.add(p.note);
            else if (p.falsePositive && p.title) falsePositives.add(p.title);
          }
        } else {
          // fallback: mark as low
          for (let j = 0; j < chunk.length; j++) {
            resultClassifications[i + j] = { severity: chunk[j].severity || 'low', falsePositive: false, note: '' };
          }
        }
      } catch (e) {
        console.error('classifyFindings error:', e);
        for (let j = 0; j < chunk.length; j++) {
          resultClassifications[i + j] = { severity: chunk[j].severity || 'low', falsePositive: false, note: '' };
        }
      }
    }

    // Ensure classifications array length matches findings length
    for (let k = 0; k < findings.length; k++) {
      if (!resultClassifications[k]) resultClassifications[k] = { severity: findings[k].severity || 'low', falsePositive: false, note: '' };
    }

    return { classifications: resultClassifications, falsePositives: Array.from(falsePositives) };
  }
}

