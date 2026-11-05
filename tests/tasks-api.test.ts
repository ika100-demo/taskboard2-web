import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTask, listTasks } from "@/app/_lib/tasks-api";

const BASE = "http://api.test";
const task = { id: "7d1f6b0e-3c1a-4f55-9a52-1b2c3d4e5f60", title: "Buy milk", due_date: "2026-11-30" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.TASKBOARD2_API_URL = BASE;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TASKBOARD2_API_URL;
});

describe("listTasks", () => {
  it("AC-001.1 returns the tasks in the order the API returns them from ${base}/tasks", async () => {
    const second = { id: "8e2f6b0e-3c1a-4f55-9a52-1b2c3d4e5f61", title: "No date", due_date: null };
    fetchMock.mockResolvedValue(json([task, second]));
    const result = await listTasks();
    expect(result).toEqual({ ok: true, tasks: [task, second] });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${BASE}/tasks`);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  });

  it("AC-001.1 strips a trailing slash of the base URL", async () => {
    process.env.TASKBOARD2_API_URL = `${BASE}/`;
    fetchMock.mockResolvedValue(json([]));
    await listTasks();
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${BASE}/tasks`);
  });

  it("AC-001.3 treats [] as a successful empty list", async () => {
    fetchMock.mockResolvedValue(json([]));
    expect(await listTasks()).toEqual({ ok: true, tasks: [] });
  });

  it("AC-001.10 fails without a network call when the API address is not configured", async () => {
    delete process.env.TASKBOARD2_API_URL;
    expect(await listTasks()).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.10 fails on 503, other statuses, a network error and a timeout without throwing", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "Task store unavailable" }, 503));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockResolvedValueOnce(json([task], 201));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await listTasks()).toEqual({ ok: false });
    expect(console.error).toHaveBeenCalled();
  });

  it("AC-001.10 fails on a body that is not a JSON array of task objects", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockResolvedValueOnce(json({ tasks: [] }));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockResolvedValueOnce(json([{ id: "x", title: "t" }]));
    expect(await listTasks()).toEqual({ ok: false });
    fetchMock.mockResolvedValueOnce(json([{ id: "x", title: "t", due_date: "30.11.2026" }]));
    expect(await listTasks()).toEqual({ ok: false });
  });

  it("AC-001.10 uses a 5 second timeout signal and does not retry", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(json({}, 500));
    await listTasks();
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-001.10 logs a failed call without the response body", async () => {
    fetchMock.mockResolvedValue(json({ detail: "secret-body-text" }, 503));
    await listTasks();
    const logged = vi.mocked(console.error).mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).toContain("taskboard2-api call failed");
    expect(logged).toContain("503");
    expect(logged).not.toContain("secret-body-text");
  });
});

describe("createTask", () => {
  it("AC-001.5 posts exactly {title, due_date} as JSON and returns the created task", async () => {
    fetchMock.mockResolvedValue(json(task, 201));
    const result = await createTask({ title: "Buy milk", due_date: "2026-11-30" });
    expect(result).toEqual({ kind: "created", task });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${BASE}/tasks`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ title: "Buy milk", due_date: "2026-11-30" });
  });

  it("AC-001.6 sends due_date as null", async () => {
    fetchMock.mockResolvedValue(json({ ...task, due_date: null }, 201));
    await createTask({ title: "Buy milk", due_date: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.8 sends the title exactly as typed, without trimming", async () => {
    fetchMock.mockResolvedValue(json({ ...task, title: "padded" }, 201));
    await createTask({ title: "  padded  ", due_date: null });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).title).toBe("  padded  ");
  });

  it("AC-001.7 maps a 422 to the known fields named by the last loc element, deduplicated", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: [{ loc: ["body", "title"], msg: "m", type: "t" }] }, 422));
    expect(await createTask({ title: "", due_date: null })).toEqual({ kind: "invalid", fields: ["title"] });
    fetchMock.mockResolvedValueOnce(
      json(
        {
          detail: [
            { loc: ["body", "title"], msg: "m", type: "t" },
            { loc: ["body", "title"], msg: "m", type: "t" },
            { loc: ["body", "due_date"], msg: "m", type: "t" },
          ],
        },
        422,
      ),
    );
    const both = await createTask({ title: "", due_date: "x" });
    expect(both.kind).toBe("invalid");
    if (both.kind === "invalid") expect([...both.fields].sort()).toEqual(["due_date", "title"]);
  });

  it("AC-001.9 maps a 422 naming no known field to invalid with no fields", async () => {
    fetchMock.mockResolvedValue(json({ detail: [{ loc: ["body"], msg: "m", type: "t" }] }, 422));
    expect(await createTask({ title: "a", due_date: null })).toEqual({ kind: "invalid", fields: [] });
  });

  it("AC-001.11 fails on 503, other statuses, bad bodies, network errors, timeouts and unset base URL, without retrying", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: "x" }, 503));
    expect(await createTask({ title: "a", due_date: null })).toEqual({ kind: "failed" });
    fetchMock.mockResolvedValueOnce(json(task, 200));
    expect(await createTask({ title: "a", due_date: null })).toEqual({ kind: "failed" });
    fetchMock.mockResolvedValueOnce(json({ nope: true }, 201));
    expect(await createTask({ title: "a", due_date: null })).toEqual({ kind: "failed" });
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 422 }));
    expect(await createTask({ title: "a", due_date: null })).toEqual({ kind: "failed" });
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await createTask({ title: "a", due_date: null })).toEqual({ kind: "failed" });
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await createTask({ title: "a", due_date: null })).toEqual({ kind: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    fetchMock.mockClear();
    delete process.env.TASKBOARD2_API_URL;
    expect(await createTask({ title: "a", due_date: null })).toEqual({ kind: "failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-001.11 uses a 5 second timeout signal", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(json(task, 201));
    await createTask({ title: "a", due_date: null });
    expect(timeoutSpy).toHaveBeenCalledWith(5000);
  });
});
