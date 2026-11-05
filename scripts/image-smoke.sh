#!/usr/bin/env bash
# Runs the scanned image like Kubernetes would (read-only root, /tmp tmpfs, no TASKBOARD2_API_URL) and probes it.
# Usage: IMAGE_SMOKE_PORT=3200 devbox run image-smoke
set -euo pipefail
port="${IMAGE_SMOKE_PORT:-3200}"
name="taskboard2-web-smoke-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$name" --read-only --tmpfs /tmp -p "${port}:3000" taskboard2-web:scan >/dev/null
for i in $(seq 1 30); do curl -fs "http://localhost:${port}/api/health" >/dev/null 2>&1 && break; sleep 1; done
for p in /api/health /api/ready /; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${port}${p}")
  echo "${p} -> ${code}"
  [ "$code" = 200 ] || { docker logs "$name" | tail -20; exit 1; }
done
echo "user: $(docker exec "$name" id -u)"
