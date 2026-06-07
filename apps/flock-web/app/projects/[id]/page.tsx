'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getProject, getTasks } from '@/lib/api-client';
import { TaskStatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { useState } from 'react';
import type { Task } from '@/lib/types';

type StatusFilter = 'all' | 'active' | 'review' | 'done';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
  });

  const { data: allTasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => getTasks(projectId),
    refetchInterval: () => 5000,
  });

  if (projectLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto text-center py-8">
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <Link href="/projects" className="text-primary hover:underline">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const filteredTasks = allTasks?.filter((task: Task) => {
    switch (filter) {
      case 'active':
        return ['READY', 'RUNNING', 'AGENT_DONE', 'GATES_RUNNING'].includes(task.status);
      case 'review':
        return task.status === 'REVIEW_REQUIRED';
      case 'done':
        return ['MERGED', 'ARCHIVED', 'REJECTED'].includes(task.status);
      default:
        return true;
    }
  }) || [];

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Projects
          </Link>
          <div className="flex items-start justify-between mt-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{project.name}</h1>
              <p className="text-muted-foreground font-mono text-sm">{project.repo_path}</p>
            </div>
            <Link
              href={`/tasks/new?projectId=${projectId}`}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
            >
              Create Task
            </Link>
          </div>
          <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span>Branch: {project.default_branch}</span>
            <span>•</span>
            <span>Created <TimeAgo timestamp={project.created_at} /></span>
          </div>
        </div>

        {/* Task Filters */}
        <div className="mb-6">
          <div className="flex gap-2 border-b border-border">
            <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
              All ({allTasks?.length || 0})
            </FilterButton>
            <FilterButton active={filter === 'active'} onClick={() => setFilter('active')}>
              Active ({allTasks?.filter((t: Task) => ['READY', 'RUNNING', 'AGENT_DONE', 'GATES_RUNNING'].includes(t.status)).length || 0})
            </FilterButton>
            <FilterButton active={filter === 'review'} onClick={() => setFilter('review')}>
              Review ({allTasks?.filter((t: Task) => t.status === 'REVIEW_REQUIRED').length || 0})
            </FilterButton>
            <FilterButton active={filter === 'done'} onClick={() => setFilter('done')}>
              Done ({allTasks?.filter((t: Task) => ['MERGED', 'ARCHIVED', 'REJECTED'].includes(t.status)).length || 0})
            </FilterButton>
          </div>
        </div>

        {/* Tasks */}
        {tasksLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading tasks...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <EmptyState message={`No ${filter === 'all' ? '' : filter} tasks for this project`} />
            <Link
              href={`/tasks/new?projectId=${projectId}`}
              className="mt-4 bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity inline-block"
            >
              Create Task
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task: Task) => (
              <Link
                key={task.id}
                href={`/tasks/${task.id}`}
                className="block bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold">{task.title}</h3>
                      <TaskStatusBadge status={task.status} />
                      <PriorityBadge priority={task.priority} />
                    </div>
                    <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                      {task.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>ID: {task.id.slice(0, 8)}</span>
                      <span>•</span>
                      <TimeAgo timestamp={task.updated_at} />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm transition-colors ${
        active
          ? 'border-b-2 border-primary text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <p>{message}</p>
    </div>
  );
}
