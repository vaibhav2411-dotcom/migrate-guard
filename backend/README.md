# Migrate Guard Backend

Fastify + TypeScript control plane for website migration testing.

## Overview

The backend provides REST APIs for managing migration comparison jobs, test runs, and artifacts. It uses JSON-based file storage for persistence and is designed to integrate with Playwright MCP, Crawl4AI, Azure OpenAI, and MS Agent Framework in Phase 2.

## Running locally

### Prerequisites
- Node.js (v18 or higher)
- npm
- Playwright browsers (installed automatically on first run, or manually with `npx playwright install chromium`)

### Setup

```sh
npm install
npx playwright install chromium  # Install Playwright browsers
npm run dev
```

**Note:** Playwright browsers are required for the CrawlAgent. They will be installed automatically on first use, but you can install them manually with `npx playwright install chromium`.

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

### CrawlAgent

The `CrawlAgent` (`src/services/crawlAgent.ts`) provides website crawling capabilities:

- **Dual-site crawling**: Crawls both baseline and candidate URLs
- **Sitemap support**: Automatically reads `sitemap.xml` if present
- **URL normalization**: Normalizes URLs for stable comparison
- **Page matching**: Matches equivalent pages between sites using:
  - Explicit pageMap mappings
  - Exact path matching
  - Title-based matching
- **Crawl configuration**: Respects `crawlConfig` (depth, include/exclude paths, maxPages)
- **Artifact storage**: Stores crawl results, logs, and generated pageMap

The CrawlAgent is integrated into the run lifecycle and automatically executes when a comparison run is triggered.

### PlaywrightExecutionService

The `PlaywrightExecutionService` (`src/services/playwrightExecutionService.ts`) provides browser execution capabilities:

- **Dual browser contexts**: Launches separate browser contexts for baseline and candidate sites
- **Screenshot capture**: Captures screenshots per page and viewport (desktop, tablet, mobile)
- **DOM snapshots**: Captures full HTML and text content for each page and viewport
- **Console error capture**: Records all console messages (log, error, warning, info, debug)
- **Network monitoring**: Tracks all network requests and captures failures
- **Structured artifacts**: Returns organized execution results with all captured data

The PlaywrightExecutionService executes on matched pages from the CrawlAgent and runs both sites in parallel for efficient comparison.

### VisualDiffService

The `VisualDiffService` (`src/services/visualDiffService.ts`) provides visual comparison capabilities:

- **Screenshot comparison**: Compares baseline vs candidate screenshots using pixel-level diffing
- **Layout shift detection**: Identifies layout shifts between baseline and candidate
- **Pixel diff metrics**: Calculates percentage of different pixels and diff ratios
- **Heatmap generation**: Creates visual heatmaps showing difference intensity (red = high, yellow = medium, green = low)
- **Severity classification**: Categorizes differences as none, low, medium, high, or critical
- **Structured metrics**: Outputs comprehensive diff statistics and summaries

The VisualDiffService automatically executes when `testMatrix.visual` is enabled and compares all captured screenshots across all viewports.

### FunctionalQaAgent

The `FunctionalQaAgent` (`src/services/functionalQaAgent.ts`) provides functional QA testing capabilities:

- **Navigation validation**: Validates page navigation, checks status codes, and tracks redirect chains
- **Form submission**: Automatically fills and submits forms with test data, validates responses
- **Broken link detection**: Detects broken internal links by attempting navigation and checking status codes
- **JavaScript error capture**: Captures console errors, page errors, and unhandled promise rejections
- **HAR file capture**: Records network activity in HAR (HTTP Archive) format for analysis

The FunctionalQaAgent integrates with PlaywrightExecutionService and uses the same browser contexts for efficient execution. It automatically executes when `testMatrix.functional` is enabled.

### DataIntegrityAgent

The `DataIntegrityAgent` (`src/services/dataIntegrityAgent.ts`) provides data integrity validation:

- **Text content extraction**: Extracts visible text, headings, paragraphs, and links from pages
- **Structured data comparison**: Compares tables, pricing information, and JSON API responses
- **Field-level diffing**: Highlights missing, changed, or mismatched fields with detailed paths
- **Similarity scoring**: Calculates text similarity scores (0-1) between baseline and candidate
- **Structured diffs**: Generates structured diff reports with field-level comparisons

The DataIntegrityAgent compares:
- **Tables**: Headers, rows, and cells with position tracking
- **Pricing**: Amount, currency, and pricing structure
- **JSON APIs**: Deep comparison of JSON-LD structured data and API responses
- **Text content**: Word-level and sentence-level comparisons

It automatically executes when `testMatrix.data` is enabled and uses browser contexts from PlaywrightExecutionService.

### AiReasoningService

The `AiReasoningService` (`src/services/aiReasoningService.ts`) provides AI-powered analysis using Azure OpenAI:

- **Artifact analysis**: Analyzes all test artifacts (visual, functional, data, seo)
- **Severity classification**: Categorizes issues as none, low, medium, high, or critical
- **Confidence scoring**: Provides confidence scores (0-1) for each analysis
- **False positive detection**: Identifies cosmetic changes and non-critical differences
- **Expected change filtering**: Recognizes intentional migrations and expected updates
- **Pass/Fail recommendation**: Provides clear go/no-go recommendations

The service uses Azure OpenAI (configurable via environment variables) and falls back to rule-based analysis if not configured. It automatically executes at the end of the test run to provide comprehensive analysis.

**Configuration:**
- `AZURE_OPENAI_ENDPOINT` - Azure OpenAI endpoint URL
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT_NAME` - Deployment name (default: 'gpt-4')

### ReportAgent

The `ReportAgent` (`src/services/reportAgent.ts`) generates comprehensive migration test reports:

- **Executive summary**: High-level overview with key metrics and Go/No-Go decision
- **Technical findings**: Detailed findings for each category with severity and impact
- **Risk score calculation**: Calculates risk scores (0-100) for overall and per-category
- **Go/No-Go decision**: Provides clear deployment recommendation
- **Markdown output**: Human-readable markdown report
- **JSON output**: Machine-readable JSON report for integration

The ReportAgent automatically executes after AI reasoning completes and generates reports in both markdown and JSON formats.

### Phase 2 Integration Points

The following areas are marked with TODO comments for Phase 2 integration:

1. **Test Matrix Execution** (`src/services/domainServices.ts`):
   - Visual: Screenshot comparison, layout diff
   - Functional: Interaction testing, form validation
   - Data: Content comparison, API response validation
   - SEO: Meta tags, structured data comparison

2. **AI Integration**:
   - Azure OpenAI for intelligent diff analysis
   - MS Agent Framework for orchestration

3. **Enhanced Matching**:
   - Fuzzy matching algorithms for better page matching
   - Content similarity analysis

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
