export type JobStatus = 'pending' | 'active' | 'completed' | 'failed';
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  name: string;
  description?: string;
  sourceUrl: string;
  targetUrl: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RunArtifact {
  id: string;
  runId: string;
  type: 'log' | 'screenshot' | 'report' | 'other';
  label: string;
  path: string;
  createdAt: string;
}

export interface Run {
  id: string;
  jobId: string;
  status: RunStatus;
  triggeredBy: string;
  triggeredAt: string;
  completedAt?: string;
}

export interface StorageSnapshot {
  jobs: Job[];
  runs: Run[];
  artifacts: RunArtifact[];
}

export interface StoragePort {
  load(): Promise<StorageSnapshot>;
  save(snapshot: StorageSnapshot): Promise<void>;
}

export interface JobServicePort {
  listJobs(): Promise<Job[]>;
  getJobById(id: string): Promise<Job | undefined>;
  createJob(input: Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Job>;
  updateJob(id: string, input: Partial<Omit<Job, 'id' | 'createdAt'>>): Promise<Job>;
  deleteJob(id: string): Promise<boolean>;
}

export interface RunServicePort {
  listRuns(): Promise<Run[]>;
  getRunById(id: string): Promise<Run | undefined>;
  listArtifactsByRun(runId: string): Promise<RunArtifact[]>;
  triggerRun(jobId: string, triggeredBy: string): Promise<Run>;
}
