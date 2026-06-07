/**
 * Flock Configuration Loader
 *
 * Loads and validates Flock YAML configuration files with Zod.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { err, ok, type Result } from 'neverthrow';
import type { FlockConfig, ConfigAgent, ConfigGate, ConfigPolicies } from './types';
import { FlockConfigSchema, ConfigAgentSchema, ConfigGateSchema, ConfigPoliciesSchema } from './schemas';

/**
 * Error codes for configuration loading.
 */
export type ConfigErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PARSE_ERROR'
  | 'VALIDATION_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Configuration-specific error class.
 */
export class ConfigError extends Error {
  constructor(
    readonly code: ConfigErrorCode,
    message: string,
    readonly details: unknown = {}
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Default Flock configuration.
 */
export const defaultConfig: FlockConfig = {
  agents: {
    'claude-code': {
      type: 'cli',
      command: 'claude',
      args: ['--dangerously-skip-permissions'],
      mode: 'write',
    },
    codex: {
      type: 'cli',
      command: 'codex',
      args: [],
      mode: 'write',
    },
    'gemini-reviewer': {
      type: 'cli',
      command: 'gemini',
      args: [],
      mode: 'readonly',
    },
  },
  gates: {
    typecheck: {
      command: 'bun run typecheck',
    },
    test: {
      command: 'bun run test',
    },
    lint: {
      command: 'bun run lint',
    },
  },
  policies: {
    require_human_approval_before_merge: true,
    forbid_direct_main_branch_write: true,
    require_diff_summary: true,
    require_tests_for_code_change: true,
    preserve_failed_workspaces: true,
    max_parallel_runs: 4,
    default_timeout_minutes: 60,
  },
};

/**
 * Search paths for the Flock config file, in order of priority.
 */
const defaultConfigPaths = [
  '.flock/config.yml',
  '.flock/config.yaml',
  'flock.yml',
  'flock.yaml',
  '.flockrc',
];

/**
 * Parse YAML content into a JavaScript object.
 * Note: This is a simple YAML parser for the limited subset we need.
 * For production, consider using a proper YAML library.
 */
function parseYaml(content: string): unknown {
  // Simple line-based parser for our config structure
  const lines = content.split('\n');
  const result: Record<string, unknown> = {};
  let currentSection: Record<string, unknown> | null = null;
  let currentKey: string | null = null;
  let indentLevel = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.search(/\S/);
    const isListItem = trimmed.startsWith('- ');

    if (isListItem && currentKey) {
      // Handle list items (e.g., args: - item1 - item2)
      const itemContent = trimmed.slice(2).trim();
      if (currentSection && Array.isArray(currentSection[currentKey])) {
        // Remove quotes if present
        const value = itemContent.replace(/^['"]|['"]$/g, '');
        (currentSection[currentKey] as unknown[]).push(value);
      }
    } else if (trimmed.includes(':')) {
      const colonIndex = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIndex).trim();
      const valueStr = trimmed.slice(colonIndex + 1).trim();

      if (indent === 0) {
        // Top-level section
        if (key === 'agents' || key === 'gates' || key === 'policies') {
          result[key] = {};
          currentSection = result[key] as Record<string, unknown>;
          currentKey = null;
        } else {
          result[key] = valueStr;
          currentKey = null;
        }
      } else {
        // Nested property
        if (currentSection) {
          if (valueStr) {
            // Handle primitive values
            let value: unknown = valueStr;
            if (valueStr === 'true') value = true;
            else if (valueStr === 'false') value = false;
            else if (/^\d+$/.test(valueStr)) value = parseInt(valueStr, 10);
            else if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
              // Parse array like ["item1", "item2"]
              value = valueStr
                .slice(1, -1)
                .split(',')
                .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
                .filter(Boolean);
            } else if (valueStr.startsWith('"') || valueStr.startsWith("'")) {
              value = valueStr.slice(1, -1);
            }
            currentSection[key] = value;
          } else {
            // Start of new subsection or array
            if (key === 'args') {
              currentSection[key] = [];
            } else {
              currentSection[key] = {};
            }
            currentKey = key;
          }
        }
      }
    }
  }

  return result;
}

/**
 * Load Flock configuration from a YAML file.
 *
 * @param configPath - Path to the config file. If not provided, searches default locations.
 * @returns Result containing the validated config or a ConfigError
 */
export async function loadConfig(configPath?: string): Promise<Result<FlockConfig, ConfigError>> {
  const searchPaths = configPath ? [configPath] : defaultConfigPaths;

  // Find the config file
  let resolvedPath: string | null = null;
  for (const searchPath of searchPaths) {
    const fullPath = path.resolve(process.cwd(), searchPath);
    if (existsSync(fullPath)) {
      resolvedPath = fullPath;
      break;
    }
  }

  // If no config file found, return default config
  if (!resolvedPath) {
    return ok(defaultConfig);
  }

  // Read and parse the file
  try {
    const content = await readFile(resolvedPath, 'utf-8');
    const parsed = parseYaml(content);

    // Validate with Zod
    const validationResult = FlockConfigSchema.safeParse(parsed);
    if (!validationResult.success) {
      return err(
        new ConfigError(
          'VALIDATION_ERROR',
          `Config validation failed: ${validationResult.error.message}`,
          { errors: validationResult.error.errors }
        )
      );
    }

    return ok(validationResult.data);
  } catch (error) {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return ok(defaultConfig);
      }
      return err(
        new ConfigError(
          'PARSE_ERROR',
          `Failed to parse config file: ${error.message}`,
          { originalError: error.message }
        )
      );
    }
    return err(
      new ConfigError('UNKNOWN_ERROR', 'Unknown error loading config', { error })
    );
  }
}

/**
 * Load config synchronously (for contexts where async is not available).
 *
 * @param configPath - Optional path to the config file
 * @returns Result containing the validated config or a ConfigError
 */
export function loadConfigSync(configPath?: string): Result<FlockConfig, ConfigError> {
  const searchPaths = configPath ? [configPath] : defaultConfigPaths;

  // Find the config file
  let resolvedPath: string | null = null;
  for (const searchPath of searchPaths) {
    const fullPath = path.resolve(process.cwd(), searchPath);
    if (existsSync(fullPath)) {
      resolvedPath = fullPath;
      break;
    }
  }

  // If no config file found, return default config
  if (!resolvedPath) {
    return ok(defaultConfig);
  }

  // Read and parse the file
  try {
    const fs = require('node:fs');
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = parseYaml(content);

    // Validate with Zod
    const validationResult = FlockConfigSchema.safeParse(parsed);
    if (!validationResult.success) {
      return err(
        new ConfigError(
          'VALIDATION_ERROR',
          `Config validation failed: ${validationResult.error.message}`,
          { errors: validationResult.error.errors }
        )
      );
    }

    return ok(validationResult.data);
  } catch (error) {
    if (error instanceof Error) {
      return err(
        new ConfigError(
          'PARSE_ERROR',
          `Failed to parse config file: ${error.message}`,
          { originalError: error.message }
        )
      );
    }
    return err(
      new ConfigError('UNKNOWN_ERROR', 'Unknown error loading config', { error })
    );
  }
}

/**
 * Get the default configuration.
 */
export function getDefaultConfig(): FlockConfig {
  return { ...defaultConfig };
}

// Re-export types
export type { FlockConfig, ConfigAgent, ConfigGate, ConfigPolicies } from './types';
