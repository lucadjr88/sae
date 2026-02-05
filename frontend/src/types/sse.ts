export type SSEMessage = Record<string, any>;
export type SSEHandlers = {
  onMessage?: (msg: SSEMessage) => void;
  onProgress?: (msg: SSEMessage) => void;
  onComplete?: (msg: SSEMessage) => void;
  onError?: (error: Error) => void;
};

export function isSSEMessage(input: unknown): input is SSEMessage {
  return typeof input === 'object' && input !== null;
}

