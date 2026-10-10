#!/usr/bin/env bash
# Type-checks every Supabase Edge Function with Deno (the runtime Supabase uses).
set -euo pipefail
cd "$(dirname "$0")/../supabase/functions"

if command -v deno >/dev/null 2>&1; then
  DENO=(deno)
else
  DENO=(npx --yes deno@2)
fi

status=0
for dir in */; do
  fn="${dir%/}"
  [[ "$fn" == _* ]] && continue
  [[ -f "$fn/index.ts" ]] || continue
  echo "Checking $fn"
  (cd "$fn" && "${DENO[@]}" check --quiet --config deno.json index.ts) || status=1
done
exit $status
