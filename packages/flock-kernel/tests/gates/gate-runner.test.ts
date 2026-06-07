/**
 * Tests for Gate Runner
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ok, err } from 'neverthrow';
import { GateRunner, createGateRunner } from '../../src/gates/gate-runner';
import type { GateConfig, GateRunResult } from '../../src/gates/gate-runner';
import type { FlockConfig } from '../../src/types';
import type { FlockDatabase } from '../../src/db/client';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs promises
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(() => Promise.resolve()),
  writeFile: vi.fn(() => Promise.resolve()),
}));

// Mock drizzle orm
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
}));

describe('GateRunner', () => {
  let mockDb: FlockDatabase;
  let mockConfig: FlockConfig;
  let gateRunner: GateRunner;
  const projectPath = '/tmp/test-project';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock database
    mockDb = {
      db: {
        select: vi.fn(() => mockDb.db),
        from: vi.fn(() => mockDb.db),
        where: vi.fn(() => mockDb.db),
        get: vi.fn(),
        insert: vi.fn(() => mockDb.db),
        values: vi.fn(),
        update: vi.fn(() => mockDb.db),
        set: vi.fn(),
      },
      sqlite: {},
      schema: {
        tasks: {},
        gates: {},
      },
    } as any;

    // Mock config
    mockConfig = {
      agents: {
        'test-agent': {
          type: 'cli',
          command: 'echo',
          args: ['test'],
        },
      },
      gates: {
        typecheck: {
          command: 'tsc --noEmit',
        },
        test: {
          command: 'npm test',
        },
        lint: {
          command: 'eslint src/',
        },
      },
      policies: {
        require_human_approval_before_merge: true,
        forbid_direct_main_branch_write: true,
        require_diff_summary: true,
        require_tests_for_code_change: true,
        preserve_failed_workspaces: true,
        max_parallel_runs: 4,
        default_timeout_minutes: 60,
      },
    };

    gateRunner = createGateRunner(mockDb, mockConfig, projectPath);
  });

  describe('constructor', () => {
    it('should create gate runner with db and config', () => {
      expect(gateRunner).toBeInstanceOf(GateRunner);
    });
  });

  describe('createGateRunner', () => {
    it('should be a factory function', () => {
      const newRunner = createGateRunner(mockDb, mockConfig, projectPath);
      expect(newRunner).toBeInstanceOf(GateRunner);
    });
  });

  describe('runGate', () => {
    it('should return result structure with all fields', async () => {
      const gateConfig: GateConfig = {
        name: 'test-gate',
        command: 'echo "test passed"',
        required: true,
      };

      // Mock spawn to succeed
      const { spawn } = await import('node:child_process');
      vi.mocked(spawn).mockImplementationOnce(() => {
        const mockProcess: any = {
          stdout: {
            on: vi.fn((event: string, callback: (chunk: Buffer) => void) => {
              callback(Buffer.from('test passed\n'));
            }),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          }),
        };
        return mockProcess;
      });

      const result = await gateRunner.runGate('/tmp/workspace', gateConfig);

      expect(result).toMatchObject({
        gate: 'test-gate',
        status: expect.any(String),
        exitCode: expect.any(Number),
        summary: expect.any(String),
        logPath: expect.any(String),
        duration_ms: expect.any(Number),
        output: expect.any(String),
      });
    });

    it('should pass gate when command succeeds', async () => {
      const gateConfig: GateConfig = {
        name: 'test-gate',
        command: 'echo "success"',
      };

      const { spawn } = await import('node:child_process');
      vi.mocked(spawn).mockImplementationOnce(() => {
        const mockProcess: any = {
          stdout: {
            on: vi.fn((event: string, callback: (chunk: Buffer) => void) => {
              callback(Buffer.from('success\n'));
            }),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          }),
        };
        return mockProcess;
      });

      const result = await gateRunner.runGate('/tmp/workspace', gateConfig);

      expect(result.status).toBe('passed');
      expect(result.exitCode).toBe(0);
      expect(result.summary).toContain('passed');
    });

    it('should fail gate when command fails', async () => {
      const gateConfig: GateConfig = {
        name: 'test-gate',
        command: 'exit 1',
      };

      const { spawn } = await import('node:child_process');
      vi.mocked(spawn).mockImplementationOnce(() => {
        const mockProcess: any = {
          stdout: {
            on: vi.fn(),
          },
          stderr: {
            on: vi.fn((event: string, callback: (chunk: Buffer) => void) => {
              callback(Buffer.from('error message\n'));
            }),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(1);
            }
          }),
        };
        return mockProcess;
      });

      const result = await gateRunner.runGate('/tmp/workspace', gateConfig);

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
      expect(result.summary).toContain('failed');
    });

    it('should include command output in result', async () => {
      const gateConfig: GateConfig = {
        name: 'test-gate',
        command: 'echo "output"',
      };

      const { spawn } = await import('node:child_process');
      vi.mocked(spawn).mockImplementationOnce(() => {
        const mockProcess: any = {
          stdout: {
            on: vi.fn((event: string, callback: (chunk: Buffer) => void) => {
              callback(Buffer.from('output\n'));
            }),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          }),
        };
        return mockProcess;
      });

      const result = await gateRunner.runGate('/tmp/workspace', gateConfig);

      expect(result.output).toContain('output');
    });

    it('should handle spawn errors', async () => {
      const gateConfig: GateConfig = {
        name: 'test-gate',
        command: 'nonexistent-command',
      };

      const { spawn } = await import('node:child_process');
      vi.mocked(spawn).mockImplementationOnce(() => {
        const mockProcess: any = {
          stdout: {
            on: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (...args: any[]) => void) => {
            if (event === 'error') {
              callback(new Error('Command not found'));
            }
          }),
        };
        return mockProcess;
      });

      const result = await gateRunner.runGate('/tmp/workspace', gateConfig);

      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(-1);
      expect(result.output).toContain('Command not found');
    });

    it('should write log file', async () => {
      const gateConfig: GateConfig = {
        name: 'test-gate',
        command: 'echo "test"',
      };

      const { spawn } = await import('node:child_process');
      vi.mocked(spawn).mockImplementationOnce(() => {
        const mockProcess: any = {
          stdout: {
            on: vi.fn((event: string, callback: (chunk: Buffer) => void) => {
              callback(Buffer.from('test\n'));
            }),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          }),
        };
        return mockProcess;
      });

      const { writeFile } = await import('node:fs/promises');

      const result = await gateRunner.runGate('/tmp/workspace', gateConfig);

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test-gate.log'),
        expect.any(String)
      );
      expect(result.logPath).toContain('test-gate.log');
    });
  });

  describe('runAllGates', () => {
    it('should run all gates sequentially', async () => {
      const gates: GateConfig[] = [
        { name: 'gate-1', command: 'exit 0' },
        { name: 'gate-2', command: 'exit 0' },
        { name: 'gate-3', command: 'exit 0' },
      ];

      const { spawn } = await import('node:child_process');
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const mockProcess: any = {
          stdout: {
            on: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          }),
        };
        return mockProcess;
      });

      const results = await gateRunner.runAllGates('/tmp/workspace', gates);

      expect(results).toHaveLength(3);
      expect(callCount).toBe(3);
    });

    it('should short-circuit on required gate failure', async () => {
      const gates: GateConfig[] = [
        { name: 'gate-1', command: 'exit 0', required: true },
        { name: 'gate-2', command: 'exit 1', required: true },
        { name: 'gate-3', command: 'exit 0', required: true },
      ];

      const { spawn } = await import('node:child_process');
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const mockProcess: any = {
          stdout: {
            on: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              // gate-2 fails
              callback(callCount === 2 ? 1 : 0);
            }
          }),
        };
        return mockProcess;
      });

      const results = await gateRunner.runAllGates('/tmp/workspace', gates);

      expect(results).toHaveLength(2); // Should stop after gate-2 fails
      expect(callCount).toBe(2); // gate-3 should not run
      expect(results[1].status).toBe('failed');
    });

    it('should continue on optional gate failure', async () => {
      const gates: GateConfig[] = [
        { name: 'gate-1', command: 'exit 0', required: true },
        { name: 'gate-2', command: 'exit 1', required: false },
        { name: 'gate-3', command: 'exit 0', required: true },
      ];

      const { spawn } = await import('node:child_process');
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        const mockProcess: any = {
          stdout: {
            on: vi.fn(),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              // gate-2 fails
              callback(callCount === 2 ? 1 : 0);
            }
          }),
        };
        return mockProcess;
      });

      const results = await gateRunner.runAllGates('/tmp/workspace', gates);

      expect(results).toHaveLength(3); // All gates should run
      expect(callCount).toBe(3);
      expect(results[1].status).toBe('failed');
      expect(results[2].status).toBe('passed');
    });

    it('should return results with correct structure', async () => {
      const gates: GateConfig[] = [
        { name: 'gate-1', command: 'echo "test"' },
      ];

      const { spawn } = await import('node:child_process');
      vi.mocked(spawn).mockImplementationOnce(() => {
        const mockProcess: any = {
          stdout: {
            on: vi.fn((event: string, callback: (chunk: Buffer) => void) => {
              callback(Buffer.from('test\n'));
            }),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          }),
        };
        return mockProcess;
      });

      const results = await gateRunner.runAllGates('/tmp/workspace', gates);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        gate: 'gate-1',
        status: expect.any(String),
        exitCode: expect.any(Number),
        summary: expect.any(String),
        logPath: expect.any(String),
        duration_ms: expect.any(Number),
        output: expect.any(String),
      });
    });
  });
});
