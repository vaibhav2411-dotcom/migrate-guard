import { create } from 'zustand';
import { Project, TestCase, URLRecord, User, Activity, DashboardKPIs } from './types';

// Demo data
const demoProjects: Project[] = [
  {
    id: '1',
    name: 'E-Commerce Platform Migration',
    description: 'Complete migration of the main e-commerce platform from legacy system to modern infrastructure',
    sourceUrl: 'https://old.example.com',
    targetUrl: 'https://new.example.com',
    status: 'in_progress',
    startDate: '2025-01-15',
    cutoverDate: '2025-02-28',
    createdAt: '2025-01-10',
    updatedAt: '2025-01-20',
    progress: 68,
    testsPassed: 45,
    testsTotal: 66,
  },
  {
    id: '2',
    name: 'Corporate Website Redesign',
    description: 'Complete redesign and migration of the corporate website with new CMS',
    sourceUrl: 'https://corporate.old.com',
    targetUrl: 'https://corporate.new.com',
    status: 'testing',
    startDate: '2025-01-01',
    cutoverDate: '2025-02-15',
    createdAt: '2024-12-20',
    updatedAt: '2025-01-18',
    progress: 85,
    testsPassed: 120,
    testsTotal: 142,
  },
  {
    id: '3',
    name: 'API Gateway Migration',
    description: 'Migration of API Gateway from AWS to Cloudflare Workers',
    sourceUrl: 'https://api.legacy.com',
    targetUrl: 'https://api.modern.com',
    status: 'planning',
    startDate: '2025-02-01',
    cutoverDate: '2025-03-15',
    createdAt: '2025-01-15',
    updatedAt: '2025-01-15',
    progress: 15,
    testsPassed: 0,
    testsTotal: 48,
  },
];

const demoTestCases: TestCase[] = [
  {
    id: '1',
    projectId: '1',
    title: 'Homepage Load Test',
    description: 'Verify homepage loads within 3 seconds',
    category: 'performance',
    priority: 'high',
    expectedResult: 'Page loads in under 3s',
    actualResult: 'Page loads in 2.4s',
    status: 'passed',
    assignedTo: 'user1',
    createdAt: '2025-01-15',
    updatedAt: '2025-01-18',
  },
  {
    id: '2',
    projectId: '1',
    title: 'Checkout Flow Validation',
    description: 'Complete checkout process from cart to confirmation',
    category: 'functional',
    priority: 'critical',
    expectedResult: 'Order placed successfully with confirmation email',
    status: 'in_progress',
    assignedTo: 'user2',
    createdAt: '2025-01-16',
    updatedAt: '2025-01-20',
  },
  {
    id: '3',
    projectId: '1',
    title: 'Mobile Responsive Design',
    description: 'Verify all pages display correctly on mobile devices',
    category: 'visual',
    priority: 'high',
    expectedResult: 'No layout breaks on mobile viewports',
    status: 'pending',
    createdAt: '2025-01-17',
    updatedAt: '2025-01-17',
  },
  {
    id: '4',
    projectId: '1',
    title: 'SSL Certificate Validation',
    description: 'Verify SSL is properly configured',
    category: 'security',
    priority: 'critical',
    expectedResult: 'Valid SSL with A+ rating',
    actualResult: 'SSL valid, A rating achieved',
    status: 'passed',
    assignedTo: 'user1',
    createdAt: '2025-01-14',
    updatedAt: '2025-01-15',
  },
  {
    id: '5',
    projectId: '2',
    title: 'Meta Tags Verification',
    description: 'Verify all meta tags are properly migrated',
    category: 'seo',
    priority: 'medium',
    expectedResult: 'All meta tags match source',
    status: 'failed',
    actualResult: 'Missing og:image on 5 pages',
    assignedTo: 'user3',
    createdAt: '2025-01-10',
    updatedAt: '2025-01-18',
  },
];

const demoURLRecords: URLRecord[] = [
  {
    id: '1',
    projectId: '1',
    url: '/home',
    pageType: 'Landing Page',
    statusCode: 200,
    consoleErrors: 0,
    brokenLinks: 0,
    accessibilityScore: 95,
    seoScore: 92,
    performanceScore: 88,
    testStatus: 'passed',
    lastTested: '2025-01-20',
  },
  {
    id: '2',
    projectId: '1',
    url: '/products',
    pageType: 'Category Page',
    statusCode: 200,
    consoleErrors: 2,
    brokenLinks: 1,
    accessibilityScore: 78,
    seoScore: 85,
    performanceScore: 72,
    testStatus: 'warning',
    lastTested: '2025-01-20',
  },
  {
    id: '3',
    projectId: '1',
    url: '/checkout',
    pageType: 'Transaction',
    statusCode: 200,
    consoleErrors: 0,
    brokenLinks: 0,
    accessibilityScore: 90,
    seoScore: 70,
    performanceScore: 95,
    testStatus: 'passed',
    lastTested: '2025-01-19',
  },
  {
    id: '4',
    projectId: '1',
    url: '/blog/old-post',
    pageType: 'Content',
    statusCode: 404,
    consoleErrors: 5,
    brokenLinks: 3,
    accessibilityScore: 0,
    seoScore: 0,
    performanceScore: 0,
    testStatus: 'failed',
    notes: 'Redirect not implemented',
    lastTested: '2025-01-20',
  },
];

