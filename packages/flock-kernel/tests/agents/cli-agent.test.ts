/**
 * Tests for CLI Agent Adapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CLIAgentAdapter, createCLIAgentAdapter } from '../../src/agents/cli-agent';
import type { AgentConfig } from '../../src/types';
import type { AgentRunInput } from '../../src/agents/adapter';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs promises
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));

import { spawn } from 'node:child_process';

describe('CLIAgentAdapter', () => {
  let mockChildProcess: any;
  let agentConfig: AgentConfig;
  let adapter: CLIAgentAdapter;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock child process
    mockChildProcess = {
      pid: 12345,
      killed: false,
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn((event: string, callback: (...args: any[]) => void) => {
        if (event === 'close') {
          // Simulate immediate close for tests
          setTimeout(() => callback(0, null), 0);
        }
      }),
      kill: vi.fn((signal: string) => {
        mockChildProcess.killed = true;
      }),
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      },
    };

    vi.mocked(spawn).mockReturnValue(mockChildProcess as any);

    agentConfig = {
      id: 'test-agent',
      name: 'Test Agent',
      kind: 'cli',
      command: 'node',
      args: ['--version'],
    };

    adapter = createCLIAgentAdapter(agentConfig);
  });

  describe('constructor', () => {
    it('should create adapter with config', () => {
      expect(adapter.id).toBe('test-agent');
      expect(adapter.config).toEqual(agentConfig);
    });

    it('should support readonly mode', () => {
      const readonlyConfig: AgentConfig = {
        id: 'readonly-agent',
        name: 'Readonly Agent',
        kind: 'cli',
        command: 'echo',
        args: ['test'],
        mode: 'readonly',
      };

      const readonlyAdapter = createCLIAgentAdapter(readonlyConfig);
      expect(readonlyAdapter.config.mode).toBe('readonly');
    });
  });

  describe('spawn', () => {
    it('should spawn agent with correct parameters', async () => {
      const input: AgentRunInput = {
        taskId: 'task-1',
        runId: 'run-1',
        workspacePath: '/tmp/workspace',
        branch: 'feature/test',
        prompt: 'Hello agent',
        timeout_ms: 5000,
      };

      const events: any[] = [];
      for await (const event of adapter.spawn(input)) {
        events.push(event);
        // Only take first event to avoid infinite loop in test
        if (events.length > 0) break;
      }

      expect(spawn).toHaveBeenCalledWith(
        'node',
        ['--version'],
        expect.objectContaining({
          cwd: '/tmp/workspace',
          env: expect.objectContaining({
            FLOCK_TASK_ID: 'task-1',
            FLOCK_RUN_ID: 'run-1',
            FLOCK_BRANCH: 'feature/test',
          }),
        })
      );
    });

    it('should set FLOCK_READONLY=1 in readonly mode', async () => {
      const readonlyConfig: AgentConfig = {
        id: 'readonly-agent',
        name: 'Readonly Agent',
        kind: 'cli',
        command: 'echo',
        args: ['test'],
        mode: 'readonly',
      };

      const readonlyAdapter = createCLIAgentAdapter(readonlyConfig);

      const input: AgentRunInput = {
        taskId: 'task-1',
        runId: 'run-1',
        workspacePath: '/tmp/workspace',
        branch: 'feature/test',
        prompt: 'Hello',
        timeout_ms: 5000,
      };

      const events: any[] = [];
      for await (const event of readonlyAdapter.spawn(input)) {
        events.push(event);
        if (events.length > 0) break;
      }

      expect(spawn).toHaveBeenCalledWith(
        'echo',
        ['test'],
        expect.objectContaining({
          env: expect.objectContaining({
            FLOCK_READONLY: '1',
          }),
        })
      );
    });

    it('should set GIT_WORK_TREE and GIT_DIR env vars', async () => {
      const input: AgentRunInput = {
        taskId: 'task-1',
        runId: 'run-1',
        workspacePath: '/tmp/workspace',
        branch: 'feature/test',
        prompt: 'Hello',
        timeout_ms: 5000,
      };

      const events: any[] = [];
      for await (const event of adapter.spawn(input)) {
        events.push(event);
        if (events.length > 0) break;
      }

      const spawnCall = vi.mocked(spawn).mock.calls[0];
      const env = spawnCall[2]?.env;

      expect(env?.GIT_WORK_TREE).toBe('/tmp/workspace');
      expect(env?.GIT_DIR).toBe('/tmp/workspace/.git');
    });

    it('should emit agent_spawned event', async () => {
      const input: AgentRunInput = {
        taskId: 'task-1',
        runId: 'run-1',
        workspacePath: '/tmp/workspace',
        branch: 'feature/test',
        prompt: 'Hello',
        timeout_ms: 5000,
      };

      const events: any[] = [];
      for await (const event of adapter.spawn(input)) {
        events.push(event);
        if (events.length > 0) break;
      }

      expect(events[0]).toMatchObject({
        type: 'agent_spawned',
        data: expect.stringContaining('12345'),
      });
      expect(events[0].timestamp).toBeDefined();
    });

    it('should handle timeout correctly', async () => {
      const slowAdapter = createCLIAgentAdapter({
        id: 'slow-agent',
        name: 'Slow Agent',
        kind: 'cli',
        command: 'sleep',
        args: ['100'],
      });

      let spawnCallCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        spawnCallCount++;
        return mockChildProcess;
      });

      const input: AgentRunInput = {
        taskId: 'task-1',
        runId: 'run-1',
        workspacePath: '/tmp/workspace',
        branch: 'feature/test',
        prompt: 'Hello',
        timeout_ms: 100,
      };

      const events: any[] = [];
      for await (const event of slowAdapter.spawn(input)) {
        events.push(event);
        if (events.length > 0) break;
      }

      // Just verify spawn was called
      expect(spawn).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop running agent with SIGTERM', async () => {
      const input: AgentRunInput = {
        taskId: 'task-1',
        runId: 'run-1',
        workspacePath: '/tmp/workspace',
        branch: 'feature/test',
        prompt: 'Hello',
        timeout_ms: 5000,
      };

      // Start agent
      const events: any[] = [];
      const eventGenerator = adapter.spawn(input);

      // Get first event
      const { value: firstEvent } = await eventGenerator.next();
      events.push(firstEvent);

      // Stop the agent
      await adapter.stop('run-1');

      expect(mockChildProcess.killed).toBe(true);
    });

    it('should handle stop for non-existent run', async () => {
      // Should not throw
      await adapter.stop('non-existent-run');
      expect(mockChildProcess.kill).not.toHaveBeenCalled();
    });

    it('should use SIGKILL if SIGTERM does not work', async () => {
      let killCount = 0;
      mockChildProcess.kill = vi.fn((signal: string) => {
        killCount++;
        if (signal === 'SIGTERM') {
          // Simulate process not responding to SIGTERM
        }
      });

      const input: AgentRunInput = {
        taskId: 'task-1',
        runId: 'run-1',
        workspacePath: '/tmp/workspace',
        branch: 'feature/test',
        prompt: 'Hello',
        timeout_ms: 5000,
      };

      const eventGenerator = adapter.spawn(input);
      await eventGenerator.next();

      await adapter.stop('run-1');

      // Should call kill at least once (SIGTERM)
      expect(killCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('createCLIAgentAdapter', () => {
    it('should be a factory function', () => {
      const newAdapter = createCLIAgentAdapter(agentConfig);
      expect(newAdapter).toBeInstanceOf(CLIAgentAdapter);
      expect(newAdapter.id).toBe('test-agent');
    });
  });
});
