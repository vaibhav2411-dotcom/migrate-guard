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
	},
	comparison: {
		viewports: [375, 768, 1280, 1920],
		pixelDiffThreshold: Number(process.env.PIXEL_DIFF_THRESHOLD ?? 0.1),
		diffSeverityThresholds: {
			low: Number(process.env.DIFF_LOW ?? 1),
			medium: Number(process.env.DIFF_MEDIUM ?? 5),
			high: Number(process.env.DIFF_HIGH ?? 15),
		},
		textSimilarityThreshold: Number(process.env.TEXT_SIMILARITY_THRESHOLD ?? 0.85),
		crawlMaxDepth: Number(process.env.CRAWL_MAX_DEPTH ?? 2),
		crawlMaxPages: Number(process.env.CRAWL_MAX_PAGES ?? 50),
		performanceWarnDeltaPercent: Number(process.env.PERF_WARN_DELTA ?? 20),
	},
	features: {
		aiReasoning: process.env.FEATURE_AI_REASONING !== 'false',
		seoValidation: process.env.FEATURE_SEO_VALIDATION !== 'false',
		performanceMetrics: process.env.FEATURE_PERF_METRICS !== 'false',
		multiViewport: process.env.FEATURE_MULTI_VIEWPORT !== 'false',
		crawlEnabled: process.env.FEATURE_CRAWL_ENABLED === 'true',
	},
};
