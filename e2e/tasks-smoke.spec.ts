import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

// Smoke tests: only the web app's base URL, own unique data, never an assumed empty list.
test.skip(!process.env.SMOKE_BASE_URL, "SMOKE_BASE_URL not set");

const TITLE_ERROR = "Please enter a title of 1 to 200 characters.";

const items = (page: Page) => page.getByRole("list", { name: "Tasks" }).getByRole("listitem");
const uniqueTitle = () => `smoke-${randomUUID()}`;

async function addTask(page: Page, title: string, due = "") {
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Due date").fill(due);
  await page.getByRole("button", { name: "Add task" }).click();
}

/** Titles of the tasks currently listed (empty when the page shows no list). */
async function listedCount(page: Page): Promise<number> {
  return await page.locator('ul[aria-label="Tasks"] > li').count();
}

test("AC-001.2 a task created through the form is listed after a reload, after earlier tasks @smoke", async ({ page }) => {
  await page.goto("/");
  const before = await listedCount(page);
  const title = uniqueTitle();
  await addTask(page, title, "2026-12-24");
  await expect(items(page).filter({ hasText: title })).toHaveCount(1);
  await page.reload();
  const entry = items(page).filter({ hasText: title });
  await expect(entry).toHaveCount(1);
  await expect(entry).toHaveText(`${title} 2026-12-24`);
  const all = await items(page).allTextContents();
  expect(all.findIndex((t) => t.includes(title))).toBeGreaterThanOrEqual(before);
});

test("AC-001.4 the page shows the create form with unrestricted title field @smoke", async ({ page }) => {
  await page.goto("/");
  const title = page.getByLabel("Title");
  await expect(title).toBeVisible();
  for (const attr of ["required", "maxlength", "minlength", "pattern"]) {
    await expect(title).not.toHaveAttribute(attr, /.*/);
  }
  await expect(page.getByLabel("Due date")).toHaveAttribute("type", "date");
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
});

test("AC-001.5 a new task with a date appears last without reload and the form is cleared @smoke", async ({ page }) => {
  await page.goto("/");
  let navigations = 0;
  page.on("framenavigated", () => navigations++);
  const title = uniqueTitle();
  await addTask(page, title, "2026-11-30");
  await expect(items(page).last()).toHaveText(`${title} 2026-11-30`);
  await expect(page.getByLabel("Title")).toHaveValue("");
  await expect(page.getByLabel("Due date")).toHaveValue("");
  expect(navigations).toBe(0);
  await page.reload();
  await expect(items(page).filter({ hasText: title })).toHaveCount(1);
});

test("AC-001.6 a task without a due date appears last and shows no date @smoke", async ({ page }) => {
  await page.goto("/");
  const title = uniqueTitle();
  await addTask(page, title);
  await expect(items(page).last()).toHaveText(title);
  await page.reload();
  await expect(items(page).filter({ hasText: title })).toHaveText([title]);
});

test("AC-001.7 empty, blank and 201-character titles show the title error and add nothing @smoke", async ({ page }) => {
  await page.goto("/");
  const before = await listedCount(page);
  for (const title of ["", "   ", "a".repeat(201)]) {
    await addTask(page, title, "2026-11-30");
    await expect(page.getByText(TITLE_ERROR)).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue(title);
    await expect(page.getByLabel("Due date")).toHaveValue("2026-11-30");
    await page.getByLabel("Title").fill("");
  }
  await page.reload();
  expect(await listedCount(page)).toBeGreaterThanOrEqual(before);
  await expect(items(page).filter({ hasText: "a".repeat(201) })).toHaveCount(0);
});

test("AC-001.8 a 200-character title and a padded title are accepted and listed trimmed @smoke", async ({ page }) => {
  await page.goto("/");
  const prefix = `smoke-${randomUUID()}`;
  const long = prefix.padEnd(200, "x");
  await addTask(page, long);
  await expect(items(page).filter({ hasText: prefix })).toHaveText([long]);
  const padded = uniqueTitle();
  await addTask(page, `  ${padded}  `);
  await expect(items(page).last()).toHaveText(padded);
  await page.reload();
  await expect(items(page).filter({ hasText: padded })).toHaveText([padded]);
});

test("AC-001.13 the browser only talks to the web app's own host @smoke", async ({ page, baseURL }) => {
  const hosts = new Set<string>();
  page.on("request", (r) => {
    if (r.url().startsWith("http") || r.url().startsWith("ws")) hosts.add(new URL(r.url()).host);
  });
  await page.goto("/");
  const title = uniqueTitle();
  await addTask(page, title, "2026-11-30");
  await expect(items(page).filter({ hasText: title })).toHaveCount(1);
  expect([...hosts]).toEqual([new URL(baseURL ?? "").host]);
});
