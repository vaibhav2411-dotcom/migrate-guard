import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { Activity, RefreshCw, FileText, Search, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { listRuns, listRunArtifacts, listJobs, getRunTrends, RunDto, RunArtifactDto, JobDto } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RunWithContext = RunDto & {
  artifacts: RunArtifactDto[];
  job?: JobDto;
};

function statusClass(status: RunDto['status']) {
  if (status === 'completed') return 'bg-success/10 text-success';
  if (status === 'running') return 'bg-primary/10 text-primary';
  if (status === 'failed') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

const statusFilters: Array<'all' | RunDto['status']> = ['all', 'queued', 'running', 'completed', 'failed'];

export default function RunsPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | RunDto['status']>('all');
  const [query, setQuery] = useState('');

  const runsQuery = useQuery({
    queryKey: ['runs-hub'],
    queryFn: async (): Promise<RunWithContext[]> => {
      const [runs, jobs] = await Promise.all([listRuns(), listJobs()]);
      const artifactsEntries = await Promise.all(
        runs.map(async (run) => ({
          runId: run.id,
          artifacts: await listRunArtifacts(run.id),
        }))
      );

      const artifactByRun = new Map(artifactsEntries.map((e) => [e.runId, e.artifacts]));
      return runs
        .slice()
        .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())
        .map((run) => ({
          ...run,
          artifacts: artifactByRun.get(run.id) ?? [],
          job: jobs.find((job) => job.id === run.jobId),
        }));
    },
    refetchInterval: (queryData) => {
      const data = queryData.state.data ?? [];
      const hasActive = data.some((run: RunWithContext) => run.status === 'queued' || run.status === 'running');
      return hasActive ? 3000 : false;
    },
  });

  const trendsQuery = useQuery({
    queryKey: ['runs-trends'],
    queryFn: () => getRunTrends({ limit: 20 }),
    refetchInterval: 10000,
  });

  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const trendAggregates = trendsQuery.data?.aggregates;
  const trendIcon = trendAggregates?.riskTrend === 'improved'
    ? TrendingDown
    : trendAggregates?.riskTrend === 'regressed'
      ? TrendingUp
      : Minus;
  const TrendIcon = trendIcon;

  const filteredRuns = useMemo(() => {
    return runs.filter((run) => {
      if (statusFilter !== 'all' && run.status !== statusFilter) {
        return false;
      }
      if (!query.trim()) {
        return true;
      }
      const q = query.toLowerCase();
      return (
        run.id.toLowerCase().includes(q) ||
        run.jobId.toLowerCase().includes(q) ||
        (run.job?.name ?? '').toLowerCase().includes(q) ||
        (run.job?.baselineUrl ?? '').toLowerCase().includes(q) ||
        (run.job?.candidateUrl ?? '').toLowerCase().includes(q)
      );
    });
  }, [runs, statusFilter, query]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Run Hub</h1>
          <p className="text-muted-foreground">Monitor migration audits, inspect artifacts, and open report evidence.</p>
        </div>
        <Button
          variant="outline"
          onClick={() => runsQuery.refetch()}
          disabled={runsQuery.isFetching}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${runsQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">completed runs</p>
            <p className="text-2xl font-semibold">{trendAggregates?.completedRuns ?? 0}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">average risk</p>
            <p className="text-2xl font-semibold">{trendAggregates?.avgRiskScore ?? '-'}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">latest risk</p>
            <p className="text-2xl font-semibold">{trendAggregates?.latestRiskScore ?? '-'}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-xs text-muted-foreground">risk trend</p>
            <p className="text-sm font-medium flex items-center gap-2 capitalize">
              <TrendIcon className="w-4 h-4" />
              {trendAggregates?.riskTrend ?? 'unknown'}
              {typeof trendAggregates?.riskDeltaVsPrevious === 'number' && (
                <span className="text-muted-foreground">({trendAggregates.riskDeltaVsPrevious > 0 ? '+' : ''}{trendAggregates.riskDeltaVsPrevious})</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search run/job/url"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {statusFilters.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={statusFilter === status ? 'default' : 'outline'}
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </Button>
            ))}
          </div>
        </div>

        {runsQuery.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading run activity...</p>
        ) : filteredRuns.length === 0 ? (
          <p className="text-muted-foreground text-sm">No runs matched your filters.</p>
        ) : (
          <div className="space-y-3">
            {filteredRuns.map((run) => {
              const reportCount = run.artifacts.filter((a) => a.type === 'report').length;
              const screenshotCount = run.artifacts.filter((a) => a.type === 'screenshot').length;
              const logCount = run.artifacts.filter((a) => a.type === 'log').length;

              return (
                <div key={run.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={statusClass(run.status)}>{run.status}</Badge>
                        <span className="text-xs text-muted-foreground font-mono">run: {run.id}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-muted-foreground">Job:</span>{' '}
                        <span className="font-medium">{run.job?.name ?? run.jobId}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Triggered {formatDistanceToNow(new Date(run.triggeredAt), { addSuffix: true })} by {run.triggeredBy}
                      </div>
                      {run.job && (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>Baseline: {run.job.baselineUrl}</div>
                          <div>Candidate: {run.job.candidateUrl}</div>
                        </div>
                      )}
                    </div>

                    <div className="lg:text-right space-y-2">
                      <div className="flex flex-wrap gap-1 lg:justify-end">
                        <Badge variant="outline">reports: {reportCount}</Badge>
                        <Badge variant="outline">screens: {screenshotCount}</Badge>
                        <Badge variant="outline">logs: {logCount}</Badge>
                      </div>
                      <div className="flex items-center gap-2 lg:justify-end">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/runs/${run.id}`}>
                            <Activity className="w-4 h-4 mr-1" />
                            View Run
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/reports?runId=${encodeURIComponent(run.id)}`}>
                            <FileText className="w-4 h-4 mr-1" />
                            Reports
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
