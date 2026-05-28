#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_TABLES="trips waypoints load_items load_map_slots fuel_water_logs risk_scores convoys convoy_invites convoy_members convoy_member_locations vehicles loadouts loadout_items expedition_sessions expedition_timeline_events expedition_timeline dispatch_cad_events"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

pass() {
  printf 'PASS: %s\n' "$1"
}

info() {
  printf 'INFO: %s\n' "$1"
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "Missing required environment variable: ${name}"
  fi
}

require_env "SUPABASE_URL"
require_env "SUPABASE_ANON_KEY"

if ! command -v curl >/dev/null 2>&1; then
  fail "curl is required to run the Supabase RLS smoke test"
fi

BASE_URL="${SUPABASE_URL%/}"
TABLES="${ECS_RLS_TABLES:-$DEFAULT_TABLES}"

if [[ -z "${TABLES// }" ]]; then
  fail "ECS_RLS_TABLES resolved to an empty table list"
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

info "Running anon REST RLS smoke checks against configured Supabase URL"
info "Tables: ${TABLES}"

failed=0

for table in $TABLES; do
  if [[ ! "$table" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    printf 'FAIL: invalid table identifier "%s"\n' "$table" >&2
    failed=1
    continue
  fi

  body_file="${tmp_dir}/${table}.json"
  status="$(
    curl \
      --silent \
      --show-error \
      --location \
      --max-time 20 \
      --output "$body_file" \
      --write-out '%{http_code}' \
      --header "apikey: ${SUPABASE_ANON_KEY}" \
      --header "Authorization: Bearer ${SUPABASE_ANON_KEY}" \
      --header "Accept: application/json" \
      "${BASE_URL}/rest/v1/${table}?select=*&limit=1"
  )" || {
    printf 'FAIL: %s anon REST request failed before receiving an HTTP response\n' "$table" >&2
    failed=1
    continue
  }

  case "$status" in
    200)
      compact_body="$(tr -d '[:space:]' < "$body_file")"
      if [[ "$compact_body" == "[]" ]]; then
        printf 'PASS: %s anon REST returned no rows\n' "$table"
      else
        printf 'FAIL: %s anon REST returned data; review RLS/public policy before release\n' "$table" >&2
        failed=1
      fi
      ;;
    401|403)
      printf 'PASS: %s anon REST denied with HTTP %s\n' "$table" "$status"
      ;;
    404)
      printf 'FAIL: %s table was not available through REST; verify migrations/schema cache/table list\n' "$table" >&2
      failed=1
      ;;
    *)
      printf 'FAIL: %s anon REST returned unexpected HTTP %s\n' "$table" "$status" >&2
      failed=1
      ;;
  esac
done

if [[ "$failed" -ne 0 ]]; then
  fail "Supabase anon REST RLS smoke checks failed"
fi

pass "Supabase anon REST RLS smoke checks passed"
