'use client';

import { useEffect, useState } from 'react';

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions?: number;
  deletions?: number;
  hunks?: string[];
}

interface DiffViewerProps {
  diff: string;
  isLoading?: boolean;
}

type ViewMode = 'line-by-line' | 'side-by-side';

/**
 * DiffViewer - Displays code changes with custom rendering
 * Features: file tree, side-by-side/unified views, syntax highlighting
 */
export function DiffViewer({ diff, isLoading = false }: DiffViewerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('side-by-side');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [parsedChanges, setParsedChanges] = useState<FileChange[]>([]);

  // Parse the diff to extract file changes
  useEffect(() => {
    if (!diff) {
      setParsedChanges([]);
      return;
    }

    const lines = diff.split('\n');
    const changes: FileChange[] = [];
    let currentFile: FileChange | null = null;
    let currentHunks: string[] = [];
    let currentHunksCounts = { additions: 0, deletions: 0 };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // New file indicator
      if (line.startsWith('+++')) {
        if (currentFile) {
          currentFile.hunks = currentHunks;
          currentFile.additions = currentHunksCounts.additions;
          currentFile.deletions = currentHunksCounts.deletions;
          changes.push(currentFile);
        }
        const filePath = line.substring(4).replace('b/', '').replace('a/', '');
        currentFile = { path: filePath, status: 'modified' };
        currentHunks = [];
        currentHunksCounts = { additions: 0, deletions: 0 };
      }
      // Old file indicator
      else if (line.startsWith('---')) {
        // Store the old path for reference
        const oldPath = line.substring(4).replace('a/', '').replace('b/', '');
        if (currentFile && oldPath === '/dev/null') {
          currentFile.status = 'added';
        }
      }
      // Binary file indicator
      else if (line.includes('Binary file')) {
        if (currentFile) {
          currentFile.additions = 0;
          currentFile.deletions = 0;
          currentFile.hunks = ['Binary file'];
          changes.push(currentFile);
          currentFile = null;
        }
      }
      // Hunks start
      else if (line.startsWith('@@')) {
        if (currentFile) {
          // Extract +/- counts from hunk header
          const addMatch = line.match(/\+(\d+),?(\d+)?/);
          if (addMatch) {
            currentHunksCounts.additions += parseInt(addMatch[2] || '1', 10);
          }
          const delMatch = line.match(/-(\d+),?(\d+)?/);
          if (delMatch) {
            currentHunksCounts.deletions += parseInt(delMatch[2] || '1', 10);
          }
        }
        if (currentFile) {
          currentHunks.push(line);
        }
      }
      // Other lines in the hunk
      else if (currentFile) {
        currentHunks.push(line);
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunksCounts.additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunksCounts.deletions++;
        }
      }
    }

    if (currentFile) {
      currentFile.hunks = currentHunks;
      currentFile.additions = currentHunksCounts.additions;
      currentFile.deletions = currentHunksCounts.deletions;
      changes.push(currentFile);
    }

    // Determine file status based on additions/deletions
    changes.forEach(change => {
      if (change.additions === 0 && change.deletions! > 0) {
        change.status = 'deleted';
      } else if (change.additions! > 0 && change.deletions === 0) {
        change.status = 'added';
      }
    });

    setParsedChanges(changes);
    if (changes.length > 0) {
      setSelectedFile(changes[0].path);
    }
  }, [diff]);

  const totalAdditions = parsedChanges.reduce((sum, f) => sum + (f.additions || 0), 0);
  const totalDeletions = parsedChanges.reduce((sum, f) => sum + (f.deletions || 0), 0);

  const selectedFileData = parsedChanges.find(f => f.path === selectedFile);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading diff...</div>
      </div>
    );
  }

  if (!diff || parsedChanges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <svg className="w-12 h-12 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>No changes yet</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Summary Header */}
      <div className="bg-card border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium">{parsedChanges.length} files changed</span>
            <span className="text-green-500">+{totalAdditions} additions</span>
            <span className="text-red-500">-{totalDeletions} deletions</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                viewMode === 'side-by-side'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              Side by Side
            </button>
            <button
              onClick={() => setViewMode('line-by-line')}
              className={`px-3 py-1 text-sm rounded transition-colors ${
                viewMode === 'line-by-line'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              Unified
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* File Tree Sidebar */}
        <div className="w-64 bg-secondary/30 border-r border-border overflow-y-auto">
          <div className="p-2">
            {parsedChanges.map((file) => (
              <button
                key={file.path}
                onClick={() => setSelectedFile(file.path)}
                className={`w-full text-left px-3 py-2 rounded mb-1 text-sm transition-colors ${
                  selectedFile === file.path
                    ? 'bg-primary/20 text-foreground'
                    : 'hover:bg-secondary/50 text-muted-foreground'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate flex-1 mr-2">{file.path}</span>
                  <FileStatusIcon status={file.status} />
                </div>
                {(file.additions! > 0 || file.deletions! > 0) && (
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    {file.additions! > 0 && <span className="text-green-600">+{file.additions}</span>}
                    {file.deletions! > 0 && <span className="text-red-600">-{file.deletions}</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Diff Content */}
        <div className="flex-1 overflow-auto bg-card">
          {selectedFileData && (
            <div className="font-mono text-sm" style={{ fontSize: '13px' }}>
              <div className="px-4 py-2 bg-secondary/30 border-b border-border">
                <span className="font-medium">{selectedFileData.path}</span>
              </div>
              {selectedFileData.hunks && selectedFileData.hunks.length > 0 && selectedFileData.hunks[0] === 'Binary file' ? (
                <div className="p-4 text-muted-foreground">Binary file not displayed</div>
              ) : (
                <DiffHunks hunks={selectedFileData.hunks || []} viewMode={viewMode} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DiffHunks({ hunks, viewMode }: { hunks: string[]; viewMode: ViewMode }) {
  if (viewMode === 'line-by-line') {
    return (
      <div>
        {hunks.map((line, i) => {
          if (line.startsWith('@@')) {
            return (
              <div key={i} className="px-4 py-1 bg-blue-500/10 text-blue-400">
                {line}
              </div>
            );
          }
          if (line.startsWith('+')) {
            return (
              <div key={i} className="px-4 py-0.5 bg-green-500/10 text-green-300 whitespace-pre">
                {line}
              </div>
            );
          }
          if (line.startsWith('-')) {
            return (
              <div key={i} className="px-4 py-0.5 bg-red-500/10 text-red-300 whitespace-pre">
                {line}
              </div>
            );
          }
          return (
            <div key={i} className="px-4 py-0.5 text-muted-foreground whitespace-pre">
              {line || ' '}
            </div>
          );
        })}
      </div>
    );
  }

  // Side-by-side view (simplified)
  return (
    <div className="grid grid-cols-2 gap-0">
      <div className="border-r border-border">
        {hunks.map((line, i) => {
          if (line.startsWith('@@') || line.startsWith('+')) return null;
          if (line.startsWith('-')) {
            return (
              <div key={i} className="px-4 py-0.5 bg-red-500/10 text-red-300 whitespace-pre">
                {line}
              </div>
            );
          }
          return (
            <div key={i} className="px-4 py-0.5 text-muted-foreground whitespace-pre">
              {line || ' '}
            </div>
          );
        })}
      </div>
      <div>
        {hunks.map((line, i) => {
          if (line.startsWith('@@')) {
            return (
              <div key={i} className="px-4 py-1 bg-blue-500/10 text-blue-400 col-span-2">
                {line}
              </div>
            );
          }
          if (line.startsWith('-')) return null;
          if (line.startsWith('+')) {
            return (
              <div key={i} className="px-4 py-0.5 bg-green-500/10 text-green-300 whitespace-pre">
                {line}
              </div>
            );
          }
          return (
            <div key={i} className="px-4 py-0.5 text-muted-foreground whitespace-pre">
              {line || ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FileStatusIcon({ status }: { status: FileChange['status'] }) {
  const icons = {
    added: (
      <span className="text-green-500" title="Added">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
      </span>
    ),
    modified: (
      <span className="text-yellow-500" title="Modified">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
      </span>
    ),
    deleted: (
      <span className="text-red-500" title="Deleted">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      </span>
    ),
  };

  return icons[status];
}
