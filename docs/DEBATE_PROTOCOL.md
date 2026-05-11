# DEBATE_PROTOCOL

## Purpose
The debate protocol governs how analyst disagreement is surfaced, challenged, and preserved inside onemancompany. The blueprint is explicit about why this matters: without rules, debate loops never end, louder agents dominate, and unresolved disagreements are averaged away. This document defines the formal structure for debate rounds, challenge payloads, evidence weighting, evidence-request side loops, and resolution behavior.

## Core principles
1. **Maximum three rounds.** Debate is bounded to prevent endless looping.
2. **Evidence outranks rhetoric.** Challenges must reference specific claims and supporting evidence or counter-argument.
3. **Preserve disagreement.** The system never averages out a live disagreement merely to force consensus.
4. **Use evidence requests for missing facts.** A debate is not the same as asking a researcher for additional primary evidence.
5. **Close with explicit status.** Every challenge concludes as `resolved`, `partial`, or `unresolved`.

## Debate lifecycle
Debate occurs after `CROSS_QA` and before `SYNTHESIZING`. All required cross-questions must already have been asked. Debate then focuses on analytical disagreement rather than basic evidence retrieval.

### Entry preconditions
- analyst outputs are available
- cross-questions have been asked or timed out
- unresolved issues are identified and grouped into debate topics
- the debate controller knows which pairs of agents may challenge one another

### Exit conditions
- all disagreements resolve before the cap, or
- the protocol reaches the third round and closes remaining disagreements as unresolved

## Round structure
Each topic uses the following structure:
1. **Challenge creation**
   - Agent A references a specific claim from Agent B.
   - Agent A states why the claim is disputed.
   - Agent A provides counter-evidence or counter-argument.
2. **Response**
   - Agent B either defends the original claim with stronger grounding, revises it, or retracts it.
3. **Controller verdict**
   - Debate controller marks the topic as `resolved`, `partial`, or `unresolved`.

No topic may exceed three rounds. If the disagreement remains live after the third round, it is preserved for the synthesizer and owner.

## Challenge payload format
A valid challenge should include:
- challenged claim text
- challenged claim owner
- challenge reason
- supporting evidence references with tier and label
- requested resolution or revision
- whether a direct evidence request is needed instead of further debate

Example documentary shape:

```yaml
thread_id: debate-round-1-growth
from: klarman-downside
to: damodaran-valuation
challenged_claim: "Revenue growth of 12% for years 1-5"
challenge_reason: "Historical CAGR is materially lower and the catalyst proof is weak"
counter_evidence:
  - claim: "FY2020-2025 revenue CAGR was 7.8%"
    source_tier: tier_1
    label: FACT
requested_resolution: "justify 12% with stronger evidence or revise downward"
```

## Evidence weighting rules
When evidence conflicts, the system uses the blueprint’s priority order:

`Tier 1 > Tier 2 > Tier 3 > ASSUMPTION > ESTIMATE`

This ordering carries the following implications:
- an agent supported by Tier 1 evidence has more weight than one supported only by Tier 2 or Tier 3 evidence
- if two agents rely on evidence of the same tier, the disagreement becomes a meaningful signal rather than a reason to invent consensus
- assumptions and estimates may be used, but they should not overrule stronger direct evidence
- management claims can be useful context, but they should not be promoted to fact without corroboration

## Evidence request loop
Debate is not the only mechanism for disagreement handling. Sometimes an agent does not disagree with a peer’s reasoning; it simply lacks a required fact. In that case the protocol uses `evidence_request` and `evidence_response` messages with the researcher.

### Loop rules
- maximum evidence request rounds: **2**
- requests must name the desired data and the required minimum tier
- researcher either provides evidence, returns not-found plus an alternative source suggestion, or records a critical data gap
- if a critical gap remains after the loop, the synthesizer must surface it and any constitution rules may force human review

## Interaction constraints
- an agent may challenge another only if domain interaction rules permit it or the disagreement threshold triggers it
- self-challenge is forbidden
- agents do not challenge a researcher on raw fact ownership inside debate; they request more evidence instead
- the synthesizer is not an upstream debate target during analyst rounds

## Resolution semantics
### Resolved
The challenged agent updates or defends the claim and the challenger accepts the result.

### Partial
Some part of the disagreement narrows, but a residual uncertainty remains. Example: both agents accept reducing a growth assumption from 12% to 10%, yet still disagree on terminal growth.

### Unresolved
After at most three rounds, the disagreement remains material. The protocol closes the topic and hands it to synthesis unchanged.

## Preserve disagreement, never average
This is the most important rule. If Damodaran and Klarman still disagree after the cap, the CIO must present both views, explain the evidence posture on each side, and state the decision risk attached to believing either side. The system must **never** convert “2% vs 3% terminal growth” into “2.5% because compromise feels tidy” unless the owner explicitly revises the assumption at a human review gate.

## Debate outputs required for synthesis
At minimum, the debate controller should hand the synthesizer:
- number of rounds used
- challenge count
- resolved topic count
- unresolved topic count
- unresolved topic summaries
- evidence weighting notes for each unresolved disagreement
- any assumption revisions made during debate

## Failure handling
- if the debate controller cannot classify a topic, it defaults to `unresolved` and surfaces the uncertainty
- if a participant times out, the topic remains open and is marked accordingly
- if debate depends on evidence that never arrives after the two-round request loop, the related data gap must be attached to the topic

## Owner-facing reporting
Human-facing summaries should use plain language. The owner should be able to see:
- what the disagreement is about
- which side has stronger evidence
- whether the disagreement is about fact, assumption, or estimate
- what would resolve it later

## Implementation note
In Phase 1, debate records should map directly to protocol messages and SQLite records. In Phase 0, the essential outcome is a bounded, audit-ready rule set that prevents fake consensus and runaway loops.
