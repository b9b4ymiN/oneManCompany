import { err, ok, type Result } from 'neverthrow';
import {
  loadAgentRegistryCards,
  loadDomainConfig,
  loadModelRegistry,
} from './loaders';
import type { ExecutionPlan, ExecutionPlanGroup, MissionObject } from './types';

export class TeamBuilder {
  buildExecutionPlan(
    mission: MissionObject,
    healthByModel: Record<string, boolean>
  ): Result<ExecutionPlan, Error> {
    const domainResult = loadDomainConfig();
    const cardsResult = loadAgentRegistryCards();
    const modelsResult = loadModelRegistry();
    if (domainResult.isErr()) return err(domainResult.error);
    if (cardsResult.isErr()) return err(cardsResult.error);
    if (modelsResult.isErr()) return err(modelsResult.error);

    const domain = domainResult.value;
    const cards = cardsResult.value;
    const availableModels = modelsResult.value.models;
    const excludedAgents: string[] = [];
    const missionLog: string[] = [];
    const fallbackModels: Record<string, string | null> = {};

    for (const agentId of mission.required_agents) {
      const card = cards[agentId];
      if (!card) {
        return err(new Error(`Missing agent registry card for ${agentId}`));
      }
      const healthyModel = card.model_preference.find(
        (modelId) => healthByModel[modelId] !== false
      );
      if (!healthyModel) {
        excludedAgents.push(agentId);
        missionLog.push(
          `Excluded ${agentId} because no healthy model backend was available`
        );
        fallbackModels[agentId] = null;
        continue;
      }
      const preferred = card.model_preference[0];
      const fallback =
        card.model_preference.find((modelId) => modelId !== healthyModel) ??
        null;
      fallbackModels[agentId] =
        healthyModel === preferred ? fallback : healthyModel;
      if (!availableModels[healthyModel]) {
        excludedAgents.push(agentId);
        missionLog.push(
          `Excluded ${agentId} because model ${healthyModel} is absent from registry`
        );
      }
    }

    const activeAgents = mission.required_agents.filter(
      (agentId) => !excludedAgents.includes(agentId)
    );
    const researchers = activeAgents.filter(
      (agentId) => cards[agentId]?.role === 'researcher'
    );
    const analysts = activeAgents.filter(
      (agentId) => cards[agentId]?.role === 'analyst'
    );
    const synthesizer = activeAgents.filter(
      (agentId) => cards[agentId]?.role === 'synthesizer'
    );
    const documenter = activeAgents.filter(
      (agentId) => cards[agentId]?.role === 'document'
    );

    const groups: ExecutionPlanGroup[] = [
      { mode: domain.execution_plan.research_mode, agent_ids: researchers },
      { mode: domain.execution_plan.analysis_mode, agent_ids: analysts },
      { mode: domain.execution_plan.synthesis_mode, agent_ids: synthesizer },
      {
        mode:
          domain.execution_plan.document_mode === 'parallel'
            ? 'parallel'
            : 'sequential',
        agent_ids: documenter,
      },
    ];

    return ok({
      mission_id: mission.mission_id,
      groups,
      fallback_models: fallbackModels,
      excluded_agents: excludedAgents,
      mission_log: missionLog,
    });
  }
}
