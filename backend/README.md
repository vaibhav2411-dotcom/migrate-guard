# Backend Guide

This backend service provides the comparison API and run orchestration pipeline.

## Run locally

```sh
cd backend
npm install
npx playwright install chromium
npm run dev
```

Default API base: http://localhost:4000

## Key directories

- src/routes: Fastify endpoints
- src/services: crawl, execution, diff, QA, AI, reporting
- src/config: environment and feature configuration
- data: snapshot state and run artifacts
- tests: backend test suite

## Test

```sh
npm test
```

## Artifacts

Run artifacts are stored in:

- data/artifacts/{runId}

Typical artifacts include crawl summaries, screenshots, visual diffs, QA outputs, AI reasoning output, and reports.

## API docs

See ../API.md for endpoint reference.
