# onemancompany

> A company-kernel architecture for a one-person, AI-agent operating company.

## What this project is

**onemancompany** is a blueprint-driven system for turning a single owner into a
company operator supported by specialized AI agents, shared evidence standards,
formal lifecycle control, and durable decision memory.

The core idea is simple:

- **one owner**
- **many agents**
- **one kernel**
- **one evidence standard**
- **one auditable decision process**

The first domain is **Investment War Room**: a structured environment for
researching businesses, challenging assumptions, preserving disagreement, and
turning evidence into a decision state instead of a vague recommendation.

## Core philosophy

The project follows the principles defined in `onemancompany-blueprint-v2.md`:

- **Company-first, tool-second** — the operating model matters more than any
  single model or CLI.
- **Agent ≠ Model** — agents are durable roles; models are replaceable engines.
- **Evidence-first** — facts, assumptions, estimates, and management claims must
  stay explicitly separated.
- **Observable by default** — missions, agent calls, messages, evidence, and
  decisions must remain inspectable.
- **Preserve disagreement** — unresolved differences between agents are surfaced,
  not averaged away.

## Current repository status

### Delivery status

- **Phase 0 — Specification Freeze:** complete
- **Phase 1 — Kernel Core:** not implemented in this repository yet
- **Practical status:** this repository is **Phase 1-ready**

This means the repository currently contains the foundational specifications,
registries, and domain definitions required **before** kernel code should be
written.

## What exists today

### Foundational specification documents

- `docs/PROJECT_CHARTER.md`
- `docs/ARCHITECTURE.md`
- `docs/MISSION_LIFECYCLE.md`
- `docs/AGENT_MODEL.md`
- `docs/DEBATE_PROTOCOL.md`
- `docs/COMPANY_CONSTITUTION.md`
- `docs/JOURNAL_SCHEMA.md`
- `docs/JOURNAL_SCHEMA.sql`
- `docs/EVIDENCE_STANDARD.md`
- `docs/DOMAIN_TEMPLATE.md`

### Registry layer

- `registry/agents/*.yaml` — 12 Investment War Room agent cards
- `registry/models.yaml` — model registry and routing preferences
- `registry/sources.yaml` — source groups, document catalog, and market mapping

### Domain layer

- `domains/investment-war-room/domain.yaml`
- `domains/investment-war-room/domain-constitution.yaml`
- `domains/investment-war-room/missions/*.yaml`
- `domains/investment-war-room/journal/investment-journal.yaml`
- `domains/_template/*` — reusable domain template

## Architecture at a glance

The repository is organized around the architecture defined in
`docs/ARCHITECTURE.md`:

1. **Interface Layer**
2. **Kernel Layer**
3. **Registry Layer**
4. **Observability Layer**
5. **Adapter Layer**
6. **Protocol Layer**

The future runtime should keep the **Company Kernel** as the stable center and
allow models, tools, adapters, and interfaces to evolve around it.

## Mission lifecycle

The formal lifecycle is defined in `docs/MISSION_LIFECYCLE.md`.

The operational states are:

- `DRAFT`
- `PLANNING`
- `RESEARCHING`
- `HUMAN_REVIEW`
- `ANALYZING`
- `CROSS_QA`
- `DEBATING`
- `SYNTHESIZING`
- `DECIDED`
- `JOURNALED`

With `FAILED` as the terminal error state.

This lifecycle is designed to prevent silent failure and ensure that evidence,
agent outputs, debate rounds, human gates, and journaling all happen in a
controlled order.

## Investment War Room

The first working domain is **Investment War Room**.

Its purpose is to support disciplined investment analysis through:

- official-source research
- normalized-earnings review
- valuation and downside analysis
- cross-agent challenge and debate
- CIO-level synthesis
- decision journaling and follow-up tracking

The current roster includes 12 agent definitions, including:

- researcher agents
- forensic/accounting analysis
- valuation and downside specialists
- portfolio and technical viewpoints
- CIO synthesis
- formal report generation

See:

- `docs/AGENT_MODEL.md`
- `registry/agents/*.yaml`
- `domains/investment-war-room/domain.yaml`

## Why Phase 0 matters

The blueprint explicitly requires specification completeness before code. This
repository now captures the critical contracts needed to begin implementation:

- what an agent is
- what every important output must contain
- how evidence is classified and scored
- how debate is bounded
- how constitutional rules block bad decisions
- how journal persistence is structured
- how a new domain should be defined

That reduces invention pressure in Phase 1 and makes the future kernel easier to
build, validate, and audit.

## Repository map

```text
onemancompany/
├── README.md
├── onemancompany-blueprint-v2.md
├── docs/
│   ├── PROJECT_CHARTER.md
│   ├── ARCHITECTURE.md
│   ├── MISSION_LIFECYCLE.md
│   ├── AGENT_MODEL.md
│   ├── DEBATE_PROTOCOL.md
│   ├── COMPANY_CONSTITUTION.md
│   ├── JOURNAL_SCHEMA.md
│   ├── JOURNAL_SCHEMA.sql
│   ├── EVIDENCE_STANDARD.md
│   └── DOMAIN_TEMPLATE.md
├── registry/
│   ├── agents/
│   ├── models.yaml
│   └── sources.yaml
└── domains/
    ├── _template/
    └── investment-war-room/
```

## How to use this repository right now

This repository is currently best used as a **design and implementation
reference**, not as a runnable product.

Recommended reading order:

1. `onemancompany-blueprint-v2.md`
2. `docs/PROJECT_CHARTER.md`
3. `docs/ARCHITECTURE.md`
4. `docs/MISSION_LIFECYCLE.md`
5. `docs/AGENT_MODEL.md`
6. `docs/EVIDENCE_STANDARD.md`
7. `docs/COMPANY_CONSTITUTION.md`
8. `domains/investment-war-room/domain.yaml`

## Validation status

The current specification set has been validated with local repository checks:

- Markdown lint passed
- YAML lint passed
- YAML parsing passed
- SQLite schema parsed successfully in memory
- agent/domain/source cross-reference checks passed
- final spec review returned **APPROVE / CLEAR** for the generated artifacts

## What comes next

The next logical step is **Phase 1 — Kernel Core**, which should implement:

- mission state machine
- mission planner
- registry loaders
- constitution enforcement
- context budget management
- decision journal writer
- observability foundations

The key rule for that phase is simple:

> build against the contracts in this repository, not around them.

## Scope boundary

This repository does **not** currently include:

- runtime kernel code
- agent adapters
- UI or web application code
- deployment configuration
- live model integrations

Those belong to later implementation phases.

## Source of truth

The primary design source is:

- `onemancompany-blueprint-v2.md`

The generated repository specifications should be read as the implementation
contracts derived from that blueprint.
