import { HealthMonitor } from '@onemancompany/adapters';

export async function healthCommand(): Promise<string> {
  const report = await new HealthMonitor().run();
  return [
    `generated_at=${report.generated_at}`,
    ...report.backends.map(
      (backend) =>
        `${backend.backend}: ${backend.healthy ? 'healthy' : 'unhealthy'} (${backend.reason})`
    ),
  ].join('\n');
}
