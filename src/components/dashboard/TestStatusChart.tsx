import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { useAppStore } from '@/lib/store';

export function TestStatusChart() {
  const { testCases } = useAppStore();

  const statusCounts = testCases.reduce((acc, test) => {
    acc[test.status] = (acc[test.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const data = [
    { name: 'Passed', value: statusCounts.passed || 0, color: 'hsl(142.1, 76.2%, 36.3%)' },
    { name: 'Failed', value: statusCounts.failed || 0, color: 'hsl(0, 84.2%, 60.2%)' },
    { name: 'In Progress', value: statusCounts.in_progress || 0, color: 'hsl(221.2, 83.2%, 53.3%)' },
    { name: 'Pending', value: statusCounts.pending || 0, color: 'hsl(215.4, 16.3%, 70%)' },
    { name: 'Blocked', value: statusCounts.blocked || 0, color: 'hsl(43, 74%, 66%)' },
  ].filter(d => d.value > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="bg-card rounded-xl border border-border p-6"
    >
      <h3 className="text-lg font-semibold mb-4">Test Status Distribution</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend 
              verticalAlign="bottom" 
              height={36}
              formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
