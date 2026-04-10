import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, PlayCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { listJobs, listRuns, JobDto, RunDto } from '@/lib/api';
import { KPICard } from '@/components/dashboard/KPICard';
import { Button } from '@/components/ui/button';

type DashboardData = {
  jobs: JobDto[];
  runs: RunDto[];
};

export default function HomePage() {
  const [data, setData] = useState<DashboardData>({ jobs: [], runs: [] });
  const [isLoading, setIsLoading] = useState(true);

  async function loadData() {
    setIsLoading(true);
    try {
      const [jobs, runs] = await Promise.all([listJobs(), listRuns()]);
      setData({ jobs, runs });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const metrics = useMemo(() => {
    const totalJobs = data.jobs.length;
    const activeJobs = data.jobs.filter((j) => j.status === 'active').length;
    const completedRuns = data.runs.filter((r) => r.status === 'completed').length;
    const failedRuns = data.runs.filter((r) => r.status === 'failed').length;
    return { totalJobs, activeJobs, completedRuns, failedRuns };
  }, [data.jobs, data.runs]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Migration Audit Dashboard</h1>
          <p className="text-muted-foreground">
            Live overview of production-vs-stage audit activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to="/runs">View Runs</Link>
          </Button>
          <Button asChild>
            <Link to="/projects">Create/Manage Jobs</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Total Jobs" value={metrics.totalJobs} icon={FolderKanban} variant="default" />
        <KPICard title="Active Jobs" value={metrics.activeJobs} icon={PlayCircle} variant="primary" />
        <KPICard title="Completed Runs" value={metrics.completedRuns} icon={CheckCircle2} variant="success" />
        <KPICard
          title="Failed Runs"
          value={metrics.failedRuns}
          icon={AlertTriangle}
          variant={metrics.failedRuns > 0 ? 'warning' : 'success'}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold text-lg">Current Focus</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Use Jobs to configure baseline and candidate URLs, then trigger Runs to generate crawl,
          visual, functional, data-integrity, SEO, performance, and report artifacts.
        </p>
        <div className="mt-4 text-sm text-muted-foreground">
          {isLoading ? 'Refreshing live data...' : `Loaded ${data.jobs.length} jobs and ${data.runs.length} runs.`}
        </div>
      </div>
    </div>
  );
}
