import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { formatDistanceToNow } from 'date-fns';
import { 
  FolderPlus, 
  CheckCircle2, 
  XCircle, 
  Scan, 
  FileText,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

const activityIcons: Record<string, { icon: LucideIcon; color: string }> = {
  project_created: { icon: FolderPlus, color: 'text-primary bg-primary/10' },
  test_passed: { icon: CheckCircle2, color: 'text-success bg-success/10' },
  test_failed: { icon: XCircle, color: 'text-destructive bg-destructive/10' },
  url_scanned: { icon: Scan, color: 'text-chart-3 bg-chart-3/10' },
  report_generated: { icon: FileText, color: 'text-chart-5 bg-chart-5/10' },
};

export function RecentActivity() {
  const { activities } = useAppStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="bg-card rounded-xl border border-border p-6"
    >
      <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
      <div className="space-y-4">
        {activities.slice(0, 5).map((activity, index) => {
          const { icon: Icon, color } = activityIcons[activity.type] || activityIcons.project_created;
          
          return (
            <motion.div
              key={activity.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              className="flex items-start gap-3"
            >
              <div className={cn('p-2 rounded-lg flex-shrink-0', color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{activity.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
