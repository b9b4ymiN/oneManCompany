import { err, ok, type Result } from 'neverthrow';

export interface ParallelTask<T> {
  agent_id: string;
  timeout_ms: number;
  run: () => Promise<T>;
}

export interface ParallelRunnerResult<T> {
  successes: Array<{ agent_id: string; output: T }>;
  failures: Array<{ agent_id: string; reason: string }>;
}

export class ParallelRunner {
  async run<T>(
    tasks: ParallelTask<T>[]
  ): Promise<Result<ParallelRunnerResult<T>, Error>> {
    try {
      const settled = await Promise.all(
        tasks.map(async (task) => {
          try {
            const output = await Promise.race([
              task.run(),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error(`${task.agent_id} timed out`)),
                  task.timeout_ms
                )
              ),
            ]);
            return {
              status: 'fulfilled' as const,
              agent_id: task.agent_id,
              output,
            };
          } catch (error) {
            return {
              status: 'rejected' as const,
              agent_id: task.agent_id,
              reason: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        })
      );
      return ok({
        successes: settled
          .filter((item) => item.status === 'fulfilled')
          .map((item) => ({ agent_id: item.agent_id, output: item.output })),
        failures: settled
          .filter((item) => item.status === 'rejected')
          .map((item) => ({ agent_id: item.agent_id, reason: item.reason })),
      });
    } catch (error) {
      return err(
        error instanceof Error ? error : new Error('Parallel runner failed')
      );
    }
  }
}
