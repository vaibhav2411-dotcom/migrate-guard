import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardCheck,
  Link2,
  Database,
  FileText,
  Activity,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/projects', icon: FolderKanban, label: 'Projects' },
  { path: '/tests', icon: ClipboardCheck, label: 'Test Cases' },
  { path: '/urls', icon: Link2, label: 'URL Inventory' },
  { path: '/data', icon: Database, label: 'Data Validation' },
  { path: '/reports', icon: FileText, label: 'Reports' },
  { path: '/runs', icon: Activity, label: 'Runs' },
];

const bottomNavItems = [
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function AppSidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore();

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 256 : 72 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col z-50"
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border">
        <motion.div
          initial={false}
          animate={{ opacity: sidebarOpen ? 1 : 0 }}
          className="flex items-center gap-2 overflow-hidden"
        >
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          {sidebarOpen && (
            <span className="font-semibold text-sidebar-foreground whitespace-nowrap">
              MigrateGuard
            </span>
          )}
        </motion.div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
        >
          {sidebarOpen ? (
            <ChevronLeft className="w-4 h-4 text-sidebar-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-sidebar-foreground" />
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'nav-item',
                isActive && 'nav-item-active',
                !sidebarOpen && 'justify-center px-2'
              )
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap"
              >
                {item.label}
              </motion.span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom Navigation */}
      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        {bottomNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'nav-item',
                isActive && 'nav-item-active',
                !sidebarOpen && 'justify-center px-2'
              )
            }
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && (
              <span className="whitespace-nowrap">{item.label}</span>
            )}
          </NavLink>
        ))}
      </div>
    </motion.aside>
  );
}
