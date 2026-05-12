import { readTrace } from '../runtime-store';

export function replayCommand(missionId: string): string {
  const trace = readTrace(missionId);
  if (!trace) {
    return `mission ${missionId} not found`;
  }
  return [
    `mission_id=${trace.mission_id}`,
    `current_state=${trace.current_state}`,
    ...trace.transitions.map((item) => `${item.from}->${item.to} @ ${item.at}`),
    ...trace.adapter_trace,
  ].join('\n');
}
