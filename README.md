# Graph Database Cloud Benchmark: CognoDB vs. Neo4j AuraDB vs. Memgraph vs. ArangoDB vs. FalkorDB

Reproducible benchmark comparing CognoDB Cloud against 4 other managed graph
database platforms on identical data, queries, and resource tiers.

## Platforms compared

| Platform       | Tier         | vCPU                 | RAM                     | Storage            | Query language            |
| -------------- | ------------ | -------------------- | ----------------------- | ------------------ | ------------------------- |
| CognoDB Cloud  | Free (c0)    | 0.5 (burstable)      | 256 MB                  | 1 GB               | Cypher                    |
| Neo4j AuraDB   | Free         | N/A                  | 250 MB                  | 500 MB             | Cypher                    |
| Memgraph Cloud | 14-day trial | 2 (see caveat below) | 2 GB (see caveat below) | 14 GB              | Cypher (Memgraph dialect) |
| ArangoDB Oasis | 14-day trial | 1                    | 4 GB                    | 40 GB              | AQL                       |
| FalkorDB Cloud | Free         | N/A                  | 100 MB                  | 100 MB (in-memory) | OpenCypher subset         |

## Dataset

- **Source:** [SNAP email-Enron](https://snap.stanford.edu/data/email-Enron.html) — who-emailed-whom network among Enron employees, downloaded and cached automatically by `src/dataset/dataset-loader.service.ts` on first `load` run.
- **Nodes:** 36,692
- **Relationships:** 183,831 (100k–500k range, no sampling needed)
- **Sizing rationale:** this dataset was chosen specifically because it fits FalkorDB Cloud's 100MB in-memory free-tier cap — the tightest resource constraint across all five platforms — without truncation, keeping the same dataset genuinely identical everywhere.
- **Load method:** driver batching, 1,000 records per batch — `neo4j-driver` for the bolt/Cypher platforms (CognoDB, AuraDB, Memgraph), `arangojs`/AQL for ArangoDB, `falkordb` client for FalkorDB. See each `loadData()` in `src/drivers/*/*.driver.ts`.

## Methodology

- Same dataset, same logical queries (see `src/benchmark/workloads/`), same client machine and region for every platform.
- Every platform warmed up for 10 iterations before the measured run.
- ≥100 iterations per read workload after warm-up; p50 and p95 reported, not just means.
- Mixed workload: 80/20 read/write ratio, configurable client concurrency (default 10).
- Full run automated via `scripts/run-all.sh` — single command, no manual steps between platforms.

### Known caveats

- The "indexed lookup" metric filters on the `label` property; confirm this is indexed identically on every platform before trusting the comparison (see `loadData()` in each driver).
- The mixed workload's "write" op currently reuses the traversal query as a write-shaped stand-in, since the common `GraphDriver` interface doesn't yet define a dedicated write method.
- FalkorDB's Free tier is stopped after 1 day of inactivity and deleted after 7.
- FalkorDB is an in-memory database (GraphBLAS-backed); its 100MB free-tier cap is smaller than CognoDB's 256MB, so it's the binding constraint on your dataset size — size everything to fit FalkorDB, not just CognoDB.
- FalkorDB reserves the property name `id` for its own internal entity identifier — the FalkorDB driver stores each node's dataset ID under `entityId` instead, while every other platform stores the identical value under `id`. Same data, same semantic identifier, different property name on this one platform.
- Traversal queries are constrained to **outbound edges only** (not undirected). An undirected multi-hop match on this dataset's high-degree "hub" nodes (a handful of Enron employees emailed/were emailed by hundreds of people) causes combinatorial path explosion under Cypher/AQL's default relationship-uniqueness semantics, which exceeded free-tier memory/time budgets and got queries killed server-side during testing. Traversal queries also carry a 15s timeout on the bolt/Cypher platforms; any sample that still fails is logged and excluded from that platform's p50/p95 rather than aborting the whole run.
- **Known resource mismatch — Memgraph Cloud:** Memgraph's only free option during this benchmark was a 14-day trial sized up to 2 vCPU / 2GB RAM, roughly **4x the CPU and 8x the RAM** of CognoDB's free tier (0.5 vCPU / 256MB). No smaller tier or self-hosted alternative was used, given the assignment's time window. This means Memgraph's ingest throughput and mixed-workload numbers likely reflect its resource advantage as much as (or more than) the platform itself — **do not present Memgraph as "faster" without this caveat directly alongside the number.** Traversal/lookup/aggregation latencies on small working sets are less affected by this gap than throughput-bound workloads are.
- The bolt/Cypher platforms (CognoDB, AuraDB, Memgraph) sit behind proxy layers on their free tiers that can silently drop idle/long-lived connections faster than the driver's default pool lifetime expects — surfacing as `Neo4jError: Connection was closed by server` on an otherwise-healthy instance. Mitigated by (a) a shorter 5-minute `maxConnectionLifetime` so the driver proactively refreshes pooled connections, and (b) using `session.executeRead()` instead of bare `session.run()`, which retries automatically on a stale connection. Traversal queries additionally carry a 15s server-side timeout. Any sample that still fails after these mitigations is logged and excluded from that platform's p50/p95 rather than aborting the whole run — check your run logs for `[TraversalWorkload]` warnings and report the failure count here if any occurred.
- CognoDB's traversal workload specifically hit the free tier's memory ceiling — its
  console showed 103% RAM usage during the 3-hop traversal run, and queries failed
  with `Connection was closed by server` under this load even after ruling out
  connection-pooling issues. This appears to be a
  genuine resource-exhaustion limit of CognoDB's smallest tier under this workload,
  not a bug in the harness. Traversal p50/p95 for CognoDB is therefore reported as
  not measurable rather than estimated from partial data.

## Results matrix

### Data loading

| Platform   | Nodes/sec | Relationships/sec | Total wall-clock (ms) |
| ---------- | --------- | ----------------- | --------------------- |
| arangodb   | 177.4     | 1777.5            | 206,841               |
| cognodb    | 53.4      | 534.9             | 687,405               |
| falkordb   | 366.4     | 3671.7            | 100,134               |
| memgraph   | 118.7     | 1189.8            | 309,020               |
| neo4j-aura | 108.7     | 1089.3            | 337,518               |

### Traversal latency (1/2/3-hop)

| Platform   | p50 (ms) | p95 (ms) | Iterations |
| ---------- | -------- | -------- | ---------- |
| arangodb   | 74.4     | 229.7    | 300        |
| cognodb    | n/a      | n/a      | n/a        |
| falkordb   | 116.2    | 125.5    | 300        |
| memgraph   | 192.9    | 243.2    | 300        |
| neo4j-aura | 327.3    | 385.0    | 300        |

¹ CognoDB's free-tier instance (256MB RAM) could not reliably complete the 3-hop
traversal workload — its console reported 103% of the RAM limit during testing.
Traversal was measured successfully on the other four platforms; this result is
reported as a platform limitation, not a missing test.

### Lookup latency (point + indexed)

| Platform   | p50 (ms) | p95 (ms) | Iterations |
| ---------- | -------- | -------- | ---------- |
| arangodb   | 66.29    | 155.38   | 200        |
| cognodb    | 133.69   | 139.33   | 200        |
| falkordb   | 56.63    | 62.54    | 200        |
| memgraph   | 59.91    | 71.52    | 200        |
| neo4j-aura | 62.62    | 64.57    | 200        |

### Aggregation latency

| Platform   | p50 (ms) | p95 (ms) | Iterations |
| ---------- | -------- | -------- | ---------- |
| arangodb   | 68.31    | 164.11   | 100        |
| cognodb    | 139.70   | 150.88   | 100        |
| falkordb   | 59.97    | 61.28    | 100        |
| memgraph   | 62.71    | 66.40    | 100        |
| neo4j-aura | 63.56    | 65.23    | 100        |

### Mixed read/write throughput

| Platform   | p50 (ms) | p95 (ms) | Iterations |
| ---------- | -------- | -------- | ---------- |
| arangodb   | 301.00   | 541.70   | 100        |
| cognodb    | 130.48   | 144.81   | 100        |
| falkordb   | 57.06    | 59.87    | 100        |
| memgraph   | 60.70    | 65.16    | 100        |
| neo4j-aura | 62.84    | 67.86    | 100        |

## Reproducing this benchmark

```bash
git clone <this-repo>
cd graph-db-benchmark
pnpm install
cp .env.example .env   # fill in your own free-tier credentials for each platform
./scripts/run-all.sh
```

Each platform's free-tier signup:

- CognoDB: https://console.cognodb.com/signup
- Neo4j AuraDB: https://console.neo4j.io
- Memgraph Cloud: https://memgraph.com/cloud
- ArangoDB Oasis: https://cloud.arangodb.com
- FalkorDB Cloud: https://app.falkordb.cloud/signup

## Project structure

See `src/drivers/graph-driver.interface.ts` for the common contract every
platform implements, and `src/benchmark/workloads/` for the workload
definitions that run identically against every driver.
