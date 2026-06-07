/**
 * Flock Agent Pool
 *
 * Tracks agent availability and workload for parallel scheduling.
 */

import { eq, and, inArray } from 'drizzle-orm';
import { ok, err, type Result } from 'neverthrow';
import type { FlockDatabase } from '../db/client';
import type { FlockError, AgentConfig, RunState } from '../types';
import { FlockError as FlockErrorClass } from '../types';

/**
 * Information about an agent's current state.
 */
export interface AgentInfo {
  /** Unique agent identifier */
  id: string;
  /** Agent configuration */
  config: AgentConfig;
  /** Number of currently active runs for this agent */
  activeRuns: number;
  /** Whether agent is available for new work */
  isAvailable: boolean;
}

/**
 * Active run states that count as "busy" for an agent.
 */
const ACTIVE_RUN_STATES: RunState[] = ['SPAWNING', 'RUNNING', 'STOPPING'];

/**
 * Agent Pool Manager
 *
 * Tracks agent availability and workload.
 */
export class AgentPool {
  constructor(private readonly db: FlockDatabase) {}

  /**
   * Get all available agents.
   *
   * Returns agents that are not currently running (or have capacity for more runs).
   */
  async getAvailableAgents(): Promise<Result<AgentInfo[], FlockError>> {
    // Get all agents
    const agents = await this.db.db
      .select()
      .from(this.db.schema.agents)
      .all();

    // Get active runs for each agent
    const agentInfos: AgentInfo[] = await Promise.all(
      agents.map(async (agent) => {
        const activeRuns = await this.getAgentWorkload(agent.id);
        const config: AgentConfig = {
          id: agent.id,
          name: agent.name,
          kind: agent.kind as 'cli',
          command: agent.command,
          args: [],
          mode: undefined, // Will be parsed from config_json if needed
        };

        // Parse config_json for additional settings
        try {
          const configData = JSON.parse(agent.config_json) as Partial<AgentConfig>;
          if (configData.args) config.args = configData.args;
          if (configData.mode) config.mode = configData.mode;
        } catch {
          // Use defaults if JSON parse fails
        }

        return {
          id: agent.id,
          config,
          activeRuns,
          isAvailable: true, // Agents can handle multiple concurrent runs
        };
      })
    );

    return ok(agentInfos);
  }

  /**
   * Check if an agent is currently busy (has active runs).
   */
  async isAgentBusy(agentId: string): Promise<boolean> {
    const workload = await this.getAgentWorkload(agentId);
    return workload > 0;
  }

  /**
   * Get the current workload (active run count) for an agent.
   */
  async getAgentWorkload(agentId: string): Promise<number> {
    const result = await this.db.db
      .select()
      .from(this.db.schema.runs)
      .where(
        and(
          eq(this.db.schema.runs.agent_id, agentId),
          inArray(this.db.schema.runs.status, ACTIVE_RUN_STATES)
        )
      );

    return result.length;
  }

  /**
   * Get agent information by ID.
   */
  async getAgentInfo(agentId: string): Promise<Result<AgentInfo, FlockError>> {
    const agent = await this.db.db
      .select()
      .from(this.db.schema.agents)
      .where(eq(this.db.schema.agents.id, agentId))
      .get();

    if (!agent) {
      return err(
        new FlockErrorClass('DATABASE_ERROR', `Agent not found: ${agentId}`, {
          agentId,
        })
      );
    }

    const activeRuns = await this.getAgentWorkload(agentId);
    const config: AgentConfig = {
      id: agent.id,
      name: agent.name,
      kind: agent.kind as 'cli',
      command: agent.command,
      args: [],
      mode: undefined,
    };

    // Parse config_json for additional settings
    try {
      const configData = JSON.parse(agent.config_json) as Partial<AgentConfig>;
      if (configData.args) config.args = configData.args;
      if (configData.mode) config.mode = configData.mode;
    } catch {
      // Use defaults if JSON parse fails
    }

    return ok({
      id: agent.id,
      config,
      activeRuns,
      isAvailable: true, // Agents can handle multiple concurrent runs
    });
  }

  /**
   * Get all agents sorted by current workload (least busy first).
   */
  async getAgentsByWorkload(): Promise<Result<AgentInfo[], FlockError>> {
    const result = await this.getAvailableAgents();

    if (result.isErr()) {
      return err(result.error);
    }

    // Sort by active runs (ascending)
    const sorted = result.value.sort((a, b) => a.activeRuns - b.activeRuns);

    return ok(sorted);
  }

  /**
   * Get agents filtered by mode.
   *
   * @param mode - 'write' for agents that modify files, 'readonly' for read-only agents
   */
  async getAgentsByMode(mode: 'write' | 'readonly'): Promise<Result<AgentInfo[], FlockError>> {
    const result = await this.getAvailableAgents();

    if (result.isErr()) {
      return err(result.error);
    }

    const filtered = result.value.filter((agent) => agent.config.mode === mode);

    return ok(filtered);
  }

  /**
   * Check if a specific agent mode is available.
   */
  async hasAgentWithMode(mode: 'write' | 'readonly'): Promise<boolean> {
    const result = await this.getAgentsByMode(mode);

    if (result.isErr()) {
      return false;
    }

    return result.value.length > 0;
  }
}

/**
 * Factory function to create an agent pool.
 */
export function createAgentPool(db: FlockDatabase): AgentPool {
  return new AgentPool(db);
}
