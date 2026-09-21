/**
 * Lightweight circuit breaker for provider failover.
 * In-memory by default; timestamps can later be mirrored to Cloudflare D1.
 * Compliant: only tracks failure of our outbound calls to documented APIs.
 */

export type CircuitState = "closed" | "open" | "half-open";

type BreakerEntry = {
  failures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
};

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 60_000;

const store = new Map<string, BreakerEntry>();

function entry(name: string): BreakerEntry {
  let e = store.get(name);
  if (!e) {
    e = { failures: 0, openedAt: null, lastFailureAt: null, lastSuccessAt: null };
    store.set(name, e);
  }
  return e;
}

export function getCircuitState(provider: string): CircuitState {
  const e = entry(provider);
  if (e.openedAt == null) return "closed";
  if (Date.now() - e.openedAt >= OPEN_MS) return "half-open";
  return "open";
}

export function isProviderAvailable(provider: string): boolean {
  return getCircuitState(provider) !== "open";
}

export function recordProviderSuccess(provider: string): void {
  const e = entry(provider);
  e.failures = 0;
  e.openedAt = null;
  e.lastSuccessAt = Date.now();
}

export function recordProviderFailure(provider: string): void {
  const e = entry(provider);
  e.failures += 1;
  e.lastFailureAt = Date.now();
  if (e.failures >= FAILURE_THRESHOLD) {
    e.openedAt = Date.now();
  }
}

/** Providers currently skipped by the breaker (for status/debug, not shown to users). */
export function listOpenCircuits(): string[] {
  return [...store.keys()].filter((name) => getCircuitState(name) === "open");
}

/**
 * Run a provider call with circuit breaker + scoring hook.
 * On success resets the breaker; on failure trips toward open.
 */
export async function withCircuitBreaker<T>(
  provider: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isProviderAvailable(provider)) {
    throw new Error(`Circuit open for ${provider}`);
  }
  try {
    const result = await fn();
    recordProviderSuccess(provider);
    return result;
  } catch (error) {
    recordProviderFailure(provider);
    throw error;
  }
}
