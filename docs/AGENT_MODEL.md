# AGENT_MODEL

## Purpose
This document defines what an agent is in onemancompany and specifies the output contract expected from each of the 12 Investment War Room agents. The blueprint states the identity formula explicitly:

> Agent = Role + Persona + Worldview + Skills + Tools + Interaction Rules + Output Contract

This specification expands that formula into implementation-ready concepts and Zod-style schema definitions suitable for future runtime validation. The code blocks below are documentary design artifacts, not executable product files in this phase.

## Canonical agent formula
### Role
The institutional function the agent performs inside the company. Examples include researcher, analyst, synthesizer, and document generator.

### Persona
The voice, expertise lens, and bounded style that keep outputs consistent across missions. Persona shapes emphasis but does not override evidence rules or the constitution.

### Worldview
The durable beliefs that tell the agent what to care about. A valuation agent may prioritize narrative-to-numbers discipline, while a forensic accountant prioritizes earnings quality and one-off detection.

### Skills
The repeatable methods the agent can apply, such as normalized earnings review, DCF, reverse DCF, downside analysis, business storytelling, technical pattern review, or synthesis.

### Tools
The runtime capabilities or resource classes the agent may use later. In Phase 0 we only specify expectations: researchers use evidence-pack construction and source retrieval; analysts use evidence packs, domain skills, and structured question/challenge protocols.

### Interaction rules
The protocol-level permissions that say who an agent may question, who they must challenge, and what they cannot override. Interaction rules are critical because they prevent unbounded chatter while preserving useful adversarial review.

### Output contract
The schema-valid structure the agent must return. The kernel will later reject outputs that violate schema, omit mandatory fields, or break constitution rules.

## Shared output-contract principles
All agents must follow these universal rules:
- every claim with factual posture must cite a source tier or be labeled otherwise
- `data_gaps` must always exist, even if empty
- forbidden content includes direct buy/sell recommendation wording
- where `conviction_level` is used, it must be an integer from 1 to 10
- where relevant, `decision_state` must use a controlled enum rather than free text
- assumptions must be explicit and sensitivity-aware
- unresolved disagreement may be summarized but not erased

## Shared enums
```ts
const ClaimLabel = z.enum([
  "FACT",
  "DERIVED",
  "ASSUMPTION",
  "ESTIMATE",
  "UNVERIFIED",
  "MANAGEMENT_CLAIM",
  "MARKET_EXPECTATION",
]);

const SourceTier = z.enum(["tier_1", "tier_2", "tier_3", "tier_4", "tier_5"]);

const DecisionState = z.enum([
  "REJECT",
  "WATCH",
  "RESEARCH_MORE",
  "WAIT_FOR_PRICE",
  "STARTER_POSITION",
  "CORE_CANDIDATE",
  "ADD_ON_WEAKNESS",
  "HOLD",
  "TRIM",
  "EXIT_THESIS_BROKEN",
]);
```

## Shared building blocks
```ts
const EvidenceRef = z.object({
  claim: z.string(),
  source_name: z.string(),
  source_tier: SourceTier,
  label: ClaimLabel,
  section: z.string().optional(),
  note: z.string().optional(),
});

const DataGap = z.object({
  field: z.string(),
  impact: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  suggested_action: z.string().optional(),
});

const AssumptionItem = z.object({
  name: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  sensitivity: z.string(),
  rationale: z.string(),
  evidence: z.array(EvidenceRef).default([]),
});

const ConvictionBlock = z.object({
  conviction_level: z.number().int().min(1).max(10),
  conviction_reasoning: z.string(),
});

const SharedAgentEnvelope = z.object({
  agent_id: z.string(),
  mission_id: z.string(),
  summary: z.string(),
  evidence_score: z.number().min(0).max(100),
  evidence_used: z.array(EvidenceRef).min(1),
  data_gaps: z.array(DataGap),
  assumptions: z.array(AssumptionItem).default([]),
  open_questions: z.array(z.string()).default([]),
  thesis_breakers: z.array(z.string()).default([]),
});
```

## Reusable role families
### Researcher family
Researchers gather, normalize, and label evidence. They do not make final investment decisions.

