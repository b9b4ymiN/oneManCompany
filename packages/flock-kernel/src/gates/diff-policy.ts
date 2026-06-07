/**
 * Flock Diff Policy Validator
 *
 * Validates diffs against configured policies.
 * Enforces rules about branch safety, file limits, and forbidden paths.
 */

import type { ConfigPolicies } from '../types';
import type { DiffSummary } from '../workspace';

// ============================================================================
// Policy Validation Types
// ============================================================================

/**
 * Policy validation result.
 */
export interface PolicyValidationResult {
  /** Whether the diff passes all policies */
  valid: boolean;
  /** List of policy violations (empty if valid) */
  violations: string[];
}

/**
 * Policy rule configuration.
 */
export interface PolicyRule {
  /** Rule name */
  name: string;
  /** Validate the rule against the diff */
  validate(diff: DiffSummary): PolicyValidationResult;
}

// ============================================================================
// Built-in Policy Rules
// ============================================================================

/**
 * No direct main branch writes policy.
 *
 * Prevents agents from directly modifying the main branch.
 * All changes should go through branches and PRs.
 */
export class NoDirectMainWritePolicy implements PolicyRule {
  name = 'no-direct-main-write';
  private protectedBranches: Set<string>;
  private currentBranch: string;

  constructor(
    protectedBranches: string[] = ['main', 'master'],
    currentBranch: string = ''
  ) {
    this.protectedBranches = new Set(protectedBranches);
    this.currentBranch = currentBranch;
  }

  /**
   * Validate the policy.
   * The diff parameter is not used for this policy - we check the branch directly.
   */
  validate(_diff: DiffSummary): PolicyValidationResult {
    // Check if current branch is protected
    if (this.protectedBranches.has(this.currentBranch)) {
      return {
        valid: false,
        violations: [
          `Cannot directly write to protected branch: ${this.currentBranch}`,
        ],
      };
    }

    return { valid: true, violations: [] };
  }

  /**
   * Set the current branch for validation.
   */
  setBranch(branch: string): void {
    this.currentBranch = branch;
  }
}

/**
 * File count limits policy.
 *
 * Ensures diffs don't exceed configured file change limits.
 */
export class FileCountLimitPolicy implements PolicyRule {
  name = 'file-count-limit';
  private maxFiles: number;
  private maxDeletions: number;

  constructor(maxFiles: number = 100, maxDeletions: number = 50) {
    this.maxFiles = maxFiles;
    this.maxDeletions = maxDeletions;
  }

  validate(diff: DiffSummary): PolicyValidationResult {
    const violations: string[] = [];

    if (diff.filesChanged > this.maxFiles) {
      violations.push(
        `Too many files changed: ${diff.filesChanged} (max: ${this.maxFiles})`
      );
    }

    if (diff.deletions > this.maxDeletions) {
      violations.push(
        `Too many deletions: ${diff.deletions} (max: ${this.maxDeletions})`
      );
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}

/**
 * Forbidden paths policy.
 *
 * Prevents changes to sensitive or protected files/directories.
 */
export class ForbiddenPathsPolicy implements PolicyRule {
  name = 'forbidden-paths';
  private forbiddenPatterns: RegExp[];

  constructor(forbiddenPatterns: string[] = []) {
    // Convert glob patterns to regex
    this.forbiddenPatterns = forbiddenPatterns.map((pattern) => {
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regexPattern}`);
    });
  }

  validate(diff: DiffSummary): PolicyValidationResult {
    const violations: string[] = [];

    for (const file of diff.files) {
      for (const pattern of this.forbiddenPatterns) {
        if (pattern.test(file.path)) {
          violations.push(`Cannot modify forbidden path: ${file.path}`);
          break;
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}

/**
 * Required changes policy.
 *
 * Ensures certain file types or paths are included in the diff.
 */
export class RequiredChangesPolicy implements PolicyRule {
  name = 'required-changes';
  private requiredPatterns: RegExp[];

  constructor(requiredPatterns: string[] = []) {
    this.requiredPatterns = requiredPatterns.map((pattern) => {
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(`^${regexPattern}`);
    });
  }

  validate(diff: DiffSummary): PolicyValidationResult {
    const violations: string[] = [];
    const changedPaths = new Set(diff.files.map((f) => f.path));

    for (const pattern of this.requiredPatterns) {
      const hasMatch = Array.from(changedPaths).some((path) =>
        pattern.test(path)
      );

      if (!hasMatch) {
        violations.push(`Missing required changes matching: ${pattern.source}`);
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}

// ============================================================================
// Policy Validator
// ============================================================================

/**
 * Validates diffs against configured policies.
 *
 * Collects all policy violations and returns a combined result.
 */
export class DiffPolicyValidator {
  private rules: PolicyRule[] = [];
  private branch: string = '';

  /**
   * Register a policy rule.
   */
  registerRule(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  /**
   * Set the current branch for validation.
   */
  setBranch(branch: string): void {
    this.branch = branch;
    // Update NoDirectMainWritePolicy if present
    for (const rule of this.rules) {
      if (rule instanceof NoDirectMainWritePolicy) {
        rule.setBranch(branch);
      }
    }
  }

  /**
   * Validate a diff against all registered policies.
   *
   * Returns a combined result with all violations.
   */
  validateDiff(diff: DiffSummary): PolicyValidationResult {
    const allViolations: string[] = [];

    for (const rule of this.rules) {
      const result = rule.validate(diff);
      allViolations.push(...result.violations);
    }

    return {
      valid: allViolations.length === 0,
      violations: allViolations,
    };
  }

  /**
   * Create a policy validator from ConfigPolicies.
   */
  static fromConfig(
    policies: ConfigPolicies,
    branch: string = ''
  ): DiffPolicyValidator {
    const validator = new DiffPolicyValidator();
    validator.branch = branch;

    // No direct main branch writes
    if (policies.forbid_direct_main_branch_write) {
      validator.registerRule(new NoDirectMainWritePolicy([], branch));
    }

    // File count limits
    validator.registerRule(
      new FileCountLimitPolicy(
        100, // maxFiles
        50 // maxDeletions
      )
    );

    // Forbidden paths (from config if available)
    // Currently not in ConfigPolicies, but could be added

    // Required changes (from config if available)
    // Currently not in ConfigPolicies, but could be added

    return validator;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate a diff against policies.
 *
 * Convenience function that creates a validator and validates the diff.
 */
export function validateDiffPolicy(
  diff: DiffSummary,
  policies: ConfigPolicies,
  branch: string = ''
): PolicyValidationResult {
  const validator = DiffPolicyValidator.fromConfig(policies, branch);
  return validator.validateDiff(diff);
}
