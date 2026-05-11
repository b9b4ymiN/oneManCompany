PRAGMA foreign_keys = ON;

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  domain_id TEXT NOT NULL,
  mission_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  ticker TEXT,
  market TEXT,
  owner_brief TEXT NOT NULL,
  owner_assumption TEXT,
  owner_constraint TEXT,
  current_state TEXT NOT NULL,
  final_state TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  evidence_score INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  failed_at TEXT,
  failure_reason TEXT,
  metadata_json TEXT
);

CREATE TABLE agent_calls (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  mission_state TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  was_fallback INTEGER NOT NULL DEFAULT 0,
  fallback_reason TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  context_was_compressed INTEGER NOT NULL DEFAULT 0,
  compression_ratio REAL,
  context_budget_used_pct REAL,
  latency_ms INTEGER,
  cost_usd REAL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  schema_passed INTEGER NOT NULL DEFAULT 0,
  schema_errors_json TEXT,
  mandatory_fields_present INTEGER NOT NULL DEFAULT 0,
  forbidden_content_found INTEGER NOT NULL DEFAULT 0,
  constitution_violations_json TEXT,
  fact_label_count INTEGER,
  assumption_label_count INTEGER,
  sources_cited INTEGER,
  data_gaps_declared INTEGER,
  conviction_level INTEGER,
  success INTEGER NOT NULL DEFAULT 1,
  error_text TEXT,
  input_hash TEXT,
  output_hash TEXT,
  input_stored INTEGER NOT NULL DEFAULT 1,
  output_stored INTEGER NOT NULL DEFAULT 1,
  timestamp_start TEXT NOT NULL,
  timestamp_end TEXT,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  thread_id TEXT,
  message_type TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  receiver_id TEXT,
  content_json TEXT NOT NULL,
  requires_response INTEGER NOT NULL DEFAULT 0,
  response_deadline_seconds INTEGER,
  priority TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE evidence_items (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  agent_id TEXT,
  claim_text TEXT NOT NULL,
  claim_label TEXT NOT NULL,
  source_name TEXT,
  source_tier TEXT,
  source_section TEXT,
  source_url TEXT,
  evidence_date TEXT,
  used_by_json TEXT,
  challenged INTEGER NOT NULL DEFAULT 0,
  note_text TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE human_gates (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  gate_name TEXT NOT NULL,
  triggered_after_state TEXT NOT NULL,
  gate_type TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  summary_text TEXT,
  available_actions_json TEXT,
  wait_seconds INTEGER,
  owner_action TEXT,
  owner_note TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE debate_records (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  challenger_id TEXT NOT NULL,
  responder_id TEXT NOT NULL,
  challenged_claim TEXT NOT NULL,
  challenge_reason TEXT NOT NULL,
  evidence_weighting_note TEXT,
  status TEXT NOT NULL,
  unresolved INTEGER NOT NULL DEFAULT 0,
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  subject_json TEXT NOT NULL,
  decision_state TEXT NOT NULL,
  decision_date TEXT NOT NULL,
  rationale_summary TEXT NOT NULL,
  valuation_json TEXT,
  assumptions_json TEXT,
  evidence_json TEXT,
  analyst_views_json TEXT,
  thesis_breakers_json TEXT,
  follow_up_events_json TEXT,
  outcome_json TEXT,
  lessons_json TEXT,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE agent_scorecard (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  missions_participated INTEGER NOT NULL DEFAULT 0,
  schema_pass_rate REAL,
  retry_rate REAL,
  timeout_rate REAL,
  fallback_rate REAL,
  avg_fact_labels_per_output REAL,
  avg_sources_cited REAL,
  avg_data_gaps_declared REAL,
  conviction_distribution_json TEXT,
  constitution_violations INTEGER NOT NULL DEFAULT 0,
  forbidden_content_incidents INTEGER NOT NULL DEFAULT 0,
  numbers_verified_pct REAL,
  numbers_flagged_unverified_pct REAL,
  avg_latency_ms REAL,
  avg_cost_usd REAL,
  avg_input_tokens REAL,
  avg_output_tokens REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE cost_tracking (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL,
  agent_id TEXT,
  provider TEXT,
  model_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd REAL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE TABLE health_logs (
  id TEXT PRIMARY KEY,
  mission_id TEXT,
  component_name TEXT NOT NULL,
  component_type TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  auth_state TEXT,
  detail_text TEXT,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (mission_id) REFERENCES missions(id)
);

CREATE INDEX idx_missions_domain_state ON missions(domain_id, current_state);
CREATE INDEX idx_agent_calls_mission_agent ON agent_calls(mission_id, agent_id);
CREATE INDEX idx_messages_mission_thread ON messages(mission_id, thread_id);
CREATE INDEX idx_evidence_items_mission_label ON evidence_items(mission_id, claim_label);
CREATE INDEX idx_evidence_items_source_tier ON evidence_items(source_tier);
CREATE INDEX idx_human_gates_mission_gate ON human_gates(mission_id, gate_name);
CREATE INDEX idx_debate_records_mission_thread ON debate_records(mission_id, thread_id);
CREATE INDEX idx_journal_entries_decision_state ON journal_entries(decision_state);
CREATE INDEX idx_agent_scorecard_agent_period ON agent_scorecard(agent_id, period_start, period_end);
CREATE INDEX idx_cost_tracking_mission ON cost_tracking(mission_id);
CREATE INDEX idx_health_logs_component_status ON health_logs(component_name, status);
