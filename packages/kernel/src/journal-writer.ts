import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import {
  agentCallsTable,
  agentScorecardTable,
  costTrackingTable,
  debateRecordsTable,
  evidenceItemsTable,
  healthLogsTable,
  humanGatesTable,
  journalEntriesTable,
  messagesTable,
  missionsTable,
} from './journal-schema';
import type { JournalMissionRecord } from './types';

const missionSchema = z.object({
  id: z.string(),
  domain_id: z.string(),
  mission_type: z.string(),
  subject_type: z.string(),
  ticker: z.string().optional(),
  market: z.string().optional(),
  owner_brief: z.string(),
  owner_assumption: z.string().optional(),
  owner_constraint: z.string().optional(),
  current_state: z.string(),
  final_state: z.string().optional(),
  status: z.string(),
  evidence_score: z.number().optional(),
  created_at: z.string(),
  completed_at: z.string().optional(),
  failed_at: z.string().optional(),
  failure_reason: z.string().optional(),
  metadata_json: z.string().optional(),
});

const journalEntrySchema = z.object({
  id: z.string(),
  mission_id: z.string(),
  created_at: z.string(),
  subject_json: z.string(),
  decision_state: z.string(),
  decision_date: z.string(),
  rationale_summary: z.string(),
  valuation_json: z.string().nullable().optional(),
  assumptions_json: z.string().nullable().optional(),
  evidence_json: z.string().nullable().optional(),
  analyst_views_json: z.string().nullable().optional(),
  thesis_breakers_json: z.string().nullable().optional(),
  follow_up_events_json: z.string().nullable().optional(),
  outcome_json: z.string().nullable().optional(),
  lessons_json: z.string().nullable().optional(),
});

export interface JournalBundle {
  mission: JournalMissionRecord;
  agent_calls: Array<Record<string, unknown>>;
  messages: Array<Record<string, unknown>>;
  evidence_items: Array<Record<string, unknown>>;
  human_gates: Array<Record<string, unknown>>;
  debate_records: Array<Record<string, unknown>>;
  journal_entry: Record<string, unknown>;
  agent_scorecard: Array<Record<string, unknown>>;
  cost_tracking: Array<Record<string, unknown>>;
  health_logs: Array<Record<string, unknown>>;
}

export class JournalWriter {
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database;
  readonly schemaPath: string;
  readonly canReadMission: (missionId: string) => boolean;

  constructor(
    dbPath = ':memory:',
    schemaPath = path.resolve(process.cwd(), 'docs', 'JOURNAL_SCHEMA.sql'),
    canReadMission: (missionId: string) => boolean = () => true
  ) {
    this.sqlite = new Database(dbPath);
    this.db = drizzle(this.sqlite);
    this.schemaPath = schemaPath;
    this.canReadMission = canReadMission;
  }

  initializeSchema(): Result<true, Error> {
    const resolvedPath = path.resolve(this.schemaPath);
    if (
      !resolvedPath.startsWith(process.cwd()) ||
      !resolvedPath.endsWith('.sql')
    ) {
      return err(
        new Error(
          'Schema path must resolve inside the repository and end with .sql'
        )
      );
    }
    try {
      this.sqlite.exec(fs.readFileSync(resolvedPath, 'utf8'));
      return ok(true);
    } catch (error) {
      return err(
        error instanceof Error
          ? error
          : new Error('Schema initialization failed')
      );
    }
  }

  writeBundle(
    bundle: JournalBundle
  ): Result<{ mission_id: string; journal_id: string }, Error> {
    const missionParse = missionSchema.safeParse(bundle.mission);
    if (!missionParse.success) {
      return err(new Error(missionParse.error.message));
    }
    const journalParse = journalEntrySchema.safeParse(bundle.journal_entry);
    if (!journalParse.success) {
      return err(new Error(journalParse.error.message));
    }
    try {
      this.db.insert(missionsTable).values(bundle.mission).run();
      if (bundle.agent_calls.length > 0)
        this.db
          .insert(agentCallsTable)
          .values(bundle.agent_calls as never[])
          .run();
      if (bundle.messages.length > 0)
        this.db
          .insert(messagesTable)
          .values(bundle.messages as never[])
          .run();
      if (bundle.evidence_items.length > 0)
        this.db
          .insert(evidenceItemsTable)
          .values(bundle.evidence_items as never[])
          .run();
      if (bundle.human_gates.length > 0)
        this.db
          .insert(humanGatesTable)
          .values(bundle.human_gates as never[])
          .run();
      if (bundle.debate_records.length > 0)
        this.db
          .insert(debateRecordsTable)
          .values(bundle.debate_records as never[])
          .run();
      this.db
        .insert(journalEntriesTable)
        .values(bundle.journal_entry as never)
        .run();
      if (bundle.agent_scorecard.length > 0)
        this.db
          .insert(agentScorecardTable)
          .values(bundle.agent_scorecard as never[])
          .run();
      if (bundle.cost_tracking.length > 0)
        this.db
          .insert(costTrackingTable)
          .values(bundle.cost_tracking as never[])
          .run();
      if (bundle.health_logs.length > 0)
        this.db
          .insert(healthLogsTable)
          .values(bundle.health_logs as never[])
          .run();
      return ok({
        mission_id: bundle.mission.id,
        journal_id: String(bundle.journal_entry.id),
      });
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error('Journal insert failed')
      );
    }
  }

  readJournalEntry(
    missionId: string
  ): Result<z.infer<typeof journalEntrySchema>, Error> {
    try {
      const row = this.db
        .select()
        .from(journalEntriesTable)
        .where(eq(journalEntriesTable.mission_id, missionId))
        .get();
      return ok(journalEntrySchema.parse(row));
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error('Journal read failed')
      );
    }
  }

  close(): void {
    this.sqlite.close();
  }
}
