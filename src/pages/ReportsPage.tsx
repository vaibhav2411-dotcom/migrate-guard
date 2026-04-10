import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Download, FileText, Search } from 'lucide-react';
import { listRuns, getRunSummary, runReportUrls, RunDto, RunSummaryDto } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type SummaryByRun = Record<string, RunSummaryDto | null>;

function useQueryParam(name: string) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  return params.get(name);
}

function statusTone(status: RunDto['status']) {
  if (status === 'completed') return 'bg-success/10 text-success';
  if (status === 'failed') return 'bg-destructive/10 text-destructive';
  if (status === 'running') return 'bg-primary/10 text-primary';
  return 'bg-muted text-muted-foreground';
}

export default function ReportsPage() {
  const [search, setSearch] = useState('');
  const requestedRunId = useQueryParam('runId');

  const runsQuery = useQuery({
    queryKey: ['reports-runs'],
    queryFn: async () => {
      const runs = await listRuns();
      return runs
        .slice()
        .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
    },
  });

  const summaryQuery = useQuery({
    queryKey: ['reports-summary', runsQuery.data?.filter((r) => r.status === 'completed').map((r) => r.id).join(',')],
    enabled: Boolean(runsQuery.data && runsQuery.data.length > 0),
    queryFn: async (): Promise<SummaryByRun> => {
      const runs = (runsQuery.data ?? []).filter((run) => run.status === 'completed');
      const resultEntries = await Promise.all(
        runs.map(async (run) => {
          try {
            const summary = await getRunSummary(run.id);
            return [run.id, summary] as const;
          } catch {
            return [run.id, null] as const;
          }
        })
      );
      return Object.fromEntries(resultEntries);
    },
  });

  const runs = useMemo(() => runsQuery.data ?? [], [runsQuery.data]);
  const summaries = summaryQuery.data ?? {};

  const filteredRuns = useMemo(() => {
    const base = requestedRunId ? runs.filter((r) => r.id === requestedRunId) : runs;
    if (!search.trim()) return base;
    const q = search.toLowerCase();
    return base.filter((run) => run.id.toLowerCase().includes(q) || run.jobId.toLowerCase().includes(q));
  }, [runs, search, requestedRunId]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">Executive and technical reports generated from migration runs.</p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            placeholder="Search by run or job id"
          />
        </div>

        {runsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading run reports...</p>
        ) : filteredRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports found for current filters.</p>
        ) : (
          <div className="space-y-3">
            {filteredRuns.map((run) => {
              const reportUrls = runReportUrls(run.id);
              const summary = summaries[run.id];
              const riskScore = summary?.riskScore?.overall ?? summary?.executive?.riskScore;
              const decision = summary?.executive?.goNoGo;

              return (
                <div key={run.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className={statusTone(run.status)}>{run.status}</Badge>
                        <span className="text-xs text-muted-foreground font-mono">run: {run.id}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Triggered {formatDistanceToNow(new Date(run.triggeredAt), { addSuffix: true })}
                      </div>
                      <div className="text-sm text-muted-foreground">job: {run.jobId}</div>
                      <div className="flex flex-wrap gap-2">
                        {riskScore !== undefined && <Badge variant="outline">risk: {riskScore}</Badge>}
                        {decision && <Badge variant="outline">decision: {decision}</Badge>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <a href={reportUrls.executive} target="_blank" rel="noreferrer">
                          <FileText className="w-4 h-4 mr-1" />
                          Executive
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a href={reportUrls.technical} target="_blank" rel="noreferrer">
                          <Download className="w-4 h-4 mr-1" />
                          Technical JSON
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a href={reportUrls.html} target="_blank" rel="noreferrer">
                          <FileText className="w-4 h-4 mr-1" />
                          Interactive HTML
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <a href={reportUrls.summary} target="_blank" rel="noreferrer">
                          <Download className="w-4 h-4 mr-1" />
                          Summary JSON
                        </a>
                      </Button>
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
