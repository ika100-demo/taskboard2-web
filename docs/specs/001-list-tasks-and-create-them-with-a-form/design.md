# Design — 001 List tasks and create them with a form

## Decisions

- **Server-side only.** The page reads `GET /tasks` in its Server Component; the form writes through a Server Action
  that calls `POST /tasks`. The browser talks only to the web app's origin (AC-001.13). ADR:
  [docs/adr/001-backend-apis-called-server-side-only.md](../../adr/001-backend-apis-called-server-side-only.md).
- **One API client module** `app/_lib/tasks-api.ts` owns the URL, the 5 s timeout, response validation and failure
  logging. It never throws, so the page always answers `200` (AC-001.10) and the action always returns a result
  (AC-001.11).
- **`TASKBOARD2_API_URL` is read at call time**, not at module load and not at startup. Unset or empty means every
  call fails without a network request. Nothing at startup or in `/api/health` and `/api/ready` touches the API
  (AC-001.12); both routes stay unchanged.
- **The form submits from `onSubmit` (with `preventDefault`) and calls the Server Action in `startTransition`**, with
  controlled inputs. It does not use `<form action={...}>`: React 19 resets a form after an action prop runs, which
  would drop the user's input on errors (AC-001.7, .9, .11).
- **The new task is appended from the action's result** (the `201` body) to client state seeded with the server's
  list, so it appears last without a reload (AC-001.5, .6). If the list failed to load, a successful create keeps the
  load-error text (a one-item list would misrepresent the store), clears the form, and the next load shows the truth.
- **The web app adds no validation and no trimming**: `title` is sent exactly as typed; `due_date` is `null` when the
  date field is empty, else the field's value (AC-001.6, .7, .8). The title input has no `required`, `maxLength`,
  `minLength` or `pattern` attribute, and the form has `noValidate` (AC-001.4).
- **Error texts are the web app's own constants** in `app/_lib/messages.ts`; nothing from an API body reaches the
  browser (AC-001.9).
- **Local e2e runs against a stub API** (`e2e/support/stub-api.mjs`) that Playwright starts as a second `webServer`;
  the app is started with `TASKBOARD2_API_URL` pointing at it. The stub's state is global, so local e2e runs with
  `workers: 1`.
- The template home page (hero, feature cards, get-started) is removed together with `feature-card.tsx` and
  `icons.tsx` (only the page used them; left in place they would be uncovered code). Layout, header, footer and the
  `/api/*` routes stay.

## Modules

| Module | Responsibility | New / changed |
|---|---|---|
| `app/_lib/messages.ts` | the five user-facing texts | new |
| `app/_lib/tasks-api.ts` | `Task` type, `listTasks`, `createTask`, timeout, shape validation, failure log | new |
| `app/actions.ts` | `"use server"`: `createTaskAction`, maps API results to form errors | new |
| `app/_components/task-list.tsx` | renders list / "No tasks yet." / load error | new |
| `app/_components/task-form.tsx` | `"use client"`: controlled create form, field and form errors | new |
| `app/_components/task-board.tsx` | `"use client"`: holds the task list state, wires form to list | new |
| `app/page.tsx` | dynamic Server Component: `listTasks()` → `TaskBoard` | changed (template replaced) |
| `app/globals.css` | task list and form styles; template-only styles removed | changed |
| `e2e/support/stub-api.mjs` | in-memory stub of taskboard2-api with control endpoints | new |
| `playwright.config.ts` | starts stub + app for local e2e | changed |
| `docs/env-vars.md` | documents `TASKBOARD2_API_URL` | changed |

## Contract

### Upstream: taskboard2-api (as the spec's System context, restated as the web app uses it)

- Base: `process.env.TASKBOARD2_API_URL` (no trailing slash; the client strips one if present). Requests go to
  exactly `${base}/tasks`.
- Every request: `signal: AbortSignal.timeout(5000)`, `cache: "no-store"`, `Accept: application/json`, no retry.
- `GET /tasks` succeeds only on `200` with a JSON array whose every element is a task object
  (`id`: string, `title`: string, `due_date`: string matching `^\d{4}-\d{2}-\d{2}$` or `null`). Anything else is a failed call.
- `POST /tasks` sends `Content-Type: application/json`, body exactly `{"title": <as typed>, "due_date": <string|null>}`.
  - `201` with a task object → created.
  - `422` with body `{"detail": [{"loc": [...], ...}, ...]}` → invalid; the set of known fields is the last element of
    each `loc` that equals `"title"` or `"due_date"`.
  - `422` with any other body, any other status, non-JSON, timeout, network error, unset base URL → failed.

### `app/_lib/tasks-api.ts` (server code only)

```ts
export type Task = { id: string; title: string; due_date: string | null };

export type ListTasksResult = { ok: true; tasks: Task[] } | { ok: false };
export function listTasks(): Promise<ListTasksResult>;

export type CreateTaskResult =
  | { kind: "created"; task: Task }
  | { kind: "invalid"; fields: Array<"title" | "due_date"> }   // deduplicated, may be empty
  | { kind: "failed" };
export function createTask(body: { title: string; due_date: string | null }): Promise<CreateTaskResult>;
```

Neither function throws. A failed call writes one line to `console.error`:

```json
{"level":"error","msg":"taskboard2-api call failed","method":"GET","path":"/tasks","status":503,"duration_ms":12,"reason":"status"}
```

`status` is the HTTP status or `null`; `reason` is one of `not_configured`, `timeout`, `network`, `status`,
`invalid_body`. The response body is never logged. A `422` is not a failed call and is not logged.

### `app/_lib/messages.ts`

