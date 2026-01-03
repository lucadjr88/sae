// public/js/cache/sse-reader.js

export async function readSSEStream(response, handlers) {
  const { onProgress, onComplete, onError } = handlers;
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopReading = false;
  let finalData = null;

  console.log('[SSE] Starting stream read');

  while (true) {
    if (stopReading) break;
    const { done, value } = await reader.read();
    
    if (done) {
      console.log('[SSE] Reader done');
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim() || !line.startsWith('data: ')) continue;
      const msg = line.substring(6);

      try {
        const data = JSON.parse(msg);
        console.log('[SSE] Message type:', data.type);
        
        if (data.type === 'progress' && onProgress) {
          onProgress(data);
        } else if (data.type === 'complete') {
          console.log('[SSE] Complete event received');
          finalData = data;
          if (onComplete) onComplete(data);
          try { await reader.cancel(); } catch {}
          stopReading = true;
          break;
        } else if (data.type === 'error' || data.error) {
          const error = new Error(data.message || data.error || 'Unknown error');
          if (onError) onError(error);
          throw error;
        }
      } catch (err) {
        console.error('[SSE] Parse error:', err, msg);
        if (onError) onError(err);
        throw err;
      }
    }
  }

  if (!finalData) {
    const err = new Error('Stream ended without complete event');
    if (onError) onError(err);
    throw err;
  }

  return finalData;
}