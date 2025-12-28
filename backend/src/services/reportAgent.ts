import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '../config/config';
import { ComparisonJob, Run } from '../models';
import { AIReasoningResult } from './aiReasoningService';
import { VisualDiffResult } from './visualDiffService';
import { FunctionalQAResult } from './functionalQaAgent';
import { DataIntegrityResult } from './dataIntegrityAgent';

/**
 * Risk score calculation (0-100)
 */
export interface RiskScore {
  overall: number; // 0-100
  visual: number;
  functional: number;
  data: number;
  seo: number;
  breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    none: number;
  };
}

/**
 * Technical finding
 */
export interface TechnicalFinding {
  category: 'visual' | 'functional' | 'data' | 'seo';
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  affectedPages?: string[];
  evidence?: string;
}

/**
 * Executive summary
 */
export interface ExecutiveSummary {
  jobName: string;
  baselineUrl: string;
  candidateUrl: string;
  runDate: string;
  overallStatus: 'pass' | 'fail' | 'conditional';
  riskScore: number;
  goNoGo: 'go' | 'no-go' | 'conditional';
  summary: string;
  keyMetrics: {
    pagesTested: number;
    issuesFound: number;
    criticalIssues: number;
    passRate: number;
  };
  topFindings: string[];
}

/**
 * Complete report
 */
export interface Report {
  executiveSummary: ExecutiveSummary;
  riskScore: RiskScore;
  technicalFindings: TechnicalFinding[];
  aiAnalysis: AIReasoningResult;
  recommendations: string[];
  metadata: {
    jobId: string;
    runId: string;
    generatedAt: string;
    version: string;
  };
}

/**
 * ReportAgent - Generates comprehensive migration test reports
 * Supports markdown and JSON output formats
 */
export class ReportAgent {
  private readonly artifactsDir: string;

  constructor() {
    this.artifactsDir = path.join(DATA_DIR, 'artifacts');
  }

  /**
   * Calculate risk score from all test results
   */
  calculateRiskScore(
    aiResult: AIReasoningResult,
    visualResult?: VisualDiffResult,
    functionalResult?: FunctionalQAResult,
    dataResult?: DataIntegrityResult
  ): RiskScore {
    const breakdown = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      none: 0,
    };

    // Count severities from category analyses
    for (const analysis of aiResult.categoryAnalyses) {
      breakdown[analysis.severity]++;
    }

    // Calculate category-specific risk scores
    let visualRisk = 0;
    let functionalRisk = 0;
    let dataRisk = 0;
    let seoRisk = 0;

    for (const analysis of aiResult.categoryAnalyses) {
      const risk = this.severityToRiskScore(analysis.severity);
      switch (analysis.category) {
        case 'visual':
          visualRisk = risk;
          break;
        case 'functional':
          functionalRisk = risk;
          break;
        case 'data':
          dataRisk = risk;
          break;
        case 'seo':
          seoRisk = risk;
          break;
      }
    }

    // Calculate overall risk score (weighted average)
    const categoryCount = aiResult.categoryAnalyses.length;
    const overallRisk = categoryCount > 0
      ? (visualRisk + functionalRisk + dataRisk + seoRisk) / categoryCount
      : this.severityToRiskScore(aiResult.overallSeverity);

