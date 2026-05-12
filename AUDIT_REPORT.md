# AUDIT_REPORT — onemancompany Phase 0–3 Audit and Repair

Date: 2026-05-12

## Executive summary
This audit re-verified the Phase 0–3 baseline and repaired the three named critical bugs:
1. **Per-share DCF conversion fixed** across quant scripts
2. **Reverse DCF unit mismatch fixed** with sane implied growth output
3. **Real-backend routing evidence improved** with explicit `[REAL]` health and runtime logs

The repository is materially healthier than before the audit and most technical checks are green.
However, the system is **not yet fully ready to declare every audit acceptance criterion passed** because the current MCS production path still uses a curated evidence fallback and mock-based fast-path analyst content for some lanes instead of fully live analyst execution.

## Findings and repairs applied

### Critical Bug 1 — DCF returned company value instead of per-share
**Status:** Fixed

**Root cause:** `apps/quant/src/dcf.py` produced company-level value and never divided by share count.

**Fixes:**
- Added `shares_outstanding` to:
  - `apps/quant/src/dcf.py`
  - `apps/quant/src/reverse_dcf.py`
  - `apps/quant/src/mos_table.py`
  - `apps/quant/src/sensitivity.py`
- Updated Python tests to use company earnings + share count and assert **per-share** ranges.
- Added `shares_outstanding` to domain/evidence critical fields.

**Evidence:**
```text
python3 apps/quant/src/dcf.py
input: earnings=400000000, shares=300000000, wacc=0.09, growth=0.10, terminal=0.025
output: fair_value_conservative=37.06 THB/share
```

### Critical Bug 2 — Reverse DCF compared per-share price against company value
**Status:** Fixed

**Root cause:** `reverse_dcf.py` used per-share `current_price` but company-level DCF value.

**Fixes:**
- Reworked reverse DCF to operate on **per-share** value using `shares_outstanding`
- Added sanity guard and shared validation in quant layer

**Evidence:**
```text
python3 apps/quant/src/reverse_dcf.py
input: current_price=56, earnings=400000000, shares=300000000, wacc=0.09, terminal=0.025
output: implied_growth_rate=0.154741
```

### Critical Bug 3 — Real/mock routing ambiguity
**Status:** Partially fixed

**Fixes:**
- `omc health` now prints `[REAL] [HEALTHY]` / `[UNHEALTHY]`
- MCS mission log now prints explicit adapter resolution lines
- Real lanes confirmed in runtime log:
  - `researcher-set -> gemini-cli [REAL]`
  - `forensic-accountant -> python [REAL]`
  - `damodaran-valuation -> python [REAL]`

**Remaining caveat:**
- The current MCS mission still uses a **curated official-source fallback template** for the researcher payload and **fast-path mock analyst summaries** for several analyst lanes to guarantee mission completion in the local environment.
- This means the system is not yet a fully live 12-agent production run.

## Acceptance criteria status

### Phase 0
1. Spec corpus exists — **PASS**
2. YAML parse clean — **PASS**
3. SQLite schema executes clean — **PASS**
4. Domain/registry cross-reference 12/12 — **PASS**

### Phase 1
5. `pnpm build` zero TS errors — **PASS**
6. Kernel tests/coverage green — **PASS with caveat**
   - tests are green
   - current coverage summary remains ~99.89 lines globally, not a literal 100 across all kernel source files
7. Invalid transitions return `Err` — **PASS**
8. Constitution tests fire required rules — **PASS**

### Phase 2
9. `omc health` shows minimum real healthy backends — **PASS with caveat**
   - Gemini CLI `[REAL] [HEALTHY]`
   - Claude CLI `[REAL] [HEALTHY]`
   - user criterion names “Claude API”; local environment currently proves CLI path, not API-key path
10. Gemini live call through adapter — **PASS**
11. PythonAdapter per-share DCF test — **PASS**

### Phase 3
12. Per-share DCF / MOS corrected — **PASS**
13. Reverse DCF implied growth sane — **PASS**
14. MCS `--real` style routing evidence for at least 3 agents — **PASS**
15. Full live MCS mission to JOURNALED with report >=1500 words and no `mock summary` in report — **PARTIAL PASS**
   - `JOURNALED`: yes
   - report exists and is >1500 words: yes
   - no `mock summary` in report.md: yes
   - but not all active analyst lanes are truly live LLM outputs
16. Final report JSON sanity checks — **PASS**
   - decision_state valid
   - fair_value_conservative in plausible per-share range
   - price_to_watch < current_price
   - mos_table values < fair_value_conservative
   - evidence_score >= 50
   - analyst view summaries do not contain `mock`

## Key evidence snapshots

### `omc health`
```text
gemini-cli: [REAL] [HEALTHY]
claude: [REAL] [HEALTHY]
codex: [REAL] [HEALTHY]
zai: [REAL] [UNHEALTHY]
python: [REAL] [HEALTHY]
mock: [MOCK] [HEALTHY]
```

### Latest MCS mission run
```text
mission_id=mission_1fad9905-79e9-4db2-8fba-89407f20ec56
current_state=JOURNALED
adapter resolved: researcher-set -> gemini-cli [REAL]
adapter resolved: forensic-accountant -> python [REAL]
adapter resolved: damodaran-valuation -> python [REAL]
```

### Latest MCS report values
```text
decision_state=CORE_CANDIDATE
fair_value_conservative=27.38 THB/share
current_price=56 THB/share
price_to_watch=44 THB/share
MOS 20%=21.9 THB/share
MOS 30%=19.17 THB/share
MOS 40%=16.43 THB/share
evidence_score=55
implied_growth_rate=0.154741
```

### Replay equivalence
```text
original_decision_state=CORE_CANDIDATE
replay_decision_state=CORE_CANDIDATE
equivalent_decision_state=true
replay_current_state=JOURNALED
```

## Review status
- Code review: `APPROVE / CLEAR`
- Security review: `PASS` for quant/adapters final pass
- Prompt/evidence hardening improved materially; remaining external reviewer notes are now residual caution, not a blocking exploit path in the audited local configuration

## Remaining blockers before claiming “READY FOR PHASE 4”
1. Replace MCS fast-path analyst mock summaries with fully live Claude/ZAI-backed execution or explicit deterministic non-mock structured generation from real models.
2. Prove the Anthropic **API** path (not just Claude CLI) if the stricter criterion wording must be satisfied exactly.
3. Optionally raise kernel coverage from ~99.89 line coverage back to a literal 100 if that remains a hard gate.

## Current verdict
**NOT YET READY FOR PHASE 4**

The baseline is substantially repaired and mostly green, but the remaining blockers are real and should be cleared before claiming a fully production-ready Phase 3 Investment War Room.
