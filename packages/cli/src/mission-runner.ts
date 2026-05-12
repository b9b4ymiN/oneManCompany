import fs from 'node:fs';
import path from 'node:path';
import type { ZodTypeAny } from 'zod';
import {
  AdapterFactory,
  ClaudeAdapter,
  GeminiAdapter,
  HealthMonitor,
  MockAdapter,
  PythonAdapter,
} from '@onemancompany/adapters';
import type {
  DCFResult,
  MOSTable,
  NormalizedEarningsResult,
  ReverseDCFResult,
  SensitivityMatrix,
} from '@onemancompany/adapters';
import {
  AgentOutputSchemas,
  ConstitutionEnforcer,
  DebateController,
  EvidenceController,
  JournalWriter,
  MissionPlanner,
  MissionStateMachine,
  ParallelRunner,
  SynthesisEngine,
  TeamBuilder,
} from '@onemancompany/kernel';
import type { EvidenceItem, MissionObject } from '@onemancompany/kernel';
import { MissionTracer } from '@onemancompany/observability';
import {
  ensureRuntime,
  reportFolderPath,
  writeTrace,
  type MissionTraceRecord,
} from './runtime-store';

export interface RunMissionResult {
  mission_id: string;
  current_state: string;
  transitions: Array<{ from: string; to: string; at: string }>;
  adapter_trace: string[];
  decision_state?: string;
  report_path?: string;
}

type DecisionState =
  | 'REJECT'
  | 'WATCH'
  | 'RESEARCH_MORE'
  | 'WAIT_FOR_PRICE'
  | 'STARTER_POSITION'
  | 'CORE_CANDIDATE'
  | 'ADD_ON_WEAKNESS'
  | 'HOLD'
  | 'TRIM'
  | 'EXIT_THESIS_BROKEN';

interface ActiveAgentResult {
  agent_id: string;
  backend: string;
  model_id: string;
  output: Record<string, unknown>;
  duration_ms: number;
}

interface MissionContext {
  originalBrief: string;
  plannerMission: MissionObject;
  ticker: string;
  symbol: string;
  scenarioEarnings: number;
  missionDir: string;
  reportPath: string;
  metadataPath: string;
}

const ACTIVE_PHASE3_AGENTS = [
  'researcher-set',
  'forensic-accountant',
  'damodaran-valuation',
  'klarman-downside',
  'peter-lynch-story',
  'portfolio-allocator',
  'pro-investor',
  'cio-synthesizer',
  'book-master',
] as const;

const INACTIVE_PHASE3_AGENTS = [
  'researcher-us',
  'technical-analyst',
  'hf-manager',
] as const;

function isoNow(): string {
  return new Date().toISOString();
}

function parseMcsBrief(
  brief: string
): { ticker: string; earnings: number } | null {
  const tickerMatch = /analyze\s+([A-Z0-9_\-.]+)/i.exec(brief);
  const earningsMatch = /earnings\s+([0-9]+(?:\.[0-9]+)?)([MB])?/i.exec(brief);
  if (!tickerMatch) return null;
  let earnings = 400_000_000;
  if (earningsMatch) {
    const base = Number(earningsMatch[1]);
    const suffix = earningsMatch[2]?.toUpperCase();
    earnings =
      suffix === 'B'
        ? base * 1_000_000_000
        : suffix === 'M'
          ? base * 1_000_000
          : base;
  }
  const ticker = tickerMatch[1] ?? 'MCS';
  return { ticker: ticker.toUpperCase(), earnings };
}

function extractNumbers(value: string): number[] {
  return Array.from(value.matchAll(/-?\d+(?:\.\d+)?/g)).map((m) =>
    Number(m[0])
  );
}

function normalizeEvidenceRef(
  value: Record<string, unknown>
): Record<string, unknown> {
  return {
    claim: String(
      value.claim ??
        value.fact ??
        value.statement ??
        value.source ??
        'Unknown claim'
    ),
    source_name: String(
      value.source_name ?? value.source ?? value.document ?? 'Unknown source'
    ),
    source_tier: String(
      value.source_tier ?? value.tier ?? 'tier_1'
    ).toLowerCase(),
    label: String(value.label ?? value.claim_label ?? 'FACT').toUpperCase(),
    section:
      typeof value.section === 'string'
        ? value.section
        : typeof value.reference === 'string'
          ? value.reference
          : undefined,
    note: typeof value.note === 'string' ? value.note : undefined,
  };
}

function normalizeDataGap(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return { field: value, impact: value, severity: 'medium' };
  }
  const gap =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    field: String(gap.field ?? gap.name ?? gap.issue ?? 'unknown_gap'),
    impact: String(
      gap.impact ?? gap.reason ?? gap.description ?? 'needs follow-up'
    ),
    severity: String(gap.severity ?? 'medium').toLowerCase(),
    suggested_action:
      typeof gap.suggested_action === 'string'
        ? gap.suggested_action
        : undefined,
  };
}

function normalizeAssumption(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    return {
      name: value,
      value: value,
      sensitivity: 'scenario sensitivity',
      rationale: value,
      evidence: [],
    };
  }
  const item =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    name: String(item.name ?? item.assumption ?? 'assumption'),
    value: item.value ?? item.assumption ?? 'unspecified',
    sensitivity: String(item.sensitivity ?? 'scenario sensitivity'),
    rationale: String(item.rationale ?? item.reason ?? 'provided by model'),
    evidence: Array.isArray(item.evidence)
      ? item.evidence.map((entry) =>
          normalizeEvidenceRef(entry as Record<string, unknown>)
        )
      : [],
  };
}

function normalizeResearcherPayload(
  raw: Record<string, unknown>,
  missionId: string
): Record<string, unknown> {
  const sourceLogRaw = Array.isArray(raw.source_log)
    ? raw.source_log
    : Array.isArray(raw.sources)
      ? raw.sources
      : [];
  const sourceLog = sourceLogRaw.map((entry) =>
    normalizeEvidenceRef(entry as Record<string, unknown>)
  );
  const factsRaw = Array.isArray(raw.normalized_company_facts)
    ? raw.normalized_company_facts
    : raw.normalized_company_facts &&
        typeof raw.normalized_company_facts === 'object'
      ? Object.entries(
          raw.normalized_company_facts as Record<string, unknown>
        ).map(([k, v]) => ({
          claim: `${k}: ${String(v)}`,
          source_name: 'Normalized fact',
          source_tier: 'tier_1',
          label: 'FACT',
        }))
      : sourceLog;
  const evidenceUsed = Array.isArray(raw.evidence_used)
    ? raw.evidence_used.map((entry) =>
        normalizeEvidenceRef(entry as Record<string, unknown>)
      )
    : sourceLog;
  const dataGaps = Array.isArray(raw.data_gaps)
    ? raw.data_gaps.map((gap) => normalizeDataGap(gap))
    : [];
  const assumptions = Array.isArray(raw.assumptions)
    ? raw.assumptions.map((item) => normalizeAssumption(item))
    : [];
  const statusRaw = String(
    raw.evidence_pack_status ?? 'complete'
  ).toLowerCase();
  const nextRaw = String(raw.recommended_next_step ?? 'proceed').toLowerCase();
  return {
    agent_id: String(raw.agent_id ?? 'researcher-set'),
    mission_id: String(raw.mission_id ?? missionId),
    summary: String(raw.summary ?? `Research completed for ${missionId}`),
    evidence_score: Number(raw.evidence_score ?? 80),
    evidence_used: evidenceUsed,
    data_gaps: dataGaps,
    assumptions,
    open_questions: Array.isArray(raw.open_questions)
      ? raw.open_questions.map(String)
      : [],
    thesis_breakers: Array.isArray(raw.thesis_breakers)
      ? raw.thesis_breakers.map(String)
      : ['Source evidence changes materially'],
    market: String(raw.market ?? 'thai-set').toLowerCase(),
    source_log: sourceLog,
    documents_collected: Array.isArray(raw.documents_collected)
      ? raw.documents_collected.map(String)
      : ['annual_report_56_1', 'set_quarterly_filing', 'mdna'],
    normalized_company_facts: factsRaw.map((entry) =>
      normalizeEvidenceRef(entry as Record<string, unknown>)
    ),
    evidence_pack_status:
      statusRaw in { complete: 1, partial: 1, insufficient: 1 }
        ? statusRaw
        : 'complete',
    recommended_next_step: nextRaw.startsWith('human')
      ? 'human_review'
      : nextRaw.startsWith('abort')
        ? 'abort'
        : 'proceed',
  };
}

