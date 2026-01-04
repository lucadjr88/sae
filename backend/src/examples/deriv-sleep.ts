export function derivSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
