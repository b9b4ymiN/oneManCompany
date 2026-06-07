# Flock Phase 3: Multi-Agent DAG

## Brief
Add task dependency management, parallel agent execution, auto-retry, reviewer agents, and debate/review mode to Flock. This transforms Flock from sequential single-agent runs to a full multi-agent orchestration engine.

## What Phase 3 Adds to flock-kernel

### 1. Task Dependency Engine
- DAG-based task ordering using existing `task_dependencies` table
- Dependency resolution: task can't start until all depends_on tasks complete
- Circular dependency detection
- Dependency status propagation

### 2. Parallel Run Scheduler
- Execute multiple runs for the same task simultaneously (different agents)
- Respect `max_parallel_runs` policy
- Queue management with priority ordering
- Run allocation: assign agents to tasks based on availability

### 3. Auto-Retry Engine
- Configurable retry policy per task/agent
- Retry on gate failure (GATES_FAILED → RUNNING with human override or auto)
- Retry on agent crash (FAILED → retry with same or different agent)
- Max retry count with escalation to human

### 4. Reviewer Agent Mode
- Agents with `mode: readonly` can be assigned as reviewers
- Review runs produce Review records (not code changes)
- Review verdicts can gate task progression
- Multi-reviewer consensus (2/3 approve = pass)

### 5. Multi-Agent Workflow Patterns
- Implement pattern: Claude implements → Codex tests → Gemini reviews → Validator gates
- Sequential chain: task A completes → triggers task B
- Parallel fan-out: task A completes → triggers tasks B, C, D simultaneously
- Fan-in: tasks B, C, D all complete → triggers task E

## Definition of Done
- Task with 3 agents: Claude implements, Codex writes tests, Gemini reviews
- DAG enforcement: dependencies respected, circular deps rejected
- Parallel runs: 2+ agents running on same task simultaneously
- Auto-retry: failed gate retries automatically up to max count
- Review gate: task requires N approvals before merge
- All existing tests still pass
- New tests for DAG, scheduler, retry, and reviewer features
