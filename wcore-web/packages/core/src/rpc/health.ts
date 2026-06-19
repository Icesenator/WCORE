// RpcHealth — escalating block durations.
// Port of v4.12.22 escalation: 2 fails -> 30min, 4 fails -> 2h, 6+ fails -> 6h.

const MIN = 60_000;
const HOUR = 60 * MIN;

export interface HealthEntry {
  failures: number;
  lastFailureMs: number;
  blocked: boolean;
}

export interface HealthStore {
  get(endpoint: string): HealthEntry | undefined;
  set(endpoint: string, entry: HealthEntry): void;
  delete(endpoint: string): void;
  entries(): IterableIterator<[string, HealthEntry]>;
}

export class MemoryHealthStore implements HealthStore {
  private map = new Map<string, HealthEntry>();
  get(endpoint: string) {
    return this.map.get(endpoint);
  }
  set(endpoint: string, entry: HealthEntry) {
    this.map.set(endpoint, entry);
  }
  delete(endpoint: string) {
    this.map.delete(endpoint);
  }
  entries() {
    return this.map.entries();
  }
}

export function blockDurationMs(failures: number): number {
  if (failures >= 6) return 6 * HOUR;
  if (failures >= 4) return 2 * HOUR;
  return 30 * MIN;
}

export class RpcHealth {
  constructor(
    private readonly store: HealthStore = new MemoryHealthStore(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  isHealthy(endpoint: string): boolean {
    const entry = this.store.get(endpoint);
    if (!entry || !entry.blocked) return true;
    const elapsed = this.now() - entry.lastFailureMs;
    if (elapsed > blockDurationMs(entry.failures)) {
      // Block expired — keep the failure count for escalation memory but unblock.
      this.store.set(endpoint, { ...entry, blocked: false });
      return true;
    }
    return false;
  }

  recordFailure(endpoint: string): HealthEntry {
    const prev = this.store.get(endpoint) ?? {
      failures: 0,
      lastFailureMs: 0,
      blocked: false,
    };
    const failures = prev.failures + 1;
    const next: HealthEntry = {
      failures,
      lastFailureMs: this.now(),
      blocked: failures >= 2,
    };
    this.store.set(endpoint, next);
    return next;
  }

  recordSuccess(endpoint: string): void {
    const prev = this.store.get(endpoint);
    if (!prev) return;
    this.store.set(endpoint, { failures: 0, lastFailureMs: 0, blocked: false });
  }

  filterHealthy(endpoints: ReadonlyArray<string>): string[] {
    return endpoints.filter((e) => this.isHealthy(e));
  }
}
