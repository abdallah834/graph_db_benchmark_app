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
- **Relationships:** 183,831 (comfortably inside the assignment's 100k–500k range; no sampling needed)
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
- The mixed workload's "write" op currently reuses the traversal query as a write-shaped stand-in, since the common `GraphDriver` interface doesn't yet define a dedicated write method — note this explicitly rather than presenting it as a true write benchmark, or extend the interface with a real `writeOp()` before your final run.
- FalkorDB's Free tier is stopped after 1 day of inactivity and deleted after 7 — re-provision if your run window slips past that.
- FalkorDB is an in-memory database (GraphBLAS-backed); its 100MB free-tier cap is smaller than CognoDB's 256MB, so it's the binding constraint on your dataset size — size everything to fit FalkorDB, not just CognoDB.
- **Known resource mismatch — Memgraph Cloud:** Memgraph's only free option during this benchmark was a 14-day trial sized up to 2 vCPU / 2GB RAM, roughly **4x the CPU and 8x the RAM** of CognoDB's free tier (0.5 vCPU / 256MB). No smaller tier or self-hosted alternative was used, given the assignment's time window. This means Memgraph's ingest throughput and mixed-workload numbers likely reflect its resource advantage as much as (or more than) the platform itself — **do not present Memgraph as "faster" without this caveat directly alongside the number.** Traversal/lookup/aggregation latencies on small working sets are less affected by this gap than throughput-bound workloads are.
- some free tiers only provided higher hardware specs compared to other graph DBs.

## Results matrix

CognoDB:
{
"nodesLoaded": 36692,
"relationshipsLoaded": 367662,
"wallClockMs": 831670,
"nodesPerSecond": 44.11846044705232,
"relationshipsPerSecond": 442.0767852633857
},
memgraph:
{
"nodesLoaded": 36692,
"relationshipsLoaded": 367662,
"wallClockMs": 321391,
"nodesPerSecond": 114.16623365308922,
"relationshipsPerSecond": 1143.9710508383869
}
neo4j-aura:
{
"nodesLoaded": 36692,
"relationshipsLoaded": 367662,
"wallClockMs": 328355,
"nodesPerSecond": 111.74491023435002,
"relationshipsPerSecond": 1119.7088517001416
}

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
