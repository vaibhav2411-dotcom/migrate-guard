# Developers Guide

This guide documents local setup, architecture, and common workflows for Migrate Guard.

## Prerequisites

- Node.js 20+
- npm 10+
- Playwright browser binaries

## Local Setup

### Frontend

1. Install dependencies in repository root.
2. Start dev server on port 8080.

```sh
npm install
npm run dev
```

### Backend

1. Install dependencies in backend folder.
2. Install Playwright Chromium.
3. Start API on port 4000.

```sh
cd backend
npm install
npx playwright install chromium
npm run dev
```

## Test and Lint

### Backend tests

```sh
cd backend
npm test
```

### Root lint

```sh
npm run lint
```

## Architecture Overview

- Frontend: React + Vite in src.
- Backend API: Fastify + TypeScript in backend/src.
- Artifacts: persisted per run under backend/data/artifacts/{runId}.
- Snapshot storage: backend/data/snapshot.json.

### Core pipeline sequence

1. Job is created with baseline and candidate URLs.
2. Run is triggered via POST /api/jobs/:id/run.
3. Backend orchestrates crawl and Playwright execution.
4. Visual, functional, data, SEO, security, performance stages run based on runtime controls.
5. AI reasoning and report generation complete the run.
6. Artifacts and reports are stored under backend/data/artifacts/{runId}.

## Feature Flags

Configured in backend/src/config/config.ts.

- FEATURE_AI_REASONING=true|false
- ENABLE_AI_REASONING=true|false (runtime override)
- FEATURE_VISUAL_DIFF=true|false
- FEATURE_FUNCTIONAL_QA=true|false
- FEATURE_DATA_INTEGRITY=true|false
- FEATURE_SEO_VALIDATION=true|false
- FEATURE_PERF_METRICS=true|false
- FEATURE_SECURITY_HEADERS=true|false
- FEATURE_UI_INTEGRITY=true|false
- FEATURE_ACCESSIBILITY_CHECKS=true|false

## API Reference

See API.md at repository root.

## Implementation Conventions

- TypeScript strict mode.
- Services should remain composable and testable.
- Do not hardcode environment-specific values.
- Keep frontend and backend concerns separated.

## Common Troubleshooting

### AI reasoning does not run

- Verify FEATURE_AI_REASONING=true or ENABLE_AI_REASONING=true.
- Verify Azure/OpenAI credentials are set.

### Missing screenshots/artifacts

- Verify Playwright Chromium is installed.
- Verify backend process can write to backend/data.

### Run fails at URL validation

- Ensure create job payload includes either:
  - baselineUrl and candidateUrl, or
  - legacy sourceUrl and targetUrl.
