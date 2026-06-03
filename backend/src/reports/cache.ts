/**
 * Tiny TTL cache for the Reports module.
 *
 * Aggregate queries over the people/attendance tables are read-heavy and
 * tolerate a few minutes of staleness — wrapping them with a 5-minute
 * Map-based cache keeps the DB out of the hot path when 50 admins refresh
 * the dashboard at the top of the hour.
 *
 * The TTL is configurable via REPORTS_CACHE_TTL_MS so QA can drop it to
 * 0 to verify recompute paths, and so production can extend it for big
 * blocks. Keys must include the blockId + any filters that change the
 * answer.
 */
export class TtlCache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  constructor(private ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Pull-or-compute helper. */
  async wrap(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await compute();
    this.set(key, value);
    return value;
  }

  invalidate(prefix?: string): void {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }
}
