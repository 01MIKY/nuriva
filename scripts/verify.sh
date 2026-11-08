#!/usr/bin/env bash
# Full quality gate: stops at the first failure. Run before every commit.
set -euo pipefail
cd "$(dirname "$0")/.."
DB_URL="${TEST_DATABASE_URL:-postgres://nuriva_dev:nuriva_dev_local_only@localhost:5432/nuriva_test}"
db_up() { node -e "const pg=require(require.resolve('pg',{paths:['packages/db']}));const c=new pg.Client({connectionString:process.argv[1]});c.connect().then(()=>c.end()).catch(()=>process.exit(1))" "$DB_URL" 2>/dev/null; }
# Local convenience: start the dev container's PostgreSQL if it is installed but stopped.
if ! db_up && [ -z "${CI:-}" ] && command -v service >/dev/null 2>&1; then
  service postgresql start >/dev/null 2>&1 || true
  sleep 2
fi
if ! db_up; then
  echo "✗ PostgreSQL is not reachable at $DB_URL — start it first (see README)." >&2
  exit 1
fi
echo "▶ typecheck"; pnpm -r typecheck
echo "▶ unit + API tests"; pnpm -r --workspace-concurrency=1 test
echo "▶ end-to-end tests"; NEXT_TELEMETRY_DISABLED=1 pnpm e2e
echo "✓ all checks passed"
