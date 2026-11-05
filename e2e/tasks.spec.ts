import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Local end-to-end tests against the stub API (e2e/support/stub-api.mjs, started by playwright.config.ts).
// They are not smoke tests: they control the API's data and behaviour.
test.skip(!!process.env.SMOKE_BASE_URL, "stub-API tests run locally only");

const STUB = process.env.STUB_API_URL ?? "http://127.0.0.1:4010";
const SAVE_ERROR = "The task could not be saved. Please try again later.";
const LOAD_ERROR = "Tasks could not be loaded. Please try again later.";
const TITLE_ERROR = "Please enter a title of 1 to 200 characters.";
const DUE_DATE_ERROR = "Please enter a valid date as YYYY-MM-DD.";

type Behaviour = "normal" | "hang" | "drop" | { status: number; body?: unknown; contentType?: string };

async function reset(request: APIRequestContext) {
  const res = await request.post(`${STUB}/__stub/reset`);
  expect(res.status()).toBe(204);
}
async function seed(request: APIRequestContext, tasks: unknown[]) {
  expect((await request.put(`${STUB}/__stub/tasks`, { data: tasks })).status()).toBe(204);
}
async function behave(request: APIRequestContext, b: { get?: Behaviour; post?: Behaviour }) {
  expect((await request.put(`${STUB}/__stub/behaviour`, { data: b })).status()).toBe(204);
}
async function apiRequests(request: APIRequestContext): Promise<Array<{ method: string; path: string; body: unknown }>> {
  return await (await request.get(`${STUB}/__stub/requests`)).json();
}
async function apiTasks(request: APIRequestContext): Promise<Array<{ title: string; due_date: string | null }>> {
  return await (await request.get(`${STUB}/tasks`)).json();
}

const task = (n: number, title: string, due: string | null) => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  title,
  due_date: due,
});

const items = (page: Page) => page.getByRole("list", { name: "Tasks" }).getByRole("listitem");

async function addTask(page: Page, title: string, due = "") {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Due date").fill(due);
  await page.getByRole("button", { name: "Add task" }).click();
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test("AC-001.1 lists tasks created directly through the API, in API order, with dates as YYYY-MM-DD", async ({ page, request }) => {
  await seed(request, [task(1, "Buy milk", "2026-11-30"), task(2, "No date task", null), task(3, "Third", "2027-01-05")]);
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(items(page)).toHaveText(["Buy milk 2026-11-30", "No date task", "Third 2027-01-05"]);
  await request.post(`${STUB}/tasks`, { data: { title: "Added directly", due_date: null } });
  await page.reload();
  await expect(items(page)).toHaveText(["Buy milk 2026-11-30", "No date task", "Third 2027-01-05", "Added directly"]);
});

test("AC-001.2 a task created through the form is still listed after a reload, after the earlier tasks", async ({ page, request }) => {
  await seed(request, [task(1, "Existing", "2026-01-01")]);
  await page.goto("/");
  const title = `e2e-${randomUUID()}`;
  await addTask(page, title, "2026-12-24");
  await expect(items(page)).toHaveCount(2);
  await page.reload();
  await expect(items(page)).toHaveText(["Existing 2026-01-01", `${title} 2026-12-24`]);
});

test("AC-001.3 shows 'No tasks yet.' and no list when the API has no tasks", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No tasks yet.")).toBeVisible();
  await expect(page.getByRole("list")).toHaveCount(0);
});

test("AC-001.4 the page shows the create form without restrictions on the title", async ({ page }) => {
  await page.goto("/");
  const title = page.getByLabel("Title");
  await expect(title).toBeVisible();
  for (const attr of ["required", "maxlength", "minlength", "pattern"]) {
    await expect(title).not.toHaveAttribute(attr, /.*/);
  }
  await expect(page.getByLabel("Due date")).toHaveAttribute("type", "date");
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
});

test("AC-001.5 a new task appears last without a reload, the form is cleared and the API got one POST", async ({ page, request }) => {
  await seed(request, [task(1, "Existing", null)]);
  await page.goto("/");
  let navigations = 0;
  page.on("framenavigated", () => navigations++);
  const title = `e2e-${randomUUID()}`;
  await addTask(page, title, "2026-11-30");
  await expect(items(page).last()).toHaveText(`${title} 2026-11-30`);
  await expect(page.getByLabel("Title")).toHaveValue("");
  await expect(page.getByLabel("Due date")).toHaveValue("");
  expect(navigations).toBe(0);
  const posts = (await apiRequests(request)).filter((r) => r.method === "POST");
  expect(posts).toEqual([{ method: "POST", path: "/tasks", body: { title, due_date: "2026-11-30" } }]);
  expect((await apiTasks(request)).map((t) => t.title)).toEqual(["Existing", title]);
});

test("AC-001.6 an empty date is sent as null and the task shows no date", async ({ page, request }) => {
  await page.goto("/");
  const title = `e2e-${randomUUID()}`;
  await addTask(page, title);
  await expect(items(page).last()).toHaveText(title);
  const posts = (await apiRequests(request)).filter((r) => r.method === "POST");
  expect(posts.map((p) => p.body)).toEqual([{ title, due_date: null }]);
});

