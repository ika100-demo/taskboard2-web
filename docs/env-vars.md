# Environment variables

Configuration is read exclusively from environment variables. Defaults below are the application defaults. The deployed values are set per environment in the system's gitops-app repo (`system.yaml`: a component's `env`, and `replicas`, `resources` under `instances.<env>`).

## Core

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on. |
| `NODE_ENV` | `production` (in the image) | Node environment. |

## Observability

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | _(unset — tracing disabled)_ | OTLP endpoint; when set, `instrumentation.ts` enables OpenTelemetry tracing. |
| `OTEL_SERVICE_NAME` | `taskboard2-web` | Service name reported in traces. |

## Upstream APIs

| Variable | Default | Description |
|---|---|---|
| `TASKBOARD2_API_URL` | _(unset)_ | Base URL of taskboard2-api, without a trailing slash (one is stripped if present). Server-only, never `NEXT_PUBLIC_`. When unset every API call fails: the page shows the error texts and `/api/health` and `/api/ready` stay healthy. Deployed value `http://taskboard2-api` is set in the gitops repo. |

## Public (browser-exposed)

Variables prefixed `NEXT_PUBLIC_` are inlined into the client bundle at build time. Never put secrets in them.
