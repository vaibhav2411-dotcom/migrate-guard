import OpenAI from 'openai';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/config';
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
  category: 'visual' | 'functional' | 'data' | 'seo';
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

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
    this.endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    this.apiKey = process.env.AZURE_OPENAI_API_KEY || '';
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';

    if (this.endpoint && this.apiKey) {
      // Use OpenAI SDK with Azure OpenAI endpoint
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: `${this.endpoint}/openai/deployments/${this.deploymentName}`,
        defaultQuery: { 'api-version': '2024-02-15-preview' },
        defaultHeaders: {
          'api-key': this.apiKey,
        },
      });
    }
  }

  /**
   * Check if Azure OpenAI is configured
   */
  isConfigured(): boolean {
    return this.client !== null && this.endpoint !== '' && this.apiKey !== '';
  }

  /**
   * Summarize artifacts for AI analysis
   */
  private summarizeArtifacts(
    visualDiffResult?: VisualDiffResult,
    functionalQaResult?: FunctionalQAResult,
    dataIntegrityResult?: DataIntegrityResult
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
      summary.functional = {
        totalPages: functionalQaResult.baseline.summary.totalPages,
        pagesWithNavigationIssues: functionalQaResult.baseline.summary.pagesWithNavigationIssues,
        totalBrokenLinks: functionalQaResult.baseline.summary.totalBrokenLinks + functionalQaResult.candidate.summary.totalBrokenLinks,
        totalJSErrors: functionalQaResult.baseline.summary.totalJSErrors + functionalQaResult.candidate.summary.totalJSErrors,
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

    return summary;
  }

  /**
   * Analyze artifacts using Azure OpenAI
   */
  async analyzeArtifacts(
    visualDiffResult: VisualDiffResult | undefined,
    functionalQaResult: FunctionalQAResult | undefined,
    dataIntegrityResult: DataIntegrityResult | undefined,
    runId: string
  ): Promise<AIReasoningResult> {
    if (!this.isConfigured()) {
      // Fallback: Generate basic analysis without AI
      return this.generateFallbackAnalysis(visualDiffResult, functionalQaResult, dataIntegrityResult, runId);
    }

    const artifactSummary = this.summarizeArtifacts(visualDiffResult, functionalQaResult, dataIntegrityResult);

    // Build prompt for AI analysis
    const prompt = this.buildAnalysisPrompt(artifactSummary);

    try {
      const response = await this.client!.chat.completions.create({
        model: this.deploymentName,
        messages: [
          {
            role: 'system',
            content: `You are an expert QA analyst specializing in website migration testing. Your role is to analyze test results and provide:
1. Severity classification (none, low, medium, high, critical)
2. Confidence scores (0-1)
3. Clear explanations
4. Pass/Fail recommendations
5. Identification of false positives (cosmetic changes, expected updates)
6. Identification of expected changes (intentional migrations)

You must be conservative and only flag real issues. Ignore:
- Minor visual differences (< 1% pixel diff)
- Expected content updates
- Non-critical console warnings
- External link failures (if not critical)
- Minor layout shifts that don't affect functionality`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for more consistent analysis
      });

      const aiResponse = response.choices[0]?.message?.content || '';
      return this.parseAIResponse(aiResponse, artifactSummary, runId);
    } catch (error) {
      console.error('Azure OpenAI error:', error);
      // Fallback to rule-based analysis
      return this.generateFallbackAnalysis(visualDiffResult, functionalQaResult, dataIntegrityResult, runId);
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
      const functionalSeverity = this.calculateSeverityFromFunctional(functionalQaResult);
      categoryAnalyses.push({
        category: 'functional',
        severity: functionalSeverity,
        confidence: 0.8,
        explanation: `Functional issues: ${functionalQaResult.baseline.summary.totalBrokenLinks} broken links, ${functionalQaResult.baseline.summary.totalJSErrors} JS errors`,
        pass: functionalSeverity === 'none' || functionalSeverity === 'low',
        falsePositives: [],
        expectedChanges: [],
        keyFindings: [
          `${functionalQaResult.baseline.summary.totalBrokenLinks} broken links detected`,
          `${functionalQaResult.baseline.summary.totalJSErrors} JavaScript errors found`,
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
    const totalIssues = result.baseline.summary.totalBrokenLinks + result.baseline.summary.totalJSErrors;
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
}

