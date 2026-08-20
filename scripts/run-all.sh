#!/usr/bin/env bash
# Runs the entire benchmark suite end-to-end for every configured platform.
# Usage: ./scripts/run-all.sh
set -euo pipefail

ITERATIONS="${ITERATIONS:-100}"
CONCURRENCY="${CONCURRENCY:-10}"

echo "== Loading dataset into every platform =="
pnpm ts-node src/main.ts load --platform all

echo "== Running traversal workload (1/2/3-hop) =="
pnpm ts-node src/main.ts run --platform all --workload traversal --iterations "$ITERATIONS"

echo "== Running lookup workload (point + indexed) =="
pnpm ts-node src/main.ts run --platform all --workload lookup --iterations "$ITERATIONS"

echo "== Running aggregation workload =="
pnpm ts-node src/main.ts run --platform all --workload aggregation --iterations "$ITERATIONS"

echo "== Running mixed read/write workload (concurrency=$CONCURRENCY) =="
pnpm ts-node src/main.ts run --platform all --workload mixed --iterations "$ITERATIONS" --concurrency "$CONCURRENCY"

echo "== Generating results/RESULTS.md =="
pnpm ts-node src/main.ts report

echo "Done. See results/RESULTS.md for the results matrix."
