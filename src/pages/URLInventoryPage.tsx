import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, 
  Search, 
  Filter,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { URLTestStatus } from '@/lib/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const statusConfig: Record<URLTestStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  passed: { icon: CheckCircle2, color: 'text-success bg-success/10', label: 'Passed' },
  failed: { icon: XCircle, color: 'text-destructive bg-destructive/10', label: 'Failed' },
  warning: { icon: AlertTriangle, color: 'text-warning bg-warning/10', label: 'Warning' },
  pending: { icon: Clock, color: 'text-muted-foreground bg-muted', label: 'Pending' },
};

function ScoreBar({ value, label }: { value: number; label: string }) {
  const getColor = (score: number) => {
    if (score >= 90) return 'bg-success';
    if (score >= 70) return 'bg-chart-3';
    if (score >= 50) return 'bg-warning';
    return 'bg-destructive';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn('font-medium', value >= 70 ? 'text-foreground' : 'text-destructive')}>
          {value}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div 
          className={cn('h-full rounded-full transition-all', getColor(value))}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export default function URLInventoryPage() {
  const { urlRecords, projects } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const filteredURLs = urlRecords.filter((url) => {
    const matchesSearch = url.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      url.pageType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || url.testStatus === statusFilter;
    const matchesProject = projectFilter === 'all' || url.projectId === projectFilter;
    return matchesSearch && matchesStatus && matchesProject;
  });

  const getProjectName = (projectId: string) => {
    return projects.find(p => p.id === projectId)?.name || 'Unknown';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">URL Inventory</h1>
          <p className="text-muted-foreground">
            Track and validate all URLs across your migration projects
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Import URLs
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search URLs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(statusConfig).map(([value, config]) => (
              <SelectItem key={value} value={value}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* URL Records Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-card rounded-xl border border-border overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>URL</TableHead>
              <TableHead>Page Type</TableHead>
              <TableHead>Status Code</TableHead>
              <TableHead>Errors</TableHead>
              <TableHead className="w-[200px]">Scores</TableHead>
              <TableHead>Test Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredURLs.map((url) => {
              const StatusIcon = statusConfig[url.testStatus].icon;
              return (
                <TableRow key={url.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{url.url}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{url.pageType}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      'font-mono text-sm',
                      url.statusCode === 200 ? 'text-success' : 
                      url.statusCode >= 400 ? 'text-destructive' : 'text-warning'
                    )}>
                      {url.statusCode}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3 text-sm">
                      <span className={cn(
                        url.consoleErrors > 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {url.consoleErrors} console
                      </span>
                      <span className={cn(
                        url.brokenLinks > 0 ? 'text-destructive' : 'text-muted-foreground'
                      )}>
                        {url.brokenLinks} links
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2 min-w-[180px]">
                      <ScoreBar value={url.performanceScore} label="Performance" />
                      <ScoreBar value={url.seoScore} label="SEO" />
                      <ScoreBar value={url.accessibilityScore} label="A11y" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                      statusConfig[url.testStatus].color
                    )}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusConfig[url.testStatus].label}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {filteredURLs.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No URLs found</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
