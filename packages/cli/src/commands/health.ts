import { HealthMonitor } from '@onemancompany/adapters';

export async function healthCommand(): Promise<string> {
  const report = await new HealthMonitor().run();
  return [
    `generated_at=${report.generated_at}`,
    ...report.backends.map((backend) => {
      const mode = backend.backend === 'mock' ? '[MOCK]' : '[REAL]';
      const status = backend.healthy ? '[HEALTHY]' : '[UNHEALTHY]';
      return `${backend.backend}: ${mode} ${status} (${backend.reason})`;
    }),
  ].join('\n');
}
