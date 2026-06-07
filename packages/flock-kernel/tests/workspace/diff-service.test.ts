/**
 * Tests for diff-service.ts
 */

import { describe, it, expect } from 'vitest';
import { generateDiffReport, generateCompactSummary } from '../../src/workspace/diff-service';
import type { DiffSummary, DiffFile } from '../../src/workspace/branch-manager';

describe('diff-service', () => {
  describe('generateDiffReport', () => {
    it('should generate report for empty diff', () => {
      const emptyDiff: DiffSummary = {
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        files: [],
      };

      const report = generateDiffReport(emptyDiff);

      expect(report).toContain('Files changed: 0');
      expect(report).toContain('Insertions: 0');
      expect(report).toContain('Deletions: 0');
      expect(report).toContain('No changes detected.');
    });

    it('should generate report for single file change', () => {
      const singleFileDiff: DiffSummary = {
        filesChanged: 1,
        insertions: 10,
        deletions: 5,
        files: [
          {
            path: 'src/example.ts',
            status: 'modified',
            insertions: 10,
            deletions: 5,
          },
        ],
      };

      const report = generateDiffReport(singleFileDiff);

      expect(report).toContain('Files changed: 1');
      expect(report).toContain('Insertions: 10');
      expect(report).toContain('Deletions: 5');
      expect(report).toContain('~ src/example.ts (+10, -5)');
    });

    it('should generate report for multiple file changes', () => {
      const multiFileDiff: DiffSummary = {
        filesChanged: 3,
        insertions: 50,
        deletions: 20,
        files: [
          {
            path: 'src/new-file.ts',
            status: 'added',
            insertions: 30,
            deletions: 0,
          },
          {
            path: 'src/modified.ts',
            status: 'modified',
            insertions: 15,
            deletions: 10,
          },
          {
            path: 'src/deleted.ts',
            status: 'deleted',
            insertions: 0,
            deletions: 10,
          },
        ],
      };

      const report = generateDiffReport(multiFileDiff);

      expect(report).toContain('Files changed: 3');
      expect(report).toContain('Insertions: 50');
      expect(report).toContain('Deletions: 20');
      expect(report).toContain('+ src/new-file.ts (+30, -0)');
      expect(report).toContain('~ src/modified.ts (+15, -10)');
      expect(report).toContain('- src/deleted.ts (+0, -10)');
    });

    it('should handle renamed files correctly', () => {
      const renamedDiff: DiffSummary = {
        filesChanged: 1,
        insertions: 0,
        deletions: 0,
        files: [
          {
            path: 'src/renamed.ts',
            status: 'renamed',
            insertions: 0,
            deletions: 0,
          },
        ],
      };

      const report = generateDiffReport(renamedDiff);

      expect(report).toContain('→ src/renamed.ts (+0, -0)');
    });

    it('should include proper section headers', () => {
      const diff: DiffSummary = {
        filesChanged: 1,
        insertions: 5,
        deletions: 2,
        files: [
          {
            path: 'test.ts',
            status: 'modified',
            insertions: 5,
            deletions: 2,
          },
        ],
      };

      const report = generateDiffReport(diff);

      expect(report).toContain('=== Diff Summary ===');
      expect(report).toContain('=== Files ===');
      expect(report).toContain('=== End of Diff ===');
    });
  });

  describe('generateCompactSummary', () => {
    it('should return "No changes" for empty diff', () => {
      const emptyDiff: DiffSummary = {
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        files: [],
      };

      const summary = generateCompactSummary(emptyDiff);

      expect(summary).toBe('No changes');
    });

    it('should return compact summary for single file', () => {
      const singleFileDiff: DiffSummary = {
        filesChanged: 1,
        insertions: 10,
        deletions: 0,
        files: [],
      };

      const summary = generateCompactSummary(singleFileDiff);

      expect(summary).toBe('1 file, +10');
    });

    it('should return compact summary for multiple files', () => {
      const multiFileDiff: DiffSummary = {
        filesChanged: 5,
        insertions: 100,
        deletions: 50,
        files: [],
      };

      const summary = generateCompactSummary(multiFileDiff);

      expect(summary).toBe('5 files, +100, -50');
    });

    it('should use correct pluralization', () => {
      const oneFile: DiffSummary = {
        filesChanged: 1,
        insertions: 5,
        deletions: 3,
        files: [],
      };

      const oneFileSummary = generateCompactSummary(oneFile);
      expect(oneFileSummary).toBe('1 file, +5, -3');

      const twoFiles: DiffSummary = {
        filesChanged: 2,
        insertions: 10,
        deletions: 5,
        files: [],
      };

      const twoFilesSummary = generateCompactSummary(twoFiles);
      expect(twoFilesSummary).toBe('2 files, +10, -5');
    });

    it('should handle only insertions', () => {
      const insertionsOnly: DiffSummary = {
        filesChanged: 3,
        insertions: 50,
        deletions: 0,
        files: [],
      };

      const summary = generateCompactSummary(insertionsOnly);

      expect(summary).toBe('3 files, +50');
    });

    it('should handle only deletions', () => {
      const deletionsOnly: DiffSummary = {
        filesChanged: 2,
        insertions: 0,
        deletions: 30,
        files: [],
      };

      const summary = generateCompactSummary(deletionsOnly);

      expect(summary).toBe('2 files, -30');
    });
  });
});
