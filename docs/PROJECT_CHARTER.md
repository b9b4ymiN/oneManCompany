# PROJECT CHARTER

## Purpose
onemancompany exists to give a single owner a **company-shaped decision system** rather than a general chatbot. The system treats AI models as replaceable execution engines inside a stable operating company. The first operating company is **Investment War Room**, a domain that gathers official evidence, distributes work to specialist agents, preserves disagreement, and converts analysis into a documented decision state with audit history. This charter defines the Phase 0 contract that must exist before implementation begins.

## Vision
The long-term vision is a local-first kernel that lets one person operate a durable, inspectable, multi-agent company. The company should accept a mission brief, transform it into structured work, assign evidence-backed tasks to domain agents, enforce a constitution that blocks unsafe conclusions, and record every important step for replay and learning. The owner should experience the system as a disciplined operating process, not as a series of ad hoc prompts.

The blueprint’s philosophy is clear: **company-first, tool-second**. That means the kernel owns mission planning, agent orchestration, evidence policy, constitution enforcement, journaling, and observability. Models, adapters, protocols, and interfaces remain swappable. This charter therefore prioritizes stable semantics over temporary tool preferences.

## Problem statement
Without a formal specification corpus, implementation would drift in at least five ways. First, state transitions would become implicit, creating silent failure paths. Second, agents would return unstructured prose rather than schema-valid outputs. Third, research and debate would lose traceability because evidence labels and source tiers would not be standardized. Fourth, domain rules such as “no analysis without normalized earnings” could be inconsistently enforced. Fifth, later learning and replay would be impossible because the journal and observability models would be under-specified.

Phase 0 addresses those risks by making the rules explicit before code exists.

## In-scope outcomes for Phase 0
Phase 0 produces the documentation and registry layer required to implement the kernel safely:
- project charter and architecture reference
- formal mission lifecycle and timeout/error model
- agent identity formula and output-contract schema definitions
- debate protocol and evidence request loop rules
- investment constitution with enforcement semantics
- SQLite journal schema and related storage model
- source-tier and claim-label evidence standard
- reusable domain template
- registry entries for models, sources, and the 12 Investment War Room agents
- domain configuration for Investment War Room
- README index and Phase 0 completion status

## Explicit non-goals
This phase does **not** implement runtime behavior. No TypeScript packages, no Python business logic, no UI, no web server, no adapters that call real providers, and no deployment configuration are included. The deliverables may describe how Gemini CLI, Claude Code, or Codex would be routed later, but they do not invoke them during this phase. The objective is specification completeness, not runtime completeness.

## Design principles
### 1. Evidence first
Every meaningful claim must carry a label and a source posture. Facts are not assumptions. Management claims are not facts. Data gaps are surfaced rather than hidden. This principle governs research, debate, synthesis, and journal writing.

### 2. Observable by default
Every agent call, message, gate, and decision outcome must become queryable. Observability is not a later add-on because the kernel needs replay, audits, and longitudinal learning from the first implementation sprint.

### 3. Stable kernel, swappable perimeter
The operating process, evidence standard, and constitutional rules stay stable even if models, CLIs, or transport protocols change. Specifications should therefore prefer role and responsibility language over vendor-dependent wording.

### 4. Preserve disagreement
The system must never average away a real disagreement merely to appear decisive. If two agents reach different conclusions with similar evidence weight, the disagreement is part of the output. This principle especially matters in investment decisions where false consensus is dangerous.

### 5. Human control at irreversible checkpoints
The owner remains accountable. The system may automate research, analysis, cross-questioning, and synthesis, but certain checkpoints must surface uncertainty, evidence weakness, or assumption changes before a decision is committed.

### 6. Local-first practicality
The implementation target is a local repository with file-backed specs, YAML registries, and SQLite observability. That constraint should keep the design reviewable and easy to evolve.

## Stakeholders
- **Owner/operator**: defines missions, reviews gates, and uses final decisions.
- **Kernel implementer**: turns these specs into code later.
- **Domain designer**: creates new domains from the template without breaking the kernel.
- **Auditor/reviewer**: validates that claims, sources, gates, and decisions remain inspectable.

## Success metrics
The charter treats Phase 0 as successful when the repository can answer the following questions without further invention:
1. What are the lifecycle states, forward transitions, gates, timeouts, and failure rules?
2. What is an agent, and what must every agent output contain?
3. How are evidence tiers, claim labels, and evidence scores determined?
4. Which rules can block or reject an investment mission?
5. What gets written to SQLite and how is it linked?
6. How does a new domain define its constitution, team, evidence policy, and checkpoints?
7. Which model or source registries must exist before runtime implementation begins?

## Phase boundary and handoff
At the end of Phase 0, the repository should be ready for a Phase 1 kernel implementation sprint. The implementer should not need to invent state names, debate rules, schema fields, or journal tables. Any remaining open questions should be explicitly documented as configurable choices rather than missing requirements.

## Out-of-scope risks intentionally deferred
Phase 0 does not solve provider authentication, production concurrency, cost optimization, or UI ergonomics. It only creates a design that can later absorb those concerns without rewriting the core operating model.

## Charter decision
Proceed with implementation only after all Phase 0 documents, registries, and domain configs are present, cross-consistent, and validated. The kernel must be built on these contracts, not in parallel with them.
