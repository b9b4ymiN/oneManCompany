import { describe, expect, it } from 'vitest';
import { MissionPlanner } from '../src/mission-planner';
import { TeamBuilder } from '../src/team-builder';

describe('TeamBuilder', () => {
  it('builds sequential and parallel groups and records exclusions/fallbacks', () => {
    const planner = new MissionPlanner();
    const mission = planner.planMission(
      'analyze MOCK_STOCK with earnings 400M'
    );
    expect(mission.isOk()).toBe(true);
    if (mission.isErr()) return;
    const builder = new TeamBuilder();
    const result = builder.buildExecutionPlan(mission.value, {
      'gemini-2-flash': true,
      'claude-opus': true,
      'claude-sonnet': true,
      'zai-default': false,
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.groups[0]?.mode).toBe('sequential');
      expect(result.value.groups[1]?.mode).toBe('parallel');
      expect(result.value.excluded_agents).toEqual([]);
      expect(result.value.fallback_models['klarman-downside']).toBe(
        'claude-opus'
      );
    }
  });

  it('fails cleanly when an agent is missing from the registry', () => {
    const builder = new TeamBuilder();
    const result = builder.buildExecutionPlan(
      {
        mission_id: 'mission_1',
        domain: 'investment-war-room',
        mission_type: 'stock_analysis',
        subject: { ticker: 'MOCK', market: 'us-nasdaq' },
        owner_brief: 'analyze MOCK',
        required_agents: ['missing-agent'],
        evidence_requirements: {
          minimum_tier_1_sources: 3,
          minimum_total_sources: 5,
          required_documents: [],
          required_documents_by_source_group: {},
          critical_fields: [],
          proceed_threshold: 70,
          human_review_threshold: 40,
          abort_recommend_threshold: 20,
        },
        output_requirements: {
          mandatory_fields: [],
          mandatory_report_sections: [],
          forbidden_content: [],
        },
        human_checkpoints: [],
        metadata: {},
      },
      {}
    );
    expect(result.isErr()).toBe(true);
  });
});
