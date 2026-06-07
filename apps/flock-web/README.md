# Flock Web

Agent Control Tower web interface — Next.js 15 App Router application.

## Features

- Dashboard with activity overview
- Project management
- Task tracking with runs, gates, and reviews
- Live run logs
- Dark theme by default

## Tech Stack

- Next.js 15 with App Router
- TypeScript
- Tailwind CSS v4
- TanStack Query (React Query)

## Development

```bash
# Install dependencies
pnpm install

# Run dev server (proxies /api to localhost:3100)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## API Proxy

The app proxies all `/api/*` requests to the flock-api server at `localhost:3100`. Ensure the API server is running before starting the web app.
