import type { MissionState } from '@onemancompany/kernel';

export interface MissionTraceEvent {
  from: MissionState;
  to: MissionState;
  timestamp: string;
}

export class MissionTracer {
  readonly events: MissionTraceEvent[] = [];

  record(
    from: MissionState,
    to: MissionState,
    timestamp = new Date().toISOString()
  ): MissionTraceEvent {
    const event = { from, to, timestamp };
    this.events.push(event);
    return event;
  }
}
