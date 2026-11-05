---
spec_id: 001-list-tasks-and-create-them-with-a-form
shape: web-nextjs
spec_hash: bcf6c9c9245a
summary: Task list and create form on the root page, calling taskboard2-api server-side only
tasks:
  - id: t1
    title: Add the server-side taskboard2-api client, messages and env docs
    files: [app/_lib/tasks-api.ts, app/_lib/messages.ts, docs/env-vars.md]
    covers: [AC-001.1, AC-001.3, AC-001.8, AC-001.9, AC-001.10, AC-001.11, AC-001.12]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t2
    title: Add the e2e stub API and start it from the Playwright config
    files: [e2e/support/stub-api.mjs, playwright.config.ts]
    covers: [AC-001.3, AC-001.10, AC-001.11]
    parallel_safe: true
    depends_on: []
    done: true
  - id: t3
    title: Add the createTaskAction Server Action
    files: [app/actions.ts]
    covers: [AC-001.5, AC-001.6, AC-001.7, AC-001.8, AC-001.9, AC-001.11]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t4
    title: Add the TaskList component
    files: [app/_components/task-list.tsx]
    covers: [AC-001.1, AC-001.3, AC-001.10]
    parallel_safe: true
    depends_on: [t1]
    done: true
  - id: t5
    title: Add the TaskForm client component
    files: [app/_components/task-form.tsx]
    covers: [AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.9, AC-001.11, AC-001.13]
    parallel_safe: true
    depends_on: [t3]
    done: true
  - id: t6
    title: Replace the template home page with the task board
    files: [app/_components/task-board.tsx, app/page.tsx, app/globals.css, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts]
    covers: [AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.8, AC-001.10, AC-001.12, AC-001.13]
    parallel_safe: false
    depends_on: [t4, t5]
---

# Plan — 001 List tasks and create them with a form

Contract, markup and the stub API are in [design.md](design.md); decision record in
[ADR-001](../../adr/001-backend-apis-called-server-side-only.md). Levels: t1, t2 → t3, t4 → t5 → t6.
No gitops tasks: the system's gitops part already wires `TASKBOARD2_API_URL=http://taskboard2-api` and the
Gateway exposure.

## t1 — Add the server-side taskboard2-api client, messages and env docs

**Files:** app/_lib/tasks-api.ts, app/_lib/messages.ts, docs/env-vars.md
**Covers:** AC-001.1, AC-001.3, AC-001.8, AC-001.9, AC-001.10, AC-001.11, AC-001.12
**Goal:** one typed module that is the only place the web app talks to taskboard2-api, plus the five fixed texts.

**Implementation notes:**
- Export `Task`, `ListTasksResult`, `CreateTaskResult`, `listTasks()`, `createTask()` exactly as in design.md.
- Read `process.env.TASKBOARD2_API_URL` inside each call; trim, strip one trailing `/`; empty → failed with reason
  `not_configured`, no `fetch` call.
- `fetch(`${base}/tasks`, { signal: AbortSignal.timeout(5000), cache: "no-store", headers: { Accept: "application/json" } })`;
  `POST` adds `Content-Type: application/json` and `JSON.stringify({ title, due_date })` — no trimming, no rules.
- Validate shapes with small type guards (no new dependency): task object, array of tasks, 422 `detail[].loc`.
- Classify failures: `TimeoutError` → `timeout`, other rejections → `network`, unexpected status → `status`,
  JSON parse or shape mismatch → `invalid_body`; log one JSON line via `console.error` (design.md), never the body.
- Never throw; wrap everything in try/catch.
- `app/_lib/messages.ts`: the five constants from design.md, nothing else (imported by server and client code).
- `docs/env-vars.md`: new "Upstream APIs" section: `TASKBOARD2_API_URL`, default unset (every call fails, page shows
  error texts, probes stay healthy), no trailing slash, server-only, never `NEXT_PUBLIC_`; deployed value
  `http://taskboard2-api` set in the gitops repo.

