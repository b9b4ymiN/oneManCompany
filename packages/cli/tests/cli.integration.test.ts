import { describe, expect, it } from 'vitest';
import { healthCommand } from '../src/commands/health';
import { journalListCommand } from '../src/commands/journal';
import { replayCommand } from '../src/commands/replay';
import { runCommand } from '../src/commands/run';

describe('CLI integration', () => {
  it('prints health report', async () => {
    const output = await healthCommand();
    expect(output).toContain('gemini-cli');
    expect(/\[HEALTHY\]|\[UNHEALTHY\]/.test(output)).toBe(true);
  });

  it('runs a mission to HUMAN_REVIEW and exposes journal/replay output', async () => {
    const output = await runCommand('analyze TEST_STOCK with earnings 400M');
    expect(output).toContain('current_state=HUMAN_REVIEW');
    const missionId = output
      .split('\n')
      .find((line) => line.startsWith('mission_id='))
      ?.replace('mission_id=', '');
    expect(missionId).toBeTruthy();
    if (!missionId) return;
    expect(await replayCommand(missionId)).toContain('replay_decision_state');
    expect(journalListCommand()).toContain(missionId);
  });
});
