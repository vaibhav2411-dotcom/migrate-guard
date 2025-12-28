# Migrate Guard Backend API Documentation

## Base URL
- Development: `http://localhost:4000`

## Endpoints

### Health Check
- **GET** `/health`
- Returns server status

### Jobs

#### Create Comparison Job
- **POST** `/api/jobs`
- **Request Body:**
  ```json
  {
    "name": "string (required)",
    "description": "string (optional)",
    "baselineUrl": "string (required, URI)",
    "candidateUrl": "string (required, URI)",
    "crawlConfig": {
      "depth": "number (default: 1)",
      "includePaths": ["string (optional)"],
      "excludePaths": ["string (optional)"],
      "maxPages": "number (default: 10)",
      "followExternalLinks": "boolean (default: false)"
    },
    "pageMap": [
      {
        "baselinePath": "string",
        "candidatePath": "string",
        "notes": "string (optional)"
      }
    ],
    "testMatrix": {
      "visual": "boolean (default: true)",
      "functional": "boolean (default: true)",
      "data": "boolean (default: true)",
      "seo": "boolean (default: true)"
    }
  }
  ```
- **Response:** `201 Created`
  ```json
  {
    "id": "uuid",
    "name": "string",
    "description": "string",
    "baselineUrl": "string",
    "candidateUrl": "string",
    "crawlConfig": {
      "depth": 1,
      "includePaths": [],
      "excludePaths": [],
      "maxPages": 10,
      "followExternalLinks": false
    },
    "pageMap": [],
    "testMatrix": {
      "visual": true,
      "functional": true,
      "data": true,
      "seo": true
    },
    "status": "pending",
    "createdAt": "ISO timestamp",
    "updatedAt": "ISO timestamp",
    "snapshotVersion": "2.0"
  }
  ```
- **Note:** Both `baselineUrl` and `candidateUrl` are required and must be different. The job enforces dual-site comparison.

#### List Jobs
- **GET** `/api/jobs`
- **Response:** `200 OK`
  ```json
  [
    {
      "id": "uuid",
      "name": "string",
      "description": "string",
      "sourceUrl": "string",
      "targetUrl": "string",
      "status": "pending|active|completed|failed",
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  ]
  ```

#### Get Job by ID
- **GET** `/api/jobs/:id`
- **Response:** `200 OK` or `404 Not Found`

#### Update Comparison Job
- **PUT** `/api/jobs/:id`
- **Request Body:** (all fields optional)
  ```json
  {
    "name": "string",
    "description": "string",
    "baselineUrl": "string (URI)",
    "candidateUrl": "string (URI)",
    "crawlConfig": { ... },
    "pageMap": [ ... ],
    "testMatrix": { ... },
    "status": "pending|active|completed|failed"
  }
  ```
- **Response:** `200 OK` or `404 Not Found`
- **Note:** If updating URLs, both `baselineUrl` and `candidateUrl` must be provided and different.

#### Delete Job
- **DELETE** `/api/jobs/:id`
- **Response:** `204 No Content` or `404 Not Found`
- **Note:** Also deletes associated runs and artifacts

#### Trigger Comparison Run
- **POST** `/api/jobs/:id/run`
- **Request Body:** (optional)
  ```json
  {
    "triggeredBy": "string (default: 'system')"
  }
  ```
- **Response:** `202 Accepted`
  ```json
  {
    "id": "uuid",
    "jobId": "uuid",
    "status": "queued",
    "triggeredBy": "string",
    "triggeredAt": "ISO timestamp"
  }
  ```
- **Note:** This endpoint enforces dual-site comparison. The run will compare `baselineUrl` with `candidateUrl` using the job's `crawlConfig`, `pageMap`, and `testMatrix`.

### Runs

#### List Runs
- **GET** `/api/runs`
- **Response:** `200 OK`
  ```json
  [
    {
      "id": "uuid",
      "jobId": "uuid",
      "status": "queued|running|completed|failed",
      "triggeredBy": "string",
      "triggeredAt": "ISO timestamp",
      "completedAt": "ISO timestamp (optional)"
    }
  ]
  ```

