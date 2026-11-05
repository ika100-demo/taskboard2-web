import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskAction } from "@/app/actions";
import { DUE_DATE_ERROR, SAVE_ERROR, TITLE_ERROR } from "@/app/_lib/messages";

const task = { id: "7d1f6b0e-3c1a-4f55-9a52-1b2c3d4e5f60", title: "Buy milk", due_date: "2026-11-30" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  process.env.TASKBOARD2_API_URL = "http://api.test";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.TASKBOARD2_API_URL;
});

describe("createTaskAction", () => {
  it("AC-001.5 posts once with title and due date and returns the created task", async () => {
    fetchMock.mockResolvedValue(json(task, 201));
    const result = await createTaskAction({ title: "Buy milk", dueDate: "2026-11-30" });
    expect(result).toEqual({ ok: true, task });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: "2026-11-30" });
  });

  it("AC-001.6 sends due_date null for an empty date field", async () => {
    fetchMock.mockResolvedValue(json({ ...task, due_date: null }, 201));
    await createTaskAction({ title: "Buy milk", dueDate: "" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ title: "Buy milk", due_date: null });
  });

  it("AC-001.7 forwards empty, whitespace and 201-character titles to the API and maps a title 422", async () => {
    fetchMock.mockImplementation(async () => json({ detail: [{ loc: ["body", "title"], msg: "secret msg", type: "x" }] }, 422));
    for (const title of ["", "   ", "a".repeat(201)]) {
      const result = await createTaskAction({ title, dueDate: "2026-11-30" });
      expect(result).toEqual({ ok: false, errors: { title: TITLE_ERROR } });
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).title).toBe("   ");
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).title).toHaveLength(201);
  });

  it("AC-001.8 sends a 200-character title and a padded title untouched", async () => {
    fetchMock.mockResolvedValue(json({ ...task, title: "x" }, 201));
    await createTaskAction({ title: "a".repeat(200), dueDate: "" });
    await createTaskAction({ title: "  padded  ", dueDate: "" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).title).toBe("a".repeat(200));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).title).toBe("  padded  ");
  });

  it("AC-001.9 maps a due_date 422 to the date error, both fields to both errors, and never leaks the API msg", async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: [{ loc: ["body", "due_date"], msg: "secret msg", type: "x" }] }, 422));
    expect(await createTaskAction({ title: "a", dueDate: "2026-02-30" })).toEqual({
      ok: false,
      errors: { dueDate: DUE_DATE_ERROR },
    });
    fetchMock.mockResolvedValueOnce(
      json(
        {
          detail: [
            { loc: ["body", "title"], msg: "m", type: "x" },
            { loc: ["body", "due_date"], msg: "m", type: "x" },
          ],
        },
        422,
      ),
    );
    expect(await createTaskAction({ title: "", dueDate: "bad" })).toEqual({
      ok: false,
      errors: { title: TITLE_ERROR, dueDate: DUE_DATE_ERROR },
    });
  });

  it("AC-001.9 shows the save error for a 422 naming no known field", async () => {
    fetchMock.mockResolvedValue(json({ detail: [{ loc: ["body"], msg: "secret msg", type: "x" }] }, 422));
    const result = await createTaskAction({ title: "a", dueDate: "" });
    expect(result).toEqual({ ok: false, errors: { form: SAVE_ERROR } });
    expect(JSON.stringify(result)).not.toContain("secret msg");
  });

  it("AC-001.11 returns the save error for a failed call without retrying", async () => {
    fetchMock.mockResolvedValue(json({ detail: "x" }, 503));
    expect(await createTaskAction({ title: "a", dueDate: "" })).toEqual({ ok: false, errors: { form: SAVE_ERROR } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("AC-001.11 returns the save error without calling the API for malformed input", async () => {
    // @ts-expect-error deliberately malformed input
    expect(await createTaskAction({ title: 5 })).toEqual({ ok: false, errors: { form: SAVE_ERROR } });
    // @ts-expect-error deliberately malformed input
    expect(await createTaskAction(null)).toEqual({ ok: false, errors: { form: SAVE_ERROR } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
