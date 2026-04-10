const API_BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

export interface CreateJobPayload {
  name: string;
  description?: string;
  baselineUrl: string;
  candidateUrl: string;
}

interface RawJobDto {
  id: string;
  name: string;
  description?: string;
  baselineUrl?: string;
  candidateUrl?: string;
  sourceUrl?: string;
  targetUrl?: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface JobDto extends CreateJobPayload {
  id: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface RunDto {
  id: string;
  jobId: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  triggeredBy: string;
  triggeredAt: string;
  completedAt?: string;
}

export interface RunArtifactDto {
  id: string;
  runId: string;
  type: 'log' | 'screenshot' | 'report' | 'other';
  label: string;
  path: string;
  createdAt: string;
}

export interface RunSummaryDto {
  executive?: {
    overallStatus?: string;
    riskScore?: number;
    goNoGo?: string;
    keyMetrics?: {
      pagesTested?: number;
      issuesFound?: number;
      criticalIssues?: number;
      passRate?: number;
    };
  };
  riskScore?: {
    overall?: number;
  };
}

export interface TechnicalFindingDto {
  category: 'visual' | 'functional' | 'data' | 'seo' | 'security' | 'performance' | 'ui' | 'accessibility';
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  affectedPages?: string[];
  evidence?: string;
}

export interface TechnicalReportDto {
  technicalFindings?: TechnicalFindingDto[];
}

export interface FunctionalPageEvidenceDto {
  url: string;
  normalizedPath: string;
  navigation: {
    url: string;
    success: boolean;
    statusCode?: number;
    error?: string;
    loadTime?: number;
  };
  brokenLinks: Array<{
    url: string;
    sourceUrl: string;
    sourceSelector: string;
    statusCode?: number;
    error: string;
    linkText?: string;
    kind?: 'anchor' | 'network';
    method?: string;
    resourceType?: string;
    isExternal?: boolean;
  }>;
  jsErrors: Array<{
    message: string;
    source: string;
    line?: number;
    column?: number;
    timestamp: string;
    url: string;
  }>;
}

export interface RunEvidenceDto {
  runId: string;
  crawlSummary?: {
    baselinePagesCount?: number;
    candidatePagesCount?: number;
    matchedPagesCount?: number;
    pageMapGenerated?: number;
    crawlConfig?: {
      maxPages?: number;
      depth?: number;
      followExternalLinks?: boolean;
    };
  } | null;
  matchedPages: Array<{
    baseline: {
      url: string;
      normalizedPath: string;
      title?: string;
      links?: string[];
    };
    candidate: {
      url: string;
      normalizedPath: string;
      title?: string;
      links?: string[];
    };
    confidence?: number;
    matchReason?: string;
  }>;
  functionalQa?: {
    baseline: {
      summary: {
        totalPages: number;
        pagesWithNavigationIssues: number;
        pagesWithFormIssues: number;
        totalBrokenLinks: number;
        totalJSErrors: number;
        pagesWithJSErrors: number;
      };
      pages: FunctionalPageEvidenceDto[];
    };
    candidate: {
      summary: {
        totalPages: number;
        pagesWithNavigationIssues: number;
        pagesWithFormIssues: number;
        totalBrokenLinks: number;
        totalJSErrors: number;
        pagesWithJSErrors: number;
      };
      pages: FunctionalPageEvidenceDto[];
    };
  } | null;
  networkSummary?: {
    baseline: {
      requestCount: number;
      failureCount: number;
      failedRequests: Array<Record<string, unknown>>;
    };
    candidate: {
      requestCount: number;
      failureCount: number;
      failedRequests: Array<Record<string, unknown>>;
    };
  } | null;
  executionSummary?: {
    baseline: {
      totalPages: number;
      totalScreenshots: number;
      totalDomSnapshots: number;
      estimatedScrollScreens: number;
    };
    candidate: {
      totalPages: number;
      totalScreenshots: number;
      totalDomSnapshots: number;
      estimatedScrollScreens: number;
    };
  };
}

export interface RunTrendPointDto {
  runId: string;
  jobId: string;
  status: RunDto['status'];
  triggeredAt: string;
  completedAt?: string;
  riskScore?: number;
  goNoGo?: string;
  issuesFound?: number;
  criticalIssues?: number;
  passRate?: number;
}

export interface RunTrendsResponseDto {
  points: RunTrendPointDto[];
  aggregates: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    avgRiskScore: number | null;
    latestRiskScore: number | null;
    latestRunId: string | null;
    riskDeltaVsPrevious: number | null;
    riskTrend: 'improved' | 'regressed' | 'stable' | 'unknown';
  };
}

export interface JobRunHistoryResponseDto {
  job: {
    id: string;
    name: string;
    baselineUrl: string;
    candidateUrl: string;
  };
  history: Array<{
    runId: string;
    status: RunDto['status'];
    triggeredAt: string;
    completedAt?: string;
    riskScore?: number;
    goNoGo?: string;
    issuesFound?: number;
    criticalIssues?: number;
    passRate?: number;
    regression: {
      status: 'improved' | 'regressed' | 'stable' | 'unknown';
      delta: number | null;
    };
  }>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText} - ${text}`);
  }

  return (await res.json()) as T;
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText} - ${text}`);
  }

  return await res.text();
}

