import { loadDomainConfig, loadModelRegistry } from './loaders';
import type { AgentRegistryCard, ContextPayload } from './types';

export interface BudgetStatus {
  context_limit_tokens: number;
  used_tokens: number;
  used_percent: number;
  should_warn: boolean;
  should_compress: boolean;
}

export class ContextBudgetTracker {
  getBudgetStatus(modelId: string, usedTokens: number): BudgetStatus {
    const registry = loadModelRegistry();
    if (registry.isErr()) {
      throw registry.error;
    }
    const model = registry.value.models[modelId];
    if (!model) {
      throw new Error(`Unknown model ${modelId}`);
    }
    const usedPercent = (usedTokens / model.context_limit_tokens) * 100;
    return {
      context_limit_tokens: model.context_limit_tokens,
      used_tokens: usedTokens,
      used_percent: usedPercent,
      should_warn: usedPercent > 70,
      should_compress: usedPercent > 80,
    };
  }
}

export class SmartCompressor {
  compress(payload: ContextPayload): ContextPayload {
    return {
      facts: payload.facts,
      sources: payload.sources,
      key_numbers: payload.key_numbers,
      data_gaps: payload.data_gaps,
      financial_statements: payload.financial_statements?.slice(0, 3),
      business_model: payload.business_model,
      debate_records: payload.debate_records?.slice(0, 3),
      agent_output_summaries: payload.agent_output_summaries?.slice(0, 3),
      market_context: payload.market_context?.slice(0, 2),
      price_history: Array.isArray(payload.price_history)
        ? payload.price_history.slice(-10)
        : undefined,
      owner_portfolio_context: payload.owner_portfolio_context?.slice(0, 2),
      owner_framework: payload.owner_framework?.slice(0, 2),
      verbose_notes: payload.verbose_notes?.slice(0, 1),
    };
  }
}

export class ContextDistributor {
  distribute(
    payload: ContextPayload,
    agent: Pick<AgentRegistryCard, 'id' | 'context_share'>
  ): ContextPayload {
    const domain = loadDomainConfig();
    if (domain.isErr()) {
      throw domain.error;
    }
    const override = domain.value.context_budget_policy.role_overrides;
    const normalized = this.#normalizeContextShare(
      agent.id,
      agent.context_share,
      override
    );
    switch (normalized) {
      case 'full_evidence_pack':
        return payload;
      case 'financial_statements_and_notes':
        return {
          facts: payload.facts,
          sources: payload.sources,
          key_numbers: payload.key_numbers,
          data_gaps: payload.data_gaps,
          financial_statements: payload.financial_statements,
          verbose_notes: payload.verbose_notes,
        };
      case 'financial_plus_business_model':
        return {
          facts: payload.facts,
          sources: payload.sources,
          key_numbers: payload.key_numbers,
          data_gaps: payload.data_gaps,
          financial_statements: payload.financial_statements,
          business_model: payload.business_model,
        };
      case 'agent_output_summaries_plus_debate_records':
        return {
          facts: payload.facts,
          sources: payload.sources,
          key_numbers: payload.key_numbers,
          data_gaps: payload.data_gaps,
          debate_records: payload.debate_records,
          agent_output_summaries: payload.agent_output_summaries,
        };
      default:
        return {
          facts: payload.facts,
          sources: payload.sources,
          key_numbers: payload.key_numbers,
          data_gaps: payload.data_gaps,
        };
    }
  }

  #normalizeContextShare(
    agentId: string,
    contextShare: string,
    overrides: Record<string, string>
  ): string {
    if (agentId === 'forensic-accountant')
      return overrides.forensic_accountant ?? contextShare;
    if (agentId === 'cio-synthesizer')
      return overrides.cio_synthesizer ?? contextShare;
    if (['damodaran-valuation', 'klarman-downside'].includes(agentId)) {
      return overrides.valuation_agents ?? contextShare;
    }
    if (agentId.startsWith('researcher-')) {
      return overrides.researchers ?? contextShare;
    }
    return contextShare;
  }
}

export class ContextManager {
  readonly budgetTracker = new ContextBudgetTracker();
  readonly compressor = new SmartCompressor();
  readonly distributor = new ContextDistributor();
}
