import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { err, ok, type Result } from 'neverthrow';
import type { HumanGateRequest } from '@onemancompany/kernel';

function stripTerminalControls(value: string): string {
  return value
    .replace(
      /[\u001b\u009b][[\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ''
    )
    .replace(/[\r\n]+/g, ' ');
}

export class HumanAdapter {
  formatGateMessage(request: HumanGateRequest): string {
    return [
      `Gate: ${stripTerminalControls(request.gate_name)}`,
      `Reason: ${stripTerminalControls(request.reason_text)}`,
      `Evidence: ${stripTerminalControls(request.evidence_summary)}`,
      `Data gaps: ${request.data_gaps.map((gap) => stripTerminalControls(gap.field)).join(', ') || 'none'}`,
      `Actions: ${request.available_actions.map((action) => stripTerminalControls(action)).join(', ')}`,
    ].join('\n');
  }

  sanitizeResponse(response: string): string {
    return stripTerminalControls(response.trim());
  }

  validateAction(
    response: string,
    availableActions: string[]
  ): Result<string, Error> {
    const sanitized = this.sanitizeResponse(response);
    if (!availableActions.includes(sanitized)) {
      return err(new Error(`Invalid action: ${sanitized}`));
    }
    return ok(sanitized);
  }

  async prompt(request: HumanGateRequest): Promise<Result<string, Error>> {
    const rl = readline.createInterface({ input, output });
    try {
      const answer = await rl.question(
        `${this.formatGateMessage(request)}\n> `
      );
      return this.validateAction(answer, request.available_actions);
    } finally {
      rl.close();
    }
  }
}
