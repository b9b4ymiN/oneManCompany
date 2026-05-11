export class ReplayEngine {
  replay(missionId: string): { mission_id: string; status: 'stub' } {
    return { mission_id: missionId, status: 'stub' };
  }
}
