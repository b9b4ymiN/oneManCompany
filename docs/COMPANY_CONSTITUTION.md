# COMPANY_CONSTITUTION

## Purpose
The company constitution is the rule layer that overrides individual agent preferences. Agent prompts may tell a valuation analyst to run a DCF, but constitutional rules decide whether that DCF is even allowed to proceed. The blueprint frames these rules as company-level constraints that apply across missions and can block, gate, warn, or reject outputs. This document defines the formal structure and the six required Investment War Room rules.

## Rule object contract
Every constitutional rule must define the following fields:
- `id`: stable machine-readable identifier
- `description`: human-readable statement of the rule
- `enforcement`: one of `BLOCK_MISSION`, `INSERT_HUMAN_REVIEW`, `WARN_AND_FLAG`, `REJECT_OUTPUT`
- `applies_to`: target agents, controller, or `all_agents`
- `exception`: named exception or `none`

Optional fields may include thresholds, critical fields, trigger conditions, and rationale notes. The required fields exist so a future constitution engine can evaluate and log the rule consistently.

## Enforcement semantics
### BLOCK_MISSION
The mission may not proceed until the violation is fixed or the mission is aborted. Use this when continuing would invalidate downstream analysis.

### INSERT_HUMAN_REVIEW
The system pauses and presents the issue to the owner before work continues. Use this when the system can explain the risk but cannot safely resolve it alone.

### WARN_AND_FLAG
The mission may continue, but the issue must be recorded in output and observability. Use this when uncertainty matters but does not automatically invalidate the mission.

### REJECT_OUTPUT
The specific agent output is refused and retried or marked failed. Use this when the content itself violates a hard company boundary.

## Evaluation order
To keep behavior deterministic, the constitution should be evaluated in the following order:
1. mission-blocking rules
2. output-rejection rules
3. human-review insertion rules
4. warning/flag rules

This prevents low-severity warnings from obscuring critical blockers.

## Canonical rule set for Investment War Room
```yaml
company_constitution:
  - id: no_analysis_without_normalized_earnings
    description: "No valuation may proceed until normalized earnings has passed forensic review."
    enforcement: BLOCK_MISSION
    applies_to: [damodaran-valuation, klarman-downside]
    exception: none

  - id: evidence_required_for_all_facts
    description: "Every FACT-labeled claim must include a declared source tier and source reference."
    enforcement: REJECT_OUTPUT
    applies_to: all_agents
    exception: none

  - id: data_gap_must_surface
    description: "If a critical field cannot be found, the owner must be informed before the mission proceeds."
    enforcement: INSERT_HUMAN_REVIEW
    applies_to: researcher_agents
    exception: none

  - id: no_buy_sell_recommendation
    description: "The system outputs decision_state values, not direct buy/sell recommendations."
    enforcement: REJECT_OUTPUT
    applies_to: all_agents
    exception: none

  - id: low_evidence_score_gate
    description: "Evidence score below 40 requires human review before analysis proceeds."
    enforcement: INSERT_HUMAN_REVIEW
    applies_to: evidence_controller
    exception: owner_explicit_override

  - id: uncertainty_must_be_explicit
    description: "Every assumption must be labeled and must state what the conclusion is sensitive to."
    enforcement: WARN_AND_FLAG
    applies_to: all_agents
    exception: none
```

## Rule-by-rule interpretation
### 1. no_analysis_without_normalized_earnings
This rule exists because the blueprint explicitly treats forensic review as a gate before valuation. Valuation built on unreviewed reported profit can make the entire mission invalid, so the proper response is `BLOCK_MISSION`. The future kernel should require a successful forensic-accountant output or an equivalent validated normalized earnings artifact before valuation agents start.

### 2. evidence_required_for_all_facts
A sourceless fact breaks the evidence-first philosophy. The validator must reject any output containing a FACT claim without a declared source tier and reference. This is narrower than “all claims need Tier 1 evidence”; assumptions and estimates remain allowed, but they must be labeled honestly.

### 3. data_gap_must_surface
Critical missing information cannot be silently patched over. The rule targets researcher roles because they control evidence-pack construction and the first discovery of missing fields. The owner must be shown the gap and its effect on downstream work.

### 4. no_buy_sell_recommendation
The blueprint’s language is unambiguous: the system should output an `investment decision state`, not imperatives such as “buy now” or “sell immediately.” This protects the operating model from collapsing into simplistic recommendation language and keeps the output aligned with risk, valuation, and follow-up context.

### 5. low_evidence_score_gate
The blueprint’s evidence controller sets clear thresholds. Below 40, a human review gate becomes mandatory before analysis. This rule should be checked immediately after research scoring and before analysis dispatch.

### 6. uncertainty_must_be_explicit
This is the softest rule but still essential. The system may continue with assumptions, but it must tell the owner what is assumed and what changes would materially alter the conclusion. Later scorecards and journals depend on that honesty.

## Logging requirements
Every constitution decision should be observable. Later implementation should log:
- rule id
- mission id
- agent id or controller target
- enforcement chosen
- pass/fail result
- exception used if any
- remediation instruction or gate request id

## Relationship to lifecycle and debate
Constitution rules are checked at multiple points:
- after research scoring
- after analyst outputs are validated
- before synthesis is accepted
- before decision commit

A constitution rule may also shape debate. For example, if evidence quality is too low, the correct action is not “debate harder,” but “ask for human review or additional research.”

## Owner override posture
Only rules that explicitly permit an exception may be overridden, and the override must be recorded. In the canonical six-rule set above, the only named exception is `owner_explicit_override` for the low-evidence gate. Even then, the mission should remain visibly flagged.

## Why the constitution lives above agent prompts
Prompts are too easy to drift and too tied to individual model behavior. The constitution lives at company level because it represents operating law. Future agent prompt changes must remain subordinate to these rules.

## Completion contract
The constitution is complete for Phase 0 when the six canonical rules above are present with required fields, enforcement semantics are defined, and later kernel work can enforce them without inventing new meanings.
