import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  MoreHorizontal,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  Clock,
  PlayCircle,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TestStatus, TestCategory, Priority } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const statusConfig: Record<TestStatus, { icon: typeof CheckCircle2; color: string; label: string }> = {
  passed: { icon: CheckCircle2, color: 'text-success bg-success/10', label: 'Passed' },
  failed: { icon: XCircle, color: 'text-destructive bg-destructive/10', label: 'Failed' },
  in_progress: { icon: PlayCircle, color: 'text-primary bg-primary/10', label: 'In Progress' },
  pending: { icon: Clock, color: 'text-muted-foreground bg-muted', label: 'Pending' },
  blocked: { icon: AlertCircle, color: 'text-warning bg-warning/10', label: 'Blocked' },
};

const categoryColors: Record<TestCategory, string> = {
  functional: 'bg-chart-1/10 text-chart-1',
  visual: 'bg-chart-5/10 text-chart-5',
  performance: 'bg-chart-3/10 text-chart-3',
  security: 'bg-destructive/10 text-destructive',
  seo: 'bg-chart-2/10 text-chart-2',
  accessibility: 'bg-primary/10 text-primary',
};

const priorityColors: Record<Priority, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-primary/10 text-primary',
  high: 'bg-warning/10 text-warning-foreground',
  critical: 'bg-destructive/10 text-destructive',
};

export default function TestCasesPage() {
  const { testCases, projects, updateTestCase, deleteTestCase } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const filteredTests = testCases.filter((test) => {
    const matchesSearch = test.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      test.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || test.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || test.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getProjectName = (projectId: string) => {
    return projects.find(p => p.id === projectId)?.name || 'Unknown';
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Test Cases</h1>
          <p className="text-muted-foreground">
            Manage and track your test cases across all projects
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Test Case
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search test cases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="functional">Functional</SelectItem>
            <SelectItem value="visual">Visual</SelectItem>
            <SelectItem value="performance">Performance</SelectItem>
            <SelectItem value="security">Security</SelectItem>
            <SelectItem value="seo">SEO</SelectItem>
            <SelectItem value="accessibility">Accessibility</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Test Cases Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-card rounded-xl border border-border overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Test Case</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTests.map((test) => {
              const StatusIcon = statusConfig[test.status].icon;
              return (
                <TableRow key={test.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{test.title}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {test.description}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {getProjectName(test.projectId)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('capitalize', categoryColors[test.category])}>
                      {test.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('capitalize', priorityColors[test.priority])}>
                      {test.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                      statusConfig[test.status].color
                    )}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusConfig[test.status].label}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          className="text-destructive"
                          onClick={() => deleteTestCase(test.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {filteredTests.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No test cases found</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
