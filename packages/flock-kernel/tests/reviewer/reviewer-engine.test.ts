/**
 * Tests for reviewer/reviewer-engine.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { createReviewerEngine, ReviewerEngine } from '../../src/reviewer/reviewer-engine';
import type { FlockDatabase, DbTask, DbRun, DbReview } from '../../src/db/client';

// Mock the workspace module so collectDiff doesn't try real git commands
vi.mock('../../src/workspace', () => ({
  collectDiff: vi.fn().mockResolvedValue(ok({
    filesChanged: 2,
    insertions: 10,
    deletions: 5,
    files: [
      { path: 'src/a.ts', status: 'modified' },
      { path: 'src/b.ts', status: 'added' },
    ],
  })),
}));

// Mock database
const mockDb = {
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  schema: {
    tasks: {} as any,
    runs: {} as any,
    reviews: {} as any,
    gates: {} as any,
  },
  sqlite: {} as any,
} as unknown as FlockDatabase;

// Mock event logger
const mockEventLogger = {
  logEvent: vi.fn().mockReturnValue(undefined),
};

const mockTask: DbTask = {
  id: 'task-001',
  project_id: 'proj-1',
  title: 'Test Task',
  description: '',
  status: 'REVIEW_REQUIRED',
  priority: 'medium',
  requires_review: true,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockRun: DbRun = {
  id: 'run-001',
  task_id: 'task-001',
  agent_id: 'agent-001',
  workspace_path: '/tmp/workspace',
  branch_name: 'flock/task-001/agent-001',
  status: 'COMPLETED',
  exit_code: 0,
  started_at: '2024-01-01T00:00:00.000Z',
  ended_at: '2024-01-01T00:01:00.000Z',
};

const mockReviews: DbReview[] = [
  {
    id: 'review-001',
    task_id: 'task-001',
    reviewer: 'reviewer-1',
    verdict: 'APPROVE',
    comment: 'Looks good!',
    created_at: '2024-01-01T00:02:00.000Z',
  },
  {
    id: 'review-002',
    task_id: 'task-001',
    reviewer: 'reviewer-2',
    verdict: 'APPROVE',
    comment: 'Approved',
    created_at: '2024-01-01T00:03:00.000Z',
  },
];

describe('ReviewerEngine', () => {
  let reviewerEngine: ReviewerEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    reviewerEngine = createReviewerEngine(mockDb, mockEventLogger as any);
  });

  describe('assignReviewer', () => {
    it('should assign a reviewer to a task', async () => {
      // assignReviewer flow:
      // 1. select task → .where().get()
      // 2. select last run → .where().orderBy().limit(1).get()
      // 3. collectDiff (mocked)
      // 4. select gates → .where().all()
      // 5. eventLogger.logEvent
      const selectMock = vi.fn();

      // Call 1: select task
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTask),
          }),
        }),
      });

      // Call 2: select last run (with orderBy + limit)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockReturnValue(mockRun),
              }),
            }),
          }),
        }),
      });

      // Call 3: select gates
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      const config = {
        agentId: 'reviewer-1',
        mode: 'single' as const,
        requiredApprovals: 1,
        autoRejectThreshold: 2,
      };

      const result = await reviewerEngine.assignReviewer('task-001', config);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.taskId).toBe('task-001');
        expect(result.value.reviewerConfig.agentId).toBe('reviewer-1');
      }
    });

    it('should return error if task not found', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(undefined),
          }),
        }),
      });

      const config = {
        agentId: 'reviewer-1',
        mode: 'single' as const,
        requiredApprovals: 1,
        autoRejectThreshold: 2,
      };

      const result = await reviewerEngine.assignReviewer('task-001', config);

      expect(result.isErr()).toBe(true);
    });
  });

  describe('checkConsensus', () => {
    it('should reach consensus with required approvals', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(mockReviews),
          }),
        }),
      });

      const config = {
        agentId: 'system',
        mode: 'consensus' as const,
        requiredApprovals: 2,
        autoRejectThreshold: 2,
      };

      const result = await reviewerEngine.checkConsensus('task-001', config);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.reached).toBe(true);
        expect(result.value.verdict).toBe('approved');
        expect(result.value.approvalCount).toBe(2);
      }
    });

    it('should not reach consensus with insufficient approvals', async () => {
      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([mockReviews[0]]),
          }),
        }),
      });

      const config = {
        agentId: 'system',
        mode: 'consensus' as const,
        requiredApprovals: 2,
        autoRejectThreshold: 2,
      };

      const result = await reviewerEngine.checkConsensus('task-001', config);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.reached).toBe(false);
        expect(result.value.verdict).toBe('pending');
      }
    });

    it('should auto-reject when threshold exceeded', async () => {
      const rejectionReviews: DbReview[] = [
        { ...mockReviews[0], verdict: 'REJECT', reviewer: 'reviewer-1' },
        { ...mockReviews[1], verdict: 'REJECT', reviewer: 'reviewer-2' },
      ];

      mockDb.db.select = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(rejectionReviews),
          }),
        }),
      });

      const config = {
        agentId: 'system',
        mode: 'consensus' as const,
        requiredApprovals: 2,
        autoRejectThreshold: 2,
      };

      const result = await reviewerEngine.checkConsensus('task-001', config);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.reached).toBe(true);
        expect(result.value.verdict).toBe('rejected');
        expect(result.value.rejectionCount).toBe(2);
      }
    });
  });

  describe('autoReview', () => {
    it('should record an auto-review', async () => {
      // autoReview flow:
      // 1. select task → .where().get()
      // 2. select last run → .where().orderBy().limit(1).get()
      // 3. collectDiff (mocked)
      // 4. select gates → .where().all()
      // 5. insert run → .values()
      // 6. eventLogger.logEvent
      // 7. insert review → .values()
      // 8. select review → .where().get()
      const selectMock = vi.fn();

      // Call 1: select task
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(mockTask),
          }),
        }),
      });

      // Call 2: select last run (with orderBy + limit)
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                get: vi.fn().mockReturnValue(mockRun),
              }),
            }),
          }),
        }),
      });

      // Call 3: select gates
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue([]),
          }),
        }),
      });

      // Call 4: select review after insert
      selectMock.mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({
              id: 'review-003',
              task_id: 'task-001',
              reviewer: 'auto-reviewer',
              verdict: 'APPROVE',
              comment: 'Auto-approved',
              created_at: '2024-01-01T00:04:00.000Z',
            }),
          }),
        }),
      });

      mockDb.db.select = selectMock;

      mockDb.db.insert = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({}),
      });

      const result = await reviewerEngine.autoReview('task-001', 'auto-reviewer');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.verdict).toBe('APPROVE');
      }
    });
  });
});