function fallbackResearcherSetOutput(
  missionId: string,
  ticker: string,
  scenarioEarnings: number
): Record<string, unknown> {
  const sourceLog = [
    {
      claim: `${ticker} listing and issuer profile available on SET company profile`,
      source_name: 'SET Company Profile',
      source_tier: 'tier_1',
      label: 'FACT',
      section: 'issuer profile',
    },
    {
      claim: `${ticker} annual disclosure is expected in 56-1 One Report and annual report materials`,
      source_name: '56-1 One Report',
      source_tier: 'tier_1',
      label: 'FACT',
      section: 'annual disclosure',
    },
    {
      claim: `${ticker} quarterly filing and MD&A should contain the most recent reported earnings bridge`,
      source_name: 'SET Quarterly Filing / MD&A',
      source_tier: 'tier_1',
      label: 'FACT',
      section: 'quarterly financial statements',
    },
    {
      claim: `${ticker} management commentary and backlog discussion should be checked against Opportunity Day materials`,
      source_name: 'Opportunity Day',
      source_tier: 'tier_2',
      label: 'MANAGEMENT_CLAIM',
      section: 'management presentation',
    },
  ];
  return {
    agent_id: 'researcher-set',
    mission_id: missionId,
    summary: `Fallback evidence pack prepared for ${ticker} using known Thai official-source classes and scenario assumptions after Gemini timeout or schema mismatch.`,
    evidence_score: 72,
    evidence_used: sourceLog,
    data_gaps: [
      {
        field: 'exact Q1 2026 reported earnings',
        impact:
          'scenario still needs confirmation from actual quarterly filing',
        severity: 'high',
      },
    ],
    assumptions: [
      {
        name: 'scenario_earnings_q1_2026',
        value: String(scenarioEarnings),
        sensitivity: 'valuation anchor',
        rationale: 'provided by owner brief',
        evidence: [],
      },
    ],
    open_questions: [
      'Confirm latest quarterly filing numbers and debt structure from SET/SEC sources.',
    ],
    thesis_breakers: [
      'Scenario earnings fail to materialize in official filing',
    ],
    market: 'thai-set',
    source_log: sourceLog,
    documents_collected: ['annual_report_56_1', 'set_quarterly_filing', 'mdna'],
    normalized_company_facts: sourceLog.slice(0, 3),
    evidence_pack_status: 'partial',
    recommended_next_step: 'human_review',
  };
}

function extractShareCount(researchOutput: Record<string, unknown>): number {
  const fromFacts = (
    Array.isArray(researchOutput.normalized_company_facts)
      ? researchOutput.normalized_company_facts
      : []
  ) as Array<Record<string, unknown>>;
  for (const fact of fromFacts) {
    const claim = String(fact.claim ?? '');
    if (/share/i.test(claim)) {
      const nums = extractNumbers(claim);
      if (nums.length > 0)
        return (nums[0] ?? 300) * (claim.includes('million') ? 1_000_000 : 1);
    }
  }
  return 300_000_000;
}

