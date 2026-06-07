/**
 * Tests for Project MCP tools
 */

import { describe, it, expect } from 'vitest';
import {
  flockProjectListSchema,
  flockProjectCreateSchema,
  flockProjectStatusSchema,
} from '../../src/tools/projects';

describe('Project Tools - Schema Validation', () => {
  describe('flockProjectListSchema', () => {
    it('should accept empty object', () => {
      const result = flockProjectListSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept any input (no constraints)', () => {
      const result = flockProjectListSchema.safeParse({ anything: 'test' });
      expect(result.success).toBe(true);
    });
  });

  describe('flockProjectCreateSchema', () => {
    it('should accept valid input', () => {
      const validInput = {
        name: 'Test Project',
        repoPath: '/path/to/repo',
        defaultBranch: 'main',
      };
      const result = flockProjectCreateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should accept input without defaultBranch', () => {
      const validInput = {
        name: 'Test Project',
        repoPath: '/path/to/repo',
      };
      const result = flockProjectCreateSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing name', () => {
      const invalidInput = {
        repoPath: '/path/to/repo',
      };
      const result = flockProjectCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject missing repoPath', () => {
      const invalidInput = {
        name: 'Test Project',
      };
      const result = flockProjectCreateSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('flockProjectStatusSchema', () => {
    it('should accept valid input', () => {
      const validInput = { projectId: 'proj-1' };
      const result = flockProjectStatusSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject missing projectId', () => {
      const invalidInput = {};
      const result = flockProjectStatusSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject non-string projectId', () => {
      const invalidInput = { projectId: 123 };
      const result = flockProjectStatusSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });
});

describe('Project Tools - Tool Registration', () => {
  it('should export all tool names', async () => {
    const { TOOL_NAME_PROJECT_LIST, TOOL_NAME_PROJECT_CREATE, TOOL_NAME_PROJECT_STATUS } = await import('../../src/tools/projects');

    expect(TOOL_NAME_PROJECT_LIST).toBe('flock_project_list');
    expect(TOOL_NAME_PROJECT_CREATE).toBe('flock_project_create');
    expect(TOOL_NAME_PROJECT_STATUS).toBe('flock_project_status');
  });

  it('should export all tool descriptions', async () => {
    const { TOOL_DESC_PROJECT_LIST, TOOL_DESC_PROJECT_CREATE, TOOL_DESC_PROJECT_STATUS } = await import('../../src/tools/projects');

    expect(typeof TOOL_DESC_PROJECT_LIST).toBe('string');
    expect(typeof TOOL_DESC_PROJECT_CREATE).toBe('string');
    expect(typeof TOOL_DESC_PROJECT_STATUS).toBe('string');
  });

  it('should export all tool functions', async () => {
    const { flockProjectList, flockProjectCreate, flockProjectStatus } = await import('../../src/tools/projects');

    expect(typeof flockProjectList).toBe('function');
    expect(typeof flockProjectCreate).toBe('function');
    expect(typeof flockProjectStatus).toBe('function');
  });
});
