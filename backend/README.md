# Migrate Guard Backend

Fastify + TypeScript control plane for website migration testing.

## Overview

The backend provides REST APIs for managing migration comparison jobs, test runs, and artifacts. It uses JSON-based file storage for persistence and is designed to integrate with Playwright MCP, Crawl4AI, Azure OpenAI, and MS Agent Framework in Phase 2.

## Running locally

### Prerequisites
- Node.js (v18 or higher)
- npm

### Setup

```sh
npm install
npm run dev
```

The server listens on `http://localhost:4000` by default and exposes REST APIs under `/api`.

### Build

```sh
npm run build
npm start
```

### Testing

```sh
npm test
```

## API Endpoints

See [API.md](./API.md) for complete API documentation.

### Quick Reference

- **Health Check:** `GET /health`
- **Jobs:** `GET|POST /api/jobs`, `GET|PUT|DELETE /api/jobs/:id`
- **Trigger Run:** `POST /api/jobs/:id/run`
- **Runs:** `GET /api/runs`, `GET /api/runs/:id`
- **Artifacts:** `GET /api/runs/:id/artifacts`

## Architecture

### Project Structure

```
backend/
├── src/
│   ├── config/        # Configuration (ports, paths)
│   ├── models/        # TypeScript interfaces and types
│   ├── routes/        # Fastify route handlers
│   ├── services/      # Business logic
│   │   ├── domainServices.ts  # Job and Run services
│   │   └── fileStorage.ts      # JSON file-based storage
│   └── server.ts      # Fastify server bootstrap
├── data/              # JSON storage (auto-created)
│   └── snapshot.json  # Persistent data
└── tests/             # Test files
```

### Storage

Currently uses JSON file-based storage (`data/snapshot.json`). This is designed to be easily replaceable with a database in the future.

### Phase 2 Integration Points

The following areas are marked with TODO comments for Phase 2 integration:

1. **Run Execution** (`src/services/domainServices.ts`):
   - Playwright MCP for browser automation
   - Crawl4AI for content extraction
   - Azure OpenAI for intelligent comparison
   - MS Agent Framework for orchestration

2. **Artifact Generation**:
   - Screenshots from Playwright
   - Logs from test execution
   - Comparison reports from AI analysis

See the code for detailed TODO comments at each integration point.

## Development

### Adding New Endpoints

1. Define types in `src/models.ts`
2. Add service methods in `src/services/domainServices.ts`
3. Add route handlers in `src/routes/api.ts`
4. Add request validation schemas

### Error Handling

- 404: Resource not found
- 400: Bad request (validation errors)
- 500: Internal server error

## CORS

CORS is enabled for all origins in development to allow frontend integration. Configure in `src/server.ts` for production.