test("AC-001.7 empty, blank and 201-character titles reach the API, show the title error and add nothing", async ({ page, request }) => {
  await seed(request, [task(1, "Existing", null)]);
  await page.goto("/");
  for (const title of ["", "   ", "a".repeat(201)]) {
    await addTask(page, title, "2026-11-30");
    await expect(page.getByText(TITLE_ERROR)).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue(title);
    await expect(page.getByLabel("Due date")).toHaveValue("2026-11-30");
    await expect(items(page)).toHaveCount(1);
  }
  const posts = (await apiRequests(request)).filter((r) => r.method === "POST");
  expect(posts.map((p) => (p.body as { title: string }).title)).toEqual(["", "   ", "a".repeat(201)]);
  await page.reload();
  await expect(items(page)).toHaveCount(1);
});

test("AC-001.8 a 200-character title and a padded title are sent as typed and listed trimmed", async ({ page, request }) => {
  await page.goto("/");
  const long = "c".repeat(200);
  await addTask(page, long);
  await expect(items(page)).toHaveCount(1);
  await addTask(page, "  padded  ");
  await expect(items(page)).toHaveCount(2);
  await expect(items(page).last()).toHaveText("padded");
  const posts = (await apiRequests(request)).filter((r) => r.method === "POST");
  expect(posts.map((p) => (p.body as { title: string }).title)).toEqual([long, "  padded  "]);
});

test("AC-001.9 a due_date 422 shows the date error and an unknown 422 shows the save error, no API text", async ({ page, request }) => {
  await page.goto("/");
  await behave(request, {
    post: { status: 422, body: { detail: [{ loc: ["body", "due_date"], msg: "API-MSG-LEAK", type: "x" }] } },
  });
  await addTask(page, "Keep me", "2026-11-30");
  await expect(page.getByText(DUE_DATE_ERROR)).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Keep me");
  await expect(page.getByLabel("Due date")).toHaveValue("2026-11-30");
  await behave(request, { post: { status: 422, body: { detail: [{ loc: ["body"], msg: "API-MSG-LEAK", type: "x" }] } } });
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText(SAVE_ERROR)).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("Keep me");
  await expect(page.getByText("API-MSG-LEAK")).toHaveCount(0);
  await expect(page.getByText("No tasks yet.")).toBeVisible();
});

test.describe("AC-001.10 failing GET /tasks", () => {
  test.setTimeout(60_000);
  const failures: Array<[string, Behaviour]> = [
    ["503", { status: 503, body: { detail: "Task store unavailable" } }],
    ["unexpected status 500", { status: 500, body: [] }],
    ["not an array", { status: 200, body: { tasks: [] } }],
    ["not JSON", { status: 200, body: "<html>", contentType: "text/html" }],
    ["connection dropped", "drop"],
    ["no answer within 5 seconds", "hang"],
  ];
  for (const [name, get] of failures) {
    test(`AC-001.10 ${name}: page answers 200 with the load error and the form`, async ({ page, request }) => {
      await behave(request, { get });
      const response = await page.goto("/", { timeout: 30_000 });
      expect(response?.status()).toBe(200);
      await expect(page.getByText(LOAD_ERROR)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("list")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
    });
  }
});

test.describe("AC-001.11 failing POST /tasks", () => {
  test.setTimeout(60_000);
  const failures: Array<[string, Behaviour]> = [
    ["503", { status: 503, body: { detail: "Task store unavailable" } }],
    ["unexpected status 200", { status: 200, body: {} }],
    ["201 with a non-task body", { status: 201, body: { ok: true } }],
    ["connection dropped", "drop"],
    ["no answer within 5 seconds", "hang"],
  ];
  for (const [name, post] of failures) {
    test(`AC-001.11 ${name}: save error above the button, inputs kept, nothing appended, one POST`, async ({ page, request }) => {
      await seed(request, [task(1, "Existing", null)]);
      await behave(request, { post });
      await page.goto("/");
      await addTask(page, "Keep me", "2026-11-30");
      await expect(page.getByText(SAVE_ERROR)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByLabel("Title")).toHaveValue("Keep me");
      await expect(page.getByLabel("Due date")).toHaveValue("2026-11-30");
      await expect(items(page)).toHaveCount(1);
      const posts = (await apiRequests(request)).filter((r) => r.method === "POST");
      expect(posts).toHaveLength(1);
    });
  }
});

test("AC-001.12 the probes answer healthy while the API drops every connection", async ({ request }) => {
  await behave(request, { get: "drop", post: "drop" });
  expect((await request.get("/api/health")).ok()).toBeTruthy();
  expect((await request.get("/api/ready")).ok()).toBeTruthy();
});

test("AC-001.13 the browser only talks to the web app's own host", async ({ page, baseURL }) => {
  const hosts = new Set<string>();
  page.on("request", (r) => {
    if (r.url().startsWith("http") || r.url().startsWith("ws")) hosts.add(new URL(r.url()).host);
  });
  await page.goto("/");
  await addTask(page, `e2e-${randomUUID()}`, "2026-11-30");
  await expect(items(page)).toHaveCount(1);
  expect([...hosts]).toEqual([new URL(baseURL ?? "http://localhost:3000").host]);
});
