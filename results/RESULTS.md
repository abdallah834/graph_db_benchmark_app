## Results matrix

_Generated 2026-08-23T20:03:39.436Z from 5 platform result file(s) in `results/`._

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
