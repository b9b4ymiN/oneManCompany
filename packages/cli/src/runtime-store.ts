import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const runtimeDir = path.resolve(process.cwd(), '.omc/runtime');
const dbPath = path.join(runtimeDir, 'onemancompany.db');
const traceDir = path.join(runtimeDir, 'missions');

export interface MissionTraceRecord {
  mission_id: string;
  brief: string;
  current_state: string;
  transitions: Array<{ from: string; to: string; at: string }>;
  adapter_trace: string[];
  evidence_score?: number;
}

export function ensureRuntime(): Database.Database {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(traceDir, { recursive: true });
  const db = new Database(dbPath);
  const schemaPath = path.resolve(process.cwd(), 'docs/JOURNAL_SCHEMA.sql');
  try {
    db.exec(fs.readFileSync(schemaPath, 'utf8'));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes('already exists')
    ) {
      throw error;
    }
  }
  return db;
}

export function missionDbPath(): string {
  return dbPath;
}

export function missionTracePath(missionId: string): string {
  return path.join(traceDir, `${missionId}.json`);
}

export function writeTrace(record: MissionTraceRecord): void {
  fs.writeFileSync(
    missionTracePath(record.mission_id),
    JSON.stringify(record, null, 2)
  );
}

export function readTrace(missionId: string): MissionTraceRecord | null {
  const file = missionTracePath(missionId);
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as MissionTraceRecord;
}
