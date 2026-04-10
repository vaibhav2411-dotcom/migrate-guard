import { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { Plus, Search, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createJob, listJobs, listRuns, triggerRun, JobDto, RunDto } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

type JobWithRun = JobDto & {
  latestRun?: RunDto;
  totalRuns: number;
};

function statusTone(status: JobDto['status']) {
  if (status === 'active') return 'bg-primary/10 text-primary';
  if (status === 'completed') return 'bg-success/10 text-success';
  if (status === 'failed') return 'bg-destructive/10 text-destructive';
  return 'bg-muted text-muted-foreground';
}

export default function ProjectsPage() {
  const [jobs, setJobs] = useState<JobWithRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newJob, setNewJob] = useState({
    name: '',
    description: '',
    baselineUrl: '',
    candidateUrl: '',
  });

  async function loadData() {
    setIsLoading(true);
    try {
      const [rawJobs, runs] = await Promise.all([listJobs(), listRuns()]);
      const mapped = rawJobs.map((job) => {
        const runList = runs.filter((r) => r.jobId === job.id);
        const latestRun = runList
          .slice()
          .sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime())[0];
        return {
          ...job,
          latestRun,
          totalRuns: runList.length,
        };
      });
      setJobs(mapped);
    } catch {
      toast({
        title: 'Failed to load jobs',
        description: 'Could not fetch jobs/runs from backend.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredJobs = useMemo(
    () =>
      jobs.filter(
        (job) =>
          job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (job.description ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.baselineUrl.toLowerCase().includes(searchQuery.toLowerCase()) ||
          job.candidateUrl.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [jobs, searchQuery]
  );

  const handleCreateJob = async () => {
    if (!newJob.name || !newJob.baselineUrl || !newJob.candidateUrl) {
      toast({
        title: 'Missing required fields',
        description: 'Name, baseline URL, and candidate URL are required.',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createJob(newJob);
      toast({ title: 'Job created', description: 'Migration audit job is ready to run.' });
      setIsDialogOpen(false);
      setNewJob({ name: '', description: '', baselineUrl: '', candidateUrl: '' });
      await loadData();
    } catch {
      toast({
        title: 'Job creation failed',
        description: 'Backend rejected the job request.',
        variant: 'destructive',
      });
    }
  };

  const handleTriggerRun = async (jobId: string) => {
    try {
      const run = await triggerRun(jobId, 'ui');
      toast({ title: 'Run triggered', description: `Run ${run.id} has been queued.` });
      await loadData();
    } catch {
      toast({
        title: 'Failed to trigger run',
        description: 'Could not start a backend run for this job.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground">
            Configure and run production vs staging migration audits.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Job
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Migration Audit Job</DialogTitle>
              <DialogDescription>
                Define baseline production URL and candidate staging URL.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Job Name</Label>
                <Input
                  id="name"
                  value={newJob.name}
                  onChange={(e) => setNewJob({ ...newJob, name: e.target.value })}
                  placeholder="Retail Site Migration - Wave 1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newJob.description}
                  onChange={(e) => setNewJob({ ...newJob, description: e.target.value })}
                  placeholder="Optional context for the migration audit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="baselineUrl">Baseline (Production) URL</Label>
                <Input
                  id="baselineUrl"
                  value={newJob.baselineUrl}
                  onChange={(e) => setNewJob({ ...newJob, baselineUrl: e.target.value })}
                  placeholder="https://www.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="candidateUrl">Candidate (Staging) URL</Label>
                <Input
                  id="candidateUrl"
                  value={newJob.candidateUrl}
                  onChange={(e) => setNewJob({ ...newJob, candidateUrl: e.target.value })}
                  placeholder="https://staging.example.com"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateJob}>Create Job</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or URL..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading jobs...</div>
      ) : filteredJobs.length === 0 ? (
        <div className="text-muted-foreground">No jobs found.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredJobs.map((job, index) => (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="rounded-xl border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{job.name}</h3>
                  {job.description && (
                    <p className="text-sm text-muted-foreground mt-1">{job.description}</p>
                  )}
                </div>
                <Badge className={statusTone(job.status)}>{job.status}</Badge>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Baseline:</span> {job.baselineUrl}
                </div>
                <div>
                  <span className="text-muted-foreground">Candidate:</span> {job.candidateUrl}
                </div>
                <div className="text-muted-foreground">
                  Runs: {job.totalRuns}
                  {job.latestRun ? ` • Last run ${formatDistanceToNow(new Date(job.latestRun.triggeredAt), { addSuffix: true })}` : ''}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => handleTriggerRun(job.id)}>
                  <PlayCircle className="w-4 h-4 mr-1" />
                  Trigger Run
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
