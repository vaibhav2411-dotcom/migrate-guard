import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve data directory relative to backend/src/config, going up to backend root
export const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
export const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');

export const DEFAULT_PORT = Number(process.env.PORT ?? 4000);

export const config = {
	dataDir: process.env.DATA_DIR ?? DATA_DIR,
	azure: {
		openaiEndpoint: process.env.AZURE_OPENAI_ENDPOINT ?? '',
		openaiKey: process.env.AZURE_OPENAI_KEY ?? process.env.AZURE_OPENAI_API_KEY ?? '',
		openaiDeployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? process.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? 'gpt-4',
		apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-01',
	},
	comparison: {
		// Viewports to capture at — mobile, tablet, desktop, widescreen
		viewports: [375, 768, 1280, 1920],
		// Pixel diff — passed directly to pixelmatch (0 = exact, 1 = ignore all)
		pixelDiffThreshold: Number(process.env.PIXEL_DIFF_THRESHOLD ?? 0.1),
		// % of pixels different → severity band
		diffSeverity: {
			none: Number(process.env.DIFF_SEVERITY_NONE ?? 0),
			low: Number(process.env.DIFF_SEVERITY_LOW ?? 1),
			medium: Number(process.env.DIFF_SEVERITY_MEDIUM ?? 5),
			high: Number(process.env.DIFF_SEVERITY_HIGH ?? 15),
		},
		// Text similarity thresholds
		textSimilarityWarn: Number(process.env.TEXT_SIMILARITY_WARN ?? 0.85),
		textSimilarityFail: Number(process.env.TEXT_SIMILARITY_FAIL ?? 0.7),
		// Performance regression percent (candidate vs baseline)
		perfRegressionWarnPercent: Number(process.env.PERF_REGRESSION_WARN_PERCENT ?? 20),
		// Core Web Vitals thresholds (ms or score)
		webVitals: {
			lcp: { good: Number(process.env.WV_LCP_GOOD ?? 2500), poor: Number(process.env.WV_LCP_POOR ?? 4000) },
			fcp: { good: Number(process.env.WV_FCP_GOOD ?? 1800), poor: Number(process.env.WV_FCP_POOR ?? 3000) },
			inp: { good: Number(process.env.WV_INP_GOOD ?? 200), poor: Number(process.env.WV_INP_POOR ?? 500) },
			cls: { good: Number(process.env.WV_CLS_GOOD ?? 0.1), poor: Number(process.env.WV_CLS_POOR ?? 0.25) },
			ttfb: { good: Number(process.env.WV_TTFB_GOOD ?? 800), poor: Number(process.env.WV_TTFB_POOR ?? 1800) },
		},
		// Redirect chain — more than this many hops → FAIL
		maxRedirectHops: Number(process.env.MAX_REDIRECT_HOPS ?? 1),
		// Crawl defaults
		crawl: {
			maxDepth: Number(process.env.CRAWL_MAX_DEPTH ?? 2),
			maxPages: Number(process.env.CRAWL_MAX_PAGES ?? 50),
			useSitemap: process.env.CRAWL_USE_SITEMAP !== 'false',
		},
		// AI-related comparison thresholds and caps
		aiVisualThreshold: Number(process.env.AI_VISUAL_THRESHOLD ?? 0.5), // percent
		aiMaxFindingsPerRun: Number(process.env.AI_MAX_FINDINGS_PER_RUN ?? 200),
	},
	features: {
		crawlEnabled: process.env.FEATURE_CRAWL_ENABLED === 'true',
		visualDiff: process.env.FEATURE_VISUAL_DIFF !== 'false',
		functionalQa: process.env.FEATURE_FUNCTIONAL_QA !== 'false',
		dataIntegrity: process.env.FEATURE_DATA_INTEGRITY !== 'false',
		seoValidation: process.env.FEATURE_SEO_VALIDATION !== 'false',
		performanceMetrics: process.env.FEATURE_PERF_METRICS !== 'false',
		uiIntegrity: process.env.FEATURE_UI_INTEGRITY !== 'false',
		accessibilityChecks: process.env.FEATURE_ACCESSIBILITY_CHECKS !== 'false',
		securityHeaders: process.env.FEATURE_SECURITY_HEADERS !== 'false',
		// Default AI reasoning to OFF unless explicitly enabled
		aiReasoning: process.env.FEATURE_AI_REASONING === 'true',
		multiViewport: process.env.FEATURE_MULTI_VIEWPORT !== 'false',
	},
};
