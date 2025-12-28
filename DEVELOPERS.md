# 👩‍💻🚀 Migrate Guard – Developer Onboarding Guide

Welcome to the Migrate Guard Dev Team! This guide will help you set up, understand, and extend every part of the codebase. Whether you're working on backend APIs, CLI tools, cloud automation, or want to dig into the full migration pipeline, this is your starting point.

---

## 📚 Index
- [Backend Overview & Setup](#-backend-overview--setup)
- [API Reference & Testing](#-api-reference--testing)
- [Warp/Lovable & Workflow Automation](#-warp--lovable--workflow-automation)
- [Advanced Dev Instructions & Scripting](#-advanced-dev-scripting)
- [Developer Conventions & Extending](#-developer-conventions--best-practices)

---

## ⚙️ Backend Overview & Setup

> Main API and job/runs/data/control logic for the platform.

- **Stack:** Fastify + TypeScript, JSON storage (future DB-ready), Playwright, pixelmatch, OpenAI
- **Directory:** `backend/`
- **Requirements:** Node.js 18+, npm, Playwright browsers

### ⏳ Quickstart
```sh
cd backend
npm install
npx playwright install chromium
npm run dev
```
The server runs at [localhost:4000](http://localhost:4000) and exposes `/api` routes.

### 🏗️ Key Files/Folders
- `src/routes/` - RESTful API endpoints
- `src/services/` - All core agents/services (crawl, playwright, visual diff, data, AI, report)
- `src/models/` - Types, interfaces, domain models
- `src/config/` - Environment/config
- `data/` - File-based, persistent storage

### 🛰️ Backend Architecture – Agents & Pipeline
- **CrawlAgent:** Dual-site/sitemap crawling, page mapping, artifact storage
- **PlaywrightExecutionService:** Browser execution, screenshots, DOM, console, network
- **VisualDiffService:** Pixel/layout/heatmap diffs, severity
- **FunctionalQaAgent:** Forms, navigation, broken links, HAR, JS errors
- **DataIntegrityAgent:** Table, text, API diffing with similarity scores
- **AiReasoningService:** Azure OpenAI for severity, confidences, false positive detection, recommendations
- **ReportAgent:** Executive/technical summaries, markdown/JSON, Go/No-Go

---

## 📖 API Reference & Testing

See [backend/API.md](backend/API.md) for **complete, detailed API endpoint docs**, including:
- All request/response types
- Example usage (`curl ...` shown for job/run/artifact endpoints)
- Full test matrix and snapshot/migration explanations

### 🏷️ Quick Reference
- `POST /api/jobs` – Create job
- `GET /api/jobs` – List jobs
- `POST /api/jobs/:id/run` – Trigger a run
- `GET /api/runs/:id/artifacts` – Fetch artifacts
- `GET /api/jobs/migrate` – Migrate legacy jobs

### 🔍 Advanced
- [backend/API.md](backend/API.md) covers data models, advanced usage (explicit page map), and all integration points for: Playwright, Crawl4AI, AI diff, SEO, and more.

---

## ⚡ Warp, Lovable & Workflow Automation

WARP.md & onboarding scripts enable **fast local/dev/prod workflow**:

- **CLI:** All npm/yarn/bun scripts ready, cross-platform (PowerShell, bash, WARP terminal, etc.)
- **Lovable Integration:**
  - Code sync with [lovable.dev](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID)
  - Live edits, auto-commit, and click-to-deploy to test/stage/prod
- **Project root:**
  - `vite.config.ts` for frontend, port 8080
  - All frontend scripts (`npm run dev`, `build`, `lint`, etc.)
  - [WARP.md](WARP.md) documents commands for install, preview, build (dev/prod), linting, test, and Lovable backwards integration

### 🛠️ Sample Local Dev
```sh
npm install              # Install deps (supports Bun too)
npm run dev              # Start dev (Vite frontend OR backend)
npm run build            # Production build
npx playwright install   # For backend test/crawls
npm run lint             # Lint with flat config
```

### 🔗 Advanced Scripting
See [warp-instructions.md](warp-instructions.md) for:
- Custom scripts/setups
- Integrating CLI workflows with CI/CD
- Additional developer onboarding

---

## ⛓️ Advanced Dev Scripting

- **JSON-based storage:** All persistent snapshots, jobs, artifacts stored in `/backend/data` (easy to port to cloud/db)
- **Extensible config:** All config in `/backend/src/config`; adapt ports, storage paths, etc.
- **Error handling:** API returns standard HTTP status codes with clear `error` payloads
- **CORS:** Enabled for cross-origin frontend/backend local dev
- **Auth:** (Pluggable) TODO: Add Role/Key-based auth as needed for prod

---

## ⚙️ Developer Conventions & Best Practices

### Project Conventions
- Use TypeScript types everywhere (strict config enforced)
- All services use explicit interfaces and are injectable/mocked for testability
- Feature flags/test matrices enable/disable AI, diff, QA, etc.
- Add TODOs/FIXMEs for future agent/AI work
- API: Always validate with strong schemas
- Keep backend and frontend as cleanly separated as possible

### Extending the Platform
- Add new services under `src/services/` and models under `src/models/`
- Extend the API using consistent patterns (`src/routes/api.ts`)
- Use the ReportAgent/AiReasoningService to plug analytics into new agents/pipelines
- Check the main [README.md](README.md) for high-level overview, onboarding, and goals


---

## 🌟 Welcome! Now go build awesome migration assurance 🚀

For code review/CI/merge workflow, see [WARP.md](WARP.md) and [README.md](README.md).

