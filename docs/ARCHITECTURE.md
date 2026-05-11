# ARCHITECTURE

## Overview
onemancompany is organized as a layered system whose center of gravity is the **Company Kernel**. The kernel does not compete with models, tools, or interfaces. Instead, it decides how missions flow, which agents are assembled, what evidence is acceptable, when human review is required, how disagreement is preserved, and what gets written to the journal. Around that kernel sit registries, observability, adapters, interfaces, and protocol definitions. This document defines the architecture that Phase 1 code must eventually implement.

## Canonical layer map
The requested layer map is:

1. **Interface Layer**
2. **Kernel Layer**
3. **Registry Layer**
4. **Observability Layer**
5. **Adapter Layer**
6. **Protocol Layer**

The order above reflects responsibility rather than invocation order. A mission may enter through an interface, but the kernel remains the orchestration center. Protocol and adapter concerns exist to serve the kernel, not to own business logic.

## Layer 1 — Interface
### Purpose
The interface layer is how an owner or external client expresses intent and receives structured output. In the blueprint, interfaces may later include CLI commands, local tools, or client integrations. Regardless of surface, the interface layer must never bypass mission planning or constitution enforcement.

### Responsibilities
- accept owner briefs, assumptions, and constraints
- render human review checkpoints
- display mission traces, evidence summaries, and final decision reports
- expose replay and journal lookup functions later
- preserve domain identity when invoking the kernel

### Must not own
- lifecycle transitions
- evidence scoring logic
- constitution rules
- model routing policy
- journal persistence policy

## Layer 2 — Kernel
### Purpose
The kernel is the system brain. It turns a brief into a mission, assembles the team, manages state transitions, routes evidence requests, applies constitution rules, validates outputs, triggers human gates, and determines when a decision is ready to journal.

### Core kernel components
#### Mission Planner
Transforms an owner brief into a structured mission object. It decides the domain, mission type, required agents, evidence requirements, output requirements, and checkpoint defaults.

#### Team Builder
Selects the right agents for the mission from registry definitions. It may choose default teams, always-include roles, and market-specific researchers.

#### Mission State Machine
Owns the allowed states, transitions, timeouts, and failure handling. This is the formal guard against silent drift.

#### Context Manager
Allocates context budget per agent, ensures required evidence survives compression, and distributes only the context each role needs. This component enforces the “stable facts first” compression rules.

#### Evidence Controller
Validates claim labels, source tiers, evidence scores, and data gaps. It determines whether the mission may proceed normally, proceed only with human review, or should recommend abort.

#### Debate Controller
Runs structured challenge rounds, preserves unresolved disagreements, and enforces the evidence request loop boundary.

#### Synthesis Engine
Collects analyst outputs, unresolved disagreements, data gaps, and constitution decisions, then constructs the final report and decision state.

#### Constitution Enforcer
Evaluates company-level rules before accepting outputs or advancing a mission. It can block a mission, insert human review, warn and flag, or reject a bad output.

#### Journal Writer
Converts the decided mission into structured SQLite records and file-backed artifacts for long-term learning and replay.

## Layer 3 — Registry
### Purpose
Registries make the company configurable without changing kernel code. The blueprint positions YAML as the durable registry medium because it is human-readable, diffable, and easy to load.

### Registry families
- **Agent registry**: identity, role, persona, worldview, model preference, interaction rules, context posture, output schema reference
- **Model registry**: context limits, planning cost fields, preferred use cases, fallback policy hints
- **Source registry**: source tiers, label posture, use cases, warnings, and markets
- **Skill registry**: reusable analysis instructions later used by agents
- **Domain configuration**: default team, mission types, checkpoints, evidence expectations, and output contract

### Architectural rule
Registries are declarative. They must not contain procedural logic. The kernel interprets them.

## Layer 4 — Observability
### Purpose
Observability is a first-class layer, not a debugging afterthought. The blueprint requires full mission traceability, output validation, evidence audit trails, agent scorecards, cost tracking, and health monitoring.

