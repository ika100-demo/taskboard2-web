import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage, * as pageModule from "@/app/page";

const BASE = "http://api.test";
const SAVE_ERROR = "The task could not be saved. Please try again later.";
const LOAD_ERROR = "Tasks could not be loaded. Please try again later.";
const TITLE_ERROR = "Please enter a title of 1 to 200 characters.";
const DUE_DATE_ERROR = "Please enter a valid date as YYYY-MM-DD.";

type Task = { id: string; title: string; due_date: string | null };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function mk(n: number, title: string, due: string | null): Task {
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, title, due_date: due };
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Stub the API: GET answers `list` (a Response factory), POST answers `post`. */
function stubApi(list: () => Response | Promise<Response>, post?: (body: unknown) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (url: string | URL, init?: RequestInit) => {
    expect(String(url)).toBe(`${BASE}/tasks`);
    if (init?.method === "POST") {
      if (!post) throw new Error("unexpected POST");
      return post(JSON.parse(String(init.body)));
    }
    return list();
  });
}

function posts(): unknown[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

async function renderPage() {
  render(await HomePage());
}

function titleField() {
  return screen.getByLabelText("Title") as HTMLInputElement;
}
function dueField() {
  return screen.getByLabelText("Due date") as HTMLInputElement;
}
function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Add task" }));
}
function fill(title: string, due = "") {
  fireEvent.change(titleField(), { target: { value: title } });
  fireEvent.change(dueField(), { target: { value: due } });
}
function items() {
  return screen.queryAllByRole("listitem");
}

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