#### Get Run by ID
- **GET** `/api/runs/:id`
- **Response:** `200 OK` or `404 Not Found`

#### Get Run Artifacts
- **GET** `/api/runs/:id/artifacts`
- **Response:** `200 OK`
  ```json
  [
    {
      "id": "uuid",
      "runId": "uuid",
      "type": "log|screenshot|report|other",
      "label": "string",
      "path": "string",
      "createdAt": "ISO timestamp"
    }
  ]
  ```

## Status Values

### Job Status
- `pending` - Job created but not yet active
- `active` - Job is currently being processed
- `completed` - Job has completed successfully
- `failed` - Job has failed

### Run Status
- `queued` - Run has been queued for execution
- `running` - Run is currently executing
- `completed` - Run has completed successfully
- `failed` - Run has failed

#### Migrate Legacy Jobs
- **POST** `/api/jobs/migrate`
- **Response:** `200 OK`
  ```json
  {
    "message": "Migrated N legacy jobs to ComparisonJob format",
    "count": 0
  }
  ```
- **Note:** Migrates old Job format (sourceUrl/targetUrl) to ComparisonJob format (baselineUrl/candidateUrl). Safe to call multiple times.

## Example Usage

### Create a Comparison Job
```bash
curl -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Homepage Migration",
    "description": "Testing homepage migration from production to staging",
    "baselineUrl": "https://production.example.com",
    "candidateUrl": "https://staging.example.com",
    "crawlConfig": {
      "depth": 2,
      "maxPages": 20,
      "excludePaths": ["/admin/*", "/api/*"]
    },
    "testMatrix": {
      "visual": true,
      "functional": true,
      "data": true,
      "seo": true
    }
  }'
```

### Create a Job with Page Mapping
```bash
curl -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Pages Migration",
    "baselineUrl": "https://old.example.com",
    "candidateUrl": "https://new.example.com",
    "pageMap": [
      {
        "baselinePath": "/products/item-1",
        "candidatePath": "/products/new-item-1",
        "notes": "Product renamed during migration"
      }
    ]
  }'
```

### Trigger a Run
```bash
curl -X POST http://localhost:4000/api/jobs/{jobId}/run \
  -H "Content-Type: application/json" \
  -d '{
    "triggeredBy": "user@example.com"
  }'
```

### Get Run Artifacts
```bash
curl http://localhost:4000/api/runs/{runId}/artifacts
```

## ComparisonJob Domain Model

The `ComparisonJob` model enforces dual-site comparison:

- **baselineUrl**: Production/baseline website (required)
- **candidateUrl**: Migrated/candidate website (required, must differ from baseline)
- **crawlConfig**: Controls how sites are crawled (depth, paths, limits)
- **pageMap**: Explicit mappings between baseline and candidate paths
- **testMatrix**: Which comparison types to execute (visual, functional, data, seo)

Every run enforces that both URLs are present and different, ensuring proper dual-site comparison.

## Migration

Legacy jobs using `sourceUrl`/`targetUrl` are automatically migrated to `ComparisonJob` format with `baselineUrl`/`candidateUrl` when the snapshot is loaded. You can also manually trigger migration via `POST /api/jobs/migrate`.

## Phase 2 Integration Points

The following endpoints will be enhanced in Phase 2 with actual test execution:

- **POST** `/api/jobs/:id/run` - Will integrate:
  - Playwright MCP for browser automation
  - Crawl4AI for content extraction (respecting crawlConfig)
  - Page mapping for explicit baseline ↔ candidate comparisons
  - Test matrix execution (visual, functional, data, seo)
  - Azure OpenAI for intelligent comparison
  - MS Agent Framework for orchestration

See `backend/src/services/domainServices.ts` for detailed TODO comments on integration points.

