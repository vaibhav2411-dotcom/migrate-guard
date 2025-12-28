# 🛡️ Migrate Guard – Secure, Automated Website Migration Testing Suite 🚀

> **Supercharge your website migrations:** Spot regressions, catch visual issues, track data and functional differences, and deliver *risk-free* launches—all from one unified platform!

---

<div align="center">
  <img src="https://img.shields.io/badge/Production%20Ready-Yes-brightgreen" alt="Status" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-blue" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Automation-✔️-slateblue" />
  <img src="https://img.shields.io/badge/API-RESTful-fuchsia" />
  <img src="https://img.shields.io/badge/AI-Powered-98C8FF?logo=openai&logoColor=white" />
</div>

---

> 👉 **New here?** Start with the [Developer Onboarding Guide](./DEVELOPERS.md) for setup, API usage, automation, best practices, and everything you need to be productive quickly!

## ✨ What is Migrate Guard?

**Migrate Guard** is an all-in-one automated website migration testing toolkit. It lets engineering/product/QA teams run side-by-side production/candidate comparisons and generate human-friendly reports for Go/No-Go launches and retro analysis.

- **Visual regressions:** Detect pixel diffs, layout shifts, and subtle UI changes
- **Functional QA:** Broken link detection, navigation & forms, JS errors, HAR analysis
- **Data validation:** Compare DOM/text, tables, JSON APIs, and key field mappings
- **AI-powered executive risk analysis:** Severity, risk scores, recommendations (Azure OpenAI!)
- **Super-powered dev workflow:** Snapshots, artifact management, and integrated REST API


## 🗂️ Project Structure

```txt
migrate-guard/
├── backend/          # Node.js Fastify + TypeScript API
│   ├── src/
│   │   ├── routes/   # API routes
│   │   ├── services/ # Comparison, diff, agent, QA, reasoning
│   │   ├── models/   # Strongly typed data models
│   │   └── config/   # Backend config
│   └── data/         # Persisted jobs, runs, artifacts
│   └── README.md     # Backend how-to
├── src/              # React 18 Frontend
│   ├── components/   # UI primitives & dashboard
│   ├── pages/        # Page views
│   ├── lib/          # Types, store, API, utils
│   └── hooks/        # Custom hooks
├── API.md            # Full backend OpenAPI
├── DEVELOPERS.md     # Developer onboarding & conventions
├── README.md         # 👈 You are here!
```


## ⚙️ Tech Stack

**Frontend:** React 18 + Vite + TypeScript · Zustand · TanStack Query · TailwindCSS · shadcn-ui

**Backend:** Fastify · TypeScript · Playwright · pixelmatch · pngjs · Azure OpenAI · File/JSON Storage

## 🎛️ Core Features

- 🤝 **Dual-site diffing**: Compare baseline vs. candidate (prod vs. migration)
- 🖼️ **Visual diffs**: Screenshot, pixel & layout analysis (heatmaps, metrics)
- 🧑‍💻 **Functional QA**: Crawls, forms, broken links, JS errors, HARs
- 📜 **Data Integrity**: Tables, text, APIs—fieldwise diffing
- 🤖 **AI Reasoning**: Severity classification, risk scores, recommendations (Azure/GPT-4)
- 📊 **Automated Reports**: Executive & technical summary, Go/No-Go
- 🗄️ **Artifact Management**: All results, logs, screenshots available for download


--

## 🏗️ API Overview  
Full REST API Docs ➡️ [backend/API.md](./backend/API.md)

**Key Endpoints:**
- `POST /api/jobs` - Create a comparison job
- `POST /api/jobs/:id/run` - Trigger a run
- `GET /api/runs/:id/artifacts` - Fetch run artifacts
- `POST /api/jobs/migrate` - Migrate legacy jobs

Supports:
- 🕸️ Crawl settings: depth, include/exclude
- 🗂️ Page mapping
- 🌐 Test matrix: visual, functional, data, SEO


## 👨‍💻 Quickstart

**Frontend:**
```sh
npm install      # in root
yarn dev         # or npm run dev
# Open http://localhost:8080
```
**Backend:**
```sh
cd backend
npm install
# Install browsers for Playwright crawl agent
npx playwright install chromium
npm run dev      # API at http://localhost:4000/api
```

