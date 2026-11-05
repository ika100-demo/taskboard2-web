# Verification — 001 List tasks and create them with a form

**Result:** pass
**Commit:** d7830c1 · **Base:** d3c4b74 · **Trace:** 13/13 criteria named by tests (7/7 smoke criteria have an `@smoke` test)

Test run (Phase 3): `devbox run ci` green (quality, Vitest with about 97% line coverage, security); local Playwright
`e2e/tasks.spec.ts` 22/22 against the stub API; `@smoke` specs passed against the local app (`SMOKE_BASE_URL=http://localhost:3100`).
Acceptance tests unchanged since the red commit `2b0c3b3` (only the planned `e2e/home.spec.ts` edit, the stub and the
deletion of `tests/page.test.tsx` touch test paths after it).

| Criterion | Verdict | Tests | Implementation | Notes |
|---|---|---|---|---|
| AC-001.1 | met | `e2e/tasks.spec.ts` "AC-001.1 lists tasks created directly through the API…"; `tests/tasks-page.test.tsx` "AC-001.1 shows one item per task in API order…", "AC-001.1 the page is dynamic…"; `tests/tasks-api.test.ts` "AC-001.1 returns the tasks in the order…" | `app/_components/task-list.tsx:8-19`, `app/page.tsx:4-11`, `app/_lib/tasks-api.ts:85-98` | e2e asserts exact item texts incl. null date, then a task POSTed directly to the API appears after reload; `force-dynamic` and `cache: "no-store"` asserted |
| AC-001.2 | met | `e2e/tasks-smoke.spec.ts` "AC-001.2 … @smoke"; `e2e/tasks.spec.ts` "AC-001.2 …" | `app/page.tsx:7-11`, `app/_components/task-board.tsx:12-15` | after reload: `"<title> 2026-12-24"` listed once, index after the pre-existing tasks |
| AC-001.3 | met | `e2e/tasks.spec.ts` "AC-001.3 …"; `tests/tasks-page.test.tsx` "AC-001.3 …"; `tests/tasks-api.test.ts` "AC-001.3 treats [] …" | `app/_components/task-list.tsx:6` | asserts the text and zero `list` roles on the page |
| AC-001.4 | met | `e2e/tasks-smoke.spec.ts` "AC-001.4 … @smoke"; `e2e/tasks.spec.ts` "AC-001.4 …"; `tests/tasks-page.test.tsx` "AC-001.4 …" | `app/_components/task-form.tsx:34-72` | labels, `type="text"`/`"date"`, button, and absence of `required`/`maxlength`/`minlength`/`pattern` asserted; form has `noValidate` |
| AC-001.5 | met | `e2e/tasks.spec.ts` "AC-001.5 …"; `e2e/tasks-smoke.spec.ts` "AC-001.5 … @smoke"; `tests/tasks-page.test.tsx` "AC-001.5 …" (x2); `tests/tasks-action.test.ts`, `tests/tasks-api.test.ts` "AC-001.5 …" | `app/_components/task-form.tsx:18-31,70`, `app/_components/task-board.tsx:14`, `app/actions.ts:22-26`, `app/_lib/tasks-api.ts:105-111` | last item text, both fields `""`, zero navigations, stub log shows exactly one `POST /tasks` with `{title, due_date}`; button disabled while pending |
| AC-001.6 | met | `e2e/tasks.spec.ts` "AC-001.6 …"; `e2e/tasks-smoke.spec.ts` "AC-001.6 … @smoke"; page/action/api tests "AC-001.6 …" | `app/actions.ts:24`, `app/_components/task-list.tsx:12` | stub received `due_date: null`; last item text is the bare title |
| AC-001.7 | met | `e2e/tasks.spec.ts` "AC-001.7 …"; `e2e/tasks-smoke.spec.ts` "AC-001.7 … @smoke"; `tests/tasks-page.test.tsx` "AC-001.7 …"; `tests/tasks-action.test.ts` "AC-001.7 …"; `tests/tasks-api.test.ts` "AC-001.7 …" | `app/actions.ts:27-29`, `app/_components/task-form.tsx:42-49`, `app/_lib/tasks-api.ts:115-123` | `""`, `"   "`, 201 chars all reach the stub as typed; error text shown, linked via `aria-describedby`; inputs kept; count unchanged also after reload |
| AC-001.8 | met | `e2e/tasks.spec.ts` "AC-001.8 …"; `e2e/tasks-smoke.spec.ts` "AC-001.8 … @smoke"; page/action/api tests "AC-001.8 …" | `app/_lib/tasks-api.ts:108`, `app/actions.ts:23` | 200-char and `"  padded  "` sent untouched; list shows the API's trimmed `"padded"` |
| AC-001.9 | met | `e2e/tasks.spec.ts` "AC-001.9 …"; `tests/tasks-page.test.tsx` "AC-001.9 …" (x2); `tests/tasks-action.test.ts` "AC-001.9 …" (x2); `tests/tasks-api.test.ts` "AC-001.9 …" | `app/actions.ts:30-31`, `app/_components/task-form.tsx:57-69`, `app/_lib/messages.ts:4-5` | date error tied to the date field (`aria-describedby`); unknown-loc 422 shows save error as the button's previous sibling; inputs kept; list unchanged; `API-MSG-LEAK` absent |
| AC-001.10 | met | `e2e/tasks.spec.ts` "AC-001.10 …" (503, 500, non-array, non-JSON, drop, hang); `tests/tasks-page.test.tsx` "AC-001.10 …" (incl. 201 and unset address); `tests/tasks-api.test.ts` "AC-001.10 …" (x5) | `app/_lib/tasks-api.ts:29-32,50-75,85-102`, `app/_components/task-list.tsx:5` | e2e asserts HTTP 200, load error, no list, form present; 5 s `AbortSignal.timeout` and single call asserted |
| AC-001.11 | met | `e2e/tasks.spec.ts` "AC-001.11 …" (503, 200, bad 201 body, drop, hang); `tests/tasks-page.test.tsx` "AC-001.11 …" (x3); `tests/tasks-action.test.ts` "AC-001.11 …" (x2); `tests/tasks-api.test.ts` "AC-001.11 …" (x2) | `app/_lib/tasks-api.ts:105-133`, `app/actions.ts:34`, `app/_components/task-form.tsx:27-28,65-69` | save error directly before the button, inputs kept, list unchanged, exactly one POST in the stub log |
| AC-001.12 | met | `tests/tasks-probes.test.ts` "AC-001.12 …" (x2); `e2e/tasks.spec.ts` "AC-001.12 …" | `app/api/health/route.ts`, `app/api/ready/route.ts` (unchanged), `app/_lib/tasks-api.ts:29-32` (env read at call time only) | probes 200 with API unset/unreachable/dropping, no fetch issued; app started in e2e regardless of API state |
| AC-001.13 | met | `e2e/tasks.spec.ts` "AC-001.13 …"; `e2e/tasks-smoke.spec.ts` "AC-001.13 … @smoke" | `app/_components/task-form.tsx:6,21` (Server Action only), `app/_lib/tasks-api.ts:1,52` (server env, no `NEXT_PUBLIC_`) | set of request hosts over load + create equals exactly the web app's host |

