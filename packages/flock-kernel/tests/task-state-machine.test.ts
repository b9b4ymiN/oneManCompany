/**
 * Tests for task-state-machine.ts
 */

import { describe, it, expect } from 'vitest';
import { TaskStateMachine } from '../src/task-state-machine';
import type { TaskState, TaskTransitionContext } from '../src/types';

describe('TaskStateMachine', () => {
  describe('initialization', () => {
    it('should start in DRAFT state by default', () => {
      const sm = new TaskStateMachine();
      expect(sm.currentState).toBe('DRAFT');
    });

    it('should allow custom initial state', () => {
      const sm = new TaskStateMachine('READY');
      expect(sm.currentState).toBe('READY');
    });

    it('should start with empty history', () => {
      const sm = new TaskStateMachine();
      expect(sm.history).toEqual([]);
    });
  });

  describe('valid transitions', () => {
    it('should allow DRAFT → READY', () => {
      const sm = new TaskStateMachine('DRAFT');
      const result = sm.transition('READY');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.current_state).toBe('READY');
      }
      expect(sm.currentState).toBe('READY');
    });

    it('should allow READY → RUNNING', () => {
      const sm = new TaskStateMachine('READY');
      const result = sm.transition('RUNNING');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('RUNNING');
    });

    it('should allow RUNNING → AGENT_DONE', () => {
      const sm = new TaskStateMachine('RUNNING');
      const result = sm.transition('AGENT_DONE');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('AGENT_DONE');
    });

    it('should allow AGENT_DONE → GATES_RUNNING with gate results', () => {
      const sm = new TaskStateMachine('AGENT_DONE');
      const context: TaskTransitionContext = {
        gateResults: [
          { gate: 'test', status: 'passed', exitCode: 0, summary: '', logPath: '', duration_ms: 100 },
        ],
      };
      const result = sm.transition('GATES_RUNNING', context);

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('GATES_RUNNING');
    });

    it('should allow GATES_RUNNING → GATES_FAILED', () => {
      const sm = new TaskStateMachine('GATES_RUNNING');
      const result = sm.transition('GATES_FAILED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('GATES_FAILED');
    });

    it('should allow GATES_FAILED → RUNNING with human override', () => {
      const sm = new TaskStateMachine('GATES_FAILED');
      const context: TaskTransitionContext = { humanOverride: true };
      const result = sm.transition('RUNNING', context);

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('RUNNING');
    });

    it('should allow AGENT_DONE → REVIEW_REQUIRED', () => {
      const sm = new TaskStateMachine('AGENT_DONE');
      const result = sm.transition('REVIEW_REQUIRED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('REVIEW_REQUIRED');
    });

    it('should allow REVIEW_REQUIRED → APPROVED with review available', () => {
      const sm = new TaskStateMachine('REVIEW_REQUIRED');
      const context: TaskTransitionContext = { reviewAvailable: true };
      const result = sm.transition('APPROVED', context);

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('APPROVED');
    });

    it('should allow APPROVED → MERGED', () => {
      const sm = new TaskStateMachine('APPROVED');
      const result = sm.transition('MERGED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('MERGED');
    });

    it('should allow MERGED → ARCHIVED', () => {
      const sm = new TaskStateMachine('MERGED');
      const result = sm.transition('ARCHIVED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('ARCHIVED');
    });

    it('should allow REJECTED → ARCHIVED', () => {
      const sm = new TaskStateMachine('REJECTED');
      const result = sm.transition('ARCHIVED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('ARCHIVED');
    });

    it('should allow REJECTED → RUNNING (rework)', () => {
      const sm = new TaskStateMachine('REJECTED');
      const result = sm.transition('RUNNING');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('RUNNING');
    });

    it('should allow DRAFT → ARCHIVED', () => {
      const sm = new TaskStateMachine('DRAFT');
      const result = sm.transition('ARCHIVED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('ARCHIVED');
    });
  });

  describe('invalid transitions', () => {
    it('should reject READY → DRAFT (reverse transition)', () => {
      const sm = new TaskStateMachine('READY');
      const result = sm.transition('DRAFT');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
      expect(sm.currentState).toBe('READY'); // State unchanged
    });

    it('should reject RUNNING → READY (skip back)', () => {
      const sm = new TaskStateMachine('RUNNING');
      const result = sm.transition('READY');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });

    it('should reject DRAFT → RUNNING (skip READY)', () => {
      const sm = new TaskStateMachine('DRAFT');
      const result = sm.transition('RUNNING');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });

    it('should reject ARCHIVED → any state (terminal)', () => {
      const sm = new TaskStateMachine('ARCHIVED');
      const result = sm.transition('DRAFT');

      expect(result.isErr()).toBe(true);
    });

    it('should reject MERGED → any state except ARCHIVED', () => {
      const sm = new TaskStateMachine('MERGED');
      const result = sm.transition('RUNNING');

      expect(result.isErr()).toBe(true);
    });
  });

  describe('precondition validation', () => {
    it('should reject AGENT_DONE → GATES_RUNNING without gate results', () => {
      const sm = new TaskStateMachine('AGENT_DONE');
      const result = sm.transition('GATES_RUNNING');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('PRECONDITION_FAILED');
        expect(result.error.message).toContain('Gate results required');
      }
    });

    it('should reject GATES_FAILED → RUNNING without human override', () => {
      const sm = new TaskStateMachine('GATES_FAILED');
      const result = sm.transition('RUNNING');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('PRECONDITION_FAILED');
        expect(result.error.message).toContain('human override');
      }
    });

    it('should reject REVIEW_REQUIRED → APPROVED without review available', () => {
      const sm = new TaskStateMachine('REVIEW_REQUIRED');
      const result = sm.transition('APPROVED');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('PRECONDITION_FAILED');
        expect(result.error.message).toContain('Review required');
      }
    });

    it('should accept GATES_FAILED → RUNNING with humanOverride=true', () => {
      const sm = new TaskStateMachine('GATES_FAILED');
      const context: TaskTransitionContext = { humanOverride: true };
      const result = sm.transition('RUNNING', context);

      expect(result.isOk()).toBe(true);
    });
  });

  describe('snapshot and history tracking', () => {
    it('should record transition in history', () => {
      const sm = new TaskStateMachine('DRAFT');
      sm.transition('READY');

      expect(sm.history).toHaveLength(1);
      expect(sm.history[0].from).toBe('DRAFT');
      expect(sm.history[0].to).toBe('READY');
      expect(sm.history[0].at).toBeDefined();
    });

    it('should include reason in history when provided', () => {
      const sm = new TaskStateMachine('READY');
      const context: TaskTransitionContext = { reason: 'Task started' };
      sm.transition('RUNNING', context);

      expect(sm.history[0].reason).toBe('Task started');
    });

    it('should return snapshot with current state and history', () => {
      const sm = new TaskStateMachine('DRAFT');
      sm.transition('READY');
      sm.transition('RUNNING');

      const snapshot = sm.snapshot();

      expect(snapshot.current_state).toBe('RUNNING');
      expect(snapshot.history).toHaveLength(2);
    });

    it('should track multiple transitions', () => {
      const sm = new TaskStateMachine('DRAFT');
      sm.transition('READY');
      sm.transition('RUNNING');
      sm.transition('AGENT_DONE');

      expect(sm.history).toHaveLength(3);
      expect(sm.currentState).toBe('AGENT_DONE');
    });

    it('should provide immutable history', () => {
      const sm = new TaskStateMachine('DRAFT');
      sm.transition('READY');

      const history1 = sm.history;
      sm.transition('RUNNING');

      expect(history1).toHaveLength(1);
      expect(sm.history).toHaveLength(2);
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      const sm = new TaskStateMachine('DRAFT');
      expect(sm.canTransition('READY')).toBe(true);
      expect(sm.canTransition('ARCHIVED')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      const sm = new TaskStateMachine('DRAFT');
      expect(sm.canTransition('RUNNING')).toBe(false);
      expect(sm.canTransition('MERGED')).toBe(false);
    });

    it('should update valid transitions after state change', () => {
      const sm = new TaskStateMachine('DRAFT');
      sm.transition('READY');

      expect(sm.canTransition('DRAFT')).toBe(false);
      expect(sm.canTransition('RUNNING')).toBe(true);
    });
  });

  describe('complex workflow', () => {
    it('should handle full happy path', () => {
      const sm = new TaskStateMachine('DRAFT');

      const transitions: TaskState[] = [
        'READY',
        'RUNNING',
        'AGENT_DONE',
        { state: 'GATES_RUNNING', context: { gateResults: [{ gate: 'test', status: 'passed', exitCode: 0, summary: '', logPath: '', duration_ms: 100 }] } },
        'REVIEW_REQUIRED',
        { state: 'APPROVED', context: { reviewAvailable: true } },
        'MERGED',
        'ARCHIVED',
      ];

      for (const transition of transitions) {
        if (typeof transition === 'string') {
          const result = sm.transition(transition);
          expect(result.isOk()).toBe(true);
        } else {
          const result = sm.transition(transition.state, transition.context);
          expect(result.isOk()).toBe(true);
        }
      }

      expect(sm.currentState).toBe('ARCHIVED');
      expect(sm.history).toHaveLength(8);
    });

    it('should handle failure and retry path', () => {
      const sm = new TaskStateMachine('DRAFT');
      sm.transition('READY');
      sm.transition('RUNNING');
      sm.transition('AGENT_DONE');

      // Add gate results context for GATES_RUNNING transition
      const gateContext: TaskTransitionContext = {
        gateResults: [{ gate: 'test', status: 'failed', exitCode: 1, summary: '', logPath: '', duration_ms: 100 }],
      };
      sm.transition('GATES_RUNNING', gateContext);
      sm.transition('GATES_FAILED');

      // Retry with human override
      const context: TaskTransitionContext = { humanOverride: true, reason: 'Fixing issues' };
      sm.transition('RUNNING', context);

      expect(sm.currentState).toBe('RUNNING');
      expect(sm.history[sm.history.length - 1].reason).toBe('Fixing issues');
    });

    it('should handle rejection and rework path', () => {
      const sm = new TaskStateMachine('DRAFT');
      sm.transition('READY');
      sm.transition('RUNNING');
      sm.transition('AGENT_DONE');
      sm.transition('REVIEW_REQUIRED');
      sm.transition('REJECTED');

      // Rework
      sm.transition('RUNNING');

      expect(sm.currentState).toBe('RUNNING');
    });
  });
});
