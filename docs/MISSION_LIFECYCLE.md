# MISSION_LIFECYCLE

## Purpose
This document defines the formal mission state machine for onemancompany. It captures the operational states, gate semantics, primary transitions, timeouts, timeout behavior, and failure paths that the future kernel must implement exactly. The blueprint describes this lifecycle as the safeguard against silent failure, partial synthesis, and ambiguous recovery behavior. This document turns that narrative into a durable specification.

## State inventory
The prompt describes “10 states” but enumerates 11 names when `FAILED` is included. This specification resolves that ambiguity as follows:
- **10 operational states**: `DRAFT`, `PLANNING`, `RESEARCHING`, `HUMAN_REVIEW`, `ANALYZING`, `CROSS_QA`, `DEBATING`, `SYNTHESIZING`, `DECIDED`, `JOURNALED`
- **1 terminal error state**: `FAILED`

`HUMAN_REVIEW` is a reusable gate state that may be entered at more than one point in a mission. It remains a single state name with different gate contexts.

## State definitions
### DRAFT
Initial intake state. The owner has submitted a brief, assumptions, and constraints, but the kernel has not yet converted them into an executable mission object.

**Entry condition:** owner brief received.

**Exit condition:** the input is valid enough to be planned.

**Required artifacts:** raw brief, domain hint if available, timestamp, owner id/session id when applicable.

### PLANNING
The kernel decomposes the brief into a mission object. It selects domain, mission type, required agents, evidence requirements, output requirements, and human checkpoints.

**Entry condition:** `DRAFT` input validated.

**Exit condition:** team is built and evidence requirements are defined.

**Required artifacts:** mission id, required agent roster, evidence requirements, output requirements, execution plan, checkpoint defaults.

### RESEARCHING
Researcher agents gather evidence from allowed sources and construct the evidence pack plus source log. Data gaps are recorded rather than hidden.

**Entry condition:** planning complete and researcher assignments issued.

**Exit condition:** evidence score is computed and either meets the analysis threshold or triggers a human gate.

**Required artifacts:** evidence pack, source log, evidence score, critical gap list.

### HUMAN_REVIEW
Reusable owner checkpoint state. This state may occur after low-evidence research, after individual analyses as an optional review, and after synthesis as a mandatory decision gate.

**Entry condition:** a checkpoint rule or constitution rule demands owner input.

**Exit condition:** owner approves, revises assumptions, requests more work, or aborts.

**Required artifacts:** gate reason, summary payload, available actions, owner response, wait duration.

### ANALYZING
Analyst agents work in parallel using the evidence pack. They produce structured outputs, surface assumptions, declare data gaps, and may ask evidence requests.

**Entry condition:** research complete or a human gate released the mission.

**Exit condition:** all analysts have returned or timed out according to the per-analyst rule.

**Required artifacts:** one output contract result per analyst, validation outcome, unanswered evidence requests, declared uncertainties.

### CROSS_QA
Agents ask questions across roles. Researchers answer fact requests through the evidence response protocol, and unanswered questions are retained explicitly.

**Entry condition:** analyst outputs available.

**Exit condition:** all queued cross-questions are asked and the allowed evidence request loop is satisfied or exhausted.

**Required artifacts:** question/answer log, evidence response log, unanswered question list.

### DEBATING
Structured disagreement rounds occur here. The system tracks challenge origin, targeted claim, evidence tier, round result, and unresolved topics.

**Entry condition:** cross-questioning complete.

**Exit condition:** all disagreements are resolved early or the maximum of three rounds is reached.

**Required artifacts:** debate rounds, resolution status, unresolved disagreements, evidence weighting rationale.

### SYNTHESIZING
The CIO synthesizer combines analyst outputs, unresolved debates, data gaps, and constitution findings into a single final analysis package.

**Entry condition:** debate loop finished or capped.

**Exit condition:** final synthesis validates and is ready for human confirmation.

**Required artifacts:** decision draft, agreement map, disagreement map, evidence score, thesis breakers, follow-up checklist.

### DECIDED
The owner-confirmed final state is committed as a decision outcome. This is where `decision_state`, `price_to_watch`, `thesis_breakers`, and follow-up expectations are finalized.

**Entry condition:** synthesis output validated and required owner confirmation received.

**Exit condition:** journal write succeeds.

**Required artifacts:** final decision object, owner-approved assumptions, final evidence posture.

### JOURNALED
Terminal success state. The decision journal entry is written and linked to mission, evidence, debate, and follow-up records.

**Entry condition:** journal schema validation passes.

**Exit condition:** none; this is the successful completion state.

**Required artifacts:** journal entry id, persistence status, follow-up reminders.

### FAILED
Terminal error state. Any operational state may transition here if the timeout is exceeded, an adapter error cannot be recovered, or the owner aborts explicitly.

**Entry condition:** unrecoverable error, explicit abort, or timeout escalation.

**Exit condition:** none.

**Required artifacts:** failed_from_state, error reason, preserved partial output, recovery options presented to owner.

