'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getProjects, getTasks } from '@/lib/api-client';
import { TimeAgo } from '@/components/TimeAgo';
import type { Project, Task } from '@/lib/types';

export default function ProjectsPage() {
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: getProjects,
  });

  const { data: allTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => getTasks(),
  });

  const getTaskCount = (projectId: string) => {
    return allTasks?.filter((t: Task) => t.project_id === projectId).length || 0;
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Projects</h1>
            <p className="text-muted-foreground">Manage your codebase projects</p>
          </div>
          <Link
            href="/projects/new"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
          >
            Add Project
          </Link>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : !projects || projects.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <div className="text-4xl mb-4">📁</div>
            <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first project to start managing agent tasks
            </p>
            <Link
              href="/projects/new"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity inline-block"
            >
              Create Project
            </Link>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-secondary/50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Repo Path</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Default Branch</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Tasks</th>
                  <th className="px-6 py-3 text-left text-sm font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {projects.map((project: Project) => (
                  <tr
                    key={project.id}
                    className="hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground font-mono">
                      {project.repo_path}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="bg-secondary px-2 py-1 rounded text-xs">
                        {project.default_branch}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">{getTaskCount(project.id)}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      <TimeAgo timestamp={project.created_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
