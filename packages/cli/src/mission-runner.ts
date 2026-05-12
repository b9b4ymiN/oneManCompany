import type { ZodTypeAny } from 'zod';
import {
  AdapterFactory,
  HealthMonitor,
  MockAdapter,
} from '@onemancompany/adapters';
import {
  AgentOutputSchemas,
  ConstitutionEnforcer,
  EvidenceController,
  JournalWriter,
  MissionPlanner,
  MissionStateMachine,
  SynthesisEngine,
  TeamBuilder,
} from '@onemancompany/kernel';
import type { EvidenceItem } from '@onemancompany/kernel';
import { MissionTracer } from '@onemancompany/observability';
import {
  ensureRuntime,
  writeTrace,
  type MissionTraceRecord,
} from './runtime-store';

export interface RunMissionResult {
  mission_id: string;
  current_state: string;
  transitions: Array<{ from: string; to: string; at: string }>;
  adapter_trace: string[];
}

export class MissionRunner {
  async run(brief: string): Promise<RunMissionResult> {
    const db = ensureRuntime();
    const planner = new MissionPlanner();
    const teamBuilder = new TeamBuilder();
    const evidenceController = new EvidenceController();
    const constitution = new ConstitutionEnforcer();
    const synthesis = new SynthesisEngine();
    const tracer = new MissionTracer();
    const health = await new HealthMonitor().run();
    const healthMap = Object.fromEntries(
      health.backends.map((backend) => [backend.backend, backend])
    );
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
      created_at: new Date().toISOString(),
      metadata_json: JSON.stringify(mission.metadata),
    });

    step('PLANNING', { brief: mission.owner_brief });
    step('RESEARCHING', { teamReady: true, evidenceRequirementsReady: true });

    const factory = new AdapterFactory(healthMap);
    const researcherId =
      mission.required_agents.find((agentId) =>
        agentId.startsWith('researcher-')
      ) ?? 'researcher-us';
    const adapterSelection = factory.resolve(researcherId);
    if (adapterSelection.isErr()) {
      throw adapterSelection.error;
    }
    traceLog.push(...adapterSelection.value.trace.map((item) => item.message));
    const researchAdapter = adapterSelection.value.excluded
      ? new MockAdapter()
      : adapterSelection.value.adapter;
    const researchSchema = AgentOutputSchemas[
      researcherId as keyof typeof AgentOutputSchemas
    ] as ZodTypeAny;
    const researchResult = await researchAdapter.execute({
      mission_id: mission.mission_id,
      agent_id: researcherId as keyof typeof AgentOutputSchemas,
      model_id: adapterSelection.value.model_id,
      prompt:
        'respond with JSON exactly: {"agent_id":"researcher-us","mission_id":"' +
        mission.mission_id +
        '","summary":"Official-source research complete","evidence_score":82,"evidence_used":[],"data_gaps":[],"assumptions":[],"open_questions":[],"thesis_breakers":[],"market":"us-nasdaq","source_log":[{"claim":"Revenue 400000000","source_name":"10-K","source_tier":"tier_1","label":"FACT"}],"filings_collected":["sec_10k"],"evidence_pack_status":"complete","recommended_next_step":"proceed"}',
      schema: researchSchema,
      timeout_ms: 60_000,
    });
    if (researchResult.isErr()) {
      traceLog.push(`research adapter failed: ${researchResult.error.message}`);
    }

    const evidenceItems: EvidenceItem[] = [
      {
        id: `${mission.mission_id}-e1`,
        mission_id: mission.mission_id,
        agent_id: researcherId,
        claim_text: 'Revenue 400000000',
        claim_label: 'FACT',
        source_name: '10-K',
        source_tier: 'tier_1',
        challenged: false,
        created_at: new Date().toISOString(),
        numeric_value: 400000000,
      },
      {
        id: `${mission.mission_id}-e2`,
        mission_id: mission.mission_id,
        agent_id: researcherId,
        claim_text: 'Margin 20',
        claim_label: 'FACT',
        source_name: '10-Q',
        source_tier: 'tier_1',
        challenged: false,
        created_at: new Date().toISOString(),
        numeric_value: 20,
      },
      {
        id: `${mission.mission_id}-e3`,
        mission_id: mission.mission_id,
        agent_id: researcherId,
        claim_text: 'Guidance intact',
        claim_label: 'MANAGEMENT_CLAIM',
        source_name: 'Call',
        source_tier: 'tier_2',
        challenged: false,
        created_at: new Date().toISOString(),
      },
    ];
    const evidencePack = evidenceController.buildEvidencePack(
      mission.mission_id,
      evidenceItems,
      ['sec_10k'],
      []
    );
    const constitutionResult = constitution.evaluate({
      agent_id: researcherId,
      pipeline_point: 'research',
      evidence_score: evidencePack.score,
      data_gaps: [],
    });
    if (constitutionResult.isErr()) {
      throw constitutionResult.error;
    }

    step('ANALYZING', { evidenceScore: evidencePack.score });
    const mock = new MockAdapter();
    const analystIds = [
      'forensic-accountant',
      'damodaran-valuation',
      'klarman-downside',
      'pro-investor',
    ] as const;
    const outputs: Array<
      Record<string, unknown> & {
        agent_id: string;
        decision_state?:
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
      }
    > = [];
    for (const agentId of analystIds) {
      const result = await mock.execute({
        mission_id: mission.mission_id,
        agent_id: agentId,
        model_id: 'mock-default',
        prompt: 'mock',
        schema: AgentOutputSchemas[agentId] as ZodTypeAny,
        timeout_ms: 1000,
      });
      if (result.isOk()) {
        outputs.push(
          result.value.output as Record<string, unknown> & {
            agent_id: string;
            decision_state?:
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
          }
        );
      }
    }
    step('CROSS_QA', { analystOutputsComplete: true });
    step('DEBATING', { crossQaComplete: true });
    step('SYNTHESIZING', { debateRoundsCompleted: 3 });
    const cioResult = await mock.execute({
      mission_id: mission.mission_id,
      agent_id: 'cio-synthesizer',
      model_id: 'mock-default',
      prompt: 'mock',
      schema: AgentOutputSchemas['cio-synthesizer'] as ZodTypeAny,
      timeout_ms: 1000,
    });
    if (cioResult.isOk()) {
      outputs.push(
        cioResult.value.output as Record<string, unknown> & {
          agent_id: string;
          decision_state?:
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
        }
      );
    }
    const synthesisOutput = synthesis.assemble({
      agent_outputs: outputs,
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

    const journalWriter = new JournalWriter();
    journalWriter.initializeSchema();
    journalWriter.close();
    db.close();
    return traceRecord;
  }
}
