// Stub of taskboard2-api for local e2e runs. Control endpoints live under /__stub/.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const port = Number(process.env.STUB_API_PORT || 4010);

let tasks = [];
let requests = [];
let behaviour = { get: "normal", post: "normal" };

function send(res, status, body, contentType = "application/json") {
  if (body === undefined) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { "content-type": contentType });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", () => resolve(""));
  });
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, value: text };
  }
}

function isRealDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function validate(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return [{ loc: ["body"], msg: "Input should be a valid dictionary", type: "model_attributes_type" }];
  }
  const detail = [];
  const title = typeof body.title === "string" ? body.title.trim() : null;
  if (title === null || title.length < 1 || title.length > 200) {
    detail.push({ loc: ["body", "title"], msg: "Title must be 1-200 characters", type: "value_error" });
  }
  if (body.due_date !== undefined && body.due_date !== null && !isRealDate(body.due_date)) {
    detail.push({ loc: ["body", "due_date"], msg: "Invalid date", type: "value_error" });
  }
  return detail;
}

function applyBehaviour(b, res, req, fallback) {
  if (b === "hang") return;
  if (b === "drop") {
    req.socket.destroy();
    return;
  }
  if (b && typeof b === "object") {
    send(res, b.status, b.body === undefined ? "" : b.body, b.contentType || "application/json");
    return;
  }
  fallback();
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method || "GET";
  const text = await readBody(req);

  if (path === "/__stub/health" && method === "GET") return send(res, 200, { status: "ok" });
  if (path === "/__stub/reset" && method === "POST") {
    tasks = [];
    requests = [];
    behaviour = { get: "normal", post: "normal" };
    return send(res, 204);
  }
  if (path === "/__stub/requests" && method === "GET") return send(res, 200, requests);
  if (path === "/__stub/tasks" && method === "PUT") {
    const parsed = parseJson(text);
    if (!parsed.ok || !Array.isArray(parsed.value)) return send(res, 400, { error: "array expected" });
    tasks = parsed.value;
    return send(res, 204);
  }
  if (path === "/__stub/behaviour" && method === "PUT") {
    const parsed = parseJson(text);
    if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object") {
      return send(res, 400, { error: "object expected" });
    }
    if ("get" in parsed.value) behaviour.get = parsed.value.get;
    if ("post" in parsed.value) behaviour.post = parsed.value.post;
    return send(res, 204);
  }

  if (path === "/tasks" && (method === "GET" || method === "POST")) {
    const parsed = method === "POST" ? parseJson(text) : { ok: true, value: null };
    requests.push({ method, path, body: text === "" ? null : parsed.value });
    if (method === "GET") {
      return applyBehaviour(behaviour.get, res, req, () => send(res, 200, tasks));
    }
    return applyBehaviour(behaviour.post, res, req, () => {
      const body = parsed.ok ? parsed.value : undefined;
      const detail = validate(body);
      if (detail.length > 0) return send(res, 422, { detail });
      const task = {
        id: randomUUID(),
        title: body.title.trim(),
        due_date: body.due_date ?? null,
      };
      tasks.push(task);
      send(res, 201, task);
    });
  }

  send(res, 404, { detail: "Not Found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`stub taskboard2-api listening on http://127.0.0.1:${port}`);
});
