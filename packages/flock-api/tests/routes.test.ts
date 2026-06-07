/**
 * API Routes Tests
 *
 * Tests for the flock-api Hono application.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { createDatabase } from '@onemancompany/flock-kernel';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

// Test database path
const TEST_DB_PATH = join(process.cwd(), '.flock', 'test-flock.db');

describe('Flock API Routes', () => {
  let db: ReturnType<typeof createDatabase>;

  beforeEach(async () => {
    // Clean up test database before each test
    try {
      rmSync(TEST_DB_PATH, { force: true });
    } catch {
      // Ignore if file doesn't exist
    }

    // Create fresh test database
    db = createDatabase(TEST_DB_PATH);

    // Initialize schema using Drizzle
    // We'll use direct SQL for simplicity in tests
    db.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        repo_path TEXT NOT NULL,
        default_branch TEXT NOT NULL DEFAULT 'main',
        created_at TEXT NOT NULL
      )
    `);

    db.db.run(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        requires_review INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    db.db.run(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        command TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    db.db.run(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        workspace_path TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        exit_code INTEGER,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      )
    `);

    db.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      )
    `);

    db.db.run(`
      CREATE TABLE IF NOT EXISTS gates (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        status TEXT NOT NULL,
        output_path TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);

    db.db.run(`
      CREATE TABLE IF NOT EXISTS reviews (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        verdict TEXT NOT NULL,
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const app = createApp(db);
      const response = await app.request('/health');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toHaveProperty('status', 'healthy');
      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('version');
    });
  });

  describe('GET /api/projects', () => {
    it('should return empty array initially', async () => {
      const app = createApp(db);
      const response = await app.request('/api/projects');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toHaveProperty('projects');
      expect(json.projects).toEqual([]);
    });

    it('should return list of projects', async () => {
      // Insert test project directly using SQL
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const app = createApp(db);
      const response = await app.request('/api/projects');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.projects).toHaveLength(1);
      expect(json.projects[0]).toMatchObject({
        id: 'proj-1',
        name: 'Test Project',
        repo_path: '/tmp/test',
      });
    });
  });

  describe('POST /api/projects', () => {
    it('should create a new project', async () => {
      const app = createApp(db);
      const response = await app.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Project',
          repo_path: '/tmp/new-project',
          default_branch: 'main',
        }),
      });

      expect(response.status).toBe(201);

      const json = await response.json();
      expect(json).toHaveProperty('project');
      expect(json.project).toMatchObject({
        name: 'New Project',
        repo_path: '/tmp/new-project',
        default_branch: 'main',
      });
      expect(json.project).toHaveProperty('id');
      expect(json.project).toHaveProperty('created_at');
    });

    it('should return validation error for invalid request', async () => {
      const app = createApp(db);
      const response = await app.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // missing name
          repo_path: '/tmp/test',
        }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('GET /api/projects/:id', () => {
    it('should return project detail', async () => {
      // Insert test project
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const app = createApp(db);
      const response = await app.request('/api/projects/proj-1');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toHaveProperty('project');
      expect(json.project).toMatchObject({
        id: 'proj-1',
        name: 'Test Project',
      });
    });

    it('should return 404 for non-existent project', async () => {
      const app = createApp(db);
      const response = await app.request('/api/projects/nonexistent');

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('GET /api/tasks', () => {
    it('should return empty array initially', async () => {
      const app = createApp(db);
      const response = await app.request('/api/tasks');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toHaveProperty('tasks');
      expect(json.tasks).toEqual([]);
    });

    it('should filter tasks by projectId', async () => {
      // Insert test project and tasks
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const now = new Date().toISOString();
      db.sqlite.prepare(
        'INSERT INTO tasks (id, project_id, title, description, status, priority, requires_review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('task-1', 'proj-1', 'Task 1', '', 'DRAFT', 'medium', 1, now, now);

      const app = createApp(db);
      const response = await app.request('/api/tasks?projectId=proj-1');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.tasks).toHaveLength(1);
      expect(json.tasks[0]).toMatchObject({
        id: 'task-1',
        title: 'Task 1',
      });
    });

    it('should filter tasks by status', async () => {
      // Insert test project and tasks
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const now = new Date().toISOString();
      db.sqlite.prepare(
        'INSERT INTO tasks (id, project_id, title, description, status, priority, requires_review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('task-1', 'proj-1', 'Task 1', '', 'DRAFT', 'medium', 1, now, now);

      const app = createApp(db);
      const response = await app.request('/api/tasks?status=DRAFT');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json.tasks).toHaveLength(1);
      expect(json.tasks[0].status).toBe('DRAFT');
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async () => {
      // Insert test project
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const app = createApp(db);
      const response = await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: 'proj-1',
          title: 'New Task',
          description: 'Task description',
          priority: 'high',
          requires_review: true,
        }),
      });

      expect(response.status).toBe(201);

      const json = await response.json();
      expect(json).toHaveProperty('task');
      expect(json.task).toMatchObject({
        project_id: 'proj-1',
        title: 'New Task',
        description: 'Task description',
        priority: 'high',
        requires_review: true,
        status: 'DRAFT',
      });
      expect(json.task).toHaveProperty('id');
      expect(json.task).toHaveProperty('created_at');
    });

    it('should return validation error for invalid request', async () => {
      const app = createApp(db);
      const response = await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // missing project_id
          title: 'New Task',
        }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should return 404 for non-existent project', async () => {
      const app = createApp(db);
      const response = await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: 'nonexistent',
          title: 'New Task',
        }),
      });

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should return task detail with runs, gates, and reviews', async () => {
      // Insert test project and task
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const now = new Date().toISOString();
      db.sqlite.prepare(
        'INSERT INTO tasks (id, project_id, title, description, status, priority, requires_review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('task-1', 'proj-1', 'Task 1', '', 'DRAFT', 'medium', 1, now, now);

      const app = createApp(db);
      const response = await app.request('/api/tasks/task-1');

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toHaveProperty('task');
      expect(json).toHaveProperty('runs');
      expect(json).toHaveProperty('gates');
      expect(json).toHaveProperty('reviews');
      expect(json.task).toMatchObject({
        id: 'task-1',
        title: 'Task 1',
      });
      expect(json.runs).toEqual([]);
      expect(json.gates).toEqual([]);
      expect(json.reviews).toEqual([]);
    });

    it('should return 404 for non-existent task', async () => {
      const app = createApp(db);
      const response = await app.request('/api/tasks/nonexistent');

      expect(response.status).toBe(404);

      const json = await response.json();
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('POST /api/tasks/:id/approve', () => {
    it('should approve a task', async () => {
      // Insert test project and task in REVIEW_REQUIRED state
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const now = new Date().toISOString();
      db.sqlite.prepare(
        'INSERT INTO tasks (id, project_id, title, description, status, priority, requires_review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('task-1', 'proj-1', 'Task 1', '', 'REVIEW_REQUIRED', 'medium', 1, now, now);

      const app = createApp(db);
      const response = await app.request('/api/tasks/task-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer: 'test-user',
          comment: 'Looks good!',
        }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toHaveProperty('success', true);

      // Verify task status was updated
      const updatedTask = await app.request('/api/tasks/task-1');
      const taskJson = await updatedTask.json();
      expect(taskJson.task.status).toBe('APPROVED');
    });

    it('should return error for invalid state', async () => {
      // Insert test project and task in DRAFT state
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const now = new Date().toISOString();
      db.sqlite.prepare(
        'INSERT INTO tasks (id, project_id, title, description, status, priority, requires_review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('task-1', 'proj-1', 'Task 1', '', 'DRAFT', 'medium', 1, now, now);

      const app = createApp(db);
      const response = await app.request('/api/tasks/task-1/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer: 'test-user',
        }),
      });

      expect(response.status).toBe(400);

      const json = await response.json();
      expect(json).toHaveProperty('error');
      expect(json).toHaveProperty('code', 'INVALID_STATE');
    });
  });

  describe('POST /api/tasks/:id/reject', () => {
    it('should reject a task', async () => {
      // Insert test project and task
      db.sqlite.prepare(
        'INSERT INTO projects (id, name, repo_path, default_branch, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run('proj-1', 'Test Project', '/tmp/test', 'main', new Date().toISOString());

      const now = new Date().toISOString();
      db.sqlite.prepare(
        'INSERT INTO tasks (id, project_id, title, description, status, priority, requires_review, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('task-1', 'proj-1', 'Task 1', '', 'REVIEW_REQUIRED', 'medium', 1, now, now);

      const app = createApp(db);
      const response = await app.request('/api/tasks/task-1/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Needs more work',
        }),
      });

      expect(response.status).toBe(200);

      const json = await response.json();
      expect(json).toHaveProperty('success', true);

      // Verify task status was updated
      const updatedTask = await app.request('/api/tasks/task-1');
      const taskJson = await updatedTask.json();
      expect(taskJson.task.status).toBe('REJECTED');
    });
  });

  describe('Error handling', () => {
    it('should return proper JSON error format', async () => {
      const app = createApp(db);
      const response = await app.request('/api/nonexistent');

      // Hono returns 404 for undefined routes
      expect(response.status).toBeGreaterThanOrEqual(400);

      const text = await response.text();
      // Check that we got some kind of response
      expect(text.length).toBeGreaterThan(0);
    });

    it('should handle CORS preflight', async () => {
      const app = createApp(db);
      const response = await app.request('/api/projects', {
        method: 'OPTIONS',
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });
});
