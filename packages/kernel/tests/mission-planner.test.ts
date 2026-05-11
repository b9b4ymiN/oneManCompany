import { describe, expect, it } from 'vitest';
import { MissionPlanner } from '../src/mission-planner';

describe('MissionPlanner', () => {
  it('parses the canonical mock brief into a mission object', () => {
    const planner = new MissionPlanner();
    const result = planner.planMission('analyze MOCK_STOCK with earnings 400M');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.subject.ticker).toBe('MOCK_STOCK');
      expect(result.value.subject.earnings_hint).toBe(400000000);
      expect(result.value.domain).toBe('investment-war-room');
      expect(result.value.required_agents).toContain('researcher-us');
      expect(result.value.output_requirements.mandatory_fields).toContain(
        'decision_state'
      );
    }
  });

  it('rejects unsupported briefs', () => {
    const planner = new MissionPlanner();
    const result = planner.planMission('compare MOCK_STOCK');
    expect(result.isErr()).toBe(true);
  });
});
