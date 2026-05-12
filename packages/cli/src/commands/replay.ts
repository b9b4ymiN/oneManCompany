import { MissionRunner } from '../mission-runner';
import { readTrace } from '../runtime-store';

export async function replayCommand(missionId: string): Promise<string> {
  const trace = readTrace(missionId);
  if (!trace) {
    return `mission ${missionId} not found`;
  }
  if (!trace.brief) {
    return [
      `mission_id=${trace.mission_id}`,
      `current_state=${trace.current_state}`,
      ...trace.transitions.map(
        (item) => `${item.from}->${item.to} @ ${item.at}`
      ),
      ...trace.adapter_trace,
    ].join('\n');
  }
  const rerun = await new MissionRunner().run(trace.brief);
  const equivalent = trace.decision_state
    ? trace.decision_state === rerun.decision_state
    : true;
  return [
    `original_mission_id=${trace.mission_id}`,
    `replay_mission_id=${rerun.mission_id}`,
    `original_decision_state=${trace.decision_state ?? 'unknown'}`,
    `replay_decision_state=${rerun.decision_state ?? 'unknown'}`,
    `equivalent_decision_state=${equivalent}`,
    `replay_current_state=${rerun.current_state}`,
  ].join('\n');
}