### Analyst family
Analysts transform evidence into a specialized viewpoint. They typically include `conviction_level`, agent-specific key outputs, assumptions, and “what changes my mind” style fields.

### Synthesizer family
The synthesizer returns the company-level final output, including the decision state, preserved disagreement, and follow-up plan.

### Document family
The document generator turns the final structured result into a human-readable report without changing the substance.

## Agent registry fields implied by this model
Each YAML registry card should at minimum carry:
- `id`
- `role`
- `persona`
- `domain`
- `model_preference`
- `context_share`
- `interaction_rules`
- `output_schema_ref`

Optional but recommended additions are worldview, required_inputs, timeout, fallback models, and mandatory_fields.

## Model and timeout policy
The blueprint mixes role-level model preferences with concrete runtime model ids. For Phase 0, the canonical runtime ids are:
- `gemini-2-flash`
- `claude-opus-4-5`
- `codex-default`
- `zai-default`

This document also allows registry-friendly family aliases such as `claude-opus` and `claude-sonnet`, but future runtime code should map those aliases to explicit deployed model ids in the model registry.

Timeout policy should stay consistent with the lifecycle contract:
- researcher roles must finish within the `RESEARCHING` budget of **3 minutes per researcher**
- analyst roles should default to **120 seconds** each, aligning with the lifecycle’s **2 minutes per analyst**
- the synthesizer should fit inside the `SYNTHESIZING` budget of **2 minutes**
- the document generator may run after the validated decision object is ready and should not alter the lifecycle outcome

Each agent card may declare `model.primary`, `model.fallback`, and `timeout_seconds`, but those values remain subordinate to the mission lifecycle ceilings.

## Agent specifications
### 1. researcher-set
**Role:** Thai SET/SEC researcher

**Persona:** official-source hunter for Thai listed companies

**Worldview:** if it is not in a credible source log, it is not ready for downstream analysis

**Mandatory concerns:** evidence pack completeness, tier labeling, data-gap surfacing, document coverage for 56-1, quarterly filing, MD&A, and related management communication

```ts
const ResearcherSetOutput = SharedAgentEnvelope.extend({
  market: z.literal("thai-set"),
  source_log: z.array(EvidenceRef).min(1),
  documents_collected: z.array(z.string()).min(1),
  normalized_company_facts: z.array(EvidenceRef).min(1),
  evidence_pack_status: z.enum(["complete", "partial", "insufficient"]),
  recommended_next_step: z.enum(["proceed", "human_review", "abort"]),
});
```

### 2. researcher-us
**Role:** US SEC/EDGAR researcher

**Persona:** EDGAR-native retrieval specialist

**Worldview:** primary filings outrank summaries, commentary, and market noise

```ts
const ResearcherUsOutput = SharedAgentEnvelope.extend({
  market: z.enum(["us-nyse", "us-nasdaq"]),
  source_log: z.array(EvidenceRef).min(1),
  filings_collected: z.array(z.string()).min(1),
  evidence_pack_status: z.enum(["complete", "partial", "insufficient"]),
  recommended_next_step: z.enum(["proceed", "human_review", "abort"]),
});
```

### 3. forensic-accountant
**Role:** earnings-quality analyst

**Persona:** skeptical accounting reviewer

**Worldview:** valuation cannot start from reported profit until one-offs, cash conversion, and accounting quality are tested

**Mandatory output fields:** normalized earnings base, one-off items, cashflow quality, confidence, and thesis breakers relevant to accounting quality

```ts
const ForensicAccountantOutput = SharedAgentEnvelope.extend({
  reported_profit: z.number(),
  one_off_items: z.array(z.object({
    item: z.string(),
    amount: z.number(),
    treatment: z.enum(["exclude", "include", "monitor"]),
    evidence: z.array(EvidenceRef).min(1),
  })),
  normalized_earnings_base: z.number(),
  cashflow_quality: z.enum(["high", "medium", "low", "negative"]),
  normalized_earnings_confidence: z.enum(["high", "medium", "low"]),
}).merge(ConvictionBlock);
```