### Responsibilities
- capture every agent call with model, timing, cost, validation, and output-quality metadata
- record the mission trace across states and human gates
- store evidence items so any final claim can be traced back to its source
- maintain debate history and unresolved disagreement records
- produce agent scorecards across missions
- support replay modes and root-cause analysis

### Storage posture
SQLite is the structured source of truth for tables, while mission folders hold replay inputs, outputs, reports, and evidence pack snapshots. This split optimizes both queryability and reproducibility.

## Layer 5 — Adapter
### Purpose
Adapters convert a kernel instruction such as “run the researcher with this context and schema” into a concrete model/provider invocation. Adapters should be thin and replaceable.

### Responsibilities
- authenticate and invoke provider-specific runtimes later
- translate kernel request envelopes into provider calls
- normalize returned content into the protocol schema
- surface provider errors clearly so the kernel can retry, fallback, or fail the mission

### Architectural constraint
Adapters do not define agent behavior. They execute instructions generated elsewhere.

## Layer 6 — Protocol
### Purpose
The protocol layer defines the internal language spoken between owner, kernel, agents, researcher loops, and journal. It ensures messages remain typed, traceable, and replayable.

### Responsibilities
- define message types such as `task_assignment`, `challenge`, `evidence_request`, `analysis_report`, and `human_gate_request`
- standardize metadata such as mission id, sender, receiver, thread id, and deadlines
- allow observability systems to reconstruct the whole mission from protocol logs

## Repository structure resolution for Phase 0
The blueprint shows two slightly different implementation-oriented folder sketches in different sections: one with a top-level `kernel/` folder and another with `packages/kernel/`. Because Phase 0 is still pre-code, this document resolves the discrepancy as follows:

- **architectural concept**: the system has a single Company Kernel boundary
- **Phase 0 documentation posture**: refer to that boundary as the **Kernel Layer**, not as a fixed runtime folder
- **Phase 1 implementation recommendation**: prefer a monorepo-friendly `packages/kernel/` path if multiple packages are created, but preserve the same component responsibilities either way

This keeps the architecture stable even if the eventual repository layout changes.

## Control flow across layers
1. Interface receives the owner brief.
2. Kernel validates input and plans a mission.
3. Kernel reads registries to build the team, model preferences, source expectations, and output contracts.
4. Kernel uses protocol messages to assign tasks and manage evidence requests.
5. Adapter layer executes model calls and returns normalized outputs.
6. Observability records every call, message, transition, and evidence item.
7. Constitution and evidence controllers decide whether work may proceed.
8. Synthesis produces a final decision state.
9. Journal writer persists the result and follow-up metadata.
10. Interface renders the outcome and any remaining uncertainties.

## Data flow and invariants
The architecture depends on a few non-negotiable invariants:
- every mission has exactly one active lifecycle state at a time
- every accepted FACT claim has a declared source tier
- every output contract is known before the agent is called
- unresolved disagreement is never discarded by the synthesis layer
- every final decision creates a journal entry before the mission is considered complete
- failure preserves partial artifacts and records the failure state

## Interface-to-kernel boundary
The interface layer may offer ergonomic commands, but all meaningful actions still become kernel events. A “quick screen” surface, for example, still becomes a mission type in the domain config. This protects the architecture from special-case logic living in UI code.

## Domain extensibility boundary
The blueprint positions Investment War Room as the first domain, not the only domain. The architecture therefore isolates domain-specific rules in registries and domain configuration. A future research-studio domain should reuse the same kernel states, evidence semantics, journaling model, and observability spine while swapping team composition, constitution rules, and output contract.

## Failure model
Any layer may fail, but the kernel owns recovery policy. Adapter failures become retry or fallback decisions. Evidence shortages become human review or abort recommendations. Schema failures become output rejection. Journal write failures prevent successful completion because a decision that cannot be recorded is incomplete.

## Architectural stop condition for implementation
Phase 1 implementation should start only when each component above has a corresponding specification reference and no cross-layer responsibility is ambiguous. This document, together with the lifecycle, agent, constitution, evidence, journal, and domain specs, forms that baseline.
