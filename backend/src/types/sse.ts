// src/types/sse.ts

export interface SSEMessage {
  type: 'progress' | 'complete' | 'error';
  message?: string;
  error?: string;
  // Add other properties as needed from actual messages
}

export interface SSEHandlers {
  onProgress?: (data: SSEMessage) => void;
  onComplete?: (data: SSEMessage) => void;
  onError?: (error: Error) => void;
}

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error';

export function isSSEMessage(obj: unknown): obj is SSEMessage {
  return typeof obj === 'object' && obj !== null && 'type' in obj &&
         (obj.type === 'progress' || obj.type === 'complete' || obj.type === 'error');
}