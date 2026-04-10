const path = require('path');
const fs = require('fs').promises;

function severityToRisk(sev) {
  const map = { none: 0, low: 25, medium: 50, high: 75, critical: 100 };
  return map[sev] ?? 50;
}

async function main() {
  const runId = process.argv[2] || 'evidence-1775600727671';
  const artifactsDir = path.join(__dirname, '..', 'data', 'artifacts', runId);
  const outReports = path.join(artifactsDir, 'reports');
  try { await fs.access(artifactsDir); } catch (e) { console.error('Artifacts directory not found:', artifactsDir); process.exit(2); }

  // Read available summaries
  const evidencePath = path.join(artifactsDir, 'evidence-summary.json');
  const analysisPath = path.join(artifactsDir, 'analysis-summary.json');
  const resourceDiffPath = path.join(artifactsDir, 'resource-diff.json');

  const evidence = JSON.parse(await fs.readFile(evidencePath, 'utf-8')).pages[0];
  let analysis = null;
  try { analysis = JSON.parse(await fs.readFile(analysisPath, 'utf-8')); } catch { analysis = null; }
  let resourceDiff = null;
  try { resourceDiff = JSON.parse(await fs.readFile(resourceDiffPath, 'utf-8')); } catch { resourceDiff = null; }

  // Build deterministic AI-fallback result
  const aiResult = {
    overallSeverity: 'medium',
    overallConfidence: 0.75,
    overallPass: false,
    overallExplanation: 'Deterministic rule-based analysis (AI disabled)',
    categoryAnalyses: [],
    falsePositives: [],
    expectedChanges: [],
    recommendations: [],
    artifactPaths: [],
    aiMode: 'OFF',
    aiAvailable: false,
    aiDegraded: false,
  };

  // Populate visual category from evidence
  if (evidence && typeof evidence.pixelDiffPercent === 'number') {
    const pct = evidence.pixelDiffPercent;
    const visSeverity = pct > 15 ? 'high' : pct > 5 ? 'medium' : pct > 1 ? 'low' : 'none';
    aiResult.categoryAnalyses.push({ category: 'visual', severity: visSeverity, confidence: 0.9, explanation: `Pixel diff ${pct.toFixed(2)}%`, pass: visSeverity === 'none', falsePositives: [], expectedChanges: [], keyFindings: [`pixelDiffPercent: ${pct}`] });
  }

  // Functional summary from evidence console counts
  const baselineConsole = evidence.viewports[0].baseline.console || [];
  const candidateConsole = evidence.viewports[0].candidate.console || [];
  const baselineErrors = baselineConsole.filter(c=>c.type==='error').length;
  const candidateErrors = candidateConsole.filter(c=>c.type==='error').length;
  const funcSeverity = (candidateErrors>5)? 'high' : (candidateErrors>0)? 'medium':'none';
  aiResult.categoryAnalyses.push({ category: 'functional', severity: funcSeverity, confidence: 0.85, explanation: `Candidate JS errors: ${candidateErrors}, baseline: ${baselineErrors}`, pass: funcSeverity==='none', falsePositives: [], expectedChanges: [], keyFindings: [] });

  // Data category: from resource diff counts
  if (resourceDiff) {
    const mismatches = (resourceDiff.onlyInBaseline||[]).length + (resourceDiff.onlyInCandidate||[]).length;
    const dataSeverity = mismatches>20 ? 'high' : mismatches>5 ? 'medium' : 'low';
    aiResult.categoryAnalyses.push({ category: 'data', severity: dataSeverity, confidence: 0.8, explanation: `Resource URL mismatches: ${mismatches}`, pass: dataSeverity==='none', falsePositives: [], expectedChanges: [], keyFindings: [] });
  }

  // Calculate risk score (simple average)
  const total = aiResult.categoryAnalyses.reduce((acc,a)=>acc+severityToRisk(a.severity),0);
  const overallRisk = Math.round(total / Math.max(1, aiResult.categoryAnalyses.length));

  const report = {
    executiveSummary: {
      jobName: 'manual-run',
      baselineUrl: 'https://www.bbcbenelux.com',
      candidateUrl: 'https://stage.beta.bbcbenelux.com',
      runDate: new Date().toISOString(),
      overallStatus: aiResult.overallPass ? 'pass' : 'conditional',
      riskScore: overallRisk,
      goNoGo: overallRisk >= 75 ? 'no-go' : overallRisk >=50 ? 'conditional' : 'go',
      summary: aiResult.overallExplanation,
      keyMetrics: { pagesTested: 1, issuesFound: (analysis && analysis.totalIssues) || 0, criticalIssues: 0, passRate: 0 }
    },
    riskScore: { overall: overallRisk, visual: severityToRisk(aiResult.categoryAnalyses.find(a=>a.category==='visual')?.severity||'none'), functional: severityToRisk(aiResult.categoryAnalyses.find(a=>a.category==='functional')?.severity||'none'), data: severityToRisk(aiResult.categoryAnalyses.find(a=>a.category==='data')?.severity||'none'), seo:0, breakdown: { critical:0, high: aiResult.categoryAnalyses.filter(a=>a.severity==='high').length, medium: aiResult.categoryAnalyses.filter(a=>a.severity==='medium').length, low: aiResult.categoryAnalyses.filter(a=>a.severity==='low').length, none: aiResult.categoryAnalyses.filter(a=>a.severity==='none').length } },
    technicalFindings: [],
    aiAnalysis: aiResult,
    recommendations: aiResult.recommendations,
    metadata: { jobId: 'job-manual', runId, generatedAt: new Date().toISOString(), version: '1.0' }
  };

  // write outputs
  await fs.mkdir(outReports, { recursive: true });
  const jsonPath = path.join(outReports, 'report.json');
  const mdPath = path.join(outReports, 'report.md');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  // simple markdown
  const md = [];
  md.push('# Migration Test Report');
  md.push(`**Run:** ${runId}`);
  md.push(`**AI Mode:** OFF (deterministic analysis only)`);
  md.push(`**Risk Score:** ${overallRisk}/100`);
  md.push('## Category Analyses');
  aiResult.categoryAnalyses.forEach(a=>{
    md.push(`- **${a.category.toUpperCase()}**: ${a.severity.toUpperCase()} — ${a.explanation}`);
  });
  if (resourceDiff) {
    md.push('');
    md.push('## Resource Diff Summary');
    md.push(`- Baseline URLs: ${resourceDiff.baselineCount}`);
    md.push(`- Candidate URLs: ${resourceDiff.candidateCount}`);
    md.push(`- Only in baseline: ${resourceDiff.onlyInBaseline?.length || 0}`);
    md.push(`- Only in candidate: ${resourceDiff.onlyInCandidate?.length || 0}`);
  }

  await fs.writeFile(mdPath, md.join('\n'), 'utf-8');

  console.log('Report saved to:', jsonPath, mdPath);
}

main().catch(e=>{ console.error(e); process.exit(2); });
