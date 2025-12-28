const API_BASE = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

export interface CreateJobPayload {
  name: string;
  description?: string;
  sourceUrl: string;
  targetUrl: string;
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

export async function createJob(payload: CreateJobPayload): Promise<JobDto> {
  return request<JobDto>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listJobs(): Promise<JobDto[]> {
  return request<JobDto[]>('/api/jobs');
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

export async function listRunArtifacts(runId: string): Promise<RunArtifactDto[]> {
  return request<RunArtifactDto[]>(`/api/runs/${encodeURIComponent(runId)}/artifacts`);
}
