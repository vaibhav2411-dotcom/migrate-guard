# Migrate Guard Backend API Documentation

## Base URL
- Development: `http://localhost:4000`

## Endpoints

### Health Check
- **GET** `/health`
- Returns server status

### Jobs

#### Create Job
- **POST** `/api/jobs`
- **Request Body:**
  ```json
  {
    "name": "string (required)",
    "description": "string (optional)",
    "sourceUrl": "string (required, URI)",
    "targetUrl": "string (required, URI)"
  }
  ```
- **Response:** `201 Created`
  ```json
  {
    "id": "uuid",
    "name": "string",
    "description": "string",
    "sourceUrl": "string",
    "targetUrl": "string",
    "status": "pending",
    "createdAt": "ISO timestamp",
    "updatedAt": "ISO timestamp"
  }
  ```

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

#### Update Job
- **PUT** `/api/jobs/:id`
- **Request Body:** (all fields optional)
  ```json
  {
    "name": "string",
    "description": "string",
    "sourceUrl": "string (URI)",
    "targetUrl": "string (URI)",
    "status": "pending|active|completed|failed"
  }
  ```
- **Response:** `200 OK` or `404 Not Found`

#### Delete Job
- **DELETE** `/api/jobs/:id`
- **Response:** `204 No Content` or `404 Not Found`
- **Note:** Also deletes associated runs and artifacts

#### Trigger Run
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

## Example Usage

### Create a Job
```bash
curl -X POST http://localhost:4000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Homepage Migration",
    "description": "Testing homepage migration from old to new site",
    "sourceUrl": "https://old.example.com",
    "targetUrl": "https://new.example.com"
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

## Phase 2 Integration Points

The following endpoints will be enhanced in Phase 2 with actual test execution:

- **POST** `/api/jobs/:id/run` - Will integrate:
  - Playwright MCP for browser automation
  - Crawl4AI for content extraction
  - Azure OpenAI for intelligent comparison
  - MS Agent Framework for orchestration

See `backend/src/services/domainServices.ts` for detailed TODO comments on integration points.

