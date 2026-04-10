const fs = require('fs')
const path = require('path')

function run(runId) {
  const artifactsRoot = path.resolve(__dirname, '../data/artifacts')
  const runDir = path.join(artifactsRoot, runId)
  const matchedPath = path.join(runDir, 'matched-pages.json')
  const outPath = path.join(runDir, 'links-comparison.json')

  if (!fs.existsSync(matchedPath)) {
    console.error('matched-pages.json not found for run', runId)
    process.exit(2)
  }

  const matched = JSON.parse(fs.readFileSync(matchedPath, 'utf-8'))
  const matchedPages = Array.isArray(matched) ? matched : (matched.matchedPages || [])
  const pages = matchedPages.map((mp) => ({
    normalizedPath: mp.normalizedPath || null,
    baselineCount: ((mp.baseline && mp.baseline.links) || []).length,
    candidateCount: ((mp.candidate && mp.candidate.links) || []).length,
  }))

  const out = { runId, generatedAt: new Date().toISOString(), pages }
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8')
  console.log('Wrote', outPath)
}

if (require.main === module) {
  const runId = process.argv[2]
  if (!runId) {
    console.error('Usage: node generateLinksComparison.cjs <runId>')
    process.exit(2)
  }
  run(runId)
}

module.exports = { run }
