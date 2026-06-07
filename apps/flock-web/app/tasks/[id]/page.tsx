'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  getTask,
  getRuns,
  getGates,
  getReviews,
  getDiff,
  approveTask,
  rejectTask,
  requestTaskChanges,
} from '@/lib/api-client';
import { TaskStatusBadge, RunStatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { EmptyState } from '@/components/EmptyState';
import { DiffViewer } from '@/components/DiffViewer';
import { GateCard } from '@/components/GateCard';
import type { Task, Run, Gate, Review } from '@/lib/types';

type Tab = 'runs' | 'gates' | 'reviews' | 'diff';

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('runs');
  const [reviewComment, setReviewComment] = useState('');
  const [showCommentField, setShowCommentField] = useState(false);
  const [commentAction, setCommentAction] = useState<'approve' | 'request' | 'reject' | null>(null);

  const { data: task, isLoading: taskLoading } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => getTask(taskId),
    refetchInterval: (query) => {
      const data = query.state.data as Task | undefined;
      if (data && ['RUNNING', 'GATES_RUNNING', 'REVIEW_REQUIRED'].includes(data.status)) {
        return 5000;
      }
      return false;
    },
  });

  const { data: runs } = useQuery({
    queryKey: ['runs', taskId],
    queryFn: () => getRuns(taskId),
    refetchInterval: 5000,
  });

  const { data: gates } = useQuery({
    queryKey: ['gates', taskId],
    queryFn: () => getGates(taskId),
    refetchInterval: (query) => {
      const data = query.state.data as Gate[] | undefined;
      if (data?.some((g) => g.status === 'running')) {
        return 5000;
      }
      return false;
    },
  });

  const { data: reviews } = useQuery({
    queryKey: ['reviews', taskId],
    queryFn: () => getReviews(taskId),
  });

  const { data: diff, isLoading: diffLoading } = useQuery({
    queryKey: ['diff', taskId],
    queryFn: () => getDiff(taskId),
    enabled: activeTab === 'diff',
  });

  const approveMutation = useMutation({
    mutationFn: (comment?: string) => approveTask(taskId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['reviews', taskId] });
      setReviewComment('');
      setShowCommentField(false);
      setCommentAction(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (comment?: string) => rejectTask(taskId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['reviews', taskId] });
      setReviewComment('');
      setShowCommentField(false);
      setCommentAction(null);
    },
  });

  const requestChangesMutation = useMutation({
    mutationFn: (comment: string) => requestTaskChanges(taskId, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['reviews', taskId] });
      setReviewComment('');
      setShowCommentField(false);
      setCommentAction(null);
    },
  });

  const handleReviewAction = (action: 'approve' | 'request' | 'reject') => {
    if (action === 'approve') {
      approveMutation.mutate(reviewComment || 'Approved');
    } else if (action === 'reject') {
      if (!reviewComment.trim()) {
        alert('Please provide a reason for rejection');
        return;
      }
      rejectMutation.mutate(reviewComment);
    } else if (action === 'request') {
      if (!reviewComment.trim()) {
        alert('Please provide feedback for requested changes');
        return;
      }
      requestChangesMutation.mutate(reviewComment);
    }
  };

  if (taskLoading) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto text-center py-8">
          <h2 className="text-xl font-semibold mb-2">Task not found</h2>
          <Link href="/projects" className="text-primary hover:underline">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  const canReview = task.status === 'REVIEW_REQUIRED';
  const allGatesPassed = gates?.every((g) => g.status === 'passed') || false;
  const hasGates = gates && gates.length > 0;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <Link href={`/projects/${task.project_id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to Project
          </Link>
          <div className="flex items-start justify-between mt-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-bold">{task.title}</h1>
                <TaskStatusBadge status={task.status} className="text-sm px-3 py-1" />
                <PriorityBadge priority={task.priority} />
              </div>
              <p className="text-muted-foreground">{task.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
            <span>Created: <TimeAgo timestamp={task.created_at} /></span>
            <span>•</span>
            <span>Updated: <TimeAgo timestamp={task.updated_at} /></span>
            <span>•</span>
            <span className="font-mono">ID: {task.id.slice(0, 8)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-8">
          {task.status === 'READY' && (
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
              Start Task
            </button>
          )}
          {task.status === 'RUNNING' && (
            <Link
              href={`/runs?taskId=${taskId}`}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
            >
              View Live Logs
            </Link>
          )}
          {canReview && (
            <>
              <button
                onClick={() => {
                  setShowCommentField(true);
                  setCommentAction('approve');
                }}
                disabled={approveMutation.isPending}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                {approveMutation.isPending ? 'Approving...' : 'Approve'}
              </button>
              <button
                onClick={() => {
                  setShowCommentField(true);
                  setCommentAction('request');
                }}
                disabled={requestChangesMutation.isPending}
                className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 disabled:opacity-50 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                {requestChangesMutation.isPending ? 'Requesting...' : 'Request Changes'}
              </button>
              <button
                onClick={() => {
                  setShowCommentField(true);
                  setCommentAction('reject');
                }}
                disabled={rejectMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50 transition-opacity flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </>
          )}
          {task.status === 'APPROVED' && (
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
              Merge
            </button>
          )}
          {task.status === 'GATES_FAILED' && (
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 transition-opacity">
              Retry
            </button>
          )}
        </div>

        {/* Review Comment Field */}
        {showCommentField && (
          <div className="mb-8 bg-card border border-border rounded-lg p-4">
            <label className="block text-sm font-medium mb-2">
              {commentAction === 'reject' ? 'Rejection Reason (required)' : commentAction === 'request' ? 'Feedback (required)' : 'Comment (optional)'}
            </label>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder={commentAction === 'reject' ? 'Please explain why this task is being rejected...' : commentAction === 'request' ? 'Please provide feedback on what needs to be changed...' : 'Add any additional comments...'}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              rows={3}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleReviewAction(commentAction!)}
                disabled={
                  (commentAction !== 'approve' && !reviewComment.trim()) ||
                  approveMutation.isPending ||
                  rejectMutation.isPending ||
                  requestChangesMutation.isPending
                }
                className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Submit {commentAction === 'approve' ? 'Approval' : commentAction === 'reject' ? 'Rejection' : 'Request'}
              </button>
              <button
                onClick={() => {
                  setShowCommentField(false);
                  setReviewComment('');
                  setCommentAction(null);
                }}
                className="bg-secondary text-secondary-foreground px-4 py-2 rounded-md hover:bg-secondary/80 transition-opacity"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Review Panel - Gate Results */}
        {canReview && hasGates && (
          <div className="mb-8 bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Quality Gates Status</h2>
            <div className="space-y-3">
              {gates.map((gate) => (
                <GateCard key={gate.id} gate={gate} />
              ))}
            </div>
            {!allGatesPassed && (
              <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
                <p className="text-sm text-yellow-400">
                  ⚠️ Some gates have not passed. Please review the failures before approving.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-border mb-6">
          <div className="flex gap-6">
            <TabButton active={activeTab === 'runs'} onClick={() => setActiveTab('runs')}>
              Runs {runs && runs.length > 0 && `(${runs.length})`}
            </TabButton>
            <TabButton active={activeTab === 'diff'} onClick={() => setActiveTab('diff')}>
              Diff
            </TabButton>
            <TabButton active={activeTab === 'gates'} onClick={() => setActiveTab('gates')}>
              Gates {gates && gates.length > 0 && `(${gates.length})`}
            </TabButton>
            <TabButton active={activeTab === 'reviews'} onClick={() => setActiveTab('reviews')}>
              Reviews {reviews && reviews.length > 0 && `(${reviews.length})`}
            </TabButton>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'runs' && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Execution Runs</h2>
            {!runs || runs.length === 0 ? (
              <EmptyState message="No runs yet" />
            ) : (
              <div className="space-y-2">
                {runs.map((run: Run) => (
                  <Link
                    key={run.id}
                    href={`/runs/${run.id}`}
                    className="block bg-secondary/50 border border-border rounded-lg p-4 hover:border-primary transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">Run {run.id.slice(0, 8)}</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Agent: {run.agent_id} • Branch: {run.branch_name}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span>Started: <TimeAgo timestamp={run.started_at!} /></span>
                          {run.ended_at && (
                            <>
                              <span>•</span>
                              <span>Duration: {formatDuration(run.started_at!, run.ended_at)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <RunStatusBadge status={run.status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'diff' && (
          <div className="bg-card border border-border rounded-lg overflow-hidden" style={{ height: '600px' }}>
            <DiffViewer diff={diff || ''} isLoading={diffLoading} />
          </div>
        )}

        {activeTab === 'gates' && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Quality Gates</h2>
            {!gates || gates.length === 0 ? (
              <EmptyState message="No gates configured" />
            ) : (
              <div className="space-y-3">
                {gates.map((gate: Gate) => (
                  <GateCard key={gate.id} gate={gate} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Reviews</h2>
            {!reviews || reviews.length === 0 ? (
              <EmptyState message="No reviews yet" />
            ) : (
              <div className="space-y-2">
                {reviews.map((review: Review) => (
                  <div key={review.id} className="bg-secondary/50 border border-border rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold">{review.reviewer}</span>
                          <ReviewVerdictBadge verdict={review.verdict} />
                        </div>
                        <p className="text-sm text-muted-foreground">{review.comment}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        <TimeAgo timestamp={review.created_at} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
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
      className={`pb-2 border-b-2 transition-colors ${
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ReviewVerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, string> = {
    APPROVE: 'bg-green-500/20 text-green-400',
    REQUEST_CHANGES: 'bg-yellow-500/20 text-yellow-400',
    ASK_ANOTHER_AGENT: 'bg-blue-500/20 text-blue-400',
    REJECT: 'bg-red-500/20 text-red-400',
  };

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[verdict] || 'bg-muted text-muted-foreground'}`}>
      {verdict}
    </span>
  );
}

function formatDuration(start: string, end: string): string {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
