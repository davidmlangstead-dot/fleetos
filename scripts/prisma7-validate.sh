#!/usr/bin/env bash
set -euo pipefail
pnpm --filter @fleetros/api exec prisma generate
pnpm build
pnpm audit --prod --audit-level high
mkdir -p apps/web/dist
base64 -w0 pnpm-lock.yaml > apps/web/dist/pnpm-lock.b64
printf '<!doctype html><title>Prisma 7 validation</title>' > apps/web/dist/index.html
