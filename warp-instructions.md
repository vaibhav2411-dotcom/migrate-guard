I have an existing frontend repo for a website migration testing tool.
I want to add a backend service.

Goal:
Build a backend control plane for website migration testing that will later integrate:
- Playwright MCP
- Crawl4AI
- Azure OpenAI
- MS Agent Framework

Phase 1 Requirements (NO testing yet):

1. Tech stack:
   - Node.js
   - Fastify
   - TypeScript

2. Responsibilities:
   - Manage migration comparison jobs
   - Store prod and migrated URLs
   - Trigger test runs (placeholder)
   - Store run status and artifacts metadata
   - Expose REST APIs for frontend

3. APIs:
   - POST /api/jobs
   - GET /api/jobs
   - GET /api/jobs/:id
   - POST /api/jobs/:id/run
   - GET /api/runs
   - GET /api/runs/:id
   - GET /api/runs/:id/artifacts

4. Storage:
   - Simple JSON or filesystem-based storage for now
   - Easy to replace with DB later

5. Structure:
   backend/
     src/
       routes/
       services/
       models/
       config/
     data/
     README.md

6. Important:
   - Do NOT implement Playwright or Crawl logic yet
   - Add clear TODO comments where those will integrate
   - Code must run locally with npm install && npm run dev

Generate the complete backend module ready to drop into my existing repo.
