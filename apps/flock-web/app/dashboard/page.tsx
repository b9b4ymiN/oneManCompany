'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { getDashboardStats, getTasks } from '@/lib/api-client';
import { TaskStatusBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import type { Event, Task } from '@/lib/types';

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboardStats,
    refetchInterval: 5000,
  });

  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => getTasks(),
    refetchInterval: () => 5000,
  });

  const pendingReviewsCount = stats?.pendingReviews || 0;
  const activeRunsCount = stats?.activeRuns || 0;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-muted-foreground">
              Overview of your agent fleet and activity
            </p>
          </div>
          <Link
            href="/tasks/new"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
          >
            Create Task
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            title="Active Runs"
            value={statsLoading ? '...' : String(activeRunsCount)}
            icon="⚡"
            pulsing={activeRunsCount > 0}
          />
          <StatCard
            title="Pending Reviews"
            value={statsLoading ? '...' : String(pendingReviewsCount)}
            icon="👀"
            warning={pendingReviewsCount > 0}
          />
          <StatCard
            title="Running Tasks"
            value={statsLoading ? '...' : String(stats?.runningTasks || 0)}
            icon="🔄"
          />
          <StatCard
            title="Projects"
            value={statsLoading ? '...' : String(stats?.totalProjects || 0)}
            icon="📁"
          />
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Recent Activity</h2>
            {pendingReviewsCount > 0 && (
              <Link
                href="/tasks?status=REVIEW_REQUIRED"
                className="text-sm text-primary hover:underline"
              >
                View {pendingReviewsCount} pending reviews →
              </Link>
            )}
          </div>
          {!stats || stats.recentActivity.length === 0 ? (
            <EmptyState message="No recent activity" />
          ) : (
            <div className="space-y-2">
              {stats.recentActivity.slice(0, 10).map((event: Event) => (
                <ActivityItem key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>

        {/* Active Tasks Summary */}
        {tasks && tasks.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Active Tasks</h2>
            <div className="space-y-2">
              {tasks
                .filter((t: Task) => ['RUNNING', 'GATES_RUNNING', 'REVIEW_REQUIRED'].includes(t.status))
                .slice(0, 5)
                .map((task: Task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="block bg-secondary/50 border border-border rounded-lg p-4 hover:border-primary transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{task.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                      </div>
                      <TaskStatusBadge status={task.status} />
                    </div>
                  </Link>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  pulsing = false,
  warning = false,
}: {
  title: string;
  value: string;
  icon: string;
  pulsing?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`bg-card border border-border rounded-lg p-6 ${
        warning ? 'border-orange-500/50' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <span className={`text-3xl ${pulsing ? 'animate-pulse' : ''}`}>{icon}</span>
      </div>
    </div>
  );
}

function ActivityItem({ event }: { event: Event }) {
  const getIconForType = (type: string) => {
    const icons: Record<string, string> = {
      run_started: '🚀',
      agent_spawned: '🤖',
      command_executed: '⚡',
      file_changed: '📝',
      test_failed: '❌',
      retry_triggered: '🔄',
      review_requested: '👀',
      human_approved: '✅',
      merged: '🎉',
      gate_passed: '✓',
      gate_failed: '✗',
    };
    return icons[type] || '•';
  };

  const getTaskInfo = (event: Event) => {
    // Try to extract task info from payload
    const taskName = (event.payload?.taskName as string) || 'Unknown task';
    const agent = (event.payload?.agent as string) || (event.payload?.agentId as string) || 'System';
    return { taskName, agent };
  };

  const { taskName, agent } = getTaskInfo(event);

  return (
    <div className="flex items-center gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xl">{getIconForType(event.type)}</span>
      <div className="flex-1">
        <p className="text-sm">
          <span className="font-medium">{taskName}</span>
          <span className="text-muted-foreground"> — {event.type.replace(/_/g, ' ')}</span>
        </p>
        <p className="text-xs text-muted-foreground">by {agent}</p>
      </div>
      <TimeAgo timestamp={event.created_at} />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <p>{message}</p>
    </div>
  );
}
