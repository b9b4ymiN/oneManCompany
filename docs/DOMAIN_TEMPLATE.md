# DOMAIN_TEMPLATE

## Purpose
This document defines the generic YAML template used to add a new domain to onemancompany. The template is intentionally domain-agnostic: it must be able to describe investment analysis, a research studio, a product strategy office, or another future company without structural changes. Only configuration values should change. The kernel lifecycle, observability spine, evidence model, and registry conventions remain shared.

## Design goals
- no hardcoded investment-only keys in the required structure
- enough structure to define constitution, team, checkpoints, evidence posture, and output contract
- easy mapping to registry entries for agents, models, sources, and mission templates
- explicit room for domain-level execution plans and context budgets

## Template semantics
A domain is a package of:
- domain identity and versioning
- constitution references or inline rules
- default team composition
- mission types or job types
- supported source markets or source groups
- output contract expectations
- human checkpoints
- evidence requirements
- context budget policy overrides
- execution plan preferences
- journal requirements

## Path resolution rule
All path-bearing fields in domain artifacts are **relative to the file that
declares them**. That applies to `rules_file`, mission `template`,
`journal.template`, `schema_doc`, `sql_schema`, and similar references. Phase 1
loaders should not invent mixed repo-root and file-relative behavior.

## Canonical generic template
```yaml
id: <domain-id>
name: <human-readable-domain-name>
version: <semver>
description: <short-description>

constitution:
  mode: <inline|reference>
  rules_file: <optional-path-to-rules-file>
  rules: []

default_team:
  coordinator: <agent-id-or-null>
  researchers: []
  analysts: []
  synthesizer: <agent-id-or-null>
  documenter: <agent-id-or-null>
  always_include: []

mission_types:
  - id: <mission-type-id>
    description: <what-this-mission-does>
    template: <path-or-null>
    default_agents: []
    required_inputs: []
    output_contract:
      required_fields: []
      report_sections: []

markets: []
source_groups: []
market_to_source_group: {}

execution_plan:
  research_mode: <sequential|parallel|hybrid>
  analysis_mode: <sequential|parallel|hybrid>
  synthesis_mode: <single|multi-pass>
  document_mode: <single|parallel|disabled>
  debate_enabled: <true|false>
  max_debate_rounds: <integer>
  evidence_request_rounds: <integer>

human_checkpoints:
  after_analysis:
    mode: <always|conditional|disabled>
    state: HUMAN_REVIEW
    gate_name: <gate-id>
    gate_type: <MANDATORY_GATE|CONDITIONAL_GATE|OPTIONAL_GATE|AUTO_PROCEED_GATE>
    triggered_after_state: ANALYZING
    condition: <text-or-null>
  after_synthesis:
    mode: <always|conditional|disabled>
    state: HUMAN_REVIEW
    gate_name: <gate-id>
    gate_type: <MANDATORY_GATE|CONDITIONAL_GATE|OPTIONAL_GATE|AUTO_PROCEED_GATE>
    triggered_after_state: SYNTHESIZING
    condition: <text-or-null>
  on_low_evidence:
    mode: <always|conditional|disabled>
    state: HUMAN_REVIEW
    gate_name: <gate-id>
    gate_type: <MANDATORY_GATE|CONDITIONAL_GATE|OPTIONAL_GATE|AUTO_PROCEED_GATE>
    triggered_after_state: RESEARCHING
    condition: <text-or-null>

evidence_requirements:
  minimum_tier_1_sources: <integer>
  minimum_total_sources: <integer>
  required_documents: []
  required_documents_by_source_group: {}
  critical_fields: []
  proceed_threshold: <integer>
  human_review_threshold: <integer>
  abort_recommend_threshold: <integer>

context_budget_policy:
  preferred_models: {}
  warn_if_above_percent: <integer>
  compress_if_above_percent: <integer>
  always_preserve: []
  role_overrides: {}

output:
  mandatory_report_sections: []
  mandatory_fields: []
  forbidden_content: []

journal:
  required: <true|false>
  template: <path-or-null>
  schema_doc: <optional-path-or-null>
  sql_schema: <optional-path-or-null>
  outcome_tracking: <true|false>
```

## Why these keys are generic
None of the required keys above assume a stock ticker, valuation, or financial statement. A research-studio domain, for example, could define mission types such as `literature_review` or `experiment_scout`, use source groups like `papers`, `interviews`, and `datasets`, and specify output fields such as `research_question`, `confidence_summary`, `open_questions`, and `next_experiments`. The same structure still works because the kernel only needs to know who works, how evidence is judged, when humans are consulted, and what the output must contain.

No investment-only required field is hardcoded into the template. Terms such as
`ticker`, `fair value`, and `price_to_watch` belong in domain instances, not in
the generic contract.

Required-document identifiers should resolve against the shared
`document_catalog` in `registry/sources.yaml`, not directly against raw source
ids. That keeps domain requirements stable even when multiple sources can
satisfy the same document concept.

## Guidance for a hypothetical research-studio domain
To prove generality, imagine a domain with:
- researchers that gather papers and datasets
- analysts that critique methodology and synthesize findings
- a synthesizer that recommends next experiments rather than investment decisions
- evidence thresholds based on paper quality and replication support instead of source tiers tied to markets

The template above requires no structural change. Only configuration values differ.

## Required compatibility with shared kernel rules
Every domain created from this template must still honor shared kernel concepts:
- lifecycle states remain the same unless the kernel itself evolves
- observability tables remain the same
- protocol message types remain reusable
- constitution rules still use common enforcement levels
- evidence labels remain explicit

## Optional extension points
Domains may extend the template with extra keys as long as they do not remove required ones. Examples include:
- scoring rubrics specific to the domain
- sector or taxonomy metadata
- custom replay presets
- domain-specific report layouts

## Anti-hardcoding rules
When authoring a new domain template or instance:
- do not require investment-specific fields unless the domain really needs them
- do not assume a ticker, fair value, or price-to-watch concept globally
- do not encode domain-specific agent ids into the generic template body
- keep generic placeholders neutral and descriptive

## Authoring workflow for new domains
1. copy the template structure into `domains/<new-domain>/domain.yaml`
2. assign constitution, team, source groups, and checkpoints
3. create matching registry entries for agents and sources
4. validate YAML parsing and cross-references
5. confirm the output contract fits the new domain’s mission types

## Completion contract
The template is complete when a reviewer can instantiate a non-investment domain from it without modifying the structure. Future domains should configure it, not redesign it.
