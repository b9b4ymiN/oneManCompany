import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const missionsTable = sqliteTable(
  'missions',
  {
    id: text('id').primaryKey(),
    domain_id: text('domain_id').notNull(),
    mission_type: text('mission_type').notNull(),
    subject_type: text('subject_type').notNull(),
    ticker: text('ticker'),
    market: text('market'),
    owner_brief: text('owner_brief').notNull(),
    owner_assumption: text('owner_assumption'),
    owner_constraint: text('owner_constraint'),
    current_state: text('current_state').notNull(),
    final_state: text('final_state'),
    status: text('status').notNull().default('active'),
    evidence_score: integer('evidence_score'),
    created_at: text('created_at').notNull(),
    completed_at: text('completed_at'),
    failed_at: text('failed_at'),
    failure_reason: text('failure_reason'),
    metadata_json: text('metadata_json'),
  },
  (table) => ({
    domainStateIdx: index('idx_missions_domain_state').on(
      table.domain_id,
      table.current_state
    ),
  })
);

export const agentCallsTable = sqliteTable(
  'agent_calls',
  {
    id: text('id').primaryKey(),
    mission_id: text('mission_id').notNull(),
    agent_id: text('agent_id').notNull(),
    mission_state: text('mission_state').notNull(),
    provider: text('provider').notNull(),
    model_id: text('model_id').notNull(),
    was_fallback: integer('was_fallback').notNull().default(0),
    fallback_reason: text('fallback_reason'),
    input_tokens: integer('input_tokens'),
    output_tokens: integer('output_tokens'),
    context_was_compressed: integer('context_was_compressed')
      .notNull()
      .default(0),
    compression_ratio: real('compression_ratio'),
    context_budget_used_pct: real('context_budget_used_pct'),
    latency_ms: integer('latency_ms'),
    cost_usd: real('cost_usd'),
    retry_count: integer('retry_count').notNull().default(0),
    schema_passed: integer('schema_passed').notNull().default(0),
    schema_errors_json: text('schema_errors_json'),
    mandatory_fields_present: integer('mandatory_fields_present')
      .notNull()
      .default(0),
    forbidden_content_found: integer('forbidden_content_found')
      .notNull()
      .default(0),
    constitution_violations_json: text('constitution_violations_json'),
    fact_label_count: integer('fact_label_count'),
    assumption_label_count: integer('assumption_label_count'),
    sources_cited: integer('sources_cited'),
    data_gaps_declared: integer('data_gaps_declared'),
    conviction_level: integer('conviction_level'),
    success: integer('success').notNull().default(1),
    error_text: text('error_text'),
    input_hash: text('input_hash'),
    output_hash: text('output_hash'),
    input_stored: integer('input_stored').notNull().default(1),
    output_stored: integer('output_stored').notNull().default(1),
    timestamp_start: text('timestamp_start').notNull(),
    timestamp_end: text('timestamp_end'),
  },
  (table) => ({
    missionAgentIdx: index('idx_agent_calls_mission_agent').on(
      table.mission_id,
      table.agent_id
    ),
  })
);

export const messagesTable = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    mission_id: text('mission_id').notNull(),
    thread_id: text('thread_id'),
    message_type: text('message_type').notNull(),
    sender_id: text('sender_id').notNull(),
    receiver_id: text('receiver_id'),
    content_json: text('content_json').notNull(),
    requires_response: integer('requires_response').notNull().default(0),
    response_deadline_seconds: integer('response_deadline_seconds'),
    priority: text('priority'),
    created_at: text('created_at').notNull(),
  },
  (table) => ({
    missionThreadIdx: index('idx_messages_mission_thread').on(
      table.mission_id,
      table.thread_id
    ),
  })
);

export const evidenceItemsTable = sqliteTable(
  'evidence_items',
  {
    id: text('id').primaryKey(),
    mission_id: text('mission_id').notNull(),
    agent_id: text('agent_id'),
    claim_text: text('claim_text').notNull(),
    claim_label: text('claim_label').notNull(),
    source_name: text('source_name'),
    source_tier: text('source_tier'),
    source_section: text('source_section'),
    source_url: text('source_url'),
    evidence_date: text('evidence_date'),
    used_by_json: text('used_by_json'),
    challenged: integer('challenged').notNull().default(0),
    note_text: text('note_text'),
    created_at: text('created_at').notNull(),
  },
  (table) => ({
    missionLabelIdx: index('idx_evidence_items_mission_label').on(
      table.mission_id,
      table.claim_label
    ),
    tierIdx: index('idx_evidence_items_source_tier').on(table.source_tier),
  })
);

export const humanGatesTable = sqliteTable(
  'human_gates',
  {
    id: text('id').primaryKey(),
    mission_id: text('mission_id').notNull(),
    gate_name: text('gate_name').notNull(),
    triggered_after_state: text('triggered_after_state').notNull(),
    gate_type: text('gate_type').notNull(),
    reason_text: text('reason_text').notNull(),
    summary_text: text('summary_text'),
    available_actions_json: text('available_actions_json'),
    wait_seconds: integer('wait_seconds'),
    owner_action: text('owner_action'),
    owner_note: text('owner_note'),
    created_at: text('created_at').notNull(),
    resolved_at: text('resolved_at'),
  },
  (table) => ({
    missionGateIdx: index('idx_human_gates_mission_gate').on(
      table.mission_id,
      table.gate_name
    ),
  })
);