See [backend/README.md](./backend/README.md) for full setup & CLI options.


## 🧩 Architecture Highlights

### Agents & Services
- **CrawlAgent**: Dual-site crawler, sitemap support, page matcher
- **PlaywrightExecutionService**: Browser/DOM/screenshot/console collector
- **VisualDiffService**: Pixel, layout, and heatmap insight
- **FunctionalQaAgent**: Navigation, forms, links, JS errors, HAR capture
- **DataIntegrityAgent**: Table/text/API comparison, similarity scoring
- **AiReasoningService**: Uses Azure OpenAI for intelligent artifact analysis
- **ReportAgent**: Executive reports, markdown & JSON, Go/No-Go

### Artifact Pipeline
- All artifacts (screenshots, HAR, logs, reports) organized per run in `/backend/data/artifacts/{runId}`
- Executive and technical Markdown reports generated for each run

### Config & Extensibility
- JSON files for jobs/runs -> Plug in DB or cloud storage later
- TODOs in code for Playwright MCP, Crawl4AI, further AI & agent orchestration


---

## 🏁 Roadmap / Phase 2
- [ ] 🚦 **Full end-to-end browser automation** (Playwright MCP, Crawl4AI)
- [ ] 🧠 **AI-powered diff explanations** (Azure OpenAI everywhere)
- [ ] 🧮 **SEO & accessibility agents**
- [ ] 🧩 **Pluggable pipeline orchestration (Agent Framework)**
- [ ] 📈 **Historical run analysis & dashboard**
- [ ] 🛡️ **Role-based access control, multi-user**
- [ ] 🌍 **Production deployment guides**

---

## 🙏 Contributing & Community

Pull requests and issues are always welcome!

- Please see the internal [backend/README.md](./backend/README.md) for technical contributing guidelines.
- Consider opening an issue, or fork for your own pipelines.
- We love feedback and stars ⭐️!

---

**Migrate Guard** – Secure your migrations, delight your users, and sleep better at night. 🚀🛡️

## 🧪 Testing

- **Backend tests:**
  - Run all backend tests: `cd backend && npm test` (see `backend/tests/` for entry points)
- **Frontend tests:**
  - Add or run tests in `src/pages/` as needed (see project conventions)

## 🧹 Linting & Formatting

- Lint all code: `npm run lint` (uses flat config)
- TypeScript strict mode is enforced throughout the project.

## 🛠️ Extending & Contributing

- Add new agents/services in `backend/src/services/` and models in `backend/src/models/`
- Extend the API in `backend/src/routes/api.ts` using strong schema validation
- Follow conventions in `DEVELOPERS.md` for testability, feature flags, and separation of concerns

## 📦 Artifacts & Outputs

- All run outputs (screenshots, HAR, logs, reports) are stored under `backend/data/artifacts/{runId}`
- Artifacts are organized per run and available for download via the API

## 🧩 Feature Flags & Test Matrix

- Feature flags and test matrices are used to enable/disable AI, diff, QA, and other features
- Configure these in the relevant config or test files as described in `DEVELOPERS.md`

## 📚 References

- [DEVELOPERS.md](./DEVELOPERS.md): Developer onboarding, conventions, and extending
- [API.md](./API.md): Full backend API documentation
- [.github/copilot-instructions.md](.github/copilot-instructions.md): AI agent and codegen guidance

## 🏗️ Architecture

```mermaid
---
config:
  layout: elk
---
flowchart TB
 subgraph Frontend["React 18 + Vite"]
        UI["UI Components / Pages"]
        APIClient["API Client (src/lib/api.ts)"]
  end
 subgraph Backend["Node.js Fastify API"]
        APIRouter["REST API (routes/api.ts)"]
        Agents["Agents/Services (src/services/)"]
        Models["Types/Models (src/models.ts)"]
        Config["Config (src/config/)"]
        Artifacts["Artifacts (data/artifacts/{runId})"]
  end
 subgraph AI["AI Integration"]
        AIReasoning["AI Reasoning Service (Azure OpenAI)"]
  end
    UI --> APIClient
    APIRouter --> Agents & Config
    Agents --> Artifacts & Models
    APIClient -- HTTP/JSON --> APIRouter
    Artifacts -. Download/View .-> UI
    Agents -- Risk/Analysis --> AIReasoning
```

