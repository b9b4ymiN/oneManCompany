/**
 * Flock API Client
 *
 * Typed fetch wrapper for the Flock REST API.
 */

import type {
  Project,
  Task,
  Run,
  Review,
  Gate,
  Event,
  TaskInput,
  ProjectInput,
  ReviewVerdict,
} from './types';

const API_BASE = '/api';

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

// ============================================================================
// Projects
// ============================================================================

export async function getProjects(): Promise<Project[]> {
  return fetchAPI<Project[]>('/projects');
}

export async function getProject(id: string): Promise<Project> {
  return fetchAPI<Project>(`/projects/${id}`);
}

export async function createProject(input: Partial<ProjectInput>): Promise<Project> {
  return fetchAPI<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ============================================================================
// Tasks
// ============================================================================

export async function getTasks(projectId?: string): Promise<Task[]> {
  const query = projectId ? `?projectId=${projectId}` : '';
  return fetchAPI<Task[]>(`/tasks${query}`);
}

export async function getTask(id: string): Promise<Task> {
  return fetchAPI<Task>(`/tasks/${id}`);
}

export async function createTask(input: Partial<TaskInput>): Promise<Task> {
  return fetchAPI<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ============================================================================
// Runs
// ============================================================================

export async function getRuns(taskId?: string): Promise<Run[]> {
  const query = taskId ? `?taskId=${taskId}` : '';
  return fetchAPI<Run[]>(`/runs${query}`);
}

export async function getRun(id: string): Promise<Run> {
  return fetchAPI<Run>(`/runs/${id}`);
}

export async function getRunEvents(id: string): Promise<Event[]> {
  return fetchAPI<Event[]>(`/runs/${id}/events`);
}

export async function startRun(taskId: string): Promise<Run> {
  return fetchAPI<Run>(`/tasks/${taskId}/runs`, {
    method: 'POST',
  });
}

export async function cancelRun(id: string): Promise<Run> {
  return fetchAPI<Run>(`/runs/${id}/cancel`, {
    method: 'POST',
  });
}

// ============================================================================
// Reviews
// ============================================================================

export async function getReviews(taskId?: string): Promise<Review[]> {
  const query = taskId ? `?taskId=${taskId}` : '';
  return fetchAPI<Review[]>(`/reviews${query}`);
}

export async function submitReview(
  taskId: string,
  verdict: ReviewVerdict,
  comment: string
): Promise<Review> {
  return fetchAPI<Review>(`/tasks/${taskId}/reviews`, {
    method: 'POST',
    body: JSON.stringify({ verdict, comment }),
  });
}

export async function approveTask(taskId: string, comment?: string): Promise<Review> {
  return submitReview(taskId, 'APPROVE', comment || 'Approved');
}

export async function rejectTask(taskId: string, comment?: string): Promise<Review> {
  return submitReview(taskId, 'REJECT', comment || 'Rejected');
}

export async function requestTaskChanges(taskId: string, comment: string): Promise<Review> {
  return submitReview(taskId, 'REQUEST_CHANGES', comment);
}

// ============================================================================
// Gates
// ============================================================================

export async function getGates(taskId?: string): Promise<Gate[]> {
  const query = taskId ? `?taskId=${taskId}` : '';
  return fetchAPI<Gate[]>(`/gates${query}`);
}

export async function getGate(id: string): Promise<Gate> {
  return fetchAPI<Gate>(`/gates/${id}`);
}

// ============================================================================
// Diff
// ============================================================================

export async function getDiff(taskId: string): Promise<string> {
  const response = await fetch(`${API_BASE}/tasks/${taskId}/diff`);
  if (!response.ok) {
    throw new Error(`Failed to fetch diff: ${response.status}`);
  }
  return response.text();
}

// ============================================================================
// Dashboard Stats
// ============================================================================

export interface DashboardStats {
  activeRuns: number;
  pendingReviews: number;
  runningTasks: number;
  totalProjects: number;
  recentActivity: Event[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return fetchAPI<DashboardStats>('/dashboard');
}
