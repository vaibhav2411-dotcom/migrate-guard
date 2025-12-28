import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Download, 
  Plus,
  Calendar,
  FileBarChart,
  FileCheck,
  FileClock
} from 'lucide-react';
import { format } from 'date-fns';

const demoReports = [
  { 
    id: '1', 
    type: 'executive' as const, 
    name: 'Executive Summary - E-Commerce Migration',
    generatedAt: '2025-01-20T14:30:00Z',
    projectName: 'E-Commerce Platform Migration'
  },
  { 
    id: '2', 
    type: 'go_live' as const, 
    name: 'Go-Live Readiness Checklist',
    generatedAt: '2025-01-18T10:15:00Z',
    projectName: 'Corporate Website Redesign'
  },
  { 
    id: '3', 
    type: 'detailed' as const, 
    name: 'Detailed Test Results Report',
    generatedAt: '2025-01-15T16:45:00Z',
    projectName: 'E-Commerce Platform Migration'
  },
  { 
    id: '4', 
    type: 'summary' as const, 
    name: 'Weekly Summary Report',
    generatedAt: '2025-01-14T09:00:00Z',
    projectName: 'API Gateway Migration'
  },
];

const reportTypeConfig = {
  executive: { icon: FileBarChart, color: 'bg-primary/10 text-primary', label: 'Executive' },
  go_live: { icon: FileCheck, color: 'bg-success/10 text-success', label: 'Go-Live' },
  detailed: { icon: FileText, color: 'bg-chart-3/10 text-chart-3', label: 'Detailed' },
  summary: { icon: FileClock, color: 'bg-chart-5/10 text-chart-5', label: 'Summary' },
};

export default function ReportsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Generate and manage migration testing reports
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Generate Report
        </Button>
      </div>

      {/* Report Types */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Object.entries(reportTypeConfig).map(([type, config], index) => {
          const Icon = config.icon;
          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="bg-card rounded-xl border border-border p-6 cursor-pointer hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div className={`p-3 rounded-xl ${config.color} w-fit mb-4`}>
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-medium capitalize">{config.label} Report</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {type === 'executive' && 'High-level overview for stakeholders'}
                {type === 'go_live' && 'Pre-launch readiness checklist'}
                {type === 'detailed' && 'Comprehensive test results'}
                {type === 'summary' && 'Periodic progress summary'}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Generated Reports */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card rounded-xl border border-border"
      >
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold">Generated Reports</h3>
        </div>
        <div className="divide-y divide-border">
          {demoReports.map((report) => {
            const config = reportTypeConfig[report.type];
            const Icon = config.icon;
            
            return (
              <div 
                key={report.id}
                className="p-6 flex items-center justify-between hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${config.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium">{report.name}</h4>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span>{report.projectName}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(report.generatedAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
