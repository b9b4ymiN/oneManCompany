/**
 * Flock Audit Trail
 *
 * Audit logging for all Flock actions.
 * Writes to append-only audit log file.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Audit log entry.
 */
export interface AuditLogEntry {
  /** ISO timestamp of the action */
  timestamp: string;
  /** Who performed the action (user, system, agent_id) */
  actor: string;
  /** Action that was performed */
  action: string;
  /** Target of the action (task_id, run_id, etc.) */
  target: string;
  /** Additional details about the action */
  details: Record<string, unknown>;
}

/**
 * Log an audit entry.
 *
 * Writes to .flock/logs/audit.jsonl in append-only mode.
 * One line per action, JSON format.
 *
 * @param action - Action that was performed
 * @param actor - Who performed the action
 * @param target - Target of the action
 * @param details - Additional details
 */
export async function auditLog(
  action: string,
  actor: string,
  target: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  const auditPath = join(process.cwd(), '.flock', 'logs', 'audit.jsonl');

  // Ensure directory exists
  await mkdir(join(process.cwd(), '.flock', 'logs'), { recursive: true });

  // Create audit entry
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    actor,
    action,
    target,
    details,
  };

  // Append to audit log
  const logLine = JSON.stringify(entry) + '\n';
  await appendFile(auditPath, logLine);
}

/**
 * Read all audit entries.
 *
 * @returns Array of all audit entries
 */
export async function readAuditLog(): Promise<AuditLogEntry[]> {
  const fs = require('node:fs');
  const auditPath = join(process.cwd(), '.flock', 'logs', 'audit.jsonl');

  if (!fs.existsSync(auditPath)) {
    return [];
  }

  const content = fs.readFileSync(auditPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  return lines.map((line: string) => {
    try {
      return JSON.parse(line) as AuditLogEntry;
    } catch {
      return null;
    }
  }).filter((e: AuditLogEntry | null): e is AuditLogEntry => e !== null);
}

/**
 * Query audit log by action.
 *
 * @param action - Action to filter by
 * @returns Array of matching audit entries
 */
export async function queryAuditByAction(action: string): Promise<AuditLogEntry[]> {
  const allEntries = await readAuditLog();
  return allEntries.filter((entry) => entry.action === action);
}

/**
 * Query audit log by actor.
 *
 * @param actor - Actor to filter by
 * @returns Array of matching audit entries
 */
export async function queryAuditByActor(actor: string): Promise<AuditLogEntry[]> {
  const allEntries = await readAuditLog();
  return allEntries.filter((entry) => entry.actor === actor);
}

/**
 * Query audit log by target.
 *
 * @param target - Target to filter by
 * @returns Array of matching audit entries
 */
export async function queryAuditByTarget(target: string): Promise<AuditLogEntry[]> {
  const allEntries = await readAuditLog();
  return allEntries.filter((entry) => entry.target === target);
}