**Done when:** Vitest tests against `listTasks`/`createTask` with a stubbed `fetch` pass for every success and failure
class (AC-001.10, .11 failure lists; AC-001.9 422 mapping inputs); `devbox run quality` is clean.

## t2 — Add the e2e stub API and start it from the Playwright config

**Files:** e2e/support/stub-api.mjs, playwright.config.ts
**Covers:** AC-001.3, AC-001.10, AC-001.11
**Goal:** local Playwright e2e runs the app against a controllable stub of taskboard2-api, so the empty-list and
unreachable-API criteria can be exercised end to end.

**Implementation notes:**
- `stub-api.mjs`: plain Node ESM using `node:http` and `node:crypto` only; endpoints, validation and behaviours
  exactly as design.md "Stub API for local e2e"; port from `STUB_API_PORT` (default 4010), bind `127.0.0.1`.
- `hang`: record the request, never respond (the app's 5 s timeout ends it); `drop`: record, then `req.socket.destroy()`.
- `playwright.config.ts`, only when `SMOKE_BASE_URL` is unset: `webServer` becomes an array — first the stub
  (`node e2e/support/stub-api.mjs`, url `http://127.0.0.1:4010/__stub/health`), then the existing app server with
  `env: { TASKBOARD2_API_URL: "http://127.0.0.1:4010" }`; set `workers: 1` (the stub state is global).
- The smoke path (`SMOKE_BASE_URL` set) stays exactly as today: no web servers, no worker limit.
- The `.mjs` file must not match Playwright's test pattern (it does not: no `.spec`/`.test`) and must pass eslint.

**Done when:** `devbox run e2e` starts both servers and the existing e2e tests still pass; the stub answers the control
endpoints as documented (a quick request against `/__stub/health` and `/__stub/requests`).

## t3 — Add the createTaskAction Server Action

**Files:** app/actions.ts
**Covers:** AC-001.5, AC-001.6, AC-001.7, AC-001.8, AC-001.9, AC-001.11
**Goal:** the single write endpoint the browser uses; it turns API outcomes into the web app's own error texts.

**Implementation notes:**
- `"use server"` file exporting `CreateTaskInput`, `CreateTaskActionResult` and `createTaskAction` as in design.md.
- Runtime guard on `input` (object, string `title`, string `dueDate`); otherwise `{ form: SAVE_ERROR }`, no API call.
- `dueDate === ""` → `due_date: null`; otherwise pass the value through; `title` passed unchanged.
- Exactly one `createTask` call, no retry; map `created` / `invalid` / `failed` per design.md.
- Return only `Task` fields and message constants; never API text.

**Done when:** Vitest tests of `createTaskAction` with a stubbed `fetch` pass for AC-001.6 (null date), .7 (title 422),
.8 (title sent as typed), .9 (due_date and unknown-loc 422, no `msg` leaked), .11 (failure, one call only).

## t4 — Add the TaskList component

**Files:** app/_components/task-list.tsx
**Covers:** AC-001.1, AC-001.3, AC-001.10
**Goal:** a presentational component for the three list states.

**Implementation notes:**
- `export function TaskList({ tasks }: { tasks: Task[] | null })` (`import type { Task }`), no `"use client"`
  directive (it is rendered inside the client board and must stay free of server imports).
- `null` → `<p role="alert">{LOAD_ERROR}</p>`; `[]` → `<p>{EMPTY_LIST}</p>`; otherwise `<ul aria-label="Tasks">` with
  one `<li>` per task in the given order: `<span className="task-title">`, then, only when `due_date` is set, a space
  and `<time dateTime={d}>{d}</time>` (design.md markup).
- Key items by `id`.

**Done when:** Vitest render tests of the three states and the item text format pass (AC-001.1, .3, .10 at component
level).

## t5 — Add the TaskForm client component

**Files:** app/_components/task-form.tsx
**Covers:** AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.9, AC-001.11, AC-001.13
**Goal:** the create form that keeps the user's input on every error and clears it on success.

**Implementation notes:**
- `"use client"`; `export function TaskForm({ onCreated }: { onCreated: (task: Task) => void })`.
- Controlled `title` and `dueDate` state; ids, labels, `name`s, `type="text"` / `type="date"`, `noValidate`,
  `aria-label="Create task"` exactly as design.md; no `required`, `maxLength`, `minLength`, `pattern` on the title.
- `onSubmit`: `preventDefault()`, then `startTransition(async () => { const r = await createTaskAction({ title, dueDate }); … })`;
  do not use the `action` prop (React would reset the form on errors).
- Success: `onCreated(r.task)`, set both fields to `""`, clear errors. Failure: set errors from `r.errors`, keep fields.
- Render errors: title error after the title input, due-date error after the date input, form error directly before
  the button, each `role="alert"` with the ids from design.md; `aria-invalid` and `aria-describedby` on invalid inputs.
- Disable the submit button while `isPending`.
- No `fetch` and no API URL in this file: the only network call is the Server Action to the page's own origin (AC-001.13).

**Done when:** Vitest tests with `@/app/actions` mocked pass for field attributes (AC-001.4), clearing on success
(AC-001.5), kept inputs and error placement (AC-001.7, .9, .11).

## t6 — Replace the template home page with the task board

**Files:** app/_components/task-board.tsx, app/page.tsx, app/globals.css, app/_components/feature-card.tsx, app/_components/icons.tsx, tests/page.test.tsx, e2e/home.spec.ts
**Covers:** AC-001.1, AC-001.2, AC-001.3, AC-001.4, AC-001.5, AC-001.6, AC-001.7, AC-001.8, AC-001.10, AC-001.12, AC-001.13
**Goal:** the root page lists tasks from the API and creates them through the form, with no template content left.

**Implementation notes:**
- `task-board.tsx`: `"use client"`; `TaskBoard({ initialTasks }: { initialTasks: Task[] | null })`; holds
  `tasks` in state, renders `TaskList` then `TaskForm`; `onCreated` appends to the list, or, when the list failed
  to load (`null`), leaves the load error in place (design.md).
- `app/page.tsx`: `export const dynamic = "force-dynamic"`; `async` default export `HomePage` calls `listTasks()` and
  renders the `<section aria-labelledby="tasks-title">` with `<h1 id="tasks-title">Tasks</h1>` and
  `<TaskBoard initialTasks={r.ok ? r.tasks : null} />`. No `fetch` cache, no `generateStaticParams`.
- Delete `app/_components/feature-card.tsx` and `app/_components/icons.tsx` (only the template page used them).
- `app/globals.css`: styles for the task list, form fields, field and form errors, reusing the existing tokens and
  `.btn`/`.btn-primary`; remove the template-only `hero`, `grid`/`card`, `steps` rules if nothing else uses them.
- Delete `tests/page.test.tsx` (it tests the removed template); in `e2e/home.spec.ts` expect the h1 "Tasks" instead of
  "taskboard2-web" and replace the "Check health" link test with a plain `request.get("/api/health")` check; keep the
  404 and phone-width tests.
- Leave `app/layout.tsx`, the header, the footer and `app/api/health|ready|metrics` untouched (AC-001.12).

**Done when:** all acceptance tests pass: Vitest page tests with a stubbed `fetch` (AC-001.1, .3, .10, unset
`TASKBOARD2_API_URL`), the probe tests (AC-001.12), the local e2e against the stub (AC-001.3, .5, .6, .7, .10, .11, .13),
and `devbox run ci` is green including the 80% coverage gate. The `@smoke` tests (AC-001.2, .4, .5, .6, .7, .8, .13)
run after deploy against `SMOKE_BASE_URL`.
