#!/usr/bin/env bash
set -euo pipefail
pnpm --filter @fleetros/api exec prisma generate
pnpm build
pnpm audit --prod --audit-level high
echo PRISMA_LOCK_GZ_BEGIN
gzip -c pnpm-lock.yaml | base64 -w0 | fold -w 1800 | awk '{printf "LOCK%03d:%s\n", NR, $0}'
echo PRISMA_LOCK_GZ_END
mkdir -p apps/web/dist
printf '<!doctype html><title>Prisma 7 validation</title>' > apps/web/dist/index.html
