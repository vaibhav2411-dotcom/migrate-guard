import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  Clock,
  RefreshCw,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const demoDataChecks = [
  { id: '1', sourceTable: 'users', targetTable: 'users', rowCountDiff: 0, checksumMatch: true, status: 'passed' as const },
  { id: '2', sourceTable: 'products', targetTable: 'products', rowCountDiff: -3, checksumMatch: false, status: 'failed' as const },
  { id: '3', sourceTable: 'orders', targetTable: 'orders', rowCountDiff: 0, checksumMatch: true, status: 'passed' as const },
  { id: '4', sourceTable: 'categories', targetTable: 'categories', rowCountDiff: 0, checksumMatch: true, status: 'passed' as const },
  { id: '5', sourceTable: 'reviews', targetTable: 'reviews', rowCountDiff: 12, checksumMatch: false, status: 'failed' as const },
  { id: '6', sourceTable: 'inventory', targetTable: 'inventory', rowCountDiff: 0, checksumMatch: false, status: 'pending' as const },
];

const statusConfig = {
  passed: { icon: CheckCircle2, color: 'text-success bg-success/10', label: 'Passed' },
  failed: { icon: XCircle, color: 'text-destructive bg-destructive/10', label: 'Failed' },
  pending: { icon: Clock, color: 'text-muted-foreground bg-muted', label: 'Pending' },
};

export default function DataValidationPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Data Validation</h1>
          <p className="text-muted-foreground">
            Compare and validate data integrity between source and target systems
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
          <Button>
            <RefreshCw className="w-4 h-4 mr-2" />
            Run Validation
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-success/5 border border-success/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-success/10">
              <CheckCircle2 className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">4</p>
              <p className="text-sm text-muted-foreground">Tables Matched</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-destructive/5 border border-destructive/20 rounded-xl p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-destructive/10">
              <XCircle className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">2</p>
              <p className="text-sm text-muted-foreground">Tables with Issues</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="bg-muted border border-border rounded-xl p-6"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-muted">
              <Database className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">6</p>
              <p className="text-sm text-muted-foreground">Total Tables</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Data Checks Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-card rounded-xl border border-border overflow-hidden"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source Table</TableHead>
              <TableHead>Target Table</TableHead>
              <TableHead>Row Count Diff</TableHead>
              <TableHead>Checksum Match</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {demoDataChecks.map((check) => {
              const StatusIcon = statusConfig[check.status].icon;
              return (
                <TableRow key={check.id}>
                  <TableCell>
                    <span className="font-mono text-sm">{check.sourceTable}</span>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm">{check.targetTable}</span>
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      'font-mono text-sm',
                      check.rowCountDiff === 0 ? 'text-success' : 'text-destructive'
                    )}>
                      {check.rowCountDiff === 0 ? '0' : check.rowCountDiff > 0 ? `+${check.rowCountDiff}` : check.rowCountDiff}
                    </span>
                  </TableCell>
                  <TableCell>
                    {check.checksumMatch ? (
                      <Badge className="bg-success/10 text-success">Match</Badge>
                    ) : (
                      <Badge className="bg-destructive/10 text-destructive">Mismatch</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
                      statusConfig[check.status].color
                    )}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {statusConfig[check.status].label}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </motion.div>
    </div>
  );
}