```ts
export const LOAD_ERROR = "Tasks could not be loaded. Please try again later.";
export const EMPTY_LIST = "No tasks yet.";
export const TITLE_ERROR = "Please enter a title of 1 to 200 characters.";
export const DUE_DATE_ERROR = "Please enter a valid date as YYYY-MM-DD.";
export const SAVE_ERROR = "The task could not be saved. Please try again later.";
```

### Server Action `app/actions.ts`

```ts
"use server";
export type CreateTaskInput = { title: string; dueDate: string };   // dueDate: "" or the date field's value
export type CreateTaskActionResult =
  | { ok: true; task: Task }
  | { ok: false; errors: { title?: string; dueDate?: string; form?: string } };
export async function createTaskAction(input: CreateTaskInput): Promise<CreateTaskActionResult>;
```

- Calls `createTask({ title: input.title, due_date: input.dueDate === "" ? null : input.dueDate })` exactly once.
  If `input` is not an object with string `title` and `dueDate`, it returns `{ form: SAVE_ERROR }` without calling the API.
- `created` → `{ ok: true, task }`.
- `invalid` with `title` → `errors.title = TITLE_ERROR`; with `due_date` → `errors.dueDate = DUE_DATE_ERROR`
  (both when both); with neither → `errors.form = SAVE_ERROR` (AC-001.7, .9).
- `failed` → `errors.form = SAVE_ERROR` (AC-001.11).

### Page `GET /` (rendered HTML)

Always `200`. Inside `<main>`:

```html
<section aria-labelledby="tasks-title">
  <h1 id="tasks-title">Tasks</h1>

  <!-- exactly one of: -->
  <ul aria-label="Tasks">
    <li><span class="task-title">Buy milk</span> <time dateTime="2026-11-30">2026-11-30</time></li>
    <li><span class="task-title">No date task</span></li>
  </ul>
  <p>No tasks yet.</p>
  <p role="alert">Tasks could not be loaded. Please try again later.</p>

  <form aria-label="Create task" noValidate>
    <label for="task-title">Title</label>
    <input id="task-title" name="title" type="text" />            <!-- no required/maxLength/minLength/pattern -->
    <p id="task-title-error" role="alert">…TITLE_ERROR…</p>        <!-- only when set -->
    <label for="task-due-date">Due date</label>
    <input id="task-due-date" name="due_date" type="date" />
    <p id="task-due-date-error" role="alert">…DUE_DATE_ERROR…</p>  <!-- only when set -->
    <p id="task-form-error" role="alert">…SAVE_ERROR…</p>          <!-- only when set; directly before the button -->
    <button type="submit">Add task</button>
  </form>
</section>
```

- List items follow the API order; an item's text content is `"<title> <due_date>"`, or `"<title>"` when
  `due_date` is `null` (AC-001.1).
- A field with an error has `aria-invalid="true"` and `aria-describedby` pointing at its error element.
- While the action is pending, the submit button is `disabled` (one click → one `POST`, AC-001.5).
- On success: the task is appended as the last `<li>` (the `<ul>` replaces "No tasks yet."), both inputs become `""`,
  all errors clear. On error: inputs keep their values, errors are replaced by the action's errors, the list is
  unchanged.
- `app/page.tsx` exports `dynamic = "force-dynamic"`; `HomePage` is an `async` Server Component, so Vitest renders it
  as `render(await HomePage())` with `fetch` stubbed (`vi.stubGlobal`) and `process.env.TASKBOARD2_API_URL` set.

### Stub API for local e2e (`e2e/support/stub-api.mjs`)

Listens on `http://127.0.0.1:${STUB_API_PORT:-4010}`; Playwright starts it before the app and starts the app with
`TASKBOARD2_API_URL=http://127.0.0.1:4010`. Tests reach it at `process.env.STUB_API_URL ?? "http://127.0.0.1:4010"`.

- `GET /tasks`, `POST /tasks`: the API contract with an in-memory store. Validation: body not a JSON object →
  `422` loc `["body"]`; `title` not a string or trimmed length outside 1–200 → `422` loc `["body","title"]`;
  `due_date` present, not `null` and not a real `YYYY-MM-DD` date → `422` loc `["body","due_date"]` (one `detail`
  entry per failing field). `201` stores and returns `{id: randomUUID(), title: trimmed, due_date}`.
- `POST /__stub/reset` → `204`; empties the store and the request log, both behaviours back to `"normal"`.
- `PUT /__stub/tasks` body: array of task objects → `204`; replaces the store (order kept).
- `PUT /__stub/behaviour` body `{"get"?: B, "post"?: B}` → `204`, where `B` is
  `"normal"` | `"hang"` (never answers) | `"drop"` (destroys the socket) | `{"status": int, "body"?: any, "contentType"?: string}`
  (a string `body` is sent raw, anything else as JSON; `contentType` defaults to `application/json`).
- `GET /__stub/requests` → `200` `[{"method": str, "path": str, "body": any}]`, every `/tasks` request in arrival
  order, logged on receipt (also for `hang`/`drop`); `body` is the parsed JSON, the raw text if not JSON, or `null`.
- `GET /__stub/health` → `200 {"status":"ok"}`.

Tests call `POST /__stub/reset` in `beforeEach`. Acceptance tests live in new files (`tests/tasks-*.test.ts(x)`,
`e2e/tasks*.spec.ts`); the template's `tests/page.test.tsx` is deleted and `e2e/home.spec.ts` adjusted by t6.

## Risks

- `playwright.config.ts` may be a skeleton file a `/platform:update` overwrites; then the stub wiring must be
  re-applied (or proposed upstream via `/issue:report`).
- `reuseExistingServer` outside CI reuses an app already on port 3000; one started without `TASKBOARD2_API_URL`
  makes the stub-based e2e fail. Stop the dev server before `devbox run e2e`.
- A user retrying after a timed-out `POST` may create a duplicate; the spec allows it (non-goal).
