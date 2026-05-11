# JOURNAL_SCHEMA

## Purpose
The decision journal is where onemancompany turns a completed mission into durable memory. The blueprint treats journaling as mandatory because learning, auditability, replay, and follow-up all depend on it. This document explains the SQLite schema stored in `docs/JOURNAL_SCHEMA.sql`, the role of each table, and the relationships that keep missions, evidence, debate, and outcomes connected.

## Design goals
1. **Local-first persistence**: SQLite is sufficient for a single-owner system and avoids operational overhead.
2. **Replayability**: enough metadata must exist to reconstruct what happened in a mission.
3. **Auditability**: any final claim should be traceable to evidence, debate, and human-gate records.
4. **Learning support**: the schema must support later outcome tracking, scorecards, and pattern review.
5. **Separation of concerns**: missions, agent calls, messages, evidence items, and journal entries should each have a clear storage role.

## Required table set
The blueprint ultimately requires these ten tables:
- `missions`
- `agent_calls`
- `messages`
- `evidence_items`
- `human_gates`
- `debate_records`
- `journal_entries`
- `agent_scorecard`
- `cost_tracking`
- `health_logs`

The SQL file contains all ten tables and the indexes needed for normal query patterns.
Where the blueprint shows shorter intermediate lists, this specification resolves
the discrepancy in favor of the later, fuller ten-table set that explicitly
includes `health_logs`.

## Table-by-table rationale
### missions
Stores top-level mission metadata. This includes domain, mission type, ticker or subject, current and final states, timestamps, evidence score summary, and final status. This table is the anchor for almost every other record.

### agent_calls
Stores one record per model invocation. It mirrors the blueprint’s observability example: timing, model info, input/output token counts, cost, validation results, success/failure, and hashes of stored input/output payloads. The table exists so later operators can inspect latency, cost, retry behavior, and schema quality over time.

### messages
Stores every protocol message sent between owner, kernel, and agents. Because cross-questioning and debate are first-class behaviors, messages need their own table rather than being hidden inside JSON blobs on the mission row.

### evidence_items
Stores every claim-level evidence item used in a mission. Each record can carry claim text, label, source tier, source name, section reference, producing agent, and whether the claim was later challenged. This is the database counterpart to the evidence audit trail.

### human_gates
Stores every visit to `HUMAN_REVIEW`. The same state name can be used for Gate 1,
Gate 2, or Gate 3, so the table needs explicit gate identifiers,
`triggered_after_state`, `gate_type`, trigger reason, presented summary,
available actions, wait duration, owner action, and owner note.

### debate_records
Stores debate topics and per-round outcomes. This includes challenger, responder, challenged claim, round number, status, evidence weighting note, and unresolved-topic tracking.

### journal_entries
Stores the durable investment decision record. It should carry decision state, rationale summary, valuation metrics, normalized earnings assumptions, evidence summary, disagreement summary, thesis breakers, and follow-up events. The blueprint’s journal example is richer than a simple one-line note, so the table uses JSON text fields for structured sections where appropriate.

### agent_scorecard
Stores aggregated quality metrics over a defined period. This table is not mission-scoped alone; it captures pass rates, retry rates, source usage, average conviction distribution, and grounding checks so the company can learn which agents are reliable.

### cost_tracking
Stores normalized cost and token summaries at per-agent and per-mission granularity. The blueprint calls cost tracking out separately because budgeting and health monitoring should not require parsing raw call logs every time.

### health_logs
Stores runtime health checks for adapters and local dependencies. Although not part of the mission journal entry itself, health state affects whether a mission should proceed or degrade gracefully. Keeping health logs in the same SQLite file simplifies diagnostics.

## Key relationship model
- `missions.id` is the parent key for mission-scoped tables.
- `journal_entries.mission_id` is unique because each mission should finish with one canonical decision journal entry.
- `agent_calls`, `messages`, `evidence_items`, `human_gates`, `debate_records`, and `cost_tracking` all reference the parent mission.
- `agent_scorecard` is keyed by agent id and period rather than mission id alone.
- `health_logs` can be session-scoped or general, so mission linkage is optional.

## Why JSON text appears in SQLite
Several fields such as assumptions, analyst views, thesis breakers, follow-up events, constitution violations, and evidence summaries are naturally structured lists or objects. SQLite works well as the storage engine if those fields are stored as JSON text while the high-value query dimensions remain normalized into columns and indexes.

## Indexing strategy
The SQL file creates indexes for likely access paths:
- mission state and domain lookup on `missions`
- agent and timestamp lookup on `agent_calls`
- thread and message type lookup on `messages`
- source tier and label lookup on `evidence_items`
- gate id lookup on `human_gates`
- unresolved debate lookup on `debate_records`
- decision state lookup on `journal_entries`
- agent-period lookup on `agent_scorecard`
- per-mission cost summary lookup on `cost_tracking`
- component and status lookup on `health_logs`

## Journal entry content contract
The `journal_entries` table is designed to support the blueprint’s rich journal schema:
- subject metadata
- decision state and rationale
- valuation block
- assumptions block
- evidence summary
- analyst views and disagreements
- thesis breakers
- follow-up events
- later outcome and lessons

## Validation contract
The repository also includes `docs/JOURNAL_SCHEMA.sql` so verification can run `sqlite3 :memory: < docs/JOURNAL_SCHEMA.sql`. Phase 0 is not complete unless that command parses successfully.

## Future migration posture
The schema is intentionally conservative. A future implementation can migrate the same concepts to PostgreSQL if scale changes, but the tables, keys, and JSON sections should stay semantically stable. The journal is meant to be durable memory, not a throwaway cache.
