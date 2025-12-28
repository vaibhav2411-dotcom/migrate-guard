import { useQuery } from '@tanstack/react-query';
import { listRuns, listRunArtifacts, RunDto, RunArtifactDto } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Calendar, PlayCircle, Activity } from 'lucide-react';
import { format } from 'date-fns';

function statusVariant(status: RunDto['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-success/10 text-success';
    case 'running':
      return 'bg-primary/10 text-primary';
    case 'failed':
      return 'bg-destructive/10 text-destructive';
    case 'queued':
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function RunsPage() {
  const runsQuery = useQuery({
    queryKey: ['runs'],
    queryFn: () => listRuns(),
  });

  const artifactsQuery = useQuery({
    queryKey: ['run-artifacts'],
    queryFn: async () => {
      const runs = await listRuns();
      const allArtifacts: Record<string, RunArtifactDto[]> = {};
      await Promise.all(
        runs.map(async (run) => {
          allArtifacts[run.id] = await listRunArtifacts(run.id);
        }),
      );
      return allArtifacts;
    },
  });

  const isLoading = runsQuery.isLoading || artifactsQuery.isLoading;
  const runs = runsQuery.data ?? [];
  const artifactsByRun = artifactsQuery.data ?? {};

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Runs</h1>
          <p className="text-muted-foreground">
            View migration comparison runs and their artifacts metadata
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { runsQuery.refetch(); artifactsQuery.refetch(); }}>
          <Activity className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card className="p-4">
        {isLoading && <p className="text-muted-foreground text-sm">Loading runs...</p>}
        {!isLoading && runs.length === 0 && (
          <p className="text-muted-foreground text-sm">No runs have been triggered yet.</p>
        )}

        {!isLoading && runs.length > 0 && (
          <ScrollArea className="max-h-[480px] pr-4">
            <div className="space-y-3">
              {runs.map((run) => {
                const artifacts = artifactsByRun[run.id] ?? [];
                return (
                  <div
                    key={run.id}
                    className="border border-border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={statusVariant(run.status)}>
                          <PlayCircle className="w-3 h-3 mr-1" />
                          {run.status}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">
                          Job: {run.jobId}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {format(new Date(run.triggeredAt), 'MMM d, yyyy HH:mm')}
                        </span>
                        <span>Triggered by {run.triggeredBy}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-1 text-xs">
                      <span className="font-medium text-muted-foreground">Artifacts</span>
                      {artifacts.length === 0 && (
                        <span className="text-muted-foreground">No artifacts yet</span>
                      )}
                      {artifacts.length > 0 && (
                        <div className="flex flex-wrap gap-1 max-w-xs justify-end">
                          {artifacts.map((artifact) => (
                            <Badge key={artifact.id} variant="outline" className="text-[10px]">
                              {artifact.type}: {artifact.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}