const demoActivities: Activity[] = [
  { id: '1', type: 'test_passed', description: 'Homepage Load Test passed', timestamp: '2025-01-20T14:30:00Z', projectId: '1' },
  { id: '2', type: 'url_scanned', description: '24 new URLs scanned for E-Commerce Platform', timestamp: '2025-01-20T12:15:00Z', projectId: '1' },
  { id: '3', type: 'test_failed', description: 'Meta Tags Verification failed', timestamp: '2025-01-18T16:45:00Z', projectId: '2' },
  { id: '4', type: 'project_created', description: 'API Gateway Migration project created', timestamp: '2025-01-15T09:00:00Z', projectId: '3' },
  { id: '5', type: 'report_generated', description: 'Executive summary generated', timestamp: '2025-01-14T11:30:00Z', projectId: '2' },
];

const currentUser: User = {
  id: 'user1',
  name: 'Sarah Chen',
  email: 'sarah.chen@example.com',
  role: 'admin',
  avatar: undefined,
};

interface AppState {
  // Data
  projects: Project[];
  testCases: TestCase[];
  urlRecords: URLRecord[];
  activities: Activity[];
  currentUser: User;
  
  // UI State
  sidebarOpen: boolean;
  selectedProjectId: string | null;
  
  // Computed
  getKPIs: () => DashboardKPIs;
  getProjectById: (id: string) => Project | undefined;
  getTestCasesByProject: (projectId: string) => TestCase[];
  getURLRecordsByProject: (projectId: string) => URLRecord[];
  
  // Actions
  setSidebarOpen: (open: boolean) => void;
  setSelectedProjectId: (id: string | null) => void;
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'progress' | 'testsPassed' | 'testsTotal'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addTestCase: (testCase: Omit<TestCase, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateTestCase: (id: string, updates: Partial<TestCase>) => void;
  deleteTestCase: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial Data
  projects: demoProjects,
  testCases: demoTestCases,
  urlRecords: demoURLRecords,
  activities: demoActivities,
  currentUser,
  
  // UI State
  sidebarOpen: true,
  selectedProjectId: null,
  
  // Computed
  getKPIs: () => {
    const { projects, testCases, urlRecords } = get();
    const activeProjects = projects.filter(p => p.status === 'in_progress' || p.status === 'testing').length;
    const testsCompleted = testCases.filter(t => t.status === 'passed' || t.status === 'failed').length;
    const testsPassed = testCases.filter(t => t.status === 'passed').length;
    const issuesFound = urlRecords.filter(u => u.testStatus === 'failed' || u.testStatus === 'warning').length;
    
    return {
      totalProjects: projects.length,
      activeProjects,
      testsCompleted,
      testsPassed,
      urlsScanned: urlRecords.length,
      issuesFound,
    };
  },
  
  getProjectById: (id) => get().projects.find(p => p.id === id),
  getTestCasesByProject: (projectId) => get().testCases.filter(t => t.projectId === projectId),
  getURLRecordsByProject: (projectId) => get().urlRecords.filter(u => u.projectId === projectId),
  
  // Actions
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  
  addProject: (projectData) => {
    const newProject: Project = {
      ...projectData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 0,
      testsPassed: 0,
      testsTotal: 0,
    };
    set(state => ({ 
      projects: [...state.projects, newProject],
      activities: [
        { id: Date.now().toString(), type: 'project_created', description: `${newProject.name} project created`, timestamp: new Date().toISOString(), projectId: newProject.id },
        ...state.activities
      ]
    }));
  },
  
  updateProject: (id, updates) => {
    set(state => ({
      projects: state.projects.map(p => p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p)
    }));
  },
  
  deleteProject: (id) => {
    set(state => ({
      projects: state.projects.filter(p => p.id !== id),
      testCases: state.testCases.filter(t => t.projectId !== id),
      urlRecords: state.urlRecords.filter(u => u.projectId !== id),
    }));
  },
  
  addTestCase: (testCaseData) => {
    const newTestCase: TestCase = {
      ...testCaseData,
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set(state => ({ testCases: [...state.testCases, newTestCase] }));
  },
  
  updateTestCase: (id, updates) => {
    set(state => ({
      testCases: state.testCases.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)
    }));
  },
  
  deleteTestCase: (id) => {
    set(state => ({
      testCases: state.testCases.filter(t => t.id !== id)
    }));
  },
}));
