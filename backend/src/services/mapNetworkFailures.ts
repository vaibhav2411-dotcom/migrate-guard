import fs from 'fs/promises'
import path from 'path'

type RequestEntry = {
  url: string
  status?: number
  statusText?: string
  method?: string
}

async function fileExists(p: string) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function isFailed(req: RequestEntry) {
  if (typeof req.status === 'number') return req.status >= 400 || req.status === 0
  if (req.statusText) return /err|fail|not found/i.test(req.statusText)
  return false
}

async function mapFailures(runId: string) {
  const artifactsRoot = path.resolve(__dirname, '../../../backend/data/artifacts')
  const runDir = path.join(artifactsRoot, runId)
  const outPath = path.join(runDir, 'failed-requests-by-origin.json')

  const networkPath = path.join(runDir, 'network-requests.json')
  const matchedPath = path.join(runDir, 'matched-pages.json')

  if (!(await fileExists(runDir))) throw new Error(`Run folder not found: ${runDir}`)

  const networkExists = await fileExists(networkPath)
  if (!networkExists) throw new Error(`network-requests.json not found for run ${runId}`)

  const networkRaw = await fs.readFile(networkPath, 'utf-8')
  const network = JSON.parse(networkRaw)

  // collect failed requests across baseline/candidate
  const failures: Array<{ side: string; req: RequestEntry }> = []
  for (const side of ['baseline', 'candidate']) {
    const bucket = network[side as keyof typeof network]
    if (!bucket) continue
    const requests: RequestEntry[] = bucket.requests || []
    for (const r of requests) {
      if (isFailed(r)) failures.push({ side, req: r })
    }
  }

  // try to read matched pages to locate origins
  let matched: any = null
  if (await fileExists(matchedPath)) {
    try {
      matched = JSON.parse(await fs.readFile(matchedPath, 'utf-8'))
    } catch {
      matched = null
    }
  }

  const results = failures.map((f) => {
    const url = f.req.url
    const origins: Array<{ side: string; normalizedPath?: string; context?: any }> = []

    if (matched && Array.isArray(matched.matchedPages)) {
      for (const m of matched.matchedPages) {
        for (const sideKey of ['baseline', 'candidate']) {
          const page = m[sideKey]
          if (!page) continue
          const links = page.links || []
          // find if any link matches the failed url
          const matchedLinks = links.filter((L: any) => L.href === url || L.url === url || (L.href && url.includes(L.href)) )
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

  await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf-8')
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

export { mapFailures }
