import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { useNavigate } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ProjectStatus } from '@/lib/types';

const statusStyles: Record<ProjectStatus, string> = {
  planning: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  testing: 'bg-chart-3/10 text-chart-3',
  completed: 'bg-success/10 text-success',
  on_hold: 'bg-warning/10 text-warning-foreground',
};

const statusLabels: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  testing: 'Testing',
  completed: 'Completed',
  on_hold: 'On Hold',
};

export function ProjectsOverview() {
  const { projects } = useAppStore();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="bg-card rounded-xl border border-border p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Active Projects</h3>
        <button 
          onClick={() => navigate('/projects')}
          className="text-sm text-primary hover:underline"
        >
          View all
        </button>
      </div>
      <div className="space-y-4">
        {projects.slice(0, 3).map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            onClick={() => navigate(`/projects/${project.id}`)}
            className="p-4 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-muted/30 transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <h4 className="font-medium text-sm">{project.name}</h4>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>Cutover: {format(new Date(project.cutoverDate), 'MMM d, yyyy')}</span>
                </div>
              </div>
              <Badge className={cn('text-xs', statusStyles[project.status])}>
                {statusLabels[project.status]}
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="h-1.5" />
            </div>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>{project.testsPassed}/{project.testsTotal} tests passed</span>
              <ExternalLink className="w-3 h-3" />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
