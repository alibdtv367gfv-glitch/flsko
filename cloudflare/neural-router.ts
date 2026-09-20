export type ProviderKind = "chat" | "image" | "video" | "music" | "voice";

export type ProviderHealth = {
  id: string;
  kind: ProviderKind;
  failures: number;
  lastFailureAt: number | null;
  disabledUntil: number | null;
  lastError: string | null;
};

export type RouterProvider<T> = {
  id: string;
  kind: ProviderKind;
  priority: number;
  execute: () => Promise<T>;
};

export type RouterResult<T> = {
  value: T;
  provider: string;
  attempted: string[];
};

const FAILURE_COOLDOWN_MS = 60_000;
const health = new Map<string, ProviderHealth>();

function getHealth(provider: Pick<RouterProvider<unknown>, "id" | "kind">): ProviderHealth {
  const current = health.get(provider.id);
  if (current) return current;
  const created: ProviderHealth = { id: provider.id, kind: provider.kind, failures: 0, lastFailureAt: null, disabledUntil: null, lastError: null };
  health.set(provider.id, created);
  return created;
}

export function providerIsAvailable(provider: Pick<RouterProvider<unknown>, "id" | "kind">, now = Date.now()) {
  const state = getHealth(provider);
  return !state.disabledUntil || state.disabledUntil <= now;
}

export function markProviderSuccess(provider: Pick<RouterProvider<unknown>, "id" | "kind">) {
  const state = getHealth(provider);
  state.failures = 0;
  state.lastFailureAt = null;
  state.disabledUntil = null;
  state.lastError = null;
}

export function markProviderFailure(provider: Pick<RouterProvider<unknown>, "id" | "kind">, error: unknown, now = Date.now()) {
  const state = getHealth(provider);
  state.failures += 1;
  state.lastFailureAt = now;
  state.disabledUntil = now + FAILURE_COOLDOWN_MS;
  state.lastError = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180);
}

export async function routeWithFallback<T>(providers: RouterProvider<T>[], now = Date.now()): Promise<RouterResult<T>> {
  const ordered = [...providers].sort((a, b) => a.priority - b.priority);
  const attempted: string[] = [];
  let lastError: unknown = new Error("لم يتوفر أي مزود صالح");

  for (const provider of ordered) {
    if (!providerIsAvailable(provider, now)) continue;
    attempted.push(provider.id);
    try {
      const value = await provider.execute();
      markProviderSuccess(provider);
      return { value, provider: provider.id, attempted };
    } catch (error) {
      lastError = error;
      markProviderFailure(provider, error, now);
    }
  }

  throw lastError;
}

export function providerHealthSnapshot(kind?: ProviderKind, now = Date.now()): ProviderHealth[] {
  return [...health.values()]
    .filter((item) => !kind || item.kind === kind)
    .map((item) => ({ ...item, disabledUntil: item.disabledUntil && item.disabledUntil > now ? item.disabledUntil : null }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}

export function resetProviderHealth() {
  health.clear();
}

export const ROUTER_FAILURE_COOLDOWN_MS = FAILURE_COOLDOWN_MS;