export const debateRecordsTable = sqliteTable(
  'debate_records',
  {
    id: text('id').primaryKey(),
    mission_id: text('mission_id').notNull(),
    thread_id: text('thread_id').notNull(),
    round_number: integer('round_number').notNull(),
    challenger_id: text('challenger_id').notNull(),
    responder_id: text('responder_id').notNull(),
    challenged_claim: text('challenged_claim').notNull(),
    challenge_reason: text('challenge_reason').notNull(),
    evidence_weighting_note: text('evidence_weighting_note'),
    status: text('status').notNull(),
    unresolved: integer('unresolved').notNull().default(0),
    resolution_note: text('resolution_note'),
    created_at: text('created_at').notNull(),
  },
  (table) => ({
    missionThreadIdx: index('idx_debate_records_mission_thread').on(
      table.mission_id,
      table.thread_id
    ),
  })
);

export const journalEntriesTable = sqliteTable(
  'journal_entries',
  {
    id: text('id').primaryKey(),
    mission_id: text('mission_id').notNull().unique(),
    created_at: text('created_at').notNull(),
    subject_json: text('subject_json').notNull(),
    decision_state: text('decision_state').notNull(),
    decision_date: text('decision_date').notNull(),
    rationale_summary: text('rationale_summary').notNull(),
    valuation_json: text('valuation_json'),
    assumptions_json: text('assumptions_json'),
    evidence_json: text('evidence_json'),
    analyst_views_json: text('analyst_views_json'),
    thesis_breakers_json: text('thesis_breakers_json'),
    follow_up_events_json: text('follow_up_events_json'),
    outcome_json: text('outcome_json'),
    lessons_json: text('lessons_json'),
  },
  (table) => ({
    decisionStateIdx: index('idx_journal_entries_decision_state').on(
      table.decision_state
    ),
  })
);

export const agentScorecardTable = sqliteTable(
  'agent_scorecard',
  {
    id: text('id').primaryKey(),
    agent_id: text('agent_id').notNull(),
    period_start: text('period_start').notNull(),
    period_end: text('period_end').notNull(),
    missions_participated: integer('missions_participated')
      .notNull()
      .default(0),
    schema_pass_rate: real('schema_pass_rate'),
    retry_rate: real('retry_rate'),
    timeout_rate: real('timeout_rate'),
    fallback_rate: real('fallback_rate'),
    avg_fact_labels_per_output: real('avg_fact_labels_per_output'),
    avg_sources_cited: real('avg_sources_cited'),
    avg_data_gaps_declared: real('avg_data_gaps_declared'),
    conviction_distribution_json: text('conviction_distribution_json'),
    constitution_violations: integer('constitution_violations')
      .notNull()
      .default(0),
    forbidden_content_incidents: integer('forbidden_content_incidents')
      .notNull()
      .default(0),
    numbers_verified_pct: real('numbers_verified_pct'),
    numbers_flagged_unverified_pct: real('numbers_flagged_unverified_pct'),
    avg_latency_ms: real('avg_latency_ms'),
    avg_cost_usd: real('avg_cost_usd'),
    avg_input_tokens: real('avg_input_tokens'),
    avg_output_tokens: real('avg_output_tokens'),
    created_at: text('created_at').notNull(),
  },
  (table) => ({
    agentPeriodIdx: index('idx_agent_scorecard_agent_period').on(
      table.agent_id,
      table.period_start,
      table.period_end
    ),
  })
);

export const costTrackingTable = sqliteTable(
  'cost_tracking',
  {
    id: text('id').primaryKey(),
    mission_id: text('mission_id').notNull(),
    agent_id: text('agent_id'),
    provider: text('provider'),
    model_id: text('model_id'),
    input_tokens: integer('input_tokens'),
    output_tokens: integer('output_tokens'),
    total_tokens: integer('total_tokens'),
    cost_usd: real('cost_usd'),
    recorded_at: text('recorded_at').notNull(),
  },
  (table) => ({
    missionIdx: index('idx_cost_tracking_mission').on(table.mission_id),
  })
);

export const healthLogsTable = sqliteTable(
  'health_logs',
  {
    id: text('id').primaryKey(),
    mission_id: text('mission_id'),
    component_name: text('component_name').notNull(),
    component_type: text('component_type').notNull(),
    status: text('status').notNull(),
    latency_ms: integer('latency_ms'),
    auth_state: text('auth_state'),
    detail_text: text('detail_text'),
    recorded_at: text('recorded_at').notNull(),
  },
  (table) => ({
    componentStatusIdx: index('idx_health_logs_component_status').on(
      table.component_name,
      table.status
    ),
  })
);