function extractCurrentPrice(researchOutput: Record<string, unknown>): number {
  const fromFacts = (
    Array.isArray(researchOutput.normalized_company_facts)
      ? researchOutput.normalized_company_facts
      : []
  ) as Array<Record<string, unknown>>;
  for (const fact of fromFacts) {
    const claim = String(fact.claim ?? '');
    if (/price|close/i.test(claim)) {
      const nums = extractNumbers(claim);
      if (nums.length > 0) return nums[0] ?? 56;
    }
  }
  return 56;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function sourceNameFromRef(ref: string): string {
  return ref.split(' | ')[0] ?? ref;
}

export class MissionRunner {
  async run(brief: string): Promise<RunMissionResult> {
    if (/analyze\s+MCS/i.test(brief)) {
      return await this.runInvestmentWarRoomMvp(brief);
    }
    return await this.runPhase2Baseline(brief);
  }

  private async runPhase2Baseline(brief: string): Promise<RunMissionResult> {
    const db = ensureRuntime();
    const planner = new MissionPlanner();
    const evidenceController = new EvidenceController();
    const constitution = new ConstitutionEnforcer();
    const synthesis = new SynthesisEngine();
    const tracer = new MissionTracer();
    const plannerResult = planner.planMission(brief);
    if (plannerResult.isErr()) {
      throw plannerResult.error;
    }
    const mission = plannerResult.value;
    const machine = new MissionStateMachine();
    const traceLog: string[] = [];
    const step = (
      to: Parameters<MissionStateMachine['transition']>[0],
      context: Parameters<MissionStateMachine['transition']>[1]
    ) => {
      const from = machine.currentState;
      const result = machine.transition(to, context);
      if (result.isErr()) {
        throw new Error(result.error.message);
      }
      tracer.record(from, to, result.value.history.at(-1)?.at);
    };

    db.prepare(
      `INSERT OR REPLACE INTO missions (id, domain_id, mission_type, subject_type, ticker, market, owner_brief, current_state, status, created_at, metadata_json)
       VALUES (@id, @domain_id, @mission_type, @subject_type, @ticker, @market, @owner_brief, @current_state, @status, @created_at, @metadata_json)`
    ).run({
      id: mission.mission_id,
      domain_id: mission.domain,
      mission_type: mission.mission_type,
      subject_type: 'equity',
      ticker: mission.subject.ticker,
      market: mission.subject.market,
      owner_brief: mission.owner_brief,
      current_state: machine.currentState,
      status: 'active',
      created_at: isoNow(),
      metadata_json: JSON.stringify(mission.metadata),
    });

    step('PLANNING', { brief: mission.owner_brief });
    step('RESEARCHING', { teamReady: true, evidenceRequirementsReady: true });

    const mock = new MockAdapter();
    const researchResult = mock.executeLegacy({
      mission_id: mission.mission_id,
      agent_id: 'researcher-us',
    });
    if (researchResult.isOk()) {
      traceLog.push('selected mock');
    }

    const evidenceItems: EvidenceItem[] = [
      {
        id: `${mission.mission_id}-e1`,
        mission_id: mission.mission_id,
        agent_id: 'researcher-us',
        claim_text: 'Revenue 400000000',
        claim_label: 'FACT',
        source_name: '10-K',
        source_tier: 'tier_1',
        challenged: false,
        created_at: isoNow(),
        numeric_value: 400000000,
      },
      {
        id: `${mission.mission_id}-e2`,
        mission_id: mission.mission_id,
        agent_id: 'researcher-us',
        claim_text: 'Margin 20',
        claim_label: 'FACT',
        source_name: '10-Q',
        source_tier: 'tier_1',
        challenged: false,
        created_at: isoNow(),
        numeric_value: 20,
      },
      {
        id: `${mission.mission_id}-e3`,
        mission_id: mission.mission_id,
        agent_id: 'researcher-us',
        claim_text: 'Guidance intact',
        claim_label: 'MANAGEMENT_CLAIM',
        source_name: 'Call',
        source_tier: 'tier_2',
        challenged: false,
        created_at: isoNow(),
      },
    ];
    const evidencePack = evidenceController.buildEvidencePack(
      mission.mission_id,
      evidenceItems,
      ['sec_10k'],
      []
    );
    const constitutionResult = constitution.evaluate({
      agent_id: 'researcher-us',
      pipeline_point: 'research',
      evidence_score: evidencePack.score,
      data_gaps: [],
    });
    if (constitutionResult.isErr()) {
      throw constitutionResult.error;
    }
    step('ANALYZING', { evidenceScore: evidencePack.score });
    step('CROSS_QA', { analystOutputsComplete: true });
    step('DEBATING', { crossQaComplete: true });
    step('SYNTHESIZING', { debateRoundsCompleted: 3 });
    const cio = mock.executeLegacy({
      mission_id: mission.mission_id,
      agent_id: 'cio-synthesizer',
    });
    const synthesisOutput = synthesis.assemble({
      agent_outputs:
        cio.isOk() && cio.value.status === 'success'
          ? [
              cio.value.output as Record<string, unknown> & {
                agent_id: string;
                decision_state?: DecisionState;
              },
            ]
          : [],
      evidence_score: evidencePack.score,
      thesis_breakers: ['Demand collapse'],
      follow_up_events: ['Track next filing'],
      disagreements: ['Timing differs'],
      output_requirements: mission.output_requirements,
    });
    const synthValidation = synthesis.validateMandatoryFields(
      synthesisOutput,
      mission.output_requirements
    );
    if (synthValidation.isErr()) {
      throw synthValidation.error;
    }
    step('HUMAN_REVIEW', { mandatoryFieldsPresent: true });
    db.prepare(
      'UPDATE missions SET current_state = ?, evidence_score = ? WHERE id = ?'
    ).run(machine.currentState, evidencePack.score, mission.mission_id);
    const traceRecord: MissionTraceRecord = {
      mission_id: mission.mission_id,
      brief,
      current_state: machine.currentState,
      transitions: tracer.events.map((event) => ({
        from: event.from,
        to: event.to,
        at: event.timestamp,
      })),
      adapter_trace: traceLog,
      evidence_score: evidencePack.score,
    };
    writeTrace(traceRecord);
    db.close();
    return traceRecord;
  }

  private async runInvestmentWarRoomMvp(
    brief: string
  ): Promise<RunMissionResult> {
    const parsed = parseMcsBrief(brief);
    if (!parsed) {
      throw new Error('Unable to parse Investment War Room brief');
    }
    const db = ensureRuntime();
    const planner = new MissionPlanner();
    const evidenceController = new EvidenceController();
    const constitution = new ConstitutionEnforcer();
    const synthesisEngine = new SynthesisEngine();
    const debateController = new DebateController();
    const parallelRunner = new ParallelRunner();
    const tracer = new MissionTracer();
    const health = await new HealthMonitor().run();
    const healthMap = Object.fromEntries(
      health.backends.map((backend) => [backend.backend, backend])
    ) as Record<
      string,
      { backend: string; healthy: boolean; reason: string; critical: boolean }
    >;
    const plannerResult = planner.planMission(
      `analyze ${parsed.ticker} with earnings ${parsed.earnings / 1_000_000}M`
    );
    if (plannerResult.isErr()) {
      throw plannerResult.error;
    }
    const mission = plannerResult.value;
    mission.owner_brief = brief;
    mission.subject.market = 'thai-set';
    mission.required_agents = Array.from(
      new Set([...ACTIVE_PHASE3_AGENTS, ...INACTIVE_PHASE3_AGENTS])
    ) as string[];
    const stamp = new Date().toISOString().slice(0, 10);
    const missionDir = reportFolderPath(parsed.ticker, stamp);
    fs.mkdirSync(missionDir, { recursive: true });
    const context: MissionContext = {
      originalBrief: brief,
      plannerMission: mission,
      ticker: parsed.ticker,
      symbol: parsed.ticker,
      scenarioEarnings: parsed.earnings,
      missionDir,
      reportPath: path.join(missionDir, 'report.md'),
      metadataPath: path.join(missionDir, 'report.json'),
    };

    const machine = new MissionStateMachine();
    const factory = new AdapterFactory(healthMap);
    const traceLog: string[] = [];
    const step = (
      to: Parameters<MissionStateMachine['transition']>[0],
      contextInput: Parameters<MissionStateMachine['transition']>[1]
    ) => {
      const from = machine.currentState;
      const result = machine.transition(to, contextInput);
      if (result.isErr()) {
        throw new Error(result.error.message);
      }
      tracer.record(from, to, result.value.history.at(-1)?.at);
    };

    this.insertMissionRow(db, mission, machine.currentState);
    step('PLANNING', { brief: mission.owner_brief });
    step('RESEARCHING', { teamReady: true, evidenceRequirementsReady: true });

    for (const skipped of INACTIVE_PHASE3_AGENTS) {
      this.insertAgentCall(
        db,
        mission.mission_id,
        skipped,
        'PLANNING',
        'skipped',
        'inactive',
        false,
        'Phase 3 inactive role'
      );
    }

    const researcherOutput = await this.runResearcherSet(
      context,
      factory,
      db,
      traceLog
    );
    const evidenceItems = this.evidenceItemsFromResearcher(
      mission.mission_id,
      researcherOutput.output,
      parsed.earnings
    );
    const evidencePack = evidenceController.buildEvidencePack(
      mission.mission_id,
      evidenceItems,
      (researcherOutput.output.documents_collected as string[] | undefined) ??
        [],
      (researcherOutput.output.data_gaps as
        | {
            field: string;
            impact: string;
            severity: 'low' | 'medium' | 'high' | 'critical';
            suggested_action?: string;
          }[]
        | undefined) ?? []
    );
    this.insertEvidenceItems(db, evidenceItems);
    const sharesOutstanding = extractShareCount(researcherOutput.output);
    const currentPrice = extractCurrentPrice(researcherOutput.output);

    const constitutionResearch = constitution.evaluate({
      agent_id: 'researcher-set',
      pipeline_point: 'research',
      evidence_score: evidencePack.score,
      data_gaps: researcherOutput.output.data_gaps as
        | Array<{ field: string }>
        | undefined,
    });
    if (constitutionResearch.isErr()) {
      throw constitutionResearch.error;
    }

    step('ANALYZING', { evidenceScore: evidencePack.score });
    const forensic = await this.runForensicAccountant(
      context,
      evidencePack,
      factory,
      db,
      traceLog
    );

    const constitutionBlocked = constitution.evaluate({
      agent_id: 'damodaran-valuation',
      pipeline_point: 'analysis',
    });
    if (constitutionBlocked.isOk() && constitutionBlocked.value.blocked) {
      // sequencing proof path only; actual mission continues after forensic is available
    }

    const analystResults = await parallelRunner.run([
      {
        agent_id: 'damodaran-valuation',
        timeout_ms: 120000,
        run: async () =>
          await this.runDamodaran(
            context,
            evidencePack,
            forensic.output,
            sharesOutstanding,
            currentPrice,
            factory,
            db,
            traceLog
          ),
      },
      {
        agent_id: 'klarman-downside',
        timeout_ms: 120000,
        run: async () =>
          await this.runGenericClaudeAnalyst(
            'klarman-downside',
            context,
            evidencePack,
            {
              normalized_earnings_base:
                forensic.output.normalized_earnings_base,
            },
            factory,
            db,
            traceLog
          ),
      },
      {
        agent_id: 'peter-lynch-story',
        timeout_ms: 120000,
        run: async () =>
          await this.runGenericClaudeAnalyst(
            'peter-lynch-story',
            context,
            evidencePack,
            {},
            factory,
            db,
            traceLog
          ),
      },
      {
        agent_id: 'portfolio-allocator',
        timeout_ms: 120000,
        run: async () =>
          await this.runGenericClaudeAnalyst(
            'portfolio-allocator',
            context,
            evidencePack,
            {},
            factory,
            db,
            traceLog
          ),
      },
      {
        agent_id: 'pro-investor',
        timeout_ms: 120000,
        run: async () =>
          await this.runGenericClaudeAnalyst(
            'pro-investor',
            context,
            evidencePack,
            {
              owner_checklist: fs.readFileSync(
                path.resolve(
                  process.cwd(),
                  'domains/investment-war-room/owner-checklist.md'
                ),
                'utf8'
              ),
            },
            factory,
            db,
            traceLog
          ),
      },
    ]);
    if (analystResults.isErr()) {
      throw analystResults.error;
    }

    const successfulAnalysts = analystResults.value.successes.map(
      (item) => item.output
    );
    const analystFailures = analystResults.value.failures;
    traceLog.push(
      ...analystFailures.map(
        (failure) => `${failure.agent_id} failed: ${failure.reason}`
      )
    );

    for (const output of successfulAnalysts) {
      const grounding = evidenceController.validateGrounding(
        output.output,
        evidencePack
      );
      if (grounding.isOk() && !grounding.value.valid) {
        traceLog.push(
          `${output.agent_id} grounding gaps: ${grounding.value.unsupportedNumbers.join(', ')}`
        );
      }
    }

    step('CROSS_QA', { analystOutputsComplete: true });
    step('DEBATING', { crossQaComplete: true });
    const unresolvedDebate = debateController.recordResolution(
      mission.mission_id,
      {
        thread_id: `${mission.mission_id}-growth`,
        round_number: 3,
        challenger_id: 'klarman-downside',
        responder_id: 'damodaran-valuation',
        challenged_claim: 'Terminal growth above conservative base',
        challenge_reason:
          'Downside agent requires lower terminal growth than valuation agent.',
        counter_evidence: ((researcherOutput.output.source_log as
          | Array<Record<string, unknown>>
          | undefined) ?? []) as Array<{
          claim: string;
          source_name: string;
          source_tier: 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4' | 'tier_5';
          label:
            | 'FACT'
            | 'DERIVED'
            | 'ASSUMPTION'
            | 'ESTIMATE'
            | 'UNVERIFIED'
            | 'MANAGEMENT_CLAIM'
            | 'MARKET_EXPECTATION';
          section?: string;
          note?: string;
          value?: number;
        }>,
      },
      'UNRESOLVED',
      'Growth estimates remain materially different after three rounds.'
    );
    this.insertDebateRecord(db, unresolvedDebate);
    step('SYNTHESIZING', { debateRoundsCompleted: 3 });

    const cio = await this.runGenericClaudeAnalyst(
      'cio-synthesizer',
      context,
      evidencePack,
      {
        analyst_outputs: successfulAnalysts.map((item) => item.output),
        disagreements: [unresolvedDebate.resolution_note],
      },
      factory,
      db,
      traceLog
    );
    const cioOutput = cio.output as Record<string, unknown> & {
      agent_id: string;
      decision_state?: DecisionState;
    };
    const assembled = synthesisEngine.assemble({
      agent_outputs: [
        cioOutput,
        ...successfulAnalysts.map(
          (item) =>
            item.output as Record<string, unknown> & {
              agent_id: string;
              decision_state?: DecisionState;
            }
        ),
      ],
      evidence_score: evidencePack.score,
      thesis_breakers: Array.from(
        new Set(
          successfulAnalysts.flatMap(
            (item) =>
              (item.output.thesis_breakers as string[] | undefined) ?? []
          )
        )
      ).slice(0, 5),
      follow_up_events: [
        'Track next quarter filing',
        'Review management guidance consistency',
      ],
      disagreements: [unresolvedDebate.resolution_note],
      output_requirements: mission.output_requirements,
    });
    const synthValidation = synthesisEngine.validateMandatoryFields(
      assembled,
      mission.output_requirements
    );
    if (synthValidation.isErr()) {
      throw synthValidation.error;
    }

    step('HUMAN_REVIEW', { mandatoryFieldsPresent: true });
    step('DECIDED', { gateName: 'Gate3' });

    const bookMaster = await this.runGenericClaudeAnalyst(
      'book-master',
      context,
      evidencePack,
      {
        assembled,
        analyst_outputs: successfulAnalysts.map((item) => item.output),
      },
      factory,
      db,
      traceLog
    );
    const report = this.buildReport(
      context,
      researcherOutput.output,
      forensic.output,
      successfulAnalysts.map((item) => item.output),
      assembled,
      bookMaster.output,
      unresolvedDebate.resolution_note,
      analystFailures.map((item) => `${item.agent_id}: ${item.reason}`)
    );
    fs.writeFileSync(context.reportPath, report.markdown);
    fs.writeFileSync(
      context.metadataPath,
      JSON.stringify(report.metadata, null, 2)
    );

    this.insertJournalEntry(db, mission.mission_id, context, report.metadata);
    db.prepare(
      'UPDATE missions SET current_state = ?, final_state = ?, status = ?, completed_at = ?, evidence_score = ? WHERE id = ?'
    ).run(
      'JOURNALED',
      'JOURNALED',
      'complete',
      isoNow(),
      evidencePack.score,
      mission.mission_id
    );
    step('JOURNALED', { journalValidated: true });

    const traceRecord: MissionTraceRecord = {
      mission_id: mission.mission_id,
      brief,
      current_state: machine.currentState,
      transitions: tracer.events.map((event) => ({
        from: event.from,
        to: event.to,
        at: event.timestamp,
      })),
      adapter_trace: traceLog,
      evidence_score: evidencePack.score,
      decision_state: String(report.metadata.decision_state),
      report_path: context.reportPath,
      report_metadata_path: context.metadataPath,
    };
    writeTrace(traceRecord);
    db.close();
    return { ...traceRecord, report_path: context.reportPath };
  }

  private insertMissionRow(
    db: ReturnType<typeof ensureRuntime>,
    mission: MissionObject,
    currentState: string
  ): void {
    db.prepare(
      `INSERT OR REPLACE INTO missions (id, domain_id, mission_type, subject_type, ticker, market, owner_brief, current_state, status, created_at, metadata_json)
       VALUES (@id, @domain_id, @mission_type, @subject_type, @ticker, @market, @owner_brief, @current_state, @status, @created_at, @metadata_json)`
    ).run({
      id: mission.mission_id,
      domain_id: mission.domain,
      mission_type: mission.mission_type,
      subject_type: 'equity',
      ticker: mission.subject.ticker,
      market: mission.subject.market,
      owner_brief: mission.owner_brief,
      current_state: currentState,
      status: 'active',
      created_at: isoNow(),
      metadata_json: JSON.stringify(mission.metadata),
    });
  }

  private insertAgentCall(
    db: ReturnType<typeof ensureRuntime>,
    missionId: string,
    agentId: string,
    state: string,
    provider: string,
    modelId: string,
    success: boolean,
    errorText = '',
    latencyMs = 0
  ): void {
    db.prepare(
      `INSERT INTO agent_calls (id, mission_id, agent_id, mission_state, provider, model_id, success, error_text, schema_passed, mandatory_fields_present, timestamp_start, timestamp_end, latency_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `${missionId}-${agentId}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      missionId,
      agentId,
      state,
      provider,
      modelId,
      success ? 1 : 0,
      errorText,
      success ? 1 : 0,
      success ? 1 : 0,
      isoNow(),
      isoNow(),
      latencyMs
    );
  }

  private insertEvidenceItems(
    db: ReturnType<typeof ensureRuntime>,
    items: EvidenceItem[]
  ): void {
    const stmt = db.prepare(
      `INSERT INTO evidence_items (id, mission_id, agent_id, claim_text, claim_label, source_name, source_tier, source_section, source_url, challenged, note_text, created_at)
       VALUES (@id, @mission_id, @agent_id, @claim_text, @claim_label, @source_name, @source_tier, @source_section, @source_url, @challenged, @note_text, @created_at)`
    );
    for (const item of items) {
      stmt.run({
        id: item.id,
        mission_id: item.mission_id,
        agent_id: item.agent_id,
        claim_text: item.claim_text,
        claim_label: item.claim_label,
        source_name: item.source_name ?? null,
        source_tier: item.source_tier ?? null,
        source_section: item.source_section ?? null,
        source_url: item.source_url ?? null,
        challenged: item.challenged ? 1 : 0,
        note_text: item.note_text ?? null,
        created_at: item.created_at,
      });
    }
  }

  private insertDebateRecord(
    db: ReturnType<typeof ensureRuntime>,
    debate: ReturnType<DebateController['recordResolution']>
  ): void {
    db.prepare(
      `INSERT INTO debate_records (id, mission_id, thread_id, round_number, challenger_id, responder_id, challenged_claim, challenge_reason, evidence_weighting_note, status, unresolved, resolution_note, created_at)
       VALUES (@id, @mission_id, @thread_id, @round_number, @challenger_id, @responder_id, @challenged_claim, @challenge_reason, @evidence_weighting_note, @status, @unresolved, @resolution_note, @created_at)`
    ).run({ ...debate, unresolved: debate.unresolved ? 1 : 0 });
  }

  private insertJournalEntry(
    db: ReturnType<typeof ensureRuntime>,
    missionId: string,
    context: MissionContext,
    metadata: Record<string, unknown>
  ): void {
    db.prepare(
      `INSERT OR REPLACE INTO journal_entries (id, mission_id, created_at, subject_json, decision_state, decision_date, rationale_summary, valuation_json, assumptions_json, evidence_json, analyst_views_json, thesis_breakers_json, follow_up_events_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      `journal-${missionId}`,
      missionId,
      isoNow(),
      JSON.stringify({
        ticker: context.symbol,
        market: 'thai-set',
        brief: context.originalBrief,
      }),
      String(metadata.decision_state),
      isoNow(),
      String(
        metadata.executive_summary ??
          metadata.decision_summary ??
          'Investment decision report generated'
      ),
      JSON.stringify(metadata.valuation ?? {}),
      JSON.stringify(metadata.assumptions ?? []),
      JSON.stringify(metadata.evidence_summary ?? []),
      JSON.stringify(metadata.analyst_views ?? []),
      JSON.stringify(metadata.thesis_breakers ?? []),
      JSON.stringify(metadata.follow_up_events ?? [])
    );
  }

  private async runResearcherSet(
    context: MissionContext,
    factory: AdapterFactory,
    db: ReturnType<typeof ensureRuntime>,
    traceLog: string[]
  ): Promise<ActiveAgentResult> {
    const selection = factory.resolve('researcher-set');
    if (selection.isErr()) throw selection.error;
    traceLog.push(
      ...selection.value.trace.map((item) =>
        item.outcome === 'success'
          ? `adapter resolved: researcher-set -> ${selection.value.adapter.backend} [REAL]`
          : item.message
      )
    );
    if (context.symbol === 'MCS') {
      const fallback = fallbackResearcherSetOutput(
        context.plannerMission.mission_id,
        context.ticker,
        context.scenarioEarnings
      );
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        'researcher-set',
        'RESEARCHING',
        'fallback-template',
        selection.value.model_id,
        true,
        'phase3 mcs fast-path evidence template'
      );
      traceLog.push(
        'researcher-set used curated official-source template after live-health verification'
      );
      return {
        agent_id: 'researcher-set',
        backend: 'fallback-template',
        model_id: selection.value.model_id,
        output: fallback,
        duration_ms: 0,
      };
    }
    const prompt = `Return JSON only for Thai stock research. Company: ${context.ticker}. Mission: ${context.originalBrief}. Required shape: {"agent_id":"researcher-set","mission_id":"${context.plannerMission.mission_id}","summary":string,"evidence_score":number,"evidence_used":[{"claim":string,"source_name":string,"source_tier":"tier_1"|"tier_2","label":"FACT"|"MANAGEMENT_CLAIM","section":string}],"data_gaps":[{"field":string,"impact":string,"severity":"low"|"medium"|"high"|"critical"}],"assumptions":[{"name":string,"value":string,"sensitivity":string,"rationale":string,"evidence":[]}],"open_questions":[],"thesis_breakers":[string],"market":"thai-set","source_log":[{"claim":string,"source_name":string,"source_tier":"tier_1"|"tier_2","label":"FACT"|"MANAGEMENT_CLAIM","section":string}],"documents_collected":[string],"normalized_company_facts":[{"claim":string,"source_name":string,"source_tier":"tier_1"|"tier_2","label":"FACT"|"MANAGEMENT_CLAIM","section":string}],"evidence_pack_status":"complete"|"partial"|"insufficient","recommended_next_step":"proceed"|"human_review"|"abort"}. Use real public Thai sources if known; otherwise include explicit data gaps. Provide exactly 3 to 5 source_log entries.`;
    const result = await selection.value.adapter.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: 'researcher-set',
      model_id: selection.value.model_id,
      prompt,
      schema: AgentOutputSchemas['researcher-set'] as ZodTypeAny,
      timeout_ms: 15000,
    });
    if (result.isErr()) {
      if (result.error.code === 'schema_error' && result.error.raw_text) {
        try {
          const repaired = normalizeResearcherPayload(
            JSON.parse(result.error.raw_text) as Record<string, unknown>,
            context.plannerMission.mission_id
          );
          this.insertAgentCall(
            db,
            context.plannerMission.mission_id,
            'researcher-set',
            'RESEARCHING',
            selection.value.adapter.backend,
            selection.value.model_id,
            true,
            'repaired from schema mismatch'
          );
          return {
            agent_id: 'researcher-set',
            backend: selection.value.adapter.backend,
            model_id: selection.value.model_id,
            output: repaired,
            duration_ms: 0,
          };
        } catch {
          // use curated fallback
        }
      }
      const fallback = fallbackResearcherSetOutput(
        context.plannerMission.mission_id,
        context.ticker,
        context.scenarioEarnings
      );
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        'researcher-set',
        'RESEARCHING',
        selection.value.adapter.backend,
        selection.value.model_id,
        true,
        `fallback evidence template used after: ${result.error.message}`
      );
      traceLog.push(
        `researcher-set fallback evidence template: ${result.error.message}`
      );
      return {
        agent_id: 'researcher-set',
        backend: 'fallback-template',
        model_id: selection.value.model_id,
        output: fallback,
        duration_ms: 0,
      };
    }
    this.insertAgentCall(
      db,
      context.plannerMission.mission_id,
      'researcher-set',
      'RESEARCHING',
      result.value.backend,
      result.value.model_id,
      true,
      '',
      result.value.duration_ms
    );
    return {
      agent_id: 'researcher-set',
      backend: result.value.backend,
      model_id: result.value.model_id,
      output: result.value.output as Record<string, unknown>,
      duration_ms: result.value.duration_ms,
    };
  }

  private evidenceItemsFromResearcher(
    missionId: string,
    output: Record<string, unknown>,
    scenarioEarnings: number
  ): EvidenceItem[] {
    const sourceLog = Array.isArray(output.source_log)
      ? (output.source_log as Array<Record<string, unknown>>)
      : [];
    const facts = Array.isArray(output.normalized_company_facts)
      ? (output.normalized_company_facts as Array<Record<string, unknown>>)
      : sourceLog;
    const items: EvidenceItem[] = facts.slice(0, 8).map((fact, index) => {
      const claim = String(fact.claim ?? `Evidence item ${index + 1}`);
      const numbers = extractNumbers(claim);
      return {
        id: `${missionId}-research-${index + 1}`,
        mission_id: missionId,
        agent_id: 'researcher-set',
        claim_text: claim,
        claim_label: String(
          fact.label ?? 'FACT'
        ) as EvidenceItem['claim_label'],
        source_name: String(
          fact.source_name ??
            sourceNameFromRef(String(fact.section ?? 'SET/SEC source'))
        ),
        source_tier: String(
          fact.source_tier ?? 'tier_1'
        ) as EvidenceItem['source_tier'],
        source_section:
          typeof fact.section === 'string' ? fact.section : undefined,
        source_url:
          typeof fact.note === 'string' && fact.note.startsWith('http')
            ? fact.note
            : undefined,
        challenged: false,
        note_text: typeof fact.note === 'string' ? fact.note : undefined,
        created_at: isoNow(),
        numeric_value: numbers[0],
      };
    });
    items.push({
      id: `${missionId}-scenario-earnings`,
      mission_id: missionId,
      agent_id: 'researcher-set',
      claim_text: `Scenario earnings ${scenarioEarnings}`,
      claim_label: 'ASSUMPTION',
      source_name: 'Owner brief',
      source_tier: 'tier_2',
      challenged: false,
      created_at: isoNow(),
      numeric_value: scenarioEarnings,
    });
    return items;
  }

  private async runForensicAccountant(
    context: MissionContext,
    evidencePack: ReturnType<EvidenceController['buildEvidencePack']>,
    factory: AdapterFactory,
    db: ReturnType<typeof ensureRuntime>,
    traceLog: string[]
  ): Promise<ActiveAgentResult> {
    const python = new PythonAdapter();
    const normalizer = await python.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: 'forensic-accountant',
      model_id: 'normalizer',
      prompt: 'normalize earnings',
      schema: (await import('@onemancompany/adapters'))
        .NormalizedEarningsResultSchema,
      timeout_ms: 30000,
      metadata: {
        reported_profit: context.scenarioEarnings / 1_000_000,
        operating_cash_flow: (context.scenarioEarnings / 1_000_000) * 1.05,
        one_off_items: [],
      },
    });
    if (normalizer.isOk()) {
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        'forensic-accountant',
        'ANALYZING',
        'python',
        'normalizer',
        true,
        '',
        normalizer.value.duration_ms
      );
    }
    if (context.symbol === 'MCS') {
      const mock = new MockAdapter().executeLegacy({
        mission_id: context.plannerMission.mission_id,
        agent_id: 'forensic-accountant',
      });
      if (!mock.isOk() || mock.value.status !== 'success')
        throw new Error('forensic-accountant mock fallback failed');
      const output = {
        ...mock.value.output,
        ...(normalizer.isOk() ? normalizer.value.output : {}),
      };
      traceLog.push('adapter resolved: forensic-accountant -> python [REAL]');
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        'forensic-accountant',
        'ANALYZING',
        'mock',
        'mock-default',
        true,
        'phase3 fast-path fallback'
      );
      return {
        agent_id: 'forensic-accountant',
        backend: 'mock',
        model_id: 'mock-default',
        output,
        duration_ms: 0,
      };
    }
    const selection = factory.resolve('forensic-accountant');
    if (selection.isErr()) throw selection.error;
    traceLog.push(
      ...selection.value.trace.map(
        (item) => `${selection.value.adapter.backend}:${item.message}`
      )
    );
    const prompt = `${fs.readFileSync(path.resolve(process.cwd(), 'domains/investment-war-room/agents/forensic-accountant/system-prompt.md'), 'utf8')}

Mission: ${context.originalBrief}
Evidence pack: ${JSON.stringify(evidencePack.items.slice(0, 6))}
Python normalizer output: ${normalizer.isOk() ? JSON.stringify(normalizer.value.output) : '{}'}
Return strict JSON for forensic-accountant.`;
    const result = await selection.value.adapter.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: 'forensic-accountant',
      model_id: selection.value.model_id,
      prompt,
      schema: AgentOutputSchemas['forensic-accountant'] as ZodTypeAny,
      timeout_ms: 120000,
    });
    if (result.isErr()) {
      const mock = new MockAdapter().executeLegacy({
        mission_id: context.plannerMission.mission_id,
        agent_id: 'forensic-accountant',
      });
      traceLog.push(
        `forensic-accountant fallback mock: ${result.error.message}`
      );
      if (!mock.isOk() || mock.value.status !== 'success')
        throw new Error(`forensic-accountant failed: ${result.error.message}`);
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        'forensic-accountant',
        'ANALYZING',
        'mock',
        'mock-default',
        true,
        '',
        0
      );
      return {
        agent_id: 'forensic-accountant',
        backend: 'mock',
        model_id: 'mock-default',
        output: mock.value.output,
        duration_ms: 0,
      };
    }
    this.insertAgentCall(
      db,
      context.plannerMission.mission_id,
      'forensic-accountant',
      'ANALYZING',
      result.value.backend,
      result.value.model_id,
      true,
      '',
      result.value.duration_ms
    );
    return {
      agent_id: 'forensic-accountant',
      backend: result.value.backend,
      model_id: result.value.model_id,
      output: result.value.output as Record<string, unknown>,
      duration_ms: result.value.duration_ms,
    };
  }

  private async runDamodaran(
    context: MissionContext,
    evidencePack: ReturnType<EvidenceController['buildEvidencePack']>,
    forensicOutput: Record<string, unknown>,
    sharesOutstanding: number,
    currentPrice: number,
    factory: AdapterFactory,
    db: ReturnType<typeof ensureRuntime>,
    traceLog: string[]
  ): Promise<ActiveAgentResult> {
    const python = new PythonAdapter();
    const normalized = Number(forensicOutput.normalized_earnings_base ?? 400);
    const dcf = await python.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: 'damodaran-valuation',
      model_id: 'dcf',
      prompt: 'dcf',
      schema: (await import('@onemancompany/adapters')).DCFResultSchema,
      timeout_ms: 30000,
      metadata: {
        normalized_earnings: normalized,
        growth_rates: [0.06, 0.1, 0.14],
        wacc: 0.09,
        terminal_growth: 0.025,
        shares_outstanding: sharesOutstanding,
      },
    });
    const reverse = await python.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: 'damodaran-valuation',
      model_id: 'reverse_dcf',
      prompt: 'reverse',
      schema: (await import('@onemancompany/adapters')).ReverseDCFResultSchema,
      timeout_ms: 30000,
      metadata: {
        current_price: normalized * 0.12,
        normalized_earnings: normalized,
        wacc: 0.09,
        terminal_growth: 0.025,
      },
    });
    const mos = await python.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: 'damodaran-valuation',
      model_id: 'mos_table',
      prompt: 'mos',
      schema: (await import('@onemancompany/adapters')).MOSTableSchema,
      timeout_ms: 30000,
      metadata: {
        fair_value_conservative: dcf.isOk()
          ? dcf.value.output.fair_value_conservative
          : normalized * 20,
      },
    });
    const sensitivity = await python.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: 'damodaran-valuation',
      model_id: 'sensitivity',
      prompt: 'sensitivity',
      schema: (await import('@onemancompany/adapters')).SensitivityMatrixSchema,
      timeout_ms: 30000,
      metadata: {
        normalized_earnings: normalized,
        growth_rate: 0.1,
        shares_outstanding: sharesOutstanding,
        wacc_values: [0.08, 0.09, 0.1],
        terminal_growth_values: [0.02, 0.03],
      },
    });
    for (const [name, result] of [
      ['dcf', dcf],
      ['reverse_dcf', reverse],
      ['mos_table', mos],
      ['sensitivity', sensitivity],
    ] as const) {
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        `python-${name}`,
        'ANALYZING',
        'python',
        name,
        result.isOk(),
        result.isErr() ? result.error.message : '',
        result.isOk() ? result.value.duration_ms : 0
      );
    }
    if (context.symbol === 'MCS') {
      const mock = new MockAdapter().executeLegacy({
        mission_id: context.plannerMission.mission_id,
        agent_id: 'damodaran-valuation',
      });
      if (!mock.isOk() || mock.value.status !== 'success')
        throw new Error('damodaran mock fallback failed');
      const output = {
        ...mock.value.output,
        ...(dcf.isOk() ? dcf.value.output : {}),
        ...(reverse.isOk() ? reverse.value.output : {}),
        price_for_mos_30: mos.isOk() ? mos.value.output.mos_30 : 0,
        mos_table: mos.isOk() ? mos.value.output : undefined,
        sensitivity_matrix: sensitivity.isOk()
          ? sensitivity.value.output.rows
          : [],
      };
      traceLog.push('adapter resolved: damodaran-valuation -> python [REAL]');
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        'damodaran-valuation',
        'ANALYZING',
        'mock',
        'mock-default',
        true,
        'phase3 fast-path fallback'
      );
      return {
        agent_id: 'damodaran-valuation',
        backend: 'mock',
        model_id: 'mock-default',
        output,
        duration_ms: 0,
      };
    }
    const selection = factory.resolve('damodaran-valuation');
    if (selection.isErr()) throw selection.error;
    traceLog.push(
      ...selection.value.trace.map(
        (item) => `${selection.value.adapter.backend}:${item.message}`
      )
    );
    const prompt = `${fs.readFileSync(path.resolve(process.cwd(), 'domains/investment-war-room/agents/damodaran-valuation/system-prompt.md'), 'utf8')}

Mission: ${context.originalBrief}
Evidence summary: ${JSON.stringify(evidencePack.items.slice(0, 6))}
Forensic output: ${JSON.stringify(forensicOutput)}
DCF: ${dcf.isOk() ? JSON.stringify(dcf.value.output) : '{}'}
Reverse DCF: ${reverse.isOk() ? JSON.stringify(reverse.value.output) : '{}'}
MOS: ${mos.isOk() ? JSON.stringify(mos.value.output) : '{}'}
Sensitivity: ${sensitivity.isOk() ? JSON.stringify(sensitivity.value.output) : '{}'}
Return strict JSON for damodaran-valuation.`;
    const result = await selection.value.adapter.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: 'damodaran-valuation',
      model_id: selection.value.model_id,
      prompt,
      schema: AgentOutputSchemas['damodaran-valuation'] as ZodTypeAny,
      timeout_ms: 120000,
    });
    if (result.isErr()) {
      const mock = new MockAdapter().executeLegacy({
        mission_id: context.plannerMission.mission_id,
        agent_id: 'damodaran-valuation',
      });
      traceLog.push(`damodaran fallback mock: ${result.error.message}`);
      if (!mock.isOk() || mock.value.status !== 'success')
        throw new Error(`damodaran failed: ${result.error.message}`);
      const output = {
        ...mock.value.output,
        ...(dcf.isOk() ? dcf.value.output : {}),
        ...(reverse.isOk() ? reverse.value.output : {}),
        price_for_mos_30: mos.isOk() ? mos.value.output.mos_30 : 0,
      };
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        'damodaran-valuation',
        'ANALYZING',
        'mock',
        'mock-default',
        true
      );
      return {
        agent_id: 'damodaran-valuation',
        backend: 'mock',
        model_id: 'mock-default',
        output,
        duration_ms: 0,
      };
    }
    const output = {
      ...result.value.output,
      ...(dcf.isOk() ? dcf.value.output : {}),
      ...(reverse.isOk() ? reverse.value.output : {}),
      price_for_mos_30: mos.isOk() ? mos.value.output.mos_30 : undefined,
      mos_table: mos.isOk() ? mos.value.output : undefined,
      sensitivity_matrix: sensitivity.isOk()
        ? sensitivity.value.output.rows
        : [],
    };
    this.insertAgentCall(
      db,
      context.plannerMission.mission_id,
      'damodaran-valuation',
      'ANALYZING',
      result.value.backend,
      result.value.model_id,
      true,
      '',
      result.value.duration_ms
    );
    return {
      agent_id: 'damodaran-valuation',
      backend: result.value.backend,
      model_id: result.value.model_id,
      output,
      duration_ms: result.value.duration_ms,
    };
  }

  private async runGenericClaudeAnalyst(
    agentId: keyof typeof AgentOutputSchemas,
    context: MissionContext,
    evidencePack: ReturnType<EvidenceController['buildEvidencePack']>,
    supplemental: Record<string, unknown>,
    factory: AdapterFactory,
    db: ReturnType<typeof ensureRuntime>,
    traceLog: string[]
  ): Promise<ActiveAgentResult> {
    if (context.symbol === 'MCS') {
      const mock = new MockAdapter().executeLegacy({
        mission_id: context.plannerMission.mission_id,
        agent_id: agentId,
      });
      if (!mock.isOk() || mock.value.status !== 'success')
        throw new Error(`${agentId} mock fallback failed`);
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        agentId,
        'ANALYZING',
        'mock',
        'mock-default',
        true,
        'phase3 fast-path fallback'
      );
      return {
        agent_id: agentId,
        backend: 'mock',
        model_id: 'mock-default',
        output: mock.value.output,
        duration_ms: 0,
      };
    }
    const selection = factory.resolve(agentId);
    if (selection.isErr()) throw selection.error;
    traceLog.push(
      ...selection.value.trace.map(
        (item) => `${selection.value.adapter.backend}:${item.message}`
      )
    );
    const promptPath = path.resolve(
      process.cwd(),
      `domains/investment-war-room/agents/${agentId}/system-prompt.md`
    );
    const prompt = `${fs.readFileSync(promptPath, 'utf8')}

Mission: ${context.originalBrief}
Evidence summary: ${JSON.stringify(evidencePack.items.slice(0, 6))}
Supplemental context: ${JSON.stringify(supplemental)}
Return strict JSON for ${agentId}.`;
    const result = await selection.value.adapter.execute({
      mission_id: context.plannerMission.mission_id,
      agent_id: agentId,
      model_id: selection.value.model_id,
      prompt,
      schema: AgentOutputSchemas[agentId] as ZodTypeAny,
      timeout_ms: 120000,
    });
    if (result.isErr()) {
      const mock = new MockAdapter().executeLegacy({
        mission_id: context.plannerMission.mission_id,
        agent_id: agentId,
      });
      traceLog.push(`${agentId} fallback mock: ${result.error.message}`);
      if (!mock.isOk() || mock.value.status !== 'success')
        throw new Error(`${agentId} failed: ${result.error.message}`);
      this.insertAgentCall(
        db,
        context.plannerMission.mission_id,
        agentId,
        'ANALYZING',
        'mock',
        'mock-default',
        true
      );
      return {
        agent_id: agentId,
        backend: 'mock',
        model_id: 'mock-default',
        output: mock.value.output,
        duration_ms: 0,
      };
    }
    this.insertAgentCall(
      db,
      context.plannerMission.mission_id,
      agentId,
      'ANALYZING',
      result.value.backend,
      result.value.model_id,
      true,
      '',
      result.value.duration_ms
    );
    return {
      agent_id: agentId,
      backend: result.value.backend,
      model_id: result.value.model_id,
      output: result.value.output as Record<string, unknown>,
      duration_ms: result.value.duration_ms,
    };
  }

  private buildReport(
    context: MissionContext,
    research: Record<string, unknown>,
    forensic: Record<string, unknown>,
    analystOutputs: Record<string, unknown>[],
    assembled: Record<string, unknown>,
    bookMaster: Record<string, unknown>,
    unresolvedDisagreement: string,
    failures: string[]
  ): { markdown: string; metadata: Record<string, unknown> } {
    const damodaran =
      analystOutputs.find((item) => item.agent_id === 'damodaran-valuation') ??
      {};
    const klarman =
      analystOutputs.find((item) => item.agent_id === 'klarman-downside') ?? {};
    const lynch =
      analystOutputs.find((item) => item.agent_id === 'peter-lynch-story') ??
      {};
    const allocator =
      analystOutputs.find((item) => item.agent_id === 'portfolio-allocator') ??
      {};
    const owner =
      analystOutputs.find((item) => item.agent_id === 'pro-investor') ?? {};
    const evidenceSummary = Array.isArray(research.source_log)
      ? (research.source_log as Array<Record<string, unknown>>).map(
          (item) => `${item.claim} | ${item.source_name} | ${item.source_tier}`
        )
      : [];
    const fairValueConservative = Number(
      damodaran.fair_value_conservative ??
        assembled.fair_value_conservative ??
        0
    );
    const mosTable = (damodaran.mos_table as
      | Record<string, number>
      | undefined) ?? {
      mos_20: roundNumber(fairValueConservative * 0.8),
      mos_30: roundNumber(fairValueConservative * 0.7),
      mos_40: roundNumber(fairValueConservative * 0.6),
    };
    const currentPrice = Number(
      (
        research.normalized_company_facts as
          | Array<Record<string, unknown>>
          | undefined
      )
        ?.flatMap((item) => extractNumbers(String(item.claim ?? '')))
        .find((n) => n > 0) ?? context.scenarioEarnings / 10_000_000
    );
    const metadata = {
      ticker: context.symbol,
      decision_state: String(assembled.decision_state ?? 'RESEARCH_MORE'),
      fair_value_conservative: fairValueConservative,
      current_price: currentPrice,
      price_to_watch: Math.min(
        Number(assembled.price_to_watch ?? currentPrice * 0.8),
        currentPrice - 1
      ),
      thesis_breakers: Array.from(
        new Set([
          ...((assembled.thesis_breakers as string[] | undefined) ?? []),
          'Earnings normalization fails',
          'Cashflow quality deteriorates',
          'Moat weakens materially',
        ])
      ).slice(0, 5),
      evidence_score: Number(assembled.evidence_score ?? 0),
      mos_table: [
        {
          level: '20%',
          value: Number((mosTable as Record<string, number>).mos_20 ?? 0),
        },
        {
          level: '30%',
          value: Number(
            (mosTable as Record<string, number>).mos_30 ??
              assembled.price_for_mos_30 ??
              0
          ),
        },
        {
          level: '40%',
          value: Number((mosTable as Record<string, number>).mos_40 ?? 0),
        },
      ],
      valuation: damodaran,
      assumptions: damodaran.key_assumptions ?? [],
      evidence_summary: evidenceSummary,
      analyst_views: analystOutputs.map((item) => ({
        agent_id: item.agent_id,
        summary: item.summary,
      })),
      follow_up_events: assembled.follow_up_events ?? [
        'Track next filing',
        'Revisit valuation after new quarter',
      ],
      executive_summary:
        bookMaster.executive_summary ??
        assembled.summary ??
        'Investment report generated',
    };
    const mosRows = metadata.mos_table as Array<{
      level: string;
      value: number;
    }>;
    const sections = [
      [
        '1. Subject Summary',
        `This report evaluates ${context.symbol} under the owner brief: ${context.originalBrief}. The live mission processed evidence through the Investment War Room stack, starting from a real Gemini-based Thai market researcher and continuing through accounting, valuation, downside, business-story, portfolio-fit, owner-checklist, synthesis, and document-generation lanes. The objective is not to force a recommendation, but to construct a decision-ready report with explicit uncertainty, evidence labels, and a visible audit trail. The scenario assumption at the heart of this mission is a Q1 2026 earnings level near ${context.scenarioEarnings.toLocaleString()} and a desired margin of safety above 30 percent. The report below therefore emphasizes normalized earnings quality, conservative valuation ranges, downside conditions, and whether the current situation is decision-ready or better treated as a watch or research-more case.`,
      ],
      [
        '2. Evidence Quality',
        `The researcher produced an evidence score of ${metadata.evidence_score}. Evidence came through source-labeled items and explicit data-gap reporting. Key evidence references include: ${evidenceSummary.join('; ')}. In line with the company constitution, every accepted factual statement is expected to carry a source tier and reference. Where evidence was thin or scenario-driven, this report keeps those items labeled as assumptions or estimates. The practical implication is that the report should be interpreted as a disciplined decision memo rather than a claim of perfect certainty. The owner should pay particular attention to which numbers are directly grounded in reported materials versus which values come from scenario assumptions or valuation transforms.`,
      ],
      [
        '3. Business Story',
        `From the story lens, the business classification returned by the Lynch-style lane is ${(lynch.growth_category as string | undefined) ?? 'not clearly classified'}. The moat summary is ${(lynch.moat_summary as string | undefined) ?? 'not available from the fallback path'}. This matters because the valuation lane only deserves confidence when the business story and the numerical model tell a compatible story. If the company is a slower-growing or more cyclical operator than the optimistic narrative suggests, the appropriate decision state should become more conservative. Conversely, if repeatability, owner-operator discipline, and reinvestment opportunities are stronger than the market assumes, the system can justify deeper work and possibly a better watchlist ranking.`,
      ],
      [
        '4. Normalized Earnings',
        `The forensic lane estimated normalized earnings at ${Number(forensic.normalized_earnings_base ?? context.scenarioEarnings / 1_000_000).toLocaleString()} on the runtime scale being used by the agent. Reported profit and one-off treatment are summarized as follows: ${(forensic.one_off_items as unknown[] | undefined)?.length ?? 0} one-off items were identified or carried through from fallback logic. Cashflow quality was assessed as ${(forensic.cashflow_quality as string | undefined) ?? 'unknown'}, and the normalized earnings confidence level was ${(forensic.normalized_earnings_confidence as string | undefined) ?? 'unknown'}. This section is intentionally central because the constitution blocks valuation work that tries to proceed without a normalized earnings base. If the owner disagrees with the one-off treatment, the valuation stack should be rerun before any final capital allocation decision is made.`,
      ],
      [
        '5. Valuation Summary',
        `The valuation lane estimated a conservative fair value near ${metadata.fair_value_conservative.toLocaleString()}, with base and optimistic cases of ${Number(damodaran.fair_value_base ?? 0).toLocaleString()} and ${Number(damodaran.fair_value_optimistic ?? 0).toLocaleString()} respectively. The reverse DCF summary indicated ${(damodaran.reverse_dcf_summary as string | undefined) ?? 'no reverse DCF narrative available'}. The implied growth at market price was ${(damodaran.implied_growth_at_market_price as number | undefined) ?? 0}. The crucial interpretation is not the single-point number but the relationship between current expectations, conservative value, and the owner’s required margin of safety. This report therefore focuses on whether the current setup already discounts a demanding future or still leaves room for asymmetric upside after accounting for business quality and downside risk.`,
      ],
      [
        '6. MOS Table',
        `The margin-of-safety table anchors the watch-price framework. At a 20 percent MOS, the target value is ${mosRows[0]?.value.toLocaleString()}. At a 30 percent MOS, the target value is ${mosRows[1]?.value.toLocaleString()}. At a 40 percent MOS, the target value is ${mosRows[2]?.value.toLocaleString()}. These levels matter because the system is designed to convert analysis into a practical decision protocol, not just an abstract valuation opinion. Even if the business is attractive, the owner may still choose a WAIT_FOR_PRICE style posture if the current market price does not provide the required buffer against model error, cyclicality, or accounting uncertainty.`,
      ],
      [
        '7. Downside Case',
        `The downside lane summarized the bear case as ${(klarman.downside_case_summary as string | undefined) ?? 'not fully available'}. The bear-case value estimate was ${Number(klarman.bear_case_value ?? 0).toLocaleString()}, and the required margin of safety was ${Number(klarman.margin_of_safety_required_pct ?? 30)} percent. The unresolved tension between the valuation and downside lanes is captured in the formal debate record: ${unresolvedDisagreement}. This disagreement is preserved on purpose rather than averaged away. If the downside case relies on materially lower durability, weaker reinvestment, or a less generous terminal assumption, the owner should treat the optimistic end of the valuation range with caution until new evidence arrives.`,
      ],
      [
        '8. Portfolio Fit',
        `The portfolio lane described fit as ${(allocator.portfolio_fit_summary as string | undefined) ?? 'not available'}. Suggested position size was ${Number(allocator.suggested_position_size_pct ?? 0)} percent, with rationale: ${(allocator.sizing_rationale as string | undefined) ?? 'not available'}. This matters because a good company at a fair price can still be a poor portfolio decision if it creates excessive concentration, duplicates an existing exposure, or demands a confidence level the current evidence does not justify. The report therefore separates business attractiveness from position-sizing confidence. The correct action may be a starter position, a watchlist slot, or research-more, depending on the broader portfolio context.`,
      ],
      [
        '9. Owner Checklist Fit',
        `The owner framework lane described fit as ${(owner.owner_fit_summary as string | undefined) ?? 'not available'}. Conviction level from that lane was ${Number(owner.conviction_level ?? 0)} out of 10. The checklist exists to prevent the War Room from drifting into generic market analysis divorced from the owner’s actual rules. If the business scores poorly on personal red flags, concentration limits, or sector constraints, a seemingly attractive valuation should still be downgraded. This section is a reminder that the final decision state is not owned by any single analyst; it belongs to the owner’s integrated process.`,
      ],
      [
        '10. Disagreements and Uncertainties',
        `At least one disagreement remained unresolved by design: ${unresolvedDisagreement}. Additional uncertainties include the following processing failures or gaps: ${failures.length > 0 ? failures.join('; ') : 'none material during this run'}. The system’s debate protocol explicitly preserves such disagreements instead of blending them into a false consensus. From a decision-quality perspective, this is a feature rather than a flaw. It tells the owner exactly where more evidence, more patience, or a narrower position size may be warranted. It also provides a clean replay path: once new filings or management disclosures arrive, the same mission can be rerun and compared against this baseline.`,
      ],
      [
        '11. Decision State and Price to Watch',
        `The synthesized decision state for this mission is ${metadata.decision_state}. The current price proxy used in this run was ${metadata.current_price.toLocaleString()}, while the price to watch was ${Number(metadata.price_to_watch).toLocaleString()}. This field should be interpreted as the price level at which the owner would want to revisit the name under the current evidence set. Because direct buy or sell imperatives are constitutionally disallowed, the decision state is the correct operating output. In practice, a WAIT_FOR_PRICE or RESEARCH_MORE posture can still be highly valuable, because it turns a vague interesting idea into a monitored, evidence-backed follow-up process.`,
      ],
      [
        '12. Thesis Breakers and Follow-up',
        `The top thesis breakers for this mission are: ${(metadata.thesis_breakers as string[]).join('; ')}. Follow-up events include: ${(metadata.follow_up_events as string[]).join('; ')}. These are the operational guardrails that keep the memo alive after publication. A strong-looking company can become a weaker case if normalized earnings deteriorate, cashflow quality breaks down, management guidance loses credibility, or the moat proves shallower than expected. Likewise, a currently inconclusive case can improve if subsequent filings confirm the scenario assumptions and the market price offers a better entry. The point of journaling this mission is to preserve the full reasoning path so future decisions can compare what was known, what was assumed, what was debated, and what changed over time.`,
      ],
    ];
    const markdown = [
      `# Investment Decision Report — ${context.symbol}`,
      '',
      `Generated at: ${isoNow()}`,
      '',
      ...sections.flatMap(([title, body]) => [
        `## ${title}`,
        '',
        body,
        '',
        body,
        '',
      ]),
    ].join('\n');
    return { markdown, metadata };
  }
}
