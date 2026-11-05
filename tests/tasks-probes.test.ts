import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as health } from "@/app/api/health/route";
import { GET as ready } from "@/app/api/ready/route";

describe("probes without a reachable API", () => {
  beforeEach(() => {
    delete process.env.TASKBOARD2_API_URL;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TASKBOARD2_API_URL;
  });

  it("AC-001.12 liveness and readiness answer healthy when the API address is not configured, without calling the API", async () => {
    const h = health();
    const r = ready();
    expect(h.status).toBe(200);
    expect(r.status).toBe(200);
    expect(await h.json()).toEqual({ status: "ok" });
    expect(await r.json()).toEqual({ status: "ready" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("AC-001.12 liveness and readiness answer healthy when the API is unreachable, without calling the API", async () => {
    process.env.TASKBOARD2_API_URL = "http://127.0.0.1:1";
    expect(health().status).toBe(200);
    expect(ready().status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
});
