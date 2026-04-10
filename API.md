# API Reference

Base URL (local): http://localhost:4000

## Jobs

### POST /api/jobs
Create a comparison job.

Request body requires name and one URL pair:

- baselineUrl + candidateUrl, or
- sourceUrl + targetUrl (legacy compatibility)

Example:

```json
{
  "name": "BBC migration check",
  "description": "Prod vs candidate",
  "baselineUrl": "https://example.com",
  "candidateUrl": "https://staging.example.com",
  "testMatrix": {
    "visual": true,
    "functional": true,
    "data": true,
    "seo": true
  }
}
```

Responses:

- 201 Created
- 400 Validation or business-rule error

### GET /api/jobs
List jobs.

### GET /api/jobs/:id
Get single job.

### PUT /api/jobs/:id
Update job metadata/config.

### DELETE /api/jobs/:id
Delete job and associated runs/artifacts metadata.

### POST /api/jobs/migrate
Migrate legacy jobs to ComparisonJob format.

## Runs

### POST /api/jobs/:id/run
Trigger comparison run.

Request body:

```json
{
  "triggeredBy": "user",
  "runSettings": {
    "useAI": true
  }
}
```

Responses:

- 202 Accepted
- 404 Job not found
- 400 Invalid comparison configuration

### GET /api/runs
List runs.

### GET /api/runs/:id
Get run by id.

### GET /api/runs/:id/artifacts
List artifacts for run.

## Reports

### GET /api/runs/:id/report/executive
Returns markdown report content (or JSON fallback).

### GET /api/runs/:id/report/technical
Returns technical report JSON.

### GET /api/runs/:id/report/html
Returns generated HTML report.

### GET /api/runs/:id/summary
Returns compact run summary and risk information.

## Evidence

### GET /api/runs/:id/evidence
Returns normalized evidence summary combining crawl, matched pages, network, functional, and execution summaries.

### POST /api/runs/:id/evidence/save
Save curated evidence selection for run.

### GET /api/runs/:id/evidence/saved
List saved evidence files for run.

## Cache invalidation

### POST /api/cache/purge
Request surrogate key purge.

Request body:

```json
{
  "keys": ["home", "pricing"]
}
```

Responses:

- 200 OK
- 400 keys array required
- 500 purge failed

## Notes

- Artifact files are persisted under backend/data/artifacts/{runId}.
- AI reasoning behavior is controlled by runSettings.useAI and environment flags.
- Default local API port is 4000 unless overridden by PORT.
