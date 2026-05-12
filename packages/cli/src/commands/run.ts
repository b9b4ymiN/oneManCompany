import { MissionRunner } from '../mission-runner';

export async function runCommand(brief: string): Promise<string> {
  const result = await new MissionRunner().run(brief);
  return [
    `mission_id=${result.mission_id}`,
    `current_state=${result.current_state}`,
    ...result.transitions.map(
      (item) => `${item.from}->${item.to} @ ${item.at}`
    ),
    ...result.adapter_trace,
  ].join('\n');
}