    return {
      overall: Math.round(overallRisk),
      visual: Math.round(visualRisk),
      functional: Math.round(functionalRisk),
      data: Math.round(dataRisk),
      seo: Math.round(seoRisk),
      breakdown,
    };
  }

  /**
   * Convert severity to risk score (0-100)
   */
  private severityToRiskScore(severity: string): number {
    const map: Record<string, number> = {
      none: 0,
      low: 25,
      medium: 50,
      high: 75,
      critical: 100,
    };
    return map[severity] || 50;
  }

  /**
   * Generate technical findings from all test results
   */
  generateTechnicalFindings(
    aiResult: AIReasoningResult,
    visualResult?: VisualDiffResult,
    functionalResult?: FunctionalQAResult,
    dataResult?: DataIntegrityResult
  ): TechnicalFinding[] {
    const findings: TechnicalFinding[] = [];

    // Visual findings
    if (visualResult) {
      const visualAnalysis = aiResult.categoryAnalyses.find((a) => a.category === 'visual');
      if (visualAnalysis && !visualAnalysis.pass) {
        findings.push({
          category: 'visual',
          severity: visualAnalysis.severity as TechnicalFinding['severity'],
          title: 'Visual Regression Issues Detected',
          description: visualAnalysis.explanation,
          impact: `Affects ${visualResult.summary.pagesWithDiffs} of ${visualResult.summary.totalPages} pages tested`,
          recommendation: visualAnalysis.keyFindings.join('; ') || 'Review visual differences',
          affectedPages: visualResult.pages
            .filter((p) => p.overallSeverity !== 'none')
            .map((p) => p.normalizedPath),
          evidence: `Average diff percentage: ${visualResult.summary.averageDiffPercentage.toFixed(2)}%`,
        });
      }
    }

    // Functional findings
    if (functionalResult) {
      const functionalAnalysis = aiResult.categoryAnalyses.find((a) => a.category === 'functional');
      if (functionalAnalysis && !functionalAnalysis.pass) {
        findings.push({
          category: 'functional',
          severity: functionalAnalysis.severity as TechnicalFinding['severity'],
          title: 'Functional Issues Detected',
          description: functionalAnalysis.explanation,
          impact: `${functionalResult.baseline.summary.totalBrokenLinks} broken links and ${functionalResult.baseline.summary.totalJSErrors} JavaScript errors found`,
          recommendation: 'Fix broken links and resolve JavaScript errors before deployment',
          evidence: `Navigation issues: ${functionalResult.baseline.summary.pagesWithNavigationIssues} pages`,
        });
      }
    }

    // Data integrity findings
    if (dataResult) {
      const dataAnalysis = aiResult.categoryAnalyses.find((a) => a.category === 'data');
      if (dataAnalysis && !dataAnalysis.pass) {
        findings.push({
          category: 'data',
          severity: dataAnalysis.severity as TechnicalFinding['severity'],
          title: 'Data Integrity Issues Detected',
          description: dataAnalysis.explanation,
          impact: `${dataResult.summary.pagesWithMismatches} pages have data mismatches`,
          recommendation: 'Verify data migration completeness and accuracy',
          affectedPages: dataResult.pages
            .filter((p) => p.overallStatus === 'mismatch')
            .map((p) => p.normalizedPath),
          evidence: `Total field differences: ${dataResult.summary.totalFieldDiffs}`,
        });
      }
    }

    return findings;
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary(
    job: ComparisonJob,
    run: Run,
    aiResult: AIReasoningResult,
    riskScore: RiskScore,
    visualResult?: VisualDiffResult,
    functionalResult?: FunctionalQAResult,
    dataResult?: DataIntegrityResult
  ): ExecutiveSummary {
    const totalPages = visualResult?.summary.totalPages || 
                      functionalResult?.baseline.summary.totalPages || 
                      dataResult?.summary.totalPages || 
                      0;

    const issuesFound = (visualResult?.summary.pagesWithDiffs || 0) +
                       (functionalResult?.baseline.summary.totalBrokenLinks || 0) +
                       (functionalResult?.baseline.summary.totalJSErrors || 0) +
                       (dataResult?.summary.totalFieldDiffs || 0);

    const criticalIssues = (visualResult?.summary.criticalIssues || 0) +
                          (dataResult?.summary.criticalMismatches || 0);

    const passRate = totalPages > 0 
      ? ((totalPages - issuesFound) / totalPages) * 100 
      : aiResult.overallPass ? 100 : 0;

    // Determine Go/No-Go decision
    let goNoGo: 'go' | 'no-go' | 'conditional' = 'go';
    if (riskScore.overall >= 75 || !aiResult.overallPass) {
      goNoGo = 'no-go';
    } else if (riskScore.overall >= 50 || criticalIssues > 0) {
      goNoGo = 'conditional';
    }

    const overallStatus = aiResult.overallPass && goNoGo === 'go' ? 'pass' :
                          goNoGo === 'no-go' ? 'fail' : 'conditional';

    // Generate summary text
    const summary = this.generateSummaryText(
      aiResult,
      riskScore,
      totalPages,
      issuesFound,
      criticalIssues
    );

    // Top findings
    const topFindings = aiResult.categoryAnalyses
      .filter((a) => !a.pass)
      .map((a) => `${a.category.toUpperCase()}: ${a.explanation}`)
      .slice(0, 5);

    return {
      jobName: job.name,
      baselineUrl: job.baselineUrl,
      candidateUrl: job.candidateUrl,
      runDate: run.triggeredAt,
      overallStatus,
      riskScore: riskScore.overall,
      goNoGo,
      summary,
      keyMetrics: {
        pagesTested: totalPages,
        issuesFound,
        criticalIssues,
        passRate: Math.round(passRate),
      },
      topFindings,
    };
  }

  /**
   * Generate summary text
   */
  private generateSummaryText(
    aiResult: AIReasoningResult,
    riskScore: RiskScore,
    totalPages: number,
    issuesFound: number,
    criticalIssues: number
  ): string {
    if (aiResult.overallPass && riskScore.overall < 25) {
      return `Migration testing completed successfully. ${totalPages} pages tested with minimal issues found. The candidate site is ready for deployment.`;
    }

    if (criticalIssues > 0) {
      return `Critical issues detected during migration testing. ${criticalIssues} critical issues found across ${totalPages} pages. Immediate attention required before deployment.`;
    }

    if (riskScore.overall >= 75) {
      return `High-risk issues detected. ${issuesFound} issues found across ${totalPages} pages. Review and remediation recommended before deployment.`;
    }

    if (riskScore.overall >= 50) {
      return `Moderate issues detected during testing. ${issuesFound} issues found. Review recommended with conditional approval for deployment.`;
    }

    return `Testing completed with minor issues. ${issuesFound} issues found across ${totalPages} pages. Most issues are non-critical and can be addressed post-deployment.`;
  }

  /**
   * Generate complete report
   */
  async generateReport(
    job: ComparisonJob,
    run: Run,
    aiResult: AIReasoningResult,
    visualResult: VisualDiffResult | undefined,
    functionalResult: FunctionalQAResult | undefined,
    dataResult: DataIntegrityResult | undefined,
    runId: string
  ): Promise<Report> {
    const riskScore = this.calculateRiskScore(aiResult, visualResult, functionalResult, dataResult);
    const technicalFindings = this.generateTechnicalFindings(aiResult, visualResult, functionalResult, dataResult);
    const executiveSummary = this.generateExecutiveSummary(
      job,
      run,
      aiResult,
      riskScore,
      visualResult,
      functionalResult,
      dataResult
    );

    const report: Report = {
      executiveSummary,
      riskScore,
      technicalFindings,
      aiAnalysis: aiResult,
      recommendations: aiResult.recommendations,
      metadata: {
        jobId: job.id,
        runId,
        generatedAt: new Date().toISOString(),
        version: '1.0',
      },
    };

    return report;
  }

  /**
   * Generate markdown report
   */
  async generateMarkdownReport(
    report: Report,
    runId: string
  ): Promise<string> {
    const md: string[] = [];

    // Header
    md.push('# Migration Test Report');
    md.push('');
    md.push(`**Generated:** ${report.metadata.generatedAt}`);
    md.push(`**Job ID:** ${report.metadata.jobId}`);
    md.push(`**Run ID:** ${report.metadata.runId}`);
    md.push('');

    // Executive Summary
    md.push('## Executive Summary');
    md.push('');
    md.push(`**Job:** ${report.executiveSummary.jobName}`);
    md.push(`**Baseline:** ${report.executiveSummary.baselineUrl}`);
    md.push(`**Candidate:** ${report.executiveSummary.candidateUrl}`);
    md.push(`**Test Date:** ${report.executiveSummary.runDate}`);
    md.push('');
    md.push(`**Overall Status:** ${report.executiveSummary.overallStatus.toUpperCase()}`);
    md.push(`**Risk Score:** ${report.executiveSummary.riskScore}/100`);
    md.push(`**Go/No-Go Decision:** ${report.executiveSummary.goNoGo.toUpperCase()}`);
    md.push('');
    md.push(report.executiveSummary.summary);
    md.push('');

    // Key Metrics
    md.push('### Key Metrics');
    md.push('');
    md.push(`- **Pages Tested:** ${report.executiveSummary.keyMetrics.pagesTested}`);
    md.push(`- **Issues Found:** ${report.executiveSummary.keyMetrics.issuesFound}`);
    md.push(`- **Critical Issues:** ${report.executiveSummary.keyMetrics.criticalIssues}`);
    md.push(`- **Pass Rate:** ${report.executiveSummary.keyMetrics.passRate}%`);
    md.push('');

    // Top Findings
    if (report.executiveSummary.topFindings.length > 0) {
      md.push('### Top Findings');
      md.push('');
      report.executiveSummary.topFindings.forEach((finding) => {
        md.push(`- ${finding}`);
      });
      md.push('');
    }

    // Risk Score Breakdown
    md.push('## Risk Score Breakdown');
    md.push('');
    md.push(`**Overall Risk:** ${report.riskScore.overall}/100`);
    md.push('');
    md.push('### Category Risk Scores');
    md.push('');
    md.push(`- **Visual:** ${report.riskScore.visual}/100`);
    md.push(`- **Functional:** ${report.riskScore.functional}/100`);
    md.push(`- **Data:** ${report.riskScore.data}/100`);
    md.push(`- **SEO:** ${report.riskScore.seo}/100`);
    md.push('');
    md.push('### Severity Breakdown');
    md.push('');
    md.push(`- **Critical:** ${report.riskScore.breakdown.critical}`);
    md.push(`- **High:** ${report.riskScore.breakdown.high}`);
    md.push(`- **Medium:** ${report.riskScore.breakdown.medium}`);
    md.push(`- **Low:** ${report.riskScore.breakdown.low}`);
    md.push(`- **None:** ${report.riskScore.breakdown.none}`);
    md.push('');

    // Technical Findings
    if (report.technicalFindings.length > 0) {
      md.push('## Technical Findings');
      md.push('');
      report.technicalFindings.forEach((finding, index) => {
        md.push(`### ${index + 1}. ${finding.title}`);
        md.push('');
        md.push(`**Category:** ${finding.category.toUpperCase()}`);
        md.push(`**Severity:** ${finding.severity.toUpperCase()}`);
        md.push('');
        md.push(`**Description:** ${finding.description}`);
        md.push('');
        md.push(`**Impact:** ${finding.impact}`);
        md.push('');
        md.push(`**Recommendation:** ${finding.recommendation}`);
        if (finding.evidence) {
          md.push('');
          md.push(`**Evidence:** ${finding.evidence}`);
        }
        if (finding.affectedPages && finding.affectedPages.length > 0) {
          md.push('');
          md.push(`**Affected Pages:** ${finding.affectedPages.join(', ')}`);
        }
        md.push('');
      });
    }

    // AI Analysis
    md.push('## AI Analysis');
    md.push('');
    md.push(`**Overall Severity:** ${report.aiAnalysis.overallSeverity.toUpperCase()}`);
    md.push(`**Confidence:** ${(report.aiAnalysis.overallConfidence * 100).toFixed(0)}%`);
    md.push(`**Pass/Fail:** ${report.aiAnalysis.overallPass ? 'PASS' : 'FAIL'}`);
    md.push('');
    md.push(`**Explanation:** ${report.aiAnalysis.overallExplanation}`);
    md.push('');

    // Category Analyses
    if (report.aiAnalysis.categoryAnalyses.length > 0) {
      md.push('### Category Analyses');
      md.push('');
      report.aiAnalysis.categoryAnalyses.forEach((analysis) => {
        md.push(`#### ${analysis.category.toUpperCase()}`);
        md.push('');
        md.push(`- **Severity:** ${analysis.severity.toUpperCase()}`);
        md.push(`- **Confidence:** ${(analysis.confidence * 100).toFixed(0)}%`);
        md.push(`- **Pass:** ${analysis.pass ? 'Yes' : 'No'}`);
        md.push(`- **Explanation:** ${analysis.explanation}`);
        md.push('');
      });
    }

    // False Positives
    if (report.aiAnalysis.falsePositives.length > 0) {
      md.push('### False Positives Identified');
      md.push('');
      report.aiAnalysis.falsePositives.forEach((fp) => {
        md.push(`- ${fp}`);
      });
      md.push('');
    }

    // Expected Changes
    if (report.aiAnalysis.expectedChanges.length > 0) {
      md.push('### Expected Changes Identified');
      md.push('');
      report.aiAnalysis.expectedChanges.forEach((ec) => {
        md.push(`- ${ec}`);
      });
      md.push('');
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      md.push('## Recommendations');
      md.push('');
      report.recommendations.forEach((rec, index) => {
        md.push(`${index + 1}. ${rec}`);
      });
      md.push('');
    }

    // Footer
    md.push('---');
    md.push('');
    md.push(`*Report generated by Migrate Guard v${report.metadata.version}*`);

    return md.join('\n');
  }

  /**
   * Save report in both formats
   */
  async saveReport(
    report: Report,
    runId: string
  ): Promise<{ jsonPath: string; markdownPath: string }> {
    const reportsDir = path.join(this.artifactsDir, runId, 'reports');
    await fs.mkdir(reportsDir, { recursive: true });

    // Save JSON
    const jsonPath = path.join(reportsDir, 'report.json');
    await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

    // Save Markdown
    const markdownContent = await this.generateMarkdownReport(report, runId);
    const markdownPath = path.join(reportsDir, 'report.md');
    await fs.writeFile(markdownPath, markdownContent);

    return {
      jsonPath: jsonPath.replace(/^.*[\\/]data[\\/]/, 'data/'),
      markdownPath: markdownPath.replace(/^.*[\\/]data[\\/]/, 'data/'),
    };
  }
}

