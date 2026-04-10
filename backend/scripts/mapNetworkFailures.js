const fs = require('fs')
const path = require('path')

function fileExists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

function isFailed(req) {
  if (typeof req.status === 'number') return req.status >= 400 || req.status === 0
  if (req.statusText) return /err|fail|not found/i.test(req.statusText)
  return false
}

async function mapFailures(runId) {
  const artifactsRoot = path.resolve(__dirname, '../data/artifacts')
  const runDir = path.join(artifactsRoot, runId)
  const outPath = path.join(runDir, 'failed-requests-by-origin.json')

  const networkPath = path.join(runDir, 'network-requests.json')
  const matchedPath = path.join(runDir, 'matched-pages.json')

  if (!fileExists(runDir)) throw new Error(`Run folder not found: ${runDir}`)
  if (!fileExists(networkPath)) throw new Error(`network-requests.json not found for run ${runId}`)

  const networkRaw = fs.readFileSync(networkPath, 'utf-8')
  const network = JSON.parse(networkRaw)

  const failures = []
  for (const side of ['baseline', 'candidate']) {
    const bucket = network[side]
    if (!bucket) continue
    const requests = bucket.requests || []
    for (const r of requests) {
      if (isFailed(r)) failures.push({ side, req: r })
    }
  }

  let matched = null
  if (fileExists(matchedPath)) {
    try {
      matched = JSON.parse(fs.readFileSync(matchedPath, 'utf-8'))
    } catch (e) {
      matched = null
    }
  }

  const results = failures.map((f) => {
    const url = f.req.url
    const origins = []

    if (matched && Array.isArray(matched.matchedPages)) {
      for (const m of matched.matchedPages) {
        for (const sideKey of ['baseline', 'candidate']) {
          const page = m[sideKey]
          if (!page) continue
          const links = page.links || []
          const matchedLinks = links.filter((L) => L.href === url || L.url === url || (L.href && url.includes(L.href)))
          if (matchedLinks.length > 0) {
            origins.push({ side: sideKey, normalizedPath: m.normalizedPath || page.normalizedPath || page.path, context: matchedLinks.slice(0, 5) })
          }
        }
      }
    }

    return {
      url,
      side: f.side,
      status: f.req.status ?? null,
      statusText: f.req.statusText ?? null,
      origins: origins.length ? origins : [{ side: 'unknown' }],
    }
  })

  const out = {
    runId,
    generatedAt: new Date().toISOString(),
    count: results.length,
    failures: results,
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')
  return outPath
}

if (require.main === module) {
  const runId = process.argv[2] || process.env.RUN_ID
  if (!runId) {
    console.error('Usage: node mapNetworkFailures.js <runId>')
    process.exit(2)
  }
  mapFailures(runId)
    .then((p) => console.log('Wrote mapping to', p))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}

module.exports = { mapFailures }
