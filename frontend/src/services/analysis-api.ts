export interface AnalyzeProfileRequest {
  profileId: string;
  wipeCache: boolean;
  walletPubKey: string | null;
}

export async function fetchProfileAnalysis(request: AnalyzeProfileRequest): Promise<{
  data: unknown;
  cacheHit: string | null;
  cacheTimestamp: string | null;
}> {
  const response = await fetch('/api/analyze-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error('analyze-profile request failed: ' + response.statusText);
  }
  const cacheHit = response.headers.get('X-Cache-Hit');
  const cacheTimestamp = response.headers.get('X-Cache-Timestamp');
  const data: unknown = await response.json();
  return { data, cacheHit, cacheTimestamp };
}
