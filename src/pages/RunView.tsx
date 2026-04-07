import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listRunArtifacts, RunArtifactDto } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useState } from 'react';

function artifactUrl(path: string) {
  // Backend exposes /data/* static files
  return (import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000') + '/' + path.replace(/^data\//, 'data/');
}

export default function RunView() {
  const { id } = useParams();
  const [selectedViewport, setSelectedViewport] = useState('375');
  const [showDiff, setShowDiff] = useState(true);
  const [sliderValue, setSliderValue] = useState(50);

  const artifactsQuery = useQuery({
    queryKey: ['run-artifacts', id],
    queryFn: () => (id ? listRunArtifacts(id) : Promise.resolve([] as RunArtifactDto[])),
    refetchInterval: (data) => {
      if (!data) return false;
      const running = data.length === 0; // if no artifacts yet, poll
      return running ? 3000 : false;
    },
  });

  const artifacts = artifactsQuery.data ?? [];

  // Group screenshots by page and viewport
  const screenshots = artifacts.filter((a) => a.type === 'screenshot');

  // Map by normalizedPath (label contains path in many cases)
  const byPage = new Map<string, RunArtifactDto[]>();
  for (const s of screenshots) {
    const key = s.label.split(':')[1]?.trim() || s.label || s.path;
    const arr = byPage.get(key) || [];
    arr.push(s);
    byPage.set(key, arr);
  }

  const pages = Array.from(byPage.keys());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Run {id}</h2>
      </div>

      <Card className="p-4">
        {artifactsQuery.isLoading && <p>Loading artifacts...</p>}

        {!artifactsQuery.isLoading && pages.length === 0 && (
          <p className="text-muted-foreground">No screenshots available for this run yet.</p>
        )}

        {pages.map((pageKey) => {
          const items = byPage.get(pageKey) || [];

          // Build viewport map
          const vpMap = new Map<string, { baseline?: RunArtifactDto; candidate?: RunArtifactDto; diff?: RunArtifactDto }>();
          for (const it of items) {
            const lower = it.label.toLowerCase();
            const vpMatch = it.label.match(/screenshot-(\d+)/i) || it.path.match(/screenshot-(\d+)\.png$/i);
            const vp = vpMatch ? vpMatch[1] : '1280';
            const entry = vpMap.get(vp) || {} as any;
            if (it.label.toLowerCase().startsWith('baseline')) entry.baseline = it;
            else if (it.label.toLowerCase().startsWith('candidate')) entry.candidate = it;
            else if (it.label.toLowerCase().includes('diff')) entry.diff = it;
            else {
              // heuristics
              if (it.path.includes('/baseline/')) entry.baseline = it;
              else if (it.path.includes('/candidate/')) entry.candidate = it;
              else if (it.path.includes('/visual-diffs/')) entry.diff = it;
            }
            vpMap.set(vp, entry);
          }

          const viewports = Array.from(vpMap.keys()).sort((a, b) => Number(a) - Number(b));

          return (
            <div key={pageKey} className="mb-6">
              <h3 className="font-medium">{pageKey}</h3>
              <Tabs defaultValue={viewports[0] || '1280'} className="mt-2">
                <TabsList>
                  {viewports.map((v) => (
                    <TabsTrigger key={v} value={v} onClick={() => setSelectedViewport(v)}>{v}px</TabsTrigger>
                  ))}
                </TabsList>

                {viewports.map((v) => {
                  const entry = vpMap.get(v)!;
                  const baselineUrl = entry?.baseline ? artifactUrl(entry.baseline.path) : undefined;
                  const candidateUrl = entry?.candidate ? artifactUrl(entry.candidate.path) : undefined;
                  const diffUrl = entry?.diff ? artifactUrl(entry.diff.path) : undefined;

                  return (
                    <TabsContent key={v} value={v} className="pt-4">
                      <div className="flex flex-col md:flex-row gap-4">
                        <div className="w-full md:w-1/2">
                          <div className="text-sm font-medium mb-2">Baseline</div>
                          {baselineUrl ? (
                            <img src={baselineUrl} alt="baseline" className="w-full border" />
                          ) : (
                            <div className="text-muted-foreground">No baseline screenshot</div>
                          )}
                        </div>

                        <div className="w-full md:w-1/2 relative">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium">Candidate</div>
                            <div className="flex items-center gap-2">
                              <label className="text-xs">Show diff</label>
                              <input type="checkbox" checked={showDiff} onChange={(e) => setShowDiff(e.target.checked)} />
                            </div>
                          </div>

                          <div className="w-full border overflow-hidden relative">
                            {candidateUrl ? (
                              <img src={candidateUrl} alt="candidate" className="w-full block" />
                            ) : (
                              <div className="text-muted-foreground">No candidate screenshot</div>
                            )}

                            {showDiff && diffUrl && (
                              <div className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ overflow: 'hidden' }}>
                                <img src={diffUrl} alt="diff" style={{ width: '100%', clipPath: `inset(0 ${100 - sliderValue}% 0 0)` }} />
                              </div>
                            )}

                          </div>

                          {showDiff && diffUrl && (
                            <div className="mt-2">
                              <input type="range" min={0} max={100} value={sliderValue} onChange={(e) => setSliderValue(Number(e.target.value))} />
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          );
        })}

      </Card>
    </div>
  );
}
