# Flock Phase 2: Web Control Tower

## Brief
Build a self-hosted web dashboard for Flock that provides real-time visibility into agent runs, task management, diff viewing, gate results, and human review — all connected to the existing flock-kernel backend.

## Scope
Create a new `apps/flock-web/` Next.js application with 5 core pages:
1. `/dashboard` — Overview of all projects, active runs, pending reviews
2. `/projects` — Project list and detail views
3. `/projects/:id/tasks` — Task list for a project
4. `/tasks/:id` — Task detail with runs, diff, gates, review
5. `/runs/:id` — Run detail with live logs

## Tech Stack
- Next.js 15 (App Router)
- React 19
- TanStack Query for data fetching
- Server-Sent Events for real-time updates
- Tailwind CSS for styling
- Monaco Editor or diff2html for diff viewing
- Drizzle ORM (shared with flock-kernel)

## Pages & Features

### Dashboard (`/dashboard`)
- Active runs count, pending reviews count, failed gates count
- Recent task activity feed
- Quick links to projects

### Task Detail (`/tasks/:id`)
- Task brief and status badge
- Assigned agents with run status
- DAG/dependencies visualization (simple list for now)
- Run timeline with event history
- Changed files list with diff viewer
- Gate results (pass/fail per gate)
- Review section with approve/reject/retry/merge buttons

### Live Logs (`/runs/:id`)
- Real-time log streaming via SSE
- Event timeline
- Agent output captured line by line

### Diff Viewer
- Side-by-side or unified diff
- File tree showing changed files
- Insertions/deletions count per file

### Review Flow
- View all pending reviews
- Approve / Request Changes / Reject buttons
- Comment field
- Gate results summary before review

## Definition of Done
- Open web and see real agent run data from SQLite
- View diff of changed files
- Press run test (gate execution)
- Press approve/reject and see status update
- Live log streaming works for active runs
- Mobile-responsive layout

## API Layer
- Create `packages/flock-api/` with Hono-based REST API
- Endpoints: GET/POST for projects, tasks, runs, gates, reviews
- SSE endpoint for live event streaming
- Shared DB access with flock-kernel

## Constraints
- Must use existing flock-kernel DB schema and types
- No separate database — share the same SQLite
- Server-side rendering where possible
- Progressive enhancement (works without JS for basic views)
