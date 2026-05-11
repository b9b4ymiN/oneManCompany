import { ok, type Result } from 'neverthrow';
import type { HumanGateRequest } from './types';

export interface HumanGateResponse {
  action: string;
  note?: string;
  auto_proceeded: boolean;
}

export type HumanGateResponder = (
  message: string,
  actions: string[]
) => string | undefined;

export class HumanGate {
  formatMessage(request: HumanGateRequest): string {
    return [
      `[${request.gate_type}] ${request.gate_name}`,
      `Reason: ${request.reason_text}`,
      `Evidence: ${request.evidence_summary}`,
      `Data gaps: ${request.data_gaps.map((gap) => gap.field).join(', ') || 'none'}`,
      `Actions: ${request.available_actions.join(', ')}`,
    ].join('\n');
  }

  resolve(
    request: HumanGateRequest,
    responder?: HumanGateResponder
  ): Result<HumanGateResponse, never> {
    const message = this.formatMessage(request);
    const answer = responder?.(message, request.available_actions);
    if (answer) {
      return ok({ action: answer, auto_proceeded: false });
    }
    if (request.gate_type === 'AUTO_PROCEED') {
      return ok({
        action: request.available_actions[0] ?? 'proceed',
        auto_proceeded: true,
      });
    }
    if (request.gate_type === 'OPTIONAL') {
      return ok({
        action: request.available_actions[0] ?? 'skip',
        auto_proceeded: true,
      });
    }
    if (request.gate_type === 'CONDITIONAL') {
      return ok({
        action: request.available_actions[0] ?? 'review',
        auto_proceeded: true,
      });
    }
    return ok({ action: 'awaiting-owner', auto_proceeded: false });
  }
}
