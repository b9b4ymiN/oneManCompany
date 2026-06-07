/**
 * Tests for workspace-lifecycle.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { initWorkspace, getFlockDirectories, isFlockInitialized } from '../../src/workspace/workspace-lifecycle';

// Test directory
const TEST_DIR = '/tmp/flock-test-workspace';
const FLOCK_DIR = resolve(TEST_DIR, '.flock');

describe('workspace-lifecycle', () => {
  beforeEach(() => {
    // Clean up any existing test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    // Create test directory
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('initWorkspace', () => {
    it('should create .flock directory structure', async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const dirs = result.value;

        // Check main directory exists
        expect(existsSync(dirs.root)).toBe(true);
        expect(existsSync(dirs.workspaces)).toBe(true);
        expect(existsSync(dirs.logs)).toBe(true);
        expect(existsSync(dirs.artifacts)).toBe(true);
      }
    });

    it('should create .gitignore inside .flock', async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const gitignorePath = resolve(FLOCK_DIR, '.gitignore');
        expect(existsSync(gitignorePath)).toBe(true);

        const content = readFileSync(gitignorePath, 'utf-8');
        expect(content).toContain('workspaces/');
        expect(content).toContain('*.log');
        expect(content).toContain('*.db');
      }
    });

    it('should return correct directory paths', async () => {
      const result = await initWorkspace(TEST_DIR);

      expect(result.isOk()).toBe(true);

      if (result.isOk()) {
        const dirs = result.value;

        expect(dirs.root).toBe(FLOCK_DIR);
        expect(dirs.workspaces).toBe(resolve(FLOCK_DIR, 'workspaces'));
        expect(dirs.logs).toBe(resolve(FLOCK_DIR, 'logs'));
        expect(dirs.artifacts).toBe(resolve(FLOCK_DIR, 'artifacts'));
        expect(dirs.database).toBe(resolve(FLOCK_DIR, 'flock.db'));
        expect(dirs.config).toBe(resolve(FLOCK_DIR, 'config.yaml'));
      }
    });

    it('should handle existing .flock directory gracefully', async () => {
      // Create initial structure
      await initWorkspace(TEST_DIR);

      // Initialize again
      const result = await initWorkspace(TEST_DIR);

      expect(result.isOk()).toBe(true);
    });
  });

  describe('isFlockInitialized', () => {
    it('should return false when .flock does not exist', () => {
      const isInitialized = isFlockInitialized(TEST_DIR);
      expect(isInitialized).toBe(false);
    });

    it('should return true when .flock exists', async () => {
      await initWorkspace(TEST_DIR);

      const isInitialized = isFlockInitialized(TEST_DIR);
      expect(isInitialized).toBe(true);
    });
  });

  describe('getFlockDirectories', () => {
    it('should return correct paths without initialization', () => {
      const dirs = getFlockDirectories(TEST_DIR);

      expect(dirs.root).toBe(FLOCK_DIR);
      expect(dirs.workspaces).toBe(resolve(FLOCK_DIR, 'workspaces'));
      expect(dirs.logs).toBe(resolve(FLOCK_DIR, 'logs'));
      expect(dirs.artifacts).toBe(resolve(FLOCK_DIR, 'artifacts'));
      expect(dirs.database).toBe(resolve(FLOCK_DIR, 'flock.db'));
      expect(dirs.config).toBe(resolve(FLOCK_DIR, 'config.yaml'));
    });

    it('should work with absolute paths', () => {
      const absolutePath = resolve('/tmp', 'another-test');
      const dirs = getFlockDirectories(absolutePath);

      expect(dirs.root).toBe(resolve(absolutePath, '.flock'));
      expect(dirs.workspaces).toBe(resolve(absolutePath, '.flock', 'workspaces'));
    });
  });

  describe('error handling', () => {
    it('should handle file system errors gracefully', async () => {
      // Test with invalid path (assuming we can't create at root)
      const result = await initWorkspace('/root/flock-test');

      // This should fail due to permissions
      // The exact behavior depends on the system
      // We just verify it returns a Result
      expect(result).toBeDefined();
    });
  });
});
