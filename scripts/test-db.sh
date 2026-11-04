#!/usr/bin/env bash
# Apply the migrations to a THROWAWAY local Postgres (15+) database and run
# the security checks. Never point this at your Supabase project: it loads a
# local stand-in for Supabase's roles (supabase/tests/supabase_shim.sql).
#
#   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."

: "${TEST_DATABASE_URL:?Set TEST_DATABASE_URL to a disposable local Postgres server}"
case "$TEST_DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run against a Supabase host." >&2; exit 1 ;;
esac

DB=classroom_survey_test
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB"
TEST_URL=$(python3 -c "import sys,urllib.parse as u;p=u.urlparse(sys.argv[1]);print(u.urlunparse(p._replace(path='/$DB')))" "$TEST_DATABASE_URL")

for f in supabase/tests/supabase_shim.sql supabase/migrations/*.sql; do
  echo "applying $f"
  psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done

OUT=$(psql "$TEST_URL" -v ON_ERROR_STOP=1 -q -tA -F ' | ' -f supabase/verify/01_security_checks.sql)
echo "$OUT"
PASS=$(grep -c '| PASS |' <<<"$OUT" || true)
FAIL=$(grep -c '| FAIL |' <<<"$OUT" || true)
echo "----"
echo "$PASS passed, $FAIL failed"
psql "$TEST_DATABASE_URL" -q -c "drop database $DB"
[ "$FAIL" -eq 0 ] && [ "$PASS" -gt 0 ]
