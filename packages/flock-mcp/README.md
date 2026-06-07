# Flock MCP

Model Context Protocol (MCP) server for Flock - enables Claude Code to control Flock directly.

## Overview

Flock MCP provides a set of tools that allow Claude Code to interact with the Flock agent control tower. Through this MCP server, Claude can:

- Create and manage projects
- Create and track tasks
- Manage task dependencies
- Query project and task status

## Installation

The MCP server is distributed as part of the Flock CLI. Ensure you have Flock installed:

```bash
npm install -g @onemancompany/flock-cli
```

Or use npx:

```bash
npx @onemancompany/flock-cli
```

## Configuration

Add Flock MCP to your Claude Code `settings.json`:

```json
{
  "mcpServers": {
    "flock": {
      "command": "npx",
      "args": ["@onemancompany/flock-cli", "mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

Replace `/path/to/your/project` with the actual path to your project containing the `.flock` directory.

## Available Tools

### Project Tools

#### `flock_project_list`
List all Flock projects.

**Returns:** Array of projects with id, name, repo path, and creation date.

#### `flock_project_create`
Create a new Flock project.

**Parameters:**
- `name` (string): Project name
- `repoPath` (string): Path to the repository
- `defaultBranch` (string): Default branch name (default: "main")

**Returns:** Created project details.

#### `flock_project_status`
Get project status with task counts.

**Parameters:**
- `projectId` (string): Project ID

**Returns:** Project details with task counts by status.

### Task Tools

#### `flock_task_create`
Create a new task in a project.

**Parameters:**
- `projectId` (string): Project ID
- `title` (string): Task title
- `description` (string, optional): Task description
- `priority` (string, optional): Task priority (low/medium/high/critical, default: medium)
- `requiresReview` (boolean, optional): Whether review is required (default: true)

**Returns:** Created task details.

#### `flock_task_list`
List tasks in a project.

**Parameters:**
- `projectId` (string): Project ID
- `status` (string, optional): Filter by task status
- `priority` (string, optional): Filter by priority

**Returns:** Array of tasks matching filters.

#### `flock_task_status`
Get detailed task status.

**Parameters:**
- `taskId` (string): Task ID

**Returns:** Task details with runs, gates, and reviews.

#### `flock_task_update`
Update a task.

**Parameters:**
- `taskId` (string): Task ID
- `status` (string, optional): New status
- `priority` (string, optional): New priority

**Returns:** Updated task details.

#### `flock_task_deps_add`
Add a task dependency.

**Parameters:**
- `taskId` (string): Task ID
- `dependsOnTaskId` (string): Task ID that this task depends on

**Returns:** Success message.

#### `flock_task_deps_remove`
Remove a task dependency.

**Parameters:**
- `taskId` (string): Task ID
- `dependsOnTaskId` (string): Task ID to remove dependency on

**Returns:** Success message.

## Usage Example

Once configured, you can ask Claude to:

```
"Create a new task in the default project to add user authentication"
```

```
"List all pending tasks"
```

```
"Show the status of task-001"
```

```
"Create a task for the frontend work that depends on the API task being complete"
```

## Development

The MCP server is built with:

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `@onemancompany/flock-kernel` - Flock database and types
- `zod` - Schema validation
- `drizzle-orm` - Database ORM

### Running Tests

```bash
pnpm test packages/flock-mcp
```

### Building

```bash
pnpm build
```

## Architecture

The MCP server (`src/server.ts`):
1. Initializes with a FlockDatabase connection
2. Registers all Flock tools with the MCP server
3. Connects via stdio transport
4. Handles tool requests and returns formatted results

Each tool handler:
1. Validates input using Zod schemas
2. Interacts with the Flock database
3. Returns results in MCP-compatible format

## License

MIT
