export type JobStatus = 'pending' | 'active' | 'completed' | 'failed';
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

/**
 * @deprecated Use ComparisonJob instead. Kept for migration purposes.
 */
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

/**
 * Crawl configuration for website comparison
 */
export interface CrawlConfig {
  depth: number; // Maximum crawl depth (0 = single page, 1 = page + links, etc.)
  includePaths?: string[]; // Path patterns to include (e.g., ['/products/*', '/blog/*'])
  excludePaths?: string[]; // Path patterns to exclude (e.g., ['/admin/*', '/api/*'])
  maxPages?: number; // Maximum number of pages to crawl
  followExternalLinks?: boolean; // Whether to follow external links
}

/**
 * Page mapping between baseline and candidate URLs
 */
export interface PageMap {
  baselinePath: string; // Path on baseline site (e.g., '/products/item-1')
  candidatePath: string; // Corresponding path on candidate site (e.g., '/products/new-item-1')
  notes?: string; // Optional notes about the mapping
}

/**
 * Test matrix configuration for comparison types
 */
export interface TestMatrix {
  visual: boolean; // Visual regression testing (screenshots, layout)
  functional: boolean; // Functional testing (interactions, forms, navigation)
  data: boolean; // Data validation (content, API responses)
  seo: boolean; // SEO comparison (meta tags, structured data, sitemap)
}

/**
 * ComparisonJob domain model
 * Always compares a baseline (production) website with a candidate (migrated/changed) website
 */
export interface ComparisonJob {
  id: string;
  name: string;
  description?: string;
  baselineUrl: string; // Production/baseline website URL
  candidateUrl: string; // Migrated/candidate website URL
  crawlConfig: CrawlConfig;
  pageMap?: PageMap[]; // Optional explicit page mappings (baseline ↔ candidate)
  testMatrix: TestMatrix;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  // Migration metadata
  migratedFrom?: string; // ID of old Job if migrated
  snapshotVersion?: string; // Version of snapshot format
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

/**
 * Storage snapshot with versioning support for migrations
 */
export interface StorageSnapshot {
  version: string; // Snapshot format version (e.g., '2.0')
  jobs?: Job[]; // Legacy jobs (deprecated, for migration)
  comparisonJobs: ComparisonJob[]; // Current job format
  runs: Run[];
  artifacts: RunArtifact[];
  metadata?: {
    lastMigration?: string; // ISO timestamp of last migration
    migrationNotes?: string; // Notes about migrations performed
  };
}

export interface StoragePort {
  load(): Promise<StorageSnapshot>;
  save(snapshot: StorageSnapshot): Promise<void>;
}

export interface ComparisonJobServicePort {
  listJobs(): Promise<ComparisonJob[]>;
  getJobById(id: string): Promise<ComparisonJob | undefined>;
  createJob(
    input: Omit<ComparisonJob, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'migratedFrom' | 'snapshotVersion' | 'crawlConfig' | 'testMatrix'> & {
      crawlConfig?: CrawlConfig;
      testMatrix?: TestMatrix;
    }
  ): Promise<ComparisonJob>;
  updateJob(
    id: string,
    input: Partial<Omit<ComparisonJob, 'id' | 'createdAt' | 'migratedFrom' | 'snapshotVersion'>>
  ): Promise<ComparisonJob>;
  deleteJob(id: string): Promise<boolean>;
  migrateLegacyJobs(): Promise<number>; // Returns number of jobs migrated
}

/**
 * @deprecated Use ComparisonJobServicePort instead
 */
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
  // Enforces dual-site comparison for ComparisonJob runs
  triggerComparisonRun(jobId: string, triggeredBy: string): Promise<Run>;
}