export async function createJob(payload: CreateJobPayload): Promise<JobDto> {
  const raw = await request<RawJobDto>('/api/jobs', {
    method: 'POST',
    // Send both new and legacy fields for compatibility during migration.
    body: JSON.stringify({
      ...payload,
      sourceUrl: payload.baselineUrl,
      targetUrl: payload.candidateUrl,
    }),
  });

  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    baselineUrl: raw.baselineUrl ?? raw.sourceUrl ?? '',
    candidateUrl: raw.candidateUrl ?? raw.targetUrl ?? '',
    status: raw.status,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export async function listJobs(): Promise<JobDto[]> {
  const raw = await request<RawJobDto[]>('/api/jobs');
  return raw.map((job) => ({
    id: job.id,
    name: job.name,
    description: job.description,
    baselineUrl: job.baselineUrl ?? job.sourceUrl ?? '',
    candidateUrl: job.candidateUrl ?? job.targetUrl ?? '',
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }));
}

export async function triggerRun(jobId: string, triggeredBy = 'system'): Promise<RunDto> {
  return request<RunDto>(`/api/jobs/${encodeURIComponent(jobId)}/run`, {
    method: 'POST',
    body: JSON.stringify({ triggeredBy }),
  });
}

export async function listRuns(): Promise<RunDto[]> {
  return request<RunDto[]>('/api/runs');
}

export async function getRunTrends(params?: { limit?: number; jobId?: string }): Promise<RunTrendsResponseDto> {
  const query = new URLSearchParams();
  if (typeof params?.limit === 'number') {
    query.set('limit', String(params.limit));
  }
  if (params?.jobId) {
    query.set('jobId', params.jobId);
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  return request<RunTrendsResponseDto>(`/api/runs/trends${suffix}`);
}

export async function getJobRunHistory(jobId: string, limit?: number): Promise<JobRunHistoryResponseDto> {
  const query = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : '';
  return request<JobRunHistoryResponseDto>(`/api/jobs/${encodeURIComponent(jobId)}/history${query}`);
}

export async function listRunArtifacts(runId: string): Promise<RunArtifactDto[]> {
  return request<RunArtifactDto[]>(`/api/runs/${encodeURIComponent(runId)}/artifacts`);
}

export async function getRunSummary(runId: string): Promise<RunSummaryDto> {
  return request<RunSummaryDto>(`/api/runs/${encodeURIComponent(runId)}/summary`);
}

export async function getExecutiveReport(runId: string): Promise<string> {
  return requestText(`/api/runs/${encodeURIComponent(runId)}/report/executive`);
}

export async function getTechnicalReport(runId: string): Promise<TechnicalReportDto> {
  return request<TechnicalReportDto>(`/api/runs/${encodeURIComponent(runId)}/report/technical`);
}

export async function getRunEvidence(runId: string): Promise<RunEvidenceDto> {
  return request<RunEvidenceDto>(`/api/runs/${encodeURIComponent(runId)}/evidence`);
}

export async function saveRunEvidence(runId: string, payload: any): Promise<{ ok: boolean; path?: string }> {
  const res = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/evidence/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`saveRunEvidence failed: ${res.status} ${res.statusText} - ${txt}`);
  }

  return (await res.json()) as { ok: boolean; path?: string };
}

export interface SavedEvidenceFile {
  name: string;
  path: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
}

export async function listSavedEvidence(runId: string): Promise<SavedEvidenceFile[]> {
  const res = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/evidence/saved`);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`listSavedEvidence failed: ${res.status} ${res.statusText} - ${txt}`);
  }
  return (await res.json()) as SavedEvidenceFile[];
}

export function runReportUrls(runId: string) {
  const encoded = encodeURIComponent(runId);
  return {
    executive: `${API_BASE}/api/runs/${encoded}/report/executive`,
    technical: `${API_BASE}/api/runs/${encoded}/report/technical`,
    summary: `${API_BASE}/api/runs/${encoded}/summary`,
    // Static HTML report served from artifacts mounted under /data/
    html: `${API_BASE.replace(/\/\/$/, '')}/data/artifacts/${encoded}/reports/report.html`,
  };
}
