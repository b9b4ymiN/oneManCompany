import crypto from 'node:crypto';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { loadDomainConfig } from './loaders';
import type { HumanCheckpointConfig, MissionObject } from './types';

const parsedBriefSchema = z.object({
  action: z.literal('analyze'),
  ticker: z.string().min(1),
  earnings_hint: z.number().optional(),
  market: z.string().default('us-nasdaq'),
});

export class MissionPlanner {
  parseBrief(brief: string): Result<z.infer<typeof parsedBriefSchema>, Error> {
    const match =
      /^analyze\s+([A-Z0-9_\-.]+)(?:\s+with\s+earnings\s+([0-9]+(?:\.[0-9]+)?)([MB])?)?$/i.exec(
        brief.trim()
      );
    if (!match) {
      return err(new Error('Unsupported mission brief format'));
    }
    const rawTicker = match[1]?.toUpperCase() ?? '';
    const earningsRaw = match[2];
    const suffix = match[3]?.toUpperCase();
    let earnings_hint: number | undefined;
    if (earningsRaw) {
      const base = Number(earningsRaw);
      earnings_hint =
        suffix === 'B'
          ? base * 1_000_000_000
          : suffix === 'M'
            ? base * 1_000_000
            : base;
    }
    return ok(
      parsedBriefSchema.parse({
        action: 'analyze',
        ticker: rawTicker,
        earnings_hint,
        market: 'us-nasdaq',
      })
    );
  }

  planMission(brief: string): Result<MissionObject, Error> {
    const domainResult = loadDomainConfig();
    if (domainResult.isErr()) {
      return err(domainResult.error);
    }
    const parsedResult = this.parseBrief(brief);
    if (parsedResult.isErr()) {
      return err(parsedResult.error);
    }
    const domain = domainResult.value;
    const parsed = parsedResult.value;
    const missionType = domain.mission_types.find(
      (item) => item.id === 'stock_analysis'
    );
    if (!missionType) {
      return err(
        new Error('stock_analysis mission type missing from domain config')
      );
    }

    const researcher = parsed.market.startsWith('us-')
      ? 'researcher-us'
      : 'researcher-set';
    const requiredAgents = Array.from(
      new Set([
        researcher,
        ...missionType.default_agents.filter(
          (agentId) => !agentId.startsWith('researcher-')
        ),
        ...domain.default_team.always_include,
      ])
    );

    const checkpoints: HumanCheckpointConfig[] = Object.values(
      domain.human_checkpoints
    ).map((checkpoint) => ({
      mode: checkpoint.mode,
      state: checkpoint.state as HumanCheckpointConfig['state'],
      gate_name: checkpoint.gate_name,
      gate_type: checkpoint.gate_type,
      triggered_after_state:
        checkpoint.triggered_after_state as HumanCheckpointConfig['triggered_after_state'],
      condition: checkpoint.condition,
    }));

    return ok({
      mission_id: `mission_${crypto.randomUUID()}`,
      domain: domain.id,
      mission_type: missionType.id,
      subject: {
        ticker: parsed.ticker,
        market: parsed.market,
        ...(parsed.earnings_hint !== undefined
          ? { earnings_hint: parsed.earnings_hint }
          : {}),
      },
      owner_brief: brief,
      required_agents: requiredAgents,
      evidence_requirements: domain.evidence_requirements,
      output_requirements: {
        mandatory_fields: domain.output.mandatory_fields,
        mandatory_report_sections: domain.output.mandatory_report_sections,
        forbidden_content: domain.output.forbidden_content,
      },
      human_checkpoints: checkpoints,
      metadata: {
        parsed_action: parsed.action,
        source_group: parsed.market.startsWith('us-')
          ? 'us-sec-edgar'
          : 'thai-set',
      },
    });
  }
}
