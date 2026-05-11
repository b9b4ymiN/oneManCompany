import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { AgentRegistryCard } from './types';

const domainSchema = z.object({
  id: z.string(),
  default_team: z.object({
    researchers: z.array(z.string()),
    analysts: z.array(z.string()),
    synthesizer: z.string(),
    documenter: z.string(),
    always_include: z.array(z.string()),
  }),
  mission_types: z.array(
    z.object({
      id: z.string(),
      default_agents: z.array(z.string()),
      required_inputs: z.array(z.string()),
      output_contract: z.object({
        required_fields: z.array(z.string()),
        report_sections: z.array(z.string()),
      }),
    })
  ),
  execution_plan: z.object({
    research_mode: z.enum(['sequential', 'parallel']),
    analysis_mode: z.enum(['sequential', 'parallel']),
    synthesis_mode: z.enum(['single']),
    document_mode: z.enum(['sequential', 'parallel']),
    debate_enabled: z.boolean(),
    max_debate_rounds: z.number(),
    evidence_request_rounds: z.number(),
  }),
  human_checkpoints: z.record(
    z.object({
      mode: z.string(),
      state: z.string(),
      gate_name: z.string(),
      gate_type: z.string(),
      triggered_after_state: z.string(),
      condition: z.string(),
    })
  ),
  evidence_requirements: z.object({
    minimum_tier_1_sources: z.number(),
    minimum_total_sources: z.number(),
    required_documents: z.array(z.string()),
    required_documents_by_source_group: z.record(z.array(z.string())),
    critical_fields: z.array(z.string()),
    proceed_threshold: z.number(),
    human_review_threshold: z.number(),
    abort_recommend_threshold: z.number(),
  }),
  context_budget_policy: z.object({
    preferred_models: z.record(z.array(z.string())),
    warn_if_above_percent: z.number(),
    compress_if_above_percent: z.number(),
    always_preserve: z.array(z.string()),
    role_overrides: z.record(z.string()),
  }),
  output: z.object({
    mandatory_report_sections: z.array(z.string()),
    mandatory_fields: z.array(z.string()),
    forbidden_content: z.array(z.string()),
  }),
});

const constitutionSchema = z.object({
  company_constitution: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      enforcement: z.enum([
        'BLOCK_MISSION',
        'INSERT_HUMAN_REVIEW',
        'WARN_AND_FLAG',
        'REJECT_OUTPUT',
      ]),
      applies_to: z.union([z.string(), z.array(z.string())]),
      exception: z.string(),
    })
  ),
});

const modelRegistrySchema = z.object({
  models: z.record(
    z.object({
      provider: z.string(),
      context_limit_tokens: z.number(),
      preferred_for: z.array(z.string()),
    })
  ),
});

const agentRegistrySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  persona: z.string(),
  domain: z.array(z.string()),
  model_preference: z.array(z.string()),
  context_share: z.string(),
  interaction_rules: z.record(z.unknown()),
  output_schema_ref: z.string(),
  mandatory_fields: z.array(z.string()),
});

export type LoadedDomainConfig = z.infer<typeof domainSchema>;
export type LoadedConstitution = z.infer<typeof constitutionSchema>;
export type LoadedModelRegistry = z.infer<typeof modelRegistrySchema>;

function readYamlFile<T>(
  filePath: string,
  schema: z.ZodSchema<T>
): Result<T, Error> {
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));
    return ok(schema.parse(parsed));
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error('Unknown YAML load error')
    );
  }
}

export function repoPath(...segments: string[]): string {
  return path.resolve(process.cwd(), ...segments);
}

export function loadDomainConfig(
  filePath = repoPath('domains', 'investment-war-room', 'domain.yaml')
): Result<LoadedDomainConfig, Error> {
  return readYamlFile(filePath, domainSchema);
}

export function loadConstitution(
  filePath = repoPath(
    'domains',
    'investment-war-room',
    'domain-constitution.yaml'
  )
): Result<LoadedConstitution, Error> {
  return readYamlFile(filePath, constitutionSchema);
}

export function loadModelRegistry(
  filePath = repoPath('registry', 'models.yaml')
): Result<LoadedModelRegistry, Error> {
  return readYamlFile(filePath, modelRegistrySchema);
}

export function loadAgentRegistryCards(
  dirPath = repoPath('registry', 'agents')
): Result<Record<string, AgentRegistryCard>, Error> {
  try {
    const files = fs
      .readdirSync(dirPath)
      .filter((entry) => entry.endsWith('.yaml'))
      .sort();
    const cards: Record<string, AgentRegistryCard> = {};
    for (const file of files) {
      const absolute = path.join(dirPath, file);
      const parsed = agentRegistrySchema.parse(
        yaml.load(fs.readFileSync(absolute, 'utf8'))
      );
      cards[parsed.id] = parsed;
    }
    return ok(cards);
  } catch (error) {
    return err(
      error instanceof Error ? error : new Error('Unknown agent registry error')
    );
  }
}
