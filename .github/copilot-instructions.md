# Copilot Instructions for Migrate Guard

## Project Overview
- **Migrate Guard** is a TypeScript monorepo for automated website migration testing.
- Backend: Fastify API (Node.js, TypeScript) in `backend/` with agents for crawling, QA, visual diff, data validation, and AI-powered reporting.
- Frontend: React 18 (Vite, TypeScript) in `src/` for dashboards, artifact views, and project management.

## Key Architectural Patterns
- **Agents** (in `backend/src/services/`):
  - `CrawlAgent`: Dual-site crawling, sitemap, page mapping
  - `PlaywrightExecutionService`: Browser automation, screenshots, DOM, console
  - `VisualDiffService`: Pixel/layout/heatmap diffs
  - `FunctionalQaAgent`: Navigation, forms, links, JS errors, HAR
  - `DataIntegrityAgent`: Table/text/API diff, similarity scoring
  - `AiReasoningService`: Azure OpenAI for risk analysis, recommendations
  - `ReportAgent`: Markdown/JSON reports, Go/No-Go
- **Artifacts**: All run outputs (screenshots, HAR, logs, reports) are stored under `backend/data/artifacts/{runId}`
- **API**: RESTful endpoints in `backend/src/routes/api.ts` (see `API.md` for full docs)
- **Config**: All environment and storage config in `backend/src/config/`
- **Types**: Shared and strict TypeScript types in `backend/src/models.ts` and `src/lib/types.ts`

## Developer Workflows
- **Install**: `npm install` (root or `backend/`)
- **Backend dev**: `cd backend && npm run dev` (API at http://localhost:4000/api)
- **Frontend dev**: `npm run dev` (Vite, port 8080)
- **Playwright**: `npx playwright install chromium` (required for crawl/QA)
- **Lint**: `npm run lint` (flat config)
- **Build**: `npm run build` (frontend)
- **Test**: See `backend/tests/` and `src/pages/` for test entry points
- **Artifacts**: All persistent data is file-based JSON in `backend/data/`

## Project Conventions
- TypeScript strict mode everywhere
- All services/agents use explicit interfaces and are injectable/mocked for testability
- Extend with new agents in `backend/src/services/`, new models in `backend/src/models/`
- API validation with strong schemas
- Feature flags and test matrices for enabling/disabling AI, diff, QA, etc.
- TODOs/FIXMEs in code for future agent/AI work
- Keep backend and frontend cleanly separated

## Integration & Extensibility
- Add new API endpoints in `backend/src/routes/api.ts`
- Plug new analytics/AI into `ReportAgent` or `AiReasoningService`
- All config is JSON or TypeScript, no hardcoded values


## References
- [README.md](../README.md): High-level overview, architecture, onboarding
- [DEVELOPERS.md](../DEVELOPERS.md): Dev setup, conventions, extending
- [API.md](../API.md): Full backend API docs


---
For any unclear patterns or missing conventions, consult the above docs or ask for clarification in code review.