describe("task list", () => {
  it("AC-001.1 shows one item per task in API order, with YYYY-MM-DD dates and no date for null", async () => {
    stubApi(() => json([mk(1, "Buy milk", "2026-11-30"), mk(2, "No date task", null), mk(3, "Third", "2027-01-05")]));
    await renderPage();
    const list = screen.getByRole("list", { name: "Tasks" });
    const li = within(list).getAllByRole("listitem");
    expect(li.map((e) => e.textContent?.trim())).toEqual(["Buy milk 2026-11-30", "No date task", "Third 2027-01-05"]);
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
  });

  it("AC-001.1 the page is dynamic and never cached", () => {
    expect(pageModule.dynamic).toBe("force-dynamic");
  });

  it("AC-001.3 shows 'No tasks yet.' and no list for an empty API list", async () => {
    stubApi(() => json([]));
    await renderPage();
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});

describe("create form markup", () => {
  it("AC-001.4 has a Title text field, a Due date date field and an Add task button without restrictions", async () => {
    stubApi(() => json([]));
    await renderPage();
    const title = titleField();
    expect(title.type).toBe("text");
    for (const attr of ["required", "maxlength", "minlength", "pattern"]) {
      expect(title).not.toHaveAttribute(attr);
    }
    expect(dueField().type).toBe("date");
    expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
  });
});

describe("creating a task", () => {
  it("AC-001.5 appends the new task as the last item, clears the form and posts exactly once", async () => {
    const existing = [mk(1, "First", "2026-01-01")];
    stubApi(
      () => json(existing),
      (body) => json({ ...mk(2, (body as { title: string }).title, (body as { due_date: string }).due_date) }, 201),
    );
    await renderPage();
    fill("Unique title", "2026-11-30");
    submit();
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(items()[1].textContent?.trim()).toBe("Unique title 2026-11-30");
    expect(items()[0].textContent?.trim()).toBe("First 2026-01-01");
    expect(titleField().value).toBe("");
    expect(dueField().value).toBe("");
    expect(posts()).toEqual([{ title: "Unique title", due_date: "2026-11-30" }]);
  });

  it("AC-001.5 replaces 'No tasks yet.' by a list after the first task", async () => {
    stubApi(
      () => json([]),
      (body) => json(mk(1, (body as { title: string }).title, null), 201),
    );
    await renderPage();
    fill("Very first");
    submit();
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
  });

  it("AC-001.6 sends due_date null for an empty date and shows the task without a date", async () => {
    stubApi(
      () => json([mk(1, "First", "2026-01-01")]),
      (body) => json(mk(2, (body as { title: string }).title, null), 201),
    );
    await renderPage();
    fill("No date here", "");
    submit();
    await waitFor(() => expect(items()).toHaveLength(2));
    expect(posts()).toEqual([{ title: "No date here", due_date: null }]);
    expect(items()[1].textContent?.trim()).toBe("No date here");
  });

  it("AC-001.7 shows the title error next to the field and keeps inputs for empty, blank and 201-character titles", async () => {
    stubApi(
      () => json([mk(1, "First", null)]),
      () => json({ detail: [{ loc: ["body", "title"], msg: "API-MSG-LEAK", type: "x" }] }, 422),
    );
    await renderPage();
    for (const title of ["", "   ", "a".repeat(201)]) {
      fill(title, "2026-11-30");
      submit();
      const error = await screen.findByText(TITLE_ERROR);
      expect(titleField()).toHaveAttribute("aria-invalid", "true");
      expect(titleField().getAttribute("aria-describedby")).toBe(error.id);
      expect(titleField().value).toBe(title);
      expect(dueField().value).toBe("2026-11-30");
      expect(items()).toHaveLength(1);
      await waitFor(() => expect(screen.getByRole("button", { name: "Add task" })).toBeEnabled());
    }
    expect(posts()).toEqual([
      { title: "", due_date: "2026-11-30" },
      { title: "   ", due_date: "2026-11-30" },
      { title: "a".repeat(201), due_date: "2026-11-30" },
    ]);
    expect(document.body.textContent).not.toContain("API-MSG-LEAK");
  });

  it("AC-001.8 sends a padded title as typed and lists the title the API returns", async () => {
    stubApi(
      () => json([]),
      () => json(mk(1, "padded", null), 201),
    );
    await renderPage();
    fill("  padded  ");
    submit();
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(posts()).toEqual([{ title: "  padded  ", due_date: null }]);
    expect(items()[0].textContent?.trim()).toBe("padded");
  });

  it("AC-001.8 sends a 200-character title as typed", async () => {
    const long = "b".repeat(200);
    stubApi(
      () => json([]),
      () => json(mk(1, long, null), 201),
    );
    await renderPage();
    fill(long);
    submit();
    await waitFor(() => expect(items()).toHaveLength(1));
    expect(posts()).toEqual([{ title: long, due_date: null }]);
  });

  it("AC-001.9 shows the date error next to the Due date field and keeps inputs", async () => {
    stubApi(
      () => json([mk(1, "First", null)]),
      () => json({ detail: [{ loc: ["body", "due_date"], msg: "API-MSG-LEAK", type: "x" }] }, 422),
    );
    await renderPage();
    fill("Keep me", "2026-11-30");
    submit();
    const error = await screen.findByText(DUE_DATE_ERROR);
    expect(dueField()).toHaveAttribute("aria-invalid", "true");
    expect(dueField().getAttribute("aria-describedby")).toBe(error.id);
    expect(titleField().value).toBe("Keep me");
    expect(dueField().value).toBe("2026-11-30");
    expect(items()).toHaveLength(1);
    expect(document.body.textContent).not.toContain("API-MSG-LEAK");
  });

  it("AC-001.9 shows the save error above the button for a 422 naming no known field", async () => {
    stubApi(
      () => json([]),
      () => json({ detail: [{ loc: ["body"], msg: "API-MSG-LEAK", type: "x" }] }, 422),
    );
    await renderPage();
    fill("Keep me", "2026-11-30");
    submit();
    const error = await screen.findByText(SAVE_ERROR);
    expect(error.nextElementSibling).toBe(screen.getByRole("button", { name: "Add task" }));
    expect(titleField().value).toBe("Keep me");
    expect(screen.getByText("No tasks yet.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("API-MSG-LEAK");
  });
});

describe("failures", () => {
  it("AC-001.10 shows the load error with the form, status 200 semantics, for 503, bad body, network error and unset address", async () => {
    const cases: Array<() => void> = [
      () => stubApi(() => json({ detail: "Task store unavailable" }, 503)),
      () => stubApi(() => json({ not: "an array" })),
      () => stubApi(() => new Response("<html>", { status: 200 })),
      () => stubApi(() => json([], 201)),
      () => fetchMock.mockRejectedValue(new TypeError("fetch failed")),
      () => {
        delete process.env.TASKBOARD2_API_URL;
      },
    ];
    for (const setup of cases) {
      fetchMock.mockReset();
      process.env.TASKBOARD2_API_URL = BASE;
      setup();
      const view = render(await HomePage());
      expect(screen.getByText(LOAD_ERROR)).toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(screen.queryByText("No tasks yet.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add task" })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("AC-001.11 shows the save error above the button, keeps inputs and appends nothing when POST fails", async () => {
    for (const fail of [
      () => json({ detail: "x" }, 503),
      () => json({ ok: 1 }, 201),
      () => json({}, 500),
    ]) {
      fetchMock.mockReset();
      stubApi(() => json([mk(1, "First", null)]), fail);
      const view = render(await HomePage());
      fill("Keep me", "2026-11-30");
      submit();
      const error = await screen.findByText(SAVE_ERROR);
      expect(error.nextElementSibling).toBe(screen.getByRole("button", { name: "Add task" }));
      expect(titleField().value).toBe("Keep me");
      expect(dueField().value).toBe("2026-11-30");
      expect(items()).toHaveLength(1);
      expect(posts()).toHaveLength(1);
      view.unmount();
    }
  });

  it("AC-001.11 shows the save error when the POST has a network error", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") throw new TypeError("fetch failed");
      return json([]);
    });
    await renderPage();
    fill("Keep me");
    submit();
    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(titleField().value).toBe("Keep me");
  });

  it("AC-001.11 a successful create after a failed list load clears the form and keeps the load error", async () => {
    stubApi(
      () => json({}, 503),
      (body) => json(mk(1, (body as { title: string }).title, null), 201),
    );
    await renderPage();
    fill("Saved anyway");
    submit();
    await waitFor(() => expect(titleField().value).toBe(""));
    expect(screen.getByText(LOAD_ERROR)).toBeInTheDocument();
    expect(items()).toHaveLength(0);
  });
});
