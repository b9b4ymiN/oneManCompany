/**
 * Tests for run-state-machine.ts
 */

import { describe, it, expect } from 'vitest';
import { RunStateMachine } from '../src/run-state-machine';
import type { RunState, RunTransitionContext } from '../src/types';

describe('RunStateMachine', () => {
  describe('initialization', () => {
    it('should start in QUEUED state by default', () => {
      const sm = new RunStateMachine();
      expect(sm.currentState).toBe('QUEUED');
    });

    it('should allow custom initial state', () => {
      const sm = new RunStateMachine('SPAWNING');
      expect(sm.currentState).toBe('SPAWNING');
    });

    it('should start with empty history', () => {
      const sm = new RunStateMachine();
      expect(sm.history).toEqual([]);
    });

    it('should start with undefined exit code', () => {
      const sm = new RunStateMachine();
      expect(sm.exitCode).toBeUndefined();
    });
  });

  describe('valid transitions', () => {
    it('should allow QUEUED → SPAWNING', () => {
      const sm = new RunStateMachine('QUEUED');
      const result = sm.transition('SPAWNING');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('SPAWNING');
    });

    it('should allow SPAWNING → RUNNING', () => {
      const sm = new RunStateMachine('SPAWNING');
      const result = sm.transition('RUNNING');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('RUNNING');
    });

    it('should allow RUNNING → STOPPING', () => {
      const sm = new RunStateMachine('RUNNING');
      const result = sm.transition('STOPPING');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('STOPPING');
    });

    it('should allow STOPPING → SUCCEEDED with exit code 0', () => {
      const sm = new RunStateMachine('STOPPING');
      const context: RunTransitionContext = { exitCode: 0 };
      const result = sm.transition('SUCCEEDED', context);

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('SUCCEEDED');
      expect(sm.exitCode).toBe(0);
    });

    it('should allow STOPPING → SUCCEEDED without exit code (defaults to 0)', () => {
      const sm = new RunStateMachine('STOPPING');
      const result = sm.transition('SUCCEEDED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('SUCCEEDED');
      expect(sm.exitCode).toBe(0);
    });

    it('should allow STOPPING → FAILED with non-zero exit code', () => {
      const sm = new RunStateMachine('STOPPING');
      const context: RunTransitionContext = { exitCode: 1 };
      const result = sm.transition('FAILED', context);

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('FAILED');
      expect(sm.exitCode).toBe(1);
    });

    it('should allow SPAWNING → FAILED', () => {
      const sm = new RunStateMachine('SPAWNING');
      const result = sm.transition('FAILED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('FAILED');
      expect(sm.exitCode).toBe(1); // Defaults to 1 for FAILED
    });

    it('should allow RUNNING → FAILED', () => {
      const sm = new RunStateMachine('RUNNING');
      const result = sm.transition('FAILED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('FAILED');
      expect(sm.exitCode).toBe(1);
    });

    it('should allow QUEUED → CANCELLED', () => {
      const sm = new RunStateMachine('QUEUED');
      const result = sm.transition('CANCELLED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('CANCELLED');
    });

    it('should allow SPAWNING → CANCELLED', () => {
      const sm = new RunStateMachine('SPAWNING');
      const result = sm.transition('CANCELLED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('CANCELLED');
    });

    it('should allow RUNNING → CANCELLED', () => {
      const sm = new RunStateMachine('RUNNING');
      const result = sm.transition('CANCELLED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('CANCELLED');
    });

    it('should allow STOPPING → CANCELLED', () => {
      const sm = new RunStateMachine('STOPPING');
      const result = sm.transition('CANCELLED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('CANCELLED');
    });
  });

  describe('invalid transitions', () => {
    it('should reject SPAWNING → QUEUED (reverse transition)', () => {
      const sm = new RunStateMachine('SPAWNING');
      const result = sm.transition('QUEUED');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
      expect(sm.currentState).toBe('SPAWNING'); // State unchanged
    });

    it('should reject RUNNING → SPAWNING (skip back)', () => {
      const sm = new RunStateMachine('RUNNING');
      const result = sm.transition('SPAWNING');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });

    it('should reject QUEUED → RUNNING (skip SPAWNING)', () => {
      const sm = new RunStateMachine('QUEUED');
      const result = sm.transition('RUNNING');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('INVALID_TRANSITION');
      }
    });

    it('should reject SUCCEEDED → any state (terminal)', () => {
      const sm = new RunStateMachine('SUCCEEDED');
      const result = sm.transition('RUNNING');

      expect(result.isErr()).toBe(true);
    });

    it('should reject FAILED → any state (terminal)', () => {
      const sm = new RunStateMachine('FAILED');
      const result = sm.transition('QUEUED');

      expect(result.isErr()).toBe(true);
    });

    it('should reject CANCELLED → any state (terminal)', () => {
      const sm = new RunStateMachine('CANCELLED');
      const result = sm.transition('QUEUED');

      expect(result.isErr()).toBe(true);
    });

    it('should reject RUNNING → SUCCEEDED (must go through STOPPING first)', () => {
      const sm = new RunStateMachine('RUNNING');
      const result = sm.transition('SUCCEEDED');

      expect(result.isErr()).toBe(true);
    });

    it('should allow RUNNING → FAILED (direct failure path)', () => {
      const sm = new RunStateMachine('RUNNING');
      const result = sm.transition('FAILED');

      expect(result.isOk()).toBe(true);
      expect(sm.currentState).toBe('FAILED');
    });
  });

  describe('precondition validation', () => {
    it('should reject STOPPING → SUCCEEDED with non-zero exit code', () => {
      const sm = new RunStateMachine('STOPPING');
      const context: RunTransitionContext = { exitCode: 1 };
      const result = sm.transition('SUCCEEDED', context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('PRECONDITION_FAILED');
        expect(result.error.message).toContain('must be 0');
      }
    });

    it('should reject STOPPING → FAILED with exit code 0', () => {
      const sm = new RunStateMachine('STOPPING');
      const context: RunTransitionContext = { exitCode: 0 };
      const result = sm.transition('FAILED', context);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('PRECONDITION_FAILED');
        expect(result.error.message).toContain('must be non-zero');
      }
    });

    it('should accept STOPPING → FAILED with exit code undefined', () => {
      const sm = new RunStateMachine('STOPPING');
      const result = sm.transition('FAILED');

      // Should succeed because undefined defaults to 1 for FAILED
      expect(result.isOk()).toBe(true);
      expect(sm.exitCode).toBe(1);
    });

    it('should accept STOPPING → SUCCEEDED with exit code undefined', () => {
      const sm = new RunStateMachine('STOPPING');
      const result = sm.transition('SUCCEEDED');

      // Should succeed because undefined defaults to 0 for SUCCEEDED
      expect(result.isOk()).toBe(true);
      expect(sm.exitCode).toBe(0);
    });
  });

  describe('exit code handling', () => {
    it('should store exit code for terminal states', () => {
      const sm = new RunStateMachine('STOPPING');
      sm.transition('SUCCEEDED', { exitCode: 0 });

      expect(sm.exitCode).toBe(0);
    });

    it('should default to 0 for SUCCEEDED', () => {
      const sm = new RunStateMachine('STOPPING');
      sm.transition('SUCCEEDED');

      expect(sm.exitCode).toBe(0);
    });

    it('should default to 1 for FAILED', () => {
      const sm = new RunStateMachine('STOPPING');
      sm.transition('FAILED', { exitCode: 1 });

      expect(sm.exitCode).toBe(1);
    });

    it('should default to 1 for CANCELLED', () => {
      const sm = new RunStateMachine('RUNNING');
      sm.transition('CANCELLED');

      expect(sm.exitCode).toBe(1);
    });

    it('should use provided exit code for CANCELLED', () => {
      const sm = new RunStateMachine('RUNNING');
      sm.transition('CANCELLED', { exitCode: 130 });

      expect(sm.exitCode).toBe(130);
    });

    it('should not store exit code for non-terminal states', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');

      expect(sm.exitCode).toBeUndefined();
    });
  });

  describe('snapshot and history tracking', () => {
    it('should record transition in history', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');

      expect(sm.history).toHaveLength(1);
      expect(sm.history[0].from).toBe('QUEUED');
      expect(sm.history[0].to).toBe('SPAWNING');
      expect(sm.history[0].at).toBeDefined();
    });

    it('should include reason in history when provided', () => {
      const sm = new RunStateMachine('QUEUED');
      const context: RunTransitionContext = { reason: 'Agent spawned' };
      sm.transition('SPAWNING', context);

      expect(sm.history[0].reason).toBe('Agent spawned');
    });

    it('should return snapshot with current state and history', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');
      sm.transition('RUNNING');

      const snapshot = sm.snapshot();

      expect(snapshot.current_state).toBe('RUNNING');
      expect(snapshot.history).toHaveLength(2);
      expect(snapshot.exit_code).toBeUndefined();
    });

    it('should include exit code in snapshot for terminal states', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');
      sm.transition('RUNNING');
      sm.transition('STOPPING');
      sm.transition('SUCCEEDED');

      const snapshot = sm.snapshot();

      expect(snapshot.exit_code).toBe(0);
    });

    it('should track multiple transitions', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');
      sm.transition('RUNNING');
      sm.transition('STOPPING');
      sm.transition('SUCCEEDED');

      expect(sm.history).toHaveLength(4);
      expect(sm.currentState).toBe('SUCCEEDED');
    });

    it('should provide immutable history', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');

      const history1 = sm.history;
      sm.transition('RUNNING');

      expect(history1).toHaveLength(1);
      expect(sm.history).toHaveLength(2);
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      const sm = new RunStateMachine('QUEUED');
      expect(sm.canTransition('SPAWNING')).toBe(true);
      expect(sm.canTransition('CANCELLED')).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      const sm = new RunStateMachine('QUEUED');
      expect(sm.canTransition('RUNNING')).toBe(false);
      expect(sm.canTransition('SUCCEEDED')).toBe(false);
    });

    it('should update valid transitions after state change', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');

      expect(sm.canTransition('QUEUED')).toBe(false);
      expect(sm.canTransition('RUNNING')).toBe(true);
    });
  });

  describe('complex workflows', () => {
    it('should handle successful run path', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');
      sm.transition('RUNNING');
      sm.transition('STOPPING');
      sm.transition('SUCCEEDED');

      expect(sm.currentState).toBe('SUCCEEDED');
      expect(sm.exitCode).toBe(0);
      expect(sm.history).toHaveLength(4);
    });

    it('should handle failed run path', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');
      sm.transition('RUNNING');
      sm.transition('STOPPING');
      sm.transition('FAILED', { exitCode: 1 });

      expect(sm.currentState).toBe('FAILED');
      expect(sm.exitCode).toBe(1);
    });

    it('should handle cancelled during execution', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');
      sm.transition('RUNNING');
      sm.transition('CANCELLED', { reason: 'User requested cancellation' });

      expect(sm.currentState).toBe('CANCELLED');
      expect(sm.history[sm.history.length - 1].reason).toBe('User requested cancellation');
    });

    it('should handle spawn failure', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('SPAWNING');
      sm.transition('FAILED', { reason: 'Agent failed to spawn' });

      expect(sm.currentState).toBe('FAILED');
      expect(sm.exitCode).toBe(1);
    });

    it('should handle queue cancellation', () => {
      const sm = new RunStateMachine('QUEUED');
      sm.transition('CANCELLED');

      expect(sm.currentState).toBe('CANCELLED');
      expect(sm.history).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle transition to same state (should fail)', () => {
      const sm = new RunStateMachine('QUEUED');
      const result = sm.transition('QUEUED');

      expect(result.isErr()).toBe(true);
    });

    it('should handle timeout as cancellation reason', () => {
      const sm = new RunStateMachine('RUNNING');
      const context: RunTransitionContext = { reason: 'Timeout after 60s', timeout: true };
      sm.transition('CANCELLED', context);

      expect(sm.currentState).toBe('CANCELLED');
      expect(sm.history[sm.history.length - 1].reason).toBe('Timeout after 60s');
    });

    it('should preserve exit code across snapshots', () => {
      const sm = new RunStateMachine('STOPPING');
      sm.transition('SUCCEEDED', { exitCode: 0 });

      const snapshot1 = sm.snapshot();
      const snapshot2 = sm.snapshot();

      expect(snapshot1.exit_code).toBe(0);
      expect(snapshot2.exit_code).toBe(0);
    });
  });
});
