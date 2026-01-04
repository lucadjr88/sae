// src/types/sse.ts
export function isSSEMessage(obj) {
    return typeof obj === 'object' && obj !== null && 'type' in obj &&
        (obj.type === 'progress' || obj.type === 'complete' || obj.type === 'error');
}
