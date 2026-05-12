import Database from 'better-sqlite3';
import { missionDbPath, readTrace } from '../runtime-store';

export function statusCommand(missionId: string): string {
  const db = new Database(missionDbPath());
  const row = db
    .prepare(
      'SELECT id, current_state, evidence_score, owner_brief FROM missions WHERE id = ?'
    )
    .get(missionId) as Record<string, unknown> | undefined;
  db.close();
  const trace = readTrace(missionId);
  if (!row) {
    return `mission ${missionId} not found`;
  }
  return [
    `mission_id=${row.id}`,
    `current_state=${row.current_state}`,
    `evidence_score=${row.evidence_score ?? 'n/a'}`,
    `brief=${row.owner_brief}`,
    ...(trace?.transitions.map(
      (item) => `${item.from}->${item.to} @ ${item.at}`
    ) ?? []),
  ].join('\n');
}
