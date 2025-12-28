export interface IRpcPool {
  pick(): Promise<number>;
  acquire(index: number): Promise<void>;
  release(index: number, opts?: { success?: boolean; latencyMs?: number }): Promise<void>;
  getMetrics(): any;
}