## 🖼️ Architecture Diagrams

Below are the maintained Mermaid diagrams (also available in `resources/`) to help visualize the system. Click the link to view the raw `.mmd` sources.

### Component Diagram ✅
- Source: `resources/architecture-component-diagram.mmd`

![Component Diagram](resources/images/architecture-component-diagram.png)

*What's shown:* logical components and their primary relationships (frontend, API router, agents/services, artifacts, and AI reasoning).

```mermaid
---
config:
  layout: elk
---
flowchart TD
  subgraph Frontend ["React 18 + Vite"]
    UI["UI Components / Pages"]
    APIClient["API Client (src/lib/api.ts)"]
    UI --> APIClient
  end
  subgraph Backend ["Node.js Fastify API"]
    APIRouter["REST API (routes/api.ts)"]
    Agents["Agents/Services (src/services/)"]
    Models["Types/Models (src/models.ts)"]
    Config["Config (src/config/)"]
    Artifacts["Artifacts (data/artifacts/{runId})"]
    APIRouter --> Agents
    Agents --> Artifacts
    Agents --> Models
    APIRouter --> Config
  end
  APIClient -- HTTP/JSON --> APIRouter
  Artifacts -.->|Download/View| UI
  subgraph AI["AI Integration"]
    AIReasoning["AI Reasoning Service (Azure OpenAI)"]
  end
  Agents -- Risk/Analysis --> AIReasoning
```

### Sequence Diagram ✅
- Source: `resources/architecture-sequence-diagram.mmd`

![Sequence Diagram](resources/images/architecture-sequence-diagram.png)

*What's shown:* high-level interaction flow between user, frontend, API, agents, artifact store, and AI reasoning service.

```mermaid
sequenceDiagram
  participant User
  participant Frontend as React App
  participant API as Fastify API
  participant Agent as Service Agent
  participant Artifact as Artifact Store
  participant AI as AI Reasoning

  User->>Frontend: Initiate migration test
  Frontend->>API: POST /api/jobs
  API->>Agent: Start crawl/QA/diff
  Agent->>Artifact: Store run outputs
  Agent->>AI: Analyze results (optional)
  AI-->>Agent: Risk/Recommendation
  Agent->>API: Report status/results
  API->>Frontend: Respond with run status/artifacts
  Frontend->>User: Show results, download artifacts
```

### Tech Stack (Overview) ✅
- Source: `resources/architecture-tech-stack.mmd`

![Tech Stack](resources/images/architecture-tech-stack.png)

*What’s shown:* relative weight of the major stacks used in the project (frontend, backend, automation, AI, UI libs).

**Migrate Guard** is structured as a strict TypeScript monorepo with clear backend/frontend separation:

- **Backend (Node.js, Fastify, TypeScript):**
  - Modular "agents" in `backend/src/services/` for crawling, QA, visual diff, data validation, and AI-powered reporting.
  - RESTful API in `backend/src/routes/api.ts` exposes all core operations.
  - Strongly typed models in `backend/src/models.ts`.
  - All persistent data and artifacts (screenshots, HAR, logs, reports) are stored under `backend/data/artifacts/{runId}`.
  - Configurable via files in `backend/src/config/`.
  - Feature flags and test matrices enable/disable AI, diff, QA, etc.

- **Frontend (React 18, Vite, TypeScript):**
  - UI components in `src/components/`, page views in `src/pages/`, and shared types in `src/lib/types.ts`.
  - State management and API logic in `src/lib/store.ts` and `src/lib/api.ts`.
  - Connects to backend API for job/runs management, artifact viewing, and reporting.

- **Extensibility:**
  - Add new agents/services in `backend/src/services/` and extend models in `backend/src/models/`.
  - API endpoints are added in `backend/src/routes/api.ts` with strong schema validation.
  - All config is JSON or TypeScript—no hardcoded values.

- **Data Flow:**
  - Jobs and runs are created via the API, triggering agents to process sites and generate artifacts.
  - Artifacts are stored per run and accessed via the API and frontend dashboard.

- **AI Integration:**
  - `AiReasoningService` uses Azure OpenAI for risk analysis and recommendations.
  - AI features are controlled via feature flags and test matrices.
