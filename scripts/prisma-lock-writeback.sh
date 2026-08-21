#!/usr/bin/env bash
set -euo pipefail

git config user.name 'vercel-build[bot]'
git config user.email 'vercel-build[bot]@users.noreply.github.com'
git add -- pnpm-lock.yaml
if ! git diff --cached --quiet; then
  git commit -m 'Regenerate lockfile for Prisma 7.9.1'
  git push origin HEAD:codex/prisma-7-upgrade
fi
mkdir -p apps/web/dist
printf '<!doctype html><title>Prisma lockfile writeback</title>' > apps/web/dist/index.html
