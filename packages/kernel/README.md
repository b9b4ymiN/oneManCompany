# @onemancompany/kernel

## Overview

The kernel package implements the Company Kernel for **onemancompany** Phase 1.
It turns the Phase 0 specification corpus into runtime TypeScript components that
can execute a full mission lifecycle using deterministic mock adapters.

## Component map

- `MissionStateMachine` — lifecycle transitions, timeout handling, failure preservation
- `MissionPlanner` — brief parsing and mission object creation
- `TeamBuilder` — registry loading and execution plan construction
- `ContextManager` — budget tracking, compression, role-scoped distribution
- `EvidenceController` — evidence pack scoring and grounding validation
- `DebateController` — structured challenge protocol and disagreement preservation
- `SynthesisEngine` — CIO-style final assembly and mandatory field validation
- `ConstitutionEnforcer` — investment-domain rule enforcement
- `HumanGate` — phase-1 console-style review gate abstraction
- `JournalWriter` — SQLite persistence via drizzle ORM

## Architecture flow

```text
Owner Brief
  -> MissionPlanner
  -> TeamBuilder
  -> MissionStateMachine
  -> EvidenceController
  -> Analyst / Debate / Synthesis controllers
  -> HumanGate
  -> JournalWriter
  -> Observability + Replay
```

## Testing

Run from the repository root:

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test -- --coverage
```

## Notes

- Runtime adapters are mock-only in this phase.
- Registry/domain YAML files remain the source of truth for domain semantics.
- The journal schema is initialized from `docs/JOURNAL_SCHEMA.sql`.