### 4. damodaran-valuation
**Role:** valuation analyst

**Persona:** narrative-to-numbers DCF specialist

**Worldview:** a story must become assumptions, and assumptions must become numerically coherent valuation outputs

**Blueprint-specific mandatory fields:** `fair_value_conservative`, `fair_value_base`, `fair_value_optimistic`, `implied_growth_at_market_price`, `conviction_level`, `key_assumptions`, `what_would_change_my_mind`, `data_gaps_found`

```ts
const DamodaranValuationOutput = SharedAgentEnvelope.extend({
  fair_value_conservative: z.number(),
  fair_value_base: z.number(),
  fair_value_optimistic: z.number(),
  implied_growth_at_market_price: z.number(),
  key_assumptions: z.array(AssumptionItem).min(1),
  what_would_change_my_mind: z.array(z.string()).min(1),
  data_gaps_found: z.array(DataGap),
  reverse_dcf_summary: z.string(),
}).merge(ConvictionBlock);
```

### 5. klarman-downside
**Role:** downside and margin-of-safety analyst

**Persona:** capital-preservation first

**Worldview:** the most important question is how wrong the base case could be and how much permanent capital loss is possible

```ts
const KlarmanDownsideOutput = SharedAgentEnvelope.extend({
  downside_case_summary: z.string(),
  bear_case_value: z.number(),
  margin_of_safety_required_pct: z.number(),
  key_risks_ranked: z.array(z.object({
    risk: z.string(),
    severity: z.enum(["low", "medium", "high", "critical"]),
    evidence: z.array(EvidenceRef).min(1),
  })).min(1),
  what_breaks_the_case: z.array(z.string()).min(1),
}).merge(ConvictionBlock);
```

### 6. peter-lynch-story
**Role:** business story and growth-shape analyst

**Persona:** practical storyteller who classifies business quality through understandable operating logic

**Worldview:** if the business story cannot be explained simply, the growth case is probably overstated

```ts
const PeterLynchStoryOutput = SharedAgentEnvelope.extend({
  business_story: z.string(),
  growth_category: z.enum([
    "slow_grower",
    "stalwart",
    "fast_grower",
    "cyclical",
    "asset_play",
    "turnaround",
  ]),
  moat_summary: z.string(),
  simple_owner_test: z.string(),
}).merge(ConvictionBlock);
```

### 7. hf-manager
**Role:** institutional portfolio and catalyst reviewer

**Persona:** hedge-fund style portfolio manager

**Worldview:** sizing and timing matter because even good assets can be bad trades under weak setup or opportunity cost

```ts
const HfManagerOutput = SharedAgentEnvelope.extend({
  catalyst_map: z.array(z.object({
    catalyst: z.string(),
    horizon: z.enum(["near_term", "medium_term", "long_term"]),
    evidence: z.array(EvidenceRef).min(1),
  })).min(1),
  risk_reward_summary: z.string(),
  positioning_view: z.string(),
  suggested_position_size_pct: z.number().min(0).max(100),
}).merge(ConvictionBlock);
```

### 8. technical-analyst
**Role:** chart and price-structure analyst

**Persona:** setup and level mapper

**Worldview:** technical context does not override fundamentals, but it can improve timing, invalidation, and monitoring discipline

```ts
const TechnicalAnalystOutput = SharedAgentEnvelope.extend({
  trend_state: z.enum(["uptrend", "range", "downtrend", "unclear"]),
  support_levels: z.array(z.number()).default([]),
  resistance_levels: z.array(z.number()).default([]),
  setup_summary: z.string(),
  invalidation_level: z.number().optional(),
}).merge(ConvictionBlock);
```

### 9. portfolio-allocator
**Role:** portfolio-fit and sizing analyst

**Persona:** risk-budget allocator

**Worldview:** a good idea still needs portfolio context, concentration discipline, and correlation awareness

```ts
const PortfolioAllocatorOutput = SharedAgentEnvelope.extend({
  portfolio_fit_summary: z.string(),
  correlation_concerns: z.array(z.string()).default([]),
  suggested_position_size_pct: z.number().min(0).max(100),
  sizing_rationale: z.string(),
  rebalance_trigger: z.string().optional(),
}).merge(ConvictionBlock);
```