## Non-goals

No edit, complete or delete code; no pagination, search, filter or client sort (`task-list.tsx` renders API order).
No validation or trimming in the browser or the web app (`noValidate`, no input attributes, title passed through in
`actions.ts:23`). No retries (`tasks-api.ts:70` single fetch, asserted). API `msg` texts never rendered (only
`messages.ts` constants reach the client). Dates rendered verbatim as `YYYY-MM-DD`, no localisation. No auth. ✔

## Deviations from the plan

- `app/_components/site-header.tsx` changed (commit `1617832`) but is in no task's `files`, and plan t6 / the spec's
  repo notes say to keep the header untouched. The primary nav now renders `<a>` links directly inside
  `<nav class="nav-list">` instead of `<ul><li>`. Cause: the AC-001.3 / AC-001.10 e2e tests assert zero `list` roles
  on the whole page, which the header's `<ul>` would break; coders may not change the tests. Links, hrefs, classes and
  look are unchanged (`.nav-list` is flex, `globals.css:180`). **Acceptable**; small accessibility cost (screen readers
  no longer announce "list, N items" for the nav). If that matters, a follow-up can scope those assertions to `<main>`
  and restore the `<ul>`.
- All six tasks `done: true`; every other changed file is listed in a task's `files` or is a spec/ADR document or an
  acceptance-test file named in design.md (`tests/tasks-*.test.ts(x)`, `e2e/tasks*.spec.ts`). ✔

## Contract

Matches `design.md`: `tasks-api.ts` exports and result unions as specified; URL `${base}/tasks` with one trailing slash
stripped; `AbortSignal.timeout(5000)`, `cache: "no-store"`, `Accept`/`Content-Type` headers; 200/201/422 shape checks;
one-line JSON failure log with `status`, `duration_ms`, `reason`, never the body; `createTaskAction` input guard and
result mapping; page markup (`section`/`h1#tasks-title`, `ul[aria-label=Tasks]`, `time[dateTime]`, error ids,
`aria-invalid`/`aria-describedby`, disabled button while pending); `force-dynamic`; stub API and Playwright wiring with
`workers: 1` only when `SMOKE_BASE_URL` is unset. ✔
