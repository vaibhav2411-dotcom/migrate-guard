import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FunctionalPageEvidenceDto,
  getRunEvidence,
  getTechnicalReport,
  listRunArtifacts,
  RunArtifactDto,
  TechnicalFindingDto,
  saveRunEvidence,
  listSavedEvidence,
} from '@/lib/api';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type PageEvidence = {
  pageKey: string;
  viewports: Record<
    string,
    {
      baseline?: RunArtifactDto;
      candidate?: RunArtifactDto;
      diff?: RunArtifactDto;
      heatmap?: RunArtifactDto;
    }
  >;
};

const severityOrder: Record<TechnicalFindingDto['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

type LinkComparisonRow = {
  key: string;
  status: 'both' | 'baseline-only' | 'candidate-only';
  baselineUrl?: string;
  candidateUrl?: string;
};

function artifactUrl(path: string) {
  const base = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';
  return `${base}/${path.replace(/^data\//, 'data/')}`;
}

function extractViewport(pathOrLabel: string): string {
  const fromPath = pathOrLabel.match(/screenshot-(desktop|tablet|mobile)\.png/i);
  if (fromPath) return fromPath[1].toLowerCase();

  const diffFromPath = pathOrLabel.match(/(diff|heatmap)-(desktop|tablet|mobile)\.png/i);
  if (diffFromPath) return diffFromPath[2].toLowerCase();

  const fromLabel = pathOrLabel.match(/\((desktop|tablet|mobile)\)/i);
  if (fromLabel) return fromLabel[1].toLowerCase();

  return 'desktop';
}

function extractPageKey(artifact: RunArtifactDto): string {
  const p = artifact.path.replace(/\\/g, '/').toLowerCase();

  const baselineOrCandidate = p.match(/\/(baseline|candidate)\/([^/]+)\//);
  if (baselineOrCandidate) return baselineOrCandidate[2];

  const visualDiff = p.match(/\/visual-diffs\/([^/]+)\//);
  if (visualDiff) return visualDiff[1];

  const fromLabel = artifact.label.match(/:\s*([^()]+)\s*(?:\(|$)/);
  if (fromLabel) return fromLabel[1].trim().replace(/[^a-zA-Z0-9-_]+/g, '_').toLowerCase();

  return 'unknown';
}

function pageKeyFromNormalizedPath(normalizedPath: string): string {
  const trimmed = normalizedPath.replace(/\/+$/, '') || '/';
  if (trimmed === '/') {
    return 'index';
  }

  return trimmed
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

function pageLabel(pageKey: string, normalizedPath?: string) {
  if (normalizedPath === '/' || pageKey === 'index') {
    return 'Home (/)';
  }

  return normalizedPath ?? pageKey;
}

function normalizeComparableUrl(url: string) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${pathname}${parsed.search}${parsed.hash}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function buildLinkComparisonRows(baselineLinks: string[] = [], candidateLinks: string[] = []): LinkComparisonRow[] {
  const rows = new Map<string, LinkComparisonRow>();

  for (const link of baselineLinks) {
    const key = normalizeComparableUrl(link);
    const existing = rows.get(key) ?? { key, status: 'baseline-only' as const };
    existing.baselineUrl = existing.baselineUrl ?? link;
    rows.set(key, existing);
  }

  for (const link of candidateLinks) {
    const key = normalizeComparableUrl(link);
    const existing = rows.get(key);
    if (existing) {
      existing.candidateUrl = existing.candidateUrl ?? link;
      existing.status = 'both';
      rows.set(key, existing);
      continue;
    }

    rows.set(key, {
      key,
      status: 'candidate-only',
      candidateUrl: link,
    });
  }

  return Array.from(rows.values()).sort((left, right) => left.key.localeCompare(right.key));
}

function compareViewports(a: string, b: string) {
  const order: Record<string, number> = { desktop: 0, tablet: 1, mobile: 2 };
  return (order[a] ?? 99) - (order[b] ?? 99);
}

export default function RunView() {
  const { id } = useParams();
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [selectedViewport, setSelectedViewport] = useState<string>('desktop');
  const [severityFilter, setSeverityFilter] = useState<'all' | TechnicalFindingDto['severity']>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TechnicalFindingDto['category']>('all');
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [modalRow, setModalRow] = useState<LinkComparisonRow | null>(null);

  const artifactsQuery = useQuery({
    queryKey: ['run-artifacts-detail', id],
    queryFn: () => (id ? listRunArtifacts(id) : Promise.resolve([] as RunArtifactDto[])),
    refetchInterval: 3000,
  });

  const technicalReportQuery = useQuery({
    queryKey: ['run-technical-report', id],
    queryFn: () => (id ? getTechnicalReport(id) : Promise.resolve({ technicalFindings: [] })),
    retry: false,
  });

  const evidenceQuery = useQuery({
    queryKey: ['run-evidence', id],
    queryFn: () => (id ? getRunEvidence(id) : Promise.resolve({ runId: '', matchedPages: [] })),
    retry: false,
  });

  const { toast } = useToast();
  const [baselineStyles, setBaselineStyles] = useState<Array<{ selector: string; computed: Record<string, string> }>>([]);
  const [candidateStyles, setCandidateStyles] = useState<Array<{ selector: string; computed: Record<string, string> }>>([]);

  const savedEvidenceQuery = useQuery({
    queryKey: ['run-saved-evidence', id],
    queryFn: () => (id ? listSavedEvidence(id) : Promise.resolve([])),
    retry: false,
  });

  const evidence = useMemo<PageEvidence[]>(() => {
    const artifacts = artifactsQuery.data ?? [];
    const screenshots = artifacts.filter((a) => a.type === 'screenshot');

    const byPage = new Map<string, PageEvidence>();

    for (const artifact of screenshots) {
      const pageKey = extractPageKey(artifact);
      const viewport = extractViewport(`${artifact.path} ${artifact.label}`);

      const existing = byPage.get(pageKey) ?? {
        pageKey,
        viewports: {},
      };

      const slot = existing.viewports[viewport] ?? {};
      const lower = artifact.label.toLowerCase();
      const lowerPath = artifact.path.toLowerCase();

      if (lower.startsWith('baseline') || lowerPath.includes('/baseline/')) {
        slot.baseline = artifact;
      } else if (lower.startsWith('candidate') || lowerPath.includes('/candidate/')) {
        slot.candidate = artifact;
      } else if (lower.includes('heatmap') || lowerPath.includes('heatmap-')) {
        slot.heatmap = artifact;
      } else if (lower.includes('diff') || lowerPath.includes('/visual-diffs/')) {
        slot.diff = artifact;
      }

      existing.viewports[viewport] = slot;
      byPage.set(pageKey, existing);
    }

    return Array.from(byPage.values()).sort((a, b) => a.pageKey.localeCompare(b.pageKey));
  }, [artifactsQuery.data]);

  const activePage = selectedPage || evidence[0]?.pageKey || '';
  const selected = evidence.find((p) => p.pageKey === activePage);
  const viewportKeys = useMemo(
    () => Object.keys(selected?.viewports ?? {}).sort(compareViewports),
    [selected]
  );

  useEffect(() => {
    if (viewportKeys.length === 0) {
      setSelectedViewport('desktop');
      return;
    }

    if (viewportKeys.includes('desktop')) {
      setSelectedViewport('desktop');
      return;
    }

    setSelectedViewport(viewportKeys[0]);
  }, [activePage, viewportKeys]);

  const findings = useMemo(() => technicalReportQuery.data?.technicalFindings ?? [], [technicalReportQuery.data]);

  const selectedMatchedPage = useMemo(() => {
    return (evidenceQuery.data?.matchedPages ?? []).find((matchedPage) => {
      return pageKeyFromNormalizedPath(matchedPage.baseline.normalizedPath) === activePage;
    });
  }, [evidenceQuery.data, activePage]);

  const selectedBaselineFunctional = useMemo(() => {
    return evidenceQuery.data?.functionalQa?.baseline.pages.find(
      (page) => pageKeyFromNormalizedPath(page.normalizedPath) === activePage
    );
  }, [evidenceQuery.data, activePage]);

  const selectedCandidateFunctional = useMemo(() => {
    return evidenceQuery.data?.functionalQa?.candidate.pages.find(
      (page) => pageKeyFromNormalizedPath(page.normalizedPath) === activePage
    );
  }, [evidenceQuery.data, activePage]);

  const selectedPageLabel = pageLabel(activePage, selectedMatchedPage?.baseline.normalizedPath);

  const linkComparisonRows = useMemo(
    () => buildLinkComparisonRows(selectedMatchedPage?.baseline.links ?? [], selectedMatchedPage?.candidate.links ?? []),
    [selectedMatchedPage]
  );

  async function saveEvidenceForRow(row: LinkComparisonRow) {
    if (!id) return;
    try {
      const payload = { pageKey: activePage, type: 'link-row', row };
      const res = await saveRunEvidence(id, payload);
      toast({ title: 'Saved evidence', description: res.path ?? 'saved' });
      // refresh saved evidence list
      savedEvidenceQuery.refetch();
      setLinkModalOpen(false);
    } catch (err) {
      console.error('save evidence failed', err);
      toast({ title: 'Save failed', description: String(err) });
    }
  }

  function openLinkModal(row: LinkComparisonRow) {
    setModalRow(row);
    setLinkModalOpen(true);
  }

  const candidateBrokenRows = useMemo(
    () => selectedCandidateFunctional?.brokenLinks ?? [],
    [selectedCandidateFunctional]
  );

  const baselineBrokenRows = useMemo(
    () => selectedBaselineFunctional?.brokenLinks ?? [],
    [selectedBaselineFunctional]
  );

  const evidenceStats = useMemo(() => {
    const crawlSummary = evidenceQuery.data?.crawlSummary;
    const executionSummary = evidenceQuery.data?.executionSummary;
    const functionalQa = evidenceQuery.data?.functionalQa;

    const totalViewportsCaptured = evidence.reduce(
      (sum, page) => sum + Object.keys(page.viewports).length,
      0
    );

    return {
      baselinePages: crawlSummary?.baselinePagesCount ?? 0,
      candidatePages: crawlSummary?.candidatePagesCount ?? 0,
      matchedPages: crawlSummary?.matchedPagesCount ?? evidence.length,
      crawlDepth: crawlSummary?.crawlConfig?.depth ?? null,
      crawlMaxPages: crawlSummary?.crawlConfig?.maxPages ?? null,
      totalScreenshots:
        (executionSummary?.baseline.totalScreenshots ?? 0) +
        (executionSummary?.candidate.totalScreenshots ?? 0),
      estimatedScrollScreens:
        (executionSummary?.baseline.estimatedScrollScreens ?? 0) +
        (executionSummary?.candidate.estimatedScrollScreens ?? 0),
      brokenLinksCandidate: functionalQa?.candidate.summary.totalBrokenLinks ?? 0,
      brokenLinksBaseline: functionalQa?.baseline.summary.totalBrokenLinks ?? 0,
      jsErrorsCandidate: functionalQa?.candidate.summary.totalJSErrors ?? 0,
      jsErrorsBaseline: functionalQa?.baseline.summary.totalJSErrors ?? 0,
      totalFindings: findings.length,
      totalViewportsCaptured,
    };
  }, [evidenceQuery.data, evidence, findings.length]);

  // Fetch computed styles from execution artifacts for active page
  useEffect(() => {
    async function loadStyles() {
      setBaselineStyles([]);
      setCandidateStyles([]);
      if (!id || !selectedMatchedPage) return;

      const baselineArtifact = (artifactsQuery.data ?? []).find((a) => a.path.toLowerCase().endsWith('baseline-execution.json'));
      const candidateArtifact = (artifactsQuery.data ?? []).find((a) => a.path.toLowerCase().endsWith('candidate-execution.json'));

      const viewportWidthMap: Record<string, string> = { desktop: '1920px', tablet: '768px', mobile: '375px' };
      const widthMatch = viewportWidthMap[selectedViewport ?? 'desktop'];

      try {
        if (baselineArtifact) {
          const res = await fetch(artifactUrl(baselineArtifact.path));
          const json = await res.json();
          const page = (json.pages ?? []).find((p: any) => {
            return p.normalizedPath === selectedMatchedPage?.baseline.normalizedPath || p.url === selectedMatchedPage?.baseline.url;
          });
          if (page?.styles) {
            const filtered = page.styles.filter((s: any) => (s.computed?.width ?? '').includes(widthMatch));
            setBaselineStyles(filtered ?? []);
          }
        }

        if (candidateArtifact) {
          const res2 = await fetch(artifactUrl(candidateArtifact.path));
          const json2 = await res2.json();
          const page2 = (json2.pages ?? []).find((p: any) => {
            return p.normalizedPath === selectedMatchedPage?.candidate.normalizedPath || p.url === selectedMatchedPage?.candidate.url;
          });
          if (page2?.styles) {
            const filtered2 = page2.styles.filter((s: any) => (s.computed?.width ?? '').includes(widthMatch));
            setCandidateStyles(filtered2 ?? []);
          }
        }
      } catch (err) {
        console.error('failed to load execution styles', err);
      }
    }

    loadStyles();
  }, [id, artifactsQuery.data, selectedMatchedPage, selectedViewport]);

  const filteredFindings = useMemo(() => {
    return findings.filter((finding) => {
      if (severityFilter !== 'all' && finding.severity !== severityFilter) {
        return false;
      }
      if (categoryFilter !== 'all' && finding.category !== categoryFilter) {
        return false;
      }
      if (activePage && activePage !== 'unknown') {
        const pages = finding.affectedPages ?? [];
        if (pages.length > 0) {
          const normalizedActive = activePage.toLowerCase();
          const pageMatch = pages.some((p) => {
            const normalized = p.toLowerCase();
            return normalized === normalizedActive || normalized.includes(normalizedActive) || normalizedActive.includes(normalized);
          });
          if (!pageMatch) {
            return false;
          }
        }
      }
      return true;
    });
  }, [findings, severityFilter, categoryFilter, activePage]);

  const sortedFindings = useMemo(
    () => [...filteredFindings].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]),
    [filteredFindings]
  );

  const suggestionArtifacts = useMemo(() => {
    const artifacts = artifactsQuery.data ?? [];
    return artifacts.filter((a) => /suggestions?\.json$/i.test(a.path) || a.path.toLowerCase().includes('ui-integrity-suggestions') || a.path.toLowerCase().includes('-suggestions.json'));
  }, [artifactsQuery.data]);

  function severityClass(severity: TechnicalFindingDto['severity']) {
    if (severity === 'critical') return 'bg-destructive/10 text-destructive';
    if (severity === 'high') return 'bg-orange-500/10 text-orange-600';
    if (severity === 'medium') return 'bg-yellow-500/10 text-yellow-700';
    if (severity === 'low') return 'bg-primary/10 text-primary';
    return 'bg-muted text-muted-foreground';
  }

  function statusTone(status: LinkComparisonRow['status']) {
    if (status === 'both') return 'bg-success/10 text-success';
    if (status === 'candidate-only') return 'bg-destructive/10 text-destructive';
    return 'bg-warning/10 text-warning-foreground';
  }

  function brokenKindBadge(row: FunctionalPageEvidenceDto['brokenLinks'][number]) {
    if (row.kind === 'network') {
      return row.resourceType ? `network:${row.resourceType}` : 'network';
    }
    return 'anchor';
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Run Evidence</h1>
        <p className="text-muted-foreground">Run {id} visual evidence, coverage, and functional findings by page.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <div className="text-sm text-muted-foreground">Coverage</div>
          <div className="text-2xl font-semibold">{evidenceStats.matchedPages}</div>
          <div className="text-sm text-muted-foreground">
            matched pages • baseline {evidenceStats.baselinePages} • candidate {evidenceStats.candidatePages}
          </div>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="text-sm text-muted-foreground">Evidence Captures</div>
          <div className="text-2xl font-semibold">{evidenceStats.totalScreenshots}</div>
          <div className="text-sm text-muted-foreground">
            screenshots • {evidenceStats.totalViewportsCaptured} page viewport sets
          </div>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="text-sm text-muted-foreground">Functional Risk</div>
          <div className="text-2xl font-semibold">{evidenceStats.brokenLinksCandidate}</div>
          <div className="text-sm text-muted-foreground">
            candidate broken resources • baseline {evidenceStats.brokenLinksBaseline}
          </div>
        </Card>

        <Card className="p-4 space-y-1">
          <div className="text-sm text-muted-foreground">JavaScript Errors</div>
          <div className="text-2xl font-semibold">{evidenceStats.jsErrorsCandidate}</div>
          <div className="text-sm text-muted-foreground">
            candidate JS errors • baseline {evidenceStats.jsErrorsBaseline}
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {evidenceStats.crawlDepth !== null && <Badge variant="outline">crawl depth: {evidenceStats.crawlDepth}</Badge>}
          {evidenceStats.crawlMaxPages !== null && <Badge variant="outline">max pages: {evidenceStats.crawlMaxPages}</Badge>}
          <Badge variant="outline">estimated scroll screens captured: {evidenceStats.estimatedScrollScreens}</Badge>
          <Badge variant="outline">technical findings: {evidenceStats.totalFindings}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Page chip labels reflect artifact keys. Home (/) is the root page that previously showed up as index.
        </p>
        {evidenceStats.crawlMaxPages === 1 && evidenceStats.crawlDepth === 0 && (
          <p className="text-sm text-muted-foreground">
            This run only audited the homepage because the stored crawl settings were limited to one page at depth zero.
          </p>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Saved Evidence</h2>
          <p className="text-sm text-muted-foreground">Evidence you saved from this run (click to open).</p>
        </div>

        {savedEvidenceQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading saved evidence...</p>
        ) : (savedEvidenceQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved evidence yet.</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Size</th>
                </tr>
              </thead>
              <tbody>
                {(savedEvidenceQuery.data ?? []).map((f) => (
                  <tr key={f.path} className="border-t border-border align-top">
                    <td className="px-3 py-2 break-all">
                      <a href={artifactUrl(f.path)} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                        {f.name}
                      </a>
                    </td>
                    <td className="px-3 py-2">{new Date(f.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{Math.round((f.size ?? 0) / 1024)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">AI / Heuristic Suggestions</h2>
            <p className="text-sm text-muted-foreground">Suggestion artifacts produced by agents (UI, SEO, Performance).</p>
          </div>
        </div>

        {artifactsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading suggestion artifacts...</p>
        ) : suggestionArtifacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No suggestion artifacts were produced for this run.</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Artifact</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {suggestionArtifacts.map((a) => (
                  <tr key={a.path} className="border-t border-border align-top">
                    <td className="px-3 py-2 break-all">{a.label || a.path.split('/').slice(-1)[0]}</td>
                    <td className="px-3 py-2">{a.type ?? 'artifact'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <a href={artifactUrl(a.path)} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline">Open</Button>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        {artifactsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading artifacts...</p>
        ) : evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No screenshot evidence generated yet.</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {evidence.map((page) => (
                <Button
                  key={page.pageKey}
                  size="sm"
                  variant={activePage === page.pageKey ? 'default' : 'outline'}
                  onClick={() => setSelectedPage(page.pageKey)}
                >
                  {pageLabel(page.pageKey, evidenceQuery.data?.matchedPages.find((matchedPage) => pageKeyFromNormalizedPath(matchedPage.baseline.normalizedPath) === page.pageKey)?.baseline.normalizedPath)}
                </Button>
              ))}
            </div>

            {selected && viewportKeys.length > 0 && (
              <Tabs value={selectedViewport} onValueChange={setSelectedViewport}>
                <TabsList>
                  {viewportKeys.map((viewport) => (
                    <TabsTrigger key={viewport} value={viewport}>
                      {viewport}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {viewportKeys.map((viewport) => {
                  const slot = selected.viewports[viewport] ?? {};
                  return (
                    <TabsContent key={viewport} value={viewport} className="pt-4 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">page: {selectedPageLabel}</Badge>
                        <Badge variant="outline">viewport: {viewport}</Badge>
                        {selectedMatchedPage?.matchReason && <Badge variant="outline">match: {selectedMatchedPage.matchReason}</Badge>}
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <Card className="p-3">
                          <h3 className="font-medium mb-2">Baseline</h3>
                          {slot.baseline ? (
                            <img src={artifactUrl(slot.baseline.path)} alt="baseline" className="w-full border rounded" />
                          ) : (
                            <p className="text-sm text-muted-foreground">No baseline screenshot.</p>
                          )}
                        </Card>

                        <Card className="p-3">
                          <h3 className="font-medium mb-2">Candidate</h3>
                          {slot.candidate ? (
                            <img src={artifactUrl(slot.candidate.path)} alt="candidate" className="w-full border rounded" />
                          ) : (
                            <p className="text-sm text-muted-foreground">No candidate screenshot.</p>
                          )}
                        </Card>

                        <Card className="p-3">
                          <h3 className="font-medium mb-2">Pixel Diff</h3>
                          {slot.diff ? (
                            <img src={artifactUrl(slot.diff.path)} alt="diff" className="w-full border rounded" />
                          ) : (
                            <p className="text-sm text-muted-foreground">No diff screenshot.</p>
                          )}
                        </Card>

                        <Card className="p-3">
                          <h3 className="font-medium mb-2">Heatmap</h3>
                          {slot.heatmap ? (
                            <img src={artifactUrl(slot.heatmap.path)} alt="heatmap" className="w-full border rounded" />
                          ) : (
                            <p className="text-sm text-muted-foreground">No heatmap screenshot.</p>
                          )}
                        </Card>
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4 space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Selected Page Mapping</h2>
            <p className="text-sm text-muted-foreground">Baseline and candidate URLs compared for the active page.</p>
          </div>

          {selectedMatchedPage ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Baseline</div>
                <div className="text-sm break-all">{selectedMatchedPage.baseline.url}</div>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Candidate</div>
                <div className="text-sm break-all">{selectedMatchedPage.candidate.url}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">baseline links: {selectedMatchedPage.baseline.links?.length ?? 0}</Badge>
                <Badge variant="outline">candidate links: {selectedMatchedPage.candidate.links?.length ?? 0}</Badge>
                {typeof selectedMatchedPage.confidence === 'number' && (
                  <Badge variant="outline">confidence: {Math.round(selectedMatchedPage.confidence * 100)}%</Badge>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No matched page metadata available for this page.</p>
          )}
        </Card>

        <Card className="p-4 space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold">Functional Evidence</h2>
            <p className="text-sm text-muted-foreground">Broken resources and navigation evidence for the selected page.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">candidate broken: {candidateBrokenRows.length}</Badge>
            <Badge variant="outline">baseline broken: {baselineBrokenRows.length}</Badge>
            <Badge variant="outline">candidate JS: {selectedCandidateFunctional?.jsErrors.length ?? 0}</Badge>
            <Badge variant="outline">baseline JS: {selectedBaselineFunctional?.jsErrors.length ?? 0}</Badge>
          </div>

          {selectedCandidateFunctional?.navigation.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              Candidate navigation issue: {selectedCandidateFunctional.navigation.error}
            </div>
          )}

          {candidateBrokenRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No candidate broken-resource entries were captured for this page in this run.</p>
          ) : (
            <div className="overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">URL</th>
                    <th className="px-3 py-2 font-medium">Found On</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Details</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {candidateBrokenRows.map((row, index) => (
                    <tr key={`${row.url}-${index}`} className="border-t border-border align-top">
                      <td className="px-3 py-2">
                        <Badge className="bg-destructive/10 text-destructive">broken</Badge>
                      </td>
                      <td className="px-3 py-2 break-all">{row.url}</td>
                      <td className="px-3 py-2 break-all">{row.sourceUrl}</td>
                      <td className="px-3 py-2">{row.statusCode ?? 'ERR'}</td>
                      <td className="px-3 py-2">{brokenKindBadge(row)}</td>
                      <td className="px-3 py-2">{row.error}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!id) return;
                              try {
                                const payload = { pageKey: activePage, type: 'broken-resource', row };
                                const res = await saveRunEvidence(id, payload);
                                toast({ title: 'Saved evidence', description: res.path ?? 'saved' });
                                savedEvidenceQuery.refetch();
                              } catch (err) {
                                console.error('save broken resource failed', err);
                                toast({ title: 'Save failed', description: String(err) });
                              }
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4">
            <h4 className="font-medium">Computed Styles</h4>
            <p className="text-sm text-muted-foreground">Computed CSS for the selected viewport (baseline / candidate).</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium">Baseline Styles</h5>
                  <Button size="sm" variant="outline" onClick={async () => {
                    if (!id) return;
                    try {
                      const payload = { pageKey: activePage, type: 'computed-styles', viewport: selectedViewport, styles: baselineStyles };
                      const res = await saveRunEvidence(id, payload);
                      toast({ title: 'Saved styles', description: res.path ?? 'saved' });
                      savedEvidenceQuery.refetch();
                    } catch (err) {
                      console.error('save styles failed', err);
                      toast({ title: 'Save failed', description: String(err) });
                    }
                  }}>Save</Button>
                </div>
                {baselineStyles.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">No baseline computed styles for this viewport.</p>
                ) : (
                  <div className="overflow-auto mt-2 rounded border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2">Selector</th>
                          <th className="px-3 py-2">Color</th>
                          <th className="px-3 py-2">Width</th>
                          <th className="px-3 py-2">Height</th>
                        </tr>
                      </thead>
                      <tbody>
                        {baselineStyles.map((s, i) => (
                          <tr key={`${s.selector}-${i}`} className="border-t border-border">
                            <td className="px-3 py-2 break-all">{s.selector}</td>
                            <td className="px-3 py-2">{s.computed?.color ?? '—'}</td>
                            <td className="px-3 py-2">{s.computed?.width ?? '—'}</td>
                            <td className="px-3 py-2">{s.computed?.height ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <h5 className="font-medium">Candidate Styles</h5>
                  <Button size="sm" variant="outline" onClick={async () => {
                    if (!id) return;
                    try {
                      const payload = { pageKey: activePage, type: 'computed-styles', viewport: selectedViewport, styles: candidateStyles };
                      const res = await saveRunEvidence(id, payload);
                      toast({ title: 'Saved styles', description: res.path ?? 'saved' });
                      savedEvidenceQuery.refetch();
                    } catch (err) {
                      console.error('save styles failed', err);
                      toast({ title: 'Save failed', description: String(err) });
                    }
                  }}>Save</Button>
                </div>
                {candidateStyles.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">No candidate computed styles for this viewport.</p>
                ) : (
                  <div className="overflow-auto mt-2 rounded border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2">Selector</th>
                          <th className="px-3 py-2">Color</th>
                          <th className="px-3 py-2">Width</th>
                          <th className="px-3 py-2">Height</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidateStyles.map((s, i) => (
                          <tr key={`${s.selector}-${i}`} className="border-t border-border">
                            <td className="px-3 py-2 break-all">{s.selector}</td>
                            <td className="px-3 py-2">{s.computed?.color ?? '—'}</td>
                            <td className="px-3 py-2">{s.computed?.width ?? '—'}</td>
                            <td className="px-3 py-2">{s.computed?.height ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold">Link Comparison</h2>
          <p className="text-sm text-muted-foreground">Normalized baseline-versus-candidate link inventory for the selected page.</p>
        </div>

        {linkComparisonRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No link inventory is available for the selected page.</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Comparable Path</th>
                  <th className="px-3 py-2 font-medium">Baseline URL</th>
                  <th className="px-3 py-2 font-medium">Candidate URL</th>
                </tr>
              </thead>
              <tbody>
                {linkComparisonRows.map((row) => (
                  <tr
                    key={row.key}
                    className="border-t border-border align-top hover:bg-muted/40 cursor-pointer"
                    onClick={() => openLinkModal(row)}
                  >
                    <td className="px-3 py-2">
                      <Badge className={statusTone(row.status)}>{row.status}</Badge>
                    </td>
                    <td className="px-3 py-2 break-all">{row.key}</td>
                    <td className="px-3 py-2 break-all">{row.baselineUrl ?? '—'}</td>
                    <td className="px-3 py-2 break-all">{row.candidateUrl ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="font-semibold">Findings Triage</h2>
            <p className="text-sm text-muted-foreground">Severity-first findings from technical report output.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">total: {findings.length}</Badge>
            <Badge variant="outline">shown: {sortedFindings.length}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">severity</span>
            {(['all', 'critical', 'high', 'medium', 'low', 'none'] as const).map((severity) => (
              <Button
                key={severity}
                size="sm"
                variant={severityFilter === severity ? 'default' : 'outline'}
                onClick={() => setSeverityFilter(severity)}
              >
                {severity}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">category</span>
            {(['all', 'visual', 'functional', 'data', 'seo', 'security', 'performance', 'ui', 'accessibility'] as const).map((category) => (
              <Button
                key={category}
                size="sm"
                variant={categoryFilter === category ? 'default' : 'outline'}
                onClick={() => setCategoryFilter(category)}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        {technicalReportQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading findings...</p>
        ) : findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No technical findings available for this run.</p>
        ) : sortedFindings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No findings match current filters.</p>
        ) : (
          <div className="space-y-3">
            {sortedFindings.map((finding, index) => (
              <div key={`${finding.title}-${index}`} className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={severityClass(finding.severity)}>{finding.severity}</Badge>
                  <Badge variant="outline">{finding.category}</Badge>
                </div>
                <h3 className="font-medium">{finding.title}</h3>
                <p className="text-sm text-muted-foreground">{finding.description}</p>
                <p className="text-sm"><span className="text-muted-foreground">Impact:</span> {finding.impact}</p>
                <p className="text-sm"><span className="text-muted-foreground">Recommendation:</span> {finding.recommendation}</p>
                {finding.evidence && (
                  <p className="text-sm"><span className="text-muted-foreground">Evidence:</span> {finding.evidence}</p>
                )}
                {finding.affectedPages && finding.affectedPages.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {finding.affectedPages.slice(0, 8).map((page) => (
                      <Badge key={`${finding.title}-${page}`} variant="secondary">{page}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {/* Link row modal */}
      <AlertDialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Link details</AlertDialogTitle>
            <AlertDialogDescription>
              View the comparable path and the baseline / candidate URLs for this link. Save this row as evidence for the active page.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2 space-y-2">
            <div className="text-sm">
              <div className="text-muted-foreground">Comparable Path</div>
              <div className="break-all">{modalRow?.key ?? '—'}</div>
            </div>

            <div className="text-sm">
              <div className="text-muted-foreground">Baseline URL</div>
              <div className="break-all">{modalRow?.baselineUrl ?? '—'}</div>
            </div>

            <div className="text-sm">
              <div className="text-muted-foreground">Candidate URL</div>
              <div className="break-all">{modalRow?.candidateUrl ?? '—'}</div>
            </div>

            <div className="text-sm">
              <div className="text-muted-foreground">Status</div>
              <div className="break-all">{modalRow?.status ?? '—'}</div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLinkModalOpen(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => modalRow && saveEvidenceForRow(modalRow)}>Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Modal markup appended to file (keeps RunView component focused)
