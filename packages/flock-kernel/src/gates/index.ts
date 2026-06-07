/**
 * Flock Gates Module
 *
 * Quality gate execution and policy validation.
 */

// ============================================================================
// Gate Runner
// ============================================================================

export type {
  GateConfig,
  GateRunResult,
} from './gate-runner';

export {
  GateRunner,
  createGateRunner,
} from './gate-runner';

// ============================================================================
// Diff Policy Validator
// ============================================================================

export type {
  PolicyValidationResult,
  PolicyRule,
} from './diff-policy';

export {
  NoDirectMainWritePolicy,
  FileCountLimitPolicy,
  ForbiddenPathsPolicy,
  RequiredChangesPolicy,
  DiffPolicyValidator,
  validateDiffPolicy,
} from './diff-policy';
