'use client';

import { useState } from 'react';
import { RunStatusBadge } from './StatusBadge';
import type { Gate } from '@/lib/types';

interface GateCardProps {
  gate: Gate;
  onRun?: (gateId: string) => void;
}

/**
 * GateCard - Visual display of gate results with expandable details
 * Shows pass/fail/running states with appropriate colors and animations
 */
export function GateCard({ gate, onRun }: GateCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusConfig = {
    passed: {
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      textColor: 'text-green-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ),
    },
    failed: {
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      textColor: 'text-red-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      ),
    },
    running: {
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
      textColor: 'text-yellow-400',
      icon: (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ),
    },
    skipped: {
      bgColor: 'bg-gray-500/10',
      borderColor: 'border-gray-500/30',
      textColor: 'text-gray-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      ),
    },
    pending: {
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
      textColor: 'text-blue-400',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      ),
    },
  };

  const config = statusConfig[gate.status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <div
      className={`${config.bgColor} border ${config.borderColor} rounded-lg overflow-hidden transition-all duration-200`}
    >
      {/* Main Card */}
      <div
        className="p-4 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => gate.status === 'failed' && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={config.textColor}>{config.icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-foreground">{gate.name}</h3>
                <RunStatusBadge status={gate.status} />
              </div>
              <p className="text-sm text-muted-foreground mt-1 font-mono">{gate.command}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {gate.status === 'pending' && onRun && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRun(gate.id);
                }}
                className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
              >
                Run Gate
              </button>
            )}
            {gate.status === 'failed' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className={`p-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Gate created timestamp */}
        {gate.created_at && (
          <div className="mt-2 text-sm text-muted-foreground">
            Created: {new Date(gate.created_at).toLocaleString()}
          </div>
        )}
      </div>

      {/* Expandable Failure Details */}
      {gate.status === 'failed' && isExpanded && (
        <div className="border-t border-border bg-black/50 p-4">
          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">Gate Output:</h4>
            {gate.output_path ? (
              <a
                href={gate.output_path}
                className="text-sm text-primary hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                View log output →
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">No output available</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
