import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, 
  Search, 
  ExternalLink, 
  Calendar,
  MoreHorizontal,
  Trash2,
  Edit
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { ProjectStatus } from '@/lib/types';
import { createJob } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

export default function ProjectsPage() {
  const { projects, addProject, deleteProject } = useAppStore();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    sourceUrl: '',
    targetUrl: '',
    status: 'planning' as ProjectStatus,
    startDate: '',
    cutoverDate: '',
  });

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateProject = async () => {
    if (newProject.name && newProject.sourceUrl && newProject.targetUrl) {
      addProject(newProject);

      try {
        await createJob({
          name: newProject.name,
          description: newProject.description || undefined,
          sourceUrl: newProject.sourceUrl,
          targetUrl: newProject.targetUrl,
        });
        toast({
          title: 'Backend job created',
          description: 'Control plane received this migration project.',
        });
      } catch (error) {
        // Frontend state is already updated; surfacing a non-blocking error is enough.
        toast({
          title: 'Backend sync failed',
          description: 'Project was created locally, but backend job creation failed.',
          variant: 'destructive',
        });
      }

      setIsDialogOpen(false);
      setNewProject({
        name: '',
        description: '',
        sourceUrl: '',
        targetUrl: '',
        status: 'planning',
        startDate: '',
        cutoverDate: '',
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage your website migration projects
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Set up a new website migration project
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="E-Commerce Platform Migration"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Brief description of the migration project..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sourceUrl">Source URL</Label>
                  <Input
                    id="sourceUrl"
                    value={newProject.sourceUrl}
                    onChange={(e) => setNewProject({ ...newProject, sourceUrl: e.target.value })}
                    placeholder="https://old.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="targetUrl">Target URL</Label>
                  <Input
                    id="targetUrl"
                    value={newProject.targetUrl}
                    onChange={(e) => setNewProject({ ...newProject, targetUrl: e.target.value })}
                    placeholder="https://new.example.com"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={newProject.startDate}
                    onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cutoverDate">Cutover Date</Label>
                  <Input
                    id="cutoverDate"
                    type="date"
                    value={newProject.cutoverDate}
                    onChange={(e) => setNewProject({ ...newProject, cutoverDate: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={newProject.status}
                  onValueChange={(value: ProjectStatus) => setNewProject({ ...newProject, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateProject}>Create Project</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredProjects.map((project, index) => (
          <motion.div
            key={project.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05 }}
            className="bg-card rounded-xl border border-border p-6 hover:shadow-lg hover:border-primary/30 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg group-hover:text-primary transition-colors">
                  {project.name}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {project.description}
                </p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => navigate(`/projects/${project.id}`)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-destructive"
                    onClick={() => deleteProject(project.id)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Badge className={cn('mb-4', statusStyles[project.status])}>
              {statusLabels[project.status]}
            </Badge>

            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{project.progress}%</span>
              </div>
              <Progress value={project.progress} className="h-2" />
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span>Cutover: {format(new Date(project.cutoverDate), 'MMM d')}</span>
              </div>
              <span>{project.testsPassed}/{project.testsTotal} tests</span>
            </div>

            <div className="pt-4 border-t border-border flex items-center justify-between">
              <div className="text-xs font-mono text-muted-foreground truncate max-w-[150px]">
                {project.targetUrl}
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                View Details
                <ExternalLink className="w-3 h-3 ml-1" />
              </Button>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No projects found</p>
        </div>
      )}
    </div>
  );
}
