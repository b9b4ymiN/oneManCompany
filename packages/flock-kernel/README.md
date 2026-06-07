# Flock Kernel

**Self-hosted web control tower for orchestrating multiple AI coding/research agents across isolated git workspaces.**

Flock provides the foundational types, state machines, database schema, and configuration system for coordinating AI agents through quality gates, reviews, and policy enforcement.

## Vision

Flock solves the chaos of multi-agent development by:

1. **Isolation** - Each agent runs in its own git worktree, preventing conflicts
2. **Evidence** - Quality gates (tests, lint, typecheck) must pass before merge
3. **Human Control** - Humans own the merge button; agents only propose
4. **First-Class Review** - Built-in review flows, not an afterthought
5. **CLI-First** - Everything works from terminal; web UI and MCP are optional

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web UI / CLI / MCP                        │
│                      (User Interaction Layer)                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                        Flock Kernel                               │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌─────────────┐  │
│  │   State  │  │   Database    │  │  Config  │  │  Policies   │  │
│  │ Machines │  │   (SQLite)   │  │ Loader   │  │   Engine    │  │
│  └──────────┘  └──────────────┘  └──────────┘  └─────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼──────┐    ┌────────▼────────┐    ┌────▼──────────┐
│   Agent      │    │   Gate Engine   │    │    Review     │
│   Adapter    │    │  (Test, Lint)    │    │   Service     │
└──────────────┘    └─────────────────┘    └───────────────┘
        │
┌───────▼──────────────────────────────────────────────────────────┐
│                    Isolated Git Worktrees                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Agent 1 │  │ Agent 2 │  │ Agent 3 │  │ Agent 4 │            │
│  │Branch A │  │Branch B │  │Branch C │  │Branch D │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
└───────────────────────────────────────────────────────────────┘
```

## Installation

```bash
# In your monorepo
pnpm add @onemancompany/flock-kernel

# Or globally for CLI tool
pnpm add -g @onemancompany/flock-cli
```

## Quick Start

### 1. Initialize Flock in your project

```bash
flock init
```

This creates `.flock/config.yml` with defaults.

### 2. Configure your agents

Edit `.flock/config.yml`:

```yaml
agents:
  claude-code:
    type: cli
    command: claude
    args: ["--dangerously-skip-permissions"]
    mode: write

gates:
  test:
    command: "bun run test"
  lint:
    command: "bun run lint"

policies:
  require_human_approval_before_merge: true
  max_parallel_runs: 4
```

### 3. Create and run a task

```bash
# Create a new task
flock task create "Fix authentication bug" --priority high

# List tasks
flock task list

# Run a task with an agent
flock run start <task-id> --agent claude-code

# View the run results
flock run status <run-id>
```

### 4. Review and merge

```bash
# When gates pass, review the changes
flock review request <task-id>

# Approve for merge
flock review approve <task-id> --comment "Looks good"

# Merge to main
flock task merge <task-id>
```

## Configuration Reference

Flock searches for config files in this order:

1. `.flock/config.yml`
2. `.flock/config.yaml`
3. `flock.yml`
4. `flock.yaml`
5. `.flockrc`

### Agents

```yaml
agents:
  my-agent:
    type: cli              # Currently only 'cli' supported
    command: <string>      # Executable command
    args: [<string>]       # Command arguments
    mode: write | readonly # Whether agent can modify files
```

### Gates

```yaml
gates:
  gate-name:
    command: <string>  # Command to run in workspace directory
```

### Policies

```yaml
policies:
  require_human_approval_before_merge: boolean
  forbid_direct_main_branch_write: boolean
  require_diff_summary: boolean
  require_tests_for_code_change: boolean
  preserve_failed_workspaces: boolean
  max_parallel_runs: number
  default_timeout_minutes: number
```

## State Machines

### Task Lifecycle

```
                    ┌─────────┐
                    │  DRAFT  │
                    └────┬────┘
                         │ configured
                         ▼
                   ┌─────────┐
                   │  READY  │
                   └────┬────┘
                        │ start
                        ▼
                   ┌─────────┐
              ┌───▶│ RUNNING │◀──┐
              │    └────┬────┘   │
              │         │        │
              │         │ done   │retry
              │         ▼        │
              │    ┌──────────┐  │
              │    │AGENT_DONE│  │
              │    └────┬─────┘  │
              │         │        │
              │    gates run     │
              │         ▼        │
        rejected│  ┌──────────────┤
              │  │ GATES_RUNNING│
              │  └──────┬───────┘
              │         │
              │    ┌────┴────┐
              │    ▼         ▼
              │ ┌──────┐  ┌──────┐
              └─│GATES│  │REVIEW│
               │FAILED│  │REQ'D │
                └──┬───┘  └──┬───┘
                   │        │approved
                   │        ▼
                   │    ┌─────────┐
                   │    │APPROVED │
                   │    └────┬────┘
                   │         │ merge
                   │         ▼
                   │    ┌─────────┐
                   └────│ MERGED │──▶ ARCHIVED
                        └─────────┘
```

### Run Lifecycle (Agent Execution)

```
        ┌────────┐
        │ QUEUED │
        └───┬────┘
            │ spawn
            ▼
       ┌─────────┐
       │SPAWNING │───┐
       └────┬────┘   │ failed/cancel
            │        │
            │ ready  │
            ▼        │
       ┌─────────┐  │
       │ RUNNING │──┤
       └────┬────┘  │
            │       │
            │stop   │
            ▼       │
       ┌─────────┘  │
    ┌──┤STOPPING ├──┘
    │  └────┬────┘
    │       │
    │  ┌────┴────┐
    │  ▼         ▼         ▼
    │┌──────┐ ┌──────┐ ┌──────────┐
    ││SUCCEED│ │FAILED│ │CANCELLED │
    │└──────┘ └──────┘ └──────────┘
    └──────────────────────────────
```

## Design Principles

### 1. Isolation Over Speed
Each agent runs in an isolated git worktree. No two agents modify the same files simultaneously. Failed workspaces are preserved for inspection.

### 2. Evidence Over Confidence
Agents don't declare success—quality gates do. Tests must pass, lint must be clean, types must check. Evidence is external to the agent's claims.

### 3. Human Owns Merge
Agents propose, humans decide. The merge button is sacred. Automation stops at the review boundary.

### 4. Review Is First-Class
Review isn't a post-process—it's woven into the lifecycle. Tasks can't merge without review (unless explicitly overridden).

### 5. CLI First, Web Second, MCP Third
- **CLI** - Primary interface, works everywhere
- **Web** - Visual dashboard for monitoring and approval
- **MCP** - Integration point for other tools

## Package Contents

```
@onemancompany/flock-kernel/
├── src/
│   ├── types.ts           # All core types
│   ├── schemas.ts         # Zod validation schemas
│   ├── task-state-machine.ts
│   ├── run-state-machine.ts
│   ├── db/
│   │   ├── schema.ts      # Drizzle ORM schema
│   │   └── client.ts      # Database client
│   ├── config.ts          # YAML config loader
│   └── index.ts           # Barrel exports
└── package.json
```

## License

MIT

## Contributing

This is part of the One Man Company monorepo. See the main README for contribution guidelines.
