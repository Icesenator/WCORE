export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitEvent {
  event: "circuit_opened" | "circuit_closed" | "circuit_half_open";
  chain: string;
  failureCount: number;
  openedAt: number;
  ts: string;
}

export class CircuitBreaker {
  private state: BreakerState = "CLOSED";
  private failureCount = 0;
  private openedAt = 0;
  private lastFailureAt = 0;
  private onEvent?: (evt: CircuitEvent) => void;

  constructor(
    private readonly chainName: string = "unknown",
    private readonly threshold = 3,
    private readonly cooldownMs = 120_000,
    private readonly decayMs = 600_000,
  ) {}

  private maybeDecay(): void {
    if (
      this.state === "CLOSED" &&
      this.failureCount > 0 &&
      this.lastFailureAt > 0 &&
      Date.now() - this.lastFailureAt >= this.decayMs
    ) {
      this.failureCount = 0;
    }
  }

  setEventListener(fn: (evt: CircuitEvent) => void): void {
    this.onEvent = fn;
  }

  get currentState(): BreakerState {
    return this.state;
  }

  get isOpen(): boolean {
    return this.currentState === "OPEN";
  }

  allowRequest(): boolean {
    this.maybeDecay();
    this.maybeTransitionToHalfOpen();
    return this.state !== "OPEN";
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state === "OPEN" && Date.now() - this.openedAt >= this.cooldownMs) {
      this.state = "HALF_OPEN";
      this.failureCount = 0;
      if (this.onEvent) {
        this.onEvent({
          event: "circuit_half_open",
          chain: this.chainName,
          failureCount: 0,
          openedAt: this.openedAt,
          ts: new Date().toISOString(),
        });
      }
    }
  }

  onSuccess(): void {
    const wasNotClosed = this.state !== "CLOSED";
    this.failureCount = 0;
    this.state = "CLOSED";
    if (wasNotClosed && this.onEvent) {
      this.onEvent({
        event: "circuit_closed",
        chain: this.chainName,
        failureCount: 0,
        openedAt: this.openedAt,
        ts: new Date().toISOString(),
      });
    }
  }

  onFailure(): void {
    this.maybeDecay();
    this.failureCount++;
    this.lastFailureAt = Date.now();
    if (this.state === "HALF_OPEN") {
      // HALF_OPEN probe failed → re-open immediately
      this.state = "OPEN";
      this.openedAt = Date.now();
      if (this.onEvent) {
        this.onEvent({
          event: "circuit_opened",
          chain: this.chainName,
          failureCount: this.failureCount,
          openedAt: this.openedAt,
          ts: new Date().toISOString(),
        });
      }
    } else if (this.failureCount >= this.threshold && this.state !== "OPEN") {
      this.state = "OPEN";
      this.openedAt = Date.now();
      if (this.onEvent) {
        this.onEvent({
          event: "circuit_opened",
          chain: this.chainName,
          failureCount: this.failureCount,
          openedAt: this.openedAt,
          ts: new Date().toISOString(),
        });
      }
    }
  }

  getStatus(): { state: BreakerState; failureCount: number; openedAt: number | null } {
    this.maybeDecay();
    return {
      state: this.currentState,
      failureCount: this.failureCount,
      openedAt: this.state === "OPEN" ? this.openedAt : null,
    };
  }
}
