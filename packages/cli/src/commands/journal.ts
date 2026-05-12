import Database from 'better-sqlite3';
import { missionDbPath } from '../runtime-store';

export function journalListCommand(): string {
  const db = new Database(missionDbPath());
  const rows = db
    .prepare(
      'SELECT id, current_state, ticker, market, created_at FROM missions ORDER BY created_at DESC LIMIT 20'
    )
    .all() as Array<Record<string, unknown>>;
  db.close();
  if (rows.length === 0) {
    return 'no missions';
  }
  return rows
    .map(
      (row) =>
        `${row.id} | ${row.ticker ?? 'n/a'} | ${row.market ?? 'n/a'} | ${row.current_state} | ${row.created_at}`
    )
    .join('\n');
}

export function journalShowCommand(id: string): string {
  const db = new Database(missionDbPath());
  const mission = db.prepare('SELECT * FROM missions WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  const journal = db
    .prepare('SELECT * FROM journal_entries WHERE mission_id = ?')
    .get(id) as Record<string, unknown> | undefined;
  db.close();
  if (!mission) {
    return `mission ${id} not found`;
  }
  return JSON.stringify({ mission, journal: journal ?? null }, null, 2);
}
