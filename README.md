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
├── WARP.md           # Warp/Lovable/dev workflow
├── warp-instructions.md # Dev onboarding
└── README.md         # 👈 You are here!
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


## 💻 Developer & Onboarding Resources

- [backend/README.md](./backend/README.md) — Backend dev guide
- [API.md](./API.md) — Full documented API
- [WARP.md](./WARP.md) — CLI, project automation, and Lovable/warp integration
- [warp-instructions.md](./warp-instructions.md) — Additional onboarding & scripting

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