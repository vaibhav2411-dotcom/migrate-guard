// Core Types for MigrateGuard

export type ProjectStatus = 'planning' | 'in_progress' | 'testing' | 'completed' | 'on_hold';
export type TestStatus = 'pending' | 'in_progress' | 'passed' | 'failed' | 'blocked';
export type TestCategory = 'functional' | 'visual' | 'performance' | 'security' | 'seo' | 'accessibility';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type UserRole = 'admin' | 'qa' | 'developer' | 'pm' | 'viewer';
export type URLTestStatus = 'pending' | 'passed' | 'failed' | 'warning';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  targetUrl: string;
  status: ProjectStatus;
  startDate: string;
  cutoverDate: string;
  createdAt: string;
  updatedAt: string;
  progress: number;
  testsPassed: number;
  testsTotal: number;
}

export interface TestCase {
  id: string;
  projectId: string;
  title: string;
  description: string;
  category: TestCategory;
  priority: Priority;
  expectedResult: string;
  actualResult?: string;
  status: TestStatus;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface URLRecord {
  id: string;
  projectId: string;
  url: string;
  pageType: string;
  statusCode: number;
  consoleErrors: number;
  brokenLinks: number;
  accessibilityScore: number;
  seoScore: number;
  performanceScore: number;
  testStatus: URLTestStatus;
  notes?: string;
  lastTested?: string;
}

export interface DataCheck {
  id: string;
  projectId: string;
  sourceTable: string;
  targetTable: string;
  rowCountDiff: number;
  checksumMatch: boolean;
  status: 'pending' | 'passed' | 'failed';
  details?: string;
}

export interface Report {
  id: string;
  projectId: string;
  type: 'summary' | 'executive' | 'go_live' | 'detailed';
  generatedAt: string;
  fileUrl?: string;
}

export interface Activity {
  id: string;
  type: 'project_created' | 'test_passed' | 'test_failed' | 'url_scanned' | 'report_generated';
  description: string;
  timestamp: string;
  userId?: string;
  projectId?: string;
}

export interface DashboardKPIs {
  totalProjects: number;
  activeProjects: number;
  testsCompleted: number;
  testsPassed: number;
  urlsScanned: number;
  issuesFound: number;
}
