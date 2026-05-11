# EVIDENCE_STANDARD

## Purpose
The evidence standard defines what kinds of claims onemancompany may make, how sources are classified, how evidence strength is scored, and how grounding checks are performed before outputs are accepted. This standard is central to the blueprint’s evidence-first philosophy. Without it, downstream analysis would blur facts, assumptions, management claims, estimates, and rumors into one undifferentiated stream.

## Five-tier source classification
### Tier 1 — Primary official sources
Examples: SET or SEC filings, EDGAR filings, audited annual reports, official quarterly statements, formal corporate disclosures.

**Use:** hard factual statements, financial statements, risk factors, segment data, share counts, debt disclosures, corporate actions.

**Default label posture:** `FACT`

### Tier 2 — Management communication and official but interpretive materials
Examples: Opportunity Day presentations, analyst meetings, earnings calls, investor presentations, management-guidance documents.

**Use:** management guidance, strategy commentary, medium-confidence narrative context.

**Default label posture:** `MANAGEMENT_CLAIM` unless corroborated elsewhere.

### Tier 3 — Professional secondary analysis
Examples: broker reports, structured third-party research, sector notes.

**Use:** peer comparison, consensus posture, market expectation context.

**Default label posture:** often `UNVERIFIED` or `MARKET_EXPECTATION`, depending on use.

### Tier 4 — News and market commentary
Examples: financial news articles, business press, event commentary.

**Use:** catalyst timing, recent-event awareness, sentiment context.

**Default label posture:** `UNVERIFIED`

### Tier 5 — Rumor and social chatter
Examples: social media, chat groups, unsourced forum claims.

**Use:** rumor monitoring only.

**Default label posture:** `UNVERIFIED`

**Constraint:** never use Tier 5 as the basis of analysis.

## Seven claim labels
### FACT
A statement taken directly from a credible source with a declared source tier and reference.

### DERIVED
A calculation or transformation produced from facts through clear methodology. Examples include price-for-MOS math or historical CAGR computed from filings.

### ASSUMPTION
An explicit input chosen for modeling because the future is uncertain. Examples include WACC, terminal growth, or base-case margin assumptions.

### ESTIMATE
A reasoned estimate backed by a method and confidence level but not yet directly verified by higher-tier evidence.

### UNVERIFIED
A statement seen in lower-confidence material that lacks sufficient corroboration.

### MANAGEMENT_CLAIM
Something management said that has not yet been elevated to fact by supporting evidence.

### MARKET_EXPECTATION
What the market seems to have priced in, as inferred from price or third-party consensus context.

## Core separation rule
No claim may appear unlabeled. If the system cannot justify `FACT`, it must fall back to a more honest label. This protects the owner from hidden certainty inflation.

## Evidence score calculation
The blueprint defines an explicit scoring formula. This document preserves it in normalized form:

```text
Evidence Score = Base Score + Bonus - Penalty

Base Score:
  +25 for each Tier 1 source, capped at 50
  +10 for each Tier 2 source, capped at 20
  +5 for each Tier 3 source, capped at 10

Bonus:
  +10 if every required document is present
  +10 if there is no critical data gap

Penalty:
  -15 for each critical data gap
  -20 if the mission relies on Tier 5 only and has no Tier 1-3 support
```

### Threshold interpretation
- `>= 70`: proceed normally
- `40-69`: proceed with human-review awareness
- `< 40`: must pass through human review before analysis
- `< 20`: recommend abort and explain why

## Grounding checks
The validator must perform grounding checks before accepting an output.

### Check 1 — numeric grounding
Important numbers in the output must exist in the evidence pack or be labeled as assumptions/estimates. If the system claims revenue is `2,450M` and that figure is absent from evidence, the output should be flagged.

### Check 2 — source-tier consistency
A claim labeled `FACT` must point to an allowed source tier and reference. A management presentation cannot silently become a Tier 1 fact.

### Check 3 — data-gap honesty
If a critical input was not found, the output must surface that gap. Silence is treated as a quality failure.

### Check 4 — constitution compatibility
Evidence posture must not break company rules. For example, low evidence score or missing normalized earnings can trigger gating or blocking behavior.

## Evidence pack requirements
A compliant evidence pack should include:
- metadata
- source log
- financial statements
- business context
- management communication
- market context
- data gaps

The pack should also make it possible to trace any final claim back to source names, tiers, and sections.

## Researcher responsibilities
Researchers are the first defense against evidence contamination. They must:
- gather from the highest available tier first
- label materials honestly
- maintain the source log
- record what could not be found
- recommend whether the mission should proceed, gate, or abort based on evidence posture

## Analyst responsibilities
Analysts may interpret and model, but they must not relabel weak material into stronger labels. They should clearly separate derived outputs from assumptions and identify what would change their view.

## Synthesizer responsibilities
The CIO synthesizer consumes evidence score, analyst outputs, debate records, and data gaps. It should not suppress weak evidence signals or unresolved conflicts. The final `decision_state` must carry the evidence posture with it.

## Why this standard matters
The investment domain is especially vulnerable to narrative overconfidence. This standard forces the system to show the owner when it knows, when it infers, when it estimates, and when it simply does not know. That clarity is one of the main reasons to build the company kernel at all.
