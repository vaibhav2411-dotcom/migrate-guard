import { useAppStore } from '@/lib/store';
import { KPICard } from '@/components/dashboard/KPICard';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { TestStatusChart } from '@/components/dashboard/TestStatusChart';
import { ProjectsOverview } from '@/components/dashboard/ProjectsOverview';
import { 
  FolderKanban, 
  PlayCircle, 
  CheckCircle2, 
  Link2, 
  AlertTriangle,
  TrendingUp 
} from 'lucide-react';

export default function HomePage() {
  const { getKPIs } = useAppStore();
  const kpis = getKPIs();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your migration testing progress
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KPICard
          title="Total Projects"
          value={kpis.totalProjects}
          icon={FolderKanban}
          variant="default"
        />
        <KPICard
          title="Active Projects"
          value={kpis.activeProjects}
          icon={PlayCircle}
          variant="primary"
        />
        <KPICard
          title="Tests Completed"
          value={kpis.testsCompleted}
          subtitle={`${kpis.testsPassed} passed`}
          icon={CheckCircle2}
          variant="success"
          trend={{ value: 12, isPositive: true }}
        />
        <KPICard
          title="URLs Scanned"
          value={kpis.urlsScanned}
          icon={Link2}
          variant="default"
        />
        <KPICard
          title="Issues Found"
          value={kpis.issuesFound}
          icon={AlertTriangle}
          variant={kpis.issuesFound > 0 ? 'warning' : 'success'}
        />
        <KPICard
          title="Pass Rate"
          value={`${Math.round((kpis.testsPassed / Math.max(kpis.testsCompleted, 1)) * 100)}%`}
          icon={TrendingUp}
          variant="primary"
        />
      </div>

      {/* Charts and Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TestStatusChart />
        <ProjectsOverview />
        <RecentActivity />
      </div>
    </div>
  );
}