### 10. pro-investor
**Role:** owner framework analyst

**Persona:** the owner’s personal checklist embodied as an agent

**Worldview:** the final company process should still respect the owner’s explicit framework and edge, not only textbook finance

```ts
const ProInvestorOutput = SharedAgentEnvelope.extend({
  checklist_results: z.array(z.object({
    criterion: z.string(),
    result: z.enum(["pass", "mixed", "fail", "unknown"]),
    note: z.string(),
  })).min(1),
  owner_fit_summary: z.string(),
  reasons_to_pass: z.array(z.string()).default([]),
  reasons_to_wait: z.array(z.string()).default([]),
}).merge(ConvictionBlock);
```

### 11. cio-synthesizer
**Role:** company-level synthesizer

**Persona:** chief investment officer

**Worldview:** synthesis must preserve disagreement, enforce the constitution, and produce a structured decision rather than a vague recommendation

**Mandatory fields:** `decision_state`, `conviction_level`, `evidence_score`, `thesis_breakers`, plus valuation and follow-up outputs required by the mission planner blueprint

```ts
const CioSynthesizerOutput = SharedAgentEnvelope.extend({
  decision_state: DecisionState,
  normalized_earnings_base: z.number(),
  fair_value_conservative: z.number(),
  fair_value_base: z.number().optional(),
  price_for_mos_30: z.number(),
  price_to_watch: z.number(),
  disagreement_preserved: z.array(z.object({
    topic: z.string(),
    side_a: z.string(),
    side_b: z.string(),
    evidence_weighting_note: z.string(),
  })).default([]),
  follow_up_events: z.array(z.object({
    event: z.string(),
    expected_date: z.string().optional(),
    watch_for: z.string(),
  })).min(1),
  decision_rationale: z.string(),
}).merge(ConvictionBlock);
```

### 12. book-master
**Role:** final report assembler

**Persona:** disciplined document generator

**Worldview:** formatting may improve clarity, but it must never change the validated substance of the synthesis

```ts
const BookMasterOutput = SharedAgentEnvelope.extend({
  report_title: z.string(),
  normalized_earnings_base: z.number(),
  fair_value_conservative: z.number(),
  price_for_mos_30: z.number(),
  price_to_watch: z.number(),
  decision_state: DecisionState,
  follow_up_events: z.array(z.object({
    event: z.string(),
    expected_date: z.string().optional(),
    watch_for: z.string(),
  })).min(1),
  report_sections: z.array(z.object({
    section_id: z.string(),
    heading: z.string(),
    summary: z.string(),
  })).min(1),
  executive_summary: z.string(),
  appendix_items: z.array(z.string()).default([]),
});
```

## Interaction-rule expectations
The blueprint’s sample agent card provides the pattern:
- researchers can be questioned for facts and evidence retrieval
- valuation and downside agents must challenge aggressive growth or margin-expansion assumptions
- agents cannot challenge themselves
- researchers are not challenged on facts through debate; agents use `evidence_request` instead
- the synthesizer is not a normal debate target during upstream rounds

These expectations should be reflected in registry YAML and honored by the future debate controller.

## Output validation expectations
A future validator should enforce all of the following:
- schema shape is valid
- every mandatory field is present
- every numeric field that matters is grounded in the evidence pack or explicitly labeled as assumption/estimate
- `conviction_level` is always between 1 and 10 where present
- forbidden buy/sell wording is absent
- `data_gaps` is present even when empty
- `decision_state` only appears on the synthesizer and downstream document output unless a mission explicitly requires otherwise

## Registry linkage
Each registry card in `registry/agents/` references the schema section by a stable anchor name such as `docs/AGENT_MODEL.md#damodaranvaluationoutput`. This keeps Phase 0 registry artifacts aligned with the document-led schema design until executable schema files exist in a later phase.

## Final contract
No Investment War Room agent should be implemented before its registry card, interaction rules, and output schema all exist. The future runtime may change providers or prompts, but it may not silently weaken these contracts.
