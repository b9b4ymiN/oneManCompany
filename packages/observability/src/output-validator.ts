import { AgentOutputSchemas, type AgentId } from '@onemancompany/kernel';
import { err, ok, type Result } from 'neverthrow';

export class OutputValidator {
  validate(agentId: AgentId, output: unknown): Result<true, Error> {
    const schema = AgentOutputSchemas[agentId];
    const parsed = schema.safeParse(output);
    if (!parsed.success) {
      return err(parsed.error);
    }
    return ok(true);
  }
}
