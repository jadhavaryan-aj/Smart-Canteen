#!/usr/bin/env bash
# Runs the database integration tests (migrations, RLS, SQL functions and the
# Edge Function handlers against real Postgres).
#
# If DATABASE_URL is set (e.g. in CI), it must point at a PostgreSQL 15+ server
# where the user can CREATE DATABASE; a throwaway database is created inside it.
# Otherwise a temporary local cluster is started with initdb/pg_ctl.
set -euo pipefail
cd "$(dirname "$0")/.."

RUN_AS=()
cleanup() {
  if [[ -n "${PGTEST_DIR:-}" && -d "${PGTEST_DIR}" ]]; then
    "${RUN_AS[@]}" "${PG_CTL}" -D "${PGTEST_DIR}/data" -m immediate stop >/dev/null 2>&1 || true
    rm -rf "${PGTEST_DIR}"
  fi
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  PG_BIN="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || ls /usr/lib/postgresql/*/bin/pg_ctl 2>/dev/null | sort -V | tail -1)")}"
  PG_CTL="${PG_BIN}/pg_ctl"
  INITDB="${PG_BIN}/initdb"
  if [[ ! -x "${PG_CTL}" ]]; then
    echo "PostgreSQL server binaries not found. Install PostgreSQL 15+ or set DATABASE_URL." >&2
    exit 1
  fi
  PORT="${PGTEST_PORT:-54329}"
  PGTEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/campus-table-pg.XXXXXX")"
  trap cleanup EXIT

  if [[ "$(id -u)" == "0" ]]; then
    # PostgreSQL refuses to run as root; use the postgres system user.
    chown -R postgres:postgres "${PGTEST_DIR}"
    RUN_AS=(runuser -u postgres --)
  fi

  "${RUN_AS[@]}" "${INITDB}" -D "${PGTEST_DIR}/data" -U postgres --auth=trust --no-sync -E UTF8 >/dev/null
  "${RUN_AS[@]}" "${PG_CTL}" -D "${PGTEST_DIR}/data" -o "-p ${PORT} -k ${PGTEST_DIR} -c listen_addresses=127.0.0.1 -c fsync=off" -l "${PGTEST_DIR}/pg.log" -w start >/dev/null
  export DATABASE_URL="postgresql://postgres@127.0.0.1:${PORT}/postgres"
fi

npx vitest run --project db "$@"
