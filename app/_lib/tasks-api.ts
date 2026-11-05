// Server code only: reads a server-side env var, never import from a client component.

export type Task = { id: string; title: string; due_date: string | null };

export type ListTasksResult = { ok: true; tasks: Task[] } | { ok: false };

export type CreateTaskResult =
  | { kind: "created"; task: Task }
  | { kind: "invalid"; fields: Array<"title" | "due_date"> }
  | { kind: "failed" };

type Reason = "not_configured" | "timeout" | "network" | "status" | "invalid_body";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isTask(v: unknown): v is Task {
  return (
    isRecord(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    (v.due_date === null || (typeof v.due_date === "string" && DATE_RE.test(v.due_date)))
  );
}

function baseUrl(): string {
  const raw = (process.env.TASKBOARD2_API_URL ?? "").trim();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function logFailure(method: string, status: number | null, start: number, reason: Reason): void {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "taskboard2-api call failed",
      method,
      path: "/tasks",
      status,
      duration_ms: Date.now() - start,
      reason,
    }),
  );
}

type Outcome = { status: number; body: unknown } | { reason: Reason; status: number | null };

async function call(method: "GET" | "POST", payload?: unknown): Promise<Outcome> {
  const start = Date.now();
  const base = baseUrl();
  if (!base) {
    logFailure(method, null, start, "not_configured");
    return { reason: "not_configured", status: null };
  }
  let response: Response;
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    const init: RequestInit = {
      method,
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      headers,
    };
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(payload);
    }
    response = await fetch(`${base}/tasks`, init);
  } catch (err) {
    const reason: Reason = err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network";
    logFailure(method, null, start, reason);
    return { reason, status: null };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return { status: response.status, body };
}

export async function listTasks(): Promise<ListTasksResult> {
  const start = Date.now();
  try {
    const out = await call("GET");
    if (!("body" in out)) return { ok: false };
    if (out.status !== 200) {
      logFailure("GET", out.status, start, "status");
      return { ok: false };
    }
    if (!Array.isArray(out.body) || !out.body.every(isTask)) {
      logFailure("GET", out.status, start, "invalid_body");
      return { ok: false };
    }
    return { ok: true, tasks: out.body };
  } catch {
    logFailure("GET", null, start, "network");
    return { ok: false };
  }
}

export async function createTask(body: { title: string; due_date: string | null }): Promise<CreateTaskResult> {
  const start = Date.now();
  try {
    const out = await call("POST", { title: body.title, due_date: body.due_date });
    if (!("body" in out)) return { kind: "failed" };
    if (out.status === 201) {
      if (isTask(out.body)) return { kind: "created", task: out.body };
      logFailure("POST", out.status, start, "invalid_body");
      return { kind: "failed" };
    }
    if (out.status === 422) {
      const detail = isRecord(out.body) ? out.body.detail : undefined;
      if (Array.isArray(detail) && detail.every((d) => isRecord(d) && Array.isArray(d.loc))) {
        const fields: Array<"title" | "due_date"> = [];
        for (const d of detail as Array<{ loc: unknown[] }>) {
          const last = d.loc[d.loc.length - 1];
          if ((last === "title" || last === "due_date") && !fields.includes(last)) fields.push(last);
        }
        return { kind: "invalid", fields };
      }
      logFailure("POST", out.status, start, "invalid_body");
      return { kind: "failed" };
    }
    logFailure("POST", out.status, start, "status");
    return { kind: "failed" };
  } catch {
    logFailure("POST", null, start, "network");
    return { kind: "failed" };
  }
}
