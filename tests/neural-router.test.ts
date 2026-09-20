import { afterEach, describe, expect, it } from "vitest";
import {
  ROUTER_FAILURE_COOLDOWN_MS,
  providerHealthSnapshot,
  resetProviderHealth,
  routeWithFallback,
} from "../cloudflare/neural-router";

describe("safe NeuralRouter", () => {
  afterEach(() => resetProviderHealth());

  it("falls back to the next available provider and records the attempt", async () => {
    const result = await routeWithFallback([
      { id: "primary", kind: "chat", priority: 1, execute: async () => { throw new Error("quota"); } },
      { id: "fallback", kind: "chat", priority: 2, execute: async () => "ok" },
    ]);

    expect(result.value).toBe("ok");
    expect(result.provider).toBe("fallback");
    expect(result.attempted).toEqual(["primary", "fallback"]);
    expect(providerHealthSnapshot("chat")[0]).toMatchObject({ id: "fallback", failures: 0 });
  });

  it("temporarily disables a failing provider instead of retrying it in a loop", async () => {
    let primaryCalls = 0;
    const providers = [
      { id: "unstable", kind: "image" as const, priority: 1, execute: async () => { primaryCalls += 1; throw new Error("410 gone"); } },
      { id: "safe", kind: "image" as const, priority: 2, execute: async () => "safe-result" },
    ];

    await routeWithFallback(providers, 1000);
    const result = await routeWithFallback(providers, 1001);

    expect(result.value).toBe("safe-result");
    expect(primaryCalls).toBe(1);
    expect(providerHealthSnapshot("image", 1001).find((item) => item.id === "unstable")).toMatchObject({
      disabledUntil: 1000 + ROUTER_FAILURE_COOLDOWN_MS,
      failures: 1,
    });
  });

  it("retries a provider after its cooldown expires", async () => {
    let calls = 0;
    const provider = { id: "recovering", kind: "video" as const, priority: 1, execute: async () => { calls += 1; if (calls === 1) throw new Error("temporary"); return "ready"; } };

    await expect(routeWithFallback([provider], 5000)).rejects.toThrow("temporary");
    const result = await routeWithFallback([provider], 5000 + ROUTER_FAILURE_COOLDOWN_MS + 1);

    expect(result.value).toBe("ready");
    expect(calls).toBe(2);
  });
});