## Primary forward transitions
These are the nine forward transitions that define the mainline lifecycle.

| From | To | Precondition | Timeout | On timeout |
| --- | --- | --- | --- | --- |
| DRAFT | PLANNING | input valid | none | reject and explain |
| PLANNING | RESEARCHING | team built, evidence requirement defined | none | not applicable |
| RESEARCHING | ANALYZING | evidence score >= 40 | 3 min per researcher | partial proceed and flag |
| RESEARCHING | HUMAN_REVIEW | evidence score < 40 | none | not applicable |
| ANALYZING | CROSS_QA | all analysts returned output | 2 min per analyst | skip failed agent and flag |
| CROSS_QA | DEBATING | all questions asked | 90 sec | proceed |
| DEBATING | SYNTHESIZING | max 3 rounds or all resolved | 3 rounds max | close with unresolved flags |
| SYNTHESIZING | DECIDED | CIO output validated | 2 min | fail |
| DECIDED | JOURNALED | journal schema valid | none | retry |

## Gate-specific transitions involving HUMAN_REVIEW
The blueprint uses `HUMAN_REVIEW` as a reusable state. The following gate flows are therefore part of the formal spec even though they are not separate named entries in the nine-transition table.

### Gate 1 — low or reviewable evidence after research
- Trigger: after `RESEARCHING`
- Canonical state-machine posture: enter `HUMAN_REVIEW` when evidence score is
  below 40 or when a mission/domain override explicitly requests a paused review
- Mandatory condition from constitution/evidence controller: evidence score `< 40`
- Allowed owner actions: proceed, request additional research, abort
- Release path: `HUMAN_REVIEW -> ANALYZING`

### Gate 2 — optional review after individual analyses
- Trigger: after `ANALYZING`
- Purpose: let the owner inspect individual analyses or add context before debate
- Domain default: optional/disabled unless mission config enables it
- Release path: `HUMAN_REVIEW -> CROSS_QA` if invoked

### Gate 3 — mandatory review after synthesis
- Trigger: after `SYNTHESIZING`
- Purpose: owner confirms synthesis or revises assumptions before final decision
- Domain default: always
- Allowed owner actions: proceed to decision, revise assumptions and rerun, abort
- Release path: `HUMAN_REVIEW -> DECIDED`

## Timeout rules
Timeout values must match the blueprint exactly where specified.
- `RESEARCHING -> ANALYZING`: **3 minutes per researcher**
- `ANALYZING -> CROSS_QA`: **2 minutes per analyst**
- `CROSS_QA -> DEBATING`: **90 seconds**
- `DEBATING -> SYNTHESIZING`: **maximum 3 rounds**
- `SYNTHESIZING -> DECIDED`: **2 minutes**

### Timeout handling semantics
- Research timeout does not automatically abort. It allows **partial proceed + flag** when evidence score is still adequate.
- Analysis timeout skips the failed analyst, records the failure, and continues with a flag.
- Cross-QA timeout proceeds with whatever questions have been asked.
- Debate timeout closes the loop with unresolved disagreement flags rather than forcing consensus.
- Synthesis timeout fails the mission because a validated decision object is required before decision commit.

## Error paths to FAILED
Every operational state may transition to `FAILED` under any of the following conditions:
1. a required timeout is exceeded and the defined timeout action escalates to failure
2. adapter error is unrecoverable
3. owner sends explicit abort request

When failure occurs, the kernel must:
- record the state in which the failure happened
- record the error reason and category
- preserve partial outputs, evidence, and messages already produced
- notify the owner with recovery options

## Recovery posture
`FAILED` is terminal for the mission instance, but the preserved artifacts should allow one of three recovery modes later:
- retry from a fresh mission using the same brief
- replay from saved evidence and messages
- salvage manual outputs for learning or audit purposes

## Lifecycle invariants
- only one state may be active at a time
- all state changes are timestamped
- all gate entries record wait time and owner action
- no mission may enter `DECIDED` without validated synthesis output
- no mission may be considered complete until `JOURNALED`
- if a constitution rule blocks progress, the mission either remains in the current state pending remedy or moves to `FAILED`

## Example state trace
A compliant trace for the Investment War Room domain may look like:
1. `DRAFT`
2. `PLANNING`
3. `RESEARCHING`
4. `HUMAN_REVIEW` (Gate 1)
5. `ANALYZING`
6. `CROSS_QA`
7. `DEBATING`
8. `SYNTHESIZING`
9. `HUMAN_REVIEW` (Gate 3)
10. `DECIDED`
11. `JOURNALED`

This trace uses the same `HUMAN_REVIEW` state twice with different gate contexts.

## Implementation notes for later phases
Although this phase is documentation only, later code should model the lifecycle as a deterministic state machine with typed transition functions, guard checks, and per-state observability hooks. The kernel should not allow arbitrary jumping across states. Every release from `HUMAN_REVIEW` should reference a gate id and explicit owner action.

## Completion contract
The lifecycle specification is authoritative for Phase 1 kernel work. If future documents disagree, this document and the domain config must be reconciled before implementation proceeds.
